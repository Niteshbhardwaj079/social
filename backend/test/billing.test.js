import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { PASSWORD, createClient, setupOwner, startServer, useOrganization } from './helpers.js';

let server;
let owner; // the platform owner (first sign-up) — also runs organization "Acme"
let customer; // a separate customer organization
let customerOrgId;

/** Signs up a brand-new customer organization and returns its signed-in admin. */
async function signUpCustomer(email, companyName) {
  const client = createClient(server.baseUrl);
  const response = await client.post('/auth/register', { name: `${companyName} Admin`, email, password: PASSWORD, companyName });
  assert.equal(response.status, 201);
  client.accessToken = response.body.accessToken;
  return { client, organizationId: response.body.user.organization.id };
}

/** Submits a manual payment the way the Billing page does (multipart form). */
function submitPayment(client, fields, proof) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (proof) form.append('proof', new Blob([proof.bytes], { type: proof.type }), proof.name);
  return client.request('POST', '/billing/payments', { raw: form });
}

before(async () => {
  server = await startServer();
  ({ client: owner } = await setupOwner(server.baseUrl));
  // From here on, new organizations get no trial: they start on Free, so the limits are real.
  assert.equal((await owner.put('/platform/settings', { trialDays: 0 })).status, 200);
  ({ client: customer, organizationId: customerOrgId } = await signUpCustomer('buyer@example.com', 'Buyer Co'));
});
after(async () => server.close());

describe('plans and limits', () => {
  it('starts a new organization on Free, with its usage and limits', async () => {
    const overview = await customer.get('/billing');
    assert.equal(overview.status, 200);
    assert.equal(overview.body.subscription.planId, 'free');
    assert.equal(overview.body.effectivePlan.limits.users, 1);
    assert.equal(overview.body.usage.users, 1);
    const history = await customer.get('/billing/history');
    assert.deepEqual(history.body.history.map((event) => event.event), ['signed_up']);
  });

  it('refuses what the Free plan does not include, with a clear upgrade message', async () => {
    const invite = await customer.post('/users', { name: 'Second', email: 'second@buyer.example', role: 'editor', language: 'en' });
    assert.equal(invite.status, 403);
    assert.equal(invite.body.error.code, 'plan_limit');
    assert.match(invite.body.error.message, /Free plan allows 1 team members/);

    const ads = await customer.get('/ads');
    assert.equal(ads.status, 403);
    assert.equal(ads.body.error.code, 'plan_limit');
  });

  it('lists only the plans customers may buy', async () => {
    const plans = await customer.get('/billing/plans');
    assert.deepEqual(plans.body.plans.map((plan) => plan.id), ['free', 'starter', 'pro', 'enterprise']);
  });
});

describe('paying manually', () => {
  it('cannot check out until the owner has set up payment details', async () => {
    const response = await customer.post('/billing/checkout', { planId: 'starter', billingCycle: 'monthly' });
    assert.equal(response.status, 400);
  });

  it('shows the price with tax and a UPI QR code once a UPI ID is set', async () => {
    await owner.put('/platform/settings', { upiId: 'acme@upi', upiName: 'Acme Pvt Ltd', companyName: 'Acme Pvt Ltd', taxRate: 18 });
    const response = await customer.post('/billing/checkout', { planId: 'starter', billingCycle: 'monthly' });
    assert.equal(response.status, 200);
    assert.deepEqual(
      { subtotal: response.body.price.subtotal, tax: response.body.price.taxAmount, total: response.body.price.total },
      { subtotal: 999, tax: 179.82, total: 1178.82 }
    );
    assert.match(response.body.checkout.upiQrDataUrl, /^data:image\/png;base64,/);
    assert.equal(response.body.checkout.instructions.upiId, 'acme@upi');
  });

  it('records a submitted payment as pending, with its screenshot, and only one at a time', async () => {
    const response = await submitPayment(
      customer,
      { planId: 'starter', billingCycle: 'monthly', transactionId: 'UTR123456789', method: 'upi', payerName: 'Buyer Co', paidOn: '2026-10-01' },
      { bytes: Buffer.from('fake-png'), type: 'image/png', name: 'proof.png' }
    );
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.payment.status, 'pending');
    assert.equal(response.body.payment.amount, 1178.82);
    assert.equal(response.body.payment.hasProof, true);

    const proof = await customer.get(`/billing/payments/${response.body.payment.id}/proof`);
    assert.equal(proof.status, 200);
    assert.equal(proof.text, 'fake-png');

    const second = await submitPayment(customer, { planId: 'pro', billingCycle: 'monthly', transactionId: 'UTR999999999' });
    assert.equal(second.status, 409);
  });

  it('refuses a screenshot that is not an image or PDF', async () => {
    const other = await signUpCustomer('other@example.com', 'Other Co');
    const response = await submitPayment(
      other.client,
      { planId: 'starter', billingCycle: 'monthly', transactionId: 'UTR-OTHER-1' },
      { bytes: Buffer.from('MZ'), type: 'application/x-msdownload', name: 'virus.exe' }
    );
    assert.equal(response.status, 400);
  });
});

