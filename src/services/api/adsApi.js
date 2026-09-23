import { mockRequest } from '../mock/mockRequest';
import adsMockData, { adAccountsMock, adAccountStatusMock } from '../mock/adsMock';
import { getAccountStatus } from './socialAccountsApi';
import { ACCOUNT_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let adsStore = API_ENABLED ? [] : [...adsMockData];
let accountsStore = API_ENABLED ? [] : adAccountsMock.map((account) => ({ ...account }));
let templatesStore = [];
let rulesStore = [];

// ------------------------------------------------------------------ ad accounts
// Ad accounts are discovered from the client's own Facebook connection (Social Accounts) — there is
// no per-network "connect an ad account" form any more, only reading the discovered list and
// re-syncing it for real. See backend/README.md's Ads section for why.
export function getAdAccounts() {
  if (API_ENABLED) {
    return axiosClient.get('/ads/accounts').then((response) => {
      accountsStore = response.data.accounts;
      return response.data;
    });
  }
  return mockRequest({ ...adAccountStatusMock, accounts: accountsStore.map((account) => ({ ...account })) });
}

export function syncAdAccounts() {
  if (API_ENABLED) {
    return axiosClient.post('/ads/accounts/sync').then((response) => {
      accountsStore = response.data.accounts;
      return response.data;
    });
  }
  return mockRequest({ ...adAccountStatusMock, accounts: accountsStore.map((account) => ({ ...account })) });
}

// Used by the Social Accounts page to show an "Ads ready" badge on a connected platform's card.
export function isNetworkConnected(networkKey) {
  return accountsStore.some((account) => account.network === networkKey);
}

// An ad needs two things: an ad ACCOUNT (where the money is billed) and the social
// account it appears AS (the Facebook Page / Instagram profile / YouTube channel).
// The second one is whatever is connected on the Social Accounts page — connected
// separately, so Facebook can be there without Instagram or the other way round.
export function isPlacementConnected(platformKey) {
  return getAccountStatus(platformKey) === ACCOUNT_STATUS.CONNECTED;
}

// ------------------------------------------------------------------------- ads
export function getAds() {
  if (API_ENABLED) return axiosClient.get('/ads').then((response) => (adsStore = response.data.ads));
  return mockRequest([...adsStore]);
}

export function getAdById(adId) {
  if (API_ENABLED) {
    return axiosClient
      .get(`/ads/${adId}`)
      .then((response) => response.data.ad)
      .catch((error) => (error.response?.status === 404 ? null : Promise.reject(error)));
  }
  return mockRequest(adsStore.find((ad) => ad.id === adId) || null);
}

export function createAd(payload) {
  if (API_ENABLED) return axiosClient.post('/ads', payload).then((response) => response.data.ad);
  const startsInFuture = new Date(payload.startDate) > new Date();
  const status = payload.status || (startsInFuture ? 'scheduled' : 'inReview');
  const account = accountsStore.find((item) => item.id === payload.adAccountId);
  const newAd = {
    id: `ad-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: 'Nitesh Bhardwaj',
    daily: [],
    network: account?.network || 'meta',
    adAccountName: account?.name || '',
    ...payload,
    status,
  };
  adsStore = [newAd, ...adsStore];
  return mockRequest(newAd);
}

// Phase 4: bulk ad creation — several creative variations sharing one campaign/ad set/audience/budget.
export function createBulkAd(payload) {
  if (API_ENABLED) return axiosClient.post('/ads/bulk', payload).then((response) => response.data.ads);
  const startsInFuture = new Date(payload.startDate) > new Date();
  const status = payload.status || (startsInFuture ? 'scheduled' : 'inReview');
  const account = accountsStore.find((item) => item.id === payload.adAccountId);
  const { creatives, ...shared } = payload;
  const newAds = creatives.map((creative, index) => ({
    id: `ad-${Date.now()}-${index}`,
    createdAt: new Date().toISOString(),
    createdBy: 'Nitesh Bhardwaj',
    daily: [],
    network: account?.network || 'meta',
    adAccountName: account?.name || '',
    ...shared,
    name: `${shared.name} — variation ${index + 1}`,
    creative,
    status,
  }));
  adsStore = [...newAds, ...adsStore];
  return mockRequest(newAds);
}

// ---------------------------------------------------------- creative library (Phase 5)
// Saved, reusable creatives — never launched on their own, only picked from when building a real ad
// (or a bulk variation) to skip retyping. See backend/README.md's Ads section for the full design.
export function getAdCreativeTemplates() {
  if (API_ENABLED) return axiosClient.get('/ads/templates').then((response) => (templatesStore = response.data.templates));
  return mockRequest([...templatesStore]);
}

export function createAdCreativeTemplate(payload) {
  if (API_ENABLED) return axiosClient.post('/ads/templates', payload).then((response) => response.data.template);
  const newTemplate = { id: `template-${Date.now()}`, mediaUrl: null, createdAt: new Date().toISOString(), ...payload };
  templatesStore = [newTemplate, ...templatesStore];
  return mockRequest(newTemplate);
}

export function updateAdCreativeTemplate(id, payload) {
  if (API_ENABLED) return axiosClient.patch(`/ads/templates/${id}`, payload).then((response) => response.data.template);
  templatesStore = templatesStore.map((template) => (template.id === id ? { ...template, ...payload } : template));
  return mockRequest(templatesStore.find((template) => template.id === id));
}

export function deleteAdCreativeTemplate(id) {
  if (API_ENABLED) return axiosClient.delete(`/ads/templates/${id}`).then((response) => response.data);
  templatesStore = templatesStore.filter((template) => template.id !== id);
  return mockRequest({ success: true });
}

// ---------------------------------------------------------- automated rules (Phase 8)
// Pause/resume only — never budget. See backend/README.md's Ads section for the full safety design
// (cooldown, undefined-metric skip, per-pass action cap).
export function getAdRules() {
  if (API_ENABLED) return axiosClient.get('/ads/rules').then((response) => (rulesStore = response.data.rules));
  return mockRequest([...rulesStore]);
}

export function createAdRule(payload) {
  if (API_ENABLED) return axiosClient.post('/ads/rules', payload).then((response) => response.data.rule);
  const account = accountsStore.find((item) => item.id === payload.adAccountId);
  const newRule = { id: `rule-${Date.now()}`, adAccountName: account?.name || '', lastFiredAt: null, createdAt: new Date().toISOString(), ...payload };
  rulesStore = [newRule, ...rulesStore];
  return mockRequest(newRule);
}

export function updateAdRule(id, payload) {
  if (API_ENABLED) return axiosClient.patch(`/ads/rules/${id}`, payload).then((response) => response.data.rule);
  rulesStore = rulesStore.map((rule) => (rule.id === id ? { ...rule, ...payload } : rule));
  return mockRequest(rulesStore.find((rule) => rule.id === id));
}

export function deleteAdRule(id) {
  if (API_ENABLED) return axiosClient.delete(`/ads/rules/${id}`).then((response) => response.data);
  rulesStore = rulesStore.filter((rule) => rule.id !== id);
  return mockRequest({ success: true });
}

export function updateAdsStatus(adIds, status) {
  if (API_ENABLED) return axiosClient.patch('/ads/status', { ids: adIds, status }).then((response) => response.data);
  const idSet = new Set(adIds);
  adsStore = adsStore.map((ad) => (idSet.has(ad.id) ? { ...ad, status } : ad));
  return mockRequest({ success: true, updated: idSet.size });
}

export function deleteAds(adIds) {
  if (API_ENABLED) return axiosClient.delete('/ads', { data: { ids: adIds } }).then((response) => response.data);
  const idSet = new Set(adIds);
  adsStore = adsStore.filter((ad) => !idSet.has(ad.id));
  return mockRequest({ success: true, deleted: idSet.size });
}
