import { createApp } from '../src/app.js';
import { prepareDatabase } from '../src/bootstrap.js';
import { pool, query, setFallbackContextForTests } from '../src/db/pool.js';
import { invalidateProviderCache } from '../src/services/emailSettingsService.js';

export const PASSWORD = 'Sup3r-secret-pass';

/**
 * Runs one statement as the database owner (not the restricted app role), e.g. TRUNCATE ... RESTART
 * IDENTITY, which only a sequence's owner may do. The connection is marked so pool.js re-applies
 * the app role and organization the next time it is used.
 */
async function asDatabaseOwner(sql) {
  const client = await pool.connect();
  try {
    await client.query('RESET ROLE');
    await client.query(sql);
  } finally {
    client.roleName = undefined;
    client.tenantKey = undefined;
    client.release();
  }
}

/**
 * Empties every table so each test file starts from a clean slate. Organizations (and with them
 * every tenant row, roles and settings included) are re-created by the next sign-up.
 */
export async function resetDatabase() {
  setFallbackContextForTests({ organizationId: null, system: true });
  await asDatabaseOwner(
    'TRUNCATE organizations, users, auth_tokens, settings, system_emails, system_email_translations, email_outbox, activity_logs, social_accounts, posts, post_targets, media_items, notifications, campaigns, recycling_entries, account_metrics_history, inbox_conversations, inbox_replies, ad_accounts, ad_campaigns, ad_sets, ad_creatives, ads, ad_daily_stats, ad_creative_templates, ad_rules, ad_rule_runs, short_links, short_link_clicks, roles, storage_settings, email_settings, subscriptions, payments, invoices, subscription_events, ai_provider_keys, ai_settings, ai_generations, ai_autopilots, platform_ai_keys, ai_brand_kits, ai_research_reports, ai_content_plans RESTART IDENTITY CASCADE'
  );
  // Feature tests start every new organization on Enterprise (no limits), so a plan limit never gets in
  // the way of what they actually test. billing.test.js switches this back to check the limits themselves.
  await query(`UPDATE platform_settings SET value = '{"trialPlanId": "enterprise", "trialDays": 3650}' WHERE id = true`);
  invalidateProviderCache();
}

/** From now on, queries and service calls made directly by a test run inside this organization. */
export function useOrganization(organizationId) {
  setFallbackContextForTests({ organizationId, system: false });
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
  // Tests that read/write the database directly now work inside this new organization.
  if (response.body?.user?.organization?.id) useOrganization(response.body.user.organization.id);
  return { client, user: response.body.user, response };
}