describe('the platform owner reviews payments', () => {
  let paymentId;

  it('sees the pending payment from every organization', async () => {
    const response = await owner.get('/platform/payments?status=pending');
    assert.equal(response.status, 200);
    const payment = response.body.payments.find((item) => item.transactionId === 'UTR123456789');
    assert.ok(payment);
    assert.equal(payment.organizationName, 'Buyer Co');
    paymentId = payment.id;
  });

  it('approves it: the plan switches, an invoice is issued and the history records it', async () => {
    const response = await owner.post(`/platform/payments/${paymentId}/approve`, { note: 'Checked bank statement' });
    assert.equal(response.status, 200, response.text);
    const invoice = response.body.invoice;
    assert.match(invoice.invoiceNumber, new RegExp(`^INV-${new Date().getFullYear()}-000001$`));
    assert.equal(invoice.total, 1178.82);
    assert.equal(invoice.taxAmount, 179.82);
    assert.equal(invoice.seller.name, 'Acme Pvt Ltd');
    assert.equal(invoice.buyer.name, 'Buyer Co');

    const overview = await customer.get('/billing');
    assert.equal(overview.body.subscription.planId, 'starter');
    assert.equal(overview.body.subscription.status, 'active');
    assert.equal(overview.body.subscription.billingCycle, 'monthly');
    assert.ok(overview.body.subscription.daysLeft >= 28);
    assert.equal(overview.body.pendingPayment, null);

    const invoices = await customer.get('/billing/invoices');
    assert.equal(invoices.body.invoices.length, 1);
    const history = await customer.get('/billing/history');
    assert.deepEqual(history.body.history.map((event) => event.event), ['payment_approved', 'payment_submitted', 'signed_up']);

    // Starter allows 3 people now.
    const invite = await customer.post('/users', { name: 'Second', email: 'second@buyer.example', role: 'editor', language: 'en' });
    assert.equal(invite.status, 201);
  });

  it('cannot approve the same payment twice', async () => {
    const response = await owner.post(`/platform/payments/${paymentId}/approve`, {});
    assert.equal(response.status, 409);
  });

  it('extends an active plan from its current end date when the customer renews early', async () => {
    const before = (await customer.get('/billing')).body.subscription.currentPeriodEnd;
    const renewal = await submitPayment(customer, { planId: 'starter', billingCycle: 'monthly', transactionId: 'UTR-RENEW-1' });
    assert.equal(renewal.status, 201);
    await owner.post(`/platform/payments/${renewal.body.payment.id}/approve`, {});
    const after = (await customer.get('/billing')).body.subscription;
    assert.equal(after.currentPeriodStart, before, 'the new period starts where the old one ended');
    assert.ok(new Date(after.currentPeriodEnd) > new Date(before));
  });

  it('never lets the same transaction ID be used twice', async () => {
    const reused = await submitPayment(customer, { planId: 'starter', billingCycle: 'monthly', transactionId: 'utr123456789' });
    assert.equal(reused.status, 409);
  });

  it('rejects a payment with a reason the customer can read', async () => {
    const submitted = await submitPayment(customer, { planId: 'pro', billingCycle: 'yearly', transactionId: 'UTR-WRONG-1' });
    assert.equal((await owner.post(`/platform/payments/${submitted.body.payment.id}/reject`, { note: 'Amount not received' })).status, 200);
    const payments = await customer.get('/billing/payments');
    const rejected = payments.body.payments.find((item) => item.id === submitted.body.payment.id);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.reviewNote, 'Amount not received');
    assert.equal((await customer.get('/billing')).body.subscription.planId, 'starter', 'a rejected payment changes nothing');
  });
});

