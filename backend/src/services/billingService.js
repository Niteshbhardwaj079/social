import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { currentOrganizationId, query, runAsSystem, transaction } from '../db/pool.js';
import { availablePaymentProviders, getPaymentProvider } from '../billing/providers/index.js';
import { getPlatformSettings } from './platformSettingsService.js';
import { FREE_PLAN_ID, getEffectivePlanRow, getPlanRow, getSubscriptionRow, getUsage, isSubscriptionLive, listPlans, presentPlan } from './planService.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { notifyOrganizationAdmins } from './notificationService.js';

const dateText = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Billing: subscriptions, payments, invoices and plan history.
 *
 * Customer side (Billing page) runs inside the customer's organization, like every request.
 * Platform-owner side (Platform → Payments / Organizations) runs "as system" (sees everyone).
 *
 * The one function that turns money into access is `approvePayment()`. The owner's Approve button
 * calls it today; a payment gateway's webhook will call the very same function later.
 */

const PROOF_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const PERIOD_INTERVAL = { monthly: '1 month', yearly: '1 year' };

const round2 = (value) => Math.round(value * 100) / 100;
const money = (value) => Number(value);

// ---------------------------------------------------------------- shaping rows for the web app
function presentSubscription(row, planRow) {
  const live = isSubscriptionLive(row);
  const end = row?.current_period_end ? new Date(row.current_period_end) : null;
  return {
    planId: row?.plan_id ?? FREE_PLAN_ID,
    planName: planRow?.name ?? '',
    // 'expired' is never stored: it is simply a paid/trial period whose end date has passed.
    status: !row ? 'active' : live ? row.status : 'expired',
    billingCycle: row?.billing_cycle ?? null,
    currentPeriodStart: row?.current_period_start ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    daysLeft: end && live ? Math.max(0, Math.ceil((end - Date.now()) / 86_400_000)) : null,
    provider: row?.provider ?? 'manual',
  };
}

function presentPayment(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name, // only on platform-owner lists
    planId: row.plan_id,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
    planPrice: money(row.plan_price ?? row.subtotal),
    credit: money(row.credit_applied ?? 0),
    creditNote: row.credit_note ?? '',
    subtotal: money(row.subtotal),
    taxLabel: row.tax_label,
    taxRate: money(row.tax_rate),
    taxAmount: money(row.tax_amount),
    amount: money(row.amount),
    currency: row.currency,
    provider: row.provider,
    transactionId: row.provider_payment_id,
    method: row.method,
    payerName: row.payer_name,
    paidOn: row.paid_on,
    note: row.note,
    hasProof: Boolean(row.proof_file),
    status: row.status,
    submittedByName: row.submitted_by_name ?? null,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    invoiceId: row.invoice_id ?? null,
    createdAt: row.created_at,
  };
}

export function presentInvoice(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number,
    issuedAt: row.issued_at,
    seller: row.seller,
    buyer: row.buyer,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    planPrice: money(row.plan_price ?? row.subtotal),
    credit: money(row.credit_amount ?? 0),
    creditNote: row.credit_note ?? '',
    subtotal: money(row.subtotal),
    taxLabel: row.tax_label,
    taxRate: money(row.tax_rate),
    taxAmount: money(row.tax_amount),
    total: money(row.total),
    currency: row.currency,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    // void = cancelled (kept on record); a re-issued invoice points at the one it replaces
    status: row.status ?? 'issued',
    voidReason: row.void_reason ?? '',
    voidedAt: row.voided_at ?? null,
    replacesInvoiceId: row.replaces_invoice_id ?? null,
    notes: row.notes ?? '',
  };
}

function presentEvent(row) {
  return {
    id: row.id,
    event: row.event,
    fromPlanId: row.from_plan_id,
    toPlanId: row.to_plan_id,
    billingCycle: row.billing_cycle,
    periodEnd: row.period_end,
    note: row.note,
    actorName: row.actor_name ?? null,
    createdAt: row.created_at,
  };
}

const NO_CREDIT = { amount: 0, note: '' };

/**
 * What switching to a plan costs right now:
 *   plan price for the cycle − credit for the unused days of the current paid plan (never below 0) + tax.
 * Returns { planPrice, credit, creditNote, subtotal, taxLabel, taxRate, taxAmount, total, currency }.
 */
