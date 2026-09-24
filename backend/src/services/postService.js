import { config } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { PLATFORM_KEYS, PUBLISHERS, platformLabel } from '../providers/index.js';
import { ProviderError } from '../providers/errors.js';
import { REQUIRES_VIDEO, textProblems } from '../providers/limits.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './auditService.js';
import { campaignExists } from './campaignService.js';
import { mediaForIds } from './mediaService.js';
import { notifyRoles, notifyUser } from './notificationService.js';
import { canDeletePost, canEditPost, canPublishPosts } from './permissions.js';
import { connectedPlatforms, getPublishingContext, redact } from './socialAccountService.js';

const POST_SELECT = 'SELECT p.*, u.name AS creator_name FROM posts p LEFT JOIN users u ON u.id = p.created_by';
const STALE_AFTER = '10 minutes'; // a post "being published" for longer than this was interrupted
const APPROVER_ROLES = ['superAdmin', 'admin', 'editor'];
const platformOrder = (platform) => PLATFORM_KEYS.indexOf(platform);
const snippet = (text, max = 60) => (text.length > max ? `${text.slice(0, max).trim()}...` : text);

// ---------------------------------------------------------------- reading
function present(row, targets, media = []) {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    platforms: targets.map((target) => target.platform),
    scheduledAt: row.scheduled_at,
    createdBy: row.creator_name || 'Deleted user',
    createdById: row.created_by,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media,
    mediaUrl: media[0]?.publicUrl ?? null,
    campaignId: row.campaign_id,
    pinterestBoardId: targets.find((target) => target.platform === 'pinterest')?.board_id ?? null,
    targets: targets.map((target) => ({ platform: target.platform, status: target.status, error: target.error, url: target.url, publishedAt: target.published_at })),
  };
}

async function targetsByPost(ids) {
  const result = await query('SELECT * FROM post_targets WHERE post_id = ANY($1)', [ids]);
  const map = new Map(ids.map((id) => [id, []]));
  for (const row of result.rows) map.get(row.post_id).push(row);
  for (const list of map.values()) list.sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
  return map;
}

async function mediaByPost(ids) {
  const result = await query(
    `SELECT pm.post_id, pm.position, m.id, m.type, m.name, m.public_url
       FROM post_media pm JOIN media_items m ON m.id = pm.media_id
      WHERE pm.post_id = ANY($1) ORDER BY pm.position`,
    [ids]
  );
  const map = new Map(ids.map((id) => [id, []]));
  for (const row of result.rows) map.get(row.post_id).push({ id: row.id, type: row.type, name: row.name, publicUrl: row.public_url });
  return map;
}

export async function listPosts({ limit = 500 } = {}) {
  const rows = (await query(`${POST_SELECT} ORDER BY p.created_at DESC LIMIT $1`, [limit])).rows;
  const ids = rows.map((row) => row.id);
  const [targets, media] = await Promise.all([targetsByPost(ids), mediaByPost(ids)]);
  return rows.map((row) => present(row, targets.get(row.id), media.get(row.id)));
}

async function getRow(id) {
  return (await query(`${POST_SELECT} WHERE p.id = $1`, [id])).rows[0] ?? null;
}

export async function getPost(id) {
  const row = await getRow(id);
  if (!row) throw notFound('Post not found');
  const [targets, media] = await Promise.all([targetsByPost([id]), mediaByPost([id])]);
  return present(row, targets.get(id), media.get(id));
}

// ---------------------------------------------------------------- rules
function assertMayUseStatus(actor, status) {
  if (canPublishPosts(actor) || status === 'draft' || status === 'pendingApproval') return;
  throw forbidden('Your role can save drafts and submit posts for approval. An Editor or Admin has to schedule or publish them.');
}

