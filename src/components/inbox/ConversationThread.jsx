import { useState } from 'react';
import Icon from '../common/Icon';
import Avatar from '../common/Avatar';
import { formatDateTime } from '../../utils/formatters';

function ConversationThread({ conversation, onSendReply, onBack, showBackButton }) {
  const [replyText, setReplyText] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!replyText.trim()) return;
    onSendReply(replyText.trim());
    setReplyText('');
  }

  return (
    <div className="conversation-thread">
      <div className="conversation-thread__header">
        {showBackButton ? (
          <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" onClick={onBack} aria-label="Back to conversations">
            <Icon name="ChevronLeft" size={16} />
          </button>
        ) : null}
        <Avatar name={conversation.customerName} size="sm" />
        <div className="flex-grow-1">
          <div className="fw-semibold small">{conversation.customerName}</div>
          <div className="small text-muted-custom">{conversation.assignedTo ? `Assigned to ${conversation.assignedTo}` : 'Unassigned'}</div>
        </div>
      </div>

      <div className="conversation-thread__messages">
        {conversation.messages.map((message) => (
          <div key={message.id} className={`conversation-message ${message.sender === 'agent' ? 'is-agent' : ''}`.trim()}>
            <div className="conversation-message__bubble">{message.text}</div>
            <div className="conversation-message__time">{formatDateTime(message.time)}</div>
          </div>
        ))}
      </div>

      <form className="conversation-thread__composer" onSubmit={handleSubmit}>
        <input
          type="text"
          className="form-control"
          placeholder="Type a reply..."
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
        />
        <button type="submit" className="btn btn-icon btn-primary" aria-label="Send reply">
          <Icon name="Send" size={18} />
        </button>
      </form>
    </div>
  );
}

export default ConversationThread;
