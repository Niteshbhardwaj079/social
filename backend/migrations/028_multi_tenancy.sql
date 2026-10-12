-- SaaS step 1: many organizations (companies) share ONE database, safely.
--
-- How the isolation works (read this before touching tenant tables):
--   * Every tenant table gets an `organization_id` column.
--   * The app tells PostgreSQL which organization a request belongs to by setting `app.org_id`
--     on the database session (see src/db/pool.js). Background jobs and the platform-owner screens
--     set `app.bypass = 'on'` instead, which means "see every organization".
--   * Row-Level Security (RLS) policies below then hide every other organization's rows from every
--     SELECT / UPDATE / DELETE automatically, and refuse an INSERT into the wrong organization.
--   * `organization_id` DEFAULTs to the current organization, so existing INSERT statements in the
--     code did not need to change at all.
-- Result: a forgotten `WHERE organization_id = ...` can never leak data between customers.

CREATE TABLE organizations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- Printed on invoices ("Bill to"). Editable by the organization under Billing.
  billing_name     text        NOT NULL DEFAULT '',
  billing_email    text        NOT NULL DEFAULT '',
  billing_address  text        NOT NULL DEFAULT '',
  billing_gstin    text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The organization the current database session is working for (NULL when none is set).
CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- True for background jobs / platform-owner screens that are allowed to see every organization.
CREATE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass', true), '') = 'on'
$$;

-- The platform owner (you, the SaaS operator) — not the same as an organization's own Super Admin.
ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  tenant_tables text[] := ARRAY[
    'users', 'roles', 'settings', 'system_emails', 'system_email_translations', 'system_email_images',
    'email_outbox', 'email_settings', 'activity_logs', 'social_accounts', 'posts', 'post_targets',
    'storage_settings', 'media_items', 'post_media', 'notifications', 'campaigns', 'recycling_entries',
    'account_metrics_history', 'inbox_conversations', 'inbox_replies', 'ad_accounts', 'ad_campaigns',
    'ad_sets', 'ad_creatives', 'ads', 'ad_daily_stats', 'ad_creative_templates', 'ad_rules',
    'ad_rule_runs', 'short_links', 'short_link_clicks'
  ];
  table_name text;
  legacy_org uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM users) THEN
    -- An existing single-tenant install: everything already in it becomes organization #1.
    INSERT INTO organizations (name)
    VALUES (coalesce(nullif((SELECT value ->> 'name' FROM settings WHERE key = 'workspace'), ''), 'My Workspace'))
    RETURNING id INTO legacy_org;
    -- Its earliest Super Admin becomes the platform owner.
    UPDATE users SET is_platform_admin = true
     WHERE id = (SELECT id FROM users WHERE role = 'superAdmin' ORDER BY created_at LIMIT 1);
  ELSE
    -- A fresh install: the built-in rows earlier migrations seeded are now created per organization
    -- at sign-up (see src/services/organizationService.js), so drop the global copies.
    DELETE FROM roles;
    DELETE FROM storage_settings;
    DELETE FROM email_settings;
    DELETE FROM settings;
    DELETE FROM system_emails;
  END IF;

  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE', table_name);
    IF legacy_org IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET organization_id = %L', table_name, legacy_org);
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL, ALTER COLUMN organization_id SET DEFAULT app_current_org()', table_name);
    EXECUTE format('CREATE INDEX %I ON %I (organization_id)', table_name || '_organization_idx', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    -- FORCE: the rules apply even when the app connects as the table's owner.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_system() OR organization_id = app_current_org()) WITH CHECK (app_is_system() OR organization_id = app_current_org())',
      table_name
    );
  END LOOP;
END $$;

-- Keys that used to be unique for the whole install are now unique per organization.
ALTER TABLE users DROP CONSTRAINT users_role_fkey;
ALTER TABLE system_email_translations DROP CONSTRAINT system_email_translations_email_id_fkey;
ALTER TABLE system_email_images DROP CONSTRAINT system_email_images_email_id_fkey;

ALTER TABLE roles DROP CONSTRAINT roles_pkey, ADD PRIMARY KEY (organization_id, id);
ALTER TABLE settings DROP CONSTRAINT settings_pkey, ADD PRIMARY KEY (organization_id, key);
ALTER TABLE system_emails DROP CONSTRAINT system_emails_pkey, ADD PRIMARY KEY (organization_id, id);
ALTER TABLE system_email_translations DROP CONSTRAINT system_email_translations_pkey, ADD PRIMARY KEY (organization_id, email_id, language);
ALTER TABLE system_email_images DROP CONSTRAINT system_email_images_pkey, ADD PRIMARY KEY (organization_id, email_id, media_id);
ALTER TABLE social_accounts DROP CONSTRAINT social_accounts_pkey, ADD PRIMARY KEY (organization_id, platform);
ALTER TABLE storage_settings DROP CONSTRAINT storage_settings_pkey, ADD PRIMARY KEY (organization_id);
ALTER TABLE email_settings DROP CONSTRAINT email_settings_pkey, ADD PRIMARY KEY (organization_id);

ALTER TABLE users ADD CONSTRAINT users_role_fkey
  FOREIGN KEY (organization_id, role) REFERENCES roles (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE system_email_translations ADD CONSTRAINT system_email_translations_email_id_fkey
  FOREIGN KEY (organization_id, email_id) REFERENCES system_emails (organization_id, id) ON DELETE CASCADE;
ALTER TABLE system_email_images ADD CONSTRAINT system_email_images_email_id_fkey
  FOREIGN KEY (organization_id, email_id) REFERENCES system_emails (organization_id, id) ON DELETE CASCADE;

DROP INDEX ad_accounts_network_external_unique;
CREATE UNIQUE INDEX ad_accounts_network_external_unique ON ad_accounts (organization_id, network, external_account_id);

ALTER TABLE inbox_conversations DROP CONSTRAINT inbox_conversations_platform_external_comment_id_key;
ALTER TABLE inbox_conversations ADD CONSTRAINT inbox_conversations_platform_external_comment_id_key
  UNIQUE (organization_id, platform, external_comment_id);

-- Left global on purpose:
--   * users.email      — one email = one account on the whole platform (sign-in is by email alone).
--   * short_links.slug — /l/<slug> is one public address space for every organization.
--   * auth_tokens      — looked up by a secret hash before anyone is signed in; tied to a user anyway.
