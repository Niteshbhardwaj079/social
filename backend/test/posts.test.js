import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { runSchedulerPass } from '../src/services/postService.js';
import { blueskyFacets } from '../src/providers/publishers.js';

// No real platform is contacted: everything except our own test server is answered here.
const realFetch = globalThis.fetch;
let calls = [];
let override = () => null;

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function defaultPlatforms(url) {
  const path = url.pathname;
  if (url.hostname === 'bsky.social') {
    if (path.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
    if (path.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 3 });
    if (path.endsWith('uploadBlob')) return reply(200, { blob: { $type: 'blob', ref: { $link: 'bafy-fake' }, mimeType: 'image/png', size: 68 } });
    if (path.endsWith('createRecord')) return reply(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc', cid: 'c' });
  }
  if (url.hostname === '93.184.216.34') {
    if (path === '/api/v1/accounts/verify_credentials') return reply(200, { id: '7', username: 'g', acct: 'g', display_name: 'G', followers_count: 1 });
    if (path === '/api/v2/media') return reply(200, { id: '99', url: null });
    if (path === '/api/v1/statuses') return reply(200, { id: '99', url: 'https://93.184.216.34/@g/99' });
  }
  if (url.hostname === 'api.x.com') {
    if (path === '/2/users/me') return reply(200, { data: { id: '42', name: 'G', username: 'g', public_metrics: { followers_count: 5 } } });
    if (path === '/2/tweets') return reply(201, { data: { id: '1234', text: 'ok' } });
  }
  if (url.hostname === 'upload.twitter.com' && path === '/1.1/media/upload.json') return reply(200, { media_id_string: 'x-media-1' });
  if (url.hostname === 'api.linkedin.com') {
    if (path === '/v2/userinfo') return reply(200, { sub: 'li-user-1', name: 'G', given_name: 'G', family_name: '' });
    if (path === '/v2/assets') {
      return reply(200, {
        value: { asset: 'urn:li:digitalmediaAsset:li-asset-1', uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: 'https://api.linkedin.com/mediaUpload/li-asset-1' } } },
      });
    }
    if (path === '/mediaUpload/li-asset-1') return new Response(null, { status: 201 });
    if (path === '/v2/ugcPosts') return reply(201, { id: 'urn:li:share:li-post-1' });
  }
  if (url.hostname === 'open.tiktokapis.com') {
    if (path.endsWith('/creator_info/query/')) return reply(200, { data: { creator_username: 'g', creator_nickname: 'G' }, error: { code: 'ok' } });
    if (path.endsWith('/video/init/')) return reply(200, { data: { publish_id: 'tt-publish-1' }, error: { code: 'ok' } });
  }
  if (url.hostname === 'oauth2.googleapis.com' && path === '/token') return reply(200, { access_token: 'google-access-1' });
  if (url.hostname === 'www.googleapis.com') {
    if (path === '/youtube/v3/channels') return reply(200, { items: [{ id: 'yt-channel-1', snippet: { title: 'Gowebkart', customUrl: '@gowebkart' }, statistics: { subscriberCount: '10' } }] });
    if (path === '/upload/youtube/v3/videos' && url.searchParams.get('upload_id') === 'session-1') return reply(200, { id: 'yt-video-1' }); // the PUT of the actual bytes
    if (path === '/upload/youtube/v3/videos') {
      return new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-1' } }); // the POST that starts the session
    }
  }
  if (url.hostname === 'graph.facebook.com') {
    if (path.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
    if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart', followers_count: 100 });
    if (path.endsWith('/17841400000000000')) return reply(200, { id: '17841400000000000', username: 'gowebkart', followers_count: 50 });
    if (path.endsWith('/feed')) return reply(200, { id: 'page-1_555' });
    if (path.endsWith('/photos')) return reply(200, { id: 'photo-1', post_id: 'page-1_666' });
    if (path.endsWith('/media')) return reply(200, { id: 'ig-container-1' });
    if (path.endsWith('/media_publish')) return reply(200, { id: 'ig-post-1' });
  }
  if (url.hostname === 'api.pinterest.com') {
    if (path === '/v5/user_account') return reply(200, { id: 'pin-1', username: 'gowebkart', follower_count: 20 });
    if (path === '/v5/boards') return reply(200, { items: [{ id: 'board-1', name: 'Products' }, { id: 'board-2', name: 'Inspiration' }] });
    if (path === '/v5/pins') return reply(201, { id: 'pin-post-1' });
  }
  if (url.hostname === 'graph.threads.net') {
    if (path === '/v1.0/me') return reply(200, { id: 'threads-user-1', username: 'g', name: 'G' });
    if (path.endsWith('/threads')) return reply(200, { id: 'thread-container-1' });
    if (path.endsWith('/threads_publish')) return reply(200, { id: 'thread-post-1' });
    if (path === '/v1.0/thread-post-1') return reply(200, { permalink: 'https://www.threads.net/@g/post/thread-post-1' });
  }
  return null;
}

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  return (await override(url, init)) ?? defaultPlatforms(url) ?? reply(404, { error: 'not stubbed' });
};