/** Everything that must be true for a post to go out (or wait to go out), said in plain words. */
async function assertReady(status, { content, platforms, scheduledAt, hasImage, hasVideo, pinterestBoardId }) {
  if (status === 'draft') return;
  const problems = textProblems(platforms, content, platformLabel, { hasImage, hasVideo });
  if (problems.length) throw badRequest(problems[0], problems.map((message) => ({ field: 'content', message })));
  if (platforms.includes('pinterest') && !pinterestBoardId) {
    throw badRequest('Choose a Pinterest board for this post.', [{ field: 'pinterestBoardId', message: 'Required' }]);
  }

  if (status === 'scheduled') {
    if (!scheduledAt) throw badRequest('Pick a date and time to schedule this post.', [{ field: 'scheduledAt', message: 'Required' }]);
    if (new Date(scheduledAt) <= new Date()) throw badRequest('That time has already passed. Pick a time in the future.', [{ field: 'scheduledAt', message: 'In the past' }]);
  }
  if (status === 'scheduled' || status === 'published') {
    const connected = await connectedPlatforms(platforms);
    const missing = platforms.filter((platform) => !connected.has(platform));
    if (missing.length) {
      const names = missing.map(platformLabel).join(', ');
      throw badRequest(`${names} ${missing.length === 1 ? 'is' : 'are'} not connected. Connect ${missing.length === 1 ? 'it' : 'them'} in Social Accounts first.`, [{ field: 'platforms', message: names }]);
    }
  }
}

// ---------------------------------------------------------------- writing
/** Creates or replaces a post and its platform list in one step; "publish now" then runs straight away. */
async function writePost({ existing, actor, values, ip, userAgent }) {
  const publishNow = values.status === 'published';
  const storedStatus = publishNow ? 'publishing' : values.status;
  const scheduledAt = publishNow ? new Date() : values.scheduledAt;

  const id = await transaction(async (client) => {
    let postId = existing?.id;
    if (existing) {
      // Only while nobody (the scheduler, another tab) has started publishing it.
      const changed = await client.query(
        `UPDATE posts SET content = $2, status = $3, scheduled_at = $4, rejection_reason = NULL, locked_at = $5, campaign_id = $6, updated_at = now()
          WHERE id = $1 AND status IN ('draft', 'pendingApproval', 'rejected', 'scheduled', 'failed') RETURNING id`,
        [postId, values.content, storedStatus, scheduledAt, publishNow ? new Date() : null, values.campaignId]
      );
      if (!changed.rowCount) throw conflict('This post just changed or started publishing. Reload and try again.');
      await client.query('DELETE FROM post_targets WHERE post_id = $1', [postId]);
      await client.query('DELETE FROM post_media WHERE post_id = $1', [postId]);
    } else {
      const created = await client.query(
        'INSERT INTO posts (content, status, scheduled_at, created_by, locked_at, campaign_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [values.content, storedStatus, scheduledAt, actor.id, publishNow ? new Date() : null, values.campaignId]
      );
      postId = created.rows[0].id;
    }
    await client.query(
      `INSERT INTO post_targets (post_id, platform, board_id)
         SELECT $1, platform, CASE WHEN platform = 'pinterest' THEN $3::text ELSE NULL END
           FROM unnest($2::text[]) AS platform`,
      [postId, values.platforms, values.pinterestBoardId ?? null]
    );
    if (values.mediaIds.length) {
      await client.query(
        `INSERT INTO post_media (post_id, media_id, position)
           SELECT $1, media_id, ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS t(media_id, ord)`,
        [postId, values.mediaIds]
      );
    }
    return postId;
  });

  await recordActivity({ actorId: actor.id, action: existing ? 'post.updated' : 'post.created', entity: 'post', entityId: id, meta: { status: values.status, snippet: snippet(values.content) }, ip, userAgent });
  if (values.status === 'pendingApproval') {
    await notifyRoles(
      APPROVER_ROLES,
      {
        type: 'approvalRequested',
        title: 'Approval requested',
        message: `${actor.name} submitted "${snippet(values.content)}" for your approval.`,
        entityType: 'post',
        entityId: id,
      },
      actor.id
    );
  }
  if (publishNow) await runPublish(id, actor.id);
  return getPost(id);
}

export async function createPost({ actor, input, ip, userAgent }) {
  assertMayUseStatus(actor, input.status);
  const media = await mediaForIds(input.mediaIds);
  if (input.campaignId && !(await campaignExists(input.campaignId))) throw badRequest('That campaign no longer exists.');
  const values = {
    content: input.content,
    platforms: input.platforms,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    status: input.status,
    mediaIds: input.mediaIds ?? [],
    campaignId: input.campaignId ?? null,
    pinterestBoardId: input.pinterestBoardId ?? null,
  };
  await assertReady(values.status, { ...values, hasImage: media.some((item) => item.type === 'image'), hasVideo: media.some((item) => item.type === 'video') });
  return writePost({ existing: null, actor, values, ip, userAgent });
}

