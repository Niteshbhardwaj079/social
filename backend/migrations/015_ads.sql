-- Paid advertising. Deliberately separate from `campaigns` (migration 008), which groups organic posts —
-- an ad "campaign" here is a real, billed thing running on the ad platform's own servers.

-- One ad ACCOUNT per network (fewer than social_accounts: one Meta ad account covers both Facebook and
-- Instagram placements). Same encrypted-credentials pattern as social_accounts.
CREATE TABLE ad_accounts (
  network       text PRIMARY KEY,
  status        text        NOT NULL CHECK (status IN ('connected', 'disconnected')),
  account_id    text        NOT NULL DEFAULT '',
  account_name  text        NOT NULL DEFAULT '',
  currency      text        NOT NULL DEFAULT '',
  credentials   text,
  connected_by  uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ad_campaigns (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  objective             text        NOT NULL,
  network               text        NOT NULL,
  platforms             text[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL CHECK (status IN ('draft', 'inReview', 'active', 'paused', 'completed', 'rejected')) DEFAULT 'draft',
  budget_type           text        NOT NULL CHECK (budget_type IN ('daily', 'lifetime')),
  budget                numeric     NOT NULL,
  start_date            date        NOT NULL,
  end_date              date        NOT NULL,
  creative              jsonb       NOT NULL DEFAULT '{}',
  audience              jsonb       NOT NULL DEFAULT '{}',
  rejection_reason      text,
  -- Meta's object hierarchy: a campaign contains an ad set (targeting+budget), which contains an ad
  -- (pairing the ad set with a creative). NULL until "Launch ad" actually sends it to the platform —
  -- a draft never gets these, so it never shows up in Meta's own Ads Manager either.
  external_campaign_id  text,
  external_adset_id     text,
  external_ad_id        text,
  external_creative_id  text,
  last_synced_at        timestamptz,
  created_by            uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_campaigns_recent ON ad_campaigns (created_at DESC);

-- Real day-by-day spend/impressions/clicks, kept fresh by a background job (adsService.js).
CREATE TABLE ad_campaign_daily_stats (
  ad_campaign_id  uuid    NOT NULL REFERENCES ad_campaigns (id) ON DELETE CASCADE,
  date            date    NOT NULL,
  spend           numeric NOT NULL DEFAULT 0,
  impressions     bigint  NOT NULL DEFAULT 0,
  clicks          bigint  NOT NULL DEFAULT 0,
  -- Always 0, never a guess: real conversions need a Meta Pixel or Lead Form attached to the ad
  -- account, which this app's composer does not set up (see providers/adsMeta.js).
  conversions     bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_campaign_id, date)
);
