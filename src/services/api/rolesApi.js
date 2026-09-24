import { mockRequest } from '../mock/mockRequest';
import rolesMockData from '../mock/rolesMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let rolesStore = [...rolesMockData];

export function getRoles() {
  if (API_ENABLED) return axiosClient.get('/roles').then((response) => response.data.roles);
  return mockRequest([...rolesStore]);
}

export function createRole(rolePayload) {
  if (API_ENABLED) return axiosClient.post('/roles', rolePayload).then((response) => response.data.role);
  const newRole = {
    id: `role-${Date.now()}`,
    usersCount: 0,
    isSystemRole: false,
    icon: 'User',
    accent: 'slate',
    ...rolePayload,
  };
  rolesStore = [...rolesStore, newRole];
  return mockRequest(newRole);
}

export function updateRole(roleId, updates) {
  if (API_ENABLED) return axiosClient.patch(`/roles/${roleId}`, updates).then((response) => response.data.role);
  rolesStore = rolesStore.map((role) => (role.id === roleId ? { ...role, ...updates } : role));
  return mockRequest(rolesStore.find((role) => role.id === roleId));
}

export function deleteRole(roleId) {
  if (API_ENABLED) return axiosClient.delete(`/roles/${roleId}`).then(() => ({ success: true }));
  rolesStore = rolesStore.filter((role) => role.id !== roleId);
  return mockRequest({ success: true });
}

export function cloneRole(roleId) {
  if (API_ENABLED) return axiosClient.post(`/roles/${roleId}/duplicate`, {}).then((response) => response.data.role);
  const sourceRole = rolesStore.find((role) => role.id === roleId);
  if (!sourceRole) {
    return mockRequest(null);
  }
  const clonedRole = {
    ...sourceRole,
    id: `role-${Date.now()}`,
    name: `${sourceRole.name} (Copy)`,
    isSystemRole: false,
    usersCount: 0,
  };
  rolesStore = [...rolesStore, clonedRole];
  return mockRequest(clonedRole);
}
