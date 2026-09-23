// Ad performance maths shared by the Ads pages and the report downloads.
// A "daily" array is [{ date: 'YYYY-MM-DD', spend, impressions, clicks, conversions }].

import { API_ENABLED } from '../config/runtime';
import { AD_DATA_END_DATE } from '../services/mock/adsMock';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today" for every ad analytics window (last 7/30/90 days, KPI totals, charts, exports). In real API
 * mode this is the actual current date — anything else would silently exclude real, already-synced
 * Meta data from every chart and report the further "today" drifts from a hardcoded value. Only in
 * demo mode does this fall back to the mock dataset's own frozen end date (`AD_DATA_END_DATE`), since
 * the hand-authored mock day-by-day rows stop there and using the real date would show a run of empty
 * trailing days in the demo.
 */
export function adsToday() {
  return API_ENABLED ? new Date().toISOString().slice(0, 10) : AD_DATA_END_DATE;
}

// "Results/conversions" is always stored as 0 (see backend/README.md's Ads section and
// migrations/017_ads_hierarchy.sql's own comment on ad_daily_stats.conversions) — no Meta Pixel or
// Lead Form is configured by this composer, so there is no real conversion count to show. Every place
// that would otherwise render that always-0 number shows this honest label instead, so it never reads
// as "this ad generated zero conversions" when the true meaning is "conversions aren't measured here".
export const CONVERSIONS_NOT_TRACKED = 'Not tracked';

export function emptyTotals() {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0, cpm: 0, costPerResult: 0 };
}

export function withRatios(sums) {
  const { spend, impressions, clicks, conversions } = sums;
  return {
    ...sums,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    costPerResult: conversions ? spend / conversions : 0,
  };
}

export function sumDaily(daily) {
  const sums = daily.reduce(
    (acc, day) => ({
      spend: acc.spend + day.spend,
      impressions: acc.impressions + day.impressions,
      clicks: acc.clicks + day.clicks,
      conversions: acc.conversions + day.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  return withRatios(sums);
}

// The last `days` days ending on `endDate`, or the `days` before that when `offset` is 1.
export function sliceRange(daily, days, endDate, offset = 0) {
  const end = new Date(`${endDate}T00:00:00Z`).getTime() - offset * days * DAY_MS;
  const start = end - (days - 1) * DAY_MS;
  return daily.filter((day) => {
    const time = new Date(`${day.date}T00:00:00Z`).getTime();
    return time >= start && time <= end;
  });
}

export function totalsForAds(ads, days, endDate, offset = 0) {
  return sumDaily(ads.flatMap((ad) => sliceRange(ad.daily, days, endDate, offset)));
}

// One point per calendar day in the range, summed across the given ads.
export function seriesForAds(ads, days, endDate) {
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, index) => {
    const time = end - (days - 1 - index) * DAY_MS;
    const iso = new Date(time).toISOString().slice(0, 10);
    const sums = ads
      .flatMap((ad) => ad.daily)
      .filter((day) => day.date === iso)
      .reduce(
        (acc, day) => ({
          spend: acc.spend + day.spend,
          impressions: acc.impressions + day.impressions,
          clicks: acc.clicks + day.clicks,
          conversions: acc.conversions + day.conversions,
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
      );
    return {
      date: iso,
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(time)),
      ...sums,
    };
  });
}

// Percentage change against the previous period of the same length; null when there is nothing to compare.
export function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// Spend per platform placement, split evenly across an ad's placements.
export function spendByPlatform(ads, days, endDate) {
  const spend = {};
  ads.forEach((ad) => {
    const total = sumDaily(sliceRange(ad.daily, days, endDate)).spend;
    ad.platforms.forEach((platform) => {
      spend[platform] = (spend[platform] || 0) + total / ad.platforms.length;
    });
  });
  return Object.entries(spend)
    .map(([platform, value]) => ({ platform, spend: value }))
    .filter((row) => row.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

// Rough planning numbers for the Create Ad screen — clearly labelled as estimates in the UI.
export function estimateResults({ totalBudget }) {
  const impressions = (totalBudget / 90) * 1000; // ~₹90 per 1,000 impressions
  return {
    impressionsLow: Math.round(impressions * 0.8),
    impressionsHigh: Math.round(impressions * 1.3),
    clicksLow: Math.round(impressions * 0.008),
    clicksHigh: Math.round(impressions * 0.02),
  };
}
