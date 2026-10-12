import { query } from '../db/pool.js';
import { atLocalTime, isValidTimeZone, isoOf, localDate } from '../utils/timezone.js';
import { eventOn } from '../ai/free/events.js';
import { refreshResearchIfDue, takeNextIdea } from './aiAgentService.js';
import { createPlan } from './aiPlanService.js';
import { loadActor } from '../middleware/auth.js';
import { assertAiAvailable } from './aiAccessService.js';
import { createImage, createSlideshow, createVideo, kickJobWorker, onGenerationFinished, writePosts } from './aiService.js';
import { createPost } from './postService.js';
import { forEachOrganization } from './organizationService.js';
import { canManageAutopilots } from './permissions.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { notifyUser } from './notificationService.js';

/**
 * AI autopilot: "post about <brief> every day at 10:00".
 * When an autopilot is due, the AI writes the post (and makes an image / video if asked), then the post
 * either goes to Approvals (require_approval, the default) or is published straight away.
 * It runs as the person who created it, so their role and the organization's plan still apply.
 */

const WORKER_INTERVAL_MS = 5 * 60 * 1000;

// "mix": which format each weekday gets (Sunday first) — pictures most days, a video twice a week.
const MIX_FORMATS = ['image', 'text', 'image', 'slideshow', 'text', 'image', 'slideshow'];

// ---------------------------------------------------------------- schedule
/**
 * The next moment (after `after`) this autopilot should run, as a UTC Date.
 * Looks at the next 8 local days and picks the first one allowed by the frequency.
 */
export function nextRunAt({ frequency, postTime, weekday, timezone }, after = new Date()) {
  const [hour, minute] = postTime.split(':').map(Number);
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const day = localDate(new Date(after.getTime() + dayOffset * 86_400_000), timezone);
    const allowed = frequency === 'daily' || (frequency === 'weekdays' && day.weekday >= 1 && day.weekday <= 5) || (frequency === 'weekly' && day.weekday === weekday);
    if (!allowed) continue;
    const candidate = atLocalTime(day, hour, minute, timezone);
    if (candidate > after) return candidate;
  }
  return new Date(after.getTime() + 86_400_000); // unreachable in practice; never leaves an autopilot stuck
}


// ---------------------------------------------------------------- CRUD
function present(row) {
  return {
    id: row.id,
    name: row.name,
    brief: row.brief,
    tone: row.tone,
    language: row.language,
    platforms: row.platforms,
    contentType: row.content_type,
    frequency: row.frequency,
    postTime: row.post_time,
    weekday: row.weekday,
    timezone: row.timezone,
    requireApproval: row.require_approval,
    useBrandKit: row.use_brand_kit,
    mode: row.mode,
    postsPerDay: row.posts_per_day,
    isActive: row.is_active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    lastPostId: row.last_post_id,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  };
}

const SELECT = 'SELECT ai_autopilots.*, users.name AS created_by_name FROM ai_autopilots LEFT JOIN users ON users.id = ai_autopilots.created_by';

function assertManager(actor) {
  if (!canManageAutopilots(actor)) throw forbidden('Your role cannot set up AI auto-posting.');
}

async function getRow(id) {
  const row = (await query(`${SELECT} WHERE ai_autopilots.id = $1`, [id])).rows[0];
  if (!row) throw notFound('Autopilot not found');
  return row;
}

export async function listAutopilots() {
  return (await query(`${SELECT} ORDER BY ai_autopilots.created_at DESC`)).rows.map(present);
}

