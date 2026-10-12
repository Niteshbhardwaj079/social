# Billing — how it works, and how to add a payment gateway

## Today: manual payments

1. The customer opens **Billing → Plans & upgrade** and picks a plan + monthly/yearly.
2. `POST /api/billing/checkout` returns the price (tax included) and how to pay
   (UPI ID + QR code for the exact amount, bank details). These come from
   **Platform → Settings**, which only the platform owner can edit.
3. The customer pays outside the app, then submits the transaction ID / UTR (and an optional
   screenshot): `POST /api/billing/payments` → a `payments` row with `status = 'pending'`.
4. The platform owner checks the bank/UPI app and clicks **Approve** under **Platform → Payments**,
   which calls `billingService.approvePayment()`. In one transaction, that function:
   - extends or switches the `subscriptions` row (paying early for the same plan adds to the current end date),
   - marks the payment `approved`,
   - creates the `invoices` row (a frozen copy of the price, seller and buyer),
   - writes a `subscription_events` row (the customer's plan history).

**Reject** marks the payment `rejected` with a reason the customer can read. Nothing else changes.

## Where things live

| What | File |
| --- | --- |
| Tables | `migrations/029_billing.sql` |
| Plans, limits, `requireFeature()` | `src/services/planService.js` |
| Subscriptions, payments, invoices, history | `src/services/billingService.js` |
| Platform settings (payment details, tax, trial) | `src/services/platformSettingsService.js` |
| Ways to pay | `src/billing/providers/` |
| Customer API | `src/routes/billing.js` → `/api/billing/*` |
| Platform owner API | `src/routes/platform.js` → `/api/platform/*` |

## Adding Razorpay (or Stripe) later

The rest of the system does not care **how** money arrived. Only these steps are needed:

1. **Provider file** — create `src/billing/providers/razorpay.js` with the same shape as `manual.js`:

   ```js
   export const razorpayProvider = {
     key: 'razorpay',
     label: 'Card / UPI / Netbanking (Razorpay)',
     isAvailable: () => Boolean(process.env.RAZORPAY_KEY_ID),
     async startCheckout({ amount, currency, reference }) {
       // Create a Razorpay order for `amount` here and return what the web app needs to open it.
       return { type: 'razorpay', orderId, keyId: process.env.RAZORPAY_KEY_ID };
     },
   };
   ```

   Add it to the list in `src/billing/providers/index.js`.

2. **Confirming payment** — add a webhook route (for example `POST /api/billing/webhooks/razorpay`) that:
   - verifies the gateway's signature (never trust an unsigned request),
   - inserts a `payments` row with `provider = 'razorpay'`, `provider_payment_id = <gateway payment id>` and the
     same price columns `submitManualPayment()` fills in,
   - calls `approvePayment(null, paymentId, 'Paid online')`.

   The unique index on `(provider, provider_payment_id)` means a webhook delivered twice can never
   activate a plan twice.

3. **Web app** — in `src/components/billing/PayModal.jsx`, when `checkout.checkout.type === 'razorpay'`, open
   the gateway's checkout instead of showing bank details. Steps 1 and 2 stay the same.

Subscriptions, invoices, plan history, limits and the platform screens need **no changes**.

## Plan limits and features

- Limits (social accounts, team members, posts per month, storage) are checked right before something is
  created: `assertWithinPlanLimit('users')` and friends. Unlimited = `NULL` in the `plans` table.
- Modules (analytics, inbox, recycling, links, ads) are switched on per plan; their routes use
  `requireFeature('ads')`.
- When a paid period ends, the organization simply falls back to the **Free** plan's limits. Nothing is
  deleted; they cannot add more than Free allows until they renew.
