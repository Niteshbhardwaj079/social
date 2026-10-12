import { query, runAsSystem } from '../db/pool.js';
import { getOrganizationBilling } from './billingService.js';
import { isSubscriptionLive } from './planService.js';
import { badRequest, notFound } from '../utils/httpError.js';

/**
 * Screens only the platform owner sees (Platform → Overview / Organizations).
 * Everything here runs "as system", i.e. across all organizations.
 */

const ORGANIZATION_LIST_SQL = `
  SELECT organizations.*,
         subscriptions.plan_id, subscriptions.status AS subscription_status, subscriptions.billing_cycle,
         subscriptions.current_period_end, plans.name AS plan_name,
         (SELECT count(*) FROM users WHERE users.organization_id = organizations.id) AS users_count,
         (SELECT count(*) FROM payments WHERE payments.organization_id = organizations.id AND payments.status = 'pending') AS pending_payments,
         (SELECT email FROM users WHERE users.organization_id = organizations.id AND users.role = 'superAdmin'
           ORDER BY users.created_at LIMIT 1) AS owner_email,
         (SELECT phone FROM users WHERE users.organization_id = organizations.id AND users.role = 'superAdmin'
           ORDER BY users.created_at LIMIT 1) AS owner_phone
    FROM organizations
    LEFT JOIN subscriptions ON subscriptions.organization_id = organizations.id
    LEFT JOIN plans ON plans.id = subscriptions.plan_id`;

function presentOrganization(row) {
  const live = isSubscriptionLive(row.plan_id ? { status: row.subscription_status, current_period_end: row.current_period_end } : null);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    aiAccess: row.ai_access, // enabled | disabled | hidden — set by the platform owner
    ownerEmail: row.owner_email,
    ownerPhone: row.owner_phone || null,
    usersCount: row.users_count,
    pendingPayments: row.pending_payments,
    planId: row.plan_id,
    planName: row.plan_name,
    subscriptionStatus: row.plan_id ? (live ? row.subscription_status : 'expired') : null,
    billingCycle: row.billing_cycle,
    currentPeriodEnd: row.current_period_end,
    billingDetails: { name: row.billing_name, email: row.billing_email, address: row.billing_address, gstin: row.billing_gstin },
    createdAt: row.created_at,
  };
}

export async function listOrganizations() {
  const result = await runAsSystem(() => query(`${ORGANIZATION_LIST_SQL} ORDER BY organizations.created_at DESC`));
  return result.rows.map(presentOrganization);
}

export async function getOrganizationDetail(organizationId) {
  const row = (await runAsSystem(() => query(`${ORGANIZATION_LIST_SQL} WHERE organizations.id = $1`, [organizationId]))).rows[0];
  if (!row) throw notFound('No such organization');
  return { organization: presentOrganization(row), ...(await getOrganizationBilling(organizationId)) };
}

/** Suspend (nobody in it can sign in) or re-activate an organization. Your own can never be suspended. */
export async function setOrganizationStatus(actor, organizationId, status) {
  if (status === 'suspended' && organizationId === actor.organization_id) throw badRequest('You cannot suspend your own organization.');
  const result = await runAsSystem(() =>
    query('UPDATE organizations SET status = $2, updated_at = now() WHERE id = $1 RETURNING id', [organizationId, status])
  );
  if (!result.rows[0]) throw notFound('No such organization');
  return getOrganizationDetail(organizationId);
}

/** The numbers on Platform → Overview. */
export async function getPlatformStats() {
  return runAsSystem(async () => {
    const [organizations, plans, pending, revenue] = await Promise.all([
      query("SELECT count(*) AS total, count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS new_this_month FROM organizations"),
      query(
        `SELECT subscriptions.plan_id, plans.name, count(*) AS n FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id
          WHERE subscriptions.status <> 'cancelled' AND (subscriptions.current_period_end IS NULL OR subscriptions.current_period_end > now())
          GROUP BY subscriptions.plan_id, plans.name, plans.sort_order ORDER BY plans.sort_order`
      ),
      query("SELECT count(*) AS n FROM payments WHERE status = 'pending'"),
      query(
        `SELECT currency,
                COALESCE(SUM(total) FILTER (WHERE issued_at >= date_trunc('month', now())), 0) AS this_month,
                COALESCE(SUM(total), 0) AS all_time
           FROM invoices WHERE status = 'issued' GROUP BY currency`
      ),
    ]);
    return {
      organizations: organizations.rows[0].total,
      newThisMonth: organizations.rows[0].new_this_month,
      pendingPayments: pending.rows[0].n,
      byPlan: plans.rows.map((row) => ({ planId: row.plan_id, planName: row.name, organizations: row.n })),
      revenue: revenue.rows.map((row) => ({ currency: row.currency, thisMonth: Number(row.this_month), allTime: Number(row.all_time) })),
    };
  });
}
