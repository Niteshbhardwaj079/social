/**
 * Application-wide constants. Components must reference these instead of
 * hard-coded strings/numbers so status and permission checks stay readable.
 */

export const POST_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  PENDING_APPROVAL: 'pendingApproval',
  REJECTED: 'rejected',
};

export const POST_STATUS_LABELS = {
  [POST_STATUS.DRAFT]: 'Draft',
  [POST_STATUS.SCHEDULED]: 'Scheduled',
  [POST_STATUS.PUBLISHING]: 'Publishing',
  [POST_STATUS.PUBLISHED]: 'Published',
  [POST_STATUS.FAILED]: 'Failed',
  [POST_STATUS.PENDING_APPROVAL]: 'Pending Approval',
  [POST_STATUS.REJECTED]: 'Rejected',
};

export const APPROVAL_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'underReview',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISION: 'revision',
};

export const APPROVAL_STATUS_LABELS = {
  [APPROVAL_STATUS.DRAFT]: 'Draft',
  [APPROVAL_STATUS.SUBMITTED]: 'Submitted',
  [APPROVAL_STATUS.UNDER_REVIEW]: 'Under Review',
  [APPROVAL_STATUS.APPROVED]: 'Approved',
  [APPROVAL_STATUS.REJECTED]: 'Rejected',
  [APPROVAL_STATUS.REVISION]: 'Needs Revision',
};

export const CAMPAIGN_STATUS = {
  ACTIVE: 'active',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  PAUSED: 'paused',
};

export const CAMPAIGN_STATUS_LABELS = {
  [CAMPAIGN_STATUS.ACTIVE]: 'Active',
  [CAMPAIGN_STATUS.SCHEDULED]: 'Scheduled',
  [CAMPAIGN_STATUS.COMPLETED]: 'Completed',
  [CAMPAIGN_STATUS.PAUSED]: 'Paused',
};

export const ACCOUNT_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected', // only ever set by the user clicking Disconnect — never by a health check
  TOKEN_EXPIRED: 'token_expired',
  REVOKED: 'revoked',
  AUTH_ERROR: 'auth_error',
  ERROR: 'error',
};

export const ACCOUNT_STATUS_LABELS = {
  [ACCOUNT_STATUS.CONNECTED]: 'Connected',
  [ACCOUNT_STATUS.DISCONNECTED]: 'Not Connected',
  [ACCOUNT_STATUS.TOKEN_EXPIRED]: 'Token Expired',
  [ACCOUNT_STATUS.REVOKED]: 'Access Revoked',
  [ACCOUNT_STATUS.AUTH_ERROR]: 'Authentication Error',
  [ACCOUNT_STATUS.ERROR]: 'Connection Error',
};

/** The statuses grouped as "Needs Attention" — a real health-check finding, never a manual disconnect. */
export const ACCOUNT_STATUS_NEEDS_ATTENTION = [
  ACCOUNT_STATUS.TOKEN_EXPIRED,
  ACCOUNT_STATUS.REVOKED,
  ACCOUNT_STATUS.AUTH_ERROR,
  ACCOUNT_STATUS.ERROR,
];

export const USER_ROLES = {
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  EDITOR: 'editor',
  CONTRIBUTOR: 'contributor',
  ANALYST: 'analyst',
};

export const USER_ROLE_LABELS = {
  [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
  [USER_ROLES.ADMIN]: 'Admin',
  [USER_ROLES.EDITOR]: 'Editor',
  [USER_ROLES.CONTRIBUTOR]: 'Contributor',
  [USER_ROLES.ANALYST]: 'Analyst',
};

export const USER_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  INVITED: 'invited',
};

export const CONVERSATION_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  CLOSED: 'closed',
};

export const NOTIFICATION_TYPE = {
  POST_PUBLISHED: 'postPublished',
  POST_FAILED: 'postFailed',
  APPROVAL_REQUESTED: 'approvalRequested',
  APPROVAL_COMPLETED: 'approvalCompleted',
  NEW_MESSAGE: 'newMessage',
  NEW_COMMENT: 'newComment',
  ACCOUNT_DISCONNECTED: 'accountDisconnected',
  TOKEN_EXPIRED: 'tokenExpired',
  ACCOUNT_REVOKED: 'accountRevoked',
  ACCOUNT_NEEDS_ATTENTION: 'accountNeedsAttention',
};

export const DATE_RANGE_PRESETS = {
  LAST_7_DAYS: '7d',
  LAST_30_DAYS: '30d',
  LAST_90_DAYS: '90d',
  CUSTOM: 'custom',
};

export const DATE_RANGE_PRESET_LABELS = {
  [DATE_RANGE_PRESETS.LAST_7_DAYS]: '7 Days',
  [DATE_RANGE_PRESETS.LAST_30_DAYS]: '30 Days',
  [DATE_RANGE_PRESETS.LAST_90_DAYS]: '90 Days',
  [DATE_RANGE_PRESETS.CUSTOM]: 'Custom',
};

export const CALENDAR_VIEW = {
  MONTH: 'month',
  WEEK: 'week',
  AGENDA: 'agenda',
};

export const MEDIA_TYPE = {
  IMAGE: 'image',
  VIDEO: 'video',
};

export const REQUEST_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
};
