import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDashboardOverview } from '../services/dashboardService.js';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => res.json(await getDashboardOverview()));

export default router;
