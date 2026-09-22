import { mockRequest } from '../mock/mockRequest';
import notificationsMockData from '../mock/notificationsMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let notificationsStore = [...notificationsMockData];

function present(item) {
  return { id: item.id, type: item.type, title: item.title, message: item.message, time: item.createdAt, isRead: item.isRead };
}

/** Resolves `{ items, unreadCount }` — `unreadCount` counts every unread notification, not just this page. */
export function getNotifications() {
  if (API_ENABLED) {
    return axiosClient.get('/notifications').then((response) => ({
      items: response.data.items.map(present),
      unreadCount: response.data.unreadCount,
    }));
  }
  const items = [...notificationsStore];
  return mockRequest({ items, unreadCount: items.filter((item) => !item.isRead).length });
}

export function markNotificationAsRead(notificationId) {
  if (API_ENABLED) return axiosClient.post(`/notifications/${notificationId}/read`).then(() => ({ success: true }));
  notificationsStore = notificationsStore.map((notification) =>
    notification.id === notificationId ? { ...notification, isRead: true } : notification
  );
  return mockRequest({ success: true });
}

export function markAllNotificationsAsRead() {
  if (API_ENABLED) return axiosClient.post('/notifications/read-all').then(() => ({ success: true }));
  notificationsStore = notificationsStore.map((notification) => ({ ...notification, isRead: true }));
  return mockRequest({ success: true });
}

export function getNotificationPreferences() {
  if (API_ENABLED) return axiosClient.get('/notifications/preferences').then((response) => response.data.preferences);
  return mockRequest({});
}

export function setNotificationPreferences(preferences) {
  if (API_ENABLED) return axiosClient.patch('/notifications/preferences', preferences).then((response) => response.data.preferences);
  return mockRequest(preferences);
}
