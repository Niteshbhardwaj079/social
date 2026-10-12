import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import StatusBadge from '../../components/common/StatusBadge';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getPaymentProofUrl } from '../../services/api/billingApi';
import { approvePayment, getPlatformPayments, rejectPayment } from '../../services/api/platformApi';
import { cycleLabel, formatMoney, formatShortDate, paymentMethodLabel, statusDisplay } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

// The label of each filter is platform.payments.filter.<value or "all">.
const FILTERS = ['pending', 'approved', 'rejected', ''];

/**
 * Approve = "I can see this money in my bank/UPI". The plan is switched on and the invoice is issued
 * at once. Reject = the customer sees your reason and can submit again.
 */
// Rendered with a `key` per payment, so the note box starts empty every time.
function ReviewModal({ review, onClose, onDone }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isApprove = review?.action === 'approve';

  function handleConfirm() {
    if (!isApprove && note.trim().length < 3) {
      showToast({ type: 'error', title: t('platform.payments.reasonRequired') });
      return;
    }
    setIsSaving(true);
    const request = isApprove ? approvePayment(review.payment.id, note.trim()) : rejectPayment(review.payment.id, note.trim());
    request
      .then((invoice) => {
        showToast({
          type: 'success',
          title: isApprove ? t('platform.payments.approved') : t('platform.payments.rejected'),
          message: isApprove ? t('platform.payments.planActivated', { number: invoice.invoiceNumber }) : undefined,
        });
        onDone();
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  if (!review) return null;
  const { payment } = review;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isApprove ? t('platform.payments.approveTitle') : t('platform.payments.rejectTitle')}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </button>
          <button type="button" className={isApprove ? 'btn btn-primary' : 'btn btn-danger'} onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? t('billing.saving') : isApprove ? t('platform.payments.approveSubmit') : t('platform.payments.rejectSubmit')}
          </button>
        </>
      }
    >
      <p>
        <strong>{payment.organizationName}</strong> — {payment.planName} ({cycleLabel(payment.billingCycle, t)}),{' '}
        <strong>{formatMoney(payment.amount, payment.currency)}</strong>, {t('platform.orgs.ref', { reference: payment.transactionId })}.
      </p>
      {isApprove ? <p className="form-hint">{t('platform.payments.approveHint')}</p> : null}
      <label className="form-label" htmlFor="review-note">
        {isApprove ? t('platform.payments.approveNote') : `${t('platform.payments.rejectReason')} *`}
      </label>
      <textarea id="review-note" className="form-control" rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
    </Modal>
  );
}

function PlatformPayments() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [status, setStatus] = useState('pending');
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null); // { action: 'approve' | 'reject', payment }

  const load = useCallback(() => {
    getPlatformPayments(status)
      .then(setPayments)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, [status]);

  useEffect(load, [load]);

  function changeFilter(value) {
    setStatus(value);
    setPayments(null); // show the spinner while the new list loads
    setError('');
  }

  function openProof(id) {
    getPaymentProofUrl(id, { platform: true })
      .then((url) => window.open(url, '_blank', 'noopener'))
      .catch((proofError) => showToast({ type: 'error', title: apiErrorMessage(proofError) }));
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="segmented-control align-self-start" role="group" aria-label={t('billing.col.status')}>
        {FILTERS.map((filter) => (
          <button key={filter} type="button" className={`segmented-control__item ${status === filter ? 'is-active' : ''}`.trim()} onClick={() => changeFilter(filter)}>
            {t(`platform.payments.filter.${filter || 'all'}`)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState
          description={error}
          onRetry={() => {
            setError('');
            load();
          }}
        />
      ) : null}
      {!error && !payments ? <PageLoader minHeight="16rem" /> : null}
      {payments && !payments.length ? <EmptyState icon="CheckCircle2" title={t('platform.payments.emptyTitle')} description={t('platform.payments.emptyText')} /> : null}

      {payments?.length ? (
        <div className="data-table-wrapper">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>{t('platform.col.submitted')}</th>
                <th>{t('platform.col.organization')}</th>
                <th>{t('billing.col.plan')}</th>
                <th>{t('billing.col.amount')}</th>
                <th>{t('platform.col.transaction')}</th>
                <th>{t('billing.col.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const display = statusDisplay(payment.status, t);
                return (
                  <tr key={payment.id}>
                    <td>
                      {formatShortDate(payment.createdAt)}
                      {payment.submittedByName ? <div className="table-row-subtitle">{t('billing.history.by', { name: payment.submittedByName })}</div> : null}
                    </td>
                    <td className="table-row-title">{payment.organizationName}</td>
                    <td>
                      {payment.planName} · {cycleLabel(payment.billingCycle, t)}
                    </td>
                    <td>{formatMoney(payment.amount, payment.currency)}</td>
                    <td>
                      <div>{payment.transactionId}</div>
                      <div className="table-row-subtitle">
                        {paymentMethodLabel(payment.method, t)}
                        {payment.paidOn ? ` · ${t('platform.payments.paidOn', { date: formatShortDate(payment.paidOn) })}` : ''}
                        {payment.payerName ? ` · ${payment.payerName}` : ''}
                      </div>
                      {payment.note ? <div className="table-row-subtitle">“{payment.note}”</div> : null}
                    </td>
                    <td>
                      <StatusBadge status={display.badge} label={display.label} />
                      {payment.reviewNote ? <div className="table-row-subtitle mt-1">{payment.reviewNote}</div> : null}
                    </td>
                    <td className="text-end text-nowrap">
                      {payment.hasProof ? (
                        <button type="button" className="btn btn-sm btn-outline-secondary-custom me-2" onClick={() => openProof(payment.id)}>
                          {t('billing.screenshot')}
                        </button>
                      ) : null}
                      {payment.status === 'pending' ? (
                        <>
                          <button type="button" className="btn btn-sm btn-primary me-2" onClick={() => setReview({ action: 'approve', payment })}>
                            {t('platform.payments.approve')}
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setReview({ action: 'reject', payment })}>
                            {t('platform.payments.reject')}
                          </button>
                        </>
                      ) : null}
                      {payment.invoiceId ? (
                        <Link className="btn btn-sm btn-outline-secondary-custom" to={`/platform/invoices/${payment.invoiceId}`}>
                          {t('billing.invoice')}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <ReviewModal
        key={review ? `${review.action}-${review.payment.id}` : 'closed'}
        review={review}
        onClose={() => setReview(null)}
        onDone={() => {
          setReview(null);
          load();
        }}
      />
    </div>
  );
}

export default PlatformPayments;
