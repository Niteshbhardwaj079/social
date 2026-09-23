import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';

let server;
let owner;
let contributor;
let analyst;

async function makeUser(name, role) {
  await owner.post('/users', { name, email: `${role}@example.com`, role, language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [`${role}@example.com`]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(`${role}@example.com`)).status, 200);
  return client;
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  contributor = await makeUser('Con Tributor', 'contributor');
  analyst = await makeUser('Ana Lyst', 'analyst');
});
after(async () => server.close());

describe('creating and listing links', () => {
  it('requires sign-in to list', async () => {
    assert.equal((await createClient(server.baseUrl).get('/links')).status, 401);
  });

  it('everyone signed in can list; a Contributor can create, an Analyst cannot', async () => {
    assert.equal((await analyst.get('/links')).status, 200);
    assert.equal((await analyst.post('/links', { destinationUrl: 'https://gowebkart.in/x' })).status, 403);

    const created = await contributor.post('/links', { destinationUrl: 'https://gowebkart.in/offer', label: 'Diwali Offer' });
    assert.equal(created.status, 201);
    assert.match(created.body.link.slug, /^[a-z0-9-]{3,}$/, 'auto-generated slug is real and URL-safe');
    assert.equal(created.body.link.destinationUrl, 'https://gowebkart.in/offer');
    assert.equal(created.body.link.clicks, 0);
    assert.equal(created.body.link.clickHistory.length, 14, 'always 14 days, even brand new');
    assert.ok(created.body.link.clickHistory.every((day) => day.clicks === 0));
  });

  it('honours a custom slug, refuses a duplicate, refuses a bad URL, refuses a reserved word', async () => {
    const first = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/a', customSlug: 'My Promo!' });
    assert.equal(first.status, 201);
    assert.equal(first.body.link.slug, 'my-promo', 'normalized to lowercase, punctuation stripped');

    const dup = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/b', customSlug: 'my-promo' });
    assert.equal(dup.status, 400);

    const badUrl = await owner.post('/links', { destinationUrl: 'not a url' });
    assert.equal(badUrl.status, 400);

    const reserved = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/c', customSlug: 'api' });
    assert.equal(reserved.status, 400);
  });
});

describe('the real redirect (GET /l/:slug, not under /api)', () => {
  it('redirects to the real destination and records a real click', async () => {
    const created = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/redirect-target', customSlug: 'click-test' });
    const slug = created.body.link.slug;

    const response = await fetch(`${server.baseUrl}/l/${slug}`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://gowebkart.in/redirect-target');

    // Case-insensitive too — someone forwarding the link by hand might not preserve case exactly.
    await fetch(`${server.baseUrl}/l/${slug.toUpperCase()}`, { redirect: 'manual' });

    const list = await owner.get('/links');
    const link = list.body.links.find((item) => item.slug === slug);
    assert.equal(link.clicks, 2, 'both real visits were counted');
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = link.clickHistory.find((day) => day.date === today);
    assert.equal(todayRow.clicks, 2, 'the click shows up on the right calendar day');
  });

  it('a slug that does not exist is a plain, honest 404 — not a redirect to nowhere, not the SPA shell', async () => {
    const response = await fetch(`${server.baseUrl}/l/does-not-exist`, { redirect: 'manual' });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') || '', /text\/plain/);
  });
});

describe('deleting', () => {
  it('a Contributor can delete their own and others’ links (link shortener is a shared team tool, not per-author)', async () => {
    const created = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/to-delete' });
    const response = await contributor.delete(`/links/${created.body.link.id}`);
    assert.equal(response.status, 200);
    assert.equal((await owner.get('/links')).body.links.some((link) => link.id === created.body.link.id), false);
  });

  it('an Analyst cannot delete', async () => {
    const created = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/keep' });
    assert.equal((await analyst.delete(`/links/${created.body.link.id}`)).status, 403);
  });

  it('bulk-deletes several at once', async () => {
    const a = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/bulk-a' });
    const b = await owner.post('/links', { destinationUrl: 'https://gowebkart.in/bulk-b' });
    const response = await owner.delete('/links', { body: { ids: [a.body.link.id, b.body.link.id] } });
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, 2);
  });
});
