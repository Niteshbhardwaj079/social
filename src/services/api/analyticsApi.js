import { mockRequest } from '../mock/mockRequest';
import {
  analyticsSummaryMock,
  analyticsSeriesMock,
  platformPerformanceDetailMock,
  topContentMock,
} from '../mock/analyticsMock';

export function getAnalyticsOverview(rangePreset = '30d') {
  return mockRequest({
    summary: analyticsSummaryMock,
    series: analyticsSeriesMock[rangePreset] || analyticsSeriesMock['30d'],
    platformPerformance: platformPerformanceDetailMock,
  });
}

export function getContentAnalytics() {
  return mockRequest({
    topContent: topContentMock,
    platformPerformance: platformPerformanceDetailMock,
  });
}
