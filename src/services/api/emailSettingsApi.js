import { mockRequest } from '../mock/mockRequest';
import { getEmailProvider } from '../../config/emailProviders';
import { API_ENABLED } from '../../config/runtime';
import axiosClient, { apiErrorMessage } from './axiosClient';

const MIN_CREDENTIAL_LENGTH = 6;

// mockRequest only resolves, so failures need their own delayed rejection.
function mockFailure(message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), 500);
  });
}

// Talking to a real mail server or a real HTTPS API (or waking up a sleeping free-tier backend
// first) is slower than a normal API call — the shared client's default 15s timeout is too tight
// for these specifically.
const NETWORK_TIMEOUT_MS = 30000;

// Phase 1 keeps this in memory, same as storageApi. The real secret is never kept in the settings
// object itself (only a masked hint) — it lives separately, exactly like the backend's encrypted
// `credentials` column vs. its plain `secret_hints`.
let settingsStore = { provider: null };

function maskSecret(value) {
  return `••••${String(value).slice(-4)}`;
}

function findBadField(uiKey, values, { hasSavedSecrets = false } = {}) {
  const provider = getEmailProvider(uiKey);
  for (const field of provider.fields) {
    if (provider.locked && (field.key === 'host' || field.key === 'port' || field.key === 'secure')) continue;
    const value = String(values[field.key] || '').trim();
    if (!value && field.required) {
      // A saved secret can be left blank — the backend keeps using the stored one.
      if (field.secret && hasSavedSecrets) continue;
      return { message: `${field.label} is required.` };
    }
    if (value && field.type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) {
      return { message: `${field.label} must be a valid email address.` };
    }
    if (value && field.secret && value.length < MIN_CREDENTIAL_LENGTH) {
      return { message: `${field.label} looks too short to be valid.` };
    }
  }
  return null;
}

function remember(settings) {
  settingsStore = settings;
  return settings;
}

export function getEmailSettings() {
  if (API_ENABLED) return axiosClient.get('/email-settings').then((response) => remember(response.data));
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

function runProviderTest(backendKey, values) {
  return axiosClient
    .post(`/email-settings/providers/${backendKey}/test`, { values }, { timeout: NETWORK_TIMEOUT_MS })
    .then((response) => response.data)
    .catch((error) => ({ ok: false, message: apiErrorMessage(error) }));
}

export function testEmailProvider(uiKey, values) {
  const provider = getEmailProvider(uiKey);
  if (API_ENABLED) return runProviderTest(provider.backendKey, values);
  const hasSavedSecrets = settingsStore.provider?.providerKey === provider.backendKey;
  const bad = findBadField(uiKey, values, { hasSavedSecrets });
  if (bad) return mockRequest({ ok: false, message: `${bad.message} Check the details and try again.` });
  return mockRequest({ ok: true, message: 'Connected — the details were accepted.' });
}

export function saveEmailProvider(uiKey, values) {
  const provider = getEmailProvider(uiKey);
  if (API_ENABLED) {
    return axiosClient.put(`/email-settings/providers/${provider.backendKey}`, { values }, { timeout: NETWORK_TIMEOUT_MS }).then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  const hasSavedSecrets = settingsStore.provider?.providerKey === provider.backendKey;
  const bad = findBadField(uiKey, values, { hasSavedSecrets });
  if (bad) return mockFailure(bad.message);

  const previous = hasSavedSecrets ? settingsStore.provider : null;
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
  if (provider.locked) {
    publicValues.host = provider.host;
    publicValues.port = provider.port;
    publicValues.secure = provider.secure;
  } else if (provider.backendKey === 'smtp') {
    publicValues.host = values.host || '';
    publicValues.port = Number(values.port) || 587;
    publicValues.secure = Boolean(values.secure);
  }

  settingsStore = {
    provider: {
      providerKey: provider.backendKey,
      values: publicValues,
      secretHints,
      connectedAt: previous?.connectedAt || new Date().toISOString(),
      lastTestedAt: new Date().toISOString(),
      lastTestMessage: 'Connected — the details were accepted.',
    },
  };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

// Disconnecting only stops new email from going out through it.
export function disconnectEmailProvider() {
  if (API_ENABLED) {
    return axiosClient.delete('/email-settings/provider').then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  settingsStore = { provider: null };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

export function sendTestEmail(recipient) {
  if (API_ENABLED) {
    return axiosClient
      .post('/email-settings/send-test', { recipient }, { timeout: NETWORK_TIMEOUT_MS })
      .then((response) => response.data)
      .catch((error) => {
        throw new Error(apiErrorMessage(error));
      });
  }
  return mockRequest({ status: settingsStore.provider ? 'sent' : 'logged' });
}
