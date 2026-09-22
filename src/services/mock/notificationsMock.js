import { NOTIFICATION_TYPE } from '../../config/constants';

const notificationsMock = [
  { id: 'notif-1', type: NOTIFICATION_TYPE.POST_PUBLISHED, title: 'Post published', message: '"Thank you for 25,000 followers!" was published on Instagram.', time: '2026-09-18T06:00:00Z', isRead: false },
  { id: 'notif-2', type: NOTIFICATION_TYPE.APPROVAL_REQUESTED, title: 'Approval requested', message: 'Priya Sharma submitted a post for your approval.', time: '2026-09-17T14:20:00Z', isRead: false },
  { id: 'notif-3', type: NOTIFICATION_TYPE.TOKEN_EXPIRED, title: 'Token expired', message: 'Your X account connection has expired. Please reconnect.', time: '2026-09-17T09:00:00Z', isRead: false },
  { id: 'notif-4', type: NOTIFICATION_TYPE.NEW_MESSAGE, title: 'New message', message: 'Sara Khan sent a new message on Instagram.', time: '2026-09-18T05:20:00Z', isRead: true },
  { id: 'notif-5', type: NOTIFICATION_TYPE.POST_FAILED, title: 'Post failed', message: '"Our YouTube walkthrough..." failed to publish.', time: '2026-09-16T08:05:00Z', isRead: true },
];

export default notificationsMock;
