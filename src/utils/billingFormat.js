/**
 * Small helpers shared by the Billing page and the Platform (owner) screens, so money, limits and
 * history read the same everywhere. Anything with words takes `t` (from useI18n) so it follows the
 * chosen language; the texts live under `billing.*` in src/i18n/locales/saas/.
 */
import { formatDate } from './formatters';

/** t(key), or `fallback` when the key does not exist (e.g. a status the server added later). */
function translateOr(t, key, fallback, vars) {
  const text = t(key, vars);
  return text === key ? fallback : text;
}

/** ₹1,178.82 / $12.00 — the amount in its own currency. */
export function formatMoney(amount, currency = 'INR') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency }).format(Number(amount) || 0);
  } catch {
    return `${currency} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** "12 Oct 2026" in the chosen language (or "—" when there is no date). */
export function formatShortDate(value) {
  return value ? formatDate(value) : '—';
}

/** A plan limit for display: null means unlimited. */
export function formatLimit(value, unit, t) {
  if (value === null || value === undefined) return t('billing.unlimited');
  if (unit === 'MB') return value >= 1024 ? `${Math.round((value / 1024) * 10) / 10} GB` : `${value} MB`;
  return String(value);
}

/**
 * The plan limits, in the order the pages show them. `key` matches the server's limit keys.
 * `labelKey` is the heading ("Social accounts"); `lineKey` the plan-card line ("{value} social accounts").
 */
export const LIMIT_ROWS = [
  { key: 'socialAccounts', labelKey: 'billing.limits.socialAccounts', lineKey: 'billing.limitLines.socialAccounts' },
  { key: 'users', labelKey: 'billing.limits.users', lineKey: 'billing.limitLines.users' },
  { key: 'postsPerMonth', labelKey: 'billing.limits.postsPerMonth', lineKey: 'billing.limitLines.postsPerMonth' },
  { key: 'storageMb', labelKey: 'billing.limits.storageMb', lineKey: 'billing.limitLines.storageMb', unit: 'MB' },
];

/** The plan modules. `key` matches the server's feature keys. */
export const FEATURE_ROWS = ['analytics', 'inbox', 'recycling', 'links', 'ads', 'ai', 'aiVideo'].map((key) => ({ key, labelKey: `billing.features.${key}` }));

/** "300 AI credits / month" — credits are only used when the platform's AI key does the work. */
export const formatAiCredits = (value, t) => (value === null || value === undefined ? t('billing.aiCreditsUnlimited') : t('billing.aiCreditsPerMonth', { count: value }));

/** "Monthly" / "Yearly". */
export const cycleLabel = (cycle, t) => (cycle ? translateOr(t, `billing.cycle.${cycle}`, cycle) : '');

/** How a customer can pay; the label of each is `billing.method.<value>`. */
export const PAYMENT_METHODS = ['upi', 'bank_transfer', 'card', 'cash', 'cheque', 'other'];

export const paymentMethodLabel = (value, t) => translateOr(t, `billing.method.${value}`, value);

/** Subscription / payment status → the app's existing StatusBadge statuses. The label is `billing.status.<status>`. */
const STATUS_BADGE = {
  active: 'active',
  trialing: 'pendingApproval',
  expired: 'failed',
  cancelled: 'disconnected',
  suspended: 'failed',
  pending: 'pendingApproval',
  approved: 'approved',
  rejected: 'rejected',
};

export function statusDisplay(status, t) {
  return { badge: STATUS_BADGE[status] ?? 'draft', label: translateOr(t, `billing.status.${status}`, status) };
}

/** One line of plan history, e.g. "Payment approved — now on Starter (Monthly)". */
export function describeHistoryEvent(event, planName, t) {
  const plan = event.toPlanId ? planName(event.toPlanId) : '';
  const cycle = event.billingCycle ? ` (${cycleLabel(event.billingCycle, t)})` : '';
  return translateOr(t, `billing.historyEvent.${event.event}`, event.event, { plan, cycle });
}
