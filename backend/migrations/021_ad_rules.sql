-- Phase 8: Automated Rules — pause/resume only, never budget, keeping the same "Social has no role in
-- ad spend" boundary held throughout this whole Ads rework. A rule watches one real metric across one
-- ad account's ads and pauses/resumes an ad when it crosses a threshold — the exact same real Meta
-- pause/resume call a person would make by hand (setMetaAdStatus in providers/adsMeta.js), just
-- triggered automatically instead of by a click.
CREATE TABLE ad_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  ad_account_id   uuid        NOT NULL REFERENCES ad_accounts (id) ON DELETE CASCADE,
  metric          text        NOT NULL CHECK (metric IN ('spend', 'impressions', 'clicks', 'ctr', 'cpc')),
  comparator      text        NOT NULL CHECK (comparator IN ('gt', 'lt')),
  threshold       numeric     NOT NULL CHECK (threshold >= 0),
  window_days     int         NOT NULL CHECK (window_days IN (1, 3, 7, 14, 30)),
  action          text        NOT NULL CHECK (action IN ('pause', 'resume')),
  is_active       boolean     NOT NULL DEFAULT true,
  -- Minimum time between this rule firing twice on the SAME ad — the main anti-thrash safety net (a
  -- pause rule and its own opposite conditions never flip an ad back and forth every evaluation pass).
  cooldown_hours  int         NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 1),
  created_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_rules_account ON ad_rules (ad_account_id);

-- One row per real firing (an actual Meta pause/resume call the rule made) — separate from
-- activity_logs (which also gets one row per firing, for the existing Activity Logs page) because the
-- cooldown check needs a fast "when did this rule last act on this specific ad" lookup, not a
-- general-purpose log scan.
CREATE TABLE ad_rule_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_rule_id    uuid        NOT NULL REFERENCES ad_rules (id) ON DELETE CASCADE,
  ad_id         uuid        NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
  action        text        NOT NULL,
  fired_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_rule_runs_lookup ON ad_rule_runs (ad_rule_id, ad_id, fired_at DESC);
