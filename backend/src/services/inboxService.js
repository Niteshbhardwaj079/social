import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { HttpError, badRequest, notFound } from '../utils/httpError.js';
import { listComments, postReply, COMMENTS_SUPPORTED_PLATFORMS } from '../providers/comments.js';
import { ProviderError } from '../providers/errors.js';
import { platformLabel } from '../providers/index.js';
import { getPublishingContext, redact } from './socialAccountService.js';
import { recordActivity } from './auditService.js';
import { notifyRoles } from './notificationService.js';
import { dispatchEmail } from './systemEmailService.js';

// Who can see/act on the Inbox — the same roles who already get an "approval requested" notification,
// since this is the same kind of "someone needs to act on this" engagement work.
const INBOX_ROLES = ['superAdmin', 'admin', 'editor'];
const snippet = (text, max = 60) => (text.length > max ? `${text.slice(0, max).trim()}...` : text);

function present(row, replies) {
  const lastReply = replies[replies.length - 1];
  return {
    id: row.id,
    postId: row.post_id,
    platform: row.platform,
    customerName: row.author_name,
    status: row.status,
    isUnread: row.is_unread,
    lastMessage: lastReply ? lastReply.text : row.text,
    lastMessageAt: lastReply ? lastReply.created_at : row.created_at,
    assignedTo: row.assigned_to_name || null,
    assignedToId: row.assigned_to || null,
    messages: [
      { id: row.id, sender: 'customer', text: row.text, time: row.created_at },
      ...replies.map((reply) => ({ id: reply.id, sender: 'agent', text: reply.text, time: reply.created_at })),
    ],
    // Only what the platform's comment payload actually included — resolveProfileFields() on the
    // frontend already hides anything undefined, so nothing here is ever a guessed/placeholder value.
    customerProfile: {
      handle: row.author_handle ?? undefined,
      userId: row.author_external_id ?? undefined,
      followers: row.author_followers ?? undefined,
      following: row.author_following ?? undefined,
      posts: row.author_posts_count ?? undefined,
      verified: row.author_verified ?? undefined,
      joinedAt: row.author_joined_at ?? undefined,
      bio: row.author_bio ?? undefined,
      profileUrl: row.author_profile_url ?? undefined,
    },
  };
}

