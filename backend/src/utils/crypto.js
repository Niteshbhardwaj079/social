import crypto from 'node:crypto';
import { config } from '../config/env.js';

/**
 * Encrypts small secrets (platform API keys and tokens) before they go into the database, so a
 * copy of the database alone is not enough to use them. AES-256-GCM: tampering is detected on read.
 * Stored form:  v1.<iv>.<auth tag>.<ciphertext>  (all base64url)
 */
const VERSION = 'v1';
let cachedKey = null;

function getKey() {
  cachedKey ||= Buffer.from(crypto.hkdfSync('sha256', config.security.encryptionSecret, 'social-salt', 'social-credentials-v1', 32));
  return cachedKey;
}

export function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** Returns the original value, or null when the text is not ours or the key has changed since it was saved. */
export function decryptJson(stored) {
  try {
    const [version, iv, tag, data] = String(stored).split('.');
    if (version !== VERSION || !iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    return null;
  }
}
