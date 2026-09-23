import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { ProviderError } from '../providers/errors.js';
import {
  createMetaAd,
  createMetaAdCreative,
  createMetaAdSet,
  createMetaCampaign,
  createMetaCampaignObject,
  deleteMetaAd,
  discoverMetaAdAccounts,
  fetchMetaAdStatus,
  fetchMetaInsights,
  hasAdsPermission,
  setMetaAdStatus,
} from '../providers/adsMeta.js';
import { getCredentials, getPublishingContext } from './socialAccountService.js';
import { mediaForIds } from './mediaService.js';
import { canManageAccounts, canPublishPosts } from './permissions.js';
import { HttpError, badRequest, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';

// Meta is the only ad network this app can run for real — see providers/adsMeta.js's header comment.
const NETWORK_LABELS = { meta: 'Meta Ads', google: 'Google Ads', linkedin: 'LinkedIn Ads', x: 'X Ads', tiktok: 'TikTok Ads', pinterest: 'Pinterest Ads' };

// Phase 4: bulk ad creation. A modest cap, not a money-safety limit — every variation in one bulk
// request shares the same ad set (one audience, one budget), so more variations never multiplies real
// ad spend, only how many creatives split that one budget's delivery. The cap exists so one request
// stays a reviewable batch and Meta's own per-ad-set learning phase isn't split across too many
// creatives at once — a widely recommended Meta Ads practice, not an API-enforced rule.
export const MAX_BULK_VARIATIONS = 6;

const toDateStr = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value);
const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// ------------------------------------------------------------------ Facebook connection status
// Ads never stores its own credentials — everything comes from the Facebook row in Social Accounts
// (its optional `adsAccessToken` field). This is the one place that reads it for Meta Ads purposes.
async function facebookAdsCredentials() {
  const credentials = await getCredentials('facebook');
  if (!credentials) return { connected: false, hasToken: false, hasPermission: false, credentials: null };
  if (!credentials.adsAccessToken) return { connected: true, hasToken: false, hasPermission: false, credentials: null };
  const ready = await hasAdsPermission({ appId: credentials.appId, appSecret: credentials.appSecret, adsAccessToken: credentials.adsAccessToken });
  return { connected: true, hasToken: true, hasPermission: ready, credentials: ready ? credentials : null };
}

const NOT_CONNECTED_MESSAGE =
  'Facebook is not connected in Social Accounts. Connect it there first — Meta Ads uses that same connection.';
const MISSING_TOKEN_MESSAGE =
  'Facebook is connected, but no Ads token has been added yet. Open Social Accounts → Facebook and fill in the "User access token — Ads access" field.';
const NEEDS_PERMISSION_MESSAGE =
  'Your saved Ads token doesn’t have the right permissions. Open Social Accounts → Facebook and paste a new User access token with ads_management and ads_read granted.';

/** Throws the right, honest 409 if Ads can't use the Facebook connection yet; otherwise returns the Ads-ready credentials. */
async function requireAdsCredentials() {
  const status = await facebookAdsCredentials();
  if (!status.connected) throw new HttpError(409, 'not_connected', NOT_CONNECTED_MESSAGE);
  if (!status.hasToken) throw new HttpError(409, 'needs_token', MISSING_TOKEN_MESSAGE);
  if (!status.hasPermission) throw new HttpError(409, 'needs_permission', NEEDS_PERMISSION_MESSAGE);
  return status.credentials;
}

// ------------------------------------------------------------------ ad accounts (discovery cache)
function presentAccount(row) {
  return {
    id: row.id,
    network: row.network,
    externalAccountId: row.external_account_id,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    accountStatus: row.account_status,
    businessName: row.business_name,
    disableReason: row.disable_reason,
    lastSyncedAt: row.last_synced_at,
  };
}

/** Ads → Ad Accounts: the Facebook connection's real status plus whatever was last discovered. */
export async function listAdAccounts() {
  const [status, rows] = await Promise.all([
    facebookAdsCredentials(),
    query('SELECT * FROM ad_accounts ORDER BY name'),
  ]);
  return {
    facebookConnected: status.connected,
    hasAdsToken: status.hasToken,
    hasAdsPermission: status.hasPermission,
    accounts: rows.rows.map(presentAccount),
  };
}

