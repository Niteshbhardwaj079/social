-- SaaS step 4: the marketing agent — Brand Kit, research, weekly content plans.
-- The agent runs on a paid AI provider when the organization has one (or the platform's key), and
-- otherwise on the built-in FREE agent (templates + free sources), so every plan can use it.

-- ---------------------------------------------------------------- Brand Kit: everything the agent knows about the business
CREATE TABLE ai_brand_kits (
  organization_id  uuid        PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  company_name     text        NOT NULL DEFAULT '',
  website          text        NOT NULL DEFAULT '',
  industry         text        NOT NULL DEFAULT '',  -- e.g. "Clothing store", "Dental clinic"
  description      text        NOT NULL DEFAULT '',  -- what the business does, in a few lines
  products         text        NOT NULL DEFAULT '',  -- one product / service per line
  target_audience  text        NOT NULL DEFAULT '',
  location         text        NOT NULL DEFAULT '',  -- city / region, used for local events and hashtags
  usps             text        NOT NULL DEFAULT '',  -- why customers choose them, one per line
  competitors      text        NOT NULL DEFAULT '',  -- one name or website per line
  keywords         text        NOT NULL DEFAULT '',  -- comma separated, also used for hashtags
  tone             text        NOT NULL DEFAULT 'friendly',
  avoid            text        NOT NULL DEFAULT '',  -- words / topics the agent must never use
  brand_color      text        NOT NULL DEFAULT '#4f46e5', -- used by the free agent's graphic cards
  phone            text        NOT NULL DEFAULT '',  -- optional call-to-action
  auto_research    text        NOT NULL DEFAULT 'weekly' CHECK (auto_research IN ('off', 'daily', 'weekly')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- research reports (competitors, trends, events → post ideas)
CREATE TABLE ai_research_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  engine             text        NOT NULL,             -- anthropic | openai | gemini | ollama | free
  status             text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  summary            text        NOT NULL DEFAULT '',
  insights           jsonb       NOT NULL DEFAULT '{}', -- { competitors: [...], trends: [...], events: [...] }
  ideas              jsonb       NOT NULL DEFAULT '[]', -- [{ title, angle, format }]
  used_ideas         integer[]   NOT NULL DEFAULT '{}', -- indexes the autopilot has already posted about
  sources            jsonb       NOT NULL DEFAULT '[]', -- [{ title, url }]
  uses_platform_key  boolean     NOT NULL DEFAULT false,
  credits            integer     NOT NULL DEFAULT 0,
  error              text,
  created_by         uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);
CREATE INDEX ai_research_reports_org_idx ON ai_research_reports (organization_id, created_at DESC);

-- ---------------------------------------------------------------- content plans ("plan my week")
CREATE TABLE ai_content_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE DEFAULT app_current_org(),
  engine           text        NOT NULL DEFAULT '',
  status           text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  options          jsonb       NOT NULL DEFAULT '{}',  -- { days, postsPerDay, platforms, format, requireApproval, postTime, timezone }
  post_ids         uuid[]      NOT NULL DEFAULT '{}',
  error            text,
  autopilot_id     uuid,
  created_by       uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);
CREATE INDEX ai_content_plans_org_idx ON ai_content_plans (organization_id, created_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_brand_kits', 'ai_research_reports', 'ai_content_plans'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_system() OR organization_id = app_current_org()) WITH CHECK (app_is_system() OR organization_id = app_current_org())',
      table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------- autopilot: smart mode + weekly plans + "mix" of formats
ALTER TABLE ai_autopilots
  ADD COLUMN use_brand_kit boolean NOT NULL DEFAULT false, -- pick a fresh idea from Brand Kit + research instead of a fixed brief
  ADD COLUMN mode text NOT NULL DEFAULT 'single' CHECK (mode IN ('single', 'weekly_plan')),
  ADD COLUMN posts_per_day integer NOT NULL DEFAULT 1 CHECK (posts_per_day BETWEEN 1 AND 3);
ALTER TABLE ai_autopilots DROP CONSTRAINT ai_autopilots_content_type_check;
ALTER TABLE ai_autopilots ADD CONSTRAINT ai_autopilots_content_type_check
  CHECK (content_type IN ('text', 'image', 'slideshow', 'video', 'mix'));

-- The free agent's generations are recorded too (engine 'free', no credits).
ALTER TABLE ai_generations DROP CONSTRAINT ai_generations_kind_check;
ALTER TABLE ai_generations ADD CONSTRAINT ai_generations_kind_check CHECK (kind IN ('text', 'image', 'slideshow', 'video', 'card'));
