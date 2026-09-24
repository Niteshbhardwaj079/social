import { config } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { roleLabel } from '../emails/builder.js';
import { BUILTIN_ROLE_IDS, canAssignRole, canCreateUsers, canDeleteUsers, canEditUsers, canManageTarget } from './permissions.js';
import { getRoleOrNull } from './roleService.js';
import { createStoredToken, invalidateStoredTokens, revokeAllRefreshTokens } from './tokenService.js';
import { dispatchEmail } from './systemEmailService.js';
import { effectiveLanguage } from './settingsService.js';
import { recordActivity } from './auditService.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A role's display name: translated for the 5 built-in roles, the real (untranslatable, since
 *  it's user-typed) name for a custom one. */
function roleDisplayLabel(language, roleId, roleName) {
  return BUILTIN_ROLE_IDS.includes(roleId) ? roleLabel(language, roleId) : roleName || roleId;
}

/** How a user looks to the outside world (never includes the password hash or tokens). When `row`
 *  came from `loadActor`/`authenticate` (carries `.permissions`/`.roleRank`/`.roleIsProtected` — only
 *  ever true for the signed-in actor's OWN row, never when listing other people), those are included
 *  too, so the frontend can decide which buttons to show without guessing from the role name. */
export function toApiUser(row) {
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    language: row.language,
    avatarUrl: row.avatar_url,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    accountsAssigned: 0, // filled from social accounts once that module has an API
  };
  if (row.permissions) {
    user.permissions = row.permissions;
    user.roleRank = row.roleRank;
    user.roleIsProtected = row.roleIsProtected;
  }
  return user;
}

const USER_COLUMNS = 'id, name, email, role, status, language, avatar_url, last_active_at, created_at';
const USER_COLUMNS_QUALIFIED = USER_COLUMNS.split(', ')
  .map((column) => `users.${column}`)
  .join(', ');

/** Loads a user together with their role's rank/isProtected/name — needed by canAssignRole/canManageTarget,
 *  which compare seniority. `runner` is either the pool's `query` or a transaction's `client.query`. */
export async function findUserWithRole(runner, id, { forUpdate = false } = {}) {
  const result = await runner(
    `SELECT ${USER_COLUMNS_QUALIFIED}, roles.rank AS role_rank, roles.is_protected AS role_is_protected, roles.name AS role_name
       FROM users JOIN roles ON roles.id = users.role
      WHERE users.id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  row.roleRank = row.role_rank;
  row.roleIsProtected = row.role_is_protected;
  return row;
}

export async function listUsers({ search, role, status } = {}) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users
      WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR role = $2)
        AND ($3::text IS NULL OR status = $3)
      ORDER BY created_at DESC`,
    [search?.replace(/[%_\\]/g, '\\$&') ?? null, role ?? null, status ?? null]
  );
  return result.rows.map(toApiUser);
}

/** The protected role (Super Admin) must always have at least one active user — the one invariant
 *  that keeps a bad edit from ever locking everyone out of the app with no recovery path. */
async function activeProtectedRoleUsersCount(client, excludingId = null) {
  const result = await client.query(
    `SELECT count(*) AS n FROM users JOIN roles ON roles.id = users.role
      WHERE roles.is_protected AND users.status = 'active' AND ($1::uuid IS NULL OR users.id <> $1)`,
    [excludingId]
  );
  return result.rows[0].n;
}

/** Invites a person: creates the account (no password yet), emails them a link in THEIR language. */
export async function createUser(actor, { name, email, role, language }, ip, userAgent) {
  if (!canCreateUsers(actor)) throw forbidden('Your role cannot invite people.');
  const targetRole = await getRoleOrNull(role);
  if (!targetRole) throw badRequest('That role does not exist.');
  if (!targetRole.isActive) throw badRequest('That role is archived and cannot be assigned. Reactivate it first.');
  if (!canAssignRole(actor, targetRole)) throw forbidden('You cannot invite someone with that role');
  const invitedLanguage = await effectiveLanguage(language);

  let created;
  try {
    const result = await query(
      `INSERT INTO users (name, email, role, status, language, invited_by)
       VALUES ($1, $2, $3, 'invited', $4, $5) RETURNING ${USER_COLUMNS}`,
      [name, email, role, invitedLanguage, actor.id]
    );
    created = result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw conflict('Someone with that email already exists');
    throw error;
  }

  const inviteToken = await createStoredToken(created.id, 'invite', INVITE_TTL_MS);
  const acceptLink = `${config.appUrl}/accept-invite?token=${encodeURIComponent(inviteToken)}`;

  const invitation = await dispatchEmail('users.invited', [{ email: created.email, name: created.name, language: created.language }], (language) => ({
    invited_by: actor.name,
    role: roleDisplayLabel(language, created.role, targetRole.name),
    accept_link: acceptLink,
  }));

  // Every Super Admin (the protected role) gets a heads-up, each in their own language.
  const admins = await query(
    "SELECT users.name, users.email, users.language FROM users JOIN roles ON roles.id = users.role WHERE roles.is_protected AND users.status = 'active' AND users.id <> $1",
    [created.id]
  );
  await dispatchEmail('users.created', admins.rows, (language) => ({
    new_user_name: created.name,
    new_user_email: created.email,
    role: roleDisplayLabel(language, created.role, targetRole.name),
    added_by: actor.name,
    users_url: `${config.appUrl}/users`,
  }));

  await recordActivity({ actorId: actor.id, action: 'user.invited', entity: 'user', entityId: created.id, meta: { email: created.email, role }, ip, userAgent });
  // `invitation` says whether the email went out and in which language ([] = that email is switched off).
  return { user: toApiUser(created), invitation: { sent: invitation.length > 0, language: invitation[0]?.language ?? created.language } };
}

