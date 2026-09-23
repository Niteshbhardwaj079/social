-- Per-post engagement, filled in by a background pass for the platforms whose API can report it (see
-- providers/metrics.js). All nullable: a platform this app cannot fetch metrics for (or a post not yet
-- checked) leaves these alone rather than showing an invented number.
ALTER TABLE post_targets ADD COLUMN likes integer;
ALTER TABLE post_targets ADD COLUMN comments integer;
ALTER TABLE post_targets ADD COLUMN shares integer;
-- A raw "how many times this was seen" number — YouTube's viewCount or X's impression_count, whichever
-- the platform itself reports; different platforms mean slightly different things by it, same as how
-- "followers" already unifies very different platform concepts under one column.
ALTER TABLE post_targets ADD COLUMN views integer;
ALTER TABLE post_targets ADD COLUMN metrics_checked_at timestamptz;
