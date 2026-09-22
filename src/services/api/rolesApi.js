import { mockRequest } from '../mock/mockRequest';
import rolesMockData from '../mock/rolesMock';

let rolesStore = [...rolesMockData];

export function getRoles() {
  return mockRequest([...rolesStore]);
}

export function createRole(rolePayload) {
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
  rolesStore = rolesStore.map((role) => (role.id === roleId ? { ...role, ...updates } : role));
  return mockRequest(rolesStore.find((role) => role.id === roleId));
}

export function deleteRole(roleId) {
  rolesStore = rolesStore.filter((role) => role.id !== roleId);
  return mockRequest({ success: true });
}

export function cloneRole(roleId) {
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
