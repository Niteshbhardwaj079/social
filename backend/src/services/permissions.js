/**
 * Who may do what. Roles are real, editable rows (see roleService.js) — this file only reads
 * the capability flags/rank that `authenticate` already joined onto `req.user` (as `actor.permissions`
 * / `actor.roleRank` / `actor.roleIsProtected`), so every function below is a one-line, honest
 * lookup, never a hardcoded role-name comparison. The one hard-coded exception is the protected
 * role itself (Super Admin, `is_protected` in the DB) — nobody, however permissioned, may rename
 * it, edit its permissions, or delete it; that guard lives in roleService.js against the role
 * being EDITED, not against the actor, since `rolesEdit`/etc are otherwise ordinary grantable
 * flags (both Super Admin and Admin have them by default, per spec). roleService.js additionally
 * refuses to let anyone grant a role a capability they do not themselves hold, which is what
 * actually prevents a roles-editing-capable role from escalating itself or another role.
 *
 * Each module below has its own real View/Create/Edit/Delete split wherever that's a genuinely
 * distinct backend operation — see roleService.js's PERMISSION_KEYS for the exact list. Every
 * module now has a real View flag (Roles/Posts/Social Accounts/Ads/Campaigns/Media/Templates
 * gained theirs in migration 027 — Users/Activity Logs/Settings already had one). A module with
 * no real Create/Edit/Delete-shaped operation (Reports is read-only; Activity Logs has no
 * create/edit; Settings has no create/delete) simply has no flag for that slot — nothing here is
 * decorative.
 */

/** The 5 roles every deployment starts with (seeded by migration 022) — used only where a display
 *  needs to distinguish a translatable built-in name from a custom, user-typed one (email/i18n). */
export const BUILTIN_ROLE_IDS = ['superAdmin', 'admin', 'editor', 'contributor', 'analyst'];

// ---------------------------------------------------------------- Users
export const canViewUsers = (actor) => actor.permissions?.usersView === true;
export const canCreateUsers = (actor) => actor.permissions?.usersCreate === true;
export const canEditUsers = (actor) => actor.permissions?.usersEdit === true;
export const canDeleteUsers = (actor) => actor.permissions?.usersDelete === true;

// ---------------------------------------------------------------- Roles & Permissions
export const canViewRoles = (actor) => actor.permissions?.rolesView === true;
/** Create a new role (or duplicate one, which is create-shaped). */
export const canCreateRoles = (actor) => actor.permissions?.rolesCreate === true;
/** Edit an existing role's name/description/permissions/rank/active state. */
export const canEditRoles = (actor) => actor.permissions?.rolesEdit === true;
export const canDeleteRoles = (actor) => actor.permissions?.rolesDelete === true;

// ---------------------------------------------------------------- Social Accounts (+ storage, ad-account sync)
export const canViewAccounts = (actor) => actor.permissions?.socialAccountsView === true;
/** Connecting a new social account or storage provider, and "Test connection". */
export const canConnectAccounts = (actor) => actor.permissions?.socialAccountsConnect === true;
/** Re-checking/syncing an already-connected account or ad account, and automated ad rules. */
export const canEditAccounts = (actor) => actor.permissions?.socialAccountsEdit === true;
/** Disconnecting a social account or the storage provider. */
export const canDisconnectAccounts = (actor) => actor.permissions?.socialAccountsDelete === true;

// ---------------------------------------------------------------- Ads (Meta campaigns, automated rules)
export const canViewAds = (actor) => actor.permissions?.adsView === true;
export const canCreateAds = (actor) => actor.permissions?.adsCreate === true;
/** Pausing/resuming a launched ad (there is no "edit ad content" feature yet — this is that tier). */
export const canEditAds = (actor) => actor.permissions?.adsEdit === true;
export const canDeleteAds = (actor) => actor.permissions?.adsDelete === true;

