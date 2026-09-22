-- The device/browser behind an activity log entry, so the real Activity Logs page can show it (it was
-- always fabricated in the mock). Nullable: background/scheduler-driven activity (the recycling pass,
-- an auto-publish, a background health recheck) has no browser behind it at all.
ALTER TABLE activity_logs ADD COLUMN user_agent text;
