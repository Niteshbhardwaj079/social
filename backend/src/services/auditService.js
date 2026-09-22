import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { describeDevice } from '../utils/device.js';

/**
 * Records who did what (sign-ins, user changes, settings edits...). A failure to write the
 * log must never break the action itself, so errors are logged and swallowed.
 */
export async function recordActivity({ actorId = null, action, entity = null, entityId = null, meta = {}, ip = null, userAgent = null }) {
  try {
    await query(
      'INSERT INTO activity_logs (actor_id, action, entity, entity_id, meta, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [actorId, action, entity, entityId === null ? null : String(entityId), JSON.stringify(meta), ip, userAgent?.slice(0, 300) ?? null]
    );
  } catch (error) {
    logger.error('Could not record activity', error, { action });
  }
}

export async function listActivity({ limit = 50, before = null } = {}) {
  const result = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.ip, a.user_agent, a.created_at,
            u.id AS actor_id, u.name AS actor_name, u.email AS actor_email
       FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id
      WHERE ($2::bigint IS NULL OR a.id < $2)
      ORDER BY a.id DESC LIMIT $1`,
    [limit, before]
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    meta: row.meta,
    ip: row.ip,
    device: describeDevice(row.user_agent),
    createdAt: row.created_at,
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name, email: row.actor_email } : null,
  }));
}

/** Bulk delete, for the Activity Logs page's "Delete matching" / row-selection actions. */
export async function deleteActivityByIds(ids) {
  await query('DELETE FROM activity_logs WHERE id = ANY($1::bigint[])', [ids]);
}
