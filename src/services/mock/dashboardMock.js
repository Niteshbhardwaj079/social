import { PLATFORM_KEYS } from '../../config/platforms';

export const dashboardKpisMock = [
  { key: 'followers', label: 'Total Followers', value: 67200, delta: 4.8, isPositive: true, icon: 'Users', accent: 'blue' },
  { key: 'engagement', label: 'Engagement Rate', value: 6.4, suffix: '%', delta: 1.2, isPositive: true, icon: 'Heart', accent: 'rose' },
  { key: 'posts', label: 'Posts This Month', value: 48, delta: -3.5, isPositive: false, icon: 'FileText', accent: 'purple' },
  { key: 'reach', label: 'Total Reach', value: 412000, delta: 9.1, isPositive: true, icon: 'Radar', accent: 'teal' },
];

export const followersGrowthMock = [
  { date: 'Sep 1', followers: 61200 },
  { date: 'Sep 3', followers: 61900 },
  { date: 'Sep 5', followers: 62500 },
  { date: 'Sep 7', followers: 63100 },
  { date: 'Sep 9', followers: 63800 },
  { date: 'Sep 11', followers: 64600 },
  { date: 'Sep 13', followers: 65200 },
  { date: 'Sep 15', followers: 66000 },
  { date: 'Sep 17', followers: 67200 },
];

// Follower history for the growth chart, one series per range. Built from a fixed
// end point (67,200 on Sep 18) so the last value always matches the Total Followers
// card. The real backend will return stored daily snapshots instead.
function buildFollowersSeries(points, stepDays) {
  const end = 67200;
  const endDate = new Date('2026-09-18T00:00:00Z');
  const perStep = 105 * stepDays; // roughly +105 followers a day
  return Array.from({ length: points }, (_, index) => {
    const stepsFromEnd = points - 1 - index;
    const date = new Date(endDate);
    date.setUTCDate(date.getUTCDate() - stepsFromEnd * stepDays);
    const wiggle = Math.round(Math.sin(index * 1.7) * 55 * stepDays);
    return {
      date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date),
      followers: index === points - 1 ? end : end - stepsFromEnd * perStep + wiggle,
    };
  });
}

export const followersGrowthByRangeMock = {
  '7d': buildFollowersSeries(7, 1),
  '30d': buildFollowersSeries(30, 1),
  '90d': buildFollowersSeries(13, 7),
};

export const engagementTrendMock = [
  { date: 'Sep 1', likes: 1200, comments: 340, shares: 180 },
  { date: 'Sep 3', likes: 1400, comments: 380, shares: 210 },
  { date: 'Sep 5', likes: 1100, comments: 300, shares: 160 },
  { date: 'Sep 7', likes: 1650, comments: 420, shares: 260 },
  { date: 'Sep 9', likes: 1800, comments: 450, shares: 290 },
  { date: 'Sep 11', likes: 1550, comments: 390, shares: 240 },
  { date: 'Sep 13', likes: 2000, comments: 510, shares: 320 },
  { date: 'Sep 15', likes: 1900, comments: 480, shares: 300 },
  { date: 'Sep 17', likes: 2200, comments: 560, shares: 350 },
];

export const postsPublishedMock = [
  { date: 'Week 1', posts: 9 },
  { date: 'Week 2', posts: 12 },
  { date: 'Week 3', posts: 8 },
  { date: 'Week 4', posts: 19 },
];

export const platformPerformanceMock = [
  { platform: PLATFORM_KEYS.FACEBOOK, followers: 18400, engagement: 5.2 },
  { platform: PLATFORM_KEYS.INSTAGRAM, followers: 24800, engagement: 7.8 },
  { platform: PLATFORM_KEYS.X, followers: 9600, engagement: 3.4 },
  { platform: PLATFORM_KEYS.LINKEDIN, followers: 5300, engagement: 6.1 },
  { platform: PLATFORM_KEYS.YOUTUBE, followers: 4200, engagement: 8.9 },
];

export const recentActivityMock = [
  { id: 'act-1', user: 'Nitesh Bhardwaj', action: 'created a campaign', target: 'Diwali Festive Offer', time: '2026-09-18T05:40:00Z' },
  { id: 'act-2', user: 'Priya Sharma', action: 'connected', target: 'Instagram Business', time: '2026-09-18T04:10:00Z' },
  { id: 'act-3', user: 'Rahul Verma', action: 'submitted a post for approval', target: '5 tips to grow your brand', time: '2026-09-17T14:20:00Z' },
  { id: 'act-4', user: 'Nitesh Bhardwaj', action: 'approved a post', target: 'YouTube walkthrough', time: '2026-09-17T11:05:00Z' },
  { id: 'act-5', user: 'Priya Sharma', action: 'scheduled a post', target: 'Weekend reminder', time: '2026-09-17T09:30:00Z' },
  { id: 'act-6', user: 'Rahul Verma', action: 'uploaded', target: 'composer-walkthrough.mp4', time: '2026-09-16T14:30:00Z' },
  { id: 'act-7', user: 'Nitesh Bhardwaj', action: 'invited', target: 'vikram@gowebkart.in', time: '2026-09-16T09:10:00Z' },
  { id: 'act-8', user: 'Priya Sharma', action: 'published', target: 'Behind the scenes at Gowebkart', time: '2026-09-15T13:00:00Z' },
  { id: 'act-9', user: 'Rahul Verma', action: 'rejected a post', target: 'Client spotlight: ABC Retail', time: '2026-09-14T12:00:00Z' },
  { id: 'act-10', user: 'Nitesh Bhardwaj', action: 'created a short link', target: 'Diwali Festive Offer', time: '2026-09-10T08:45:00Z' },
];

export const quickActionsMock = [
  { key: 'createPost', label: 'Create Post', icon: 'PenSquare', path: '/posts/create' },
  { key: 'connectAccount', label: 'Connect Account', icon: 'Share2', path: '/social-accounts/connect' },
  { key: 'createCampaign', label: 'Create Campaign', icon: 'Megaphone', path: '/campaigns' },
  { key: 'viewInbox', label: 'View Inbox', icon: 'Inbox', path: '/inbox' },
];