export function priceBreakdown(planRow, billingCycle, settings, credit = NO_CREDIT) {
  const planPrice = money(billingCycle === 'yearly' ? planRow.price_yearly : planRow.price_monthly);
  const creditAmount = Math.min(round2(credit.amount), planPrice);
  const subtotal = round2(planPrice - creditAmount);
  const taxRate = money(settings.taxRate) || 0;
  const taxAmount = round2((subtotal * taxRate) / 100);
  return {
    planPrice,
    credit: creditAmount,
    creditNote: creditAmount > 0 ? credit.note : '',
    subtotal,
    taxLabel: settings.taxLabel,
    taxRate,
    taxAmount,
    total: round2(subtotal + taxAmount),
    currency: planRow.currency,
  };
}

const CYCLE_DAYS = { monthly: 30, yearly: 365 };

/**
 * Proration: when an organization moves to a DIFFERENT plan before its paid time ends, the days it
 * already paid for and will not use become a credit on the new plan:
 *   credit = (last payment for the plan ÷ days in its cycle) × days left
 * No credit when: the same plan (that is a renewal — it simply extends), the current plan was not paid
 * for (Free, a trial, or given by the platform owner after the last payment), or the time is up.
 * `run` is query() or a transaction's client.query.
 */
export async function unusedCredit(run, organizationId, newPlanId, now = new Date()) {
  const subscription = (await run('SELECT * FROM subscriptions WHERE organization_id = $1', [organizationId])).rows[0];
  if (!subscription || subscription.plan_id === newPlanId || subscription.status !== 'active' || !subscription.current_period_end) return NO_CREDIT;
  const end = new Date(subscription.current_period_end);
  if (end <= now) return NO_CREDIT;

  // The payment that put the subscription in its current state (approving a payment updates the
  // subscription in the same moment). If the owner changed the plan after it, nothing paid is running.
  const paid = (
    await run(
      `SELECT payments.subtotal, payments.billing_cycle, plans.name AS plan_name FROM payments JOIN plans ON plans.id = payments.plan_id
        WHERE payments.organization_id = $1 AND payments.plan_id = $2 AND payments.status = 'approved'
          AND payments.reviewed_at >= $3::timestamptz - interval '1 minute'
        ORDER BY payments.reviewed_at DESC LIMIT 1`,
      [organizationId, subscription.plan_id, subscription.updated_at]
    )
  ).rows[0];
  if (!paid) return NO_CREDIT;

  // Whole unused days only (rounded down), so the credit never exceeds what a full cycle cost.
  const daysLeft = Math.floor((end - now) / 86_400_000);
  if (daysLeft <= 0) return NO_CREDIT;
  const perDay = money(paid.subtotal) / CYCLE_DAYS[paid.billing_cycle];
  return { amount: round2(perDay * daysLeft), note: `Credit for ${daysLeft} unused days of ${paid.plan_name} (${paid.billing_cycle})` };
}

