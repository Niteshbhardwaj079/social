import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { MAX_BULK_VARIATIONS, refreshAdMetrics } from '../src/services/adsService.js';

const realFetch = globalThis.fetch;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let adStatusOverride = () => null;
let lastAdCreativeForm = null;
let campaignCallCount = 0;
let adSetCallCount = 0;
let creativeCallCount = 0;
let adCallCount = 0;

// The organic Page token used for Facebook posting ('fb-token-123') and the Ads-scoped User token
// are deliberately different tokens on deliberately different accounts (see providers/adsMeta.js's
// header comment) — the stub tells them apart by exactly which token /debug_token was asked about.
const ADS_TOKEN_GOOD = 'ads-user-token-with-scope';
const ADS_TOKEN_NO_SCOPE = 'ads-user-token-no-scope';

function stub(url, init) {
  const path = url.pathname;
  const method = init?.method || 'GET';
  if (url.hostname !== 'graph.facebook.com') return null;

  if (path.endsWith('/debug_token')) {
    const inputToken = url.searchParams.get('input_token');
    if (inputToken === ADS_TOKEN_GOOD) return reply(200, { data: { app_id: '111222', is_valid: true, scopes: ['pages_manage_posts', 'ads_management', 'ads_read'] } });
    if (inputToken === ADS_TOKEN_NO_SCOPE) return reply(200, { data: { app_id: '111222', is_valid: true, scopes: ['pages_manage_posts'] } });
    return reply(200, { data: { app_id: '111222', is_valid: true } }); // the organic Page token check
  }
  if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart' });
  if (path.endsWith('/17841400000000000') && method === 'GET') return reply(200, { id: '17841400000000000', username: 'gowebkart' });

  if (path.endsWith('/me/adaccounts') && method === 'GET') {
    return reply(200, {
      data: [
        { id: 'act_meta-act-1', name: 'Gowebkart Ads', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1, business: { name: 'Gowebkart Pvt Ltd' } },
      ],
    });
  }

  if (path.endsWith('/search') && url.searchParams.get('type') === 'adinterest') return reply(200, { data: [{ id: 'interest-1', name: url.searchParams.get('q') }] });
  if (path.endsWith('/act_meta-act-1/campaigns') && method === 'POST') {
    campaignCallCount += 1;
    return reply(200, { id: 'campaign-1' });
  }
  if (path.endsWith('/act_meta-act-1/adsets') && method === 'POST') {
    adSetCallCount += 1;
    return reply(200, { id: 'adset-1' });
  }
  if (path.endsWith('/act_meta-act-1/adimages') && method === 'POST') return reply(200, { images: { 'photo.png': { hash: 'hash-1' } } });
  if (path.endsWith('/act_meta-act-1/adcreatives') && method === 'POST') {
    creativeCallCount += 1;
    lastAdCreativeForm = Object.fromEntries(new URLSearchParams(init.body));
    return reply(200, { id: 'creative-1' });
  }
  if (path.endsWith('/page-1/feed') && method === 'POST') return reply(200, { post_id: 'page-1_555', id: 'page-1_555' });
  if (path.endsWith('/act_meta-act-1/ads') && method === 'POST') {
    adCallCount += 1;
    return reply(200, { id: 'ad-1' });
  }
  if (path.endsWith('/ad-1') && method === 'GET') return adStatusOverride(url) ?? reply(200, { effective_status: 'ACTIVE' });
  if (path.endsWith('/ad-1/insights') && method === 'GET') {
    return reply(200, { data: [{ date_start: '2026-09-22', spend: '12.50', impressions: '500', clicks: '10' }, { date_start: '2026-09-23', spend: '8.00', impressions: '300', clicks: '6' }] });
  }
  if (path.endsWith('/ad-1') && method === 'POST') return reply(200, { success: true });
  if (path.endsWith('/ad-1') && method === 'DELETE') return reply(200, { success: true });
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
let analyst;

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
    adAccountId: overrides.adAccountId,
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

function bulkAdPayload(overrides = {}) {
  const base = adPayload(overrides);
  delete base.creative;
  return {
    ...base,
    creatives: overrides.creatives || [
      { headline: 'Headline A', text: 'Variation A text', cta: 'Shop now', destinationUrl: 'https://gowebkart.in/a' },
      { headline: 'Headline B', text: 'Variation B text', cta: 'Learn more', destinationUrl: 'https://gowebkart.in/b' },
    ],
  };
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Itor', 'editor');
  contributor = await makeUser('Con Tributor', 'contributor');
  analyst = await makeUser('Ana Lyst', 'analyst');
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('ad account discovery reuses the existing Facebook connection — no separate Ads login', () => {
  it('refuses to sync when Facebook is not connected at all', async () => {
    const list = await owner.get('/ads/accounts');
    assert.equal(list.status, 200);
    assert.equal(list.body.facebookConnected, false);
    assert.equal(list.body.accounts.length, 0);

    const sync = await owner.post('/ads/accounts/sync');
    assert.equal(sync.status, 409);
    assert.match(sync.body.error.message, /not connected/i);
  });

  it('connects Facebook (organic) without an Ads token — sync says the token is missing, not "not connected"', async () => {
    assert.equal((await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123' } })).status, 200);

    const list = await owner.get('/ads/accounts');
    assert.equal(list.body.facebookConnected, true);
    assert.equal(list.body.hasAdsToken, false);

    const sync = await owner.post('/ads/accounts/sync');
    assert.equal(sync.status, 409);
    assert.match(sync.body.error.message, /Ads token/i);
  });

  it('an Ads token without ads_management/ads_read is detected honestly, not guessed', async () => {
    assert.equal(
      (await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123', adsAccessToken: ADS_TOKEN_NO_SCOPE } })).status,
      200
    );
    const list = await owner.get('/ads/accounts');
    assert.equal(list.body.hasAdsToken, true);
    assert.equal(list.body.hasAdsPermission, false);

    const sync = await owner.post('/ads/accounts/sync');
    assert.equal(sync.status, 409);
    assert.match(sync.body.error.message, /permission/i);
  });

  it('a real Ads-scoped token discovers real Meta ad accounts, storing no credentials of its own', async () => {
    assert.equal(
      (await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'appsecret-abc', accessToken: 'fb-token-123', adsAccessToken: ADS_TOKEN_GOOD } })).status,
      200
    );
    const sync = await owner.post('/ads/accounts/sync');
    assert.equal(sync.status, 200);
    assert.equal(sync.body.hasAdsPermission, true);
    assert.equal(sync.body.accounts.length, 1);
    const account = sync.body.accounts[0];
    assert.equal(account.externalAccountId, 'act_meta-act-1');
    assert.equal(account.name, 'Gowebkart Ads');
    assert.equal(account.currency, 'INR');
    assert.equal(account.timezone, 'Asia/Kolkata');
    assert.equal(account.businessName, 'Gowebkart Pvt Ltd');

    // No token/secret anywhere in the response, and no credentials column left on the row at all —
    // the whole point of this rework (see migration 017's comment).
    assert.ok(!JSON.stringify(sync.body).includes(ADS_TOKEN_GOOD));
    const columns = (await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_accounts'")).rows.map((row) => row.column_name);
    assert.ok(!columns.includes('credentials'), 'ad_accounts has no credentials column any more');
  });

  it('only an account manager may sync; anyone signed in may read the discovered list', async () => {
    assert.equal((await contributor.post('/ads/accounts/sync')).status, 403);
    assert.equal((await contributor.get('/ads/accounts')).status, 200);
    assert.equal((await analyst.get('/ads/accounts')).status, 200);
  });
});

describe('creating an ad', () => {
  let adAccountId;

  before(async () => {
    const accounts = await owner.get('/ads/accounts');
    adAccountId = accounts.body.accounts[0].id;
  });

  it('refuses a made-up ad account id', async () => {
    const response = await owner.post('/ads', adPayload({ adAccountId: '00000000-0000-0000-0000-000000000000' }));
    assert.equal(response.status, 400);
  });

  it('refuses to launch on Instagram before Instagram is connected in Social Accounts', async () => {
    const response = await owner.post('/ads', adPayload({ adAccountId, platforms: ['facebook', 'instagram'] }));
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Instagram/);
  });

  it('a Contributor cannot create an ad; an Editor can', async () => {
    assert.equal((await contributor.post('/ads', adPayload({ adAccountId }))).status, 403);
    const response = await editor.post('/ads', adPayload({ adAccountId, name: 'Editor ad' }));
    assert.equal(response.status, 201);
  });

  it('launches a real Meta campaign end to end, writing a real Campaign → Ad Set → Creative → Ad hierarchy', async () => {
    const imageForm = new FormData();
    imageForm.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'photo.png');
    const uploaded = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${owner.accessToken}` }, body: imageForm });
    const mediaId = (await uploaded.json()).item.id;

    const response = await owner.post('/ads', adPayload({ adAccountId, name: 'Diwali launch', creative: { ...adPayload().creative, mediaId } }));
    assert.equal(response.status, 201);
    const { ad } = response.body;
    assert.equal(ad.status, 'inReview');
    assert.equal(ad.network, 'meta');
    assert.equal(ad.adAccountId, adAccountId);

    // The four levels are real, independent rows — not one bundled row like before this rework.
    const adRow = (await query('SELECT * FROM ads WHERE id = $1', [ad.id])).rows[0];
    assert.equal(adRow.external_ad_id, 'ad-1');
    const adSetRow = (await query('SELECT * FROM ad_sets WHERE id = $1', [adRow.ad_set_id])).rows[0];
    assert.equal(adSetRow.external_adset_id, 'adset-1');
    assert.deepEqual(adSetRow.platforms, ['facebook']);
    const campaignRow = (await query('SELECT * FROM ad_campaigns WHERE id = $1', [adSetRow.ad_campaign_id])).rows[0];
    assert.equal(campaignRow.external_campaign_id, 'campaign-1');
    assert.equal(campaignRow.ad_account_id, adAccountId);
    const creativeRow = (await query('SELECT * FROM ad_creatives WHERE id = $1', [adRow.ad_creative_id])).rows[0];
    assert.equal(creativeRow.external_creative_id, 'creative-1');
    assert.equal(creativeRow.headline, 'Big offer');
  });

  it('saves a draft without ever calling Meta', async () => {
    const response = await owner.post('/ads', adPayload({ adAccountId, name: 'Just a draft', status: 'draft' }));
    assert.equal(response.status, 201);
    assert.equal(response.body.ad.status, 'draft');
    const adRow = (await query('SELECT external_ad_id FROM ads WHERE id = $1', [response.body.ad.id])).rows[0];
    assert.equal(adRow.external_ad_id, null);
  });
});

describe('running ads: status sync, pause/resume, delete', () => {
  let adAccountId;
  let adId;

  before(async () => {
    adAccountId = (await owner.get('/ads/accounts')).body.accounts[0].id;
    const response = await owner.post('/ads', adPayload({ adAccountId, name: 'Lifecycle ad' }));
    adId = response.body.ad.id;
  });

  it('the background pass pulls real day-by-day spend/impressions/clicks for this one ad, and the real review status', async () => {
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
    await query('UPDATE ads SET last_synced_at = NULL WHERE id = $1', [adId]);
    await refreshAdMetrics(0);
    const ad = await owner.get(`/ads/${adId}`);
    assert.equal(ad.body.ad.status, 'rejected');
    assert.equal(ad.body.ad.rejectionReason, 'Image has too much text');
    adStatusOverride = () => null;
  });

  it('pauses and resumes one specific ad for real, and a Contributor is refused', async () => {
    assert.equal((await contributor.patch('/ads/status', { ids: [adId], status: 'paused' })).status, 403);
    const paused = await owner.patch('/ads/status', { ids: [adId], status: 'paused' });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.updated, 1);
    assert.equal((await owner.get(`/ads/${adId}`)).body.ad.status, 'paused');
  });

  it('deletes for real and cleans up the now-empty ad set and campaign, but leaves the ad account alone', async () => {
    const before2 = await query('SELECT ad_set_id FROM ads WHERE id = $1', [adId]);
    const adSetId = before2.rows[0].ad_set_id;
    const adSetRow = await query('SELECT ad_campaign_id FROM ad_sets WHERE id = $1', [adSetId]);
    const campaignId = adSetRow.rows[0].ad_campaign_id;

    const response = await owner.delete('/ads', { body: { ids: [adId] } });
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, 1);
    assert.equal((await owner.get(`/ads/${adId}`)).status, 404);

    assert.equal((await query('SELECT 1 FROM ad_sets WHERE id = $1', [adSetId])).rows.length, 0, 'the now-empty ad set was cleaned up');
    assert.equal((await query('SELECT 1 FROM ad_campaigns WHERE id = $1', [campaignId])).rows.length, 0, 'the now-empty campaign was cleaned up');
    assert.equal((await query('SELECT 1 FROM ad_accounts WHERE id = $1', [adAccountId])).rows.length, 1, 'the ad account itself is untouched — it can run more ads later');
  });

  it('deleting one ad in a shared ad set never touches the other ads still using it', async () => {
    const first = await owner.post('/ads', adPayload({ adAccountId, name: 'Shared A' }));
    const adSetId = (await query('SELECT ad_set_id FROM ads WHERE id = $1', [first.body.ad.id])).rows[0].ad_set_id;
    // Simulate a second ad sharing the same ad set (bulk creation's shape, not yet wired to the wizard).
    const creative = (await query('SELECT id FROM ad_creatives WHERE id = $1', [(await query('SELECT ad_creative_id FROM ads WHERE id = $1', [first.body.ad.id])).rows[0].ad_creative_id])).rows[0];
    const second = (await query('INSERT INTO ads (ad_set_id, ad_creative_id, name, status) VALUES ($1,$2,$3,$4) RETURNING *', [adSetId, creative.id, 'Shared B', 'draft'])).rows[0];

    await owner.delete('/ads', { body: { ids: [first.body.ad.id] } });
    assert.equal((await query('SELECT 1 FROM ad_sets WHERE id = $1', [adSetId])).rows.length, 1, 'the ad set survives because Shared B still uses it');
    assert.equal((await query('SELECT 1 FROM ads WHERE id = $1', [second.id])).rows.length, 1);
  });
});

describe('Phase 3: an existing post as an ad', () => {
  let adAccountId;
  let publishedPostId;

  before(async () => {
    adAccountId = (await owner.get('/ads/accounts')).body.accounts[0].id;
    const post = await owner.post('/posts', { content: 'Our biggest sale of the year is here', platforms: ['facebook'], status: 'published' });
    assert.equal(post.status, 201);
    publishedPostId = post.body.post.id;
    const target = (await query("SELECT external_id, status FROM post_targets WHERE post_id = $1 AND platform = 'facebook'", [publishedPostId])).rows[0];
    assert.equal(target.status, 'published');
    assert.equal(target.external_id, 'page-1_555');
  });

  it('refuses when neither creative nor a post to boost is given, and refuses both together', async () => {
    const neither = await owner.post('/ads', adPayload({ adAccountId, creative: undefined }));
    assert.equal(neither.status, 400);

    const both = await owner.post('/ads', adPayload({ adAccountId, sourcePostId: publishedPostId }));
    assert.equal(both.status, 400);
  });

  it('refuses to boost a post with no real published Facebook version', async () => {
    const draftPost = await owner.post('/posts', { content: 'Not published anywhere', platforms: ['facebook'], status: 'draft' });
    const response = await owner.post('/ads', { ...adPayload({ adAccountId }), creative: undefined, sourcePostId: draftPost.body.post.id });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /no real, published Facebook version/);
  });

  it('boosts the real published Facebook post: object_story_id, not a fresh link_data creative', async () => {
    lastAdCreativeForm = null;
    const response = await owner.post('/ads', { ...adPayload({ adAccountId }), creative: undefined, sourcePostId: publishedPostId });
    assert.equal(response.status, 201);
    const { ad } = response.body;
    assert.equal(ad.status, 'inReview');
    assert.deepEqual(ad.platforms, ['facebook'], 'forced to Facebook-only server-side, regardless of what was in the payload');
    assert.equal(ad.sourcePostId, publishedPostId);
    // Real creative fields are honestly empty — the post's own content is what actually shows, not a copy of it.
    assert.equal(ad.creative.headline, '');
    assert.equal(ad.creative.text, '');

    assert.equal(lastAdCreativeForm.object_story_id, 'page-1_555');
    assert.ok(!('object_story_spec' in lastAdCreativeForm), 'a real boost never builds a fresh link_data creative');
  });

  it('a Contributor cannot boost a post either — same permission as any other ad', async () => {
    const response = await contributor.post('/ads', { ...adPayload({ adAccountId, name: 'Contributor boost' }), creative: undefined, sourcePostId: publishedPostId });
    assert.equal(response.status, 403);
  });
});

describe('Phase 4: bulk ad creation (several creative variations, one shared ad set)', () => {
  let adAccountId;

  before(async () => {
    adAccountId = (await owner.get('/ads/accounts')).body.accounts[0].id;
  });

  it('rejects fewer than 2 variations or more than the cap', async () => {
    const tooFew = await owner.post('/ads/bulk', bulkAdPayload({ adAccountId, creatives: [{ headline: 'Only one', text: 'x', cta: 'Learn more', destinationUrl: 'https://gowebkart.in/1' }] }));
    assert.equal(tooFew.status, 400);

    const tooMany = Array.from({ length: MAX_BULK_VARIATIONS + 1 }, (_, index) => ({ headline: `H${index}`, text: 'x', cta: 'Learn more', destinationUrl: 'https://gowebkart.in/x' }));
    const overCap = await owner.post('/ads/bulk', bulkAdPayload({ adAccountId, creatives: tooMany }));
    assert.equal(overCap.status, 400);
  });

  it('a Contributor cannot bulk-create; an Editor can', async () => {
    assert.equal((await contributor.post('/ads/bulk', bulkAdPayload({ adAccountId }))).status, 403);
  });

  it('creates one campaign, one shared ad set, and one creative+ad per variation', async () => {
    campaignCallCount = 0;
    adSetCallCount = 0;
    creativeCallCount = 0;
    adCallCount = 0;

    const response = await owner.post('/ads/bulk', bulkAdPayload({ adAccountId, name: 'Diwali variations' }));
    assert.equal(response.status, 201);
    assert.equal(response.body.ads.length, 2);

    // The campaign and ad set are created exactly once for the whole batch, never once per variation.
    assert.equal(campaignCallCount, 1);
    assert.equal(adSetCallCount, 1);
    assert.equal(creativeCallCount, 2);
    assert.equal(adCallCount, 2);

    const [adA, adB] = response.body.ads;
    assert.equal(adA.creative.headline, 'Headline A');
    assert.equal(adB.creative.headline, 'Headline B');
    assert.equal(adA.status, 'inReview');
    assert.equal(adB.status, 'inReview');

    const adRows = (await query('SELECT ad_set_id, ad_creative_id FROM ads WHERE id = ANY($1)', [[adA.id, adB.id]])).rows;
    assert.equal(adRows[0].ad_set_id, adRows[1].ad_set_id, 'both variations share one ad set');
    assert.notEqual(adRows[0].ad_creative_id, adRows[1].ad_creative_id, 'each variation has its own creative row');

    const adSetRow = (await query('SELECT budget, platforms FROM ad_sets WHERE id = $1', [adRows[0].ad_set_id])).rows[0];
    assert.equal(Number(adSetRow.budget), 500);
    assert.deepEqual(adSetRow.platforms, ['facebook']);
  });

  it('saves every variation as a draft without ever calling Meta', async () => {
    campaignCallCount = 0;
    creativeCallCount = 0;
    const response = await owner.post('/ads/bulk', bulkAdPayload({ adAccountId, name: 'Draft variations', status: 'draft' }));
    assert.equal(response.status, 201);
    assert.equal(response.body.ads.length, 2);
    assert.ok(response.body.ads.every((ad) => ad.status === 'draft'));
    assert.equal(campaignCallCount, 0);
    assert.equal(creativeCallCount, 0);
    const adRows = (await query('SELECT external_ad_id FROM ads WHERE id = ANY($1)', [response.body.ads.map((ad) => ad.id)])).rows;
    assert.ok(adRows.every((row) => row.external_ad_id === null));
  });
});

describe('Phase 5: creative library (saved, reusable templates)', () => {
  const templatePayload = (overrides = {}) => ({
    name: 'Diwali headline test',
    headline: 'Big Diwali Offer',
    text: 'Up to 40% off storewide',
    cta: 'Shop now',
    destinationUrl: 'https://gowebkart.in/diwali',
    ...overrides,
  });

  it('a Contributor cannot save a template; an Editor can, and it shows up in the list', async () => {
    assert.equal((await contributor.post('/ads/templates', templatePayload())).status, 403);

    const created = await editor.post('/ads/templates', templatePayload({ name: 'Editor template' }));
    assert.equal(created.status, 201);
    assert.equal(created.body.template.name, 'Editor template');
    assert.equal(created.body.template.headline, 'Big Diwali Offer');
    assert.equal(created.body.template.mediaUrl, null);

    const list = await owner.get('/ads/templates');
    assert.equal(list.status, 200);
    assert.ok(list.body.templates.some((t) => t.id === created.body.template.id));
  });

  it('a template can carry a real, already-uploaded image, and its URL comes back with it', async () => {
    const imageForm = new FormData();
    imageForm.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'photo.png');
    const uploaded = await fetch(`${server.baseUrl}/api/media`, { method: 'POST', headers: { authorization: `Bearer ${owner.accessToken}` }, body: imageForm });
    const mediaId = (await uploaded.json()).item.id;

    const created = await owner.post('/ads/templates', templatePayload({ name: 'With image', mediaId }));
    assert.equal(created.status, 201);
    assert.equal(created.body.template.mediaId, mediaId);
    assert.ok(created.body.template.mediaUrl, 'the real media URL comes back with the template, not just its id');
  });

  it('editing a template updates it in place; deleting removes it for good', async () => {
    const created = await owner.post('/ads/templates', templatePayload({ name: 'To edit' }));
    const id = created.body.template.id;

    const edited = await owner.patch(`/ads/templates/${id}`, templatePayload({ name: 'Edited name', headline: 'New headline' }));
    assert.equal(edited.status, 200);
    assert.equal(edited.body.template.name, 'Edited name');
    assert.equal(edited.body.template.headline, 'New headline');

    assert.equal((await contributor.delete(`/ads/templates/${id}`)).status, 403);
    const deleted = await owner.delete(`/ads/templates/${id}`);
    assert.equal(deleted.status, 200);
    const list = await owner.get('/ads/templates');
    assert.ok(!list.body.templates.some((t) => t.id === id));
  });

  it('refuses a made-up template id, on both edit and delete', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    assert.equal((await owner.patch(`/ads/templates/${fakeId}`, templatePayload())).status, 404);
    assert.equal((await owner.delete(`/ads/templates/${fakeId}`)).status, 404);
  });
});
