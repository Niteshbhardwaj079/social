import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { recheckAccount } from '../src/services/socialAccountService.js';

const realFetch = globalThis.fetch;
let platform = () => null;
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const blueskyPlatform = (followers) => (url) => {
  if (url.pathname.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
  if (url.pathname.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: followers });
  return null;
};
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  return platform(url, init) ?? reply(404, { error: 'not stubbed' });
};

let server;
let owner;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('the dashboard', () => {
  it('requires sign-in', async () => {
    assert.equal((await createClient(server.baseUrl).get('/dashboard')).status, 401);
  });

  it('is real: followers, activity, and posts all come from what actually happened, not a mock', async () => {
    platform = blueskyPlatform(120);
    assert.equal((await owner.put('/social-accounts/bluesky', { credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } })).status, 200);

    const first = await owner.get('/dashboard');
    assert.equal(first.status, 200);
    assert.equal(first.body.kpis.find((kpi) => kpi.key === 'followers').value, 120);
    assert.ok(first.body.followersGrowth.at(-1).followers >= 120, 'today\'s point on the growth chart reflects the real count');
    assert.deepEqual(
      first.body.platformPerformance.find((row) => row.platform === 'bluesky'),
      { platform: 'bluesky', followers: 120, engagement: 0 }
    );
    assert.ok(first.body.recentActivity.some((entry) => entry.action === 'social connected'), 'a dotted action code is humanized (dot -> space)');
    // Honestly zero, not an invented number — there is no per-post insights source yet.
    assert.equal(first.body.kpis.find((kpi) => kpi.key === 'engagement').value, 0);
    assert.deepEqual(first.body.engagementTrend, []);

    // Follower count changes for real (Sync now) -> the dashboard reflects the new real number.
    platform = blueskyPlatform(150);
    await recheckAccount('bluesky');
    const second = await owner.get('/dashboard');
    assert.equal(second.body.kpis.find((kpi) => kpi.key === 'followers').value, 150);

    // A real post shows up in recentPosts/upcomingPosts/postsPublished, not mock data.
    const draft = await owner.post('/posts', { content: 'dashboard test draft', platforms: ['bluesky'], status: 'draft' });
    assert.equal(draft.status, 201);
    const withPost = await owner.get('/dashboard');
    assert.ok(withPost.body.recentPosts.some((post) => post.id === draft.body.post.id));
  });

  it('two follower snapshots recorded seconds apart both land on today, not two separate days', async () => {
    platform = blueskyPlatform(200);
    await recheckAccount('bluesky');
    platform = blueskyPlatform(210);
    await recheckAccount('bluesky');
    const response = await owner.get('/dashboard');
    const today = response.body.followersGrowthByRange['7d'].at(-1);
    assert.equal(today.followers, 210, 'the latest snapshot for today wins, not a sum of both');
  });
});

describe('follower history is honest about accounts with no snapshot yet', () => {
  it('a platform that has never been connected contributes nothing, not a guessed baseline', async () => {
    await query('TRUNCATE account_metrics_history, social_accounts');
    const response = await owner.get('/dashboard');
    assert.equal(response.body.kpis.find((kpi) => kpi.key === 'followers').value, 0);
    assert.ok(response.body.followersGrowthByRange['7d'].every((point) => point.followers === 0));
  });
});
