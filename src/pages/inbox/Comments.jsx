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
import { formatRelativeTime } from '../../utils/formatters';
import { useI18n } from '../../i18n/useI18n';

function Comments() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [comments, setComments] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);

  function loadComments() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getConversations()
      .then((conversations) => {
        const flattenedComments = conversations.flatMap((conversation) =>
          conversation.messages
            .filter((message) => message.sender === 'customer')
            .map((message) => ({ ...message, conversation }))
        );
        setComments(flattenedComments);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadComments();
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.comments')} subtitle="Loading comments..." />
        <SkeletonTable rows={5} columns={3} />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.comments')} />
        <ErrorState onRetry={loadComments} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('nav.comments')} subtitle={t('pages.comments')} guideChapterId="inbox" />

      <div className="panel-card">
        <div className="panel-card__body panel-card__body--flush">
          {comments.length === 0 ? (
            <EmptyState icon="MessageSquare" title="No comments yet" description="Comments from your posts will appear here." />
          ) : (
            <div className="d-flex flex-column">
              {comments.map((comment) => (
                <div
                  key={comment.id + comment.conversation.id}
                  className="agenda-group__post border-bottom px-5 py-3"
                  onClick={() => navigate('/inbox')}
                  role="button"
                  tabIndex={0}
                >
                  <Avatar name={comment.conversation.customerName} size="sm" />
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-semibold small">{comment.conversation.customerName}</span>
                      <PlatformIcon platformKey={comment.conversation.platform} size={16} />
                    </div>
                    <div className="small text-secondary-custom">{comment.text}</div>
                  </div>
                  <span className="small text-muted-custom">{formatRelativeTime(comment.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Comments;
