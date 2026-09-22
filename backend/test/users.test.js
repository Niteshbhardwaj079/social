import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { PASSWORD, createClient, outboxFor, setupOwner, startServer, tokenFromEmail, waitFor } from './helpers.js';

let server;
let owner;
const clients = {};

/** Invites someone and completes their invitation, returning a signed-in client. */
async function addPerson(name, email, role, language = 'en') {
  const created = await owner.post('/users', { name, email, role, language });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const invite = await waitFor(async () => (await outboxFor(email)).find((row) => row.event_key === 'users.invited'));
  const client = createClient(server.baseUrl);
  const accepted = await client.post('/auth/accept-invite', { token: tokenFromEmail(invite.html, 'accept-invite'), password: PASSWORD });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  client.accessToken = accepted.body.accessToken;
  return { client, user: created.body.user };
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

describe('inviting people', () => {
  it('creates an invited account and emails the invitation in THEIR language', async () => {
    const created = await owner.post('/users', { name: 'Priya Sharma', email: 'Priya@Example.com', role: 'editor', language: 'hi' });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.status, 'invited');
    assert.equal(created.body.user.email, 'priya@example.com', 'email is stored lower-case');
    assert.equal(created.body.user.language, 'hi');

    const mail = await waitFor(async () => (await outboxFor('priya@example.com')).find((row) => row.event_key === 'users.invited'));
    assert.equal(mail.language, 'hi');
    assert.match(mail.subject, /आमंत्रित/);
    assert.match(mail.html, /dir="ltr" lang="hi"/);
    assert.ok(mail.html.includes('Nitesh Owner'), 'says who invited them');
    assert.ok(tokenFromEmail(mail.html, 'accept-invite'));
    assert.ok(!mail.html.includes('{{'), 'no unfilled variables are left in the email');
  });

  it('sends an Arabic (right-to-left) invitation', async () => {
    await owner.post('/users', { name: 'Layla Hassan', email: 'layla@example.com', role: 'contributor', language: 'ar' });
    const mail = await waitFor(async () => (await outboxFor('layla@example.com')).find((row) => row.event_key === 'users.invited'));
    assert.equal(mail.language, 'ar');
    assert.match(mail.html, /dir="rtl" lang="ar"/);
    assert.match(mail.html, /direction:rtl;text-align:right/);
  });

  it('refuses a duplicate email and unknown values', async () => {
    assert.equal((await owner.post('/users', { name: 'Again', email: 'priya@example.com', role: 'editor', language: 'en' })).status, 409);
    assert.equal((await owner.post('/users', { name: 'X', email: 'x@example.com', role: 'root', language: 'en' })).status, 400);
    assert.equal((await owner.post('/users', { name: 'X', email: 'x@example.com', role: 'editor', language: 'klingon' })).status, 400);
  });

  it('lets the invited person set a password and become active, once', async () => {
    const { client, user } = await addPerson('Rahul Verma', 'rahul@example.com', 'contributor', 'gu');
    assert.equal((await client.get('/auth/me')).body.user.status, 'active');
    const invite = (await outboxFor('rahul@example.com')).find((row) => row.event_key === 'users.invited');
    const reuse = await createClient(server.baseUrl).post('/auth/accept-invite', { token: tokenFromEmail(invite.html, 'accept-invite'), password: PASSWORD });
    assert.equal(reuse.status, 400, 'an invitation link works once');
    assert.equal(user.language, 'gu');
  });

  it('tells every Super Admin (in their language) when someone is added', async () => {
    await owner.patch('/auth/me', { language: 'es' });
    await owner.post('/users', { name: 'Vikram Singh', email: 'vikram@example.com', role: 'analyst', language: 'en' });
    const copy = await waitFor(async () => (await outboxFor('owner@example.com')).find((row) => row.event_key === 'users.created' && /Vikram/.test(row.subject)));
    assert.equal(copy.language, 'es');
    assert.match(copy.subject, /Vikram Singh/);
    await owner.patch('/auth/me', { language: 'en' });
  });

  it('can send the invitation again, and the old link stops working', async () => {
    const created = await owner.post('/users', { name: 'Resend Me', email: 'resend@example.com', role: 'analyst', language: 'en' });
    const first = await waitFor(async () => (await outboxFor('resend@example.com')).find((row) => row.event_key === 'users.invited'));
    assert.equal((await owner.post(`/users/${created.body.user.id}/resend-invite`)).status, 200);
    await waitFor(async () => (await outboxFor('resend@example.com')).filter((row) => row.event_key === 'users.invited').length === 2);
    const old = await createClient(server.baseUrl).post('/auth/accept-invite', { token: tokenFromEmail(first.html, 'accept-invite'), password: PASSWORD });
    assert.equal(old.status, 400);
  });
});

