-- Groups related posts together for planning/tracking. `postsCount`/`publishedCount`/etc. are derived
-- from `posts.campaign_id` at read time (see campaignService.js), not stored here.
CREATE TABLE campaigns (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  objective    text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('active', 'scheduled', 'completed', 'paused')),
  platforms    text[]      NOT NULL DEFAULT '{}',
  start_date   date,
  end_date     date,
  created_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_recent ON campaigns (created_at DESC);

-- A post may optionally belong to one campaign; deleting the campaign only un-tags its posts.
ALTER TABLE posts ADD COLUMN campaign_id uuid REFERENCES campaigns (id) ON DELETE SET NULL;
CREATE INDEX posts_campaign ON posts (campaign_id) WHERE campaign_id IS NOT NULL;
