import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAccountManager } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isPlatform } from '../providers/index.js';
import { connectAccount, disconnectAccount, getPinterestBoards, listAccounts, recheckAccount, testCredentials } from '../services/socialAccountService.js';

const router = Router();
router.use(authenticate);

const platformParams = z.object({ platform: z.string().refine(isPlatform, 'Unknown platform') });
// Which fields are needed depends on the platform, so the service checks them; here it is only "an object of text".
const credentials = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 20, 'Too many fields');

// Everyone signed in can see which channels are connected (the composer needs it); managing them is for admins.
router.get('/', async (_req, res) => res.json({ accounts: await listAccounts() }));

// Everyone who can write a post needs this for the Pinterest board picker, not just account managers.
router.get('/pinterest/boards', async (_req, res) => res.json({ boards: await getPinterestBoards() }));

router.post(
  '/:platform/test',
  requireAccountManager,
  providerLimiter,
  validate({ params: platformParams, body: z.object({ credentials }) }),
  async (req, res) => res.json(await testCredentials(req.valid.params.platform, req.valid.body.credentials))
);

router.put(
  '/:platform',
  requireAccountManager,
  providerLimiter,
  validate({ params: platformParams, body: z.object({ credentials, apiTier: z.enum(['free', 'paid']).default('free') }) }),
  async (req, res) => {
    const account = await connectAccount({
      platform: req.valid.params.platform,
      input: req.valid.body.credentials,
      apiTier: req.valid.body.apiTier,
      actor: req.user,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ account });
  }
);

router.post(
  '/:platform/recheck',
  requireAccountManager,
  providerLimiter,
  validate({ params: platformParams }),
  async (req, res) => res.json({ account: await recheckAccount(req.valid.params.platform, { actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.delete(
  '/:platform',
  requireAccountManager,
  validate({ params: platformParams }),
  async (req, res) => res.json({ account: await disconnectAccount({ platform: req.valid.params.platform, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
);

export default router;
