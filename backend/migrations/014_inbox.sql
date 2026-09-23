-- Real comments on real published posts, and our own real replies to them. One row per platform's own
-- top-level comment (never a fabricated "customer" record) — see providers/comments.js for what each
-- supported platform actually hands back.
CREATE TABLE inbox_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  platform             text        NOT NULL,
  external_comment_id  text        NOT NULL,
  author_name          text        NOT NULL,
  author_handle        text,
  author_external_id   text,
  author_followers     integer,
  author_following     integer,
  author_posts_count   integer,
  author_verified      boolean,
  author_joined_at     timestamptz,
  author_bio           text,
  author_profile_url   text,
  text                 text        NOT NULL,
  -- Platform-specific extras a reply needs later (e.g. Bluesky's record cid) — never shown to the client.
  meta                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status               text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_to          uuid        REFERENCES users (id) ON DELETE SET NULL,
  is_unread            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL, -- when the comment was actually posted on the platform
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_comment_id)
);
CREATE INDEX inbox_conversations_post ON inbox_conversations (post_id);
CREATE INDEX inbox_conversations_recent ON inbox_conversations (created_at DESC);

CREATE TABLE inbox_replies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid        NOT NULL REFERENCES inbox_conversations (id) ON DELETE CASCADE,
  text               text        NOT NULL,
  sent_by            uuid        REFERENCES users (id) ON DELETE SET NULL,
  external_reply_id  text,       -- the platform's own id for our reply, when it gives one back
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_replies_conversation ON inbox_replies (conversation_id);

-- When a post's comments were last polled — separate from metrics_checked_at (013) since engagement
-- counts and actual comment text/replies are fetched on their own schedules.
ALTER TABLE post_targets ADD COLUMN comments_checked_at timestamptz;
