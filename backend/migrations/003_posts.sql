-- Posts and where each one goes. `posts.status` is the overall picture; `post_targets` holds the result
-- for every platform separately, because one post can succeed on Bluesky and fail on X.
CREATE TABLE posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content           text        NOT NULL,
  status            text        NOT NULL CHECK (status IN ('draft', 'pendingApproval', 'rejected', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at      timestamptz,                 -- when it should go out; for a published post, when it did
  rejection_reason  text,
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by       uuid        REFERENCES users (id) ON DELETE SET NULL,
  locked_at         timestamptz,                 -- set while the API is publishing it, to notice a crash halfway
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_due ON posts (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX posts_recent ON posts (created_at DESC);

CREATE TABLE post_targets (
  post_id       uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  platform      text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  external_id   text,                            -- the platform's own id for the published post
  url           text,
  error         text,
  published_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, platform)
);
