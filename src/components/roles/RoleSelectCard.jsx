import Icon from '../common/Icon';

function RoleSelectCard({ role, isSelected, onSelect, onClone, onRename, onDelete }) {
  const peopleLabel = `${role.usersCount} ${role.usersCount === 1 ? 'person' : 'people'}`;

  return (
    <div
      className={`role-select-card ${isSelected ? 'is-selected' : ''}`.trim()}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="role-select-card__top">
        <span className={`role-icon role-icon--${role.accent || 'slate'}`}>
          <Icon name={role.icon || 'User'} size={18} />
        </span>
        <button
          type="button"
          className="btn btn-icon-sm btn-outline-secondary-custom"
          onClick={(event) => {
            event.stopPropagation();
            onClone(role.id);
          }}
          aria-label={`Duplicate ${role.name}`}
          title="Duplicate role"
        >
          <Icon name="Copy" size={14} />
        </button>
      </div>

      <div className="role-select-card__body">
        {role.isSystemRole ? (
          <span className="role-select-card__name">
            {role.name}
            <Icon name="Lock" size={12} />
          </span>
        ) : (
          <span className="role-select-card__name">{role.name}</span>
        )}
        <p className="role-select-card__description">{role.description}</p>
      </div>

      <div className="role-select-card__footer">
        <span className="small text-muted-custom">{peopleLabel}</span>
        <div className="d-flex gap-1">
          <button
            type="button"
            className="btn btn-icon-sm bg-transparent border-0"
            onClick={(event) => {
              event.stopPropagation();
              onRename(role);
            }}
            aria-label={`Rename ${role.name}`}
            title="Rename"
          >
            <Icon name="Pencil" size={14} />
          </button>
          {!role.isSystemRole ? (
            <button
              type="button"
              className="btn btn-icon-sm bg-transparent border-0 text-danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(role);
              }}
              aria-label={`Delete ${role.name}`}
              title="Delete"
            >
              <Icon name="Trash2" size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default RoleSelectCard;
