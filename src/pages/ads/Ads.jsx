import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import AdsPerformanceChart from '../../components/ads/AdsPerformanceChart';
import DownloadReportMenu from '../../components/ads/DownloadReportMenu';
import NetworkIcons from '../../components/ads/NetworkIcons';
import TemplateFormModal from '../../components/ads/TemplateFormModal';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import useMediaQuery from '../../hooks/useMediaQuery';
import {
  getAds,
  getAdAccounts,
  syncAdAccounts,
  updateAdsStatus,
  deleteAds,
  getAdCreativeTemplates,
  createAdCreativeTemplate,
  updateAdCreativeTemplate,
  deleteAdCreativeTemplate,
} from '../../services/api/adsApi';
import { getMediaItems } from '../../services/api/mediaApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { AD_DATE_RANGES, AD_NETWORKS, AD_OBJECTIVES, AD_STATUS, AD_STATUS_LABELS } from '../../config/adPlatforms';
import { getPlatformByKey, PLATFORMS } from '../../config/platforms';
import { MEDIA_TYPE, REQUEST_STATUS } from '../../config/constants';
import { adsToday, CONVERSIONS_NOT_TRACKED, percentChange, seriesForAds, spendByPlatform, sliceRange, sumDaily, totalsForAds } from '../../utils/adMetrics';
import { downloadAdsDailyCsv, downloadAdsSummaryCsv, printAdsReport } from '../../utils/adReports';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, formatPercent } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

const AD_PLATFORM_KEYS = [...new Set(AD_NETWORKS.flatMap((network) => network.platforms))];
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Ad accounts' },
  { key: 'library', label: 'Creative Library' },
];

// Compared with the period just before; a huge jump means there was nothing to compare with.
const deltaHint = (change) => {
  if (change === null) return undefined;
  if (change > 300) return 'New activity';
  return `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs before`;
};
const objectiveLabel = (key) => AD_OBJECTIVES.find((objective) => objective.key === key)?.label || key;

const EMPTY_AD_ACCOUNTS = { facebookConnected: false, hasAdsToken: false, hasAdsPermission: false, accounts: [] };

