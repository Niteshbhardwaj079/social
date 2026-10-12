import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { replaceAiProviderForTests } from '../src/ai/providers/index.js';
import { freeSources } from '../src/ai/free/sources.js';
import { upcomingEvents } from '../src/ai/free/events.js';
import { planSlots, runQueuedPlansNow } from '../src/services/aiPlanService.js';
import { runDueAutopilotsNow } from '../src/services/autopilotService.js';
import { setupOwner, startServer, waitFor } from './helpers.js';

let server;
let owner;
const realSources = { ...freeSources };
const restores = [];

const BRAND_KIT = {
  companyName: 'Gowebkart Fashion',
  website: 'https://fashion.example.com',
  industry: 'Clothing store',
  description: 'Handpicked ethnic wear for women.',
  products: 'Cotton kurtas\nSilk sarees',
  targetAudience: 'women aged 25-45',
  location: 'Pune',
  usps: 'Free home delivery in Pune\nHandpicked fabrics',
  competitors: 'FabIndia',
  keywords: 'ethnicwear, kurta',
  phone: '+91 98765 43210',
  brandColor: '#c2410c',
};

/**
 * Waits for a content plan to finish. The app starts its own background worker when a plan is queued,
 * and the test runs one too — whichever claims the plan first builds it, so just wait for the result.
 */
async function finishedPlan(id) {
  await runQueuedPlansNow();
  return waitFor(
    async () => {
      const plan = (await owner.get(`/ai/plans/${id}`)).body.plan;
      return ['queued', 'running'].includes(plan.status) ? null : plan;
    },
    { timeout: 30_000, interval: 200 }
  );
}

/** Polls a research report until it is done. */
async function finishedReport(id) {
  return waitFor(
    async () => {
      const report = (await owner.get(`/ai/research/${id}`)).body.report;
      return report.status === 'running' ? null : report;
    },
    { timeout: 20_000, interval: 200 }
  );
}

before(async () => {
  server = await startServer();
  ({ client: owner } = await setupOwner(server.baseUrl));
  // The free agent's internet sources, faked: tests never depend on Google News or a real website.
  freeSources.newsHeadlines = async (topic) => [{ title: `${topic}: new stores open this festive season`, url: 'https://news.example.com/1', source: 'Example News' }];
  freeSources.readWebsite = async () => ({
    title: 'Gowebkart Fashion | Ethnic wear in Pune',
    siteName: 'Gowebkart Fashion',
    description: 'Handpicked ethnic wear for women in Pune.',
    headings: ['Cotton kurtas', 'Silk sarees'],
    keywords: ['ethnicwear', 'kurta'],
  });
});
after(async () => {
  Object.assign(freeSources, realSources);
  restores.forEach((restore) => restore());
  await server.close();
});

describe('Brand Kit', () => {
  it('fills itself from the business website (free agent, no AI key)', async () => {
    const response = await owner.post('/ai/brand-kit/from-website', { url: 'https://fashion.example.com' });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.body.engine, 'free');
    assert.equal(response.body.suggestion.companyName, 'Gowebkart Fashion');
    assert.match(response.body.suggestion.products, /Cotton kurtas/);
  });

  it('never reads an address on a private network', async () => {
    freeSources.readWebsite = realSources.readWebsite;
    try {
      const response = await owner.post('/ai/brand-kit/from-website', { url: 'http://127.0.0.1:4000/api/health' });
      assert.equal(response.status, 400);
      assert.match(response.body.error.message, /public internet/);
    } finally {
      freeSources.readWebsite = async () => ({ title: 'x', siteName: 'x', description: '', headings: [], keywords: [] });
    }
  });

  it('saves and reads back', async () => {
    const saved = await owner.put('/ai/brand-kit', BRAND_KIT);
    assert.equal(saved.status, 200, saved.text);
    assert.equal((await owner.get('/ai/brand-kit')).body.brandKit.location, 'Pune');
  });
});

describe('research', () => {
  it('the free agent researches news, competitors and festivals into post ideas', async () => {
    const started = await owner.post('/ai/research', {});
    assert.equal(started.status, 202, started.text);
    const report = await finishedReport(started.body.report.id);
    assert.equal(report.status, 'succeeded', report.error);
    assert.equal(report.engine, 'free');
    assert.equal(report.insights.competitors[0].name, 'FabIndia');
    assert.ok(report.ideas.length >= 5);
    assert.ok(report.ideas.some((idea) => idea.pillar === 'product'));
    assert.ok(report.sources.some((source) => source.url === 'https://news.example.com/1'));
  });

  it('uses the paid AI’s live web search once a key is set up', async () => {
    restores.push(
      replaceAiProviderForTests('anthropic', {
        async testKey() {},
        async generateText() {
          return '{"variants": ["AI written post #Diwali"]}';
        },
        async research({ prompt }) {
          assert.match(prompt, /Gowebkart Fashion/, 'the Brand Kit is in the prompt');
          assert.match(prompt, /FabIndia/, 'and the competitors');
          return {
            text: '{"summary":"Competitors post reels daily.","competitors":[{"name":"FabIndia","whatTheyDo":"Daily reels","opportunity":"Post more local content"}],"trends":["Festive shopping"],"ideas":[{"title":"Diwali kurta lookbook","angle":"Show 3 looks","format":"image"},{"title":"Saree care tips","angle":"Helpful tips","format":"text"}]}',
            sources: [{ title: 'FabIndia Instagram', url: 'https://instagram.com/fabindia' }],
          };
        },
      })
    );
    assert.equal((await owner.put('/platform/ai/keys/anthropic', { apiKey: 'sk-platform-key-ABCD' })).status, 200);
    const started = await owner.post('/ai/research', {});
    const report = await finishedReport(started.body.report.id);
    assert.equal(report.status, 'succeeded', report.error);
    assert.equal(report.engine, 'anthropic');
    assert.equal(report.ideas[0].title, 'Diwali kurta lookbook');
    assert.ok(report.sources.some((source) => source.url === 'https://instagram.com/fabindia'));
    assert.equal(report.credits, 20);
  });

  it('refuses to start a second research while one is running', async () => {
    await query("INSERT INTO ai_research_reports (engine, status) VALUES ('free', 'running')");
    assert.equal((await owner.post('/ai/research', {})).status, 400);
    await query("DELETE FROM ai_research_reports WHERE status = 'running'");
  });
});

