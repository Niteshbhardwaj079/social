import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { fetchMetrics, METRICS_SUPPORTED_PLATFORMS } from '../providers/metrics.js';
import { getPublishingContext, listAccounts } from './socialAccountService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const snippet = (text, max = 60) => (text.length > max ? `${text.slice(0, max).trim()}...` : text);
// Posts older than this stop being refreshed — engagement on something published months ago has settled,
// and refreshing years of history forever would just spend rate-limit budget for no real benefit.
const METRICS_WINDOW_DAYS = 90;

/** Called wherever a platform's follower count is actually read (connect, Sync now, the background check). */
export async function recordFollowerSnapshot(platform, followers) {
  if (!Number.isFinite(followers)) return;
  await query('INSERT INTO account_metrics_history (platform, followers) VALUES ($1, $2)', [platform, followers]);
}

/**
 * The total followers across every platform, one point per day, for the last `days` days — built by
 * carrying each platform's last known count forward into days it wasn't re-checked (a 6-hourly check
 * does not mean a snapshot lands on every single day). Real numbers only: a platform with no snapshot
 * yet (never connected, or connected after the window started) contributes nothing until it has one.
 */
export async function getFollowerHistory(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  // Padded further back so the very first requested day can still carry forward a real prior reading
  // instead of showing a dip to zero on day one.
  const rows = (
    await query('SELECT platform, followers, recorded_at FROM account_metrics_history WHERE recorded_at >= $1 ORDER BY recorded_at ASC', [
      new Date(since.getTime() - 30 * DAY_MS),
    ])
  ).rows;

  const byPlatform = new Map();
  for (const row of rows) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform).push(row);
  }

  const series = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * DAY_MS);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    let total = 0;
    let any = false;
    for (const snapshots of byPlatform.values()) {
      const latest = [...snapshots].reverse().find((row) => new Date(row.recorded_at) <= dayEnd);
      if (latest) {
        total += latest.followers;
        any = true;
      }
    }
    series.push({ date: dayEnd.toISOString().slice(0, 10), followers: any ? total : 0 });
  }
  return series;
}

/** Today's total vs `daysAgo` days ago, as a percentage change (null if there is nothing to compare against). */
export async function getFollowerDelta(daysAgo) {
  const series = await getFollowerHistory(daysAgo + 1);
  const first = series[0]?.followers ?? 0;
  const last = series[series.length - 1]?.followers ?? 0;
  if (!first) return { current: last, delta: null };
  return { current: last, delta: Number((((last - first) / first) * 100).toFixed(1)) };
}

// ---------------------------------------------------------------- per-post engagement (real, background-refreshed)
let refreshingMetrics = false;

/**
 * One pass: for every published post on a platform this app can read metrics from (see providers/metrics.js),
 * whose numbers haven't been checked recently, fetches the real like/comment/share/view counts and saves
 * them. One broken post or platform never stops the rest — mirrors socialAccountService's recheckAll().
 */
export async function refreshPostMetrics(refreshIntervalMin) {
  if (refreshingMetrics) return;
  refreshingMetrics = true;
  try {
    const due = (
      await query(
        `SELECT post_id, platform, external_id FROM post_targets
          WHERE status = 'published' AND platform = ANY($1) AND external_id IS NOT NULL
            AND published_at > now() - ($2 || ' days')::interval
            AND (metrics_checked_at IS NULL OR metrics_checked_at < now() - ($3 || ' minutes')::interval)
          ORDER BY published_at DESC`,
        [METRICS_SUPPORTED_PLATFORMS, String(METRICS_WINDOW_DAYS), String(refreshIntervalMin)]
      )
    ).rows;

    for (const target of due) {
      try {
        const context = await getPublishingContext(target.platform);
        if (!context) {
          // The account is no longer connected — leave the last known numbers alone, just stop retrying it every pass.
          await query('UPDATE post_targets SET metrics_checked_at = now() WHERE post_id = $1 AND platform = $2', [target.post_id, target.platform]);
          continue;
        }
        const metrics = await fetchMetrics(target.platform, { credentials: context.credentials, externalId: target.external_id });
        await query(
          `UPDATE post_targets SET likes = $3, comments = $4, shares = $5, views = $6, metrics_checked_at = now()
            WHERE post_id = $1 AND platform = $2`,
          [target.post_id, target.platform, metrics.likes, metrics.comments, metrics.shares, metrics.views]
        );
      } catch (error) {
        logger.error('Could not refresh a post\'s metrics', error, { platform: target.platform, postId: target.post_id });
        await query('UPDATE post_targets SET metrics_checked_at = now() WHERE post_id = $1 AND platform = $2', [target.post_id, target.platform]).catch(() => {});
      }
    }
  } finally {
    refreshingMetrics = false;
  }
}

