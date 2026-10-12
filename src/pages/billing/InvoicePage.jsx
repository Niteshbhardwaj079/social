import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import InvoiceDocument from '../../components/billing/InvoiceDocument';
import InvoiceCorrectionModal from '../../components/billing/InvoiceCorrectionModal';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getInvoice } from '../../services/api/billingApi';
import { getPlatformInvoice } from '../../services/api/platformApi';
import { useI18n } from '../../i18n/useI18n';

/**
 * One invoice, ready to print or save as PDF (the browser's Print → "Save as PDF").
 * `scope="platform"` is the owner's view of any organization's invoice — with Correct / Void.
 */
function InvoicePage({ scope = 'billing' }) {
  const { t } = useI18n();
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  const [correction, setCorrection] = useState(null); // 'reissue' | 'void'
  const isOwner = scope === 'platform';

  useEffect(() => {
    let cancelled = false;
    const load = isOwner ? getPlatformInvoice : getInvoice;
    load(invoiceId)
      .then((data) => !cancelled && setInvoice(data))
      .catch((loadError) => !cancelled && setError(apiErrorMessage(loadError)));
    return () => {
      cancelled = true;
    };
  }, [invoiceId, isOwner]);

  const base = isOwner ? '/platform/invoices' : '/billing/invoices';
  const backTo = isOwner ? '/platform/invoices' : '/billing?tab=invoices';

  if (error) return <ErrorState title={t('billing.invoicePage.openError')} description={error} />;
  if (!invoice) return <PageLoader minHeight="24rem" />;

  return (
    <div className="fade-in invoice-page">
      <div className="invoice-page__actions no-print">
        <Link to={backTo} className="btn btn-outline-secondary-custom d-inline-flex align-items-center gap-2">
          <Icon name="ArrowLeft" size={16} /> {t('billing.invoicePage.back')}
        </Link>
        <div className="d-flex gap-2 flex-wrap">
          {isOwner && invoice.status === 'issued' ? (
            <>
              <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setCorrection('reissue')}>
                {t('billing.invoicePage.correct')}
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={() => setCorrection('void')}>
                {t('billing.invoicePage.void')}
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={() => window.print()}>
            <Icon name="Printer" size={16} /> {t('billing.invoicePage.print')}
          </button>
        </div>
      </div>
      {invoice.replacesInvoiceId ? (
        <p className="form-hint no-print">
          {t('billing.invoicePage.replaces')} <Link to={`${base}/${invoice.replacesInvoiceId}`}>{t('billing.invoicePage.openOld')}</Link>
        </p>
      ) : null}
      <InvoiceDocument invoice={invoice} />

      {correction ? (
        <InvoiceCorrectionModal
          invoice={invoice}
          action={correction}
          onClose={() => setCorrection(null)}
          onDone={(result) => {
            setCorrection(null);
            if (correction === 'reissue') navigate(`${base}/${result.id}`);
            else setInvoice(result);
          }}
        />
      ) : null}
    </div>
  );
}

export default InvoicePage;
