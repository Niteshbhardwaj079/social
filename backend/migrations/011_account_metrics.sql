-- One row every time a connected account's follower count is actually read from the platform (on
-- connect, "Sync now", and the 6-hourly background check) — a real, growing history, never backfilled
-- or guessed. Powers the Dashboard's "Followers Growth" chart.
CREATE TABLE account_metrics_history (
  id          bigserial   PRIMARY KEY,
  platform    text        NOT NULL,
  followers   integer     NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_metrics_platform_time ON account_metrics_history (platform, recorded_at DESC);
