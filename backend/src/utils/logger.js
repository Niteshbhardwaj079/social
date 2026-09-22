import { config } from '../config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = config.isTest ? LEVELS.error : LEVELS[config.logLevel];

// One JSON object per line: readable locally, and easy to ship to any log system later.
function write(level, message, fields) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

function errorFields(error) {
  if (!(error instanceof Error)) return { error };
  return { error: error.message, stack: config.isProduction ? undefined : error.stack };
}

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, error, fields) => write('error', message, { ...errorFields(error), ...fields }),
};
