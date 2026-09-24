import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { decryptJson } from '../src/utils/crypto.js';

// A real (fake) SMTP server on localhost — nodemailer talks raw SMTP, not HTTP, so this proves the
// whole path for real instead of mocking nodemailer itself, matching how storage.test.js fakes a
// real S3-compatible HTTP endpoint rather than mocking the storage code.
let smtp;
let smtpPort;
let received = [];
let authMode = 'accept'; // 'accept' | 'reject'

before(async () => {
  smtp = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (authMode === 'reject') return callback(new Error('535 Invalid login or password'));
      callback(null, { user: auth.username });
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        received.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString() });
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
afterEach(() => {
  received = [];
  authMode = 'accept';
});

const values = { host: '127.0.0.1', port: 0, secure: false, username: 'owner@example.com', password: 'app-password-123', fromEmail: 'no-reply@example.com', fromName: 'Test Workspace' };
const withPort = (overrides = {}) => ({ ...values, port: smtpPort, ...overrides });

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
    assert.equal(response.body.configured, false);
    assert.equal(response.body.passwordHint, '');
  });

  it('only Super Admin / Admin may read or change it (unlike languages/workspace, this is sensitive like System Emails)', async () => {
    assert.equal((await editor.get('/email-settings')).status, 403);
    assert.equal((await editor.put('/email-settings', withPort())).status, 403);
  });

  it('rejects a missing field, naming it, without ever contacting a server', async () => {
    const response = await owner.post('/email-settings/test', { ...withPort(), host: '' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.details[0].field, 'host');
  });

  it('"Test connection" really talks SMTP to the given host, and fails clearly on bad auth', async () => {
    authMode = 'reject';
    const response = await owner.post('/email-settings/test', withPort());
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /Invalid login/);
  });

  it('"Test connection" succeeds against a real SMTP login', async () => {
    const response = await owner.post('/email-settings/test', withPort());
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  });

  it('saving verifies first, stores the password encrypted, and never returns it', async () => {
    const saved = await owner.put('/email-settings', withPort());
    assert.equal(saved.status, 200);
    assert.equal(saved.body.configured, true);
    assert.equal(saved.body.fromEmail, 'no-reply@example.com');
    assert.match(saved.body.passwordHint, /^••••/);
    assert.doesNotMatch(saved.text, /app-password-123/);

    const row = (await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0];
    assert.doesNotMatch(row.credentials, /app-password-123/, 'not stored as plain text');
    assert.deepEqual(decryptJson(row.credentials), { password: 'app-password-123' });

    const log = await owner.get('/activity-logs');
    assert.ok(log.body.activity.some((entry) => entry.action === 'email_settings.connected'));
  });

  it('a refused connection is not saved', async () => {
    authMode = 'reject';
    const response = await owner.put('/email-settings', withPort({ fromEmail: 'someone-else@example.com' }));
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Invalid login/);
    const row = (await query('SELECT from_email FROM email_settings WHERE id = true')).rows[0];
    assert.equal(row.from_email, 'no-reply@example.com', 'the previous connection is untouched');
  });

  it('re-testing or re-saving with the password left blank reuses the saved one', async () => {
    const { password, ...withoutPassword } = withPort({ fromName: 'Renamed Workspace' });
    void password;
    const response = await owner.put('/email-settings', withoutPassword);
    assert.equal(response.status, 200);
    assert.equal(response.body.fromName, 'Renamed Workspace');
    assert.deepEqual(decryptJson((await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0].credentials), { password: 'app-password-123' });
  });

  it('"Send test email" actually delivers through the connected SMTP server', async () => {
    const response = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'sent');
    assert.equal(received.length, 1);
    assert.equal(received[0].to[0], 'someone@example.com');
    assert.match(received[0].raw, /Test email from your Social workspace/);
  });

  it('the health check reports mail as "smtp" once configured', async () => {
    const response = await owner.get('/health');
    assert.equal(response.body.mail, 'smtp');
  });

  it('disconnecting clears the saved password and falls back to logging emails instead of sending', async () => {
    const response = await owner.delete('/email-settings');
    assert.equal(response.status, 200);
    assert.equal(response.body.configured, false);
    assert.equal((await query('SELECT credentials FROM email_settings WHERE id = true')).rows[0].credentials, null);

    const health = await owner.get('/health');
    assert.equal(health.body.mail, 'log');

    const sent = await owner.post('/email-settings/send-test', { recipient: 'someone@example.com' });
    assert.equal(sent.status, 200, 'nothing is configured, but this must still succeed gracefully (log-only), matching mailer.js’s BYOK philosophy');
    assert.equal(sent.body.status, 'logged');
    assert.equal(received.length, 0);
  });
});
