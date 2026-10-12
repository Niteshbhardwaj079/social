import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// bigint (COUNT and the like) comes back as a number: our counts are far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));
// A plain `date` column stays the 'YYYY-MM-DD' string postgres sends, not a parsed JS Date — the
// driver's own date parser builds a local-midnight Date, which a positive UTC offset (IST and
// friends) then shifts back a calendar day the moment anything calls toISOString() on it.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  max: config.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 20_000,
});

// An idle client can error when the database restarts. Log it; the pool reconnects on its own.
pool.on('error', (error) => logger.error('Idle database client error', error));

// ---------------------------------------------------------------- which organization are we working for?
//
// Every query runs "inside" one organization. PostgreSQL's row-level security (migration 028) then
// only shows that organization's rows. The context follows the code through every `await`
// automatically (AsyncLocalStorage), so services never pass an organization id around by hand.
//
//   runWithOrganization(orgId, work) — normal app work for one customer (requests, per-org jobs)
//   runAsSystem(work)                — sees every organization (platform-owner screens, job loops)
//   neither                          — sees nothing: a forgotten context fails safe, never leaks.
const context = new AsyncLocalStorage();

export const runWithOrganization = (organizationId, work) => context.run({ organizationId, system: false }, work);
// Careful: inside runAsSystem there is NO current organization. Read currentOrganizationId() first:
//   const organizationId = currentOrganizationId();
//   await runAsSystem(() => query('... WHERE id = $1', [organizationId]));   // right
//   await runAsSystem(() => query('... WHERE id = $1', [currentOrganizationId()])); // wrong: always null
export const runAsSystem = (work) => context.run({ organizationId: null, system: true }, work);

/** Starts an empty, fillable context for one HTTP request (app.js). `authenticate` fills it in. */
export const runWithRequestContext = (work) => context.run({ organizationId: null, system: false }, work);

/** Called by `authenticate` once it knows who is signing in. */
export function setRequestOrganization(organizationId) {
  const store = context.getStore();
  if (!store) throw new Error('setRequestOrganization() called outside a request context');
  store.organizationId = organizationId;
}

// Tests (and one-off scripts) call services directly, outside any request. They can name the
// organization to use when no context is active. The running app never calls this.
let fallbackContext = null;
export function setFallbackContextForTests(store) {
  fallbackContext = store;
}

const activeContext = () => context.getStore() ?? fallbackContext;

export const currentOrganizationId = () => activeContext()?.organizationId ?? null;

// When the app connects as a PostgreSQL superuser (local development does), row-level security is
// skipped by PostgreSQL itself. bootstrap.js then creates a plain role and every connection
// switches to it, so the rules apply everywhere. Production users are normally plain already.
let restrictedRole = null;
export function setRestrictedRole(roleName) {
  restrictedRole = roleName;
}

/** Tells this connection which organization it is working for — skipped when it already knows. */
async function applyContext(client) {
  const store = activeContext();
  const organizationId = store?.system ? '' : String(store?.organizationId ?? '');
  const bypass = store?.system ? 'on' : 'off';
  const key = `${restrictedRole}|${organizationId}|${bypass}`;
  if (client.tenantKey === key) return;

  if (restrictedRole && client.roleName !== restrictedRole) {
    await client.query(`SET ROLE ${restrictedRole}`);
    client.roleName = restrictedRole;
  }
  await client.query("SELECT set_config('app.org_id', $1, false), set_config('app.bypass', $2, false)", [organizationId, bypass]);
  client.tenantKey = key;
}

/** Borrows a connection from the pool, sets the organization on it, and always gives it back. */
async function withClient(work) {
  const client = await pool.connect();
  try {
    await applyContext(client);
    return await work(client);
  } finally {
    client.release();
  }
}

export const query = (text, params) => withClient((client) => client.query(text, params));

/** Runs `work(client)` inside one transaction: commits on success, rolls back on any error. */
export function transaction(work) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Rollback failed', rollbackError);
      }
      throw error;
    }
  });
}

export async function closePool() {
  await pool.end();
}
