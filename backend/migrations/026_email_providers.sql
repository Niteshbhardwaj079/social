-- Redesigns email_settings from one fixed SMTP shape into the same multi-provider pattern already
-- used by storage_settings (provider_key + provider_values + secret_hints + one encrypted
-- credentials blob), so the client can also pick an HTTPS-API provider (Resend/SendGrid/Brevo)
-- instead of only raw SMTP. Needed because Render's free tier blocks outbound SMTP ports
-- (25/465/587) entirely as of 2025-09-26, which left free-tier clients with no way to send real
-- email through SMTP at all, regardless of provider or port.
--
-- No data-preserving UPDATE step here (unlike 024's roles migration): a saved row requires a
-- passing connection test first (saveSettings verifies before persisting), and SMTP was
-- unreachable from Render's free tier the whole time this table existed, so no production row can
-- have a real, working saved connection yet.
ALTER TABLE email_settings
  DROP COLUMN host,
  DROP COLUMN port,
  DROP COLUMN secure,
  DROP COLUMN username,
  DROP COLUMN from_email,
  DROP COLUMN from_name,
  DROP COLUMN secret_hint,
  ADD COLUMN provider_key text,
  ADD COLUMN provider_values jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN secret_hints jsonb NOT NULL DEFAULT '{}';