export async function updatePost({ id, actor, input, ip, userAgent }) {
  const row = await getRow(id);
  if (!row) throw notFound('Post not found');
  if (!canEditPost(actor, row)) throw forbidden('You can only change your own drafts and posts waiting for approval.');
  if (row.status === 'published' || row.status === 'publishing') throw conflict('A post that is published, or being published right now, cannot be edited.');
  const targets = (await targetsByPost([id])).get(id);
  if (row.status === 'failed' && targets.some((target) => target.status === 'published')) {
    throw conflict('Some platforms already published this post, so it cannot be edited. Retry the failed ones, or create a new post.');
  }

  const status = input.status ?? (row.status === 'failed' || row.status === 'rejected' ? 'draft' : row.status);
  assertMayUseStatus(actor, status);
  const existingMediaIds = (await mediaByPost([id])).get(id).map((item) => item.id);
  const mediaIds = input.mediaIds ?? existingMediaIds;
  const media = await mediaForIds(mediaIds);
  if (input.campaignId && !(await campaignExists(input.campaignId))) throw badRequest('That campaign no longer exists.');
  const values = {
    content: input.content ?? row.content,
    platforms: input.platforms ?? targets.map((target) => target.platform),
    scheduledAt: input.scheduledAt === undefined ? row.scheduled_at : input.scheduledAt ? new Date(input.scheduledAt) : null,
    status,
    mediaIds,
    campaignId: input.campaignId !== undefined ? input.campaignId : row.campaign_id,
    pinterestBoardId: input.pinterestBoardId !== undefined ? input.pinterestBoardId : targets.find((target) => target.platform === 'pinterest')?.board_id ?? null,
  };
  await assertReady(status, { ...values, hasImage: media.some((item) => item.type === 'image'), hasVideo: media.some((item) => item.type === 'video') });
  return writePost({ existing: row, actor, values, ip, userAgent });
}

