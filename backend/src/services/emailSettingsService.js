import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';
import { badRequest } from '../utils/httpError.js';
import { recordActivity } from './auditService.js';
import * as email from '../email/index.js';
import { EMAIL_PROVIDERS } from '../email/providers.js';

const MAX_VALUE_LENGTH = 4096;
const maskSecret = (value) => `••••${String(value).slice(-4)}`;
// email.testConnection() itself is not necessarily bounded (a real SMTP handshake or a hung fetch
// has no built-in ceiling), so this hard deadline guarantees the frontend's own request timeout
// always gets a clear answer instead of a generic network error.
const VERIFY_TIMEOUT_MS = 20_000;

async function getRow() {
  return (await query('SELECT * FROM email_settings WHERE id = true')).rows[0];
}

/** What the web app sees: never a secret, only a masked hint of it (last 4 characters). */
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
  };
}

export async function getSettings() {
  return present(await getRow());
}

/** Keeps only the fields this provider needs, coercing `port`/`secure` (SMTP-only) to their real types. */
function cleanValues(providerKey, input, { hasSaved }) {
  const clean = {};
  for (const field of EMAIL_PROVIDERS[providerKey].fields) {
    if (field.key === 'port') {
      const port = Number(input?.port ?? 587);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw badRequest('Enter a valid port', [{ field: 'port', message: 'Enter a valid port' }]);
      clean.port = port;
      continue;
    }
    if (field.key === 'secure') {
      clean.secure = Boolean(input?.secure);
      continue;
    }
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
  for (const field of EMAIL_PROVIDERS[providerKey].fields) {
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
  for (const field of EMAIL_PROVIDERS[providerKey].fields) {
    if (field.secret && !filled[field.key] && saved[field.key]) filled[field.key] = saved[field.key];
  }
  return filled;
}

async function verify(providerKey, values) {
  try {
    await Promise.race([
      email.testConnection({ key: providerKey, values }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${VERIFY_TIMEOUT_MS / 1000} seconds. Check the details and try again.`)), VERIFY_TIMEOUT_MS)
      ),
    ]);
    return { ok: true, message: 'Connected — the details were accepted.' };
  } catch (error) {
    if (error instanceof email.EmailProviderError) return { ok: false, message: error.message };
    return { ok: false, message: String(error?.message || error).slice(0, 300) };
  }
}

export async function testProvider(providerKey, input) {
  const row = await getRow();
  const values = await withSavedSecrets(providerKey, cleanValues(providerKey, input, { hasSaved: row.provider_key === providerKey }));
  return verify(providerKey, values);
}

export async function saveProvider({ providerKey, input, actor, ip, userAgent }) {
  const row = await getRow();
  const values = await withSavedSecrets(providerKey, cleanValues(providerKey, input, { hasSaved: row.provider_key === providerKey }));
  const result = await verify(providerKey, values);
  if (!result.ok) throw badRequest(result.message);

  const { publicValues, secretHints } = splitForDisplay(providerKey, values);
  const keepConnectedAt = row.provider_key === providerKey ? row.connected_at : null;
  const updated = await query(
    `UPDATE email_settings SET
        provider_key = $1, provider_values = $2, secret_hints = $3, credentials = $4,
        connected_at = COALESCE($5, now()), last_tested_at = now(), last_test_message = $6, updated_at = now()
      WHERE id = true RETURNING *`,
    [providerKey, JSON.stringify(publicValues), JSON.stringify(secretHints), encryptJson(values), keepConnectedAt, result.message]
  );
  invalidateProviderCache();
  await recordActivity({ actorId: actor.id, action: 'email_settings.connected', entity: 'email_settings', entityId: providerKey, ip, userAgent });
  return present(updated.rows[0]);
}

export async function disconnectProvider({ actor, ip, userAgent }) {
  const updated = await query(
    `UPDATE email_settings SET provider_key = NULL, provider_values = '{}', secret_hints = '{}', credentials = NULL,
        connected_at = NULL, last_tested_at = NULL, last_test_message = NULL, updated_at = now()
      WHERE id = true RETURNING *`
  );
  invalidateProviderCache();
  await recordActivity({ actorId: actor.id, action: 'email_settings.disconnected', entity: 'email_settings', ip, userAgent });
  return present(updated.rows[0]);
}

/** "Name <email>" -> { email, name } for the env-var fallback below (MAIL_FROM is one combined string). */
function parseMailFrom(raw) {
  const match = /^(.*)<(.+)>$/.exec(String(raw || '').trim());
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: '', email: String(raw || '').trim() };
}

// ---------------------------------------------------------------------------------------------
// Used by mailer.js. Prefers the client's own settings from the database; falls back to the
// SMTP_* environment variables so a deployment that never opens this UI keeps working exactly as
// before. Cached in memory (no need to hit the database on every single email) and invalidated on
// every save/disconnect above, so a change here takes effect on the very next email.
let cachedProvider;

export function invalidateProviderCache() {
  cachedProvider = undefined;
}

export async function resolveProvider() {
  if (cachedProvider !== undefined) return cachedProvider;

  const row = await getRow();
  const saved = row.provider_key && row.credentials ? decryptJson(row.credentials) : null;
  if (saved) {
    cachedProvider = { key: row.provider_key, values: saved };
    return cachedProvider;
  }

  if (config.smtp) {
    const { name, email: fromEmail } = parseMailFrom(config.mailFrom);
    cachedProvider = { key: 'smtp', values: { host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, username: config.smtp.user, password: config.smtp.pass, fromEmail, fromName: name } };
    return cachedProvider;
  }

  cachedProvider = null;
  return cachedProvider;
}
