import Icon from './Icon';

function EmptyState({ icon = 'Inbox', title, description, actionLabel, onAction, className = '' }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="empty-state__icon">
        <Icon name={icon} size={28} />
      </div>
      <div className="empty-state__title">{title}</div>
      {description ? <div className="empty-state__description">{description}</div> : null}
      {actionLabel && onAction ? (
        <button type="button" className="btn btn-primary empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;
