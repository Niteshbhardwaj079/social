import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { hashToken, randomToken } from '../utils/security.js';

// ---------------------------------------------------------------- access tokens (short-lived JWT)
export function signAccessToken(userId) {
  return jwt.sign({}, config.auth.jwtSecret, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: config.auth.accessTtlSeconds,
  });
}

/** Returns the user id, or null for anything that is not a valid, unexpired token of ours. */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * A short-lived marker proving the password step of login already succeeded for this user, so the
 * 2FA-code step doesn't need the password again. Signed with the same secret as an access token but
 * tagged `purpose: '2fa'` so it can never be mistaken for (or used as) a real access token.
 */
const TWO_FACTOR_CHALLENGE_TTL_SEC = 5 * 60;

export function signTwoFactorChallenge(userId) {
  return jwt.sign({ purpose: '2fa' }, config.auth.jwtSecret, { subject: userId, algorithm: 'HS256', expiresIn: TWO_FACTOR_CHALLENGE_TTL_SEC });
}

export function verifyTwoFactorChallenge(token) {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    return payload.purpose === '2fa' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- stored, single-use tokens
/** Creates a token for `purpose` and returns the raw secret (only its hash is stored). */
export async function createStoredToken(userId, purpose, ttlMs, { userAgent = null, ip = null } = {}) {
  const raw = randomToken();
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval, $5, $6)`,
    [userId, purpose, hashToken(raw), String(ttlMs), userAgent?.slice(0, 300) ?? null, ip]
  );
  return raw;
}

/**
 * Uses up a password-reset or invitation token. Atomic: two requests with the same token
 * can never both succeed. Returns the user id, or null when it is unknown, used or expired.
 */
export async function consumeStoredToken(raw, purpose) {
  const result = await query(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(raw), purpose]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function invalidateStoredTokens(userId, purpose) {
  await query(
    'UPDATE auth_tokens SET revoked_at = now() WHERE user_id = $1 AND purpose = $2 AND revoked_at IS NULL AND used_at IS NULL',
    [userId, purpose]
  );
}

// ---------------------------------------------------------------- refresh tokens (rotating)
export const createRefreshToken = (userId, meta) => createStoredToken(userId, 'refresh', config.auth.refreshTtlMs, meta);

/**
 * Swaps a refresh token for a new one. Each refresh token works exactly once; presenting one
 * that was already used means it was probably stolen, so every session of that user is ended.
 * Returns { userId } or null.
 */
export async function rotateRefreshToken(raw) {
  const claimed = await query(
    `UPDATE auth_tokens SET revoked_at = now()
      WHERE token_hash = $1 AND purpose = 'refresh' AND revoked_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(raw)]
  );
  if (claimed.rows[0]) return { userId: claimed.rows[0].user_id };

  const known = await query("SELECT user_id, revoked_at FROM auth_tokens WHERE token_hash = $1 AND purpose = 'refresh'", [hashToken(raw)]);
  if (known.rows[0]?.revoked_at) await revokeAllRefreshTokens(known.rows[0].user_id);
  return null;
}

export const revokeRefreshToken = (raw) =>
  query("UPDATE auth_tokens SET revoked_at = now() WHERE token_hash = $1 AND purpose = 'refresh' AND revoked_at IS NULL", [hashToken(raw)]);

export const revokeAllRefreshTokens = (userId) =>
  query("UPDATE auth_tokens SET revoked_at = now() WHERE user_id = $1 AND purpose = 'refresh' AND revoked_at IS NULL", [userId]);

/** Housekeeping: drops tokens that expired more than a day ago. */
export const deleteExpiredTokens = () => query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day'");

/**
 * One row per real, currently-signed-in device: refresh tokens rotate (each one works once, see
 * `rotateRefreshToken` above), so at any moment a device holds exactly one live, not-yet-used row.
 */
export const listActiveRefreshTokens = (userId) =>
  query(
    `SELECT id, token_hash, user_agent, ip, created_at FROM auth_tokens
      WHERE user_id = $1 AND purpose = 'refresh' AND revoked_at IS NULL AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [userId]
  );

/** Ends one specific session ("Revoke" on a device that isn't this one). Scoped to the caller's own tokens. */
export const revokeRefreshTokenById = (userId, id) =>
  query("UPDATE auth_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND purpose = 'refresh' AND revoked_at IS NULL RETURNING id", [id, userId]);
