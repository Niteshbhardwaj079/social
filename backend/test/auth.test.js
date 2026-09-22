import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { PASSWORD, createClient, outboxFor, setupOwner, startServer, tokenFromEmail, waitFor } from './helpers.js';

let server;
before(async () => {
  server = await startServer();
});
after(async () => server.close());

describe('first-run setup', () => {
  it('reports that setup is pending, then registers the owner as Super Admin', async () => {
    const anonymous = createClient(server.baseUrl);
    assert.equal((await anonymous.get('/public/config')).body.setupRequired, true);

    const { response, user } = await setupOwner(server.baseUrl);
    assert.equal(response.status, 201);
    assert.equal(user.role, 'superAdmin');
    assert.equal(user.status, 'active');
    assert.ok(response.body.accessToken);
    assert.ok(response.setCookie.some((cookie) => /social_rt=.+HttpOnly/i.test(cookie)), 'refresh token is an httpOnly cookie');
    assert.ok(!('passwordHash' in user) && !('password_hash' in user), 'no password hash is ever returned');
    assert.equal((await anonymous.get('/public/config')).body.setupRequired, false);
  });

  it('closes registration once someone exists', async () => {
    const response = await createClient(server.baseUrl).post('/auth/register', { name: 'Intruder', email: 'intruder@example.com', password: PASSWORD });
    assert.equal(response.status, 403);
  });

  it('rejects weak or malformed input with a clear message', async () => {
    const client = createClient(server.baseUrl);
    const shortPassword = await client.post('/auth/login', { email: 'not-an-email', password: 'x' });
    assert.equal(shortPassword.status, 400);
    assert.match(shortPassword.body.error.message, /email/i);
  });
});

describe('sign in', () => {
  it('signs in with the right password (case-insensitive email) and returns the profile', async () => {
    const client = createClient(server.baseUrl);
    const response = await client.signIn('OWNER@Example.com');
    assert.equal(response.status, 200);
    const me = await client.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'owner@example.com');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const client = createClient(server.baseUrl);
    const wrong = await client.signIn('owner@example.com', 'wrong-password-1');
    const unknown = await client.signIn('nobody@example.com', 'wrong-password-1');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it('rejects missing, garbage and tampered access tokens', async () => {
    const client = createClient(server.baseUrl);
    assert.equal((await client.get('/auth/me', { token: null })).status, 401);
    assert.equal((await client.get('/auth/me', { token: 'garbage' })).status, 401);
    const good = (await createClient(server.baseUrl).signIn('owner@example.com')).body.accessToken;
    const tampered = `${good.slice(0, -3)}abc`;
    assert.equal((await client.get('/auth/me', { token: tampered })).status, 401);
  });

  it('locks an account for a while after 5 wrong passwords, even for the right one', async () => {
    const { client: owner } = { client: createClient(server.baseUrl) };
    await owner.signIn('owner@example.com');
    const created = await owner.post('/users', { name: 'Lock Me', email: 'lock@example.com', role: 'editor', language: 'en' });
    assert.equal(created.status, 201);
    const invite = await waitFor(async () => (await outboxFor('lock@example.com'))[0]);
    const accepted = await createClient(server.baseUrl).post('/auth/accept-invite', {
      token: tokenFromEmail(invite.html, 'accept-invite'),
      password: PASSWORD,
    });
    assert.equal(accepted.status, 200);

    const victim = createClient(server.baseUrl);
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await victim.signIn('lock@example.com', 'wrong-password-1')).status, 401);
    const locked = await victim.signIn('lock@example.com', PASSWORD);
    assert.equal(locked.status, 429);
    assert.match(locked.body.error.message, /Too many/);
  });
});

describe('sessions', () => {
  it('rotates the refresh token, and ends every session if an old one is replayed', async () => {
    const client = createClient(server.baseUrl);
    await client.signIn('owner@example.com');
    const first = client.refreshCookie;

    const refreshed = await client.post('/auth/refresh');
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.accessToken);
    const second = client.refreshCookie;
    assert.notEqual(first, second, 'a new refresh token was issued');

    // Someone replays the already-used token: refused, and the newer token is revoked too.
    const thief = createClient(server.baseUrl);
    thief.refreshCookie = first;
    assert.equal((await thief.post('/auth/refresh')).status, 401);
    const victim = createClient(server.baseUrl);
    victim.refreshCookie = second;
    assert.equal((await victim.post('/auth/refresh')).status, 401);
  });

  it('logout ends the session', async () => {
    const client = createClient(server.baseUrl);
    await client.signIn('owner@example.com');
    const cookie = client.refreshCookie;
    assert.equal((await client.post('/auth/logout')).status, 204);
    const again = createClient(server.baseUrl);
    again.refreshCookie = cookie;
    assert.equal((await again.post('/auth/refresh')).status, 401);
  });

  it('refuses to refresh without a cookie', async () => {
    assert.equal((await createClient(server.baseUrl).post('/auth/refresh')).status, 401);
  });
});

