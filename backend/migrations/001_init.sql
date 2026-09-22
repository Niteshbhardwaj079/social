-- Social — initial schema. One database per client workspace (single-tenant), so no tenant column.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  email              text        NOT NULL,
  password_hash      text,                                   -- NULL until an invited person accepts
  role               text        NOT NULL CHECK (role IN ('superAdmin', 'admin', 'editor', 'contributor', 'analyst')),
  status             text        NOT NULL DEFAULT 'invited' CHECK (status IN ('active', 'disabled', 'invited')),
  language           text        NOT NULL DEFAULT 'en',
  avatar_url         text,
  invited_by         uuid        REFERENCES users (id) ON DELETE SET NULL,
  last_active_at     timestamptz,
  failed_login_count integer     NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Refresh tokens, password-reset links and invitations. Only a SHA-256 hash is stored,
-- so a database leak does not hand out working tokens.
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text        NOT NULL CHECK (purpose IN ('refresh', 'password_reset', 'invite')),
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose ON auth_tokens (user_id, purpose);
CREATE INDEX auth_tokens_expiry ON auth_tokens (expires_at);

-- Workspace-wide settings as small JSON documents (languages, workspace details, ...).
CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- System emails: which ones are switched on, and any edits made per language.
-- The built-in wording lives in code (src/emails/defaults); only overrides are stored here.
CREATE TABLE system_emails (
  id          text PRIMARY KEY,
  is_enabled  boolean     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE system_email_translations (
  email_id    text        NOT NULL REFERENCES system_emails (id) ON DELETE CASCADE,
  language    text        NOT NULL,
  subject     text        NOT NULL,
  html        text        NOT NULL,
  updated_by  uuid        REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_id, language)
);

-- Every email the app tries to send. Doubles as the retry queue and as a delivery log.
CREATE TABLE email_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email    text        NOT NULL,
  to_name     text,
  language    text        NOT NULL,
  event_key   text        NOT NULL,
  subject     text        NOT NULL,
  html        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'logged')),
  attempts    integer     NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX email_outbox_pending ON email_outbox (status, created_at) WHERE status IN ('queued', 'failed');

CREATE TABLE activity_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid        REFERENCES users (id) ON DELETE SET NULL,
  action      text        NOT NULL,
  entity      text,
  entity_id   text,
  meta        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created ON activity_logs (created_at DESC);
