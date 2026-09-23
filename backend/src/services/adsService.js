import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { ProviderError } from '../providers/errors.js';
import { createMetaCampaign, deleteMetaCampaign, fetchMetaAdStatus, fetchMetaInsights, setMetaCampaignStatus, verifyMetaAdAccount } from '../providers/adsMeta.js';
import { getPublishingContext } from './socialAccountService.js';
import { mediaForIds } from './mediaService.js';
import { canPublishPosts } from './permissions.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';
import { HttpError, badRequest, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';

// Meta is the only ad network this app can run for real — see providers/adsMeta.js's header comment
// for exactly why the other five in the UI's connect list are not (yet) built.
const SUPPORTED_NETWORKS = new Set(['meta']);
const NETWORK_LABELS = { meta: 'Meta Ads', google: 'Google Ads', linkedin: 'LinkedIn Ads', x: 'X Ads', tiktok: 'TikTok Ads', pinterest: 'Pinterest Ads' };
const NOT_BUILT_YET = (network) =>
  `${NETWORK_LABELS[network] || network} is not connected through Social yet. Meta Ads (Facebook & Instagram) is the only ad network Social can run for real right now — see the Ads section of the README for why the others aren't built.`;

const toDateStr = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value);
const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// ------------------------------------------------------------------ ad accounts
function presentAccount(network, row) {
  return {
    network,
    isConnected: row?.status === 'connected',
    accountId: row?.account_id || '',
    accountName: row?.account_name || '',
    currency: row?.currency || '',
    connectedAt: row?.updated_at ?? null,
  };
}

export async function listAdAccounts() {
  const result = await query('SELECT * FROM ad_accounts');
  const byNetwork = new Map(result.rows.map((row) => [row.network, row]));
  return Object.keys(NETWORK_LABELS).map((network) => presentAccount(network, byNetwork.get(network)));
}

async function getAccountRow(network) {
  return (await query('SELECT * FROM ad_accounts WHERE network = $1', [network])).rows[0] ?? null;
}

/** For campaign creation: the decrypted credentials of a connected ad account, or null. */
async function getAdAccountCredentials(network) {
  const row = await getAccountRow(network);
  return row?.status === 'connected' && row.credentials ? decryptJson(row.credentials) : null;
}

export async function testAdAccountConnection(network, input) {
  if (!SUPPORTED_NETWORKS.has(network)) return { ok: false, message: NOT_BUILT_YET(network) };
  const adAccountId = String(input?.adAccountId || '').trim();
  const accessToken = String(input?.accessToken || '').trim();
  if (!adAccountId || !accessToken) return { ok: false, message: 'Ad account ID and access token are both required.' };
  try {
    const profile = await verifyMetaAdAccount({ adAccountId, accessToken });
    return { ok: true, message: `Connected to ${profile.accountName} successfully.` };
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, message: error.message };
    logger.error('Unexpected error testing a Meta ad account', error);
    return { ok: false, message: 'Meta sent an answer Social could not understand. Try again, and tell support if it keeps happening.' };
  }
}

export async function connectAdAccount({ network, input, actor, ip, userAgent }) {
  if (!SUPPORTED_NETWORKS.has(network)) throw new HttpError(422, 'not_built_yet', NOT_BUILT_YET(network));
  const adAccountId = String(input?.adAccountId || '').trim();
  const accessToken = String(input?.accessToken || '').trim();
  const businessId = String(input?.businessId || '').trim();
  if (!adAccountId || !accessToken) throw badRequest('Ad account ID and access token are both required.');

  let profile;
  try {
    profile = await verifyMetaAdAccount({ adAccountId, accessToken });
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(422, 'connection_failed', error.message);
    throw error;
  }
  const credentials = { adAccountId, businessId, accessToken };
  const saved = (
    await query(
      `INSERT INTO ad_accounts (network, status, account_id, account_name, currency, credentials, connected_by)
       VALUES ($1, 'connected', $2, $3, $4, $5, $6)
       ON CONFLICT (network) DO UPDATE SET
         status = 'connected', account_id = EXCLUDED.account_id, account_name = EXCLUDED.account_name,
         currency = EXCLUDED.currency, credentials = EXCLUDED.credentials, connected_by = EXCLUDED.connected_by, updated_at = now()
       RETURNING *`,
      [network, profile.externalId, profile.accountName, profile.currency, encryptJson(credentials), actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'ads.account_connected', entity: 'ad_account', entityId: network, meta: { accountName: profile.accountName }, ip, userAgent });
  return presentAccount(network, saved);
}

export async function disconnectAdAccount({ network, actor, ip, userAgent }) {
  const result = await query(
    `UPDATE ad_accounts SET status = 'disconnected', credentials = NULL, updated_at = now() WHERE network = $1 RETURNING *`,
    [network]
  );
  if (result.rows[0]) await recordActivity({ actorId: actor.id, action: 'ads.account_disconnected', entity: 'ad_account', entityId: network, ip, userAgent });
  return presentAccount(network, result.rows[0] ?? null);
}

// ------------------------------------------------------------------------- campaigns
function present(row, daily = []) {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    network: row.network,
    platforms: row.platforms,
    status: row.status,
    budgetType: row.budget_type,
    budget: num(row.budget),
    startDate: toDateStr(row.start_date),
    endDate: toDateStr(row.end_date),
    createdAt: row.created_at,
    createdBy: row.creator_name || 'Deleted user',
    rejectionReason: row.rejection_reason,
    creative: row.creative,
    audience: row.audience,
    daily,
  };
}

