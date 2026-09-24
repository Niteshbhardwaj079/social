import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';
import { badRequest } from '../utils/httpError.js';
import { recordActivity } from './auditService.js';

const maskSecret = (value) => `••••${String(value).slice(-4)}`;
const TRANSPORT_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

async function getRow() {
  return (await query('SELECT * FROM email_settings WHERE id = true')).rows[0];
}

/** What the web app sees: never the password, only a masked hint of it (last 4 characters). */
function present(row) {
  return {
    configured: Boolean(row.host),
    host: row.host || '',
    port: row.port || 587,
    secure: row.secure,
    username: row.username || '',
    fromEmail: row.from_email || '',
    fromName: row.from_name || '',
    passwordHint: row.secret_hint || '',
    connectedAt: row.connected_at,
    lastTestedAt: row.last_tested_at,
    lastTestMessage: row.last_test_message,
  };
}

export async function getSettings() {
  return present(await getRow());
}

/** A saved password may be left blank — kept from what's already stored, same as Storage's providers. */
function cleanInput(input, { hasSavedPassword }) {
  const host = String(input?.host || '').trim();
  const port = Number(input?.port);
  const username = String(input?.username || '').trim();
  const fromEmail = String(input?.fromEmail || '').trim();
  const fromName = String(input?.fromName || '').trim();
  const password = typeof input?.password === 'string' ? input.password.trim() : '';

  if (!host) throw badRequest('Host is required', [{ field: 'host', message: 'This is required' }]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw badRequest('Enter a valid port', [{ field: 'port', message: 'Enter a valid port' }]);
  if (!fromEmail) throw badRequest('From email is required', [{ field: 'fromEmail', message: 'This is required' }]);
  if (!password && !hasSavedPassword) throw badRequest('Password is required', [{ field: 'password', message: 'This is required' }]);

  return { host, port, secure: Boolean(input?.secure), username, fromEmail, fromName, password };
}

async function withSavedPassword(values) {
  if (values.password) return values;
  const row = await getRow();
  if (!row.credentials) return values;
  const saved = decryptJson(row.credentials);
  return saved?.password ? { ...values, password: saved.password } : values;
}

function buildTransport(values) {
  return nodemailer.createTransport({
    host: values.host,
    port: values.port,
    secure: values.secure,
    auth: values.username ? { user: values.username, pass: values.password } : undefined,
    ...TRANSPORT_TIMEOUTS,
  });
}

async function verify(values) {
  const transport = buildTransport(values);
  try {
    await transport.verify();
    return { ok: true, message: 'Connected — the mail server accepted the login.' };
  } catch (error) {
    return { ok: false, message: String(error?.message || error).slice(0, 300) };
  } finally {
    transport.close();
  }
}

export async function testSettings(input) {
  const row = await getRow();
  const values = await withSavedPassword(cleanInput(input, { hasSavedPassword: Boolean(row.credentials) }));
  return verify(values);
}

export async function saveSettings({ input, actor, ip, userAgent }) {
  const row = await getRow();
  const values = await withSavedPassword(cleanInput(input, { hasSavedPassword: Boolean(row.credentials) }));
  const result = await verify(values);
  if (!result.ok) throw badRequest(result.message);

  const updated = await query(
    `UPDATE email_settings SET
        host = $1, port = $2, secure = $3, username = $4, from_email = $5, from_name = $6,
        credentials = $7, secret_hint = $8,
        connected_at = COALESCE(connected_at, now()), last_tested_at = now(), last_test_message = $9, updated_at = now()
      WHERE id = true RETURNING *`,
    [values.host, values.port, values.secure, values.username || null, values.fromEmail, values.fromName || null, encryptJson({ password: values.password }), maskSecret(values.password), result.message]
  );
  invalidateTransportCache();
  await recordActivity({ actorId: actor.id, action: 'email_settings.connected', entity: 'email_settings', ip, userAgent });
  return present(updated.rows[0]);
}

export async function disconnectSettings({ actor, ip, userAgent }) {
  const updated = await query(
    `UPDATE email_settings SET host = NULL, port = NULL, secure = false, username = NULL, from_email = NULL, from_name = NULL,
        credentials = NULL, secret_hint = NULL, connected_at = NULL, last_tested_at = NULL, last_test_message = NULL, updated_at = now()
      WHERE id = true RETURNING *`
  );
  invalidateTransportCache();
  await recordActivity({ actorId: actor.id, action: 'email_settings.disconnected', entity: 'email_settings', ip, userAgent });
  return present(updated.rows[0]);
}

// ---------------------------------------------------------------------------------------------
// Used by mailer.js. Prefers the client's own settings from the database; falls back to the
// SMTP_* environment variables so a deployment that never opens this UI keeps working exactly as
// before. Cached in memory (rebuilding a transport per email would be wasteful) and invalidated
// on every save/disconnect above, so a change here takes effect on the very next email.
let cachedTransport;

export function invalidateTransportCache() {
  cachedTransport = undefined;
}

export async function resolveTransport() {
  if (cachedTransport !== undefined) return cachedTransport;

  const row = await getRow();
  const saved = row.host && row.credentials ? decryptJson(row.credentials) : null;
  if (saved?.password) {
    cachedTransport = {
      transport: buildTransport({ host: row.host, port: row.port, secure: row.secure, username: row.username, password: saved.password }),
      mailFrom: row.from_name ? `${row.from_name} <${row.from_email}>` : row.from_email,
    };
    return cachedTransport;
  }

  cachedTransport = config.smtp
    ? { transport: buildTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, username: config.smtp.user, password: config.smtp.pass }), mailFrom: config.mailFrom }
    : null;
  return cachedTransport;
}
