import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { replaceAiProviderForTests } from '../src/ai/providers/index.js';
import { AiProviderError } from '../src/ai/http.js';
import { extractJson, maxCharsFor, runAiJobsNow } from '../src/services/aiService.js';
import { nextRunAt, runDueAutopilotsNow } from '../src/services/autopilotService.js';
import { PASSWORD, createClient, outboxFor, setupOwner, startServer, tokenFromEmail, waitFor } from './helpers.js';

// A real 1×1 PNG, so ffmpeg can actually render the slideshow in these tests.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let server;
let owner;
const restores = [];
const calls = { text: [], image: 0, videoChecks: 0 };

/** Fake providers: no test ever calls a real (paid) AI API. */
function installFakes() {
  restores.push(
    replaceAiProviderForTests('anthropic', {
      async testKey(apiKey) {
        if (apiKey.includes('bad')) throw new AiProviderError('Claude (Anthropic) rejected the API key.', { kind: 'auth' });
      },
      async generateText({ system, prompt }) {
        calls.text.push({ system, prompt });
        if (system.includes('slide')) {
          return 'Here you go:\n```json\n{"slides":[{"caption":"Big Diwali sale","imagePrompt":"lamps"},{"caption":"50% off today","imagePrompt":"gifts"}],"postText":"Diwali sale is live! #Diwali"}\n```';
        }
        return '{"variants": ["Diwali sale is live! Up to 50% off. #Diwali #Sale", "Lights, gifts and 50% off this Diwali! #Festive"]}';
      },
    }),
    replaceAiProviderForTests('openai', {
      async testKey() {},
      async generateImage() {
        calls.image += 1;
        return { buffer: PNG, contentType: 'image/png' };
      },
      async startVideo() {
        return { jobId: 'video_123' };
      },
      async checkVideo() {
        calls.videoChecks += 1;
        return calls.videoChecks === 1 ? { status: 'running' } : { status: 'succeeded', buffer: Buffer.from('fake-mp4'), contentType: 'video/mp4' };
      },
    })
  );
}

async function invite(name, email, role) {
  const created = await owner.post('/users', { name, email, role, language: 'en' });
  assert.equal(created.status, 201, created.text);
  const mail = await waitFor(async () => (await outboxFor(email)).find((row) => row.event_key === 'users.invited'));
  const client = createClient(server.baseUrl);
  const accepted = await client.post('/auth/accept-invite', { token: tokenFromEmail(mail.html, 'accept-invite'), password: PASSWORD });
  client.accessToken = accepted.body.accessToken;
  return client;
}

before(async () => {
  server = await startServer();
  ({ client: owner } = await setupOwner(server.baseUrl));
  installFakes();
});
after(async () => {
  restores.forEach((restore) => restore());
  await server.close();
});

describe('helpers', () => {
  it('finds the JSON inside a chatty answer', () => {
    assert.deepEqual(extractJson('Sure! ```json\n{"a": 1}\n``` hope it helps'), { a: 1 });
    assert.equal(extractJson('no json here'), null);
  });

  it('keeps posts within the strictest platform limit', () => {
    assert.equal(maxCharsFor(['facebook', 'x']), 280);
    assert.equal(maxCharsFor([]), 2200);
  });

  it('schedules autopilots in the organization’s own time zone', () => {
    const after = new Date('2026-10-12T03:00:00Z'); // 08:30 in India
    assert.equal(nextRunAt({ frequency: 'daily', postTime: '10:00', weekday: 1, timezone: 'Asia/Kolkata' }, after).toISOString(), '2026-10-12T04:30:00.000Z');
    // Already past 10:00 IST → tomorrow.
    assert.equal(nextRunAt({ frequency: 'daily', postTime: '08:00', weekday: 1, timezone: 'Asia/Kolkata' }, after).toISOString(), '2026-10-13T02:30:00.000Z');
    // 2026-10-12 is a Monday; weekly on Friday (5).
    assert.equal(nextRunAt({ frequency: 'weekly', postTime: '10:00', weekday: 5, timezone: 'Asia/Kolkata' }, after).toISOString(), '2026-10-16T04:30:00.000Z');
    // Weekdays: from Saturday morning → Monday.
    assert.equal(nextRunAt({ frequency: 'weekdays', postTime: '10:00', weekday: 1, timezone: 'Asia/Kolkata' }, new Date('2026-10-17T00:00:00Z')).toISOString(), '2026-10-19T04:30:00.000Z');
  });
});