function Ads() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ['accounts', 'library'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';

  const [ads, setAds] = useState([]);
  const [adAccountsData, setAdAccountsData] = useState(EMPTY_AD_ACCOUNTS);
  const [templates, setTemplates] = useState([]);
  const [images, setImages] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [isSyncing, setIsSyncing] = useState(false);
  const [days, setDays] = useState(30);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [adAccountFilter, setAdAccountFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState(null);
  const selection = useRowSelection();

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    Promise.all([getAds(), getAdAccounts(), getAdCreativeTemplates(), getMediaItems()])
      .then(([adList, accountData, templateList, mediaList]) => {
        setAds(adList);
        setAdAccountsData(accountData);
        setTemplates(templateList);
        setImages(mediaList.filter((item) => item.type === MEDIA_TYPE.IMAGE));
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreateOrUpdateTemplate(payload) {
    const request = editingTemplate ? updateAdCreativeTemplate(editingTemplate.id, payload) : createAdCreativeTemplate(payload);
    request
      .then((template) => {
        setTemplates((current) => (editingTemplate ? current.map((item) => (item.id === template.id ? template : item)) : [template, ...current]));
        setIsTemplateFormOpen(false);
        setEditingTemplate(null);
        showToast({ type: 'success', title: editingTemplate ? 'Template updated' : 'Template saved', message: template.name });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not save the template', message: apiErrorMessage(error) }));
  }

  function handleDeleteTemplateConfirmed() {
    const id = deleteTemplateTarget.id;
    deleteAdCreativeTemplate(id).then(() => {
      setTemplates((current) => current.filter((item) => item.id !== id));
      setDeleteTemplateTarget(null);
      showToast({ type: 'success', title: 'Template deleted' });
    });
  }

  function handleSync() {
    setIsSyncing(true);
    syncAdAccounts()
      .then((accountData) => {
        setAdAccountsData(accountData);
        showToast({
          type: 'success',
          title: 'Ad accounts synced',
          message: `${accountData.accounts.length} ${accountData.accounts.length === 1 ? 'account' : 'accounts'} found.`,
        });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not sync ad accounts', message: apiErrorMessage(error) }))
      .finally(() => setIsSyncing(false));
  }

  // Campaign names are real but auto-generated (createCampaign/createBulkCampaign always name the
  // campaign after the ad's own name — see adsService.js's present()), so this list can have
  // duplicates when several ads share one campaign (a Phase 4 bulk batch) — that's fine, the filter
  // just groups by the name shown, same as a person would expect.
  const campaignNames = useMemo(() => [...new Set(ads.map((ad) => ad.campaignName).filter(Boolean))].sort(), [ads]);

  const filteredAds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ads.filter((ad) => {
      const matchesPlatform = platformFilter === 'all' || ad.platforms.includes(platformFilter);
      const matchesStatus = statusFilter === 'all' || ad.status === statusFilter;
      const matchesAccount = adAccountFilter === 'all' || ad.adAccountId === adAccountFilter;
      const matchesCampaign = campaignFilter === 'all' || ad.campaignName === campaignFilter;
      const matchesSearch = !term || ad.name.toLowerCase().includes(term);
      return matchesPlatform && matchesStatus && matchesAccount && matchesCampaign && matchesSearch;
    });
  }, [ads, platformFilter, statusFilter, adAccountFilter, campaignFilter, searchTerm]);

  const pagination = usePagination(filteredAds, { resetKey: `${platformFilter}|${statusFilter}|${adAccountFilter}|${campaignFilter}|${searchTerm}|${days}`, initialSize: 25 });
  const pageIds = pagination.pageItems.map((ad) => ad.id);

  const endDate = adsToday();
  const current = useMemo(() => totalsForAds(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const previous = useMemo(() => totalsForAds(filteredAds, days, endDate, 1), [filteredAds, days, endDate]);
  const series = useMemo(() => seriesForAds(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const platformSpend = useMemo(() => spendByPlatform(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const perAdTotals = useMemo(() => {
    const map = new Map();
    ads.forEach((ad) => map.set(ad.id, sumDaily(sliceRange(ad.daily, days, endDate))));
    return map;
  }, [ads, days, endDate]);

  function updateTab(tab) {
    setSearchParams(tab === 'overview' ? {} : { tab });
  }

  function handleBulkStatus(status) {
    const ids = [...selection.selectedIds].filter((id) => {
      const ad = ads.find((item) => item.id === id);
      return ad && (status === AD_STATUS.PAUSED ? ad.status === AD_STATUS.ACTIVE : ad.status === AD_STATUS.PAUSED);
    });
    if (ids.length === 0) {
      showToast({ type: 'info', title: 'Nothing to change', message: status === AD_STATUS.PAUSED ? 'Only active ads can be paused.' : 'Only paused ads can be resumed.' });
      return;
    }
    updateAdsStatus(ids, status).then(() => {
      setAds((currentAds) => currentAds.map((ad) => (ids.includes(ad.id) ? { ...ad, status } : ad)));
      selection.clear();
      showToast({ type: 'success', title: `${ids.length} ${ids.length === 1 ? 'ad' : 'ads'} ${status === AD_STATUS.PAUSED ? 'paused' : 'resumed'}` });
    });
  }

  function handleBulkDeleteConfirmed() {
    const ids = [...selection.selectedIds];
    deleteAds(ids).then(() => {
      setAds((currentAds) => currentAds.filter((ad) => !ids.includes(ad.id)));
      selection.clear();
      setIsBulkDeleteOpen(false);
      showToast({ type: 'success', title: `${ids.length} ${ids.length === 1 ? 'ad' : 'ads'} deleted` });
    });
  }

  const filterLabel =
    [
      platformFilter !== 'all' ? getPlatformByKey(platformFilter)?.label : null,
      statusFilter !== 'all' ? AD_STATUS_LABELS[statusFilter] : null,
      adAccountFilter !== 'all' ? adAccountsData.accounts.find((account) => account.id === adAccountFilter)?.name : null,
      campaignFilter !== 'all' ? campaignFilter : null,
      searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'All ads';

  function handlePrint() {
    if (!printAdsReport(filteredAds, days, filterLabel)) {
      showToast({ type: 'error', title: 'Pop-up blocked', message: 'Allow pop-ups for this site to open the PDF report.' });
    }
  }

  const reportOptions = [
    {
      label: 'Summary (CSV)',
      description: 'One row per ad — opens in Excel or Sheets',
      icon: 'FileSpreadsheet',
      onClick: () => {
        downloadAdsSummaryCsv(filteredAds, days);
        showToast({ type: 'success', title: 'Report downloaded', message: `${filteredAds.length} ads · last ${days} days` });
      },
    },
    {
      label: 'Day-by-day (CSV)',
      description: 'Every ad, every day in the range',
      icon: 'CalendarRange',
      onClick: () => {
        downloadAdsDailyCsv(filteredAds, days);
        showToast({ type: 'success', title: 'Report downloaded', message: `Daily figures · last ${days} days` });
      },
    },
    { label: 'PDF report', description: 'Print view — choose “Save as PDF”', icon: 'FileText', onClick: handlePrint },
  ];

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.ads')} subtitle="Loading your ads..." />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.ads')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  const connectedCount = adAccountsData.accounts.length;

  const statCards = [
    { key: 'spend', label: 'Total Spend', value: formatCurrency(current.spend), icon: 'Wallet', tone: 'primary', hint: deltaHint(percentChange(current.spend, previous.spend)) },
    { key: 'impressions', label: 'Impressions', value: formatCompactNumber(current.impressions), icon: 'Eye', tone: 'sky', hint: deltaHint(percentChange(current.impressions, previous.impressions)) },
    { key: 'clicks', label: 'Clicks', value: formatNumber(current.clicks), icon: 'MousePointerClick', tone: 'purple', hint: deltaHint(percentChange(current.clicks, previous.clicks)) },
    { key: 'ctr', label: 'CTR', value: formatPercent(current.ctr), icon: 'Percent', tone: 'green' },
    { key: 'cpc', label: 'Avg. CPC', value: formatCurrency(current.cpc), icon: 'Coins', tone: 'amber' },
    { key: 'results', label: 'Results', value: CONVERSIONS_NOT_TRACKED, icon: 'Target', tone: 'red', hint: 'No Pixel or Lead Form is set up for these ads' },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.ads')}
        subtitle={t('pages.ads')}
        guideChapterId="ads"
        actions={
          <>
            <DownloadReportMenu options={reportOptions} disabled={filteredAds.length === 0} />
            <button type="button" className="btn btn-primary" onClick={() => navigate('/ads/create')}>
              <Icon name="Plus" size={16} />
              Create Ad
            </button>
          </>
        }
      />

      <div className="tab-strip mb-4">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" className={`tab-strip__item ${activeTab === tab.key ? 'is-active' : ''}`.trim()} onClick={() => updateTab(tab.key)}>
            {tab.label}
            {tab.key === 'accounts' ? <span className="ads-tab-count">{connectedCount}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' ? (
        <>
          <div className="callout-banner callout-banner--info">
            <Icon name="Wallet" size={16} />
            <span>
              Ads run on <strong>your own ad accounts</strong>. The ad platforms’ APIs are free to use, and the money you spend on ads is billed by each platform to the payment
              method on your ad account — Social never charges for ads or takes a cut of your budget.
            </span>
          </div>

          {!adAccountsData.facebookConnected ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                Facebook is not connected yet. <Link to="/social-accounts/connect/facebook">Connect it in Social Accounts</Link> — Meta Ads uses that same connection, there is
                no separate login for Ads.
              </span>
            </div>
          ) : !adAccountsData.hasAdsToken ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                Facebook is connected, but your Ads token hasn’t been added yet.{' '}
                <Link to="/social-accounts/connect/facebook">Open Social Accounts → Facebook</Link> and fill in the “User access token — Ads access” field.
              </span>
            </div>
          ) : !adAccountsData.hasAdsPermission ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                Your saved Ads token doesn’t have the right permissions.{' '}
                <Link to="/social-accounts/connect/facebook">Open Social Accounts → Facebook</Link> and paste a new one with ads_management and ads_read granted.
              </span>
            </div>
          ) : (
            <div className="panel-card mb-4">
              <div className="panel-card__body d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="fw-semibold">Facebook connection ready for Ads</div>
                  <p className="text-muted-custom small mb-0">Ad accounts below come straight from Meta — nothing is entered here by hand.</p>
                </div>
                <button type="button" className="btn btn-outline-primary-custom" onClick={handleSync} disabled={isSyncing}>
                  {isSyncing ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Syncing...
                    </>
                  ) : (
                    <>
                      <Icon name="RefreshCw" size={16} /> Sync Ad Accounts
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {adAccountsData.accounts.length === 0 ? (
            <EmptyState
              icon="Wallet"
              title="No ad accounts found yet"
              description={
                adAccountsData.hasAdsPermission
                  ? 'Click "Sync Ad Accounts" above to look for real Meta ad accounts on this connection.'
                  : 'Connect Facebook with Ads access, then sync to see your real Meta ad accounts here.'
              }
            />
          ) : (
            <div className="connect-list">
              {adAccountsData.accounts.map((account) => (
                <div key={account.id} className="connect-row">
                  <NetworkIcons network={{ platforms: ['facebook', 'instagram'], subtitle: 'Facebook & Instagram' }} size={52} />
                  <span className="connect-row__text">
                    <span className="connect-row__label">{account.name}</span>
                    <span className="connect-row__badge">
                      {account.externalAccountId} · {account.currency}
                      {account.timezone ? ` · ${account.timezone}` : ''}
                      {account.businessName ? ` · ${account.businessName}` : ''}
                    </span>
                    {account.disableReason ? (
                      <span className="network-placements">
                        <span className="network-placement is-missing">
                          <Icon name="AlertCircle" size={12} /> Needs attention on Meta’s side (status {account.accountStatus})
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="status-badge status-badge--connected ms-auto">Ready</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : activeTab === 'library' ? (
        <>
          <div className="callout-banner callout-banner--info">
            <Icon name="LayoutTemplate" size={16} />
            <span>
              Save a headline, text, link and image once, then start from it whenever you build a new ad — no retyping. A template is never launched on its own.
            </span>
          </div>

          <div className="d-flex justify-content-end mb-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingTemplate(null);
                setIsTemplateFormOpen(true);
              }}
            >
              <Icon name="Plus" size={16} /> New Template
            </button>
          </div>

          {templates.length === 0 ? (
            <EmptyState
              icon="LayoutTemplate"
              title="No templates yet"
              description="Save your first creative template to reuse it next time you build an ad."
              actionLabel="New Template"
              onAction={() => {
                setEditingTemplate(null);
                setIsTemplateFormOpen(true);
              }}
            />
          ) : (
            <div className="campaigns-grid">
              {templates.map((template) => (
                <div key={template.id} className="panel-card">
                  <div className="panel-card__body">
                    <div className="d-flex align-items-start gap-3 mb-3">
                      {template.mediaUrl ? (
                        <img src={template.mediaUrl} alt={template.name} className="ad-template-thumb" />
                      ) : (
                        <div className="ad-template-thumb ad-template-thumb--empty">
                          <Icon name="Image" size={20} />
                        </div>
                      )}
                      <div className="flex-grow-1 overflow-hidden">
                        <div className="table-row-title text-truncate">{template.name}</div>
                        <div className="table-row-subtitle text-truncate">{template.headline || 'No headline'}</div>
                      </div>
                    </div>
                    <p className="text-secondary-custom small mb-3 ad-template-text">{template.text || 'No ad text'}</p>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary-custom flex-grow-1"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsTemplateFormOpen(true);
                        }}
                      >
                        <Icon name="Pencil" size={14} /> Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleteTemplateTarget(template)}>
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {connectedCount === 0 ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                No ad account found yet. <Link to="/ads?tab=accounts">Set up Ad accounts</Link> to start running ads.
              </span>
            </div>
          ) : null}

          <div className="panel-card mb-4">
            <div className="panel-card__body filter-bar">
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="CalendarRange" size={13} /> Period
                </span>
                <select className="form-select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                  {AD_DATE_RANGES.map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Share2" size={13} /> Platform
                </span>
                <select className="form-select" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                  <option value="all">All platforms</option>
                  {PLATFORMS.filter((platform) => AD_PLATFORM_KEYS.includes(platform.key)).map((platform) => (
                    <option key={platform.key} value={platform.key}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Activity" size={13} /> Status
                </span>
                <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {Object.values(AD_STATUS).map((status) => (
                    <option key={status} value={status}>
                      {AD_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              {adAccountsData.accounts.length > 1 ? (
                <div className="filter-bar__field">
                  <span className="filter-bar__label">
                    <Icon name="Wallet" size={13} /> Ad account
                  </span>
                  <select className="form-select" value={adAccountFilter} onChange={(event) => setAdAccountFilter(event.target.value)}>
                    <option value="all">All ad accounts</option>
                    {adAccountsData.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {campaignNames.length > 1 ? (
                <div className="filter-bar__field">
                  <span className="filter-bar__label">
                    <Icon name="Megaphone" size={13} /> Campaign
                  </span>
                  <select className="form-select" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}>
                    <option value="all">All campaigns</option>
                    {campaignNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Search" size={13} /> Ad name
                </span>
                <input type="search" className="form-control" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search ads..." />
              </div>
            </div>
          </div>

          <StatCardGrid cards={statCards} className="stat-card-grid--three" />

          <div className="ads-chart-grid">
            <AdsPerformanceChart series={series} title="Performance" />
            <div className="panel-card">
              <div className="panel-card__header">
                <h3 className="panel-card__title">Estimated spend by platform</h3>
                <span
                  data-tooltip="Meta reports spend at the ad level, not per placement — when an ad runs on more than one platform, its spend is split evenly across them here, not measured separately by Meta."
                  data-tooltip-position="bottom"
                >
                  <Icon name="Info" size={14} className="text-muted-custom" />
                </span>
              </div>
              <div className="panel-card__body d-flex flex-column gap-3">
                {platformSpend.length === 0 ? (
                  <p className="text-muted-custom mb-0">No spend in this period.</p>
                ) : (
                  platformSpend.map((row) => {
                    const share = current.spend ? (row.spend / current.spend) * 100 : 0;
                    return (
                      <div key={row.platform} className="d-flex align-items-center gap-3">
                        <PlatformIcon platformKey={row.platform} size={28} />
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between small mb-1">
                            <span>{getPlatformByKey(row.platform)?.label}</span>
                            <span className="text-muted-custom">
                              {formatCurrency(row.spend)} · {Math.round(share)}%
                            </span>
                          </div>
                          <div className="progress platform-performance-bar">
                            <div className="progress-bar" role="progressbar" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">Your ads</h3>
              <span className="text-muted-custom small">{filteredAds.length} of {ads.length}</span>
            </div>
            {filteredAds.length > 0 ? <TableToolbar pagination={pagination} /> : null}
            <BulkActionBar selection={selection} show={filteredAds.length > 0}>
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatus(AD_STATUS.PAUSED)}>
                <Icon name="Pause" size={14} /> Pause
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatus(AD_STATUS.ACTIVE)}>
                <Icon name="Play" size={14} /> Resume
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkDeleteOpen(true)}>
                <Icon name="Trash2" size={14} /> Delete
              </button>
            </BulkActionBar>

            <div className="panel-card__body panel-card__body--flush">
              {ads.length === 0 ? (
                <EmptyState icon="Megaphone" title="No ads yet" description="Create your first ad to start reaching new people." actionLabel="Create Ad" onAction={() => navigate('/ads/create')} />
              ) : filteredAds.length === 0 ? (
                <EmptyState icon="Megaphone" title="No ads match" description="Try another platform or status." />
              ) : isMobile ? (
                <div className="d-flex flex-column gap-3 p-4">
                  {pagination.pageItems.map((ad) => {
                    const totals = perAdTotals.get(ad.id);
                    return (
                      <div key={ad.id} className="surface-card">
                        <div className="d-flex align-items-start gap-2">
                          <RowCheckbox id={ad.id} selection={selection} label={`Select ${ad.name}`} />
                          <div className="flex-grow-1 overflow-hidden" role="button" tabIndex={0} onClick={() => navigate(`/ads/${ad.id}`)}>
                            <div className="table-row-title text-truncate">{ad.name}</div>
                            <div className="table-row-subtitle">{objectiveLabel(ad.objective)}</div>
                          </div>
                          <StatusBadge status={ad.status} label={AD_STATUS_LABELS[ad.status]} />
                        </div>
                        <div className="ad-mobile-metrics" onClick={() => navigate(`/ads/${ad.id}`)} role="button" tabIndex={0}>
                          <div><span>Spent</span><strong>{formatCurrency(totals.spend)}</strong></div>
                          <div><span>Clicks</span><strong>{formatNumber(totals.clicks)}</strong></div>
                          <div><span>CTR</span><strong>{formatPercent(totals.ctr)}</strong></div>
                          <div><span>Results</span><strong className="text-muted-custom">{CONVERSIONS_NOT_TRACKED}</strong></div>
                        </div>
                        <div className="d-flex gap-1 mt-2">
                          {ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={22} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="table-checkbox-col"><SelectAllCheckbox ids={pageIds} selection={selection} /></th>
                        <th>Ad</th>
                        <th>Status</th>
                        <th>Budget</th>
                        <th className="text-end">Spent</th>
                        <th className="text-end">Impressions</th>
                        <th className="text-end">Clicks</th>
                        <th className="text-end">CTR</th>
                        <th className="text-end">Results</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.pageItems.map((ad) => {
                        const totals = perAdTotals.get(ad.id);
                        return (
                          <tr key={ad.id} className={selection.isSelected(ad.id) ? 'is-selected' : ''}>
                            <td className="table-checkbox-col"><RowCheckbox id={ad.id} selection={selection} label={`Select ${ad.name}`} /></td>
                            <td role="button" onClick={() => navigate(`/ads/${ad.id}`)}>
                              <div className="d-flex align-items-center gap-3">
                                <div className="d-flex gap-1">
                                  {ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={24} />)}
                                </div>
                                <div>
                                  <div className="table-row-title">{ad.name}</div>
                                  <div className="table-row-subtitle">{objectiveLabel(ad.objective)} · {formatDate(ad.startDate)} – {formatDate(ad.endDate)}</div>
                                </div>
                              </div>
                            </td>
                            <td><StatusBadge status={ad.status} label={AD_STATUS_LABELS[ad.status]} /></td>
                            <td>{formatCurrency(ad.budget)}<span className="text-muted-custom small"> {ad.budgetType === 'daily' ? '/ day' : 'total'}</span></td>
                            <td className="text-end">{formatCurrency(totals.spend)}</td>
                            <td className="text-end">{formatNumber(totals.impressions)}</td>
                            <td className="text-end">{formatNumber(totals.clicks)}</td>
                            <td className="text-end">{formatPercent(totals.ctr)}</td>
                            <td className="text-end text-muted-custom">{CONVERSIONS_NOT_TRACKED}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <Pager pagination={pagination} />
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title={`Delete ${selection.count} ${selection.count === 1 ? 'ad' : 'ads'}?`}
        message="This removes them from Social. Ads that are already running on the platform should also be stopped in that platform’s own Ads Manager."
        confirmLabel="Delete"
        isDanger
      />

      <TemplateFormModal
        isOpen={isTemplateFormOpen}
        onClose={() => {
          setIsTemplateFormOpen(false);
          setEditingTemplate(null);
        }}
        onSubmit={handleCreateOrUpdateTemplate}
        template={editingTemplate}
        images={images}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTemplateTarget)}
        onClose={() => setDeleteTemplateTarget(null)}
        onConfirm={handleDeleteTemplateConfirmed}
        title={`Delete "${deleteTemplateTarget?.name}"?`}
        message="This removes the template from your library. Ads already built from it are not affected."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

export default Ads;
