// Every key below is read by a real permission check on the backend (see
// backend/src/services/permissions.js). Every module now has a real View flag (migration 027)
// — existing roles keep exactly the (previously ungated) access they already had. The grid always
// shows the same four columns (View / Create / Edit / Delete) for every module, even where the
// underlying flag is semantically narrower — e.g. Posts' "Create" column is really `postsWrite`
// (draft/edit/submit) and its "Edit" column is really `postsPublish` (approve/reject/publish); the
// cell's `description` always spells out the real meaning. A module gets `null` for a column where
// that operation genuinely doesn't exist (Reports has only View; Activity Logs has no Create/Edit;
// Settings has no Create/Delete) — the matrix renders those cells empty and disabled.
export const PERMISSION_COLUMNS = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
];

export const ROLE_PERMISSION_MODULES = [
  {
    module: 'Users',
    cells: {
      view: { key: 'usersView', description: 'See the list of people in the workspace.' },
      create: { key: 'usersCreate', description: 'Invite new people.' },
      edit: { key: 'usersEdit', description: "Change someone's name, role, language or status." },
      delete: { key: 'usersDelete', description: 'Remove someone from the workspace.' },
    },
  },
  {
    module: 'Roles',
    cells: {
      view: { key: 'rolesView', description: 'See the Roles & Permissions page.' },
      create: { key: 'rolesCreate', description: 'Create a new custom role, or duplicate one.' },
      edit: { key: 'rolesEdit', description: "Rename a role or change what it can do. Always locked for Super Admin." },
      delete: { key: 'rolesDelete', description: 'Delete a custom role. Always locked for Super Admin.' },
    },
  },
  {
    module: 'Posts',
    cells: {
      view: { key: 'postsView', description: 'See posts in the calendar and list.' },
      create: { key: 'postsWrite', description: 'Create and edit drafts; submit for approval.' },
      edit: { key: 'postsPublish', description: 'Approve, reject, retry and publish any post.' },
      delete: { key: 'postsDelete', description: 'Delete any post outright, not just your own draft.' },
    },
  },
  {
    module: 'Social Accounts',
    cells: {
      view: { key: 'socialAccountsView', description: 'See which accounts are connected (also needed by the post composer).' },
      create: { key: 'socialAccountsConnect', description: 'Connect a social account or storage provider, or test credentials.' },
      edit: { key: 'socialAccountsEdit', description: 'Re-check/sync an already-connected account; manage automated ad rules.' },
      delete: { key: 'socialAccountsDelete', description: 'Disconnect a social account or the storage provider.' },
    },
  },
  {
    module: 'Ads',
    cells: {
      view: { key: 'adsView', description: 'See ad accounts, launched ads and their stats.' },
      create: { key: 'adsCreate', description: 'Launch a new ad or ad variation.' },
      edit: { key: 'adsEdit', description: 'Pause or resume a launched ad.' },
      delete: { key: 'adsDelete', description: 'Delete an ad.' },
    },
  },
  {
    module: 'Campaigns',
    cells: {
      view: { key: 'campaignsView', description: 'See the list of campaigns.' },
      create: { key: 'campaignsCreate', description: 'Create a new campaign.' },
      edit: { key: 'campaignsEdit', description: "Change a campaign's details or status." },
      delete: { key: 'campaignsDelete', description: 'Delete a campaign.' },
    },
  },
  {
    module: 'Reports',
    cells: {
      view: { key: 'reportsView', description: 'View the Dashboard and Analytics pages.' },
      create: null,
      edit: null,
      delete: null,
    },
  },
  {
    module: 'Media',
    cells: {
      view: { key: 'mediaView', description: 'See files in the Media Library.' },
      create: { key: 'mediaCreate', description: 'Upload a new file or add one by link.' },
      edit: { key: 'mediaEdit', description: 'Replace or re-crop an existing file.' },
      delete: { key: 'mediaDelete', description: 'Delete a file from the Media Library.' },
    },
  },
  {
    module: 'Templates',
    cells: {
      view: { key: 'templatesView', description: 'See saved ad creative templates.' },
      create: { key: 'templatesCreate', description: 'Save a new ad creative template.' },
      edit: { key: 'templatesEdit', description: 'Edit a saved template.' },
      delete: { key: 'templatesDelete', description: 'Delete a saved template.' },
    },
  },
  {
    module: 'Activity Logs',
    cells: {
      view: { key: 'activityLogsView', description: 'View the activity log.' },
      create: null,
      edit: null,
      delete: { key: 'activityLogsDelete', description: 'Delete activity log entries.' },
    },
  },
  {
    module: 'Settings',
    cells: {
      view: { key: 'settingsView', description: 'View workspace, language and system email settings.' },
      create: null,
      edit: { key: 'settingsEdit', description: 'Change workspace, language and system email settings.' },
      delete: null,
    },
  },
];

export const ROLE_PERMISSION_KEYS = ROLE_PERMISSION_MODULES.flatMap((group) =>
  PERMISSION_COLUMNS.map((column) => group.cells[column.id]).filter(Boolean).map((cell) => cell.key)
);

export const ROLE_ACCENTS = ['rose', 'purple', 'blue', 'teal', 'slate', 'amber'];

export function emptyPermissions() {
  return Object.fromEntries(ROLE_PERMISSION_KEYS.map((key) => [key, false]));
}
