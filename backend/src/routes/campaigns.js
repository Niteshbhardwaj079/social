import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isPlatform } from '../providers/index.js';
import * as campaignService from '../services/campaignService.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: z.string().uuid('Not a valid campaign id') });
const platform = z.string().refine(isPlatform, 'Unknown platform');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Not a valid date').nullable();

const campaignBody = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name').max(200),
  description: z.string().trim().max(2000).optional(),
  objective: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'scheduled', 'completed', 'paused']).optional(),
  platforms: z.array(platform).max(12).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
});

router.get('/', async (_req, res) => res.json({ campaigns: await campaignService.listCampaigns() }));

router.get('/:id', validate({ params: idParams }), async (req, res) => res.json({ campaign: await campaignService.getCampaign(req.valid.params.id) }));

router.post('/', validate({ body: campaignBody }), async (req, res) =>
  res.status(201).json({ campaign: await campaignService.createCampaign({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.patch(
  '/:id',
  validate({ params: idParams, body: campaignBody.partial().refine((value) => Object.keys(value).length > 0, 'Nothing to change') }),
  async (req, res) => res.json({ campaign: await campaignService.updateCampaign({ id: req.valid.params.id, actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await campaignService.deleteCampaign({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

export default router;
