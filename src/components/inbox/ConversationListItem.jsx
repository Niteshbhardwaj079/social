import Avatar from '../common/Avatar';
import PlatformIcon from '../common/PlatformIcon';
import { formatRelativeTime } from '../../utils/formatters';

function ConversationListItem({ conversation, isActive, onClick }) {
  return (
    <button
      type="button"
      className={`conversation-list-item ${isActive ? 'is-active' : ''} ${conversation.isUnread ? 'is-unread' : ''}`.trim()}
      onClick={onClick}
    >
      <div className="conversation-list-item__avatar">
        <Avatar name={conversation.customerName} size="md" />
        <span className="conversation-list-item__platform-dot">
          <PlatformIcon platformKey={conversation.platform} size={16} />
        </span>
      </div>
      <div className="conversation-list-item__content">
        <div className="d-flex justify-content-between">
          <span className="conversation-list-item__name">{conversation.customerName}</span>
          <span className="conversation-list-item__time">{formatRelativeTime(conversation.lastMessageAt)}</span>
        </div>
        <p className="conversation-list-item__preview">{conversation.lastMessage}</p>
      </div>
    </button>
  );
}

export default ConversationListItem;
