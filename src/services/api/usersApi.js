import { mockRequest } from '../mock/mockRequest';
import usersMockData from '../mock/usersMock';
import { USER_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';
import { dispatchSystemEmail } from './systemEmailsApi';

// Demo data used when no server is connected (API_ENABLED is false).
let usersStore = [...usersMockData];

export function getUsers() {
  if (API_ENABLED) return axiosClient.get('/users').then((response) => response.data.users);
  return mockRequest([...usersStore]);
}

/** Resolves to { user, invitation: { sent, language } } — the language the invitation email went out in. */
export function createUser(userPayload) {
  if (API_ENABLED) return axiosClient.post('/users', userPayload).then((response) => response.data);
  const newUser = {
    id: `user-${Date.now()}`,
    status: USER_STATUS.INVITED,
    avatarUrl: null,
    lastActiveAt: null,
    accountsAssigned: 0,
    ...userPayload,
  };
  usersStore = [newUser, ...usersStore];
  return mockRequest(newUser).then(async (user) => {
    const result = await dispatchSystemEmail('users.invited', user.language);
    return { user, invitation: { sent: result.sent, language: result.language } };
  });
}

export function updateUser(userId, updates) {
  if (API_ENABLED) return axiosClient.patch(`/users/${userId}`, updates).then((response) => response.data.user);
  usersStore = usersStore.map((user) => (user.id === userId ? { ...user, ...updates } : user));
  return mockRequest(usersStore.find((user) => user.id === userId));
}

export function deleteUser(userId) {
  if (API_ENABLED) return axiosClient.delete(`/users/${userId}`).then(() => ({ success: true }));
  usersStore = usersStore.filter((user) => user.id !== userId);
  return mockRequest({ success: true });
}

/** Sends a real password-reset email to someone else, the same "Forgot password" flow they'd use
 *  themselves — you never see or set their password directly. */
export function sendPasswordReset(userId) {
  if (API_ENABLED) return axiosClient.post(`/users/${userId}/reset-password`).then((response) => response.data);
  const user = usersStore.find((item) => item.id === userId);
  return mockRequest(null).then(() => dispatchSystemEmail('auth.passwordResetRequested', user?.language || 'en'));
}