async function addEvent(runner, { organizationId, event, fromPlanId = null, toPlanId = null, billingCycle = null, periodEnd = null, note = '', actorId = null }) {
  await runner(
    `INSERT INTO subscription_events (organization_id, event, from_plan_id, to_plan_id, billing_cycle, period_end, note, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [organizationId, event, fromPlanId, toPlanId, billingCycle, periodEnd, note, actorId]
  );
}

// ---------------------------------------------------------------- sign-up
/** Gives a brand-new organization its first subscription: a free trial if one is set up, else Free. */
export async function startFirstSubscription(client, organizationId, actorId) {
  const settings = await getPlatformSettings();
  const runner = (text, params) => client.query(text, params);
  const trialPlan = settings.trialDays > 0 ? (await client.query('SELECT id FROM plans WHERE id = $1', [settings.trialPlanId])).rows[0] : null;

  await addEvent(runner, { organizationId, event: 'signed_up', toPlanId: FREE_PLAN_ID, actorId });
  if (!trialPlan) {
    await client.query("INSERT INTO subscriptions (organization_id, plan_id, status) VALUES ($1, $2, 'active')", [organizationId, FREE_PLAN_ID]);
    return;
  }
  const result = await client.query(
    `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
     VALUES ($1, $2, 'trialing', now() + ($3 || ' days')::interval) RETURNING current_period_end`,
    [organizationId, trialPlan.id, String(settings.trialDays)]
  );
  await addEvent(runner, {
    organizationId,
    event: 'trial_started',
    fromPlanId: FREE_PLAN_ID,
    toPlanId: trialPlan.id,
    periodEnd: result.rows[0].current_period_end,
    note: `${settings.trialDays}-day free trial`,
    actorId,
  });
}

// ---------------------------------------------------------------- customer side (current organization)
async function getOrganizationRow(organizationId) {
  const row = (await runAsSystem(() => query('SELECT * FROM organizations WHERE id = $1', [organizationId]))).rows[0];
  if (!row) throw notFound('No such organization');
  return row;
}

function presentBillingDetails(row) {
  return { name: row.billing_name || row.name, email: row.billing_email, address: row.billing_address, gstin: row.billing_gstin };
}

/** Everything the Billing page shows at the top: current plan, usage, limits, pending payment. */
export async function getOverview() {
  const organization = await getOrganizationRow(currentOrganizationId());
  const [subscription, effectivePlan, usage, pending, settings] = await Promise.all([
    getSubscriptionRow(),
    getEffectivePlanRow(),
    getUsage(),
    query("SELECT payments.*, plans.name AS plan_name FROM payments JOIN plans ON plans.id = payments.plan_id WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1"),
    getPlatformSettings(),
  ]);
  const subscribedPlan = subscription ? await getPlanRow(subscription.plan_id) : effectivePlan;
  return {
    organization: { id: organization.id, name: organization.name },
    billingDetails: presentBillingDetails(organization),
    subscription: presentSubscription(subscription, subscribedPlan),
    effectivePlan: presentPlan(effectivePlan),
    usage,
    pendingPayment: pending.rows[0] ? presentPayment(pending.rows[0]) : null,
    paymentProviders: availablePaymentProviders(settings),
    tax: { label: settings.taxLabel, rate: settings.taxRate },
  };
}

export const listAvailablePlans = () => listPlans();

export async function updateBillingDetails({ name, email, address, gstin }) {
  // Read the organization BEFORE switching to the system context — inside it there is no current organization.
  const organizationId = currentOrganizationId();
  const result = await runAsSystem(() =>
    query(
      `UPDATE organizations SET billing_name = $2, billing_email = $3, billing_address = $4, billing_gstin = $5, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [organizationId, name, email, address, gstin]
    )
  );
  return presentBillingDetails(result.rows[0]);
}

async function payablePlan(planId) {
  const plan = await getPlanRow(planId);
  if (!plan.is_active) throw badRequest('That plan is not available.');
  if (money(plan.price_monthly) <= 0 && money(plan.price_yearly) <= 0) throw badRequest('That plan is free — there is nothing to pay.');
  return plan;
}

/** Step 1 of paying: the price and how to pay it (bank/UPI details + QR today; a gateway order later). */
export async function startCheckout({ planId, billingCycle, provider: providerKey = 'manual' }) {
  const [plan, settings] = await Promise.all([payablePlan(planId), getPlatformSettings()]);
  const provider = getPaymentProvider(providerKey);
  if (!provider || !provider.isAvailable(settings)) throw badRequest('Online payment is not set up yet. Please contact support.');

  const organizationId = currentOrganizationId();
  const price = priceBreakdown(plan, billingCycle, settings, await unusedCredit(query, organizationId, plan.id));
  if (price.planPrice <= 0) throw badRequest('That plan has no price for this billing cycle.');
  if (price.total <= 0) throw badRequest('Your unused credit already covers this plan. Please contact support to switch.');
  const organization = await getOrganizationRow(organizationId);
  const reference = `${plan.name} ${billingCycle} - ${organization.name}`.slice(0, 60);
  const checkout = await provider.startCheckout({ amount: price.total, currency: price.currency, settings, reference });
  return { plan: presentPlan(plan), billingCycle, price, provider: providerKey, checkout };
}

