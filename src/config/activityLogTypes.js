export const ACTIVITY_ACTION_META = {
  created: { label: 'Created', icon: 'PlusCircle', accent: 'teal' },
  updated: { label: 'Updated', icon: 'PenSquare', accent: 'blue' },
  deleted: { label: 'Deleted', icon: 'Trash2', accent: 'rose' },
  connected: { label: 'Connected', icon: 'Share2', accent: 'teal' },
  disconnected: { label: 'Disconnected', icon: 'Unlink', accent: 'slate' },
  approved: { label: 'Approved', icon: 'CheckCircle2', accent: 'teal' },
  rejected: { label: 'Rejected', icon: 'XCircle', accent: 'rose' },
  scheduled: { label: 'Scheduled', icon: 'CalendarClock', accent: 'purple' },
  published: { label: 'Published', icon: 'Send', accent: 'blue' },
  failed: { label: 'Failed', icon: 'AlertTriangle', accent: 'rose' },
  retried: { label: 'Retried', icon: 'RotateCw', accent: 'purple' },
  login: { label: 'Signed in', icon: 'LogIn', accent: 'teal' },
  login_failed: { label: 'Login failed', icon: 'ShieldAlert', accent: 'rose' },
  enabled: { label: 'Enabled', icon: 'ToggleRight', accent: 'teal' },
  disabled: { label: 'Disabled', icon: 'ToggleLeft', accent: 'slate' },
  needs_attention: { label: 'Needs attention', icon: 'AlertTriangle', accent: 'rose' },
  launched: { label: 'Launched', icon: 'Rocket', accent: 'blue' },
  paused: { label: 'Paused', icon: 'PauseCircle', accent: 'slate' },
  resumed: { label: 'Resumed', icon: 'PlayCircle', accent: 'teal' },
  synced: { label: 'Synced', icon: 'RefreshCw', accent: 'blue' },
};

export const ACTIVITY_SECTIONS = [
  'Campaigns',
  'Ads',
  'Social Accounts',
  'Approvals',
  'Posts',
  'Users',
  'Roles',
  'Media Library',
  'Content Recycling',
  'Storage',
  'System Emails',
  'Settings',
];

export const ACTIVITY_DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];
