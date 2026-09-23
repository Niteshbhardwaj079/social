import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar';
import Icon from '../common/Icon';
import DropdownMenu from '../common/DropdownMenu';
import { getPlatformByKey } from '../../config/platforms';
import { CONVERSATION_STATUS, ACCOUNT_STATUS } from '../../config/constants';
import { PROFILE_FIELD_META, resolveProfileFields } from '../../config/platformProfileFields';
import { getAccountApiTier, getAccountStatus } from '../../services/api/socialAccountsApi';
import { getAssignableUsers } from '../../services/api/inboxApi';
import { formatCompactNumber, formatDate } from '../../utils/formatters';

function formatFieldValue(key, value) {
  if (key === 'joinedAt') return formatDate(value);
  if (typeof value === 'number') return formatCompactNumber(value);
  return value;
}

function ProfileRow({ field }) {
  const meta = PROFILE_FIELD_META[field.key];
  let valueNode;

  if (field.key === 'verified') {
    valueNode = field.value ? (
      <span className="profile-chip profile-chip--yes">
        <Icon name="BadgeCheck" size={13} /> Verified
      </span>
    ) : (
      <span className="text-muted-custom">No</span>
    );
  } else if (field.key === 'followsYou' || field.key === 'youFollow') {
    valueNode = <span className={`profile-chip ${field.value ? 'profile-chip--yes' : ''}`.trim()}>{field.value ? 'Yes' : 'No'}</span>;
  } else if (field.key === 'profileUrl') {
    valueNode = (
      <a href={field.value} target="_blank" rel="noopener noreferrer" className="profile-link">
        Open profile <Icon name="ExternalLink" size={13} />
      </a>
    );
  } else if (field.key === 'userId') {
    valueNode = <code className="profile-id">{field.value}</code>;
  } else {
    valueNode = <span>{formatFieldValue(field.key, field.value)}</span>;
  }

  return (
    <div className="customer-info-panel__section">
      <span className="customer-info-panel__label">
        {meta.label}
        {field.isPaid ? <span className="profile-paid-dot" data-tooltip="From your paid API plan" /> : null}
      </span>
      {valueNode}
    </div>
  );
}

function CustomerInfoPanel({ conversation, onAssign, onStatusChange }) {
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    getAssignableUsers().then(setTeamMembers);
  }, []);

  const platform = getPlatformByKey(conversation.platform);
  const apiTier = getAccountApiTier(conversation.platform);
  const connectionStatus = getAccountStatus(conversation.platform);
  const { shown, locked, access } = resolveProfileFields(conversation.platform, apiTier, conversation.customerProfile);

  const stats = shown.filter((field) => PROFILE_FIELD_META[field.key].isStat);
  const bio = shown.find((field) => field.key === 'bio');
  const rows = shown.filter((field) => !PROFILE_FIELD_META[field.key].isStat && field.key !== 'bio');
  const handle = shown.find((field) => field.key === 'handle');

  const firstMessage = conversation.messages[0];
  const isConnected = connectionStatus === ACCOUNT_STATUS.CONNECTED;

  return (
    <div className="customer-info-panel">
      <div className="text-center mb-4">
        <Avatar name={conversation.customerName} size="lg" className="mx-auto mb-3" />
        <div className="fw-semibold">{conversation.customerName}</div>
        {handle ? <div className="small text-primary-custom">{handle.value}</div> : null}
        <div className="small text-muted-custom">via {platform?.label}</div>
      </div>

      {stats.length > 0 ? (
        <div className="profile-stat-tiles">
          {stats.map((field) => (
            <div key={field.key} className="profile-stat-tile">
              <span className="profile-stat-tile__value">{formatFieldValue(field.key, field.value)}</span>
              <span className="profile-stat-tile__label">{PROFILE_FIELD_META[field.key].label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {bio ? <p className="profile-bio">{bio.value}</p> : null}

      {rows.filter((field) => field.key !== 'handle').map((field) => (
        <ProfileRow key={field.key} field={field} />
      ))}

      {locked.length > 0 ? (
        <div className="profile-locked">
          <Icon name="Lock" size={14} />
          <span>
            {locked.map((key) => PROFILE_FIELD_META[key].label.toLowerCase()).slice(0, 4).join(', ')} and more show here with{' '}
            {access.paidPlanName || 'a paid API plan'}.{' '}
            <Link to={`/social-accounts/connect/${conversation.platform}`}>Use a paid key</Link>
          </span>
        </div>
      ) : null}

      <div className="profile-source">
        <Icon name="Plug" size={12} />
        <span>
          {platform?.label} API · {apiTier === 'paid' ? 'paid plan' : 'free plan'}
        </span>
      </div>
      {!isConnected ? (
        <div className="profile-source is-warning">
          <Icon name="AlertTriangle" size={12} />
          <span>
            Connection needs attention — <Link to={`/social-accounts/connect/${conversation.platform}`}>reconnect</Link> to refresh this data.
          </span>
        </div>
      ) : null}
      {access.note ? <p className="profile-note">{access.note}</p> : null}

      <hr />

      <div className="customer-info-panel__section">
        <span className="customer-info-panel__label">First message</span>
        <span>{firstMessage ? formatDate(firstMessage.time) : '—'}</span>
      </div>
      <div className="customer-info-panel__section">
        <span className="customer-info-panel__label">Messages</span>
        <span>{conversation.messages.length}</span>
      </div>
      <div className="customer-info-panel__section">
        <span className="customer-info-panel__label">Assigned to</span>
        <DropdownMenu
          align="start"
          trigger={
            <button type="button" className="btn btn-sm btn-outline-secondary-custom">
              {conversation.assignedTo || 'Unassigned'} <Icon name="ChevronDown" size={14} />
            </button>
          }
        >
          {({ close }) =>
            teamMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onAssign(member);
                  close();
                }}
              >
                {member.name}
              </button>
            ))
          }
        </DropdownMenu>
      </div>

      <div className="d-flex flex-column gap-2 mt-4">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary-custom"
          onClick={() => onStatusChange(CONVERSATION_STATUS.PENDING)}
        >
          Mark as Pending
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => onStatusChange(CONVERSATION_STATUS.CLOSED)}
        >
          Close Conversation
        </button>
      </div>
    </div>
  );
}

export default CustomerInfoPanel;