afterEach(() => {
  calls = [];
  override = () => null;
});

const sent = (host, path) => calls.filter((call) => call.url.hostname === host && call.url.pathname.endsWith(path));
const mastodonPosts = () => sent('93.184.216.34', '/api/v1/statuses');
const blueskyPosts = () => sent('bsky.social', 'createRecord');

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

const future = (hours = 2) => new Date(Date.now() + hours * 3600_000).toISOString();
const setTime = (id, when) => query('UPDATE posts SET scheduled_at = $2 WHERE id = $1', [id, when]);
const create = (client, body) => client.post('/posts', { platforms: ['bluesky'], status: 'draft', content: 'Hello world', ...body });

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function uploadImage(client) {
  const form = new FormData();
  form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'photo.png');
  const response = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${client.accessToken}` }, body: form });
  const body = await response.json();
  return body.item.id;
}

async function uploadVideo(client) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not a real video but has bytes')], { type: 'video/mp4' }), 'clip.mp4');
  const response = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${client.accessToken}` }, body: form });
  const body = await response.json();
  return body.item.id;
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Itor', 'editor');
  contributor = await makeUser('Con Tributor', 'contributor');
  analyst = await makeUser('Ana Lyst', 'analyst');
  assert.equal((await owner.put('/social-accounts/bluesky', { credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/mastodon', { credentials: { instanceUrl: 'https://93.184.216.34', accessToken: 'mastodon-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/x', { credentials: { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessTokenSecret: 'ats' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/instagram', { credentials: { appId: '111222', appSecret: 'appsecret-abc', igUserId: '17841400000000000', accessToken: 'ig-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/threads', { credentials: { appId: '111222', appSecret: 'appsecret-abc', threadsUserId: 'threads-user-1', accessToken: 'th-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/linkedin', { credentials: { clientId: 'cid', clientSecret: 'csecret', accessToken: 'li-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/tiktok', { credentials: { clientKey: 'tk-key', clientSecret: 'tk-secret', accessToken: 'tk-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/youtube', { credentials: { clientId: 'yt-client', clientSecret: 'yt-secret', refreshToken: 'yt-refresh-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/pinterest', { credentials: { appId: 'pin-app-1', appSecret: 'pin-secret-1', accessToken: 'pin-token-123' } })).status, 200);
  calls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('who can do what', () => {
  it('lets analysts read but not write', async () => {
    assert.equal((await analyst.get('/posts')).status, 200);
    assert.equal((await create(analyst, {})).status, 403);
    assert.equal((await createClient(server.baseUrl).get('/posts')).status, 401);
  });

  it('lets a contributor draft and ask for approval, but not schedule or publish', async () => {
    assert.equal((await create(contributor, { status: 'draft' })).status, 201);
    assert.equal((await create(contributor, { status: 'pendingApproval' })).status, 201);
    for (const status of ['scheduled', 'published']) {
      const response = await create(contributor, { status, scheduledAt: future() });
      assert.equal(response.status, 403, status);
      assert.match(response.body.error.message, /Editor or Admin/);
    }
    assert.equal(calls.length, 0);
  });
});

describe('drafts', () => {
  it('saves a draft without needing a connection, and lists it with its author', async () => {
    const created = await create(editor, { platforms: ['instagram', 'threads', 'bluesky', 'bluesky'], content: '  Draft text  ' });
    assert.equal(created.status, 201);
    const post = created.body.post;
    assert.equal(post.status, 'draft');
    assert.equal(post.content, 'Draft text');
    assert.deepEqual(post.platforms, ['instagram', 'threads', 'bluesky'], 'de-duplicated, in the usual platform order');
    assert.equal(post.createdBy, 'Ed Itor');
    assert.ok(post.targets.every((target) => target.status === 'pending'));

    const list = await contributor.get('/posts');
    assert.ok(list.body.posts.some((entry) => entry.id === post.id), 'everyone can see every post');
  });

  it('validates what it is given', async () => {
    assert.equal((await create(editor, { content: '   ' })).status, 400);
    assert.equal((await create(editor, { platforms: [] })).status, 400);
    assert.equal((await create(editor, { platforms: ['myspace'] })).status, 400);
    assert.equal((await create(editor, { status: 'published-ish' })).status, 400);
    assert.equal((await create(editor, { status: 'scheduled', scheduledAt: 'tomorrow' })).status, 400);
    assert.equal((await editor.get('/posts/not-a-uuid')).status, 400);
    assert.equal((await editor.get('/posts/00000000-0000-4000-8000-000000000000')).status, 404);
  });

  it('edits a draft and only a draft-like post', async () => {
    const { post } = (await create(editor, { content: 'v1' })).body;
    const edited = await editor.patch(`/posts/${post.id}`, { content: 'v2', platforms: ['mastodon'] });
    assert.equal(edited.body.post.content, 'v2');
    assert.deepEqual(edited.body.post.platforms, ['mastodon']);
    assert.equal((await editor.patch(`/posts/${post.id}`, {})).status, 400);
  });
});

describe('publishing now', () => {
  it('sends to every platform, records the links, and makes links and hashtags clickable on Bluesky', async () => {
    const text = 'नमस्ते दुनिया #launch https://example.com/x.';
    const response = await create(editor, { platforms: ['bluesky', 'mastodon', 'x'], status: 'published', content: text });
    assert.equal(response.status, 201);
    const { post } = response.body;
    assert.equal(post.status, 'published');
    assert.deepEqual(post.targets.map((target) => target.status), ['published', 'published', 'published']);
    assert.equal(post.targets.find((target) => target.platform === 'bluesky').url, 'https://bsky.app/profile/nitesh.bsky.social/post/3kabc');
    assert.equal(post.targets.find((target) => target.platform === 'x').url, 'https://x.com/i/status/1234');
    assert.ok(post.scheduledAt, 'the time it went out');

    const record = JSON.parse(blueskyPosts()[0].init.body).record;
    assert.equal(record.text, text);
    const link = record.facets.find((facet) => facet.features[0].$type.endsWith('#link'));
    const tag = record.facets.find((facet) => facet.features[0].$type.endsWith('#tag'));
    assert.equal(link.features[0].uri, 'https://example.com/x', 'the trailing full stop is not part of the link');
    const bytes = Buffer.from(text);
    assert.equal(bytes.subarray(link.index.byteStart, link.index.byteEnd).toString(), 'https://example.com/x');
    assert.equal(bytes.subarray(tag.index.byteStart, tag.index.byteEnd).toString(), '#launch');
    assert.equal(tag.features[0].tag, 'launch');

    assert.equal(mastodonPosts().length, 1);
    assert.ok(mastodonPosts()[0].init.headers['idempotency-key']);
    assert.match(sent('api.x.com', '/2/tweets')[0].init.headers.authorization, /^OAuth /);
  });

  it('computes facets in UTF-8 bytes', () => {
    const facets = blueskyFacets('😀 #tag');
    assert.equal(facets[0].index.byteStart, 5, 'the emoji is 4 bytes plus a space');
  });

  it('marks the post failed when a platform fails, keeping what did go out', async () => {
    override = (url) => (url.pathname === '/api/v1/statuses' ? reply(500, { error: 'boom' }) : null);
    const { post } = (await create(editor, { platforms: ['bluesky', 'mastodon'], status: 'published', content: 'partial' })).body;
    assert.equal(post.status, 'failed');
    assert.equal(post.targets.find((target) => target.platform === 'bluesky').status, 'published');
    const failed = post.targets.find((target) => target.platform === 'mastodon');
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /trouble/);

    const edit = await editor.patch(`/posts/${post.id}`, { content: 'changed' });
    assert.equal(edit.status, 409, 'part of it is already public, so it cannot be rewritten');
  });

  it('retries only what failed, and never posts twice', async () => {
    override = (url) => (url.pathname === '/api/v1/statuses' ? reply(500, {}) : null);
    const { post } = (await create(editor, { platforms: ['bluesky', 'mastodon'], status: 'published', content: 'retry me' })).body;
    const firstKey = mastodonPosts()[0].init.headers['idempotency-key'];
    assert.equal(blueskyPosts().length, 1);

    override = () => null;
    const retried = await editor.post(`/posts/${post.id}/retry`);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.post.status, 'published');
    assert.equal(blueskyPosts().length, 1, 'Bluesky was not sent again');
    assert.equal(mastodonPosts().length, 2);
    assert.equal(mastodonPosts()[1].init.headers['idempotency-key'], firstKey, 'same key, so the server can ignore a duplicate');

    assert.equal((await editor.post(`/posts/${post.id}/retry`)).status, 409, 'a published post cannot be retried');
  });

  it('two retries at once send it once', async () => {
    override = (url) => (url.pathname === '/api/v1/statuses' ? reply(500, {}) : null);
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'published', content: 'race' })).body;
    override = async (url) => {
      if (url.pathname === '/api/v1/statuses') await new Promise((resolve) => setTimeout(resolve, 150));
      return null;
    };
    const [a, b] = await Promise.all([editor.post(`/posts/${post.id}/retry`), editor.post(`/posts/${post.id}/retry`)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(mastodonPosts().length, 2, 'one failed attempt plus one retry');
  });

  it('says so when it cannot tell whether a post went out', async () => {
    override = (url) => {
      if (url.pathname === '/api/v1/statuses') throw new Error('socket hang up');
      return null;
    };
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'published', content: 'unsure' })).body;
    assert.equal(post.status, 'failed');
    assert.match(post.targets[0].error, /could not confirm whether it was posted/);
  });

  it('never lets a secret appear in a failure message', async () => {
    override = (url) => (url.pathname === '/api/v1/statuses' ? reply(422, { error: 'Bad token mastodon-token-123' }) : null);
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'published', content: 'secret' })).body;
    assert.doesNotMatch(post.targets[0].error, /mastodon-token-123/);
  });

  it('refuses platforms that are not connected, or that are not built yet, before sending anything', async () => {
    const notConnected = await create(editor, { platforms: ['bluesky', 'linkedinCompany'], status: 'published' });
    assert.equal(notConnected.status, 400);
    assert.match(notConnected.body.error.message, /LinkedIn Company Pages is not connected/);

    const notBuilt = await create(editor, { platforms: ['googleBusiness'], status: 'scheduled', scheduledAt: future() });
    assert.equal(notBuilt.status, 400);
    assert.match(notBuilt.body.error.message, /isn’t available yet/);

    const needsImage = await create(editor, { platforms: ['instagram'], status: 'scheduled', scheduledAt: future() });
    assert.equal(needsImage.status, 400);
    assert.match(needsImage.body.error.message, /needs at least one image attached/);
    assert.equal(calls.length, 0);
  });

  it('checks each platform’s length limit', async () => {
    const tooLongBluesky = await create(editor, { platforms: ['bluesky'], status: 'published', content: 'a'.repeat(301) });
    assert.equal(tooLongBluesky.status, 400);
    assert.match(tooLongBluesky.body.error.message, /Bluesky Profiles allows up to 300 characters, and this post has 301/);

    const link = `look ${'https://example.com/'.padEnd(150, 'p')}`;
    assert.equal((await create(editor, { platforms: ['x'], status: 'published', content: link })).status, 201, 'X counts a link as 23 characters');
    const chinese = await create(editor, { platforms: ['x'], status: 'published', content: '你'.repeat(150) });
    assert.equal(chinese.status, 400, 'X counts each of these as 2');
    assert.equal((await create(editor, { platforms: ['mastodon'], status: 'draft', content: 'a'.repeat(301) })).status, 201, 'drafts are never blocked');
  });
});

