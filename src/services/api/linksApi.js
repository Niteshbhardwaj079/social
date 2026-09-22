import { mockRequest } from '../mock/mockRequest';
import linksMockData from '../mock/linksMock';

let linksStore = [...linksMockData];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getLinks() {
  return mockRequest([...linksStore]);
}

export function createLink({ destinationUrl, customSlug, label }) {
  const slug = slugify(customSlug || label || Math.random().toString(36).slice(2, 8));
  const newLink = {
    id: `link-${Date.now()}`,
    slug,
    destinationUrl,
    label: label || destinationUrl,
    clicks: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'Nitesh Bhardwaj',
    clickHistory: [],
  };
  linksStore = [newLink, ...linksStore];
  return mockRequest(newLink);
}

export function deleteLink(linkId) {
  linksStore = linksStore.filter((link) => link.id !== linkId);
  return mockRequest({ success: true });
}

export function deleteLinks(linkIds) {
  const idSet = new Set(linkIds);
  linksStore = linksStore.filter((link) => !idSet.has(link.id));
  return mockRequest({ success: true, deleted: idSet.size });
}
