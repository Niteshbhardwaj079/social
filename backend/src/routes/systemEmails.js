import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/env.js';
import { authenticate, requireSettingsEditor, requireSettingsViewer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/httpError.js';
import { isValidLanguage } from '../emails/builder.js';
import { effectiveLanguage } from '../services/settingsService.js';
import * as emails from '../services/systemEmailService.js';
import { recordActivity } from '../services/auditService.js';

const router = Router();
router.use(authenticate);

const languageCode = z.string().refine(isValidLanguage, 'Unknown language');
const idParam = z.object({ id: z.string().min(1).max(80) });
const langQuery = z.object({ lang: languageCode.optional() });

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!/^image\//.test(file.mimetype)) return callback(badRequest('Only images can be uploaded.'));
    callback(null, true);
  },
});

function oneImage(req, res, next) {
  uploadImage.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest(`That file is larger than the ${Math.round(config.media.maxUploadBytes / (1024 * 1024))} MB limit for a single upload.`));
    }
    next(error);
  });
}

/** ?lang= chooses which language's copy to look at; without it, the caller's own language. */
const pickLanguage = async (req) => req.valid.query?.lang ?? (await effectiveLanguage(req.user.language));

router.get('/', requireSettingsViewer, validate({ query: langQuery }), async (req, res) => {
  const language = await pickLanguage(req);
  res.json({ language, emails: await emails.listEmails(language) });
});

router.get('/:id', requireSettingsViewer, validate({ params: idParam, query: langQuery }), async (req, res) => {
  res.json({ email: await emails.getEmail(req.valid.params.id, await pickLanguage(req)) });
});

// One language's copy of one email. Saving Hindi never changes Arabic or English.
router.put(
  '/:id/translations/:lang',
  requireSettingsEditor,
  validate({
    params: z.object({ id: idParam.shape.id, lang: languageCode }),
    body: z.object({ subject: z.string().max(400), html: z.string().max(250_000) }),
  }),
  async (req, res) => {
    const { id, lang } = req.valid.params;
    const email = await emails.saveTranslation(id, lang, req.valid.body, req.user.id);
    await recordActivity({ actorId: req.user.id, action: 'email.template_saved', entity: 'system_email', entityId: id, meta: { language: lang }, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ email });
  }
);

router.delete('/:id/translations/:lang', requireSettingsEditor, validate({ params: z.object({ id: idParam.shape.id, lang: languageCode }) }), async (req, res) => {
  const { id, lang } = req.valid.params;
  const email = await emails.resetTranslation(id, lang);
  await recordActivity({ actorId: req.user.id, action: 'email.template_reset', entity: 'system_email', entityId: id, meta: { language: lang }, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ email });
});

router.patch(
  '/:id',
  requireSettingsEditor,
  validate({ params: idParam, query: langQuery, body: z.object({ isEnabled: z.boolean() }) }),
  async (req, res) => {
    const email = await emails.setEnabled(req.valid.params.id, req.valid.body.isEnabled, await pickLanguage(req));
    await recordActivity({ actorId: req.user.id, action: req.valid.body.isEnabled ? 'email.enabled' : 'email.disabled', entity: 'system_email', entityId: req.valid.params.id, ip: req.ip, userAgent: req.get('user-agent') });
    res.json({ email });
  }
);

const dimension = z.coerce.number().int().positive().optional();

router.post('/:id/images', requireSettingsEditor, oneImage, validate({ params: idParam, body: z.object({ width: dimension, height: dimension }) }), async (req, res) => {
  if (!req.file) throw badRequest('No file was received.');
  const image = await emails.addImage({
    id: req.valid.params.id,
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
    originalName: req.file.originalname.slice(0, 200),
    width: req.valid.body.width,
    height: req.valid.body.height,
    actor: req.user,
    ip: req.ip,
  });
  await recordActivity({ actorId: req.user.id, action: 'email.image_uploaded', entity: 'system_email', entityId: req.valid.params.id, ip: req.ip, userAgent: req.get('user-agent') });
  res.status(201).json({ image });
});

router.delete('/:id/images/:imageId', requireSettingsEditor, validate({ params: z.object({ id: idParam.shape.id, imageId: z.string().uuid() }) }), async (req, res) => {
  await emails.removeImage({ id: req.valid.params.id, imageId: req.valid.params.imageId, actor: req.user, ip: req.ip });
  await recordActivity({ actorId: req.user.id, action: 'email.image_removed', entity: 'system_email', entityId: req.valid.params.id, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

// Sends a sample to the person clicking the button, in the language they are looking at.
router.post(
  '/:id/test',
  requireSettingsViewer,
  validate({ params: idParam, body: z.object({ language: languageCode.optional() }).default({}) }),
  async (req, res) => {
    const language = req.valid.body.language ?? (await effectiveLanguage(req.user.language));
    const result = await emails.sendTest(req.valid.params.id, language, req.user);
    res.json({ status: result.status, error: result.error, language, to: req.user.email });
  }
);

export default router;
