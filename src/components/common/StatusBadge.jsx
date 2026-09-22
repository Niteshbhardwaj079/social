import {
  POST_STATUS_LABELS,
  APPROVAL_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  ACCOUNT_STATUS_LABELS,
} from '../../config/constants';

const STATUS_LABEL_MAPS = {
  ...POST_STATUS_LABELS,
  ...APPROVAL_STATUS_LABELS,
  ...CAMPAIGN_STATUS_LABELS,
  ...ACCOUNT_STATUS_LABELS,
};

const STATUS_MODIFIER_MAP = {
  draft: 'draft',
  scheduled: 'scheduled',
  publishing: 'pending',
  published: 'published',
  active: 'published',
  approved: 'published',
  connected: 'connected',
  failed: 'failed',
  rejected: 'rejected',
  pendingApproval: 'pending',
  submitted: 'pending',
  underReview: 'pending',
  revision: 'pending',
  disconnected: 'disconnected',
  token_expired: 'failed',
  revoked: 'failed',
  auth_error: 'failed',
  error: 'failed',
  paused: 'draft',
  completed: 'published',
  inReview: 'pending',
};

function StatusBadge({ status, label }) {
  const modifier = STATUS_MODIFIER_MAP[status] || 'draft';
  const text = label || STATUS_LABEL_MAPS[status] || status;

  return <span className={`status-badge status-badge--${modifier}`}>{text}</span>;
}

export default StatusBadge;
