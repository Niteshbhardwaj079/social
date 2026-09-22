import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import AccountCard from '../../components/social/AccountCard';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { formatCompactNumber } from '../../utils/formatters';
import Icon from '../../components/common/Icon';
import { getSocialAccounts, disconnectAccount, syncAccount } from '../../services/api/socialAccountsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { REQUEST_STATUS, ACCOUNT_STATUS, ACCOUNT_STATUS_NEEDS_ATTENTION } from '../../config/constants';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

function SocialAccounts() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadAccounts() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getSocialAccounts()
      .then((data) => {
        setAccounts(data);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function replaceAccount(updated) {
    setAccounts((current) => current.map((account) => (account.id === updated.id ? { ...account, ...updated } : account)));
  }

  function handleDisconnect(accountId) {
    disconnectAccount(accountId)
      .then((updated) => {
        replaceAccount(updated);
        showToast({ type: 'info', title: 'Account disconnected' });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  function handleSync(accountId) {
    syncAccount(accountId)
      .then((updated) => {
        replaceAccount(updated);
        const stillWorking = updated.status === ACCOUNT_STATUS.CONNECTED;
        showToast({
          type: stillWorking ? 'success' : 'error',
          title: stillWorking ? 'Account is up to date' : 'This account needs attention',
          message: stillWorking ? undefined : updated.lastError || undefined,
        });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.socialAccounts')} subtitle="Loading your connected channels..." />
        <SkeletonKpiRow count={8} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.socialAccounts')} />
        <ErrorState onRetry={loadAccounts} />
      </>
    );
  }

  const connectedCount = accounts.filter((account) => account.status === ACCOUNT_STATUS.CONNECTED).length;

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.socialAccounts')}
        subtitle={t('pages.socialAccounts', { connected: connectedCount, total: accounts.length })}
        guideChapterId="social-accounts"
        actions={
          <Link to="/social-accounts/connect" className="btn btn-primary">
            <Icon name="Plus" size={16} />
            Connect New Account
          </Link>
        }
      />

      {accounts.length === 0 ? null : (
        <StatCardGrid
          cards={[
            { key: 'total', label: 'Platforms', value: accounts.length, icon: 'Share2', tone: 'primary' },
            { key: 'connected', label: 'Connected', value: connectedCount, icon: 'PlugZap', tone: 'green' },
            {
              key: 'attention',
              label: 'Needs Attention',
              value: accounts.filter((account) => ACCOUNT_STATUS_NEEDS_ATTENTION.includes(account.status)).length,
              icon: 'AlertTriangle',
              tone: 'amber',
            },
            {
              key: 'disconnected',
              label: 'Not Connected',
              value: accounts.filter((account) => account.status === ACCOUNT_STATUS.DISCONNECTED).length,
              icon: 'Unplug',
              tone: 'slate',
            },
            { key: 'followers', label: 'Total Followers', value: formatCompactNumber(accounts.reduce((sum, account) => sum + (account.followers || 0), 0)), icon: 'Users', tone: 'sky' },
          ]}
        />
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon="Share2"
          title="No accounts yet"
          description="Connect your first social account to start publishing."
          actionLabel="Connect Account"
          onAction={() => navigate('/social-accounts/connect')}
        />
      ) : (
        <div className="account-cards-grid">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onConnect={(platformKey) => navigate(`/social-accounts/connect/${platformKey}`)}
              onDisconnect={handleDisconnect}
              onSync={handleSync}
            />
          ))}
        </div>
      )}

    </div>
  );
}

export default SocialAccounts;
