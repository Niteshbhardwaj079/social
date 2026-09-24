import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireReportsViewer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getAnalyticsOverview, getContentAnalytics } from '../services/analyticsService.js';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const router = Router();
router.use(authenticate, requireReportsViewer);

router.get(
  '/overview',
  validate({ query: z.object({ range: z.enum(['7d', '30d', '90d']).default('30d') }) }),
  async (req, res) => res.json(await getAnalyticsOverview(RANGE_DAYS[req.valid.query.range]))
);

router.get('/content', async (_req, res) => res.json(await getContentAnalytics()));

export default router;
