import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { StorageError } from './errors.js';

/** "Server" storage: this server's own disk. Always available — no account needed. */

function resolveKey(key) {
  // Keys are always ones this service generated (see mediaService.newKey), but guard against traversal anyway.
  const full = path.resolve(config.media.localDir, key);
  if (!full.startsWith(path.resolve(config.media.localDir) + path.sep)) throw new StorageError('Invalid file path.');
  return full;
}

export async function putObject(key, body) {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return { key };
}

export async function getObjectBytes(key) {
  try {
    return await fs.readFile(resolveKey(key));
  } catch {
    throw new StorageError('That file is no longer on the server.', 'rejected');
  }
}

export async function deleteObject(key) {
  await fs.rm(resolveKey(key), { force: true });
}

/** Proves the disk is writable, without needing any credentials. */
export async function testConnection() {
  const key = `.connection-test-${crypto.randomBytes(6).toString('hex')}`;
  const body = Buffer.from('Social connection test');
  try {
    await putObject(key, body);
    const read = await getObjectBytes(key);
    if (!read.equals(body)) throw new StorageError('The file that came back was not what was written.');
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError(`The server could not write to its own storage folder (${error.message}). Check its file permissions.`);
  } finally {
    await deleteObject(key).catch(() => {});
  }
}

export function publicUrlFor(key) {
  return `${config.appUrl}/media/${key}`;
}
