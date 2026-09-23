-- Phase 3: an ad creative can trace back to the real published post it came from — either because its
-- text/image were copied from one (any platform), or because it's a genuine Meta "boost" of the post's
-- own live Facebook object (object_story_id — see providers/adsMeta.js). Either way this is provenance,
-- not a new copy of the post's content.
ALTER TABLE ad_creatives ADD COLUMN source_post_id uuid REFERENCES posts (id) ON DELETE SET NULL;
