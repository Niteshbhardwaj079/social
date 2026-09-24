import { Router } from 'express';
import { authenticate, requireReportsViewer } from '../middleware/auth.js';
import { getDashboardOverview } from '../services/dashboardService.js';

const router = Router();
router.use(authenticate, requireReportsViewer);

router.get('/', async (_req, res) => res.json(await getDashboardOverview()));

export default router;
