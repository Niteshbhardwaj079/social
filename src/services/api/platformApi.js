import axiosClient from './axiosClient';

/** The platform owner's screens (all organizations, payments to approve, plans, settings). */
export const getPlatformOverview = () => axiosClient.get('/platform/overview').then((response) => response.data);

export const getOrganizations = () => axiosClient.get('/platform/organizations').then((response) => response.data.organizations);

export const getOrganizationDetail = (id) => axiosClient.get(`/platform/organizations/${id}`).then((response) => response.data);

export const setOrganizationStatus = (id, status) =>
  axiosClient.patch(`/platform/organizations/${id}/status`, { status }).then((response) => response.data);

/**
 * Changes an organization's plan. With `createInvoice` the payment (made outside the app) is recorded and
 * the invoice issued at once; `amount` (total incl. tax) overrides the price.
 */
export const assignOrganizationPlan = (id, { planId, billingCycle = null, periodEnd = null, note = '', createInvoice = false, amount = null, method = 'bank_transfer', reference = '' }) =>
  axiosClient
    .post(`/platform/organizations/${id}/plan`, { planId, billingCycle, periodEnd, note, createInvoice, amount, method, reference })
    .then((response) => response.data);

export const getPlatformPayments = (status) =>
  axiosClient.get('/platform/payments', { params: status ? { status } : {} }).then((response) => response.data.payments);

export const approvePayment = (id, note = '') => axiosClient.post(`/platform/payments/${id}/approve`, { note }).then((response) => response.data.invoice);

export const rejectPayment = (id, note) => axiosClient.post(`/platform/payments/${id}/reject`, { note }).then((response) => response.data);

export const getPlatformInvoices = () => axiosClient.get('/platform/invoices').then((response) => response.data.invoices);

export const getPlatformInvoice = (id) => axiosClient.get(`/platform/invoices/${id}`).then((response) => response.data.invoice);

export const getPlatformPlans = () => axiosClient.get('/platform/plans').then((response) => response.data.plans);

export const updatePlatformPlan = (id, changes) => axiosClient.patch(`/platform/plans/${id}`, changes).then((response) => response.data.plan);

export const getPlatformSettings = () => axiosClient.get('/platform/settings').then((response) => response.data.settings);

export const savePlatformSettings = (values) => axiosClient.put('/platform/settings', values).then((response) => response.data.settings);

// ---------------------------------------------------------------- dynamic billing
/** What a plan change would cost now: price − credit for unused days + tax. */
export const getPlanChangeQuote = (organizationId, planId, billingCycle) =>
  axiosClient.get(`/platform/organizations/${organizationId}/quote`, { params: { planId, billingCycle } }).then((response) => response.data.price);

export const createPlatformPlan = (values) => axiosClient.post('/platform/plans', values).then((response) => response.data.plan);

export const deletePlatformPlan = (id) => axiosClient.delete(`/platform/plans/${id}`).then((response) => response.data);

export const voidInvoice = (id, reason) => axiosClient.post(`/platform/invoices/${id}/void`, { reason }).then((response) => response.data.invoice);

/** Voids the invoice and issues a corrected one (current billing details; `total` corrects the amount). */
export const reissueInvoice = (id, { reason, total = null, notes = '' }) =>
  axiosClient.post(`/platform/invoices/${id}/reissue`, { reason, total, notes }).then((response) => response.data.invoice);
