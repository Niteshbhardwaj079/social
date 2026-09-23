import { downloadCsv, openPrintableReport } from './reportExport';
import { adsToday, CONVERSIONS_NOT_TRACKED, sliceRange, sumDaily, seriesForAds, totalsForAds } from './adMetrics';
import { formatCurrency, formatNumber, formatPercent } from './formatters';
import { AD_STATUS_LABELS, AD_OBJECTIVES } from '../config/adPlatforms';
import { getPlatformByKey } from '../config/platforms';

const today = () => new Date().toISOString().slice(0, 10);
const objectiveLabel = (key) => AD_OBJECTIVES.find((objective) => objective.key === key)?.label || key;
const platformNames = (ad) => ad.platforms.map((key) => getPlatformByKey(key)?.label || key).join(' + ');

// One row per ad, with the numbers for the chosen date range.
function adSummaryRows(ads, days) {
  return ads.map((ad) => ({ ad, totals: sumDaily(sliceRange(ad.daily, days, adsToday())) }));
}

const SUMMARY_COLUMNS = [
  { header: 'Ad', value: (row) => row.ad.name },
  { header: 'Status', value: (row) => AD_STATUS_LABELS[row.ad.status] || row.ad.status },
  { header: 'Objective', value: (row) => objectiveLabel(row.ad.objective) },
  { header: 'Platforms', value: (row) => platformNames(row.ad) },
  { header: 'Budget', value: (row) => `${formatCurrency(row.ad.budget)} ${row.ad.budgetType === 'daily' ? 'per day' : 'lifetime'}` },
  { header: 'Start', value: (row) => row.ad.startDate },
  { header: 'End', value: (row) => row.ad.endDate },
  { header: 'Spend (INR)', value: (row) => row.totals.spend.toFixed(2) },
  { header: 'Impressions', value: (row) => row.totals.impressions },
  { header: 'Clicks', value: (row) => row.totals.clicks },
  { header: 'CTR %', value: (row) => row.totals.ctr.toFixed(2) },
  { header: 'CPC (INR)', value: (row) => row.totals.cpc.toFixed(2) },
  { header: 'Results', value: () => CONVERSIONS_NOT_TRACKED },
];

export function downloadAdsSummaryCsv(ads, days) {
  downloadCsv(`ads-summary-last-${days}-days-${today()}.csv`, SUMMARY_COLUMNS, adSummaryRows(ads, days));
}

export function downloadAdsDailyCsv(ads, days) {
  const rows = ads.flatMap((ad) => sliceRange(ad.daily, days, adsToday()).map((day) => ({ ad, day })));
  rows.sort((a, b) => (a.day.date < b.day.date ? 1 : -1));
  downloadCsv(`ads-daily-performance-last-${days}-days-${today()}.csv`, [
    { header: 'Date', value: (row) => row.day.date },
    { header: 'Ad', value: (row) => row.ad.name },
    { header: 'Platforms', value: (row) => platformNames(row.ad) },
    { header: 'Spend (INR)', value: (row) => row.day.spend.toFixed(2) },
    { header: 'Impressions', value: (row) => row.day.impressions },
    { header: 'Clicks', value: (row) => row.day.clicks },
    { header: 'CTR %', value: (row) => (row.day.impressions ? ((row.day.clicks / row.day.impressions) * 100).toFixed(2) : '0.00') },
    { header: 'Results', value: () => CONVERSIONS_NOT_TRACKED },
  ], rows);
}

export function printAdsReport(ads, days, filterLabel = 'All ads') {
  const endDate = adsToday();
  const totals = totalsForAds(ads, days, endDate);
  const daily = seriesForAds(ads, days, endDate).filter((point) => point.spend || point.impressions);
  return openPrintableReport({
    title: 'Ads performance report',
    subtitle: `${filterLabel} · last ${days} days (to ${endDate})`,
    summary: [
      { label: 'Total spend', value: formatCurrency(totals.spend) },
      { label: 'Impressions', value: formatNumber(totals.impressions) },
      { label: 'Clicks', value: formatNumber(totals.clicks) },
      { label: 'CTR', value: formatPercent(totals.ctr) },
      { label: 'Avg. CPC', value: formatCurrency(totals.cpc) },
      { label: 'Results', value: CONVERSIONS_NOT_TRACKED },
    ],
    tables: [
      {
        title: 'Performance by ad',
        columns: [
          { header: 'Ad', value: (row) => row.ad.name },
          { header: 'Status', value: (row) => AD_STATUS_LABELS[row.ad.status] || row.ad.status },
          { header: 'Platforms', value: (row) => platformNames(row.ad) },
          { header: 'Spend', value: (row) => formatCurrency(row.totals.spend), align: 'right' },
          { header: 'Impressions', value: (row) => formatNumber(row.totals.impressions), align: 'right' },
          { header: 'Clicks', value: (row) => formatNumber(row.totals.clicks), align: 'right' },
          { header: 'CTR', value: (row) => formatPercent(row.totals.ctr), align: 'right' },
          { header: 'Results', value: () => CONVERSIONS_NOT_TRACKED, align: 'right' },
        ],
        rows: adSummaryRows(ads, days),
      },
      {
        title: 'Day by day',
        columns: [
          { header: 'Date', value: (row) => row.date },
          { header: 'Spend', value: (row) => formatCurrency(row.spend), align: 'right' },
          { header: 'Impressions', value: (row) => formatNumber(row.impressions), align: 'right' },
          { header: 'Clicks', value: (row) => formatNumber(row.clicks), align: 'right' },
          { header: 'Results', value: () => CONVERSIONS_NOT_TRACKED, align: 'right' },
        ],
        rows: daily.reverse(),
      },
    ],
  });
}
