import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { passwordSchema } from '../services/passwordService.js';
import * as auth from '../services/authService.js';
import { isValidLanguage } from '../emails/builder.js';
import { toApiUser } from '../services/userService.js';

export const REFRESH_COOKIE = 'social_rt';

// The refresh token lives ONLY in an httpOnly cookie that is sent to /api/auth, so page scripts
// (and any XSS bug) can never read it. The short-lived access token goes back in the JSON body.
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.auth.cookieSecure,
  sameSite: 'lax',
  path: '/api/auth',
});

const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: config.auth.refreshTtlMs });
const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

const metaOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') || null });

function sendSession(res, session, status = 200) {
  setRefreshCookie(res, session.refreshToken);
  res.status(status).json({ accessToken: session.accessToken, expiresIn: config.auth.accessTtlSeconds, user: session.user });
}

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const name = z.string().trim().min(1, 'Name is required').max(120);
const language = z.string().refine(isValidLanguage, 'Unknown language');
const token = z.string().min(20).max(200);

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: z.object({ name, email, password: passwordSchema, companyName: z.string().trim().max(160).optional(), language: language.optional() }) }),
  async (req, res) => sendSession(res, await auth.registerFirstUser(req.valid.body, metaOf(req)), 201)
);

router.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email, password: z.string().min(1).max(200) }) }),
  async (req, res) => sendSession(res, await auth.login(req.valid.body, metaOf(req)))
);

router.post('/refresh', async (req, res) => {
  try {
    sendSession(res, await auth.refreshSession(req.cookies?.[REFRESH_COOKIE], metaOf(req)));
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

router.post('/logout', async (req, res) => {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
});

router.post('/forgot-password', authLimiter, validate({ body: z.object({ email }) }), async (req, res) => {
  await auth.requestPasswordReset(req.valid.body.email, metaOf(req));
  res.json({ message: 'If that email has an account, a reset link is on its way.' });
});

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token, password: passwordSchema }) }),
  async (req, res) => {
    await auth.resetPassword(req.valid.body, metaOf(req));
    res.json({ message: 'Your password was changed. You can sign in now.' });
  }
);

router.post(
  '/accept-invite',
  authLimiter,
  validate({ body: z.object({ token, password: passwordSchema, name: name.optional() }) }),
  async (req, res) => sendSession(res, await auth.acceptInvite(req.valid.body, metaOf(req)))
);

router.get('/me', authenticate, (req, res) => res.json({ user: toApiUser(req.user) }));

router.patch(
  '/me',
  authenticate,
  validate({ body: z.object({ name: name.optional(), language: language.optional() }).refine((value) => Object.keys(value).length > 0, 'Nothing to change') }),
  async (req, res) => res.json({ user: await auth.updateProfile(req.user, req.valid.body) })
);

router.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }) }),
  async (req, res) => sendSession(res, await auth.changePassword(req.user, req.valid.body, metaOf(req)))
);

export default router;
