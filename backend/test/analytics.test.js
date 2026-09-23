import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { refreshPostMetrics } from '../src/services/analyticsService.js';

const realFetch = globalThis.fetch;
let calls = [];
let metricsOverride = () => null;

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stub(url) {
  const path = url.pathname;
  if (url.hostname === 'bsky.social') {
    if (path.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
    if (path.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 300 });
    if (path.endsWith('uploadBlob')) return reply(200, { blob: { $type: 'blob', ref: { $link: 'bafy-fake' }, mimeType: 'image/png', size: 68 } });
    if (path.endsWith('createRecord')) return reply(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc', cid: 'c' });
  }
  if (url.hostname === 'public.api.bsky.app' && path.endsWith('getPostThread')) {
    return metricsOverride(url) ?? reply(200, { thread: { post: { likeCount: 5, replyCount: 2, repostCount: 1 } } });
  }
  if (url.hostname === '93.184.216.34') {
    if (path === '/api/v1/accounts/verify_credentials') return reply(200, { id: '7', username: 'g', acct: 'g', display_name: 'G', followers_count: 1 });
    if (path === '/api/v2/media') return reply(200, { id: '99', url: null });
    if (path === '/api/v1/statuses') return reply(200, { id: '99', url: 'https://93.184.216.34/@g/99' });
    if (path === '/api/v1/statuses/99') return metricsOverride(url) ?? reply(200, { replies_count: 3, reblogs_count: 4, favourites_count: 10 });
  }
  if (url.hostname === 'api.x.com') {
    if (path === '/2/users/me') return reply(200, { data: { id: '42', name: 'G', username: 'g', public_metrics: { followers_count: 5 } } });
    if (path === '/2/tweets') return reply(201, { data: { id: '1234', text: 'ok' } });
    if (path === '/2/tweets/1234') return metricsOverride(url) ?? reply(200, { data: { public_metrics: { like_count: 20, reply_count: 3, retweet_count: 5, impression_count: 500 } } });
  }
  if (url.hostname === 'upload.twitter.com' && path === '/1.1/media/upload.json') return reply(200, { media_id_string: 'x-media-1' });
  if (url.hostname === 'graph.facebook.com') {
    if (path.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
    if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart', followers_count: 100 });
    if (path.endsWith('/17841400000000000')) return reply(200, { id: '17841400000000000', username: 'gowebkart', followers_count: 50 });
    if (path.endsWith('/photos')) return reply(200, { id: 'photo-1', post_id: 'page-1_555' });
    if (path.endsWith('/media')) return reply(200, { id: 'ig-container-1' });
    if (path.endsWith('/media_publish')) return reply(200, { id: 'ig-post-1' });
    if (path.endsWith('/page-1_555')) return metricsOverride(url) ?? reply(200, { likes: { summary: { total_count: 15 } }, comments: { summary: { total_count: 2 } }, shares: { count: 1 } });
    if (path.endsWith('/ig-post-1')) return metricsOverride(url) ?? reply(200, { like_count: 8, comments_count: 1 });
  }
  if (url.hostname === 'oauth2.googleapis.com' && path === '/token') return reply(200, { access_token: 'google-access-1' });
  if (url.hostname === 'www.googleapis.com') {
    if (path === '/youtube/v3/channels') return reply(200, { items: [{ id: 'yt-channel-1', snippet: { title: 'Gowebkart', customUrl: '@gowebkart' }, statistics: { subscriberCount: '10' } }] });
    if (path === '/upload/youtube/v3/videos' && url.searchParams.get('upload_id') === 'session-1') return reply(200, { id: 'yt-video-1' });
    if (path === '/upload/youtube/v3/videos') return new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-1' } });
    if (path === '/youtube/v3/videos') return metricsOverride(url) ?? reply(200, { items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '4' } }] });
  }
  if (url.hostname === 'api.pinterest.com') {
    if (path === '/v5/user_account') return reply(200, { id: 'pin-1', username: 'gowebkart', follower_count: 20 });
    if (path === '/v5/boards') return reply(200, { items: [{ id: 'board-1', name: 'Products' }] });
    if (path === '/v5/pins') return reply(201, { id: 'pin-post-1' });
  }
  return null;
}

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  return stub(url) ?? reply(404, { error: 'not stubbed' });
};

