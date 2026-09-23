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

export const query = (text, params) => pool.query(text, params);

/** Runs `work(client)` inside one transaction: commits on success, rolls back on any error. */
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
