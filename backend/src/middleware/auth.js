import { query } from '../db/pool.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import {
  canConnectAccounts,
  canCreateRoles,
  canDeleteActivityLogs,
  canDeleteRoles,
  canDisconnectAccounts,
  canEditAccounts,
  canEditRoles,
  canEditSettings,
  canViewAccounts,
  canViewActivityLogs,
  canViewAds,
  canViewCampaigns,
  canViewMedia,
  canViewPosts,
  canViewReports,
  canViewRoles,
  canViewSettings,
  canViewTemplates,
  canViewUsers,
} from '../services/permissions.js';

const TOUCH_AFTER_MS = 5 * 60 * 1000;

const PERMISSION_COLUMNS = [
  'users_view',
  'users_create',
  'users_edit',
  'users_delete',
  'roles_view',
  'roles_create',
  'roles_edit',
  'roles_delete',
  'posts_view',
  'posts_write',
  'posts_publish',
  'posts_delete',
  'social_accounts_view',
  'social_accounts_connect',
  'social_accounts_edit',
  'social_accounts_delete',
  'ads_view',
  'ads_create',
  'ads_edit',
  'ads_delete',
  'campaigns_view',
  'campaigns_create',
  'campaigns_edit',
  'campaigns_delete',
  'reports_view',
  'media_view',
  'media_create',
  'media_edit',
  'media_delete',
  'templates_view',
  'templates_create',
  'templates_edit',
  'templates_delete',
  'activity_logs_view',
  'activity_logs_delete',
  'settings_view',
  'settings_edit',
];

const USER_ROLE_JOIN_SELECT = `
  SELECT users.id, users.name, users.email, users.role, users.status, users.language, users.avatar_url, users.last_active_at,
         roles.rank AS role_rank, roles.is_protected AS role_is_protected,
         roles.${PERMISSION_COLUMNS.join(', roles.')}
    FROM users JOIN roles ON roles.id = users.role
   WHERE users.id = $1`;

/** Reshapes a row from USER_ROLE_JOIN_SELECT into the actor shape every permission check reads. */
export function attachRoleCapabilities(row) {
  row.roleRank = row.role_rank;
  row.roleIsProtected = row.role_is_protected;
  row.permissions = {
    usersView: row.users_view,
    usersCreate: row.users_create,
    usersEdit: row.users_edit,
    usersDelete: row.users_delete,
    rolesView: row.roles_view,
    rolesCreate: row.roles_create,
    rolesEdit: row.roles_edit,
    rolesDelete: row.roles_delete,
    postsView: row.posts_view,
    postsWrite: row.posts_write,
    postsPublish: row.posts_publish,
    postsDelete: row.posts_delete,
    socialAccountsView: row.social_accounts_view,
    socialAccountsConnect: row.social_accounts_connect,
    socialAccountsEdit: row.social_accounts_edit,
    socialAccountsDelete: row.social_accounts_delete,
    adsView: row.ads_view,
    adsCreate: row.ads_create,
    adsEdit: row.ads_edit,
    adsDelete: row.ads_delete,
    campaignsView: row.campaigns_view,
    campaignsCreate: row.campaigns_create,
    campaignsEdit: row.campaigns_edit,
    campaignsDelete: row.campaigns_delete,
    reportsView: row.reports_view,
    mediaView: row.media_view,
    mediaCreate: row.media_create,
    mediaEdit: row.media_edit,
    mediaDelete: row.media_delete,
    templatesView: row.templates_view,
    templatesCreate: row.templates_create,
    templatesEdit: row.templates_edit,
    templatesDelete: row.templates_delete,
    activityLogsView: row.activity_logs_view,
    activityLogsDelete: row.activity_logs_delete,
    settingsView: row.settings_view,
    settingsEdit: row.settings_edit,
  };
  return row;
}

/** Loads a user together with their role's rank/isProtected/permissions — the same shape `authenticate`
 *  attaches to `req.user`. Used by authService.js's startSession() too, so a login/refresh response's
 *  `user` object carries real permissions immediately, not just after a later `/auth/me` fetch. */
export async function loadActor(userId) {
  const result = await query(USER_ROLE_JOIN_SELECT, [userId]);
  const row = result.rows[0];
  return row ? attachRoleCapabilities(row) : null;
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

  const user = await loadActor(userId);
  if (!user || user.status !== 'active') throw unauthorized();
  req.user = user;

  // "Last active" is only refreshed every few minutes: cheap, and good enough for that column.
  if (!user.last_active_at || Date.now() - new Date(user.last_active_at).getTime() > TOUCH_AFTER_MS) {
    query('UPDATE users SET last_active_at = now() WHERE id = $1', [user.id]).catch(() => {});
  }
  next();
}

// ---------------------------------------------------------------- Users
export function requireUsersViewer(req, _res, next) {
  if (!canViewUsers(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Roles
export function requireRoleViewer(req, _res, next) {
  if (!canViewRoles(req.user)) throw forbidden();
  next();
}

export function requireRoleCreator(req, _res, next) {
  if (!canCreateRoles(req.user)) throw forbidden();
  next();
}

export function requireRoleEditor(req, _res, next) {
  if (!canEditRoles(req.user)) throw forbidden();
  next();
}

export function requireRoleDeleter(req, _res, next) {
  if (!canDeleteRoles(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Settings (workspace, languages, system emails)
export function requireSettingsViewer(req, _res, next) {
  if (!canViewSettings(req.user)) throw forbidden();
  next();
}

export function requireSettingsEditor(req, _res, next) {
  if (!canEditSettings(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Activity Logs
export function requireActivityLogsViewer(req, _res, next) {
  if (!canViewActivityLogs(req.user)) throw forbidden();
  next();
}

export function requireActivityLogsDeleter(req, _res, next) {
  if (!canDeleteActivityLogs(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Reports (Dashboard, Analytics)
export function requireReportsViewer(req, _res, next) {
  if (!canViewReports(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Social Accounts (+ storage, ad-account sync)
export function requireAccountViewer(req, _res, next) {
  if (!canViewAccounts(req.user)) throw forbidden();
  next();
}

/** Connecting a new account/provider, or testing credentials before connecting. */
export function requireAccountConnector(req, _res, next) {
  if (!canConnectAccounts(req.user)) throw forbidden();
  next();
}

/** Re-checking/syncing an already-connected account, or changing storage preferences. */
export function requireAccountEditor(req, _res, next) {
  if (!canEditAccounts(req.user)) throw forbidden();
  next();
}

/** Disconnecting a social account or the storage provider. */
export function requireAccountDeleter(req, _res, next) {
  if (!canDisconnectAccounts(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Posts
export function requirePostsViewer(req, _res, next) {
  if (!canViewPosts(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Ads (Meta campaigns, automated rules)
export function requireAdsViewer(req, _res, next) {
  if (!canViewAds(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Campaigns
export function requireCampaignsViewer(req, _res, next) {
  if (!canViewCampaigns(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Media Library
export function requireMediaViewer(req, _res, next) {
  if (!canViewMedia(req.user)) throw forbidden();
  next();
}

// ---------------------------------------------------------------- Ad Creative Templates
export function requireTemplatesViewer(req, _res, next) {
  if (!canViewTemplates(req.user)) throw forbidden();
  next();
}
