-- A link shortener on the app's own domain (no third-party service, so it never costs anything as
-- traffic grows — see src/routes/shortLinks.js for the actual GET /l/:slug redirect).
CREATE TABLE short_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        NOT NULL,
  destination_url  text        NOT NULL,
  label            text        NOT NULL DEFAULT '',
  created_by       uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX short_links_slug_unique ON short_links (slug);

-- One row per real visit. Total clicks and the day-by-day chart are both derived from this at read
-- time (same "don't cache what you can just count" choice as campaigns' own post counts) — nothing
-- more than a timestamp is kept, no IP/user-agent, since the UI never needed more than "how many, when".
CREATE TABLE short_link_clicks (
  id             bigserial   PRIMARY KEY,
  short_link_id  uuid        NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  clicked_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX short_link_clicks_link_time ON short_link_clicks (short_link_id, clicked_at);