function checkSchedule(input) {
  if (!input.useBrandKit && input.mode !== 'weekly_plan' && String(input.brief ?? '').trim().length < 5) {
    throw badRequest('Tell the AI what to post about, or turn on "Use my Brand Kit & research".');
  }
  if (!isValidTimeZone(input.timezone)) throw badRequest('Unknown time zone.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.postTime)) throw badRequest('Time must look like 10:00.');
}

export async function createAutopilot(actor, input) {
  await assertAiAvailable(actor);
  assertManager(actor);
  checkSchedule(input);
  const next = input.isActive === false ? null : nextRunAt(input);
  const row = (
    await query(
      `INSERT INTO ai_autopilots (name, brief, tone, language, platforms, content_type, frequency, post_time, weekday, timezone,
                                  require_approval, is_active, next_run_at, created_by, use_brand_kit, mode, posts_per_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [input.name, input.brief, input.tone, input.language, input.platforms, input.contentType, input.frequency, input.postTime, input.weekday, input.timezone,
        input.requireApproval, input.isActive !== false, next, actor.id, input.useBrandKit, input.mode, input.postsPerDay]
    )
  ).rows[0];
  return present(await getRow(row.id));
}

export async function updateAutopilot(actor, id, changes) {
  assertManager(actor);
  const current = present(await getRow(id));
  const next = { ...current, ...changes };
  checkSchedule(next);
  // Any schedule change (or switching back on) recomputes the next run; switching off clears it.
  const nextRun = next.isActive ? nextRunAt(next) : null;
  await query(
    `UPDATE ai_autopilots SET name = $2, brief = $3, tone = $4, language = $5, platforms = $6, content_type = $7, frequency = $8,
            post_time = $9, weekday = $10, timezone = $11, require_approval = $12, is_active = $13, next_run_at = $14,
            use_brand_kit = $15, mode = $16, posts_per_day = $17, updated_at = now()
      WHERE id = $1`,
    [id, next.name, next.brief, next.tone, next.language, next.platforms, next.contentType, next.frequency, next.postTime, next.weekday, next.timezone,
      next.requireApproval, next.isActive, nextRun, next.useBrandKit, next.mode, next.postsPerDay]
  );
  return present(await getRow(id));
}

export async function deleteAutopilot(actor, id) {
  assertManager(actor);
  await getRow(id);
  await query('DELETE FROM ai_autopilots WHERE id = $1', [id]);
}

// ---------------------------------------------------------------- running one
/** Turns the AI's work into a real post: Approvals, or published at once. */
async function publishResult(row, actor, { content, mediaIds }) {
  const post = await createPost({
    actor,
    input: { content, platforms: row.platforms, status: row.require_approval ? 'pendingApproval' : 'published', mediaIds },
    ip: null,
    userAgent: 'AI autopilot',
  });
  await query('UPDATE ai_autopilots SET last_post_id = $2, last_error = NULL WHERE id = $1', [row.id, post.id]);
  return post;
}

async function recordError(autopilotId, error) {
  const message = String(error?.message || error).slice(0, 500);
  const before = (await query('SELECT name, created_by, last_error FROM ai_autopilots WHERE id = $1', [autopilotId])).rows[0];
  await query('UPDATE ai_autopilots SET last_error = $2 WHERE id = $1', [autopilotId, message]);
  logger.warn('AI autopilot run failed', { autopilotId, error: message });
  // Tell its owner once when it starts failing — not again on every run while the problem lasts.
  if (before && !before.last_error && before.created_by) {
    await notifyUser(before.created_by, { type: 'aiAgentUpdate', title: `Autopilot "${before.name}" needs attention`, message });
  }
}

/**
 * One run. Text and image posts are created right here; a slideshow / AI video is created later,
 * when its background job finishes (see the onGenerationFinished hook at the bottom).
 */
export async function runAutopilot(row) {
  const actor = await loadActor(row.created_by);
  if (!actor || actor.status !== 'active') throw new Error('The person who created this autopilot no longer has an active account.');
  assertManager(actor);

  // Weekly plan mode: prepare the whole coming week at once (see aiPlanService.js).
  if (row.mode === 'weekly_plan') {
    await createPlan(
      actor,
      {
        days: 7,
        postsPerDay: row.posts_per_day,
        platforms: row.platforms,
        format: ['text', 'image'].includes(row.content_type) ? row.content_type : 'mix',
        language: row.language,
        tone: row.tone,
        postTime: row.post_time,
        timezone: row.timezone,
        requireApproval: row.require_approval,
      },
      { autopilotId: row.id }
    );
    kickJobWorker();
    return null;
  }

  // Smart mode: today's festival, else the next fresh research idea, else the Brand Kit itself.
  let idea = null;
  if (row.use_brand_kit) {
    const today = localDate(new Date(), row.timezone);
    const festival = eventOn(isoOf(today));
    idea = festival ? { title: festival.name, angle: `Greet followers for ${festival.name}.`, format: 'image', pillar: 'festival', event: festival.name } : await takeNextIdea();
  }
  const brief = row.use_brand_kit ? '' : row.brief;
  const topic = idea?.title || row.brief || 'our business';
  const format = row.content_type === 'mix' ? MIX_FORMATS[localDate(new Date(), row.timezone).weekday] : row.content_type;

  const common = { brief, idea, platforms: row.platforms, tone: row.tone, language: row.language, autopilotId: row.id };
  if (format === 'slideshow') {
    await createSlideshow(actor, { brief: topic, language: row.language, tone: row.tone, autopilotId: row.id });
    return null;
  }
  const { variants } = await writePosts(actor, { ...common, variants: 1 });
  if (format === 'video') {
    await createVideo(actor, { prompt: `${topic}. Short vertical social media video.`, postText: variants[0], autopilotId: row.id });
    return null;
  }
  let mediaIds = [];
  if (format === 'image') {
    const { media } = await createImage(actor, { prompt: topic, idea, aspect: 'square', autopilotId: row.id });
    mediaIds = [media.id];
  }
  return publishResult(row, actor, { content: variants[0], mediaIds });
}

/** "Run now" button: runs immediately without changing the schedule. */
export async function runAutopilotNow(actor, id) {
  assertManager(actor);
  const row = await getRow(id);
  try {
    const post = await runAutopilot(row);
    await query('UPDATE ai_autopilots SET last_run_at = now() WHERE id = $1', [id]);
    return { post, queued: !post };
  } catch (error) {
    await recordError(id, error);
    throw error;
  }
}

/** One organization's share of the worker: every due autopilot runs once, and its next run is set first. */
async function runDueAutopilots() {
  // Keep research fresh when the Brand Kit asks for it (daily / weekly). Its failure never blocks the autopilots.
  await refreshResearchIfDue().catch((error) => logger.warn('Scheduled research failed', { error: error.message }));
  const due = await query(`${SELECT} WHERE ai_autopilots.is_active AND ai_autopilots.next_run_at <= now() ORDER BY ai_autopilots.next_run_at LIMIT 20`);
  for (const row of due.rows) {
    // Move the schedule on BEFORE running, so a failure can never make it retry in a tight loop.
    await query('UPDATE ai_autopilots SET next_run_at = $2, last_run_at = now() WHERE id = $1', [row.id, nextRunAt(present(row))]);
    try {
      await runAutopilot(row);
    } catch (error) {
      await recordError(row.id, error);
    }
  }
}

export function startAutopilotWorker() {
  const timer = setInterval(() => {
    forEachOrganization('AI autopilot', runDueAutopilots).catch((error) => logger.error('AI autopilot worker failed', error));
  }, WORKER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** Tests: run due autopilots for the current organization now. */
export const runDueAutopilotsNow = () => runDueAutopilots();

// A slideshow / AI video made for an autopilot has finished: post it (or note why it could not be).
onGenerationFinished(async (generation) => {
  if (!generation.autopilot_id) return;
  const row = (await query(`${SELECT} WHERE ai_autopilots.id = $1`, [generation.autopilot_id])).rows[0];
  if (!row) return;
  if (generation.status !== 'succeeded' || !generation.media_id) {
    await recordError(row.id, generation.error || 'The video could not be made.');
    return;
  }
  const actor = await loadActor(row.created_by);
  if (!actor) return recordError(row.id, 'The person who created this autopilot no longer exists.');
  try {
    await publishResult(row, actor, { content: generation.result?.postText || row.brief, mediaIds: [generation.media_id] });
  } catch (error) {
    await recordError(row.id, error);
  }
});
