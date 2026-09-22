import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CreateLinkModal from '../../components/links/CreateLinkModal';
import LinkDetailModal from '../../components/links/LinkDetailModal';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import { getLinks, createLink, deleteLink, deleteLinks } from '../../services/api/linksApi';
import { REQUEST_STATUS } from '../../config/constants';
import { formatDate } from '../../utils/formatters';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../components/common/ToastProvider';
import useMediaQuery from '../../hooks/useMediaQuery';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

function LinkShortener() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [links, setLinks] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeLinkId, setActiveLinkId] = useState(null);
  const [linkPendingDelete, setLinkPendingDelete] = useState(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const selection = useRowSelection();
  const pagination = usePagination(links);
  const pageIds = pagination.pageItems.map((link) => link.id);

  const stats = useMemo(() => {
    const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
    const top = links.reduce((best, link) => (!best || link.clicks > best.clicks ? link : best), null);
    return { totalClicks, average: links.length ? Math.round(totalClicks / links.length) : 0, top };
  }, [links]);

  function loadLinks() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getLinks()
      .then((data) => {
        setLinks(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadLinks();
  }, []);

  function handleCreateSubmit(formValues) {
    createLink(formValues).then((newLink) => {
      setLinks((current) => [newLink, ...current]);
      setIsCreateModalOpen(false);
      showToast({ type: 'success', title: 'Short link created', message: `${brand.website}/l/${newLink.slug}` });
    });
  }

  function handleCopy(link) {
    const shortUrl = `${brand.website}/l/${link.slug}`;
    copyToClipboard(`https://${shortUrl}`).then((copied) =>
      showToast(
        copied
          ? { type: 'success', title: 'Copied to clipboard', message: shortUrl }
          : { type: 'error', title: 'Could not copy', message: shortUrl }
      )
    );
  }

  function handleBulkDeleteConfirmed() {
    const ids = [...selection.selectedIds];
    deleteLinks(ids).then(() => {
      setLinks((current) => current.filter((link) => !ids.includes(link.id)));
      selection.clear();
      setIsBulkDeleteOpen(false);
      showToast({ type: 'success', title: `${ids.length} ${ids.length === 1 ? 'link' : 'links'} deleted` });
    });
  }

  function handleDeleteConfirmed() {
    if (!linkPendingDelete) return;
    deleteLink(linkPendingDelete.id).then(() => {
      setLinks((current) => current.filter((link) => link.id !== linkPendingDelete.id));
      setLinkPendingDelete(null);
      showToast({ type: 'success', title: 'Link deleted' });
    });
  }

  const activeLink = links.find((link) => link.id === activeLinkId) || null;

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.linkShortener')} subtitle="Loading your links..." />
        <SkeletonTable rows={4} columns={4} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.linkShortener')} />
        <ErrorState onRetry={loadLinks} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.linkShortener')}
        subtitle={t('pages.links')}
        guideChapterId="links"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <Icon name="Link2" size={16} />
            Create Link
          </button>
        }
      />

      <StatCardGrid
        cards={[
          { key: 'links', label: 'Total Links', value: links.length, icon: 'Link2', tone: 'primary' },
          { key: 'clicks', label: 'Total Clicks', value: stats.totalClicks.toLocaleString(), icon: 'MousePointerClick', tone: 'sky' },
          { key: 'avg', label: 'Avg. Clicks / Link', value: stats.average.toLocaleString(), icon: 'BarChart3', tone: 'purple' },
          { key: 'top', label: 'Top Link', value: stats.top ? stats.top.clicks.toLocaleString() : '—', icon: 'TrendingUp', tone: 'green', hint: stats.top?.label },
        ]}
      />

      <div className="panel-card">
        {links.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={selection} show={links.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkDeleteOpen(true)}>
            <Icon name="Trash2" size={14} /> Delete
          </button>
        </BulkActionBar>
        <div className="panel-card__body panel-card__body--flush">
          {links.length === 0 ? (
            <EmptyState
              icon="Link2"
              title="No links yet"
              description="Create a short link to start tracking clicks on anything you share."
              actionLabel="Create Link"
              onAction={() => setIsCreateModalOpen(true)}
            />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {pagination.pageItems.map((link) => (
                <div key={link.id} className="surface-card">
                  <div className="d-flex align-items-start gap-2">
                    <RowCheckbox id={link.id} selection={selection} label={`Select link ${link.label}`} />
                    <div className="table-row-title mb-1">{link.label}</div>
                  </div>
                  <div className="small text-primary-custom mb-2">
                    {brand.website}/l/{link.slug}
                  </div>
                  <div className="small text-muted-custom text-truncate mb-3">{link.destinationUrl}</div>
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-semibold">{link.clicks.toLocaleString()} clicks</span>
                    <span className="small text-muted-custom">{formatDate(link.createdAt)}</span>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <button type="button" className="btn btn-sm btn-outline-secondary-custom flex-grow-1" onClick={() => setActiveLinkId(link.id)}>
                      View Stats
                    </button>
                    <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" onClick={() => handleCopy(link)} aria-label="Copy link">
                      <Icon name="Copy" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon-sm btn-outline-secondary-custom text-danger"
                      onClick={() => setLinkPendingDelete(link)}
                      aria-label="Delete link"
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
                    <th>Link</th>
                    <th>Destination</th>
                    <th>Clicks</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((link) => (
                    <tr key={link.id} className={selection.isSelected(link.id) ? 'is-selected' : ''}>
                      <td className="table-checkbox-col">
                        <RowCheckbox id={link.id} selection={selection} label={`Select link ${link.label}`} />
                      </td>
                      <td role="button" onClick={() => setActiveLinkId(link.id)}>
                        <div className="table-row-title">{link.label}</div>
                        <div className="table-row-subtitle text-primary-custom">
                          {brand.website}/l/{link.slug}
                        </div>
                      </td>
                      <td role="button" onClick={() => setActiveLinkId(link.id)}>
                        <span className="table-cell-truncate d-inline-block">{link.destinationUrl}</span>
                      </td>
                      <td role="button" onClick={() => setActiveLinkId(link.id)}>
                        {link.clicks.toLocaleString()}
                      </td>
                      <td role="button" onClick={() => setActiveLinkId(link.id)}>
                        {formatDate(link.createdAt)}
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => handleCopy(link)}
                            aria-label="Copy link"
                            data-tooltip="Copy"
                          >
                            <Icon name="Copy" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => setLinkPendingDelete(link)}
                            aria-label="Delete link"
                            data-tooltip="Delete"
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
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title={`Delete ${selection.count} ${selection.count === 1 ? 'link' : 'links'}?`}
        message="Anyone who already has these short links will get a broken link once they are deleted."
        confirmLabel="Delete"
        isDanger
      />

      <CreateLinkModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSubmit={handleCreateSubmit} />

      <LinkDetailModal link={activeLink} onClose={() => setActiveLinkId(null)} />

      <ConfirmDialog
        isOpen={Boolean(linkPendingDelete)}
        onClose={() => setLinkPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        title="Delete this link?"
        message="Anyone who already has this short link will get a broken link once it's deleted."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

export default LinkShortener;
