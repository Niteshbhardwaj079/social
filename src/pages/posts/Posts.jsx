import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import RejectPostModal from '../../components/posts/RejectPostModal';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DropdownMenu from '../../components/common/DropdownMenu';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import Icon from '../../components/common/Icon';
import { getPosts, deletePost, deletePosts, updatePostsStatus, retryPost, approvePost, rejectPost } from '../../services/api/postsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { getPlatformByKey } from '../../config/platforms';
import { POST_STATUS, POST_STATUS_LABELS, REQUEST_STATUS } from '../../config/constants';
import { formatDateTime } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

// "Publishing" only exists when a server is really sending posts.
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  ...Object.values(POST_STATUS)
    .filter((status) => API_ENABLED || status !== POST_STATUS.PUBLISHING)
    .map((status) => ({ value: status, label: POST_STATUS_LABELS[status] })),
];

// Who may approve, reject and retry (the server checks this too).
const REVIEWER_ROLES = ['superAdmin', 'admin', 'editor'];

/** The one thing worth telling the reader about a post that did not go out: what went wrong. */
function problemText(post) {
  if (post.status === POST_STATUS.REJECTED && post.rejectionReason) return `Rejected: ${post.rejectionReason}`;
  if (post.status !== POST_STATUS.FAILED) return '';
  const failed = post.targets?.find((target) => target.status === 'failed');
  return failed ? `${getPlatformByKey(failed.platform)?.label || failed.platform}: ${failed.error}` : '';
}

