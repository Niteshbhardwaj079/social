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
      { labelKey: 'nav.recycling', path: '/recycling', icon: 'Repeat2', feature: 'recycling' },
    ],
  },
  {
    // Shown unless the platform owner switched AI off-and-hidden (aiAccess.visible); locked when the plan lacks it.
    sectionKey: 'nav.aiSection',
    aiOnly: true,
    items: [{ labelKey: 'nav.aiStudio', path: '/ai', icon: 'Sparkles', feature: 'ai' }],
  },
  {
    sectionKey: 'nav.advertising',
    items: [{ labelKey: 'nav.ads', path: '/ads', icon: 'Target', feature: 'ads' }],
  },
  {
    sectionKey: 'nav.engagement',
    items: [
      { labelKey: 'nav.inbox', path: '/inbox', icon: 'Inbox', feature: 'inbox' },
      { labelKey: 'nav.comments', path: '/inbox/comments', icon: 'MessageSquare', feature: 'inbox' },
      { labelKey: 'nav.mentions', path: '/inbox/mentions', icon: 'AtSign', feature: 'inbox' },
    ],
  },
  {
    sectionKey: 'nav.analytics',
    items: [
      { labelKey: 'nav.analyticsOverview', path: '/analytics', icon: 'BarChart3', feature: 'analytics' },
      { labelKey: 'nav.contentAnalytics', path: '/analytics/content', icon: 'PieChart', feature: 'analytics' },
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
      { labelKey: 'nav.linkShortener', path: '/links', icon: 'Link2', feature: 'links' },
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
    // Only the platform owner (the person running this SaaS) sees this section.
    sectionKey: 'nav.platform',
    platformOnly: true,
    items: [{ labelKey: 'nav.platformAdmin', path: '/platform/overview', icon: 'Building2' }],
  },
  {
    section: null,
    items: [
      { labelKey: 'nav.billing', path: '/billing', icon: 'CreditCard' },
      { labelKey: 'nav.guide', path: '/guide', icon: 'BookOpen' },
      { labelKey: 'nav.settings', path: '/settings', icon: 'Settings' },
    ],
  },
];

/**
 * SaaS plans: an item with `feature` is locked when the organization's plan does not include that
 * module (the server refuses it too). Locked items stay visible and lead to Billing → Plans.
 */
export function isFeatureLocked(item, plan) {
  return Boolean(item.feature && plan?.features && plan.features[item.feature] === false);
}

export const BOTTOM_NAVIGATION = [
  { labelKey: 'nav.home', path: '/dashboard', icon: 'Home' },
  { labelKey: 'nav.calendar', path: '/calendar', icon: 'CalendarDays' },
  { labelKey: 'nav.create', path: '/posts/create', icon: 'PlusCircle', isPrimary: true },
  { labelKey: 'nav.inbox', path: '/inbox', icon: 'Inbox' },
  { labelKey: 'nav.more', path: '/more', icon: 'Menu' },
];
