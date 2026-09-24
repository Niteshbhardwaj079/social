import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';
import { hashToken } from '../utils/security.js';
import { DUMMY_HASH, verifyPassword } from './passwordService.js';
import { recordActivity } from './auditService.js';
import { badRequest, unauthorized } from '../utils/httpError.js';

const BACKUP_CODE_COUNT = 10;
// otplib's epochTolerance is in SECONDS, not steps — 30 covers one whole 30-second step either side
// of "now", the standard clock-drift/typing-delay allowance real authenticator apps expect.
const EPOCH_TOLERANCE_SEC = 30;

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/** Digits from a TOTP code, or a backup code with its hyphen stripped — same comparison either way. */
const normalizeCode = (value) => String(value || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

async function assertPassword(userId, password) {
  const row = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!(await verifyPassword(password, row.rows[0]?.password_hash || DUMMY_HASH))) throw unauthorized('Your password is not correct');
}

async function storeBackupCodes(userId) {
  const backupCodes = generateBackupCodes();
  const hashed = backupCodes.map((plain) => ({ hash: hashToken(normalizeCode(plain)), usedAt: null }));
  await query('UPDATE users SET totp_backup_codes = $2::jsonb, updated_at = now() WHERE id = $1', [userId, JSON.stringify(hashed)]);
  return backupCodes;
}

export async function getStatus(userId) {
  const result = await query('SELECT totp_enabled FROM users WHERE id = $1', [userId]);
  return { enabled: result.rows[0]?.totp_enabled === true };
}

/** Starts (or restarts) setup: a fresh secret, not yet in effect until confirmEnable() verifies a real code. */
export async function startSetup(actor) {
  const current = await query('SELECT totp_enabled FROM users WHERE id = $1', [actor.id]);
  if (current.rows[0]?.totp_enabled) {
    throw badRequest('Two-factor authentication is already on. Turn it off first to set up a new authenticator app.');
  }
  const secret = generateSecret(20);
  await query('UPDATE users SET totp_secret = $2, updated_at = now() WHERE id = $1', [actor.id, encryptJson({ secret })]);
  const otpauthUrl = generateURI({ issuer: config.brand.appName, label: actor.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrCodeDataUrl };
}

/** Proves the person can actually generate real codes before 2FA starts being required at login. */
export async function confirmEnable(actor, code, meta) {
  const row = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [actor.id]);
  const stored = row.rows[0];
  if (stored?.totp_enabled) throw badRequest('Two-factor authentication is already on.');
  const secretData = stored?.totp_secret ? decryptJson(stored.totp_secret) : null;
  if (!secretData?.secret) throw badRequest('Start setup again: scan the QR code, then enter the 6-digit code it shows.');

  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized)) throw badRequest('Enter the 6-digit code your authenticator app shows right now.');
  const check = verifySync({ secret: secretData.secret, token: normalized, epochTolerance: EPOCH_TOLERANCE_SEC });
  if (!check.valid) throw badRequest('That code is not correct. Check the time on your phone and try again.');

  await query('UPDATE users SET totp_enabled = true, totp_last_step = $2, updated_at = now() WHERE id = $1', [actor.id, check.timeStep]);
  const backupCodes = await storeBackupCodes(actor.id);
  await recordActivity({ actorId: actor.id, action: 'auth.2fa_enabled', entity: 'user', entityId: actor.id, ip: meta.ip, userAgent: meta.userAgent });
  return { backupCodes };
}

export async function disable(actor, password, meta) {
  await assertPassword(actor.id, password);
  const row = await query('SELECT totp_enabled FROM users WHERE id = $1', [actor.id]);
  if (!row.rows[0]?.totp_enabled) throw badRequest('Two-factor authentication is not on.');
  await query(
    'UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_backup_codes = NULL, totp_last_step = NULL, updated_at = now() WHERE id = $1',
    [actor.id]
  );
  await recordActivity({ actorId: actor.id, action: 'auth.2fa_disabled', entity: 'user', entityId: actor.id, ip: meta.ip, userAgent: meta.userAgent });
}

export async function regenerateBackupCodes(actor, password, meta) {
  await assertPassword(actor.id, password);
  const row = await query('SELECT totp_enabled FROM users WHERE id = $1', [actor.id]);
  if (!row.rows[0]?.totp_enabled) throw badRequest('Two-factor authentication is not on.');
  const backupCodes = await storeBackupCodes(actor.id);
  await recordActivity({ actorId: actor.id, action: 'auth.2fa_backup_codes_regenerated', entity: 'user', entityId: actor.id, ip: meta.ip, userAgent: meta.userAgent });
  return { backupCodes };
}

/**
 * Called at login time, only after the password itself already checked out. Tries the real
 * authenticator code first (rejecting replay of an already-accepted code, per RFC 6238), then
 * falls back to an unused backup code. Never throws — the caller decides what a false result means.
 */
export async function verifyLoginCode(userId, code) {
  const row = await query('SELECT totp_secret, totp_backup_codes, totp_last_step FROM users WHERE id = $1', [userId]);
  const user = row.rows[0];
  if (!user) return { valid: false };
  const normalized = normalizeCode(code);

  // otplib throws (rather than returning invalid) for a token that isn't 6 digits — a backup code
  // (8 alphanumeric chars) would otherwise crash this instead of just falling through to the check below.
  const secretData = /^\d{6}$/.test(normalized) && user.totp_secret ? decryptJson(user.totp_secret) : null;
  if (secretData?.secret) {
    const check = verifySync({ secret: secretData.secret, token: normalized, epochTolerance: EPOCH_TOLERANCE_SEC });
    if (check.valid && (user.totp_last_step === null || check.timeStep > Number(user.totp_last_step))) {
      await query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [userId, check.timeStep]);
      return { valid: true, method: 'totp' };
    }
  }

  const backupCodes = user.totp_backup_codes || [];
  const inputHash = hashToken(normalized);
  const matchIndex = backupCodes.findIndex((entry) => entry.hash === inputHash && !entry.usedAt);
  if (matchIndex >= 0) {
    backupCodes[matchIndex] = { ...backupCodes[matchIndex], usedAt: new Date().toISOString() };
    await query('UPDATE users SET totp_backup_codes = $2::jsonb WHERE id = $1', [userId, JSON.stringify(backupCodes)]);
    return { valid: true, method: 'backup_code' };
  }

  return { valid: false };
}
