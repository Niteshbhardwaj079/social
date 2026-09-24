import { EmailProviderError } from './errors.js';

const API_BASE = 'https://api.brevo.com/v3';

async function request(apiKey, path, init = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json', ...init.headers } });
  } catch {
    throw new EmailProviderError('Could not reach Brevo. Check your internet connection and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new EmailProviderError(body?.message || `Brevo rejected the request (HTTP ${response.status}).`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

/** A valid key can always read its own account info. */
export async function testConnection(values) {
  await request(values.apiKey, '/account');
}

export async function sendMail(values, { toEmail, toName, subject, html }) {
  await request(values.apiKey, '/smtp/email', {
    method: 'POST',
    body: JSON.stringify({
      sender: { email: values.fromEmail, name: values.fromName || undefined },
      to: [{ email: toEmail, name: toName || undefined }],
      subject,
      htmlContent: html,
    }),
  });
}
