import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import Icon from '../../components/common/Icon';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DatePickerField from '../../components/forms/DatePickerField';
import ActivityDetailModal from '../../components/activityLogs/ActivityDetailModal';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { getActivityLogs, deleteActivityLogs } from '../../services/api/activityLogsApi';
import { REQUEST_STATUS } from '../../config/constants';
import { ACTIVITY_ACTION_META, ACTIVITY_SECTIONS, ACTIVITY_DATE_RANGES } from '../../config/activityLogTypes';
import { formatDateTime } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { StatCardGrid } from '../../components/common/StatCard';
import { Pager, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

const EMPTY_FILTERS = {
  search: '',
  user: 'all',
  actionType: 'all',
  section: 'all',
  dateRange: 'all',
  from: null,
  to: null,
};


function isWithinDateRange(isoString, range) {
  if (range === 'all') return true;
  const logDate = new Date(isoString);
  const now = new Date();
  if (range === 'today') {
    return logDate.toDateString() === now.toDateString();
  }
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return logDate >= cutoff;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function downloadCsv(rows) {
  const header = ['Who', 'What they did', 'Target', 'Section', 'Details', 'When', 'Device', 'IP'];
  const lines = rows.map((log) => [
    log.user,
    ACTIVITY_ACTION_META[log.actionType]?.label || log.actionType,
    log.target,
    log.section,
    log.details,
    log.time,
    log.device,
    log.ip,
  ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));

  const csvContent = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ActivityLogs() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [logs, setLogs] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeLogId, setActiveLogId] = useState(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  function loadLogs() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getActivityLogs()
      .then((data) => {
        setLogs(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const uniqueUsers = useMemo(() => [...new Set(logs.map((log) => log.user))], [logs]);

  const filteredLogs = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();
    return logs.filter((log) => {
      const meta = ACTIVITY_ACTION_META[log.actionType];
      const matchesSearch =
        !searchTerm ||
        [log.user, log.target, log.details, meta?.label].some((field) =>
          field?.toLowerCase().includes(searchTerm)
        );
      const matchesUser = filters.user === 'all' || log.user === filters.user;
      const matchesAction = filters.actionType === 'all' || log.actionType === filters.actionType;
      const matchesSection = filters.section === 'all' || log.section === filters.section;
      const matchesDateRange = isWithinDateRange(log.time, filters.dateRange);
      const matchesFrom = !filters.from || new Date(log.time) >= startOfDay(filters.from);
      const matchesTo = !filters.to || new Date(log.time) <= endOfDay(filters.to);
      return matchesSearch && matchesUser && matchesAction && matchesSection && matchesDateRange && matchesFrom && matchesTo;
    });
  }, [logs, filters]);

  const pagination = usePagination(filteredLogs, { resetKey: JSON.stringify(filters) });
  const visibleLogs = pagination.pageItems;
  const activeLog = logs.find((log) => log.id === activeLogId) || null;
  const todayCount = logs.filter((log) => isWithinDateRange(log.time, 'today')).length;
  const countOf = (type) => logs.filter((log) => log.actionType === type).length;
  const statCards = [
    { key: 'total', label: 'Total Entries', value: logs.length, icon: 'History', tone: 'primary' },
    { key: 'today', label: 'Today', value: todayCount, icon: 'CalendarDays', tone: 'sky', isActive: filters.dateRange === 'today', onClick: () => updateFilter('dateRange', filters.dateRange === 'today' ? 'all' : 'today') },
    { key: 'users', label: 'Active People', value: new Set(logs.map((log) => log.user)).size, icon: 'Users', tone: 'green' },
    { key: 'deleted', label: 'Deletions', value: countOf('deleted'), icon: 'Trash2', tone: 'amber', isActive: filters.actionType === 'deleted', onClick: () => updateFilter('actionType', filters.actionType === 'deleted' ? 'all' : 'deleted') },
    { key: 'failed', label: 'Failed Logins', value: countOf('login_failed'), icon: 'ShieldAlert', tone: 'red', isActive: filters.actionType === 'login_failed', onClick: () => updateFilter('actionType', filters.actionType === 'login_failed' ? 'all' : 'login_failed') },
  ];

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== EMPTY_FILTERS[key]).length;
  const allVisibleSelected = visibleLogs.length > 0 && visibleLogs.every((log) => selectedIds.has(log.id));

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        visibleLogs.forEach((log) => next.delete(log.id));
        return next;
      }
      const next = new Set(current);
      visibleLogs.forEach((log) => next.add(log.id));
      return next;
    });
  }

  function toggleSelectOne(logId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  function handleExport() {
    downloadCsv(filteredLogs);
    showToast({ type: 'success', title: 'Export ready', message: `${filteredLogs.length} entries exported to CSV.` });
  }

  function handleDeleteConfirmed() {
    const targets = selectedIds.size > 0 ? logs.filter((log) => selectedIds.has(log.id)) : filteredLogs;
    const idsToRemove = targets.map((log) => log.id);
    deleteActivityLogs(idsToRemove).then(() => {
      setLogs((current) => current.filter((log) => !idsToRemove.includes(log.id)));
      setSelectedIds(new Set());
      setIsDeleteConfirmOpen(false);
      showToast({ type: 'success', title: `${idsToRemove.length} entries deleted` });
    });
  }

  const deleteTargetCount = selectedIds.size > 0 ? selectedIds.size : filteredLogs.length;

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('pages.activityTitle')} subtitle="Loading activity..." />
        <SkeletonTable rows={6} columns={6} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('pages.activityTitle')} />
        <ErrorState onRetry={loadLogs} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('pages.activityTitle')}
        subtitle={t('pages.activity')}
        guideChapterId="activity-log"
        actions={
          <>
            <button type="button" className="btn btn-outline-secondary-custom" onClick={handleExport}>
              <Icon name="Download" size={16} />
              Export log
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={filteredLogs.length === 0}
            >
              <Icon name="Trash2" size={16} />
              Delete matching
            </button>
          </>
        }
      />

      <StatCardGrid cards={statCards} />

      <div className="log-filter-bar">
        <div className="filter-bar">
        <div className={`search-input filter-bar__search ${isMobile ? 'filter-bar__search--inline' : ''}`.trim()}>
          <Icon name="Search" size={16} />
          <input
            type="search"
            className="form-control"
            placeholder={isMobile ? "Search log..." : "Search person, action or item..."}
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
        </div>

          {isMobile ? (
            <button
              type="button"
              className="btn btn-outline-secondary-custom filter-bar__toggle"
              onClick={() => setIsFiltersOpen((open) => !open)}
              aria-expanded={isFiltersOpen}
            >
              <Icon name="SlidersHorizontal" size={16} />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          ) : null}

          {!isMobile || isFiltersOpen ? (
          <>
          <div className="filter-bar__field">
            <span className="filter-bar__label">
              <Icon name="User" size={13} /> User
            </span>
            <select className="form-select" value={filters.user} onChange={(event) => updateFilter('user', event.target.value)}>
              <option value="all">All users</option>
              {uniqueUsers.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-bar__field">
            <span className="filter-bar__label">
              <Icon name="Zap" size={13} /> Action
            </span>
            <select
              className="form-select"
              value={filters.actionType}
              onChange={(event) => updateFilter('actionType', event.target.value)}
            >
              <option value="all">All actions</option>
              {Object.entries(ACTIVITY_ACTION_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-bar__field">
            <span className="filter-bar__label">
              <Icon name="LayoutGrid" size={13} /> Section
            </span>
            <select
              className="form-select"
              value={filters.section}
              onChange={(event) => updateFilter('section', event.target.value)}
            >
              <option value="all">All sections</option>
              {ACTIVITY_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-bar__field">
            <span className="filter-bar__label">
              <Icon name="CalendarRange" size={13} /> Date range
            </span>
            <select
              className="form-select"
              value={filters.dateRange}
              onChange={(event) => updateFilter('dateRange', event.target.value)}
            >
              {ACTIVITY_DATE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-bar__field filter-bar__field--wide">
            <DatePickerField
              id="logFromDate"
              label="From"
              selected={filters.from}
              onChange={(date) => updateFilter('from', date)}
              placeholderText="dd-mm-yyyy"
              className="mb-0"
            />
          </div>

          <div className="filter-bar__field filter-bar__field--wide">
            <DatePickerField
              id="logToDate"
              label="To"
              selected={filters.to}
              onChange={(date) => updateFilter('to', date)}
              minDate={filters.from}
              placeholderText="dd-mm-yyyy"
              className="mb-0"
            />
          </div>


          {hasActiveFilters ? (
            <div className="filter-bar__end">
              <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setFilters(EMPTY_FILTERS)}>
                <Icon name="XCircle" size={16} />
                Clear filters
              </button>
            </div>
          ) : null}
          </>
          ) : null}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState icon="History" title="No activity found" description="Try adjusting your filters." />
      ) : isMobile ? (
        <>
        <div className="grid-toolbar">
          <TableToolbar pagination={pagination} />
        </div>
        <div className="d-flex flex-column gap-3">
          {visibleLogs.map((log) => {
            const meta = ACTIVITY_ACTION_META[log.actionType];
            return (
              <div key={log.id} className="surface-card activity-log-card" role="button" onClick={() => setActiveLogId(log.id)}>
                <div className="d-flex gap-3">
                  <span className={`icon-badge icon-badge--${meta?.accent || 'slate'}`}>
                    <Icon name={meta?.icon || 'Circle'} size={16} />
                  </span>
                  <div className="flex-grow-1">
                    <div className="small">
                      <strong>{meta?.label}</strong> {log.target}
                    </div>
                    <div className="small text-secondary-custom">{log.details}</div>
                    <div className="d-flex justify-content-between mt-2">
                      <span className="small text-muted-custom">{log.section}</span>
                      <span className="small text-muted-custom">{log.user}</span>
                    </div>
                    <div className="small text-muted-custom mt-1">
                      {formatDateTime(log.time)} · {log.ip}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid-pager">
          <Pager pagination={pagination} />
        </div>
        </>
      ) : (
        <div className="panel-card">
          <TableToolbar pagination={pagination} />
          <div className="panel-card__body panel-card__body--flush">
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-checkbox-col">
                      <input type="checkbox" className="form-check-input" checked={allVisibleSelected} onChange={toggleSelectAll} />
                    </th>
                    <th>Who</th>
                    <th>What they did</th>
                    <th>Section</th>
                    <th>Details</th>
                    <th>When</th>
                    <th>Device / IP</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.map((log) => {
                    const meta = ACTIVITY_ACTION_META[log.actionType];
                    return (
                      <tr key={log.id}>
                        <td className="table-checkbox-col">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleSelectOne(log.id)}
                          />
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)}>
                          <div className="d-flex align-items-center gap-2">
                            <Avatar name={log.user} size="xs" />
                            {log.user}
                          </div>
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)}>
                          <div className="d-flex align-items-center gap-2">
                            <span className={`icon-badge icon-badge--${meta?.accent || 'slate'}`}>
                              <Icon name={meta?.icon || 'Circle'} size={15} />
                            </span>
                            <div>
                              <div className="table-row-title">{meta?.label}</div>
                              <div className="table-row-subtitle">{log.target}</div>
                            </div>
                          </div>
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)}>
                          {log.section}
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)} className="activity-log-details-col">
                          {log.details}
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)}>
                          {formatDateTime(log.time)}
                        </td>
                        <td role="button" onClick={() => setActiveLogId(log.id)} className="activity-log-device-col">
                          <div className="text-truncate">{log.device}</div>
                          <div className="text-muted-custom small">{log.ip}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pager pagination={pagination} />
        </div>
      )}

      <ActivityDetailModal log={activeLog} onClose={() => setActiveLogId(null)} />

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirmed}
        title="Delete matching entries?"
        message={`This will permanently delete ${deleteTargetCount} log ${deleteTargetCount === 1 ? 'entry' : 'entries'}${
          selectedIds.size > 0 ? ' you selected' : ' matching your current filters'
        }. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

export default ActivityLogs;
