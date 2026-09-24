import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireSettingsEditor, requireSettingsViewer } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { isEmailProvider } from '../email/providers.js';
import * as emailSettingsService from '../services/emailSettingsService.js';
import { sendEmail } from '../services/mailer.js';

const router = Router();
router.use(authenticate);

const providerParams = z.object({ providerKey: z.string().refine(isEmailProvider, 'Unknown email provider') });
const values = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length <= 20, 'Too many fields');

router.get('/', requireSettingsViewer, async (_req, res) => res.json(await emailSettingsService.getSettings()));

router.post(
  '/providers/:providerKey/test',
  requireSettingsEditor,
  providerLimiter,
  validate({ params: providerParams, body: z.object({ values }) }),
  async (req, res) => res.json(await emailSettingsService.testProvider(req.valid.params.providerKey, req.valid.body.values))
);

router.put(
  '/providers/:providerKey',
  requireSettingsEditor,
  providerLimiter,
  validate({ params: providerParams, body: z.object({ values }) }),
  async (req, res) =>
    res.json(
      await emailSettingsService.saveProvider({
        providerKey: req.valid.params.providerKey,
        input: req.valid.body.values,
        actor: req.user,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      })
    )
);

router.delete('/provider', requireSettingsEditor, async (req, res) => res.json(await emailSettingsService.disconnectProvider({ actor: req.user, ip: req.ip, userAgent: req.get('user-agent') })));

router.post(
  '/send-test',
  requireSettingsEditor,
  providerLimiter,
  validate({ body: z.object({ recipient: z.string().trim().email('Enter a valid email address').max(254) }) }),
  async (req, res) =>
    res.json(
      await sendEmail({
        toEmail: req.valid.body.recipient,
        toName: req.user.name,
        language: req.user.language || 'en',
        eventKey: 'test:email_settings',
        subject: 'Test email from your Social workspace',
        html: '<p>This is a test email from your Social workspace’s Email settings. If you got this, your outgoing email setup works.</p>',
      })
    )
);

export default router;
