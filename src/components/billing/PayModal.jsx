import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CalloutBanner from '../common/CalloutBanner';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { startCheckout, submitPayment } from '../../services/api/billingApi';
import { useI18n } from '../../i18n/useI18n';
import { PAYMENT_METHODS, cycleLabel, formatMoney, paymentMethodLabel } from '../../utils/billingFormat';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);

/** One label + value row in the "how to pay" box. Hidden when there is no value. */
function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="pay-details__row">
      <span className="pay-details__label">{label}</span>
      <span className="pay-details__value">{value}</span>
    </div>
  );
}

/**
 * Upgrading / renewing, in two steps:
 *   1. "How to pay": the price (with tax) and the UPI QR / bank details from the platform owner.
 *   2. "I have paid": the customer types the transaction ID (+ optional screenshot) for verification.
 * A payment gateway later only changes step 1 (it opens the gateway instead) — see backend/src/billing.
 */
// Rendered only while open, with a `key` per plan + cycle, so every opening starts from fresh state.
function PayModal({ onClose, plan, billingCycle, onSubmitted }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [checkout, setCheckout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ transactionId: '', method: 'upi', payerName: '', paidOn: today(), note: '' });
  const [proofFile, setProofFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startCheckout({ planId: plan.id, billingCycle })
      .then((data) => !cancelled && setCheckout(data))
      .catch((error) => !cancelled && setLoadError(apiErrorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [plan, billingCycle]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function handleFile(event) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_PROOF_BYTES) {
      setFormError(t('billing.pay.proofTooBig'));
      event.target.value = '';
      return;
    }
    setFormError('');
    setProofFile(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (form.transactionId.trim().length < 4) {
      setFormError(t('billing.pay.transactionRequired'));
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    submitPayment({ planId: plan.id, billingCycle, ...form, transactionId: form.transactionId.trim() }, proofFile)
      .then((payment) => {
        showToast({ type: 'success', title: t('billing.pay.submittedTitle'), message: t('billing.pay.submittedText') });
        onSubmitted(payment);
      })
      .catch((error) => setFormError(apiErrorMessage(error)))
      .finally(() => setIsSubmitting(false));
  }

  const price = checkout?.price;
  const instructions = checkout?.checkout?.instructions;
  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSubmitting}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="pay-form" className="btn btn-primary" disabled={!checkout || isSubmitting}>
        {isSubmitting ? t('billing.pay.submitting') : t('billing.pay.submit')}
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title={plan ? t('billing.pay.title', { plan: plan.name, cycle: cycleLabel(billingCycle, t) }) : ''} footer={footer} size="lg">
      {loadError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {loadError}
        </CalloutBanner>
      ) : null}
      {!checkout && !loadError ? <p className="text-secondary-custom">{t('billing.pay.loading')}</p> : null}

      {checkout ? (
        <div className="pay-modal">
          <section className="pay-modal__step">
            <h6 className="pay-modal__step-title">{t('billing.pay.step1')}</h6>
            <div className="pay-summary">
              <div className="pay-summary__row">
                <span>{t('billing.pay.planLine', { plan: plan.name, cycle: cycleLabel(billingCycle, t) })}</span>
                <span>{formatMoney(price.planPrice, price.currency)}</span>
              </div>
              {price.credit > 0 ? (
                <div className="pay-summary__row text-success">
                  <span>{price.creditNote}</span>
                  <span>− {formatMoney(price.credit, price.currency)}</span>
                </div>
              ) : null}
              {price.taxRate > 0 ? (
                <div className="pay-summary__row">
                  <span>
                    {price.taxLabel} ({price.taxRate}%)
                  </span>
                  <span>{formatMoney(price.taxAmount, price.currency)}</span>
                </div>
              ) : null}
              <div className="pay-summary__row pay-summary__row--total">
                <span>{t('billing.pay.total')}</span>
                <span>{formatMoney(price.total, price.currency)}</span>
              </div>
            </div>

            <div className="pay-details">
              {checkout.checkout.upiQrDataUrl ? (
                <div className="pay-details__qr">
                  <img src={checkout.checkout.upiQrDataUrl} alt={t('billing.pay.qrAlt')} width={180} height={180} />
                  <span className="form-hint">{t('billing.pay.qrHint')}</span>
                </div>
              ) : null}
              <div className="pay-details__list">
                <DetailRow label={t('billing.pay.upiId')} value={instructions.upiId} />
                <DetailRow label={t('billing.pay.upiName')} value={instructions.upiName} />
                <DetailRow label={t('billing.pay.accountName')} value={instructions.bankAccountName} />
                <DetailRow label={t('billing.pay.accountNumber')} value={instructions.bankAccountNumber} />
                <DetailRow label="IFSC" value={instructions.bankIfsc} />
                <DetailRow label={t('billing.pay.bank')} value={instructions.bankName} />
              </div>
            </div>
            {instructions.note ? <p className="form-hint mt-3 mb-0">{instructions.note}</p> : null}
          </section>

          <form id="pay-form" className="pay-modal__step" onSubmit={handleSubmit} noValidate>
            <h6 className="pay-modal__step-title">{t('billing.pay.step2')}</h6>
            {formError ? (
              <CalloutBanner icon="AlertCircle" tone="danger">
                {formError}
              </CalloutBanner>
            ) : null}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="pay-transaction">
                  {t('billing.pay.transactionId')} *
                </label>
                <input
                  id="pay-transaction"
                  className="form-control"
                  value={form.transactionId}
                  onChange={(event) => update('transactionId', event.target.value)}
                  placeholder={t('billing.pay.transactionPlaceholder')}
                  maxLength={100}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="pay-method">
                  {t('billing.pay.paidBy')}
                </label>
                <select id="pay-method" className="form-select" value={form.method} onChange={(event) => update('method', event.target.value)}>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="pay-payer">
                  {t('billing.pay.payerName')}
                </label>
                <input id="pay-payer" className="form-control" value={form.payerName} onChange={(event) => update('payerName', event.target.value)} maxLength={120} />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="pay-date">
                  {t('billing.pay.paymentDate')}
                </label>
                <input id="pay-date" type="date" className="form-control" value={form.paidOn} max={today()} onChange={(event) => update('paidOn', event.target.value)} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="pay-proof">
                  {t('billing.pay.proof')}
                </label>
                <input id="pay-proof" type="file" className="form-control" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={handleFile} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="pay-note">
                  {t('billing.pay.note')}
                </label>
                <textarea id="pay-note" className="form-control" rows={2} value={form.note} onChange={(event) => update('note', event.target.value)} maxLength={1000} />
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </Modal>
  );
}

export default PayModal;
