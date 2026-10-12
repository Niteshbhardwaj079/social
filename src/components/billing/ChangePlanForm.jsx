import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { assignOrganizationPlan, getPlanChangeQuote } from '../../services/api/platformApi';
import { useI18n } from '../../i18n/useI18n';
import { PAYMENT_METHODS, cycleLabel, formatMoney, paymentMethodLabel } from '../../utils/billingFormat';

/**
 * Platform owner: put an organization on a plan.
 *  - Without an invoice: a deal, a free upgrade, a correction — the plan simply changes.
 *  - "The customer paid me": the payment is recorded and the invoice is issued automatically, priced
 *    exactly like a checkout (credit for the unused days of the current plan included). The total can
 *    be overridden for a special price.
 */
function ChangePlanForm({ organization, plans, onChanged }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    planId: organization.planId ?? 'free',
    billingCycle: organization.billingCycle ?? 'monthly',
    periodEnd: '',
    note: '',
    createInvoice: false,
    customTotal: '',
    method: 'bank_transfer',
    reference: '',
  });
  const [quote, setQuote] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issuedInvoice, setIssuedInvoice] = useState(null);

  // Any change to plan / cycle / invoice choice clears the old quote at once (in the handler, not an effect).
  const update = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (['planId', 'billingCycle', 'createInvoice'].includes(field)) setQuote(null);
  };

  // Price preview while "issue an invoice" is on.
  const { planId, billingCycle, createInvoice } = values;
  useEffect(() => {
    if (!createInvoice || !billingCycle) return undefined;
    let cancelled = false;
    getPlanChangeQuote(organization.id, planId, billingCycle)
      .then((price) => !cancelled && setQuote(price))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [organization.id, planId, billingCycle, createInvoice]);

  function handleSubmit(event) {
    event.preventDefault();
    if (values.createInvoice && !values.billingCycle) return showToast({ type: 'error', title: t('platform.changePlan.chooseCycleForInvoice') });
    setIsSaving(true);
    assignOrganizationPlan(organization.id, {
      planId: values.planId,
      billingCycle: values.billingCycle || null,
      // End of the chosen day, in the owner's own time zone. Empty = never ends (or one cycle, with an invoice).
      periodEnd: values.periodEnd ? new Date(`${values.periodEnd}T23:59:59`).toISOString() : null,
      note: values.note.trim(),
      createInvoice: values.createInvoice,
      amount: values.createInvoice && values.customTotal !== '' ? Number(values.customTotal) : null,
      method: values.method,
      reference: values.reference.trim(),
    })
      .then((detail) => {
        setIssuedInvoice(detail.invoice ?? null);
        showToast({ type: 'success', title: detail.invoice ? t('platform.changePlan.changedWithInvoice', { number: detail.invoice.invoiceNumber }) : t('platform.changePlan.changed') });
        onChanged(detail);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <form onSubmit={handleSubmit} className="row g-2 align-items-end">
      <div className="col-sm-6 col-lg-4">
        <label className="form-label" htmlFor="change-plan">
          {t('platform.changePlan.plan')}
        </label>
        <select id="change-plan" className="form-select" value={values.planId} onChange={(event) => update('planId', event.target.value)}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
              {plan.isActive ? '' : ` (${t('platform.changePlan.hidden')})`}
            </option>
          ))}
        </select>
      </div>
      <div className="col-sm-6 col-lg-4">
        <label className="form-label" htmlFor="change-cycle">
          {t('platform.changePlan.cycle')}
        </label>
        <select id="change-cycle" className="form-select" value={values.billingCycle} onChange={(event) => update('billingCycle', event.target.value)}>
          <option value="">—</option>
          <option value="monthly">{cycleLabel('monthly', t)}</option>
          <option value="yearly">{cycleLabel('yearly', t)}</option>
        </select>
      </div>
      <div className="col-sm-6 col-lg-4">
        <label className="form-label" htmlFor="change-end">
          {values.createInvoice ? t('platform.changePlan.validUntilOneCycle') : t('platform.changePlan.validUntilForever')}
        </label>
        <input id="change-end" type="date" className="form-control" value={values.periodEnd} onChange={(event) => update('periodEnd', event.target.value)} />
      </div>

      <div className="col-12">
        <div className="form-check form-switch mt-2">
          <input id="change-invoice" type="checkbox" role="switch" className="form-check-input" checked={values.createInvoice} onChange={(event) => update('createInvoice', event.target.checked)} />
          <label className="form-check-label" htmlFor="change-invoice">
            {t('platform.changePlan.customerPaid')}
          </label>
        </div>
      </div>

      {values.createInvoice ? (
        <>
          <div className="col-12">
            {quote ? (
              <div className="pay-summary mb-0">
                <div className="pay-summary__row">
                  <span>{t('platform.changePlan.planPrice')}</span>
                  <span>{formatMoney(quote.planPrice, quote.currency)}</span>
                </div>
                {quote.credit > 0 ? (
                  <div className="pay-summary__row text-success">
                    <span>{quote.creditNote}</span>
                    <span>− {formatMoney(quote.credit, quote.currency)}</span>
                  </div>
                ) : null}
                {quote.taxRate > 0 ? (
                  <div className="pay-summary__row">
                    <span>
                      {quote.taxLabel} ({quote.taxRate}%)
                    </span>
                    <span>{formatMoney(quote.taxAmount, quote.currency)}</span>
                  </div>
                ) : null}
                <div className="pay-summary__row pay-summary__row--total">
                  <span>{t('platform.changePlan.invoiceTotal')}</span>
                  <span>{formatMoney(quote.total, quote.currency)}</span>
                </div>
              </div>
            ) : (
              <p className="form-hint mb-0">{values.billingCycle ? t('platform.changePlan.workingOutPrice') : t('platform.changePlan.chooseCycleForPrice')}</p>
            )}
          </div>
          <div className="col-sm-6 col-lg-4">
            <label className="form-label" htmlFor="change-total">
              {t('platform.changePlan.specialTotal')}
            </label>
            <input id="change-total" type="number" min="0" step="0.01" className="form-control" placeholder={quote ? String(quote.total) : ''} value={values.customTotal} onChange={(event) => update('customTotal', event.target.value)} />
          </div>
          <div className="col-sm-6 col-lg-4">
            <label className="form-label" htmlFor="change-method">
              {t('billing.pay.paidBy')}
            </label>
            <select id="change-method" className="form-select" value={values.method} onChange={(event) => update('method', event.target.value)}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel(method, t)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6 col-lg-4">
            <label className="form-label" htmlFor="change-reference">
              {t('platform.changePlan.reference')}
            </label>
            <input id="change-reference" className="form-control" placeholder={t('platform.changePlan.referencePlaceholder')} value={values.reference} onChange={(event) => update('reference', event.target.value)} maxLength={100} />
          </div>
        </>
      ) : null}

      <div className="col-sm-8">
        <input className="form-control" placeholder={t('platform.changePlan.notePlaceholder')} value={values.note} onChange={(event) => update('note', event.target.value)} maxLength={1000} />
      </div>
      <div className="col-sm-4">
        <button type="submit" className="btn btn-primary w-100" disabled={isSaving}>
          {isSaving ? t('billing.saving') : values.createInvoice ? t('platform.changePlan.submitWithInvoice') : t('platform.changePlan.submit')}
        </button>
      </div>
      {issuedInvoice ? (
        <div className="col-12">
          <Link to={`/platform/invoices/${issuedInvoice.id}`} className="fw-semibold">
            {t('platform.changePlan.openInvoice', { number: issuedInvoice.invoiceNumber })} →
          </Link>
        </div>
      ) : null}
    </form>
  );
}

export default ChangePlanForm;
