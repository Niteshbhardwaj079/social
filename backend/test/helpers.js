import { createApp } from '../src/app.js';
import { prepareDatabase } from '../src/bootstrap.js';
import { pool, query } from '../src/db/pool.js';
import { ensureEmailRows } from '../src/services/systemEmailService.js';

export const PASSWORD = 'Sup3r-secret-pass';

/** Empties every table and puts the built-in rows back, so each test file starts from a clean slate. */
export async function resetDatabase() {
  await query(
    'TRUNCATE users, auth_tokens, settings, system_emails, system_email_translations, email_outbox, activity_logs, social_accounts, posts, post_targets, media_items, notifications, campaigns, recycling_entries, account_metrics_history, inbox_conversations, inbox_replies, ad_accounts, ad_campaigns, ad_sets, ad_creatives, ads, ad_daily_stats, ad_creative_templates, ad_rules, ad_rule_runs, short_links, short_link_clicks RESTART IDENTITY CASCADE'
  );
  // `roles` is seed/config data, like storage_settings below — a test may create custom roles or
  // edit the 5 built-in ones, so remove anything extra and put the built-in 5 back exactly as
  // migration 024 seeded them (keep this block's values in sync with that migration).
  await query("DELETE FROM roles WHERE id NOT IN ('superAdmin', 'admin', 'editor', 'contributor', 'analyst')");
  const ROLE_COLUMNS =
    'id, name, description, icon, accent, rank, is_protected, ' +
    'users_view, users_create, users_edit, users_delete, roles_create, roles_edit, roles_delete, ' +
    'posts_write, posts_publish, posts_delete, ' +
    'social_accounts_connect, social_accounts_edit, social_accounts_delete, ' +
    'ads_create, ads_edit, ads_delete, campaigns_create, campaigns_edit, campaigns_delete, reports_view, ' +
    'media_create, media_edit, media_delete, templates_create, templates_edit, templates_delete, ' +
    'activity_logs_view, activity_logs_delete, settings_view, settings_edit';
  const T = true;
  const F = false;
  const ROLE_SEEDS = [
    // id, name, description, icon, accent, rank, is_protected, then the 30 permission flags in ROLE_COLUMNS order.
    ['superAdmin', 'Super Admin', 'Full access to every module. Cannot be renamed, edited or deleted.', 'ShieldCheck', 'rose', 4, T, ...Array(30).fill(T)],
    ['admin', 'Admin', 'Manage users, content and settings.', 'Settings2', 'purple', 3, F, ...Array(30).fill(T)],
    [
      'editor', 'Editor', 'Create, edit and publish content across all connected accounts.', 'PenSquare', 'blue', 2, F,
      F, F, F, F, F, F, F, // users, roles
      T, T, T, // posts write/publish/delete
      F, F, F, // social accounts
      T, T, T, T, T, T, // ads, campaigns
      T, // reportsView
      T, T, T, T, T, T, // media, templates
      F, F, F, F, // activity logs, settings
    ],
    [
      'contributor', 'Contributor', 'Draft and submit content for approval; cannot publish directly.', 'Users', 'teal', 1, F,
      F, F, F, F, F, F, F,
      T, F, F, // posts: write only, not publish/delete (still deletes own via the ownership carve-out)
      F, F, F,
      F, F, F, F, F, F,
      T,
      T, T, T, F, F, F, // media yes, templates no
      F, F, F, F,
    ],
    [
      'analyst', 'Analyst', 'Read-only access to analytics and reporting.', 'BarChart3', 'slate', 1, F,
      F, F, F, F, F, F, F,
      F, F, F,
      F, F, F,
      F, F, F, F, F, F,
      T,
      F, F, F, F, F, F,
      F, F, F, F,
    ],
  ];
  const placeholders = (row, offset) => row.map((_, i) => `$${offset + i + 1}`).join(', ');
  for (const row of ROLE_SEEDS) {
    await query(
      `INSERT INTO roles (${ROLE_COLUMNS}) VALUES (${placeholders(row, 0)})
       ON CONFLICT (id) DO UPDATE SET ${ROLE_COLUMNS.split(', ')
         .slice(1)
         .map((column) => `${column} = excluded.${column}`)
         .join(', ')}`,
      row
    );
  }
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
