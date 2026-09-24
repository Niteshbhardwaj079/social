import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { recordActivity } from './auditService.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

/** One entry per real, enforced capability (see services/permissions.js) — nothing here is
 *  decorative. Every module has a real View key now (migration 027 added it to whichever modules
 *  didn't already have one); a module gets a Create/Edit/Delete key only where that's a genuinely
 *  distinct backend operation (Reports has none of the three; Activity Logs has no Create/Edit;
 *  Settings has no Create/Delete). */
export const PERMISSION_KEYS = [
  'usersView',
  'usersCreate',
  'usersEdit',
  'usersDelete',
  'rolesView',
  'rolesCreate',
  'rolesEdit',
  'rolesDelete',
  'postsView',
  'postsWrite',
  'postsPublish',
  'postsDelete',
  'socialAccountsView',
  'socialAccountsConnect',
  'socialAccountsEdit',
  'socialAccountsDelete',
  'adsView',
  'adsCreate',
  'adsEdit',
  'adsDelete',
  'campaignsView',
  'campaignsCreate',
  'campaignsEdit',
  'campaignsDelete',
  'reportsView',
  'mediaView',
  'mediaCreate',
  'mediaEdit',
  'mediaDelete',
  'templatesView',
  'templatesCreate',
  'templatesEdit',
  'templatesDelete',
  'activityLogsView',
  'activityLogsDelete',
  'settingsView',
  'settingsEdit',
];

const COLUMN_BY_KEY = {
  usersView: 'users_view',
  usersCreate: 'users_create',
  usersEdit: 'users_edit',
  usersDelete: 'users_delete',
  rolesView: 'roles_view',
  rolesCreate: 'roles_create',
  rolesEdit: 'roles_edit',
  rolesDelete: 'roles_delete',
  postsView: 'posts_view',
  postsWrite: 'posts_write',
  postsPublish: 'posts_publish',
  postsDelete: 'posts_delete',
  socialAccountsView: 'social_accounts_view',
  socialAccountsConnect: 'social_accounts_connect',
  socialAccountsEdit: 'social_accounts_edit',
  socialAccountsDelete: 'social_accounts_delete',
  adsView: 'ads_view',
  adsCreate: 'ads_create',
  adsEdit: 'ads_edit',
  adsDelete: 'ads_delete',
  campaignsView: 'campaigns_view',
  campaignsCreate: 'campaigns_create',
  campaignsEdit: 'campaigns_edit',
  campaignsDelete: 'campaigns_delete',
  reportsView: 'reports_view',
  mediaView: 'media_view',
  mediaCreate: 'media_create',
  mediaEdit: 'media_edit',
  mediaDelete: 'media_delete',
  templatesView: 'templates_view',
  templatesCreate: 'templates_create',
  templatesEdit: 'templates_edit',
  templatesDelete: 'templates_delete',
  activityLogsView: 'activity_logs_view',
  activityLogsDelete: 'activity_logs_delete',
  settingsView: 'settings_view',
  settingsEdit: 'settings_edit',
};

// Rank 4 is reserved for the one protected (Super Admin) role, seeded once by the migration —
// nobody can create or promote a role up to it, so it always stays a unique sentinel.
const MAX_CREATABLE_RANK = 3;

function present(row) {
  const permissions = {};
  for (const key of PERMISSION_KEYS) permissions[key] = row[COLUMN_BY_KEY[key]] === true;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    rank: row.rank,
    isProtected: row.is_protected,
    isActive: row.is_active,
    usersCount: Number(row.users_count ?? 0),
    permissions,
  };
}

const ROLE_SELECT = 'SELECT roles.*, (SELECT count(*) FROM users WHERE users.role = roles.id) AS users_count FROM roles';

export async function listRoles() {
  const result = await query(`${ROLE_SELECT} ORDER BY rank DESC, name ASC`);
  return result.rows.map(present);
}

async function findRoleRow(id) {
  const result = await query(`${ROLE_SELECT} WHERE roles.id = $1`, [id]);
  return result.rows[0] || null;
}

export async function getRole(id) {
  const row = await findRoleRow(id);
  if (!row) throw notFound('No such role');
  return present(row);
}

/** Like getRole, but returns null instead of throwing — for validating a role id that arrived
 *  as part of a bigger request (e.g. assigning a role to a user), where "unknown role" is the
 *  caller's own bad input (400), not a missing URL resource (404). */
export async function getRoleOrNull(id) {
  const row = await findRoleRow(id);
  return row ? present(row) : null;
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function randomSuffix() {
  return crypto.randomBytes(3).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4);
}

function normalizePermissionsInput(input = {}) {
  const permissions = {};
  for (const key of PERMISSION_KEYS) permissions[key] = input[key] === true;
  return permissions;
}

/** Refuses to let `actor` grant a permission they do not themselves hold — the guard that keeps
 *  `rolesManage` (an ordinary flag Super Admin AND Admin start with, per spec) from being usable
 *  to escalate a role's own power, or another role's, beyond what the person editing it can do. */
function assertGrantable(actor, permissions) {
  for (const key of PERMISSION_KEYS) {
    if (permissions[key] && actor.permissions?.[key] !== true) {
      throw forbidden('You cannot grant a permission you do not have yourself.');
    }
  }
}

