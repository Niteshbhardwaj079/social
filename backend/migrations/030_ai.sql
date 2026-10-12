-- SaaS step 3: the AI Studio — AI-written posts, AI images, videos and auto-posting ("autopilot").
--
-- Who may use AI is decided at four levels, all of which must say yes (see src/services/aiAccessService.js):
--   1. Platform owner, everyone:   Platform → AI → "AI enabled" (platform_settings.aiEnabled)
--   2. Platform owner, per org:    organizations.ai_access  enabled | disabled | hidden
--   3. The organization's plan:    plans.feature_ai (and feature_ai_video for paid AI video)
--   4. The person's role:          roles.ai_use / roles.ai_autopilot
-- AI keys: an organization can connect its OWN key per provider (free for us, no credit limit), otherwise
-- the platform owner's key is used and each use costs credits from the plan's monthly allowance.

-- ---------------------------------------------------------------- plan: AI included? how many credits?
ALTER TABLE plans
  ADD COLUMN feature_ai            boolean NOT NULL DEFAULT false,
  ADD COLUMN feature_ai_video      boolean NOT NULL DEFAULT false, -- paid text-to-video (Sora / Veo)
  ADD COLUMN ai_credits_per_month  integer;                       -- with the platform's keys; NULL = unlimited

UPDATE plans SET feature_ai = true, feature_ai_video = false, ai_credits_per_month = 20   WHERE id = 'free';
UPDATE plans SET feature_ai = true, feature_ai_video = false, ai_credits_per_month = 300  WHERE id = 'starter';
UPDATE plans SET feature_ai = true, feature_ai_video = true,  ai_credits_per_month = 1500 WHERE id = 'pro';
UPDATE plans SET feature_ai = true, feature_ai_video = true,  ai_credits_per_month = NULL WHERE id = 'enterprise';

-- ---------------------------------------------------------------- per-organization switch, set by the platform owner
ALTER TABLE organizations
  ADD COLUMN ai_access text NOT NULL DEFAULT 'enabled' CHECK (ai_access IN ('enabled', 'disabled', 'hidden'));

-- ---------------------------------------------------------------- role permissions
ALTER TABLE roles
  ADD COLUMN ai_use       boolean NOT NULL DEFAULT false,  -- write posts, make images/videos with AI
  ADD COLUMN ai_autopilot boolean NOT NULL DEFAULT false;  -- set up AI auto-posting
-- Existing roles: whoever could write posts may use AI; whoever could publish may run autopilots.
UPDATE roles SET ai_use = posts_write, ai_autopilot = posts_publish;

-- ---------------------------------------------------------------- the platform owner's own keys (not tenant data)
CREATE TABLE platform_ai_keys (
  provider     text        PRIMARY KEY,           -- anthropic | openai | gemini
  credentials  text        NOT NULL,              -- encrypted (utils/crypto.js)
  secret_hint  text        NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- an organization's own AI keys and choices
CREATE TABLE ai_provider_keys (
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  provider         text        NOT NULL,
  credentials      text        NOT NULL,          -- encrypted
  secret_hint      text        NOT NULL DEFAULT '',
  connected_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider)
);

CREATE TABLE ai_settings (
  organization_id  uuid        PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  text_provider    text,                          -- NULL = automatic (first one that has a key)
  image_provider   text,
  video_provider   text,
  brand_voice      text        NOT NULL DEFAULT '', -- "Friendly, Hinglish, emojis OK" — added to every prompt
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- every AI request: history, credits, async video jobs
CREATE TABLE ai_generations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  kind                text        NOT NULL CHECK (kind IN ('text', 'image', 'slideshow', 'video')),
  provider            text        NOT NULL,
  model               text        NOT NULL DEFAULT '',
  prompt              text        NOT NULL,
  options             jsonb       NOT NULL DEFAULT '{}',
  status              text        NOT NULL DEFAULT 'succeeded' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  result              jsonb       NOT NULL DEFAULT '{}',   -- text: { variants: [...] }
  media_id            uuid        REFERENCES media_items (id) ON DELETE SET NULL, -- image / video saved to the Media Library
  external_job_id     text,                                -- a provider's async video job
  uses_platform_key   boolean     NOT NULL DEFAULT false,
  credits             integer     NOT NULL DEFAULT 0,
  error               text,
  autopilot_id        uuid,
  created_by          uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);
CREATE INDEX ai_generations_org_created_idx ON ai_generations (organization_id, created_at DESC);
CREATE INDEX ai_generations_pending_idx ON ai_generations (status) WHERE status IN ('queued', 'running');

-- ---------------------------------------------------------------- autopilots: "post about X every day at 10:00"
CREATE TABLE ai_autopilots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  name              text        NOT NULL,
  brief             text        NOT NULL,                 -- what to post about
  tone              text        NOT NULL DEFAULT 'friendly',
  language          text        NOT NULL DEFAULT 'en',
  platforms         text[]      NOT NULL,
  content_type      text        NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'slideshow', 'video')),
  frequency         text        NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'weekly')),
  post_time         text        NOT NULL DEFAULT '10:00', -- HH:MM in `timezone`
  weekday           integer     NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6), -- weekly only, 0 = Sunday
  timezone          text        NOT NULL DEFAULT 'Asia/Kolkata',
  require_approval  boolean     NOT NULL DEFAULT true,    -- true: lands in Approvals; false: publishes straight away
  is_active         boolean     NOT NULL DEFAULT true,
  next_run_at       timestamptz,
  last_run_at       timestamptz,
  last_error        text,
  last_post_id      uuid        REFERENCES posts (id) ON DELETE SET NULL,
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_autopilots_due_idx ON ai_autopilots (next_run_at) WHERE is_active;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_provider_keys', 'ai_settings', 'ai_generations', 'ai_autopilots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_system() OR organization_id = app_current_org()) WITH CHECK (app_is_system() OR organization_id = app_current_org())',
      table_name
    );
  END LOOP;
END $$;

-- Every existing organization gets its (empty) AI settings row.
INSERT INTO ai_settings (organization_id) SELECT id FROM organizations;
