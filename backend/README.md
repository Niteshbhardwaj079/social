# Social API

Node.js 20.12+ · Express 5 · PostgreSQL 13+. Custom-built, no paid services: free open-source libraries only, and
everything that costs money elsewhere (mail server, database, storage) is something the client brings.

## Run

```bash
npm install
npm run db:dev      # development only: real PostgreSQL 17 from node_modules, data in .pgdata, writes .env
npm run dev         # API on http://localhost:4000 (restarts on file changes)
npm test            # 222 integration tests against a throw-away PostgreSQL (no real social platform is contacted)
```

In production you do not use `db:dev`: point `DATABASE_URL` at any PostgreSQL server
(`CREATE DATABASE social ENCODING 'UTF8' TEMPLATE template0;` — the API refuses to start on a non-UTF8 database, because
Hindi/Arabic/Chinese text would fail to save). Tables are created automatically on start (`AUTO_MIGRATE=true`).

## Configuration

Only environment variables — see [.env.example](.env.example). Required: `DATABASE_URL`, `JWT_SECRET`.
Set `APP_URL` to the public address (it goes into email links) and `TRUST_PROXY` when behind a reverse proxy.
Email uses **any SMTP server** you give it (`SMTP_*`); with none set, emails are recorded in `email_outbox` and logged.

## What it does

| Area | Endpoints |
| --- | --- |
| Setup & sign-in | `POST /api/auth/register` (first user only) · `login` · `refresh` · `logout` · `forgot-password` · `reset-password` · `accept-invite` · `GET/PATCH /me` · `change-password` · `GET /api/public/config` |
| Users & roles | `GET/POST /api/users` · `PATCH/DELETE /api/users/:id` · `POST /:id/resend-invite` (Super Admin / Admin) |
| Settings | `GET/PUT /api/settings/languages` · `GET/PUT /api/settings/workspace` |
| System emails | `GET /api/system-emails?lang=` · `PUT/DELETE /:id/translations/:lang` · `PATCH /:id` (on/off) · `POST /:id/test` |
| Social accounts | `GET /api/social-accounts` (everyone) · `POST /:platform/test` · `PUT /:platform` (connect) · `POST /:platform/recheck` · `DELETE /:platform` (Super Admin / Admin) |
| Posts | `GET/POST /api/posts` · `GET/PATCH/DELETE /:id` · `POST /bulk` · `POST /:id/retry` · `/:id/approve` · `/:id/reject` |
| Storage | `GET /api/storage` (everyone) · `POST /providers/:key/test` · `PUT /providers/:key` (connect) · `DELETE /provider` · `PUT /preferences` (Super Admin / Admin) |
| Media | `GET /api/media` · `GET /media/folders` · `POST /media` (upload) · `POST /media/link` · `PATCH/DELETE /media/:id` · `POST /media/bulk-delete` |
| Analytics | `GET /api/analytics/overview?range=7d\|30d\|90d` · `GET /api/analytics/content` |
| Operations | `GET /api/health` · `GET /api/activity-logs` · `DELETE /api/activity-logs` (Super Admin / Admin) |

Errors are always `{ "error": { "code", "message", "details?" } }`.

### Languages and emails

Every system email has its own copy **per language**; editing Hindi never changes Arabic. When something happens (a user
is invited, a password changes…) the email goes to each person **in their own language**, using an admin's edit of that
language if there is one. The built-in wording of all 13 emails in all 21 languages comes from the web app's language files:
`npm run sync:emails` copies it into `src/emails/defaults/` so this folder can be built and deployed on its own.

An email's **images** (a logo, a banner) are shared by every language of that email and are real uploads through the Media
Library (`POST/DELETE /api/system-emails/:id/images`) — the same storage, the same optional limit, no separate mock.

**"New sign-in detected"** (`auth-new-sign-in`) now actually sends: on every password sign-in, the browser's User-Agent is
read for "Chrome on Windows" / "Safari on iPhone" / etc. (a small hand-written reader, `src/utils/device.js` — no
dependency) and compared against every device that has ever signed in as that person (read from `auth_tokens`, so
registering or accepting an invite already counts as "known" — nothing extra to keep in sync). A browser never seen
before gets the email; the same one again does not. There is deliberately no geo-IP lookup (that would mean depending on
an always-on external service for every sign-in) — the `{{location}}` wording shows the IP address itself instead. A
real place name can be added later by changing only `notifyNewSignIn()` in `authService.js`.