async function saveProofFile(file) {
  if (!file) return { proofFile: null, proofContentType: null };
  const extension = PROOF_TYPES[file.mimetype];
  if (!extension) throw badRequest('The screenshot must be a PNG, JPG, WEBP image or a PDF.');
  const name = `${crypto.randomUUID()}${extension}`;
  await fs.mkdir(config.billing.proofDir, { recursive: true });
  await fs.writeFile(path.join(config.billing.proofDir, name), file.buffer);
  return { proofFile: name, proofContentType: file.mimetype };
}

/** Step 2 of paying manually: the customer tells us the transaction ID (and may attach a screenshot). */
export async function submitManualPayment(actor, input, file) {
  const [plan, settings] = await Promise.all([payablePlan(input.planId), getPlatformSettings()]);
  const pending = await query("SELECT 1 FROM payments WHERE status = 'pending' LIMIT 1");
  if (pending.rows[0]) throw conflict('You already have a payment waiting for verification. Please wait until it is checked.');

  // The price is frozen now (with any credit for the current plan), exactly as the customer saw it at checkout.
  const price = priceBreakdown(plan, input.billingCycle, settings, await unusedCredit(query, currentOrganizationId(), plan.id));
  if (price.total <= 0) throw badRequest('Your unused credit already covers this plan. Please contact support to switch.');
  const { proofFile, proofContentType } = await saveProofFile(file);
  let row;
  try {
    row = (
      await query(
        `INSERT INTO payments (plan_id, billing_cycle, plan_price, credit_applied, credit_note, subtotal, tax_label, tax_rate, tax_amount, amount, currency,
                               provider, provider_payment_id, method, payer_name, paid_on, note, proof_file, proof_content_type, submitted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual', $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
        [
          plan.id, input.billingCycle, price.planPrice, price.credit, price.creditNote, price.subtotal, price.taxLabel, price.taxRate, price.taxAmount,
          price.total, price.currency, input.transactionId, input.method, input.payerName ?? '', input.paidOn ?? null, input.note ?? '', proofFile,
          proofContentType, actor.id,
        ]
      )
    ).rows[0];
  } catch (error) {
    if (proofFile) await fs.rm(path.join(config.billing.proofDir, proofFile), { force: true });
    if (error.code === '23505') throw conflict('This transaction ID has already been submitted.');
    throw error;
  }
  await addEvent(query, {
    organizationId: row.organization_id,
    event: 'payment_submitted',
    toPlanId: plan.id,
    billingCycle: input.billingCycle,
    note: `${price.currency} ${price.total.toFixed(2)} · ref ${input.transactionId}`,
    actorId: actor.id,
  });
  return presentPayment({ ...row, plan_name: plan.name });
}

const PAYMENT_LIST_SQL = `
  SELECT payments.*, plans.name AS plan_name, organizations.name AS organization_name, users.name AS submitted_by_name,
         invoices.id AS invoice_id
    FROM payments
    JOIN plans ON plans.id = payments.plan_id
    JOIN organizations ON organizations.id = payments.organization_id
    LEFT JOIN users ON users.id = payments.submitted_by
    LEFT JOIN invoices ON invoices.payment_id = payments.id AND invoices.status = 'issued'`;

export async function listPayments() {
  const result = await query(`${PAYMENT_LIST_SQL} ORDER BY payments.created_at DESC LIMIT 200`);
  return result.rows.map(presentPayment);
}

export async function listInvoices() {
  const result = await query('SELECT * FROM invoices ORDER BY issued_at DESC LIMIT 200');
  return result.rows.map(presentInvoice);
}

export async function getInvoice(id) {
  const row = (await query('SELECT * FROM invoices WHERE id = $1', [id])).rows[0];
  if (!row) throw notFound('Invoice not found');
  return presentInvoice(row);
}

/** "Plan history": every sign-up, trial, payment and plan change, newest first. */
export async function listHistory() {
  const result = await query(
    `SELECT subscription_events.*, users.name AS actor_name
       FROM subscription_events LEFT JOIN users ON users.id = subscription_events.actor_id
      ORDER BY subscription_events.created_at DESC, subscription_events.id DESC LIMIT 200`
  );
  return result.rows.map(presentEvent);
}

/** The uploaded screenshot of a payment the caller can see (row-level security decides). */
export async function getPaymentProof(paymentId) {
  const row = (await query('SELECT proof_file, proof_content_type FROM payments WHERE id = $1', [paymentId])).rows[0];
  if (!row?.proof_file) throw notFound('No screenshot was attached to this payment.');
  return { filePath: path.join(config.billing.proofDir, row.proof_file), contentType: row.proof_content_type };
}

// ---------------------------------------------------------------- platform-owner side (all organizations)
async function nextInvoiceNumber(client, prefix) {
  const sequence = (await client.query("SELECT nextval('invoice_number_seq') AS n")).rows[0].n;
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
}

const sellerFrom = (settings) => ({
  name: settings.companyName || config.brand.company,
  address: settings.companyAddress,
  gstin: settings.companyGstin,
  email: settings.companyEmail || config.brand.supportEmail,
  phone: settings.companyPhone,
});

/**
 * Issues an invoice for a payment — a frozen copy of the price, the seller and the buyer at that moment.
 * `replaces` = the voided invoice this one corrects (re-issue); `notes` appear on the invoice.
 */
async function createInvoice(client, { payment, plan, organization, periodStart, periodEnd, settings, buyer = null, notes = '', replaces = null }) {
  const result = await client.query(
    `INSERT INTO invoices (organization_id, payment_id, invoice_number, seller, buyer, plan_name, billing_cycle, period_start, period_end,
                           plan_price, credit_amount, credit_note, subtotal, tax_label, tax_rate, tax_amount, total, currency,
                           payment_method, payment_reference, notes, replaces_invoice_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *`,
    [
      organization.id, payment.id, await nextInvoiceNumber(client, settings.invoicePrefix), sellerFrom(settings), buyer ?? presentBillingDetails(organization),
      plan.name, payment.billing_cycle, periodStart, periodEnd, payment.plan_price ?? payment.subtotal, payment.credit_applied ?? 0, payment.credit_note ?? '',
      payment.subtotal, payment.tax_label, payment.tax_rate, payment.tax_amount, payment.amount, payment.currency, payment.method, payment.provider_payment_id,
      notes, replaces,
    ]
  );
  return presentInvoice(result.rows[0]);
}

/**
 * Same plan, still running → the new period starts when the current one ends (paying early never
 * loses days). Anything else (new plan, trial, expired) → it starts now.
 */
function newPeriodStart(subscription, planId) {
  const keepsGoing = isSubscriptionLive(subscription) && subscription.status === 'active' && subscription.plan_id === planId && subscription.current_period_end;
  return keepsGoing ? new Date(subscription.current_period_end) : new Date();
}

/**
 * Turns a pending payment into access: extends/changes the subscription, issues the invoice and
 * records the history — all in one transaction, so it either fully happens or not at all.
 */
export async function approvePayment(reviewer, paymentId, note = '') {
  const settings = await getPlatformSettings();
  let notice = null; // filled inside the transaction, sent only after it has committed
  const invoice = await runAsSystem(() =>
    transaction(async (client) => {
      const payment = (await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
      if (!payment) throw notFound('Payment not found');
      if (payment.status !== 'pending') throw conflict(`This payment was already ${payment.status}.`);

      const plan = (await client.query('SELECT * FROM plans WHERE id = $1', [payment.plan_id])).rows[0];
      const organization = (await client.query('SELECT * FROM organizations WHERE id = $1', [payment.organization_id])).rows[0];
      const subscription = (await client.query('SELECT * FROM subscriptions WHERE organization_id = $1 FOR UPDATE', [payment.organization_id])).rows[0];

      const periodStart = newPeriodStart(subscription, payment.plan_id);
      const periodEnd = (await client.query('SELECT $1::timestamptz + $2::interval AS end', [periodStart, PERIOD_INTERVAL[payment.billing_cycle]])).rows[0].end;

      await client.query(
        `INSERT INTO subscriptions (organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end, provider, updated_at)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, now())
         ON CONFLICT (organization_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', billing_cycle = EXCLUDED.billing_cycle,
           current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
           provider = EXCLUDED.provider, updated_at = now()`,
        [payment.organization_id, payment.plan_id, payment.billing_cycle, periodStart, periodEnd, payment.provider]
      );
      await client.query(
        "UPDATE payments SET status = 'approved', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1",
        [paymentId, reviewer?.id ?? null, note]
      );
      const invoice = await createInvoice(client, { payment, plan, organization, periodStart, periodEnd, settings });
      await addEvent((text, params) => client.query(text, params), {
        organizationId: payment.organization_id,
        event: 'payment_approved',
        fromPlanId: subscription?.plan_id ?? null,
        toPlanId: payment.plan_id,
        billingCycle: payment.billing_cycle,
        periodEnd,
        note: note || `Invoice ${invoice.invoiceNumber}`,
        actorId: reviewer?.id ?? null,
      });
      notice = {
        organizationId: payment.organization_id,
        title: 'Payment approved',
        message: `Your ${plan.name} plan is active until ${dateText(periodEnd)}. Invoice ${invoice.invoiceNumber} is under Billing → Invoices.`,
      };
      return invoice;
    })
  );
  await notifyOrganizationAdmins(notice.organizationId, { type: 'billingUpdate', title: notice.title, message: notice.message, entityType: 'invoice', entityId: invoice.id });
  return invoice;
}

export async function rejectPayment(reviewer, paymentId, note) {
  const organizationId = await runAsSystem(() =>
    transaction(async (client) => {
      const payment = (await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
      if (!payment) throw notFound('Payment not found');
      if (payment.status !== 'pending') throw conflict(`This payment was already ${payment.status}.`);
      await client.query("UPDATE payments SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1", [
        paymentId,
        reviewer.id,
        note,
      ]);
      await addEvent((text, params) => client.query(text, params), {
        organizationId: payment.organization_id,
        event: 'payment_rejected',
        toPlanId: payment.plan_id,
        billingCycle: payment.billing_cycle,
        note,
        actorId: reviewer.id,
      });
      return payment.organization_id;
    })
  );
  await notifyOrganizationAdmins(organizationId, {
    type: 'billingUpdate',
    title: 'Payment not approved',
    message: `We could not verify your payment: ${note}. You can submit it again under Billing.`,
  });
}

/** What moving an organization to a plan would cost now (platform owner's "Change plan" preview). */
export async function quoteForOrganization(organizationId, planId, billingCycle) {
  const [plan, settings] = await Promise.all([getPlanRow(planId), getPlatformSettings()]);
  const credit = await runAsSystem(() => unusedCredit(query, organizationId, planId));
  return priceBreakdown(plan, billingCycle, settings, credit);
}

/**
 * The owner puts an organization on a plan directly. Two ways:
 *   - no invoice: a deal, a free upgrade, a fix — the plan simply changes;
 *   - createInvoice: the customer paid outside the app (cash, bank...) — a payment is recorded as
 *     approved and the invoice is issued at once, priced like a checkout (credit for unused days
 *     included). `amount` (total incl. tax) overrides the price, e.g. for a special discount.
 */
export async function assignPlan(
  reviewer,
  organizationId,
  { planId, billingCycle = null, periodEnd = null, note = '', createInvoice: withInvoice = false, amount = null, method = 'bank_transfer', reference = '' }
) {
  const plan = await getPlanRow(planId);
  const settings = await getPlatformSettings();
  if (withInvoice && !billingCycle) throw badRequest('Choose monthly or yearly to issue an invoice.');

  return runAsSystem(() =>
    transaction(async (client) => {
      const run = (text, params) => client.query(text, params);
      const previous = (await client.query('SELECT * FROM subscriptions WHERE organization_id = $1 FOR UPDATE', [organizationId])).rows[0];
      const organization = (await client.query('SELECT * FROM organizations WHERE id = $1', [organizationId])).rows[0];
      if (!organization) throw notFound('No such organization');

      // Price first (the credit depends on the plan that is still running), then switch the plan.
      let price = null;
      if (withInvoice) {
        price = priceBreakdown(plan, billingCycle, settings, await unusedCredit(run, organizationId, planId));
        if (amount !== null) price = withCustomTotal(price, amount);
        if (price.total <= 0) throw badRequest('The invoice total would be 0. Change the plan without an invoice instead.');
      }
      const end = periodEnd ?? (withInvoice ? (await client.query('SELECT now() + $1::interval AS end', [PERIOD_INTERVAL[billingCycle]])).rows[0].end : null);

      await client.query(
        `INSERT INTO subscriptions (organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end, provider, updated_at)
         VALUES ($1, $2, 'active', $3, now(), $4, 'manual', now())
         ON CONFLICT (organization_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', billing_cycle = EXCLUDED.billing_cycle,
           current_period_start = now(), current_period_end = EXCLUDED.current_period_end, provider = 'manual', updated_at = now()`,
        [organizationId, planId, billingCycle, end]
      );

      let invoice = null;
      if (withInvoice) {
        const payment = (
          await client.query(
            `INSERT INTO payments (organization_id, plan_id, billing_cycle, plan_price, credit_applied, credit_note, subtotal, tax_label, tax_rate, tax_amount,
                                   amount, currency, provider, provider_payment_id, method, payer_name, paid_on, note, status, submitted_by, reviewed_by, reviewed_at, review_note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', $13, $14, $15, CURRENT_DATE, $16, 'approved', $17, $17, now(), 'Recorded by the platform owner')
             RETURNING *`,
            [
              organizationId, planId, billingCycle, price.planPrice, price.credit, price.creditNote, price.subtotal, price.taxLabel, price.taxRate, price.taxAmount,
              price.total, price.currency, reference || `OWNER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, method, organization.billing_name || organization.name,
              note, reviewer.id,
            ]
          ).catch((error) => {
            if (error.code === '23505') throw conflict('That payment reference was already used. Leave it empty or type a different one.');
            throw error;
          })
        ).rows[0];
        invoice = await createInvoice(client, { payment, plan, organization, periodStart: new Date(), periodEnd: end, settings });
      }

      await addEvent(run, {
        organizationId,
        event: 'plan_assigned',
        fromPlanId: previous?.plan_id ?? null,
        toPlanId: planId,
        billingCycle,
        periodEnd: end,
        note: [note || 'Changed by the platform owner', invoice && `Invoice ${invoice.invoiceNumber}`].filter(Boolean).join(' · '),
        actorId: reviewer.id,
      });
      return invoice;
    })
  ).then(async (invoice) => {
    await notifyOrganizationAdmins(organizationId, {
      type: 'billingUpdate',
      title: 'Your plan was updated',
      message: `You are now on the ${plan.name} plan${invoice ? `. Invoice ${invoice.invoiceNumber} is under Billing → Invoices.` : '.'}`,
    });
    return invoice;
  });
}