let server;
let owner;

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function uploadImage() {
  const form = new FormData();
  form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'photo.png');
  const response = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${owner.accessToken}` }, body: form });
  return (await response.json()).item.id;
}
async function uploadVideo() {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not a real video but has bytes')], { type: 'video/mp4' }), 'clip.mp4');
  const response = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${owner.accessToken}` }, body: form });
  return (await response.json()).item.id;
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  assert.equal((await owner.put('/social-accounts/bluesky', { credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/mastodon', { credentials: { instanceUrl: 'https://93.184.216.34', accessToken: 'mastodon-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/x', { credentials: { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/instagram', { credentials: { appId: '111222', appSecret: 'appsecret-abc', igUserId: '17841400000000000', accessToken: 'ig-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/youtube', { credentials: { clientId: 'yt-client', clientSecret: 'yt-secret', refreshToken: 'yt-refresh-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/pinterest', { credentials: { appId: 'pin-app-1', appSecret: 'pin-secret-1', accessToken: 'pin-token-123' } })).status, 200);
  calls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('per-post engagement metrics', () => {
  it('fetches real numbers for every platform this app can read metrics from, and leaves the rest alone', async () => {
    const imageId = await uploadImage();
    const textPost = await owner.post('/posts', {
      content: 'A real, published post',
      platforms: ['bluesky', 'mastodon', 'x', 'facebook', 'instagram'],
      status: 'published',
      mediaIds: [imageId],
    });
    assert.equal(textPost.status, 201);

    const videoId = await uploadVideo();
    const videoPost = await owner.post('/posts', { content: 'A real video', platforms: ['youtube'], status: 'published', mediaIds: [videoId] });
    assert.equal(videoPost.status, 201);

    const pinPost = await owner.post('/posts', {
      content: 'A real pin',
      platforms: ['pinterest'],
      status: 'published',
      mediaIds: [imageId],
      pinterestBoardId: 'board-1',
    });
    assert.equal(pinPost.status, 201);

    await refreshPostMetrics(0);

    const targets = (await query('SELECT platform, likes, comments, shares, views, metrics_checked_at FROM post_targets ORDER BY platform')).rows;
    const byPlatform = Object.fromEntries(targets.map((row) => [row.platform, row]));

    assert.deepEqual({ likes: byPlatform.bluesky.likes, comments: byPlatform.bluesky.comments, shares: byPlatform.bluesky.shares, views: byPlatform.bluesky.views }, { likes: 5, comments: 2, shares: 1, views: null });
    assert.deepEqual({ likes: byPlatform.mastodon.likes, comments: byPlatform.mastodon.comments, shares: byPlatform.mastodon.shares }, { likes: 10, comments: 3, shares: 4 });
    assert.deepEqual({ likes: byPlatform.x.likes, comments: byPlatform.x.comments, shares: byPlatform.x.shares, views: byPlatform.x.views }, { likes: 20, comments: 3, shares: 5, views: 500 });
    assert.deepEqual({ likes: byPlatform.facebook.likes, comments: byPlatform.facebook.comments, shares: byPlatform.facebook.shares }, { likes: 15, comments: 2, shares: 1 });
    assert.deepEqual({ likes: byPlatform.instagram.likes, comments: byPlatform.instagram.comments, shares: byPlatform.instagram.shares }, { likes: 8, comments: 1, shares: null });
    assert.deepEqual({ likes: byPlatform.youtube.likes, comments: byPlatform.youtube.comments, views: byPlatform.youtube.views }, { likes: 50, comments: 4, views: 1000 });

    // Pinterest is real-published but this app does not yet fetch its metrics — honestly left null, never checked.
    assert.equal(byPlatform.pinterest.likes, null);
    assert.equal(byPlatform.pinterest.metrics_checked_at, null);

    for (const platform of ['bluesky', 'mastodon', 'x', 'facebook', 'instagram', 'youtube']) {
      assert.ok(byPlatform[platform].metrics_checked_at, `${platform} was actually checked`);
    }
  });

  it('a failed fetch (5xx) leaves the last known numbers alone, and never blocks the other platforms', async () => {
    await query('UPDATE post_targets SET metrics_checked_at = NULL');
    metricsOverride = (url) => (url.hostname === 'api.x.com' ? reply(503, { error: 'down' }) : null);

    await refreshPostMetrics(0);

    const x = (await query("SELECT likes, metrics_checked_at FROM post_targets WHERE platform = 'x'")).rows[0];
    assert.equal(x.likes, 20, 'the old number survives a failed refresh');
    assert.ok(x.metrics_checked_at, 'still marked checked, so a permanently-broken post does not get retried every single pass');

    const bluesky = (await query("SELECT likes, metrics_checked_at FROM post_targets WHERE platform = 'bluesky'")).rows[0];
    assert.equal(bluesky.likes, 5, 'a different platform failing never stops this one from refreshing');
    metricsOverride = () => null;
  });

  it('a due pass is a no-op while one is already running, and a second call right after does nothing extra', async () => {
    const before1 = (await query('SELECT metrics_checked_at FROM post_targets WHERE platform = $1', ['x'])).rows[0].metrics_checked_at;
    await Promise.all([refreshPostMetrics(1440), refreshPostMetrics(1440)]);
    // Nothing was due (just checked a moment ago, interval is 24h) — no crash, no change.
    const after1 = (await query('SELECT metrics_checked_at FROM post_targets WHERE platform = $1', ['x'])).rows[0].metrics_checked_at;
    assert.equal(new Date(before1).getTime(), new Date(after1).getTime());
  });
});

describe('GET /api/analytics/overview', () => {
  it('requires sign-in', async () => {
    assert.equal((await createClient(server.baseUrl).get('/analytics/overview')).status, 401);
  });

  it('returns real summary KPIs, a real engagement series, and real platform performance', async () => {
    const response = await owner.get('/analytics/overview?range=30d');
    assert.equal(response.status, 200);
    const { summary, series, platformPerformance } = response.body;

    const byKey = Object.fromEntries(summary.map((kpi) => [kpi.key, kpi]));
    // Total followers across every connected platform (same convention as the Dashboard): 300+1+5+100+50+10+20.
    assert.equal(byKey.followers.value, 486);
    // likes+comments+shares across every checked target: bluesky 5+2+1, mastodon 10+3+4, x 20+3+5, facebook 15+2+1, instagram 8+1+0, youtube 50+4+0
    assert.equal(byKey.engagement.value, 5 + 2 + 1 + (10 + 3 + 4) + (20 + 3 + 5) + (15 + 2 + 1) + (8 + 1) + (50 + 4));
    assert.equal(byKey.reach.value, 500 + 1000); // only X's impressions and YouTube's views report a view-style number
    assert.equal(byKey.postsPublished.value, 3);
    assert.ok(!('impressions' in byKey), 'no fabricated duplicate of reach under a different label');

    assert.equal(series.length, 30);
    assert.ok(series.some((day) => day.value > 0), 'today carries the real engagement just fetched');

    const bluesky = platformPerformance.find((row) => row.platform === 'bluesky');
    assert.equal(bluesky.followers, 300);
    assert.equal(bluesky.engagement, Number((((5 + 2 + 1) / 300) * 100).toFixed(1)));
    const pinterest = platformPerformance.find((row) => row.platform === 'pinterest');
    assert.equal(pinterest.engagement, 0, 'no metrics fetched for pinterest yet, so honestly 0, not invented');
  });
});

describe('GET /api/analytics/content', () => {
  it('ranks real published posts by real total engagement, highest first', async () => {
    const response = await owner.get('/analytics/content');
    assert.equal(response.status, 200);
    const { topContent } = response.body;
    assert.ok(topContent.length >= 6, 'one row per checked (post, platform) target');
    assert.ok(topContent[0].engagement >= topContent.at(-1).engagement, 'sorted highest engagement first');
    // The un-checked Pinterest target never shows up: it was filtered, not shown with a fake 0.
    assert.ok(!topContent.some((row) => row.platform === 'pinterest'));
    assert.ok(topContent.every((row) => row.title && row.title.length > 0));
  });
});
