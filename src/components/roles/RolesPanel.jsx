import { useEffect, useState } from 'react';
import CalloutBanner from '../common/CalloutBanner';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import ConfirmDialog from '../common/ConfirmDialog';
import Icon from '../common/Icon';
import RoleSelectCard from './RoleSelectCard';
import RoleDetailsModal from './RoleDetailsModal';
import PermissionMatrix from './PermissionMatrix';
import { SkeletonKpiRow } from '../common/LoadingSkeleton';
import { getRoles, createRole, updateRole, deleteRole, cloneRole } from '../../services/api/rolesApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { useToast } from '../common/ToastProvider';

function RolesPanel() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draftPermissions, setDraftPermissions] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [rolePendingDelete, setRolePendingDelete] = useState(null);

  function loadRoles(selectRoleId) {
    setIsLoading(true);
    setHasError(false);
    getRoles()
      .then((data) => {
        setRoles(data);
        const roleToSelect = data.find((role) => role.id === selectRoleId) || data[0];
        setSelectedRoleId(roleToSelect?.id || null);
        setDraftPermissions(roleToSelect?.permissions || {});
        setIsDirty(false);
        setIsLoading(false);
      })
      .catch(() => {
        setHasError(true);
        setIsLoading(false);
      });
  }

  useEffect(() => {
    loadRoles();
  }, []);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null;

  function handleSelectRole(role) {
    if (role.id === selectedRoleId) return;
    setSelectedRoleId(role.id);
    setDraftPermissions(role.permissions);
    setIsDirty(false);
  }

  function handlePermissionsChange(nextPermissions) {
    setDraftPermissions(nextPermissions);
    setIsDirty(true);
  }

  function handleSaveChanges() {
    setIsSaving(true);
    updateRole(selectedRoleId, { permissions: draftPermissions })
      .then((updatedRole) => {
        setIsSaving(false);
        setIsDirty(false);
        setRoles((current) => current.map((role) => (role.id === updatedRole.id ? updatedRole : role)));
        showToast({ type: 'success', title: 'Permissions saved' });
      })
      .catch((error) => {
        setIsSaving(false);
        showToast({ type: 'error', title: apiErrorMessage(error, 'Could not save permissions.') });
      });
  }

  function handleDiscardChanges() {
    setDraftPermissions(selectedRole.permissions);
    setIsDirty(false);
  }

  function handleClone(roleId) {
    cloneRole(roleId)
      .then((clonedRole) => {
        setRoles((current) => [...current, clonedRole]);
        setSelectedRoleId(clonedRole.id);
        setDraftPermissions(clonedRole.permissions);
        setIsDirty(false);
        showToast({ type: 'success', title: 'Role duplicated', message: clonedRole.name });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, 'Could not duplicate this role.') }));
  }

  function handleDetailsSubmit(formValues) {
    if (editingRole) {
      updateRole(editingRole.id, formValues)
        .then((updatedRole) => {
          setRoles((current) => current.map((role) => (role.id === updatedRole.id ? updatedRole : role)));
          setIsDetailsModalOpen(false);
          showToast({ type: 'success', title: 'Role updated' });
        })
        .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, 'Could not update this role.') }));
    } else {
      createRole({ ...formValues, permissions: {} })
        .then((newRole) => {
          setRoles((current) => [...current, newRole]);
          setSelectedRoleId(newRole.id);
          setDraftPermissions(newRole.permissions);
          setIsDirty(false);
          setIsDetailsModalOpen(false);
          showToast({ type: 'success', title: 'Role created', message: 'Set its permissions below.' });
        })
        .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, 'Could not create this role.') }));
    }
  }

  function handleDeleteConfirmed() {
    if (!rolePendingDelete) return;
    const wasSelected = rolePendingDelete.id === selectedRoleId;
    deleteRole(rolePendingDelete.id)
      .then(() => {
        const remainingRoles = roles.filter((role) => role.id !== rolePendingDelete.id);
        setRoles(remainingRoles);
        setRolePendingDelete(null);
        if (wasSelected) {
          const nextRole = remainingRoles[0] || null;
          setSelectedRoleId(nextRole?.id || null);
          setDraftPermissions(nextRole?.permissions || {});
          setIsDirty(false);
        }
        showToast({ type: 'success', title: 'Role deleted' });
      })
      .catch((error) => {
        setRolePendingDelete(null);
        showToast({ type: 'error', title: apiErrorMessage(error, 'Could not delete this role.') });
      });
  }

  if (isLoading) {
    return <SkeletonKpiRow />;
  }

  if (hasError) {
    return <ErrorState onRetry={() => loadRoles()} />;
  }

  return (
    <>
      <CalloutBanner icon="Sparkles">
        Build any role your workspace needs. Duplicate an existing role to save time, or start from scratch and
        tick exactly the permissions it should have.
      </CalloutBanner>

      {roles.length === 0 ? (
        <EmptyState icon="ShieldCheck" title="No roles yet" description="Create a role to control workspace permissions." />
      ) : (
        <div className="roles-grid">
          {roles.map((role) => (
            <RoleSelectCard
              key={role.id}
              role={role}
              isSelected={role.id === selectedRoleId}
              onSelect={() => handleSelectRole(role)}
              onClone={handleClone}
              onRename={(roleToEdit) => {
                setEditingRole(roleToEdit);
                setIsDetailsModalOpen(true);
              }}
              onDelete={setRolePendingDelete}
            />
          ))}
          <button
            type="button"
            className="role-select-card--new"
            onClick={() => {
              setEditingRole(null);
              setIsDetailsModalOpen(true);
            }}
          >
            <span className="role-select-card--new__icon">
              <Icon name="Plus" size={22} />
            </span>
            <span className="role-select-card--new__title">New Role</span>
            <span className="role-select-card--new__hint">
              Duplicating an existing role saves time — you can change every tick afterwards.
            </span>
          </button>
        </div>
      )}

      {selectedRole ? (
        <div className="permissions-panel">
          <div className="permissions-panel__header">
            <div className="permissions-panel__title-group">
              <span className={`role-icon role-icon--${selectedRole.accent || 'slate'}`}>
                <Icon name={selectedRole.icon || 'User'} size={18} />
              </span>
              <div>
                <h3 className="panel-card__title mb-1">Permissions for {selectedRole.name}</h3>
                <p className="permissions-panel__subtitle">
                  {selectedRole.isProtected
                    ? 'The Super Admin role always has every permission and cannot be changed.'
                    : 'Tick a box to allow it, untick to block it, then save your changes.'}
                </p>
              </div>
            </div>
            <div className="permissions-panel__actions">
              {isDirty && !selectedRole.isProtected ? (
                <button type="button" className="btn btn-outline-secondary-custom" onClick={handleDiscardChanges}>
                  Discard
                </button>
              ) : null}
              {selectedRole.isProtected ? null : (
              <button type="button" className="btn btn-primary" disabled={!isDirty || isSaving} onClick={handleSaveChanges}>
                {isSaving ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
              )}
            </div>
          </div>
          <div className="panel-card__body">
            <PermissionMatrix permissions={draftPermissions} onChange={handlePermissionsChange} disabled={selectedRole.isProtected} />
          </div>
        </div>
      ) : null}

      <RoleDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        onSubmit={handleDetailsSubmit}
        editingRole={editingRole}
      />

      <ConfirmDialog
        isOpen={Boolean(rolePendingDelete)}
        onClose={() => setRolePendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        title="Delete this role?"
        message="Users assigned to this role will need to be reassigned."
        confirmLabel="Delete"
        isDanger
      />
    </>
  );
}

export default RolesPanel;
