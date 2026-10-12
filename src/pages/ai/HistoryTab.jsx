import { useEffect, useState } from 'react';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import StatusBadge from '../../components/common/StatusBadge';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getGenerations } from '../../services/api/aiApi';
import { formatShortDate } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

// Labels: ai.history.kind.<kind> and ai.history.status.<status>.
const STATUS_BADGE = { succeeded: 'published', failed: 'failed', running: 'pendingApproval', queued: 'pendingApproval' };

/** Everything the AI made for this organization, newest first — with who asked and the credits used. */
function HistoryTab() {
  const { t } = useI18n();
  const [generations, setGenerations] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getGenerations()
      .then(setGenerations)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  if (error) return <ErrorState description={error} />;
  if (!generations) return <PageLoader minHeight="16rem" />;
  if (!generations.length) return <EmptyState icon="History" title={t('ai.history.empty')} />;

  return (
    <div className="data-table-wrapper">
      <table className="data-table data-table--stack">
        <thead>
          <tr>
            <th>{t('ai.history.col.when')}</th>
            <th>{t('ai.history.col.what')}</th>
            <th>{t('ai.history.col.brief')}</th>
            <th>{t('billing.col.status')}</th>
            <th>{t('ai.history.col.credits')}</th>
          </tr>
        </thead>
        <tbody>
          {generations.map((generation) => (
            <tr key={generation.id}>
              <td>
                {formatShortDate(generation.createdAt)}
                <div className="table-row-subtitle">{generation.autopilotId ? t('ai.tabs.autopilot') : generation.createdByName}</div>
              </td>
              <td>
                {t(`ai.history.kind.${generation.kind}`)}
                <div className="table-row-subtitle">{generation.provider}</div>
              </td>
              <td className="ai-history__brief">
                {generation.prompt}
                {generation.mediaUrl ? (
                  <div>
                    <a href={generation.mediaUrl} target="_blank" rel="noreferrer" className="small">
                      {t('ai.history.openFile')}
                    </a>
                  </div>
                ) : null}
              </td>
              <td>
                <StatusBadge status={STATUS_BADGE[generation.status] ?? 'draft'} label={t(`ai.history.status.${generation.status}`)} />
                {generation.error ? <div className="table-row-subtitle text-danger">{generation.error}</div> : null}
              </td>
              <td>{generation.usesPlatformKey ? generation.credits : t('ai.history.ownKey')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HistoryTab;
