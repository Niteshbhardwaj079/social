import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import ConversationListItem from '../../components/inbox/ConversationListItem';
import ConversationThread from '../../components/inbox/ConversationThread';
import CustomerInfoPanel from '../../components/inbox/CustomerInfoPanel';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Icon from '../../components/common/Icon';
import { getConversations, sendReply, updateConversationStatus, assignConversation } from '../../services/api/inboxApi';
import { REQUEST_STATUS } from '../../config/constants';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

function Inbox() {
  const { t } = useI18n();
  const isMobile = useMediaQuery('(max-width: 991px)');

  const [conversations, setConversations] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  function loadConversations() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getConversations()
      .then((data) => {
        setConversations(data);
        setActiveConversationId(data[0]?.id || null);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadConversations();
  }, []);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const filteredConversations = conversations.filter((conversation) =>
    conversation.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleSelectConversation(conversationId) {
    setActiveConversationId(conversationId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, isUnread: false } : conversation
      )
    );
    setIsMobileDetailOpen(true);
  }

  function handleSendReply(text) {
    sendReply(activeConversationId, text).then((message) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, messages: [...conversation.messages, message], lastMessage: text, lastMessageAt: message.time }
            : conversation
        )
      );
    });
  }

  function handleAssign(assignee) {
    assignConversation(activeConversationId, assignee).then(() => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId ? { ...conversation, assignedTo: assignee } : conversation
        )
      );
    });
  }

  function handleStatusChange(status) {
    updateConversationStatus(activeConversationId, status).then(() => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId ? { ...conversation, status } : conversation
        )
      );
    });
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.inbox')} subtitle="Loading conversations..." />
        <div className="skeleton-card" />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.inbox')} />
        <ErrorState onRetry={loadConversations} />
      </>
    );
  }

  if (conversations.length === 0) {
    return (
      <>
        <PageHeader title={t('nav.inbox')} />
        <EmptyState icon="Inbox" title="No conversations yet" description="Messages from your connected accounts will show up here." />
      </>
    );
  }

  const showListOnMobile = isMobile && !isMobileDetailOpen;
  const showDetailOnMobile = isMobile && isMobileDetailOpen;

  return (
    <div className="fade-in inbox-page">
      <PageHeader title={t('nav.inbox')} subtitle={t('pages.inbox')} guideChapterId="inbox" />

      <div className="inbox-shell">
        {!isMobile || showListOnMobile ? (
          <div className="inbox-shell__list">
            <div className="search-input mb-3">
              <Icon name="Search" size={16} />
              <input
                type="search"
                className="form-control"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="conversation-list">
              {filteredConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === activeConversationId}
                  onClick={() => handleSelectConversation(conversation.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {(!isMobile || showDetailOnMobile) && activeConversation ? (
          <div className="inbox-shell__thread">
            <ConversationThread
              conversation={activeConversation}
              onSendReply={handleSendReply}
              onBack={() => setIsMobileDetailOpen(false)}
              showBackButton={isMobile}
            />
          </div>
        ) : null}

        {!isMobile && activeConversation ? (
          <div className="inbox-shell__info">
            <CustomerInfoPanel conversation={activeConversation} onAssign={handleAssign} onStatusChange={handleStatusChange} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Inbox;
