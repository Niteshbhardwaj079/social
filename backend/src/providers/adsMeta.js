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

/**
 * Creates the full Meta object chain (campaign → ad set → creative → ad) for one Social ad, and
 * returns the four external ids to store. `accessToken` is the Ads-scoped User token (not the Page
 * token). `pageId`/`instagramActorId` are the client's own connected Facebook Page / Instagram
 * Business account ids from Social Accounts — the ad must appear AS that profile (Meta requires a
 * Facebook Page even for an Instagram-only ad); passing the id is enough, no Page token is needed
 * here, the Ads token's own permission on the ad account/Business Manager covers it.
 */
export async function createMetaCampaign({ accessToken, externalAccountId, campaign, pageId, instagramActorId, imageUrl }) {
  const act = externalAccountId;
  const launch = campaign.status !== 'draft';
  const metaStatus = launch ? 'ACTIVE' : 'PAUSED';

  const createdCampaign = await graphCall('POST', `${act}/campaigns`, {
    token: accessToken,
    form: {
      name: campaign.name,
      objective: CAMPAIGN_OBJECTIVE[campaign.objective] || 'OUTCOME_TRAFFIC',
      status: metaStatus,
      special_ad_categories: [],
    },
  });

  const interestIds = await resolveInterestIds(accessToken, campaign.audience.interests || []);
  const targeting = buildTargeting(campaign.audience, campaign.platforms);
  if (interestIds.length) targeting.flexible_spec = [{ interests: interestIds }];
  const { optimization_goal, billing_event } = OPTIMIZATION[campaign.objective] || DEFAULT_OPTIMIZATION;
  // Meta bills in the ad account's smallest currency unit (paise for INR, cents for USD — every
  // currency this app's ad wizard is used with has 2 decimal places; zero-decimal currencies like JPY
  // are not handled specially since AD_LOCATIONS never offers one today).
  const minorBudget = Math.round(Number(campaign.budget) * 100);
  const adSetForm = {
    name: `${campaign.name} — ad set`,
    campaign_id: createdCampaign.id,
    status: metaStatus,
    optimization_goal,
    billing_event,
    targeting,
    start_time: `${campaign.startDate}T00:00:00+0000`,
  };
  if (campaign.budgetType === 'daily') adSetForm.daily_budget = minorBudget;
  else {
    adSetForm.lifetime_budget = minorBudget;
    adSetForm.end_time = `${campaign.endDate}T23:59:59+0000`;
  }
  const createdAdSet = await graphCall('POST', `${act}/adsets`, { token: accessToken, form: adSetForm });

  let imageHash;
  if (imageUrl) {
    const uploaded = await graphCall('POST', `${act}/adimages`, { token: accessToken, form: { url: imageUrl } });
    imageHash = Object.values(uploaded.images || {})[0]?.hash;
  }
  const linkData = {
    message: campaign.creative.text,
    link: campaign.creative.destinationUrl,
    name: campaign.creative.headline,
    call_to_action: { type: CTA_TYPES[campaign.creative.cta] || 'LEARN_MORE', value: { link: campaign.creative.destinationUrl } },
  };
  if (imageHash) linkData.image_hash = imageHash;
  const objectStorySpec = { page_id: pageId, link_data: linkData };
  if (instagramActorId) objectStorySpec.instagram_actor_id = instagramActorId;
  const createdCreative = await graphCall('POST', `${act}/adcreatives`, {
    token: accessToken,
    form: { name: `${campaign.name} — creative`, object_story_spec: objectStorySpec },
  });

  const createdAd = await graphCall('POST', `${act}/ads`, {
    token: accessToken,
    form: { name: campaign.name, adset_id: createdAdSet.id, creative: { creative_id: createdCreative.id }, status: metaStatus },
  });

  return {
    externalCampaignId: createdCampaign.id,
    externalAdsetId: createdAdSet.id,
    externalCreativeId: createdCreative.id,
    externalAdId: createdAd.id,
  };
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