describe('smart autopilot', () => {
  it('posts about the next fresh research idea, never the same one twice in a row', async () => {
    const created = await owner.post('/ai/autopilots', { name: 'Smart daily', platforms: ['facebook'], useBrandKit: true, contentType: 'text', postTime: '10:00' });
    assert.equal(created.status, 201, created.text);
    const id = created.body.autopilot.id;

    for (let run = 0; run < 2; run += 1) {
      await query("UPDATE ai_autopilots SET next_run_at = now() - interval '1 minute' WHERE id = $1", [id]);
      await runDueAutopilotsNow();
    }
    const report = (await owner.get('/ai/research')).body.reports[0];
    // Unless today is a festival, both runs used research ideas, one after the other.
    const today = new Date().toISOString().slice(0, 10);
    if (!upcomingEvents(new Date(), 0).some((event) => event.date === today)) assert.deepEqual(report.usedIdeas, [0, 1]);
    const autopilot = (await owner.get('/ai/autopilots')).body.autopilots.find((item) => item.id === id);
    assert.equal(autopilot.lastError, null);
    assert.equal((await owner.get(`/posts/${autopilot.lastPostId}`)).body.post.status, 'pendingApproval');
  });

  it('needs a brief unless it uses the Brand Kit', async () => {
    const response = await owner.post('/ai/autopilots', { name: 'No brief', platforms: ['facebook'] });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Brand Kit/);
  });
});

describe('weekly content plan', () => {
  it('lays out the slots in the organization’s time zone, from tomorrow', () => {
    const slots = planSlots({ days: 2, postsPerDay: 2, postTime: '10:00', timezone: 'Asia/Kolkata' }, new Date('2026-10-12T03:00:00Z'));
    assert.deepEqual(
      slots.map((slot) => slot.at.toISOString()),
      ['2026-10-13T04:30:00.000Z', '2026-10-13T07:30:00.000Z', '2026-10-14T04:30:00.000Z', '2026-10-14T07:30:00.000Z']
    );
  });

  it('prepares several days of posts at once, waiting in Approvals with their times', async () => {
    const queued = await owner.post('/ai/plans', { days: 3, platforms: ['facebook'], format: 'mix', postTime: '09:30' });
    assert.equal(queued.status, 202, queued.text);
    const plan = await finishedPlan(queued.body.plan.id);
    assert.equal(plan.status, 'succeeded', plan.error);
    assert.equal(plan.postIds.length, 3);

    const posts = await Promise.all(plan.postIds.map(async (id) => (await owner.get(`/posts/${id}`)).body.post));
    assert.ok(posts.every((post) => post.status === 'pendingApproval'));
    assert.ok(posts.every((post) => new Date(post.scheduledAt) > new Date()));
    assert.ok(posts.some((post) => post.media.length === 1), 'the mix includes picture posts');
  });

  it('an autopilot in weekly-plan mode prepares the week when it runs', async () => {
    const created = await owner.post('/ai/autopilots', { name: 'Weekly planner', platforms: ['facebook'], mode: 'weekly_plan', contentType: 'text', frequency: 'weekly', weekday: 1 });
    assert.equal(created.status, 201, created.text);
    await query("UPDATE ai_autopilots SET next_run_at = now() - interval '1 minute' WHERE id = $1", [created.body.autopilot.id]);
    await runDueAutopilotsNow();
    const plans = (await owner.get('/ai/plans')).body.plans.filter((plan) => plan.autopilotId === created.body.autopilot.id);
    assert.equal(plans.length, 1);
    const plan = await finishedPlan(plans[0].id);
    assert.equal(plan.status, 'succeeded', plan.error);
    assert.equal(plan.postIds.length, 7);
  });
});

describe('free agent pictures and Ollama', () => {
  it('makes a branded graphic card when no image AI is set up', async () => {
    const response = await owner.post('/ai/image', { prompt: 'Diwali kurta collection', textOnImage: 'Diwali Sale' });
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.engine, 'free');
    assert.equal(response.body.media.folder, 'AI Studio');
  });

  it('only the platform owner can point the app at an Ollama server', async () => {
    const response = await owner.put('/ai/keys/ollama', { apiKey: 'http://169.254.169.254' });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /platform owner/);
  });
});
