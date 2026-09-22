import { listAccounts } from './socialAccountService.js';
import { listPosts } from './postService.js';
import { listActivity } from './auditService.js';
import { getFollowerHistory, getFollowerDelta } from './analyticsService.js';

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
 * Everything the Dashboard shows, from real data. `engagement`/`reach` are honestly 0 — that needs each
 * platform's own per-post insights API, a separate and much larger piece of work than this — never a
 * guessed or placeholder number standing in for a real one.
 */
export async function getDashboardOverview() {
  const [accounts, posts, activity, followersByRange, followerDelta] = await Promise.all([
    listAccounts(),
    listPosts(),
    listActivity({ limit: 10 }),
    Promise.all(Object.entries(RANGE_DAYS).map(async ([key, days]) => [key, await getFollowerHistory(days)])).then(Object.fromEntries),
    getFollowerDelta(7),
  ]);

  const connected = accounts.filter((account) => account.status === 'connected');
  const publishedThisMonth = posts.filter((post) => post.status === 'published' && new Date(post.updatedAt) >= startOfMonth()).length;
  const publishedLastMonth = posts.filter(
    (post) => post.status === 'published' && new Date(post.updatedAt) >= startOfPrevMonth() && new Date(post.updatedAt) < startOfMonth()
  ).length;

  return {
    kpis: [
      { key: 'followers', label: 'Total Followers', value: followerDelta.current, delta: followerDelta.delta, isPositive: (followerDelta.delta ?? 0) >= 0, icon: 'Users', accent: 'blue' },
      { key: 'engagement', label: 'Engagement Rate', value: 0, suffix: '%', delta: null, isPositive: true, icon: 'Heart', accent: 'rose' },
      {
        key: 'posts',
        label: 'Posts This Month',
        value: publishedThisMonth,
        delta: percentChange(publishedThisMonth, publishedLastMonth),
        isPositive: publishedThisMonth >= publishedLastMonth,
        icon: 'FileText',
        accent: 'purple',
      },
      { key: 'reach', label: 'Total Reach', value: 0, delta: null, isPositive: true, icon: 'Radar', accent: 'teal' },
    ],
    followersGrowth: followersByRange['30d'],
    followersGrowthByRange: followersByRange,
    engagementTrend: [],
    postsPublished: postsPerWeek(posts.filter((post) => post.status === 'published').map((post) => post.updatedAt)),
    platformPerformance: connected.map((account) => ({ platform: account.platform, followers: account.followers, engagement: 0 })),
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