describe('posting with an attached image', () => {
  it('Instagram needs one and captions it; Facebook and Threads use it as a photo; the byte-upload platforms embed it', async () => {
    const mediaId = await uploadImage(editor);
    const response = await create(editor, {
      platforms: ['instagram', 'facebook', 'threads', 'bluesky', 'mastodon', 'x', 'linkedin'],
      status: 'published',
      content: 'Look at this',
      mediaIds: [mediaId],
    });
    assert.equal(response.status, 201);
    const { post } = response.body;
    assert.equal(post.status, 'published');
    assert.ok(post.targets.every((target) => target.status === 'published'), JSON.stringify(post.targets));
    assert.equal(post.media[0].id, mediaId);

    // Instagram: a container with the image URL and the post text as caption, then published.
    const igContainer = sent('graph.facebook.com', '/media').find((call) => new URLSearchParams(call.init.body).get('caption') === 'Look at this');
    assert.ok(igContainer, 'Instagram container created with the caption');
    assert.match(new URLSearchParams(igContainer.init.body).get('image_url'), /\/media\//);

    // Facebook: uses the photos edge (not feed) when an image is attached.
    assert.equal(sent('graph.facebook.com', '/feed').length, 0);
    assert.ok(sent('graph.facebook.com', '/photos').length > 0);

    // Threads: an image container, not a text one.
    const threadsContainer = sent('graph.threads.net', '/threads')[0];
    assert.equal(new URLSearchParams(threadsContainer.init.body).get('media_type'), 'IMAGE');

    // Bluesky: the image is uploaded as a blob first, then embedded in the post record.
    assert.equal(sent('bsky.social', 'uploadBlob').length, 1);
    const record = JSON.parse(blueskyPosts()[0].init.body).record;
    assert.equal(record.embed.$type, 'app.bsky.embed.images');
    assert.ok(record.embed.images[0].image);

    // Mastodon: media uploaded first, then referenced by id in the status.
    assert.equal(sent('93.184.216.34', '/api/v2/media').length, 1);
    assert.deepEqual(JSON.parse(mastodonPosts()[0].init.body).media_ids, ['99']);

    // X: uploaded via the classic v1.1 endpoint (OAuth1-signed), then referenced by id in the v2 tweet.
    const xUpload = sent('upload.twitter.com', '/media/upload.json')[0];
    assert.match(xUpload.init.headers.authorization, /^OAuth /);
    assert.deepEqual(JSON.parse(sent('api.x.com', '/2/tweets')[0].init.body).media, { media_ids: ['x-media-1'] });

    // LinkedIn: register an upload slot, PUT the bytes there, then reference the asset in the share.
    assert.equal(sent('api.linkedin.com', '/assets').length, 1);
    assert.equal(sent('api.linkedin.com', '/li-asset-1').length, 1, 'the bytes were PUT to the reserved upload URL');
    const share = JSON.parse(sent('api.linkedin.com', '/ugcPosts')[0].init.body);
    assert.equal(share.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory, 'IMAGE');
    assert.equal(share.specificContent['com.linkedin.ugc.ShareContent'].media[0].media, 'urn:li:digitalmediaAsset:li-asset-1');
  });

  it('Facebook has no image: uses the plain feed edge, unchanged from before', async () => {
    const response = await create(editor, { platforms: ['facebook'], status: 'published', content: 'No picture here' });
    assert.equal(response.status, 201);
    assert.equal(sent('graph.facebook.com', '/photos').length, 0);
    assert.ok(sent('graph.facebook.com', '/feed').length > 0);
  });

  it('X and LinkedIn with no image attached: plain text, no upload call made', async () => {
    const response = await create(editor, { platforms: ['x', 'linkedin'], status: 'published', content: 'Text only' });
    assert.equal(response.status, 201);
    assert.equal(sent('upload.twitter.com', '/media/upload.json').length, 0);
    assert.equal(sent('api.linkedin.com', '/assets').length, 0);
    assert.equal(JSON.parse(sent('api.x.com', '/2/tweets')[0].init.body).media, undefined);
  });

  it('a video attached does not satisfy Instagram (images only)', async () => {
    const videoId = await uploadVideo(editor);
    const response = await create(editor, { platforms: ['instagram'], status: 'published', mediaIds: [videoId] });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /needs at least one image/);
  });
});

