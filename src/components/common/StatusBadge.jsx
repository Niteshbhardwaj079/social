import { useI18n } from '../../i18n/useI18n';

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
  const { t } = useI18n();
  const modifier = STATUS_MODIFIER_MAP[status] || 'draft';
  const text = label || t(`common.status.${status}`);

  return <span className={`status-badge status-badge--${modifier}`}>{text}</span>;
}

export default StatusBadge;
