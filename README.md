# Social — by Gowebkart Pvt Ltd

One dashboard for every social channel: publishing, ads, inbox, analytics, users & roles, system emails.
**SaaS (multi-tenant):** any company can sign up and gets its own **organization** — its own people, roles,
posts, accounts and settings — all in one shared database, kept apart by PostgreSQL row-level security
(see `backend/migrations/028_multi_tenancy.sql` and `backend/src/db/pool.js`). Organizations subscribe to a plan
(Free / Starter / Pro / Enterprise) under **Billing**; payments are manual for now (UPI / bank transfer +
transaction ID, approved by the platform owner, with a GST invoice issued automatically), built so a payment
gateway can be added later — see `backend/src/billing/README.md`. The very first person to sign up is the
**platform owner** and gets the **Platform** area (all organizations, payments, plans, invoices, settings).
No paid third-party APIs — organizations bring their own platform credentials, SMTP mailbox and storage.

**AI Studio & marketing agent:** a Brand Kit (filled from the business website), research (competitors,
news, festivals → post ideas), AI-written posts, images, slideshow and AI videos, weekly content plans and
daily autopilots that post by themselves. It runs on Claude / OpenAI / Gemini / self-hosted Ollama when a
key and credits allow, and otherwise on a built-in **free agent**, so every plan can use it — see
`backend/src/ai/README.md`. Owners edit plans freely; mid-period plan changes are prorated and invoices
are issued, voided and re-issued automatically.

**Phone to 8K:** on a phone it works like an app — a bottom bar, a "More" screen with every page, tables
that turn into cards (`data-table--stack`), and it can be installed to the home screen (`public/manifest.webmanifest`,
`public/sw.js`, which shows an offline page but caches nothing else). On big screens the whole UI scales from one
root font size (`src/styles/base/_root.scss`), so 4K and 8K look like Full HD, only sharper.

| Part | Where | Stack |
| --- | --- | --- |
| Web app | `src/` | React 19, Vite, Redux Toolkit, Bootstrap 5, 21 languages (Arabic is right-to-left) |
| API | `backend/` | Node.js, Express 5, PostgreSQL (`pg`), zod, bcrypt, JWT — [backend/README.md](backend/README.md) |

Right now the **API covers**: sign-in / sign-up / password reset / invitations / a "new sign-in" security email for an
unrecognised browser, users & roles, workspace and language settings, system emails (per language, actually sent, with
real uploaded images), **social accounts** (12 platforms, connected with the
client's own keys, verified against the real platform and stored encrypted), **posts** (draft, approval — including a
working Approvals page, schedule, publish to 7 text platforms with retry and a photo attached on all 7 — Instagram
included — plus video posts on TikTok and YouTube, and Pinterest Pins with a real board picker, with a "pick from the
Media Library" option in the composer so a file already uploaded doesn't need re-uploading), **media & storage** (a Media Library backed by this server's own disk or the client's own S3-compatible bucket /
Google Drive — Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, or any other S3-compatible service),
**notifications** (the bell icon: a post published/failed/needing approval, or a connected account losing access —
real, per-person, with an opt-out per type in Settings), and **campaigns** (group posts together, with real post
counts rolled up live), and
**content recycling** (auto-reshare a published post every 14/30/60/90 days by copying it into a fresh post and
publishing that, on a background timer), **analytics** (real per-post likes/comments/shares/views for Bluesky,
Mastodon, X, Facebook, Instagram and YouTube, kept fresh by a background job — Threads/LinkedIn/TikTok/Pinterest
are honestly not attempted yet, each for its own documented reason), a **Dashboard** built entirely from what
actually happened — real follower counts (tracked over time, so the growth chart is real too), real posts, real
engagement, and a real activity feed — an **Activity Logs** page backed by every real action the API
performs (who did what, when, from which device/IP), with real filters, CSV export and bulk delete — and an
**Inbox** of real comments on real published posts (Bluesky, Mastodon, Facebook, Instagram, YouTube), with
real replies sent back to the real platform, real assign-to-a-teammate and open/pending/closed workflow, and
a notification the moment a new one comes in — and **Ads**: real Meta (Facebook & Instagram) ad campaigns,
created and run through Meta's own Marketing API on the client's own ad account, discovered automatically
from the same Facebook connection already used for organic posting (no separate Ads login), with real
day-by-day spend, impressions, clicks and review status kept fresh in the background. Also a real **Link Shortener** — short
links on the client's own domain (no third-party service, so it never costs anything as traffic grows),
with real click tracking. Every module now has a real backend except the **Roles tab**'s custom permission
editing, which would touch the whole role system; the remaining gaps are a handful of specific, documented
platform limits — Google Business posting, engagement metrics for a few platforms, Inbox for X, four of the
six ad networks — each deferred for its own honest reason rather than guessed. Also fixed: three Settings
forms (Account, General, Security) that looked real but only showed a success toast and saved nothing —
they now call the real endpoints. Body-content translation (not just nav/titles) has started: the
**Dashboard** is now fully translated in all 21 languages, including RTL Arabic — the rest of the app's
pages are next, one at a time. See backend/README.md for the full detail.

## Run it on your machine

```bash
npm install && cd backend && npm install && cd ..

# Terminal 1 — a real PostgreSQL for development (nothing to install, lives in backend/.pgdata)
cd backend && npm run db:dev

# Terminal 2 — the API (creates the tables by itself)
cd backend && npm run dev

# Terminal 3 — the web app, talking to the API
#   set apiEnabled to true in public/config.js first
npm run dev
```

Open http://localhost:5173. The first person to register becomes the Super Admin; everyone else is invited.
Without the API (`apiEnabled: false`, the default in `public/config.js`) the app runs on demo data with no server.

## Host it anywhere

The API serves the built web app too, so **one process = the whole product** and there is nothing host-specific
in the code. All settings are environment variables (see `backend/.env.example`) and `public/config.js`
is read at run time — change it on the server, no rebuild.

- **Docker (any VPS / cloud):** `docker compose up -d` (app + PostgreSQL) — see `docker-compose.yml`.
- **Plain Node.js:** `npm run build`, then in `backend/`: set `DATABASE_URL`, `JWT_SECRET`, `APP_URL` and run `node src/server.js`
  behind nginx/Caddy for https. Any PostgreSQL 13+ works (self-hosted or managed); the database must be UTF8.
- **Front-end on a different host:** set `SERVE_FRONTEND=false` and `CORS_ORIGINS` on the API, and put the API address in
  `public/config.js` (`apiBaseUrl`).

## Useful commands

| | |
| --- | --- |
| `npm run build` | production build of the web app into `dist/` |
| `npm run check:i18n` | every language file has the same keys/placeholders as English |
| `cd backend && npm test` | API integration tests on a throw-away real PostgreSQL |
| `cd backend && npm run sync:emails` | copy the email wording from the language files into the API |

## Adding a language

Add one row to `src/i18n/languages.js`, copy `src/i18n/locales/en.js` to `<code>.js`, translate the values, then run
`npm run check:i18n` and `cd backend && npm run sync:emails`.