describe('keeping customers apart', () => {
  it('a customer cannot open another organization’s invoice or the platform screens', async () => {
    const invoiceId = (await customer.get('/billing/invoices')).body.invoices[0].id;
    const stranger = await signUpCustomer('stranger@example.com', 'Stranger Co');
    assert.equal((await stranger.client.get(`/billing/invoices/${invoiceId}`)).status, 404);
    assert.equal((await stranger.client.get('/platform/payments')).status, 403);
    assert.equal((await owner.get(`/platform/invoices/${invoiceId}`)).status, 200, 'the platform owner can');
  });

  it('keeps tenant rows invisible at the database level, even without a WHERE clause', async () => {
    useOrganization(customerOrgId);
    const emails = (await query('SELECT email FROM users ORDER BY email')).rows.map((row) => row.email);
    assert.deepEqual(emails, ['buyer@example.com', 'second@buyer.example']);
  });
});

describe('the platform owner manages organizations', () => {
  it('lists organizations with their plan', async () => {
    const response = await owner.get('/platform/organizations');
    const buyer = response.body.organizations.find((organization) => organization.id === customerOrgId);
    assert.equal(buyer.planId, 'starter');
    assert.equal(buyer.ownerEmail, 'buyer@example.com');
  });

  it('assigns a plan directly, recorded in the history', async () => {
    const response = await owner.post(`/platform/organizations/${customerOrgId}/plan`, { planId: 'enterprise', note: 'Partner deal' });
    assert.equal(response.status, 200);
    assert.equal(response.body.organization.planId, 'enterprise');
    assert.equal(response.body.history[0].event, 'plan_assigned');
    assert.equal(response.body.history[0].note, 'Partner deal');
  });

  it('edits a plan’s price and limits', async () => {
    const response = await owner.patch('/platform/plans/starter', { priceMonthly: 1299, limits: { users: 5 }, features: { ads: true } });
    assert.equal(response.status, 200);
    assert.equal(response.body.plan.priceMonthly, 1299);
    assert.equal(response.body.plan.limits.users, 5);
    assert.equal(response.body.plan.features.ads, true);
  });

  it('suspends an organization: its people are locked out until it is re-activated', async () => {
    assert.equal((await owner.patch(`/platform/organizations/${customerOrgId}/status`, { status: 'suspended' })).status, 200);
    const blocked = await customer.get('/billing');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'organization_suspended');
    assert.equal((await createClient(server.baseUrl).signIn('buyer@example.com')).status, 403);

    assert.equal((await owner.patch(`/platform/organizations/${customerOrgId}/status`, { status: 'active' })).status, 200);
    assert.equal((await customer.get('/billing')).status, 200);
  });

  it('cannot suspend its own organization', async () => {
    const ownOrganizationId = (await owner.get('/auth/me')).body.user.organization.id;
    assert.equal((await owner.patch(`/platform/organizations/${ownOrganizationId}/status`, { status: 'suspended' })).status, 400);
  });
});

describe('billing details', () => {
  it('saves the organization’s own "Bill to" details, used on its next invoices', async () => {
    const saved = await customer.put('/billing/details', { name: 'Buyer Co Pvt Ltd', email: 'accounts@buyer.example', address: 'MG Road, Pune', gstin: '27ABCDE1234F1Z5' });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.billingDetails.name, 'Buyer Co Pvt Ltd');
    assert.equal((await customer.get('/billing')).body.billingDetails.gstin, '27ABCDE1234F1Z5');
    const ownerView = (await owner.get('/billing')).body.billingDetails;
    assert.notEqual(ownerView.gstin, '27ABCDE1234F1Z5', 'another organization’s details are untouched');
  });
});

