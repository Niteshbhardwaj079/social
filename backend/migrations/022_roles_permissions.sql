-- Custom Roles & Permissions. Replaces the hardcoded 5-role enum with real, editable rows so
-- Super Admin/Admin can create roles like "Ads Manager" or "Content Manager" with their own
-- permission set, while the 5 existing roles keep working exactly as they do today (this
-- migration seeds them with the SAME capabilities the old hardcoded functions already granted).
--
-- Exactly one role (Super Admin) is `is_protected` — it can never be renamed, have its
-- permissions edited, or be deleted, and only it may edit role DEFINITIONS (create/edit/delete
-- a role, change what a role can do). This is the one hard lock that keeps the app from ever
-- being permanently locked out by a bad edit; the existing "at least one active Super Admin"
-- user-level safety rail (in userService.js) is unaffected and still applies on top of it.
CREATE TABLE roles (
  id                     text        PRIMARY KEY,
  name                   text        NOT NULL,
  description            text        NOT NULL DEFAULT '',
  icon                   text        NOT NULL DEFAULT 'Shield',
  accent                 text        NOT NULL DEFAULT 'slate',
  rank                   integer     NOT NULL DEFAULT 1,
  is_protected           boolean     NOT NULL DEFAULT false,
  is_active              boolean     NOT NULL DEFAULT true,
  -- One boolean per real, enforced capability. Every one of these is read by a live permission
  -- check somewhere in the backend (see services/permissions.js) — none of them is decorative.
  users_manage           boolean     NOT NULL DEFAULT false,
  roles_manage           boolean     NOT NULL DEFAULT false,
  posts_write            boolean     NOT NULL DEFAULT false,
  posts_publish          boolean     NOT NULL DEFAULT false,
  social_accounts_manage boolean     NOT NULL DEFAULT false,
  ads_manage             boolean     NOT NULL DEFAULT false,
  campaigns_manage       boolean     NOT NULL DEFAULT false,
  reports_view           boolean     NOT NULL DEFAULT false,
  media_manage           boolean     NOT NULL DEFAULT false,
  templates_manage       boolean     NOT NULL DEFAULT false,
  activity_logs_manage   boolean     NOT NULL DEFAULT false,
  settings_manage        boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (
  id, name, description, icon, accent, rank, is_protected,
  users_manage, roles_manage, posts_write, posts_publish, social_accounts_manage,
  ads_manage, campaigns_manage, reports_view, media_manage, templates_manage,
  activity_logs_manage, settings_manage
) VALUES
  ('superAdmin', 'Super Admin', 'Full access to every module. Cannot be renamed, edited or deleted.', 'ShieldCheck', 'rose', 4, true,
   true, true, true, true, true, true, true, true, true, true, true, true),
  ('admin', 'Admin', 'Manage users, content and settings.', 'Settings2', 'purple', 3, false,
   true, true, true, true, true, true, true, true, true, true, true, true),
  ('editor', 'Editor', 'Create, edit and publish content across all connected accounts.', 'PenSquare', 'blue', 2, false,
   false, false, true, true, false, true, true, true, true, true, false, false),
  ('contributor', 'Contributor', 'Draft and submit content for approval; cannot publish directly.', 'Users', 'teal', 1, false,
   false, false, true, false, false, false, false, true, true, false, false, false),
  ('analyst', 'Analyst', 'Read-only access to analytics and reporting.', 'BarChart3', 'slate', 1, false,
   false, false, false, false, false, false, false, true, false, false, false, false);

-- users.role was a CHECK-constrained enum; it becomes a real foreign key so new/renamed roles
-- need no code change, and a role in use cannot be deleted out from under its people.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_fkey FOREIGN KEY (role) REFERENCES roles (id) ON DELETE RESTRICT;
