import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { decryptJson } from '../src/utils/crypto.js';

// ------------------------------------------------------------------------------------- fake SMTP
// A real (fake) SMTP server on localhost — nodemailer talks raw SMTP, not HTTP, so this proves the
// whole path for real instead of mocking nodemailer itself, matching how storage.test.js fakes a
// real S3-compatible HTTP endpoint rather than mocking the storage code.
let smtp;
let smtpPort;
let smtpReceived = [];
let smtpAuthMode = 'accept'; // 'accept' | 'reject'

before(async () => {
  smtp = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (smtpAuthMode === 'reject') return callback(new Error('535 Invalid login or password'));
      callback(null, { user: auth.username });
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        smtpReceived.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString() });
        callback();
      });
    },
  });
  await new Promise((resolve, reject) => smtp.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve())));
  smtpPort = smtp.server.address().port;
});
after(async () => {
  await new Promise((resolve) => smtp.close(resolve));
});

// ------------------------------------------------------------------------------ fake HTTPS APIs
// Real network calls to the 3 provider hostnames are answered here; nothing reaches the internet.
// SMTP doesn't use fetch at all, so this stub never interferes with the smtp-server tests above.
const realFetch = globalThis.fetch;
let apiCalls = [];
let apiOverride = () => null;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  apiCalls.push({ url, init });
  return (await apiOverride(url, init)) ?? reply(404, { message: 'not stubbed' });
};

afterEach(() => {
  smtpReceived = [];
  smtpAuthMode = 'accept';
  apiCalls = [];
  apiOverride = () => null;
});
after(() => {
  globalThis.fetch = realFetch;
});

const smtpValues = () => ({ host: '127.0.0.1', port: smtpPort, secure: false, username: 'owner@example.com', password: 'app-password-123', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' });

let server;
let owner;
let editor;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  await owner.post('/users', { name: 'Ed Itor', email: 'editor@example.com', role: 'editor', language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = 'editor@example.com'");
  editor = createClient(server.baseUrl);
  await editor.signIn('editor@example.com');
});
after(async () => {
  await server.close();
});

describe('email settings: connecting a client’s own SMTP', () => {
  it('starts unconfigured', async () => {
    const response = await owner.get('/email-settings');
    assert.equal(response.status, 200);
    assert.equal(response.body.provider, null);
  });

  it('only Super Admin / Admin may read or change it (unlike languages/workspace, this is sensitive like System Emails)', async () => {
    assert.equal((await editor.get('/email-settings')).status, 403);
    assert.equal((await editor.put('/email-settings/providers/smtp', { values: smtpValues() })).status, 403);
  });

  it('rejects a missing field, naming it, without ever contacting a server', async () => {
    const response = await owner.post('/email-settings/providers/smtp/test', { values: { ...smtpValues(), host: '' } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.details[0].field, 'host');
  });

  it('rejects an unknown provider key', async () => {
    const response = await owner.post('/email-settings/providers/mailchimp/test', { values: {} });
    assert.equal(response.status, 400);
  });

  it('"Test connection" really talks SMTP to the given host, and fails clearly on bad auth', async () => {
    smtpAuthMode = 'reject';
    const response = await owner.post('/email-settings/providers/smtp/test', { values: smtpValues() });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /Invalid login/);
  });

  it('"Test connection" succeeds against a real SMTP login', async () => {
    const response = await owner.post('/email-settings/providers/smtp/test', { values: smtpValues() });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  });

  it('saving verifies first, stores the password encrypted, and never returns it', async () => {
    const saved = await owner.put('/email-settings/providers/smtp', { values: smtpValues() });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.provider.providerKey, 'smtp');
    assert.equal(saved.body.provider.values.fromEmail, 'no-reply@example.com');
    assert.match(saved.body.provider.secretHints.password, /^••••/);
    assert.doesNotMatch(saved.text, /app-password-123/);

    const row = (await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0];
    assert.doesNotMatch(row.credentials, /app-password-123/, 'not stored as plain text');
    assert.deepEqual(decryptJson(row.credentials), smtpValues());

    const log = await owner.get('/activity-logs');
    assert.ok(log.body.activity.some((entry) => entry.action === 'email_settings.connected'));
  });

  it('a refused connection is not saved', async () => {
    smtpAuthMode = 'reject';
    const response = await owner.put('/email-settings/providers/smtp', { values: { ...smtpValues(), fromEmail: 'someone-else@example.com' } });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Invalid login/);
    const row = (await query('SELECT provider_values FROM email_settings WHERE id = true')).rows[0];
    assert.equal(row.provider_values.fromEmail, 'no-reply@example.com', 'the previous connection is untouched');
  });

  it('re-testing or re-saving with the password left blank reuses the saved one', async () => {
    const { password, ...withoutPassword } = smtpValues();
    void password;
    const response = await owner.put('/email-settings/providers/smtp', { values: { ...withoutPassword, fromName: 'Renamed Workspace' } });
    assert.equal(response.status, 200);
    assert.equal(response.body.provider.values.fromName, 'Renamed Workspace');
    assert.equal(decryptJson((await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0].credentials).password, 'app-password-123');
  });

  it('"Send test email" actually delivers through the connected SMTP server', async () => {
    const response = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'sent');
    assert.equal(smtpReceived.length, 1);
    assert.equal(smtpReceived[0].to[0], 'someone@example.com');
    assert.match(smtpReceived[0].raw, /Test email from your Social workspace/);
  });

  it('the health check reports which provider is active', async () => {
    const response = await owner.get('/health');
    assert.equal(response.body.mail, 'smtp');
  });

  it('disconnecting clears the saved settings and falls back to logging emails instead of sending', async () => {
    const response = await owner.delete('/email-settings/provider');
    assert.equal(response.status, 200);
    assert.equal(response.body.provider, null);
    assert.equal((await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0].credentials, null);

    const health = await owner.get('/health');
    assert.equal(health.body.mail, 'log');

    const sent = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(sent.status, 200, 'nothing is configured, but this must still succeed gracefully (log-only)');
    assert.equal(sent.body.status, 'logged');
    assert.equal(smtpReceived.length, 0);
  });
});

