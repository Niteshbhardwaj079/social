import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export const NOTIFICATION_TYPES = [
  'postPublished',
  'postFailed',
  'approvalRequested',
  'approvalCompleted',
  'newMessage',
  'newComment',
  'accountDisconnected',
  'tokenExpired',
  'accountRevoked',
  'accountNeedsAttention',
];

function present(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

async function insertMany(rows) {
  if (!rows.length) return;
  const values = [];
  const params = [];
  rows.forEach((row, index) => {
    const base = index * 6;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    params.push(row.userId, row.type, row.title, row.message, row.entityType ?? null, row.entityId == null ? null : String(row.entityId));
  });
  await query(`INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES ${values.join(', ')}`, params);
}

/**
 * Notifies one person, unless they have turned this type of notification off.
 * Never throws — a notification failing to write must not break the action that triggered it (a post
 * publishing, an approval going through...).
 */
export async function notifyUser(userId, { type, title, message, entityType = null, entityId = null }) {
  try {
    const row = (await query('SELECT notification_prefs FROM users WHERE id = $1', [userId])).rows[0];
    if (!row || row.notification_prefs?.[type] === false) return;
    await insertMany([{ userId, type, title, message, entityType, entityId }]);
  } catch (error) {
    logger.error('Could not create a notification', error, { type });
  }
}

/** Notifies every active person in one of these roles (e.g. everyone who can approve a post), skipping opt-outs. */
export async function notifyRoles(roles, { type, title, message, entityType = null, entityId = null }, excludeUserId = null) {
  try {
    const rows = (
      await query(`SELECT id, notification_prefs FROM users WHERE role = ANY($1) AND status = 'active' AND ($2::uuid IS NULL OR id <> $2)`, [
        roles,
        excludeUserId,
      ])
    ).rows;
    const recipients = rows.filter((row) => row.notification_prefs?.[type] !== false);
    await insertMany(recipients.map((row) => ({ userId: row.id, type, title, message, entityType, entityId })));
  } catch (error) {
    logger.error('Could not create notifications', error, { type });
  }
}

/** The most recent notifications for one person, and how many of them (in total, not just this page) are unread. */
export async function listNotifications(userId, { limit = 30 } = {}) {
  const [items, unread] = await Promise.all([
    query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]),
    query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false', [userId]),
  ]);
  return { items: items.rows.map(present), unreadCount: unread.rows[0].n };
}

export async function markAsRead(userId, id) {
  await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function markAllAsRead(userId) {
  await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
}

export async function getPreferences(userId) {
  const row = (await query('SELECT notification_prefs FROM users WHERE id = $1', [userId])).rows[0];
  return row?.notification_prefs ?? {};
}

/** Merges the given types into the person's preferences (only the keys sent are changed). */
export async function setPreferences(userId, prefs) {
  const row = (
    await query('UPDATE users SET notification_prefs = notification_prefs || $2::jsonb, updated_at = now() WHERE id = $1 RETURNING notification_prefs', [
      userId,
      JSON.stringify(prefs),
    ])
  ).rows[0];
  return row.notification_prefs;
}
