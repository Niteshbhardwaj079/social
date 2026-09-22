-- Images uploaded for a system email (a logo, a banner...). Shared by every language of that email — a
-- picture rarely needs to change per language. The file itself is a normal Media Library upload
-- (src/services/mediaService.js), so it goes through the same storage (server disk or the client's own
-- bucket) and counts against the same storage limit; this table just remembers which email it belongs to.
CREATE TABLE system_email_images (
  email_id    text        NOT NULL REFERENCES system_emails (id) ON DELETE CASCADE,
  media_id    uuid        NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_id, media_id)
);
