import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { ProviderError } from '../providers/errors.js';
import { setMetaAdStatus } from '../providers/adsMeta.js';
import { facebookAdsCredentials } from './adsService.js';
import { canManageAccounts } from './permissions.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { recordActivity } from './auditService.js';
import { logger } from '../utils/logger.js';

/**
 * Phase 8: Automated Rules. Deliberately pause/resume ONLY — never touches an ad's budget, keeping the
 * same "Social has no role in ad spend" boundary this whole Ads rework has held since Phase 1 (a
 * decision the user made explicitly when asked, rather than assumed). A rule fires by calling the exact
 * same real Meta status-change adsMeta.js's setMetaAdStatus already makes for a manual pause/resume —
 * automation here means "trigger the existing real action automatically," not a new kind of action.
 *
 * Safety, built into the evaluation itself, not bolted on:
 *  - cooldown_hours: a rule can't act on the same ad again until its cooldown passes — the main
 *    anti-thrash guard (nothing flips an ad pause→resume→pause every evaluation pass).
 *  - A "pause" rule only ever considers currently-'active' ads; a "resume" rule only 'paused' ones —
 *    never a redundant no-op action, never touches a draft/rejected/completed ad.
 *  - ctr/cpc are treated as UNDEFINED (not 0) when their denominator (impressions/clicks) is zero, so a
 *    just-launched ad with no real data yet can never be paused by a "CTR too low" rule before it's had
 *    a chance to run — a rule silently skips an ad it cannot honestly evaluate, rather than acting on a
 *    fake zero (same "Not tracked, not 0" discipline as the Phase 7/9 hardening pass).
 *  - MAX_ACTIONS_PER_PASS bounds how many ads one rule can act on in a single evaluation pass — a
 *    misconfigured rule can only ever affect a bounded batch at once, never every ad in one shot; the
 *    rest are simply picked up on the next pass, not lost.
 *  - Every firing is a real Meta API call with the same honest failure handling as a manual bulk action
 *    (see adsService.js's Phase 7/9 hardening) — one ad's Meta failure never stops the rest of the pass,
 *    and never touches the Facebook connection's own status.
 */

const MAX_ACTIONS_PER_PASS = 20;

function evaluableMetricValue(metric, agg) {
  if (metric === 'ctr' && agg.impressions === 0) return null;
  if (metric === 'cpc' && agg.clicks === 0) return null;
  return agg[metric];
}

function comparatorMatches(comparator, value, threshold) {
  return comparator === 'gt' ? value > threshold : value < threshold;
}

function presentRule(row) {
  return {
    id: row.id,
    name: row.name,
    adAccountId: row.ad_account_id,
    adAccountName: row.ad_account_name,
    metric: row.metric,
    comparator: row.comparator,
    threshold: Number(row.threshold),
    windowDays: row.window_days,
    action: row.action,
    isActive: row.is_active,
    cooldownHours: row.cooldown_hours,
    createdAt: row.created_at,
    createdBy: row.creator_name || 'Deleted user',
    lastFiredAt: row.last_fired_at,
  };
}

const RULE_SELECT = `
  SELECT ar.*, acc.name AS ad_account_name, u.name AS creator_name,
    (SELECT MAX(fired_at) FROM ad_rule_runs WHERE ad_rule_id = ar.id) AS last_fired_at
  FROM ad_rules ar
  JOIN ad_accounts acc ON acc.id = ar.ad_account_id
  LEFT JOIN users u ON u.id = ar.created_by`;

export async function listRules() {
  const rows = (await query(`${RULE_SELECT} ORDER BY ar.created_at DESC`)).rows;
  return rows.map(presentRule);
}

async function getRuleRow(id) {
  return (await query(`${RULE_SELECT} WHERE ar.id = $1`, [id])).rows[0] ?? null;
}