/** "Sync Ad Accounts": calls Meta for real, using the Ads token already stored on the Facebook connection. */
export async function syncAdAccounts({ actor, ip, userAgent }) {
  if (!canManageAccounts(actor)) throw forbidden('Your role cannot manage ad accounts.');
  const credentials = await requireAdsCredentials();

  let discovered;
  try {
    discovered = await discoverMetaAdAccounts({ adsAccessToken: credentials.adsAccessToken });
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(422, 'sync_failed', error.message);
    throw error;
  }

  for (const account of discovered) {
    await query(
      `INSERT INTO ad_accounts (network, source_platform, external_account_id, name, currency, timezone, account_status, business_name, disable_reason, last_synced_at)
       VALUES ('meta', 'facebook', $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (network, external_account_id) DO UPDATE SET
         name = EXCLUDED.name, currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
         account_status = EXCLUDED.account_status, business_name = EXCLUDED.business_name,
         disable_reason = EXCLUDED.disable_reason, last_synced_at = now(), updated_at = now()`,
      [account.externalAccountId, account.name, account.currency, account.timezone, account.accountStatus, account.businessName, account.disableReason]
    );
  }
  await recordActivity({ actorId: actor.id, action: 'ads.accounts_synced', entity: 'ad_account', meta: { found: discovered.length }, ip, userAgent });
  return listAdAccounts();
}

async function getAdAccountRow(id) {
  return (await query('SELECT * FROM ad_accounts WHERE id = $1', [id])).rows[0] ?? null;
}

// ------------------------------------------------------------------------- ads (campaign→adset→creative→ad)
function present(row, daily = []) {
  return {
    id: row.id,
    // The ad's OWN name — for a single ad this happens to equal the campaign's name (createCampaign
    // gives both the same string), but for a Phase 4 bulk batch each variation has its own distinct
    // "<name> — variation N" name while sharing one campaign; using the campaign's name here would
    // show every variation under the identical label. `campaignName` below is the shared one, kept
    // separately so a campaign-level grouping/filter (see Ads.jsx) still has a real value to use.
    name: row.ad_name,
    campaignName: row.campaign_name,
    objective: row.objective,
    network: row.network,
    adAccountId: row.ad_account_id,
    adAccountName: row.ad_account_name,
    platforms: row.platforms,
    status: row.status,
    budgetType: row.budget_type,
    budget: num(row.budget),
    startDate: toDateStr(row.start_date),
    endDate: toDateStr(row.end_date),
    createdAt: row.ad_created_at,
    createdBy: row.creator_name || 'Deleted user',
    rejectionReason: row.rejection_reason,
    // Honest sync health (Phase 7/9 hardening) — null means the last background refresh succeeded (or
    // none has run yet, e.g. a draft); set means it failed and this is the real error, not a guess.
    // last_synced_at is stamped on every attempt regardless of outcome, so it alone can't say this.
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
    creative: {
      headline: row.headline,
      text: row.body_text,
      cta: row.cta,
      destinationUrl: row.destination_url,
      mediaId: row.media_id,
    },
    sourcePostId: row.source_post_id,
    audience: row.audience,
    daily,
  };
}

const AD_SELECT = `
  SELECT
    ads.id, ads.name AS ad_name, ads.status, ads.rejection_reason, ads.external_ad_id, ads.created_at AS ad_created_at,
    ads.last_synced_at, ads.last_sync_error,
    aset.id AS ad_set_id, aset.platforms, aset.budget_type, aset.budget, aset.start_date, aset.end_date, aset.audience, aset.external_adset_id,
    camp.id AS ad_campaign_id, camp.name AS campaign_name, camp.objective, camp.external_campaign_id, camp.created_by,
    acc.id AS ad_account_id, acc.network, acc.name AS ad_account_name, acc.external_account_id,
    cre.headline, cre.body_text, cre.cta, cre.destination_url, cre.media_id, cre.external_creative_id, cre.source_post_id,
    u.name AS creator_name
  FROM ads
  JOIN ad_sets aset ON aset.id = ads.ad_set_id
  JOIN ad_campaigns camp ON camp.id = aset.ad_campaign_id
  JOIN ad_accounts acc ON acc.id = camp.ad_account_id
  JOIN ad_creatives cre ON cre.id = ads.ad_creative_id
  LEFT JOIN users u ON u.id = camp.created_by`;

