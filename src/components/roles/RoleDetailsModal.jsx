import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';

const EMPTY_FORM_VALUES = { name: '', description: '' };

function RoleDetailsModal({ isOpen, onClose, onSubmit, editingRole }) {
  const [formValues, setFormValues] = useState(EMPTY_FORM_VALUES);

  useEffect(() => {
    setFormValues(
      editingRole ? { name: editingRole.name, description: editingRole.description } : EMPTY_FORM_VALUES
    );
  }, [editingRole, isOpen]);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(formValues);
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
    <Modal isOpen={isOpen} onClose={onClose} title={editingRole ? 'Rename Role' : 'Create Role'} footer={footer} size="sm">
      <form id="role-details-form" onSubmit={handleSubmit}>
        <TextField
          id="roleDetailsName"
          label="Role name"
          value={formValues.name}
          onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
          required
          autoFocus
        />
        <div className="mb-0">
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
      </form>
    </Modal>
  );
}

export default RoleDetailsModal;
