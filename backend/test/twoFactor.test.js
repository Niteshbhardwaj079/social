import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSync } from 'otplib';
import { PASSWORD, createClient, setupOwner, startServer } from './helpers.js';

let server;
let owner;

// TOTP codes are only valid for a ±1 step (30s) window around the server's own clock. Two calls made
// moments apart for the SAME secret would otherwise produce the identical code, which this app's own
// replay guard (totp_last_step) correctly refuses the second time — so tests that need a second, fresh,
// real code ask for the NEXT step instead of waiting 30 real seconds. Still comfortably inside the
// server's epochTolerance:1 window, so it verifies as if a real authenticator's clock ticked forward once.
function totpCodeAt(secret, stepsAhead = 0) {
  return generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + stepsAhead * 30 });
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

let secret;
let backupCodes;

describe('setting up 2FA', () => {
  it('is off to start with; setup returns a real otpauth QR; a wrong code is refused; a real code turns it on', async () => {
    assert.equal((await owner.get('/auth/2fa/status')).body.enabled, false);

    const setup = await owner.post('/auth/2fa/setup', {});
    assert.equal(setup.status, 200);
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\/Social/);
    assert.ok(setup.body.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    secret = setup.body.secret;

    const wrong = await owner.post('/auth/2fa/enable', { code: '000000' });
    assert.equal(wrong.status, 400);
    assert.equal((await owner.get('/auth/2fa/status')).body.enabled, false, 'a wrong code never turns it on');

    const enabled = await owner.post('/auth/2fa/enable', { code: totpCodeAt(secret, 0) });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    assert.equal(enabled.body.backupCodes.length, 10);
    backupCodes = enabled.body.backupCodes;
    assert.equal((await owner.get('/auth/2fa/status')).body.enabled, true);
  });

  it('cannot start setup again while it is already on', async () => {
    assert.equal((await owner.post('/auth/2fa/setup', {})).status, 400);
  });
});

describe('signing in once 2FA is on', () => {
  it('login returns a challenge, not a session — no access token, no session cookie yet', async () => {
    const anon = createClient(server.baseUrl);
    const res = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.requires2fa, true);
    assert.ok(res.body.challengeToken);
    assert.equal(res.body.accessToken, undefined);
    assert.equal(res.setCookie.length, 0);
  });

  it('a wrong code is refused; the real code from the same challenge completes sign-in', async () => {
    const anon = createClient(server.baseUrl);
    const login = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    const { challengeToken } = login.body;

    const wrong = await anon.post('/auth/2fa/verify-login', { challengeToken, code: '000000' });
    assert.equal(wrong.status, 401);

    const ok = await anon.post('/auth/2fa/verify-login', { challengeToken, code: totpCodeAt(secret, 1) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.accessToken);
    assert.ok(ok.setCookie.some((cookie) => /social_rt=.+HttpOnly/i.test(cookie)));
  });

  it('a garbage or expired challenge token is refused, not a 500', async () => {
    const anon = createClient(server.baseUrl);
    const res = await anon.post('/auth/2fa/verify-login', { challengeToken: 'not-a-real-token-at-all-xxxxxxxxxxxxxxxxxx', code: '123456' });
    assert.equal(res.status, 401);
  });

  it('a backup code signs in once, and cannot be reused', async () => {
    const anon = createClient(server.baseUrl);
    const login = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    const usedCode = backupCodes[0];

    const first = await anon.post('/auth/2fa/verify-login', { challengeToken: login.body.challengeToken, code: usedCode });
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const login2 = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    const reuse = await anon.post('/auth/2fa/verify-login', { challengeToken: login2.body.challengeToken, code: usedCode });
    assert.equal(reuse.status, 401, 'a spent backup code never works twice');
  });
});

describe('turning 2FA off and regenerating backup codes', () => {
  it('both need the real password, not just a signed-in session', async () => {
    assert.equal((await owner.post('/auth/2fa/disable', { password: 'definitely-wrong' })).status, 401);
    assert.equal((await owner.post('/auth/2fa/backup-codes/regenerate', { password: 'definitely-wrong' })).status, 401);
  });

  it('regenerating replaces the old codes with 10 new, different ones', async () => {
    const regenerated = await owner.post('/auth/2fa/backup-codes/regenerate', { password: PASSWORD });
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.body.backupCodes.length, 10);
    assert.notDeepEqual(regenerated.body.backupCodes, backupCodes);
  });

  it('turning it off is reflected in status, and a plain login no longer asks for a code', async () => {
    const disabled = await owner.post('/auth/2fa/disable', { password: PASSWORD });
    assert.equal(disabled.status, 200);
    assert.equal((await owner.get('/auth/2fa/status')).body.enabled, false);

    const anon = createClient(server.baseUrl);
    const res = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.requires2fa, undefined);
    assert.ok(res.body.accessToken, 'signs straight in, one step, like before 2FA existed');
  });
});

describe('repeated wrong codes lock the account, same as repeated wrong passwords', () => {
  it('5 wrong 2FA codes lock out further attempts, including a correct one', async () => {
    const setup = await owner.post('/auth/2fa/setup', {});
    const freshSecret = setup.body.secret;
    await owner.post('/auth/2fa/enable', { code: totpCodeAt(freshSecret, 0) });

    const anon = createClient(server.baseUrl);
    const login = await anon.post('/auth/login', { email: 'owner@example.com', password: PASSWORD });
    const { challengeToken } = login.body;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await anon.post('/auth/2fa/verify-login', { challengeToken, code: '000000' });
      assert.equal(res.status, 401);
    }

    const lockedOut = await anon.post('/auth/2fa/verify-login', { challengeToken, code: totpCodeAt(freshSecret, 1) });
    assert.equal(lockedOut.status, 429, 'locked out even with the genuinely correct code');
  });
});
