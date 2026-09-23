import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { refreshInboxComments } from '../src/services/inboxService.js';

const realFetch = globalThis.fetch;
let calls = [];

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stub(url) {
  const path = url.pathname;
  if (url.hostname === 'bsky.social' && path.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'nitesh.bsky.social' });
  if (url.hostname === 'bsky.social' && path.endsWith('getProfile')) return reply(200, { displayName: 'Nitesh B', followersCount: 3 });
  if (url.hostname === 'bsky.social' && path.endsWith('createRecord')) {
    return reply(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/root1', cid: 'root-cid-1' });
  }
  if (url.hostname === 'public.api.bsky.app' && path.endsWith('getPostThread')) {
    const uri = url.searchParams.get('uri');
    if (url.searchParams.get('depth') === '0') {
      return reply(200, { thread: { post: { uri, cid: 'root-cid-1' } } });
    }
    return reply(200, {
      thread: {
        post: { uri, cid: 'root-cid-1' },
        replies: [
          {
            post: {
              uri: 'at://did:plc:commenter/app.bsky.feed.post/reply1',
              cid: 'reply-cid-1',
              author: { did: 'did:plc:commenter', handle: 'fan.bsky.social', displayName: 'Bluesky Fan' },
              record: { text: 'Love this!', createdAt: '2026-09-20T10:00:00Z' },
            },
          },
        ],
      },
    });
  }
  if (url.hostname === '93.184.216.34') {
    if (path === '/api/v1/accounts/verify_credentials') return reply(200, { id: '7', username: 'g', acct: 'g', display_name: 'G', followers_count: 1 });
    if (path === '/api/v1/statuses') return reply(200, { id: '99', url: 'https://93.184.216.34/@g/99' });
    if (path === '/api/v1/statuses/99/context') {
      return reply(200, {
        descendants: [
          {
            id: 501,
            account: { id: 900, username: 'mastofan', display_name: 'Masto Fan', followers_count: 40, following_count: 10, statuses_count: 5, created_at: '2020-01-01T00:00:00Z', note: '<p>Hi <b>there</b></p>', url: 'https://93.184.216.34/@mastofan' },
            content: '<p>Great post!</p>',
            created_at: '2026-09-20T11:00:00Z',
          },
        ],
      });
    }
  }
  if (url.hostname === 'graph.facebook.com') {
    if (path.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
    if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart', followers_count: 100 });
    if (path.endsWith('/feed')) return reply(200, { id: 'page-1_555' });
    if (path.endsWith('/page-1_555/comments')) {
      return reply(200, { data: [{ id: 'fb-comment-1', message: 'Nice one!', from: { id: 'fb-user-1', name: 'FB Fan' }, created_time: '2026-09-20T12:00:00Z' }] });
    }
    if (path.endsWith('/fb-comment-1/comments')) return reply(200, { id: 'fb-reply-1' });
  }
  if (url.hostname === 'api.pinterest.com') {
    if (path === '/v5/user_account') return reply(200, { id: 'pin-1', username: 'gowebkart', follower_count: 20 });
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

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  assert.equal((await owner.put('/social-accounts/bluesky', { credentials: { handle: 'nitesh.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/mastodon', { credentials: { instanceUrl: 'https://93.184.216.34', accessToken: 'mastodon-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' } })).status, 200);
  assert.equal((await owner.put('/social-accounts/pinterest', { credentials: { appId: 'pin-app-1', appSecret: 'pin-secret-1', accessToken: 'pin-token-123' } })).status, 200);
  calls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

async function makeUser(name, role) {
  await owner.post('/users', { name, email: `${role}@example.com`, role, language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [`${role}@example.com`]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(`${role}@example.com`)).status, 200);
  return client;
}

describe('the real Inbox', () => {
  it('fetches real comments from every supported platform, and leaves an unsupported one alone', async () => {
    const bluesky = await owner.post('/posts', { content: 'Bluesky post', platforms: ['bluesky'], status: 'published' });
    const mastodon = await owner.post('/posts', { content: 'Mastodon post', platforms: ['mastodon'], status: 'published' });
    const facebook = await owner.post('/posts', { content: 'Facebook post', platforms: ['facebook'], status: 'published' });
    assert.equal(bluesky.status, 201);
    assert.equal(mastodon.status, 201);
    assert.equal(facebook.status, 201);

    const imageId = await uploadImage();
    const pinterest = await owner.post('/posts', { content: 'Pinterest pin', platforms: ['pinterest'], status: 'published', mediaIds: [imageId], pinterestBoardId: 'board-1' });
    assert.equal(pinterest.status, 201, JSON.stringify(pinterest.body));

    await refreshInboxComments(0);

    const response = await owner.get('/inbox');
    assert.equal(response.status, 200);
    const byPlatform = Object.fromEntries(response.body.conversations.map((c) => [c.platform, c]));

    assert.equal(byPlatform.bluesky.customerName, 'Bluesky Fan');
    assert.equal(byPlatform.bluesky.customerProfile.handle, '@fan.bsky.social');
    assert.equal(byPlatform.bluesky.messages[0].text, 'Love this!');
    assert.equal(byPlatform.bluesky.isUnread, true);
    assert.equal(byPlatform.bluesky.status, 'open');

    assert.equal(byPlatform.mastodon.customerName, 'Masto Fan');
    assert.equal(byPlatform.mastodon.customerProfile.followers, 40);
    assert.equal(byPlatform.mastodon.messages[0].text, 'Great post!', 'HTML content is stripped to plain text');
    assert.equal(byPlatform.mastodon.customerProfile.bio, 'Hi there', 'the profile bio is also stripped of HTML');

    assert.equal(byPlatform.facebook.customerName, 'FB Fan');
    assert.equal(byPlatform.facebook.customerProfile.handle, undefined, 'Facebook never gives a handle, and none is invented');

    assert.ok(!('pinterest' in byPlatform), 'no real comment source for pinterest yet, so nothing is fetched or fabricated');
  });

  it('a second pass right after does not duplicate the same comments', async () => {
    const before1 = (await owner.get('/inbox')).body.conversations.length;
    await query('UPDATE post_targets SET comments_checked_at = NULL');
    await refreshInboxComments(0);
    const after1 = (await owner.get('/inbox')).body.conversations.length;
    assert.equal(after1, before1);
  });

  it('notifies Super Admin/Admin/Editor in-app when a genuinely new comment arrives', async () => {
    const post = await owner.post('/posts', { content: 'Another Bluesky post', platforms: ['bluesky'], status: 'published' });
    assert.equal(post.status, 201);
    // A different reply on this new post, so it is a genuinely new comment, not a re-fetch of the same one.
    const originalStub = stub;
    let notified = false;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === '127.0.0.1') return realFetch(input, init);
      calls.push({ url, init });
      if (url.hostname === 'public.api.bsky.app' && url.searchParams.get('depth') === '1') {
        notified = true;
        return reply(200, {
          thread: {
            post: { uri: url.searchParams.get('uri'), cid: 'root-cid-2' },
            replies: [
              {
                post: {
                  uri: 'at://did:plc:commenter2/app.bsky.feed.post/reply2',
                  cid: 'reply-cid-2',
                  author: { did: 'did:plc:commenter2', handle: 'another.bsky.social', displayName: 'Another Fan' },
                  record: { text: 'Second comment', createdAt: '2026-09-21T10:00:00Z' },
                },
              },
            ],
          },
        });
      }
      return originalStub(url) ?? reply(404, { error: 'not stubbed' });
    };

    await query('UPDATE post_targets SET comments_checked_at = NULL');
    await refreshInboxComments(0);
    assert.ok(notified);

    const notifications = await query("SELECT * FROM notifications WHERE type = 'newComment' ORDER BY created_at DESC");
    assert.ok(notifications.rows.some((row) => /Another Fan/.test(row.message)));
  });

  it('can reply for real (Bluesky), and the reply is stored on the conversation', async () => {
    const response = await owner.get('/inbox');
    const conversation = response.body.conversations.find((c) => c.platform === 'bluesky');
    assert.ok(conversation);

    const sent = await owner.post(`/inbox/${conversation.id}/reply`, { text: 'Thanks so much!' });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.message.sender, 'agent');
    assert.equal(sent.body.message.text, 'Thanks so much!');

    const reloaded = (await owner.get('/inbox')).body.conversations.find((c) => c.id === conversation.id);
    assert.ok(reloaded.messages.some((m) => m.sender === 'agent' && m.text === 'Thanks so much!'));
    assert.equal(reloaded.isUnread, false);
  });

  it('marks read, assigns to a real user, and changes status — all persisted, not just local state', async () => {
    const response = await owner.get('/inbox');
    const conversation = response.body.conversations.find((c) => c.platform === 'mastodon');

    assert.equal((await owner.post(`/inbox/${conversation.id}/read`)).status, 200);
    assert.equal((await owner.patch(`/inbox/${conversation.id}/status`, { status: 'pending' })).status, 200);

    const ownerId = (await query("SELECT id FROM users WHERE email = 'owner@example.com'")).rows[0].id;
    assert.equal((await owner.patch(`/inbox/${conversation.id}/assign`, { userId: ownerId })).status, 200);

    const reloaded = (await owner.get('/inbox')).body.conversations.find((c) => c.id === conversation.id);
    assert.equal(reloaded.isUnread, false);
    assert.equal(reloaded.status, 'pending');
    assert.equal(reloaded.assignedTo, 'Nitesh Owner');
  });

  it('lists real, assignable users — not a hardcoded team', async () => {
    const response = await owner.get('/inbox/assignable-users');
    assert.equal(response.status, 200);
    assert.ok(response.body.users.some((u) => u.name === 'Nitesh Owner'));
  });

  it('analysts can read the Inbox but not act on it', async () => {
    const analyst = await makeUser('Ana Lyst', 'analyst');
    assert.equal((await analyst.get('/inbox')).status, 200);
    const conversation = (await analyst.get('/inbox')).body.conversations[0];
    assert.equal((await analyst.post(`/inbox/${conversation.id}/read`)).status, 403);
    assert.equal((await analyst.patch(`/inbox/${conversation.id}/status`, { status: 'closed' })).status, 403);
  });

  it('only an Editor/Admin/Super Admin may send a real reply, even though a Contributor can read and mark read', async () => {
    const contributor = await makeUser('Con Tributor', 'contributor');
    const conversation = (await contributor.get('/inbox')).body.conversations[0];
    assert.equal((await contributor.post(`/inbox/${conversation.id}/read`)).status, 200);
    assert.equal((await contributor.post(`/inbox/${conversation.id}/reply`, { text: 'hello' })).status, 403);
  });

  it('a disconnected platform refuses a reply instead of silently doing nothing', async () => {
    assert.equal((await owner.delete('/social-accounts/facebook')).status, 200);
    const conversation = (await owner.get('/inbox')).body.conversations.find((c) => c.platform === 'facebook');
    const attempt = await owner.post(`/inbox/${conversation.id}/reply`, { text: 'hi' });
    assert.equal(attempt.status, 409);
  });
});