/** A price with a total the owner typed (incl. tax): the difference from the list price shows as a discount. */
function withCustomTotal(price, total) {
  const subtotal = round2(total / (1 + price.taxRate / 100));
  return {
    ...price,
    credit: round2(Math.max(0, price.planPrice - subtotal)),
    creditNote: price.creditNote || 'Discount',
    subtotal,
    taxAmount: round2(total - subtotal),
    total: round2(total),
  };
}

// ---------------------------------------------------------------- correcting invoices (void + re-issue)
/** Voids an invoice (it stays on record, marked VOID with the reason). Its payment keeps its plan time. */
export async function voidInvoice(reviewer, invoiceId, reason) {
  return runAsSystem(async () => {
    const result = await query(
      "UPDATE invoices SET status = 'void', void_reason = $2, voided_at = now() WHERE id = $1 AND status = 'issued' RETURNING *",
      [invoiceId, reason]
    );
    if (!result.rows[0]) throw conflict('This invoice does not exist or is already void.');
    await addEvent(query, { organizationId: result.rows[0].organization_id, event: 'invoice_voided', note: `${result.rows[0].invoice_number}: ${reason}`, actorId: reviewer.id });
    return presentInvoice(result.rows[0]);
  });
}

/**
 * Corrects an invoice: the old one is voided and a new one (new number) is issued in its place — the
 * accounting-safe way to "edit" an invoice. By default the new one uses the organization's CURRENT
 * billing details (so a fixed GSTIN / address shows up); `total` (incl. tax) corrects the amount.
 */
