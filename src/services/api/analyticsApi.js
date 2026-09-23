import { mockRequest } from '../mock/mockRequest';
import {
  analyticsSummaryMock,
  analyticsSeriesMock,
  platformPerformanceDetailMock,
  topContentMock,
} from '../mock/analyticsMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

export function getAnalyticsOverview(rangePreset = '30d') {
  if (API_ENABLED) return axiosClient.get('/analytics/overview', { params: { range: rangePreset } }).then((response) => response.data);
  return mockRequest({
    summary: analyticsSummaryMock,
    series: analyticsSeriesMock[rangePreset] || analyticsSeriesMock['30d'],
    platformPerformance: platformPerformanceDetailMock,
  });
}

export function getContentAnalytics() {
  if (API_ENABLED) return axiosClient.get('/analytics/content').then((response) => response.data);
  return mockRequest({
    topContent: topContentMock,
    platformPerformance: platformPerformanceDetailMock,
  });
}