/** Runs refreshPostMetrics() on a timer. 0 = off (same convention as the other background jobs). */
export function startMetricsRefresher() {
  if (!config.analytics.refreshIntervalMs) return () => {};
  const timer = setInterval(() => {
    refreshPostMetrics(config.analytics.refreshIntervalMin).catch((error) => logger.error('Post metrics refresh pass failed', error));
  }, config.analytics.refreshIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

const percentChange = (current, previous) => (previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null);

/** One row per currently-connected platform: real post count, real summed engagement/reach for the window (or all-time when `days` is null). */
export async function platformPerformanceRollup(days) {
  const rows = (
    await query(
      `SELECT platform, COUNT(*) AS posts,
              COALESCE(SUM(likes), 0) + COALESCE(SUM(comments), 0) + COALESCE(SUM(shares), 0) AS engagement_total,
              COALESCE(SUM(views), 0) AS reach_total
         FROM post_targets
        WHERE status = 'published' AND ($1::text IS NULL OR published_at > now() - ($1 || ' days')::interval)
        GROUP BY platform`,
      [days === null || days === undefined ? null : String(days)]
    )
  ).rows;
  const byPlatform = new Map(rows.map((row) => [row.platform, row]));
  const accounts = await listAccounts();
  return accounts
    .filter((account) => account.status === 'connected')
    .map((account) => {
      const row = byPlatform.get(account.platform);
      const engagementTotal = row ? Number(row.engagement_total) : 0;
      return {
        platform: account.platform,
        followers: account.followers,
        engagement: account.followers > 0 ? Number(((engagementTotal / account.followers) * 100).toFixed(1)) : 0,
        reach: row ? Number(row.reach_total) : 0,
        posts: row ? Number(row.posts) : 0,
      };
    });
}

/** One point per day for the last `days` days: total (likes+comments+shares) of posts published that day, from their latest known counts — not a true minute-by-minute history (no platform gives us that), an honest day-of-publish attribution instead. */
async function engagementSeries(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = (
    await query(`SELECT published_at, likes, comments, shares FROM post_targets WHERE status = 'published' AND published_at >= $1`, [since])
  ).rows;
  const byDay = new Map();
  for (const row of rows) {
    const day = new Date(row.published_at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0));
  }
  const series = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * DAY_MS).toISOString().slice(0, 10);
    series.push({ date: day, value: byDay.get(day) ?? 0 });
  }
  return series;
}

/** One point per day for the last `days` days, split into likes/comments/shares (for the Dashboard's stacked chart) — same day-of-publish attribution as engagementSeries(), just not collapsed into one number. */
export async function engagementTrendBreakdown(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = (
    await query(`SELECT published_at, likes, comments, shares FROM post_targets WHERE status = 'published' AND published_at >= $1`, [since])
  ).rows;
  const byDay = new Map();
  for (const row of rows) {
    const day = new Date(row.published_at).toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { likes: 0, comments: 0, shares: 0 };
    bucket.likes += row.likes ?? 0;
    bucket.comments += row.comments ?? 0;
    bucket.shares += row.shares ?? 0;
    byDay.set(day, bucket);
  }
  const series = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * DAY_MS).toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { likes: 0, comments: 0, shares: 0 };
    series.push({ date: day, ...bucket });
  }
  return series;
}

