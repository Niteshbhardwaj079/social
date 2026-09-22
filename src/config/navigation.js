/**
 * Central navigation registry for the dashboard sidebar and the mobile
 * bottom nav. `labelKey` / `sectionKey` are i18n keys (see i18n/locales/en.js). `icon` values are lucide-react component names, resolved by
 * the Sidebar / BottomNav components so the icon set stays in one place.
 */
export const SIDEBAR_NAVIGATION = [
  {
    section: null,
    items: [{ labelKey: 'nav.dashboard', path: '/dashboard', icon: 'LayoutDashboard' }],
  },
  {
    sectionKey: 'nav.publishing',
    items: [
      { labelKey: 'nav.createPost', path: '/posts/create', icon: 'PenSquare' },
      { labelKey: 'nav.posts', path: '/posts', icon: 'FileText' },
      { labelKey: 'nav.calendar', path: '/calendar', icon: 'CalendarDays' },
      { labelKey: 'nav.campaigns', path: '/campaigns', icon: 'Megaphone' },
      { labelKey: 'nav.recycling', path: '/recycling', icon: 'Repeat2' },
    ],
  },
  {
    sectionKey: 'nav.advertising',
    items: [{ labelKey: 'nav.ads', path: '/ads', icon: 'Target' }],
  },
  {
    sectionKey: 'nav.engagement',
    items: [
      { labelKey: 'nav.inbox', path: '/inbox', icon: 'Inbox' },
      { labelKey: 'nav.comments', path: '/inbox/comments', icon: 'MessageSquare' },
      { labelKey: 'nav.mentions', path: '/inbox/mentions', icon: 'AtSign' },
    ],
  },
  {
    sectionKey: 'nav.analytics',
    items: [
      { labelKey: 'nav.analyticsOverview', path: '/analytics', icon: 'BarChart3' },
      { labelKey: 'nav.contentAnalytics', path: '/analytics/content', icon: 'PieChart' },
    ],
  },
  {
    sectionKey: 'nav.accounts',
    items: [{ labelKey: 'nav.socialAccounts', path: '/social-accounts', icon: 'Share2' }],
  },
  {
    sectionKey: 'nav.management',
    items: [
      { labelKey: 'nav.approvals', path: '/approvals', icon: 'CheckSquare' },
      { labelKey: 'nav.mediaLibrary', path: '/media', icon: 'Images' },
      { labelKey: 'nav.linkShortener', path: '/links', icon: 'Link2' },
    ],
  },
  {
    sectionKey: 'nav.administration',
    items: [
      { labelKey: 'nav.usersRoles', path: '/users', icon: 'Users' },
      { labelKey: 'nav.activityLogs', path: '/activity-logs', icon: 'History' },
      { labelKey: 'nav.systemEmails', path: '/system-emails', icon: 'MailCheck' },
    ],
  },
  {
    section: null,
    items: [
      { labelKey: 'nav.guide', path: '/guide', icon: 'BookOpen' },
      { labelKey: 'nav.settings', path: '/settings', icon: 'Settings' },
    ],
  },
];

export const BOTTOM_NAVIGATION = [
  { labelKey: 'nav.home', path: '/dashboard', icon: 'Home' },
  { labelKey: 'nav.calendar', path: '/calendar', icon: 'CalendarDays' },
  { labelKey: 'nav.create', path: '/posts/create', icon: 'PlusCircle', isPrimary: true },
  { labelKey: 'nav.inbox', path: '/inbox', icon: 'Inbox' },
  { labelKey: 'nav.more', path: '/more', icon: 'Menu' },
];
