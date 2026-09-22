import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { config } from '../src/config/env.js';

const realFetch = globalThis.fetch;
let override = () => null;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return realFetch(input, init);
  const stub = await override(url, init);
  if (stub) return stub;
  return realFetch(input, init); // real internet for the "linked image" DNS-and-fetch tests (example.com)
};
afterEach(() => {
  override = () => null;
});

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
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

/** Uploads bytes as multipart/form-data straight to /api/media using a signed-in client's token. */
async function uploadBytes(client, bytes, { filename = 'test.png', type = 'image/png', folder, width, height } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  if (folder) form.append('folder', folder);
  if (width) form.append('width', String(width));
  if (height) form.append('height', String(height));
  const response = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${client.accessToken}` }, body: form });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function replaceBytes(client, id, bytes, { type = 'image/png', width, height } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), 'replacement.png');
  if (width) form.append('width', String(width));
  if (height) form.append('height', String(height));
  const response = await fetch(`${server.baseUrl}/api/media/${id}`, { method: 'PATCH', headers: { authorization: `Bearer ${client.accessToken}` }, body: form });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('uploading to Server storage (local disk)', () => {
  it('needs a sign-in, and refuses an analyst (read-only)', async () => {
    const anon = createClient(server.baseUrl);
    assert.equal((await anon.get('/media')).status, 401);
    const denied = await uploadBytes(analyst, PNG_1X1);
    assert.equal(denied.status, 403);
  });

  it('stores the file, serves it back over HTTP, and lists it', async () => {
    const uploaded = await uploadBytes(contributor, PNG_1X1, { width: 1, height: 1, folder: 'Brand' });
    assert.equal(uploaded.status, 201);
    const item = uploaded.body.item;
    assert.equal(item.type, 'image');
    assert.equal(item.storage, 'server');
    assert.equal(item.storageLabel, 'Server');
    assert.equal(item.folder, 'Brand');
    assert.equal(item.uploadedBy, 'Con Tributor');
    assert.equal(item.sizeKb, Math.round(PNG_1X1.length / 1024));

    const url = new URL(item.publicUrl);
    const served = await fetch(`${server.baseUrl}${url.pathname}`);
    assert.equal(served.status, 200);
    assert.equal(Buffer.from(await served.arrayBuffer()).equals(PNG_1X1), true);

    const onDisk = path.join(config.media.localDir, decodeURIComponent(url.pathname.replace('/media/', '')));
    assert.equal((await fs.readFile(onDisk)).equals(PNG_1X1), true);

    const list = await owner.get('/media');
    assert.ok(list.body.items.some((entry) => entry.id === item.id));
    const folders = await owner.get('/media/folders');
    assert.ok(folders.body.folders.includes('Brand'));
    assert.ok(folders.body.folders.includes('All Media'));
  });

  it('rejects a file that is not an image or a video', async () => {
    const response = await uploadBytes(contributor, Buffer.from('just text'), { filename: 'notes.txt', type: 'text/plain' });
    assert.equal(response.status, 400);
  });

  it('re-cropping replaces the bytes and the old file is gone from disk', async () => {
    const { body } = await uploadBytes(contributor, PNG_1X1, { width: 1, height: 1 });
    const oldPath = path.join(config.media.localDir, decodeURIComponent(new URL(body.item.publicUrl).pathname.replace('/media/', '')));
    const bigger = Buffer.concat([PNG_1X1, Buffer.alloc(50)]);

    const replaced = await replaceBytes(contributor, body.item.id, bigger, { width: 2, height: 2 });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.item.width, 2);
    assert.equal(replaced.body.item.sizeKb, Math.round(bigger.length / 1024));
    assert.notEqual(replaced.body.item.publicUrl, body.item.publicUrl, 'a new object was written, not the same key overwritten in place');

    await assert.rejects(fs.access(oldPath));
    const newPath = path.join(config.media.localDir, decodeURIComponent(new URL(replaced.body.item.publicUrl).pathname.replace('/media/', '')));
    assert.equal((await fs.readFile(newPath)).equals(bigger), true);
  });

  it('deleting removes the row and the file from disk, and can be repeated safely', async () => {
    const { body } = await uploadBytes(contributor, PNG_1X1);
    const filePath = path.join(config.media.localDir, decodeURIComponent(new URL(body.item.publicUrl).pathname.replace('/media/', '')));
    assert.equal((await owner.delete(`/media/${body.item.id}`)).status, 200);
    await assert.rejects(fs.access(filePath));
    assert.equal((await query('SELECT 1 FROM media_items WHERE id = $1', [body.item.id])).rowCount, 0);
    assert.equal((await owner.delete(`/media/${body.item.id}`)).status, 404);
  });

  it('an unknown id is a 404, not a crash', async () => {
    assert.equal((await owner.delete('/media/00000000-0000-4000-8000-000000000000')).status, 404);
  });
});

describe('linking an image that is already online', () => {
  it('needs a plain http(s) address and turns away a private network', async () => {
    for (const url of ['ftp://example.com/x.jpg', 'https://127.0.0.1/x.jpg', 'https://169.254.169.254/x.jpg', 'not a url']) {
      const response = await owner.post('/media/link', { url, name: 'x.jpg' });
      assert.equal(response.status, 400, url);
    }
  });

  it('adds it without storing any bytes, and refuses a link that is not an image', async () => {
    override = (url) => (url.hostname === 'example.com' && url.pathname === '/photo.jpg' ? new Response('', { status: 200, headers: { 'content-type': 'image/jpeg' } }) : null);
    const added = await owner.post('/media/link', { url: 'https://example.com/photo.jpg', name: 'photo.jpg', width: 800, height: 600 });
    assert.equal(added.status, 201);
    assert.equal(added.body.item.storage, 'linked');
    assert.equal(added.body.item.storageLabel, 'Linked');
    assert.equal(added.body.item.publicUrl, 'https://example.com/photo.jpg');
    assert.equal(added.body.item.sizeKb, 0);

    override = (url) => (url.hostname === 'example.com' ? new Response('', { status: 200, headers: { 'content-type': 'text/html' } }) : null);
    const notImage = await owner.post('/media/link', { url: 'https://example.com/page.html' });
    assert.equal(notImage.status, 400);
  });

  it('reports a link that does not open', async () => {
    override = (url) => (url.hostname === 'example.com' ? new Response('nope', { status: 404 }) : null);
    const response = await owner.post('/media/link', { url: 'https://example.com/missing.jpg' });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Could not open that link/);
  });
});

describe('a storage limit is enforced', () => {
  it('refuses an upload that would go over the limit, and clears once space is set back to none', async () => {
    await owner.put('/storage/preferences', { serverEnabled: true, externalEnabled: false, limitValue: 1, limitUnit: 'MB' });
    const overLimit = Buffer.alloc(1024 * 1024 + 1);
    const response = await uploadBytes(contributor, overLimit, { filename: 'big.png' });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /storage limit/);

    const withinLimit = await uploadBytes(contributor, PNG_1X1);
    assert.equal(withinLimit.status, 201);

    await owner.put('/storage/preferences', { serverEnabled: true, externalEnabled: false, limitValue: '', limitUnit: 'GB' });
    const nowFine = await uploadBytes(contributor, overLimit, { filename: 'big2.png' });
    assert.equal(nowFine.status, 201);
    await owner.delete(`/media/${nowFine.body.item.id}`);
  });
});

describe('used-in warnings and bulk delete', () => {
  it('shows which draft posts use a file, and deleting it anyway un-links them', async () => {
    const { body: media } = await uploadBytes(contributor, PNG_1X1);
    const post = await contributor.post('/posts', { content: 'Uses a photo', platforms: ['bluesky'], status: 'draft', mediaIds: [media.item.id] });
    assert.equal(post.status, 201);
    assert.deepEqual(post.body.post.media.map((entry) => entry.id), [media.item.id]);

    const list = await owner.get('/media');
    const found = list.body.items.find((entry) => entry.id === media.item.id);
    assert.equal(found.usedIn.length, 1);
    assert.equal(found.usedIn[0].status, 'draft');

    assert.equal((await owner.delete(`/media/${media.item.id}`)).status, 200);
    const stillThere = await owner.get(`/posts/${post.body.post.id}`);
    assert.equal(stillThere.body.post.media.length, 0, 'the post itself is untouched, just no longer pointing at the deleted file');
  });

  it('bulk-delete removes what it can and reports a clean count', async () => {
    const a = await uploadBytes(contributor, PNG_1X1);
    const b = await uploadBytes(contributor, PNG_1X1);
    const response = await owner.post('/media/bulk-delete', { ids: [a.body.item.id, b.body.item.id] });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { deleted: 2, skipped: 0 });
  });
});

describe('the activity log', () => {
  it('records uploads, links and deletes', async () => {
    const log = (await owner.get('/activity-logs?limit=200')).body.activity.map((entry) => entry.action);
    for (const action of ['media.uploaded', 'media.linked', 'media.deleted', 'media.replaced']) assert.ok(log.includes(action), action);
  });
});
