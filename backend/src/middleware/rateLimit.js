import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';

const handler = (_req, res) =>
  res.status(429).json({ error: { code: 'too_many_requests', message: 'Too many requests. Please wait a moment and try again.' } });

/** Sign-in, sign-up, reset and invitation endpoints: a small number of tries per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.auth.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** Endpoints that make the API call a social platform: keeps a runaway script from burning the client's API quota. */
export const providerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.social.rateLimitPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** A generous ceiling for the rest of the API, mostly to stop runaway scripts. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