async function getRow(id) {
  const result = await query(
    `SELECT c.*, u.name AS assigned_to_name FROM inbox_conversations c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

async function repliesFor(ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = (await query('SELECT * FROM inbox_replies WHERE conversation_id = ANY($1) ORDER BY created_at ASC', [ids])).rows;
  for (const row of rows) map.get(row.conversation_id).push(row);
  return map;
}

export async function listConversations() {
  const rows = (
    await query('SELECT c.*, u.name AS assigned_to_name FROM inbox_conversations c LEFT JOIN users u ON u.id = c.assigned_to ORDER BY c.created_at DESC')
  ).rows;
  const repliesByConversation = await repliesFor(rows.map((row) => row.id));
  return rows.map((row) => present(row, repliesByConversation.get(row.id)));
}

/** The real people a conversation can be assigned to — just id+name, not the full Users & Roles record, so anyone who can use the Inbox may see it (matches how a name already appears elsewhere, e.g. "created by"). */
export async function listAssignableUsers() {
  return (await query("SELECT id, name FROM users WHERE status = 'active' ORDER BY name")).rows;
}

export async function markRead(id) {
  const result = await query('UPDATE inbox_conversations SET is_unread = false WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw notFound('Conversation not found');
}

export async function updateStatus(id, status) {
  const result = await query('UPDATE inbox_conversations SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
  if (!result.rowCount) throw notFound('Conversation not found');
}

export async function assignConversation(id, userId) {
  if (userId) {
    const user = await query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [userId]);
    if (!user.rows[0]) throw badRequest('That person is not an active user.');
  }
  const result = await query('UPDATE inbox_conversations SET assigned_to = $2 WHERE id = $1 RETURNING id', [id, userId || null]);
  if (!result.rowCount) throw notFound('Conversation not found');
}

/** Sends a real reply to the real platform, under the same connected account that published the post. */
export async function sendReply(id, actor, text, { ip, userAgent } = {}) {
  const row = await getRow(id);
  if (!row) throw notFound('Conversation not found');
  const context = await getPublishingContext(row.platform);
  if (!context) throw new HttpError(409, 'not_connected', `${platformLabel(row.platform)} is not connected. Reconnect it to reply.`);

  const target = (await query('SELECT external_id FROM post_targets WHERE post_id = $1 AND platform = $2', [row.post_id, row.platform])).rows[0];
  let externalReplyId = null;
  try {
    const result = await postReply(row.platform, {
      credentials: context.credentials,
      externalCommentId: row.external_comment_id,
      text,
      meta: row.meta,
      rootExternalId: target?.external_id,
    });
    externalReplyId = result?.externalReplyId ?? null;
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(422, 'reply_failed', redact(error.message, context.credentials));
    throw error;
  }

  const reply = (
    await query('INSERT INTO inbox_replies (conversation_id, text, sent_by, external_reply_id) VALUES ($1, $2, $3, $4) RETURNING *', [
      id,
      text,
      actor.id,
      externalReplyId,
    ])
  ).rows[0];
  await query('UPDATE inbox_conversations SET is_unread = false WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'inbox.replied', entity: 'inbox_conversation', entityId: id, meta: { platform: row.platform }, ip, userAgent });
  return { id: reply.id, sender: 'agent', text: reply.text, time: reply.created_at };
}

async function notifyNewComment(postId, platform, conversationId, comment) {
  const post = (await query('SELECT content FROM posts WHERE id = $1', [postId])).rows[0];
  const message = `${comment.authorName} commented on your ${platformLabel(platform)} post: "${snippet(comment.text)}"`;
  await notifyRoles(INBOX_ROLES, { type: 'newComment', title: 'New comment', message, entityType: 'inbox_conversation', entityId: conversationId });
  const recipients = (await query("SELECT name, email, language FROM users WHERE role = ANY($1) AND status = 'active'", [INBOX_ROLES])).rows;
  await dispatchEmail('inbox.newComment', recipients, () => ({
    commenter_name: comment.authorName,
    comment_text: snippet(comment.text, 200),
    post_excerpt: snippet(post?.content || '', 100),
    inbox_url: `${config.appUrl}/inbox`,
  }));
}

let refreshingInbox = false;

/**
 * One pass: for every published post on a platform whose comments this app can read (see
 * providers/comments.js), fetches new top-level comments and saves the ones not already stored — an
 * existing conversation's status/assignment/read-state is never touched by a re-poll. One broken
 * post/platform never stops the rest, mirrors analyticsService's refreshPostMetrics().
 */
export async function refreshInboxComments(refreshIntervalMin) {
  if (refreshingInbox) return;
  refreshingInbox = true;
  try {
    const due = (
      await query(
        `SELECT post_id, platform, external_id FROM post_targets
          WHERE status = 'published' AND platform = ANY($1) AND external_id IS NOT NULL
            AND published_at > now() - interval '90 days'
            AND (comments_checked_at IS NULL OR comments_checked_at < now() - ($2 || ' minutes')::interval)
          ORDER BY published_at DESC`,
        [COMMENTS_SUPPORTED_PLATFORMS, String(refreshIntervalMin)]
      )
    ).rows;

    for (const target of due) {
      try {
        const context = await getPublishingContext(target.platform);
        if (!context) {
          await query('UPDATE post_targets SET comments_checked_at = now() WHERE post_id = $1 AND platform = $2', [target.post_id, target.platform]);
          continue;
        }
        const comments = await listComments(target.platform, { credentials: context.credentials, externalId: target.external_id });
        for (const comment of comments) {
          const inserted = await query(
            `INSERT INTO inbox_conversations
               (post_id, platform, external_comment_id, author_name, author_handle, author_external_id, author_followers,
                author_following, author_posts_count, author_verified, author_joined_at, author_bio, author_profile_url,
                text, meta, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (platform, external_comment_id) DO NOTHING
             RETURNING id`,
            [
              target.post_id,
              target.platform,
              comment.externalCommentId,
              comment.authorName,
              comment.authorHandle ?? null,
              comment.authorExternalId ?? null,
              comment.authorFollowers ?? null,
              comment.authorFollowing ?? null,
              comment.authorPostsCount ?? null,
              comment.authorVerified ?? null,
              comment.authorJoinedAt ?? null,
              comment.authorBio ?? null,
              comment.authorProfileUrl ?? null,
              comment.text,
              JSON.stringify(comment.meta || {}),
              comment.createdAt,
            ]
          );
          if (inserted.rows[0]) await notifyNewComment(target.post_id, target.platform, inserted.rows[0].id, comment);
        }
        await query('UPDATE post_targets SET comments_checked_at = now() WHERE post_id = $1 AND platform = $2', [target.post_id, target.platform]);
      } catch (error) {
        logger.error("Could not refresh a post's comments", error, { platform: target.platform, postId: target.post_id });
        await query('UPDATE post_targets SET comments_checked_at = now() WHERE post_id = $1 AND platform = $2', [target.post_id, target.platform]).catch(() => {});
      }
    }
  } finally {
    refreshingInbox = false;
  }
}

/** Runs refreshInboxComments() on a timer. 0 = off (same convention as the other background jobs). */
export function startInboxRefresher() {
  if (!config.inbox.refreshIntervalMs) return () => {};
  const timer = setInterval(() => {
    refreshInboxComments(config.inbox.refreshIntervalMin).catch((error) => logger.error('Inbox refresh pass failed', error));
  }, config.inbox.refreshIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