describe('keys and access', () => {
  it('without any AI key, the free agent writes the post instead', async () => {
    const access = await owner.get('/ai/access');
    assert.equal(access.body.available, true);
    assert.equal(access.body.visible, true);
    const response = await owner.post('/ai/text', { brief: 'Diwali sale, 50% off everything' });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.body.engine, 'free');
    assert.equal(response.body.variants.length, 3);
    assert.match(response.body.variants[0], /Diwali sale, 50% off everything/, 'the brief stays in the person’s own words');
  });

  it('checks a key with the provider before saving it, and never returns it', async () => {
    const bad = await owner.put('/ai/keys/anthropic', { apiKey: 'sk-bad-key-1234567890' });
    assert.equal(bad.status, 400);
    const good = await owner.put('/platform/ai/keys/anthropic', { apiKey: 'sk-platform-key-ABCD' });
    assert.equal(good.status, 200);
    assert.equal(good.body.keys[0].hint, '••••ABCD');
    assert.ok(!JSON.stringify(good.body).includes('sk-platform-key'));
    assert.equal((await owner.put('/platform/ai/keys/openai', { apiKey: 'sk-platform-openai-1234' })).status, 200);
  });

  it('a role without the AI permission cannot use it', async () => {
    const analyst = await invite('Ana Lyst', 'analyst@example.com', 'analyst');
    const access = await analyst.get('/ai/access');
    assert.equal(access.body.available, false);
    assert.match(access.body.reason, /role/);
    assert.equal((await analyst.post('/ai/text', { brief: 'Anything at all here' })).status, 403);
  });
});

describe('making content', () => {
  it('writes post versions in the brand voice and records the credits', async () => {
    await owner.put('/ai/settings', { brandVoice: 'Warm, Hinglish, a few emojis' });
    const response = await owner.post('/ai/text', { brief: 'Diwali sale, 50% off everything', platforms: ['x', 'facebook'], language: 'hinglish' });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.body.variants.length, 2);
    assert.equal(response.body.maxChars, 280);
    const sent = calls.text.at(-1).system;
    assert.match(sent, /Warm, Hinglish, a few emojis/);
    assert.match(sent, /at most 280 characters/);
    assert.match(sent, /Hinglish/);

    const history = await owner.get('/ai/generations');
    assert.equal(history.body.generations[0].kind, 'text');
    assert.equal(history.body.generations[0].usesPlatformKey, true);
    assert.equal(history.body.generations[0].credits, 1);
  });

  it('makes an image and saves it to the Media Library', async () => {
    const response = await owner.post('/ai/image', { prompt: 'Diwali lamps on a table', aspect: 'square' });
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.media.type, 'image');
    assert.equal(response.body.media.folder, 'AI Studio');
  });

  it('renders a real slideshow video in the background', async () => {
    const queued = await owner.post('/ai/slideshow', { brief: 'Diwali sale, 50% off everything', slideCount: 2 });
    assert.equal(queued.status, 202, queued.text);
    await runAiJobsNow();
    const done = await waitFor(async () => {
      const row = (await owner.get(`/ai/generations/${queued.body.generation.id}`)).body.generation;
      return row.status === 'succeeded' || row.status === 'failed' ? row : null;
    }, { timeout: 60_000, interval: 500 });
    assert.equal(done.status, 'succeeded', done.error);
    assert.ok(done.mediaId);
    assert.deepEqual(done.result.captions, ['Big Diwali sale', '50% off today']);
    assert.equal(done.result.postText, 'Diwali sale is live! #Diwali');
  });

  it('starts a paid AI video and saves it once the provider has finished', async () => {
    const started = await owner.post('/ai/video', { prompt: 'Diwali lamps glowing at night', seconds: 4 });
    assert.equal(started.status, 202, started.text);
    await runAiJobsNow(); // provider still working
    assert.equal((await owner.get(`/ai/generations/${started.body.generation.id}`)).body.generation.status, 'running');
    await runAiJobsNow(); // provider done
    const finished = (await owner.get(`/ai/generations/${started.body.generation.id}`)).body.generation;
    assert.equal(finished.status, 'succeeded');
    assert.ok(finished.mediaId);
  });
});

