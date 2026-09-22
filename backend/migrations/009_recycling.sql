-- Automatically re-shares a published post on a timer until paused or removed. One entry per post (the
-- UI never offers a post that is already queued a second time); deleting the source post removes the
-- entry too, since there is nothing left to recycle.
CREATE TABLE recycling_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid        NOT NULL UNIQUE REFERENCES posts (id) ON DELETE CASCADE,
  interval_days integer     NOT NULL CHECK (interval_days IN (14, 30, 60, 90)),
  is_active     boolean     NOT NULL DEFAULT true,
  last_run_at   timestamptz,
  next_run_at   timestamptz NOT NULL,
  total_reposts integer     NOT NULL DEFAULT 0,
  created_by    uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recycling_due ON recycling_entries (next_run_at) WHERE is_active;
