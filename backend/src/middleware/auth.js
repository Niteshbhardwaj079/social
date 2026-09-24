import { query } from '../db/pool.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import {
  canManageAccounts,
  canManageActivityLogs,
  canManageRoleDefinitions,
  canManageSettings,
  canManageStorage,
  canManageUsers,
  canViewReports,
} from '../services/permissions.js';

const TOUCH_AFTER_MS = 5 * 60 * 1000;

const USER_ROLE_JOIN_SELECT = `
  SELECT users.id, users.name, users.email, users.role, users.status, users.language, users.avatar_url, users.last_active_at,
         roles.rank AS role_rank, roles.is_protected AS role_is_protected,
         roles.users_manage, roles.roles_manage, roles.posts_write, roles.posts_publish, roles.social_accounts_manage,
         roles.ads_manage, roles.campaigns_manage, roles.reports_view, roles.media_manage, roles.templates_manage,
         roles.activity_logs_manage, roles.settings_manage
    FROM users JOIN roles ON roles.id = users.role
   WHERE users.id = $1`;

/** Reshapes a row from USER_ROLE_JOIN_SELECT into the actor shape every permission check reads. */
export function attachRoleCapabilities(row) {
  row.roleRank = row.role_rank;
  row.roleIsProtected = row.role_is_protected;
  row.permissions = {
    usersManage: row.users_manage,
    rolesManage: row.roles_manage,
    postsWrite: row.posts_write,
    postsPublish: row.posts_publish,
    socialAccountsManage: row.social_accounts_manage,
    adsManage: row.ads_manage,
    campaignsManage: row.campaigns_manage,
    reportsView: row.reports_view,
    mediaManage: row.media_manage,
    templatesManage: row.templates_manage,
    activityLogsManage: row.activity_logs_manage,
    settingsManage: row.settings_manage,
  };
  return row;
}

/**
 * Requires a valid `Authorization: Bearer <access token>` and loads the person from the
 * database on every request, so disabling an account or changing a role (or a role's own
 * permissions) takes effect at once instead of waiting for a token to expire.
 */
export async function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw unauthorized();

  const result = await query(USER_ROLE_JOIN_SELECT, [userId]);
  const user = result.rows[0];
  if (!user || user.status !== 'active') throw unauthorized();
  req.user = attachRoleCapabilities(user);

  // "Last active" is only refreshed every few minutes: cheap, and good enough for that column.
  if (!user.last_active_at || Date.now() - new Date(user.last_active_at).getTime() > TOUCH_AFTER_MS) {
    query('UPDATE users SET last_active_at = now() WHERE id = $1', [user.id]).catch(() => {});
  }
  next();
}

/** Only people whose role has the Users capability. */
export function requireUserManager(req, _res, next) {
  if (!canManageUsers(req.user)) throw forbidden();
  next();
}

/** Only the protected role — see permissions.js for why role definitions aren't a plain flag. */
export function requireRoleManager(req, _res, next) {
  if (!canManageRoleDefinitions(req.user)) throw forbidden();
  next();
}

/** Only people whose role has the Settings capability (workspace settings, system emails). */
export function requireSettingsManager(req, _res, next) {
  if (!canManageSettings(req.user)) throw forbidden();
  next();
}

/** Only people whose role has the Activity Logs capability. */
export function requireActivityLogsManager(req, _res, next) {
  if (!canManageActivityLogs(req.user)) throw forbidden();
  next();
}

/** Only people whose role has the Reports capability (Dashboard, Analytics). */
export function requireReportsViewer(req, _res, next) {
  if (!canViewReports(req.user)) throw forbidden();
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
