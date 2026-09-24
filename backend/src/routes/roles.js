import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as roles from '../services/roleService.js';

const router = Router();
router.use(authenticate);

const ACCENTS = ['rose', 'purple', 'blue', 'teal', 'slate', 'amber'];
const permissions = z.record(z.string(), z.boolean());
const roleBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  accent: z.enum(ACCENTS).optional(),
  rank: z.number().int().min(1).max(3).optional(),
  permissions: permissions.optional(),
  isActive: z.boolean().optional(),
});
const idParam = z.object({ id: z.string().min(1).max(120) });

router.get('/', async (_req, res) => res.json({ roles: await roles.listRoles() }));

router.get('/:id', validate({ params: idParam }), async (req, res) => res.json({ role: await roles.getRole(req.valid.params.id) }));

router.post(
  '/',
  requireRoleManager,
  validate({ body: roleBody }),
  async (req, res) => res.status(201).json({ role: await roles.createRole(req.user, req.valid.body, req.ip, req.get('user-agent')) })
);

router.post(
  '/:id/duplicate',
  requireRoleManager,
  validate({ params: idParam, body: z.object({ name: z.string().trim().min(1).max(80).optional() }) }),
  async (req, res) =>
    res.status(201).json({ role: await roles.duplicateRole(req.user, req.valid.params.id, req.valid.body.name, req.ip, req.get('user-agent')) })
);

router.patch(
  '/:id',
  requireRoleManager,
  validate({ params: idParam, body: roleBody.partial().refine((value) => Object.keys(value).length > 0, 'Nothing to change') }),
  async (req, res) => res.json({ role: await roles.updateRole(req.user, req.valid.params.id, req.valid.body, req.ip, req.get('user-agent')) })
);

router.delete('/:id', requireRoleManager, validate({ params: idParam }), async (req, res) => {
  await roles.deleteRole(req.user, req.valid.params.id, req.ip, req.get('user-agent'));
  res.status(204).end();
});

export default router;