// ---------------------------------------------------------------- Campaigns
export const canViewCampaigns = (actor) => actor.permissions?.campaignsView === true;
export const canCreateCampaigns = (actor) => actor.permissions?.campaignsCreate === true;
export const canEditCampaigns = (actor) => actor.permissions?.campaignsEdit === true;
export const canDeleteCampaigns = (actor) => actor.permissions?.campaignsDelete === true;

// ---------------------------------------------------------------- Media Library
export const canViewMedia = (actor) => actor.permissions?.mediaView === true;
export const canCreateMedia = (actor) => actor.permissions?.mediaCreate === true;
export const canEditMedia = (actor) => actor.permissions?.mediaEdit === true;
export const canDeleteMedia = (actor) => actor.permissions?.mediaDelete === true;

// ---------------------------------------------------------------- Ad Creative Templates
export const canViewTemplates = (actor) => actor.permissions?.templatesView === true;
export const canCreateTemplates = (actor) => actor.permissions?.templatesCreate === true;
export const canEditTemplates = (actor) => actor.permissions?.templatesEdit === true;
export const canDeleteTemplates = (actor) => actor.permissions?.templatesDelete === true;

// ---------------------------------------------------------------- Activity Logs
export const canViewActivityLogs = (actor) => actor.permissions?.activityLogsView === true;
export const canDeleteActivityLogs = (actor) => actor.permissions?.activityLogsDelete === true;

// ---------------------------------------------------------------- Settings (workspace, languages, system emails)
export const canViewSettings = (actor) => actor.permissions?.settingsView === true;
export const canEditSettings = (actor) => actor.permissions?.settingsEdit === true;

// ---------------------------------------------------------------- Reports (Dashboard, Analytics)
/** Viewing the Dashboard and Analytics pages. Every seeded role starts with this on — it only
 *  matters once a custom role is created without it. */
export const canViewReports = (actor) => actor.permissions?.reportsView === true;

// ---------------------------------------------------------------- Posts
export const canViewPosts = (actor) => actor.permissions?.postsView === true;

/** Who may schedule, publish, approve and retry posts — the Posts "publish" tier. */
export const canPublishPosts = (actor) => actor.permissions?.postsPublish === true;

/** Everyone with the Posts "write" tier may draft, edit their own drafts, upload media for a
 *  post, use short links and the Inbox — read-only roles (postsWrite: false) cannot. */
export const canWritePosts = (actor) => actor.permissions?.postsWrite === true;

/** Deleting ANY post outright (not just your own draft) — a real flag, independent of Publish,
 *  so a role can be given delete rights without also getting approve/reject/retry rights. */
export const canDeleteAnyPost = (actor) => actor.permissions?.postsDelete === true;

const OWN_DRAFT_EDITABLE_STATUSES = ['draft', 'pendingApproval', 'rejected'];
const ownsEditableDraft = (actor, post) => canWritePosts(actor) && post.created_by === actor.id && OWN_DRAFT_EDITABLE_STATUSES.includes(post.status);

/** May `actor` edit this post? Anyone who can publish, always. Otherwise, only their OWN post,
 *  and only before it's approved (the Contributor-style carve-out, generalized to any write-only role). */
export const canEditPost = (actor, post) => canPublishPosts(actor) || ownsEditableDraft(actor, post);

/** May `actor` delete this post? A real, independent `postsDelete` flag for "any post" — or the
 *  same own-draft carve-out as editing, so someone who can only write still keeps deleting their own. */
export const canDeletePost = (actor, post) => canDeleteAnyPost(actor) || ownsEditableDraft(actor, post);

// ---------------------------------------------------------------- User seniority (unchanged)
/** May `actor` hand out `targetRole` (the full role row, for its rank) when inviting or changing someone? */
export const canAssignRole = (actor, targetRole) => actor.roleIsProtected === true || targetRole.rank < actor.roleRank;

/** May `actor` change or remove `target` (a user row carrying its own role's rank/isProtected)? */
export const canManageTarget = (actor, target) =>
  actor.roleIsProtected === true || (target.roleIsProtected !== true && target.roleRank < actor.roleRank);
