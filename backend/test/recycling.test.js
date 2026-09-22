import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { runRecyclingPass } from '../src/services/recyclingService.js';

// No real platform is contacted: Bluesky's own endpoints are answered here.
const realFetch = globalThis.fetch;
let calls = [];
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const blueskyPlatform = (url) => {
  if (url.pathname.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
  if (url.pathname.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 3 });
  if (url.pathname.endsWith('createRecord')) return reply(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc', cid: 'c' });
  return null;
};
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  return blueskyPlatform(url) ?? reply(404, { error: 'not stubbed' });
};

const blueskyPosts = () => calls.filter((call) => call.url.hostname === 'bsky.social' && call.url.pathname.endsWith('createRecord'));

let server;
let owner;
let editor;
let contributor;

async function makeUser(name, role) {
  await owner.post('/users', { name, email: `${role}@example.com`, role, language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [`${role}@example.com`]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(`${role}@example.com`)).status, 200);
  return client;
}

const publishedPost = (client, content) => client.post('/posts', { content, platforms: ['bluesky'], status: 'published' }).then((response) => response.body.post);
const setDue = (entryId) => query('UPDATE recycling_entries SET next_run_at = now() - interval \'1 minute\' WHERE id = $1', [entryId]);

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Itor', 'editor');
  contributor = await makeUser('Con Tributor', 'contributor');
  assert.equal((await owner.put('/social-accounts/bluesky', { credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } })).status, 200);
  calls = [];
});
afterEach(() => {
  calls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('who can do what', () => {
  it('everyone signed in can read; nobody signed out can', async () => {
    assert.equal((await contributor.get('/recycling')).status, 200);
    assert.equal((await createClient(server.baseUrl).get('/recycling')).status, 401);
  });

  it('only Editor/Admin/Super Admin can add, change or remove', async () => {
    const post = await publishedPost(editor, 'contributor cannot recycle this');
    assert.equal((await contributor.post('/recycling', { postId: post.id, intervalDays: 30 })).status, 403);

    const added = await editor.post('/recycling', { postId: post.id, intervalDays: 30 });
    assert.equal(added.status, 201);
    assert.equal((await contributor.patch(`/recycling/${added.body.entry.id}`, { isActive: false })).status, 403);
    assert.equal((await contributor.delete(`/recycling/${added.body.entry.id}`)).status, 403);
  });
});

describe('adding to the queue', () => {
  it('copies the post\'s content and platforms, and schedules the next run from today', async () => {
    const post = await publishedPost(editor, 'Thank you for 25,000 followers!');
    const before = Date.now();
    const response = await editor.post('/recycling', { postId: post.id, intervalDays: 30 });
    assert.equal(response.status, 201);
    const entry = response.body.entry;
    assert.equal(entry.postId, post.id);
    assert.equal(entry.content, 'Thank you for 25,000 followers!');
    assert.deepEqual(entry.platforms, ['bluesky']);
    assert.equal(entry.intervalDays, 30);
    assert.equal(entry.isActive, true);
    assert.equal(entry.totalReposts, 0);
    assert.equal(entry.lastRunAt, null);
    assert.ok(new Date(entry.nextRunAt).getTime() - before >= 29 * 24 * 3600_000);
  });

  it('rejects a draft or scheduled post — only a published one can be recycled', async () => {
    const draft = (await editor.post('/posts', { content: 'still a draft', platforms: ['bluesky'], status: 'draft' })).body.post;
    const response = await editor.post('/recycling', { postId: draft.id, intervalDays: 30 });
    assert.equal(response.status, 400);
  });

  it('rejects an interval that is not one of the offered choices', async () => {
    const post = await publishedPost(editor, 'bad interval test');
    assert.equal((await editor.post('/recycling', { postId: post.id, intervalDays: 45 })).status, 400);
  });

  it('refuses a second entry for the same post', async () => {
    const post = await publishedPost(editor, 'only once please');
    assert.equal((await editor.post('/recycling', { postId: post.id, intervalDays: 30 })).status, 201);
    const second = await editor.post('/recycling', { postId: post.id, intervalDays: 60 });
    assert.equal(second.status, 409);
  });
});

describe('changing and removing entries', () => {
  it('pausing and resuming does not touch the schedule; changing the interval re-bases it from now', async () => {
    const post = await publishedPost(editor, 'pause and resume test');
    const entry = (await editor.post('/recycling', { postId: post.id, intervalDays: 30 })).body.entry;

    const paused = await editor.patch(`/recycling/${entry.id}`, { isActive: false });
    assert.equal(paused.body.entry.isActive, false);
    assert.equal(paused.body.entry.nextRunAt, entry.nextRunAt, 'pausing alone does not move the schedule');

    const resumed = await editor.patch(`/recycling/${entry.id}`, { isActive: true });
    assert.equal(resumed.body.entry.isActive, true);

    const before = Date.now();
    const rescheduled = await editor.patch(`/recycling/${entry.id}`, { intervalDays: 90 });
    assert.equal(rescheduled.body.entry.intervalDays, 90);
    assert.ok(new Date(rescheduled.body.entry.nextRunAt).getTime() - before >= 89 * 24 * 3600_000, 'now 90 days out from today, not from the old schedule');
  });

  it('bulk pause/resume and bulk remove act only on the given ids', async () => {
    const a = (await editor.post('/recycling', { postId: (await publishedPost(editor, 'bulk a')).id, intervalDays: 14 })).body.entry;
    const b = (await editor.post('/recycling', { postId: (await publishedPost(editor, 'bulk b')).id, intervalDays: 14 })).body.entry;
    const untouched = (await editor.post('/recycling', { postId: (await publishedPost(editor, 'bulk c untouched')).id, intervalDays: 14 })).body.entry;

    const paused = await editor.post('/recycling/bulk-update', { ids: [a.id, b.id], isActive: false });
    assert.deepEqual(paused.body, { success: true, updated: 2 });
    assert.equal((await editor.get('/recycling')).body.entries.find((e) => e.id === untouched.id).isActive, true);

    const removed = await editor.post('/recycling/bulk-delete', { ids: [a.id, b.id] });
    assert.deepEqual(removed.body, { success: true, removed: 2 });
    const remaining = (await editor.get('/recycling')).body.entries.map((e) => e.id);
    assert.ok(!remaining.includes(a.id) && !remaining.includes(b.id) && remaining.includes(untouched.id));
  });

  it('deleting the source post removes its recycling entry too', async () => {
    const post = await publishedPost(editor, 'will be deleted');
    const entry = (await editor.post('/recycling', { postId: post.id, intervalDays: 30 })).body.entry;
    await query('DELETE FROM posts WHERE id = $1', [post.id]);
    assert.equal((await editor.get('/recycling')).body.entries.some((e) => e.id === entry.id), false);
  });

  it('404s for an id that does not exist', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    assert.equal((await editor.patch(`/recycling/${missing}`, { isActive: false })).status, 404);
    assert.equal((await editor.delete(`/recycling/${missing}`)).status, 404);
  });
});

describe('the repost itself', () => {
  it('creates a brand-new post with the same content and platforms, and advances the schedule', async () => {
    const post = await publishedPost(editor, 'Behind the scenes at Gowebkart');
    const entry = (await editor.post('/recycling', { postId: post.id, intervalDays: 30 })).body.entry;
    await setDue(entry.id);
    calls = [];

    const reposted = await runRecyclingPass();
    assert.equal(reposted, 1);
    assert.equal(blueskyPosts().length, 1, 'a real publish attempt was made');

    const after = (await editor.get('/recycling')).body.entries.find((e) => e.id === entry.id);
    assert.equal(after.totalReposts, 1);
    assert.ok(after.lastRunAt);
    assert.ok(new Date(after.nextRunAt).getTime() > Date.now() + 29 * 24 * 3600_000, 'moved forward a full interval from now');

    const original = await editor.get(`/posts/${post.id}`);
    assert.equal(original.body.post.status, 'published', 'the original post itself is untouched');

    const allPosts = (await editor.get('/posts')).body.posts;
    const copy = allPosts.find((item) => item.id !== post.id && item.content === 'Behind the scenes at Gowebkart');
    assert.ok(copy, 'a separate new post was created with the same content');
    assert.equal(copy.status, 'published');
    assert.deepEqual(copy.platforms, ['bluesky']);
  });

  it('a paused entry is never reposted even if its time has come', async () => {
    const post = await publishedPost(editor, 'stays paused');
    const entry = (await editor.post('/recycling', { postId: post.id, intervalDays: 30 })).body.entry;
    await editor.patch(`/recycling/${entry.id}`, { isActive: false });
    await setDue(entry.id);
    calls = [];

    assert.equal(await runRecyclingPass(), 0);
    assert.equal(blueskyPosts().length, 0);
  });

  it('two passes at once still repost each due entry exactly once', async () => {
    const post = await publishedPost(editor, 'race condition check');
    const entry = (await editor.post('/recycling', { postId: post.id, intervalDays: 14 })).body.entry;
    await setDue(entry.id);
    calls = [];

    const [a, b] = await Promise.all([runRecyclingPass(), runRecyclingPass()]);
    assert.equal(a + b, 1, 'exactly one of the two passes claimed it');
    assert.equal(blueskyPosts().length, 1);

    const after = (await editor.get('/recycling')).body.entries.find((e) => e.id === entry.id);
    assert.equal(after.totalReposts, 1);
  });
});
