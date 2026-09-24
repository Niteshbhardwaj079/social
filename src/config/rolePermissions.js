// Every one of these keys is read by a real permission check on the backend (see
// backend/src/services/permissions.js) — this list intentionally does NOT try to cover every
// screen in the app at a "View/Create/Edit/Delete" granularity the backend doesn't actually
// enforce; each row here gates something real.
export const ROLE_PERMISSION_GROUPS = [
  {
    module: 'Users',
    rows: [{ key: 'usersManage', label: 'Manage users', description: 'Invite, edit and remove people; change their role.' }],
  },
  {
    module: 'Roles',
    rows: [
      {
        key: 'rolesManage',
        label: 'Manage roles',
        description: 'Create, edit and delete custom roles. Always locked for the Super Admin role itself.',
      },
    ],
  },
  {
    module: 'Posts',
    rows: [
      { key: 'postsWrite', label: 'Write', description: 'Create and edit drafts; submit for approval.' },
      { key: 'postsPublish', label: 'Publish', description: 'Approve, reject, retry and publish any post.' },
    ],
  },
  {
    module: 'Social Accounts',
    rows: [
      {
        key: 'socialAccountsManage',
        label: 'Manage',
        description: 'Connect and disconnect social accounts and the storage provider; sync ad accounts.',
      },
    ],
  },
  {
    module: 'Ads',
    rows: [{ key: 'adsManage', label: 'Manage', description: 'Create, launch, pause and delete ads; manage automated rules.' }],
  },
  {
    module: 'Campaigns',
    rows: [{ key: 'campaignsManage', label: 'Manage', description: 'Create, edit and delete campaigns.' }],
  },
  {
    module: 'Reports',
    rows: [{ key: 'reportsView', label: 'View', description: 'View the Dashboard and Analytics pages.' }],
  },
  {
    module: 'Media',
    rows: [{ key: 'mediaManage', label: 'Manage', description: 'Upload, replace and delete media library files.' }],
  },
  {
    module: 'Templates',
    rows: [{ key: 'templatesManage', label: 'Manage', description: 'Save, edit and delete ad creative templates.' }],
  },
  {
    module: 'Activity Logs',
    rows: [{ key: 'activityLogsManage', label: 'Manage', description: 'View and delete activity log entries.' }],
  },
  {
    module: 'Settings',
    rows: [{ key: 'settingsManage', label: 'Manage', description: 'Workspace settings and system email templates.' }],
  },
];

export const ROLE_PERMISSION_KEYS = ROLE_PERMISSION_GROUPS.flatMap((group) => group.rows.map((row) => row.key));

export const ROLE_ACCENTS = ['rose', 'purple', 'blue', 'teal', 'slate', 'amber'];

export function emptyPermissions() {
  return Object.fromEntries(ROLE_PERMISSION_KEYS.map((key) => [key, false]));
}