describe('posting to Pinterest', () => {
  it('lists the account\'s real boards for the composer\'s picker', async () => {
    const response = await editor.get('/social-accounts/pinterest/boards');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.boards, [{ id: 'board-1', name: 'Products' }, { id: 'board-2', name: 'Inspiration' }]);
  });

  it('creates a pin on the chosen board, with the image and the post text', async () => {
    const mediaId = await uploadImage(editor);
    const response = await create(editor, {
      platforms: ['pinterest'],
      status: 'published',
      content: 'New arrivals this week',
      mediaIds: [mediaId],
      pinterestBoardId: 'board-2',
    });
    assert.equal(response.status, 201);
    const { post } = response.body;
    assert.equal(post.status, 'published');
    assert.equal(post.pinterestBoardId, 'board-2');
    assert.equal(post.targets[0].status, 'published');
    assert.equal(post.targets[0].url, 'https://www.pinterest.com/pin/pin-post-1/');

    const pin = JSON.parse(sent('api.pinterest.com', '/v5/pins')[0].init.body);
    assert.equal(pin.board_id, 'board-2');
    assert.equal(pin.description, 'New arrivals this week');
    assert.match(pin.media_source.url, /\/media\//);
  });

  it('needs a board chosen, even with an image attached', async () => {
    const mediaId = await uploadImage(editor);
    const response = await create(editor, { platforms: ['pinterest'], status: 'published', mediaIds: [mediaId] });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Choose a Pinterest board/);
  });

  it('needs an image, even with a board chosen', async () => {
    const response = await create(editor, { platforms: ['pinterest'], status: 'published', pinterestBoardId: 'board-1' });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /needs at least one image attached/);
  });

  it('the board survives an edit that leaves it unchanged, and can be moved to another board', async () => {
    const mediaId = await uploadImage(editor);
    const draft = (await create(editor, { platforms: ['pinterest'], status: 'draft', mediaIds: [mediaId], pinterestBoardId: 'board-1' })).body.post;
    assert.equal(draft.pinterestBoardId, 'board-1');

    const untouched = await editor.patch(`/posts/${draft.id}`, { content: 'same board, new words' });
    assert.equal(untouched.body.post.pinterestBoardId, 'board-1');

    const moved = await editor.patch(`/posts/${draft.id}`, { pinterestBoardId: 'board-2' });
    assert.equal(moved.body.post.pinterestBoardId, 'board-2');
  });
});

