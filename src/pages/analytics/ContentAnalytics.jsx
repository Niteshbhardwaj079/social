import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { getContentAnalytics } from '../../services/api/analyticsApi';
import { getPlatformByKey } from '../../config/platforms';
import { REQUEST_STATUS } from '../../config/constants';
import { formatCompactNumber } from '../../utils/formatters';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

function ContentAnalytics() {
  const { t } = useI18n();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [data, setData] = useState(null);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadContentAnalytics() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getContentAnalytics()
      .then((result) => {
        setData(result);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadContentAnalytics();
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.contentAnalytics')} subtitle="Loading content performance..." />
        <SkeletonTable rows={4} columns={4} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.contentAnalytics')} />
        <ErrorState onRetry={loadContentAnalytics} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('nav.contentAnalytics')} subtitle={t('pages.contentAnalytics')} guideChapterId="analytics" />

      <div className="panel-card">
        <div className="panel-card__header">
          <h3 className="panel-card__title">Top Performing Content</h3>
        </div>
        <div className="panel-card__body panel-card__body--flush">
          {data.topContent.length === 0 ? (
            <EmptyState icon="PieChart" title="No content data yet" description="Publish posts to start seeing performance data." />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {data.topContent.map((item) => {
                const platform = getPlatformByKey(item.platform);
                return (
                  <div key={item.id} className="surface-card">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <PlatformIcon platformKey={item.platform} size={22} />
                      <span className="small text-muted-custom">{platform?.label}</span>
                    </div>
                    <div className="table-row-title mb-3">{item.title}</div>
                    <div className="d-flex gap-4">
                      <div>
                        <div className="small text-muted-custom">Engagement</div>
                        <div className="fw-semibold">{formatCompactNumber(item.engagement)}</div>
                      </div>
                      <div>
                        <div className="small text-muted-custom">Reach</div>
                        <div className="fw-semibold">{formatCompactNumber(item.reach)}</div>
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
                    <th>Post</th>
                    <th>Platform</th>
                    <th>Engagement</th>
                    <th>Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topContent.map((item) => {
                    const platform = getPlatformByKey(item.platform);
                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="table-row-title table-cell-truncate">{item.title}</span>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <PlatformIcon platformKey={item.platform} size={24} />
                            {platform?.label}
                          </div>
                        </td>
                        <td>{formatCompactNumber(item.engagement)}</td>
                        <td>{formatCompactNumber(item.reach)}</td>
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

export default ContentAnalytics;
