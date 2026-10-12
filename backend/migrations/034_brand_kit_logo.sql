-- The Brand Kit's logo, used by the AI Studio's "Design" picture templates (free agent and paid AI alike).
-- Stored as a media_items reference (not a bare URL) so the design renderer can read the bytes straight
-- from storage, the same reliable way the slideshow already reads a person's own pictures.
ALTER TABLE ai_brand_kits ADD COLUMN logo_media_id uuid REFERENCES media_items (id) ON DELETE SET NULL;
