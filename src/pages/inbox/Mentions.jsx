import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import PlatformIcon from '../../components/common/PlatformIcon';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonTable } from '../../components/common/LoadingSkeleton';
import { getConversations } from '../../services/api/inboxApi';
import { REQUEST_STATUS } from '../../config/constants';
import { PLATFORM_KEYS } from '../../config/platforms';
import { formatRelativeTime } from '../../utils/formatters';
import { useI18n } from '../../i18n/useI18n';

const MENTION_CAPABLE_PLATFORMS = [
  PLATFORM_KEYS.X,
  PLATFORM_KEYS.INSTAGRAM,
  PLATFORM_KEYS.THREADS,
  PLATFORM_KEYS.MASTODON,
  PLATFORM_KEYS.BLUESKY,
];

function Mentions() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mentions, setMentions] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadMentions() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getConversations()
      .then((conversations) => {
        const mentionConversations = conversations.filter((conversation) =>
          MENTION_CAPABLE_PLATFORMS.includes(conversation.platform)
        );
        setMentions(mentionConversations);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadMentions();
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.mentions')} subtitle="Loading mentions..." />
        <SkeletonTable rows={5} columns={3} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.mentions')} />
        <ErrorState onRetry={loadMentions} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('nav.mentions')} subtitle={t('pages.mentions')} guideChapterId="inbox" />

      <div className="panel-card">
        <div className="panel-card__body panel-card__body--flush">
          {mentions.length === 0 ? (
            <EmptyState icon="AtSign" title="No mentions yet" description="Mentions of your brand will appear here." />
          ) : (
            <div className="d-flex flex-column">
              {mentions.map((mention) => (
                <div
                  key={mention.id}
                  className="agenda-group__post border-bottom px-5 py-3"
                  onClick={() => navigate('/inbox')}
                  role="button"
                  tabIndex={0}
                >
                  <Avatar name={mention.customerName} size="sm" />
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-semibold small">{mention.customerName}</span>
                      <PlatformIcon platformKey={mention.platform} size={16} />
                    </div>
                    <div className="small text-secondary-custom">{mention.lastMessage}</div>
                  </div>
                  <span className="small text-muted-custom">{formatRelativeTime(mention.lastMessageAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Mentions;
