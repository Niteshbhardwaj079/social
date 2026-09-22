import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import * as storage from '../storage/index.js';
import { StorageError } from '../storage/index.js';
import { STORAGE_PROVIDERS } from '../storage/providers.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';
import { badRequest, conflict } from '../utils/httpError.js';
import { recordActivity } from './auditService.js';

const MAX_VALUE_LENGTH = 4096;
const maskSecret = (value) => `••••${String(value).slice(-4)}`;

async function getRow() {
  return (await query('SELECT * FROM storage_settings WHERE id = true')).rows[0];
}

/** What the web app sees: never a secret, only a masked hint of it (last 4 characters) — same shape it already expects. */
function present(row) {
  return {
    provider: row.provider_key
      ? {
          providerKey: row.provider_key,
          values: row.provider_values,
          secretHints: row.secret_hints,
          connectedAt: row.connected_at,
          lastTestedAt: row.last_tested_at,
          lastTestMessage: row.last_test_message,
        }
      : null,
    preferences: {
      serverEnabled: row.server_enabled,
      externalEnabled: row.external_enabled,
      limitValue: row.limit_value === null ? '' : Number(row.limit_value),
      limitUnit: row.limit_unit,
    },
  };
}

const UNIT_BYTES = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
const limitBytesOf = (row) => (row.limit_value ? Number(row.limit_value) * UNIT_BYTES[row.limit_unit] : null);

export async function getSettings() {
  return present(await getRow());
}

/** Keeps only the fields this provider needs, trimmed, and says which one is missing — a saved secret may be left blank. */
function cleanValues(providerKey, input, { hasSaved }) {
  const clean = {};
  for (const field of STORAGE_PROVIDERS[providerKey].fields) {
    const raw = typeof input?.[field.key] === 'string' ? input[field.key].trim() : '';
    if (!raw) {
      if (!field.required) continue;
      if (field.secret && hasSaved) continue; // kept from the saved value, filled in below
      throw badRequest(`${field.key} is required`, [{ field: field.key, message: 'This is required' }]);
    }
    if (raw.length > MAX_VALUE_LENGTH) throw badRequest(`${field.key} is too long`, [{ field: field.key, message: 'Too long' }]);
    clean[field.key] = raw;
  }
  return clean;
}

/** Splits a provider's field values into the public part (shown back as-is) and the secret hints (masked). */
function splitForDisplay(providerKey, values) {
  const publicValues = {};
  const secretHints = {};
  for (const field of STORAGE_PROVIDERS[providerKey].fields) {
    if (field.secret) secretHints[field.key] = values[field.key] ? maskSecret(values[field.key]) : '';
    else publicValues[field.key] = values[field.key] ?? '';
  }
  return { publicValues, secretHints };
}

/** Fills in any blank secret fields from what is already saved for this same provider, so re-testing does not need them retyped. */
async function withSavedSecrets(providerKey, values) {
  const row = await getRow();
  if (row.provider_key !== providerKey || !row.credentials) return values;
  const saved = decryptJson(row.credentials);
  if (!saved) return values;
  const filled = { ...values };
  for (const field of STORAGE_PROVIDERS[providerKey].fields) {
    if (field.secret && !filled[field.key] && saved[field.key]) filled[field.key] = saved[field.key];
  }
  return filled;
}

/** Writes a tiny file, fetches it back over plain HTTP from its public URL, then deletes it — proves public access actually works, not just the credentials. */
async function testPublicUpload(target) {
  const key = `social-connection-test-${crypto.randomBytes(6).toString('hex')}.png`;
  const body = Buffer.from('social-test');
  await storage.putObject(target, key, body, 'text/plain');
  const url = storage.publicUrlFor(target, key);
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(config.social.providerTimeoutMs) }).catch(() => null);
    if (!response?.ok) {
      throw new StorageError(
        `The file uploaded, but its public link did not open (${response ? response.status : 'could not connect'}). Make sure the bucket allows public reads, or set Public URL to where your CDN serves it from.`
      );
    }
    return `Test file uploaded and opened from its public link: ${url}`;
  } finally {
    await storage.deleteObject(target, key).catch(() => {});
  }
}

