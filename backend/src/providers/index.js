import { verifyFacebook, verifyInstagram, verifyThreads } from './meta.js';
import { verifyX } from './x.js';
import { verifyLinkedIn, verifyLinkedInCompany } from './linkedin.js';
import { verifyGoogleBusiness, verifyYouTube } from './google.js';
import { verifyBluesky, verifyMastodon, verifyPinterest, verifyTikTok } from './others.js';

/**
 * Every supported platform: its label, the credentials it needs (the same field names the web app's
 * connect form sends — src/config/platformConnectGuides.js), and how to check them for real.
 * `verify(credentials)` resolves to { externalId, accountName, handle, followers } or throws a ProviderError.
 * `paidTier` marks platforms where the client's own API key may be on a paid plan that unlocks more data.
 *
 * Adding a platform = one entry here + one verifier file. Nothing else in the API changes.
 */
export const PROVIDERS = {
  facebook: { label: 'Facebook Pages', fields: ['appId', 'appSecret', 'accessToken'], verify: verifyFacebook },
  instagram: { label: 'Instagram Business', fields: ['appId', 'appSecret', 'igUserId', 'accessToken'], verify: verifyInstagram },
  x: { label: 'X', fields: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'], verify: verifyX, paidTier: true },
  linkedin: { label: 'LinkedIn Profiles', fields: ['clientId', 'clientSecret', 'accessToken'], verify: verifyLinkedIn },
  linkedinCompany: {
    label: 'LinkedIn Company Pages',
    fields: ['clientId', 'clientSecret', 'organizationId', 'accessToken'],
    verify: verifyLinkedInCompany,
  },
  googleBusiness: {
    label: 'Google Business Profile',
    fields: ['clientId', 'clientSecret', 'locationId', 'refreshToken'],
    verify: verifyGoogleBusiness,
  },
  youtube: { label: 'YouTube Channels', fields: ['clientId', 'clientSecret', 'refreshToken'], verify: verifyYouTube },
  pinterest: { label: 'Pinterest Profiles', fields: ['appId', 'appSecret', 'accessToken'], verify: verifyPinterest },
  tiktok: { label: 'TikTok Profiles', fields: ['clientKey', 'clientSecret', 'accessToken'], verify: verifyTikTok },
  mastodon: { label: 'Mastodon Profiles', fields: ['instanceUrl', 'accessToken'], verify: verifyMastodon },
  threads: { label: 'Threads Profiles', fields: ['appId', 'appSecret', 'threadsUserId', 'accessToken'], verify: verifyThreads },
  bluesky: { label: 'Bluesky Profiles', fields: ['handle', 'appPassword'], verify: verifyBluesky },
};

export { PUBLISHERS } from './publishers.js';
export const PLATFORM_KEYS = Object.keys(PROVIDERS);
export const platformLabel = (key) => PROVIDERS[key]?.label ?? key;
export const isPlatform = (key) => Object.hasOwn(PROVIDERS, key);