describe('posting with an attached video', () => {
  it('TikTok pulls the video from its public URL; YouTube uploads the bytes (resumable)', async () => {
    const videoId = await uploadVideo(editor);
    const response = await create(editor, {
      platforms: ['tiktok', 'youtube'],
      status: 'published',
      content: 'A short clip\nMore detail about the clip goes here.',
      mediaIds: [videoId],
    });
    assert.equal(response.status, 201);
    const { post } = response.body;
    assert.ok(post.targets.every((target) => target.status === 'published'), JSON.stringify(post.targets));

    // TikTok: privacy is forced to SELF_ONLY (this app is not yet audited) and the video is fetched by URL.
    const init = JSON.parse(sent('open.tiktokapis.com', '/video/init/')[0].init.body);
    assert.equal(init.post_info.privacy_level, 'SELF_ONLY');
    assert.match(init.source_info.video_url, /\/media\//);
    assert.equal(init.source_info.source, 'PULL_FROM_URL');

    // YouTube: a resumable session is started (title = first line, truncated to 100 chars), then the bytes are PUT to it.
    const started = JSON.parse(sent('www.googleapis.com', '/upload/youtube/v3/videos').find((call) => call.init.method === 'POST').init.body);
    assert.equal(started.snippet.title, 'A short clip');
    assert.match(started.snippet.description, /More detail/);
    const put = sent('www.googleapis.com', '/upload/youtube/v3/videos').find((call) => call.init.method === 'PUT');
    assert.ok(put, 'the bytes were PUT to the session URL');
  });

  it('needs a video attached — an image does not satisfy TikTok or YouTube', async () => {
    const imageId = await uploadImage(editor);
    const tiktokResponse = await create(editor, { platforms: ['tiktok'], status: 'published', mediaIds: [imageId] });
    assert.equal(tiktokResponse.status, 400);
    assert.match(tiktokResponse.body.error.message, /TikTok Profiles needs a video attached/);

    const youtubeResponse = await create(editor, { platforms: ['youtube'], status: 'published', mediaIds: [imageId] });
    assert.equal(youtubeResponse.status, 400);
    assert.match(youtubeResponse.body.error.message, /YouTube Channels needs a video attached/);
  });
});

describe('scheduling', () => {
  it('needs a time in the future and a connected account', async () => {
    assert.equal((await create(editor, { status: 'scheduled' })).status, 400);
    const past = await create(editor, { status: 'scheduled', scheduledAt: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(past.status, 400);
    assert.match(past.body.error.message, /already passed/);
  });

  it('holds a scheduled post until its time, then sends it once', async () => {
    const { post } = (await create(editor, { platforms: ['bluesky', 'mastodon'], status: 'scheduled', scheduledAt: future(), content: 'later' })).body;
    assert.equal(post.status, 'scheduled');
    assert.equal(await runSchedulerPass(), 0, 'not due yet');
    assert.equal(calls.length, 0);

    // Move the time and edit it: still scheduled, still not sent.
    const moved = await editor.patch(`/posts/${post.id}`, { scheduledAt: future(5) });
    assert.equal(moved.body.post.status, 'scheduled');

    await setTime(post.id, new Date(Date.now() - 1000));
    assert.equal(await runSchedulerPass(), 1);
    assert.equal(await runSchedulerPass(), 0, 'the next pass finds nothing to do');
    const after = (await editor.get(`/posts/${post.id}`)).body.post;
    assert.equal(after.status, 'published');
    assert.equal(blueskyPosts().length, 1);
    assert.equal(mastodonPosts().length, 1);
  });

  it('two scheduler passes at once still send each post once', async () => {
    const ids = [];
    for (const content of ['one', 'two', 'three']) {
      const { post } = (await create(editor, { platforms: ['mastodon'], status: 'scheduled', scheduledAt: future(), content })).body;
      await setTime(post.id, new Date(Date.now() - 1000));
      ids.push(post.id);
    }
    await Promise.all([runSchedulerPass(), runSchedulerPass()]);
    await runSchedulerPass();
    assert.equal(mastodonPosts().length, 3);
    for (const id of ids) assert.equal((await editor.get(`/posts/${id}`)).body.post.status, 'published');
  });

  it('does not send a post that is hours late (the server was off); it waits for a person', async () => {
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'scheduled', scheduledAt: future(), content: 'stale' })).body;
    await setTime(post.id, new Date(Date.now() - 3 * 3600_000));
    await runSchedulerPass();
    assert.equal(calls.length, 0);
    const missed = (await editor.get(`/posts/${post.id}`)).body.post;
    assert.equal(missed.status, 'failed');
    assert.match(missed.targets[0].error, /Missed its scheduled time/);

    const retried = await editor.post(`/posts/${post.id}/retry`);
    assert.equal(retried.body.post.status, 'published');
  });

  it('reports a post that was interrupted mid-publish instead of guessing or resending', async () => {
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'draft', content: 'crashed' })).body;
    await query("UPDATE posts SET status = 'publishing', locked_at = now() - interval '20 minutes' WHERE id = $1", [post.id]);
    await query("UPDATE post_targets SET status = 'publishing' WHERE post_id = $1", [post.id]);
    await runSchedulerPass();
    const recovered = (await editor.get(`/posts/${post.id}`)).body.post;
    assert.equal(recovered.status, 'failed');
    assert.match(recovered.targets[0].error, /interrupted/);
    assert.equal(calls.length, 0, 'nothing was sent again');
  });

  it('a post another person is publishing right now cannot be edited or deleted', async () => {
    const { post } = (await create(editor, { platforms: ['mastodon'], status: 'draft', content: 'busy' })).body;
    await query("UPDATE posts SET status = 'publishing', locked_at = now() WHERE id = $1", [post.id]);
    assert.equal((await editor.patch(`/posts/${post.id}`, { content: 'x' })).status, 409);
    assert.equal((await editor.delete(`/posts/${post.id}`)).status, 409);
  });
});

