import { PLATFORM_KEYS } from '../../config/platforms';

export const analyticsSummaryMock = [
  { key: 'followers', label: 'Followers Growth', value: 6000, suffix: '', delta: 4.8, isPositive: true, icon: 'Users', accent: 'blue' },
  { key: 'engagement', label: 'Engagement', value: 42600, delta: 6.3, isPositive: true, icon: 'Heart', accent: 'rose' },
  { key: 'reach', label: 'Reach', value: 412000, delta: 9.1, isPositive: true, icon: 'Radar', accent: 'teal' },
  { key: 'impressions', label: 'Impressions', value: 812400, delta: -2.1, isPositive: false, icon: 'Eye', accent: 'amber' },
];

function buildSeries(days, base, variance) {
  return Array.from({ length: days }).map((_, index) => ({
    date: `Day ${index + 1}`,
    value: Math.round(base + Math.sin(index / 2) * variance + index * (variance / 4)),
  }));
}

export const analyticsSeriesMock = {
  '7d': buildSeries(7, 1000, 150),
  '30d': buildSeries(30, 1000, 220),
  '90d': buildSeries(90, 1000, 320),
};

export const platformPerformanceDetailMock = [
  { platform: PLATFORM_KEYS.FACEBOOK, followers: 18400, engagement: 5.2, reach: 98000, posts: 14 },
  { platform: PLATFORM_KEYS.INSTAGRAM, followers: 24800, engagement: 7.8, reach: 156000, posts: 20 },
  { platform: PLATFORM_KEYS.X, followers: 9600, engagement: 3.4, reach: 52000, posts: 18 },
  { platform: PLATFORM_KEYS.LINKEDIN, followers: 5300, engagement: 6.1, reach: 31000, posts: 9 },
  { platform: PLATFORM_KEYS.YOUTUBE, followers: 4200, engagement: 8.9, reach: 44000, posts: 4 },
  { platform: PLATFORM_KEYS.PINTEREST, followers: 0, engagement: 0, reach: 0, posts: 0 },
];

export const topContentMock = [
  { id: 'post-8', title: 'Thank you for 25,000 followers!', platform: PLATFORM_KEYS.INSTAGRAM, engagement: 4200, reach: 62000 },
  { id: 'post-2', title: 'Behind the scenes at Gowebkart', platform: PLATFORM_KEYS.INSTAGRAM, engagement: 3100, reach: 48000 },
  { id: 'post-1', title: 'Introducing our new dashboard', platform: PLATFORM_KEYS.LINKEDIN, engagement: 2600, reach: 39000 },
  { id: 'post-4', title: 'YouTube walkthrough of the new Composer', platform: PLATFORM_KEYS.YOUTUBE, engagement: 1900, reach: 21000 },
];