const CAMPAIGN_SELECT = 'SELECT c.*, u.name AS creator_name FROM ad_campaigns c LEFT JOIN users u ON u.id = c.created_by';

async function dailyByCampaign(ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = (await query('SELECT * FROM ad_campaign_daily_stats WHERE ad_campaign_id = ANY($1) ORDER BY date', [ids])).rows;
  for (const row of rows) {
    map.get(row.ad_campaign_id).push({ date: toDateStr(row.date), spend: num(row.spend), impressions: num(row.impressions), clicks: num(row.clicks), conversions: num(row.conversions) });
  }
  return map;
}

async function getRow(id) {
  return (await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id])).rows[0] ?? null;
}

export async function listCampaigns() {
  const rows = (await query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC`)).rows;
  const daily = await dailyByCampaign(rows.map((row) => row.id));
  return rows.map((row) => present(row, daily.get(row.id)));
}

export async function getCampaign(id) {
  const row = await getRow(id);
  if (!row) return null;
  const daily = await dailyByCampaign([id]);
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

export async function createCampaign({ actor, input, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can create an ad.');
  if (!SUPPORTED_NETWORKS.has(input.network)) throw new HttpError(422, 'not_built_yet', NOT_BUILT_YET(input.network));

  const credentials = await getAdAccountCredentials(input.network);
  if (!credentials) throw new HttpError(409, 'not_connected', `${NETWORK_LABELS[input.network]} is not connected. Connect an ad account first.`);

  const isDraft = input.status === 'draft';
  let media = null;
  if (input.creative.mediaId) {
    const rows = await mediaForIds([input.creative.mediaId]);
    media = rows[0] ?? null;
  }

  let external = { externalCampaignId: null, externalAdsetId: null, externalCreativeId: null, externalAdId: null };
  let status = isDraft ? 'draft' : 'inReview';
  if (!isDraft) {
    const { pageId, instagramActorId } = await resolvePlacements(input.platforms);
    try {
      const created = await createMetaCampaign({
        adAccount: credentials,
        campaign: input,
        pageId,
        instagramActorId,
        imageUrl: media?.public_url,
      });
      external = created;
    } catch (error) {
      if (error instanceof ProviderError) throw new HttpError(422, 'launch_failed', error.message);
      throw error;
    }
  }

  const row = (
    await query(
      `INSERT INTO ad_campaigns
         (name, objective, network, platforms, status, budget_type, budget, start_date, end_date, creative, audience,
          external_campaign_id, external_adset_id, external_creative_id, external_ad_id, last_synced_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        input.name,
        input.objective,
        input.network,
        input.platforms,
        status,
        input.budgetType,
        input.budget,
        input.startDate,
        input.endDate,
        JSON.stringify(input.creative),
        JSON.stringify(input.audience),
        external.externalCampaignId,
        external.externalAdsetId,
        external.externalCreativeId,
        external.externalAdId,
        isDraft ? null : new Date(),
        actor.id,
      ]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: isDraft ? 'ads.saved_draft' : 'ads.launched', entity: 'ad_campaign', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  return present({ ...row, creator_name: actor.name });
}

async function ensureCampaign(id) {
  const row = await getRow(id);
  if (!row) throw notFound('Ad not found');
  return row;
}

export async function updateCampaignStatus({ id, status, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can change an ad.');
  const existing = await ensureCampaign(id);
  if (existing.external_campaign_id) {
    const credentials = await getAdAccountCredentials(existing.network);
    if (!credentials) throw new HttpError(409, 'not_connected', `${NETWORK_LABELS[existing.network]} is not connected. Reconnect the ad account to change this ad.`);
    try {
      await setMetaCampaignStatus({ adAccount: credentials, externalCampaignId: existing.external_campaign_id, status: status === 'active' ? 'ACTIVE' : 'PAUSED' });
    } catch (error) {
      if (error instanceof ProviderError) throw new HttpError(422, 'update_failed', error.message);
      throw error;
    }
  }
  const row = (await query('UPDATE ad_campaigns SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status])).rows[0];
  await recordActivity({ actorId: actor.id, action: status === 'paused' ? 'ads.paused' : 'ads.resumed', entity: 'ad_campaign', entityId: id, meta: { name: row.name }, ip, userAgent });
  const daily = await dailyByCampaign([id]);
  return present({ ...row, creator_name: existing.creator_name }, daily.get(id));
}

/** Bulk pause/resume, for the list page's checkbox actions. One failing ad (e.g. its ad account got disconnected) never blocks the rest. */
export async function updateCampaignsStatus({ ids, status, actor, ip, userAgent }) {
  let updated = 0;
  for (const id of ids) {
    try {
      await updateCampaignStatus({ id, status, actor, ip, userAgent });
      updated += 1;
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 409 && error.status !== 422)) throw error;
    }
  }
  return { success: true, updated };
}

export async function deleteCampaign({ id, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can delete an ad.');
  const existing = await ensureCampaign(id);
  if (existing.external_campaign_id) {
    const credentials = await getAdAccountCredentials(existing.network);
    if (credentials) {
      try {
        await deleteMetaCampaign({ adAccount: credentials, externalCampaignId: existing.external_campaign_id });
      } catch (error) {
        if (error instanceof ProviderError) throw new HttpError(422, 'delete_failed', error.message);
        throw error;
      }
    }
    // No credentials left (ad account disconnected since this ad launched): nothing this server can do
    // on Meta's side either way, so fall through and forget it locally rather than getting the client stuck.
  }
  await query('DELETE FROM ad_campaigns WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'ads.deleted', entity: 'ad_campaign', entityId: id, meta: { name: existing.name }, ip, userAgent });
}

/** Bulk delete, for the list page's checkbox actions. Deletes what it can; one that fails (a stuck Meta call) is skipped rather than failing the whole batch. */
export async function deleteCampaigns({ ids, actor, ip, userAgent }) {
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteCampaign({ id, actor, ip, userAgent });
      deleted += 1;
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 422)) throw error;
    }
  }
  return { success: true, deleted };
}

