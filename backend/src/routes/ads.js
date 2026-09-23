import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isPlatform } from '../providers/index.js';
import { notFound } from '../utils/httpError.js';
import {
  createBulkCampaign,
  createCampaign,
  deleteCampaigns,
  getCampaign,
  listAdAccounts,
  listCampaigns,
  MAX_BULK_VARIATIONS,
  syncAdAccounts,
  updateCampaignsStatus,
} from '../services/adsService.js';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from '../services/adCreativeTemplateService.js';
import { createRule, deleteRule, listRules, updateRule } from '../services/adRuleService.js';

const router = Router();
router.use(authenticate);

// Ad accounts are discovered from the client's own Facebook connection (Social Accounts) — there is
// no per-network connect/test/disconnect here any more, only "read the cache" and "sync it for real".
router.get('/accounts', async (_req, res) => res.json(await listAdAccounts()));

router.post('/accounts/sync', providerLimiter, async (req, res) =>
  res.json(await syncAdAccounts({ actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

const creativeSchema = z.object({
  headline: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(500),
  cta: z.string().min(1),
  destinationUrl: z.string().url(),
  mediaId: z.string().uuid().nullish(),
});
const audienceSchema = z.object({
  locations: z.array(z.string()).min(1),
  ageMin: z.coerce.number().int().min(13).max(65),
  ageMax: z.coerce.number().int().min(13).max(65),
  gender: z.enum(['all', 'men', 'women']),
  interests: z.array(z.string()).default([]),
});
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales']),
    adAccountId: z.string().uuid('Choose an ad account'),
    platforms: z.array(z.string().refine(isPlatform, 'Unknown platform')).min(1),
    budgetType: z.enum(['daily', 'lifetime']),
    budget: z.coerce.number().min(100),
    startDate: z.string().date(),
    endDate: z.string().date(),
    // Either real ad creative, or an existing post to boost (Phase 3) — never both, never neither.
    creative: creativeSchema.optional(),
    sourcePostId: z.string().uuid().optional(),
    audience: audienceSchema,
    status: z.enum(['draft']).optional(),
  })
  .refine((value) => Boolean(value.creative) !== Boolean(value.sourcePostId), {
    message: 'Add ad creative details, or choose an existing post to boost — not both.',
    path: ['creative'],
  });

// Phase 4: bulk ad creation — several fresh creative variations sharing one campaign/ad set/audience/
// budget. No `sourcePostId` here at all (boosting isn't offered for a bulk batch — see
// adsService.createBulkCampaign's own comment for why), enforced by this schema's shape, not a runtime check.
const bulkCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales']),
  adAccountId: z.string().uuid('Choose an ad account'),
  platforms: z.array(z.string().refine(isPlatform, 'Unknown platform')).min(1),
  budgetType: z.enum(['daily', 'lifetime']),
  budget: z.coerce.number().min(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
  creatives: z
    .array(creativeSchema)
    .min(2, 'Add at least 2 variations — for just one, use the regular Create ad flow.')
    .max(MAX_BULK_VARIATIONS, `Up to ${MAX_BULK_VARIATIONS} variations at a time.`),
  audience: audienceSchema,
  status: z.enum(['draft']).optional(),
});

// Phase 5: Creative Library — saved, reusable creatives, independent of any ad. Registered before
// GET /:id below so the literal path "/templates" is never swallowed by the :id param route.
const templateSchema = creativeSchema.extend({ name: z.string().trim().min(1).max(200) });

router.get('/templates', async (_req, res) => res.json({ templates: await listTemplates() }));

router.post(
  '/templates',
  validate({ body: templateSchema }),
  async (req, res) => {
    const template = await createTemplate({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ template });
  }
);

router.patch(
  '/templates/:id',
  validate({ params: z.object({ id: z.string().uuid() }), body: templateSchema }),
  async (req, res) => {
    const template = await updateTemplate({ id: req.valid.params.id, actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ template });
  }
);

router.delete(
  '/templates/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    await deleteTemplate({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ success: true });
  }
);

// Phase 8: Automated Rules — pause/resume only, never budget (see adRuleService.js's header comment).
// Registered before GET /:id below, same reason as /templates above.
const ruleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  adAccountId: z.string().uuid('Choose an ad account'),
  metric: z.enum(['spend', 'impressions', 'clicks', 'ctr', 'cpc']),
  comparator: z.enum(['gt', 'lt']),
  threshold: z.coerce.number().min(0),
  windowDays: z.coerce.number().int().refine((value) => [1, 3, 7, 14, 30].includes(value), 'Choose a real window'),
  action: z.enum(['pause', 'resume']),
  isActive: z.boolean().default(true),
  cooldownHours: z.coerce.number().int().min(1).max(720).default(24),
});

router.get('/rules', async (_req, res) => res.json({ rules: await listRules() }));

router.post(
  '/rules',
  validate({ body: ruleSchema }),
  async (req, res) => {
    const rule = await createRule({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ rule });
  }
);

router.patch(
  '/rules/:id',
  validate({ params: z.object({ id: z.string().uuid() }), body: ruleSchema }),
  async (req, res) => {
    const rule = await updateRule({ id: req.valid.params.id, actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ rule });
  }
);

router.delete(
  '/rules/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    await deleteRule({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ success: true });
  }
);

router.get('/', async (_req, res) => res.json({ ads: await listCampaigns() }));

router.get(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const ad = await getCampaign(req.valid.params.id);
    if (!ad) throw notFound('Ad not found');
    res.json({ ad });
  }
);

router.post(
  '/',
  providerLimiter,
  validate({ body: createSchema }),
  async (req, res) => {
    const ad = await createCampaign({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ ad });
  }
);

router.post(
  '/bulk',
  providerLimiter,
  validate({ body: bulkCreateSchema }),
  async (req, res) => {
    const ads = await createBulkCampaign({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ ads });
  }
);

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

router.patch(
  '/status',
  providerLimiter,
  validate({ body: idsSchema.extend({ status: z.enum(['active', 'paused']) }) }),
  async (req, res) => res.json(await updateCampaignsStatus({ ids: req.valid.body.ids, status: req.valid.body.status, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.delete(
  '/',
  validate({ body: idsSchema }),
  async (req, res) => res.json(await deleteCampaigns({ ids: req.valid.body.ids, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

export default router;
