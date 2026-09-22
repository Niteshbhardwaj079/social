// Runs the integration tests against a throwaway real PostgreSQL (started here, deleted after),
// so tests are repeatable and never touch your development data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-test-pg-'));
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'test', password: 'test', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });

let exitCode = 1;
try {
  await server.initialise();
  await server.start();
  await server.createDatabase('social_test');

  // TEST_FILES=security,posts runs only the files whose name contains one of these words.
  const only = (process.env.TEST_FILES || '').split(',').map((word) => word.trim()).filter(Boolean);
  const files = fs
    .readdirSync(path.join(backendRoot, 'test'))
    .filter((file) => file.endsWith('.test.js') && (!only.length || only.some((word) => file.includes(word))))
    .map((file) => path.join('test', file));
  const extra = process.argv.slice(2);
  exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...extra, ...files], {
      cwd: backendRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: `postgres://test:test@localhost:${port}/social_test`,
        JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
        RATE_LIMIT_MAX: '1000',
        PROVIDER_RATE_LIMIT_PER_MIN: '10000',
        APP_URL: 'http://localhost:5173',
        SMTP_HOST: '',
      },
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error('Could not run the tests:', error);
} finally {
  try {
    await server.stop();
  } catch {
    // Already stopped.
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(exitCode);
