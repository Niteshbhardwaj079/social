import { mockRequest } from '../mock/mockRequest';
import adsMockData, { adAccountsMock } from '../mock/adsMock';
import { getAccountStatus } from './socialAccountsApi';
import { ACCOUNT_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let adsStore = API_ENABLED ? [] : [...adsMockData];
let accountsStore = API_ENABLED ? [] : adAccountsMock.map((account) => ({ ...account }));

const MIN_CREDENTIAL_LENGTH = 6;

// ------------------------------------------------------------------ ad accounts
export function getAdAccounts() {
  if (API_ENABLED) return axiosClient.get('/ads/accounts').then((response) => (accountsStore = response.data.accounts));
  return mockRequest(accountsStore.map((account) => ({ ...account })));
}

export function isNetworkConnected(networkKey) {
  return accountsStore.find((account) => account.network === networkKey)?.isConnected || false;
}

/** With the API on, the server really calls Meta (or says the network isn't built yet); it never throws — always { ok, message }. */
export function testAdAccountConnection(networkKey, values) {
  if (API_ENABLED) return axiosClient.post(`/ads/accounts/${networkKey}/test`, { credentials: values }).then((response) => response.data);

  const network = adAccountsMock.find((item) => item.network === networkKey);
  const bad = Object.values(values).find((value) => String(value || '').trim().length < MIN_CREDENTIAL_LENGTH);
  if (bad !== undefined) return mockRequest({ ok: false, message: 'That looks too short to be valid. Check the details and try again.' });
  return mockRequest({ ok: true, message: `Connected to your ${network?.network || 'ad'} account successfully. Budgets and spend stay on that account.` });
}

export function connectAdAccount(networkKey, values) {
  if (API_ENABLED) return axiosClient.put(`/ads/accounts/${networkKey}`, { credentials: values }).then((response) => response.data.account);
  const primaryId = values.adAccountId || values.customerId || values.advertiserId || 'connected';
  accountsStore = accountsStore.map((account) =>
    account.network === networkKey
      ? { ...account, isConnected: true, accountId: String(primaryId), currency: 'INR', connectedAt: new Date().toISOString() }
      : account
  );
  return mockRequest(accountsStore.find((account) => account.network === networkKey));
}

export function disconnectAdAccount(networkKey) {
  if (API_ENABLED) return axiosClient.delete(`/ads/accounts/${networkKey}`).then(() => ({ success: true }));
  accountsStore = accountsStore.map((account) => (account.network === networkKey ? { network: networkKey, isConnected: false } : account));
  return mockRequest({ success: true });
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
  const newAd = { id: `ad-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: 'Nitesh Bhardwaj', daily: [], ...payload, status };
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
