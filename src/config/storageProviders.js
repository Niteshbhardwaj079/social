/**
 * External storage providers a client can connect for uploaded media.
 * Everything except Google Drive speaks the same S3-compatible protocol, so one
 * form shape (bucket + endpoint + key pair) covers them all. Every provider is
 * bring-your-own-account: the client pays their provider directly, if at all —
 * Social never resells storage.
 */
const text = (key, label, extra = {}) => ({ key, label, type: 'text', required: true, ...extra });
const secret = (key, label, extra = {}) => ({ key, label, type: 'password', required: true, secret: true, ...extra });

const S3_KEY_FIELDS = [
  text('accessKeyId', 'Access Key ID', { placeholder: 'e.g. AKIA…' }),
  secret('secretAccessKey', 'Secret Access Key', { placeholder: 'Paste the secret key' }),
];

const PUBLIC_URL_FIELD = text('publicBaseUrl', 'Public URL (optional)', {
  required: false,
  type: 'url',
  placeholder: 'https://media.yourdomain.com',
  hint: 'Where files are served from. Copied links and emails use this. Leave blank to use the provider’s default.',
  wide: true,
});

export const STORAGE_PROVIDERS = [
  {
    key: 's3',
    label: 'Amazon S3',
    summary: 'The original — pay per GB stored and transferred.',
    steps: [
      'In the AWS console, create an S3 bucket and turn off "Block public access" for the files you want to serve.',
      'In IAM, create a user with permission to read, write and delete in that bucket, then create an access key for it.',
      'Copy the bucket name, its region (for example ap-south-1), and the key pair here.',
    ],
    providerLabel: 'Open AWS S3',
    providerUrl: 'https://console.aws.amazon.com/s3/',
    fields: [
      text('bucket', 'Bucket name', { placeholder: 'my-social-media' }),
      text('region', 'Region', { placeholder: 'ap-south-1' }),
      ...S3_KEY_FIELDS,
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'r2',
    label: 'Cloudflare R2',
    summary: 'S3-compatible with a free monthly allowance and no download fees.',
    steps: [
      'In the Cloudflare dashboard, open R2 and create a bucket.',
      'Turn on public access for the bucket (an r2.dev address or your own domain) so links open in emails and on Instagram.',
      'Under R2 → Manage API tokens, create a token with Object Read & Write and copy the Access Key ID and Secret.',
      'Copy the bucket’s S3 API endpoint (https://<account-id>.r2.cloudflarestorage.com).',
    ],
    providerLabel: 'Open Cloudflare R2',
    providerUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
    fields: [
      text('bucket', 'Bucket name', { placeholder: 'social-media' }),
      text('endpointUrl', 'Endpoint URL', {
        type: 'url',
        placeholder: 'https://<account-id>.r2.cloudflarestorage.com',
        hint: 'Cloudflare dashboard → R2 → that bucket’s “S3 API” endpoint.',
      }),
      ...S3_KEY_FIELDS,
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'b2',
    label: 'Backblaze B2',
    summary: 'Low-cost storage with a free tier; S3-compatible.',
    steps: [
      'In Backblaze, create a public bucket.',
      'Under Application Keys, create a key limited to that bucket and copy the keyID and applicationKey (shown once).',
      'Copy the bucket’s S3 endpoint (for example https://s3.us-west-004.backblazeb2.com).',
    ],
    providerLabel: 'Open Backblaze B2',
    providerUrl: 'https://secure.backblaze.com/b2_buckets.htm',
    fields: [
      text('bucket', 'Bucket name', { placeholder: 'social-media' }),
      text('endpointUrl', 'Endpoint URL', { type: 'url', placeholder: 'https://s3.us-west-004.backblazeb2.com' }),
      text('accessKeyId', 'Key ID', { placeholder: 'keyID from Application Keys' }),
      secret('secretAccessKey', 'Application Key', { placeholder: 'applicationKey (shown once)' }),
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'wasabi',
    label: 'Wasabi',
    summary: 'Flat-rate hot storage; S3-compatible.',
    steps: [
      'In Wasabi, create a bucket in the region you want.',
      'Under Access Keys, create a key pair.',
      'Copy the bucket, the region’s endpoint (for example https://s3.ap-southeast-1.wasabisys.com) and the keys.',
    ],
    providerLabel: 'Open Wasabi',
    providerUrl: 'https://console.wasabisys.com/',
    fields: [
      text('bucket', 'Bucket name', { placeholder: 'social-media' }),
      text('endpointUrl', 'Endpoint URL', { type: 'url', placeholder: 'https://s3.ap-southeast-1.wasabisys.com' }),
      ...S3_KEY_FIELDS,
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'spaces',
    label: 'DigitalOcean Spaces',
    summary: 'Simple S3-compatible storage with a built-in CDN.',
    steps: [
      'In DigitalOcean, create a Space and set File Listing to restricted; enable the CDN if you want faster links.',
      'Under API → Spaces Keys, generate a key pair.',
      'Copy the Space name, its endpoint (for example https://blr1.digitaloceanspaces.com) and the keys.',
    ],
    providerLabel: 'Open DigitalOcean Spaces',
    providerUrl: 'https://cloud.digitalocean.com/spaces',
    fields: [
      text('bucket', 'Space name', { placeholder: 'social-media' }),
      text('endpointUrl', 'Endpoint URL', { type: 'url', placeholder: 'https://blr1.digitaloceanspaces.com' }),
      ...S3_KEY_FIELDS,
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'other',
    label: 'Other / S3-compatible storage',
    summary: 'MinIO, Contabo, Hetzner, or any other S3-compatible service.',
    steps: [
      'Create a bucket with your provider and allow public reads for the files you want to serve.',
      'Create an access key pair that can read, write and delete in that bucket.',
      'Copy the provider’s S3 endpoint URL, the bucket and the keys here.',
    ],
    fields: [
      text('bucket', 'Bucket name', { placeholder: 'social-media' }),
      text('endpointUrl', 'Endpoint URL', { type: 'url', placeholder: 'https://s3.example.com' }),
      text('region', 'Region (optional)', { required: false, placeholder: 'us-east-1' }),
      ...S3_KEY_FIELDS,
      PUBLIC_URL_FIELD,
    ],
  },
  {
    key: 'drive',
    label: 'Google Drive',
    summary: 'Keep a copy of your media in your own Drive folder.',
    caution:
      'Google Drive is built for sharing files with people, not for serving images to websites. Google may slow or block links that get many requests, so Instagram or an email can fail to load a picture from Drive. It works well for keeping a library and backup; for images that go out in posts and emails, Cloudflare R2, Backblaze B2 or your own server is more reliable.',
    steps: [
      'Open Google Cloud Console, create a project and enable the Google Drive API.',
      'Configure the OAuth consent screen, then create an OAuth client ID (type: Web application).',
      'Authorize your Google account with the drive.file scope to get a refresh token.',
      'Create a folder in Drive, share it as “Anyone with the link can view”, and copy the folder ID from its address (…/folders/<folder-id>).',
    ],
    providerLabel: 'Open Google Cloud Console',
    providerUrl: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    fields: [
      text('clientId', 'Client ID', { placeholder: 'ends with .apps.googleusercontent.com' }),
      secret('clientSecret', 'Client Secret', { placeholder: 'From the OAuth client' }),
      secret('refreshToken', 'Refresh token', { placeholder: 'Scope: drive.file', wide: true }),
      text('folderId', 'Folder ID (optional)', {
        required: false,
        placeholder: 'e.g. 1AbCdEfGhIjKlMnOpQrStUvWxYz',
        hint: 'Leave blank to save into the top level of My Drive.',
        wide: true,
      }),
    ],
  },
];

export function getStorageProvider(key) {
  return STORAGE_PROVIDERS.find((provider) => provider.key === key) || null;
}

export const STORAGE_LIMIT_UNITS = ['MB', 'GB', 'TB'];
