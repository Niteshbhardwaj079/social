import { manualProvider } from './manual.js';

/**
 * Every way a customer can pay. To add a payment gateway (Razorpay, Stripe...):
 *   1. Create ./razorpay.js exporting the same shape as ./manual.js
 *      (its startCheckout returns e.g. { type: 'razorpay', orderId, keyId } for the web app to open).
 *   2. Add it to the list below.
 *   3. When the gateway confirms a payment (webhook or verify call), create the `payments` row and call
 *      billingService.approvePayment(...) — the exact same function the owner's "Approve" button uses.
 *      Subscription, invoice and history then work with no other change. See ../README.md.
 */
const PROVIDERS = [manualProvider];

export function getPaymentProvider(key) {
  return PROVIDERS.find((provider) => provider.key === key) ?? null;
}

/** The providers customers can use right now, given the platform settings. */
export function availablePaymentProviders(settings) {
  return PROVIDERS.filter((provider) => provider.isAvailable(settings)).map(({ key, label }) => ({ key, label }));
}
