import { query } from '../db/pool.js';
import { AiProviderError } from '../ai/http.js';
import * as freeAgent from '../ai/free/freeAgent.js';
import { upcomingEvents } from '../ai/free/events.js';
import { AI_CREDIT_COST, creditsUsedThisMonth } from './aiAccessService.js';
import { resolveAiProvider } from './aiKeyService.js';
import { getEffectivePlanRow } from './planService.js';
import { getWorkspace } from './settingsService.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/**
 * The marketing agent's knowledge and planning:
 *   Brand Kit            — what the business is (filled by hand or from its website)
 *   research             — competitors, trends, festivals → post ideas (paid AI web search, or free sources)
 *   chooseEngine()       — paid AI when the plan, a key and credits allow it; otherwise the FREE agent
 * Writing posts / images / videos lives in aiService.js; weekly plans in aiPlanService.js.
 */

// ---------------------------------------------------------------- which engine does this job?
/**
 * { free: false, resolved } when a paid (or self-hosted) AI can do `kind` right now, else { free: true, notice }.
 * Never throws for "no key" / "no credits" — the free agent takes over, so the autopilot never stops.
 */
export async function chooseEngine(kind, cost) {
  const plan = await getEffectivePlanRow();
  if (!plan.feature_ai) return { free: true, notice: null };
  let resolved;
  try {
    resolved = await resolveAiProvider(kind);
  } catch (error) {
    if (error.status === 400) return { free: true, notice: null }; // no AI set up for this kind
    throw error;
  }
  if (resolved.usesPlatformKey && plan.ai_credits_per_month !== null) {
    const used = await creditsUsedThisMonth();
    if (used + cost > Number(plan.ai_credits_per_month)) {
      return { free: true, notice: 'Your monthly AI credits are used up, so the free agent made this one. Add your own AI key (Settings → AI) for unlimited AI.' };
    }
  }
  return { free: false, resolved };
}

// ---------------------------------------------------------------- Brand Kit
const KIT_FIELDS = {
  companyName: 'company_name',
  website: 'website',
  industry: 'industry',
  description: 'description',
  products: 'products',
  targetAudience: 'target_audience',
  location: 'location',
  usps: 'usps',
  competitors: 'competitors',
  keywords: 'keywords',
  tone: 'tone',
  avoid: 'avoid',
  brandColor: 'brand_color',
  phone: 'phone',
  autoResearch: 'auto_research',
};

const EMPTY_KIT = Object.fromEntries(Object.values(KIT_FIELDS).map((column) => [column, '']));

/** The Brand Kit row (database shape), with the logo's public URL joined in. An organization without a
 *  saved kit gets an empty one named after its workspace. */
export async function getBrandKitRow() {
  const row = (await query('SELECT k.*, m.public_url AS logo_url FROM ai_brand_kits k LEFT JOIN media_items m ON m.id = k.logo_media_id')).rows[0];
  if (row) return row;
  const workspace = await getWorkspace();
  return { ...EMPTY_KIT, company_name: workspace.name ?? '', website: workspace.website ?? '', tone: 'friendly', brand_color: '#4f46e5', auto_research: 'weekly', logo_media_id: null, logo_url: '' };
}

export function presentBrandKit(row) {
  return { ...Object.fromEntries(Object.entries(KIT_FIELDS).map(([key, column]) => [key, row[column] ?? ''])), logoMediaId: row.logo_media_id ?? null, logoUrl: row.logo_url ?? '' };
}

export async function saveBrandKit(values) {
  const columns = Object.entries(KIT_FIELDS).filter(([key]) => values[key] !== undefined);
  const current = await getBrandKitRow();
  const merged = { ...current, ...Object.fromEntries(columns.map(([key, column]) => [column, values[key]])) };
  if (values.logoMediaId !== undefined) merged.logo_media_id = values.logoMediaId;
  const allColumns = [...Object.values(KIT_FIELDS), 'logo_media_id'];
  await query(
    `INSERT INTO ai_brand_kits (${allColumns.join(', ')}) VALUES (${allColumns.map((_, index) => `$${index + 1}`).join(', ')})
     ON CONFLICT (organization_id) DO UPDATE SET ${allColumns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}, updated_at = now()`,
    allColumns.map((column) => (column === 'logo_media_id' ? merged[column] ?? null : merged[column] ?? ''))
  );
  return presentBrandKit(await getBrandKitRow());
}

