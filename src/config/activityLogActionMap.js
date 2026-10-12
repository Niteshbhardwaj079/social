/**
 * Translates the backend's raw activity_logs rows (dot-namespaced action strings like `post.published`,
 * a raw `meta` jsonb blob) into the flat shape the Activity Logs page renders (actionType/section/target/
 * detailsKey+detailsVars). One entry per real action string that `recordActivity()` is ever called with
 * across the API — see `backend/src/services/*.js` for the source of truth. An action not listed here (only
 * possible if the backend adds a new one and this map is not updated to match) falls back to something
 * generic rather than crashing the page.
 *
 * `details()` used to return a pre-built English sentence; it now returns a translation key (resolved via
 * t() at render time, since this module runs outside React and has no access to the active language) plus
 * the interpolation vars for that key. Where the original had an English fallback word for missing data
 * (e.g. "a file", "a user"), that's now a separate key picked here rather than a hardcoded default.
 */
const map = {
  'workspace.created': { actionType: 'created', section: 'Users', target: () => 'Workspace', detailsKey: () => 'activityLogs.details.wsCreated' },
  'auth.login': { actionType: 'login', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.actions.login' },
  'auth.login_failed': { actionType: 'login_failed', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.loginFailedAttempt' },
  'auth.password_reset_requested': { actionType: 'updated', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.passwordResetRequested' },
  'auth.password_reset': { actionType: 'updated', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.passwordReset' },
  'auth.invite_accepted': { actionType: 'created', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.inviteAccepted' },
  'auth.password_changed': { actionType: 'updated', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.passwordChanged' },
  'auth.2fa_enabled': { actionType: 'enabled', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.twoFaEnabled' },
  'auth.2fa_disabled': { actionType: 'disabled', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.twoFaDisabled' },
  'auth.2fa_backup_codes_regenerated': { actionType: 'updated', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.twoFaBackupRegenerated' },
  'auth.2fa_failed': { actionType: 'login_failed', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.twoFaFailed' },
  'user.invited': {
    actionType: 'created',
    section: 'Users',
    target: (e) => e.meta?.email || '',
    detailsKey: (e) => (e.meta?.email ? (e.meta?.role ? 'activityLogs.details.userInvitedWithRole' : 'activityLogs.details.userInvitedEmail') : 'activityLogs.details.userInvitedGeneric'),
    detailsVars: (e) => ({ email: e.meta?.email, role: e.meta?.role }),
  },
  'user.updated': {
    actionType: 'updated',
    section: 'Users',
    target: () => '',
    detailsKey: (e) => (Object.keys(e.meta || {}).length ? 'activityLogs.details.userUpdatedFields' : 'activityLogs.details.userUpdatedGeneric'),
    detailsVars: (e) => ({ fields: Object.keys(e.meta || {}).join(', ') }),
  },
  'user.deleted': { actionType: 'deleted', section: 'Users', target: () => '', detailsKey: () => 'activityLogs.details.userDeleted' },
  'role.created': { actionType: 'created', section: 'Roles', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.roleCreated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'role.updated': { actionType: 'updated', section: 'Roles', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.roleUpdated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'role.deleted': { actionType: 'deleted', section: 'Roles', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.roleDeleted', detailsVars: (e) => ({ name: e.meta?.name || '' }) },

  'email.template_saved': { actionType: 'updated', section: 'System Emails', target: (e) => e.meta?.language || '', detailsKey: () => 'activityLogs.details.emailTemplateSaved', detailsVars: (e) => ({ language: e.meta?.language || '' }) },
  'email.template_reset': { actionType: 'updated', section: 'System Emails', target: (e) => e.meta?.language || '', detailsKey: () => 'activityLogs.details.emailTemplateReset', detailsVars: (e) => ({ language: e.meta?.language || '' }) },
  'email.enabled': { actionType: 'enabled', section: 'System Emails', target: () => '', detailsKey: () => 'activityLogs.details.emailEnabled' },
  'email.disabled': { actionType: 'disabled', section: 'System Emails', target: () => '', detailsKey: () => 'activityLogs.details.emailDisabled' },
  'email.image_uploaded': { actionType: 'created', section: 'System Emails', target: () => '', detailsKey: () => 'activityLogs.details.emailImageUploaded' },
  'email.image_removed': { actionType: 'deleted', section: 'System Emails', target: () => '', detailsKey: () => 'activityLogs.details.emailImageRemoved' },

  'settings.languages_updated': { actionType: 'updated', section: 'Settings', target: () => 'Languages', detailsKey: () => 'activityLogs.details.settingsLanguagesUpdated' },
  'settings.workspace_updated': { actionType: 'updated', section: 'Settings', target: () => 'Workspace', detailsKey: () => 'activityLogs.details.settingsWorkspaceUpdated' },

  'media.uploaded': { actionType: 'created', section: 'Media Library', target: (e) => e.meta?.name || '', detailsKey: (e) => (e.meta?.name ? 'activityLogs.details.mediaUploadedNamed' : 'activityLogs.details.mediaUploadedGeneric'), detailsVars: (e) => ({ name: e.meta?.name }) },
  'media.linked': { actionType: 'created', section: 'Media Library', target: (e) => e.meta?.name || '', detailsKey: (e) => (e.meta?.name ? 'activityLogs.details.mediaLinkedNamed' : 'activityLogs.details.mediaLinkedGeneric'), detailsVars: (e) => ({ name: e.meta?.name }) },
  'media.replaced': { actionType: 'updated', section: 'Media Library', target: (e) => e.meta?.name || '', detailsKey: (e) => (e.meta?.name ? 'activityLogs.details.mediaReplacedNamed' : 'activityLogs.details.mediaReplacedGeneric'), detailsVars: (e) => ({ name: e.meta?.name }) },
  'media.deleted': { actionType: 'deleted', section: 'Media Library', target: (e) => e.meta?.name || '', detailsKey: (e) => (e.meta?.name ? 'activityLogs.details.mediaDeletedNamed' : 'activityLogs.details.mediaDeletedGeneric'), detailsVars: (e) => ({ name: e.meta?.name }) },

  'campaign.created': { actionType: 'created', section: 'Campaigns', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.campaignCreated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'campaign.updated': { actionType: 'updated', section: 'Campaigns', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.campaignUpdated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'campaign.deleted': { actionType: 'deleted', section: 'Campaigns', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.campaignDeleted', detailsVars: (e) => ({ name: e.meta?.name || '' }) },

  'ads.accounts_synced': { actionType: 'synced', section: 'Ads', target: () => 'Ad accounts', detailsKey: () => 'activityLogs.details.adsAccountsSynced', detailsVars: (e) => ({ found: e.meta?.found ?? 0 }) },
  'ads.launched': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsLaunched', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.boosted_post': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsBoostedPost', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.saved_draft': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsSavedDraft', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.bulk_launched': { actionType: 'launched', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsBulkLaunched', detailsVars: (e) => ({ count: e.meta?.count ?? '', name: e.meta?.name || '' }) },
  'ads.bulk_saved_draft': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsBulkSavedDraft', detailsVars: (e) => ({ count: e.meta?.count ?? '', name: e.meta?.name || '' }) },
  'ads.paused': { actionType: 'paused', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsPaused', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.resumed': { actionType: 'resumed', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsResumed', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsDeleted', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.template_saved': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsTemplateSaved', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.template_updated': { actionType: 'updated', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsTemplateUpdated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.template_deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsTemplateDeleted', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.rule_created': { actionType: 'created', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsRuleCreated', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.rule_updated': {
    actionType: 'updated',
    section: 'Ads',
    target: (e) => e.meta?.name || '',
    detailsKey: (e) => (e.meta?.isActive === false ? 'activityLogs.details.adsRuleUpdatedOff' : 'activityLogs.details.adsRuleUpdated'),
    detailsVars: (e) => ({ name: e.meta?.name || '' }),
  },
  'ads.rule_deleted': { actionType: 'deleted', section: 'Ads', target: (e) => e.meta?.name || '', detailsKey: () => 'activityLogs.details.adsRuleDeleted', detailsVars: (e) => ({ name: e.meta?.name || '' }) },
  'ads.rule_fired': {
    actionType: 'automated',
    section: 'Ads',
    target: (e) => e.meta?.ruleName || '',
    detailsKey: (e) => (e.meta?.ruleAction === 'pause' ? 'activityLogs.details.adsRuleFiredPause' : 'activityLogs.details.adsRuleFiredResume'),
    detailsVars: (e) => ({
      ruleName: e.meta?.ruleName || '',
      metric: e.meta?.metric,
      comparator: e.meta?.comparator === 'gt' ? '>' : '<',
      threshold: e.meta?.threshold,
    }),
  },

  'storage.connected': { actionType: 'connected', section: 'Storage', target: (e) => e.entityId || '', detailsKey: (e) => (e.entityId ? 'activityLogs.details.storageConnectedNamed' : 'activityLogs.details.storageConnectedGeneric'), detailsVars: (e) => ({ provider: e.entityId }) },
  'storage.disconnected': { actionType: 'disconnected', section: 'Storage', target: () => '', detailsKey: () => 'activityLogs.details.storageDisconnected' },
  'storage.preferences_updated': { actionType: 'updated', section: 'Storage', target: () => '', detailsKey: () => 'activityLogs.details.storagePreferencesUpdated' },

  'post.created': { actionType: 'created', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postCreated', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.updated': { actionType: 'updated', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postUpdated', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.deleted': { actionType: 'deleted', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postDeleted', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.approved': { actionType: 'approved', section: 'Approvals', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postApproved', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.rejected': {
    actionType: 'rejected',
    section: 'Approvals',
    target: (e) => e.meta?.snippet || '',
    detailsKey: (e) => (e.meta?.reason ? 'activityLogs.details.postRejectedWithReason' : 'activityLogs.details.postRejected'),
    detailsVars: (e) => ({ snippet: e.meta?.snippet || '', reason: e.meta?.reason }),
  },
  'post.published': { actionType: 'published', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postPublished', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.failed': { actionType: 'failed', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postFailed', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'post.retried': { actionType: 'retried', section: 'Posts', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.postRetried', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },

  'recycling.added': { actionType: 'created', section: 'Content Recycling', target: (e) => e.meta?.snippet || '', detailsKey: () => 'activityLogs.details.recyclingAdded', detailsVars: (e) => ({ snippet: e.meta?.snippet || '' }) },
  'recycling.updated': {
    actionType: 'updated',
    section: 'Content Recycling',
    target: () => '',
    detailsKey: (e) => (e.meta?.bulk ? (e.meta.count === 1 ? 'activityLogs.details.recyclingUpdatedBulkOne' : 'activityLogs.details.recyclingUpdatedBulkOther') : 'activityLogs.details.recyclingUpdatedSingle'),
    detailsVars: (e) => ({ count: e.meta?.count }),
  },
  'recycling.removed': {
    actionType: 'deleted',
    section: 'Content Recycling',
    target: () => '',
    detailsKey: (e) => (e.meta?.bulk ? (e.meta.count === 1 ? 'activityLogs.details.recyclingRemovedBulkOne' : 'activityLogs.details.recyclingRemovedBulkOther') : 'activityLogs.details.recyclingRemovedSingle'),
    detailsVars: (e) => ({ count: e.meta?.count }),
  },
  'recycling.reposted': { actionType: 'published', section: 'Content Recycling', target: () => '', detailsKey: () => 'activityLogs.details.recyclingReposted' },

  'social.connected': {
    actionType: 'connected',
    section: 'Social Accounts',
    target: (e) => e.entityId || '',
    detailsKey: (e) => (e.meta?.accountName ? 'activityLogs.details.socialConnectedNamed' : 'activityLogs.details.socialConnectedGeneric'),
    detailsVars: (e) => ({ entityId: e.entityId, accountName: e.meta?.accountName }),
  },
  'social.disconnected': { actionType: 'disconnected', section: 'Social Accounts', target: (e) => e.entityId || '', detailsKey: () => 'activityLogs.details.socialDisconnected', detailsVars: (e) => ({ entityId: e.entityId }) },
  'social.token_expired': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', detailsKey: () => 'activityLogs.details.socialTokenExpired' },
  'social.revoked': { actionType: 'needs_attention', section: 'Social Accounts', target: (e) => e.entityId || '', detailsKey: () => 'activityLogs.details.socialRevoked' },
  'social.auth_error': {
    actionType: 'needs_attention',
    section: 'Social Accounts',
    target: (e) => e.entityId || '',
    detailsKey: () => 'activityLogs.details.socialAuthErrorGeneric',
    rawDetails: (e) => e.meta?.message || null,
  },
  'social.error': {
    actionType: 'needs_attention',
    section: 'Social Accounts',
    target: (e) => e.entityId || '',
    detailsKey: () => 'activityLogs.details.socialErrorGeneric',
    rawDetails: (e) => e.meta?.message || null,
  },
};

const fallback = { actionType: 'updated', section: 'Settings', target: () => '', rawDetails: (e) => e.action };

/**
 * Maps one raw backend activity_logs row into the flat shape ActivityLogs.jsx expects. `details` carries a
 * raw, already-final string only for the handful of entries whose text comes straight from the backend/platform
 * (an API error message, an unmapped raw action string) and can't be a translation key; otherwise it's null and
 * the page resolves `detailsKey`/`detailsVars` via t() at render time.
 */
export function mapActivityLogEntry(entry) {
  const rule = map[entry.action] || fallback;
  const rawDetails = rule.rawDetails ? rule.rawDetails(entry) : null;
  return {
    id: String(entry.id),
    user: entry.actor?.name || '',
    actionType: rule.actionType,
    section: rule.section,
    target: rule.target(entry),
    details: rawDetails,
    detailsKey: rawDetails ? null : rule.detailsKey ? rule.detailsKey(entry) : null,
    detailsVars: rule.detailsVars ? rule.detailsVars(entry) : undefined,
    time: entry.createdAt,
    device: entry.device || '',
    ip: entry.ip || '',
  };
}
