import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import PlatformIcon from '../../components/common/PlatformIcon';
import PostListItem from '../../components/posts/PostListItem';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Icon from '../../components/common/Icon';
import { deleteCampaign, getCampaignById } from '../../services/api/campaignsApi';
import { getPosts } from '../../services/api/postsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { useToast } from '../../components/common/ToastProvider';
import { API_ENABLED } from '../../config/runtime';
import { REQUEST_STATUS } from '../../config/constants';
import { formatCompactNumber, formatDate } from '../../utils/formatters';

// Same roles the server lets create/change/delete a campaign.
const MANAGER_ROLES = ['superAdmin', 'admin', 'editor'];

function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const role = useSelector((state) => state.auth.currentUser?.role);
  const canManage = !API_ENABLED || MANAGER_ROLES.includes(role);

  const [campaign, setCampaign] = useState(null);
  const [campaignPosts, setCampaignPosts] = useState([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadCampaign() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    Promise.all([getCampaignById(campaignId), getPosts()])
      .then(([campaignData, posts]) => {
        if (!campaignData) {
          setRequestStatus(REQUEST_STATUS.FAILED);
          return;
        }
        setCampaign(campaignData);
        setCampaignPosts(posts.filter((post) => post.campaignId === campaignId));
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadCampaign();
  }, [campaignId]);

  function handleDeleteConfirmed() {
    setIsDeleting(true);
    deleteCampaign(campaignId).then(
      () => {
        showToast({ type: 'success', title: 'Campaign deleted' });
        navigate('/campaigns');
      },
      (error) => {
        setIsDeleting(false);
        setIsDeleteOpen(false);
        showToast({ type: 'error', title: 'Could not delete the campaign', message: apiErrorMessage(error) });
      }
    );
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title="Campaign" subtitle="Loading campaign details..." />
        <div className="skeleton-card" />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED || !campaign) {
    return (
      <>
        <PageHeader title="Campaign" />
        <ErrorState
          title="Campaign not found"
          description="This campaign may have been deleted, or the link is incorrect."
          onRetry={() => navigate('/campaigns')}
        />
      </>
    );
  }

  return (
    <div className="fade-in">
      <Link to="/campaigns" className="d-inline-flex align-items-center gap-1 small text-secondary-custom mb-3 text-decoration-none">
        <Icon name="ChevronLeft" size={14} /> Back to Campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        subtitle={`${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)} · Owned by ${campaign.owner}`}
        guideChapterId="campaigns"
        actions={
          <>
            <StatusBadge status={campaign.status} />
            {canManage ? (
              <button type="button" className="btn btn-outline-secondary-custom text-danger" onClick={() => setIsDeleteOpen(true)}>
                <Icon name="Trash2" size={16} /> Delete
              </button>
            ) : null}
          </>
        }
      />

      <div className="d-flex align-items-center gap-2 mb-5">
        {campaign.platforms.map((platformKey) => (
          <PlatformIcon key={platformKey} platformKey={platformKey} size={32} />
        ))}
      </div>

      <div className="campaign-detail-stats">
        <div className="kpi-card">
          <span className="kpi-card__label">Posts</span>
          <span className="kpi-card__value">{campaign.postsCount}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Reach</span>
          <span className="kpi-card__value">{formatCompactNumber(campaign.reach)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Engagement</span>
          <span className="kpi-card__value">{formatCompactNumber(campaign.engagement)}</span>
        </div>
      </div>

      <div className="two-col-grid mb-5">
        <div className="kpi-card">
          <span className="kpi-card__label">Published</span>
          <span className="kpi-card__value">{campaign.publishedCount}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Scheduled</span>
          <span className="kpi-card__value">{campaign.scheduledCount}</span>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card__header">
          <h3 className="panel-card__title">Campaign Posts</h3>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('/posts/create', { state: { campaignId: campaign.id } })}>
            <Icon name="Plus" size={14} /> Add Post
          </button>
        </div>
        <div className="panel-card__body panel-card__body--flush">
          {campaignPosts.length === 0 ? (
            <EmptyState icon="FileText" title="No posts yet" description="Posts added to this campaign will appear here." />
          ) : (
            <div className="d-flex flex-column p-2 gap-1">
              {campaignPosts.map((post) => (
                <PostListItem key={post.id} post={post} onClick={() => navigate(`/posts/${post.id}/edit`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirmed}
        title="Delete this campaign?"
        message={`"${campaign.name}" will be removed. Its posts stay exactly as they are — they just won't be grouped under this campaign any more.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        isDanger
      />
    </div>
  );
}

export default CampaignDetail;
