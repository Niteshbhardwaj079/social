import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PageHeader from '../../components/common/PageHeader';
import KpiCard from '../../components/analytics/KpiCard';
import ChartCard from '../../components/analytics/ChartCard';
import FollowersGrowthChart from '../../components/dashboard/FollowersGrowthChart';
import PostListItem from '../../components/posts/PostListItem';
import ActivityTimeline from '../../components/common/ActivityTimeline';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonKpiRow, SkeletonCard } from '../../components/common/LoadingSkeleton';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import { getDashboardOverview } from '../../services/api/dashboardApi';
import { getPlatformByKey } from '../../config/platforms';
import { REQUEST_STATUS } from '../../config/constants';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';
import { useI18n } from '../../i18n/useI18n';

function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.auth.currentUser);
  const chartPrimary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);

  const [overview, setOverview] = useState(null);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadOverview() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getDashboardOverview()
      .then((data) => {
        setOverview(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadOverview();
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.dashboard')} subtitle="Loading your workspace..." />
        <SkeletonKpiRow />
        <div className="dashboard-grid">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.dashboard')} />
        <ErrorState onRetry={loadOverview} />
      </>
    );
  }

  const firstName = currentUser?.name?.split(' ')[0] || 'there';

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={t('pages.dashboardWelcome', { name: firstName })}
        guideChapterId="dashboard"
      />

      <div className="kpi-grid">
        {overview.kpis.map(({ key, ...kpi }) => (
          <KpiCard key={key} {...kpi} />
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="d-flex flex-column gap-5">
          <FollowersGrowthChart seriesByRange={overview.followersGrowthByRange} platforms={overview.platformPerformance} />

          <ChartCard title="Engagement Trend">
            <ResponsiveContainer width="100%" height={Math.round(260 * uiScale)}>
              <AreaChart data={overview.engagementTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
                <XAxis height={Math.round(30 * uiScale)} dataKey="date" stroke={chartColors.textMuted} fontSize={axisFont} />
                <YAxis width={Math.round(60 * uiScale)} stroke={chartColors.textMuted} fontSize={axisFont} />
                <Tooltip />
                <Area type="monotone" dataKey="likes" stackId="1" stroke={chartPrimary} fill={chartPrimary} fillOpacity={0.25} />
                <Area type="monotone" dataKey="comments" stackId="1" stroke={chartColors.secondary} fill={chartColors.secondary} fillOpacity={0.25} />
                <Area type="monotone" dataKey="shares" stackId="1" stroke={chartColors.success} fill={chartColors.success} fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="two-col-grid">
            <ChartCard title="Posts Published">
              <ResponsiveContainer width="100%" height={Math.round(220 * uiScale)}>
                <BarChart data={overview.postsPublished}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
                  <XAxis height={Math.round(30 * uiScale)} dataKey="date" stroke={chartColors.textMuted} fontSize={axisFont} />
                  <YAxis width={Math.round(60 * uiScale)} stroke={chartColors.textMuted} fontSize={axisFont} />
                  <Tooltip />
                  <Bar dataKey="posts" fill={chartPrimary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Platform Performance">
              <div className="d-flex flex-column gap-3">
                {overview.platformPerformance.map((row) => {
                  const platform = getPlatformByKey(row.platform);
                  return (
                    <div key={row.platform} className="d-flex align-items-center gap-3">
                      <PlatformIcon platformKey={row.platform} size={28} />
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between small mb-1">
                          <span>{platform?.label}</span>
                          <span className="text-muted-custom">{row.engagement}% engagement</span>
                        </div>
                        <div className="progress platform-performance-bar">
                          <div
                            className="progress-bar"
                            role="progressbar"
                            style={{ width: `${Math.min(row.engagement * 10, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">Recent Posts</h3>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={() => navigate('/posts')}>
                View all
              </button>
            </div>
            <div className="panel-card__body panel-card__body--flush">
              {overview.recentPosts.length === 0 ? (
                <EmptyState
                  icon="FileText"
                  title="No posts yet"
                  description="Create your first post to see it here."
                  actionLabel="Create Post"
                  onAction={() => navigate('/posts/create')}
                />
              ) : (
                <div className="dashboard-scroll d-flex flex-column p-2 gap-1">
                  {overview.recentPosts.map((post) => (
                    <PostListItem key={post.id} post={post} onClick={() => navigate('/posts')} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="d-flex flex-column gap-5">
          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">Quick Actions</h3>
            </div>
            <div className="panel-card__body d-flex flex-column gap-3">
              {overview.quickActions.map((action) => (
                <div
                  key={action.key}
                  className="quick-action-card"
                  onClick={() => navigate(action.path)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="quick-action-card__icon">
                    <Icon name={action.icon} size={20} />
                  </span>
                  <span className="quick-action-card__label">{action.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">Scheduled Posts</h3>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={() => navigate('/calendar')}>
                View calendar
              </button>
            </div>
            <div className="panel-card__body panel-card__body--flush">
              {overview.upcomingPosts.length === 0 ? (
                <EmptyState icon="CalendarDays" title="Nothing scheduled" description="Schedule a post to fill your calendar." />
              ) : (
                <div className="dashboard-scroll d-flex flex-column p-2 gap-1">
                  {overview.upcomingPosts.map((post) => (
                    <PostListItem key={post.id} post={post} onClick={() => navigate('/calendar')} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">Recent Activity</h3>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={() => navigate('/activity-logs')}>
                View all
              </button>
            </div>
            <div className="panel-card__body dashboard-scroll dashboard-scroll--padded">
              <ActivityTimeline items={overview.recentActivity} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
