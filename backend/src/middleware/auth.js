import { query } from '../db/pool.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { canManageAccounts, canManageStorage, canManageUsers } from '../services/permissions.js';

const TOUCH_AFTER_MS = 5 * 60 * 1000;

/**
 * Requires a valid `Authorization: Bearer <access token>` and loads the person from the
 * database on every request, so disabling an account or changing a role takes effect at
 * once instead of waiting for a token to expire.
 */
export async function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw unauthorized();

  const result = await query('SELECT id, name, email, role, status, language, last_active_at FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user || user.status !== 'active') throw unauthorized();
  req.user = user;

  // "Last active" is only refreshed every few minutes: cheap, and good enough for that column.
  if (!user.last_active_at || Date.now() - new Date(user.last_active_at).getTime() > TOUCH_AFTER_MS) {
    query('UPDATE users SET last_active_at = now() WHERE id = $1', [user.id]).catch(() => {});
  }
  next();
}

/** Only Super Admins and Admins. */
export function requireUserManager(req, _res, next) {
  if (!canManageUsers(req.user)) throw forbidden();
  next();
}

/** Only people who may handle the client's platform credentials. */
export function requireAccountManager(req, _res, next) {
  if (!canManageAccounts(req.user)) throw forbidden();
  next();
}

/** Only people who may handle the client's storage keys. */
export function requireStorageManager(req, _res, next) {
  if (!canManageStorage(req.user)) throw forbidden();
  next();
}
