-- Phase 5: Creative Library. A saved, reusable ad creative that exists independently of any ad or
-- campaign — picked from when building a new ad (or a bulk variation) to skip retyping, never launched
-- on its own. Deliberately its own table, not another `ad_creatives` row: an `ad_creatives` row is
-- always part of a real (or draft) ad's Meta object chain (external_creative_id, source_post_id,
-- referenced by `ads`); a library template has none of that, it is just saved text/link/image.
CREATE TABLE ad_creative_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  headline          text        NOT NULL DEFAULT '',
  body_text         text        NOT NULL DEFAULT '',
  cta               text        NOT NULL DEFAULT 'Learn more',
  destination_url   text        NOT NULL DEFAULT '',
  media_id          uuid        REFERENCES media_items (id) ON DELETE SET NULL,
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_creative_templates_recent ON ad_creative_templates (created_at DESC);
