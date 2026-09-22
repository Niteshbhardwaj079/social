import crypto from 'node:crypto';

/** SHA-256 hex of a secret token. Only this hash is ever stored. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** An unguessable URL-safe secret (256 bits). */
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Removes anything that would let a value break out of an email header line. */
export const singleLine = (value) => String(value).replace(/[\r\n]+/g, ' ').trim();
