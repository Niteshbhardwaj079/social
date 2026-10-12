import { currentOrganizationId, query } from '../db/pool.js';
import { AiProviderError } from '../ai/http.js';
import { makeSlideshow } from '../ai/slideshow.js';
import { makeCard } from '../ai/free/card.js';
import { DESIGN_TEMPLATES, renderDesignCard } from '../ai/design/templates.js';
import * as freeAgent from '../ai/free/freeAgent.js';
import { brandBrief, chooseEngine, failStaleResearch, getBrandKitRow } from './aiAgentService.js';
import { TEXT_LIMITS } from '../providers/limits.js';
import { getLanguage } from '../emails/builder.js';
import { loadActor } from '../middleware/auth.js';
import { AI_CREDIT_COST, assertAiAvailable, assertCreditsAvailable } from './aiAccessService.js';
import { getAiSettingsRow, resolveAiProvider } from './aiKeyService.js';
import { mediaForIds, readMediaBytes, uploadMedia } from './mediaService.js';
import { forEachOrganization } from './organizationService.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/**
 * The AI Studio's work:
 *   writePosts()      — post text (a few versions to choose from)          → instant
 *   createImage()     — one image, saved to the Media Library               → instant (~10-30 s)
 *   createSlideshow() — AI captions + images → MP4 via ffmpeg (free)        → background job
 *   createVideo()     — text-to-video with OpenAI Sora / Google Veo (paid)  → background job
 * Every request is recorded in ai_generations: history, credits used, and the state of background jobs.
 */

const AI_FOLDER = 'AI Studio';
const JOB_WORKER_INTERVAL_MS = 20_000;
const STALE_JOB_MINUTES = 45; // a job still "running" after this (server restarted, provider lost it) is marked failed
const MAX_SLIDES = 8;

// ---------------------------------------------------------------- small helpers
const languageName = (code) => (code === 'hinglish' ? 'Hinglish (Hindi written in English letters)' : getLanguage(code).name);

/** The longest post every chosen platform accepts (X's 280 wins over Facebook's 63,206). */
export function maxCharsFor(platforms = []) {
  const limits = platforms.map((platform) => TEXT_LIMITS[platform]?.limit).filter(Boolean);
  return limits.length ? Math.min(...limits) : 2200;
}

/**
 * Models are asked for JSON, but sometimes wrap it in ``` fences or add a sentence. This finds the
 * JSON object inside the answer; returns null when there is none (the caller then falls back).
 */
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A provider error is safe to show; anything unexpected is logged and replaced with a generic message. */
function friendlyError(error) {
  if (error instanceof AiProviderError) return badRequest(error.message);
  if (error?.status && error.status < 500) return error; // our own HttpErrors (limits, validation)
  logger.error('AI job failed unexpectedly', error);
  return badRequest('The AI could not finish this. Please try again in a moment.');
}

async function recordGeneration(values) {
  const result = await query(
    `INSERT INTO ai_generations (kind, provider, model, prompt, options, status, result, media_id, external_job_id,
                                 uses_platform_key, credits, error, autopilot_id, created_by, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CASE WHEN $6 IN ('succeeded', 'failed') THEN now() END)
     RETURNING *`,
    [
      values.kind, values.provider, values.model ?? '', values.prompt, values.options ?? {}, values.status ?? 'succeeded', values.result ?? {},
      values.mediaId ?? null, values.externalJobId ?? null, values.usesPlatformKey ?? false, values.credits ?? 0, values.error ?? null,
      values.autopilotId ?? null, values.createdBy ?? null,
    ]
  );
  return result.rows[0];
}

