import { query } from '../db/pool.js';
import { loadActor } from '../middleware/auth.js';
import { eventOn } from '../ai/free/events.js';
import { assertAiAvailable } from './aiAccessService.js';
import { getBrandKitRow, takeNextIdea } from './aiAgentService.js';
import { createImage, registerJobStep, writePosts } from './aiService.js';
import { createPost } from './postService.js';
import { canManageAutopilots } from './permissions.js';
import { atLocalTime, isValidTimeZone, isoOf, localDate } from '../utils/timezone.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { notifyUser } from './notificationService.js';

/**
 * "Plan my week": the agent prepares several days of posts in one go — a fresh idea each time
 * (research ideas, festivals on their day, else the Brand Kit), text or text + picture, each scheduled
 * at the chosen time. With approval on (default) they wait in Approvals; approving one schedules it.
 * Runs in the AI job worker (it can take a few minutes with pictures), never inside a web request.
 */

// What "mix" means, day by day: mostly pictures (they get more reach), some text-only.
const MIX = ['image', 'text', 'image', 'image', 'text', 'image', 'text'];

export function presentPlan(row) {
  return {
    id: row.id,
    engine: row.engine,
    status: row.status,
    options: row.options,
    postIds: row.post_ids,
    error: row.error,
    autopilotId: row.autopilot_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export async function listPlans(limit = 20) {
  return (await query('SELECT * FROM ai_content_plans ORDER BY created_at DESC LIMIT $1', [limit])).rows.map(presentPlan);
}

export async function getPlan(id) {
  const row = (await query('SELECT * FROM ai_content_plans WHERE id = $1', [id])).rows[0];
  if (!row) throw notFound('Plan not found');
  return presentPlan(row);
}

/** Queues a plan. Returns it at once (status 'queued'); the AI job worker builds the posts. */
export async function createPlan(actor, input, { autopilotId = null } = {}) {
  await assertAiAvailable(actor);
  if (!canManageAutopilots(actor)) throw forbidden('Your role cannot plan posts with AI. Ask an admin for the "AI autopilot" permission.');
  if (!isValidTimeZone(input.timezone)) throw badRequest('Unknown time zone.');
  const options = {
    days: input.days,
    postsPerDay: input.postsPerDay,
    platforms: input.platforms,
    format: input.format,
    language: input.language,
    tone: input.tone,
    postTime: input.postTime,
    timezone: input.timezone,
    requireApproval: input.requireApproval,
  };
  const row = (await query('INSERT INTO ai_content_plans (options, autopilot_id, created_by) VALUES ($1, $2, $3) RETURNING *', [options, autopilotId, actor.id])).rows[0];
  return presentPlan(row);
}

/** The moments to post at: from tomorrow, `postsPerDay` a day, 3 hours apart from `postTime`. */
export function planSlots({ days, postsPerDay, postTime, timezone }, from = new Date()) {
  const [hour, minute] = postTime.split(':').map(Number);
  const slots = [];
  for (let dayOffset = 1; dayOffset <= days; dayOffset += 1) {
    const day = localDate(new Date(from.getTime() + dayOffset * 86_400_000), timezone);
    for (let index = 0; index < postsPerDay; index += 1) {
      slots.push({ date: isoOf(day), at: atLocalTime(day, Math.min(hour + index * 3, 23), minute, timezone) });
    }
  }
  return slots;
}

async function buildPlan(row) {
  const actor = await loadActor(row.created_by);
  if (!actor || actor.status !== 'active') throw new Error('The person who asked for this plan no longer has an active account.');
  const options = row.options;
  const kit = await getBrandKitRow();
  const postIds = [];
  const problems = [];
  let engine = 'free';

  for (const [index, slot] of planSlots(options).entries()) {
    try {
      // The day's idea: its festival first, then the next research idea, else the Brand Kit (free agent rotates topics).
      const festival = eventOn(slot.date);
      const idea = festival ? { title: festival.name, angle: `Greet followers for ${festival.name}.`, format: 'image', pillar: 'festival', event: festival.name } : await takeNextIdea();
      const format = options.format === 'mix' ? (festival ? 'image' : MIX[index % MIX.length]) : options.format;

      const written = await writePosts(actor, {
        brief: idea ? '' : kit.description || kit.company_name,
        idea,
        platforms: options.platforms,
        tone: options.tone,
        language: options.language,
        variants: 1,
        autopilotId: row.autopilot_id,
      });
      engine = written.engine;
      let mediaIds = [];
      if (format === 'image') {
        const { media } = await createImage(actor, { prompt: idea?.title || kit.description || kit.company_name, idea, seed: index, aspect: 'square', autopilotId: row.autopilot_id });
        mediaIds = [media.id];
      }
      const post = await createPost({
        actor,
        input: { content: written.variants[0], platforms: options.platforms, status: options.requireApproval ? 'pendingApproval' : 'scheduled', scheduledAt: slot.at.toISOString(), mediaIds },
        ip: null,
        userAgent: 'AI content plan',
      });
      postIds.push(post.id);
    } catch (error) {
      // One post's problem (an unconnected platform, a provider hiccup) must not stop the rest of the week.
      problems.push(`${slot.date}: ${error.message}`);
    }
  }

  await query(
    `UPDATE ai_content_plans SET status = $2, engine = $3, post_ids = $4, error = $5, finished_at = now() WHERE id = $1`,
    [row.id, postIds.length ? 'succeeded' : 'failed', engine, postIds, problems.length ? problems.slice(0, 5).join('\n') : null]
  );
  await notifyUser(row.created_by, {
    type: 'aiAgentUpdate',
    title: postIds.length ? `${postIds.length} AI posts are ready` : 'AI could not plan your posts',
    message: postIds.length
      ? options.requireApproval
        ? 'They are waiting in Approvals — approve them and they go out at their planned times.'
        : 'They are scheduled and will go out at their planned times.'
      : (problems[0] ?? 'Please try again from AI Studio.'),
  });
}

/** Worker step: build queued plans one at a time (claimed atomically, so two workers never build the same one). */
async function processQueuedPlans() {
  await query(
    "UPDATE ai_content_plans SET status = 'failed', error = 'This plan took too long and was stopped. Please try again.', finished_at = now() WHERE status = 'running' AND created_at < now() - interval '45 minutes'"
  );
  for (;;) {
    const claimed = (
      await query(
        `UPDATE ai_content_plans SET status = 'running'
          WHERE id = (SELECT id FROM ai_content_plans WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING *`
      )
    ).rows[0];
    if (!claimed) return;
    try {
      await buildPlan(claimed);
    } catch (error) {
      logger.warn('Content plan failed', { planId: claimed.id, error: error.message });
      await query("UPDATE ai_content_plans SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [claimed.id, String(error.message).slice(0, 500)]);
    }
  }
}

registerJobStep(processQueuedPlans);

/** Tests: build queued plans for the current organization now. */
export const runQueuedPlansNow = () => processQueuedPlans();
