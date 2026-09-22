import { mockRequest } from '../mock/mockRequest';
import inboxMockData from '../mock/inboxMock';

let conversationsStore = [...inboxMockData];

export function getConversations() {
  return mockRequest([...conversationsStore]);
}

export function sendReply(conversationId, text) {
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
  conversationsStore = conversationsStore.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, status } : conversation
  );
  return mockRequest({ success: true });
}

export function assignConversation(conversationId, assignee) {
  conversationsStore = conversationsStore.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, assignedTo: assignee } : conversation
  );
  return mockRequest({ success: true });
}
