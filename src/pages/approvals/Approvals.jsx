import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ApprovalDetailModal from '../../components/approvals/ApprovalDetailModal';
import Icon from '../../components/common/Icon';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import { getApprovals, approveRequest, rejectRequest } from '../../services/api/approvalsApi';
import { API_ENABLED } from '../../config/runtime';
import { REQUEST_STATUS, APPROVAL_STATUS } from '../../config/constants';
import { formatRelativeTime } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

function Approvals() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [approvals, setApprovals] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [activeApprovalId, setActiveApprovalId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isBulkRejectOpen, setIsBulkRejectOpen] = useState(false);
  const selection = useRowSelection();

  const filteredApprovals = useMemo(
    () => approvals.filter((approval) => statusFilter === 'all' || approval.status === statusFilter),
    [approvals, statusFilter]
  );
  const pagination = usePagination(filteredApprovals, { resetKey: statusFilter });
  const pageIds = pagination.pageItems.map((approval) => approval.id);

  function loadApprovals() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getApprovals()
      .then((data) => {
        setApprovals(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadApprovals();
  }, []);

  const activeApproval = approvals.find((approval) => approval.id === activeApprovalId) || null;

  function handleApprove(approvalId) {
    approveRequest(approvalId).then(
      () => {
        // Once approved a post leaves this queue entirely (it becomes a normal scheduled/published post,
        // tracked from Posts instead), so the API-backed list is reloaded rather than patched in place.
        if (API_ENABLED) loadApprovals();
        else setApprovals((current) => current.map((approval) => (approval.id === approvalId ? { ...approval, status: APPROVAL_STATUS.APPROVED } : approval)));
        setActiveApprovalId(null);
        showToast({ type: 'success', title: 'Post approved' });
      },
      (error) => showToast({ type: 'error', title: 'Could not approve that post', message: error.message })
    );
  }

  function handleReject(approvalId, reason) {
    rejectRequest(approvalId, reason).then(
      () => {
        if (API_ENABLED) {
          loadApprovals();
        } else {
          setApprovals((current) =>
            current.map((approval) =>
              approval.id === approvalId
                ? {
                    ...approval,
                    status: APPROVAL_STATUS.REJECTED,
                    comments: [
                      ...approval.comments,
                      { id: `c-${Date.now()}`, author: 'Nitesh Bhardwaj', text: reason, time: new Date().toISOString() },
                    ],
                  }
                : approval
            )
          );
        }
        setActiveApprovalId(null);
        showToast({ type: 'info', title: 'Post rejected' });
      },
      (error) => showToast({ type: 'error', title: 'Could not reject that post', message: error.message })
    );
  }

  // Only requests still waiting on a decision can be approved or rejected in bulk.
  const isPending = (approval) => approval.status === APPROVAL_STATUS.SUBMITTED || approval.status === APPROVAL_STATUS.UNDER_REVIEW;

  function pendingSelectedIds() {
    return [...selection.selectedIds].filter((id) => {
      const approval = approvals.find((item) => item.id === id);
      return approval && isPending(approval);
    });
  }

  function handleBulkApprove() {
    const ids = pendingSelectedIds();
    if (ids.length === 0) {
      showToast({ type: 'info', title: 'Nothing to approve', message: 'Only pending requests can be approved.' });
      return;
    }
    Promise.allSettled(ids.map((id) => approveRequest(id))).then((results) => {
      const okCount = results.filter((result) => result.status === 'fulfilled').length;
      if (API_ENABLED) loadApprovals();
      else setApprovals((current) => current.map((approval) => (ids.includes(approval.id) ? { ...approval, status: APPROVAL_STATUS.APPROVED } : approval)));
      selection.clear();
      showToast({
        type: okCount === ids.length ? 'success' : 'error',
        title: `${okCount} ${okCount === 1 ? 'post' : 'posts'} approved`,
        message: okCount < ids.length ? `${ids.length - okCount} could not be approved.` : undefined,
      });
    });
  }

  function handleBulkRejectConfirmed() {
    const ids = pendingSelectedIds();
    setIsBulkRejectOpen(false);
    if (ids.length === 0) return;
    Promise.allSettled(ids.map((id) => rejectRequest(id, 'Rejected in bulk'))).then((results) => {
      const okCount = results.filter((result) => result.status === 'fulfilled').length;
      if (API_ENABLED) loadApprovals();
      else setApprovals((current) => current.map((approval) => (ids.includes(approval.id) ? { ...approval, status: APPROVAL_STATUS.REJECTED } : approval)));
      selection.clear();
      showToast({
        type: okCount === ids.length ? 'info' : 'error',
        title: `${okCount} ${okCount === 1 ? 'post' : 'posts'} rejected`,
        message: okCount < ids.length ? `${ids.length - okCount} could not be rejected.` : undefined,
      });
    });
  }

  const statusCount = (status) => approvals.filter((approval) => approval.status === status).length;
  const cardFilter = (value) => ({ isActive: statusFilter === value, onClick: () => setStatusFilter((current) => (value === 'all' || current === value ? 'all' : value)) });
  const statCards = [
    { key: 'all', label: 'All Requests', value: approvals.length, icon: 'ClipboardList', tone: 'primary', ...cardFilter('all') },
    { key: 'submitted', label: 'Submitted', value: statusCount(APPROVAL_STATUS.SUBMITTED), icon: 'Send', tone: 'amber', ...cardFilter(APPROVAL_STATUS.SUBMITTED) },
    { key: 'review', label: 'Under Review', value: statusCount(APPROVAL_STATUS.UNDER_REVIEW), icon: 'Eye', tone: 'sky', ...cardFilter(APPROVAL_STATUS.UNDER_REVIEW) },
    { key: 'approved', label: 'Approved', value: statusCount(APPROVAL_STATUS.APPROVED), icon: 'CheckCircle2', tone: 'green', ...cardFilter(APPROVAL_STATUS.APPROVED) },
    { key: 'rejected', label: 'Rejected', value: statusCount(APPROVAL_STATUS.REJECTED), icon: 'XCircle', tone: 'red', ...cardFilter(APPROVAL_STATUS.REJECTED) },
  ];

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.approvals')} subtitle="Loading approval requests..." />
        <SkeletonTable rows={4} columns={4} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.approvals')} />
        <ErrorState onRetry={loadApprovals} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('nav.approvals')} subtitle={t('pages.approvals')} guideChapterId="approvals" />

      <StatCardGrid cards={statCards} />

      <div className="panel-card">
        {filteredApprovals.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={selection} show={filteredApprovals.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={handleBulkApprove}>
            <Icon name="CheckCircle2" size={14} /> Approve
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkRejectOpen(true)}>
            <Icon name="XCircle" size={14} /> Reject
          </button>
        </BulkActionBar>
        <div className="panel-card__body panel-card__body--flush">
          {approvals.length === 0 ? (
            <EmptyState icon="CheckSquare" title="Nothing to review" description="Posts submitted for approval will appear here." />
          ) : filteredApprovals.length === 0 ? (
            <EmptyState icon="CheckSquare" title="No requests here" description="Try another status." />
          ) : (
            <div className="d-flex flex-column">
              <label className="list-select-row">
                <SelectAllCheckbox ids={pageIds} selection={selection} label="Select all requests on this page" />
                <span>Select all on this page</span>
              </label>
              {pagination.pageItems.map((approval) => (
                <div
                  key={approval.id}
                  className={`agenda-group__post border-bottom px-5 py-3 ${selection.isSelected(approval.id) ? 'is-selected' : ''}`.trim()}
                  onClick={() => setActiveApprovalId(approval.id)}
                  role="button"
                  tabIndex={0}
                >
                  <RowCheckbox id={approval.id} selection={selection} label={`Select request from ${approval.submittedBy}`} />
                  <Avatar name={approval.submittedBy} size="sm" />
                  <div className="flex-grow-1">
                    <div className="table-cell-truncate">{approval.postContent}</div>
                    <div className="small text-muted-custom">
                      {approval.submittedBy} · {formatRelativeTime(approval.submittedAt)}
                    </div>
                  </div>
                  <div className="d-flex gap-1">
                    {approval.platforms.map((platformKey) => (
                      <PlatformIcon key={platformKey} platformKey={platformKey} size={22} />
                    ))}
                  </div>
                  <StatusBadge status={approval.status} />
                </div>
              ))}
            </div>
          )}
        </div>
        <Pager pagination={pagination} />
      </div>

      <ConfirmDialog
        isOpen={isBulkRejectOpen}
        onClose={() => setIsBulkRejectOpen(false)}
        onConfirm={handleBulkRejectConfirmed}
        title="Reject the selected requests?"
        message="Only requests still waiting for a decision will be rejected. Their authors will see “Rejected in bulk” as the reason."
        confirmLabel="Reject"
        isDanger
      />

      <ApprovalDetailModal
        approval={activeApproval}
        onClose={() => setActiveApprovalId(null)}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}

export default Approvals;
