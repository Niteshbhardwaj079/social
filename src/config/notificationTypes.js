import { NOTIFICATION_TYPE } from './constants';

export const NOTIFICATION_TYPE_META = {
  [NOTIFICATION_TYPE.POST_PUBLISHED]: { icon: 'CheckCircle2', accent: 'teal' },
  [NOTIFICATION_TYPE.POST_FAILED]: { icon: 'XCircle', accent: 'rose' },
  [NOTIFICATION_TYPE.APPROVAL_REQUESTED]: { icon: 'Clock', accent: 'amber' },
  [NOTIFICATION_TYPE.APPROVAL_COMPLETED]: { icon: 'CheckCircle2', accent: 'teal' },
  [NOTIFICATION_TYPE.NEW_MESSAGE]: { icon: 'MessageCircle', accent: 'blue' },
  [NOTIFICATION_TYPE.NEW_COMMENT]: { icon: 'MessageSquare', accent: 'purple' },
  [NOTIFICATION_TYPE.ACCOUNT_DISCONNECTED]: { icon: 'Unlink', accent: 'slate' },
  [NOTIFICATION_TYPE.TOKEN_EXPIRED]: { icon: 'ShieldAlert', accent: 'rose' },
  [NOTIFICATION_TYPE.ACCOUNT_REVOKED]: { icon: 'ShieldOff', accent: 'rose' },
  [NOTIFICATION_TYPE.ACCOUNT_NEEDS_ATTENTION]: { icon: 'AlertTriangle', accent: 'amber' },
};
