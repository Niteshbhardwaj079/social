import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireSettingsEditor, requireSettingsViewer } from '../middleware/auth.js';
import { providerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as emailSettingsService from '../services/emailSettingsService.js';
import { sendEmail } from '../services/mailer.js';

const router = Router();
router.use(authenticate);

const settingsBody = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().trim().max(255).optional().default(''),
  password: z.string().max(500).optional().default(''),
  fromEmail: z.string().trim().email('Enter a valid email address').max(254),
  fromName: z.string().trim().max(160).optional().default(''),
});

router.get('/', requireSettingsViewer, async (_req, res) => res.json(await emailSettingsService.getSettings()));

router.post(
  '/test',
  requireSettingsEditor,
  providerLimiter,
  validate({ body: settingsBody }),
  async (req, res) => res.json(await emailSettingsService.testSettings(req.valid.body))
);

router.put(
  '/',
  requireSettingsEditor,
  providerLimiter,
  validate({ body: settingsBody }),
  async (req, res) =>
    res.json(await emailSettingsService.saveSettings({ input: req.valid.body, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

router.delete('/', requireSettingsEditor, async (req, res) => res.json(await emailSettingsService.disconnectSettings({ actor: req.user, ip: req.ip, userAgent: req.get('user-agent') })));

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
