import { config } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { roleLabel } from '../emails/builder.js';
import { canAssignRole, canManageTarget } from './permissions.js';
import { createStoredToken, invalidateStoredTokens, revokeAllRefreshTokens } from './tokenService.js';
import { dispatchEmail } from './systemEmailService.js';
import { effectiveLanguage } from './settingsService.js';
import { recordActivity } from './auditService.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How a user looks to the outside world (never includes the password hash or tokens). */
export function toApiUser(row) {
  return {
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
}

const USER_COLUMNS = 'id, name, email, role, status, language, avatar_url, last_active_at, created_at';

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

export async function findUserById(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function activeSuperAdminCount(client, excludingId = null) {
  const result = await client.query(
    "SELECT count(*) AS n FROM users WHERE role = 'superAdmin' AND status = 'active' AND ($1::uuid IS NULL OR id <> $1)",
    [excludingId]
  );
  return result.rows[0].n;
}

/** Invites a person: creates the account (no password yet), emails them a link in THEIR language. */
export async function createUser(actor, { name, email, role, language }, ip, userAgent) {
  if (!canAssignRole(actor, role)) throw forbidden('You cannot invite someone with that role');
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
    role: roleLabel(language, created.role),
    accept_link: acceptLink,
  }));

  // Every Super Admin gets a heads-up, each in their own language.
  const admins = await query("SELECT name, email, language FROM users WHERE role = 'superAdmin' AND status = 'active' AND id <> $1", [created.id]);
  await dispatchEmail('users.created', admins.rows, (language) => ({
    new_user_name: created.name,
    new_user_email: created.email,
    role: roleLabel(language, created.role),
    added_by: actor.name,
    users_url: `${config.appUrl}/users`,
  }));

  await recordActivity({ actorId: actor.id, action: 'user.invited', entity: 'user', entityId: created.id, meta: { email: created.email, role }, ip, userAgent });
  // `invitation` says whether the email went out and in which language ([] = that email is switched off).
  return { user: toApiUser(created), invitation: { sent: invitation.length > 0, language: invitation[0]?.language ?? created.language } };
}

export async function updateUser(actor, id, changes, ip, userAgent) {
  const outcome = await transaction(async (client) => {
    const found = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
    const target = found.rows[0];
    if (!target) throw notFound('No such user');

    const isSelf = target.id === actor.id;
    // A form that re-sends the current role/status is not asking for a change.
    const roleChanges = changes.role !== undefined && changes.role !== target.role;
    const statusChanges = changes.status !== undefined && changes.status !== target.status;
    if (!isSelf && !canManageTarget(actor, target)) throw forbidden('You cannot change this person');
    if (isSelf && (roleChanges || statusChanges)) throw forbidden('You cannot change your own role or status');
    if (roleChanges && !canAssignRole(actor, changes.role)) throw forbidden('You cannot give someone that role');

    const nextRole = changes.role ?? target.role;
    const nextStatus = changes.status ?? target.status;
    const losesSuperAdmin = target.role === 'superAdmin' && target.status === 'active' && (nextRole !== 'superAdmin' || nextStatus !== 'active');
    if (losesSuperAdmin && (await activeSuperAdminCount(client, target.id)) === 0) {
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
    return { before: target, after: updated };
  });

  const { before, after } = outcome;
  if (after.status === 'disabled' && before.status !== 'disabled') await revokeAllRefreshTokens(after.id);
  if (before.role !== after.role) {
    await dispatchEmail('users.roleChanged', [{ email: after.email, name: after.name, language: after.language }], (language) => ({
      old_role: roleLabel(language, before.role),
      new_role: roleLabel(language, after.role),
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
  await transaction(async (client) => {
    const found = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
    const target = found.rows[0];
    if (!target) throw notFound('No such user');
    if (target.id === actor.id) throw forbidden('You cannot remove yourself');
    if (!canManageTarget(actor, target)) throw forbidden('You cannot remove this person');
    if (target.role === 'superAdmin' && target.status === 'active' && (await activeSuperAdminCount(client, target.id)) === 0) {
      throw badRequest('There must always be at least one active Super Admin');
    }
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  });
  await recordActivity({ actorId: actor.id, action: 'user.deleted', entity: 'user', entityId: id, ip, userAgent });
}

/** Starts a fresh invitation (the old link stops working). */
export async function resendInvite(actor, id) {
  const target = await findUserById(id);
  if (!target) throw notFound('No such user');
  if (!canManageTarget(actor, target)) throw forbidden('You cannot change this person');
  if (target.status !== 'invited') throw badRequest('This person already accepted their invitation');
  await invalidateStoredTokens(id, 'invite');
  const token = await createStoredToken(id, 'invite', INVITE_TTL_MS);
  await dispatchEmail('users.invited', [{ email: target.email, name: target.name, language: target.language }], (language) => ({
    invited_by: actor.name,
    role: roleLabel(language, target.role),
    accept_link: `${config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`,
  }));
}
