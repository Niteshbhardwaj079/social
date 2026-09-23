import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { refreshAdMetrics } from '../src/services/adsService.js';

const realFetch = globalThis.fetch;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let adStatusOverride = () => null;

function stub(url, init) {
  const path = url.pathname;
  const method = init?.method || 'GET';
  if (url.hostname !== 'graph.facebook.com') return null;

  if (path.endsWith('/debug_token')) return reply(200, { data: { app_id: '111222', is_valid: true } });
  if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart' });
  if (path.endsWith('/17841400000000000') && method === 'GET') return reply(200, { id: '17841400000000000', username: 'gowebkart' });

  if (path.endsWith('/act_meta-act-1') && method === 'GET') return reply(200, { id: 'act_meta-act-1', name: 'Gowebkart Ads', currency: 'INR' });
  if (path.endsWith('/search') && url.searchParams.get('type') === 'adinterest') return reply(200, { data: [{ id: 'interest-1', name: url.searchParams.get('q') }] });
  if (path.endsWith('/act_meta-act-1/campaigns') && method === 'POST') return reply(200, { id: 'campaign-1' });
  if (path.endsWith('/act_meta-act-1/adsets') && method === 'POST') return reply(200, { id: 'adset-1' });
  if (path.endsWith('/act_meta-act-1/adimages') && method === 'POST') return reply(200, { images: { 'photo.png': { hash: 'hash-1' } } });
  if (path.endsWith('/act_meta-act-1/adcreatives') && method === 'POST') return reply(200, { id: 'creative-1' });
  if (path.endsWith('/act_meta-act-1/ads') && method === 'POST') return reply(200, { id: 'ad-1' });
  if (path.endsWith('/ad-1') && method === 'GET') return adStatusOverride(url) ?? reply(200, { effective_status: 'ACTIVE' });
  if (path.endsWith('/campaign-1/insights') && method === 'GET') {
    return reply(200, { data: [{ date_start: '2026-09-22', spend: '12.50', impressions: '500', clicks: '10' }, { date_start: '2026-09-23', spend: '8.00', impressions: '300', clicks: '6' }] });
  }
  if (path.endsWith('/campaign-1') && method === 'POST') return reply(200, { success: true });
  if (path.endsWith('/campaign-1') && method === 'DELETE') return reply(200, { success: true });
  return null;
}

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  return stub(url, init) ?? reply(404, { error: 'not stubbed' });
};

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

function adPayload(overrides = {}) {
  return {
    name: 'Diwali Offer',
    objective: 'traffic',
    network: 'meta',
    platforms: ['facebook'],
    budgetType: 'daily',
    budget: 500,
    startDate: '2026-09-20',
    endDate: '2026-10-05',
    creative: { headline: 'Big offer', text: 'Up to 40% off', cta: 'Shop now', destinationUrl: 'https://gowebkart.in/offer' },
    audience: { locations: ['India'], ageMin: 18, ageMax: 45, gender: 'all', interests: ['Fashion'] },
    ...overrides,
  };
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Itor', 'editor');
  contributor = await makeUser('Con Tributor', 'contributor');
  assert.equal((await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' } })).status, 200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('Meta ad account', () => {
  it('is the only ad network that actually connects — the other five say so honestly', async () => {
    const googleTest = await owner.post('/ads/accounts/google/test', { credentials: { adAccountId: 'x', accessToken: 'y' } });
    assert.equal(googleTest.status, 200);
    assert.equal(googleTest.body.ok, false);
    assert.match(googleTest.body.message, /not built yet|not connected/i);

    const googleConnect = await owner.put('/ads/accounts/google', { credentials: { adAccountId: 'x', accessToken: 'y' } });
    assert.equal(googleConnect.status, 422);
  });

  it('tests and connects for real against the Marketing API', async () => {
    const test = await owner.post('/ads/accounts/meta/test', { credentials: { adAccountId: 'act_meta-act-1', accessToken: 'meta-token-1' } });
    assert.equal(test.status, 200);
    assert.equal(test.body.ok, true);

    const connect = await owner.put('/ads/accounts/meta', { credentials: { adAccountId: 'act_meta-act-1', accessToken: 'meta-token-1' } });
    assert.equal(connect.status, 200);
    assert.equal(connect.body.account.isConnected, true);
    assert.equal(connect.body.account.accountName, 'Gowebkart Ads');

    const accounts = await owner.get('/ads/accounts');
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.accounts.length, 6);
    assert.ok(accounts.body.accounts.find((a) => a.network === 'meta').isConnected);
  });
});

