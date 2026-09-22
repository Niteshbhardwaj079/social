import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireStorageManager } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isStorageProvider, STORAGE_LIMIT_UNITS } from '../storage/providers.js';
import * as storageService from '../services/storageService.js';

const router = Router();
router.use(authenticate);

const providerParams = z.object({ providerKey: z.string().refine(isStorageProvider, 'Unknown storage provider') });
const values = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 20, 'Too many fields');

// Everyone signed in may see which storage is active (the Media Library reads it before every upload);
// only Super Admin / Admin may see... nothing secret is ever returned, so a plain read is fine for anyone.
router.get('/', async (_req, res) => res.json(await storageService.getSettings()));

router.post(
  '/providers/:providerKey/test',
  requireStorageManager,
  providerLimiter,
  validate({ params: providerParams, body: z.object({ values, kind: z.enum(['connection', 'upload']).default('connection') }) }),
  async (req, res) => res.json(await storageService.testProvider(req.valid.params.providerKey, req.valid.body.values, req.valid.body.kind))
);

router.put(
  '/providers/:providerKey',
  requireStorageManager,
  providerLimiter,
  validate({ params: providerParams, body: z.object({ values }) }),
  async (req, res) =>
    res.json(await storageService.saveProvider({ providerKey: req.valid.params.providerKey, input: req.valid.body.values, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.delete('/provider', requireStorageManager, async (req, res) => res.json(await storageService.disconnectProvider({ actor: req.user, ip: req.ip, userAgent: req.get('user-agent') })));

router.put(
  '/preferences',
  requireStorageManager,
  validate({
    body: z.object({
      serverEnabled: z.boolean(),
      externalEnabled: z.boolean(),
      limitValue: z.union([z.coerce.number().positive(), z.literal('')]).optional(),
      limitUnit: z.enum(STORAGE_LIMIT_UNITS).optional(),
    }),
  }),
  async (req, res) => res.json(await storageService.savePreferences({ ...req.valid.body, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

export default router;
