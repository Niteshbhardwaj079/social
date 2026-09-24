import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import { ROLE_ACCENTS } from '../../config/rolePermissions';

const EMPTY_FORM_VALUES = { name: '', description: '', icon: 'Shield', accent: 'slate', rank: 1, isActive: true };

function RoleDetailsModal({ isOpen, onClose, onSubmit, editingRole }) {
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
        Cancel
      </button>
      <button type="submit" form="role-details-form" className="btn btn-primary">
        {editingRole ? 'Save Changes' : 'Create Role'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingRole ? 'Edit Role' : 'Create Role'} footer={footer} size="sm">
      <form id="role-details-form" onSubmit={handleSubmit}>
        <TextField
          id="roleDetailsName"
          label="Role name"
          value={formValues.name}
          onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
          required
          autoFocus
        />
        <div className="mb-3">
          <label htmlFor="roleDetailsDescription" className="form-label-custom">
            Description
          </label>
          <textarea
            id="roleDetailsDescription"
            className="form-control"
            rows={2}
            value={formValues.description}
            onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
            placeholder="What can people with this role do?"
          />
        </div>
        <div className="row g-2 mb-3">
          <div className="col-6">
            <label htmlFor="roleDetailsIcon" className="form-label-custom">
              Icon
            </label>
            <input
              id="roleDetailsIcon"
              type="text"
              className="form-control"
              value={formValues.icon}
              onChange={(event) => setFormValues((current) => ({ ...current, icon: event.target.value }))}
              placeholder="e.g. Megaphone"
            />
          </div>
          <div className="col-6">
            <label htmlFor="roleDetailsAccent" className="form-label-custom">
              Color
            </label>
            <select
              id="roleDetailsAccent"
              className="form-select"
              value={formValues.accent}
              onChange={(event) => setFormValues((current) => ({ ...current, accent: event.target.value }))}
            >
              {ROLE_ACCENTS.map((accent) => (
                <option key={accent} value={accent}>
                  {accent}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="roleDetailsRank" className="form-label-custom">
            Seniority rank (1-3)
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
          <p className="form-hint mb-0 mt-1">
            Higher outranks lower for managing people — someone can only invite, edit or remove people ranked below
            them. Rank 4 is reserved for Super Admin.
          </p>
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
              Active (an archived role cannot be newly assigned; people who already have it keep working)
            </label>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export default RoleDetailsModal;