async function verify(providerKey, values, kind) {
  const target = { kind: 'external', provider: { key: providerKey, values } };
  try {
    if (kind === 'upload') return { ok: true, message: await testPublicUpload(target) };
    await storage.testConnection(target);
    return { ok: true, message: 'Connection works — the app could write, read and delete a small test file.' };
  } catch (error) {
    if (error instanceof StorageError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function testProvider(providerKey, input, kind = 'connection') {
  const row = await getRow();
  const values = await withSavedSecrets(providerKey, cleanValues(providerKey, input, { hasSaved: row.provider_key === providerKey }));
  return verify(providerKey, values, kind);
}

export async function saveProvider({ providerKey, input, actor, ip, userAgent }) {
  const row = await getRow();
  const values = await withSavedSecrets(providerKey, cleanValues(providerKey, input, { hasSaved: row.provider_key === providerKey }));
  const result = await verify(providerKey, values, 'connection');
  if (!result.ok) throw badRequest(result.message);

  const { publicValues, secretHints } = splitForDisplay(providerKey, values);
  const keepConnectedAt = row.provider_key === providerKey ? row.connected_at : null;
  const updated = await query(
    `UPDATE storage_settings SET
        provider_key = $1, provider_values = $2, secret_hints = $3, credentials = $4,
        connected_at = COALESCE($5, now()), last_tested_at = now(), last_test_message = $6, updated_at = now()
      WHERE id = true RETURNING *`,
    [providerKey, JSON.stringify(publicValues), JSON.stringify(secretHints), encryptJson(values), keepConnectedAt, result.message]
  );
  await recordActivity({ actorId: actor.id, action: 'storage.connected', entity: 'storage', entityId: providerKey, ip, userAgent });
  return present(updated.rows[0]);
}

/** Leaves already-uploaded files exactly where they are — this only stops new uploads from going there. */
export async function disconnectProvider({ actor, ip, userAgent }) {
  const updated = await query(
    `UPDATE storage_settings SET provider_key = NULL, provider_values = '{}', secret_hints = '{}', credentials = NULL,
        connected_at = NULL, external_enabled = false, updated_at = now()
      WHERE id = true RETURNING *`
  );
  await recordActivity({ actorId: actor.id, action: 'storage.disconnected', entity: 'storage', ip, userAgent });
  return present(updated.rows[0]);
}

export async function savePreferences({ serverEnabled, externalEnabled, limitValue, limitUnit, actor, ip, userAgent }) {
  const row = await getRow();
  if (externalEnabled && !row.provider_key) throw badRequest('Connect a storage provider before turning External storage on.');
  const updated = await query(
    'UPDATE storage_settings SET server_enabled = $1, external_enabled = $2, limit_value = $3, limit_unit = $4, updated_at = now() WHERE id = true RETURNING *',
    [serverEnabled, externalEnabled, limitValue || null, limitUnit || 'GB']
  );
  await recordActivity({ actorId: actor.id, action: 'storage.preferences_updated', entity: 'storage', ip, userAgent });
  return present(updated.rows[0]);
}

/** Where the next upload should go: the connected external provider if it is on, else the server, else refused. */
export async function resolveUploadTarget() {
  const row = await getRow();
  if (row.external_enabled && row.provider_key) {
    const credentials = decryptJson(row.credentials);
    if (!credentials) throw conflict('The saved storage keys can no longer be read (the server key changed). Reconnect storage in Settings.');
    return { allowed: true, storage: 'external', label: STORAGE_PROVIDERS[row.provider_key].label, target: { kind: 'external', provider: { key: row.provider_key, values: credentials } } };
  }
  if (row.server_enabled) return { allowed: true, storage: 'server', label: 'Server', target: { kind: 'server' } };
  return { allowed: false, reason: 'Turn on Server storage or External storage under Settings → Storage, then try again.' };
}

/** For reading back an existing file (publishing an image, re-cropping it): which target it actually lives in. */
export async function targetForMedia(mediaRow) {
  if (mediaRow.storage === 'server') return { kind: 'server' };
  const row = await getRow();
  if (row.provider_key !== null && mediaRow.storage === 'external') {
    const credentials = decryptJson(row.credentials);
    if (credentials) return { kind: 'external', provider: { key: row.provider_key, values: credentials } };
  }
  throw conflict('This file’s storage is no longer connected, so it cannot be read.');
}

export async function currentLimitBytes() {
  return limitBytesOf(await getRow());
}
