import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { decryptJson, encryptJson } from '../src/utils/crypto.js';
import { oauth1Signature } from '../src/providers/oauth1.js';
import { getCredentials, recheckAll } from '../src/services/socialAccountService.js';

// Nothing here reaches a real platform: calls to anything except our own test server are answered by `platform`.
const realFetch = globalThis.fetch;
let calls = [];
let platform = () => null;

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  const answer = await platform(url, init);
  return answer ?? reply(404, { error: 'not stubbed' });
};

afterEach(() => {
  calls = [];
  platform = () => null;
});

const APP_PASSWORD = 'abcd-efgh-ijkl-mnop';
const bluesky = { handle: 'nitesh.bsky.social', appPassword: APP_PASSWORD };
const blueskyPlatform = (url) => {
  if (url.pathname.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
  if (url.pathname.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 321 });
  return null;
};

let server;
let owner;
let editor;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  await owner.post('/users', { name: 'Ed Itor', email: 'ed@example.com', role: 'editor', language: 'en' });
  const invite = (await query("SELECT id FROM users WHERE email = 'ed@example.com'")).rows[0];
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE id = $1", [invite.id]);
  editor = createClient(server.baseUrl);
  assert.equal((await editor.signIn('ed@example.com')).status, 200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

const reset = () => query('TRUNCATE social_accounts');

describe('who can do what', () => {
  it('needs a sign-in', async () => {
    assert.equal((await createClient(server.baseUrl).get('/social-accounts')).status, 401);
  });

  it('lists all 12 platforms as not connected, for anyone signed in', async () => {
    for (const client of [owner, editor]) {
      const response = await client.get('/social-accounts');
      assert.equal(response.status, 200);
      assert.equal(response.body.accounts.length, 12);
      assert.ok(response.body.accounts.every((account) => account.status === 'disconnected' && account.followers === 0));
      assert.deepEqual(response.body.accounts.slice(0, 3).map((account) => account.platform), ['facebook', 'instagram', 'x']);
    }
  });

  it('keeps managing accounts for Super Admins and Admins', async () => {
    assert.equal((await editor.post('/social-accounts/bluesky/test', { credentials: bluesky })).status, 403);
    assert.equal((await editor.put('/social-accounts/bluesky', { credentials: bluesky })).status, 403);
    assert.equal((await editor.post('/social-accounts/bluesky/recheck')).status, 403);
    assert.equal((await editor.delete('/social-accounts/bluesky')).status, 403);
    assert.equal(calls.length, 0, 'the platform was never contacted');
  });

  it('rejects an unknown platform and missing fields, naming the field', async () => {
    assert.equal((await owner.put('/social-accounts/myspace', { credentials: {} })).status, 400);
    const missing = await owner.post('/social-accounts/x/test', { credentials: { apiKey: 'k', apiSecret: 's' } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.details[0].field, 'accessToken');
    assert.equal(calls.length, 0);
  });
});

describe('connecting an account', () => {
  it('"Test connection" checks with the platform but saves nothing', async () => {
    await reset();
    platform = blueskyPlatform;
    const response = await owner.post('/social-accounts/bluesky/test', { credentials: bluesky });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.match(response.body.message, /Nitesh B/);
    assert.equal((await query('SELECT count(*)::int AS n FROM social_accounts')).rows[0].n, 0);
  });

  it('"Save & connect" verifies again, stores the keys encrypted, and never returns them', async () => {
    await reset();
    platform = blueskyPlatform;
    const saved = await owner.put('/social-accounts/bluesky', { credentials: bluesky });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.account.status, 'connected');
    assert.equal(saved.body.account.accountName, 'Nitesh B');
    assert.equal(saved.body.account.handle, '@nitesh.bsky.social');
    assert.equal(saved.body.account.followers, 321);
    assert.doesNotMatch(saved.text, new RegExp(APP_PASSWORD));

    const stored = (await query("SELECT credentials FROM social_accounts WHERE platform = 'bluesky'")).rows[0].credentials;
    assert.doesNotMatch(stored, new RegExp(APP_PASSWORD), 'not stored as plain text');
    assert.deepEqual(decryptJson(stored), bluesky);
    assert.deepEqual(await getCredentials('bluesky'), bluesky);

    const list = await editor.get('/social-accounts');
    assert.doesNotMatch(list.text, new RegExp(APP_PASSWORD));
    assert.equal(list.body.accounts.find((account) => account.platform === 'bluesky').status, 'connected');

    const log = await owner.get('/activity-logs');
    assert.ok(log.body.activity.some((entry) => entry.action === 'social.connected' && entry.entityId === 'bluesky'));
  });

  it('refuses credentials the platform refuses, and saves nothing', async () => {
    await reset();
    platform = (url) => (url.pathname.endsWith('createSession') ? reply(401, { error: 'AuthenticationRequired' }) : null);
    const response = await owner.put('/social-accounts/bluesky', { credentials: bluesky });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'connection_failed');
    assert.equal(response.body.error.details.kind, 'auth');
    assert.match(response.body.error.message, /App Password/);
    assert.equal((await query('SELECT count(*)::int AS n FROM social_accounts')).rows[0].n, 0);
  });

  it('turns away a real Bluesky password before contacting anyone', async () => {
    await reset();
    const response = await owner.post('/social-accounts/bluesky/test', { credentials: { handle: 'a.bsky.social', appPassword: 'My-real-password-1' } });
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /never use your real password/i);
    assert.equal(calls.length, 0);
  });

  it('never lets a secret travel back inside a platform error message', async () => {
    await reset();
    platform = () => reply(400, { error: { message: `Invalid token TOKEN-1234567890 for app` } });
    const response = await owner.post('/social-accounts/pinterest/test', { credentials: { appId: 'app-id-1', appSecret: 'app-secret-1', accessToken: 'TOKEN-1234567890' } });
    assert.equal(response.body.ok, false);
    assert.doesNotMatch(response.text, /TOKEN-1234567890/);
    assert.match(response.body.message, /\*\*\*/);
  });

  it('survives a platform answering with nonsense or not at all', async () => {
    platform = () => reply(200, '<html>maintenance</html>');
    const nonsense = await owner.post('/social-accounts/pinterest/test', { credentials: { appId: 'app-id-1', appSecret: 'app-secret-1', accessToken: 'tok-123456' } });
    assert.equal(nonsense.status, 200);
    assert.equal(nonsense.body.ok, false);

    platform = () => {
      throw new Error('socket hang up');
    };
    const down = await owner.post('/social-accounts/pinterest/test', { credentials: { appId: 'app-id-1', appSecret: 'app-secret-1', accessToken: 'tok-123456' } });
    assert.equal(down.status, 200);
    assert.equal(down.body.ok, false);
    assert.match(down.body.message, /did not answer/);
  });

  it('a second connect replaces the first (one account per platform)', async () => {
    await reset();
    platform = blueskyPlatform;
    await owner.put('/social-accounts/bluesky', { credentials: bluesky });
    platform = (url) => (url.pathname.endsWith('getProfile') ? reply(200, { displayName: 'New Name', followersCount: 5 }) : blueskyPlatform(url));
    await owner.put('/social-accounts/bluesky', { credentials: { ...bluesky, appPassword: 'zzzz-yyyy-xxxx-wwww' } });
    assert.equal((await query('SELECT count(*)::int AS n FROM social_accounts')).rows[0].n, 1);
    assert.equal((await owner.get('/social-accounts')).body.accounts.find((account) => account.platform === 'bluesky').accountName, 'New Name');
    assert.equal((await getCredentials('bluesky')).appPassword, 'zzzz-yyyy-xxxx-wwww');
  });
});