async function updateGeneration(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((key, index) => `${key} = $${index + 2}`);
  if (fields.status === 'succeeded' || fields.status === 'failed') sets.push('finished_at = now()');
  const result = await query(`UPDATE ai_generations SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...keys.map((key) => fields[key])]);
  return result.rows[0];
}

export function presentGeneration(row) {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    options: row.options,
    status: row.status,
    result: row.result,
    mediaId: row.media_id,
    mediaUrl: row.media_url ?? null,
    usesPlatformKey: row.uses_platform_key,
    credits: row.credits,
    error: row.error,
    autopilotId: row.autopilot_id,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** Picks provider + key, and checks credits when the platform's key would be used. */
async function prepare(kind, cost) {
  const resolved = await resolveAiProvider(kind);
  if (resolved.usesPlatformKey) await assertCreditsAvailable(cost);
  return resolved;
}

/** Sends one text request to whichever provider is set up for writing. */
async function askForText(resolved, { system, prompt, maxTokens }) {
  return resolved.provider.generateText({ apiKey: resolved.apiKey, model: resolved.model, system, prompt, maxTokens });
}

async function brandSystemPrompt() {
  const [kit, settings] = await Promise.all([getBrandKitRow(), getAiSettingsRow()]);
  const voice = settings.brand_voice ? `Brand voice: ${settings.brand_voice}.` : '';
  return ['You are an expert social media copywriter.', brandBrief(kit), voice].filter(Boolean).join('\n');
}

const FREE = { provider: 'free', model: 'templates' };

// ---------------------------------------------------------------- 1. post text
/**
 * A few ready-to-post versions of a post. Returns { generationId, variants, maxChars, engine, notice }.
 * Paid AI when available; otherwise the free agent writes them (engine 'free').
 * `idea` (from research) / `autopilotId` are set when the autopilot asks.
 */
export async function writePosts(actor, { brief = '', platforms = [], tone = 'friendly', language = 'en', variants = 3, hashtags = true, autopilotId = null, idea = null }) {
  await assertAiAvailable(actor);
  const maxChars = maxCharsFor(platforms);
  const prompt = brief || idea?.title || 'Post for the business';
  const options = { platforms, tone, language, variants, hashtags, idea };
  const engine = await chooseEngine('text', AI_CREDIT_COST.text);

  if (engine.free) {
    const kit = await getBrandKitRow();
    const list = freeAgent.writeVariants(kit, { brief, idea, language, variants, hashtags });
    const row = await recordGeneration({ kind: 'text', ...FREE, prompt, options, result: { variants: list }, autopilotId, createdBy: actor.id });
    return { generationId: row.id, variants: list, maxChars, engine: 'free', notice: engine.notice };
  }

  const resolved = engine.resolved;
  const system = [
    await brandSystemPrompt(),
    'Write ready-to-post social media posts.',
    `- Language: ${languageName(language)}.`,
    `- Tone: ${tone}.`,
    `- Every post must be at most ${maxChars} characters in total, including emojis and hashtags.`,
    hashtags ? '- End each post with 3 to 6 relevant hashtags.' : '- Do not use hashtags.',
    '- Use only facts from the brief and the business details. Never invent prices, dates, offers, phone numbers or links.',
    `Reply with JSON only, in exactly this shape: {"variants": ["first post", "second post"]} with ${variants} posts that differ in angle and wording.`,
  ].join('\n');
  const userPrompt = [brief && `Brief: ${brief}`, idea && `Post idea: ${idea.title} — ${idea.angle ?? ''}`, `Platforms: ${platforms.length ? platforms.join(', ') : 'any'}`]
    .filter(Boolean)
    .join('\n');

  try {
    const answer = await askForText(resolved, { system, prompt: userPrompt, maxTokens: 4000 });
    const parsed = extractJson(answer);
    const list = Array.isArray(parsed?.variants) ? parsed.variants.filter((item) => typeof item === 'string' && item.trim()) : [];
    const finalVariants = (list.length ? list : [answer]).map((item) => item.trim()).slice(0, variants);
    const row = await recordGeneration({
      kind: 'text',
      provider: resolved.provider.key,
      model: resolved.model,
      prompt,
      options,
      result: { variants: finalVariants },
      usesPlatformKey: resolved.usesPlatformKey,
      credits: resolved.usesPlatformKey ? AI_CREDIT_COST.text : 0,
      autopilotId,
      createdBy: actor.id,
    });
    return { generationId: row.id, variants: finalVariants, maxChars, engine: resolved.provider.key, notice: null };
  } catch (error) {
    await recordGeneration({ kind: 'text', provider: resolved.provider.key, model: resolved.model, prompt, status: 'failed', error: String(error.message).slice(0, 500), autopilotId, createdBy: actor.id });
    throw friendlyError(error);
  }
}

// ---------------------------------------------------------------- 2. one image
function imagePrompt(prompt, textOnImage) {
  const text = textOnImage ? ` Include this text clearly and spelled exactly: "${textOnImage}".` : ' No text, letters or watermarks in the image.';
  return `${prompt}. Eye-catching, high-quality social media visual, professional lighting, clean composition.${text}`;
}

async function generateImageBytes(resolved, { prompt, aspect, textOnImage }) {
  return resolved.provider.generateImage({ apiKey: resolved.apiKey, model: resolved.model, prompt: imagePrompt(prompt, textOnImage), aspect });
}

/** The free agent's picture: a branded graphic card. `aspect` portrait / square (landscape → square). */
async function freeCardBytes(kit, { prompt, textOnImage, idea, aspect, seed = 0 }) {
  const text = idea ? freeAgent.cardText(kit, idea, { seed }) : freeAgent.cardFromPrompt(kit, { prompt, textOnImage });
  return makeCard({ ...text, color: kit.brand_color, aspect: aspect === 'portrait' ? 'portrait' : 'square' });
}

/** A photo prompt for the "Design" templates: the AI paints a clean background, no words drawn into it —
 *  the template then overlays the headline/body/CTA in code, which a diffusion model cannot reliably spell. */
function cleanPhotoPrompt(prompt) {
  return `${prompt}. Eye-catching, high-quality social media photo background, professional lighting, clean composition. No text, letters, numbers or watermarks anywhere in the image.`;
}

function pickTemplate(template, seed = 0) {
  return DESIGN_TEMPLATES.includes(template) ? template : DESIGN_TEMPLATES[seed % DESIGN_TEMPLATES.length];
}

/** The Brand Kit's logo bytes, or null — a removed or unreadable logo never blocks a card. */
async function logoBytesFor(kit) {
  if (!kit.logo_media_id) return null;
  try {
    const [row] = await mediaForIds([kit.logo_media_id]);
    return row ? await readMediaBytes(row) : null;
  } catch {
    return null;
  }
}

/**
 * Makes one image and saves it to the Media Library (folder "AI Studio"). Returns { generationId, media, engine, notice }.
 * `template: 'none'` makes a plain photo (the old behaviour); any other value — including 'auto' — makes a
 * "Design" card: a branded graphic with a headline, logo and call-to-action, in the free agent and the paid
 * path alike. Paid AI only supplies the background photo; the words are always drawn in code, so they are
 * never misspelled the way an image model's own lettering can be.
 */
export async function createImage(actor, { prompt, aspect = 'square', textOnImage = '', template = 'auto', autopilotId = null, idea = null, seed = 0 }, meta = {}) {
  await assertAiAvailable(actor);
  const engine = await chooseEngine('image', AI_CREDIT_COST.image);
  const save = (image, name) =>
    uploadMedia({ buffer: image.buffer, contentType: image.contentType, originalName: name, type: 'image', folder: AI_FOLDER, actor, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });

  if (engine.free) {
    const kit = await getBrandKitRow();
    let image;
    if (template === 'none') {
      image = await freeCardBytes(kit, { prompt, textOnImage, idea, aspect, seed });
    } else {
      const copy = idea ? freeAgent.cardText(kit, idea, { seed }) : freeAgent.cardFromPrompt(kit, { prompt, textOnImage });
      const logoBuffer = await logoBytesFor(kit);
      image = await renderDesignCard({ template: pickTemplate(template, seed), ...copy, color: kit.brand_color, aspect, logoBuffer, seed });
    }
    const media = await save(image, `card-${Date.now()}.png`);
    const row = await recordGeneration({ kind: 'card', ...FREE, prompt, options: { aspect, textOnImage, template }, mediaId: media.id, autopilotId, createdBy: actor.id });
    return { generationId: row.id, media, engine: 'free', notice: engine.notice };
  }

  const resolved = engine.resolved;
  try {
    let image;
    if (template === 'none') {
      image = await generateImageBytes(resolved, { prompt, aspect, textOnImage });
    } else {
      const kit = await getBrandKitRow();
      const [photo, logoBuffer] = await Promise.all([
        resolved.provider.generateImage({ apiKey: resolved.apiKey, model: resolved.model, prompt: cleanPhotoPrompt(prompt), aspect }),
        logoBytesFor(kit),
      ]);
      const copy = idea ? freeAgent.cardText(kit, idea, { seed }) : freeAgent.cardFromPrompt(kit, { prompt, textOnImage });
      image = await renderDesignCard({ template: pickTemplate(template, seed), ...copy, color: kit.brand_color, aspect, logoBuffer, photoBuffer: photo.buffer, seed });
    }
    const media = await save(image, `ai-image-${Date.now()}.png`);
    const row = await recordGeneration({
      kind: 'image',
      provider: resolved.provider.key,
      model: resolved.model,
      prompt,
      options: { aspect, textOnImage, template },
      mediaId: media.id,
      usesPlatformKey: resolved.usesPlatformKey,
      credits: resolved.usesPlatformKey ? AI_CREDIT_COST.image : 0,
      autopilotId,
      createdBy: actor.id,
    });
    return { generationId: row.id, media, engine: resolved.provider.key, notice: null };
  } catch (error) {
    await recordGeneration({ kind: 'image', provider: resolved.provider.key, model: resolved.model, prompt, status: 'failed', error: String(error.message).slice(0, 500), autopilotId, createdBy: actor.id });
    throw friendlyError(error);
  }
}

// ---------------------------------------------------------------- 3. slideshow video (background job, free to render)
/**
 * Queues a slideshow. Returns the generation at once (status 'queued'); the job worker writes the
 * captions, makes or loads the pictures, renders the MP4 and saves it to the Media Library.
 * Writing and pictures each use paid AI when available, else the free agent (text cards).
 */
export async function createSlideshow(actor, { brief, slideCount = 4, aspect = 'portrait', language = 'en', tone = 'friendly', imageMediaIds = [], autopilotId = null }) {
  await assertAiAvailable(actor);
  const count = imageMediaIds.length || Math.min(Math.max(slideCount, 2), MAX_SLIDES);
  if (imageMediaIds.length) await mediaForIds(imageMediaIds); // fail now if a chosen image no longer exists

  // Decide the engines now (and charge credits for paid parts), so the job itself never surprises anyone.
  const text = await chooseEngine('text', AI_CREDIT_COST.text);
  const image = imageMediaIds.length ? null : await chooseEngine('image', AI_CREDIT_COST.image * count);
  const textPaid = !text.free && text.resolved.usesPlatformKey;
  const imagePaid = image && !image.free && image.resolved.usesPlatformKey;
  const credits = textPaid || imagePaid ? AI_CREDIT_COST.slideshow + (textPaid ? AI_CREDIT_COST.text : 0) + (imagePaid ? AI_CREDIT_COST.image * count : 0) : 0;
  if (credits) await assertCreditsAvailable(credits);

  const row = await recordGeneration({
    kind: 'slideshow',
    provider: image && !image.free ? image.resolved.provider.key : text.free ? 'free' : text.resolved.provider.key,
    model: 'ffmpeg',
    prompt: brief,
    options: { slideCount: count, aspect, language, tone, imageMediaIds, freeText: text.free, freeImages: Boolean(image?.free) },
    status: 'queued',
    usesPlatformKey: Boolean(textPaid || imagePaid),
    credits,
    autopilotId,
    createdBy: actor.id,
  });
  kickJobWorker();
  return { ...presentGeneration(row), notice: text.notice ?? image?.notice ?? null };
}

/** Captions (+ picture descriptions) and the post text: by paid AI, or by the free agent. */
async function planSlides(row, kit) {
  const { slideCount, language, tone, freeText } = row.options;
  if (freeText) {
    const plan = freeAgent.slidePlan(kit, { brief: row.prompt, slideCount, language });
    return { planned: plan.captions.map((caption) => ({ caption, imagePrompt: caption })), postText: plan.postText };
  }
  const text = await resolveAiProvider('text');
  const system = [
    await brandSystemPrompt(),
    `Plan a ${slideCount}-slide vertical social media video (like an Instagram Reel).`,
    `- Language for captions and post: ${languageName(language)}. Tone: ${tone}.`,
    '- Each caption: at most 12 words, punchy, readable in 3 seconds.',
    '- Each imagePrompt: a vivid English description of a photo for that slide, without any text in the picture.',
    '- Use only facts from the brief and the business details. Never invent prices, dates or offers.',
    'Reply with JSON only: {"slides": [{"caption": "...", "imagePrompt": "..."}], "postText": "the caption to post with the video, with 3-5 hashtags"}',
  ].join('\n');
  const plan = extractJson(await askForText(text, { system, prompt: `Brief: ${row.prompt}`, maxTokens: 3000 }));
  const planned = Array.isArray(plan?.slides) ? plan.slides.slice(0, slideCount) : [];
  if (!planned.length) throw new Error('The AI did not return a usable slide plan. Please try again.');
  return { planned, postText: typeof plan.postText === 'string' ? plan.postText.trim() : '' };
}

async function runSlideshowJob(row) {
  const actor = await loadActor(row.created_by);
  if (!actor) throw new Error('The person who asked for this video no longer exists.');
  const { aspect, imageMediaIds = [], freeImages } = row.options;
  const kit = await getBrandKitRow();
  const { planned, postText } = await planSlides(row, kit);

  // Pictures: the person's own picks, free graphic cards (the caption is printed on the card), or AI images.
  let slides;
  if (imageMediaIds.length) {
    const rows = await mediaForIds(imageMediaIds);
    const pictures = await Promise.all(rows.map(async (media) => ({ buffer: await readMediaBytes(media), contentType: media.content_type })));
    slides = pictures.map((picture, index) => ({ ...picture, caption: planned[index]?.caption ?? planned.at(-1)?.caption ?? '' }));
  } else if (freeImages) {
    slides = [];
    for (const slide of planned) {
      const card = await makeCard({ headline: slide.caption, footer: [kit.company_name, kit.location].filter(Boolean).join(' · '), color: kit.brand_color, aspect: aspect === 'square' ? 'square' : 'story' });
      slides.push({ ...card, caption: '' });
    }
  } else {
    const image = await resolveAiProvider('image');
    slides = [];
    for (const slide of planned) slides.push({ ...(await generateImageBytes(image, { prompt: slide.imagePrompt || row.prompt, aspect })), caption: slide.caption });
  }

  const video = await makeSlideshow({ slides, aspect });
  const media = await uploadMedia({ buffer: video.buffer, contentType: video.contentType, originalName: `ai-video-${Date.now()}.mp4`, type: 'video', folder: AI_FOLDER, actor });
  return updateGeneration(row.id, {
    status: 'succeeded',
    media_id: media.id,
    result: { postText, captions: planned.map((slide) => slide.caption), seconds: video.seconds },
  });
}

// ---------------------------------------------------------------- 4. AI video (paid, background job)
/** Starts a text-to-video job with the organization's video provider (OpenAI Sora / Google Veo). */
export async function createVideo(actor, { prompt, aspect = 'portrait', seconds = 8, postText = '', autopilotId = null }) {
  await assertAiAvailable(actor, 'video');
  const resolved = await prepare('video', AI_CREDIT_COST.video);
  let job;
  try {
    job = await resolved.provider.startVideo({ apiKey: resolved.apiKey, model: resolved.model, prompt, aspect, seconds });
  } catch (error) {
    await recordGeneration({ kind: 'video', provider: resolved.provider.key, model: resolved.model, prompt, status: 'failed', error: String(error.message).slice(0, 500), autopilotId, createdBy: actor.id });
    throw friendlyError(error);
  }
  const row = await recordGeneration({
    kind: 'video',
    provider: resolved.provider.key,
    model: resolved.model,
    prompt,
    options: { aspect, seconds },
    status: 'running',
    result: { postText },
    externalJobId: job.jobId,
    usesPlatformKey: resolved.usesPlatformKey,
    credits: resolved.usesPlatformKey ? AI_CREDIT_COST.video : 0,
    autopilotId,
    createdBy: actor.id,
  });
  return presentGeneration(row);
}

async function checkVideoJob(row) {
  const resolved = await resolveAiProvider('video');
  if (resolved.provider.key !== row.provider) {
    // The organization switched video provider (or removed the key) while this job was running.
    throw new Error('The AI video provider changed before this video finished. Please create it again.');
  }
  const outcome = await resolved.provider.checkVideo({ apiKey: resolved.apiKey, jobId: row.external_job_id });
  if (outcome.status === 'running') return null;
  if (outcome.status === 'failed') throw new Error(outcome.error);
  const actor = await loadActor(row.created_by);
  if (!actor) throw new Error('The person who asked for this video no longer exists.');
  const media = await uploadMedia({ buffer: outcome.buffer, contentType: outcome.contentType, originalName: `ai-video-${Date.now()}.mp4`, type: 'video', folder: AI_FOLDER, actor });
  return updateGeneration(row.id, { status: 'succeeded', media_id: media.id });
}

// ---------------------------------------------------------------- history
const GENERATION_SELECT = `
  SELECT g.*, users.name AS created_by_name, media_items.public_url AS media_url
    FROM ai_generations g
    LEFT JOIN users ON users.id = g.created_by
    LEFT JOIN media_items ON media_items.id = g.media_id`;

export async function listGenerations({ limit = 100 } = {}) {
  const result = await query(`${GENERATION_SELECT} ORDER BY g.created_at DESC LIMIT $1`, [limit]);
  return result.rows.map(presentGeneration);
}

export async function getGeneration(id) {
  const row = (await query(`${GENERATION_SELECT} WHERE g.id = $1`, [id])).rows[0];
  if (!row) throw notFound('Not found');
  return presentGeneration(row);
}

// ---------------------------------------------------------------- background job worker
// Other modules (the autopilot) want to know when a slideshow/video finishes. They register here,
// which avoids a circular import between this file and autopilotService.js.
const finishedHandlers = [];
export const onGenerationFinished = (handler) => finishedHandlers.push(handler);

async function notifyFinished(row) {
  for (const handler of finishedHandlers) {
    try {
      await handler(row);
    } catch (error) {
      logger.error('AI job "finished" handler failed', error, { generationId: row.id });
    }
  }
}

// Organizations whose jobs are being processed right now in this server process (one pass at a time each,
// so the timer and a "kick" can never both upload the same finished video).
const busyOrganizations = new Set();

/** One organization's share of the worker: fail stale jobs, run queued slideshows, check running videos. */
async function processAiJobs() {
  const organizationId = currentOrganizationId();
  if (busyOrganizations.has(organizationId)) return;
  busyOrganizations.add(organizationId);
  try {
    await processAiJobsOnce();
  } finally {
    busyOrganizations.delete(organizationId);
  }
}

async function processAiJobsOnce() {
  await failStaleResearch();
  const stale = await query(
    `UPDATE ai_generations SET status = 'failed', error = 'This job took too long and was stopped. Please try again.', finished_at = now()
      WHERE status IN ('queued', 'running') AND created_at < now() - ($1 || ' minutes')::interval RETURNING *`,
    [String(STALE_JOB_MINUTES)]
  );
  for (const row of stale.rows) await notifyFinished(row);

  // Claim queued slideshows one at a time (status → running), so two workers never render the same one.
  for (;;) {
    const claimed = (
      await query(
        `UPDATE ai_generations SET status = 'running'
          WHERE id = (SELECT id FROM ai_generations WHERE status = 'queued' AND kind = 'slideshow' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING *`
      )
    ).rows[0];
    if (!claimed) break;
    await finishJob(claimed, () => runSlideshowJob(claimed));
  }

  const videos = await query("SELECT * FROM ai_generations WHERE status = 'running' AND kind = 'video' ORDER BY created_at LIMIT 10");
  for (const row of videos.rows) await finishJob(row, () => checkVideoJob(row));

  // Other background work registered by other modules (e.g. weekly content plans) — each one isolated.
  for (const step of extraJobSteps) {
    try {
      await step();
    } catch (error) {
      logger.error('AI job step failed', error);
    }
  }
}

// Modules that need the AI job worker register a step here (avoids a circular import with this file).
const extraJobSteps = [];
export const registerJobStep = (step) => extraJobSteps.push(step);

/** Runs one step of a job; a failure marks just that job failed (with a readable reason) and moves on. */
async function finishJob(row, work) {
  try {
    const done = await work();
    if (done) await notifyFinished(done);
  } catch (error) {
    const message = error instanceof AiProviderError || error?.status < 500 ? error.message : String(error?.message || error);
    if (!(error instanceof AiProviderError)) logger.warn('AI job failed', { generationId: row.id, error: message });
    const failed = await updateGeneration(row.id, { status: 'failed', error: message.slice(0, 500) });
    await notifyFinished(failed);
  }
}

/** Run the worker now (after queuing a job) instead of waiting for the next tick. Never throws. */
export function kickJobWorker() {
  setImmediate(() => {
    processAiJobs().catch((error) => logger.error('AI job pass failed', error));
  });
}

export function startAiJobWorker() {
  const timer = setInterval(() => {
    forEachOrganization('AI jobs', processAiJobs).catch((error) => logger.error('AI job worker failed', error));
  }, JOB_WORKER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** Tests: run one pass for the current organization and wait for it. */
export const runAiJobsNow = () => processAiJobs();
