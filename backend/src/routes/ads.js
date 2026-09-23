import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAccountManager } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isPlatform } from '../providers/index.js';
import { notFound } from '../utils/httpError.js';
import {
  connectAdAccount,
  createCampaign,
  deleteCampaigns,
  disconnectAdAccount,
  getCampaign,
  listAdAccounts,
  listCampaigns,
  testAdAccountConnection,
  updateCampaignsStatus,
} from '../services/adsService.js';

const router = Router();
router.use(authenticate);

const AD_NETWORKS = ['meta', 'google', 'linkedin', 'x', 'tiktok', 'pinterest'];
const networkParams = z.object({ network: z.enum(AD_NETWORKS) });
const credentials = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 20, 'Too many fields');

router.get('/accounts', async (_req, res) => res.json({ accounts: await listAdAccounts() }));

router.post(
  '/accounts/:network/test',
  requireAccountManager,
  providerLimiter,
  validate({ params: networkParams, body: z.object({ credentials }) }),
  async (req, res) => res.json(await testAdAccountConnection(req.valid.params.network, req.valid.body.credentials))
);

router.put(
  '/accounts/:network',
  requireAccountManager,
  providerLimiter,
  validate({ params: networkParams, body: z.object({ credentials }) }),
  async (req, res) => {
    const account = await connectAdAccount({ network: req.valid.params.network, input: req.valid.body.credentials, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ account });
  }
);

router.delete(
  '/accounts/:network',
  requireAccountManager,
  validate({ params: networkParams }),
  async (req, res) => res.json({ account: await disconnectAdAccount({ network: req.valid.params.network, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
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
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales']),
  network: z.enum(AD_NETWORKS),
  platforms: z.array(z.string().refine(isPlatform, 'Unknown platform')).min(1),
  budgetType: z.enum(['daily', 'lifetime']),
  budget: z.coerce.number().min(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
  creative: creativeSchema,
  audience: audienceSchema,
  status: z.enum(['draft']).optional(),
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
