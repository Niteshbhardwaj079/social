import fs from 'node:fs/promises';
import { config } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { query, setRestrictedRole } from './db/pool.js';
import { forEachOrganization } from './services/organizationService.js';
import { ensureEmailRows } from './services/systemEmailService.js';
import { deleteExpiredTokens } from './services/tokenService.js';
import { startOutboxWorker } from './services/mailer.js';
import { startSocialAccountChecker } from './services/socialAccountService.js';
import { startScheduler } from './services/postService.js';
import { startRecyclingScheduler } from './services/recyclingService.js';
import { startMetricsRefresher } from './services/analyticsService.js';
import { startInboxRefresher } from './services/inboxService.js';
import { startAdsRefresher } from './services/adsService.js';
import { startAdRulesEvaluator } from './services/adRuleService.js';
import { startAiJobWorker } from './services/aiService.js';
import { startAutopilotWorker } from './services/autopilotService.js';
import { startSubscriptionReminders } from './services/subscriptionReminderService.js';
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

const RESTRICTED_ROLE = 'social_app';

/**
 * PostgreSQL never applies row-level security to a superuser (or a role with BYPASSRLS) — and local
 * development connects as one. In that case create a plain role with normal table rights and let
 * every connection switch to it (db/pool.js), so customers stay separated on every setup.
 * A normal production database user needs none of this and is left alone.
 */
async function ensureRowSecurityApplies() {
  const result = await query('SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user');
  if (!result.rows[0]?.bypasses) return;

  await query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RESTRICTED_ROLE}') THEN CREATE ROLE ${RESTRICTED_ROLE} NOLOGIN; END IF;
  EXCEPTION WHEN duplicate_object THEN NULL; -- another instance created it at the same moment
  END $$`);
  // A superuser may switch to any role; a BYPASSRLS user needs to be a member first.
  await query(`GRANT ${RESTRICTED_ROLE} TO CURRENT_USER`).catch(() => {});
  await query(`GRANT USAGE ON SCHEMA public TO ${RESTRICTED_ROLE}`);
  // TRUNCATE is only used by the test suite's database reset; the app itself never truncates.
  await query(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO ${RESTRICTED_ROLE}`);
  await query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${RESTRICTED_ROLE}`);
  setRestrictedRole(RESTRICTED_ROLE);
}

/**
 * Everything the app needs before it can take requests: an up-to-date database and the
 * built-in rows. Safe to run on every start and from several instances at once.
 */
export async function prepareDatabase() {
  await query('SELECT 1'); // fail early, with a clear message, if the database is unreachable
  await requireUtf8Database();
  if (config.database.autoMigrate) await runMigrations();
  await ensureRowSecurityApplies();
  // A system email added to the catalog in a new release gets its row in every organization.
  await forEachOrganization('Email catalog sync', ensureEmailRows);
  await fs.mkdir(config.media.localDir, { recursive: true });
  await fs.mkdir(config.billing.proofDir, { recursive: true });
}

/** Background housekeeping. Returns a function that stops it. */
export function startBackgroundJobs() {
  const stopOutbox = startOutboxWorker();
  const stopAccountChecks = startSocialAccountChecker();
  const stopScheduler = startScheduler();
  const stopRecycling = startRecyclingScheduler();
  const stopMetricsRefresh = startMetricsRefresher();
  const stopInboxRefresh = startInboxRefresher();
  const stopAdsRefresh = startAdsRefresher();
  const stopAdRules = startAdRulesEvaluator();
  const stopAiJobs = startAiJobWorker();
  const stopAutopilots = startAutopilotWorker();
  const stopReminders = startSubscriptionReminders();
  const cleanup = setInterval(() => {
    deleteExpiredTokens().catch((error) => logger.error('Token cleanup failed', error));
  }, DAY_MS);
  cleanup.unref();
  return () => {
    stopOutbox();
    stopAccountChecks();
    stopScheduler();
    stopRecycling();
    stopMetricsRefresh();
    stopInboxRefresh();
    stopAdsRefresh();
    stopAdRules();
    stopAiJobs();
    stopAutopilots();
    stopReminders();
    clearInterval(cleanup);
  };
}
