// Local development only: runs a real PostgreSQL 17 from node_modules (no installer, no
// admin rights, nothing outside this folder) and keeps its files in backend/.pgdata.
// Production never uses this — it just points DATABASE_URL at any PostgreSQL server.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendRoot, '.pgdata');
const port = Number(process.env.DEV_DB_PORT || 54329);
const url = `postgres://social:social@localhost:${port}/social`;

const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'social', password: 'social', port, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] });

if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise();
await server.start();
try {
  await server.createDatabase('social');
} catch {
  // Already exists from an earlier run.
}

// First run: write a ready-to-use .env (it is git-ignored) so `npm run dev` just works.
const envFile = path.join(backendRoot, '.env');
if (!fs.existsSync(envFile)) {
  fs.writeFileSync(
    envFile,
    [`NODE_ENV=development`, `PORT=4000`, `DATABASE_URL=${url}`, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`, `APP_URL=http://localhost:5173`, ''].join('\n')
  );
  console.log(`Created ${envFile}`);
}

console.log(`\nPostgreSQL is running.\n  DATABASE_URL=${url}\nPress Ctrl+C to stop it.\n`);

async function shutdown() {
  try {
    await server.stop();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 2 ** 30); // keep this process alive
