import * as s3 from './s3.js';
import * as drive from './drive.js';
import * as local from './local.js';
export { StorageError } from './errors.js';

const S3_COMPATIBLE = new Set(['s3', 'r2', 'b2', 'wasabi', 'spaces', 'other']);

/**
 * One interface over every place a file can live:
 *   { kind: 'server' }                       — this server's own disk
 *   { kind: 'external', provider }           — the connected S3-compatible bucket or Google Drive
 * `provider` is { key, values } — `values` holds every field the provider needs (from storageService, decrypted).
 */
function moduleFor(target) {
  if (target.kind === 'server') return local;
  if (S3_COMPATIBLE.has(target.provider.key)) return s3;
  if (target.provider.key === 'drive') return drive;
  throw new Error(`Unknown storage provider: ${target.provider.key}`);
}

const args = (target, rest) => (target.kind === 'server' ? rest : [target.provider, ...rest]);

export const putObject = (target, key, body, contentType) => moduleFor(target).putObject(...args(target, [key, body, contentType]));
export const getObjectBytes = (target, key) => moduleFor(target).getObjectBytes(...args(target, [key]));
export const deleteObject = (target, key) => moduleFor(target).deleteObject(...args(target, [key]));
export const testConnection = (target) => moduleFor(target).testConnection(...args(target, []));
export const publicUrlFor = (target, key) => moduleFor(target).publicUrlFor(...args(target, [key]));
