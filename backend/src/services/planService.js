import { query, runAsSystem } from '../db/pool.js';
import { badRequest, conflict, notFound, planLimit } from '../utils/httpError.js';

/**
 * Plans and what they allow. Two jobs:
 *   1. Read/edit the plans themselves (Free / Starter / Pro / Enterprise — table `plans`).
 *   2. Answer "may the CURRENT organization do this?" — limits (how many) and features (which modules).
 *
 * An organization whose paid period has ended simply falls back to the Free plan: nothing is
 * deleted, they just cannot add more than Free allows until they renew.
 */

export const FREE_PLAN_ID = 'free';

/** Modules a plan can switch on or off. The key is what routes pass to requireFeature(). */
export const FEATURES = {
  analytics: { label: 'Analytics', column: 'feature_analytics' },
  inbox: { label: 'Inbox', column: 'feature_inbox' },
  recycling: { label: 'Content recycling', column: 'feature_recycling' },
  links: { label: 'Link shortener', column: 'feature_links' },
  ads: { label: 'Ads', column: 'feature_ads' },
  ai: { label: 'AI Studio', column: 'feature_ai' },
  aiVideo: { label: 'AI video', column: 'feature_ai_video' },
};

/** Countable limits. `label` is used in the "upgrade your plan" message. */
export const LIMITS = {
  socialAccounts: { column: 'max_social_accounts', label: 'connected social accounts' },
  users: { column: 'max_users', label: 'team members' },
  postsPerMonth: { column: 'max_posts_per_month', label: 'posts per month' },
  storageMb: { column: 'max_storage_mb', label: 'MB of storage' },
};

const nullableNumber = (value) => (value === null || value === undefined ? null : Number(value));