describe('approval', () => {
  it('runs from submit to scheduled/published', async () => {
    const later = (await create(contributor, { platforms: ['mastodon'], status: 'pendingApproval', scheduledAt: future(), content: 'wait for approval' })).body.post;
    assert.equal(later.status, 'pendingApproval');
    assert.equal((await contributor.post(`/posts/${later.id}/approve`)).status, 403, 'nobody approves their own');
    const approved = await editor.post(`/posts/${later.id}/approve`);
    assert.equal(approved.body.post.status, 'scheduled');
    assert.equal(calls.length, 0);

    const now = (await create(contributor, { platforms: ['mastodon'], status: 'pendingApproval', content: 'no time given' })).body.post;
    const published = await editor.post(`/posts/${now.id}/approve`);
    assert.equal(published.body.post.status, 'published');
    assert.equal(mastodonPosts().length, 1);
    assert.equal((await editor.post(`/posts/${now.id}/approve`)).status, 409, 'only once');
  });

  it('a rejection needs a reason, and the author can fix and resubmit', async () => {
    const { post } = (await create(contributor, { platforms: ['mastodon'], status: 'pendingApproval', content: 'needs work' })).body;
    assert.equal((await editor.post(`/posts/${post.id}/reject`, { reason: ' ' })).status, 400);
    const rejected = await editor.post(`/posts/${post.id}/reject`, { reason: 'Add the client logo' });
    assert.equal(rejected.body.post.status, 'rejected');
    assert.equal(rejected.body.post.rejectionReason, 'Add the client logo');

    const fixed = await contributor.patch(`/posts/${post.id}`, { content: 'needs less work', status: 'pendingApproval' });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.post.status, 'pendingApproval');
    assert.equal(fixed.body.post.rejectionReason, null);
  });

  it('will not approve something that cannot be sent', async () => {
    const { post } = (await create(contributor, { platforms: ['linkedinCompany'], status: 'pendingApproval', content: 'unconnected' })).body;
    const response = await editor.post(`/posts/${post.id}/approve`);
    assert.equal(response.status, 400);
    assert.equal((await editor.get(`/posts/${post.id}`)).body.post.status, 'pendingApproval', 'it stays in the queue');
  });
});