// Rank only needs a sanity bound here (1..3 — 4 is the protected role's reserved sentinel), not a
// comparison against the actor's own rank: `assertGrantable` is what actually stops escalation
// (you can only ever hand out a permission you already hold), and rank itself only ever matters
// once a role also has `usersManage` — at which point canManageTarget/canAssignRole (permissions.js)
// already refuse to let it touch anyone ranked at or above it.
function assertRankAllowed(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > MAX_CREATABLE_RANK) {
    throw badRequest(`Rank must be a whole number between 1 and ${MAX_CREATABLE_RANK}`);
  }
}

export async function createRole(actor, input, ip, userAgent) {
  const permissions = normalizePermissionsInput(input.permissions);
  assertGrantable(actor, permissions);
  const rank = input.rank ?? 1;
  assertRankAllowed(rank);

  const name = String(input.name || '').trim();
  if (!name) throw badRequest('Name is required');
  const slug = normalizeSlug(name);
  if (!slug) throw badRequest('Give this role a name with at least one letter or number.');

  const permissionColumns = PERMISSION_KEYS.map((key) => COLUMN_BY_KEY[key]);
  const permissionValues = PERMISSION_KEYS.map((key) => permissions[key]);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateId = attempt === 0 ? slug : `${slug}-${randomSuffix()}`;
    try {
      const result = await query(
        `INSERT INTO roles (id, name, description, icon, accent, rank, is_protected, ${permissionColumns.join(', ')})
         VALUES ($1, $2, $3, $4, $5, $6, false, ${permissionColumns.map((_, i) => `$${i + 7}`).join(', ')})
         RETURNING *`,
        [candidateId, name, input.description || '', input.icon || 'Shield', input.accent || 'slate', rank, ...permissionValues]
      );
      const created = { ...result.rows[0], users_count: 0 };
      await recordActivity({ actorId: actor.id, action: 'role.created', entity: 'role', entityId: created.id, meta: { name }, ip, userAgent });
      return present(created);
    } catch (error) {
      if (error.code === '23505' && attempt < 4) continue; // id collision — try a suffixed one
      throw error;
    }
  }
  throw conflict('Could not create a unique id for this role — try a different name.');
}

export async function updateRole(actor, id, changes, ip, userAgent) {
  const row = await findRoleRow(id);
  if (!row) throw notFound('No such role');
  if (row.is_protected) throw forbidden("The Super Admin role can't be renamed, edited or have its permissions changed.");

  const current = present(row);
  const nextPermissions = changes.permissions
    ? normalizePermissionsInput({ ...current.permissions, ...changes.permissions })
    : current.permissions;
  if (changes.permissions) assertGrantable(actor, nextPermissions);

  const nextRank = changes.rank ?? row.rank;
  if (changes.rank !== undefined) assertRankAllowed(nextRank);

  const name = changes.name !== undefined ? String(changes.name).trim() || row.name : row.name;
  const description = changes.description ?? row.description;
  const icon = changes.icon ?? row.icon;
  const accent = changes.accent ?? row.accent;
  const isActive = changes.isActive ?? row.is_active;
  const permissionColumns = PERMISSION_KEYS.map((key) => COLUMN_BY_KEY[key]);
  const permissionValues = PERMISSION_KEYS.map((key) => nextPermissions[key]);

  const setClauses = ['name = $2', 'description = $3', 'icon = $4', 'accent = $5', 'rank = $6', 'is_active = $7', 'updated_at = now()'];
  permissionColumns.forEach((column, index) => setClauses.push(`${column} = $${index + 8}`));

  await query(`UPDATE roles SET ${setClauses.join(', ')} WHERE id = $1`, [id, name, description, icon, accent, nextRank, isActive, ...permissionValues]);
  const updated = await findRoleRow(id);
  await recordActivity({ actorId: actor.id, action: 'role.updated', entity: 'role', entityId: id, meta: { name: updated.name }, ip, userAgent });
  return present(updated);
}

export async function deleteRole(actor, id, ip, userAgent) {
  const row = await findRoleRow(id);
  if (!row) throw notFound('No such role');
  if (row.is_protected) throw forbidden("The Super Admin role can't be deleted.");
  const usersCount = Number(row.users_count);
  if (usersCount > 0) {
    throw conflict(`${usersCount} ${usersCount === 1 ? 'person' : 'people'} still ${usersCount === 1 ? 'has' : 'have'} this role. Reassign them first.`);
  }
  await query('DELETE FROM roles WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'role.deleted', entity: 'role', entityId: id, meta: { name: row.name }, ip, userAgent });
}

export async function duplicateRole(actor, id, overrideName, ip, userAgent) {
  const row = await findRoleRow(id);
  if (!row) throw notFound('No such role');
  const source = present(row);
  const rank = Math.min(source.rank, MAX_CREATABLE_RANK);
  return createRole(
    actor,
    {
      name: overrideName || `${source.name} (Copy)`,
      description: source.description,
      icon: source.icon,
      accent: source.accent,
      rank,
      permissions: source.permissions,
    },
    ip,
    userAgent
  );
}
