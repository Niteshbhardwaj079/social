import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import PageHeader from '../../components/common/PageHeader';
import KpiCard from '../../components/analytics/KpiCard';
import ChartCard from '../../components/analytics/ChartCard';
import DateRangeSelector from '../../components/analytics/DateRangeSelector';
import PlatformIcon from '../../components/common/PlatformIcon';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonKpiRow, SkeletonCard } from '../../components/common/LoadingSkeleton';
import { getAnalyticsOverview } from '../../services/api/analyticsApi';
import { getPlatformByKey } from '../../config/platforms';
import { DATE_RANGE_PRESETS, REQUEST_STATUS } from '../../config/constants';
import { formatCompactNumber } from '../../utils/formatters';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

function AnalyticsOverview() {
  const { t } = useI18n();
  const chartPrimary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [rangePreset, setRangePreset] = useState(DATE_RANGE_PRESETS.LAST_30_DAYS);
  const [overview, setOverview] = useState(null);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadOverview(preset) {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getAnalyticsOverview(preset === DATE_RANGE_PRESETS.CUSTOM ? DATE_RANGE_PRESETS.LAST_90_DAYS : preset)
      .then((data) => {
        setOverview(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadOverview(rangePreset);
  }, [rangePreset]);

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.analyticsOverview')} subtitle="Loading your analytics..." />
        <SkeletonKpiRow />
        <SkeletonCard />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.analyticsOverview')} />
        <ErrorState onRetry={() => loadOverview(rangePreset)} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.analyticsOverview')}
        subtitle={t('pages.analyticsOverview')}
        guideChapterId="analytics"
        actions={<DateRangeSelector value={rangePreset} onChange={setRangePreset} />}
      />

      <div className="kpi-grid">
        {overview.summary.map(({ key, ...kpi }) => (
          <KpiCard key={key} {...kpi} />
        ))}
      </div>

      <ChartCard title="Engagement Over Time">
        <ResponsiveContainer width="100%" height={Math.round(300 * uiScale)}>
          <AreaChart data={overview.series}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
            <XAxis height={Math.round(30 * uiScale)} dataKey="date" stroke={chartColors.textMuted} fontSize={axisFont} />
            <YAxis width={Math.round(60 * uiScale)} stroke={chartColors.textMuted} fontSize={axisFont} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke={chartPrimary} fill={chartPrimary} fillOpacity={0.2} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="panel-card mt-5">
        <div className="panel-card__header">
          <h3 className="panel-card__title">Platform Performance</h3>
        </div>
        <div className="panel-card__body panel-card__body--flush">
          {isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {overview.platformPerformance.map((row) => {
                const platform = getPlatformByKey(row.platform);
                return (
                  <div key={row.platform} className="surface-card">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <PlatformIcon platformKey={row.platform} size={26} />
                      <span className="fw-semibold">{platform?.label}</span>
                    </div>
                    <div className="d-flex flex-wrap gap-4">
                      <div>
                        <div className="small text-muted-custom">Followers</div>
                        <div className="fw-semibold">{formatCompactNumber(row.followers)}</div>
                      </div>
                      <div>
                        <div className="small text-muted-custom">Engagement</div>
                        <div className="fw-semibold">{row.engagement}%</div>
                      </div>
                      <div>
                        <div className="small text-muted-custom">Reach</div>
                        <div className="fw-semibold">{formatCompactNumber(row.reach)}</div>
                      </div>
                      <div>
                        <div className="small text-muted-custom">Posts</div>
                        <div className="fw-semibold">{row.posts}</div>
                      </div>
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
                    <th>Platform</th>
                    <th>Followers</th>
                    <th>Engagement</th>
                    <th>Reach</th>
                    <th>Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.platformPerformance.map((row) => {
                    const platform = getPlatformByKey(row.platform);
                    return (
                      <tr key={row.platform}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <PlatformIcon platformKey={row.platform} size={26} />
                            {platform?.label}
                          </div>
                        </td>
                        <td>{formatCompactNumber(row.followers)}</td>
                        <td>{row.engagement}%</td>
                        <td>{formatCompactNumber(row.reach)}</td>
                        <td>{row.posts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsOverview;
