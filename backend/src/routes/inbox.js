import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forbidden } from '../utils/httpError.js';
import { canPublishPosts, canWritePosts } from '../services/permissions.js';
import * as inboxService from '../services/inboxService.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: z.string().uuid('Not a valid conversation id') });

// Analysts can read the Inbox but not act on it — same rule as posts.
const requireWriter = (req, _res, next) => {
  if (!canWritePosts(req.user)) throw forbidden('Your role can view the Inbox but not change it.');
  next();
};

router.get('/', async (_req, res) => res.json({ conversations: await inboxService.listConversations() }));
router.get('/assignable-users', async (_req, res) => res.json({ users: await inboxService.listAssignableUsers() }));

router.post('/:id/read', requireWriter, validate({ params: idParams }), async (req, res) => {
  await inboxService.markRead(req.valid.params.id);
  res.json({ success: true });
});

router.patch(
  '/:id/status',
  requireWriter,
  validate({ params: idParams, body: z.object({ status: z.enum(['open', 'pending', 'closed']) }) }),
  async (req, res) => {
    await inboxService.updateStatus(req.valid.params.id, req.valid.body.status);
    res.json({ success: true });
  }
);

router.patch(
  '/:id/assign',
  requireWriter,
  validate({ params: idParams, body: z.object({ userId: z.string().uuid().nullable() }) }),
  async (req, res) => {
    await inboxService.assignConversation(req.valid.params.id, req.valid.body.userId);
    res.json({ success: true });
  }
);

router.post(
  '/:id/reply',
  validate({ params: idParams, body: z.object({ text: z.string().trim().min(1, 'Write a reply first.').max(2000) }) }),
  async (req, res) => {
    if (!canPublishPosts(req.user)) throw forbidden('Your role cannot send a reply.');
    const message = await inboxService.sendReply(req.valid.params.id, req.user, req.valid.body.text, { ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ message });
  }
);

export default router;
