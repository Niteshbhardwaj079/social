import { mockRequest } from '../mock/mockRequest';
import {
  dashboardKpisMock,
  followersGrowthMock,
  followersGrowthByRangeMock,
  engagementTrendMock,
  postsPublishedMock,
  platformPerformanceMock,
  recentActivityMock,
  quickActionsMock,
} from '../mock/dashboardMock';
import postsMock from '../mock/postsMock';
import { API_ENABLED } from '../../config/runtime';
import { POST_STATUS } from '../../config/constants';
import axiosClient from './axiosClient';

// Not data, just navigation shortcuts — the same links regardless of where the rest of the page's data comes from.
export function getDashboardOverview() {
  if (API_ENABLED) return axiosClient.get('/dashboard').then((response) => ({ ...response.data, quickActions: quickActionsMock }));
  return mockRequest({
    kpis: dashboardKpisMock,
    followersGrowth: followersGrowthMock,
    followersGrowthByRange: followersGrowthByRangeMock,
    engagementTrend: engagementTrendMock,
    postsPublished: postsPublishedMock,
    platformPerformance: platformPerformanceMock,
    recentActivity: recentActivityMock,
    quickActions: quickActionsMock,
    recentPosts: postsMock.slice(0, 10),
    upcomingPosts: postsMock.filter((post) => post.status === POST_STATUS.SCHEDULED),
  });
}
