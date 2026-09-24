// Every one of these keys is read by a real permission check on the backend (see
// backend/src/services/permissions.js) — split into View/Create/Edit/Delete wherever that's a
// genuinely distinct backend operation. Where viewing was never restricted (Posts, Campaigns,
// Media, Templates, Social Accounts, Roles), there's no View row at all — it stays open to any
// signed-in user, same as always; only modules that were already view-gated (Users, Activity
// Logs, Settings) have a real View toggle. Nothing here is decorative.
export const ROLE_PERMISSION_GROUPS = [
  {
    module: 'Users',
    rows: [
      { key: 'usersView', label: 'View', description: 'See the list of people in the workspace.' },
      { key: 'usersCreate', label: 'Create', description: 'Invite new people.' },
      { key: 'usersEdit', label: 'Edit', description: "Change someone's name, role, language or status." },
      { key: 'usersDelete', label: 'Delete', description: 'Remove someone from the workspace.' },
    ],
  },
  {
    module: 'Roles',
    rows: [
      { key: 'rolesCreate', label: 'Create', description: 'Create a new custom role, or duplicate one.' },
      { key: 'rolesEdit', label: 'Edit', description: "Rename a role or change what it can do. Always locked for Super Admin." },
      { key: 'rolesDelete', label: 'Delete', description: 'Delete a custom role. Always locked for Super Admin.' },
    ],
  },
  {
    module: 'Posts',
    rows: [
      { key: 'postsWrite', label: 'Write', description: 'Create and edit drafts; submit for approval.' },
      { key: 'postsPublish', label: 'Publish', description: 'Approve, reject, retry and publish any post.' },
      { key: 'postsDelete', label: 'Delete', description: 'Delete any post outright, not just your own draft.' },
    ],
  },
  {
    module: 'Social Accounts',
    rows: [
      { key: 'socialAccountsConnect', label: 'Connect', description: 'Connect a social account or storage provider, or test credentials.' },
      { key: 'socialAccountsEdit', label: 'Edit', description: 'Re-check/sync an already-connected account; manage automated ad rules.' },
      { key: 'socialAccountsDelete', label: 'Delete', description: 'Disconnect a social account or the storage provider.' },
    ],
  },
  {
    module: 'Ads',
    rows: [
      { key: 'adsCreate', label: 'Create', description: 'Launch a new ad or ad variation.' },
      { key: 'adsEdit', label: 'Edit', description: 'Pause or resume a launched ad.' },
      { key: 'adsDelete', label: 'Delete', description: 'Delete an ad.' },
    ],
  },
  {
    module: 'Campaigns',
    rows: [
      { key: 'campaignsCreate', label: 'Create', description: 'Create a new campaign.' },
      { key: 'campaignsEdit', label: 'Edit', description: "Change a campaign's details or status." },
      { key: 'campaignsDelete', label: 'Delete', description: 'Delete a campaign.' },
    ],
  },
  {
    module: 'Reports',
    rows: [{ key: 'reportsView', label: 'View', description: 'View the Dashboard and Analytics pages.' }],
  },
  {
    module: 'Media',
    rows: [
      { key: 'mediaCreate', label: 'Create', description: 'Upload a new file or add one by link.' },
      { key: 'mediaEdit', label: 'Edit', description: 'Replace or re-crop an existing file.' },
      { key: 'mediaDelete', label: 'Delete', description: 'Delete a file from the Media Library.' },
    ],
  },
  {
    module: 'Templates',
    rows: [
      { key: 'templatesCreate', label: 'Create', description: 'Save a new ad creative template.' },
      { key: 'templatesEdit', label: 'Edit', description: 'Edit a saved template.' },
      { key: 'templatesDelete', label: 'Delete', description: 'Delete a saved template.' },
    ],
  },
  {
    module: 'Activity Logs',
    rows: [
      { key: 'activityLogsView', label: 'View', description: 'View the activity log.' },
      { key: 'activityLogsDelete', label: 'Delete', description: 'Delete activity log entries.' },
    ],
  },
  {
    module: 'Settings',
    rows: [
      { key: 'settingsView', label: 'View', description: 'View workspace, language and system email settings.' },
      { key: 'settingsEdit', label: 'Edit', description: 'Change workspace, language and system email settings.' },
    ],
  },
];

export const ROLE_PERMISSION_KEYS = ROLE_PERMISSION_GROUPS.flatMap((group) => group.rows.map((row) => row.key));

export const ROLE_ACCENTS = ['rose', 'purple', 'blue', 'teal', 'slate', 'amber'];

export function emptyPermissions() {
  return Object.fromEntries(ROLE_PERMISSION_KEYS.map((key) => [key, false]));
}