async function dailyByAd(ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = (await query('SELECT * FROM ad_daily_stats WHERE ad_id = ANY($1) ORDER BY date', [ids])).rows;
  for (const row of rows) {
    map.get(row.ad_id).push({ date: toDateStr(row.date), spend: num(row.spend), impressions: num(row.impressions), clicks: num(row.clicks), conversions: num(row.conversions) });
  }
  return map;
}

async function getAdRow(id) {
  return (await query(`${AD_SELECT} WHERE ads.id = $1`, [id])).rows[0] ?? null;
}

export async function listCampaigns() {
  const rows = (await query(`${AD_SELECT} ORDER BY ads.created_at DESC`)).rows;
  const daily = await dailyByAd(rows.map((row) => row.id));
  return rows.map((row) => present(row, daily.get(row.id)));
}

export async function getCampaign(id) {
  const row = await getAdRow(id);
  if (!row) return null;
  const daily = await dailyByAd([id]);
  return present(row, daily.get(id));
}

/** Resolves which connected social profile(s) the ad must appear as, for the platforms chosen. */
async function resolvePlacements(platforms) {
  const facebook = await getPublishingContext('facebook');
  if (!facebook) throw badRequest('Connect Facebook in Social Accounts first — a Meta ad always needs a Facebook Page to appear as, even for an Instagram-only ad.');
  let instagramActorId;
  if (platforms.includes('instagram')) {
    const instagram = await getPublishingContext('instagram');
    if (!instagram) throw badRequest('Connect Instagram in Social Accounts first, or remove Instagram from this ad’s platforms.');
    instagramActorId = instagram.account.externalId;
  }
  return { pageId: facebook.account.externalId, instagramActorId };
}

/** The real, already-published Facebook post id for a boost — looked up server-side from our own
 * data, never trusted from the client (see createCampaign's `isBoost` branch). */
async function facebookPublishedExternalId(postId) {
  const row = (await query("SELECT external_id FROM post_targets WHERE post_id = $1 AND platform = 'facebook' AND status = 'published'", [postId])).rows[0];
  return row?.external_id || null;
}