describe('deleting', () => {
  it('lets a contributor delete only their own drafts', async () => {
    const mine = (await create(contributor, {})).body.post;
    const theirs = (await create(editor, {})).body.post;
    assert.equal((await contributor.delete(`/posts/${theirs.id}`)).status, 403);
    assert.equal((await contributor.delete(`/posts/${mine.id}`)).status, 200);
    assert.equal((await contributor.get(`/posts/${mine.id}`)).status, 404);
  });

  it('bulk actions skip what a person may not touch', async () => {
    const own = (await create(contributor, {})).body.post;
    const other = (await create(editor, {})).body.post;
    const published = (await create(editor, { platforms: ['mastodon'], status: 'published', content: 'live' })).body.post;

    const drafted = await contributor.post('/posts/bulk', { action: 'draft', ids: [own.id, other.id] });
    assert.deepEqual(drafted.body, { done: 1, skipped: 1 });
    const toDraft = await editor.post('/posts/bulk', { action: 'draft', ids: [published.id] });
    assert.deepEqual(toDraft.body, { done: 0, skipped: 1 }, 'a published post stays published');

    const removed = await editor.post('/posts/bulk', { action: 'delete', ids: [own.id, other.id, published.id] });
    assert.deepEqual(removed.body, { done: 3, skipped: 0 });
  });
});

