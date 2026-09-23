import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authenticate, requireUserManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getPublicConfig } from '../services/authService.js';
import { deleteActivityByIds, listActivity } from '../services/auditService.js';
import { mailMode } from '../services/mailer.js';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import settingsRoutes from './settings.js';
import systemEmailRoutes from './systemEmails.js';
import socialAccountRoutes from './socialAccounts.js';
import postRoutes from './posts.js';
import storageRoutes from './storage.js';
import mediaRoutes from './media.js';
import notificationRoutes from './notifications.js';
import campaignRoutes from './campaigns.js';
import recyclingRoutes from './recycling.js';
import dashboardRoutes from './dashboard.js';
import analyticsRoutes from './analytics.js';

const router = Router();

// Used by load balancers / uptime monitors. 503 when the database cannot be reached.
router.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'up', mail: mailMode() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});

// Needed before anyone signs in: is first-run setup pending, which languages are offered.
router.get('/public/config', async (_req, res) => res.json(await getPublicConfig()));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);
router.use('/system-emails', systemEmailRoutes);
router.use('/social-accounts', socialAccountRoutes);
router.use('/posts', postRoutes);
router.use('/storage', storageRoutes);
router.use('/media', mediaRoutes);
router.use('/notifications', notificationRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/recycling', recyclingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics', analyticsRoutes);

router.get(
  '/activity-logs',
  authenticate,
  requireUserManager,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(500), before: z.coerce.number().int().positive().optional() }) }),
  async (req, res) => res.json({ activity: await listActivity(req.valid.query) })
);

router.delete(
  '/activity-logs',
  authenticate,
  requireUserManager,
  validate({ body: z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) }) }),
  async (req, res) => {
    await deleteActivityByIds(req.valid.body.ids);
    res.json({ success: true });
  }
);

export default router;
