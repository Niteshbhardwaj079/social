import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import CampaignCard from '../../components/campaigns/CampaignCard';
import CampaignFormModal from '../../components/campaigns/CampaignFormModal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { Pager, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import Icon from '../../components/common/Icon';
import { getCampaigns, createCampaign } from '../../services/api/campaignsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { REQUEST_STATUS, CAMPAIGN_STATUS } from '../../config/constants';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

function Campaigns() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const ownerName = useSelector((state) => state.auth.currentUser?.name);
  const [campaigns, setCampaigns] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredCampaigns = useMemo(
    () => campaigns.filter((campaign) => statusFilter === 'all' || campaign.status === statusFilter),
    [campaigns, statusFilter]
  );
  const pagination = usePagination(filteredCampaigns, { resetKey: statusFilter, initialSize: 25 });

  function loadCampaigns() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getCampaigns()
      .then((data) => {
        setCampaigns(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  function handleCreateCampaign(campaignPayload) {
    createCampaign(campaignPayload).then(
      (newCampaign) => {
        setCampaigns((current) => [newCampaign, ...current]);
        setIsFormOpen(false);
        showToast({ type: 'success', title: 'Campaign created', message: `${newCampaign.name} is ready to go.` });
      },
      (error) => showToast({ type: 'error', title: 'Could not create the campaign', message: apiErrorMessage(error) })
    );
  }

  const countOf = (status) => campaigns.filter((campaign) => campaign.status === status).length;
  const card = (value) => ({
    isActive: statusFilter === value,
    onClick: () => setStatusFilter((current) => (value === 'all' || current === value ? 'all' : value)),
  });
  const statCards = [
    { key: 'all', label: 'Total Campaigns', value: campaigns.length, icon: 'Megaphone', tone: 'primary', ...card('all') },
    { key: 'active', label: 'Active', value: countOf(CAMPAIGN_STATUS.ACTIVE), icon: 'Rocket', tone: 'green', ...card(CAMPAIGN_STATUS.ACTIVE) },
    { key: 'scheduled', label: 'Scheduled', value: countOf(CAMPAIGN_STATUS.SCHEDULED), icon: 'CalendarClock', tone: 'sky', ...card(CAMPAIGN_STATUS.SCHEDULED) },
    { key: 'completed', label: 'Completed', value: countOf(CAMPAIGN_STATUS.COMPLETED), icon: 'CheckCircle2', tone: 'purple', ...card(CAMPAIGN_STATUS.COMPLETED) },
    { key: 'paused', label: 'Paused', value: countOf(CAMPAIGN_STATUS.PAUSED), icon: 'PauseCircle', tone: 'slate', ...card(CAMPAIGN_STATUS.PAUSED) },
    { key: 'posts', label: 'Posts in Campaigns', value: campaigns.reduce((sum, campaign) => sum + (campaign.postsCount || 0), 0), icon: 'FileText', tone: 'amber' },
  ];

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.campaigns')} subtitle="Loading your campaigns..." />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.campaigns')} />
        <ErrorState onRetry={loadCampaigns} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.campaigns')}
        subtitle={t('pages.campaigns', { count: campaigns.length })}
        guideChapterId="campaigns"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setIsFormOpen(true)}>
            <Icon name="Plus" size={16} />
            Create Campaign
          </button>
        }
      />

      {campaigns.length === 0 ? null : <StatCardGrid cards={statCards} />}

      {campaigns.length === 0 ? (
        <EmptyState
          icon="Megaphone"
          title="No campaigns yet"
          description="Group related posts into a campaign to track performance together."
          actionLabel="Create Campaign"
          onAction={() => setIsFormOpen(true)}
        />
      ) : filteredCampaigns.length === 0 ? (
        <EmptyState icon="Megaphone" title="No campaigns here" description="Try another status." />
      ) : (
        <>
          <div className="grid-toolbar">
            <TableToolbar pagination={pagination} />
          </div>
          <div className="campaigns-grid">
            {pagination.pageItems.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
          {pagination.totalPages > 1 ? (
            <div className="grid-pager">
              <Pager pagination={pagination} />
            </div>
          ) : null}
        </>
      )}

      <CampaignFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSubmit={handleCreateCampaign} ownerName={ownerName} />
    </div>
  );
}

export default Campaigns;
