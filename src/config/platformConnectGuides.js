import { PLATFORM_KEYS } from './platforms';

/**
 * Per-platform "how to connect" content for the Connect Account pages: the
 * short badge on the picker row, the guide card, and which credentials the
 * form asks for. Every platform connects with the client's OWN developer
 * credentials (bring-your-own-key), so nothing here is a shared Social key.
 * Portals change their menus now and then — keep steps short and name the
 * thing to look for rather than an exact click path.
 */
const field = (key, label, extra = {}) => ({ key, label, type: 'text', required: true, ...extra });
const secret = (key, label, extra = {}) => ({ key, label, type: 'password', required: true, ...extra });

const platformConnectGuides = {
  [PLATFORM_KEYS.FACEBOOK]: {
    badge: 'Access token needed',
    guideTitle: 'Facebook Pages needs a Page access token',
    intro:
      'Facebook lets an app post to a Page you manage. You create a small app in Meta for Developers, then paste its keys and a long-lived Page token here.',
    steps: [
      'Open Meta for Developers and create an app (type: Business).',
      'In App settings → Basic, copy the App ID and App Secret.',
      'In Graph API Explorer, pick your app and your Page, and grant pages_manage_posts, pages_read_engagement and pages_show_list.',
      'Generate a Page access token and extend it to a long-lived token.',
      'Paste the three values below.',
    ],
    providerLabel: 'Open Meta for Developers',
    providerUrl: 'https://developers.facebook.com/apps/',
    fields: [
      field('appId', 'App ID', { placeholder: 'e.g. 1234567890123456' }),
      secret('appSecret', 'App Secret', { placeholder: 'From App settings → Basic' }),
      secret('accessToken', 'Page access token', { placeholder: 'Long-lived Page token', wide: true }),
    ],
  },
  [PLATFORM_KEYS.INSTAGRAM]: {
    badge: 'Access token needed',
    guideTitle: 'Instagram Business needs an access token',
    intro:
      'Instagram publishing works for Business or Creator accounts linked to a Facebook Page. You use the same kind of Meta app as Facebook.',
    steps: [
      'Make sure your Instagram account is a Business or Creator account and is linked to a Facebook Page.',
      'In Meta for Developers, create or open your app and add the Instagram product.',
      'Grant instagram_basic and instagram_content_publish, then generate a long-lived access token.',
      'Find your Instagram Business Account ID (Graph API Explorer: GET /me/accounts, then the linked instagram_business_account).',
      'Paste the values below.',
    ],
    providerLabel: 'Open Meta for Developers',
    providerUrl: 'https://developers.facebook.com/apps/',
    fields: [
      field('appId', 'App ID', { placeholder: 'e.g. 1234567890123456' }),
      secret('appSecret', 'App Secret', { placeholder: 'From App settings → Basic' }),
      field('igUserId', 'Instagram Business Account ID', { placeholder: 'e.g. 17841400000000000' }),
      secret('accessToken', 'Access token', { placeholder: 'Long-lived token', wide: true }),
    ],
  },
  [PLATFORM_KEYS.X]: {
    badge: 'API keys needed',
    guideTitle: 'X needs your API keys and access tokens',
    intro:
      'X posts through your own developer project. Use the free tier if it covers your volume, or whichever plan you already have — that bill is between you and X.',
    steps: [
      'Open the X Developer Portal and create a project and an app.',
      'Under User authentication settings, turn on OAuth 1.0a with Read and Write permission.',
      'In Keys and tokens, copy the API Key and API Key Secret.',
      'Generate the Access Token and Access Token Secret for your account (they must say Read and Write).',
      'Paste all four values below.',
    ],
    providerLabel: 'Open X Developer Portal',
    providerUrl: 'https://developer.x.com/en/portal/dashboard',
    fields: [
      field('apiKey', 'API Key', { placeholder: 'Consumer key' }),
      secret('apiSecret', 'API Key Secret', { placeholder: 'Consumer secret' }),
      field('accessToken', 'Access Token', { placeholder: 'Ends with your user id' }),
      secret('accessTokenSecret', 'Access Token Secret', { placeholder: 'Paired with the access token' }),
    ],
  },
  [PLATFORM_KEYS.LINKEDIN]: {
    badge: 'Access token needed',
    guideTitle: 'LinkedIn Profiles needs an app and an access token',
    intro: 'Posting to your personal profile uses the "Share on LinkedIn" product on a LinkedIn developer app.',
    steps: [
      'Open the LinkedIn Developer Portal and create an app (you need a LinkedIn Page to attach it to).',
      'On the Products tab, request Share on LinkedIn and Sign In with LinkedIn.',
      'On the Auth tab, copy the Client ID and Client Secret.',
      'Generate a token with the w_member_social scope from the Token Generator tool.',
      'Paste the values below.',
    ],
    providerLabel: 'Open LinkedIn Developers',
    providerUrl: 'https://www.linkedin.com/developers/apps',
    fields: [
      field('clientId', 'Client ID', { placeholder: 'From the Auth tab' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From the Auth tab' }),
      secret('accessToken', 'Access token', { placeholder: 'Scope: w_member_social', wide: true }),
    ],
  },
  [PLATFORM_KEYS.LINKEDIN_COMPANY]: {
    badge: 'Access token needed',
    guideTitle: 'LinkedIn Company Pages needs page-admin access',
    intro:
      'Company Page posting needs the Community Management API on your LinkedIn app, and you must be an admin of that Page.',
    steps: [
      'Open the LinkedIn Developer Portal and open (or create) your app.',
      'On the Products tab, request Community Management API and wait for approval.',
      'Copy the Client ID and Client Secret from the Auth tab.',
      'Generate a token with the w_organization_social scope.',
      'Find your Organization ID — it is the number in your Page admin URL (linkedin.com/company/<number>/admin).',
      'Paste the values below.',
    ],
    providerLabel: 'Open LinkedIn Developers',
    providerUrl: 'https://www.linkedin.com/developers/apps',
    fields: [
      field('clientId', 'Client ID', { placeholder: 'From the Auth tab' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From the Auth tab' }),
      field('organizationId', 'Organization ID', { placeholder: 'e.g. 12345678' }),
      secret('accessToken', 'Access token', { placeholder: 'Scope: w_organization_social', wide: true }),
    ],
  },
  [PLATFORM_KEYS.GOOGLE_BUSINESS]: {
    badge: 'OAuth keys needed',
    guideTitle: 'Google Business Profile needs OAuth credentials',
    intro:
      'Google Business Profile posting uses a Google Cloud project with the Business Profile APIs enabled. Google asks you to request access to these APIs once.',
    steps: [
      'Open Google Cloud Console and create a project.',
      'Request access to the Business Profile APIs and enable them for the project.',
      'Configure the OAuth consent screen, then create an OAuth client ID (type: Web application).',
      'Copy the Client ID and Client Secret, and obtain a refresh token for your Google account.',
      'Copy your Location ID from the Business Profile dashboard and paste everything below.',
    ],
    providerLabel: 'Open Google Cloud Console',
    providerUrl: 'https://console.cloud.google.com/apis/library',
    fields: [
      field('clientId', 'Client ID', { placeholder: 'ends with .apps.googleusercontent.com' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From the OAuth client' }),
      field('locationId', 'Location ID', { placeholder: 'e.g. 1234567890123456789' }),
      secret('refreshToken', 'Refresh token', { placeholder: 'Long-lived refresh token', wide: true }),
    ],
  },
  [PLATFORM_KEYS.YOUTUBE]: {
    badge: 'OAuth keys needed',
    guideTitle: 'YouTube needs a Google Cloud OAuth client',
    intro: 'YouTube uploads use the YouTube Data API v3, which is free within Google’s daily quota.',
    steps: [
      'Open Google Cloud Console and create a project.',
      'Enable YouTube Data API v3 for that project.',
      'Configure the OAuth consent screen and add your Google account as a test user.',
      'Create an OAuth client ID (type: Web application) and copy the Client ID and Client Secret.',
      'Authorize with the youtube.upload scope to get a refresh token, then paste the values below.',
    ],
    providerLabel: 'Open Google Cloud Console',
    providerUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    fields: [
      field('clientId', 'Client ID', { placeholder: 'ends with .apps.googleusercontent.com' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From the OAuth client' }),
      secret('refreshToken', 'Refresh token', { placeholder: 'Scope: youtube.upload', wide: true }),
    ],
  },
  [PLATFORM_KEYS.PINTEREST]: {
    badge: 'Access token needed',
    guideTitle: 'Pinterest needs an app and an access token',
    intro: 'Pins are created through Pinterest’s API using an app you register on their developer site.',
    steps: [
      'Open Pinterest Developers and connect your Pinterest business account.',
      'Create an app and request Standard access if you are still on Trial.',
      'Copy the App ID and App Secret.',
      'Generate an access token with the boards:read, boards:write and pins:write scopes.',
      'Paste the values below.',
    ],
    providerLabel: 'Open Pinterest Developers',
    providerUrl: 'https://developers.pinterest.com/apps/',
    fields: [
      field('appId', 'App ID', { placeholder: 'From your app page' }),
      secret('appSecret', 'App Secret', { placeholder: 'From your app page' }),
      secret('accessToken', 'Access token', { placeholder: 'Scopes: pins:write, boards:read', wide: true }),
    ],
  },
  [PLATFORM_KEYS.TIKTOK]: {
    badge: 'Access token needed',
    guideTitle: 'TikTok needs a developer app with Content Posting',
    intro:
      'TikTok posts through the Content Posting API. Until TikTok audits your app, posts can only be private — that is a TikTok rule, not a limit of Social.',
    steps: [
      'Open TikTok for Developers and register an app.',
      'Add the Login Kit and Content Posting API products.',
      'Copy the Client Key and Client Secret.',
      'Authorize your TikTok account with the video.publish scope to get an access token.',
      'Paste the values below.',
    ],
    providerLabel: 'Open TikTok for Developers',
    providerUrl: 'https://developers.tiktok.com/apps/',
    fields: [
      field('clientKey', 'Client Key', { placeholder: 'From your app page' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From your app page' }),
      secret('accessToken', 'Access token', { placeholder: 'Scope: video.publish', wide: true }),
    ],
  },
  [PLATFORM_KEYS.MASTODON]: {
    badge: 'Access token needed',
    guideTitle: 'Mastodon needs your server and an access token',
    intro: 'Mastodon has no central portal — you create the token on the server your account lives on, and it is free.',
    steps: [
      'Sign in to your Mastodon server in the browser.',
      'Go to Preferences → Development and choose New application.',
      'Name it (for example Social) and tick the write:statuses and write:media scopes.',
      'Save, open the application, and copy "Your access token".',
      'Paste your server address and the token below.',
    ],
    providerLabel: 'Open mastodon.social settings',
    providerUrl: 'https://mastodon.social/settings/applications',
    fields: [
      field('instanceUrl', 'Server address', { placeholder: 'https://mastodon.social', type: 'url' }),
      secret('accessToken', 'Access token', { placeholder: 'Your access token' }),
    ],
  },
  [PLATFORM_KEYS.THREADS]: {
    badge: 'Access token needed',
    guideTitle: 'Threads needs a Meta app with the Threads API',
    intro: 'Threads uses the same Meta for Developers site as Facebook and Instagram, with the Threads API added.',
    steps: [
      'Open Meta for Developers and create (or open) an app.',
      'Add the Threads API use case and add your Threads account as a tester.',
      'Copy the Threads App ID and App Secret.',
      'Generate a long-lived access token with threads_basic and threads_content_publish.',
      'Copy your Threads User ID and paste everything below.',
    ],
    providerLabel: 'Open Meta for Developers',
    providerUrl: 'https://developers.facebook.com/apps/',
    fields: [
      field('appId', 'Threads App ID', { placeholder: 'From your app’s Threads settings' }),
      secret('appSecret', 'Threads App Secret', { placeholder: 'From your app’s Threads settings' }),
      field('threadsUserId', 'Threads User ID', { placeholder: 'e.g. 1234567890' }),
      secret('accessToken', 'Access token', { placeholder: 'Long-lived token', wide: true }),
    ],
  },
  [PLATFORM_KEYS.BLUESKY]: {
    badge: 'App password needed',
    guideTitle: 'Bluesky needs an App Password',
    intro:
      'Bluesky does not use developer keys. An App Password is a separate password made just for this app — you can revoke it any time, and your real password stays private.',
    steps: [
      'Open Bluesky and go to Settings → Privacy and security → App passwords.',
      'Choose Add App Password and name it (for example Social).',
      'Copy the password it shows — it looks like xxxx-xxxx-xxxx-xxxx and is shown only once.',
      'Enter your handle (for example you.bsky.social) and paste the App Password below.',
    ],
    providerLabel: 'Open Bluesky App Passwords',
    providerUrl: 'https://bsky.app/settings/app-passwords',
    fields: [
      field('handle', 'Handle', { placeholder: 'you.bsky.social' }),
      secret('appPassword', 'App password', { placeholder: 'xxxx-xxxx-xxxx-xxxx' }),
    ],
  },
};

export function getConnectGuide(platformKey) {
  return platformConnectGuides[platformKey] || null;
}

export default platformConnectGuides;
