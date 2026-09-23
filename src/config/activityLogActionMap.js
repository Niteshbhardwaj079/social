/**
 * Translates the backend's raw activity_logs rows (dot-namespaced action strings like `post.published`,
 * a raw `meta` jsonb blob) into the flat shape the Activity Logs page renders (actionType/section/target/
 * details). One entry per real action string that `recordActivity()` is ever called with across the API —
 * see `backend/src/services/*.js` for the source of truth. An action not listed here (only possible if the
 * backend adds a new one and this map is not updated to match) falls back to something generic rather than
 * crashing the page.
 */
const map = {
  'workspace.created': { actionType: 'created', section: 'Users', target: () => 'Workspace', details: () => 'Created the workspace and became the first Super Admin' },
  'auth.login': { actionType: 'login', section: 'Users', target: () => '', details: () => 'Signed in' },
  'auth.login_failed': { actionType: 'login_failed', section: 'Users', target: () => '', details: () => 'Failed sign-in attempt' },
  'auth.password_reset_requested': { actionType: 'updated', section: 'Users', target: () => '', details: () => 'Requested a password reset link' },
  'auth.password_reset': { actionType: 'updated', section: 'Users', target: () => '', details: () => 'Reset their password using the emailed link' },
  'auth.invite_accepted': { actionType: 'created', section: 'Users', target: () => '', details: () => 'Accepted their invitation and set a password' },
  'auth.password_changed': { actionType: 'updated', section: 'Users', target: () => '', details: () => 'Changed their password' },
  'user.invited': { actionType: 'created', section: 'Users', target: (e) => e.meta?.email || '', details: (e) => `Invited ${e.meta?.email || 'a user'}${e.meta?.role ? ` as ${e.meta.role}` : ''}` },
  'user.updated': { actionType: 'updated', section: 'Users', target: () => '', details: (e) => `Updated: ${Object.keys(e.meta || {}).join(', ') || 'profile'}` },
  'user.deleted': { actionType: 'deleted', section: 'Users', target: () => '', details: () => 'Removed a user account' },

  'email.template_saved': { actionType: 'updated', section: 'System Emails', target: (e) => e.meta?.language || '', details: (e) => `Saved the ${e.meta?.language || ''} translation` },
  'email.template_reset': { actionType: 'updated', section: 'System Emails', target: (e) => e.meta?.language || '', details: (e) => `Reset the ${e.meta?.language || ''} translation to default` },
  'email.enabled': { actionType: 'enabled', section: 'System Emails', target: () => '', details: () => 'Turned this email on' },
  'email.disabled': { actionType: 'disabled', section: 'System Emails', target: () => '', details: () => 'Turned this email off' },
  'email.image_uploaded': { actionType: 'created', section: 'System Emails', target: () => '', details: () => 'Uploaded an image for this email' },
  'email.image_removed': { actionType: 'deleted', section: 'System Emails', target: () => '', details: () => 'Removed an image from this email' },

  'settings.languages_updated': { actionType: 'updated', section: 'Settings', target: () => 'Languages', details: () => 'Updated enabled languages' },
  'settings.workspace_updated': { actionType: 'updated', section: 'Settings', target: () => 'Workspace', details: () => 'Updated workspace details' },

  'media.uploaded': { actionType: 'created', section: 'Media Library', target: (e) => e.meta?.name || '', details: (e) => `Uploaded ${e.meta?.name || 'a file'}` },
  'media.linked': { actionType: 'created', section: 'Media Library', target: (e) => e.meta?.name || '', details: (e) => `Linked ${e.meta?.name || 'an external image'}` },
  'media.replaced': { actionType: 'updated', section: 'Media Library', target: (e) => e.meta?.name || '', details: (e) => `Replaced ${e.meta?.name || 'a file'}` },
  'media.deleted': { actionType: 'deleted', section: 'Media Library', target: (e) => e.meta?.name || '', details: (e) => `Deleted ${e.meta?.name || 'a file'}` },

  'campaign.created': { actionType: 'created', section: 'Campaigns', target: (e) => e.meta?.name || '', details: (e) => `Created campaign "${e.meta?.name || ''}"` },
  'campaign.updated': { actionType: 'updated', section: 'Campaigns', target: (e) => e.meta?.name || '', details: (e) => `Updated campaign "${e.meta?.name || ''}"` },
  'campaign.deleted': { actionType: 'deleted', section: 'Campaigns', target: (e) => e.meta?.name || '', details: (e) => `Deleted campaign "${e.meta?.name || ''}"` },

  'ads.accounts_synced': { actionType: 'synced', section: 'Ads', target: () => 'Ad accounts', details: (e) => `Synced ad accounts — found ${e.meta?.found ?? 0}` },
  'ads.launched': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Launched ad "${e.meta?.name || ''}"` },
  'ads.boosted_post': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Boosted an existing post as "${e.meta?.name || ''}"` },
  'ads.saved_draft': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Saved ad draft "${e.meta?.name || ''}"` },
  'ads.bulk_launched': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Launched ${e.meta?.count ?? ''} ad variations for "${e.meta?.name || ''}"` },
  'ads.bulk_saved_draft': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Saved ${e.meta?.count ?? ''} ad variations as drafts for "${e.meta?.name || ''}"` },
  'ads.paused': { actionType: 'paused', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Paused "${e.meta?.name || ''}"` },
  'ads.resumed': { actionType: 'resumed', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Resumed "${e.meta?.name || ''}"` },
  'ads.deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Deleted "${e.meta?.name || ''}"` },
  'ads.template_saved': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Saved creative template "${e.meta?.name || ''}"` },
  'ads.template_updated': { actionType: 'updated', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Updated creative template "${e.meta?.name || ''}"` },
  'ads.template_deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Deleted creative template "${e.meta?.name || ''}"` },
  'ads.rule_created': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Created automated rule "${e.meta?.name || ''}"` },
  'ads.rule_updated': { actionType: 'updated', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Updated automated rule "${e.meta?.name || ''}"${e.meta?.isActive === false ? ' (turned off)' : ''}` },
  'ads.rule_deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', details: (e) => `Deleted automated rule "${e.meta?.name || ''}"` },
  'ads.rule_fired': {
    actionType: 'automated',
    section: 'Ads',
    target: (e) => e.meta?.ruleName || '',
    details: (e) => `Rule "${e.meta?.ruleName || ''}" ${e.meta?.ruleAction === 'pause' ? 'paused' : 'resumed'} an ad (${e.meta?.metric} ${e.meta?.comparator === 'gt' ? '>' : '<'} ${e.meta?.threshold})`,
  },

  'storage.connected': { actionType: 'connected', section: 'Storage', target: (e) => e.entityId || '', details: (e) => `Connected ${e.entityId || 'a storage provider'}` },
  'storage.disconnected': { actionType: 'disconnected', section: 'Storage', target: () => '', details: () => 'Disconnected the storage provider' },
  'storage.preferences_updated': { actionType: 'updated', section: 'Storage', target: () => '', details: () => 'Updated storage preferences' },

  'post.created': { actionType: 'created', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Created a post: "${e.meta?.snippet || ''}"` },
  'post.updated': { actionType: 'updated', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Updated a post: "${e.meta?.snippet || ''}"` },
  'post.deleted': { actionType: 'deleted', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Deleted a post: "${e.meta?.snippet || ''}"` },
  'post.approved': { actionType: 'approved', section: 'Approvals', target: (e) => e.meta?.snippet || '', details: (e) => `Approved: "${e.meta?.snippet || ''}"` },
  'post.rejected': { actionType: 'rejected', section: 'Approvals', target: (e) => e.meta?.snippet || '', details: (e) => `Rejected: "${e.meta?.snippet || ''}"${e.meta?.reason ? ` — ${e.meta.reason}` : ''}` },
  'post.published': { actionType: 'published', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Published: "${e.meta?.snippet || ''}"` },
  'post.failed': { actionType: 'failed', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Failed to publish: "${e.meta?.snippet || ''}"` },
  'post.retried': { actionType: 'retried', section: 'Posts', target: (e) => e.meta?.snippet || '', details: (e) => `Retried: "${e.meta?.snippet || ''}"` },

  'recycling.added': { actionType: 'created', section: 'Content Recycling', target: (e) => e.meta?.snippet || '', details: (e) => `Added to recycling: "${e.meta?.snippet || ''}"` },
  'recycling.updated': {
    actionType: 'updated',
    section: 'Content Recycling',
    target: () => '',
    details: (e) => (e.meta?.bulk ? `Updated ${e.meta.count} recycling ${e.meta.count === 1 ? 'entry' : 'entries'}` : 'Updated a recycling entry'),
  },
  'recycling.removed': {
    actionType: 'deleted',
    section: 'Content Recycling',
    target: () => '',
    details: (e) => (e.meta?.bulk ? `Removed ${e.meta.count} recycling ${e.meta.count === 1 ? 'entry' : 'entries'}` : 'Removed a recycling entry'),
  },
  'recycling.reposted': { actionType: 'published', section: 'Content Recycling', target: () => '', details: () => 'Automatically reposted a recycled post' },

  'social.connected': { actionType: 'connected', section: 'Social Accounts', target: (e) => e.entityId || '', details: (e) => `Connected ${e.entityId}${e.meta?.accountName ? ` (${e.meta.accountName})` : ''}` },
  'social.disconnected': { actionType: 'disconnected', section: 'Social Accounts', target: (e) => e.entityId || '', details: (e) => `Disconnected ${e.entityId}` },
  'social.token_expired': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', details: () => 'Token expired — needs reconnecting' },
  'social.revoked': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', details: () => 'Access was revoked — needs reconnecting' },
  'social.auth_error': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', details: (e) => e.meta?.message || 'The platform refused the saved credentials' },
  'social.error': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', details: (e) => e.meta?.message || 'This account needs attention' },
};

const fallback = { actionType: 'updated', section: 'Settings', target: () => '', details: (e) => e.action };

/** Maps one raw backend activity_logs row into the flat shape ActivityLogs.jsx expects. */
export function mapActivityLogEntry(entry) {
  const rule = map[entry.action] || fallback;
  return {
    id: String(entry.id),
    user: entry.actor?.name || 'System',
    actionType: rule.actionType,
    section: rule.section,
    target: rule.target(entry),
    details: rule.details(entry),
    time: entry.createdAt,
    device: entry.device || '',
    ip: entry.ip || '',
  };
}
