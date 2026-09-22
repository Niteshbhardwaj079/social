import { config } from './config/env.js';
import { createApp } from './app.js';
import { closePool } from './db/pool.js';
import { prepareDatabase, startBackgroundJobs } from './bootstrap.js';
import { logger } from './utils/logger.js';

try {
  await prepareDatabase();
} catch (error) {
  logger.error('Could not start: the database is not ready', error);
  process.exit(1);
}

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  logger.info('Social API is running', { url: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`, env: config.env });
});
const stopJobs = startBackgroundJobs();

// Stop taking new requests, let running ones finish, then close the database (what Docker,
// systemd and every process manager send on a deploy or restart).
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  stopJobs();
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A stray rejected promise must not take the whole API down; log it and carry on.
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
// After an uncaught exception the process state is unknown: exit and let the supervisor restart it.
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — exiting', error);
  process.exit(1);
});
