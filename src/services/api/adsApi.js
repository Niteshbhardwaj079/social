import { mockRequest } from '../mock/mockRequest';
import adsMockData, { adAccountsMock, adAccountStatusMock } from '../mock/adsMock';
import { getAccountStatus } from './socialAccountsApi';
import { ACCOUNT_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let adsStore = API_ENABLED ? [] : [...adsMockData];
let accountsStore = API_ENABLED ? [] : adAccountsMock.map((account) => ({ ...account }));

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
