/**
 * Who may do what with people. Roles have a rank; you can only manage people ranked BELOW you,
 * except a Super Admin, who can manage everyone (with a few safety rails in userService).
 */
export const ROLES = ['superAdmin', 'admin', 'editor', 'contributor', 'analyst'];

const RANK = { superAdmin: 4, admin: 3, editor: 2, contributor: 1, analyst: 1 };

export const isRole = (value) => ROLES.includes(value);

/** People who may open Users & Roles at all. */
export const canManageUsers = (actor) => actor.role === 'superAdmin' || actor.role === 'admin';

/** People who may connect and disconnect social accounts (they handle the client's API keys). */
export const canManageAccounts = (actor) => actor.role === 'superAdmin' || actor.role === 'admin';

/** Same rule, for the storage provider (it also holds the client's own keys). */
export const canManageStorage = canManageAccounts;

/** Who may schedule, publish, approve and retry posts. Contributors can only draft and ask for approval. */
export const canPublishPosts = (actor) => ['superAdmin', 'admin', 'editor'].includes(actor.role);

/** Everyone except analysts (read-only) may write posts of some kind. */
export const canWritePosts = (actor) => actor.role !== 'analyst';

const CONTRIBUTOR_EDITABLE = ['draft', 'pendingApproval', 'rejected'];

/** May `actor` edit or delete this post? Contributors only their own, and only before it is approved. */
export const canChangePost = (actor, post) =>
  canPublishPosts(actor) || (actor.role === 'contributor' && post.created_by === actor.id && CONTRIBUTOR_EDITABLE.includes(post.status));

/** May `actor` hand out `role` when inviting or changing someone? */
export const canAssignRole = (actor, role) => actor.role === 'superAdmin' || RANK[role] < RANK[actor.role];

/** May `actor` change or remove `target`? */
export const canManageTarget = (actor, target) => actor.role === 'superAdmin' || RANK[target.role] < RANK[actor.role];