/** The Brand Kit as a short brief every AI prompt starts with. */
export function brandBrief(kit) {
  const lines = [
    kit.company_name && `Business: ${kit.company_name}${kit.industry ? ` (${kit.industry})` : ''}${kit.location ? `, ${kit.location}` : ''}.`,
    kit.website && `Website: ${kit.website}`,
    kit.description && `About: ${kit.description}`,
    kit.products && `Products / services: ${kit.products.replace(/\n/g, '; ')}`,
    kit.target_audience && `Customers: ${kit.target_audience}`,
    kit.usps && `Why customers choose them: ${kit.usps.replace(/\n/g, '; ')}`,
    kit.tone && `Tone of voice: ${kit.tone}`,
    kit.avoid && `Never mention or say: ${kit.avoid}`,
    kit.phone && `Contact for calls-to-action: ${kit.phone}`,
  ].filter(Boolean);
  return lines.join('\n');
}

/** Suggested Brand Kit fields from a website (not saved — the person reviews them first). */
export async function brandKitFromWebsite(url) {
  try {
    const suggestion = await freeAgent.brandKitFromWebsite(url);
    const engine = await chooseEngine('text', AI_CREDIT_COST.text);
    if (engine.free) return { suggestion, engine: 'free' };

    // A paid AI turns the raw website text into tidy Brand Kit fields.
    const answer = await engine.resolved.provider.generateText({
      apiKey: engine.resolved.apiKey,
      model: engine.resolved.model,
      system: 'You fill in a social media Brand Kit from website text. Reply with JSON only.',
      prompt: `Website ${url} says:\n${JSON.stringify(suggestion)}\n\nReply as JSON: {"companyName":"","industry":"","description":"2-3 sentences","products":"one per line","targetAudience":"","usps":"one per line","keywords":"comma separated","tone":""}`,
      maxTokens: 2000,
    });
    const parsed = extractJson(answer) ?? {};
    return { suggestion: { ...suggestion, ...pickStrings(parsed) }, engine: engine.resolved.provider.key };
  } catch (error) {
    if (error instanceof AiProviderError) throw badRequest(error.message);
    throw badRequest(`Could not read that website: ${error.message}`);
  }
}

const pickStrings = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => typeof value === 'string' && value.trim()));

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

