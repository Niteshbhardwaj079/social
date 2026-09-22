-- Pinterest needs a specific board per post (unlike every other platform, which just needs the account).
-- NULL for every other platform's row.
ALTER TABLE post_targets ADD COLUMN board_id text;