### Social accounts (bring your own keys)

The client creates a developer app on each platform and pastes the keys/tokens into **Connect account**; Social never has
shared keys and charges nothing. Twelve platforms are supported (`src/providers/`): Facebook Pages, Instagram Business,
X, LinkedIn (profile and company), Google Business Profile, YouTube, Pinterest, TikTok, Mastodon, Threads and Bluesky.

- **Test connection** asks the platform for the account's name and follower count without saving anything.
  **Save & connect** asks again on the server (the browser's "test passed" is never trusted), and only then stores the keys.
- Keys are encrypted (AES-256-GCM, key from `ENCRYPTION_KEY`) before they reach the database and are **never returned by
  any endpoint**. Error messages coming back from a platform have the client's secrets blanked out.
- Every `PROVIDER_TIMEOUT_SEC` a platform gets to answer; a platform that is down never hangs the API. Redirects are not followed.
- The Mastodon server address is typed by the client, so it must be `https://` and must not point to a private network
  (this server's own network, cloud metadata addresses...).
- Every `SOCIAL_CHECK_INTERVAL_MIN` minutes (default 6 h) connected accounts are re-checked — **Sync now** does the same
  on demand, and both follow exactly the same rules (`recheckAccount` in `socialAccountService.js`):
  - The platform confirms the credentials → stays **connected**.
  - The platform refuses them → **token_expired**, **revoked**, or the honest, generic **auth_error** when its own
    wording doesn't clearly say which (most platforms' "invalid token" errors cover both expired and revoked without
    saying which — Google's `invalid_grant` and Meta's error 190 are both documented as exactly this — so nothing here
    guesses between them; it only trusts what the platform's own error text actually says).
  - The platform answers but the request cannot work at all (wrong id, no channel...), or this server's own encryption
    key changed so the saved credentials can no longer be read → **error**.
  - The platform is rate-limiting, having a bad day (5xx), or simply unreachable (network/timeout) → **status is left
    exactly as it was** — none of these ever change it, so an outage (the platform's or this server's) can never look
    like a lost connection.
  - **`disconnected` is set in exactly one place in the whole codebase** — `disconnectAccount()`, reachable only from
    `DELETE /api/social-accounts/:platform`, which only a signed-in Super Admin/Admin clicking **Disconnect** can call.
    No automatic path (a health check, Sync now, a retry) ever sets it or calls that function.
  - `last_checked_at` moves on every attempt; `last_success_at` only on one that actually succeeds; `last_error` always
    holds the platform's real message (secrets redacted), never a generic one.
  - A genuine problem (not a recovery, not staying broken the same way) notifies every Super Admin/Admin — worded for
    what actually happened (`tokenExpired` / `accountRevoked` / `accountNeedsAttention`), never "disconnected".
  - The background pass retries a broken account (`token_expired`/`revoked`/`auth_error`/`error`), not just a connected
    one — if the platform accepts the very same saved credentials again, it recovers to `connected` on its own,
    silently (an activity-log entry, no notification). A temporary hiccup mid-retry still changes nothing, and the
    same standing problem is never re-notified pass after pass — only an actual change in status notifies anyone.
    `disconnected` accounts are still never touched (their credentials are cleared, and the status itself is excluded
    from what the background pass retries), so nothing can ever auto-reconnect one behind the user's back.
  - `test/account-health-platforms.test.js` proves all of the above for every one of the 12 platforms individually,
    with each platform's realistically-shaped success/failure responses (not a generic stub) — connect, a network
    blip, a 5xx, a genuine credential refusal, disconnect, reconnect. It caught one real bug while being written:
    Facebook/Instagram's `/debug_token` check (`assertTokenBelongsToApp` in `meta.js`) used to treat *any* non-2xx
    response — including a plain 503 from Meta itself — as "these credentials are bad", which would have wrongly
    flagged a perfectly good account during a Meta outage. Fixed by routing it through the same classifier
    (`failure()`) every other check in that file already used.
- Adding a platform = one entry in `src/providers/index.js` and one verifier function.
- Publishing will read the keys through `getCredentials(platform)` in `services/socialAccountService.js`.

### Posts, scheduling and publishing

A post has a status (`draft`, `pendingApproval`, `rejected`, `scheduled`, `publishing`, `published`, `failed`) and a **result per
platform** (`post_targets`), because one post can go out on Bluesky and fail on X.

- **Who:** Super Admin / Admin / Editor can schedule, publish, approve, reject and retry. A Contributor can draft and submit for
  approval (their own posts only). An Analyst can only read.
- **Publish now** sends to every chosen platform (in parallel, each with a time limit) before answering, so the reply already says
  what worked. **Schedule** stores it; the scheduler (`SCHEDULER_INTERVAL_SEC`, default 30 s) sends it when its time comes.
- **Text posts on 7 platforms:** Bluesky (links and #hashtags are clickable), Mastodon, X, Threads, Facebook Pages, LinkedIn
  (profile and Page). **A photo can be attached on every one of them**: Instagram requires it (it is picture-only), Facebook
  uses its photos edge instead of a plain post, Threads/Instagram reference the file's public URL directly, Bluesky/Mastodon/X/
  LinkedIn each upload the actual bytes first (Bluesky's blob upload, Mastodon's media endpoint, X's classic v1.1 upload
  signed with OAuth 1.0a, LinkedIn's register-upload-then-PUT flow) and then reference it in the post.
- **Video posts on TikTok and YouTube:** TikTok pulls the file straight from its public URL (`PULL_FROM_URL`) — the storage
  domain must be verified under that TikTok app's developer settings first, and until the app is audited by TikTok every post
  is `SELF_ONLY` (visible only to the poster) — a TikTok rule, not a choice made here. YouTube uploads the bytes with a
  resumable session (the post's first line becomes the title, cut to 100 characters; the rest becomes the description).
  Both need a video attached — an image does not satisfy them.
- **Pinterest** needs an image (like Instagram) *and* a board, chosen per post — `GET /api/social-accounts/pinterest/boards`
  lists the account's real boards (empty, not an error, if it isn't connected) for the composer's own picker. The board is
  stored on `post_targets.board_id` (the only platform that needs one), carried through an edit that doesn't touch it, and
  copied along when a Pinterest post goes through Content Recycling. Creates a real Pin via `POST /v5/pins`
  (`media_source: {source_type: 'image_url', ...}` — no separate upload step, unlike Instagram's own container flow).
- **Google Business** needs its own local-post flow, which Google restricts to allowlisted partners rather than something
  every developer app can just enable — not built, to avoid shipping a guess at an API whose current access requirements
  aren't something this project could verify. Refused with a clear message; a draft is still fine.
- **Checked before sending:** the platform is connected, the right kind of file is attached where one is required, the text
  fits (Bluesky 300, X 280 counting links as 23, Threads 500, LinkedIn 3000...), the time is in the future.
- **Never twice:** each platform is claimed in the database before it is contacted, so a retry, the scheduler and a second server
  cannot send the same post twice (`FOR UPDATE SKIP LOCKED`); Mastodon also gets an idempotency key. If a platform times out the
  post is marked failed *with a note that it may have gone out* — Social does not retry ambiguous failures on its own.
- **Server was off:** a scheduled post more than `SCHEDULER_GRACE_MIN` minutes late is not sent, it is marked failed and waits for a
  person to press Retry. A crash halfway through publishing is detected after 10 minutes and reported, never guessed.
- **Retry** sends only the platforms that failed. A post that already reached some platform cannot be edited (it is public).
- Deleting a published post removes it from Social only, not from the platform.
- **Approvals** (`/approvals` in the web app) lists posts waiting for a decision or already turned down, reading and writing
  the same `pendingApproval`/`rejected` posts as the Posts page — there is no separate approval record.
- Not built yet: recurring posts, editing a published post on the platform, Google Business posting.

### Campaigns

Groups related posts together for planning (`GET/POST /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/:id`, Super
Admin/Admin/Editor to write, everyone signed in to read). `postsCount`/`publishedCount`/`scheduledCount`/`failedCount`
are computed at read time from real `posts.campaign_id` rows — never stored, never stale. `engagement`/`reach`/`clicks`
are honestly `0`: there is no analytics data source yet (see Analytics in "not built yet" below) to compute them from,
so nothing here invents a number. Deleting a campaign un-tags its posts (`ON DELETE SET NULL`) rather than touching
them. The composer's own "Campaign" dropdown (optional, "No campaign" by default) is how a post actually gets tagged —
including when opened via a campaign's own "Add Post" button, which hands off which campaign through the same
navigation-state pattern the Media Library's "Use in Post" uses.
- Not built yet: editing a campaign's own fields from the UI (the API supports it; only Delete is wired up so far), a
  "team" concept (the mock had one, but nothing ever rendered it, so it was dropped rather than carried over unused).

### Content recycling

Automatically re-shares a **published** post on a timer (`GET/POST /api/recycling`, `PATCH/DELETE /api/recycling/:id`,
`POST /api/recycling/bulk-update`, `POST /api/recycling/bulk-delete` — same Editor/Admin/Super Admin to write, everyone
to read as Campaigns). The interval is one of 14/30/60/90 days (`recycling_entries.interval_days`, a CHECK constraint —
the same four choices the web app offers, nothing else is accepted). One entry per post; deleting the source post
removes its entry (`ON DELETE CASCADE`) since there is nothing left to recycle.

- Every `RECYCLING_INTERVAL_MIN` minutes (default 30; intervals here are counted in days, so this needs nowhere near
  the post scheduler's 30-second granularity) a background pass finds every **active** entry whose `next_run_at` has
  passed, claims it and advances its schedule in one atomic `UPDATE ... FOR UPDATE SKIP LOCKED` (so two passes racing
  can never repost the same entry twice — same pattern as the post scheduler), then **copies the source post's
  current content, platforms and media into a brand-new post and publishes it** through the exact same pipeline a
  person hitting "Publish Now" would use. The original post is never touched or edited.
- The schedule advances whether the repost succeeds or fails on every platform — a repost that fails is visible the
  normal way (the new post's own status, and the usual `postFailed` notification to whoever created the original),
  not by retrying every pass forever. `totalReposts` counts attempts, not confirmed successes.
- Pausing an entry leaves its schedule untouched (resuming later picks up right where it left off); changing the
  interval re-bases `nextRunAt` from the moment you change it, not from whenever it last ran.

### Dashboard and follower history

`GET /api/dashboard` assembles the whole Dashboard from what has actually happened — nothing here is a placeholder:

- **Followers, per platform and total** come straight from `social_accounts.followers`. Every time it is actually read
  from a platform (connecting, "Sync now", the 6-hourly background check) a row is written to
  `account_metrics_history` (`platform`, `followers`, `recorded_at`) — a real, growing history, never backfilled or
  invented. The Followers Growth chart carries each platform's last known count forward across days it wasn't
  re-checked, and a platform with no snapshot yet (never connected) contributes nothing rather than a guessed
  baseline.
- **Posts Published, Recent Posts, Scheduled Posts** are the real `posts` table, unchanged from what the Posts page
  already shows.
- **Recent Activity** is the real `activity_logs` table (the same one Users & Roles' audit trail uses), lightly
  humanized (`post.published` → "post published") — a raw database id in `entity_id` (a post, a recycling entry) is
  left out rather than shown as-is, since it means nothing to a person reading the feed; a platform key (a social
  account's `entity_id`, e.g. `bluesky`) reads fine on its own so it stays.
- **Engagement Rate, Total Reach, and the Engagement Trend chart are honestly 0 / empty.** There is no per-post
  insights data source yet — that needs each platform's own insights API (Meta Insights, YouTube Analytics...), a
  separate and considerably larger piece of work than reusing what posting and account-health already track. Not
  invented, not left silently on old mock numbers either — the same "0, not a guess" rule as Campaigns.
- Not built yet: per-post engagement/reach (Analytics Overview and Content Analytics still show mock data for
  anything that needs it).

### Activity log

`GET /api/activity-logs` (Super Admin / Admin, up to 500 rows) and `DELETE /api/activity-logs` (bulk, by id) back the
real Activity Logs page — every action listed in the page's filters (`created`/`updated`/`deleted`/`connected`/
`published`/`login`/…) is a real, dot-namespaced action string (`post.published`, `campaign.created`, `social.token_expired`…)
written by `recordActivity()` from inside the service that actually did the thing, never a page-specific log call.

- **The device column is real, not fabricated**: every write that comes from an actual browser request threads the
  request's own `User-Agent` header alongside the IP address (the same `describeDevice()` reader — "Chrome on
  Windows" — that already powers the "new sign-in" security email); a background action (the recycling scheduler, an
  auto-publish at its scheduled time, the 6-hourly account health check) has no browser behind it, so its row's device
  is honestly absent rather than guessed.
- **The target/detail text is real, not a raw id**: wherever the acting code already has the human-readable value in
  scope at the moment it logs (a post's own content, a campaign's own name, a media file's own name) it is captured
  into `meta` right there — no extra query added anywhere purely for a nicer log line. A row for which that value
  genuinely was not in scope (a bulk toggle, a plain settings change) shows a generic sentence instead of an id.
- The web app maps each raw action string to the page's `actionType`/`section`/target/details shape
  (`src/config/activityLogActionMap.js`, frontend-only — the backend stores the plain action string and nothing else
  needs to know the page's own vocabulary); an action the map has not seen falls back to a generic row instead of
  crashing the page.
- `before`/`after` (a value's old vs. new state) are left blank: no service currently captures the previous value at
  the point it logs, and a real diff is not worth a speculative refactor across every "updated" action just to fill in
  a page column — the same "don't invent it" rule as everywhere else in this API.

### Analytics (real per-post engagement)

`GET /api/analytics/overview` (Followers/Engagement/Reach/Posts Published KPIs, an engagement-over-time
chart, platform performance) and `GET /api/analytics/content` (top posts by real engagement) are built
from `post_targets`' own `likes`/`comments`/`shares`/`views` columns, kept up to date by a background pass
(`ANALYTICS_REFRESH_INTERVAL_MIN`, default 2 hours) that re-fetches each published post's real numbers from
the platform it was posted to — see `src/providers/metrics.js`.

- **Supported today**: Bluesky, Mastodon, X, Facebook Pages, Instagram Business, YouTube — all read with the
  same credentials already used to publish, no extra permission beyond what posting itself needs.
- **Deliberately not attempted, and why** (same "don't guess a restricted or unverified API" rule as Google
  Business posting): **Threads** — its Insights API is new enough (2024) that this codebase does not have
  confident, verified knowledge of its stable metric names. **LinkedIn** — reading a post's own engagement
  back needs the Marketing Developer Platform partner tier, not the basic posting access this app uses; most
  real client apps could never get it. **TikTok** — an unaudited app's video is `SELF_ONLY` and the publish
  call only returns an async `publish_id`, never a fetchable video id. **Pinterest, Google Business** — not
  researched with enough confidence yet.
- **"Reach"/"views" is one column, not two**: YouTube's `viewCount` and X's `impression_count` both land in
  `post_targets.views` — different platforms, similar-enough concept ("how many times this was seen"), the
  same way `followers` already unifies very different platform concepts under one column. The mock page had
  a fourth "Impressions" KPI with no genuinely distinct real source — rather than show the Reach number
  again under a different label, the real fourth KPI is **Posts Published** (a real, different number).
- `before`/`after`-style history does not exist for these numbers — only the latest known count is kept, so
  the "Engagement Over Time" chart is built by attributing each post's current numbers to the day it was
  published, not a true minute-by-minute timeline (no platform hands this app one).

### Media & storage

`GET /api/storage` says where uploads go right now; the Media Library uses it before every upload, and it is safe for
anyone signed in to read (it never contains a secret — see below). Connecting or changing storage is Super Admin / Admin.

- **Server storage** (the default): files are saved to `MEDIA_LOCAL_DIR` on this server's own disk and served at `/media/*`.
  Needs no account and no setup.
- **External storage**, connected from Settings → Storage, same bring-your-own-account pattern as social accounts:
  Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, any other S3-compatible service, or Google Drive.
  - S3-compatible providers are signed with a hand-written **AWS Signature Version 4** (`src/storage/s3.js`) — no AWS SDK.
    Works with any of them from one function; the region is read from the form for Amazon S3, is always `auto` for R2,
    and is guessed from the endpoint hostname for the others (falls back to `us-east-1`).
  - Google Drive uploads use its resumable-free multipart upload, then shares the file "anyone with the link" so it can be
    used in a post or an email; see the caution in the web app about hot-linking many requests from Drive.
  - Keys are encrypted (`ENCRYPTION_KEY`, the same one social accounts use) and only shown back as a masked hint.
  - **Test connection** writes, reads back and deletes a small file. **Test upload** does the same *and* fetches the
    result back over its public link, catching a bucket that isn't actually public before a client finds out the hard way.
- **A storage limit** (optional, Settings → Storage) is enforced on upload — going over it is refused with a clear message,
  not silently allowed. Videos and "linked" images (added by URL, never copied) don't count against it.
- **Add an image that is already online** copies nothing — Social only remembers the link, after checking it is a plain
  http(s) address, not a private network, and really answers with an image.
- Deleting a file also removes it from any post that used it (the post itself is untouched) and is refused nothing — the
  web app just warns first when something still needs it.
- The post composer's "Media Library" button opens a picker (search + multi-select) over the same already-uploaded
  files instead of re-uploading them, and the Media Library's own "Use in Post" opens a fresh composer with that file
  already attached.
- Not built yet: video thumbnails/limits beyond a raw size, folders/tags management beyond what's set at upload time.

### Notifications

The bell icon in the top bar (`GET /api/notifications`) is backed by a real `notifications` table — one row per person,
never a workspace-wide broadcast. Nothing about it needs any external service; it is entirely this app noticing its own
events:

- **Post submitted for approval** notifies every Super Admin, Admin and Editor except whoever submitted it.
- **Post approved / rejected** notifies the person who created the post (the rejection reason is included).
- **Post published / failed** (from a direct publish, an approval, a schedule or a retry) notifies the creator.
- **A connected account develops a real problem** (the 6-hourly background check, or "Sync now" — never a manual
  disconnect, which is silent by design) notifies every Super Admin and Admin: `tokenExpired` / `accountRevoked` when
  the platform's own error text says so, `accountNeedsAttention` for anything else (an ambiguous refusal, or a
  non-auth error) — and only on the status actually changing, so a still-broken account is never renotified on every
  6-hourly pass. Recovering back to connected (the same background check, once the credentials work again) is
  logged but does not by itself re-notify.
- **Preferences** (Settings → Notifications) are a per-person opt-out stored as a small JSON map on the user row
  (`GET`/`PATCH /api/notifications/preferences`) — an absent key means "on", so nobody needs a backfill when a new
  notification type is added later.
- Not built yet: `newMessage`/`newComment` (there is no Inbox backend yet to raise them from), and clicking a
  notification does not deep-link to the post/account it is about — marking it read is all it does today.

### Security notes

- Passwords: bcrypt (cost 12), 8–72 bytes. Sign-in gives one message for "wrong password" and "no such email", takes the same time,
  and locks the account for 15 minutes after 5 failures. Per-IP rate limits on every auth endpoint.
- Access token: 15-minute JWT kept in memory by the web app. Refresh token: httpOnly cookie, single-use and rotating; replaying an
  old one ends every session of that person. Only SHA-256 hashes of refresh / reset / invite tokens are stored.
- Roles are checked on every request against the database, so disabling someone or changing a role takes effect immediately.
  Nobody can change their own role, and there is always at least one active Super Admin.
- Input is validated with zod; SQL is always parameterised; errors never leak stack traces (they carry a request id instead).
  Email HTML that contains scripts, iframes or event handlers is rejected, and the web app previews it in a sandboxed frame.
- Helmet security headers with a strict CSP. HSTS and secure cookies switch on with `COOKIE_SECURE=true` (https).

## Layout

```
src/config      environment → one validated config object
src/db          pool, migrations runner
migrations/     plain .sql files, applied in order
src/services    the actual logic (auth, users, settings, system emails, mailer, social accounts, posts, storage, media)
src/providers   one small verifier + publisher per social platform (+ safe HTTP helper, OAuth 1.0a signing, text limits)
src/storage     one small module per storage kind (S3-compatible via hand-written SigV4, Google Drive, local disk)
src/routes      thin HTTP layer: validate → call a service → respond
src/middleware  auth, validation, rate limits, error handler
src/emails      catalog, builder, built-in wording in 21 languages
test/           integration tests (node:test)
```

## Not built yet (next)

Ads and Inbox. Google Business posting, and per-post engagement for Threads/LinkedIn/TikTok/Pinterest, are
deliberately deferred rather than guessed — see the Social accounts and Analytics sections above for why each
one specifically. Every one of these follows the same bring-your-own-key pattern as everything already built
above; none of them are blocked on this project having its own platform keys, only on the integration work
itself. The web app keeps using demo data for those until their APIs exist.
