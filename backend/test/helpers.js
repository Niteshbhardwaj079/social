import { createApp } from '../src/app.js';
import { prepareDatabase } from '../src/bootstrap.js';
import { pool, query } from '../src/db/pool.js';
import { ensureEmailRows } from '../src/services/systemEmailService.js';

export const PASSWORD = 'Sup3r-secret-pass';

/** Empties every table and puts the built-in rows back, so each test file starts from a clean slate. */
export async function resetDatabase() {
  await query(
    'TRUNCATE users, auth_tokens, settings, system_emails, system_email_translations, email_outbox, activity_logs, social_accounts, posts, post_targets, media_items, notifications, campaigns, recycling_entries, account_metrics_history, inbox_conversations, inbox_replies RESTART IDENTITY CASCADE'
  );
  // storage_settings always has exactly one row (id=true); TRUNCATE would remove it, so reset it in place instead.
  await query(
    `UPDATE storage_settings SET server_enabled = true, external_enabled = false, limit_value = NULL, limit_unit = 'GB',
        provider_key = NULL, provider_values = '{}', secret_hints = '{}', credentials = NULL,
        connected_at = NULL, last_tested_at = NULL, last_test_message = NULL WHERE id = true`
  );
  await ensureEmailRows();
}

export async function startServer() {
  await prepareDatabase();
  await resetDatabase();
  const server = await new Promise((resolve) => {
    const listening = createApp().listen(0, '127.0.0.1', () => resolve(listening));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

/** A tiny HTTP client that keeps the refresh cookie like a browser would. */
export function createClient(baseUrl) {
  let cookie = null;
  const client = {
    accessToken: null,
    get refreshCookie() {
      return cookie;
    },
    set refreshCookie(value) {
      cookie = value;
    },
    async request(method, path, { body, token = client.accessToken, headers = {}, raw } = {}) {
      const response = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
      const setCookie = response.headers.getSetCookie?.() ?? [];
      const refresh = setCookie.find((value) => value.startsWith('social_rt='));
      if (refresh) cookie = refresh.startsWith('social_rt=;') ? null : refresh.split(';')[0];
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // not JSON
      }
      return { status: response.status, body: json, headers: response.headers, setCookie, text };
    },
    get: (path, options) => client.request('GET', path, options),
    post: (path, body, options) => client.request('POST', path, { body, ...options }),
    patch: (path, body, options) => client.request('PATCH', path, { body, ...options }),
    put: (path, body, options) => client.request('PUT', path, { body, ...options }),
    delete: (path, options) => client.request('DELETE', path, options),
    /** Signs in and remembers the access token. */
    async signIn(email, password = PASSWORD) {
      const response = await client.post('/auth/login', { email, password });
      if (response.status === 200) client.accessToken = response.body.accessToken;
      return response;
    },
  };
  return client;
}

/** Waits until `check()` returns something truthy (background email delivery is asynchronous). */
export async function waitFor(check, { timeout = 4000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export const outboxFor = (email) =>
  query('SELECT * FROM email_outbox WHERE to_email = $1 ORDER BY created_at', [email]).then((result) => result.rows);

/** Pulls the ?token=... out of the link in a stored email. */
export function tokenFromEmail(html, path) {
  const match = html.match(new RegExp(`${path}\\?token=([^"&<\\s]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Creates the workspace owner and returns a signed-in client. */
export async function setupOwner(baseUrl, overrides = {}) {
  const client = createClient(baseUrl);
  const body = { name: 'Nitesh Owner', email: 'owner@example.com', password: PASSWORD, companyName: 'Acme', ...overrides };
  const response = await client.post('/auth/register', body);
  client.accessToken = response.body.accessToken;
  return { client, user: response.body.user, response };
}
