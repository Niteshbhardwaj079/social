/**
 * Who may do what. Roles are real, editable rows (see roleService.js) — this file only reads
 * the capability flags/rank that `authenticate` already joined onto `req.user` (as `actor.permissions`
 * / `actor.roleRank` / `actor.roleIsProtected`), so every function below is a one-line, honest
 * lookup, never a hardcoded role-name comparison. The one hard-coded exception is the protected
 * role itself (Super Admin, `is_protected` in the DB) — nobody, however permissioned, may rename
 * it, edit its permissions, or delete it; that guard lives in roleService.js against the role
 * being EDITED, not against the actor, since `roles.manage` is otherwise an ordinary grantable
 * flag (both Super Admin and Admin have it by default, per spec). roleService.js additionally
 * refuses to let anyone grant a role a capability they do not themselves hold, which is what
 * actually prevents a `roles.manage`-capable role from escalating itself or another role.
 */

/** The 5 roles every deployment starts with (seeded by migration 022) — used only where a display
 *  needs to distinguish a translatable built-in name from a custom, user-typed one (email/i18n). */
export const BUILTIN_ROLE_IDS = ['superAdmin', 'admin', 'editor', 'contributor', 'analyst'];

/** People who may invite, edit and remove people (their own seniority still bounds who they can touch). */
export const canManageUsers = (actor) => actor.permissions?.usersManage === true;

/** People who may open Roles & Permissions and edit role DEFINITIONS (create/edit/delete a role,
 *  change what it can do). An ordinary grantable flag — see roleService.js for the escalation guards. */
export const canManageRoleDefinitions = (actor) => actor.permissions?.rolesManage === true;

/** People who may connect and disconnect social accounts (they handle the client's API keys). */
export const canManageAccounts = (actor) => actor.permissions?.socialAccountsManage === true;

/** Same rule, for the storage provider (it also holds the client's own keys). */
export const canManageStorage = canManageAccounts;

/** Workspace settings + system email templates. */
export const canManageSettings = (actor) => actor.permissions?.settingsManage === true;

/** Viewing and deleting activity log entries. */
export const canManageActivityLogs = (actor) => actor.permissions?.activityLogsManage === true;

/** Creating, launching, pausing, deleting ads; syncing ad accounts; automated rules. */
export const canManageAds = (actor) => actor.permissions?.adsManage === true;

/** Creating, editing, deleting campaigns. */
export const canManageCampaigns = (actor) => actor.permissions?.campaignsManage === true;

/** Saving, editing, deleting ad creative templates. */
export const canManageTemplates = (actor) => actor.permissions?.templatesManage === true;

/** Uploading, replacing, deleting media library files. */
export const canManageMedia = (actor) => actor.permissions?.mediaManage === true;

/** Viewing the Dashboard and Analytics pages. Every seeded role starts with this on — it only
 *  matters once a custom role is created without it. */
export const canViewReports = (actor) => actor.permissions?.reportsView === true;

/** Who may schedule, publish, approve and retry posts (and campaigns/templates/ads/recycling —
 *  those now have their own flags above; this one is specifically the Posts "publish" tier). */
export const canPublishPosts = (actor) => actor.permissions?.postsPublish === true;

/** Everyone with the Posts "write" tier may draft, edit their own drafts, upload media for a
 *  post, use short links and the Inbox — read-only roles (postsWrite: false) cannot. */
export const canWritePosts = (actor) => actor.permissions?.postsWrite === true;

const OWN_DRAFT_EDITABLE_STATUSES = ['draft', 'pendingApproval', 'rejected'];

/** May `actor` edit or delete this post? Anyone who can publish, always. Otherwise, only their
 *  OWN post, and only before it's approved — generalizes the old "Contributors only" rule to any
 *  role that can write but not publish (e.g. a custom "Content Writer" role gets the same carve-out). */
export const canChangePost = (actor, post) =>
  canPublishPosts(actor) ||
  (canWritePosts(actor) && post.created_by === actor.id && OWN_DRAFT_EDITABLE_STATUSES.includes(post.status));

/** May `actor` hand out `targetRole` (the full role row, for its rank) when inviting or changing someone? */
export const canAssignRole = (actor, targetRole) => actor.roleIsProtected === true || targetRole.rank < actor.roleRank;

/** May `actor` change or remove `target` (a user row carrying its own role's rank/isProtected)? */
export const canManageTarget = (actor, target) =>
  actor.roleIsProtected === true || (target.roleIsProtected !== true && target.roleRank < actor.roleRank);