describe('the activity log', () => {
  it('records who created, published and approved', async () => {
    const log = (await owner.get('/activity-logs?limit=200')).body.activity.map((entry) => entry.action);
    for (const action of ['post.created', 'post.published', 'post.failed', 'post.approved', 'post.rejected', 'post.retried', 'post.deleted']) {
      assert.ok(log.includes(action), action);
    }
  });
});

describe('notifications', () => {
  it('requires sign-in', async () => {
    assert.equal((await createClient(server.baseUrl).get('/notifications')).status, 401);
  });

  it('tells every approver when a post is submitted, but not the person who submitted it', async () => {
    const { post } = (await create(editor, { status: 'pendingApproval', content: 'Please review this one' })).body;
    const ownerItems = (await owner.get('/notifications')).body.items;
    const editorItems = (await editor.get('/notifications')).body.items;
    assert.ok(ownerItems.some((item) => item.type === 'approvalRequested' && item.entityId === post.id && item.message.includes('Ed Itor')));
    assert.ok(!editorItems.some((item) => item.type === 'approvalRequested' && item.entityId === post.id), 'the submitter is not notified about their own submission');
  });

  it('tells the creator when their post is approved, then published', async () => {
    const { post } = (await create(contributor, { status: 'pendingApproval', content: 'Approve me please' })).body;
    assert.equal((await editor.post(`/posts/${post.id}/approve`)).status, 200);
    const items = (await contributor.get('/notifications')).body.items;
    assert.ok(items.some((item) => item.type === 'approvalCompleted' && item.entityId === post.id && /approved/.test(item.message)));
    assert.ok(items.some((item) => item.type === 'postPublished' && item.entityId === post.id));
  });

  it('tells the creator why their post was rejected', async () => {
    const { post } = (await create(contributor, { status: 'pendingApproval', content: 'Reject me please' })).body;
    assert.equal((await editor.post(`/posts/${post.id}/reject`, { reason: 'Wrong tone' })).status, 200);
    const items = (await contributor.get('/notifications')).body.items;
    const rejected = items.find((item) => item.type === 'approvalCompleted' && item.entityId === post.id);
    assert.ok(rejected);
    assert.match(rejected.message, /Wrong tone/);
  });

  it('skips a person who opted out of that type, without affecting anyone else', async () => {
    assert.equal((await editor.patch('/notifications/preferences', { approvalRequested: false })).status, 200);
    const editorBefore = (await editor.get('/notifications')).body.items.filter((item) => item.type === 'approvalRequested').length;
    const { post } = (await create(contributor, { status: 'pendingApproval', content: 'Skip editor please' })).body;
    const ownerItems = (await owner.get('/notifications')).body.items;
    const editorAfter = (await editor.get('/notifications')).body.items.filter((item) => item.type === 'approvalRequested').length;
    assert.ok(ownerItems.some((item) => item.type === 'approvalRequested' && item.entityId === post.id), 'owner did not opt out, so still notified');
    assert.equal(editorAfter, editorBefore, 'the editor, who opted out, got no new one');
    assert.equal((await editor.patch('/notifications/preferences', { approvalRequested: true })).status, 200); // put it back
  });

  it('rejects an unknown preference key without changing anything', async () => {
    assert.equal((await owner.patch('/notifications/preferences', { madeUpType: false })).status, 400);
  });

  it('marking one as read only changes that one, and only for its own owner', async () => {
    const { post } = (await create(contributor, { status: 'pendingApproval', content: 'For the read test' })).body;
    const target = (await owner.get('/notifications')).body.items.find((item) => item.entityId === post.id);
    assert.ok(target && !target.isRead);

    assert.equal((await editor.post(`/notifications/${target.id}/read`)).status, 200); // scoped by user: quietly a no-op for someone else's notification
    assert.equal((await owner.get('/notifications')).body.items.find((item) => item.id === target.id).isRead, false);

    assert.equal((await owner.post(`/notifications/${target.id}/read`)).status, 200);
    assert.equal((await owner.get('/notifications')).body.items.find((item) => item.id === target.id).isRead, true);
  });

  it('mark-all-as-read clears the unread count', async () => {
    await create(contributor, { status: 'pendingApproval', content: 'One more so there is something unread' });
    assert.ok((await owner.get('/notifications')).body.unreadCount > 0);
    assert.equal((await owner.post('/notifications/read-all')).status, 200);
    assert.equal((await owner.get('/notifications')).body.unreadCount, 0);
  });
});
