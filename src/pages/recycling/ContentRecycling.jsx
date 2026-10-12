import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import Icon from '../../components/common/Icon';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AddToRecyclingModal from '../../components/recycling/AddToRecyclingModal';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import {
  getRecyclingQueue,
  addToRecycling,
  updateRecyclingEntry,
  removeFromRecycling,
  updateRecyclingEntries,
  removeManyFromRecycling,
} from '../../services/api/recyclingApi';
import RECYCLE_INTERVALS from '../../config/recyclingIntervals';
import { REQUEST_STATUS } from '../../config/constants';
import { formatDate } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

function ContentRecycling() {
  const { t } = useI18n();
  function intervalLabel(days) {
    const interval = RECYCLE_INTERVALS.find((item) => item.value === days);
    return interval ? t(`recycling.intervals.${interval.labelKey}`) : `Every ${days} days`;
  }
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [entries, setEntries] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [entryPendingRemove, setEntryPendingRemove] = useState(null);
  const [isBulkRemoveOpen, setIsBulkRemoveOpen] = useState(false);
  const selection = useRowSelection();
  const pagination = usePagination(entries);
  const pageIds = pagination.pageItems.map((entry) => entry.id);

  function loadQueue() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getRecyclingQueue()
      .then((data) => {
        setEntries(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadQueue();
  }, []);

  function handleAddSubmit(post, intervalDays) {
    addToRecycling(post, intervalDays).then(
      (newEntry) => {
        setEntries((current) => [newEntry, ...current]);
        setIsAddModalOpen(false);
        showToast({ type: 'success', title: t('recycling.addedToast'), message: intervalLabel(intervalDays) });
      },
      (error) => showToast({ type: 'error', title: t('recycling.addError'), message: apiErrorMessage(error) })
    );
  }

  function handleToggleActive(entry) {
    updateRecyclingEntry(entry.id, { isActive: !entry.isActive }).then(
      (updated) => {
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast({ type: 'info', title: updated.isActive ? t('recycling.resumedToast') : t('recycling.pausedToast') });
      },
      (error) => showToast({ type: 'error', title: t('recycling.updateEntryError'), message: apiErrorMessage(error) })
    );
  }

  function handleIntervalChange(entry, intervalDays) {
    updateRecyclingEntry(entry.id, { intervalDays }).then(
      (updated) => {
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast({ type: 'success', title: t('recycling.intervalUpdatedToast'), message: intervalLabel(intervalDays) });
      },
      (error) => showToast({ type: 'error', title: t('recycling.intervalUpdateError'), message: apiErrorMessage(error) })
    );
  }

  function handleBulkActive(isActive) {
    const ids = [...selection.selectedIds];
    updateRecyclingEntries(ids, { isActive }).then(
      () => {
        setEntries((current) => current.map((entry) => (ids.includes(entry.id) ? { ...entry, isActive } : entry)));
        selection.clear();
        showToast({ type: 'info', title: t(isActive ? 'recycling.resumedToast' : 'recycling.pausedToast') });
      },
      (error) => showToast({ type: 'error', title: t('recycling.bulkUpdateError'), message: apiErrorMessage(error) })
    );
  }

  function handleBulkRemoveConfirmed() {
    const ids = [...selection.selectedIds];
    removeManyFromRecycling(ids).then(
      () => {
        setEntries((current) => current.filter((entry) => !ids.includes(entry.id)));
        selection.clear();
        setIsBulkRemoveOpen(false);
        showToast({ type: 'success', title: t(ids.length === 1 ? 'recycling.bulkRemovedOne' : 'recycling.bulkRemovedOther', { count: ids.length }) });
      },
      (error) => {
        setIsBulkRemoveOpen(false);
        showToast({ type: 'error', title: t('recycling.bulkRemoveError'), message: apiErrorMessage(error) });
      }
    );
  }

  function handleRemoveConfirmed() {
    if (!entryPendingRemove) return;
    removeFromRecycling(entryPendingRemove.id).then(
      () => {
        setEntries((current) => current.filter((item) => item.id !== entryPendingRemove.id));
        setEntryPendingRemove(null);
        showToast({ type: 'success', title: t('recycling.removedToast') });
      },
      (error) => {
        setEntryPendingRemove(null);
        showToast({ type: 'error', title: t('recycling.removeError'), message: apiErrorMessage(error) });
      }
    );
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('pages.recyclingTitle')} subtitle={t('recycling.loading')} />
        <SkeletonTable rows={4} columns={5} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('pages.recyclingTitle')} />
        <ErrorState onRetry={loadQueue} />
      </>
    );
  }

  const existingPostIds = entries.map((entry) => entry.postId);

  return (
    <div className="fade-in">
      <PageHeader
        title={t('pages.recyclingTitle')}
        subtitle={t('pages.recycling')}
        guideChapterId="recycling"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
            <Icon name="Repeat2" size={16} />
            {t('recycling.addToRecycling')}
          </button>
        }
      />

      <StatCardGrid
        cards={[
          { key: 'total', label: t('recycling.inQueue'), value: entries.length, icon: 'Repeat2', tone: 'primary' },
          { key: 'active', label: t('common.status.active'), value: entries.filter((entry) => entry.isActive).length, icon: 'PlayCircle', tone: 'green' },
          { key: 'paused', label: t('common.status.paused'), value: entries.filter((entry) => !entry.isActive).length, icon: 'PauseCircle', tone: 'slate' },
          { key: 'reposts', label: t('recycling.totalReposts'), value: entries.reduce((sum, entry) => sum + entry.totalReposts, 0), icon: 'RefreshCw', tone: 'purple' },
        ]}
      />

      <div className="panel-card">
        {entries.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={selection} show={entries.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkActive(true)}>
            <Icon name="Play" size={14} /> {t('recycling.resume')}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkActive(false)}>
            <Icon name="Pause" size={14} /> {t('recycling.pause')}
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkRemoveOpen(true)}>
            <Icon name="Trash2" size={14} /> {t('recycling.remove')}
          </button>
        </BulkActionBar>
        <div className="panel-card__body panel-card__body--flush">
          {entries.length === 0 ? (
            <EmptyState
              icon="Repeat2"
              title={t('recycling.emptyTitle')}
              description={t('recycling.emptyText')}
              actionLabel={t('recycling.addToRecycling')}
              onAction={() => setIsAddModalOpen(true)}
            />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {pagination.pageItems.map((entry) => (
                <div key={entry.id} className="surface-card">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <RowCheckbox id={entry.id} selection={selection} label={t('recycling.selectEntry', { content: entry.content.slice(0, 30) })} />
                    {entry.platforms.map((platformKey) => (
                      <PlatformIcon key={platformKey} platformKey={platformKey} size={22} />
                    ))}
                  </div>
                  <p className="table-row-title mb-3">{entry.content}</p>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <span className={`status-badge status-badge--${entry.isActive ? 'connected' : 'disconnected'}`}>
                      {entry.isActive ? t('common.status.active') : t('common.status.paused')}
                    </span>
                    <span className="small text-muted-custom">{intervalLabel(entry.intervalDays)}</span>
                  </div>
                  <div className="small text-muted-custom mb-3">
                    {t('recycling.nextLabel', { date: formatDate(entry.nextRunAt), count: entry.totalReposts })}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary-custom flex-grow-1"
                      onClick={() => handleToggleActive(entry)}
                    >
                      <Icon name={entry.isActive ? 'Pause' : 'Play'} size={14} />
                      {entry.isActive ? t('recycling.pause') : t('recycling.resume')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary-custom text-danger"
                      onClick={() => setEntryPendingRemove(entry)}
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-checkbox-col">
                      <SelectAllCheckbox ids={pageIds} selection={selection} />
                    </th>
                    <th>{t('recycling.colPost')}</th>
                    <th>{t('posts.colPlatforms')}</th>
                    <th>{t('recycling.colInterval')}</th>
                    <th>{t('recycling.colNextRepost')}</th>
                    <th>{t('recycling.colReposted')}</th>
                    <th>{t('posts.colStatus')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((entry) => (
                    <tr key={entry.id} className={selection.isSelected(entry.id) ? 'is-selected' : ''}>
                      <td className="table-checkbox-col">
                        <RowCheckbox id={entry.id} selection={selection} label={t('recycling.selectEntry', { content: entry.content.slice(0, 30) })} />
                      </td>
                      <td>
                        <span className="table-row-title table-cell-truncate">{entry.content}</span>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          {entry.platforms.map((platformKey) => (
                            <PlatformIcon key={platformKey} platformKey={platformKey} size={22} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={entry.intervalDays}
                          onChange={(event) => handleIntervalChange(entry, Number(event.target.value))}
                        >
                          {RECYCLE_INTERVALS.map((interval) => (
                            <option key={interval.value} value={interval.value}>
                              {t(`recycling.intervals.${interval.labelKey}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{formatDate(entry.nextRunAt)}</td>
                      <td>{entry.totalReposts}x</td>
                      <td>
                        <span className={`status-badge status-badge--${entry.isActive ? 'connected' : 'disconnected'}`}>
                          {entry.isActive ? t('common.status.active') : t('common.status.paused')}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => handleToggleActive(entry)}
                            aria-label={entry.isActive ? t('recycling.pause') : t('recycling.resume')}
                            data-tooltip={entry.isActive ? t('recycling.pause') : t('recycling.resume')}
                          >
                            <Icon name={entry.isActive ? 'Pause' : 'Play'} size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => setEntryPendingRemove(entry)}
                            aria-label={t('recycling.remove')}
                            data-tooltip={t('recycling.remove')}
                          >
                            <Icon name="Trash2" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pager pagination={pagination} />
      </div>

      <ConfirmDialog
        isOpen={isBulkRemoveOpen}
        onClose={() => setIsBulkRemoveOpen(false)}
        onConfirm={handleBulkRemoveConfirmed}
        title={t(selection.count === 1 ? 'recycling.bulkRemoveTitleOne' : 'recycling.bulkRemoveTitleOther', { count: selection.count })}
        message={t('recycling.bulkRemoveMessage')}
        confirmLabel={t('recycling.remove')}
        isDanger
      />

      <AddToRecyclingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddSubmit}
        excludePostIds={existingPostIds}
      />

      <ConfirmDialog
        isOpen={Boolean(entryPendingRemove)}
        onClose={() => setEntryPendingRemove(null)}
        onConfirm={handleRemoveConfirmed}
        title={t('recycling.removeTitle')}
        message={t('recycling.removeMessage')}
        confirmLabel={t('recycling.remove')}
        isDanger
      />
    </div>
  );
}

export default ContentRecycling;
