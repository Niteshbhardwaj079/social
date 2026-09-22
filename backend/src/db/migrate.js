import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

const MIGRATIONS_DIR = path.join(config.backendRoot, 'migrations');
// Arbitrary constant: makes several app instances starting at once take turns migrating.
const ADVISORY_LOCK_KEY = 726_150_001;

/** Applies every migrations/*.sql that has not run yet, in file-name order, each in its own transaction. */
export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        logger.info('Migration applied', { file });
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
