import { mockRequest } from '../mock/mockRequest';
import mediaMockData, { mediaFoldersMock } from '../mock/mediaMock';
import { getUploadTarget } from './storageApi';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';
import brand from '../../config/brand';

let mediaStore = [...mediaMockData];

function slugifyFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

export function getMediaItems() {
  if (API_ENABLED) return axiosClient.get('/media').then((response) => response.data.items);
  return mockRequest([...mediaStore]);
}

export function getMediaFolders() {
  if (API_ENABLED) return axiosClient.get('/media/folders').then((response) => response.data.folders);
  return mockRequest([...mediaFoldersMock]);
}

/**
 * A real upload. `file` is the actual Blob/File (the crop tool's output, or the raw file for a video) — only
 * used in API mode, where the bytes really need to go to the server. `mediaPayload` carries the rest
 * (name, type, folder, width, height); its `url`/`sizeKb`/`publicUrl` fields are mock-only and ignored here.
 */
export function uploadMediaItem(mediaPayload, file) {
  if (API_ENABLED) {
    const form = new FormData();
    form.append('file', file, mediaPayload.name);
    if (mediaPayload.folder) form.append('folder', mediaPayload.folder);
    if (mediaPayload.width) form.append('width', mediaPayload.width);
    if (mediaPayload.height) form.append('height', mediaPayload.height);
    return axiosClient.post('/media', form).then((response) => response.data.item);
  }

  const id = `media-${Date.now()}`;
  const target = getUploadTarget();
  const fileName = slugifyFileName(mediaPayload.name);

  let publicUrl = mediaPayload.publicUrl;
  if (!publicUrl && target) {
    const base = target.provider?.values?.publicBaseUrl?.replace(/\/$/, '') || `${brand.websiteUrl}/uploads`;
    publicUrl = `${base}/${id}-${fileName}`;
  }

  const newItem = {
    id,
    uploadedBy: 'Nitesh Bhardwaj',
    uploadedAt: new Date().toISOString(),
    tags: [],
    usedIn: [],
    storage: target?.storage || 'server',
    storageLabel: target?.label || 'Server',
    ...mediaPayload,
    publicUrl,
  };
  mediaStore = [newItem, ...mediaStore];
  return mockRequest(newItem);
}

/** "Add an image that is already online": nothing is uploaded, only the link is remembered. */
export function addLinkedMedia({ url, name, width, height }) {
  if (API_ENABLED) return axiosClient.post('/media/link', { url, name, width, height }).then((response) => response.data.item);

  const id = `media-${Date.now()}`;
  const newItem = {
    id,
    name,
    type: 'image',
    url,
    publicUrl: url,
    folder: 'Campaigns',
    sizeKb: 0,
    width,
    height,
    storage: 'linked',
    storageLabel: 'Linked',
    uploadedBy: 'Nitesh Bhardwaj',
    uploadedAt: new Date().toISOString(),
    tags: [],
    usedIn: [],
  };
  mediaStore = [newItem, ...mediaStore];
  return mockRequest(newItem);
}

/** Re-cropping an existing image: `file` (the new blob) is required in API mode, ignored in mock mode. */
export function updateMediaItem(mediaId, updates, file) {
  if (API_ENABLED) {
    const form = new FormData();
    form.append('file', file, 'image.png');
    if (updates.width) form.append('width', updates.width);
    if (updates.height) form.append('height', updates.height);
    return axiosClient.patch(`/media/${mediaId}`, form).then((response) => response.data.item);
  }
  let updated = null;
  mediaStore = mediaStore.map((item) => {
    if (item.id !== mediaId) return item;
    updated = { ...item, ...updates };
    return updated;
  });
  return mockRequest(updated);
}

export function deleteMediaItem(mediaId) {
  if (API_ENABLED) return axiosClient.delete(`/media/${mediaId}`).then(() => ({ success: true }));
  mediaStore = mediaStore.filter((item) => item.id !== mediaId);
  return mockRequest({ success: true });
}

export function deleteMediaItems(mediaIds) {
  if (API_ENABLED) {
    return axiosClient.post('/media/bulk-delete', { ids: mediaIds }).then((response) => ({ success: true, ...response.data }));
  }
  const idSet = new Set(mediaIds);
  mediaStore = mediaStore.filter((item) => !idSet.has(item.id));
  return mockRequest({ success: true, deleted: idSet.size });
}
