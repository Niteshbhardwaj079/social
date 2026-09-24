-- Real two-factor authentication (TOTP, RFC 6238) — replaces the "Coming soon" chip in Settings > Security.
-- totp_secret is written by /auth/2fa/setup (unconfirmed) and only takes effect once /auth/2fa/enable
-- verifies a real code from it; totp_enabled is the single source of truth the login flow checks.
ALTER TABLE users
  ADD COLUMN totp_secret text,             -- AES-256-GCM encrypted (see utils/crypto.js), NULL until setup starts
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_backup_codes jsonb,      -- [{hash, usedAt}] — SHA-256 hashes, single-use, like refresh tokens
  ADD COLUMN totp_last_step bigint;        -- the last accepted 30s time-step, so an observed code cannot be replayed
