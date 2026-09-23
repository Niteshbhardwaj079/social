import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createLink, deleteLink, deleteLinks, listLinks } from '../services/shortLinkService.js';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => res.json({ links: await listLinks() }));

router.post(
  '/',
  validate({
    body: z.object({
      destinationUrl: z.string().trim().min(1).max(2000),
      label: z.string().trim().max(200).optional(),
      customSlug: z.string().trim().max(60).optional(),
    }),
  }),
  async (req, res) => {
    const link = await createLink({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ link });
  }
);

router.delete(
  '/',
  validate({ body: z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }) }),
  async (req, res) => res.json(await deleteLinks({ ids: req.valid.body.ids, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    await deleteLink({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ success: true });
  }
);

export default router;