describe('platform specifics', () => {
  const facebook = { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'EAAB-token-123' };

  it('Facebook: checks the token belongs to the app, and proves the App Secret on each call', async () => {
    await reset();
    platform = (url) => {
      if (url.pathname.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
      if (url.pathname.endsWith('/me')) return reply(200, { id: 'p1', name: 'Gowebkart', followers_count: 1800 });
      return null;
    };
    const saved = await owner.put('/social-accounts/facebook', { credentials: facebook });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.account.followers, 1800);
    const me = calls.find((call) => call.url.pathname.endsWith('/me'));
    assert.ok(me.url.searchParams.get('appsecret_proof'));
    assert.equal(me.init.headers.authorization, `Bearer ${facebook.accessToken}`);
    assert.equal(me.url.searchParams.has('access_token'), false, 'the token is sent in a header, not the address');

    platform = (url) => (url.pathname.endsWith('/debug_token') ? reply(200, { data: { app_id: '999', is_valid: true } }) : null);
    const wrongApp = await owner.post('/social-accounts/facebook/test', { credentials: facebook });
    assert.equal(wrongApp.body.ok, false);
    assert.match(wrongApp.body.message, /different app/);

    platform = (url) => (url.pathname.endsWith('/debug_token') ? reply(200, { data: { app_id: '111222', is_valid: false } }) : null);
    assert.match((await owner.post('/social-accounts/facebook/test', { credentials: facebook })).body.message, /expired/);
  });

  it('X: signs the request (OAuth 1.0a) and only Paid is kept for platforms that have a paid plan', async () => {
    await reset();
    platform = () => reply(200, { data: { id: '42', name: 'Gowebkart', username: 'gowebkart', public_metrics: { followers_count: 9600 } } });
    const keys = { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' };
    const saved = await owner.put('/social-accounts/x', { credentials: keys, apiTier: 'paid' });
    assert.equal(saved.body.account.apiTier, 'paid');
    assert.equal(saved.body.account.handle, '@gowebkart');
    const header = calls[0].init.headers.authorization;
    assert.match(header, /^OAuth /);
    for (const part of ['oauth_consumer_key="ck"', 'oauth_token="at"', 'oauth_signature_method="HMAC-SHA1"', 'oauth_signature="']) assert.ok(header.includes(part), part);

    platform = blueskyPlatform;
    const other = await owner.put('/social-accounts/bluesky', { credentials: bluesky, apiTier: 'paid' });
    assert.equal(other.body.account.apiTier, 'free', 'Bluesky has no paid plan');
  });

  it('OAuth 1.0a signing matches the worked example in the OAuth 1.0 specification (Appendix A.5)', () => {
    const signature = oauth1Signature({
      method: 'GET',
      url: 'http://photos.example.net/photos',
      params: { file: 'vacation.jpg', size: 'original' },
      oauthParams: {
        oauth_consumer_key: 'dpf43f3p2l4k3l03',
        oauth_token: 'nnch734d00sl2jdk',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1191242096',
        oauth_nonce: 'kllo9940pd9333jh',
        oauth_version: '1.0',
      },
      consumerSecret: 'kd94hf93k423kf44',
      tokenSecret: 'pfkkdhi9sl3r4s00',
    });
    assert.equal(signature, 'tR3+Ty81lMeYAr/Fid0kMTYa/WM=');
  });

  it('YouTube: trades the refresh token, and explains an expired one', async () => {
    await reset();
    const keys = { clientId: 'id.apps.googleusercontent.com', clientSecret: 'secret-1234', refreshToken: 'refresh-1234' };
    platform = (url, init) => {
      if (url.hostname === 'oauth2.googleapis.com') {
        return String(init.body).includes('refresh_token=refresh-1234') ? reply(200, { access_token: 'short-lived' }) : reply(400, { error: 'invalid_grant' });
      }
      if (url.pathname.endsWith('/channels')) {
        return init.headers.authorization === 'Bearer short-lived'
          ? reply(200, { items: [{ id: 'UC1', snippet: { title: 'Gowebkart', customUrl: '@gowebkart' }, statistics: { subscriberCount: '4200' } }] })
          : reply(401, {});
      }
      return null;
    };
    const saved = await owner.put('/social-accounts/youtube', { credentials: keys });
    assert.equal(saved.body.account.followers, 4200);
    assert.equal(saved.body.account.handle, '@gowebkart');

    const revoked = await owner.post('/social-accounts/youtube/test', { credentials: { ...keys, refreshToken: 'old-refresh' } });
    assert.match(revoked.body.message, /expired or was revoked/);
  });

  it('Mastodon: never contacts a private network address', async () => {
    const token = 'mastodon-token-123';
    for (const instanceUrl of ['https://127.0.0.1', 'https://localhost', 'https://10.0.0.5', 'https://192.168.1.10', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:10.0.0.1]']) {
      const response = await owner.post('/social-accounts/mastodon/test', { credentials: { instanceUrl, accessToken: token } });
      assert.equal(response.body.ok, false, instanceUrl);
      assert.match(response.body.message, /private network/, instanceUrl);
    }
    for (const instanceUrl of ['http://mastodon.social', 'mastodon.social', 'https://user:pass@mastodon.social']) {
      const response = await owner.post('/social-accounts/mastodon/test', { credentials: { instanceUrl, accessToken: token } });
      assert.equal(response.body.ok, false, instanceUrl);
      assert.match(response.body.message, /https/, instanceUrl);
    }
    assert.equal(calls.length, 0);
  });

  it('Mastodon: a public https server works', async () => {
    await reset();
    platform = (url) =>
      url.pathname === '/api/v1/accounts/verify_credentials'
        ? reply(200, { id: '7', username: 'gowebkart', acct: 'gowebkart', display_name: 'Gowebkart', followers_count: 88 })
        : null;
    const saved = await owner.put('/social-accounts/mastodon', { credentials: { instanceUrl: 'https://93.184.216.34', accessToken: 'mastodon-token-123' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.account.handle, '@gowebkart@93.184.216.34');
    assert.equal(calls[0].init.redirect, 'error', 'redirects are not followed');
  });
});

describe('keeping an account healthy', () => {
  async function connectBluesky() {
    await reset();
    platform = blueskyPlatform;
    await owner.put('/social-accounts/bluesky', { credentials: bluesky });
  }
  const statusOf = async () => (await owner.get('/social-accounts')).body.accounts.find((account) => account.platform === 'bluesky');

  it('"Sync now" refreshes the follower count', async () => {
    await connectBluesky();
    platform = (url) => (url.pathname.endsWith('getProfile') ? reply(200, { displayName: 'Nitesh B', followersCount: 999 }) : blueskyPlatform(url));
    const response = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(response.body.account.followers, 999);
    assert.equal(response.body.account.status, 'connected');
    assert.ok(response.body.account.lastSuccessAt, 'a successful check records when it last succeeded');
    assert.ok(response.body.account.lastCheckedAt, 'every attempt records when it was last checked, pass or fail');
  });

  it('no automatic health check — an unclear refusal, an expired token, a rate limit, an outage, or a network blip — ever produces "disconnected"; only the person clicking Disconnect can', async () => {
    await connectBluesky();
    const attempts = [
      () => reply(401, {}), // an unclear auth refusal
      () => reply(401, { error: { message: 'token expired' } }),
      () => reply(429, {}), // rate limited
      () => reply(503, {}), // platform down
      () => {
        throw new Error('ECONNRESET');
      }, // network blip
    ];
    for (const respond of attempts) {
      platform = (url) => (url.pathname.endsWith('createSession') ? respond(url) : null);
      const response = await owner.post('/social-accounts/bluesky/recheck');
      assert.notEqual(response.body.account.status, 'disconnected');
    }
    // recheckAll() (the 6-hourly pass) delegates to this exact same function for every account it checks,
    // so nothing extra could make it disconnect one either — proven directly in "the background pass..." below.
  });

  it('marks the account auth_error when the platform refuses it for an unclear reason, and says why', async () => {
    // Bluesky's own check does not say WHY the credentials were refused (no "expired"/"revoked" wording),
    // so this must land in the honest, generic bucket rather than guessing which one it really is.
    await connectBluesky();
    platform = (url) => (url.pathname.endsWith('createSession') ? reply(401, {}) : null);
    const response = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(response.body.account.status, 'auth_error');
    assert.match(response.body.account.lastError, /App Password/);
    const log = await owner.get('/activity-logs');
    assert.ok(log.body.activity.some((entry) => entry.action === 'social.auth_error'));
    assert.equal((await getCredentials('bluesky')), null, 'a broken account is not used for publishing');
    const notified = (await owner.get('/notifications')).body.items;
    assert.ok(notified.some((item) => item.type === 'accountNeedsAttention' && item.message.includes('Bluesky')));
    assert.ok(!notified.some((item) => item.type === 'accountDisconnected'), 'never worded as "disconnected" — the account was not disconnected');
  });

  it('marks the account token_expired when the platform\'s own words say so', async () => {
    await reset();
    platform = () => reply(200, { data: { id: '42', name: 'Gowebkart', username: 'gowebkart', public_metrics: { followers_count: 9600 } } });
    await owner.put('/social-accounts/x', { credentials: { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' } });

    platform = () => reply(401, { error: { message: 'Your access token has expired' } });
    const response = await owner.post('/social-accounts/x/recheck');
    assert.equal(response.body.account.status, 'token_expired');
    const notified = (await owner.get('/notifications')).body.items;
    assert.ok(notified.some((item) => item.type === 'tokenExpired' && item.message.includes('X')));
  });

  it('marks the account revoked when the platform\'s own words say so', async () => {
    await reset();
    platform = () => reply(200, { data: { id: '42', name: 'Gowebkart', username: 'gowebkart', public_metrics: { followers_count: 9600 } } });
    await owner.put('/social-accounts/x', { credentials: { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' } });

    platform = () => reply(401, { error: { message: 'The token has been revoked by the user' } });
    const response = await owner.post('/social-accounts/x/recheck');
    assert.equal(response.body.account.status, 'revoked');
    const notified = (await owner.get('/notifications')).body.items;
    assert.ok(notified.some((item) => item.type === 'accountRevoked' && item.message.includes('X')));
  });

  it('a rate limit or a 5xx never changes the status, only the note', async () => {
    await connectBluesky();
    platform = (url) => (url.pathname.endsWith('createSession') ? reply(429, {}) : null);
    const limited = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(limited.body.account.status, 'connected');
    assert.match(limited.body.account.lastError, /limiting requests/);

    platform = (url) => (url.pathname.endsWith('createSession') ? reply(503, {}) : null);
    const down = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(down.body.account.status, 'connected');
    assert.match(down.body.account.lastError, /having trouble/);
  });

  it('does not disconnect anybody because the platform was briefly unreachable', async () => {
    await connectBluesky();
    platform = () => {
      throw new Error('ECONNRESET');
    };
    const response = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(response.body.account.status, 'connected');
    assert.match(response.body.account.lastError, /did not answer/);
  });

  it('reports credentials that can no longer be decrypted instead of crashing', async () => {
    await connectBluesky();
    await query("UPDATE social_accounts SET credentials = 'v1.bad.bad.bad' WHERE platform = 'bluesky'");
    const response = await owner.post('/social-accounts/bluesky/recheck');
    assert.equal(response.status, 200);
    assert.equal(response.body.account.status, 'error');
    assert.match(response.body.account.lastError, /Connect the account again/);
    const notified = (await owner.get('/notifications')).body.items;
    assert.ok(notified.some((item) => item.type === 'accountNeedsAttention' && item.message.includes('Bluesky')));
    assert.ok(!notified.some((item) => item.type === 'accountDisconnected'), 'never worded as "disconnected" — the account was not disconnected');
  });

  it('the background pass checks every connected account and survives a failing one', async () => {
    await connectBluesky();
    platform = (url) => {
      if (url.hostname === 'api.pinterest.com') return reply(200, { id: 'p', username: 'gowebkart', follower_count: 12 });
      return blueskyPlatform(url);
    };
    await owner.put('/social-accounts/pinterest', { credentials: { appId: 'app-id-1', appSecret: 'app-secret-1', accessToken: 'pin-token-1' } });
    platform = (url) => {
      if (url.hostname === 'api.pinterest.com') throw new Error('boom');
      return url.pathname.endsWith('getProfile') ? reply(200, { displayName: 'Nitesh B', followersCount: 777 }) : blueskyPlatform(url);
    };
    await recheckAll();
    assert.equal((await statusOf()).followers, 777);
  });

  it('the background pass retries a broken account too, and recovers it automatically once the credentials work again', async () => {
    await connectBluesky();
    platform = (url) => (url.pathname.endsWith('createSession') ? reply(401, {}) : null);
    await owner.post('/social-accounts/bluesky/recheck');
    assert.equal((await statusOf()).status, 'auth_error');

    // The platform accepts the exact same saved credentials again on the next pass (no reconnect happened).
    platform = blueskyPlatform;
    await recheckAll();
    assert.equal((await statusOf()).status, 'connected', 'recovers on its own once the platform accepts it again');
  });

  it('the background pass does not re-send the same notification while an account stays broken the same way', async () => {
    const countOf = async () => (await owner.get('/notifications')).body.items.filter((item) => item.entityId === 'bluesky' && item.type === 'accountNeedsAttention').length;
    await connectBluesky();
    const before = await countOf();
    platform = (url) => (url.pathname.endsWith('createSession') ? reply(401, {}) : null); // Bluesky's own check never reads body text, so this always lands in auth_error
    await recheckAll();
    assert.equal((await countOf()) - before, 1, 'exactly one notification for this new problem');

    // Still broken the exact same way, two more passes later: no second (or third) notification.
    await recheckAll();
    await recheckAll();
    assert.equal((await countOf()) - before, 1, 'the same standing problem is not re-notified on every pass');

    // A temporary hiccup in between must not reset or change any of this either.
    platform = () => {
      throw new Error('ECONNRESET');
    };
    await recheckAll();
    assert.equal((await statusOf()).status, 'auth_error', 'a network blip while already broken changes nothing');
  });

  it('the background pass never touches a disconnected account — it can never auto-reconnect one', async () => {
    await connectBluesky();
    await owner.delete('/social-accounts/bluesky');
    platform = blueskyPlatform; // the platform would happily accept it again, but nothing should ask
    calls = [];
    await recheckAll();
    assert.equal((await statusOf()).status, 'disconnected');
    assert.equal(calls.length, 0, 'a disconnected account is never even contacted by the background pass');
  });

  it('cannot re-check an account that is not connected', async () => {
    await reset();
    assert.equal((await owner.post('/social-accounts/bluesky/recheck')).status, 409);
  });

  it('disconnecting forgets the keys, and can be repeated', async () => {
    await connectBluesky();
    const first = await owner.delete('/social-accounts/bluesky');
    assert.equal(first.status, 200);
    assert.equal(first.body.account.status, 'disconnected');
    assert.equal(first.body.account.followers, 0);
    assert.equal((await query("SELECT credentials FROM social_accounts WHERE platform = 'bluesky'")).rows[0].credentials, null);
    assert.equal((await owner.delete('/social-accounts/bluesky')).status, 200);
    assert.equal((await owner.delete('/social-accounts/x')).status, 200, 'never connected is fine too');
  });
});

describe('credential encryption', () => {
  it('round-trips, is different every time, and refuses tampered text', () => {
    const secret = { token: 'abc', unicode: 'हिन्दी' };
    const a = encryptJson(secret);
    assert.notEqual(a, encryptJson(secret));
    assert.deepEqual(decryptJson(a), secret);
    const parts = a.split('.');
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    assert.equal(decryptJson(parts.join('.')), null);
    assert.equal(decryptJson('garbage'), null);
    assert.equal(decryptJson(null), null);
  });
});
