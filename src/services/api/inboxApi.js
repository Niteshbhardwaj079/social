import { mockRequest } from '../mock/mockRequest';
import inboxMockData from '../mock/inboxMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let conversationsStore = [...inboxMockData];

export function getConversations() {
  if (API_ENABLED) return axiosClient.get('/inbox').then((response) => response.data.conversations);
  return mockRequest([...conversationsStore]);
}

export function getAssignableUsers() {
  if (API_ENABLED) return axiosClient.get('/inbox/assignable-users').then((response) => response.data.users);
  return mockRequest([{ id: 'nitesh', name: 'Nitesh Bhardwaj' }, { id: 'priya', name: 'Priya Sharma' }, { id: 'rahul', name: 'Rahul Verma' }]);
}

export function markConversationRead(conversationId) {
  if (API_ENABLED) return axiosClient.post(`/inbox/${conversationId}/read`).then((response) => response.data);
  conversationsStore = conversationsStore.map((conversation) => (conversation.id === conversationId ? { ...conversation, isUnread: false } : conversation));
  return mockRequest({ success: true });
}

export function sendReply(conversationId, text) {
  if (API_ENABLED) return axiosClient.post(`/inbox/${conversationId}/reply`, { text }).then((response) => response.data.message);
  const newMessage = { id: `m-${Date.now()}`, sender: 'agent', text, time: new Date().toISOString() };
  conversationsStore = conversationsStore.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          messages: [...conversation.messages, newMessage],
          lastMessage: text,
          lastMessageAt: newMessage.time,
          isUnread: false,
        }
      : conversation
  );
  return mockRequest(newMessage);
}

export function updateConversationStatus(conversationId, status) {
  if (API_ENABLED) return axiosClient.patch(`/inbox/${conversationId}/status`, { status }).then((response) => response.data);
  conversationsStore = conversationsStore.map((conversation) => (conversation.id === conversationId ? { ...conversation, status } : conversation));
  return mockRequest({ success: true });
}

/** `assignee` is `{id, name}` (or null to unassign) — the caller keeps `name` for optimistic local display, only `id` is sent. */
export function assignConversation(conversationId, assignee) {
  if (API_ENABLED) return axiosClient.patch(`/inbox/${conversationId}/assign`, { userId: assignee?.id ?? null }).then((response) => response.data);
  conversationsStore = conversationsStore.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, assignedTo: assignee?.name ?? null } : conversation
  );
  return mockRequest({ success: true });
}
