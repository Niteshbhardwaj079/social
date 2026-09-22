import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, createClient, outboxFor, setupOwner, startServer, tokenFromEmail, waitFor } from './helpers.js';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

let server;
let owner;

async function addAnalyst() {
  const created = await owner.post('/users', { name: 'Ana Lyst', email: 'ana@example.com', role: 'analyst', language: 'en' });
  assert.equal(created.status, 201);
  const invite = await waitFor(async () => (await outboxFor('ana@example.com')).find((row) => row.event_key === 'users.invited'));
  const client = createClient(server.baseUrl);
  const accepted = await client.post('/auth/accept-invite', { token: tokenFromEmail(invite.html, 'accept-invite'), password: PASSWORD });
  client.accessToken = accepted.body.accessToken;
  return client;
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

describe('activity logs', () => {
  it('requires sign-in', async () => {
    assert.equal((await createClient(server.baseUrl).get('/activity-logs')).status, 401);
    assert.equal((await createClient(server.baseUrl).delete('/activity-logs', { body: { ids: [1] } })).status, 401);
  });

  it('only Super Admin / Admin may view or delete the log', async () => {
    const analyst = await addAnalyst();
    assert.equal((await analyst.get('/activity-logs')).status, 403);
    assert.equal((await analyst.delete('/activity-logs', { body: { ids: [1] } })).status, 403);
  });

  it('records a real action with real, readable detail — not a mock row', async () => {
    const created = await owner.post('/campaigns', { name: 'Diwali Festive Offer' });
    assert.equal(created.status, 201);

    const response = await owner.get('/activity-logs');
    assert.equal(response.status, 200);
    const entry = response.body.activity.find((row) => row.action === 'campaign.created' && row.entityId === created.body.campaign.id);
    assert.ok(entry, 'the real campaign.created row is in the log');
    assert.equal(entry.entity, 'campaign');
    assert.equal(entry.meta.name, 'Diwali Festive Offer');
    assert.equal(entry.actor.name, 'Nitesh Owner');
  });

  it('the device is parsed from the real request, never fabricated', async () => {
    const login = await createClient(server.baseUrl).post(
      '/auth/login',
      { email: 'owner@example.com', password: PASSWORD },
      { headers: { 'user-agent': DESKTOP_UA } }
    );
    assert.equal(login.status, 200);

    const response = await owner.get('/activity-logs');
    const entry = response.body.activity.find((row) => row.action === 'auth.login');
    assert.equal(entry.device, 'Chrome on Windows');
  });

  it('deletes real rows by id, and only those rows', async () => {
    await owner.post('/campaigns', { name: 'To be deleted from the log' });
    const before = await owner.get('/activity-logs');
    const target = before.body.activity.find((row) => row.action === 'campaign.created' && row.meta.name === 'To be deleted from the log');
    assert.ok(target);

    const deleted = await owner.delete('/activity-logs', { body: { ids: [target.id] } });
    assert.equal(deleted.status, 200);

    const after = await owner.get('/activity-logs');
    assert.ok(!after.body.activity.some((row) => row.id === target.id), 'the deleted row is gone');
    assert.equal(after.body.activity.length, before.body.activity.length - 1, 'nothing else was removed');
  });
});
