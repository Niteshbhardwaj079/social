import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as notificationService from '../services/notificationService.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: z.string().uuid('Not a valid notification id') });
const preferencesBody = z
  .record(z.string(), z.boolean())
  .refine((value) => Object.keys(value).every((key) => notificationService.NOTIFICATION_TYPES.includes(key)), 'Unknown notification type')
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');

router.get('/', async (req, res) => res.json(await notificationService.listNotifications(req.user.id)));

router.post('/:id/read', validate({ params: idParams }), async (req, res) => {
  await notificationService.markAsRead(req.user.id, req.valid.params.id);
  res.json({ success: true });
});

router.post('/read-all', async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);
  res.json({ success: true });
});

router.get('/preferences', async (req, res) => res.json({ preferences: await notificationService.getPreferences(req.user.id) }));

router.patch('/preferences', validate({ body: preferencesBody }), async (req, res) =>
  res.json({ preferences: await notificationService.setPreferences(req.user.id, req.valid.body) })
);

export default router;