export async function reissueInvoice(reviewer, invoiceId, { reason, total = null, notes = '' }) {
  const settings = await getPlatformSettings();
  return runAsSystem(() =>
    transaction(async (client) => {
      const old = (await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId])).rows[0];
      if (!old) throw notFound('Invoice not found');
      if (old.status !== 'issued') throw conflict('Only a valid (not void) invoice can be re-issued.');
      let payment = (await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [old.payment_id])).rows[0];
      const organization = (await client.query('SELECT * FROM organizations WHERE id = $1', [old.organization_id])).rows[0];

      if (total !== null && round2(total) !== money(payment.amount)) {
        // A corrected amount changes what was paid, so the payment record follows (revenue stays right).
        const corrected = withCustomTotal(
          { planPrice: money(payment.plan_price ?? payment.subtotal), taxRate: money(payment.tax_rate), creditNote: payment.credit_note, credit: 0 },
          total
        );
        payment = (
          await client.query('UPDATE payments SET subtotal = $2, tax_amount = $3, amount = $4, credit_applied = $5, credit_note = $6 WHERE id = $1 RETURNING *', [
            payment.id, corrected.subtotal, corrected.taxAmount, corrected.total, corrected.credit, corrected.creditNote,
          ])
        ).rows[0];
      }

      await client.query("UPDATE invoices SET status = 'void', void_reason = $2, voided_at = now() WHERE id = $1", [old.id, `Replaced: ${reason}`]);
      const invoice = await createInvoice(client, {
        payment,
        plan: { name: old.plan_name },
        organization,
        periodStart: old.period_start,
        periodEnd: old.period_end,
        settings,
        notes: notes || `Replaces invoice ${old.invoice_number}`,
        replaces: old.id,
      });
      await addEvent((text, params) => client.query(text, params), {
        organizationId: old.organization_id,
        event: 'invoice_reissued',
        note: `${old.invoice_number} → ${invoice.invoiceNumber}: ${reason}`,
        actorId: reviewer.id,
      });
      return invoice;
    })
  ).then(async (invoice) => {
    await notifyOrganizationAdmins(invoice.organizationId, {
      type: 'billingUpdate',
      title: 'Invoice corrected',
      message: `Invoice ${invoice.invoiceNumber} replaces an earlier one (${reason}).`,
      entityType: 'invoice',
      entityId: invoice.id,
    });
    return invoice;
  });
}