// ---------------------------------------------------------------- research
export function presentReport(row) {
  return {
    id: row.id,
    engine: row.engine,
    status: row.status,
    summary: row.summary,
    insights: row.insights,
    ideas: row.ideas,
    usedIdeas: row.used_ideas,
    sources: row.sources,
    usesPlatformKey: row.uses_platform_key,
    credits: row.credits,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export async function listReports(limit = 20) {
  return (await query('SELECT * FROM ai_research_reports ORDER BY created_at DESC LIMIT $1', [limit])).rows.map(presentReport);
}

export async function getReport(id) {
  const row = (await query('SELECT * FROM ai_research_reports WHERE id = $1', [id])).rows[0];
  if (!row) throw notFound('Report not found');
  return presentReport(row);
}

export async function latestReportRow() {
  return (await query("SELECT * FROM ai_research_reports WHERE status = 'succeeded' ORDER BY created_at DESC LIMIT 1")).rows[0] ?? null;
}

const RESEARCH_SYSTEM = [
  'You are a social media marketing researcher for a small business.',
  'Search the web: look at the listed competitors (what they post, offers, formats), trends in the industry and location, and upcoming events and festivals.',
  'Then reply with JSON only, in exactly this shape:',
  '{"summary":"3-5 sentences","competitors":[{"name":"","whatTheyDo":"","opportunity":""}],"trends":["..."],"ideas":[{"title":"","angle":"","format":"text|image|slideshow"}]}',
  'Give 10 to 15 ideas, specific to this business. Use only facts you found or that the brief gives; never invent prices or offers.',
].join('\n');

/** Does the research. Paid AI with web search when available, else the free agent. Updates the report row. */
async function runResearch(reportId, kit) {
  const events = upcomingEvents(new Date(), 45);
  const engine = await chooseEngine('text', AI_CREDIT_COST.research);
  const provider = engine.free ? null : engine.resolved.provider;
  let result;
  if (!provider) {
    result = { ...(await freeAgent.research(kit)), engine: 'free', usesPlatformKey: false, credits: 0 };
  } else {
    // Free sources first (news + festival calendar) — they make even a non-searching model (Ollama) useful.
    const free = await freeAgent.research(kit).catch(() => ({ insights: { trends: [] }, sources: [] }));
    const prompt = [
      brandBrief(kit),
      kit.competitors && `Competitors to look at: ${kit.competitors.replace(/\n/g, '; ')}`,
      `Upcoming events: ${events.map((event) => `${event.name} (${event.date})`).join(', ') || 'none'}`,
      free.insights.trends.length && `Recent news found: ${free.insights.trends.slice(0, 8).join(' | ')}`,
    ]
      .filter(Boolean)
      .join('\n');
    const args = { apiKey: engine.resolved.apiKey, model: engine.resolved.model, system: RESEARCH_SYSTEM, prompt, maxTokens: 6000 };
    const answer = provider.capabilities.research ? await provider.research(args) : { text: await provider.generateText(args), sources: [] };
    const parsed = extractJson(answer.text);
    if (!parsed?.ideas?.length) throw new Error('The AI did not return usable research. Please try again.');
    result = {
      summary: String(parsed.summary ?? ''),
      insights: { competitors: parsed.competitors ?? [], trends: parsed.trends ?? [], events },
      ideas: parsed.ideas.map((idea) => ({ title: String(idea.title ?? ''), angle: String(idea.angle ?? ''), format: ['text', 'image', 'slideshow'].includes(idea.format) ? idea.format : 'text' })),
      sources: [...answer.sources, ...free.sources].slice(0, 30),
      engine: provider.key,
      usesPlatformKey: engine.resolved.usesPlatformKey,
      credits: engine.resolved.usesPlatformKey ? AI_CREDIT_COST.research : 0,
    };
  }
  await query(
    `UPDATE ai_research_reports SET status = 'succeeded', engine = $2, summary = $3, insights = $4, ideas = $5, sources = $6,
            uses_platform_key = $7, credits = $8, finished_at = now() WHERE id = $1`,
    [reportId, result.engine, result.summary, result.insights, JSON.stringify(result.ideas), JSON.stringify(result.sources), result.usesPlatformKey, result.credits]
  );
}

/** Starts a research report. Returns it at once (status 'running'); it finishes in the background. */
export async function startResearch(actor, { wait = false } = {}) {
  const kit = await getBrandKitRow();
  if (!kit.company_name && !kit.industry) throw badRequest('Fill in your Brand Kit first (at least the business name or industry).');
  const running = (await query("SELECT id FROM ai_research_reports WHERE status = 'running' AND created_at > now() - interval '30 minutes' LIMIT 1")).rows[0];
  if (running) throw badRequest('A research report is already being prepared. It will appear here in a minute or two.');

  const row = (await query("INSERT INTO ai_research_reports (engine, created_by) VALUES ('pending', $1) RETURNING *", [actor?.id ?? null])).rows[0];
  const work = runResearch(row.id, kit).catch(async (error) => {
    const message = error instanceof AiProviderError ? error.message : String(error?.message || error);
    if (!(error instanceof AiProviderError)) logger.warn('Research failed', { reportId: row.id, error: message });
    await query("UPDATE ai_research_reports SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [row.id, message.slice(0, 500)]);
  });
  if (wait) await work; // the scheduled job waits; a click returns straight away
  return getReport(row.id);
}

/** Scheduled: refresh research when the Brand Kit asks for it (daily / weekly) and the last one is old. */
export async function refreshResearchIfDue() {
  const kit = (await query('SELECT * FROM ai_brand_kits')).rows[0];
  if (!kit || kit.auto_research === 'off') return;
  const maxAgeDays = kit.auto_research === 'daily' ? 1 : 7;
  const recent = (
    await query(`SELECT 1 FROM ai_research_reports WHERE status IN ('running', 'succeeded') AND created_at > now() - ($1 || ' days')::interval LIMIT 1`, [String(maxAgeDays)])
  ).rows[0];
  if (!recent) await startResearch(null, { wait: true });
}

/**
 * The next research idea the autopilot has not posted about yet (and marks it used).
 * When every idea is used, starts again from the first one. Returns null without research.
 */
export async function takeNextIdea() {
  const report = await latestReportRow();
  if (!report?.ideas?.length) return null;
  const used = new Set(report.used_ideas ?? []);
  let index = report.ideas.findIndex((_, position) => !used.has(position));
  if (index === -1) {
    index = 0;
    await query("UPDATE ai_research_reports SET used_ideas = '{}' WHERE id = $1", [report.id]);
  }
  await query('UPDATE ai_research_reports SET used_ideas = array_append(used_ideas, $2) WHERE id = $1', [report.id, index]);
  return report.ideas[index];
}

/** Marks stuck research as failed (server restarted mid-way). Called by the AI job worker. */
export async function failStaleResearch() {
  await query(
    "UPDATE ai_research_reports SET status = 'failed', error = 'This research took too long and was stopped. Please try again.', finished_at = now() WHERE status = 'running' AND created_at < now() - interval '30 minutes'"
  );
}
