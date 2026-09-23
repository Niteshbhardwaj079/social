# Social — by Gowebkart Pvt Ltd

One dashboard for every social channel: publishing, ads, inbox, analytics, users & roles, system emails.
Single-tenant: each client gets their own copy (own subdomain, own database). No paid third-party APIs —
clients bring their own platform credentials, SMTP mailbox and storage.

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
engagement, and a real activity feed — and an **Activity Logs** page backed by every real action the API
performs (who did what, when, from which device/IP), with real filters, CSV export and bulk delete.
Ads and Inbox still show built-in demo data until their APIs are built — the same bring-your-own-key pattern as
everything above, just not built yet.

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
