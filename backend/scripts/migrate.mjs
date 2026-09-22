// Applies pending database migrations. The server does this on startup by default
// (AUTO_MIGRATE=true); run this by hand when you set AUTO_MIGRATE=false.
import { runMigrations } from '../src/db/migrate.js';
import { closePool } from '../src/db/pool.js';

try {
  const applied = await runMigrations();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
