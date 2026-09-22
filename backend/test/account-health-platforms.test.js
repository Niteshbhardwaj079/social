import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';

// A dedicated, production-shaped sweep across all 12 platforms, checked against the user's own 6 rules:
//   1. temporary failure (network/5xx/429) never changes status away from 'connected'
//   2. a genuine credential problem gets a real (never 'disconnected') status, matching what the
//      platform's OWN words actually say — never a guessed distinction it can't support
//   3. 'disconnected' only ever comes from a manual Disconnect
//   4. the notification wording always matches the real status
//   5. reconnecting restores 'connected'
// (rule 6, "posting/scheduling still works", is covered by the full posts.test.js suite passing unmodified,
// which exercises the exact same connected-account code paths this file used to build/verify each account.)
const realFetch = globalThis.fetch;
let calls = [];
let platform = () => null;
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const networkError = () => {
  throw new Error('ECONNRESET');
};

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  const answer = await platform(url, init);
  return answer ?? reply(404, { error: 'not stubbed' });
};

let server;
let owner;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

/**
 * One entry per platform: `credentials` are realistic shapes already proven elsewhere in this test suite
 * (same field names/formats the connect form sends). `ok` answers every call needed for a successful
 * verify. `authFail` swaps in ONE realistic "credentials refused" response, shaped exactly the way that
 * platform's real API answers it (including whatever wording, or lack of it, that platform actually
 * uses) — never an invented shape. `tempFail` swaps in a 503 from that same platform. `expectStatus`
 * is what a real, honest reading of that response should produce; `expectNotification` is the type it
 * must raise (or `null` when the platform's failure shape doesn't clearly signal a problem — not tested
 * here for every platform, since http.js's classification is platform-agnostic and already covered).
 */
