import QRCode from 'qrcode';

/**
 * Manual payments: the customer pays by UPI / bank transfer outside the app, then types the
 * transaction ID into the Billing page. The platform owner checks their bank and approves it.
 *
 * Every payment provider exports the same shape (see ./index.js):
 *   key            — stored in payments.provider
 *   label          — shown to customers
 *   isAvailable(s) — can customers use it right now? (s = platform settings)
 *   startCheckout  — what the customer needs in order to pay
 */
export const manualProvider = {
  key: 'manual',
  label: 'UPI / Bank transfer',

  isAvailable(settings) {
    return Boolean(settings.upiId || settings.bankAccountNumber);
  },

  /** Returns payment instructions, plus a UPI QR code for the exact amount when a UPI ID is set. */
  async startCheckout({ amount, currency, settings, reference }) {
    let upiQrDataUrl = null;
    if (settings.upiId && currency === 'INR') {
      const upiLink = `upi://pay?${new URLSearchParams({
        pa: settings.upiId,
        pn: settings.upiName || settings.companyName || 'Payment',
        am: amount.toFixed(2),
        cu: 'INR',
        tn: reference,
      })}`;
      upiQrDataUrl = await QRCode.toDataURL(upiLink, { margin: 1, width: 240 });
    }
    return {
      type: 'manual',
      instructions: {
        upiId: settings.upiId,
        upiName: settings.upiName,
        bankAccountName: settings.bankAccountName,
        bankAccountNumber: settings.bankAccountNumber,
        bankIfsc: settings.bankIfsc,
        bankName: settings.bankName,
        note: settings.paymentNote,
      },
      upiQrDataUrl,
    };
  },
};
