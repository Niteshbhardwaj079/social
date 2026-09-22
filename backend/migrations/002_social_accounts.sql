-- Connected social platforms. One row per platform (a workspace has one account per platform).
-- `credentials` holds the client's own API keys/tokens, encrypted by the API (AES-256-GCM); it is NULL
-- once disconnected. The name/handle are kept after disconnecting so the card still says what it was.
CREATE TABLE social_accounts (
  platform         text PRIMARY KEY,
  status           text        NOT NULL CHECK (status IN ('connected', 'disconnected', 'expired', 'error')),
  account_name     text        NOT NULL DEFAULT '',
  handle           text        NOT NULL DEFAULT '',
  external_id      text,
  followers        integer     NOT NULL DEFAULT 0,
  api_tier         text        NOT NULL DEFAULT 'free' CHECK (api_tier IN ('free', 'paid')),
  credentials      text,
  last_error       text,
  last_synced_at   timestamptz,
  last_checked_at  timestamptz,
  connected_by     uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
