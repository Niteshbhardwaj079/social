-- In-app notifications (the bell icon): post published/failed, approval requested/completed, a connected
-- account losing access. Each row belongs to one user; there is no "workspace-wide" notification.
CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  message     text        NOT NULL,
  entity_type text,
  entity_id   text,
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread ON notifications (user_id) WHERE is_read = false;

-- Per-type opt-out (Settings -> Notifications). Absent key = on, so existing users default to everything
-- enabled without a backfill; only an explicit "false" turns a type off.
ALTER TABLE users ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
