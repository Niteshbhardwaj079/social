import { mockRequest } from '../mock/mockRequest';
import adsMockData, { adAccountsMock } from '../mock/adsMock';
import { AD_STATUS, getAdNetwork } from '../../config/adPlatforms';
import { getAccountStatus } from './socialAccountsApi';
import { ACCOUNT_STATUS } from '../../config/constants';

let adsStore = [...adsMockData];
let accountsStore = adAccountsMock.map((account) => ({ ...account }));

const MIN_CREDENTIAL_LENGTH = 6;

// ------------------------------------------------------------------ ad accounts
export function getAdAccounts() {
  return mockRequest(accountsStore.map((account) => ({ ...account })));
}

export function isNetworkConnected(networkKey) {
  return accountsStore.find((account) => account.network === networkKey)?.isConnected || false;
}

// Phase 1 stand-in for the backend calling the ad platform with these credentials.
export function testAdAccountConnection(networkKey, values) {
  const network = getAdNetwork(networkKey);
  const bad = network.fields.find((field) => field.required && String(values[field.key] || '').trim().length < MIN_CREDENTIAL_LENGTH);
  if (bad) {
    return mockRequest({ ok: false, message: `${bad.label} looks too short to be valid. Check the details and try again.` });
  }
  return mockRequest({ ok: true, message: `Connected to your ${network.label} account successfully. Budgets and spend stay on that account.` });
}

export function connectAdAccount(networkKey, values) {
  const primaryId = values.adAccountId || values.customerId || values.advertiserId || 'connected';
  accountsStore = accountsStore.map((account) =>
    account.network === networkKey
      ? { ...account, isConnected: true, accountId: String(primaryId), currency: 'INR', connectedAt: new Date().toISOString() }
      : account
  );
  return mockRequest(accountsStore.find((account) => account.network === networkKey));
}

export function disconnectAdAccount(networkKey) {
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
  return mockRequest([...adsStore]);
}

export function getAdById(adId) {
  return mockRequest(adsStore.find((ad) => ad.id === adId) || null);
}

export function createAd(payload) {
  const startsInFuture = new Date(payload.startDate) > new Date();
  const status =
    payload.status || (startsInFuture ? AD_STATUS.SCHEDULED : AD_STATUS.IN_REVIEW);
  const newAd = {
    id: `ad-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: 'Nitesh Bhardwaj',
    daily: [],
    ...payload,
    status,
  };
  adsStore = [newAd, ...adsStore];
  return mockRequest(newAd);
}

export function updateAdsStatus(adIds, status) {
  const idSet = new Set(adIds);
  adsStore = adsStore.map((ad) => (idSet.has(ad.id) ? { ...ad, status } : ad));
  return mockRequest({ success: true, updated: idSet.size });
}

export function deleteAds(adIds) {
  const idSet = new Set(adIds);
  adsStore = adsStore.filter((ad) => !idSet.has(ad.id));
  return mockRequest({ success: true, deleted: idSet.size });
}