export async function createCampaign({ actor, input, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can create an ad.');

  const adAccount = await getAdAccountRow(input.adAccountId);
  if (!adAccount) throw badRequest('Choose a real ad account — sync your ad accounts first if the list looks empty.');
  if (adAccount.network !== 'meta') throw new HttpError(422, 'not_built_yet', `${NETWORK_LABELS[adAccount.network] || adAccount.network} is not built yet.`);

  const adsCredentials = await requireAdsCredentials();

  const isDraft = input.status === 'draft';
  // Phase 3: "existing post → ad". No `creative` at all means a real Meta boost of an already-published
  // Facebook post — Meta reuses that post's own text/image directly, there is nothing to upload or
  // restate. Platforms are forced to Facebook-only here, server-side, regardless of what was sent —
  // a boost is a specific Facebook post object, not a generic multi-placement ad.
  const isBoost = !input.creative;
  let platforms = input.platforms;
  let boostExternalPostId = null;
  if (isBoost) {
    if (!input.sourcePostId) throw badRequest('Choose a post to boost, or fill in the ad creative.');
    boostExternalPostId = await facebookPublishedExternalId(input.sourcePostId);
    if (!boostExternalPostId) throw badRequest('That post has no real, published Facebook version to boost — pick a different post, or write ad creative instead.');
    platforms = ['facebook'];
  }

  let media = null;
  if (!isBoost && input.creative.mediaId) {
    const rows = await mediaForIds([input.creative.mediaId]);
    media = rows[0] ?? null;
  }

  let external = { externalCampaignId: null, externalAdsetId: null, externalCreativeId: null, externalAdId: null };
  const status = isDraft ? 'draft' : 'inReview';
  if (!isDraft) {
    const { pageId, instagramActorId } = await resolvePlacements(platforms);
    try {
      external = await createMetaCampaign({
        accessToken: adsCredentials.adsAccessToken,
        externalAccountId: adAccount.external_account_id,
        campaign: { ...input, platforms },
        pageId,
        instagramActorId,
        imageUrl: media?.public_url,
        boostExternalPostId,
      });
    } catch (error) {
      if (error instanceof ProviderError) throw new HttpError(422, 'launch_failed', error.message);
      throw error;
    }
  }

  const campaignRow = (
    await query(
      `INSERT INTO ad_campaigns (ad_account_id, name, objective, status, external_campaign_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [adAccount.id, input.name, input.objective, status, external.externalCampaignId, actor.id]
    )
  ).rows[0];

  const adSetRow = (
    await query(
      `INSERT INTO ad_sets (ad_campaign_id, name, platforms, budget_type, budget, start_date, end_date, audience, status, external_adset_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [campaignRow.id, `${input.name} — ad set`, platforms, input.budgetType, input.budget, input.startDate, input.endDate, JSON.stringify(input.audience), status, external.externalAdsetId]
    )
  ).rows[0];

  const creativeRow = (
    await query(
      `INSERT INTO ad_creatives (name, headline, body_text, cta, destination_url, media_id, external_creative_id, source_post_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        `${input.name} — creative`,
        isBoost ? '' : input.creative.headline,
        isBoost ? '' : input.creative.text,
        isBoost ? '' : input.creative.cta,
        isBoost ? '' : input.creative.destinationUrl,
        isBoost ? null : input.creative.mediaId || null,
        external.externalCreativeId,
        input.sourcePostId || null,
        actor.id,
      ]
    )
  ).rows[0];

  const adRow = (
    await query(
      `INSERT INTO ads (ad_set_id, ad_creative_id, name, status, external_ad_id, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [adSetRow.id, creativeRow.id, input.name, status, external.externalAdId, isDraft ? null : new Date()]
    )
  ).rows[0];

  await recordActivity({
    actorId: actor.id,
    action: isDraft ? 'ads.saved_draft' : isBoost ? 'ads.boosted_post' : 'ads.launched',
    entity: 'ad',
    entityId: adRow.id,
    meta: { name: input.name, sourcePostId: input.sourcePostId || null },
    ip,
    userAgent,
  });
  return getCampaign(adRow.id);
}

/**
 * Phase 4: bulk ad creation. Several creative variations, all sharing one campaign/ad set — one
 * audience, one budget, one schedule, one set of placements — which is how real "creative testing"
 * bulk-ad tools work (a handful of headlines/images competing for the same budget, not N separate
 * budgets). Deliberately does NOT offer boosting an existing post here: a boost creative is forced
 * Facebook-only server-side (see createCampaign above), and mixing that with fresh, multi-placement
 * creatives under one ad set would mean guessing how Meta resolves per-creative placement eligibility
 * within a single ad set — this codebase does not have verified confidence in that, same reasoning as
 * Phase 3 keeping boost itself Facebook-only. `routes/ads.js`'s bulk schema only accepts an array of
 * fresh creatives, never `sourcePostId`, so this is enforced by the request shape, not a runtime check.
 *
 * Atomic like the single-ad path: every Meta call for the whole batch happens first; only once all of
 * them succeed does anything get written to the database. A mid-batch Meta failure leaves nothing
 * saved here — matching createCampaign's own behaviour, not a new failure mode invented for bulk.
 */
export async function createBulkCampaign({ actor, input, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can create an ad.');

  const adAccount = await getAdAccountRow(input.adAccountId);
  if (!adAccount) throw badRequest('Choose a real ad account — sync your ad accounts first if the list looks empty.');
  if (adAccount.network !== 'meta') throw new HttpError(422, 'not_built_yet', `${NETWORK_LABELS[adAccount.network] || adAccount.network} is not built yet.`);

  const adsCredentials = await requireAdsCredentials();

  const isDraft = input.status === 'draft';
  const status = isDraft ? 'draft' : 'inReview';
  const platforms = input.platforms;

  const mediaIds = [...new Set(input.creatives.map((creative) => creative.mediaId).filter(Boolean))];
  const media = mediaIds.length ? await mediaForIds(mediaIds) : [];
  const mediaUrlFor = (mediaId) => media.find((item) => item.id === mediaId)?.public_url;

  let externalCampaignId = null;
  let externalAdsetId = null;
  const externalIdsByVariation = input.creatives.map(() => ({ externalCreativeId: null, externalAdId: null }));

  if (!isDraft) {
    const { pageId, instagramActorId } = await resolvePlacements(platforms);
    try {
      externalCampaignId = await createMetaCampaignObject({
        accessToken: adsCredentials.adsAccessToken,
        externalAccountId: adAccount.external_account_id,
        name: input.name,
        objective: input.objective,
        launch: true,
      });
      externalAdsetId = await createMetaAdSet({
        accessToken: adsCredentials.adsAccessToken,
        externalAccountId: adAccount.external_account_id,
        campaignExternalId: externalCampaignId,
        name: `${input.name} — ad set`,
        launch: true,
        objective: input.objective,
        audience: input.audience,
        platforms,
        budgetType: input.budgetType,
        budget: input.budget,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      for (let index = 0; index < input.creatives.length; index += 1) {
        const creative = input.creatives[index];
        const externalCreativeId = await createMetaAdCreative({
          accessToken: adsCredentials.adsAccessToken,
          externalAccountId: adAccount.external_account_id,
          name: `${input.name} — creative ${index + 1}`,
          creative,
          pageId,
          instagramActorId,
          imageUrl: mediaUrlFor(creative.mediaId),
        });
        const externalAdId = await createMetaAd({
          accessToken: adsCredentials.adsAccessToken,
          externalAccountId: adAccount.external_account_id,
          name: `${input.name} — variation ${index + 1}`,
          adSetExternalId: externalAdsetId,
          creativeExternalId: externalCreativeId,
          launch: true,
        });
        externalIdsByVariation[index] = { externalCreativeId, externalAdId };
      }
    } catch (error) {
      if (error instanceof ProviderError) throw new HttpError(422, 'launch_failed', error.message);
      throw error;
    }
  }

  const campaignRow = (
    await query(
      `INSERT INTO ad_campaigns (ad_account_id, name, objective, status, external_campaign_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [adAccount.id, input.name, input.objective, status, externalCampaignId, actor.id]
    )
  ).rows[0];

  const adSetRow = (
    await query(
      `INSERT INTO ad_sets (ad_campaign_id, name, platforms, budget_type, budget, start_date, end_date, audience, status, external_adset_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [campaignRow.id, `${input.name} — ad set`, platforms, input.budgetType, input.budget, input.startDate, input.endDate, JSON.stringify(input.audience), status, externalAdsetId]
    )
  ).rows[0];

  const adIds = [];
  for (let index = 0; index < input.creatives.length; index += 1) {
    const creative = input.creatives[index];
    const external = externalIdsByVariation[index];
    const creativeRow = (
      await query(
        `INSERT INTO ad_creatives (name, headline, body_text, cta, destination_url, media_id, external_creative_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [`${input.name} — creative ${index + 1}`, creative.headline, creative.text, creative.cta, creative.destinationUrl, creative.mediaId || null, external.externalCreativeId, actor.id]
      )
    ).rows[0];
    const adRow = (
      await query(
        `INSERT INTO ads (ad_set_id, ad_creative_id, name, status, external_ad_id, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [adSetRow.id, creativeRow.id, `${input.name} — variation ${index + 1}`, status, external.externalAdId, isDraft ? null : new Date()]
      )
    ).rows[0];
    adIds.push(adRow.id);
  }

  await recordActivity({
    actorId: actor.id,
    action: isDraft ? 'ads.bulk_saved_draft' : 'ads.bulk_launched',
    entity: 'ad_set',
    entityId: adSetRow.id,
    meta: { name: input.name, count: adIds.length },
    ip,
    userAgent,
  });

  return Promise.all(adIds.map((id) => getCampaign(id)));
}

async function ensureAd(id) {
  const row = await getAdRow(id);
  if (!row) throw notFound('Ad not found');
  return row;
}

/** Deletes an ad set/campaign once nothing references them any more, so single-ad creation (today's wizard) never leaves orphaned rows behind, while a shared ad set (bulk creation) is left alone for its other ads. */
async function cleanUpIfOrphaned(adSetId, adCampaignId) {
  const remainingInSet = (await query('SELECT count(*)::int AS n FROM ads WHERE ad_set_id = $1', [adSetId])).rows[0].n;
  if (remainingInSet > 0) return;
  await query('DELETE FROM ad_sets WHERE id = $1', [adSetId]);
  const remainingInCampaign = (await query('SELECT count(*)::int AS n FROM ad_sets WHERE ad_campaign_id = $1', [adCampaignId])).rows[0].n;
  if (remainingInCampaign > 0) return;
  await query('DELETE FROM ad_campaigns WHERE id = $1', [adCampaignId]);
}

export async function updateCampaignStatus({ id, status, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can change an ad.');
  const existing = await ensureAd(id);
  if (existing.external_ad_id) {
    const credentials = await requireAdsCredentials();
    try {
      await setMetaAdStatus({ accessToken: credentials.adsAccessToken, externalAdId: existing.external_ad_id, status: status === 'active' ? 'ACTIVE' : 'PAUSED' });
    } catch (error) {
      if (error instanceof ProviderError) throw new HttpError(422, 'update_failed', error.message);
      throw error;
    }
  }
  await query('UPDATE ads SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
  await recordActivity({ actorId: actor.id, action: status === 'paused' ? 'ads.paused' : 'ads.resumed', entity: 'ad', entityId: id, meta: { name: existing.ad_name }, ip, userAgent });
  return getCampaign(id);
}

/**
 * Bulk pause/resume, for the list page's checkbox actions. One failing ad (a permission problem, a
 * temporary Meta error, an id that no longer exists) never blocks the rest — each id is attempted
 * independently and in sequence. A permission failure (the actor's own role) still aborts the whole
 * batch immediately, same as before: it re-throws rather than being added to `results`, since the
 * actor's role does not change per item, unlike a genuinely per-item problem such as a Meta rejection.
 * `results` is additive (existing callers reading only `success`/`updated` are unaffected) — it lets a
 * caller see exactly which ids failed and why, not just an aggregate count.
 */
export async function updateCampaignsStatus({ ids, status, actor, ip, userAgent }) {
  const results = [];
  for (const id of ids) {
    try {
      await updateCampaignStatus({ id, status, actor, ip, userAgent });
      results.push({ id, status: 'updated' });
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 409 && error.status !== 422)) throw error;
      results.push({ id, status: 'failed', reason: error.message });
    }
  }
  const updated = results.filter((row) => row.status === 'updated').length;
  return { success: true, updated, results };
}

export async function deleteCampaign({ id, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can delete an ad.');
  const existing = await ensureAd(id);
  if (existing.external_ad_id) {
    const credentials = await requireAdsCredentials().catch(() => null);
    if (credentials) {
      try {
        await deleteMetaAd({ accessToken: credentials.adsAccessToken, externalAdId: existing.external_ad_id });
      } catch (error) {
        if (error instanceof ProviderError) throw new HttpError(422, 'delete_failed', error.message);
        throw error;
      }
    }
    // No Ads permission left (Facebook connection changed since this ad launched): nothing this server
    // can do on Meta's side either way, so fall through and forget it locally rather than getting stuck.
  }
  await query('DELETE FROM ads WHERE id = $1', [id]);
  await cleanUpIfOrphaned(existing.ad_set_id, existing.ad_campaign_id);
  await recordActivity({ actorId: actor.id, action: 'ads.deleted', entity: 'ad', entityId: id, meta: { name: existing.ad_name }, ip, userAgent });
}

/** Bulk delete, for the list page's checkbox actions. Deletes what it can; one that fails (a stuck Meta
 * call) is skipped rather than failing the whole batch — same `results` addition as updateCampaignsStatus above. */
export async function deleteCampaigns({ ids, actor, ip, userAgent }) {
  const results = [];
  for (const id of ids) {
    try {
      await deleteCampaign({ id, actor, ip, userAgent });
      results.push({ id, status: 'deleted' });
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 422)) throw error;
      results.push({ id, status: 'failed', reason: error.message });
    }
  }
  const deleted = results.filter((row) => row.status === 'deleted').length;
  return { success: true, deleted, results };
}

// ------------------------------------------------------------------ background refresh
const REFRESHABLE_STATUSES = ['active', 'paused', 'inReview'];
const INSIGHTS_LOOKBACK_DAYS = 90;
let refreshingAds = false;

async function refreshOneAd(row, credentials) {
  let syncError = null;
  try {
    const { status, rejectionReason } = await fetchMetaAdStatus({ accessToken: credentials.adsAccessToken, externalAdId: row.external_ad_id });
    await query('UPDATE ads SET status = $2, rejection_reason = $3, updated_at = now() WHERE id = $1', [row.id, status, rejectionReason]);

    const start = new Date(row.start_date);
    const lookback = new Date(Date.now() - INSIGHTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const since = (start > lookback ? start : lookback).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const days = await fetchMetaInsights({ accessToken: credentials.adsAccessToken, externalAdId: row.external_ad_id, since, until });
    for (const day of days) {
      await query(
        `INSERT INTO ad_daily_stats (ad_id, date, spend, impressions, clicks, conversions)
         VALUES ($1,$2,$3,$4,$5,0)
         ON CONFLICT (ad_id, date) DO UPDATE SET spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks`,
        [row.id, day.date, day.spend, day.impressions, day.clicks]
      );
    }
  } catch (error) {
    // A broken/expired token or a slow Meta pass must not stop the rest of the ads, and must not spin
    // — always stamp last_synced_at so this row waits its turn again like everything else. The real
    // error message is kept (not a fake metric) so the client can honestly show "numbers may be stale"
    // instead of silently presenting a possibly-outdated number as current — see migration
    // 020_ad_sync_health.sql. This never touches the Facebook connection's own status: a per-ad refresh
    // failure (a busy moment on Meta's side, a transient network error, one ad-specific problem) is not
    // the same fact as the whole connection being broken, which recheckAccount already handles elsewhere.
    logger.error('Refreshing a Meta ad failed', error, { adId: row.id });
    syncError = error.message || 'Could not refresh this ad’s numbers right now.';
  } finally {
    await query('UPDATE ads SET last_synced_at = now(), last_sync_error = $2 WHERE id = $1', [row.id, syncError]);
  }
}

/** One pass over every launched ad due for a refresh. One broken ad never stops the rest. */
export async function refreshAdMetrics(refreshIntervalMin) {
  if (refreshingAds) return;
  refreshingAds = true;
  try {
    const status = await facebookAdsCredentials();
    if (!status.hasPermission) return; // nothing this pass can do without a working Ads token

    const rows = (
      await query(
        `SELECT ads.id, ads.external_ad_id, aset.start_date FROM ads
           JOIN ad_sets aset ON aset.id = ads.ad_set_id
          WHERE ads.status = ANY($1) AND ads.external_ad_id IS NOT NULL
            AND (ads.last_synced_at IS NULL OR ads.last_synced_at < now() - ($2 || ' minutes')::interval)
          ORDER BY ads.last_synced_at NULLS FIRST`,
        [REFRESHABLE_STATUSES, refreshIntervalMin]
      )
    ).rows;
    for (const row of rows) await refreshOneAd(row, status.credentials);
  } finally {
    refreshingAds = false;
  }
}

export function startAdsRefresher() {
  if (!config.ads.refreshIntervalMs) return () => {};
  const timer = setInterval(() => {
    refreshAdMetrics(config.ads.refreshIntervalMin).catch((error) => logger.error('Ad metrics refresh pass failed', error));
  }, config.ads.refreshIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
