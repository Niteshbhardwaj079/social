import EmptyState from '../common/EmptyState';
import { useI18n } from '../../i18n/useI18n';
import { describeHistoryEvent, formatShortDate } from '../../utils/billingFormat';

/** Plan history, newest first: sign-up, trials, payments, plan changes. Used by Billing and Platform. */
function HistoryList({ history, plans }) {
  const { t } = useI18n();
  const planName = (id) => plans.find((plan) => plan.id === id)?.name ?? id;
  if (!history.length) return <EmptyState icon="History" title={t('billing.history.empty')} />;
  return (
    <ol className="billing-history">
      {history.map((event) => (
        <li key={event.id} className="billing-history__item">
          <div className="billing-history__title">{describeHistoryEvent(event, planName, t)}</div>
          <div className="billing-history__meta">
            {formatShortDate(event.createdAt)}
            {event.periodEnd ? ` · ${t('billing.history.validUntil', { date: formatShortDate(event.periodEnd) })}` : ''}
            {event.actorName ? ` · ${t('billing.history.by', { name: event.actorName })}` : ''}
          </div>
          {event.note ? <div className="billing-history__note">{event.note}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export default HistoryList;
