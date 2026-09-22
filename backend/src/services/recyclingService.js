import { config } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';
import { getPost, runPublish } from './postService.js';
import { canPublishPosts } from './permissions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function present(row, post) {
  return {
    id: row.id,
    postId: row.post_id,
    content: post.content,
    platforms: post.platforms,
    intervalDays: row.interval_days,
    isActive: row.is_active,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    totalReposts: row.total_reposts,
  };
}

async function getRow(id) {
  return (await query('SELECT * FROM recycling_entries WHERE id = $1', [id])).rows[0] ?? null;
}

export async function listRecycling() {
  const rows = (await query('SELECT * FROM recycling_entries ORDER BY created_at DESC')).rows;
  const posts = await Promise.all(rows.map((row) => getPost(row.post_id)));
  return rows.map((row, index) => present(row, posts[index]));
}

export async function addToRecycling({ actor, input, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can manage the recycling queue.');
  const post = await getPost(input.postId);
  if (post.status !== 'published') throw badRequest('Only a published post can be added to recycling.');

  let row;
  try {
    row = (
      await query(
        `INSERT INTO recycling_entries (post_id, interval_days, next_run_at, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.postId, input.intervalDays, new Date(Date.now() + input.intervalDays * DAY_MS), actor.id]
      )
    ).rows[0];
  } catch (error) {
    if (error.code === '23505') throw conflict('This post is already in the recycling queue.');
    throw error;
  }
  await recordActivity({ actorId: actor.id, action: 'recycling.added', entity: 'recycling_entry', entityId: row.id, meta: { snippet: post.content.slice(0, 60) }, ip, userAgent });
  return present(row, post);
}

export async function updateRecyclingEntry({ id, actor, input, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can manage the recycling queue.');
  const existing = await getRow(id);
  if (!existing) throw notFound('Recycling entry not found');

  const intervalDays = input.intervalDays ?? existing.interval_days;
  // Changing the interval re-bases the next repost from right now, not from whenever it last ran —
  // matches what someone means by "every N days" when they change it mid-way.
  const nextRunAt = input.intervalDays !== undefined && input.intervalDays !== existing.interval_days ? new Date(Date.now() + intervalDays * DAY_MS) : existing.next_run_at;
  const row = (
    await query(
      `UPDATE recycling_entries SET is_active = $2, interval_days = $3, next_run_at = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, input.isActive ?? existing.is_active, intervalDays, nextRunAt]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'recycling.updated', entity: 'recycling_entry', entityId: id, ip, userAgent });
  return present(row, await getPost(row.post_id));
}

export async function bulkUpdateRecycling({ ids, isActive, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can manage the recycling queue.');
  const result = await query('UPDATE recycling_entries SET is_active = $2, updated_at = now() WHERE id = ANY($1) RETURNING id', [ids, isActive]);
  await recordActivity({ actorId: actor.id, action: 'recycling.updated', entity: 'recycling_entry', meta: { bulk: true, count: result.rowCount, isActive }, ip, userAgent });
  return { success: true, updated: result.rowCount };
}

export async function removeFromRecycling({ id, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can manage the recycling queue.');
  const result = await query('DELETE FROM recycling_entries WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw notFound('Recycling entry not found');
  await recordActivity({ actorId: actor.id, action: 'recycling.removed', entity: 'recycling_entry', entityId: id, ip, userAgent });
}

export async function removeManyFromRecycling({ ids, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Only an Editor or Admin can manage the recycling queue.');
  const result = await query('DELETE FROM recycling_entries WHERE id = ANY($1) RETURNING id', [ids]);
  await recordActivity({ actorId: actor.id, action: 'recycling.removed', entity: 'recycling_entry', meta: { bulk: true, count: result.rowCount }, ip, userAgent });
  return { success: true, removed: result.rowCount };
}

// ---------------------------------------------------------------- the repost scheduler
/** Copies a post's content, platforms and media into a brand-new post and publishes it right away. */
async function repost(entry) {
  const source = await getPost(entry.post_id);
  const postId = await transaction(async (client) => {
    const created = await client.query(
      `INSERT INTO posts (content, status, scheduled_at, created_by, locked_at) VALUES ($1, 'publishing', now(), $2, now()) RETURNING id`,
      [source.content, source.createdById]
    );
    const id = created.rows[0].id;
    await client.query(
      `INSERT INTO post_targets (post_id, platform, board_id)
         SELECT $1, platform, CASE WHEN platform = 'pinterest' THEN $3::text ELSE NULL END
           FROM unnest($2::text[]) AS platform`,
      [id, source.platforms, source.pinterestBoardId]
    );
    if (source.media.length) {
      await client.query(
        `INSERT INTO post_media (post_id, media_id, position) SELECT $1, media_id, ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS t(media_id, ord)`,
        [id, source.media.map((item) => item.id)]
      );
    }
    return id;
  });
  await runPublish(postId, null);
  return postId;
}

/**
 * One pass: reposts every active entry whose time has come. Each entry is claimed AND has its schedule
 * advanced in the same atomic UPDATE (matches postService.js's scheduler pattern), so two passes racing
 * on the same entry can never repost it twice, and a repost that fails on every platform still moves the
 * schedule forward rather than being retried every pass forever — the new post's own status (and the
 * usual postPublished/postFailed notification to whoever created the original) is where the real
 * per-platform result lives; `total_reposts` only counts that an attempt was made, not that it succeeded.
 */
export async function runRecyclingPass() {
  const due = (
    await query(
      `UPDATE recycling_entries SET
          last_run_at = now(), next_run_at = now() + (interval_days || ' days')::interval,
          total_reposts = total_reposts + 1, updated_at = now()
        WHERE id IN (
          SELECT id FROM recycling_entries WHERE is_active AND next_run_at <= now() ORDER BY next_run_at LIMIT 20 FOR UPDATE SKIP LOCKED
        )
        RETURNING *`
    )
  ).rows;
  for (const entry of due) {
    try {
      const newPostId = await repost(entry);
      await recordActivity({ actorId: null, action: 'recycling.reposted', entity: 'recycling_entry', entityId: entry.id, meta: { newPostId } });
    } catch (error) {
      logger.error('Recycling repost failed', error, { entryId: entry.id });
    }
  }
  return due.length;
}

export function startRecyclingScheduler() {
  if (!config.recycling.intervalMs) return () => {};
  const timer = setInterval(() => {
    runRecyclingPass().catch((error) => logger.error('Recycling pass failed', error));
  }, config.recycling.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
