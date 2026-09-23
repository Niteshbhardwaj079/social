import { config } from '../config/env.js';
import { callProvider, failure } from './http.js';
import { authFailure, rejection } from './errors.js';

/**
 * Meta Marketing API (Facebook + Instagram ads) — the one ad network this app builds for real.
 * Same access token the client already generates for Facebook/Instagram posting, just with the
 * `ads_management`/`ads_read` permissions added; no separate app review beyond what Meta itself asks
 * of the ad account. See the backend README for why the other five ad networks in the UI's connect
 * list (Google, LinkedIn, X, TikTok, Pinterest) are not built yet — briefly: LinkedIn's Advertising
 * API is restricted to approved Marketing Partners, X's is paid-tier, TikTok's needs Social itself
 * (not the client) to pass a one-time Marketing API app review, Google Ads is a complex
 * protobuf-first API this codebase does not have verified confidence in, and Pinterest Ads' exact
 * budget-currency-unit convention was not confident enough to risk against a client's real ad spend.
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
const normalizeAccountId = (id) => (id.startsWith('act_') ? id : `act_${id}`);

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

/** "Test connection" / "Save & connect": confirms the token can actually read this ad account. */
export async function verifyMetaAdAccount({ adAccountId, accessToken }) {
  const id = normalizeAccountId(adAccountId);
  const data = await graphCall('GET', id, { token: accessToken, query: { fields: 'id,name,currency' } });
  return { externalId: data.id, accountName: data.name || 'Meta Ads account', currency: data.currency || '' };
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
 * Creates the full Meta object chain (campaign → ad set → creative → ad) for one Social ad campaign,
 * and returns the four external ids to store. `pageId`/`instagramActorId` come from the client's own
 * connected Facebook Page / Instagram Business account in Social Accounts (the ad must appear AS that
 * profile — Meta requires a Facebook Page even for an Instagram-only ad).
 */
export async function createMetaCampaign({ adAccount, campaign, pageId, instagramActorId, imageUrl }) {
  const { accessToken } = adAccount;
  const act = normalizeAccountId(adAccount.adAccountId);
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

/** The ad's current review state, for the background refresh to mirror into ad_campaigns.status. */
export async function fetchMetaAdStatus({ adAccount, externalAdId }) {
  const data = await graphCall('GET', externalAdId, { token: adAccount.accessToken, query: { fields: 'effective_status,issues_info' } });
  const issue = Array.isArray(data.issues_info) ? data.issues_info[0] : null;
  return { status: STATUS_FROM_EFFECTIVE[data.effective_status] || 'active', rejectionReason: issue?.error_summary || issue?.error_message || null };
}

/** Real day-by-day spend/impressions/clicks since `since` (inclusive). Conversions are never read here — see the file header comment. */
export async function fetchMetaInsights({ adAccount, externalCampaignId, since, until }) {
  const data = await graphCall('GET', `${externalCampaignId}/insights`, {
    token: adAccount.accessToken,
    query: { fields: 'spend,impressions,clicks', time_increment: 1, time_range: { since, until } },
  });
  return (data.data || []).map((row) => ({
    date: row.date_start,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
  }));
}

export async function setMetaCampaignStatus({ adAccount, externalCampaignId, status }) {
  await graphCall('POST', externalCampaignId, { token: adAccount.accessToken, form: { status } });
}

export async function deleteMetaCampaign({ adAccount, externalCampaignId }) {
  const response = await callProvider(`${graphBase()}/${externalCampaignId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adAccount.accessToken}` },
    label: 'Meta Ads',
  });
  // Meta answers "already gone" the same way most platforms answer "not found" — either is fine here,
  // the goal (nothing left running on Meta's side) is already true.
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    if (response.data?.error?.code === 190) throw authFailure('Meta Ads says this access token is invalid or has expired.');
    throw rejection(`Meta could not delete this campaign: ${response.data?.error?.message || `error ${response.status}`}.`);
  }
}
