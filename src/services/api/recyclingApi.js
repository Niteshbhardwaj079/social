import { mockRequest } from '../mock/mockRequest';
import recyclingMockData from '../mock/recyclingMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let recyclingStore = [...recyclingMockData];

function addDays(isoString, days) {
  const date = new Date(isoString);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function getRecyclingQueue() {
  if (API_ENABLED) return axiosClient.get('/recycling').then((response) => response.data.entries);
  return mockRequest([...recyclingStore]);
}

export function addToRecycling(post, intervalDays) {
  if (API_ENABLED) return axiosClient.post('/recycling', { postId: post.id, intervalDays }).then((response) => response.data.entry);
  const now = new Date().toISOString();
  const newEntry = {
    id: `recycle-${Date.now()}`,
    postId: post.id,
    content: post.content,
    platforms: post.platforms,
    intervalDays,
    isActive: true,
    lastRunAt: null,
    nextRunAt: addDays(now, intervalDays),
    totalReposts: 0,
  };
  recyclingStore = [newEntry, ...recyclingStore];
  return mockRequest(newEntry);
}

export function updateRecyclingEntry(entryId, updates) {
  if (API_ENABLED) return axiosClient.patch(`/recycling/${entryId}`, updates).then((response) => response.data.entry);
  recyclingStore = recyclingStore.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry));
  return mockRequest(recyclingStore.find((entry) => entry.id === entryId));
}

export function removeFromRecycling(entryId) {
  if (API_ENABLED) return axiosClient.delete(`/recycling/${entryId}`).then(() => ({ success: true }));
  recyclingStore = recyclingStore.filter((entry) => entry.id !== entryId);
  return mockRequest({ success: true });
}

export function updateRecyclingEntries(entryIds, updates) {
  if (API_ENABLED) return axiosClient.post('/recycling/bulk-update', { ids: entryIds, ...updates }).then((response) => ({ success: true, ...response.data }));
  const idSet = new Set(entryIds);
  recyclingStore = recyclingStore.map((entry) => (idSet.has(entry.id) ? { ...entry, ...updates } : entry));
  return mockRequest({ success: true, updated: idSet.size });
}

export function removeManyFromRecycling(entryIds) {
  if (API_ENABLED) return axiosClient.post('/recycling/bulk-delete', { ids: entryIds }).then((response) => ({ success: true, ...response.data }));
  const idSet = new Set(entryIds);
  recyclingStore = recyclingStore.filter((entry) => !idSet.has(entry.id));
  return mockRequest({ success: true, removed: idSet.size });
}
