import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';

let server;
let owner;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => server.close());

describe('the API keeps its head', () => {
  it('answers health checks', async () => {
    const health = await createClient(server.baseUrl).get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.database, 'up');
  });

  it('turns malformed JSON into a 400, not a crash', async () => {
    const response = await owner.post('/users', undefined, { raw: '{"name": ', headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /JSON/);
  });

  it('turns an oversized body into a 413', async () => {
    const response = await owner.post('/auth/login', { email: 'a@b.co', password: 'x'.repeat(1_200_000) });
    assert.equal(response.status, 413);
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const response = await owner.get('/nope');
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'not_found');
  });

  it('rejects ids that are not UUIDs before touching the database', async () => {
    assert.equal((await owner.patch('/users/1;DROP TABLE users', { name: 'x' })).status, 400);
  });

  it('never leaks a stack trace or server details', async () => {
    const response = await owner.get('/users/not-a-uuid');
    assert.ok(!/at\s+\S+\s+\(/.test(response.text), 'no stack trace');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.ok(response.headers.get('x-request-id'));
  });

  it('sets security headers', async () => {
    const response = await createClient(server.baseUrl).get('/health');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(!/upgrade-insecure-requests/.test(response.headers.get('content-security-policy')), 'plain-http deployments keep working');
  });

  it('accepts several requests at once without mixing them up', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => owner.get('/users')));
    assert.ok(results.every((result) => result.status === 200));
  });
});
