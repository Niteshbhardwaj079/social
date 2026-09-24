-- Splits the 12 coarse "manage" flags into ~30 real per-action permissions (View/Create/Edit/Delete,
-- matching each module's genuinely distinct backend operation — see services/permissions.js for
-- exactly what each one gates). This migration must not silently change any EXISTING role's actual
-- access: every new column is derived from the old flag it replaces (for the 5 built-ins AND any
-- custom role already created), so effective permissions are identical before/after, just more
-- finely split for editing going forward.

ALTER TABLE roles
  ADD COLUMN users_view boolean NOT NULL DEFAULT false,
  ADD COLUMN users_create boolean NOT NULL DEFAULT false,
  ADD COLUMN users_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN users_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN roles_create boolean NOT NULL DEFAULT false,
  ADD COLUMN roles_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN roles_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN posts_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN social_accounts_connect boolean NOT NULL DEFAULT false,
  ADD COLUMN social_accounts_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN social_accounts_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN ads_create boolean NOT NULL DEFAULT false,
  ADD COLUMN ads_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN ads_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN campaigns_create boolean NOT NULL DEFAULT false,
  ADD COLUMN campaigns_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN campaigns_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN media_create boolean NOT NULL DEFAULT false,
  ADD COLUMN media_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN media_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN templates_create boolean NOT NULL DEFAULT false,
  ADD COLUMN templates_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN templates_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN activity_logs_view boolean NOT NULL DEFAULT false,
  ADD COLUMN activity_logs_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN settings_view boolean NOT NULL DEFAULT false,
  ADD COLUMN settings_edit boolean NOT NULL DEFAULT false;

-- Carry every existing row's (built-in or custom) old single flag forward onto all of that
-- module's new split columns, so nothing anyone already granted silently disappears.
UPDATE roles SET
  users_view = users_manage, users_create = users_manage, users_edit = users_manage, users_delete = users_manage,
  roles_create = roles_manage, roles_edit = roles_manage, roles_delete = roles_manage,
  -- Editor-tier roles could already delete ANY post (canPublishPosts implied it); Contributor-tier
  -- keeps deleting only their own via the unchanged ownership fallback in permissions.js.
  posts_delete = posts_publish,
  social_accounts_connect = social_accounts_manage, social_accounts_edit = social_accounts_manage, social_accounts_delete = social_accounts_manage,
  ads_create = ads_manage, ads_edit = ads_manage, ads_delete = ads_manage,
  campaigns_create = campaigns_manage, campaigns_edit = campaigns_manage, campaigns_delete = campaigns_manage,
  media_create = media_manage, media_edit = media_manage, media_delete = media_manage,
  templates_create = templates_manage, templates_edit = templates_manage, templates_delete = templates_manage,
  activity_logs_view = activity_logs_manage, activity_logs_delete = activity_logs_manage,
  settings_view = settings_manage, settings_edit = settings_manage;

ALTER TABLE roles
  DROP COLUMN users_manage,
  DROP COLUMN roles_manage,
  DROP COLUMN social_accounts_manage,
  DROP COLUMN ads_manage,
  DROP COLUMN campaigns_manage,
  DROP COLUMN media_manage,
  DROP COLUMN templates_manage,
  DROP COLUMN activity_logs_manage,
  DROP COLUMN settings_manage;