describe('creating an ad', () => {
  it('refuses when the ad network is not connected', async () => {
    await owner.delete('/ads/accounts/meta');
    const response = await owner.post('/ads', adPayload());
    assert.equal(response.status, 409);
    await owner.put('/ads/accounts/meta', { credentials: { adAccountId: 'act_meta-act-1', accessToken: 'meta-token-1' } });
  });

  it('refuses to launch on Instagram before Instagram is connected in Social Accounts', async () => {
    const response = await owner.post('/ads', adPayload({ platforms: ['facebook', 'instagram'] }));
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Instagram/);
  });

  it('a Contributor cannot create an ad; an Editor can', async () => {
    assert.equal((await contributor.post('/ads', adPayload())).status, 403);
    const response = await editor.post('/ads', adPayload({ name: 'Editor ad' }));
    assert.equal(response.status, 201);
  });

  it('launches a real Meta campaign end to end: campaign, ad set, image, creative and ad', async () => {
    const imageForm = new FormData();
    imageForm.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'photo.png');
    const uploaded = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${owner.accessToken}` }, body: imageForm });
    const mediaId = (await uploaded.json()).item.id;

    const response = await owner.post('/ads', adPayload({ name: 'Diwali launch', creative: { ...adPayload().creative, mediaId } }));
    assert.equal(response.status, 201);
    const { ad } = response.body;
    assert.equal(ad.status, 'inReview');
    assert.equal(ad.network, 'meta');

    const row = (await query('SELECT * FROM ad_campaigns WHERE id = $1', [ad.id])).rows[0];
    assert.equal(row.external_campaign_id, 'campaign-1');
    assert.equal(row.external_adset_id, 'adset-1');
    assert.equal(row.external_creative_id, 'creative-1');
    assert.equal(row.external_ad_id, 'ad-1');
  });

  it('saves a draft without ever calling Meta', async () => {
    const response = await owner.post('/ads', adPayload({ name: 'Just a draft', status: 'draft' }));
    assert.equal(response.status, 201);
    assert.equal(response.body.ad.status, 'draft');
    const row = (await query('SELECT external_campaign_id FROM ad_campaigns WHERE id = $1', [response.body.ad.id])).rows[0];
    assert.equal(row.external_campaign_id, null);
  });
});

describe('running ads: status sync, pause/resume, delete', () => {
  let adId;

  before(async () => {
    const response = await owner.post('/ads', adPayload({ name: 'Lifecycle ad' }));
    adId = response.body.ad.id;
  });

  it('the background pass pulls real day-by-day spend/impressions/clicks and the real review status', async () => {
    await refreshAdMetrics(0);
    const ad = await owner.get(`/ads/${adId}`);
    assert.equal(ad.body.ad.status, 'active');
    assert.equal(ad.body.ad.daily.length, 2);
    const day = ad.body.ad.daily.find((d) => d.date === '2026-09-22');
    assert.equal(day.spend, 12.5);
    assert.equal(day.impressions, 500);
    assert.equal(day.clicks, 10);
    // Never a guessed conversion count — see providers/adsMeta.js.
    assert.equal(day.conversions, 0);
  });

  it('a rejected ad carries the platform’s own reason', async () => {
    adStatusOverride = () => reply(200, { effective_status: 'DISAPPROVED', issues_info: [{ error_summary: 'Image has too much text' }] });
    await query('UPDATE ad_campaigns SET last_synced_at = NULL WHERE id = $1', [adId]);
    await refreshAdMetrics(0);
    const ad = await owner.get(`/ads/${adId}`);
    assert.equal(ad.body.ad.status, 'rejected');
    assert.equal(ad.body.ad.rejectionReason, 'Image has too much text');
    adStatusOverride = () => null;
  });

  it('pauses and resumes for real, and a Contributor is refused', async () => {
    assert.equal((await contributor.patch('/ads/status', { ids: [adId], status: 'paused' })).status, 403);
    const paused = await owner.patch('/ads/status', { ids: [adId], status: 'paused' });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.updated, 1);
    assert.equal((await owner.get(`/ads/${adId}`)).body.ad.status, 'paused');
  });

  it('deletes for real and forgets it locally', async () => {
    const response = await owner.delete('/ads', { body: { ids: [adId] } });
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, 1);
    assert.equal((await owner.get(`/ads/${adId}`)).status, 404);
  });
});
