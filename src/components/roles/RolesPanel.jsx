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
import { useI18n } from '../../i18n/useI18n';
import { USER_ROLES } from '../../config/constants';

const BUILTIN_ROLE_IDS = new Set(Object.values(USER_ROLES));

function RolesPanel() {
  const { t } = useI18n();
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
        showToast({ type: 'success', title: t('rolesPanel.permissionsSaved') });
      })
      .catch((error) => {
        setIsSaving(false);
        showToast({ type: 'error', title: apiErrorMessage(error, t('rolesPanel.saveError')) });
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
        showToast({ type: 'success', title: t('rolesPanel.roleDuplicated'), message: clonedRole.name });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, t('rolesPanel.duplicateError')) }));
  }

  function handleDetailsSubmit(formValues) {
    if (editingRole) {
      updateRole(editingRole.id, formValues)
        .then((updatedRole) => {
          setRoles((current) => current.map((role) => (role.id === updatedRole.id ? updatedRole : role)));
          setIsDetailsModalOpen(false);
          showToast({ type: 'success', title: t('rolesPanel.roleUpdated') });
        })
        .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, t('rolesPanel.updateError')) }));
    } else {
      createRole({ ...formValues, permissions: {} })
        .then((newRole) => {
          setRoles((current) => [...current, newRole]);
          setSelectedRoleId(newRole.id);
          setDraftPermissions(newRole.permissions);
          setIsDirty(false);
          setIsDetailsModalOpen(false);
          showToast({ type: 'success', title: t('rolesPanel.roleCreated'), message: t('rolesPanel.roleCreatedHint') });
        })
        .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error, t('rolesPanel.createError')) }));
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
        showToast({ type: 'success', title: t('rolesPanel.roleDeleted') });
      })
      .catch((error) => {
        setRolePendingDelete(null);
        showToast({ type: 'error', title: apiErrorMessage(error, t('rolesPanel.deleteError')) });
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
      <CalloutBanner icon="Sparkles">{t('rolesPanel.intro')}</CalloutBanner>

      {roles.length === 0 ? (
        <EmptyState icon="ShieldCheck" title={t('rolesPanel.emptyTitle')} description={t('rolesPanel.emptyText')} />
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
            <span className="role-select-card--new__title">{t('rolesPanel.newRoleTitle')}</span>
            <span className="role-select-card--new__hint">{t('rolesPanel.newRoleHint')}</span>
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
                <h3 className="panel-card__title mb-1">
                  {t('rolesPanel.permissionsFor', { name: BUILTIN_ROLE_IDS.has(selectedRole.id) ? t(`roles.${selectedRole.id}`) : selectedRole.name })}
                </h3>
                <p className="permissions-panel__subtitle">
                  {selectedRole.isProtected ? t('rolesPanel.protectedHint') : t('rolesPanel.editHint')}
                </p>
              </div>
            </div>
            <div className="permissions-panel__actions">
              {isDirty && !selectedRole.isProtected ? (
                <button type="button" className="btn btn-outline-secondary-custom" onClick={handleDiscardChanges}>
                  {t('rolesPanel.discard')}
                </button>
              ) : null}
              {selectedRole.isProtected ? null : (
              <button type="button" className="btn btn-primary" disabled={!isDirty || isSaving} onClick={handleSaveChanges}>
                {isSaving ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.saveChanges')
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
        title={t('rolesPanel.deleteTitle')}
        message={t('rolesPanel.deleteMessage')}
        confirmLabel={t('common.delete')}
        isDanger
      />
    </>
  );
}

export default RolesPanel;
