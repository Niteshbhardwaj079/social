import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireSettingsEditor, requireSettingsViewer } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { PLATFORM_KEYS } from '../providers/index.js';
import { AI_PROVIDER_KEYS } from '../ai/providers/index.js';
import { isValidLanguage } from '../emails/builder.js';
import { DESIGN_TEMPLATES } from '../ai/design/templates.js';
import { assertAiAvailable, getAiAccess } from '../services/aiAccessService.js';
import * as keys from '../services/aiKeyService.js';
import * as ai from '../services/aiService.js';
import * as autopilots from '../services/autopilotService.js';
import * as agent from '../services/aiAgentService.js';
import * as plans from '../services/aiPlanService.js';

/**
 * AI Studio. `GET /ai/access` is open to every signed-in person (the web app uses it to show, lock or
 * hide AI). Settings → AI needs the Settings permissions; everything that makes content needs AI access.
 */
const router = Router();
router.use(authenticate);

const metaOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') || null });
const idParams = z.object({ id: z.string().uuid() });
const providerParams = z.object({ provider: z.enum(AI_PROVIDER_KEYS) });
const platforms = z.array(z.enum(PLATFORM_KEYS)).max(20).default([]);
const language = z.string().refine((code) => code === 'hinglish' || isValidLanguage(code), 'Unknown language').default('en');
const tone = z.string().trim().min(2).max(60).default('friendly');
const aspect = z.enum(['square', 'portrait', 'landscape']);
const brief = z.string().trim().min(5, 'Tell the AI a bit more (at least a few words).').max(2000);

/** Every content-making route below needs AI to be available for this person. */
async function requireAi(req, _res, next) {
  await assertAiAvailable(req.user);
  next();
}

router.get('/access', async (req, res) => res.json(await getAiAccess(req.user)));

// ---------------------------------------------------------------- Settings → AI (the organization's keys and choices)
router.get('/settings', requireSettingsViewer, async (_req, res) => {
  const [providers, settings] = await Promise.all([keys.describeProviders(), keys.getAiSettingsRow()]);
  res.json({
    providers,
    settings: { textProvider: settings.text_provider, imageProvider: settings.image_provider, videoProvider: settings.video_provider, brandVoice: settings.brand_voice },
  });
});

const providerChoice = z.enum(AI_PROVIDER_KEYS).nullable().default(null);
router.put(
  '/settings',
  requireSettingsEditor,
  validate({ body: z.object({ textProvider: providerChoice, imageProvider: providerChoice, videoProvider: providerChoice, brandVoice: z.string().trim().max(500).default('') }) }),
  async (req, res) => {
    const saved = await keys.saveAiSettings(req.valid.body);
    res.json({ settings: { textProvider: saved.text_provider, imageProvider: saved.image_provider, videoProvider: saved.video_provider, brandVoice: saved.brand_voice } });
  }
);

router.put(
  '/keys/:provider',
  requireSettingsEditor,
  providerLimiter,
  validate({ params: providerParams, body: z.object({ apiKey: z.string().trim().min(10).max(500) }) }),
  async (req, res) => res.json({ keys: await keys.saveOrganizationKey(req.valid.params.provider, req.valid.body.apiKey) })
);

router.delete('/keys/:provider', requireSettingsEditor, validate({ params: providerParams }), async (req, res) =>
  res.json({ keys: await keys.removeOrganizationKey(req.valid.params.provider) })
);

// ---------------------------------------------------------------- making content
router.post(
  '/text',
  requireAi,
  providerLimiter,
  validate({ body: z.object({ brief, platforms, tone, language, variants: z.number().int().min(1).max(5).default(3), hashtags: z.boolean().default(true) }) }),
  async (req, res) => res.json(await ai.writePosts(req.user, req.valid.body))
);

router.post(
  '/image',
  requireAi,
  providerLimiter,
  validate({
    body: z.object({
      prompt: brief,
      aspect: aspect.default('square'),
      textOnImage: z.string().trim().max(120).default(''),
      template: z.enum(['auto', 'none', ...DESIGN_TEMPLATES]).default('auto'),
    }),
  }),
  async (req, res) => res.status(201).json(await ai.createImage(req.user, req.valid.body, metaOf(req)))
);

router.post(
  '/slideshow',
  requireAi,
  providerLimiter,
  validate({
    body: z.object({
      brief,
      slideCount: z.number().int().min(2).max(8).default(4),
      aspect: aspect.default('portrait'),
      language,
      tone,
      imageMediaIds: z.array(z.string().uuid()).max(8).default([]),
    }),
  }),
  async (req, res) => res.status(202).json({ generation: await ai.createSlideshow(req.user, req.valid.body) })
);

router.post(
  '/video',
  requireAi,
  providerLimiter,
  validate({ body: z.object({ prompt: brief, aspect: aspect.default('portrait'), seconds: z.union([z.literal(4), z.literal(8), z.literal(12)]).default(8) }) }),
  async (req, res) => res.status(202).json({ generation: await ai.createVideo(req.user, req.valid.body) })
);

