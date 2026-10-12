import { query } from '../db/pool.js';
import { notifyOrganizationAdmins } from './notificationService.js';
import { forEachOrganization } from './organizationService.js';
import { FREE_PLAN_ID, getPlanRow, getSubscriptionRow } from './planService.js';
import { logger } from '../utils/logger.js';

/**
 * Reminds an organization before its paid plan (or free trial) ends — 7, 3 and 1 day before — and once
 * when it has ended (it then falls back to the Free plan's limits; nothing is deleted).
 * Each reminder is sent once per period: it is recorded in the plan history (subscription_events).
 */

const REMIND_DAYS = [1, 3, 7]; // smallest first: with 5 days left the "7 days" reminder is the one due
const CHECK_EVERY_MS = 60 * 60 * 1000; // hourly is plenty for day-level reminders

async function alreadySent(event, periodEnd, note) {
  const row = (
    await query('SELECT 1 FROM subscription_events WHERE event = $1 AND period_end = $2 AND note = $3 LIMIT 1', [event, periodEnd, note])
  ).rows[0];
  return Boolean(row);
}

async function record(organizationId, event, subscription, note) {
  await query(
    'INSERT INTO subscription_events (organization_id, event, to_plan_id, billing_cycle, period_end, note) VALUES ($1, $2, $3, $4, $5, $6)',
    [organizationId, event, subscription.plan_id, subscription.billing_cycle, subscription.current_period_end, note]
  );
}

/** One organization's check. Exported for tests. */
export async function sendExpiryReminders(now = new Date()) {
  const subscription = await getSubscriptionRow();
  if (!subscription?.current_period_end || subscription.status === 'cancelled' || subscription.plan_id === FREE_PLAN_ID) return;
  const plan = await getPlanRow(subscription.plan_id);
  const end = new Date(subscription.current_period_end);
  const daysLeft = Math.ceil((end - now) / 86_400_000);
  const what = subscription.status === 'trialing' ? `free trial of ${plan.name}` : `${plan.name} plan`;
  const organizationId = subscription.organization_id;

  if (daysLeft <= 0) {
    if (await alreadySent('plan_expired', subscription.current_period_end, 'ended')) return;
    await record(organizationId, 'plan_expired', subscription, 'ended');
    await notifyOrganizationAdmins(organizationId, {
      type: 'billingUpdate',
      title: `Your ${what} has ended`,
      message: 'You are on the Free plan’s limits now — nothing was deleted. Renew under Billing to get everything back.',
    });
    return;
  }

  const threshold = REMIND_DAYS.find((days) => daysLeft <= days);
  if (!threshold) return;
  const note = `${threshold} days`;
  if (await alreadySent('expiry_reminder', subscription.current_period_end, note)) return;
  await record(organizationId, 'expiry_reminder', subscription, note);
  await notifyOrganizationAdmins(organizationId, {
    type: 'billingUpdate',
    title: `Your ${what} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    message: `It ends on ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Renew or upgrade under Billing to keep every feature.`,
  });
}

export function startSubscriptionReminders() {
  const run = () => forEachOrganization('Plan expiry reminders', () => sendExpiryReminders()).catch((error) => logger.error('Plan reminders failed', error));
  const first = setTimeout(run, 60_000); // shortly after start, then hourly
  const timer = setInterval(run, CHECK_EVERY_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
