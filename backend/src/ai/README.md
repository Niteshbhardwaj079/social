# AI Studio & the marketing agent — how it works

## The big picture

Every AI job asks **`chooseEngine(kind, cost)`** (`src/services/aiAgentService.js`) first:

| Situation | Engine used |
| --- | --- |
| Plan includes AI **and** a key is set up **and** credits are left (or it is the organization's own key) | Paid AI — Claude / OpenAI / Gemini, or self-hosted Ollama |
| Anything else (Free plan, no key, credits used up) | The **free agent** (`src/ai/free/`) — templates, free sources, branded graphic cards |

So nothing ever stops: when credits run out, the free agent takes over and the response carries a
`notice` explaining why.

## Who may use it — four switches (`src/services/aiAccessService.js`)

1. Platform owner, everyone — Platform → AI → "AI Studio is switched on" (and "hide completely")
2. Platform owner, per organization — Organizations → Manage → AI Studio (on / off / hidden)
3. The plan — `feature_ai` (paid AI) and `feature_ai_video` (Sora / Veo video). Without them the free agent still works.
4. The role — `ai_use` (make content) and `ai_autopilot` (autopilots, weekly plans)

## Files

| What | Where |
| --- | --- |
| Paid providers (same shape each) | `providers/anthropic.js`, `openai.js`, `gemini.js`, `ollama.js`, list in `providers/index.js` |
| Timeouts + friendly errors for every HTTP call | `http.js` |
| Slideshow video (ffmpeg, free) | `slideshow.js` |
| Free agent: festivals calendar | `free/events.js` |
| Free agent: website reader + Google News (public addresses only) | `free/sources.js` |
| Free agent: post templates (en / hi / hinglish) | `free/templates.js` |
| Free agent: branded graphic card (ffmpeg) | `free/card.js` |
| Free agent: research / writing | `free/freeAgent.js` |
| Keys (own + platform), which provider does what | `src/services/aiKeyService.js` |
| Posts, images, slideshows, AI video, job worker | `src/services/aiService.js` |
| Brand Kit, research, engine choice | `src/services/aiAgentService.js` |
| Weekly content plans | `src/services/aiPlanService.js` |
| Autopilots (daily / weekly plan / smart mode) | `src/services/autopilotService.js` |
| API | `src/routes/ai.js` → `/api/ai/*`, owner: `src/routes/platform.js` → `/api/platform/ai*` |

## Background work (all per organization, one organization's error never stops the others)

- **AI job worker** (`startAiJobWorker`, every 20 s): renders queued slideshows, checks AI-video jobs,
  builds queued weekly plans, marks stuck jobs failed after 45 min.
- **Autopilot worker** (`startAutopilotWorker`, every 5 min): refreshes research when the Brand Kit asks
  for it (daily / weekly), then runs every due autopilot. The next run time is moved on *before* running,
  so a failing autopilot can never loop.

## Common tasks

- **A provider released a new model** → Platform → AI → Models. No code change.
- **Add a provider** → copy `providers/gemini.js`, keep the same functions, add it to `providers/index.js`.
- **Add a free post pattern** → add a line to the right pillar/language in `free/templates.js`.
- **Next year's festival dates** → add a line per festival to `LUNAR` in `free/events.js`
  (fixed-date days like Republic Day are automatic).
- **Credits per job** → `AI_CREDIT_COST` in `src/services/aiAccessService.js`; credits per plan → Platform → Plans.

## Safety notes

- Customer-given addresses (website in the Brand Kit) are fetched only if they resolve to the public
  internet (`assertPublicUrl`), with a timeout and a size cap.
- The Ollama address can only be set by the platform owner.
- Keys are stored encrypted and never sent back to the browser (only `••••abcd`).
- Tests never call a real AI or the internet: `replaceAiProviderForTests` and `freeSources` are swapped
  for fakes (see `test/ai.test.js`, `test/ai-agent.test.js`).