describe('dynamic billing: owner plan changes, credit for unused days, invoice corrections', () => {
  let upgrade; // a fresh customer organization
  let upgradeOrgId;

  before(async () => {
    ({ client: upgrade, organizationId: upgradeOrgId } = await signUpCustomer('upgrade@example.com', 'Upgrade Co'));
  });

  it('the owner changes a plan and the invoice is issued automatically, priced like a checkout', async () => {
    const quote = await owner.get(`/platform/organizations/${upgradeOrgId}/quote?planId=starter&billingCycle=monthly`);
    assert.equal(quote.status, 200, quote.text);
    assert.equal(quote.body.price.credit, 0, 'nothing paid yet, so no credit');

    const changed = await owner.post(`/platform/organizations/${upgradeOrgId}/plan`, {
      planId: 'starter',
      billingCycle: 'monthly',
      createInvoice: true,
      method: 'cash',
      note: 'Paid in cash at the office',
    });
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.body.invoice.total, quote.body.price.total);
    assert.equal(changed.body.invoice.paymentMethod, 'cash');
    assert.equal(changed.body.organization.planId, 'starter');
    assert.ok(new Date(changed.body.organization.currentPeriodEnd) > new Date(Date.now() + 27 * 86_400_000), 'one month of access');

    const invoices = (await upgrade.get('/billing/invoices')).body.invoices;
    assert.equal(invoices.length, 1, 'the customer sees it straight away');
  });

  it('upgrading mid-month credits the unused days of the current plan', async () => {
    const [starterPrice] = (await upgrade.get('/billing/plans')).body.plans.filter((plan) => plan.id === 'starter').map((plan) => plan.priceMonthly);
    const checkout = await upgrade.post('/billing/checkout', { planId: 'pro', billingCycle: 'monthly' });
    assert.equal(checkout.status, 200, checkout.text);
    const { price } = checkout.body;
    assert.ok(price.credit > starterPrice * 0.9 && price.credit <= starterPrice, `about a month of Starter is credited (${price.credit})`);
    assert.match(price.creditNote, /unused days of Starter/);
    assert.equal(price.subtotal, Math.round((price.planPrice - price.credit) * 100) / 100);

    // The credit is frozen into the payment and printed on the invoice.
    const submitted = await submitPayment(upgrade, { planId: 'pro', billingCycle: 'monthly', transactionId: 'UTR-UPGRADE-1' });
    assert.equal(submitted.body.payment.credit, price.credit);
    const approved = await owner.post(`/platform/payments/${submitted.body.payment.id}/approve`, {});
    assert.equal(approved.body.invoice.credit, price.credit);
    assert.match(approved.body.invoice.creditNote, /Starter/);
    assert.equal(approved.body.invoice.planPrice, price.planPrice);
  });

  it('the owner can set a special amount; the difference shows as a discount', async () => {
    const changed = await owner.post(`/platform/organizations/${upgradeOrgId}/plan`, {
      planId: 'enterprise',
      billingCycle: 'yearly',
      createInvoice: true,
      amount: 50000,
      reference: 'NEFT-SPECIAL-1',
    });
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.body.invoice.total, 50000);
    assert.ok(changed.body.invoice.credit > 0);
    assert.equal((await owner.post(`/platform/organizations/${upgradeOrgId}/plan`, { planId: 'pro', billingCycle: 'monthly', createInvoice: true, amount: 100, reference: 'NEFT-SPECIAL-1' })).status, 409, 'a reference is used once');
  });

  it('corrects an invoice by voiding it and issuing a new one with the current billing details', async () => {
    const original = (await upgrade.get('/billing/invoices')).body.invoices.find((invoice) => invoice.status === 'issued');
    await upgrade.put('/billing/details', { name: 'Upgrade Co Pvt Ltd', email: 'accounts@upgrade.example', address: 'Baner, Pune', gstin: '27AAAAA0000A1Z5' });

    const reissued = await owner.post(`/platform/invoices/${original.id}/reissue`, { reason: 'Customer added GSTIN', total: original.total - 100 });
    assert.equal(reissued.status, 200, reissued.text);
    assert.notEqual(reissued.body.invoice.invoiceNumber, original.invoiceNumber, 'a new number');
    assert.equal(reissued.body.invoice.replacesInvoiceId, original.id);
    assert.equal(reissued.body.invoice.buyer.gstin, '27AAAAA0000A1Z5');
    assert.equal(reissued.body.invoice.total, original.total - 100);

    const old = (await upgrade.get(`/billing/invoices/${original.id}`)).body.invoice;
    assert.equal(old.status, 'void');
    assert.match(old.voidReason, /GSTIN/);
    const payment = (await upgrade.get('/billing/payments')).body.payments.find((item) => item.id === original.paymentId);
    assert.equal(payment.amount, original.total - 100, 'the payment follows the corrected amount');
    assert.equal(payment.invoiceId, reissued.body.invoice.id, 'and points at the valid invoice');

    assert.equal((await owner.post(`/platform/invoices/${original.id}/reissue`, { reason: 'again' })).status, 409, 'a void invoice cannot be re-issued');
  });

  it('voids an invoice on its own, and void invoices do not count as revenue', async () => {
    const before = (await owner.get('/platform/overview')).body.revenue[0].allTime;
    const invoice = (await upgrade.get('/billing/invoices')).body.invoices.find((item) => item.status === 'issued');
    const voided = await owner.post(`/platform/invoices/${invoice.id}/void`, { reason: 'Refunded' });
    assert.equal(voided.body.invoice.status, 'void');
    const after = (await owner.get('/platform/overview')).body.revenue[0].allTime;
    assert.equal(Math.round((before - after) * 100) / 100, invoice.total);
  });

  it('the owner creates, edits and deletes plans; a used plan can only be hidden', async () => {
    const created = await owner.post('/platform/plans', { name: 'Agency', priceMonthly: 4999, priceYearly: 49990, limits: { users: 25 }, features: { ads: true, ai: true } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.plan.id, 'agency');
    assert.equal(created.body.plan.isActive, false, 'hidden until the owner shows it');
    assert.equal(created.body.plan.limits.users, 25);
    assert.ok(!(await upgrade.get('/billing/plans')).body.plans.some((plan) => plan.id === 'agency'), 'customers do not see it yet');

    await owner.patch('/platform/plans/agency', { isActive: true });
    assert.ok((await upgrade.get('/billing/plans')).body.plans.some((plan) => plan.id === 'agency'));

    assert.equal((await owner.delete('/platform/plans/agency')).status, 200);
    const usedPlan = await owner.delete('/platform/plans/starter');
    assert.equal(usedPlan.status, 409);
    assert.match(usedPlan.body.error.message, /Hide it instead/);
    assert.equal((await owner.delete('/platform/plans/free')).status, 400);
  });
});

