import { listPosts } from './postService.js';
import { listActivity } from './auditService.js';
import { getFollowerHistory, getFollowerDelta, windowedTotals, engagementTrendBreakdown, platformPerformanceRollup } from './analyticsService.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfPrevMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth() - 1, 1);
const percentChange = (current, previous) => (previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A raw database id (a post, a recycling entry...) means nothing to a person reading this feed — better to
// say nothing than show it. A platform key (entity_id for a social account) reads fine as-is, so it stays.
const readableTarget = (entityId) => (entityId && !UUID_RE.test(entityId) ? entityId : '');

/** The last 4 completed weeks of published posts, oldest first — real counts, not a guess. */
function postsPerWeek(publishedAt) {
  const now = Date.now();
  const buckets = [0, 0, 0, 0];
  for (const at of publishedAt) {
    const weekIndex = 3 - Math.floor((now - new Date(at).getTime()) / WEEK_MS);
    if (weekIndex >= 0 && weekIndex <= 3) buckets[weekIndex] += 1;
  }
  return buckets.map((posts, index) => ({ date: `Week ${index + 1}`, posts }));
}

/**
 * Everything the Dashboard shows, from real data. Engagement/reach come from post_targets' real
 * likes/comments/shares/views, background-refreshed from each supported platform's own API
 * (see providers/metrics.js) — never a guessed or placeholder number standing in for a real one.
 */
export async function getDashboardOverview() {
  const [posts, activity, followersByRange, followerDelta, totals, engagementTrend, platformPerformance] = await Promise.all([
    listPosts(),
    listActivity({ limit: 10 }),
    Promise.all(Object.entries(RANGE_DAYS).map(async ([key, days]) => [key, await getFollowerHistory(days)])).then(Object.fromEntries),
    getFollowerDelta(7),
    windowedTotals(7),
    engagementTrendBreakdown(30),
    platformPerformanceRollup(30),
  ]);

  const publishedThisMonth = posts.filter((post) => post.status === 'published' && new Date(post.updatedAt) >= startOfMonth()).length;
  const publishedLastMonth = posts.filter(
    (post) => post.status === 'published' && new Date(post.updatedAt) >= startOfPrevMonth() && new Date(post.updatedAt) < startOfMonth()
  ).length;
  const engagementRate = followerDelta.current > 0 ? Number(((totals.engagementCurrent / followerDelta.current) * 100).toFixed(1)) : 0;
  const previousEngagementRate = followerDelta.current > 0 ? Number(((totals.engagementPrevious / followerDelta.current) * 100).toFixed(1)) : 0;

  return {
    kpis: [
      { key: 'followers', label: 'Total Followers', value: followerDelta.current, delta: followerDelta.delta, isPositive: (followerDelta.delta ?? 0) >= 0, icon: 'Users', accent: 'blue' },
      {
        key: 'engagement',
        label: 'Engagement Rate',
        value: engagementRate,
        suffix: '%',
        delta: percentChange(totals.engagementCurrent, totals.engagementPrevious),
        isPositive: engagementRate >= previousEngagementRate,
        icon: 'Heart',
        accent: 'rose',
      },
      {
        key: 'posts',
        label: 'Posts This Month',
        value: publishedThisMonth,
        delta: percentChange(publishedThisMonth, publishedLastMonth),
        isPositive: publishedThisMonth >= publishedLastMonth,
        icon: 'FileText',
        accent: 'purple',
      },
      {
        key: 'reach',
        label: 'Total Reach',
        value: totals.reachCurrent,
        delta: percentChange(totals.reachCurrent, totals.reachPrevious),
        isPositive: totals.reachCurrent >= totals.reachPrevious,
        icon: 'Radar',
        accent: 'teal',
      },
    ],
    followersGrowth: followersByRange['30d'],
    followersGrowthByRange: followersByRange,
    engagementTrend,
    postsPublished: postsPerWeek(posts.filter((post) => post.status === 'published').map((post) => post.updatedAt)),
    platformPerformance,
    recentActivity: activity.map((entry) => ({
      id: String(entry.id),
      user: entry.actor?.name || 'Someone',
      action: entry.action.replace('.', ' '),
      target: readableTarget(entry.entityId),
      time: entry.createdAt,
    })),
    recentPosts: posts.slice(0, 10),
    upcomingPosts: posts.filter((post) => post.status === 'scheduled'),
  };
}
