import { PLATFORM_KEYS } from './platforms';

/**
 * Paid advertising, per ad network. Every network is the client's OWN ad
 * account (bring-your-own-account): the ad platforms' APIs are free to call, and
 * the ad spend is billed by the platform straight to the client's payment method
 * — Social never charges for ads or takes a cut of the budget.
 *
 * One network can cover several placements (Meta Ads runs both Facebook and
 * Instagram from a single ad account).
 */
const text = (key, label, extra = {}) => ({ key, label, type: 'text', required: true, ...extra });
const secret = (key, label, extra = {}) => ({ key, label, type: 'password', required: true, ...extra });

export const AD_NETWORKS = [
  {
    key: 'meta',
    label: 'Meta Ads',
    subtitle: 'Facebook & Instagram',
    iconPlatform: PLATFORM_KEYS.FACEBOOK,
    platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM],
    badge: 'Access token needed',
    guideTitle: 'Meta Ads needs your ad account and an access token',
    intro:
      'One Meta ad account runs ads on both Facebook and Instagram. The Marketing API is free to use — you only pay Meta for the ad spend, from the payment method already on your ad account.',
    steps: [
      'Open Meta Ads Manager and make sure your ad account has a payment method added.',
      'Copy the Ad account ID (it looks like act_1234567890) from the account dropdown.',
      'In Meta for Developers, open your app and add the Marketing API product.',
      'Generate an access token with the ads_management and ads_read permissions (a long-lived or System User token lasts longest).',
      'Paste the values below.',
    ],
    providerLabel: 'Open Meta Ads Manager',
    providerUrl: 'https://business.facebook.com/adsmanager/',
    fields: [
      text('adAccountId', 'Ad account ID', { placeholder: 'act_1234567890' }),
      text('businessId', 'Business ID (optional)', { required: false, placeholder: 'From Business settings' }),
      secret('accessToken', 'Access token', { placeholder: 'ads_management + ads_read', wide: true }),
    ],
  },
  {
    key: 'google',
    label: 'Google Ads',
    subtitle: 'YouTube & Search',
    iconPlatform: PLATFORM_KEYS.YOUTUBE,
    platforms: [PLATFORM_KEYS.YOUTUBE],
    badge: 'Developer token needed',
    guideTitle: 'Google Ads needs a developer token and OAuth keys',
    intro:
      'The Google Ads API is free. Google reviews and approves a developer token once (usually within a few days); ad spend is billed by Google to your Ads account.',
    steps: [
      'Open your Google Ads account and copy the Customer ID (10 digits, shown top right).',
      'In the Google Ads manager account, open API Center and apply for a developer token.',
      'In Google Cloud Console create an OAuth client ID (Web application) and copy the Client ID and Secret.',
      'Authorize with the adwords scope to get a refresh token.',
      'Paste the values below.',
    ],
    providerLabel: 'Open Google Ads',
    providerUrl: 'https://ads.google.com/',
    fields: [
      text('customerId', 'Customer ID', { placeholder: '123-456-7890' }),
      secret('developerToken', 'Developer token', { placeholder: 'From API Center' }),
      text('clientId', 'OAuth Client ID', { placeholder: 'ends with .apps.googleusercontent.com' }),
      secret('clientSecret', 'OAuth Client Secret', { placeholder: 'From the OAuth client' }),
      secret('refreshToken', 'Refresh token', { placeholder: 'Scope: adwords', wide: true }),
    ],
  },
  {
    key: 'linkedin',
    label: 'LinkedIn Ads',
    subtitle: 'Sponsored content',
    iconPlatform: PLATFORM_KEYS.LINKEDIN,
    platforms: [PLATFORM_KEYS.LINKEDIN],
    badge: 'Access token needed',
    guideTitle: 'LinkedIn Ads needs the Advertising API',
    intro: 'LinkedIn must approve your app for the Advertising API. Ad spend is billed by LinkedIn to your Campaign Manager account.',
    steps: [
      'Open LinkedIn Campaign Manager and copy your Ad account ID from the account URL.',
      'In the LinkedIn Developer Portal, open your app and request the Advertising API product.',
      'Once approved, generate a token with the r_ads, rw_ads and r_ads_reporting scopes.',
      'Paste the values below.',
    ],
    providerLabel: 'Open LinkedIn Campaign Manager',
    providerUrl: 'https://www.linkedin.com/campaignmanager/',
    fields: [
      text('adAccountId', 'Ad account ID', { placeholder: 'e.g. 512345678' }),
      secret('accessToken', 'Access token', { placeholder: 'r_ads, rw_ads, r_ads_reporting', wide: true }),
    ],
  },
  {
    key: 'x',
    label: 'X Ads',
    subtitle: 'Promoted posts',
    iconPlatform: PLATFORM_KEYS.X,
    platforms: [PLATFORM_KEYS.X],
    badge: 'Ads API access needed',
    guideTitle: 'X Ads needs Ads API access',
    intro: 'X gives Ads API access on request. Ad spend is billed by X to the payment method on your X Ads account.',
    steps: [
      'Open X Ads and copy the Ads account ID.',
      'Apply for Ads API access for your developer app.',
      'Once approved, copy the API Key, Secret and your Access Token and Secret.',
      'Paste all values below.',
    ],
    providerLabel: 'Open X Ads',
    providerUrl: 'https://ads.x.com/',
    fields: [
      text('adAccountId', 'Ads account ID', { placeholder: 'e.g. 18ce54d4x5t' }),
      text('apiKey', 'API Key', { placeholder: 'Consumer key' }),
      secret('apiSecret', 'API Key Secret', { placeholder: 'Consumer secret' }),
      text('accessToken', 'Access Token', { placeholder: 'With Ads access' }),
      secret('accessTokenSecret', 'Access Token Secret', { placeholder: 'Paired with the token' }),
    ],
  },
  {
    key: 'tiktok',
    label: 'TikTok Ads',
    subtitle: 'In-feed ads',
    iconPlatform: PLATFORM_KEYS.TIKTOK,
    platforms: [PLATFORM_KEYS.TIKTOK],
    badge: 'Access token needed',
    guideTitle: 'TikTok Ads needs a Marketing API app',
    intro: 'The TikTok Marketing API is free after your app is approved. Ad spend is billed by TikTok to your advertiser account.',
    steps: [
      'Open TikTok Ads Manager and copy the Advertiser ID.',
      'In TikTok for Business Developers, create a Marketing API app and get it approved.',
      'Authorize your advertiser account to receive an access token.',
      'Paste the values below.',
    ],
    providerLabel: 'Open TikTok Ads Manager',
    providerUrl: 'https://ads.tiktok.com/',
    fields: [
      text('advertiserId', 'Advertiser ID', { placeholder: 'e.g. 7123456789012345678' }),
      secret('accessToken', 'Access token', { placeholder: 'From the authorization flow', wide: true }),
    ],
  },
  {
    key: 'pinterest',
    label: 'Pinterest Ads',
    subtitle: 'Promoted pins',
    iconPlatform: PLATFORM_KEYS.PINTEREST,
    platforms: [PLATFORM_KEYS.PINTEREST],
    badge: 'Access token needed',
    guideTitle: 'Pinterest Ads needs an app with ads access',
    intro: 'Pinterest’s API is free to use. Ad spend is billed by Pinterest to your ad account.',
    steps: [
      'Open Pinterest Ads Manager and copy the Ad account ID.',
      'In Pinterest Developers, request ads:read and ads:write access for your app.',
      'Generate an access token with those scopes.',
      'Paste the values below.',
    ],
    providerLabel: 'Open Pinterest Ads',
    providerUrl: 'https://ads.pinterest.com/',
    fields: [
      text('adAccountId', 'Ad account ID', { placeholder: 'e.g. 549755885175' }),
      secret('accessToken', 'Access token', { placeholder: 'Scopes: ads:read, ads:write', wide: true }),
    ],
  },
];

