import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { StorageError } from './errors.js';

/**
 * Google Drive as a storage provider. Like every provider here, it is bring-your-own-account: the client's
 * own Google account and OAuth app, nothing shared. See config/storageProviders.js on the front end for the
 * caution shown about serving images from Drive at scale — this module just does what it is asked.
 */
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function call(url, init) {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(config.social.providerTimeoutMs) });
  } catch {
    throw new StorageError('Could not reach Google Drive. Check that this server can reach the internet.', 'unreachable');
  }
}

async function driveError(response) {
  const data = await response.json().catch(() => null);
  return data?.error?.message || `${response.status} ${response.statusText}`;
}

async function accessTokenFor({ clientId, clientSecret, refreshToken }) {
  const response = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await response.json().catch(() => null);
  if (response.ok && data?.access_token) return data.access_token;
  if (data?.error === 'invalid_grant') throw new StorageError('Google says this refresh token has expired or was revoked. Authorize again to get a new one.', 'auth');
  throw new StorageError(`Google did not accept these credentials (${data?.error || response.status}).`, 'auth');
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });

/** `key` here is a made-up file name (see mediaService.newKey); Drive hands back its own id, which is what is stored as storage_key from then on. */
export async function putObject(provider, key, body, contentType) {
  const token = await accessTokenFor(provider.values);
  const boundary = `social-${crypto.randomBytes(16).toString('hex')}`;
  const metadata = JSON.stringify({ name: key, ...(provider.values.folderId ? { parents: [provider.values.folderId] } : {}) });
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await call(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!response.ok) throw new StorageError(`Google Drive refused this upload (${await driveError(response)}).`, response.status === 401 || response.status === 403 ? 'auth' : 'rejected');
  const created = await response.json();

  // "Anyone with the link can view" — needed for the file to open from a post, an email, or Instagram.
  const shared = await call(`${API}/files/${created.id}/permissions`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!shared.ok) throw new StorageError(`The file uploaded, but Google Drive would not make it link-shareable (${await driveError(shared)}).`, 'rejected');

  return { key: created.id };
}

export async function getObjectBytes(provider, key) {
  const token = await accessTokenFor(provider.values);
  const response = await call(`${API}/files/${key}?alt=media`, { headers: bearer(token) });
  if (!response.ok) throw new StorageError(`Could not read the file back from Google Drive (${await driveError(response)}).`, 'rejected');
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteObject(provider, key) {
  const token = await accessTokenFor(provider.values);
  const response = await call(`${API}/files/${key}`, { method: 'DELETE', headers: bearer(token) });
  if (!response.ok && response.status !== 404) throw new StorageError(`Could not delete the file from Google Drive (${await driveError(response)}).`, 'rejected');
}

export async function testConnection(provider) {
  const body = Buffer.from('Social connection test');
  const { key } = await putObject(provider, `social-connection-test-${crypto.randomBytes(6).toString('hex')}.txt`, body, 'text/plain');
  const read = await getObjectBytes(provider, key);
  await deleteObject(provider, key);
  if (!read.equals(body)) throw new StorageError('The file that came back was not what was uploaded.', 'rejected');
}

/** Works for a public, "anyone with the link" file; direct enough for an <img> tag or a platform to fetch. */
export const publicUrlFor = (_provider, key) => `https://drive.google.com/uc?export=view&id=${key}`;
