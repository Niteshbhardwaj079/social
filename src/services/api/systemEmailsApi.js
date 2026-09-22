import { mockRequest } from '../mock/mockRequest';
import systemEmailsMockData from '../mock/systemEmailsMock';
import { getDefaultEmailContent } from '../../i18n/emailContent';
import { getLanguage } from '../../i18n/languages';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

// Shared by every language: whether the email is sent at all, and its images.
let systemEmailsStore = systemEmailsMockData.map((email) => ({ ...email, images: [...email.images] }));

// Edits are kept PER EMAIL AND PER LANGUAGE: overrides[emailId][languageCode] = { subject, html }.
// An edit in Hindi never touches the Arabic (or English) copy of the same email.
let overrides = {};

function customisedLanguagesOf(emailId) {
  return Object.keys(overrides[emailId] || {});
}

// The email as one language sees it: its own subject/html, plus the original text to reset to.
async function resolveEmail(email, languageCode) {
  const defaults = await getDefaultEmailContent(languageCode, email.mailKey);
  const custom = overrides[email.id]?.[languageCode];
  return {
    ...email,
    images: [...email.images],
    language: languageCode,
    defaultSubject: defaults.subject,
    defaultHtml: defaults.html,
    subject: custom ? custom.subject : defaults.subject,
    html: custom ? custom.html : defaults.html,
    customisedLanguages: customisedLanguagesOf(email.id),
  };
}

function findEmail(emailId) {
  return systemEmailsStore.find((email) => email.id === emailId);
}

export async function getSystemEmails(languageCode = 'en') {
  if (API_ENABLED) return axiosClient.get('/system-emails', { params: { lang: languageCode } }).then((response) => response.data.emails);
  const emails = await Promise.all(systemEmailsStore.map((email) => resolveEmail(email, languageCode)));
  return mockRequest(emails);
}

export async function updateSystemEmail(emailId, languageCode, updates) {
  if (API_ENABLED) return axiosClient.put(`/system-emails/${emailId}/translations/${languageCode}`, updates).then((response) => response.data.email);
  const defaults = await getDefaultEmailContent(languageCode, findEmail(emailId).mailKey);
  const previous = overrides[emailId]?.[languageCode] || { subject: defaults.subject, html: defaults.html };
  const next = { ...previous, ...updates };
  const nextOverrides = { ...(overrides[emailId] || {}) };
  if (next.subject === defaults.subject && next.html === defaults.html) delete nextOverrides[languageCode];
  else nextOverrides[languageCode] = next;
  overrides = { ...overrides, [emailId]: nextOverrides };
  return mockRequest(await resolveEmail(findEmail(emailId), languageCode));
}

export async function resetSystemEmail(emailId, languageCode) {
  if (API_ENABLED) return axiosClient.delete(`/system-emails/${emailId}/translations/${languageCode}`).then((response) => response.data.email);
  const nextOverrides = { ...(overrides[emailId] || {}) };
  delete nextOverrides[languageCode];
  overrides = { ...overrides, [emailId]: nextOverrides };
  return mockRequest(await resolveEmail(findEmail(emailId), languageCode));
}

export async function toggleSystemEmailEnabled(emailId, isEnabled, languageCode = 'en') {
  if (API_ENABLED) return axiosClient.patch(`/system-emails/${emailId}`, { isEnabled }, { params: { lang: languageCode } }).then((response) => response.data.email);
  systemEmailsStore = systemEmailsStore.map((email) => (email.id === emailId ? { ...email, isEnabled } : email));
  return mockRequest(await resolveEmail(findEmail(emailId), languageCode));
}

/**
 * `file` is the actual Blob (the crop tool's output) — only used in API mode, where the bytes really upload.
 * A rejection here is a raw axios error (like every other function in this file) — the page's own error
 * handler reads its message with `apiErrorMessage`.
 */
export function addSystemEmailImage(emailId, image, file) {
  if (API_ENABLED) {
    const form = new FormData();
    form.append('file', file, 'image.png');
    if (image.width) form.append('width', image.width);
    if (image.height) form.append('height', image.height);
    return axiosClient.post(`/system-emails/${emailId}/images`, form).then((response) => response.data.image);
  }
  const email = findEmail(emailId);
  const newImage = { id: `img-${Date.now()}`, ...image };
  const images = [newImage, ...(email?.images || [])];
  systemEmailsStore = systemEmailsStore.map((item) => (item.id === emailId ? { ...item, images } : item));
  return mockRequest(newImage);
}

export function removeSystemEmailImage(emailId, imageId) {
  if (API_ENABLED) {
    return axiosClient.delete(`/system-emails/${emailId}/images/${imageId}`).then(() => ({ success: true }));
  }
  systemEmailsStore = systemEmailsStore.map((item) =>
    item.id === emailId ? { ...item, images: item.images.filter((image) => image.id !== imageId) } : item
  );
  return mockRequest({ success: true });
}

// Resolves to { status: 'sent' | 'logged' | 'failed', error, to }.
export function sendTestSystemEmail(emailId, languageCode) {
  if (API_ENABLED) return axiosClient.post(`/system-emails/${emailId}/test`, { language: languageCode }).then((response) => response.data);
  return mockRequest({ success: true, emailId, language: languageCode });
}

/**
 * Phase 1 stand-in for the backend sending an email when something happens
 * (a user is invited, a password changes...). The recipient's OWN language picks
 * the copy — including any custom edit an admin made in that language. If the
 * email is switched off, nothing is sent.
 */
export async function dispatchSystemEmail(eventKey, recipientLanguage) {
  const email = systemEmailsStore.find((item) => item.eventKey === eventKey);
  if (!email || !email.isEnabled) return mockRequest({ sent: false, language: recipientLanguage });
  const language = getLanguage(recipientLanguage).code;
  const resolved = await resolveEmail(email, language);
  return mockRequest({ sent: true, language, subject: resolved.subject });
}