export async function deletePost({ id, actor, ip, userAgent }) {
  const row = await getRow(id);
  if (!row) throw notFound('Post not found');
  if (!canDeletePost(actor, row)) throw forbidden('You cannot delete this post.');
  if (row.status === 'publishing') throw conflict('This post is being published right now. Try again in a minute.');
  await query('DELETE FROM posts WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'post.deleted', entity: 'post', entityId: id, meta: { status: row.status, snippet: snippet(row.content) }, ip, userAgent });
}

/** Runs one action over many posts; the ones this person may not touch (or that are mid-publish) are skipped, not fatal. */
export async function bulkChange({ action, ids, actor, ip, userAgent }) {
  let done = 0;
  for (const id of ids) {
    try {
      if (action === 'delete') await deletePost({ id, actor, ip, userAgent });
      else await updatePost({ id, actor, input: { status: 'draft' }, ip, userAgent });
      done += 1;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
  }
  return { done, skipped: ids.length - done };
}

// ---------------------------------------------------------------- approval
export async function approvePost({ id, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Your role cannot approve posts.');
  const row = await getRow(id);
  if (!row) throw notFound('Post not found');
  if (row.status !== 'pendingApproval') throw conflict('This post is not waiting for approval.');

  const platforms = (await targetsByPost([id])).get(id).map((target) => target.platform);
  const media = (await mediaByPost([id])).get(id);
  const later = row.scheduled_at && new Date(row.scheduled_at) > new Date();
  const status = later ? 'scheduled' : 'published';
  await assertReady(status, { content: row.content, platforms, scheduledAt: row.scheduled_at, hasImage: media.some((item) => item.type === 'image'), hasVideo: media.some((item) => item.type === 'video') });

  const moved = await query(
    `UPDATE posts SET status = $2, reviewed_by = $3, scheduled_at = $4, locked_at = $5, rejection_reason = NULL, updated_at = now()
      WHERE id = $1 AND status = 'pendingApproval' RETURNING id`,
    [id, later ? 'scheduled' : 'publishing', actor.id, later ? row.scheduled_at : new Date(), later ? null : new Date()]
  );
  if (!moved.rowCount) throw conflict('Someone else just reviewed this post.');
  await recordActivity({ actorId: actor.id, action: 'post.approved', entity: 'post', entityId: id, meta: { snippet: snippet(row.content) }, ip, userAgent });
  if (row.created_by) {
    await notifyUser(row.created_by, {
      type: 'approvalCompleted',
      title: 'Approval completed',
      message: `"${snippet(row.content)}" was approved${later ? ' and scheduled' : ''}.`,
      entityType: 'post',
      entityId: id,
    });
  }
  if (!later) await runPublish(id, actor.id);
  return getPost(id);
}

export async function rejectPost({ id, actor, reason, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Your role cannot reject posts.');
  const moved = await query(
    `UPDATE posts SET status = 'rejected', rejection_reason = $2, reviewed_by = $3, updated_at = now()
      WHERE id = $1 AND status = 'pendingApproval' RETURNING id, content, created_by`,
    [id, reason, actor.id]
  );
  if (!moved.rowCount) {
    if (!(await getRow(id))) throw notFound('Post not found');
    throw conflict('This post is not waiting for approval.');
  }
  await recordActivity({ actorId: actor.id, action: 'post.rejected', entity: 'post', entityId: id, meta: { reason, snippet: snippet(moved.rows[0].content) }, ip, userAgent });
  const rejected = moved.rows[0];
  if (rejected.created_by) {
    await notifyUser(rejected.created_by, {
      type: 'approvalCompleted',
      title: 'Approval completed',
      message: `"${snippet(rejected.content)}" was rejected: ${reason}`,
      entityType: 'post',
      entityId: id,
    });
  }
  return getPost(id);
}

// ---------------------------------------------------------------- publishing
/** The post's first attached image or video, in the raw shape publishers.js needs to read its bytes — or null. */
async function firstMediaForPost(postId, type) {
  const row = (
    await query(
      `SELECT m.* FROM post_media pm JOIN media_items m ON m.id = pm.media_id
        WHERE pm.post_id = $1 AND m.type = $2 ORDER BY pm.position LIMIT 1`,
      [postId, type]
    )
  ).rows[0];
  return row ?? null;
}

async function attempt(post, platform, media, boardId) {
  const label = platformLabel(platform);
  const publish = PUBLISHERS[platform];
  if (!publish) return { ok: false, message: `${label} cannot take this post.` };
  const context = await getPublishingContext(platform);
  if (!context) return { ok: false, message: `${label} is not connected right now. Connect it again in Social Accounts, then retry.` };

  try {
    return { ok: true, ...(await publish({ ...context, text: post.content, key: `social-${post.id}-${platform}`, media, boardId })) };
  } catch (error) {
    if (error instanceof ProviderError) {
      const unsure = error.kind === 'unreachable' ? ' Social could not confirm whether it was posted, so check the platform before retrying.' : '';
      return { ok: false, message: `${redact(error.message, context.credentials)}${unsure}` };
    }
    logger.error('Unexpected error while publishing', error, { platform, postId: post.id });
    return { ok: false, message: `Something went wrong while sending to ${label}. Check the platform before retrying.` };
  }
}

/** Sets the post's overall status from its platforms: all done = published, anything failed = failed, still going = publishing. */
async function finalize(ids) {
  const result = await query(
    `UPDATE posts p SET locked_at = NULL, updated_at = now(), status = CASE
        WHEN EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = p.id AND t.status IN ('pending', 'publishing')) THEN 'publishing'
        WHEN NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = p.id AND t.status <> 'published') THEN 'published'
        ELSE 'failed' END
      WHERE p.id = ANY($1) RETURNING p.id, p.status`,
    [ids]
  );
  return result.rows;
}

/**
 * Sends a post to every platform still waiting. Each platform is claimed before it is contacted, so two
 * runs (a retry and the scheduler, two servers) can never send the same one twice. Never throws.
 */
export async function runPublish(postId, actorId = null) {
  try {
    const post = (await query('SELECT id, content, created_by FROM posts WHERE id = $1', [postId])).rows[0];
    if (!post) return;
    const claimed = (
      await query("UPDATE post_targets SET status = 'publishing', error = NULL, updated_at = now() WHERE post_id = $1 AND status = 'pending' RETURNING platform, board_id", [postId])
    ).rows;
    const [firstImage, firstVideo] = claimed.length
      ? await Promise.all([firstMediaForPost(postId, 'image'), firstMediaForPost(postId, 'video')])
      : [null, null];

    const failedPlatforms = [];
    await Promise.all(
      claimed.map(async ({ platform, board_id: boardId }) => {
        const media = REQUIRES_VIDEO.has(platform) ? firstVideo : firstImage;
        const outcome = await attempt(post, platform, media, boardId);
        if (!outcome.ok) failedPlatforms.push(platform);
        await query(
          `UPDATE post_targets SET status = $3, external_id = $4, url = $5, error = $6, published_at = $7, updated_at = now()
            WHERE post_id = $1 AND platform = $2`,
          [postId, platform, outcome.ok ? 'published' : 'failed', outcome.externalId ?? null, outcome.url ?? null, outcome.ok ? null : outcome.message, outcome.ok ? new Date() : null]
        );
      })
    );

    const [{ status }] = await finalize([postId]);
    await recordActivity({ actorId, action: status === 'published' ? 'post.published' : 'post.failed', entity: 'post', entityId: postId, meta: { snippet: snippet(post.content) } });
    if (post.created_by) {
      await notifyUser(post.created_by, {
        type: status === 'published' ? 'postPublished' : 'postFailed',
        title: status === 'published' ? 'Post published' : 'Post failed',
        message:
          status === 'published'
            ? `"${snippet(post.content)}" was published.`
            : `"${snippet(post.content)}" failed to publish on ${failedPlatforms.map(platformLabel).join(', ')}.`,
        entityType: 'post',
        entityId: postId,
      });
    }
  } catch (error) {
    logger.error('Publishing a post failed unexpectedly', error, { postId });
  }
}

export async function retryPost({ id, actor, ip, userAgent }) {
  if (!canPublishPosts(actor)) throw forbidden('Your role cannot retry a post.');
  const moved = await query("UPDATE posts SET status = 'publishing', locked_at = now(), updated_at = now() WHERE id = $1 AND status = 'failed' RETURNING id, content", [id]);
  if (!moved.rowCount) {
    if (!(await getRow(id))) throw notFound('Post not found');
    throw conflict('Only a failed post can be retried.');
  }
  await query("UPDATE post_targets SET status = 'pending', error = NULL, updated_at = now() WHERE post_id = $1 AND status = 'failed'", [id]);
  await recordActivity({ actorId: actor.id, action: 'post.retried', entity: 'post', entityId: id, meta: { snippet: snippet(moved.rows[0].content) }, ip, userAgent });
  await runPublish(id, actor.id);
  return getPost(id);
}

// ---------------------------------------------------------------- the scheduler
let running = false;

/** A crash or restart halfway through leaves posts "publishing". We cannot know what went out, so say so instead of guessing. */
async function recoverInterrupted() {
  const stale = (await query(`SELECT id FROM posts WHERE status = 'publishing' AND locked_at < now() - $1::interval`, [STALE_AFTER])).rows.map((row) => row.id);
  if (!stale.length) return;
  await query(
    `UPDATE post_targets SET status = 'failed', updated_at = now(),
            error = 'Publishing was interrupted (the server stopped). Check the platform to see whether it went out, then retry.'
      WHERE post_id = ANY($1) AND status IN ('pending', 'publishing')`,
    [stale]
  );
  await finalize(stale);
  logger.warn('Recovered posts interrupted while publishing', { count: stale.length });
}

/** Posts that should have gone out long ago (the server was off) are not sent late; they wait for a person to retry. */
async function expireMissed() {
  await query(
    `WITH late AS (
       UPDATE posts SET status = 'failed', updated_at = now()
        WHERE status = 'scheduled' AND scheduled_at < now() - $1::interval RETURNING id)
     UPDATE post_targets SET status = 'failed', updated_at = now(),
            error = 'Missed its scheduled time (Social was not running), so it was not sent. Retry to publish it now.'
      WHERE post_id IN (SELECT id FROM late) AND status = 'pending'`,
    [`${config.scheduler.graceMs / 60000} minutes`]
  );
}

/** One pass: send every scheduled post whose time has come. Safe to run from several servers at once. */
export async function runSchedulerPass() {
  if (running) return 0;
  running = true;
  try {
    await recoverInterrupted();
    await expireMissed();
    const due = (
      await query(
        `UPDATE posts SET status = 'publishing', locked_at = now(), updated_at = now()
          WHERE id IN (SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT 10 FOR UPDATE SKIP LOCKED)
          RETURNING id`
      )
    ).rows;
    for (const { id } of due) await runPublish(id);
    return due.length;
  } finally {
    running = false;
  }
}

/** Returns a function that stops it. Switched off with SCHEDULER_INTERVAL_SEC=0. */
export function startScheduler() {
  if (!config.scheduler.intervalMs) return () => {};
  const pass = () => runSchedulerPass().catch((error) => logger.error('Scheduler pass failed', error));
  const first = setTimeout(pass, 3000);
  const timer = setInterval(pass, config.scheduler.intervalMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
