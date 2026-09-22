import { mockRequest } from '../mock/mockRequest';
import postsMockData from '../mock/postsMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

// Demo data used when no server is connected (API_ENABLED is false).
let postsStore = [...postsMockData];

export function getPosts() {
  if (API_ENABLED) return axiosClient.get('/posts').then((response) => response.data.posts);
  return mockRequest([...postsStore]);
}

export function getPostById(postId) {
  if (API_ENABLED) return axiosClient.get(`/posts/${postId}`).then((response) => response.data.post);
  return mockRequest(postsStore.find((post) => post.id === postId) || null);
}

/**
 * With the API on, `status: 'published'` means "publish now": the server sends it to every chosen
 * platform before answering, so the returned post already says which platforms worked (`targets`).
 */
export function createPost(postPayload) {
  if (API_ENABLED) return axiosClient.post('/posts', postPayload).then((response) => response.data.post);
  const newPost = {
    id: `post-${Date.now()}`,
    createdBy: 'Nitesh Bhardwaj',
    ...postPayload,
  };
  postsStore = [newPost, ...postsStore];
  return mockRequest(newPost);
}

export function updatePost(postId, updates) {
  if (API_ENABLED) return axiosClient.patch(`/posts/${postId}`, updates).then((response) => response.data.post);
  postsStore = postsStore.map((post) => (post.id === postId ? { ...post, ...updates } : post));
  return mockRequest(postsStore.find((post) => post.id === postId));
}

export function deletePost(postId) {
  if (API_ENABLED) return axiosClient.delete(`/posts/${postId}`).then(() => ({ success: true }));
  postsStore = postsStore.filter((post) => post.id !== postId);
  return mockRequest({ success: true });
}

/** Resolves to { deleted } — with the API on, posts the person may not delete are skipped, not fatal. */
export function deletePosts(postIds) {
  if (API_ENABLED) return axiosClient.post('/posts/bulk', { action: 'delete', ids: postIds }).then((response) => ({ success: true, deleted: response.data.done, skipped: response.data.skipped }));
  const idSet = new Set(postIds);
  postsStore = postsStore.filter((post) => !idSet.has(post.id));
  return mockRequest({ success: true, deleted: idSet.size, skipped: 0 });
}

/** Only "move to draft" is used in bulk. Resolves to { updated, skipped }. */
export function updatePostsStatus(postIds, status) {
  if (API_ENABLED) return axiosClient.post('/posts/bulk', { action: 'draft', ids: postIds }).then((response) => ({ success: true, updated: response.data.done, skipped: response.data.skipped }));
  const idSet = new Set(postIds);
  postsStore = postsStore.map((post) => (idSet.has(post.id) ? { ...post, status } : post));
  return mockRequest({ success: true, updated: idSet.size, skipped: 0 });
}

// The calls below exist only on the server: demo mode has no platforms to send to.
export const retryPost = (postId) => axiosClient.post(`/posts/${postId}/retry`).then((response) => response.data.post);
export const approvePost = (postId) => axiosClient.post(`/posts/${postId}/approve`).then((response) => response.data.post);
export const rejectPost = (postId, reason) => axiosClient.post(`/posts/${postId}/reject`, { reason }).then((response) => response.data.post);
