import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { Pager, TableToolbar } from '../../components/common/DataTableParts';
import AdsPerformanceChart from '../../components/ads/AdsPerformanceChart';
import AdPreview from '../../components/ads/AdPreview';
import DownloadReportMenu from '../../components/ads/DownloadReportMenu';
import usePagination from '../../hooks/usePagination';
import { getAdById, updateAdsStatus, deleteAds } from '../../services/api/adsApi';
import { AD_DATE_RANGES, AD_OBJECTIVES, AD_STATUS, AD_STATUS_LABELS, getAdNetwork } from '../../config/adPlatforms';
import { getPlatformByKey } from '../../config/platforms';
import { REQUEST_STATUS } from '../../config/constants';
import { adsToday, CONVERSIONS_NOT_TRACKED, seriesForAds, sliceRange, sumDaily } from '../../utils/adMetrics';
import { downloadAdsDailyCsv, downloadAdsSummaryCsv, printAdsReport } from '../../utils/adReports';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, formatPercent } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';

function AdDetail() {
  const { adId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ad, setAd] = useState(null);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [days, setDays] = useState(30);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getAdById(adId)
      .then((data) => {
        setAd(data);
        setRequestStatus(data ? REQUEST_STATUS.SUCCEEDED : REQUEST_STATUS.FAILED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adId]);

  const rangeDays = useMemo(() => days, [days]);
  const endDate = adsToday();
  const totals = useMemo(() => (ad ? sumDaily(sliceRange(ad.daily, rangeDays, endDate)) : null), [ad, rangeDays, endDate]);
  const series = useMemo(() => (ad ? seriesForAds([ad], rangeDays, endDate) : []), [ad, rangeDays, endDate]);
  const dailyRows = useMemo(
    () => (ad ? [...sliceRange(ad.daily, rangeDays, endDate)].sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [ad, rangeDays, endDate]
  );
  const pagination = usePagination(dailyRows, { resetKey: rangeDays, initialSize: 25 });

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title="Ad" subtitle="Loading..." />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED || !ad) {
    return (
      <>
        <PageHeader title="Ad not found" />
        <ErrorState title="We couldn’t find that ad" onRetry={() => navigate('/ads')} />
      </>
    );
  }

  const network = getAdNetwork(ad.network);
  const objective = AD_OBJECTIVES.find((item) => item.key === ad.objective);
  const isRunnable = ad.status === AD_STATUS.ACTIVE || ad.status === AD_STATUS.PAUSED;
  const hasData = ad.daily.length > 0;
  const budgetUsed = ad.budgetType === 'lifetime' && ad.budget ? Math.min(100, (sumDaily(ad.daily).spend / ad.budget) * 100) : null;

  function toggleStatus() {
    const next = ad.status === AD_STATUS.ACTIVE ? AD_STATUS.PAUSED : AD_STATUS.ACTIVE;
    updateAdsStatus([ad.id], next).then(() => {
      setAd((current) => ({ ...current, status: next }));
      showToast({ type: 'success', title: next === AD_STATUS.PAUSED ? 'Ad paused' : 'Ad resumed' });
    });
  }

  function handleDeleteConfirmed() {
    deleteAds([ad.id]).then(() => {
      showToast({ type: 'success', title: 'Ad deleted' });
      navigate('/ads');
    });
  }

  function handlePrint() {
    if (!printAdsReport([ad], rangeDays, ad.name)) {
      showToast({ type: 'error', title: 'Pop-up blocked', message: 'Allow pop-ups for this site to open the PDF report.' });
    }
  }

  const reportOptions = [
    {
      label: 'Summary (CSV)',
      description: 'This ad’s totals for the period',
      icon: 'FileSpreadsheet',
      onClick: () => {
        downloadAdsSummaryCsv([ad], rangeDays);
        showToast({ type: 'success', title: 'Report downloaded' });
      },
    },
    {
      label: 'Day-by-day (CSV)',
      description: 'Spend, impressions, clicks and results per day',
      icon: 'CalendarRange',
      onClick: () => {
        downloadAdsDailyCsv([ad], rangeDays);
        showToast({ type: 'success', title: 'Report downloaded' });
      },
    },
    { label: 'PDF report', description: 'Print view — choose “Save as PDF”', icon: 'FileText', onClick: handlePrint },
  ];

  const statCards = totals
    ? [
        { key: 'spend', label: 'Spent', value: formatCurrency(totals.spend), icon: 'Wallet', tone: 'primary', hint: budgetUsed !== null ? `${Math.round(budgetUsed)}% of ${formatCurrency(ad.budget)} used` : undefined },
        { key: 'impressions', label: 'Impressions', value: formatCompactNumber(totals.impressions), icon: 'Eye', tone: 'sky' },
        { key: 'clicks', label: 'Clicks', value: formatNumber(totals.clicks), icon: 'MousePointerClick', tone: 'purple' },
        { key: 'ctr', label: 'CTR', value: formatPercent(totals.ctr), icon: 'Percent', tone: 'green' },
        { key: 'cpc', label: 'Avg. CPC', value: formatCurrency(totals.cpc), icon: 'Coins', tone: 'amber' },
        { key: 'results', label: 'Results', value: CONVERSIONS_NOT_TRACKED, icon: 'Target', tone: 'red', hint: 'No Pixel or Lead Form is set up for this ad' },
      ]
    : [];

  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: 'Ads', to: '/ads' }, { label: ad.name }]} />
      <PageHeader
        title={ad.name}
        subtitle={`${objective?.label || ad.objective} · ${ad.platforms.map((key) => getPlatformByKey(key)?.label).join(' + ')} · ${formatDate(ad.startDate)} – ${formatDate(ad.endDate)}`}
        guideChapterId="ads"
        actions={
          <>
            <DownloadReportMenu options={reportOptions} disabled={!hasData} />
            {isRunnable ? (
              <button type="button" className="btn btn-outline-secondary-custom" onClick={toggleStatus}>
                <Icon name={ad.status === AD_STATUS.ACTIVE ? 'Pause' : 'Play'} size={16} />
                {ad.status === AD_STATUS.ACTIVE ? 'Pause' : 'Resume'}
              </button>
            ) : null}
            <button type="button" className="btn btn-outline-danger" onClick={() => setIsDeleteOpen(true)}>
              <Icon name="Trash2" size={16} />
              Delete
            </button>
          </>
        }
      />

      <div className="d-flex align-items-center gap-3 flex-wrap mb-4">
        <StatusBadge status={ad.status} label={AD_STATUS_LABELS[ad.status]} />
        <span className="d-flex gap-1">{ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={24} />)}</span>
        <span className="text-muted-custom small">
          Budget {formatCurrency(ad.budget)} {ad.budgetType === 'daily' ? 'per day' : 'lifetime'} · billed by {network?.label} to your ad account
        </span>
        <div className="ms-auto" style={{ minWidth: '16rem' }}>
          <select className="form-select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Period">
            {AD_DATE_RANGES.map((range) => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
        </div>
      </div>

      {ad.status === AD_STATUS.REJECTED && ad.rejectionReason ? (
        <div className="callout-banner callout-banner--danger">
          <Icon name="AlertCircle" size={16} />
          <span><strong>Rejected by the platform.</strong> {ad.rejectionReason}</span>
        </div>
      ) : null}
      {ad.status === AD_STATUS.IN_REVIEW ? (
        <div className="callout-banner callout-banner--info">
          <Icon name="Clock" size={16} />
          <span>The platform is reviewing this ad. Reviews usually finish within 24 hours — numbers appear once it starts running.</span>
        </div>
      ) : null}
      {ad.lastSyncError ? (
        <div className="callout-banner callout-banner--warning">
          <Icon name="RefreshCw" size={16} />
          <span>
            <strong>The last update from the platform didn’t go through</strong> — numbers below may be a few hours old.{' '}
            {ad.lastSyncError} It will try again automatically.
          </span>
        </div>
      ) : null}

      {hasData ? (
        <>
          <StatCardGrid cards={statCards} className="stat-card-grid--three" />
          <div className="ads-chart-grid">
            <AdsPerformanceChart series={series} title="Performance" />
            <div className="panel-card">
              <div className="panel-card__header"><h3 className="panel-card__title">Ad preview</h3></div>
              <div className="panel-card__body">
                <AdPreview creative={ad.creative} platformKey={ad.platforms[0]} />
                <dl className="ad-targeting">
                  <dt>Locations</dt><dd>{ad.audience.locations.join(', ')}</dd>
                  <dt>Age</dt><dd>{ad.audience.ageMin}–{ad.audience.ageMax}</dd>
                  <dt>Gender</dt><dd>{ad.audience.gender === 'all' ? 'All' : ad.audience.gender}</dd>
                  <dt>Interests</dt><dd>{ad.audience.interests.join(', ') || 'Broad'}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">Day by day</h3></div>
            <TableToolbar pagination={pagination} />
            <div className="panel-card__body panel-card__body--flush">
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-end">Spend</th>
                      <th className="text-end">Impressions</th>
                      <th className="text-end">Clicks</th>
                      <th className="text-end">CTR</th>
                      <th className="text-end">Results</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td className="text-end">{formatCurrency(day.spend)}</td>
                        <td className="text-end">{formatNumber(day.impressions)}</td>
                        <td className="text-end">{formatNumber(day.clicks)}</td>
                        <td className="text-end">{formatPercent(day.impressions ? (day.clicks / day.impressions) * 100 : 0)}</td>
                        <td className="text-end text-muted-custom">{CONVERSIONS_NOT_TRACKED}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pager pagination={pagination} />
          </div>
        </>
      ) : (
        <div className="ads-chart-grid">
          <div className="panel-card">
            <div className="panel-card__body">
              <EmptyState icon="BarChart3" title="No results yet" description="Charts and numbers appear here once the ad starts running." />
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">Ad preview</h3></div>
            <div className="panel-card__body"><AdPreview creative={ad.creative} platformKey={ad.platforms[0]} /></div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirmed}
        title="Delete this ad?"
        message="It is removed from Social. If it is running on the platform, also stop it in that platform’s own Ads Manager so it stops spending."
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}

export default AdDetail;
