import { config } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { formatDateTime, formatDuration } from '../emails/builder.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwordService.js';
import {
  consumeStoredToken,
  createRefreshToken,
  createStoredToken,
  invalidateStoredTokens,
  listActiveRefreshTokens,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  revokeRefreshTokenById,
  rotateRefreshToken,
  signAccessToken,
} from './tokenService.js';
import { effectiveLanguage, getLanguageSettings, saveWorkspace } from './settingsService.js';
import { dispatchEmail } from './systemEmailService.js';
import { recordActivity } from './auditService.js';
import { toApiUser } from './userService.js';
import { badRequest, forbidden, notFound, tooManyRequests, unauthorized } from '../utils/httpError.js';
import { describeDevice } from '../utils/device.js';
import { hashToken } from '../utils/security.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MS = 60 * 60 * 1000;

const PUBLIC_COLUMNS = 'id, name, email, role, status, language, avatar_url, last_active_at, created_at';
const INVALID_LOGIN = 'Invalid email or password';

async function startSession(userId, meta) {
  const [refreshToken, row] = await Promise.all([
    createRefreshToken(userId, meta),
    query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [userId]),
  ]);
  return { user: toApiUser(row.rows[0]), accessToken: signAccessToken(userId), refreshToken };
}

/** What the sign-in screens need before anyone is signed in. */
export async function getPublicConfig() {
  const [count, languages] = await Promise.all([query('SELECT count(*) AS n FROM users'), getLanguageSettings()]);
  return { setupRequired: count.rows[0].n === 0, languages, brand: { appName: config.brand.appName } };
}

/**
 * First-run setup: creates the workspace owner (a Super Admin). This is a single-tenant app —
 * once someone exists, everyone else is invited, so registration closes itself.
 */
export async function registerFirstUser({ name, email, password, companyName, language }, meta) {
  const passwordHash = await hashPassword(password);
  const chosenLanguage = await effectiveLanguage(language);
  const userId = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(726150002)');
    const count = await client.query('SELECT count(*) AS n FROM users');
    if (count.rows[0].n > 0) throw forbidden('Setup is already complete. Ask an administrator to invite you.');
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role, status, language, last_active_at)
       VALUES ($1, $2, $3, 'superAdmin', 'active', $4, now()) RETURNING id`,
      [name, email, passwordHash, chosenLanguage]
    );
    return result.rows[0].id;
  });
  if (companyName) await saveWorkspace({ name: companyName });
  await recordActivity({ actorId: userId, action: 'workspace.created', entity: 'user', entityId: userId, ip: meta.ip, userAgent: meta.userAgent });
  return startSession(userId, meta);
}

/**
 * Whether this browser has signed in as this person before — going by its User-Agent alone, not the IP
 * (which changes too often, especially on mobile, to mean "a different device"). Read from the sessions
 * already on file (`auth_tokens`, purpose 'refresh') rather than a table of its own, so registering or
 * accepting an invite on a device already counts as "known" — no separate write path to keep in sync.
 * A User-Agent this parser cannot describe is treated as known, so an unusual client never gets paged.
 */
async function isKnownDevice(userId, device) {
  if (!device) return true;
  const rows = await query("SELECT DISTINCT user_agent FROM auth_tokens WHERE user_id = $1 AND purpose = 'refresh' AND user_agent IS NOT NULL", [userId]);
  return rows.rows.some((row) => describeDevice(row.user_agent) === device);
}

/**
 * There is no geo-IP lookup here (that would mean depending on an always-on external service this app
 * has no control over, for every sign-in) — the IP address itself fills the "location" wording instead.
 * Swap this for a real place name later by changing only this line, if a geo-IP source is ever chosen.
 */
async function notifyNewSignIn(user, meta) {
  await dispatchEmail('auth.newSignIn', [{ email: user.email, name: user.name, language: user.language }], (language) => ({
    device: describeDevice(meta.userAgent) || 'an unrecognised device',
    location: meta.ip || 'an unknown address',
    signed_in_at: formatDateTime(language),
  }));
}

export async function login({ email, password }, meta) {
  const found = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash, failed_login_count, locked_until FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  const user = found.rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw tooManyRequests(`Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }

  // Always do one password check, even for unknown emails, so timing does not reveal who exists.
  const matches = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !matches) {
    if (user) {
      const locks = user.failed_login_count + 1 >= MAX_FAILED_LOGINS;
      await query(
        `UPDATE users SET failed_login_count = $2, locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id = $1`,
        [user.id, locks ? 0 : user.failed_login_count + 1, locks, String(LOCK_MINUTES)]
      );
      await recordActivity({ actorId: user.id, action: 'auth.login_failed', entity: 'user', entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
    }
    throw unauthorized(INVALID_LOGIN);
  }
  if (user.status === 'disabled') throw forbidden('This account is disabled. Ask an administrator.');

  await query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_active_at = now() WHERE id = $1', [user.id]);
  await recordActivity({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });

  // Checked before startSession() writes this sign-in's own session row, so it never sees itself as "known".
  const device = describeDevice(meta.userAgent);
  const isNew = device && !(await isKnownDevice(user.id, device));
  const session = await startSession(user.id, meta);
  if (isNew) await notifyNewSignIn(user, meta);
  return session;
}

/** Trades a refresh token for a new access token + a new refresh token (the old one stops working). */
export async function refreshSession(rawRefreshToken, meta) {
  const rotated = rawRefreshToken ? await rotateRefreshToken(rawRefreshToken) : null;
  if (!rotated) throw unauthorized('Your session has expired. Please sign in again.');
  const user = await query('SELECT status FROM users WHERE id = $1', [rotated.userId]);
  if (user.rows[0]?.status !== 'active') throw unauthorized('Your session has expired. Please sign in again.');
  return startSession(rotated.userId, meta);
}

export async function logout(rawRefreshToken) {
  if (rawRefreshToken) await revokeRefreshToken(rawRefreshToken);
}

/** Always looks successful, so the form cannot be used to find out who has an account. */
export async function requestPasswordReset(email, meta) {
  const found = await query(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`, [email]);
  const user = found.rows[0];
  if (!user || user.status !== 'active' || !user.password_hash) return;

  await invalidateStoredTokens(user.id, 'password_reset');
  const token = await createStoredToken(user.id, 'password_reset', RESET_TTL_MS, meta);
  await dispatchEmail('auth.passwordResetRequested', [{ email: user.email, name: user.name, language: user.language }], (language) => ({
    reset_link: `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
    expires_in: formatDuration(language, RESET_TTL_MS / 60_000, 'minute'),
  }));
  await recordActivity({ actorId: user.id, action: 'auth.password_reset_requested', entity: 'user', entityId: user.id, ip: meta.ip, userAgent: meta.userAgent });
}