export async function listAllPayments({ status } = {}) {
  return runAsSystem(async () => {
    const result = status
      ? await query(`${PAYMENT_LIST_SQL} WHERE payments.status = $1 ORDER BY payments.created_at DESC LIMIT 500`, [status])
      : await query(`${PAYMENT_LIST_SQL} ORDER BY payments.created_at DESC LIMIT 500`);
    return result.rows.map(presentPayment);
  });
}

export const getPaymentProofAnyOrganization = (paymentId) => runAsSystem(() => getPaymentProof(paymentId));
export const getInvoiceAnyOrganization = (invoiceId) => runAsSystem(() => getInvoice(invoiceId));

export async function listAllInvoices() {
  return runAsSystem(async () => {
    const result = await query(
      `SELECT invoices.*, organizations.name AS organization_name FROM invoices
         JOIN organizations ON organizations.id = invoices.organization_id
        ORDER BY issued_at DESC LIMIT 500`
    );
    return result.rows.map((row) => ({ ...presentInvoice(row), organizationName: row.organization_name }));
  });
}

/** One organization's billing story, for the owner's organization detail view. */
export async function getOrganizationBilling(organizationId) {
  return runAsSystem(async () => {
    const [payments, invoices, events] = await Promise.all([
      query(`${PAYMENT_LIST_SQL} WHERE payments.organization_id = $1 ORDER BY payments.created_at DESC`, [organizationId]),
      query('SELECT * FROM invoices WHERE organization_id = $1 ORDER BY issued_at DESC', [organizationId]),
      query(
        `SELECT subscription_events.*, users.name AS actor_name FROM subscription_events
           LEFT JOIN users ON users.id = subscription_events.actor_id
          WHERE subscription_events.organization_id = $1 ORDER BY subscription_events.created_at DESC, subscription_events.id DESC`,
        [organizationId]
      ),
    ]);
    return {
      payments: payments.rows.map(presentPayment),
      invoices: invoices.rows.map(presentInvoice),
      history: events.rows.map(presentEvent),
    };
  });
}
