import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import CalloutBanner from '../../components/common/CalloutBanner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getAiAccess } from '../../services/api/aiApi';
import { setAiAccess } from '../../store/slices/authSlice';
import { useI18n } from '../../i18n/useI18n';
import AgentTab from './AgentTab';
import WriteTab from './WriteTab';
import ImageTab from './ImageTab';
import VideoTab from './VideoTab';
import AutopilotTab from './AutopilotTab';
import HistoryTab from './HistoryTab';

// The label of each tab is ai.tabs.<key>.
const TABS = ['agent', 'write', 'image', 'video', 'autopilot', 'history'];

/** "120 / 300 credits used this month" — only matters when the platform's AI key is used. */
function CreditsNote({ credits }) {
  const { t } = useI18n();
  if (credits.limit === null) return <span className="ai-credits">{t('ai.credits.unlimited')}</span>;
  const left = Math.max(0, credits.limit - credits.used);
  return (
    <span className={`ai-credits ${left === 0 ? 'is-empty' : ''}`.trim()}>
      {t('ai.credits.left', { left, limit: credits.limit })} · <Link to="/settings/ai">{t('ai.credits.ownKeyLink')}</Link>
    </span>
  );
}

/** AI Studio: write posts, create images and videos, and let the AI post on a schedule. */
function AiStudio() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'agent';
  const [access, setAccess] = useState(null);
  const [error, setError] = useState('');
  // A research idea picked on the Agent tab, handed to the Write tab (a new key remounts it with that brief).
  const [ideaBrief, setIdeaBrief] = useState({ key: 0, text: '' });

  // Re-read after every AI job, so the credits counter stays true.
  const refreshAccess = useCallback(() => {
    getAiAccess()
      .then((value) => {
        setAccess(value);
        dispatch(setAiAccess(value));
      })
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, [dispatch]);

  useEffect(() => {
    if (API_ENABLED) refreshAccess();
  }, [refreshAccess]);

  const header = <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />;
  if (!API_ENABLED) {
    return (
      <div className="fade-in">
        {header}
        <EmptyState icon="Sparkles" title={t('ai.needsServerTitle')} description={t('ai.needsServerText')} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="fade-in">
        {header}
        <ErrorState description={error} />
      </div>
    );
  }
  if (!access) {
    return (
      <div className="fade-in">
        {header}
        <PageLoader minHeight="24rem" />
      </div>
    );
  }
  if (!access.available) {
    return (
      <div className="fade-in">
        {header}
        <CalloutBanner icon="Lock">{access.reasonCode ? t(`ai.access.${access.reasonCode}`) : access.reason}</CalloutBanner>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {header}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <nav className="tab-strip flex-grow-1" aria-label={t('ai.title')}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-strip__item ${activeTab === tab ? 'is-active' : ''}`.trim()}
              onClick={() => setSearchParams(tab === 'agent' ? {} : { tab })}
            >
              {t(`ai.tabs.${tab}`)}
            </button>
          ))}
        </nav>
      </div>
      <div className="mb-3">
        <CreditsNote credits={access.credits} />
      </div>

      {activeTab === 'agent' ? (
        <AgentTab
          access={access}
          onUseIdea={(idea) => {
            setIdeaBrief((current) => ({ key: current.key + 1, text: [idea.title, idea.angle].filter(Boolean).join(' — ') }));
            setSearchParams({ tab: 'write' });
          }}
        />
      ) : null}
      {activeTab === 'write' ? <WriteTab key={ideaBrief.key} initialBrief={ideaBrief.text} onUsed={refreshAccess} /> : null}
      {activeTab === 'image' ? <ImageTab onUsed={refreshAccess} /> : null}
      {activeTab === 'video' ? <VideoTab access={access} onUsed={refreshAccess} /> : null}
      {activeTab === 'autopilot' ? <AutopilotTab access={access} /> : null}
      {activeTab === 'history' ? <HistoryTab /> : null}
    </div>
  );
}

export default AiStudio;
