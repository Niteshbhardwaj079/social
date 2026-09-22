/**
 * Server-side mirror of the web app's `src/config/storageProviders.js` — which fields each provider needs,
 * and which of those are secret. Keep the two in step when a provider's fields change.
 */
const field = (key, { secret = false, required = true } = {}) => ({ key, secret, required });

export const STORAGE_PROVIDERS = {
  s3: { label: 'Amazon S3', fields: [field('bucket'), field('region'), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })] },
  r2: { label: 'Cloudflare R2', fields: [field('bucket'), field('endpointUrl'), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })] },
  b2: { label: 'Backblaze B2', fields: [field('bucket'), field('endpointUrl'), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })] },
  wasabi: { label: 'Wasabi', fields: [field('bucket'), field('endpointUrl'), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })] },
  spaces: { label: 'DigitalOcean Spaces', fields: [field('bucket'), field('endpointUrl'), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })] },
  other: {
    label: 'Other / S3-compatible storage',
    fields: [field('bucket'), field('endpointUrl'), field('region', { required: false }), field('accessKeyId'), field('secretAccessKey', { secret: true }), field('publicBaseUrl', { required: false })],
  },
  drive: {
    label: 'Google Drive',
    fields: [field('clientId'), field('clientSecret', { secret: true }), field('refreshToken', { secret: true }), field('folderId', { required: false })],
  },
};

export const STORAGE_PROVIDER_KEYS = Object.keys(STORAGE_PROVIDERS);
export const isStorageProvider = (key) => Object.hasOwn(STORAGE_PROVIDERS, key);
export const STORAGE_LIMIT_UNITS = ['MB', 'GB', 'TB'];
