import bcrypt from 'bcryptjs';
import { z } from 'zod';

const COST = 12;

/** 8–72 bytes: bcrypt only reads the first 72 bytes, so a longer password would be silently cut. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long (72 bytes at most)')
  .refine((value) => value.trim().length > 0, 'Password cannot be only spaces');

export const hashPassword = (password) => bcrypt.hash(password, COST);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

// Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