function Posts() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams, setSearchParams] = useSearchParams();

  const [posts, setPosts] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [postPendingDelete, setPostPendingDelete] = useState(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [postPendingReject, setPostPendingReject] = useState(null);
  const [busyPostId, setBusyPostId] = useState(null);
  const selection = useRowSelection();
  const role = useSelector((state) => state.auth.currentUser?.role);
  const canReview = API_ENABLED && REVIEWER_ROLES.includes(role);

  function loadPosts() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getPosts()
      .then((data) => {
        setPosts(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  // Reloads the list without flashing the loading skeleton (used after bulk actions).
  function refreshPosts() {
    getPosts()
      .then(setPosts)
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  useEffect(() => {
    loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
      const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [posts, statusFilter, searchTerm]);

  const pagination = usePagination(filteredPosts, { resetKey: `${statusFilter}|${searchTerm}` });
  const pageIds = pagination.pageItems.map((post) => post.id);

  const statusCounts = useMemo(() => {
    const counts = {};
    posts.forEach((post) => {
      counts[post.status] = (counts[post.status] || 0) + 1;
    });
    return counts;
  }, [posts]);

  // Clicking a card filters the list to that status; clicking it again clears the filter.
  const statCards = [
    { key: 'all', label: 'Total Posts', value: posts.length, icon: 'FileText', tone: 'primary', filter: 'all' },
    { key: POST_STATUS.DRAFT, label: 'Draft', value: statusCounts[POST_STATUS.DRAFT] || 0, icon: 'PenLine', tone: 'slate', filter: POST_STATUS.DRAFT },
    { key: POST_STATUS.SCHEDULED, label: 'Scheduled', value: statusCounts[POST_STATUS.SCHEDULED] || 0, icon: 'CalendarClock', tone: 'sky', filter: POST_STATUS.SCHEDULED },
    { key: POST_STATUS.PUBLISHED, label: 'Published', value: statusCounts[POST_STATUS.PUBLISHED] || 0, icon: 'CheckCircle2', tone: 'green', filter: POST_STATUS.PUBLISHED },
    { key: POST_STATUS.PENDING_APPROVAL, label: 'Pending Approval', value: statusCounts[POST_STATUS.PENDING_APPROVAL] || 0, icon: 'Hourglass', tone: 'amber', filter: POST_STATUS.PENDING_APPROVAL },
    { key: POST_STATUS.FAILED, label: 'Failed', value: statusCounts[POST_STATUS.FAILED] || 0, icon: 'AlertOctagon', tone: 'red', filter: POST_STATUS.FAILED },
    { key: POST_STATUS.REJECTED, label: 'Rejected', value: statusCounts[POST_STATUS.REJECTED] || 0, icon: 'XCircle', tone: 'purple', filter: POST_STATUS.REJECTED },
  ].map(({ filter, ...card }) => ({
    ...card,
    isActive: statusFilter === filter,
    onClick: () => setStatusFilter((current) => (filter === 'all' || current === filter ? 'all' : filter)),
  }));

  function showError(error) {
    showToast({ type: 'error', title: apiErrorMessage(error) });
  }

  // The server may skip posts this person cannot change; a reload shows what really happened.
  function noun(count) {
    return `${count} ${count === 1 ? 'post' : 'posts'}`;
  }

  function handleBulkDeleteConfirmed() {
    const ids = [...selection.selectedIds];
    deletePosts(ids)
      .then(({ deleted, skipped }) => {
        selection.clear();
        setIsBulkDeleteOpen(false);
        showToast({
          type: skipped ? 'info' : 'success',
          title: `${noun(deleted)} deleted`,
          message: skipped ? `${noun(skipped)} could not be deleted (not yours, or being published).` : undefined,
        });
        refreshPosts();
      })
      .catch((error) => {
        setIsBulkDeleteOpen(false);
        showError(error);
      });
  }

  function handleBulkMoveToDraft() {
    const ids = [...selection.selectedIds].filter((id) => posts.find((post) => post.id === id)?.status !== POST_STATUS.PUBLISHED);
    if (ids.length === 0) {
      showToast({ type: 'info', title: 'Nothing to move', message: 'Published posts stay published.' });
      return;
    }
    updatePostsStatus(ids, POST_STATUS.DRAFT)
      .then(({ updated, skipped }) => {
        selection.clear();
        showToast({
          type: skipped ? 'info' : 'success',
          title: `${noun(updated)} moved to draft`,
          message: skipped ? `${noun(skipped)} could not be moved.` : undefined,
        });
        refreshPosts();
      })
      .catch(showError);
  }

  function handleDeleteConfirmed() {
    if (!postPendingDelete) return;
    deletePost(postPendingDelete.id)
      .then(() => {
        setPosts((current) => current.filter((post) => post.id !== postPendingDelete.id));
        setPostPendingDelete(null);
        showToast({ type: 'success', title: 'Post deleted' });
      })
      .catch((error) => {
        setPostPendingDelete(null);
        showError(error);
      });
  }

  // Approve / reject / retry are server-side actions. Each one hands back the updated post.
  function runPostAction(post, action, successTitle) {
    setBusyPostId(post.id);
    return action()
      .then((updated) => {
        setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        const failed = updated.targets?.find((target) => target.status === 'failed');
        if (failed) showToast({ type: 'error', title: 'Not everything was published', message: problemText(updated) });
        else showToast({ type: 'success', title: successTitle });
      })
      .catch(showError)
      .finally(() => setBusyPostId(null));
  }

  function handleRejectSubmit(reason) {
    const post = postPendingReject;
    runPostAction(post, () => rejectPost(post.id, reason), 'Post rejected').then(() => setPostPendingReject(null));
  }

  // Buttons for a post waiting on a decision, or one that failed. Empty for everybody else.
  function reviewActions(post) {
    if (!canReview) return [];
    if (post.status === POST_STATUS.PENDING_APPROVAL) {
      return [
        { key: 'approve', label: 'Approve', icon: 'CheckCircle2', run: () => runPostAction(post, () => approvePost(post.id), 'Post approved') },
        { key: 'reject', label: 'Reject', icon: 'XCircle', run: () => setPostPendingReject(post) },
      ];
    }
    if (post.status === POST_STATUS.FAILED) {
      return [{ key: 'retry', label: 'Retry failed platforms', icon: 'RotateCw', run: () => runPostAction(post, () => retryPost(post.id), 'Post published') }];
    }
    return [];
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.posts')} subtitle="Loading your posts..." />
        <SkeletonTable rows={6} columns={5} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.posts')} />
        <ErrorState onRetry={loadPosts} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.posts')}
        subtitle={t('pages.posts', { count: posts.length })}
        guideChapterId="posts"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/posts/create')}>
            <Icon name="PenSquare" size={16} />
            Create Post
          </button>
        }
      />

      <StatCardGrid cards={statCards} />

      <div className="panel-card">
        <div className="panel-card__header flex-wrap gap-3">
          <div className="tab-strip flex-grow-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`tab-strip__item ${statusFilter === filter.value ? 'is-active' : ''}`.trim()}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="search-input search-input--wide">
            <Icon name="Search" size={16} />
            <input
              type="search"
              className="form-control"
              placeholder="Search posts..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchParams(event.target.value ? { search: event.target.value } : {});
              }}
            />
          </div>
        </div>

        {filteredPosts.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={selection} show={filteredPosts.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={handleBulkMoveToDraft}>
            <Icon name="PenLine" size={14} /> Move to draft
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkDeleteOpen(true)}>
            <Icon name="Trash2" size={14} /> Delete
          </button>
        </BulkActionBar>

        <div className="panel-card__body panel-card__body--flush">
          {filteredPosts.length === 0 ? (
            <EmptyState
              icon="FileText"
              title="No posts found"
              description="Try adjusting your filters, or create a new post."
              actionLabel="Create Post"
              onAction={() => navigate('/posts/create')}
            />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {pagination.pageItems.map((post) => (
                <div key={post.id} className="surface-card post-mobile-card">
                  <div className="post-mobile-card__top" onClick={() => navigate(`/posts/${post.id}/edit`)} role="button" tabIndex={0}>
                    <RowCheckbox id={post.id} selection={selection} label={`Select post: ${post.content.slice(0, 30)}`} />
                    <div className="d-flex gap-1 flex-grow-1">
                      {post.platforms.map((platformKey) => (
                        <PlatformIcon key={platformKey} platformKey={platformKey} size={22} />
                      ))}
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                  <p className="post-mobile-card__content" onClick={() => navigate(`/posts/${post.id}/edit`)}>
                    {post.content}
                  </p>
                  {problemText(post) ? <p className="small text-danger mb-2">{problemText(post)}</p> : null}
                  <div className="post-mobile-card__footer">
                    <span className="post-mobile-card__meta">
                      {post.scheduledAt ? formatDateTime(post.scheduledAt) : 'Not scheduled'} · {post.createdBy}
                    </span>
                    <DropdownMenu
                      trigger={
                        <button
                          type="button"
                          className="btn btn-icon-sm btn-outline-secondary-custom"
                          aria-label="Post options"
                          data-tooltip="More options"
                        >
                          <Icon name="MoreVertical" size={16} />
                        </button>
                      }
                    >
                      {({ close }) => (
                        <>
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => {
                              navigate(`/posts/${post.id}/edit`);
                              close();
                            }}
                          >
                            <Icon name="Edit3" size={16} /> Edit
                          </button>
                          {reviewActions(post).map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              className="dropdown-item"
                              disabled={busyPostId === post.id}
                              onClick={() => {
                                action.run();
                                close();
                              }}
                            >
                              <Icon name={action.icon} size={16} /> {action.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="dropdown-item text-danger"
                            onClick={() => {
                              setPostPendingDelete(post);
                              close();
                            }}
                          >
                            <Icon name="Trash2" size={16} /> Delete
                          </button>
                        </>
                      )}
                    </DropdownMenu>
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
                    <th>Content</th>
                    <th>Platforms</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Author</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((post) => (
                    <tr key={post.id} className={selection.isSelected(post.id) ? 'is-selected' : ''}>
                      <td className="table-checkbox-col">
                        <RowCheckbox id={post.id} selection={selection} label={`Select post: ${post.content.slice(0, 30)}`} />
                      </td>
                      <td>
                        <span className="table-row-title d-block table-cell-truncate">{post.content}</span>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          {post.platforms.map((platformKey) => (
                            <PlatformIcon key={platformKey} platformKey={platformKey} size={24} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={post.status} />
                        {problemText(post) ? <div className="small text-danger table-cell-truncate mt-1" title={problemText(post)}>{problemText(post)}</div> : null}
                      </td>
                      <td>{post.scheduledAt ? formatDateTime(post.scheduledAt) : '—'}</td>
                      <td>{post.createdBy}</td>
                      <td>
                        <div className="d-flex gap-2 justify-content-end">
                          {reviewActions(post).map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              className="btn btn-icon-sm btn-outline-secondary-custom"
                              disabled={busyPostId === post.id}
                              onClick={action.run}
                              aria-label={action.label}
                              data-tooltip={action.label}
                            >
                              <Icon name={action.icon} size={14} />
                            </button>
                          ))}
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => navigate(`/posts/${post.id}/edit`)}
                            aria-label="Edit post"
                            data-tooltip="Edit"
                          >
                            <Icon name="Edit3" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon-sm btn-outline-secondary-custom"
                            onClick={() => setPostPendingDelete(post)}
                            aria-label="Delete post"
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

      <RejectPostModal
        post={postPendingReject}
        isBusy={busyPostId === postPendingReject?.id}
        onClose={() => setPostPendingReject(null)}
        onSubmit={handleRejectSubmit}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title={`Delete ${selection.count} ${selection.count === 1 ? 'post' : 'posts'}?`}
        message="This action cannot be undone. The selected posts will be permanently removed."
        confirmLabel="Delete"
        isDanger
      />

      <ConfirmDialog
        isOpen={Boolean(postPendingDelete)}
        onClose={() => setPostPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        title="Delete this post?"
        message="This action cannot be undone. The post will be permanently removed."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

export default Posts;
