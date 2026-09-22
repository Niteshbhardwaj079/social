import { useEffect, useRef } from 'react';
import Icon from './Icon';
import { PAGE_SIZE_OPTIONS } from '../../hooks/usePagination';
import { useI18n } from '../../i18n/useI18n';

// ---- Header checkbox: ticks every visible row, shows "some" when partly ticked ----
export function SelectAllCheckbox({ ids, selection, label }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const selectedHere = ids.filter((id) => selection.isSelected(id)).length;
  const allSelected = ids.length > 0 && selectedHere === ids.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedHere > 0 && !allSelected;
  }, [selectedHere, allSelected]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="form-check-input"
      aria-label={label ?? t('table.selectAll')}
      checked={allSelected}
      disabled={ids.length === 0}
      onChange={() => selection.selectAll(ids, !allSelected)}
    />
  );
}

export function RowCheckbox({ id, selection, label }) {
  const { t } = useI18n();
  return (
    <input
      type="checkbox"
      className="form-check-input"
      aria-label={label ?? t('table.selectRow')}
      checked={selection.isSelected(id)}
      onChange={() => selection.toggleOne(id)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

// ---- Bulk actions strip: ALWAYS on screen, so ticking a row never shifts the table.
// The action buttons are disabled until at least one row is ticked (a disabled
// <fieldset> disables every button inside it). `selection` needs { count, clear }.
export function BulkActionBar({ selection, show = true, children }) {
  const { t } = useI18n();
  if (!show) return null;
  const hasSelection = selection.count > 0;
  return (
    <div className={`bulk-action-bar table-bulk-bar ${hasSelection ? '' : 'is-idle'}`.trim()}>
      <span className="table-bulk-bar__count">
        {hasSelection ? t('table.selected', { count: selection.count }) : t('table.selectRows')}
      </span>
      <fieldset className="table-bulk-bar__actions" disabled={!hasSelection}>
        {children}
        <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={selection.clear}>
          {t('common.clear')}
        </button>
      </fieldset>
    </div>
  );
}

// ---- Row above a table: "Show [50] per page" on the left, range on the right ----
export function TableToolbar({ pagination }) {
  const { t } = useI18n();
  return (
    <div className="table-toolbar">
      <label className="table-toolbar__size">
        <span>{t('table.show')}</span>
        <select
          className="form-select form-select-sm"
          value={pagination.pageSize}
          onChange={(event) => pagination.setPageSize(event.target.value === 'all' ? 'all' : Number(event.target.value))}
          aria-label={t('table.rowsPerPage')}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? t('table.all') : option}
            </option>
          ))}
        </select>
        <span>{t('table.perPage')}</span>
      </label>
      <span className="table-toolbar__range">
        {pagination.total === 0 ? t('table.empty') : t('table.range', { from: pagination.from, to: pagination.to, total: pagination.total })}
      </span>
    </div>
  );
}

// Page numbers with ellipses: 1 … 4 5 6 … 12
function pageWindow(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('gap');
    result.push(value);
  });
  return result;
}

// ---- Bottom pager. Renders nothing when everything fits on one page. ----
export function Pager({ pagination }) {
  const { t } = useI18n();
  if (pagination.totalPages <= 1) return null;
  const { page, totalPages, setPage } = pagination;

  return (
    <nav className="pager" aria-label={t('table.pagination')}>
      <button type="button" className="pager__btn" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label={t('table.prev')}>
        <Icon name="ChevronLeft" size={16} />
      </button>
      <span className="pager__compact">
        {t('table.pageOf', { page, total: totalPages })}
      </span>
      <span className="pager__numbers">
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} className="pager__gap">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`pager__btn ${entry === page ? 'is-active' : ''}`.trim()}
              onClick={() => setPage(entry)}
              aria-current={entry === page ? 'page' : undefined}
            >
              {entry}
            </button>
          )
        )}
      </span>
      <button type="button" className="pager__btn" onClick={() => setPage(page + 1)} disabled={page === totalPages} aria-label={t('table.next')}>
        <Icon name="ChevronRight" size={16} />
      </button>
    </nav>
  );
}