describe('autopilot', () => {
  it('writes and submits a post for approval when it is due', async () => {
    const created = await owner.post('/ai/autopilots', {
      name: 'Daily tips',
      brief: 'A daily tip about saving money during festivals',
      platforms: ['facebook'],
      contentType: 'image',
      postTime: '10:00',
      timezone: 'Asia/Kolkata',
    });
    assert.equal(created.status, 201, created.text);
    assert.ok(new Date(created.body.autopilot.nextRunAt) > new Date());

    await query("UPDATE ai_autopilots SET next_run_at = now() - interval '1 minute' WHERE id = $1", [created.body.autopilot.id]);
    await runDueAutopilotsNow();

    const autopilot = (await owner.get('/ai/autopilots')).body.autopilots.find((item) => item.id === created.body.autopilot.id);
    assert.equal(autopilot.lastError, null);
    assert.ok(autopilot.lastPostId);
    assert.ok(new Date(autopilot.nextRunAt) > new Date(), 'the next run moved on');
    const post = (await owner.get(`/posts/${autopilot.lastPostId}`)).body.post;
    assert.equal(post.status, 'pendingApproval');
    assert.match(post.content, /Diwali/);
    assert.equal(post.media.length, 1);
  });

  it('can be paused, edited and deleted', async () => {
    const created = await owner.post('/ai/autopilots', { name: 'Weekly', brief: 'Weekly product highlight post', platforms: ['facebook'], frequency: 'weekly', weekday: 5 });
    const paused = await owner.patch(`/ai/autopilots/${created.body.autopilot.id}`, { isActive: false });
    assert.equal(paused.body.autopilot.isActive, false);
    assert.equal(paused.body.autopilot.nextRunAt, null);
    assert.equal(paused.body.autopilot.frequency, 'weekly', 'a PATCH never resets fields it did not send');
    assert.equal((await owner.delete(`/ai/autopilots/${created.body.autopilot.id}`)).status, 200);
  });
});

describe('the platform owner’s switches and credits', () => {
  it('when the monthly credits run out, the free agent takes over instead of failing', async () => {
    const ownOrg = (await owner.get('/auth/me')).body.user.organization.id;
    await owner.patch('/platform/plans/free', { aiCreditsPerMonth: 5 });
    await owner.post(`/platform/organizations/${ownOrg}/plan`, { planId: 'free' });
    const imagesBefore = calls.image;
    const response = await owner.post('/ai/image', { prompt: 'One more Diwali image please' });
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.engine, 'free', 'a branded graphic card, made for free');
    assert.match(response.body.notice, /credits are used up/);
    assert.equal(calls.image, imagesBefore, 'the paid image API was not called');
    await owner.post(`/platform/organizations/${ownOrg}/plan`, { planId: 'enterprise' });
  });

  it('own keys never use credits', async () => {
    assert.equal((await owner.put('/ai/keys/anthropic', { apiKey: 'sk-own-key-WXYZ1234' })).status, 200);
    await owner.post('/ai/text', { brief: 'Diwali sale, 50% off everything' });
    const latest = (await owner.get('/ai/generations')).body.generations[0];
    assert.equal(latest.usesPlatformKey, false);
    assert.equal(latest.credits, 0);
  });

  it('hides AI for one organization', async () => {
    const ownOrg = (await owner.get('/auth/me')).body.user.organization.id;
    assert.equal((await owner.patch(`/platform/organizations/${ownOrg}/ai`, { aiAccess: 'hidden' })).status, 200);
    const access = await owner.get('/ai/access');
    assert.equal(access.body.visible, false);
    assert.equal(access.body.available, false);
    assert.equal((await owner.post('/ai/text', { brief: 'Diwali sale, 50% off everything' })).status, 403);
    await owner.patch(`/platform/organizations/${ownOrg}/ai`, { aiAccess: 'enabled' });
  });

  it('switches AI off for everyone, shown locked unless the owner chooses to hide it', async () => {
    await owner.put('/platform/settings', { aiEnabled: false });
    const locked = (await owner.get('/ai/access')).body;
    assert.equal(locked.visible, true);
    assert.equal(locked.available, false);
    await owner.put('/platform/settings', { aiHiddenWhenDisabled: true });
    assert.equal((await owner.get('/ai/access')).body.visible, false);
    await owner.put('/platform/settings', { aiEnabled: true, aiHiddenWhenDisabled: false });
    assert.equal((await owner.get('/ai/access')).body.available, true);
  });

  it('keeps model choices editable without losing the others', async () => {
    await owner.put('/platform/settings', { aiModels: { openai: { text: 'gpt-next' } } });
    const models = (await owner.get('/platform/ai')).body.settings.aiModels;
    assert.equal(models.openai.text, 'gpt-next');
    assert.equal(models.openai.image, 'gpt-image-1');
    assert.equal(models.anthropic.text, 'claude-opus-5-5');
  });
});
