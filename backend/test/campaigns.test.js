import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';

let server;
let owner;
let editor;
let contributor;
let analyst;

async function makeUser(name, role) {
  await owner.post('/users', { name, email: `${role}@example.com`, role, language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [`${role}@example.com`]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(`${role}@example.com`)).status, 200);
  return client;
}

// Every post here stays 'draft' — assertReady() skips connected-platform checks for drafts, so this
// file needs no platform stubbing at all to prove the campaign/post relationship works for real.
const draftPost = (client, body) => client.post('/posts', { content: 'Hello world', platforms: ['bluesky'], status: 'draft', ...body });

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Itor', 'editor');
  contributor = await makeUser('Con Tributor', 'contributor');
  analyst = await makeUser('Ana Lyst', 'analyst');
});
after(async () => server.close());

describe('who can do what', () => {
  it('everyone signed in can read; nobody signed out can', async () => {
    assert.equal((await analyst.get('/campaigns')).status, 200);
    assert.equal((await contributor.get('/campaigns')).status, 200);
    assert.equal((await createClient(server.baseUrl).get('/campaigns')).status, 401);
  });

  it('only Editor/Admin/Super Admin can create, change or delete', async () => {
    assert.equal((await contributor.post('/campaigns', { name: 'nope' })).status, 403);
    assert.equal((await analyst.post('/campaigns', { name: 'nope' })).status, 403);

    const created = await editor.post('/campaigns', { name: 'Editor campaign' });
    assert.equal(created.status, 201);
    const id = created.body.campaign.id;
    assert.equal((await contributor.patch(`/campaigns/${id}`, { name: 'y' })).status, 403);
    assert.equal((await contributor.delete(`/campaigns/${id}`)).status, 403);
    assert.equal((await owner.patch(`/campaigns/${id}`, { name: 'Super Admin can too' })).status, 200);
  });
});

describe('creating and reading', () => {
  it('stores the fields, defaults sensibly, and names the real owner', async () => {
    const response = await editor.post('/campaigns', {
      name: 'Q3 Launch',
      description: 'Launch campaign',
      objective: 'Awareness',
      platforms: ['bluesky', 'mastodon'],
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    assert.equal(response.status, 201);
    const campaign = response.body.campaign;
    assert.equal(campaign.name, 'Q3 Launch');
    assert.equal(campaign.status, 'scheduled', 'default status');
    assert.equal(campaign.owner, 'Ed Itor');
    assert.deepEqual(campaign.platforms, ['bluesky', 'mastodon']);
    assert.equal(campaign.postsCount, 0);
    assert.equal(campaign.publishedCount, 0);
    // No analytics source exists yet — these are honestly zero, not invented numbers.
    assert.equal(campaign.engagement, 0);
    assert.equal(campaign.reach, 0);
    assert.equal(campaign.clicks, 0);

    const fetched = await editor.get(`/campaigns/${campaign.id}`);
    assert.equal(fetched.body.campaign.name, 'Q3 Launch');
  });

  it('rejects an empty name and an unknown status', async () => {
    assert.equal((await editor.post('/campaigns', { name: '   ' })).status, 400);
    assert.equal((await editor.post('/campaigns', { name: 'x', status: 'bogus' })).status, 400);
  });
});

describe('updating and deleting', () => {
  it('changes only the given fields', async () => {
    const { body } = await editor.post('/campaigns', { name: 'Original', objective: 'Traffic' });
    const updated = await editor.patch(`/campaigns/${body.campaign.id}`, { status: 'active' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.campaign.status, 'active');
    assert.equal(updated.body.campaign.name, 'Original', 'untouched field stays as it was');
    assert.equal(updated.body.campaign.objective, 'Traffic');
  });

  it('deleting a campaign un-tags its posts instead of touching them', async () => {
    const campaign = (await editor.post('/campaigns', { name: 'To delete' })).body.campaign;
    const post = (await draftPost(editor, { campaignId: campaign.id })).body.post;
    assert.equal(post.campaignId, campaign.id);

    assert.equal((await editor.delete(`/campaigns/${campaign.id}`)).status, 200);
    assert.equal((await editor.get(`/campaigns/${campaign.id}`)).status, 404);

    const reloaded = await editor.get(`/posts/${post.id}`);
    assert.equal(reloaded.status, 200, 'the post itself is untouched');
    assert.equal(reloaded.body.post.campaignId, null, 'just un-tagged');
  });

  it('404s for an id that does not exist', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    assert.equal((await editor.get(`/campaigns/${missing}`)).status, 404);
    assert.equal((await editor.patch(`/campaigns/${missing}`, { name: 'x' })).status, 404);
    assert.equal((await editor.delete(`/campaigns/${missing}`)).status, 404);
  });
});

describe('post counts are real, rolled up from actual posts', () => {
  it('counts by status, not a stored/guessed number', async () => {
    const campaign = (await editor.post('/campaigns', { name: 'Rollup test' })).body.campaign;
    await draftPost(editor, { campaignId: campaign.id, content: 'one' });
    await draftPost(editor, { campaignId: campaign.id, content: 'two' });
    const third = (await draftPost(editor, { campaignId: campaign.id, content: 'three' })).body.post;
    await query("UPDATE posts SET status = 'failed' WHERE id = $1", [third.id]);

    const reloaded = (await editor.get(`/campaigns/${campaign.id}`)).body.campaign;
    assert.equal(reloaded.postsCount, 3);
    assert.equal(reloaded.failedCount, 1);
    assert.equal(reloaded.publishedCount, 0);
    assert.equal(reloaded.scheduledCount, 0);
  });

  it('rejects a post pointed at a campaign that does not exist', async () => {
    const response = await draftPost(editor, { campaignId: '00000000-0000-0000-0000-000000000000' });
    assert.equal(response.status, 400);
  });

  it('a post can be moved to another campaign, or cleared, on update', async () => {
    const a = (await editor.post('/campaigns', { name: 'A' })).body.campaign;
    const b = (await editor.post('/campaigns', { name: 'B' })).body.campaign;
    const post = (await draftPost(editor, { campaignId: a.id })).body.post;

    const moved = await editor.patch(`/posts/${post.id}`, { campaignId: b.id });
    assert.equal(moved.body.post.campaignId, b.id);

    const cleared = await editor.patch(`/posts/${post.id}`, { campaignId: null });
    assert.equal(cleared.body.post.campaignId, null);
  });
});
