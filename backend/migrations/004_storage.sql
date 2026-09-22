-- Where uploaded media is kept. One row (there is one workspace). `credentials` holds the client's own
-- storage keys, encrypted by the API — same treatment as social_accounts.credentials.
CREATE TABLE storage_settings (
  id                 boolean      PRIMARY KEY DEFAULT true CHECK (id),
  server_enabled     boolean      NOT NULL DEFAULT true,
  external_enabled   boolean      NOT NULL DEFAULT false,
  limit_value        numeric,
  limit_unit         text         NOT NULL DEFAULT 'GB' CHECK (limit_unit IN ('MB', 'GB', 'TB')),
  provider_key       text,
  provider_values    jsonb        NOT NULL DEFAULT '{}',   -- non-secret fields shown back as-is (bucket, region, endpoint, public URL...)
  secret_hints       jsonb        NOT NULL DEFAULT '{}',   -- masked last-4 of each secret field, for display only
  credentials        text,                                 -- encrypted: every field the provider needs, secret and not
  connected_at       timestamptz,
  last_tested_at     timestamptz,
  last_test_message  text,
  updated_at         timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO storage_settings (id) VALUES (true);

CREATE TABLE media_items (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text         NOT NULL CHECK (type IN ('image', 'video')),
  name          text         NOT NULL,
  folder        text         NOT NULL DEFAULT 'Campaigns',
  tags          text[]       NOT NULL DEFAULT '{}',
  size_bytes    bigint       NOT NULL DEFAULT 0,
  width         integer,
  height        integer,
  -- 'server' = this server's disk, 'external' = the connected provider, 'linked' = someone else's URL, never stored here.
  storage       text         NOT NULL CHECK (storage IN ('server', 'external', 'linked')),
  storage_label text         NOT NULL DEFAULT 'Server',      -- e.g. "Cloudflare R2", fixed at upload time
  storage_key   text,                                       -- object key/path at the provider; null for 'linked'
  content_type  text         NOT NULL DEFAULT 'application/octet-stream',
  public_url    text         NOT NULL,
  uploaded_by   uuid         REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX media_items_recent ON media_items (created_at DESC);
CREATE INDEX media_items_folder ON media_items (folder);

-- Which posts use which media, so the library can warn before a delete (see services/mediaService.js).
CREATE TABLE post_media (
  post_id   uuid    NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  media_id  uuid    NOT NULL REFERENCES media_items (id) ON DELETE RESTRICT,
  position  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);
