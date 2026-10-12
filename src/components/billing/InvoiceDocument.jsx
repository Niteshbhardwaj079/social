import { useI18n } from '../../i18n/useI18n';
import { cycleLabel, formatMoney, formatShortDate, paymentMethodLabel } from '../../utils/billingFormat';

/** A party's details as address lines, skipping blanks. */
function PartyBlock({ title, party }) {
  return (
    <div className="invoice-doc__party">
      <div className="invoice-doc__label">{title}</div>
      <div className="invoice-doc__party-name">{party.name || '—'}</div>
      {party.address ? <div className="invoice-doc__address">{party.address}</div> : null}
      {party.gstin ? <div>GSTIN: {party.gstin}</div> : null}
      {party.email ? <div>{party.email}</div> : null}
      {party.phone ? <div>{party.phone}</div> : null}
    </div>
  );
}

/**
 * The invoice itself, laid out for both the screen and paper (Print → "Save as PDF").
 * Everything shown comes from the invoice record, which never changes after it is issued.
 */
function InvoiceDocument({ invoice }) {
  const { t } = useI18n();
  const money = (value) => formatMoney(value, invoice.currency);
  return (
    <article className="invoice-doc">
      <header className="invoice-doc__header">
        <div>
          <h2 className="invoice-doc__title">{t('billing.doc.title')}</h2>
          <div className="invoice-doc__meta">
            <span>
              {t('billing.doc.number')} <strong>{invoice.invoiceNumber}</strong>
            </span>
            <span>{t('billing.doc.date', { date: formatShortDate(invoice.issuedAt) })}</span>
          </div>
        </div>
        {invoice.status === 'void' ? <span className="invoice-doc__void">{t('billing.doc.voidStamp')}</span> : <span className="invoice-doc__paid">{t('billing.doc.paidStamp')}</span>}
      </header>

      {invoice.status === 'void' ? (
        <div className="invoice-doc__void-note">
          {invoice.voidedAt ? t('billing.doc.cancelledOn', { date: formatShortDate(invoice.voidedAt) }) : t('billing.doc.cancelled')}: {invoice.voidReason}
        </div>
      ) : null}

      <div className="invoice-doc__parties">
        <PartyBlock title={t('billing.doc.from')} party={invoice.seller} />
        <PartyBlock title={t('billing.doc.billTo')} party={invoice.buyer} />
      </div>

      <table className="invoice-doc__table">
        <thead>
          <tr>
            <th>{t('billing.doc.description')}</th>
            <th>{t('billing.col.period')}</th>
            <th className="text-end">{t('billing.col.amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {t('billing.doc.line', { plan: invoice.planName, cycle: cycleLabel(invoice.billingCycle, t) })}
            </td>
            <td>
              {formatShortDate(invoice.periodStart)} – {formatShortDate(invoice.periodEnd)}
            </td>
            <td className="text-end">{money(invoice.planPrice)}</td>
          </tr>
          {invoice.credit > 0 ? (
            <tr>
              <td colSpan={2}>{invoice.creditNote || t('billing.doc.credit')}</td>
              <td className="text-end">− {money(invoice.credit)}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>{t('billing.doc.subtotal')}</td>
            <td className="text-end">{money(invoice.subtotal)}</td>
          </tr>
          {invoice.taxRate > 0 ? (
            <tr>
              <td colSpan={2}>
                {invoice.taxLabel} @ {invoice.taxRate}%
              </td>
              <td className="text-end">{money(invoice.taxAmount)}</td>
            </tr>
          ) : null}
          <tr className="invoice-doc__total">
            <td colSpan={2}>{t('billing.doc.totalPaid')}</td>
            <td className="text-end">{money(invoice.total)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="invoice-doc__footer">
        <div>
          {t('billing.doc.paidBy', { method: paymentMethodLabel(invoice.paymentMethod, t), reference: invoice.paymentReference })}
        </div>
        {invoice.notes ? <div>{invoice.notes}</div> : null}
        <div>{t('billing.doc.computerGenerated')}</div>
      </footer>
    </article>
  );
}

export default InvoiceDocument;