export async function updateUser(actor, id, changes, ip, userAgent) {
  if (!canEditUsers(actor)) throw forbidden('Your role cannot edit people.');
  const outcome = await transaction(async (client) => {
    const target = await findUserWithRole(client.query.bind(client), id, { forUpdate: true });
    if (!target) throw notFound('No such user');

    const isSelf = target.id === actor.id;
    // A form that re-sends the current role/status is not asking for a change.
    const roleChanges = changes.role !== undefined && changes.role !== target.role;
    const statusChanges = changes.status !== undefined && changes.status !== target.status;
    if (!isSelf && !canManageTarget(actor, target)) throw forbidden('You cannot change this person');
    if (isSelf && (roleChanges || statusChanges)) throw forbidden('You cannot change your own role or status');
    let targetRole = null;
    if (roleChanges) {
      targetRole = await getRoleOrNull(changes.role);
      if (!targetRole) throw badRequest('That role does not exist.');
      if (!targetRole.isActive) throw badRequest('That role is archived and cannot be assigned. Reactivate it first.');
      if (!canAssignRole(actor, targetRole)) throw forbidden('You cannot give someone that role');
    }

    const nextRole = changes.role ?? target.role;
    const nextStatus = changes.status ?? target.status;
    const losesProtectedRole = target.roleIsProtected && target.status === 'active' && (nextRole !== target.role || nextStatus !== 'active');
    if (losesProtectedRole && (await activeProtectedRoleUsersCount(client, target.id)) === 0) {
      throw badRequest('There must always be at least one active Super Admin');
    }
    if (statusChanges && changes.status === 'active' && target.status === 'invited') {
      throw badRequest('This person has not accepted their invitation yet');
    }

    const language = changes.language === undefined ? target.language : await effectiveLanguage(changes.language);
    let updated;
    try {
      const result = await client.query(
        `UPDATE users SET name = $2, email = $3, role = $4, status = $5, language = $6, updated_at = now()
          WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [id, changes.name ?? target.name, changes.email ?? target.email, nextRole, nextStatus, language]
      );
      updated = result.rows[0];
    } catch (error) {
      if (error.code === '23505') throw conflict('Someone with that email already exists');
      throw error;
    }
    return { before: target, after: updated, targetRole };
  });

  const { before, after, targetRole } = outcome;
  if (after.status === 'disabled' && before.status !== 'disabled') await revokeAllRefreshTokens(after.id);
  if (before.role !== after.role) {
    await dispatchEmail('users.roleChanged', [{ email: after.email, name: after.name, language: after.language }], (language) => ({
      old_role: roleDisplayLabel(language, before.role, before.role_name),
      new_role: roleDisplayLabel(language, after.role, targetRole?.name),
      changed_by: actor.name,
    }));
  }
  await recordActivity({
    actorId: actor.id,
    action: 'user.updated',
    entity: 'user',
    entityId: id,
    meta: Object.fromEntries(Object.keys(changes).map((key) => [key, key === 'email' ? '(changed)' : changes[key]])),
    ip,
    userAgent,
  });
  return toApiUser(after);
}

export async function deleteUser(actor, id, ip, userAgent) {
  if (!canDeleteUsers(actor)) throw forbidden('Your role cannot remove people.');
  await transaction(async (client) => {
    const target = await findUserWithRole(client.query.bind(client), id, { forUpdate: true });
    if (!target) throw notFound('No such user');
    if (target.id === actor.id) throw forbidden('You cannot remove yourself');
    if (!canManageTarget(actor, target)) throw forbidden('You cannot remove this person');
    if (target.roleIsProtected && target.status === 'active' && (await activeProtectedRoleUsersCount(client, target.id)) === 0) {
      throw badRequest('There must always be at least one active Super Admin');
    }
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  });
  await recordActivity({ actorId: actor.id, action: 'user.deleted', entity: 'user', entityId: id, ip, userAgent });
}

/** Starts a fresh invitation (the old link stops working). */
export async function resendInvite(actor, id) {
  if (!canEditUsers(actor)) throw forbidden('Your role cannot edit people.');
  const target = await findUserWithRole(query, id);
  if (!target) throw notFound('No such user');
  if (!canManageTarget(actor, target)) throw forbidden('You cannot change this person');
  if (target.status !== 'invited') throw badRequest('This person already accepted their invitation');
  await invalidateStoredTokens(id, 'invite');
  const token = await createStoredToken(id, 'invite', INVITE_TTL_MS);
  await dispatchEmail('users.invited', [{ email: target.email, name: target.name, language: target.language }], (language) => ({
    invited_by: actor.name,
    role: roleDisplayLabel(language, target.role, target.role_name),
    accept_link: `${config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`,
  }));
}
