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
import { AD_DATE_RANGES, AD_OBJECTIVES, AD_STATUS, getAdNetwork } from '../../config/adPlatforms';
import { getPlatformByKey } from '../../config/platforms';
import { REQUEST_STATUS } from '../../config/constants';
import { adsToday, CONVERSIONS_NOT_TRACKED, seriesForAds, sliceRange, sumDaily } from '../../utils/adMetrics';
import { downloadAdsDailyCsv, downloadAdsSummaryCsv, printAdsReport } from '../../utils/adReports';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, formatPercent } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

function AdDetail() {
  const { t } = useI18n();
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
        <PageHeader title={t('adDetail.ad')} subtitle={t('common.loading')} />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED || !ad) {
    return (
      <>
        <PageHeader title={t('adDetail.notFoundTitle')} />
        <ErrorState title={t('adDetail.notFoundText')} onRetry={() => navigate('/ads')} />
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
      showToast({ type: 'success', title: next === AD_STATUS.PAUSED ? t('adDetail.paused') : t('adDetail.resumed') });
    });
  }

  function handleDeleteConfirmed() {
    deleteAds([ad.id]).then(() => {
      showToast({ type: 'success', title: t('ads.bulkDeletedToastOne', { count: 1 }) });
      navigate('/ads');
    });
  }

  function handlePrint() {
    if (!printAdsReport([ad], rangeDays, ad.name)) {
      showToast({ type: 'error', title: t('ads.popupBlockedTitle'), message: t('ads.popupBlockedMessage') });
    }
  }

  const reportOptions = [
    {
      label: t('ads.reportSummaryLabel'),
      description: t('adDetail.reportSummaryDesc'),
      icon: 'FileSpreadsheet',
      onClick: () => {
        downloadAdsSummaryCsv([ad], rangeDays);
        showToast({ type: 'success', title: t('ads.reportDownloadedToast') });
      },
    },
    {
      label: t('ads.reportDailyLabel'),
      description: t('adDetail.reportDailyDesc'),
      icon: 'CalendarRange',
      onClick: () => {
        downloadAdsDailyCsv([ad], rangeDays);
        showToast({ type: 'success', title: t('ads.reportDownloadedToast') });
      },
    },
    { label: t('ads.reportPdfLabel'), description: t('ads.reportPdfDesc'), icon: 'FileText', onClick: handlePrint },
  ];

  const statCards = totals
    ? [
        {
          key: 'spend',
          label: t('ads.spent'),
          value: formatCurrency(totals.spend),
          icon: 'Wallet',
          tone: 'primary',
          hint: budgetUsed !== null ? t('adDetail.budgetUsed', { percent: Math.round(budgetUsed), budget: formatCurrency(ad.budget) }) : undefined,
        },
        { key: 'impressions', label: t('ads.ruleMetrics.impressions'), value: formatCompactNumber(totals.impressions), icon: 'Eye', tone: 'sky' },
        { key: 'clicks', label: t('ads.ruleMetrics.clicks'), value: formatNumber(totals.clicks), icon: 'MousePointerClick', tone: 'purple' },
        { key: 'ctr', label: t('ads.ruleMetrics.ctr'), value: formatPercent(totals.ctr), icon: 'Percent', tone: 'green' },
        { key: 'cpc', label: t('ads.ruleMetrics.cpc'), value: formatCurrency(totals.cpc), icon: 'Coins', tone: 'amber' },
        { key: 'results', label: t('ads.ruleMetrics.results'), value: CONVERSIONS_NOT_TRACKED, icon: 'Target', tone: 'red', hint: t('adDetail.noPixel') },
      ]
    : [];

  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: t('nav.ads'), to: '/ads' }, { label: ad.name }]} />
      <PageHeader
        title={ad.name}
        subtitle={`${objective ? t(`ads.objectives.${objective.labelKey}`) : ad.objective} · ${ad.platforms.map((key) => getPlatformByKey(key)?.label).join(' + ')} · ${formatDate(ad.startDate)} – ${formatDate(ad.endDate)}`}
        guideChapterId="ads"
        actions={
          <>
            <DownloadReportMenu options={reportOptions} disabled={!hasData} />
            {isRunnable ? (
              <button type="button" className="btn btn-outline-secondary-custom" onClick={toggleStatus}>
                <Icon name={ad.status === AD_STATUS.ACTIVE ? 'Pause' : 'Play'} size={16} />
                {ad.status === AD_STATUS.ACTIVE ? t('ads.pause') : t('ads.resume')}
              </button>
            ) : null}
            <button type="button" className="btn btn-outline-danger" onClick={() => setIsDeleteOpen(true)}>
              <Icon name="Trash2" size={16} />
              {t('common.delete')}
            </button>
          </>
        }
      />

      <div className="d-flex align-items-center gap-3 flex-wrap mb-4">
        <StatusBadge status={ad.status} />
        <span className="d-flex gap-1">{ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={24} />)}</span>
        <span className="text-muted-custom small">
          {t(ad.budgetType === 'daily' ? 'adCreate.budgetPerDay' : 'adCreate.budgetLifetime', { amount: formatCurrency(ad.budget) })} ·{' '}
          {t('adDetail.billedBy', { network: network?.label ?? '' })}
        </span>
        <div className="ms-auto" style={{ minWidth: '16rem' }}>
          <select className="form-select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label={t('billing.col.period')}>
            {AD_DATE_RANGES.map((range) => (
              <option key={range.value} value={range.value}>{t(`ads.dateRanges.${range.labelKey}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {ad.status === AD_STATUS.REJECTED && ad.rejectionReason ? (
        <div className="callout-banner callout-banner--danger">
          <Icon name="AlertCircle" size={16} />
          <span><strong>{t('adDetail.rejected')}</strong> {ad.rejectionReason}</span>
        </div>
      ) : null}
      {ad.status === AD_STATUS.IN_REVIEW ? (
        <div className="callout-banner callout-banner--info">
          <Icon name="Clock" size={16} />
          <span>{t('adDetail.inReview')}</span>
        </div>
      ) : null}
      {ad.lastSyncError ? (
        <div className="callout-banner callout-banner--warning">
          <Icon name="RefreshCw" size={16} />
          <span>
            <strong>{t('adDetail.syncFailed')}</strong> — {t('adDetail.syncFailedText')} {ad.lastSyncError} {t('adDetail.syncRetry')}
          </span>
        </div>
      ) : null}

      {hasData ? (
        <>
          <StatCardGrid cards={statCards} className="stat-card-grid--three" />
          <div className="ads-chart-grid">
            <AdsPerformanceChart series={series} title={t('adDetail.performance')} />
            <div className="panel-card">
              <div className="panel-card__header"><h3 className="panel-card__title">{t('adDetail.preview')}</h3></div>
              <div className="panel-card__body">
                <AdPreview creative={ad.creative} platformKey={ad.platforms[0]} />
                <dl className="ad-targeting">
                  <dt>{t('adCreate.locations')}</dt><dd>{ad.audience.locations.join(', ')}</dd>
                  <dt>{t('adDetail.age')}</dt><dd>{ad.audience.ageMin}–{ad.audience.ageMax}</dd>
                  <dt>{t('adCreate.gender')}</dt><dd>{t(`adCreate.genders.${ad.audience.gender}`)}</dd>
                  <dt>{t('adCreate.interests')}</dt><dd>{ad.audience.interests.join(', ') || t('adDetail.broad')}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">{t('adDetail.dayByDay')}</h3></div>
            <TableToolbar pagination={pagination} />
            <div className="panel-card__body panel-card__body--flush">
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('billing.col.date')}</th>
                      <th className="text-end">{t('ads.ruleMetrics.spend')}</th>
                      <th className="text-end">{t('ads.ruleMetrics.impressions')}</th>
                      <th className="text-end">{t('ads.ruleMetrics.clicks')}</th>
                      <th className="text-end">{t('ads.ruleMetrics.ctr')}</th>
                      <th className="text-end">{t('ads.ruleMetrics.results')}</th>
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
              <EmptyState icon="BarChart3" title={t('adDetail.noResultsTitle')} description={t('adDetail.noResultsText')} />
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">{t('adDetail.preview')}</h3></div>
            <div className="panel-card__body"><AdPreview creative={ad.creative} platformKey={ad.platforms[0]} /></div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirmed}
        title={t('adDetail.deleteTitle')}
        message={t('adDetail.deleteText')}
        confirmLabel={t('common.delete')}
        isDanger
      />
    </div>
  );
}

export default AdDetail;