export function getAdNetwork(key) {
  return AD_NETWORKS.find((network) => network.key === key) || null;
}

export function getNetworkForPlatform(platformKey) {
  return AD_NETWORKS.find((network) => network.platforms.includes(platformKey)) || null;
}

export const AD_OBJECTIVES = [
  { key: 'awareness', label: 'Brand awareness', icon: 'Megaphone', description: 'Show your brand to as many of the right people as possible.' },
  { key: 'traffic', label: 'Website traffic', icon: 'MousePointerClick', description: 'Send people to your website, shop or landing page.' },
  { key: 'engagement', label: 'Engagement', icon: 'Heart', description: 'Get more likes, comments, shares and video views.' },
  { key: 'leads', label: 'Leads', icon: 'UserPlus', description: 'Collect enquiries, sign-ups and contact details.' },
  { key: 'sales', label: 'Sales', icon: 'ShoppingBag', description: 'Drive purchases and other valuable actions.' },
];

export const AD_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  DRAFT: 'draft',
  IN_REVIEW: 'inReview',
  REJECTED: 'rejected',
};

export const AD_STATUS_LABELS = {
  [AD_STATUS.ACTIVE]: 'Active',
  [AD_STATUS.PAUSED]: 'Paused',
  [AD_STATUS.SCHEDULED]: 'Scheduled',
  [AD_STATUS.COMPLETED]: 'Completed',
  [AD_STATUS.DRAFT]: 'Draft',
  [AD_STATUS.IN_REVIEW]: 'In review',
  [AD_STATUS.REJECTED]: 'Rejected',
};

export const AD_CTAS = ['Learn more', 'Shop now', 'Sign up', 'Contact us', 'Book now', 'Download', 'Get quote'];

export const AD_INTERESTS = [
  'Fashion', 'Technology', 'Food & drink', 'Travel', 'Fitness', 'Business', 'Education', 'Beauty', 'Sports', 'Music', 'Home & garden', 'Automotive',
];

export const AD_LOCATIONS = ['India', 'United States', 'United Kingdom', 'UAE', 'Singapore', 'Canada', 'Australia'];

// Bulk ad creation (several creative variations sharing one campaign/ad set/audience/budget). Matches
// the backend's own cap (adsService.js's MAX_BULK_VARIATIONS) — not a money-safety limit, since every
// variation shares one budget, just a practical cap on how large a reviewable batch gets.
export const MAX_AD_VARIATIONS = 6;

export const AD_DATE_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

export const AD_METRICS = [
  { key: 'spend', label: 'Spend', isMoney: true },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Results' },
];
