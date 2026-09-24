import { mockRequest } from '../mock/mockRequest';
import { API_ENABLED } from '../../config/runtime';
import axiosClient, { apiErrorMessage } from './axiosClient';

function mockFailure(message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), 500);
  });
}

function maskSecret(value) {
  return `••••${String(value).slice(-4)}`;
}

const EMPTY_SETTINGS = {
  configured: false,
  host: '',
  port: 587,
  secure: false,
  username: '',
  fromEmail: '',
  fromName: '',
  passwordHint: '',
  connectedAt: null,
  lastTestedAt: null,
  lastTestMessage: '',
};

// Phase 1 keeps this in memory, same as storageApi. The real password is never kept in the
// settings object itself (only a masked hint) — it lives separately, exactly like the backend's
// encrypted `credentials` column vs. its plain `secret_hint`.
let settingsStore = { ...EMPTY_SETTINGS };
let savedPassword = '';

function remember(settings) {
  settingsStore = settings;
  return settings;
}

function findBadField(values, { hasSavedPassword }) {
  if (!String(values.host || '').trim()) return { field: 'host', message: 'Host is required.' };
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { field: 'port', message: 'Enter a valid port.' };
  if (!String(values.fromEmail || '').trim()) return { field: 'fromEmail', message: 'From email is required.' };
  if (!String(values.password || '').trim() && !hasSavedPassword) return { field: 'password', message: 'Password is required.' };
  return null;
}

export function getEmailSettings() {
  if (API_ENABLED) return axiosClient.get('/email-settings').then((response) => remember(response.data));
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

function runTest(values) {
  return axiosClient
    .post('/email-settings/test', values)
    .then((response) => response.data)
    .catch((error) => ({ ok: false, message: apiErrorMessage(error) }));
}

export function testEmailSettings(values) {
  if (API_ENABLED) return runTest(values);
  const bad = findBadField(values, { hasSavedPassword: Boolean(savedPassword) });
  if (bad) return mockRequest({ ok: false, message: `${bad.message} Check the details and try again.` });
  return mockRequest({ ok: true, message: 'Connected — the mail server accepted the login.' });
}

export function saveEmailSettings(values) {
  if (API_ENABLED) {
    return axiosClient.put('/email-settings', values).then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  const bad = findBadField(values, { hasSavedPassword: Boolean(savedPassword) });
  if (bad) return mockFailure(bad.message);
  if (values.password) savedPassword = values.password;

  settingsStore = {
    configured: true,
    host: values.host,
    port: Number(values.port),
    secure: Boolean(values.secure),
    username: values.username || '',
    fromEmail: values.fromEmail,
    fromName: values.fromName || '',
    passwordHint: maskSecret(savedPassword),
    connectedAt: settingsStore.connectedAt || new Date().toISOString(),
    lastTestedAt: new Date().toISOString(),
    lastTestMessage: 'Connected — the mail server accepted the login.',
  };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

export function disconnectEmailSettings() {
  if (API_ENABLED) {
    return axiosClient.delete('/email-settings').then(
      (response) => remember(response.data),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  savedPassword = '';
  settingsStore = { ...EMPTY_SETTINGS };
  return mockRequest(JSON.parse(JSON.stringify(settingsStore)));
}

export function sendTestEmail(recipient) {
  if (API_ENABLED) {
    return axiosClient
      .post('/email-settings/send-test', { recipient })
      .then((response) => response.data)
      .catch((error) => {
        throw new Error(apiErrorMessage(error));
      });
  }
  return mockRequest({ status: settingsStore.configured ? 'sent' : 'logged' });
}