// -------------------------------------------------------------------------------- HTTPS API providers
// These matter most: Render's free tier blocks outbound SMTP ports entirely (2025-09-26), so a
// plain-HTTPS provider is the only way free-tier clients can send real email at all.

describe('email settings: Resend (HTTPS API, no SMTP socket)', () => {
  it('fails clearly on a rejected API key, without ever calling /emails', async () => {
    apiOverride = (url) => (url.hostname === 'api.resend.com' && url.pathname === '/domains' ? reply(401, { message: 'API key is invalid' }) : null);
    const response = await owner.post('/email-settings/providers/resend/test', { values: { apiKey: 'bad-key', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' } });
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /API key is invalid/);
    assert.ok(!apiCalls.some((call) => call.url.pathname === '/emails'));
  });

  it('saves, and "Send test email" posts the right shape to api.resend.com/emails with the real key', async () => {
    apiOverride = (url) => {
      if (url.hostname !== 'api.resend.com') return null;
      if (url.pathname === '/domains') return reply(200, { data: [] });
      if (url.pathname === '/emails') return reply(200, { id: 'resend-message-id' });
      return null;
    };
    const saved = await owner.put('/email-settings/providers/resend', { values: { apiKey: 're_live_abcdef123456', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.provider.providerKey, 'resend');
    assert.match(saved.body.provider.secretHints.apiKey, /^••••/);
    assert.doesNotMatch(saved.text, /re_live_abcdef123456/);

    const sent = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(sent.body.status, 'sent');
    const call = apiCalls.find((entry) => entry.url.pathname === '/emails');
    assert.equal(call.init.headers.Authorization, 'Bearer re_live_abcdef123456');
    const body = JSON.parse(call.init.body);
    assert.equal(body.from, 'Test Workspace <no-reply@example.com>');
    assert.deepEqual(body.to, ['Nitesh Owner <someone@example.com>']); // "Send test" names the recipient after the signed-in actor (setupOwner's default name)
  });
});

describe('email settings: SendGrid (HTTPS API, no SMTP socket)', () => {
  it('fails clearly on a rejected API key', async () => {
    apiOverride = (url) => (url.hostname === 'api.sendgrid.com' && url.pathname === '/v3/user/account' ? reply(401, { errors: [{ message: 'The provided authorization grant is invalid' }] }) : null);
    const response = await owner.post('/email-settings/providers/sendgrid/test', { values: { apiKey: 'bad-key', fromEmail: 'no-reply@example.com' } });
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /authorization grant is invalid/);
  });

  it('saves, and "Send test email" posts the right shape to api.sendgrid.com/v3/mail/send', async () => {
    apiOverride = (url, init) => {
      if (url.hostname !== 'api.sendgrid.com') return null;
      if (url.pathname === '/v3/user/account') return reply(200, { type: 'free' });
      if (url.pathname === '/v3/mail/send') return new Response(null, { status: 202 }); // SendGrid's real success response has no body
      void init;
      return null;
    };
    await owner.put('/email-settings/providers/sendgrid', { values: { apiKey: 'SG.abcdef123456', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' } });
    const sent = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(sent.body.status, 'sent');
    const call = apiCalls.find((entry) => entry.url.pathname === '/v3/mail/send');
    assert.equal(call.init.headers.Authorization, 'Bearer SG.abcdef123456');
    const body = JSON.parse(call.init.body);
    assert.equal(body.from.email, 'no-reply@example.com');
    assert.equal(body.personalizations[0].to[0].email, 'someone@example.com');
  });
});

describe('email settings: Brevo (HTTPS API, no SMTP socket)', () => {
  it('fails clearly on a rejected API key', async () => {
    apiOverride = (url) => (url.hostname === 'api.brevo.com' && url.pathname === '/v3/account' ? reply(401, { message: 'Key not found' }) : null);
    const response = await owner.post('/email-settings/providers/brevo/test', { values: { apiKey: 'bad-key', fromEmail: 'no-reply@example.com' } });
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /Key not found/);
  });

  it('saves, and "Send test email" posts the right shape to api.brevo.com/v3/smtp/email', async () => {
    apiOverride = (url) => {
      if (url.hostname !== 'api.brevo.com') return null;
      if (url.pathname === '/v3/account') return reply(200, { email: 'account@example.com' });
      if (url.pathname === '/v3/smtp/email') return reply(201, { messageId: 'brevo-message-id' });
      return null;
    };
    await owner.put('/email-settings/providers/brevo', { values: { apiKey: 'xkeysib-abcdef123456', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' } });
    const sent = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(sent.body.status, 'sent');
    const call = apiCalls.find((entry) => entry.url.pathname === '/v3/smtp/email');
    assert.equal(call.init.headers['api-key'], 'xkeysib-abcdef123456');
    const body = JSON.parse(call.init.body);
    assert.equal(body.sender.email, 'no-reply@example.com');
    assert.equal(body.to[0].email, 'someone@example.com');
  });
});

describe('email settings: switching providers', () => {
  it('connecting a new provider replaces the old one outright (only one active provider at a time)', async () => {
    apiOverride = (url) => {
      if (url.hostname !== 'api.brevo.com') return null;
      if (url.pathname === '/v3/account') return reply(200, { email: 'account@example.com' });
      return null;
    };
    await owner.put('/email-settings/providers/brevo', { values: { apiKey: 'xkeysib-second-key', fromEmail: 'brevo@example.com' } });
    const settings = await owner.get('/email-settings');
    assert.equal(settings.body.provider.providerKey, 'brevo');
    assert.equal(settings.body.provider.values.fromEmail, 'brevo@example.com');
  });
});
