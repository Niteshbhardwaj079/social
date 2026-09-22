import { mockRequest } from '../mock/mockRequest';
import socialAccountsMockData from '../mock/socialAccountsMock';
import { ACCOUNT_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

// apiTier: which plan the client's own API key is on ('free' | 'paid'). It decides
// how much profile data the Inbox may show — see config/platformProfileFields.js.
// With the API on, this is just a copy of the last list the server sent.
let accountsStore = API_ENABLED ? [] : socialAccountsMockData.map((account) => ({ apiTier: 'free', ...account }));

function remember(account) {
  accountsStore = accountsStore.some((item) => item.platform === account.platform)
    ? accountsStore.map((item) => (item.platform === account.platform ? account : item))
    : [...accountsStore, account];
  return account;
}

export function getSocialAccounts() {
  if (API_ENABLED) {
    return axiosClient.get('/social-accounts').then((response) => {
      accountsStore = response.data.accounts;
      return [...accountsStore];
    });
  }
  return mockRequest([...accountsStore]);
}

/** Fills the look-up cache below without needing a screen that shows the list. Never rejects. */
export function warmAccountCache() {
  if (!API_ENABLED) return Promise.resolve();
  return getSocialAccounts().then(
    () => undefined,
    () => undefined
  );
}

const MIN_CREDENTIAL_LENGTH = 8;

// Demo-mode stand-in for the server's "call the platform with these credentials" check. A value that
// is blank, too short, or (for a server address) not an https URL is rejected so the failed-test
// state can be seen in the UI too. Resolves to { ok, message }. With the API on, the server really
// asks the platform; a network/server problem rejects, so callers must catch.
export function testAccountConnection(platformKey, values) {
  if (API_ENABLED) {
    return axiosClient
      .post(`/social-accounts/${platformKey}/test`, { credentials: values })
      .then((response) => ({ ok: response.data.ok, message: response.data.message }));
  }

  const badField = Object.entries(values).find(([key, value]) => {
    const text = String(value).trim();
    if (key === 'instanceUrl') return !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(text);
    if (key === 'handle') return !text.includes('.');
    return text.length < MIN_CREDENTIAL_LENGTH;
  });

  if (badField) {
    const reason =
      badField[0] === 'instanceUrl'
        ? 'The server address must be a full https:// address.'
        : 'The platform rejected these credentials.';
    return mockRequest({ ok: false, message: `${reason} Check the values and try again.` });
  }

  const account = accountsStore.find((item) => item.platform === platformKey);
  return mockRequest({ ok: true, message: `Connected to ${account?.accountName || 'your account'} successfully.` });
}

// Synchronous look-ups for components that need the answer while rendering.
export function getAccountApiTier(platformKey) {
  return accountsStore.find((account) => account.platform === platformKey)?.apiTier || 'free';
}

export function getAccountStatus(platformKey) {
  return accountsStore.find((account) => account.platform === platformKey)?.status || ACCOUNT_STATUS.DISCONNECTED;
}

// With the API on, the server checks the credentials again itself and stores them encrypted — they are
// never returned. In demo mode they are not stored or logged at all.
export function connectAccount(platformKey, credentials, { apiTier } = {}) {
  if (API_ENABLED) {
    return axiosClient
      .put(`/social-accounts/${platformKey}`, { credentials, apiTier: apiTier || 'free' })
      .then((response) => remember(response.data.account));
  }
  accountsStore = accountsStore.map((account) =>
    account.platform === platformKey
      ? {
          ...account,
          status: ACCOUNT_STATUS.CONNECTED,
          apiTier: apiTier || account.apiTier,
          lastSyncedAt: new Date().toISOString(),
        }
      : account
  );
  return mockRequest(accountsStore.find((account) => account.platform === platformKey));
}

export function disconnectAccount(accountId) {
  if (API_ENABLED) {
    return axiosClient.delete(`/social-accounts/${accountId}`).then((response) => remember(response.data.account));
  }
  accountsStore = accountsStore.map((account) =>
    account.id === accountId ? { ...account, status: ACCOUNT_STATUS.DISCONNECTED, followers: 0 } : account
  );
  return mockRequest(accountsStore.find((account) => account.id === accountId));
}

const MOCK_PINTEREST_BOARDS = [
  { id: 'board-products', name: 'Products' },
  { id: 'board-inspiration', name: 'Inspiration' },
];

/** The connected Pinterest account's real boards, for the composer's board picker. Empty if not connected. */
export function getPinterestBoards() {
  if (API_ENABLED) return axiosClient.get('/social-accounts/pinterest/boards').then((response) => response.data.boards);
  return mockRequest(getAccountStatus('pinterest') === ACCOUNT_STATUS.CONNECTED ? MOCK_PINTEREST_BOARDS : []);
}

/** "Sync now": asks the platform again. Resolves to the refreshed account (it may now need reconnecting). */
export function syncAccount(accountId) {
  if (API_ENABLED) {
    return axiosClient.post(`/social-accounts/${accountId}/recheck`).then((response) => remember(response.data.account));
  }
  accountsStore = accountsStore.map((account) =>
    account.id === accountId ? { ...account, lastSyncedAt: new Date().toISOString() } : account
  );
  return mockRequest(accountsStore.find((account) => account.id === accountId));
}
