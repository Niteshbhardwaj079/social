import { mockRequest } from '../mock/mockRequest';
import { getStorageProvider } from '../../config/storageProviders';
import { API_ENABLED } from '../../config/runtime';
import axiosClient, { apiErrorMessage } from './axiosClient';

const MIN_CREDENTIAL_LENGTH = 6;

// mockRequest only resolves, so failures need their own delayed rejection.
function mockFailure(message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), 500);
  });
}

// Phase 1 keeps this in memory. Secrets are never kept — only a masked hint of
// the last four characters, the same shape the real backend will return.
let settingsStore = {
  provider: null,
  preferences: { serverEnabled: true, externalEnabled: false, limitValue: '', limitUnit: 'GB' },
};

function maskSecret(value) {
  return `••••${String(value).slice(-4)}`;
}

function findBadField(providerKey, values, { hasSavedSecrets = false } = {}) {
  const provider = getStorageProvider(providerKey);
  if (!provider) return { message: 'Choose a storage provider first.' };

  for (const field of provider.fields) {
    const value = String(values[field.key] || '').trim();
    if (!value && field.required) {
      // A saved secret can be left blank — the backend keeps using the stored one.
      if (field.secret && hasSavedSecrets) continue;
      return { message: `${field.label} is required.` };
    }
    if (value && field.type === 'url' && !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(value)) {
      return { message: `${field.label} must be a full https:// address.` };
    }
    if (value && field.required && field.type !== 'url' && value.length < MIN_CREDENTIAL_LENGTH) {
      return { message: `${field.label} looks too short to be valid.` };
    }
  }
  return null;
}

function remember(settings) {
  settingsStore = settings;
  return settings;
}

export function getStorageSettings() {
  if (API_ENABLED) return axiosClient.get('/storage').then((response) => remember(response.data));
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

/** Fills the look-up cache below without needing a screen that shows the settings. Never rejects. */
export function warmStorageCache() {
  if (!API_ENABLED) return Promise.resolve();
  return getStorageSettings().then(
    () => undefined,
    () => undefined
  );
}

// Synchronous on purpose: callers check this inside a click handler, right
// before opening the file picker, and browsers only allow that in the same tick.
// In API mode this reads the last settings the app fetched (see warmStorageCache, called once from the
// dashboard shell) rather than asking the server fresh every time.
export function getUploadTarget() {
  const { provider, preferences } = settingsStore;
  if (preferences.externalEnabled && provider) {
    const definition = getStorageProvider(provider.providerKey);
    return { allowed: true, storage: 'external', label: definition?.label || 'External storage', provider };
  }
  if (preferences.serverEnabled) {
    return { allowed: true, storage: 'server', label: 'Server', provider: null };
  }
  return {
    allowed: false,
    reason: 'Turn on Server storage or External storage under Settings → Storage, then try again.',
  };
}

// The "test" calls never reject in mock mode (a bad field just resolves with { ok: false }), so the API
// branch normalizes network/validation failures the same way — the caller never needs its own .catch.
// Talking to a real external storage provider (or waking up a sleeping free-tier backend first)
// is slower than a normal API call — the shared client's default 15s timeout is too tight for
// these specifically.
const NETWORK_TIMEOUT_MS = 30000;

function runProviderTest(providerKey, values, kind) {
  return axiosClient
    .post(`/storage/providers/${providerKey}/test`, { values, kind }, { timeout: NETWORK_TIMEOUT_MS })
    .then((response) => response.data)
    .catch((error) => ({ ok: false, message: apiErrorMessage(error) }));
}

export function testStorageConnection(providerKey, values) {
  if (API_ENABLED) return runProviderTest(providerKey, values, 'connection');
  const hasSavedSecrets = settingsStore.provider?.providerKey === providerKey;
  const bad = findBadField(providerKey, values, { hasSavedSecrets });
  if (bad) return mockRequest({ ok: false, message: `${bad.message} Check the details and try again.` });
  return mockRequest({
    ok: true,
    message: 'Connection works — the app could write, read and delete a small test file.',
  });
}

export function testStorageUpload(providerKey, values) {
  if (API_ENABLED) return runProviderTest(providerKey, values, 'upload');
  const hasSavedSecrets = settingsStore.provider?.providerKey === providerKey;
  const bad = findBadField(providerKey, values, { hasSavedSecrets });
  if (bad) return mockRequest({ ok: false, message: `${bad.message} Check the details and try again.` });

  const base = String(values.publicBaseUrl || '').trim().replace(/\/$/, '') || `https://${values.bucket || 'files'}.example-storage.com`;
  return mockRequest({
    ok: true,
    message: `Test file uploaded and opened from its public link: ${base}/social-test-${Date.now().toString(36)}.png`,
  });
}

export function saveStorageProvider(providerKey, values) {
  if (API_ENABLED) {
    return axiosClient.put(`/storage/providers/${providerKey}`, { values }, { timeout: NETWORK_TIMEOUT_MS }).then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  const bad = findBadField(providerKey, values, { hasSavedSecrets: settingsStore.provider?.providerKey === providerKey });
  if (bad) return mockFailure(bad.message);

  const provider = getStorageProvider(providerKey);
  const previous = settingsStore.provider?.providerKey === providerKey ? settingsStore.provider : null;
  const publicValues = {};
  const secretHints = {};
  provider.fields.forEach((field) => {
    const value = String(values[field.key] || '').trim();
    if (field.secret) {
      secretHints[field.key] = value ? maskSecret(value) : previous?.secretHints?.[field.key] || '';
    } else {
      publicValues[field.key] = value;
    }
  });

  settingsStore = {
    ...settingsStore,
    provider: {
      providerKey,
      values: publicValues,
      secretHints,
      connectedAt: previous?.connectedAt || new Date().toISOString(),
      lastTestedAt: new Date().toISOString(),
      lastTestMessage: 'Connection works — the app could write, read and delete a small test file.',
    },
  };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

// Disconnecting never touches files already uploaded — it only stops new
// uploads from going there.
export function disconnectStorage() {
  if (API_ENABLED) {
    return axiosClient.delete('/storage/provider').then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  settingsStore = {
    provider: null,
    preferences: { ...settingsStore.preferences, externalEnabled: false },
  };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

export function saveStoragePreferences(preferences) {
  if (API_ENABLED) {
    return axiosClient.put('/storage/preferences', preferences).then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  if (preferences.externalEnabled && !settingsStore.provider) {
    return mockFailure('Connect a storage provider before turning External storage on.');
  }
  settingsStore = { ...settingsStore, preferences: { ...preferences } };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

export function getStorageLimitBytes() {
  const { limitValue, limitUnit } = settingsStore.preferences;
  const amount = Number(limitValue);
  if (!amount || amount <= 0) return null;
  const multiplier = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[limitUnit] || 1024 ** 3;
  return amount * multiplier;
}
