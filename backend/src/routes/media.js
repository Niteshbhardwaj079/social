import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/env.js';
import { authenticate, requireMediaViewer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/httpError.js';
import * as mediaService from '../services/mediaService.js';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!/^(image|video)\//.test(file.mimetype)) return callback(badRequest('Only images and videos can be uploaded.'));
    callback(null, true);
  },
});

// multer reports "too large" by throwing inside its own middleware, before validate() ever runs — translate it here.
function oneFile(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest(`That file is larger than the ${Math.round(config.media.maxUploadBytes / (1024 * 1024))} MB limit for a single upload.`));
    }
    next(error);
  });
}

const idParams = z.object({ id: z.string().uuid('Not a valid file id') });
const dimension = z.coerce.number().int().positive().optional();

router.get('/', requireMediaViewer, async (_req, res) => res.json({ items: await mediaService.listMedia() }));
router.get('/folders', requireMediaViewer, async (_req, res) => res.json({ folders: await mediaService.listFolders() }));

router.post(
  '/',
  oneFile,
  validate({ body: z.object({ folder: z.string().trim().max(80).optional(), width: dimension, height: dimension }) }),
  async (req, res) => {
    if (!req.file) throw badRequest('No file was received.');
    const item = await mediaService.uploadMedia({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      originalName: req.file.originalname.slice(0, 200),
      type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
      folder: req.valid.body.folder,
      width: req.valid.body.width,
      height: req.valid.body.height,
      actor: req.user,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json({ item });
  }
);

router.post(
  '/link',
  validate({ body: z.object({ url: z.string().trim().min(1).max(2000), name: z.string().trim().max(200).optional(), width: dimension, height: dimension }) }),
  async (req, res) => res.status(201).json({ item: await mediaService.addLinkedMedia({ ...req.valid.body, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }) })
);

router.patch('/:id', oneFile, validate({ params: idParams, body: z.object({ width: dimension, height: dimension }) }), async (req, res) => {
  if (!req.file) throw badRequest('No file was received.');
  const item = await mediaService.replaceMedia({
    id: req.valid.params.id,
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
    width: req.valid.body.width,
    height: req.valid.body.height,
    actor: req.user,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ item });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await mediaService.deleteMedia({ id: req.valid.params.id, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

router.post('/bulk-delete', validate({ body: z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }) }), async (req, res) =>
  res.json(await mediaService.bulkDeleteMedia({ ids: req.valid.body.ids, actor: req.user, ip: req.ip, userAgent: req.get('user-agent') }))
);

export default router;