/** This window's totals vs the equally-long window right before it (for the summary cards' % deltas). */
export async function windowedTotals(days) {
  const row = (
    await query(
      `SELECT
          COALESCE(SUM(likes) FILTER (WHERE published_at >= now() - ($1 || ' days')::interval), 0)
            + COALESCE(SUM(comments) FILTER (WHERE published_at >= now() - ($1 || ' days')::interval), 0)
            + COALESCE(SUM(shares) FILTER (WHERE published_at >= now() - ($1 || ' days')::interval), 0) AS engagement_current,
          COALESCE(SUM(likes) FILTER (WHERE published_at >= now() - ($2 || ' days')::interval AND published_at < now() - ($1 || ' days')::interval), 0)
            + COALESCE(SUM(comments) FILTER (WHERE published_at >= now() - ($2 || ' days')::interval AND published_at < now() - ($1 || ' days')::interval), 0)
            + COALESCE(SUM(shares) FILTER (WHERE published_at >= now() - ($2 || ' days')::interval AND published_at < now() - ($1 || ' days')::interval), 0) AS engagement_previous,
          COALESCE(SUM(views) FILTER (WHERE published_at >= now() - ($1 || ' days')::interval), 0) AS reach_current,
          COALESCE(SUM(views) FILTER (WHERE published_at >= now() - ($2 || ' days')::interval AND published_at < now() - ($1 || ' days')::interval), 0) AS reach_previous,
          COUNT(DISTINCT post_id) FILTER (WHERE published_at >= now() - ($1 || ' days')::interval) AS posts_current,
          COUNT(DISTINCT post_id) FILTER (WHERE published_at >= now() - ($2 || ' days')::interval AND published_at < now() - ($1 || ' days')::interval) AS posts_previous
        FROM post_targets WHERE status = 'published'`,
      [String(days), String(days * 2)]
    )
  ).rows[0];
  return {
    engagementCurrent: Number(row.engagement_current),
    engagementPrevious: Number(row.engagement_previous),
    reachCurrent: Number(row.reach_current),
    reachPrevious: Number(row.reach_previous),
    postsCurrent: Number(row.posts_current),
    postsPrevious: Number(row.posts_previous),
  };
}

/** Analytics Overview: real followers/engagement/reach/posts KPIs, a real engagement-over-time chart, real platform performance. */
export async function getAnalyticsOverview(days) {
  const [followerDelta, totals, series, platformPerformance] = await Promise.all([
    getFollowerDelta(days),
    windowedTotals(days),
    engagementSeries(days),
    platformPerformanceRollup(days),
  ]);
  return {
    summary: [
      { key: 'followers', label: 'Followers Growth', value: followerDelta.current, delta: followerDelta.delta, isPositive: (followerDelta.delta ?? 0) >= 0, icon: 'Users', accent: 'blue' },
      {
        key: 'engagement',
        label: 'Engagement',
        value: totals.engagementCurrent,
        delta: percentChange(totals.engagementCurrent, totals.engagementPrevious),
        isPositive: totals.engagementCurrent >= totals.engagementPrevious,
        icon: 'Heart',
        accent: 'rose',
      },
      {
        key: 'reach',
        label: 'Reach',
        value: totals.reachCurrent,
        delta: percentChange(totals.reachCurrent, totals.reachPrevious),
        isPositive: totals.reachCurrent >= totals.reachPrevious,
        icon: 'Radar',
        accent: 'teal',
      },
      // No non-redundant "impressions" number exists separate from reach (see providers/metrics.js's own
      // notes) — a real, distinct fourth metric (posts published) instead of showing the reach total again
      // under a different label.
      {
        key: 'postsPublished',
        label: 'Posts Published',
        value: totals.postsCurrent,
        delta: percentChange(totals.postsCurrent, totals.postsPrevious),
        isPositive: totals.postsCurrent >= totals.postsPrevious,
        icon: 'FileText',
        accent: 'amber',
      },
    ],
    series,
    platformPerformance,
  };
}

/** Content Analytics: the real top-performing posts (by total engagement) that have been checked at least once. */
export async function getContentAnalytics() {
  const [platformPerformance, topContentRows] = await Promise.all([
    platformPerformanceRollup(null),
    query(
      `SELECT pt.post_id, pt.platform, p.content,
              COALESCE(pt.likes, 0) + COALESCE(pt.comments, 0) + COALESCE(pt.shares, 0) AS engagement,
              COALESCE(pt.views, 0) AS reach
         FROM post_targets pt JOIN posts p ON p.id = pt.post_id
        WHERE pt.status = 'published' AND pt.metrics_checked_at IS NOT NULL
        ORDER BY engagement DESC, pt.published_at DESC LIMIT 10`
    ),
  ]);
  return {
    topContent: topContentRows.rows.map((row) => ({
      id: `${row.post_id}-${row.platform}`,
      title: snippet(row.content),
      platform: row.platform,
      engagement: Number(row.engagement),
      reach: Number(row.reach),
    })),
    platformPerformance,
  };
}