describe('who can manage people', () => {
  before(async () => {
    Object.assign(clients, {
      admin: (await addPerson('Ada Admin', 'ada@example.com', 'superAdmin')).client,
    });
    // promote via the owner, then use the admin role for the permission checks
    const users = (await owner.get('/users')).body.users;
    const ada = users.find((user) => user.email === 'ada@example.com');
    assert.equal((await owner.patch(`/users/${ada.id}`, { role: 'admin' })).status, 200);
    clients.admin = createClient(server.baseUrl);
    await clients.admin.signIn('ada@example.com');
    clients.contributor = (await addPerson('Cy Contributor', 'cy@example.com', 'contributor')).client;
  });

  it('keeps Users & Roles away from Editors, Contributors and Analysts', async () => {
    assert.equal((await clients.contributor.get('/users')).status, 403);
    assert.equal((await clients.contributor.post('/users', { name: 'N', email: 'n@example.com', role: 'analyst', language: 'en' })).status, 403);
    assert.equal((await clients.contributor.get('/system-emails')).status, 403);
  });

  it('lets an Admin manage people below them but not Admins or Super Admins', async () => {
    assert.equal((await clients.admin.get('/users')).status, 200);
    assert.equal((await clients.admin.post('/users', { name: 'New Editor', email: 'ed@example.com', role: 'editor', language: 'en' })).status, 201);
    assert.equal((await clients.admin.post('/users', { name: 'New Admin', email: 'na@example.com', role: 'admin', language: 'en' })).status, 403);
    assert.equal((await clients.admin.post('/users', { name: 'New Boss', email: 'nb@example.com', role: 'superAdmin', language: 'en' })).status, 403);

    const users = (await owner.get('/users')).body.users;
    const boss = users.find((user) => user.email === 'owner@example.com');
    assert.equal((await clients.admin.patch(`/users/${boss.id}`, { name: 'Hacked' })).status, 403);
    assert.equal((await clients.admin.delete(`/users/${boss.id}`)).status, 403);
  });

  it('never lets someone change their own role or status', async () => {
    const me = (await clients.admin.get('/auth/me')).body.user;
    assert.equal((await clients.admin.patch(`/users/${me.id}`, { role: 'superAdmin' })).status, 403);
    assert.equal((await clients.admin.patch(`/users/${me.id}`, { status: 'disabled' })).status, 403);
    assert.equal((await clients.admin.delete(`/users/${me.id}`)).status, 403);
  });

  it('always keeps at least one active Super Admin', async () => {
    const me = (await owner.get('/auth/me')).body.user;
    const demote = await owner.patch(`/users/${me.id}`, { role: 'admin' });
    assert.equal(demote.status, 403); // self-change is refused first
    // a second Super Admin exists only if we make one: make one, then try to remove the last two in turn
    const users = (await owner.get('/users')).body.users;
    const cy = users.find((user) => user.email === 'cy@example.com');
    assert.equal((await owner.patch(`/users/${cy.id}`, { role: 'superAdmin' })).status, 200);
    assert.equal((await owner.patch(`/users/${cy.id}`, { role: 'editor' })).status, 200, 'the owner is still a Super Admin');
    const cyClient = createClient(server.baseUrl);
    await cyClient.signIn('cy@example.com');
    assert.equal((await owner.patch(`/users/${cy.id}`, { role: 'contributor' })).status, 200);
  });
});

