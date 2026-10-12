import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';
import { USER_ROLES } from '../../config/constants';

const BUILTIN_ROLE_IDS = new Set(Object.values(USER_ROLES));

function RoleSelectCard({ role, isSelected, onSelect, onClone, onRename, onDelete }) {
  const { t } = useI18n();
  const isBuiltin = BUILTIN_ROLE_IDS.has(role.id);
  const name = isBuiltin ? t(`roles.${role.id}`) : role.name;
  const description = isBuiltin ? t(`roles.descriptions.${role.id}`) : role.description;
  const peopleLabel = t(role.usersCount === 1 ? 'rolesPanel.personCountOne' : 'rolesPanel.personCountOther', { count: role.usersCount });

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
          aria-label={t('rolesPanel.duplicateAria', { name })}
          title={t('rolesPanel.duplicateTitle')}
        >
          <Icon name="Copy" size={14} />
        </button>
      </div>

      <div className="role-select-card__body">
        {role.isProtected ? (
          <span className="role-select-card__name">
            {name}
            <Icon name="Lock" size={12} />
          </span>
        ) : (
          <span className="role-select-card__name">{name}</span>
        )}
        {role.isActive === false ? <span className="badge bg-secondary-subtle text-secondary-emphasis">{t('rolesPanel.archived')}</span> : null}
        <p className="role-select-card__description">{description}</p>
      </div>

      <div className="role-select-card__footer">
        <span className="small text-muted-custom">{peopleLabel}</span>
        <div className="d-flex gap-1">
          {!role.isProtected ? (
            <button
              type="button"
              className="btn btn-icon-sm bg-transparent border-0"
              onClick={(event) => {
                event.stopPropagation();
                onRename(role);
              }}
              aria-label={t('rolesPanel.editAria', { name })}
              title={t('common.edit')}
            >
              <Icon name="Pencil" size={14} />
            </button>
          ) : null}
          {!role.isProtected ? (
            <button
              type="button"
              className="btn btn-icon-sm bg-transparent border-0 text-danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(role);
              }}
              aria-label={t('rolesPanel.deleteAria', { name })}
              title={t('common.delete')}
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