export async function createRule({ actor, input, ip, userAgent }) {
  if (!canManageAccounts(actor)) throw forbidden('Your role cannot create automated rules.');
  const row = (
    await query(
      `INSERT INTO ad_rules (name, ad_account_id, metric, comparator, threshold, window_days, action, is_active, cooldown_hours, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [input.name, input.adAccountId, input.metric, input.comparator, input.threshold, input.windowDays, input.action, input.isActive, input.cooldownHours, actor.id]
    )
  ).rows[0];
  await recordActivity({ actorId: actor.id, action: 'ads.rule_created', entity: 'ad_rule', entityId: row.id, meta: { name: row.name }, ip, userAgent });
  return presentRule(await getRuleRow(row.id));
}

export async function updateRule({ id, actor, input, ip, userAgent }) {
  if (!canManageAccounts(actor)) throw forbidden('Your role cannot edit automated rules.');
  const existing = await getRuleRow(id);
  if (!existing) throw notFound('Rule not found');
  const row = (
    await query(
      `UPDATE ad_rules SET name=$2, ad_account_id=$3, metric=$4, comparator=$5, threshold=$6, window_days=$7, action=$8, is_active=$9, cooldown_hours=$10, updated_at=now()
       WHERE id = $1 RETURNING *`,
      [id, input.name, input.adAccountId, input.metric, input.comparator, input.threshold, input.windowDays, input.action, input.isActive, input.cooldownHours]
    )
  ).rows[0];
  await recordActivity({
    actorId: actor.id,
    action: 'ads.rule_updated',
    entity: 'ad_rule',
    entityId: row.id,
    meta: { name: row.name, isActive: row.is_active },
    ip,
    userAgent,
  });
  return presentRule(await getRuleRow(row.id));
}

export async function deleteRule({ id, actor, ip, userAgent }) {
  if (!canManageAccounts(actor)) throw forbidden('Your role cannot delete automated rules.');
  const existing = await getRuleRow(id);
  if (!existing) throw notFound('Rule not found');
  await query('DELETE FROM ad_rules WHERE id = $1', [id]);
  await recordActivity({ actorId: actor.id, action: 'ads.rule_deleted', entity: 'ad_rule', entityId: id, meta: { name: existing.name }, ip, userAgent });
}

async function metricsForAd(adId, windowDays) {
  const row = (
    await query(
      `SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks
         FROM ad_daily_stats WHERE ad_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval`,
      [adId, windowDays]
    )
  ).rows[0];
  const spend = Number(row.spend);
  const impressions = Number(row.impressions);
  const clicks = Number(row.clicks);
  return { spend, impressions, clicks, ctr: impressions ? (clicks / impressions) * 100 : 0, cpc: clicks ? spend / clicks : 0 };
}

async function lastFiredAt(ruleId, adId) {
  const row = (await query('SELECT MAX(fired_at) AS last FROM ad_rule_runs WHERE ad_rule_id = $1 AND ad_id = $2', [ruleId, adId])).rows[0];
  return row.last;
}

/** Real, launched ads under this ad account, currently in the status a rule of this action could act on. */
async function candidateAds(adAccountId, requiredStatus) {
  return (
    await query(
      `SELECT ads.id, ads.external_ad_id FROM ads
         JOIN ad_sets aset ON aset.id = ads.ad_set_id
         JOIN ad_campaigns camp ON camp.id = aset.ad_campaign_id
        WHERE camp.ad_account_id = $1 AND ads.status = $2 AND ads.external_ad_id IS NOT NULL`,
      [adAccountId, requiredStatus]
    )
  ).rows;
}

async function fireRule(rule, ad, credentials) {
  try {
    await setMetaAdStatus({ accessToken: credentials.adsAccessToken, externalAdId: ad.external_ad_id, status: rule.action === 'pause' ? 'PAUSED' : 'ACTIVE' });
  } catch (error) {
    // Same honest handling as a manual/bulk action — one ad's Meta failure never stops the rest of the
    // pass and never touches the Facebook connection's own status (that is a different, unrelated fact).
    logger.error('Automated rule failed to update an ad on Meta', error, { ruleId: rule.id, adId: ad.id });
    return false;
  }
  await query('UPDATE ads SET status = $2, updated_at = now() WHERE id = $1', [ad.id, rule.action === 'pause' ? 'paused' : 'active']);
  await query('INSERT INTO ad_rule_runs (ad_rule_id, ad_id, action) VALUES ($1,$2,$3)', [rule.id, ad.id, rule.action]);
  await recordActivity({
    actorId: null, // system-triggered, same actorId:null convention as the post scheduler and metrics refresh
    action: 'ads.rule_fired',
    entity: 'ad',
    entityId: ad.id,
    meta: { ruleId: rule.id, ruleName: rule.name, metric: rule.metric, comparator: rule.comparator, threshold: Number(rule.threshold), ruleAction: rule.action },
  });
  return true;
}

/** One rule against every real, eligible ad in its ad account. One broken ad never stops the rest. */
async function evaluateOneRule(rule, credentials) {
  const requiredStatus = rule.action === 'pause' ? 'active' : 'paused';
  const ads = await candidateAds(rule.ad_account_id, requiredStatus);
  let fired = 0;
  for (const ad of ads) {
    if (fired >= MAX_ACTIONS_PER_PASS) break;
    const last = await lastFiredAt(rule.id, ad.id);
    if (last && Date.now() - new Date(last).getTime() < rule.cooldown_hours * 60 * 60 * 1000) continue;

    const agg = await metricsForAd(ad.id, rule.window_days);
    const value = evaluableMetricValue(rule.metric, agg);
    if (value === null) continue; // not enough real data to honestly judge this ad yet — skip, don't guess

    if (comparatorMatches(rule.comparator, value, Number(rule.threshold))) {
      if (await fireRule(rule, ad, credentials)) fired += 1;
    }
  }
}

/** One pass over every active rule. Exported for the background job and for tests to call directly. */
export async function evaluateAdRules() {
  const status = await facebookAdsCredentials();
  if (!status.hasPermission) return; // no working Ads token — nothing this pass can do, same guard as refreshAdMetrics
  const credentials = status.credentials;
  const rules = (await query('SELECT * FROM ad_rules WHERE is_active = true')).rows;
  for (const rule of rules) {
    try {
      await evaluateOneRule(rule, credentials);
    } catch (error) {
      if (error instanceof ProviderError) {
        logger.error('Automated rule pass hit a Meta error', error, { ruleId: rule.id });
        continue;
      }
      throw error;
    }
  }
}

/** Same cadence as the metrics refresher (adsService.js's startAdsRefresher) — rules only ever act on
 * data that refresh just synced, so evaluating any more often than that would just re-check stale
 * numbers. A separate timer rather than chaining onto the refresher directly, to avoid a circular
 * import between adsService.js and this file. */
export function startAdRulesEvaluator() {
  if (!config.ads.refreshIntervalMs) return () => {};
  const timer = setInterval(() => {
    evaluateAdRules().catch((error) => logger.error('Automated ad rules pass failed', error));
  }, config.ads.refreshIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
