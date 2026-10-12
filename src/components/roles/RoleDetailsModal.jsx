import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import { ROLE_ACCENTS } from '../../config/rolePermissions';
import { useI18n } from '../../i18n/useI18n';

const EMPTY_FORM_VALUES = { name: '', description: '', icon: 'Shield', accent: 'slate', rank: 1, isActive: true };

function RoleDetailsModal({ isOpen, onClose, onSubmit, editingRole }) {
  const { t } = useI18n();
  const [formValues, setFormValues] = useState(EMPTY_FORM_VALUES);

  useEffect(() => {
    setFormValues(
      editingRole
        ? {
            name: editingRole.name,
            description: editingRole.description || '',
            icon: editingRole.icon || 'Shield',
            accent: editingRole.accent || 'slate',
            rank: editingRole.rank || 1,
            isActive: editingRole.isActive !== false,
          }
        : EMPTY_FORM_VALUES
    );
  }, [editingRole, isOpen]);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ ...formValues, rank: Number(formValues.rank) });
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="role-details-form" className="btn btn-primary">
        {editingRole ? t('common.saveChanges') : t('rolesPanel.createRoleTitle')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingRole ? t('rolesPanel.editRoleTitle') : t('rolesPanel.createRoleTitle')} footer={footer} size="sm">
      <form id="role-details-form" onSubmit={handleSubmit}>
        <TextField
          id="roleDetailsName"
          label={t('rolesPanel.roleName')}
          value={formValues.name}
          onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
          required
          autoFocus
        />
        <div className="mb-3">
          <label htmlFor="roleDetailsDescription" className="form-label-custom">
            {t('rolesPanel.description')}
          </label>
          <textarea
            id="roleDetailsDescription"
            className="form-control"
            rows={2}
            value={formValues.description}
            onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
            placeholder={t('rolesPanel.descriptionPlaceholder')}
          />
        </div>
        <div className="row g-2 mb-3">
          <div className="col-6">
            <label htmlFor="roleDetailsIcon" className="form-label-custom">
              {t('rolesPanel.icon')}
            </label>
            <input
              id="roleDetailsIcon"
              type="text"
              className="form-control"
              value={formValues.icon}
              onChange={(event) => setFormValues((current) => ({ ...current, icon: event.target.value }))}
              placeholder={t('rolesPanel.iconPlaceholder')}
            />
          </div>
          <div className="col-6">
            <label htmlFor="roleDetailsAccent" className="form-label-custom">
              {t('rolesPanel.color')}
            </label>
            <select
              id="roleDetailsAccent"
              className="form-select"
              value={formValues.accent}
              onChange={(event) => setFormValues((current) => ({ ...current, accent: event.target.value }))}
            >
              {ROLE_ACCENTS.map((accent) => (
                <option key={accent} value={accent}>
                  {t(`rolesPanel.accents.${accent}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="roleDetailsRank" className="form-label-custom">
            {t('rolesPanel.rankLabel')}
          </label>
          <input
            id="roleDetailsRank"
            type="number"
            min={1}
            max={3}
            className="form-control"
            value={formValues.rank}
            onChange={(event) => setFormValues((current) => ({ ...current, rank: event.target.value }))}
          />
          <p className="form-hint mb-0 mt-1">{t('rolesPanel.rankHint')}</p>
        </div>
        {editingRole ? (
          <div className="form-check form-switch">
            <input
              id="roleDetailsIsActive"
              type="checkbox"
              className="form-check-input"
              checked={formValues.isActive}
              onChange={(event) => setFormValues((current) => ({ ...current, isActive: event.target.checked }))}
            />
            <label htmlFor="roleDetailsIsActive" className="form-check-label">
              {t('rolesPanel.activeLabel')}
            </label>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export default RoleDetailsModal;
