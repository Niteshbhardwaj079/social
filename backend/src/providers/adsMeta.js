import { config } from '../config/env.js';
import { callProvider, failure } from './http.js';
import { authFailure, rejection } from './errors.js';
import { getGrantedScopes } from './meta.js';

/**
 * Meta Marketing API (Facebook + Instagram ads) — the one ad network this app builds for real.
 *
 * Deliberately does NOT reuse the Page access token already stored for organic Facebook posting.
 * Meta ad accounts are owned by a person or a Business Manager, not by a Page — a Page token has no
 * `/me/adaccounts` edge to call at all, regardless of what scopes it carries. So Social Accounts →
 * Facebook has one more, optional field: a *User* access token with `ads_management`/`ads_read`,
 * stored alongside the Page token in the same encrypted `social_accounts.credentials` row (see
 * providers/index.js and platformConnectGuides.js). This is still "one central connection screen,"
 * not a second Ads-specific login — it is Meta's own API drawing the Page-vs-User line, not Social's.
 * The Facebook Page id itself (for `object_story_spec.page_id`) still comes from the existing organic
 * connection; only the *access token* used for every Marketing API call below is the Ads one.
 *
 * See the backend README for why the other five ad networks in the UI's connect list (Google,
 * LinkedIn, X, TikTok, Pinterest) are not built yet — briefly: LinkedIn's Advertising API is
 * restricted to approved Marketing Partners, X's is paid-tier, TikTok's needs Social itself (not the
 * client) to pass a one-time Marketing API app review, Google Ads is a complex protobuf-first API
 * this codebase does not have verified confidence in, and Pinterest Ads' exact budget-currency-unit
 * convention was not confident enough to risk against a client's real ad spend.
 *
 * Two intentional simplifications, both documented at the call sites below rather than guessed at:
 *   - Every objective except "Brand awareness" runs as a Meta link-click campaign (OUTCOME_TRAFFIC /
 *     LINK_CLICKS) — native Lead Ads and Pixel-optimised Sales campaigns need a Lead Form or a Meta
 *     Pixel attached to the ad account, which this composer never collects.
 *   - Because of that, "Results/conversions" always report 0 for a Meta ad (see adsService.js) —
 *     never a guessed number from Meta's `actions` field, whose exact shape depends on what tracking
 *     the client has set up, which this app has no way to know.
 */

const graphBase = () => `https://graph.facebook.com/${config.social.metaGraphVersion}`;

function encodeForm(form) {
  const encoded = {};
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined) continue;
    encoded[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return encoded;
}

