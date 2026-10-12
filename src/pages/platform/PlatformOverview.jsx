import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCardGrid } from '../../components/common/StatCard';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getPlatformOverview } from '../../services/api/platformApi';
import { formatMoney } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

/** The owner's numbers at a glance: customers, payments waiting, revenue, plan mix. */
function PlatformOverview() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPlatformOverview()
      .then(setStats)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  if (error) return <ErrorState description={error} />;
  if (!stats) return <PageLoader minHeight="24rem" />;

  const revenue = stats.revenue[0] ?? { currency: 'INR', thisMonth: 0, allTime: 0 };
  const cards = [
    {
      key: 'orgs',
      icon: 'Building2',
      label: t('platform.overview.organizations'),
      value: stats.organizations,
      hint: t('platform.overview.newThisMonth', { count: stats.newThisMonth }),
      onClick: () => navigate('/platform/organizations'),
    },
    {
      key: 'pending',
      icon: 'Clock',
      tone: stats.pendingPayments ? 'amber' : 'primary',
      label: t('platform.overview.paymentsToVerify'),
      value: stats.pendingPayments,
      onClick: () => navigate('/platform/payments'),
    },
    { key: 'month', icon: 'BadgeIndianRupee', tone: 'green', label: t('platform.overview.revenueMonth'), value: formatMoney(revenue.thisMonth, revenue.currency) },
    { key: 'all', icon: 'Wallet', tone: 'sky', label: t('platform.overview.revenueAll'), value: formatMoney(revenue.allTime, revenue.currency) },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <StatCardGrid cards={cards} />
      <section className="surface-card">
        <h3 className="h5 mb-3">{t('platform.overview.byPlan')}</h3>
        {stats.byPlan.length ? (
          <ul className="plan-mix">
            {stats.byPlan.map((row) => (
              <li key={row.planId}>
                <span>{row.planName}</span>
                <strong>{row.organizations}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-secondary-custom mb-0">{t('platform.overview.noSubscriptions')}</p>
        )}
        <p className="form-hint mt-3 mb-0">{t('platform.overview.expiredNote')}</p>
      </section>
    </div>
  );
}

export default PlatformOverview;
