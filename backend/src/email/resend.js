import { EmailProviderError } from './errors.js';

const API_BASE = 'https://api.resend.com';
const sanitize = (value) => String(value).replace(/["<>\r\n]/g, '');
const addressOf = (email, name) => (name ? `${sanitize(name)} <${email}>` : email);

async function request(apiKey, path, init = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...init.headers } });
  } catch {
    throw new EmailProviderError('Could not reach Resend. Check your internet connection and try again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new EmailProviderError(body?.message || `Resend rejected the request (HTTP ${response.status}).`);
  return body;
}

/** No dedicated "verify key" endpoint — listing domains needs no specific permission beyond a valid key, so it doubles as one. */
export async function testConnection(values) {
  await request(values.apiKey, '/domains');
}

export async function sendMail(values, { toEmail, toName, subject, html }) {
  await request(values.apiKey, '/emails', {
    method: 'POST',
    body: JSON.stringify({ from: addressOf(values.fromEmail, values.fromName), to: [addressOf(toEmail, toName)], subject, html }),
  });
}
