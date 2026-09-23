import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isPlatform } from '../providers/index.js';
import { notFound } from '../utils/httpError.js';
import {
  createCampaign,
  deleteCampaigns,
  getCampaign,
  listAdAccounts,
  listCampaigns,
  syncAdAccounts,
  updateCampaignsStatus,
} from '../services/adsService.js';

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
