import axiosClient from './axiosClient';

/**
 * The organization's own Billing page (plan, usage, paying, invoices, history).
 * Only used with a real server (API_ENABLED) — the Billing page says so in demo mode.
 */
export const getBillingOverview = () => axiosClient.get('/billing').then((response) => response.data);

export const getPlans = () => axiosClient.get('/billing/plans').then((response) => response.data.plans);

export const getPayments = () => axiosClient.get('/billing/payments').then((response) => response.data.payments);

export const getInvoices = () => axiosClient.get('/billing/invoices').then((response) => response.data.invoices);

export const getInvoice = (id) => axiosClient.get(`/billing/invoices/${id}`).then((response) => response.data.invoice);

export const getBillingHistory = () => axiosClient.get('/billing/history').then((response) => response.data.history);

export const saveBillingDetails = (values) => axiosClient.put('/billing/details', values).then((response) => response.data.billingDetails);

/** Price + how to pay (UPI QR / bank details today, a gateway order later). */
export const startCheckout = ({ planId, billingCycle }) =>
  axiosClient.post('/billing/checkout', { planId, billingCycle, provider: 'manual' }).then((response) => response.data);

/** Sends the transaction ID (and an optional screenshot) for the platform owner to verify. */
export function submitPayment(fields, proofFile) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, value);
  });
  if (proofFile) form.append('proof', proofFile);
  return axiosClient.post('/billing/payments', form, { timeout: 60000 }).then((response) => response.data.payment);
}

/** The screenshot is behind sign-in, so it is fetched with the token and shown from a temporary blob URL. */
export const getPaymentProofUrl = (paymentId, { platform = false } = {}) =>
  axiosClient
    .get(`${platform ? '/platform' : '/billing'}/payments/${paymentId}/proof`, { responseType: 'blob' })
    .then((response) => URL.createObjectURL(response.data));
