import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { evaluateAdRules } from '../src/services/adRuleService.js';

const realFetch = globalThis.fetch;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ADS_TOKEN_GOOD = 'rules-ads-token';
let statusCallCount = 0;
let adCounter = 0;

function stub(url, init) {
  const path = url.pathname;
  const method = init?.method || 'GET';
  if (url.hostname !== 'graph.facebook.com') return null;

  if (path.endsWith('/debug_token')) {
    const inputToken = url.searchParams.get('input_token');
    if (inputToken === ADS_TOKEN_GOOD) return reply(200, { data: { app_id: '111222', is_valid: true, scopes: ['pages_manage_posts', 'ads_management', 'ads_read'] } });
    return reply(200, { data: { app_id: '111222', is_valid: true } });
  }
  if (path.endsWith('/me')) return reply(200, { id: 'page-1', name: 'Gowebkart' });
  if (path.endsWith('/me/adaccounts') && method === 'GET') {
    return reply(200, { data: [{ id: 'act_rules-1', name: 'Rules Ad Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }] });
  }
  if (path.endsWith('/search') && url.searchParams.get('type') === 'adinterest') return reply(200, { data: [] });
  if (path.endsWith('/act_rules-1/campaigns') && method === 'POST') return reply(200, { id: 'campaign-r' });
  if (path.endsWith('/act_rules-1/adsets') && method === 'POST') return reply(200, { id: 'adset-r' });
  if (path.endsWith('/act_rules-1/adcreatives') && method === 'POST') return reply(200, { id: 'creative-r' });
  // Each real ad this file creates gets its own distinct external id (ad-r-N) — unlike ads.test.js,
  // this file needs to fire rules against SPECIFIC ads independently, so a shared fixed id won't do.
  if (path.endsWith('/act_rules-1/ads') && method === 'POST') {
    adCounter += 1;
    return reply(200, { id: `ad-r-${adCounter}` });
  }
  if (/\/ad-r-\d+$/.test(path) && method === 'POST') {
    statusCallCount += 1;
    return reply(200, { success: true });
  }
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
let adAccountId;

async function makeUser(name, role) {
  await owner.post('/users', { name, email: `${role}rules@example.com`, role, language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = $1", [`${role}rules@example.com`]);
  const client = createClient(server.baseUrl);
  assert.equal((await client.signIn(`${role}rules@example.com`)).status, 200);
  return client;
}

// Creates one real, launched ad with an independent external_ad_id and lets the caller seed its own
// ad_daily_stats rows directly — the cleanest way to give each test full control over the exact metric
// values a rule will evaluate, without needing a real Meta insights round trip for every scenario.
async function createAd({ name, status = 'active' }) {
  const payload = {
    name,
    objective: 'traffic',
    adAccountId,
    platforms: ['facebook'],
    budgetType: 'daily',
    budget: 500,
    startDate: '2026-09-01',
    endDate: '2026-10-01',
    creative: { headline: 'H', text: 'T', cta: 'Learn more', destinationUrl: 'https://gowebkart.in' },
    audience: { locations: ['India'], ageMin: 18, ageMax: 45, gender: 'all', interests: [] },
  };
  const response = await owner.post('/ads', payload);
  assert.equal(response.status, 201);
  const adId = response.body.ad.id;
  if (status !== 'inReview') await query('UPDATE ads SET status = $2 WHERE id = $1', [adId, status]);
  return adId;
}

async function seedStats(adId, { spend = 0, impressions = 0, clicks = 0 }, daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await query(
    `INSERT INTO ad_daily_stats (ad_id, date, spend, impressions, clicks, conversions) VALUES ($1,$2,$3,$4,$5,0)
     ON CONFLICT (ad_id, date) DO UPDATE SET spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks`,
    [adId, date, spend, impressions, clicks]
  );
}

function rulePayload(overrides = {}) {
  return {
    name: 'Pause high spenders',
    adAccountId,
    metric: 'spend',
    comparator: 'gt',
    threshold: 1000,
    windowDays: 7,
    action: 'pause',
    isActive: true,
    cooldownHours: 24,
    ...overrides,
  };
}

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  editor = await makeUser('Ed Rules', 'editor');
  await owner.put('/social-accounts/facebook', { credentials: { appId: '111222', appSecret: 'secret-abc', accessToken: 'fb-token', adsAccessToken: ADS_TOKEN_GOOD } });
  await owner.post('/ads/accounts/sync');
  adAccountId = (await owner.get('/ads/accounts')).body.accounts[0].id;
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

describe('Phase 8: Automated Rules — CRUD and permissions', () => {
  it('only an Admin/Super Admin may create, edit or delete a rule; anyone signed in may list', async () => {
    assert.equal((await editor.post('/ads/rules', rulePayload())).status, 403);

    const created = await owner.post('/ads/rules', rulePayload({ name: 'My Rule' }));
    assert.equal(created.status, 201);
    assert.equal(created.body.rule.name, 'My Rule');
    assert.equal(created.body.rule.action, 'pause');
    assert.equal(created.body.rule.lastFiredAt, null);

    assert.equal((await editor.get('/ads/rules')).status, 200);

    assert.equal((await editor.patch(`/ads/rules/${created.body.rule.id}`, rulePayload({ name: 'Edited' }))).status, 403);
    const edited = await owner.patch(`/ads/rules/${created.body.rule.id}`, rulePayload({ name: 'Edited', isActive: false }));
    assert.equal(edited.status, 200);
    assert.equal(edited.body.rule.name, 'Edited');
    assert.equal(edited.body.rule.isActive, false);

    assert.equal((await editor.delete(`/ads/rules/${created.body.rule.id}`)).status, 403);
    assert.equal((await owner.delete(`/ads/rules/${created.body.rule.id}`)).status, 200);
    assert.ok(!(await owner.get('/ads/rules')).body.rules.some((r) => r.id === created.body.rule.id));
  });

  it('rejects a nonsense window/metric/comparator', async () => {
    assert.equal((await owner.post('/ads/rules', rulePayload({ windowDays: 5 }))).status, 400);
    assert.equal((await owner.post('/ads/rules', rulePayload({ metric: 'conversions' }))).status, 400, 'conversions is never a real metric to rule on — not tracked');
    assert.equal((await owner.post('/ads/rules', rulePayload({ comparator: 'eq' }))).status, 400);
  });
});

describe('Phase 8: Automated Rules — real evaluation, pause/resume only, real Meta calls', () => {
  it('a spend-based pause rule fires for real on an ad that crosses the threshold, and only that one', async () => {
    const overAd = await createAd({ name: 'Over threshold', status: 'active' });
    const underAd = await createAd({ name: 'Under threshold', status: 'active' });
    await seedStats(overAd, { spend: 1500, impressions: 1000, clicks: 20 });
    await seedStats(underAd, { spend: 200, impressions: 1000, clicks: 20 });

    const rule = (await owner.post('/ads/rules', rulePayload({ name: 'Spend cap' }))).body.rule;
    statusCallCount = 0;
    await evaluateAdRules();

    assert.equal(statusCallCount, 1, 'exactly one real Meta status call was made — only the ad that crossed the threshold');
    assert.equal((await owner.get(`/ads/${overAd}`)).body.ad.status, 'paused');
    assert.equal((await owner.get(`/ads/${underAd}`)).body.ad.status, 'active', 'the ad under the threshold is left untouched');

    const runs = (await query('SELECT * FROM ad_rule_runs WHERE ad_rule_id = $1', [rule.id])).rows;
    assert.equal(runs.length, 1);
    assert.equal(runs[0].ad_id, overAd);
    assert.equal(runs[0].action, 'pause');

    const activity = (await query("SELECT * FROM activity_logs WHERE action = 'ads.rule_fired' AND entity_id = $1", [overAd])).rows;
    assert.equal(activity.length, 1, 'a real activity log entry was written for the automated action');
    assert.equal(activity[0].actor_id, null, 'system-triggered, same actorId:null convention as the post scheduler');

    await owner.delete(`/ads/rules/${rule.id}`);
  });

  it('a pause rule never touches an already-paused ad, and a resume rule never touches an already-active one', async () => {
    const alreadyPaused = await createAd({ name: 'Already paused', status: 'paused' });
    await seedStats(alreadyPaused, { spend: 9999, impressions: 1000, clicks: 20 });
    const pauseRule = (await owner.post('/ads/rules', rulePayload({ name: 'Would pause' }))).body.rule;
    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 0, 'no Meta call at all — the ad was never a candidate, it was already paused');
    await owner.delete(`/ads/rules/${pauseRule.id}`);
  });

  it('cooldown: a rule that already fired for this ad does not fire again until the cooldown passes', async () => {
    const ad = await createAd({ name: 'Cooldown test', status: 'active' });
    await seedStats(ad, { spend: 2000, impressions: 1000, clicks: 20 });
    const rule = (await owner.post('/ads/rules', rulePayload({ name: 'Cooldown rule', cooldownHours: 24 }))).body.rule;

    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 1, 'fires the first time');

    // Flip it back to active by hand (simulating a person re-enabling it) and run the pass again —
    // the rule must NOT immediately re-fire within its own 24h cooldown, even though the ad is a real candidate again.
    await query("UPDATE ads SET status = 'active' WHERE id = $1", [ad]);
    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 0, 'still within cooldown — does not fire a second time');
    assert.equal((await owner.get(`/ads/${ad}`)).body.ad.status, 'active', 'left exactly as the person set it, not overridden');

    await owner.delete(`/ads/rules/${rule.id}`);
  });

  it('a CTR/CPC rule never fires on an ad with no real data yet — undefined, not a fake zero', async () => {
    const freshAd = await createAd({ name: 'Brand new, zero data', status: 'active' });
    // No ad_daily_stats rows at all for this ad — impressions/clicks are genuinely 0, not "low".
    const rule = (await owner.post('/ads/rules', rulePayload({ name: 'Low CTR', metric: 'ctr', comparator: 'lt', threshold: 1 }))).body.rule;
    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 0, 'a CTR of "0 because no impressions yet" must never be treated as "CTR < 1%"');
    assert.equal((await owner.get(`/ads/${freshAd}`)).body.ad.status, 'active');
    await owner.delete(`/ads/rules/${rule.id}`);
  });

  it('an inactive rule never fires', async () => {
    const ad = await createAd({ name: 'Inactive rule target', status: 'active' });
    await seedStats(ad, { spend: 5000, impressions: 1000, clicks: 20 });
    const rule = (await owner.post('/ads/rules', rulePayload({ name: 'Off rule', isActive: false }))).body.rule;
    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 0);
    await owner.delete(`/ads/rules/${rule.id}`);
  });

  it('a resume rule only ever fires on paused ads, and pauses/resume are real, independent Meta calls', async () => {
    const pausedAd = await createAd({ name: 'Should resume', status: 'paused' });
    await seedStats(pausedAd, { spend: 10, impressions: 1000, clicks: 50 }); // low spend -> "resume if spend < 100"
    const rule = (await owner.post('/ads/rules', rulePayload({ name: 'Resume cheap ads', comparator: 'lt', threshold: 100, action: 'resume' }))).body.rule;
    statusCallCount = 0;
    await evaluateAdRules();
    assert.equal(statusCallCount, 1);
    assert.equal((await owner.get(`/ads/${pausedAd}`)).body.ad.status, 'active');
    const runs = (await query('SELECT action FROM ad_rule_runs WHERE ad_rule_id = $1', [rule.id])).rows;
    assert.equal(runs[0].action, 'resume');
    await owner.delete(`/ads/rules/${rule.id}`);
  });
});