export function presentPlan(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceMonthly: Number(row.price_monthly),
    priceYearly: Number(row.price_yearly),
    currency: row.currency,
    limits: Object.fromEntries(Object.entries(LIMITS).map(([key, { column }]) => [key, nullableNumber(row[column])])),
    features: Object.fromEntries(Object.entries(FEATURES).map(([key, { column }]) => [key, row[column]])),
    // AI uses with the platform's own keys, per month (null = unlimited). An organization's own keys never use credits.
    aiCreditsPerMonth: nullableNumber(row.ai_credits_per_month),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

// ---------------------------------------------------------------- plans
export async function listPlans({ includeHidden = false } = {}) {
  const result = await query(`SELECT * FROM plans ${includeHidden ? '' : 'WHERE is_active'} ORDER BY sort_order, id`);
  return result.rows.map(presentPlan);
}

export async function getPlanRow(planId) {
  const row = (await query('SELECT * FROM plans WHERE id = $1', [planId])).rows[0];
  if (!row) throw notFound('No such plan');
  return row;
}

/** Platform owner edits a plan. `changes` is already validated (routes/platform.js). */
export async function updatePlan(planId, changes) {
  const current = presentPlan(await getPlanRow(planId));
  const next = {
    ...current,
    ...changes,
    limits: { ...current.limits, ...changes.limits },
    features: { ...current.features, ...changes.features },
  };
  const result = await query(
    `UPDATE plans SET name = $2, description = $3, price_monthly = $4, price_yearly = $5, currency = $6,
            max_social_accounts = $7, max_users = $8, max_posts_per_month = $9, max_storage_mb = $10,
            feature_analytics = $11, feature_inbox = $12, feature_recycling = $13, feature_links = $14, feature_ads = $15,
            is_active = $16, sort_order = $17, feature_ai = $18, feature_ai_video = $19, ai_credits_per_month = $20, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [
      planId, next.name, next.description, next.priceMonthly, next.priceYearly, next.currency,
      next.limits.socialAccounts, next.limits.users, next.limits.postsPerMonth, next.limits.storageMb,
      next.features.analytics, next.features.inbox, next.features.recycling, next.features.links, next.features.ads,
      // The Free plan is everyone's fallback, so it can never be hidden.
      planId === FREE_PLAN_ID ? true : next.isActive, next.sortOrder,
      next.features.ai, next.features.aiVideo, next.aiCreditsPerMonth,
    ]
  );
  return presentPlan(result.rows[0]);
}

// ---------------------------------------------------------------- the current organization's plan
/** True while a subscription still gives access to its plan. */
export function isSubscriptionLive(subscription) {
  if (!subscription || subscription.status === 'cancelled') return false;
  return !subscription.current_period_end || new Date(subscription.current_period_end) > new Date();
}

/** The current organization's subscription row (row-level security picks the organization). */
export async function getSubscriptionRow() {
  return (await query('SELECT * FROM subscriptions')).rows[0] ?? null;
}

/** The plan the current organization may use right now: its own while live, otherwise Free. */
export async function getEffectivePlanRow() {
  const subscription = await getSubscriptionRow();
  return getPlanRow(isSubscriptionLive(subscription) ? subscription.plan_id : FREE_PLAN_ID);
}

/** What the current organization is using right now, in the same units as the limits. */
export async function getUsage() {
  const [accounts, users, posts, storage] = await Promise.all([
    query("SELECT count(*) AS n FROM social_accounts WHERE status <> 'disconnected'"),
    query('SELECT count(*) AS n FROM users'),
    query("SELECT count(*) AS n FROM posts WHERE created_at >= date_trunc('month', now())"),
    query("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM media_items WHERE storage <> 'linked'"),
  ]);
  return {
    socialAccounts: accounts.rows[0].n,
    users: users.rows[0].n,
    postsPerMonth: posts.rows[0].n,
    storageMb: Math.round((Number(storage.rows[0].bytes) / (1024 * 1024)) * 10) / 10,
  };
}

const upgradeHint = 'Upgrade your plan under Billing to get more.';

/**
 * Refuses (403 plan_limit) when adding `extra` more of `limitKey` would go over the plan.
 * Call it right before creating the thing. Example: await assertWithinPlanLimit('users').
 */
export async function assertWithinPlanLimit(limitKey, extra = 1) {
  const plan = await getEffectivePlanRow();
  const max = nullableNumber(plan[LIMITS[limitKey].column]);
  if (max === null) return; // unlimited
  const used = (await getUsage())[limitKey];
  if (used + extra > max) {
    throw planLimit(`Your ${plan.name} plan allows ${max} ${LIMITS[limitKey].label}. ${upgradeHint}`, { limit: limitKey, max, used });
  }
}

/** Storage limit of the current plan in bytes, or null for unlimited. Used by the Media Library. */
export async function planStorageLimitBytes() {
  const plan = await getEffectivePlanRow();
  return plan.max_storage_mb === null ? null : Number(plan.max_storage_mb) * 1024 * 1024;
}

export async function assertFeature(featureKey) {
  const plan = await getEffectivePlanRow();
  if (!plan[FEATURES[featureKey].column]) {
    throw planLimit(`${FEATURES[featureKey].label} is not included in your ${plan.name} plan. ${upgradeHint}`, { feature: featureKey });
  }
}

/** Route guard: router.use(authenticate, requireFeature('ads')). */
export const requireFeature = (featureKey) => async (_req, _res, next) => {
  await assertFeature(featureKey);
  next();
};

/** The small summary the web app keeps after sign-in: which plan, and which modules it includes. */
export async function getPlanAccess() {
  const plan = presentPlan(await getEffectivePlanRow());
  return { id: plan.id, name: plan.name, features: plan.features };
}

// ---------------------------------------------------------------- the platform owner creates / deletes plans
const slugOf = (name) =>
  String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 30);

/** A new plan (hidden from customers until the owner switches "Shown to customers" on). */
export async function createPlan(values) {
  const base = slugOf(values.name) || 'plan';
  let id = base;
  for (let attempt = 2; (await query('SELECT 1 FROM plans WHERE id = $1', [id])).rows[0]; attempt += 1) id = `${base}-${attempt}`;
  const order = (await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM plans')).rows[0].next;
  await query('INSERT INTO plans (id, name, sort_order, is_active) VALUES ($1, $2, $3, false)', [id, values.name, order]);
  return updatePlan(id, values);
}

/**
 * Deletes a plan nobody has ever used. A plan with subscribers or payments can only be hidden
 * (switch "Shown to customers" off) — its history and invoices must keep pointing at it.
 */
export async function deletePlan(planId) {
  if (planId === FREE_PLAN_ID) throw badRequest('The Free plan is everyone’s fallback and cannot be deleted.');
  await getPlanRow(planId);
  const inUse = conflict('This plan is (or was) used by customers. Hide it instead — switch “Shown to customers” off.');
  // Count across EVERY organization (system context) — inside one organization the others are invisible.
  const used = (
    await runAsSystem(() =>
      query(`SELECT (SELECT count(*) FROM subscriptions WHERE plan_id = $1) + (SELECT count(*) FROM payments WHERE plan_id = $1) AS n`, [planId])
    )
  ).rows[0].n;
  if (used > 0) throw inUse;
  await query('DELETE FROM plans WHERE id = $1', [planId]).catch((error) => {
    if (error.code === '23503') throw inUse; // still referenced somewhere: never a 500
    throw error;
  });
}