describe('forgot and reset password', () => {
  it('emails a reset link in the person\'s own language and works exactly once', async () => {
    const owner = createClient(server.baseUrl);
    await owner.signIn('owner@example.com');
    assert.equal((await owner.patch('/auth/me', { language: 'hi' })).status, 200);

    const anonymous = createClient(server.baseUrl);
    const before = (await outboxFor('owner@example.com')).length;
    assert.equal((await anonymous.post('/auth/forgot-password', { email: 'owner@example.com' })).status, 200);
    const email = await waitFor(async () => (await outboxFor('owner@example.com')).filter((row) => row.event_key === 'auth.passwordResetRequested')[0]);
    assert.equal(email.language, 'hi');
    assert.match(email.subject, /पासवर्ड/);
    assert.match(email.html, /lang="hi"/);
    assert.ok((await outboxFor('owner@example.com')).length > before);

    const token = tokenFromEmail(email.html, 'reset-password');
    assert.ok(token);
    const reset = await anonymous.post('/auth/reset-password', { token, password: 'Brand-new-pass-9' });
    assert.equal(reset.status, 200);
    assert.equal((await anonymous.post('/auth/reset-password', { token, password: 'Another-new-pass-9' })).status, 400, 'the link works once');
    assert.equal((await createClient(server.baseUrl).signIn('owner@example.com', PASSWORD)).status, 401, 'old password no longer works');
    assert.equal((await createClient(server.baseUrl).signIn('owner@example.com', 'Brand-new-pass-9')).status, 200);

    const notice = await waitFor(async () => (await outboxFor('owner@example.com')).find((row) => row.event_key === 'auth.passwordChanged'));
    assert.equal(notice.language, 'hi');

    // put the password back for the other tests
    const back = createClient(server.baseUrl);
    await back.signIn('owner@example.com', 'Brand-new-pass-9');
    assert.equal((await back.post('/auth/change-password', { currentPassword: 'Brand-new-pass-9', newPassword: PASSWORD })).status, 200);
    await back.patch('/auth/me', { language: 'en' });
  });

  it('does not reveal whether an email has an account, and sends nothing for strangers', async () => {
    const response = await createClient(server.baseUrl).post('/auth/forgot-password', { email: 'ghost@example.com' });
    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await outboxFor('ghost@example.com')).length, 0);
  });

  it('rejects a bogus token', async () => {
    const response = await createClient(server.baseUrl).post('/auth/reset-password', { token: 'x'.repeat(43), password: PASSWORD });
    assert.equal(response.status, 400);
  });
});

describe('change password', () => {
  it('needs the current password and ends other sessions', async () => {
    const phone = createClient(server.baseUrl);
    await phone.signIn('owner@example.com');
    const laptop = createClient(server.baseUrl);
    await laptop.signIn('owner@example.com');
    const laptopCookie = laptop.refreshCookie;

    assert.equal((await phone.post('/auth/change-password', { currentPassword: 'wrong-password-1', newPassword: 'Another-pass-123' })).status, 401);
    assert.equal((await phone.post('/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Another-pass-123' })).status, 200);

    const stale = createClient(server.baseUrl);
    stale.refreshCookie = laptopCookie;
    assert.equal((await stale.post('/auth/refresh')).status, 401, 'other devices are signed out');

    assert.equal((await phone.post('/auth/change-password', { currentPassword: 'Another-pass-123', newPassword: PASSWORD })).status, 200);
  });
});

describe('"new sign-in" email', () => {
  const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

  const loginAs = (client, userAgent) => client.post('/auth/login', { email: 'owner@example.com', password: PASSWORD }, { headers: userAgent ? { 'user-agent': userAgent } : {} });
  const newSignInMails = () => outboxFor('owner@example.com').then((rows) => rows.filter((row) => row.event_key === 'auth.newSignIn'));

  it('a plain sign-in (no special User-Agent given) is already a known device by this point in the file', async () => {
    // Every earlier test above signed in as owner with the same default User-Agent Node's fetch sends
    // ("node"), which is the account's known device from setup onward — so this one stays quiet.
    const before = (await newSignInMails()).length;
    const client = createClient(server.baseUrl);
    assert.equal((await loginAs(client, null)).status, 200);
    assert.equal((await newSignInMails()).length, before);
  });

  it('a genuinely different browser triggers it once, in the person\'s own language, and not again from the same one', async () => {
    const before = (await newSignInMails()).length;
    const client = createClient(server.baseUrl);
    assert.equal((await loginAs(client, CHROME_WINDOWS)).status, 200);

    const mail = await waitFor(async () => (await newSignInMails()).slice(before)[0]);
    assert.match(mail.subject, /sign-in|Social/i);
    assert.match(mail.html, /Chrome on Windows/);
    assert.equal(mail.language, 'en');

    // The same browser again: already known, no second email.
    await loginAs(client, CHROME_WINDOWS);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await newSignInMails()).length, before + 1);

    // A different browser: known device.
    await loginAs(client, FIREFOX_LINUX);
    const secondMail = await waitFor(async () => (await newSignInMails()).slice(before + 1)[0]);
    assert.match(secondMail.html, /Firefox on Linux/);
  });

  it('never sent for a wrong password', async () => {
    const before = (await newSignInMails()).length;
    const client = createClient(server.baseUrl);
    await client.post('/auth/login', { email: 'owner@example.com', password: 'not-the-password-1' }, { headers: { 'user-agent': 'Some/Brand New/Device 9000' } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await newSignInMails()).length, before);
  });
});

describe('tokens at rest', () => {
  it('stores only hashes, never the raw refresh token', async () => {
    const client = createClient(server.baseUrl);
    await client.signIn('owner@example.com');
    const raw = client.refreshCookie.split('=')[1];
    const rows = await query('SELECT token_hash FROM auth_tokens');
    assert.ok(rows.rows.length > 0);
    assert.ok(rows.rows.every((row) => row.token_hash !== raw && row.token_hash.length === 64));
  });
});