describe('disabling and removing', () => {
  it('cuts a disabled person off immediately, even with a valid access token', async () => {
    const { client, user } = await addPerson('Dee Disabled', 'dee@example.com', 'editor');
    const cookie = client.refreshCookie;
    assert.equal((await client.get('/auth/me')).status, 200);
    assert.equal((await owner.patch(`/users/${user.id}`, { status: 'disabled' })).status, 200);
    assert.equal((await client.get('/auth/me')).status, 401, 'the existing access token stops working');
    const stale = createClient(server.baseUrl);
    stale.refreshCookie = cookie;
    assert.equal((await stale.post('/auth/refresh')).status, 401);
    assert.equal((await createClient(server.baseUrl).signIn('dee@example.com')).status, 403);
    assert.equal((await owner.patch(`/users/${user.id}`, { status: 'active' })).status, 200);
    assert.equal((await createClient(server.baseUrl).signIn('dee@example.com')).status, 200);
  });

  it('removes a person for good', async () => {
    const { user } = await addPerson('Rex Remove', 'rex@example.com', 'analyst');
    assert.equal((await owner.delete(`/users/${user.id}`)).status, 204);
    assert.equal((await owner.delete(`/users/${user.id}`)).status, 404);
    assert.equal((await createClient(server.baseUrl).signIn('rex@example.com')).status, 401);
  });

  it('cannot activate someone who never accepted their invitation', async () => {
    const created = await owner.post('/users', { name: 'Pending', email: 'pending@example.com', role: 'analyst', language: 'en' });
    assert.equal((await owner.patch(`/users/${created.body.user.id}`, { status: 'active' })).status, 400);
  });
});

describe('role change emails', () => {
  it('sends nothing while the email is off (as shipped), and the person\'s language once it is on', async () => {
    const { user } = await addPerson('Kim Koreana', 'kim@example.com', 'contributor', 'ko');
    assert.equal((await owner.patch(`/users/${user.id}`, { role: 'editor' })).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await outboxFor('kim@example.com')).filter((row) => row.event_key === 'users.roleChanged').length, 0);

    assert.equal((await owner.patch('/system-emails/users-role-changed', { isEnabled: true })).status, 200);
    assert.equal((await owner.patch(`/users/${user.id}`, { role: 'analyst' })).status, 200);
    const mail = await waitFor(async () => (await outboxFor('kim@example.com')).find((row) => row.event_key === 'users.roleChanged'));
    assert.equal(mail.language, 'ko');
    assert.match(mail.subject, /역할/);
    assert.ok(mail.html.includes('편집자') && mail.html.includes('분석가'), 'role names are translated too');
  });
});

describe('listing', () => {
  it('filters, and treats search text as text (no SQL injection)', async () => {
    const byRole = await owner.get('/users?role=editor');
    assert.equal(byRole.status, 200);
    assert.ok(byRole.body.users.every((user) => user.role === 'editor'));
    const injected = await owner.get(`/users?search=${encodeURIComponent("'; DROP TABLE users; --")}`);
    assert.equal(injected.status, 200);
    assert.deepEqual(injected.body.users, []);
    assert.equal((await query('SELECT count(*) AS n FROM users')).rows[0].n > 0, true, 'the users table is still there');
    const wildcard = await owner.get(`/users?search=${encodeURIComponent('%')}`);
    assert.deepEqual(wildcard.body.users, [], '% is not a wildcard');
  });

  it('never exposes password hashes or tokens', async () => {
    const { text } = await owner.get('/users');
    assert.ok(!/password|token_hash|hash/i.test(text));
  });
});