const PLATFORMS = {
  bluesky: {
    credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' },
    ok: (url) => {
      if (url.hostname !== 'bsky.social') return null;
      if (url.pathname.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
      if (url.pathname.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 42 });
      return null;
    },
    authFail: (url) => (url.hostname === 'bsky.social' && url.pathname.endsWith('createSession') ? reply(401, { error: 'AuthenticationRequired', message: 'Invalid identifier or password' }) : null),
    tempFail: (url) => (url.hostname === 'bsky.social' && url.pathname.endsWith('createSession') ? reply(503, {}) : null),
    expectStatus: 'auth_error', // Bluesky's own message never says expired/revoked — honest generic bucket
    expectNotification: 'accountNeedsAttention',
  },
  mastodon: {
    credentials: { instanceUrl: 'https://93.184.216.34', accessToken: 'mastodon-token-123' },
    ok: (url) => (url.hostname === '93.184.216.34' && url.pathname === '/api/v1/accounts/verify_credentials' ? reply(200, { id: '7', username: 'g', acct: 'g', display_name: 'G', followers_count: 1 }) : null),
    authFail: (url) => (url.hostname === '93.184.216.34' && url.pathname === '/api/v1/accounts/verify_credentials' ? reply(401, { error: 'The access token was revoked' }) : null), // Mastodon's real, documented revoke response
    tempFail: (url) => (url.hostname === '93.184.216.34' && url.pathname === '/api/v1/accounts/verify_credentials' ? reply(503, {}) : null),
    expectStatus: 'revoked',
    expectNotification: 'accountRevoked',
  },
  x: {
    credentials: { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' },
    ok: (url) => (url.hostname === 'api.x.com' && url.pathname === '/2/users/me' ? reply(200, { data: { id: '42', name: 'G', username: 'g', public_metrics: { followers_count: 5 } } }) : null),
    authFail: (url) => (url.hostname === 'api.x.com' && url.pathname === '/2/users/me' ? reply(401, { title: 'Unauthorized', detail: 'Invalid or expired token.', type: 'about:blank#not-authorized-error' }) : null),
    tempFail: (url) => (url.hostname === 'api.x.com' && url.pathname === '/2/users/me' ? reply(503, {}) : null),
    expectStatus: 'token_expired',
    expectNotification: 'tokenExpired',
  },
  facebook: {
    credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' },
    ok: (url) => {
      if (url.hostname !== 'graph.facebook.com') return null;
      if (url.pathname.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
      if (url.pathname.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart', followers_count: 100 });
      return null;
    },
    authFail: (url) => (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/debug_token') ? reply(200, { data: { is_valid: false } }) : null), // Meta's real "invalid" shape
    tempFail: (url) => (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/debug_token') ? reply(503, {}) : null),
    expectStatus: 'auth_error', // Meta's own docs: error 190 covers expired AND revoked, indistinguishably
    expectNotification: 'accountNeedsAttention',
  },
  instagram: {
    credentials: { appId: '111222', appSecret: 'appsecret-abc', igUserId: '17841400000000000', accessToken: 'ig-token-123' },
    ok: (url) => {
      if (url.hostname !== 'graph.facebook.com') return null;
      if (url.pathname.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
      if (url.pathname.endsWith('/17841400000000000')) return reply(200, { id: '17841400000000000', username: 'gowebkart', followers_count: 50 });
      return null;
    },
    authFail: (url) => (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/debug_token') ? reply(200, { data: { is_valid: false } }) : null),
    tempFail: (url) => (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/debug_token') ? reply(503, {}) : null),
    expectStatus: 'auth_error',
    expectNotification: 'accountNeedsAttention',
  },
  threads: {
    credentials: { appId: '111222', appSecret: 'appsecret-abc', threadsUserId: 'threads-user-1', accessToken: 'th-token-123' },
    ok: (url) => (url.hostname === 'graph.threads.net' && url.pathname === '/v1.0/me' ? reply(200, { id: 'threads-user-1', username: 'g', name: 'G' }) : null),
    // Meta's real OAuthException shape — code 190 is caught before any text is read, by design (see facebook/instagram above).
    authFail: (url) => (url.hostname === 'graph.threads.net' && url.pathname === '/v1.0/me' ? reply(400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } }) : null),
    tempFail: (url) => (url.hostname === 'graph.threads.net' && url.pathname === '/v1.0/me' ? reply(503, {}) : null),
    expectStatus: 'auth_error', // deliberately NOT token_expired, even though Meta's text says "expired" — see rationale above
    expectNotification: 'accountNeedsAttention',
  },
  linkedin: {
    credentials: { clientId: 'cid', clientSecret: 'csecret', accessToken: 'li-token-123' },
    ok: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/userinfo' ? reply(200, { sub: 'li-user-1', name: 'G', given_name: 'G', family_name: '' }) : null),
    authFail: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/userinfo' ? reply(401, { message: 'The token used in the request has expired', status: 401 }) : null), // LinkedIn's real shape
    tempFail: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/userinfo' ? reply(503, {}) : null),
    expectStatus: 'token_expired',
    expectNotification: 'tokenExpired',
  },
  linkedinCompany: {
    credentials: { clientId: 'cid', clientSecret: 'csecret', organizationId: '87654321', accessToken: 'li-token-123' },
    ok: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/organizations/87654321' ? reply(200, { id: '87654321', localizedName: 'Gowebkart Pvt Ltd', vanityName: 'gowebkart' }) : null),
    authFail: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/organizations/87654321' ? reply(401, { message: 'The token used in the request has been revoked', status: 401 }) : null),
    tempFail: (url) => (url.hostname === 'api.linkedin.com' && url.pathname === '/v2/organizations/87654321' ? reply(503, {}) : null),
    expectStatus: 'revoked',
    expectNotification: 'accountRevoked',
  },
  youtube: {
    credentials: { clientId: 'yt-client.apps.googleusercontent.com', clientSecret: 'yt-secret', refreshToken: 'yt-refresh-123' },
    ok: (url, init) => {
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return String(init.body).includes('refresh_token=yt-refresh-123') ? reply(200, { access_token: 'yt-access' }) : reply(400, { error: 'invalid_grant' });
      }
      if (url.hostname === 'www.googleapis.com' && url.pathname === '/youtube/v3/channels') {
        return init.headers.authorization === 'Bearer yt-access' ? reply(200, { items: [{ id: 'UC1', snippet: { title: 'Gowebkart', customUrl: '@gowebkart' }, statistics: { subscriberCount: '10' } }] }) : reply(401, {});
      }
      return null;
    },
    authFail: (url) => (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' ? reply(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) : null), // Google's real, documented-ambiguous code
    tempFail: (url) => (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' ? reply(503, {}) : null),
    expectStatus: 'auth_error', // deliberately not guessed further — invalid_grant covers both, by Google's own docs
    expectNotification: 'accountNeedsAttention',
  },
  googleBusiness: {
    credentials: { clientId: 'gb-client.apps.googleusercontent.com', clientSecret: 'gb-secret', locationId: '1234567890123456789', refreshToken: 'gb-refresh-123' },
    ok: (url, init) => {
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return String(init.body).includes('refresh_token=gb-refresh-123') ? reply(200, { access_token: 'gb-access' }) : reply(400, { error: 'invalid_grant' });
      }
      if (url.hostname === 'mybusinessbusinessinformation.googleapis.com') {
        return init.headers.authorization === 'Bearer gb-access' ? reply(200, { name: `locations/1234567890123456789`, title: 'Gowebkart' }) : reply(401, {});
      }
      return null;
    },
    authFail: (url) => (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' ? reply(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) : null),
    tempFail: (url) => (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' ? reply(503, {}) : null),
    expectStatus: 'auth_error',
    expectNotification: 'accountNeedsAttention',
  },
  pinterest: {
    credentials: { appId: 'app-id-1', appSecret: 'app-secret-1', accessToken: 'pin-token-1' },
    ok: (url) => (url.hostname === 'api.pinterest.com' && url.pathname === '/v5/user_account' ? reply(200, { id: 'p', username: 'gowebkart', follower_count: 12 }) : null),
    authFail: (url) => (url.hostname === 'api.pinterest.com' && url.pathname === '/v5/user_account' ? reply(401, { code: 1, message: 'Invalid or expired access token.' }) : null), // Pinterest's real shape
    tempFail: (url) => (url.hostname === 'api.pinterest.com' && url.pathname === '/v5/user_account' ? reply(503, {}) : null),
    expectStatus: 'token_expired',
    expectNotification: 'tokenExpired',
  },
  tiktok: {
    credentials: { clientKey: 'tk-key', clientSecret: 'tk-secret', accessToken: 'tk-token-123' },
    ok: (url) => (url.hostname === 'open.tiktokapis.com' && url.pathname.endsWith('/creator_info/query/') ? reply(200, { data: { creator_username: 'g', creator_nickname: 'G' }, error: { code: 'ok' } }) : null),
    // TikTok signals a bad token via a `code` field inside a 200, not an HTTP status — this app only pattern-matches
    // the code (not any free text), so it lands in the same honest bucket regardless of what TikTok's message says.
    authFail: (url) => (url.hostname === 'open.tiktokapis.com' && url.pathname.endsWith('/creator_info/query/') ? reply(200, { data: {}, error: { code: 'access_token_invalid', message: 'The access token is invalid or has expired.' } }) : null),
    tempFail: (url) => (url.hostname === 'open.tiktokapis.com' && url.pathname.endsWith('/creator_info/query/') ? reply(503, {}) : null),
    expectStatus: 'auth_error',
    expectNotification: 'accountNeedsAttention',
  },
};

describe('every platform: production-shaped health-check behavior', () => {
  for (const [key, config] of Object.entries(PLATFORMS)) {
    it(`${key}: temporary failure keeps 'connected'; a real refusal gets '${config.expectStatus}', never 'disconnected'; reconnect recovers`, async () => {
      await query('TRUNCATE social_accounts');

      // 1) Connect for real.
      platform = config.ok;
      const connected = await owner.put(`/social-accounts/${key}`, { credentials: config.credentials });
      assert.equal(connected.status, 200, `connect ${key}`);
      assert.equal(connected.body.account.status, 'connected', `${key} should be connected after a good verify`);

      // 2) Temporary failures (network blip, then a 5xx) must never move it off 'connected'.
      platform = networkError;
      const networkBlip = await owner.post(`/social-accounts/${key}/recheck`);
      assert.equal(networkBlip.status, 200, `${key} recheck during a network blip should still succeed`);
      assert.equal(networkBlip.body.account.status, 'connected', `${key}: a network blip must not change status`);

      platform = config.tempFail;
      const fiveHundred = await owner.post(`/social-accounts/${key}/recheck`);
      assert.equal(fiveHundred.body.account.status, 'connected', `${key}: a 5xx must not change status`);

      // 3) A genuine, realistically-shaped credential refusal.
      platform = config.authFail;
      const refused = await owner.post(`/social-accounts/${key}/recheck`);
      assert.equal(refused.body.account.status, config.expectStatus, `${key}: wrong status for a real refusal`);
      assert.notEqual(refused.body.account.status, 'disconnected', `${key}: a health check must never produce 'disconnected'`);

      // 4) The notification matches the real status, and never claims "disconnected".
      const notified = (await owner.get('/notifications')).body.items;
      assert.ok(
        notified.some((item) => item.type === config.expectNotification && item.entityId === key),
        `${key}: expected a '${config.expectNotification}' notification`
      );
      assert.ok(!notified.some((item) => item.type === 'accountDisconnected' && item.entityId === key), `${key}: must never be worded "disconnected"`);

      // 5) Only a manual Disconnect produces 'disconnected'.
      const disconnected = await owner.delete(`/social-accounts/${key}`);
      assert.equal(disconnected.body.account.status, 'disconnected', `${key}: Disconnect should set 'disconnected'`);

      // 6) Reconnecting restores 'connected'.
      platform = config.ok;
      const reconnected = await owner.put(`/social-accounts/${key}`, { credentials: config.credentials });
      assert.equal(reconnected.status, 200, `reconnect ${key}`);
      assert.equal(reconnected.body.account.status, 'connected', `${key}: reconnecting should restore 'connected'`);
    });
  }
});
