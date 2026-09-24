-- Lets the client configure their own outgoing email (SMTP) straight from the app's Settings UI,
-- instead of only via backend environment variables. A true singleton, same pattern as
-- storage_settings (004_storage.sql): `id boolean PRIMARY KEY DEFAULT true CHECK (id)` allows
-- exactly one row to ever exist. The SMTP_* env vars in config/env.js remain a fallback for
-- deployments that never touch this UI — see services/emailSettingsService.js `resolveTransport()`.
CREATE TABLE email_settings (
  id                 boolean      PRIMARY KEY DEFAULT true CHECK (id),
  host               text,
  port               integer,
  secure             boolean      NOT NULL DEFAULT false,
  username           text,
  from_email         text,
  from_name          text,
  secret_hint        text,
  credentials        text,
  connected_at       timestamptz,
  last_tested_at     timestamptz,
  last_test_message  text,
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO email_settings (id) VALUES (true);
