import { useState } from 'react';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { reissueInvoice, voidInvoice } from '../../services/api/platformApi';
import { useI18n } from '../../i18n/useI18n';
import { formatMoney } from '../../utils/billingFormat';

/**
 * Platform owner: correct an invoice. An issued invoice is never edited in place (that is how accounting
 * stays honest) — instead:
 *   - "reissue": the old one is voided and a new one (new number) is issued with the organization's
 *     current billing details, and optionally a corrected total;
 *   - "void": cancelled, e.g. after a refund.
 */
function InvoiceCorrectionModal({ invoice, action, onClose, onDone }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [total, setTotal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isReissue = action === 'reissue';

  function handleConfirm() {
    if (reason.trim().length < 3) return showToast({ type: 'error', title: t('platform.correction.reasonRequired') });
    setIsSaving(true);
    const request = isReissue ? reissueInvoice(invoice.id, { reason: reason.trim(), total: total === '' ? null : Number(total) }) : voidInvoice(invoice.id, reason.trim());
    request
      .then((result) => {
        showToast({ type: 'success', title: isReissue ? t('platform.correction.reissued', { number: result.invoiceNumber }) : t('platform.correction.voided') });
        onDone(result);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isReissue ? t('platform.correction.reissueTitle', { number: invoice.invoiceNumber }) : t('platform.correction.voidTitle', { number: invoice.invoiceNumber })}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </button>
          <button type="button" className={isReissue ? 'btn btn-primary' : 'btn btn-danger'} onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? t('billing.saving') : isReissue ? t('platform.correction.reissueSubmit') : t('platform.correction.voidSubmit')}
          </button>
        </>
      }
    >
      <p className="form-hint">
        {isReissue ? t('platform.correction.reissueText') : t('platform.correction.voidText')}
      </p>
      <label className="form-label" htmlFor="correction-reason">
        {t('platform.correction.reason')} *
      </label>
      <input id="correction-reason" className="form-control mb-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isReissue ? t('platform.correction.reissuePlaceholder') : t('platform.correction.voidPlaceholder')} maxLength={500} />
      {isReissue ? (
        <>
          <label className="form-label" htmlFor="correction-total">
            {t('platform.correction.correctedTotal', { total: formatMoney(invoice.total, invoice.currency) })}
          </label>
          <input id="correction-total" type="number" min="0.01" step="0.01" className="form-control" value={total} onChange={(event) => setTotal(event.target.value)} />
        </>
      ) : null}
    </Modal>
  );
}

export default InvoiceCorrectionModal;
