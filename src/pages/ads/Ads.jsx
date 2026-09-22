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
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import useMediaQuery from '../../hooks/useMediaQuery';
import { getAds, getAdAccounts, updateAdsStatus, deleteAds, isPlacementConnected } from '../../services/api/adsApi';
import { AD_DATA_END_DATE } from '../../services/mock/adsMock';
import { AD_DATE_RANGES, AD_NETWORKS, AD_OBJECTIVES, AD_STATUS, AD_STATUS_LABELS } from '../../config/adPlatforms';
import { getPlatformByKey, PLATFORMS } from '../../config/platforms';
import { REQUEST_STATUS } from '../../config/constants';
import { percentChange, seriesForAds, spendByPlatform, sliceRange, sumDaily, totalsForAds } from '../../utils/adMetrics';
import { downloadAdsDailyCsv, downloadAdsSummaryCsv, printAdsReport } from '../../utils/adReports';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, formatPercent } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

const AD_PLATFORM_KEYS = [...new Set(AD_NETWORKS.flatMap((network) => network.platforms))];
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Ad accounts' },
];

// Compared with the period just before; a huge jump means there was nothing to compare with.
const deltaHint = (change) => {
  if (change === null) return undefined;
  if (change > 300) return 'New activity';
  return `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs before`;
};
const objectiveLabel = (key) => AD_OBJECTIVES.find((objective) => objective.key === key)?.label || key;

function Ads() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'accounts' ? 'accounts' : 'overview';

  const [ads, setAds] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [days, setDays] = useState(30);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const selection = useRowSelection();

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    Promise.all([getAds(), getAdAccounts()])
      .then(([adList, accountList]) => {
        setAds(adList);
        setAccounts(accountList);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
  }, []);

  const filteredAds = useMemo(
    () =>
      ads.filter((ad) => {
        const matchesPlatform = platformFilter === 'all' || ad.platforms.includes(platformFilter);
        const matchesStatus = statusFilter === 'all' || ad.status === statusFilter;
        return matchesPlatform && matchesStatus;
      }),
    [ads, platformFilter, statusFilter]
  );

  const pagination = usePagination(filteredAds, { resetKey: `${platformFilter}|${statusFilter}|${days}`, initialSize: 25 });
  const pageIds = pagination.pageItems.map((ad) => ad.id);

  const current = useMemo(() => totalsForAds(filteredAds, days, AD_DATA_END_DATE), [filteredAds, days]);
  const previous = useMemo(() => totalsForAds(filteredAds, days, AD_DATA_END_DATE, 1), [filteredAds, days]);
  const series = useMemo(() => seriesForAds(filteredAds, days, AD_DATA_END_DATE), [filteredAds, days]);
  const platformSpend = useMemo(() => spendByPlatform(filteredAds, days, AD_DATA_END_DATE), [filteredAds, days]);
  const perAdTotals = useMemo(() => {
    const map = new Map();
    ads.forEach((ad) => map.set(ad.id, sumDaily(sliceRange(ad.daily, days, AD_DATA_END_DATE))));
    return map;
  }, [ads, days]);

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
    [platformFilter !== 'all' ? getPlatformByKey(platformFilter)?.label : null, statusFilter !== 'all' ? AD_STATUS_LABELS[statusFilter] : null]
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

  const connectedCount = accounts.filter((account) => account.isConnected).length;

  const statCards = [
    { key: 'spend', label: 'Total Spend', value: formatCurrency(current.spend), icon: 'Wallet', tone: 'primary', hint: deltaHint(percentChange(current.spend, previous.spend)) },
    { key: 'impressions', label: 'Impressions', value: formatCompactNumber(current.impressions), icon: 'Eye', tone: 'sky', hint: deltaHint(percentChange(current.impressions, previous.impressions)) },
    { key: 'clicks', label: 'Clicks', value: formatNumber(current.clicks), icon: 'MousePointerClick', tone: 'purple', hint: deltaHint(percentChange(current.clicks, previous.clicks)) },
    { key: 'ctr', label: 'CTR', value: formatPercent(current.ctr), icon: 'Percent', tone: 'green' },
    { key: 'cpc', label: 'Avg. CPC', value: formatCurrency(current.cpc), icon: 'Coins', tone: 'amber' },
    { key: 'results', label: 'Results', value: formatNumber(current.conversions), icon: 'Target', tone: 'red', hint: deltaHint(percentChange(current.conversions, previous.conversions)) },
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
            {tab.key === 'accounts' ? <span className="ads-tab-count">{connectedCount}/{accounts.length}</span> : null}
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
          {(() => {
            const missing = AD_NETWORKS.filter((network) => accounts.find((item) => item.network === network.key)?.isConnected).flatMap((network) =>
              network.platforms.filter((platformKey) => !isPlacementConnected(platformKey))
            );
            return missing.length > 0 ? (
              <div className="callout-banner callout-banner--warning">
                <Icon name="AlertTriangle" size={16} />
                <span>
                  Your ad account is connected, but ads also need the social profile they appear as. Not connected in Social Accounts yet:{' '}
                  {missing.map((platformKey, index) => (
                    <span key={platformKey}>
                      {index > 0 ? ', ' : ''}
                      <Link to={`/social-accounts/connect/${platformKey}`}>{getPlatformByKey(platformKey)?.label}</Link>
                    </span>
                  ))}
                  . Ads cannot run there until they are.
                </span>
              </div>
            ) : null;
          })()}
          <div className="connect-list">
            {AD_NETWORKS.map((network) => {
              const account = accounts.find((item) => item.network === network.key);
              return (
                <Link key={network.key} to={`/ads/connect/${network.key}`} className="connect-row">
                  <NetworkIcons network={network} size={52} />
                  <span className="connect-row__text">
                    <span className="connect-row__label">{network.label}</span>
                    <span className="connect-row__badge">
                      {network.subtitle}
                      {account?.isConnected ? ` · Account ${account.accountId}` : ''}
                    </span>
                    <span className="network-placements">
                      {network.platforms.map((platformKey) => {
                        const ready = isPlacementConnected(platformKey);
                        return (
                          <span key={platformKey} className={`network-placement ${ready ? 'is-ready' : 'is-missing'}`.trim()}>
                            <Icon name={ready ? 'CheckCircle2' : 'AlertCircle'} size={12} />
                            {getPlatformByKey(platformKey)?.label}
                            {ready ? '' : ' — not connected'}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <span className={`status-badge status-badge--${account?.isConnected ? 'connected' : 'disconnected'} ms-auto`}>
                    {account?.isConnected ? 'Connected' : 'Not connected'}
                  </span>
                  <Icon name="ChevronRight" size={18} className="connect-row__chevron ms-0" />
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {connectedCount === 0 ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                No ad account is connected yet. <Link to="/ads?tab=accounts">Connect one</Link> to start running ads.
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
            </div>
          </div>

          <StatCardGrid cards={statCards} className="stat-card-grid--three" />

          <div className="ads-chart-grid">
            <AdsPerformanceChart series={series} title="Performance" />
            <div className="panel-card">
              <div className="panel-card__header">
                <h3 className="panel-card__title">Spend by platform</h3>
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
                          <div><span>Results</span><strong>{formatNumber(totals.conversions)}</strong></div>
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
                            <td className="text-end">{formatNumber(totals.conversions)}</td>
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
    </div>
  );
}

export default Ads;
