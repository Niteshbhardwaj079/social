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

function intervalLabel(days) {
  return RECYCLE_INTERVALS.find((interval) => interval.value === days)?.label || `Every ${days} days`;
}

function ContentRecycling() {
  const { t } = useI18n();
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
        showToast({ type: 'success', title: 'Added to recycling', message: intervalLabel(intervalDays) });
      },
      (error) => showToast({ type: 'error', title: 'Could not add to recycling', message: apiErrorMessage(error) })
    );
  }

  function handleToggleActive(entry) {
    updateRecyclingEntry(entry.id, { isActive: !entry.isActive }).then(
      (updated) => {
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast({ type: 'info', title: updated.isActive ? 'Recycling resumed' : 'Recycling paused' });
      },
      (error) => showToast({ type: 'error', title: 'Could not update this entry', message: apiErrorMessage(error) })
    );
  }

  function handleIntervalChange(entry, intervalDays) {
    updateRecyclingEntry(entry.id, { intervalDays }).then(
      (updated) => {
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast({ type: 'success', title: 'Interval updated', message: intervalLabel(intervalDays) });
      },
      (error) => showToast({ type: 'error', title: 'Could not update the interval', message: apiErrorMessage(error) })
    );
  }

  function handleBulkActive(isActive) {
    const ids = [...selection.selectedIds];
    updateRecyclingEntries(ids, { isActive }).then(
      () => {
        setEntries((current) => current.map((entry) => (ids.includes(entry.id) ? { ...entry, isActive } : entry)));
        selection.clear();
        showToast({ type: 'info', title: `${ids.length} ${ids.length === 1 ? 'item' : 'items'} ${isActive ? 'resumed' : 'paused'}` });
      },
      (error) => showToast({ type: 'error', title: 'Could not update those entries', message: apiErrorMessage(error) })
    );
  }

  function handleBulkRemoveConfirmed() {
    const ids = [...selection.selectedIds];
    removeManyFromRecycling(ids).then(
      () => {
        setEntries((current) => current.filter((entry) => !ids.includes(entry.id)));
        selection.clear();
        setIsBulkRemoveOpen(false);
        showToast({ type: 'success', title: `${ids.length} ${ids.length === 1 ? 'item' : 'items'} removed from recycling` });
      },
      (error) => {
        setIsBulkRemoveOpen(false);
        showToast({ type: 'error', title: 'Could not remove those entries', message: apiErrorMessage(error) });
      }
    );
  }

  function handleRemoveConfirmed() {
    if (!entryPendingRemove) return;
    removeFromRecycling(entryPendingRemove.id).then(
      () => {
        setEntries((current) => current.filter((item) => item.id !== entryPendingRemove.id));
        setEntryPendingRemove(null);
        showToast({ type: 'success', title: 'Removed from recycling' });
      },
      (error) => {
        setEntryPendingRemove(null);
        showToast({ type: 'error', title: 'Could not remove this entry', message: apiErrorMessage(error) });
      }
    );
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('pages.recyclingTitle')} subtitle="Loading your recycling queue..." />
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
            Add to Recycling
          </button>
        }
      />

      <StatCardGrid
        cards={[
          { key: 'total', label: 'In Queue', value: entries.length, icon: 'Repeat2', tone: 'primary' },
          { key: 'active', label: 'Active', value: entries.filter((entry) => entry.isActive).length, icon: 'PlayCircle', tone: 'green' },
          { key: 'paused', label: 'Paused', value: entries.filter((entry) => !entry.isActive).length, icon: 'PauseCircle', tone: 'slate' },
          { key: 'reposts', label: 'Total Reposts', value: entries.reduce((sum, entry) => sum + entry.totalReposts, 0), icon: 'RefreshCw', tone: 'purple' },
        ]}
      />

      <div className="panel-card">
        {entries.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={selection} show={entries.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkActive(true)}>
            <Icon name="Play" size={14} /> Resume
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkActive(false)}>
            <Icon name="Pause" size={14} /> Pause
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkRemoveOpen(true)}>
            <Icon name="Trash2" size={14} /> Remove
          </button>
        </BulkActionBar>
        <div className="panel-card__body panel-card__body--flush">
          {entries.length === 0 ? (
            <EmptyState
              icon="Repeat2"
              title="Nothing recycling yet"
              description="Add a published post to keep sharing it automatically."
              actionLabel="Add to Recycling"
              onAction={() => setIsAddModalOpen(true)}
            />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {pagination.pageItems.map((entry) => (
                <div key={entry.id} className="surface-card">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <RowCheckbox id={entry.id} selection={selection} label={`Select ${entry.content.slice(0, 30)}`} />
                    {entry.platforms.map((platformKey) => (
                      <PlatformIcon key={platformKey} platformKey={platformKey} size={22} />
                    ))}
                  </div>
                  <p className="table-row-title mb-3">{entry.content}</p>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <span className={`status-badge status-badge--${entry.isActive ? 'connected' : 'disconnected'}`}>
                      {entry.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span className="small text-muted-custom">{intervalLabel(entry.intervalDays)}</span>
                  </div>
                  <div className="small text-muted-custom mb-3">
                    Next: {formatDate(entry.nextRunAt)} · Reposted {entry.totalReposts}x
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary-custom flex-grow-1"
                      onClick={() => handleToggleActive(entry)}
                    >
                      <Icon name={entry.isActive ? 'Pause' : 'Play'} size={14} />
                      {entry.isActive ? 'Pause' : 'Resume'}
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
                    <th>Post</th>
                    <th>Platforms</th>
                    <th>Interval</th>
                    <th>Next repost</th>
                    <th>Reposted</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((entry) => (
                    <tr key={entry.id} className={selection.isSelected(entry.id) ? 'is-selected' : ''}>
                      <td className="table-checkbox-col">
                        <RowCheckbox id={entry.id} selection={selection} label={`Select ${entry.content.slice(0, 30)}`} />
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
                              {interval.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{formatDate(entry.nextRunAt)}</td>
                      <td>{entry.totalReposts}x</td>
                      <td>
                        <span className={`status-badge status-badge--${entry.isActive ? 'connected' : 'disconnected'}`}>
                          {entry.isActive ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => handleToggleActive(entry)}
                            aria-label={entry.isActive ? 'Pause' : 'Resume'}
                            data-tooltip={entry.isActive ? 'Pause' : 'Resume'}
                          >
                            <Icon name={entry.isActive ? 'Pause' : 'Play'} size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => setEntryPendingRemove(entry)}
                            aria-label="Remove"
                            data-tooltip="Remove"
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
        title={`Remove ${selection.count} ${selection.count === 1 ? 'item' : 'items'} from recycling?`}
        message="These posts will stop being automatically re-shared."
        confirmLabel="Remove"
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
        title="Remove from recycling?"
        message="This post will stop being automatically re-shared."
        confirmLabel="Remove"
        isDanger
      />
    </div>
  );
}

export default ContentRecycling;
