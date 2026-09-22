import fs from 'node:fs/promises';
import { config } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { query } from './db/pool.js';
import { ensureEmailRows } from './services/systemEmailService.js';
import { deleteExpiredTokens } from './services/tokenService.js';
import { startOutboxWorker } from './services/mailer.js';
import { startSocialAccountChecker } from './services/socialAccountService.js';
import { startScheduler } from './services/postService.js';
import { startRecyclingScheduler } from './services/recyclingService.js';
import { logger } from './utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Hindi, Arabic, Chinese... only fit in a UTF8 database. A Latin1/WIN1252 database would fail the
// first time someone saves such text, so say so up front instead of failing mysteriously later.
async function requireUtf8Database() {
  const result = await query('SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()');
  const encoding = result.rows[0]?.encoding;
  if (encoding !== 'UTF8') {
    throw new Error(
      `The database encoding is ${encoding}, but Social needs UTF8. Create the database with: CREATE DATABASE social ENCODING 'UTF8' TEMPLATE template0;`
    );
  }
}

/**
 * Everything the app needs before it can take requests: an up-to-date database and the
 * built-in rows. Safe to run on every start and from several instances at once.
 */
export async function prepareDatabase() {
  await query('SELECT 1'); // fail early, with a clear message, if the database is unreachable
  await requireUtf8Database();
  if (config.database.autoMigrate) await runMigrations();
  await ensureEmailRows();
  await fs.mkdir(config.media.localDir, { recursive: true });
}

/** Background housekeeping. Returns a function that stops it. */
export function startBackgroundJobs() {
  const stopOutbox = startOutboxWorker();
  const stopAccountChecks = startSocialAccountChecker();
  const stopScheduler = startScheduler();
  const stopRecycling = startRecyclingScheduler();
  const cleanup = setInterval(() => {
    deleteExpiredTokens().catch((error) => logger.error('Token cleanup failed', error));
  }, DAY_MS);
  cleanup.unref();
  return () => {
    stopOutbox();
    stopAccountChecks();
    stopScheduler();
    stopRecycling();
    clearInterval(cleanup);
  };
}
