import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as recyclingService from '../services/recyclingService.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: z.string().uuid('Not a valid recycling entry id') });
const intervalDays = z.union([z.literal(14), z.literal(30), z.literal(60), z.literal(90)]);

router.get('/', async (_req, res) => res.json({ entries: await recyclingService.listRecycling() }));

router.post(
  '/',
  validate({ body: z.object({ postId: z.string().uuid('Not a valid post id'), intervalDays }) }),
  async (req, res) => res.status(201).json({ entry: await recyclingService.addToRecycling({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

// Bulk actions come before "/:id" so "bulk-update"/"bulk-delete" are never read as an id.
router.post(
  '/bulk-update',
  validate({ body: z.object({ ids: z.array(z.string().uuid()).min(1).max(200), isActive: z.boolean() }) }),
  async (req, res) => res.json(await recyclingService.bulkUpdateRecycling({ ids: req.valid.body.ids, isActive: req.valid.body.isActive, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.post(
  '/bulk-delete',
  validate({ body: z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }) }),
  async (req, res) => res.json(await recyclingService.removeManyFromRecycling({ ids: req.valid.body.ids, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.patch(
  '/:id',
  validate({
    params: idParams,
    body: z.object({ isActive: z.boolean(), intervalDays }).partial().refine((value) => Object.keys(value).length > 0, 'Nothing to change'),
  }),
  async (req, res) => res.json({ entry: await recyclingService.updateRecyclingEntry({ id: req.valid.params.id, actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await recyclingService.removeFromRecycling({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

export default router;
