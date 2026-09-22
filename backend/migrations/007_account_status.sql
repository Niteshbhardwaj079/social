-- Splits the old single "expired" bucket into what the platform actually said, and separates it from
-- "error" (a request that cannot work, or this server's own encryption key having changed) — see the
-- comment above recheckAccount() in socialAccountService.js for what produces each one. 'disconnected'
-- is unchanged: it is still set only by a person clicking Disconnect, never by a health check.
ALTER TABLE social_accounts DROP CONSTRAINT social_accounts_status_check;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_status_check
  CHECK (status IN ('connected', 'disconnected', 'token_expired', 'revoked', 'auth_error', 'error'));

UPDATE social_accounts SET status = 'auth_error' WHERE status = 'expired';

-- The last time a health check actually SUCCEEDED, distinct from last_checked_at (every attempt, pass or
-- fail). Seeded from last_synced_at, which until now only ever advanced on a success anyway.
ALTER TABLE social_accounts ADD COLUMN last_success_at timestamptz;
UPDATE social_accounts SET last_success_at = last_synced_at WHERE status = 'connected';
