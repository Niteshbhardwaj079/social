-- Adds a real View permission to every module that didn't already have one (Roles, Posts, Social
-- Accounts, Ads, Campaigns, Media, Templates) — Users/Activity Logs/Settings already had one.
-- `DEFAULT true` on every new column means every EXISTING row (built-in and custom) keeps exactly
-- the access it already had: these modules were always open to any signed-in user before, so
-- nobody's effective access shrinks because of this migration, same data-safety approach as 024.
ALTER TABLE roles
  ADD COLUMN roles_view            boolean NOT NULL DEFAULT true,
  ADD COLUMN posts_view            boolean NOT NULL DEFAULT true,
  ADD COLUMN social_accounts_view  boolean NOT NULL DEFAULT true,
  ADD COLUMN ads_view              boolean NOT NULL DEFAULT true,
  ADD COLUMN campaigns_view        boolean NOT NULL DEFAULT true,
  ADD COLUMN media_view            boolean NOT NULL DEFAULT true,
  ADD COLUMN templates_view        boolean NOT NULL DEFAULT true;
