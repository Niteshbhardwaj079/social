import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireSettingsEditor } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LANGUAGES, isValidLanguage } from '../emails/builder.js';
import { getLanguageSettings, getWorkspace, saveLanguageSettings, saveWorkspace } from '../services/settingsService.js';
import { recordActivity } from '../services/auditService.js';

const router = Router();
router.use(authenticate);

const languageCode = z.string().refine(isValidLanguage, 'Unknown language');

// ---------------------------------------------------------------- languages
// Deliberately open to anyone signed in (not gated by settingsView) — unlike System Emails below,
// this was never restricted even before the granular rework, and workspace/language basics aren't
// sensitive the way email template content is.
router.get('/languages', async (_req, res) => {
  res.json({ ...(await getLanguageSettings()), languages: LANGUAGES });
});

router.put(
  '/languages',
  requireSettingsEditor,
  validate({
    body: z
      .object({ enabledLanguages: z.array(languageCode).min(1, 'Keep at least one language on'), defaultLanguage: languageCode })
      .refine((value) => value.enabledLanguages.includes(value.defaultLanguage), {
        message: 'The default language must be one of the enabled languages',
        path: ['defaultLanguage'],
      }),
  }),
  async (req, res) => {
    const saved = await saveLanguageSettings(req.valid.body);
    await recordActivity({ actorId: req.user.id, action: 'settings.languages_updated', entity: 'settings', entityId: 'languages', meta: saved, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ ...saved, languages: LANGUAGES });
  }
);

// ---------------------------------------------------------------- workspace details
// Asks the runtime itself, so aliases like Asia/Kolkata (listed as Asia/Calcutta by some ICU builds) are accepted too.
function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

router.get('/workspace', async (_req, res) => res.json(await getWorkspace()));

router.put(
  '/workspace',
  requireSettingsEditor,
  validate({
    body: z
      .object({
        name: z.string().trim().max(160),
        website: z.string().trim().max(200),
        timezone: z.string().refine(isTimeZone, 'Unknown timezone'),
      })
      .partial()
      .refine((value) => Object.keys(value).length > 0, 'Nothing to change'),
  }),
  async (req, res) => {
    const saved = await saveWorkspace(req.valid.body);
    await recordActivity({ actorId: req.user.id, action: 'settings.workspace_updated', entity: 'settings', entityId: 'workspace', ip: req.ip, userAgent: req.get('user-agent') });
    res.json(saved);
  }
);

export default router;