async function graphCall(method, path, { token, query, form, label = 'Meta Ads' } = {}) {
  const response = await callProvider(`${graphBase()}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    query,
    form: form ? encodeForm(form) : undefined,
    label,
  });
  if (!response.ok) {
    if (response.data?.error?.code === 190 || response.data?.error?.type === 'OAuthException') {
      throw authFailure(`${label} says this access token is invalid or has expired. Generate a new one with ads_management and ads_read, and try again.`);
    }
    throw failure(response, label);
  }
  return response.data;
}

const ADS_SCOPES = ['ads_management', 'ads_read'];

/** Does this token actually carry ads_management or ads_read? Checked once, never guessed from a failed call. */
export async function hasAdsPermission({ appId, appSecret, adsAccessToken }) {
  if (!adsAccessToken) return false;
  const scopes = await getGrantedScopes({ appId, appSecret, accessToken: adsAccessToken });
  return scopes.some((scope) => ADS_SCOPES.includes(scope));
}

/** "Sync Ad Accounts": every real Meta ad account this token's person can manage. */
export async function discoverMetaAdAccounts({ adsAccessToken }) {
  const data = await graphCall('GET', 'me/adaccounts', {
    token: adsAccessToken,
    query: { fields: 'id,name,currency,timezone_name,account_status,business{name},disable_reason', limit: '200' },
  });
  return (data.data || []).map((account) => ({
    externalAccountId: account.id,
    name: account.name || 'Meta Ads account',
    currency: account.currency || '',
    timezone: account.timezone_name || '',
    accountStatus: account.account_status != null ? String(account.account_status) : '',
    businessName: account.business?.name || '',
    disableReason: account.disable_reason != null ? String(account.disable_reason) : null,
  }));
}

const COUNTRY_CODES = { India: 'IN', 'United States': 'US', 'United Kingdom': 'GB', UAE: 'AE', Singapore: 'SG', Canada: 'CA', Australia: 'AU' };
const CTA_TYPES = { 'Learn more': 'LEARN_MORE', 'Shop now': 'SHOP_NOW', 'Sign up': 'SIGN_UP', 'Contact us': 'CONTACT_US', 'Book now': 'BOOK_NOW', Download: 'DOWNLOAD', 'Get quote': 'GET_QUOTE' };

/** Best-effort: an interest label ("Fashion") to Meta's own interest id, via its public targeting search. Skips silently if not found — a campaign should not fail over one unmatched interest word. */
async function resolveInterestIds(token, interests) {
  const ids = [];
  for (const term of interests) {
    try {
      const data = await graphCall('GET', 'search', { token, query: { type: 'adinterest', q: term, limit: 1 } });
      const match = data?.data?.[0];
      if (match?.id) ids.push({ id: match.id, name: match.name || term });
    } catch {
      // Targeting search having a bad moment must not block the whole campaign — it just runs broader.
    }
  }
  return ids;
}

function buildTargeting(audience, platforms) {
  const targeting = {
    geo_locations: { countries: audience.locations.map((name) => COUNTRY_CODES[name]).filter(Boolean) },
    age_min: audience.ageMin,
    age_max: audience.ageMax,
    publisher_platforms: platforms,
  };
  if (platforms.includes('facebook')) targeting.facebook_positions = ['feed'];
  if (platforms.includes('instagram')) targeting.instagram_positions = ['stream'];
  if (audience.gender === 'men') targeting.genders = [1];
  else if (audience.gender === 'women') targeting.genders = [2];
  return targeting;
}

// Every non-awareness objective runs as a plain link-click campaign — see the file header comment.
const CAMPAIGN_OBJECTIVE = { awareness: 'OUTCOME_AWARENESS' };
const OPTIMIZATION = { awareness: { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' } };
const DEFAULT_OPTIMIZATION = { optimization_goal: 'LINK_CLICKS', billing_event: 'LINK_CLICKS' };

/** Creates just the campaign object. Returns its Meta id. */
export async function createMetaCampaignObject({ accessToken, externalAccountId, name, objective, launch }) {
  const created = await graphCall('POST', `${externalAccountId}/campaigns`, {
    token: accessToken,
    form: { name, objective: CAMPAIGN_OBJECTIVE[objective] || 'OUTCOME_TRAFFIC', status: launch ? 'ACTIVE' : 'PAUSED', special_ad_categories: [] },
  });
  return created.id;
}

/** Creates just the ad set (budget, schedule, targeting, placements) under an existing campaign. Returns its Meta id. */
export async function createMetaAdSet({ accessToken, externalAccountId, campaignExternalId, name, launch, objective, audience, platforms, budgetType, budget, startDate, endDate }) {
  const interestIds = await resolveInterestIds(accessToken, audience.interests || []);
  const targeting = buildTargeting(audience, platforms);
  if (interestIds.length) targeting.flexible_spec = [{ interests: interestIds }];
  const { optimization_goal, billing_event } = OPTIMIZATION[objective] || DEFAULT_OPTIMIZATION;
  // Meta bills in the ad account's smallest currency unit (paise for INR, cents for USD — every
  // currency this app's ad wizard is used with has 2 decimal places; zero-decimal currencies like JPY
  // are not handled specially since AD_LOCATIONS never offers one today).
  const minorBudget = Math.round(Number(budget) * 100);
  const form = {
    name,
    campaign_id: campaignExternalId,
    status: launch ? 'ACTIVE' : 'PAUSED',
    optimization_goal,
    billing_event,
    targeting,
    start_time: `${startDate}T00:00:00+0000`,
  };
  if (budgetType === 'daily') form.daily_budget = minorBudget;
  else {
    form.lifetime_budget = minorBudget;
    form.end_time = `${endDate}T23:59:59+0000`;
  }
  const created = await graphCall('POST', `${externalAccountId}/adsets`, { token: accessToken, form });
  return created.id;
}

/**
 * Creates just the ad creative. Returns its Meta id.
 *
 * `boostExternalPostId` (Phase 3, "existing post → ad"): when set, this is a real **boost** of an
 * already-published Facebook Page post — Meta's own `<page_id>_<post_id>` combined id, exactly the
 * value Facebook returns and this app already stores as `post_targets.external_id` for a published
 * Facebook post (see providers/publishers.js's `publishFacebook`). The creative then reuses that
 * post's own text/image directly via `object_story_id`, so `creative`/`imageUrl` are not used at all
 * in that case — there is nothing to upload or restate, which is exactly what a real "Boost Post"
 * button does. Deliberately Facebook-only: Instagram's own equivalent field for boosting an existing
 * IG media is a different, less-documented corner of the API this codebase does not have verified
 * confidence in — content-reuse (a fresh creative copying the post's text/image) is offered for an
 * Instagram-sourced post instead, at the call site in adsService.js.
 */
export async function createMetaAdCreative({ accessToken, externalAccountId, name, creative, pageId, instagramActorId, imageUrl, boostExternalPostId }) {
  if (boostExternalPostId) {
    const created = await graphCall('POST', `${externalAccountId}/adcreatives`, { token: accessToken, form: { name, object_story_id: boostExternalPostId } });
    return created.id;
  }
  let imageHash;
  if (imageUrl) {
    const uploaded = await graphCall('POST', `${externalAccountId}/adimages`, { token: accessToken, form: { url: imageUrl } });
    imageHash = Object.values(uploaded.images || {})[0]?.hash;
  }
  const linkData = {
    message: creative.text,
    link: creative.destinationUrl,
    name: creative.headline,
    call_to_action: { type: CTA_TYPES[creative.cta] || 'LEARN_MORE', value: { link: creative.destinationUrl } },
  };
  if (imageHash) linkData.image_hash = imageHash;
  const objectStorySpec = { page_id: pageId, link_data: linkData };
  if (instagramActorId) objectStorySpec.instagram_actor_id = instagramActorId;
  const created = await graphCall('POST', `${externalAccountId}/adcreatives`, { token: accessToken, form: { name, object_story_spec: objectStorySpec } });
  return created.id;
}

/** Creates just the ad, linking an existing ad set and creative. Returns its Meta id. */
export async function createMetaAd({ accessToken, externalAccountId, name, adSetExternalId, creativeExternalId, launch }) {
  const created = await graphCall('POST', `${externalAccountId}/ads`, {
    token: accessToken,
    form: { name, adset_id: adSetExternalId, creative: { creative_id: creativeExternalId }, status: launch ? 'ACTIVE' : 'PAUSED' },
  });
  return created.id;
}

/**
 * Creates the full Meta object chain (campaign → ad set → creative → ad) for one Social ad, and
 * returns the four external ids to store. `accessToken` is the Ads-scoped User token (not the Page
 * token). `pageId`/`instagramActorId` are the client's own connected Facebook Page / Instagram
 * Business account ids from Social Accounts — the ad must appear AS that profile (Meta requires a
 * Facebook Page even for an Instagram-only ad); passing the id is enough, no Page token is needed
 * here, the Ads token's own permission on the ad account/Business Manager covers it.
 *
 * Thin wrapper around the four composable calls above (kept as one function for the single-ad create
 * path in adsService.js) — Phase 4's bulk creation calls those four directly instead, so it can create
 * one campaign/ad set once and loop just the creative+ad pair per variation, without repeating the
 * campaign/ad-set Meta calls.
 */
export async function createMetaCampaign({ accessToken, externalAccountId, campaign, pageId, instagramActorId, imageUrl, boostExternalPostId }) {
  const launch = campaign.status !== 'draft';
  const externalCampaignId = await createMetaCampaignObject({ accessToken, externalAccountId, name: campaign.name, objective: campaign.objective, launch });
  const externalAdsetId = await createMetaAdSet({
    accessToken,
    externalAccountId,
    campaignExternalId: externalCampaignId,
    name: `${campaign.name} — ad set`,
    launch,
    objective: campaign.objective,
    audience: campaign.audience,
    platforms: campaign.platforms,
    budgetType: campaign.budgetType,
    budget: campaign.budget,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
  });
  const externalCreativeId = await createMetaAdCreative({
    accessToken,
    externalAccountId,
    name: `${campaign.name} — creative`,
    creative: campaign.creative,
    pageId,
    instagramActorId,
    imageUrl,
    boostExternalPostId,
  });
  const externalAdId = await createMetaAd({ accessToken, externalAccountId, name: campaign.name, adSetExternalId: externalAdsetId, creativeExternalId: externalCreativeId, launch });

  return { externalCampaignId, externalAdsetId, externalCreativeId, externalAdId };
}

const STATUS_FROM_EFFECTIVE = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  PENDING_REVIEW: 'inReview',
  IN_PROCESS: 'inReview',
  WITH_ISSUES: 'active',
  DISAPPROVED: 'rejected',
  CAMPAIGN_PAUSED: 'paused',
  ADSET_PAUSED: 'paused',
  ARCHIVED: 'completed',
  DELETED: 'completed',
};

/** The ad's current review state, for the background refresh to mirror into ads.status. */
export async function fetchMetaAdStatus({ accessToken, externalAdId }) {
  const data = await graphCall('GET', externalAdId, { token: accessToken, query: { fields: 'effective_status,issues_info' } });
  const issue = Array.isArray(data.issues_info) ? data.issues_info[0] : null;
  return { status: STATUS_FROM_EFFECTIVE[data.effective_status] || 'active', rejectionReason: issue?.error_summary || issue?.error_message || null };
}

/** Real day-by-day spend/impressions/clicks since `since` (inclusive), for one specific ad. Conversions are never read here — see the file header comment. */
export async function fetchMetaInsights({ accessToken, externalAdId, since, until }) {
  const data = await graphCall('GET', `${externalAdId}/insights`, {
    token: accessToken,
    query: { fields: 'spend,impressions,clicks', time_increment: 1, time_range: { since, until } },
  });
  return (data.data || []).map((row) => ({
    date: row.date_start,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
  }));
}

/** Pauses/resumes one specific ad — other ads in the same ad set/campaign are untouched. */
export async function setMetaAdStatus({ accessToken, externalAdId, status }) {
  await graphCall('POST', externalAdId, { token: accessToken, form: { status } });
}

export async function deleteMetaAd({ accessToken, externalAdId }) {
  const response = await callProvider(`${graphBase()}/${externalAdId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
    label: 'Meta Ads',
  });
  // Meta answers "already gone" the same way most platforms answer "not found" — either is fine here,
  // the goal (nothing left running on Meta's side) is already true.
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    if (response.data?.error?.code === 190) throw authFailure('Meta Ads says this access token is invalid or has expired.');
    throw rejection(`Meta could not delete this ad: ${response.data?.error?.message || `error ${response.status}`}.`);
  }
}