// ------------------------------------------------------------------ background refresh
const REFRESHABLE_STATUSES = ['active', 'paused', 'inReview'];
const INSIGHTS_LOOKBACK_DAYS = 90;
let refreshingAds = false;

async function refreshOneCampaign(row) {
  const credentials = await getAdAccountCredentials(row.network);
  if (!credentials) {
    await query('UPDATE ad_campaigns SET last_synced_at = now() WHERE id = $1', [row.id]);
    return;
  }
  try {
    const { status, rejectionReason } = await fetchMetaAdStatus({ adAccount: credentials, externalAdId: row.external_ad_id });
    await query('UPDATE ad_campaigns SET status = $2, rejection_reason = $3, last_synced_at = now(), updated_at = now() WHERE id = $1', [row.id, status, rejectionReason]);

    const start = new Date(row.start_date);
    const lookback = new Date(Date.now() - INSIGHTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const since = (start > lookback ? start : lookback).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const days = await fetchMetaInsights({ adAccount: credentials, externalCampaignId: row.external_campaign_id, since, until });
    for (const day of days) {
      await query(
        `INSERT INTO ad_campaign_daily_stats (ad_campaign_id, date, spend, impressions, clicks, conversions)
         VALUES ($1,$2,$3,$4,$5,0)
         ON CONFLICT (ad_campaign_id, date) DO UPDATE SET spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks`,
        [row.id, day.date, day.spend, day.impressions, day.clicks]
      );
    }
  } catch (error) {
    // A broken/expired token or a slow Meta pass must not stop the rest of the campaigns, and must not
    // spin — always stamp last_synced_at so this row waits its turn again like everything else.
    await query('UPDATE ad_campaigns SET last_synced_at = now() WHERE id = $1', [row.id]);
    logger.error('Refreshing a Meta ad campaign failed', error, { campaignId: row.id });
  }
}

/** One pass over every launched ad due for a refresh. One broken campaign never stops the rest. */
export async function refreshAdMetrics(refreshIntervalMin) {
  if (refreshingAds) return;
  refreshingAds = true;
  try {
    const rows = (
      await query(
        `SELECT * FROM ad_campaigns
          WHERE network = 'meta' AND status = ANY($1) AND external_ad_id IS NOT NULL
            AND (last_synced_at IS NULL OR last_synced_at < now() - ($2 || ' minutes')::interval)
          ORDER BY last_synced_at NULLS FIRST`,
        [REFRESHABLE_STATUSES, refreshIntervalMin]
      )
    ).rows;
    for (const row of rows) await refreshOneCampaign(row);
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
