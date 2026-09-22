import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { PLATFORM_KEYS, PROVIDERS } from '../providers/index.js';
import { ProviderError } from '../providers/errors.js';
import { listPinterestBoards } from '../providers/others.js';
import { recordFollowerSnapshot } from './analyticsService.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';
import { HttpError, badRequest, conflict } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';
import { notifyRoles } from './notificationService.js';

const MAX_VALUE_LENGTH = 4096;
// Everything the background pass retries — every status except 'disconnected'. A broken account is
// retried too (the same saved credentials may simply work again later: the platform's own outage
// ended, a temporary lock lifted...), so it can recover on its own instead of waiting for "Sync now".
// 'disconnected' is deliberately excluded — and its credentials are cleared to NULL anyway (see
// recheckAll()'s own query below), so it could never be auto-reconnected even if it were included here.
const CHECKABLE = ['connected', 'token_expired', 'revoked', 'auth_error', 'error'];

/** What the web app sees. Credentials never leave the server — not even encrypted. */
function present(platform, row) {
  return {
    id: platform,
    platform,
    accountName: row?.account_name || PROVIDERS[platform].label,
    handle: row?.handle || '',
    status: row?.status ?? 'disconnected',
    followers: row?.followers ?? 0,
    apiTier: row?.api_tier ?? 'free',
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSuccessAt: row?.last_success_at ?? null,
    lastCheckedAt: row?.last_checked_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

/** Every supported platform, connected or not, in the same order as the web app's connect list. */
export async function listAccounts() {
  const result = await query('SELECT * FROM social_accounts');
  const byPlatform = new Map(result.rows.map((row) => [row.platform, row]));
  return PLATFORM_KEYS.map((platform) => present(platform, byPlatform.get(platform)));
}

async function getRow(platform) {
  return (await query('SELECT * FROM social_accounts WHERE platform = $1', [platform])).rows[0] ?? null;
}

export async function getAccount(platform) {
  return present(platform, await getRow(platform));
}

/** Keeps only the fields this platform needs, trimmed, and says which one is missing. */
export function cleanCredentials(platform, input) {
  const clean = {};
  for (const field of PROVIDERS[platform].fields) {
    const value = typeof input?.[field] === 'string' ? input[field].trim() : '';
    if (!value) throw badRequest(`${field} is required`, [{ field, message: 'This is required' }]);
    if (value.length > MAX_VALUE_LENGTH) throw badRequest(`${field} is too long`, [{ field, message: 'Too long' }]);
    clean[field] = value;
  }
  return clean;
}

/** A platform's own error text can echo what we sent; make sure a secret never travels back in a message. */
export function redact(message, credentials) {
  let text = message;
  for (const value of Object.values(credentials || {})) {
    if (typeof value === 'string' && value.length >= 6) text = text.split(value).join('***');
  }
  return text;
}

const cleanCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

/** Asks the platform. Never throws: the answer is { ok: true, profile } or { ok: false, kind, message }. */
async function verify(platform, credentials) {
  try {
    const profile = await PROVIDERS[platform].verify(credentials);
    return {
      ok: true,
      profile: {
        externalId: profile.externalId ? String(profile.externalId).slice(0, 200) : null,
        accountName: String(profile.accountName || PROVIDERS[platform].label).slice(0, 200),
        handle: String(profile.handle || '').slice(0, 200),
        followers: cleanCount(profile.followers),
      },
    };
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, kind: error.kind, reason: error.reason, message: redact(error.message, credentials) };
    // A platform answering in a shape we did not expect must not become a crash.
    logger.error('Unexpected error while checking a social account', error, { platform });
    return { ok: false, kind: 'rejected', message: `${PROVIDERS[platform].label} sent an answer Social could not understand. Try again, and tell support if it keeps happening.` };
  }
}

/** "Test connection": checks the credentials without saving anything. */
export async function testCredentials(platform, input) {
  const credentials = cleanCredentials(platform, input);
  const result = await verify(platform, credentials);
  return result.ok
    ? { ok: true, message: `Connected to ${result.profile.accountName} successfully.`, profile: result.profile }
    : { ok: false, message: result.message };
}

/**
 * "Save & connect". The server checks the credentials itself — it never trusts the browser's "test passed" —
 * and stores them encrypted only if the platform accepts them.
 */
export async function connectAccount({ platform, input, apiTier = 'free', actor, ip, userAgent }) {
  const credentials = cleanCredentials(platform, input);
  const result = await verify(platform, credentials);
  if (!result.ok) throw new HttpError(422, 'connection_failed', result.message, { kind: result.kind });

  const tier = PROVIDERS[platform].paidTier && apiTier === 'paid' ? 'paid' : 'free';
  const { profile } = result;
  const saved = await query(
    `INSERT INTO social_accounts
       (platform, status, account_name, handle, external_id, followers, api_tier, credentials, last_error, last_synced_at, last_checked_at, last_success_at, connected_by)
     VALUES ($1, 'connected', $2, $3, $4, $5, $6, $7, NULL, now(), now(), now(), $8)
     ON CONFLICT (platform) DO UPDATE SET
       status = 'connected', account_name = EXCLUDED.account_name, handle = EXCLUDED.handle, external_id = EXCLUDED.external_id,
       followers = EXCLUDED.followers, api_tier = EXCLUDED.api_tier, credentials = EXCLUDED.credentials, last_error = NULL,
       last_synced_at = now(), last_checked_at = now(), last_success_at = now(), connected_by = EXCLUDED.connected_by, updated_at = now()
     RETURNING *`,
    [platform, profile.accountName, profile.handle, profile.externalId, profile.followers ?? 0, tier, encryptJson(credentials), actor.id]
  );
  await recordActivity({ actorId: actor.id, action: 'social.connected', entity: 'social_account', entityId: platform, meta: { accountName: profile.accountName }, ip, userAgent });
  if (Number.isFinite(profile.followers)) await recordFollowerSnapshot(platform, profile.followers);
  return present(platform, saved.rows[0]);
}

/** Forgets the credentials. Safe to repeat. */
export async function disconnectAccount({ platform, actor, ip, userAgent }) {
  const result = await query(
    `UPDATE social_accounts
        SET status = 'disconnected', credentials = NULL, followers = 0, last_error = NULL, updated_at = now()
      WHERE platform = $1 RETURNING *`,
    [platform]
  );
  if (result.rows[0]) await recordActivity({ actorId: actor.id, action: 'social.disconnected', entity: 'social_account', entityId: platform, ip, userAgent });
  return present(platform, result.rows[0] ?? null);
}

// Statuses a health check can produce when the platform actively refuses the saved credentials — never
// 'disconnected', which is only ever set by disconnectAccount() in response to the user's own click.
const AUTH_PROBLEM_STATUSES = new Set(['token_expired', 'revoked', 'auth_error']);

/**
 * Asks the platform again using the saved credentials ("Sync now", and the background check). This never
 * sets 'disconnected' — that status exists only for disconnectAccount(), below. What it can set:
 *   connected     the platform confirmed the credentials still work
 *   token_expired the platform's own error text said "expired" (a natural, expected event)
 *   revoked       the platform's own error text said "revoked"
 *   auth_error    the platform refused the credentials for some other/unclear reason (most 401s land
 *                 here — Google's invalid_grant and Meta's error 190 both cover "expired or revoked"
 *                 without saying which, so guessing between the two would just be a coin flip)
 *   error         the platform answered but the request cannot work (wrong id, no channel...), or this
 *                 server's own encryption key changed and the saved credentials can no longer be read
 * A platform that is merely slow, rate-limiting, erroring (5xx) or unreachable changes none of this —
 * `status` is left exactly as it was, only `last_checked_at`/`last_error` move, so a short outage (or a
 * platform's own bad day) can never flip an account away from "connected", and can never flip it back
 * from a real problem either (a broken account stays exactly as broken as it was, not "connected", if
 * this particular check merely timed out).
 *
 * The background pass (see CHECKABLE, above) retries a broken account the same way "Sync now" would —
 * if the platform accepts the very same saved credentials again, it silently recovers to 'connected' on
 * its own. Activity is logged on every status change (recovery included), but a notification only fires
 * when the status actually changes — staying broken the same way on the next pass, 6 hours later, never
 * re-sends the same notification.
 */
export async function recheckAccount(platform, { actor = null, ip = null, userAgent = null } = {}) {
  const row = await getRow(platform);
  if (!row || !row.credentials || row.status === 'disconnected') throw conflict('This account is not connected.');

  let next;
  const credentials = decryptJson(row.credentials);
  if (!credentials) {
    next = { status: 'error', message: 'The saved credentials can no longer be read (the server key changed). Connect the account again.' };
  } else {
    const result = await verify(platform, credentials);
    if (result.ok) next = { status: 'connected', profile: result.profile };
    else if (result.kind === 'auth') next = { status: result.reason, message: result.message };
    else if (result.kind === 'rejected') next = { status: 'error', message: result.message };
    else next = { status: row.status, message: result.message }; // unreachable (network/timeout/429/5xx): status untouched
  }

  const profile = next.profile;
  const updated = await query(
    `UPDATE social_accounts
        SET status = $2, last_error = $3, last_checked_at = now(),
            account_name = COALESCE($4, account_name), handle = COALESCE($5, handle),
            followers = COALESCE($6, followers),
            last_synced_at = CASE WHEN $4::text IS NULL THEN last_synced_at ELSE now() END,
            last_success_at = CASE WHEN $2 = 'connected' THEN now() ELSE last_success_at END,
            updated_at = now()
      WHERE platform = $1 RETURNING *`,
    [platform, next.status, next.message ?? null, profile?.accountName ?? null, profile?.handle ?? null, profile?.followers ?? null]
  );
  if (row.status !== next.status) {
    await recordActivity({ actorId: actor?.id ?? null, action: `social.${next.status}`, entity: 'social_account', entityId: platform, meta: { message: next.message }, ip, userAgent });
    if (AUTH_PROBLEM_STATUSES.has(next.status) || next.status === 'error') {
      const accountName = PROVIDERS[platform].label;
      const byStatus = {
        token_expired: { type: 'tokenExpired', title: 'Token expired', message: `Your ${accountName} connection has expired. Reconnect it in Social Accounts.` },
        revoked: { type: 'accountRevoked', title: 'Access revoked', message: `Access to ${accountName} was revoked. Reconnect it in Social Accounts.` },
        auth_error: { type: 'accountNeedsAttention', title: 'Account needs attention', message: `${accountName}: ${next.message || 'the platform refused the saved credentials.'}` },
        error: { type: 'accountNeedsAttention', title: 'Account needs attention', message: `${accountName}: ${next.message || 'reconnect it in Social Accounts.'}` },
      }[next.status];
      await notifyRoles(['superAdmin', 'admin'], { ...byStatus, entityType: 'socialAccount', entityId: platform });
    }
  }
  if (Number.isFinite(profile?.followers)) await recordFollowerSnapshot(platform, profile.followers);
  return present(platform, updated.rows[0]);
}

/** For the publishing code: the decrypted credentials of a connected platform, or null. */
export async function getCredentials(platform) {
  const row = await getRow(platform);
  return row?.status === 'connected' && row.credentials ? decryptJson(row.credentials) : null;
}

/** Everything the publisher needs for one platform, or null when it is not connected (or the keys cannot be read). */
export async function getPublishingContext(platform) {
  const row = await getRow(platform);
  if (row?.status !== 'connected' || !row.credentials) return null;
  const credentials = decryptJson(row.credentials);
  return credentials ? { credentials, account: { externalId: row.external_id, handle: row.handle } } : null;
}

/** The Pinterest account's own boards, for the composer's board picker. Empty (not an error) if not connected. */
export async function getPinterestBoards() {
  const credentials = await getCredentials('pinterest');
  if (!credentials) return [];
  try {
    return await listPinterestBoards(credentials);
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(422, 'connection_failed', redact(error.message, credentials));
    throw error;
  }
}

/** Which of these platforms are connected right now. */
export async function connectedPlatforms(platforms) {
  const result = await query("SELECT platform FROM social_accounts WHERE status = 'connected' AND platform = ANY($1)", [platforms]);
  return new Set(result.rows.map((row) => row.platform));
}

// ---------------------------------------------------------------- background check
let checking = false;

/** One pass over every account that should be working. One slow or broken platform never stops the rest. */
export async function recheckAll() {
  if (checking) return;
  checking = true;
  try {
    const rows = (await query('SELECT platform FROM social_accounts WHERE status = ANY($1) AND credentials IS NOT NULL ORDER BY platform', [CHECKABLE])).rows;
    for (const { platform } of rows) {
      try {
        await recheckAccount(platform);
      } catch (error) {
        logger.error('Background check of a social account failed', error, { platform });
      }
    }
  } finally {
    checking = false;
  }
}

/** Returns a function that stops it. Switched off with SOCIAL_CHECK_INTERVAL_MIN=0. */
export function startSocialAccountChecker() {
  if (!config.social.checkIntervalMs) return () => {};
  const timer = setInterval(() => {
    recheckAll().catch((error) => logger.error('Social account check pass failed', error));
  }, config.social.checkIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
