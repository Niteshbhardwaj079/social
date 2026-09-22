import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireUserManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isValidLanguage } from '../emails/builder.js';
import { ROLES } from '../services/permissions.js';
import * as users from '../services/userService.js';

const router = Router();
router.use(authenticate, requireUserManager);

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const name = z.string().trim().min(1, 'Name is required').max(120);
const role = z.enum(ROLES);
const language = z.string().refine(isValidLanguage, 'Unknown language');
const idParam = z.object({ id: z.string().uuid() });

router.get(
  '/',
  validate({
    query: z.object({
      search: z.string().trim().max(120).optional(),
      role: role.optional(),
      status: z.enum(['active', 'disabled', 'invited']).optional(),
    }),
  }),
  async (req, res) => res.json({ users: await users.listUsers(req.valid.query) })
);

router.post(
  '/',
  validate({ body: z.object({ name, email, role, language: language.default('en') }) }),
  async (req, res) => res.status(201).json(await users.createUser(req.user, req.valid.body, req.ip, req.get('user-agent')))
);

router.patch(
  '/:id',
  validate({
    params: idParam,
    body: z
      .object({ name, email, role, status: z.enum(['active', 'disabled']), language })
      .partial()
      .refine((value) => Object.keys(value).length > 0, 'Nothing to change'),
  }),
  async (req, res) => res.json({ user: await users.updateUser(req.user, req.valid.params.id, req.valid.body, req.ip, req.get('user-agent')) })
);

router.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await users.deleteUser(req.user, req.valid.params.id, req.ip, req.get('user-agent'));
  res.status(204).end();
});

router.post('/:id/resend-invite', validate({ params: idParam }), async (req, res) => {
  await users.resendInvite(req.user, req.valid.params.id);
  res.json({ message: 'Invitation sent again' });
});

export default router;