router.get('/generations', requireAi, async (_req, res) => res.json({ generations: await ai.listGenerations() }));
router.get('/generations/:id', requireAi, validate({ params: idParams }), async (req, res) => res.json({ generation: await ai.getGeneration(req.valid.params.id) }));

// ---------------------------------------------------------------- Brand Kit + research (the agent's knowledge)
const longText = (max) => z.string().trim().max(max);
const brandKitBody = z
  .object({
    companyName: longText(160),
    website: z.union([z.literal(''), z.string().trim().url().max(300)]),
    industry: longText(120),
    description: longText(1500),
    products: longText(2000),
    targetAudience: longText(500),
    location: longText(120),
    usps: longText(1500),
    competitors: longText(1000),
    keywords: longText(500),
    tone: longText(60),
    avoid: longText(500),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #4f46e5'),
    phone: longText(40),
    autoResearch: z.enum(['off', 'daily', 'weekly']),
    logoMediaId: z.string().uuid().nullable(),
  })
  .partial();

router.get('/brand-kit', requireAi, async (_req, res) => res.json({ brandKit: agent.presentBrandKit(await agent.getBrandKitRow()) }));
router.put('/brand-kit', requireAi, validate({ body: brandKitBody }), async (req, res) => res.json({ brandKit: await agent.saveBrandKit(req.valid.body) }));
router.post('/brand-kit/from-website', requireAi, providerLimiter, validate({ body: z.object({ url: z.string().trim().url().max(300) }) }), async (req, res) =>
  res.json(await agent.brandKitFromWebsite(req.valid.body.url))
);

router.get('/research', requireAi, async (_req, res) => res.json({ reports: await agent.listReports() }));
router.get('/research/:id', requireAi, validate({ params: idParams }), async (req, res) => res.json({ report: await agent.getReport(req.valid.params.id) }));
router.post('/research', requireAi, providerLimiter, async (req, res) => res.status(202).json({ report: await agent.startResearch(req.user) }));

// ---------------------------------------------------------------- weekly content plans
router.get('/plans', requireAi, async (_req, res) => res.json({ plans: await plans.listPlans() }));
router.get('/plans/:id', requireAi, validate({ params: idParams }), async (req, res) => res.json({ plan: await plans.getPlan(req.valid.params.id) }));
router.post(
  '/plans',
  requireAi,
  validate({
    body: z.object({
      days: z.number().int().min(1).max(14).default(7),
      postsPerDay: z.number().int().min(1).max(3).default(1),
      platforms: z.array(z.enum(PLATFORM_KEYS)).min(1, 'Choose at least one platform').max(20),
      format: z.enum(['text', 'image', 'mix']).default('mix'),
      language,
      tone,
      postTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must look like 10:00').default('10:00'),
      timezone: z.string().max(60).default('Asia/Kolkata'),
      requireApproval: z.boolean().default(true),
    }),
  }),
  async (req, res) => {
    const plan = await plans.createPlan(req.user, req.valid.body);
    ai.kickJobWorker();
    res.status(202).json({ plan });
  }
);

// ---------------------------------------------------------------- autopilots
const autopilotBody = z.object({
  name: z.string().trim().min(1).max(80),
  brief: z.string().trim().max(2000).default(''), // optional when useBrandKit / weekly plan
  tone,
  language,
  platforms: z.array(z.enum(PLATFORM_KEYS)).min(1, 'Choose at least one platform').max(20),
  contentType: z.enum(['text', 'image', 'slideshow', 'video', 'mix']).default('text'),
  useBrandKit: z.boolean().default(false),
  mode: z.enum(['single', 'weekly_plan']).default('single'),
  postsPerDay: z.number().int().min(1).max(3).default(1),
  frequency: z.enum(['daily', 'weekdays', 'weekly']).default('daily'),
  postTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must look like 10:00').default('10:00'),
  weekday: z.number().int().min(0).max(6).default(1),
  timezone: z.string().max(60).default('Asia/Kolkata'),
  requireApproval: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

router.get('/autopilots', requireAi, async (_req, res) => res.json({ autopilots: await autopilots.listAutopilots() }));

router.post('/autopilots', requireAi, validate({ body: autopilotBody }), async (req, res) =>
  res.status(201).json({ autopilot: await autopilots.createAutopilot(req.user, req.valid.body) })
);

router.patch('/autopilots/:id', requireAi, validate({ params: idParams, body: autopilotBody.partial() }), async (req, res) =>
  res.json({ autopilot: await autopilots.updateAutopilot(req.user, req.valid.params.id, stripDefaults(req.body, req.valid.body)) })
);

router.delete('/autopilots/:id', requireAi, validate({ params: idParams }), async (req, res) => {
  await autopilots.deleteAutopilot(req.user, req.valid.params.id);
  res.json({ success: true });
});

router.post('/autopilots/:id/run', requireAi, providerLimiter, validate({ params: idParams }), async (req, res) =>
  res.json(await autopilots.runAutopilotNow(req.user, req.valid.params.id))
);

/** zod fills defaults even on a partial schema; for a PATCH only the fields actually sent should change. */
function stripDefaults(rawBody, validBody) {
  return Object.fromEntries(Object.entries(validBody).filter(([key]) => Object.hasOwn(rawBody ?? {}, key)));
}

export default router;