async function notifyPasswordChanged(user) {
  await dispatchEmail('auth.passwordChanged', [{ email: user.email, name: user.name, language: user.language }], (language) => ({
    changed_at: formatDateTime(language),
  }));
}

export async function resetPassword({ token, password }, meta) {
  const userId = await consumeStoredToken(token, 'password_reset');
  if (!userId) throw badRequest('This reset link is invalid or has expired. Request a new one.');
  const passwordHash = await hashPassword(password);
  const updated = await query(
    `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = now()
      WHERE id = $1 AND status = 'active' RETURNING ${PUBLIC_COLUMNS}`,
    [userId, passwordHash]
  );
  if (!updated.rows[0]) throw badRequest('This reset link is invalid or has expired. Request a new one.');
  await revokeAllRefreshTokens(userId); // every device signs in again with the new password
  await notifyPasswordChanged(updated.rows[0]);
  await recordActivity({ actorId: userId, action: 'auth.password_reset', entity: 'user', entityId: userId, ip: meta.ip, userAgent: meta.userAgent });
}

/** A person opens their invitation link and chooses a password: the account becomes active and signed in. */
export async function acceptInvite({ token, password, name }, meta) {
  const userId = await consumeStoredToken(token, 'invite');
  if (!userId) throw badRequest('This invitation is invalid or has expired. Ask an administrator to send a new one.');
  const passwordHash = await hashPassword(password);
  const updated = await query(
    `UPDATE users SET password_hash = $2, status = 'active', name = COALESCE($3, name), last_active_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'invited' RETURNING id`,
    [userId, passwordHash, name ?? null]
  );
  if (!updated.rows[0]) throw badRequest('This invitation is no longer valid.');
  await recordActivity({ actorId: userId, action: 'auth.invite_accepted', entity: 'user', entityId: userId, ip: meta.ip, userAgent: meta.userAgent });
  return startSession(userId, meta);
}

export async function changePassword(actor, { currentPassword, newPassword }, meta) {
  const row = await query('SELECT password_hash FROM users WHERE id = $1', [actor.id]);
  if (!(await verifyPassword(currentPassword, row.rows[0]?.password_hash || DUMMY_HASH))) {
    throw unauthorized('Your current password is not correct');
  }
  if (currentPassword === newPassword) throw badRequest('Choose a password you have not used just now');
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [actor.id, await hashPassword(newPassword)]);
  await revokeAllRefreshTokens(actor.id);
  await notifyPasswordChanged(actor);
  await recordActivity({ actorId: actor.id, action: 'auth.password_changed', entity: 'user', entityId: actor.id, ip: meta.ip, userAgent: meta.userAgent });
  return startSession(actor.id, meta); // this device stays signed in
}

export async function updateProfile(actor, { name, language, avatarUrl }) {
  const nextLanguage = language === undefined ? actor.language : await effectiveLanguage(language);
  const result = await query(
    `UPDATE users SET name = $2, language = $3, avatar_url = $4, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [actor.id, name ?? actor.name, nextLanguage, avatarUrl === undefined ? (actor.avatar_url ?? null) : avatarUrl]
  );
  return toApiUser(result.rows[0]);
}

/** Real, currently-signed-in devices (Settings → Security). `currentRawToken` marks which one is "this device". */
export async function listSessions(userId, currentRawToken) {
  const currentHash = currentRawToken ? hashToken(currentRawToken) : null;
  const rows = (await listActiveRefreshTokens(userId)).rows;
  return rows.map((row) => ({
    id: row.id,
    device: describeDevice(row.user_agent) || 'Unrecognised device',
    location: row.ip || 'Unknown address',
    lastActiveAt: row.created_at,
    isCurrent: Boolean(currentHash) && row.token_hash === currentHash,
  }));
}

/** "Revoke" on another device — that session's refresh token stops working next time it tries to renew. */
export async function revokeSession(userId, sessionId) {
  const result = await revokeRefreshTokenById(userId, sessionId);
  if (!result.rows[0]) throw notFound('Session not found');
}
