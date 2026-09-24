import { EmailProviderError } from './errors.js';

const API_BASE = 'https://api.sendgrid.com/v3';

async function request(apiKey, path, init = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...init.headers } });
  } catch {
    throw new EmailProviderError('Could not reach SendGrid. Check your internet connection and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new EmailProviderError(body?.errors?.[0]?.message || `SendGrid rejected the request (HTTP ${response.status}).`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

/** A valid key can always read its own account info, whatever its send permissions are. */
export async function testConnection(values) {
  await request(values.apiKey, '/user/account');
}

export async function sendMail(values, { toEmail, toName, subject, html }) {
  await request(values.apiKey, '/mail/send', {
    method: 'POST',
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail, name: toName || undefined }] }],
      from: { email: values.fromEmail, name: values.fromName || undefined },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}