describe('billing notifications and plan-ending reminders', () => {
  let notified;
  let notifiedOrgId;

  before(async () => {
    ({ client: notified, organizationId: notifiedOrgId } = await signUpCustomer('remind@example.com', 'Remind Co'));
  });

  const titles = async () => (await notified.get('/notifications')).body.items.map((item) => item.title);

  it('tells the customer when the owner changes the plan or approves a payment', async () => {
    await owner.post(`/platform/organizations/${notifiedOrgId}/plan`, { planId: 'starter', billingCycle: 'monthly', createInvoice: true, method: 'cash' });
    assert.ok((await titles()).includes('Your plan was updated'));
  });

  it('reminds before the plan ends — once per reminder — and when it has ended', async () => {
    const { sendExpiryReminders } = await import('../src/services/subscriptionReminderService.js');
    useOrganization(notifiedOrgId);
    await query("UPDATE subscriptions SET current_period_end = now() + interval '2 days 1 hour'");
    await sendExpiryReminders();
    await sendExpiryReminders(); // a second check the same day sends nothing new
    const reminders = (await titles()).filter((title) => /ends in 3 days/.test(title));
    assert.equal(reminders.length, 1);

    await query("UPDATE subscriptions SET current_period_end = now() - interval '1 minute'");
    await sendExpiryReminders();
    await sendExpiryReminders();
    assert.equal((await titles()).filter((title) => /has ended/.test(title)).length, 1);
    assert.equal((await notified.get('/billing')).body.effectivePlan.id, 'free', 'and it falls back to Free');
  });

  it('can be switched off per person', async () => {
    assert.equal((await notified.patch('/notifications/preferences', { billingUpdate: false })).status, 200);
    const before = (await titles()).length;
    await owner.post(`/platform/organizations/${notifiedOrgId}/plan`, { planId: 'pro' });
    assert.equal((await titles()).length, before);
  });
});
