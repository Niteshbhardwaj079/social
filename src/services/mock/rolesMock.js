import { PERMISSION_MODULES, PERMISSION_ACTIONS, USER_ROLES } from '../../config/constants';

function buildFullPermissions(actions = PERMISSION_ACTIONS) {
  return PERMISSION_MODULES.reduce((permissions, moduleName) => {
    permissions[moduleName] = actions;
    return permissions;
  }, {});
}

const rolesMock = [
  {
    id: USER_ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full access to every module, including billing and organization settings.',
    usersCount: 1,
    isSystemRole: true,
    icon: 'ShieldCheck',
    accent: 'rose',
    permissions: buildFullPermissions(),
  },
  {
    id: USER_ROLES.ADMIN,
    name: 'Admin',
    description: 'Manage users, content and settings, without billing access.',
    usersCount: 1,
    isSystemRole: true,
    icon: 'Settings2',
    accent: 'purple',
    permissions: buildFullPermissions(['View', 'Create', 'Edit', 'Delete', 'Publish']),
  },
  {
    id: USER_ROLES.EDITOR,
    name: 'Editor',
    description: 'Create, edit and publish content across all connected accounts.',
    usersCount: 1,
    isSystemRole: false,
    icon: 'PenSquare',
    accent: 'blue',
    permissions: {
      Dashboard: ['View'],
      Users: [],
      Roles: [],
      'Social Accounts': ['View'],
      Posts: ['View', 'Create', 'Edit', 'Publish'],
      Campaigns: ['View', 'Create', 'Edit'],
      Inbox: ['View', 'Manage'],
      Comments: ['View', 'Manage'],
      Analytics: ['View'],
      Media: ['View', 'Create'],
      Approvals: ['View', 'Create'],
      Settings: [],
      'Activity Logs': [],
    },
  },
  {
    id: USER_ROLES.CONTRIBUTOR,
    name: 'Contributor',
    description: 'Draft and submit content for approval; cannot publish directly.',
    usersCount: 1,
    isSystemRole: false,
    icon: 'Users',
    accent: 'teal',
    permissions: {
      Dashboard: ['View'],
      Users: [],
      Roles: [],
      'Social Accounts': ['View'],
      Posts: ['View', 'Create'],
      Campaigns: ['View'],
      Inbox: ['View'],
      Comments: ['View'],
      Analytics: [],
      Media: ['View', 'Create'],
      Approvals: ['View', 'Create'],
      Settings: [],
      'Activity Logs': [],
    },
  },
  {
    id: USER_ROLES.ANALYST,
    name: 'Analyst',
    description: 'Read-only access to analytics and reporting.',
    usersCount: 1,
    isSystemRole: false,
    icon: 'BarChart3',
    accent: 'slate',
    permissions: {
      Dashboard: ['View'],
      Users: [],
      Roles: [],
      'Social Accounts': ['View'],
      Posts: ['View'],
      Campaigns: ['View'],
      Inbox: [],
      Comments: [],
      Analytics: ['View'],
      Media: ['View'],
      Approvals: [],
      Settings: [],
      'Activity Logs': [],
    },
  },
];

export default rolesMock;
