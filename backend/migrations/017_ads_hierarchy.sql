-- Phase 1+2 rework of the Ads module (see backend README's Ads section):
--
--   1. `ad_accounts` stops storing its own credentials entirely. Ads now reuses the Facebook
--      connection already in Social Accounts (its optional `adsAccessToken` field) — this table
--      becomes a pure discovery cache, one row per real Meta ad account found via /me/adaccounts,
--      refreshed by "Sync Ad Accounts" (see providers/adsMeta.js, services/adsService.js).
--   2. The old bundled 1:1:1:1 `ad_campaigns` row (campaign+adset+creative+ad all in one) is split
--      into a real Campaign -> Ad Set -> Ad -> Creative hierarchy, so an ad set or a creative can
--      genuinely be reused/duplicated independently (bulk creation, duplicate-into-another-ad-set).
--
-- Ads shipped earlier the same day this migration was written, before any client connected a real
-- Meta ad account through it — there is no real production data to preserve here, so this is a clean
-- rebuild rather than a row-by-row migration. Any already-running Meta campaign keeps running on
-- Meta's own side regardless (Social is only ever the management layer, never the thing actually
-- running the ad) — reconnecting after this migration just means clicking "Sync Ad Accounts" again.
DROP TABLE IF EXISTS ad_campaign_daily_stats;
DROP TABLE IF EXISTS ad_campaigns;
DROP TABLE IF EXISTS ad_accounts;

-- One row per real ad account discovered from the client's own Facebook connection. No credentials
-- here at all — see socialAccountService.getCredentials('facebook') for where those live.
CREATE TABLE ad_accounts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  network              text        NOT NULL,
  source_platform      text        NOT NULL,
  external_account_id  text        NOT NULL,
  name                 text        NOT NULL DEFAULT '',
  currency             text        NOT NULL DEFAULT '',
  timezone             text        NOT NULL DEFAULT '',
  account_status       text        NOT NULL DEFAULT '',
  business_name        text        NOT NULL DEFAULT '',
  disable_reason       text,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ad_accounts_network_external_unique ON ad_accounts (network, external_account_id);

CREATE TABLE ad_campaigns (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id         uuid        NOT NULL REFERENCES ad_accounts (id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  objective             text        NOT NULL,
  status                text        NOT NULL CHECK (status IN ('draft', 'inReview', 'active', 'paused', 'completed', 'rejected')) DEFAULT 'draft',
  external_campaign_id  text,
  created_by            uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_campaigns_account ON ad_campaigns (ad_account_id);

CREATE TABLE ad_sets (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_campaign_id       uuid        NOT NULL REFERENCES ad_campaigns (id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  platforms            text[]      NOT NULL DEFAULT '{}',
  budget_type          text        NOT NULL CHECK (budget_type IN ('daily', 'lifetime')),
  budget               numeric     NOT NULL,
  start_date           date        NOT NULL,
  end_date             date        NOT NULL,
  audience             jsonb       NOT NULL DEFAULT '{}',
  status               text        NOT NULL CHECK (status IN ('draft', 'inReview', 'active', 'paused', 'completed', 'rejected')) DEFAULT 'draft',
  external_adset_id    text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_sets_campaign ON ad_sets (ad_campaign_id);

-- Reusable across ads (bulk creation reuses one creative across many ads; duplicating an ad can
-- point at the same creative row rather than copying it).
CREATE TABLE ad_creatives (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL DEFAULT '',
  headline               text        NOT NULL DEFAULT '',
  body_text              text        NOT NULL DEFAULT '',
  cta                    text        NOT NULL DEFAULT '',
  destination_url        text        NOT NULL DEFAULT '',
  media_id               uuid        REFERENCES media_items (id) ON DELETE SET NULL,
  external_creative_id   text,
  created_by             uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ads (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id          uuid        NOT NULL REFERENCES ad_sets (id) ON DELETE CASCADE,
  ad_creative_id     uuid        NOT NULL REFERENCES ad_creatives (id) ON DELETE RESTRICT,
  name               text        NOT NULL,
  status             text        NOT NULL CHECK (status IN ('draft', 'inReview', 'active', 'paused', 'completed', 'rejected')) DEFAULT 'draft',
  rejection_reason   text,
  external_ad_id     text,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ads_ad_set ON ads (ad_set_id);
CREATE INDEX ads_creative ON ads (ad_creative_id);

-- Real day-by-day spend/impressions/clicks, kept fresh by a background job, one leaf ad at a time
-- (an ad set with several ads gets several independently-tracked rows here, correctly).
CREATE TABLE ad_daily_stats (
  ad_id         uuid    NOT NULL REFERENCES ads (id) ON DELETE CASCADE,
  date          date    NOT NULL,
  spend         numeric NOT NULL DEFAULT 0,
  impressions   bigint  NOT NULL DEFAULT 0,
  clicks        bigint  NOT NULL DEFAULT 0,
  -- Always 0, never a guess: real conversions need a Meta Pixel or Lead Form this app's composer
  -- does not set up (see providers/adsMeta.js).
  conversions   bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, date)
);
