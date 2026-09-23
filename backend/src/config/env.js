import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Every setting comes from environment variables (or a .env file), so the same code
 * runs unchanged on any host: a laptop, a VPS, Docker, a client's own server. Nothing
 * here is tied to a particular provider — see .env.example for the full list.
 */
try {
  process.loadEnvFile(); // .env in the working directory, if there is one
} catch {
  // No .env file: real environment variables are enough.
}

const bool = (fallback) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : value === 'true' || value === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (postgres://user:pass@host:5432/dbname)'),
  DATABASE_SSL: bool(false),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  AUTO_MIGRATE: bool(true),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool(undefined),

  // Protects the platform credentials stored in the database. Optional: without it a key is derived from JWT_SECRET.
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be at least 16 characters').optional(),
  // How often connected social accounts are re-checked in the background (minutes, 0 = never).
  SOCIAL_CHECK_INTERVAL_MIN: z.coerce.number().int().min(0).max(10080).default(360),
  // How long to wait for a social platform to answer before giving up (seconds).
  PROVIDER_TIMEOUT_SEC: z.coerce.number().int().min(3).max(120).default(15),
  // How often the scheduler looks for posts whose time has come (seconds, 0 = scheduler off).
  SCHEDULER_INTERVAL_SEC: z.coerce.number().int().min(0).max(3600).default(30),
  // A scheduled post more than this many minutes late (server was off) is not sent; it is marked failed so nobody is surprised.
  SCHEDULER_GRACE_MIN: z.coerce.number().int().min(1).max(10080).default(60),
  // How often the recycling queue is checked for a repost whose time has come (minutes, 0 = off). Recycling
  // intervals are counted in days, so this needs nowhere near the post scheduler's 30-second granularity.
  RECYCLING_INTERVAL_MIN: z.coerce.number().int().min(0).max(1440).default(30),
  // How often published posts' real engagement (likes/comments/shares/views) is re-fetched from the
  // platforms that support it (minutes, 0 = off). Modest by default — this calls each platform's own API
  // once per due post per pass, so it should not run as often as the post scheduler.
  ANALYTICS_REFRESH_INTERVAL_MIN: z.coerce.number().int().min(0).max(10080).default(120),
  // How often to poll connected accounts for new comments on published posts (minutes, 0 = off).
  INBOX_REFRESH_INTERVAL_MIN: z.coerce.number().int().min(0).max(10080).default(30),
  // How often a launched ad's real spend/impressions/clicks and review status are re-fetched (minutes, 0 = off).
  ADS_REFRESH_INTERVAL_MIN: z.coerce.number().int().min(0).max(10080).default(60),
  // Most checks per minute per IP that call a social platform (test / connect / sync).
  PROVIDER_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
  // Facebook retires old Graph API versions after about two years: bump this instead of editing code.
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'META_GRAPH_VERSION looks like v24.0').default('v24.0'),

  // "Server" storage: files saved to this server's own disk. Always available, needs no client account.
  MEDIA_LOCAL_DIR: z.string().optional(),
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(2048).default(200),

  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.string().default('false'),
  FRONTEND_DIR: z.string().optional(),
  SERVE_FRONTEND: bool(true),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Social <no-reply@localhost>'),

  BRAND_APP_NAME: z.string().default('Social'),
  BRAND_COMPANY: z.string().default('Gowebkart Pvt Ltd'),
  BRAND_SUPPORT_EMAIL: z.string().default('support@gowebkart.in'),
  BRAND_WEBSITE_URL: z.string().default('https://gowebkart.in'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  // Fail fast with a readable message instead of crashing later with something cryptic.
  console.error(`Invalid configuration:\n${lines.join('\n')}`);
  process.exit(1);
}
const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    console.error('Invalid configuration:\n  - JWT_SECRET is required in production (32+ random characters)');
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET is not set — using a temporary one. Everyone is signed out on every restart.');
}

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Number.isNaN(Number(value)) ? value : Number(value);
}

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction,
  isTest: env.NODE_ENV === 'test',
  host: env.HOST,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  backendRoot,
  database: {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    poolMax: env.DATABASE_POOL_MAX,
    autoMigrate: env.AUTO_MIGRATE,
  },
  auth: {
    jwtSecret,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_MIN * 60,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    cookieSecure: env.COOKIE_SECURE ?? isProduction,
    rateLimitMax: env.RATE_LIMIT_MAX,
  },
  security: {
    encryptionSecret: env.ENCRYPTION_KEY || jwtSecret,
    hasDedicatedEncryptionKey: Boolean(env.ENCRYPTION_KEY),
  },
  social: {
    checkIntervalMs: env.SOCIAL_CHECK_INTERVAL_MIN * 60 * 1000,
    providerTimeoutMs: env.PROVIDER_TIMEOUT_SEC * 1000,
    metaGraphVersion: env.META_GRAPH_VERSION,
    rateLimitPerMin: env.PROVIDER_RATE_LIMIT_PER_MIN,
  },
  scheduler: {
    intervalMs: env.SCHEDULER_INTERVAL_SEC * 1000,
    graceMs: env.SCHEDULER_GRACE_MIN * 60 * 1000,
  },
  recycling: {
    intervalMs: env.RECYCLING_INTERVAL_MIN * 60 * 1000,
  },
  analytics: {
    refreshIntervalMin: env.ANALYTICS_REFRESH_INTERVAL_MIN,
    refreshIntervalMs: env.ANALYTICS_REFRESH_INTERVAL_MIN * 60 * 1000,
  },
  inbox: {
    refreshIntervalMin: env.INBOX_REFRESH_INTERVAL_MIN,
    refreshIntervalMs: env.INBOX_REFRESH_INTERVAL_MIN * 60 * 1000,
  },
  ads: {
    refreshIntervalMin: env.ADS_REFRESH_INTERVAL_MIN,
    refreshIntervalMs: env.ADS_REFRESH_INTERVAL_MIN * 60 * 1000,
  },
  media: {
    localDir: path.resolve(backendRoot, env.MEDIA_LOCAL_DIR || 'data/media'),
    maxUploadBytes: env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024,
  },
  appUrl: env.APP_URL.replace(/\/+$/, ''),
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  frontendDir: env.SERVE_FRONTEND ? path.resolve(backendRoot, env.FRONTEND_DIR || '../dist') : null,
  smtp: env.SMTP_HOST
    ? { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, pass: env.SMTP_PASS }
    : null,
  mailFrom: env.MAIL_FROM,
  brand: {
    appName: env.BRAND_APP_NAME,
    company: env.BRAND_COMPANY,
    supportEmail: env.BRAND_SUPPORT_EMAIL,
    websiteUrl: env.BRAND_WEBSITE_URL,
  },
});
