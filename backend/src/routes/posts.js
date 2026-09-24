import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePostsViewer } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { forbidden } from '../utils/httpError.js';
import { isPlatform } from '../providers/index.js';
import { canWritePosts } from '../services/permissions.js';
import { approvePost, bulkChange, createPost, deletePost, getPost, listPosts, rejectPost, retryPost, updatePost } from '../services/postService.js';

const router = Router();
router.use(authenticate);

// Analysts can look at posts but not write them.
const requireWriter = (req, _res, next) => {
  if (!canWritePosts(req.user)) throw forbidden('Your role can view posts but not change them.');
  next();
};

const idParams = z.object({ id: z.string().uuid('Not a valid post id') });
const platform = z.string().refine(isPlatform, 'Unknown platform');
const status = z.enum(['draft', 'pendingApproval', 'scheduled', 'published']);
const content = z.string().trim().min(1, 'Write something before saving this post.').max(10000, 'This post is too long');
const platforms = z.array(platform).min(1, 'Choose at least one platform.').max(12).transform((list) => [...new Set(list)]);
const scheduledAt = z.string().datetime({ offset: true, message: 'Not a valid date and time' }).nullable();
const mediaIds = z.array(z.string().uuid()).max(10, 'At most 10 files per post').transform((list) => [...new Set(list)]);
const campaignId = z.string().uuid('Not a valid campaign id').nullable();
const pinterestBoardId = z.string().trim().min(1).max(100).nullable();

router.get(
  '/',
  requirePostsViewer,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(1000).default(500) }) }),
  async (req, res) => res.json({ posts: await listPosts(req.valid.query) })
);

router.post(
  '/',
  requireWriter,
  providerLimiter,
  validate({ body: z.object({ content, platforms, status, scheduledAt: scheduledAt.optional(), mediaIds: mediaIds.optional(), campaignId: campaignId.optional(), pinterestBoardId: pinterestBoardId.optional() }) }),
  async (req, res) => res.status(201).json({ post: await createPost({ actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

// Bulk actions come before "/:id" so "bulk" is never read as an id. No router-level gate here —
// bulkChange() calls deletePost()/updatePost() per item, and each already makes its own real
// canDeletePost/canEditPost check; a blanket `requireWriter` would wrongly block a postsDelete-only
// role (no postsWrite) from bulk-deleting, even though the per-item check would have allowed it.
router.post(
  '/bulk',
  validate({ body: z.object({ action: z.enum(['delete', 'draft']), ids: z.array(z.string().uuid()).min(1).max(200) }) }),
  async (req, res) => res.json(await bulkChange({ ...req.valid.body, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.get('/:id', requirePostsViewer, validate({ params: idParams }), async (req, res) => res.json({ post: await getPost(req.valid.params.id) }));

router.patch(
  '/:id',
  requireWriter,
  providerLimiter,
  validate({
    params: idParams,
    body: z
      .object({ content, platforms, status, scheduledAt, mediaIds, campaignId, pinterestBoardId })
      .partial()
      .refine((value) => Object.keys(value).length > 0, 'Nothing to change'),
  }),
  async (req, res) => res.json({ post: await updatePost({ id: req.valid.params.id, actor: req.user, input: req.valid.body, ip: req.ip, userAgent: req.get('user-agent') }) })
);

// No router-level gate — deletePost() makes its own real canDeletePost check (the independent
// `postsDelete` flag, or the own-draft ownership carve-out), which a blanket `requireWriter` here
// would wrongly block for a postsDelete-only role that lacks postsWrite.
router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await deletePost({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

router.post('/:id/retry', requireWriter, providerLimiter, validate({ params: idParams }), async (req, res) =>
  res.json({ post: await retryPost({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.post('/:id/approve', requireWriter, providerLimiter, validate({ params: idParams }), async (req, res) =>
  res.json({ post: await approvePost({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.post(
  '/:id/reject',
  requireWriter,
  validate({ params: idParams, body: z.object({ reason: z.string().trim().min(1, 'Say why, so the author knows what to change.').max(1000) }) }),
  async (req, res) => res.json({ post: await rejectPost({ id: req.valid.params.id, actor: req.user, reason: req.valid.body.reason, ip: req.ip, userAgent: req.get('user-agent') }) })
);

export default router;
