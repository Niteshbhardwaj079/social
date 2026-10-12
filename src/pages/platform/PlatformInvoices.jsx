import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getPlatformInvoices } from '../../services/api/platformApi';
import { cycleLabel, formatMoney, formatShortDate } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

/** Every invoice issued to every organization, newest first. */
function PlatformInvoices() {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPlatformInvoices()
      .then(setInvoices)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  if (error) return <ErrorState description={error} />;
  if (!invoices) return <PageLoader minHeight="16rem" />;
  if (!invoices.length) return <EmptyState icon="FileText" title={t('billing.invoices.emptyTitle')} description={t('platform.invoices.emptyText')} />;

  return (
    <div className="data-table-wrapper">
      <table className="data-table data-table--stack">
        <thead>
          <tr>
            <th>{t('billing.col.invoice')}</th>
            <th>{t('billing.col.date')}</th>
            <th>{t('platform.col.organization')}</th>
            <th>{t('billing.col.plan')}</th>
            <th>{t('billing.col.total')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="table-row-title">
                {invoice.invoiceNumber}
                {invoice.status === 'void' ? <span className="status-badge status-badge--failed ms-2">{t('billing.void')}</span> : null}
              </td>
              <td>{formatShortDate(invoice.issuedAt)}</td>
              <td>{invoice.organizationName}</td>
              <td>
                {invoice.planName} · {cycleLabel(invoice.billingCycle, t)}
              </td>
              <td>{formatMoney(invoice.total, invoice.currency)}</td>
              <td className="text-end">
                <Link className="btn btn-sm btn-outline-secondary-custom" to={`/platform/invoices/${invoice.id}`}>
                  {t('billing.invoices.viewPrint')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PlatformInvoices;
