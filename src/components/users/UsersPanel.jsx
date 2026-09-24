import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Avatar from '../common/Avatar';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import ConfirmDialog from '../common/ConfirmDialog';
import DropdownMenu from '../common/DropdownMenu';
import Icon from '../common/Icon';
import UserFormModal from './UserFormModal';
import { SkeletonTable } from '../common/LoadingSkeleton';
import { StatCardGrid } from '../common/StatCard';
import { BulkActionBar, Pager, TableToolbar } from '../common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import { getUsers, createUser, updateUser, deleteUser, sendPasswordReset } from '../../services/api/usersApi';
import { getRoles } from '../../services/api/rolesApi';
import { USER_ROLES, USER_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import { getLanguage } from '../../i18n/languages';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { formatRelativeTime } from '../../utils/formatters';
import { useToast } from '../common/ToastProvider';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';
import { setCurrentUser } from '../../store/slices/authSlice';

const BUILTIN_ROLE_IDS = new Set(Object.values(USER_ROLES));
const roleLabel = (t, roleId, roleNameById) => (BUILTIN_ROLE_IDS.has(roleId) ? t(`roles.${roleId}`) : roleNameById[roleId] || roleId);

const USER_STATUS_MODIFIER = {
  [USER_STATUS.ACTIVE]: 'connected',
  [USER_STATUS.DISABLED]: 'disconnected',
  [USER_STATUS.INVITED]: 'pending',
};

const USER_STATUS_LABEL_KEY = {
  [USER_STATUS.ACTIVE]: 'users.active',
  [USER_STATUS.DISABLED]: 'users.disabled',
  [USER_STATUS.INVITED]: 'users.invited',
};

const EMPTY_FORM_STATE = { isOpen: false, editingUser: null };

function UsersPanel({ formState, onFormStateChange }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.currentUser);
  const currentUserId = currentUser?.id;
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [userPendingDelete, setUserPendingDelete] = useState(null);
  const [userPendingPasswordReset, setUserPendingPasswordReset] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [roleChoices, setRoleChoices] = useState(Object.values(USER_ROLES).map((id) => ({ id, name: id })));
  const roleNameById = useMemo(() => Object.fromEntries(roleChoices.map((role) => [role.id, role.name])), [roleChoices]);

  // Mirrors the backend's canManageTarget (userService.js/permissions.js) exactly: a protected
  // role (Super Admin) can manage anyone; otherwise only a strictly-lower, non-protected rank.
  // Editing, disabling, deleting and resetting the password of anyone this returns false for is
  // refused server-side regardless — this just keeps the UI from offering a guaranteed dead end.
  function canManageRole(roleId) {
    if (currentUser?.roleIsProtected) return true;
    const role = roleChoices.find((item) => item.id === roleId);
    if (!role || role.isProtected) return false;
    return (role.rank ?? 0) < (currentUser?.roleRank ?? 0);
  }

  useEffect(() => {
    if (!API_ENABLED) return;
    getRoles().then(setRoleChoices);
  }, []);

  function loadUsers() {
    setIsLoading(true);
    setHasError(false);
    getUsers()
      .then((data) => {
        setUsers(data);
        setIsLoading(false);
      })
      .catch(() => {
        setHasError(true);
        setIsLoading(false);
      });
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const pagination = usePagination(filteredUsers, { resetKey: `${searchTerm}|${roleFilter}|${statusFilter}` });

  const statusCount = (status) => users.filter((user) => user.status === status).length;
  const statusCard = (status) => ({
    isActive: statusFilter === status,
    onClick: () => setStatusFilter((current) => (current === status ? 'all' : status)),
  });
  const statCards = [
    { key: 'all', label: t('users.total'), value: users.length, icon: 'Users', tone: 'primary', isActive: statusFilter === 'all', onClick: () => setStatusFilter('all') },
    { key: 'active', label: t('users.active'), value: statusCount(USER_STATUS.ACTIVE), icon: 'UserCheck', tone: 'green', ...statusCard(USER_STATUS.ACTIVE) },
    { key: 'invited', label: t('users.invited'), value: statusCount(USER_STATUS.INVITED), icon: 'MailPlus', tone: 'amber', ...statusCard(USER_STATUS.INVITED) },
    { key: 'disabled', label: t('users.disabled'), value: statusCount(USER_STATUS.DISABLED), icon: 'UserX', tone: 'slate', ...statusCard(USER_STATUS.DISABLED) },
  ];

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedIds.has(user.id));

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        filteredUsers.forEach((user) => next.delete(user.id));
        return next;
      }
      const next = new Set(current);
      filteredUsers.forEach((user) => next.add(user.id));
      return next;
    });
  }

  function toggleSelectOne(userId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function closeForm() {
    onFormStateChange(EMPTY_FORM_STATE);
  }

  // A refused action (no permission, duplicate email...) explains itself instead of failing silently.
  function showError(error) {
    showToast({ type: 'error', title: apiErrorMessage(error) });
  }

  function handleFormSubmit(formValues) {
    if (formState.editingUser) {
      updateUser(formState.editingUser.id, formValues)
        .then((updatedUser) => {
          setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
          // This list endpoint's response never carries permissions/roleRank (only the signed-in
          // actor's own /auth/me-style responses do) — merge just the editable fields into the
          // existing currentUser instead of replacing it, so a self-edit doesn't wipe those out.
          if (updatedUser.id === currentUserId) {
            dispatch(setCurrentUser({ ...currentUser, name: updatedUser.name, email: updatedUser.email, language: updatedUser.language }));
          }
          closeForm();
          showToast({ type: 'success', title: t('users.updated') });
        })
        .catch(showError);
    } else {
      createUser(formValues)
        .then(({ user: newUser, invitation }) => {
          setUsers((current) => [newUser, ...current]);
          closeForm();
          // The invitation goes out in the NEW person's own language, using that language's copy.
          showToast({
            type: 'success',
            title: t('users.inviteSent'),
            message: invitation.sent
              ? t('users.inviteSentIn', { name: newUser.name, language: getLanguage(invitation.language).nativeName })
              : t('users.inviteNoEmail', { name: newUser.name }),
          });
        })
        .catch(showError);
    }
  }

  function handleToggleStatus(user) {
    const nextStatus = user.status === USER_STATUS.DISABLED ? USER_STATUS.ACTIVE : USER_STATUS.DISABLED;
    updateUser(user.id, { status: nextStatus })
      .then((updatedUser) => {
        setUsers((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
        showToast({ type: 'info', title: nextStatus === USER_STATUS.DISABLED ? t('users.disabledToast') : t('users.enabledToast') });
      })
      .catch(showError);
  }

  function handleDeleteConfirmed() {
    if (!userPendingDelete) return;
    deleteUser(userPendingDelete.id)
      .then(() => {
        setUsers((current) => current.filter((user) => user.id !== userPendingDelete.id));
        setUserPendingDelete(null);
        showToast({ type: 'success', title: t('users.removedToast') });
      })
      .catch((error) => {
        setUserPendingDelete(null);
        showError(error);
      });
  }

  function handlePasswordResetConfirmed() {
    if (!userPendingPasswordReset) return;
    sendPasswordReset(userPendingPasswordReset.id)
      .then(() => {
        showToast({ type: 'success', title: t('users.passwordResetSentToast', { name: userPendingPasswordReset.name }) });
        setUserPendingPasswordReset(null);
      })
      .catch((error) => {
        setUserPendingPasswordReset(null);
        showError(error);
      });
  }

  function handleBulkStatusChange(nextStatus) {
    const ids = [...selectedIds];
    // allSettled: if one person cannot be changed (a server refusal), the others still are.
    Promise.allSettled(ids.map((id) => updateUser(id, { status: nextStatus }))).then((results) => {
      const updatedUsers = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failure = results.find((result) => result.status === 'rejected');
      setUsers((current) => current.map((user) => updatedUsers.find((updated) => updated.id === user.id) || user));
      setSelectedIds(new Set());
      if (updatedUsers.length > 0) {
        showToast({
          type: 'info',
          title: t(nextStatus === USER_STATUS.DISABLED ? 'users.bulkDisabled' : 'users.bulkEnabled', { count: updatedUsers.length }),
        });
      }
      if (failure) showError(failure.reason);
    });
  }

  function handleBulkDeleteConfirmed() {
    const ids = [...selectedIds];
    Promise.allSettled(ids.map((id) => deleteUser(id))).then((results) => {
      const removedIds = new Set(ids.filter((id, index) => results[index].status === 'fulfilled'));
      const failure = results.find((result) => result.status === 'rejected');
      setUsers((current) => current.filter((user) => !removedIds.has(user.id)));
      setSelectedIds(new Set());
      setIsBulkDeleteConfirmOpen(false);
      if (removedIds.size > 0) showToast({ type: 'success', title: t('users.bulkRemoved', { count: removedIds.size }) });
      if (failure) showError(failure.reason);
    });
  }

  if (isLoading) {
    return <SkeletonTable rows={5} columns={5} />;
  }

  if (hasError) {
    return <ErrorState onRetry={loadUsers} />;
  }

  function UserActionsMenu({ user }) {
    // You CAN edit your own name/email/language here — the backend allows that. You cannot
    // change your own role or status, or remove yourself, so those two stay off your own row.
    const isSelf = user.id === currentUserId;

    if (!isSelf && !canManageRole(user.role)) {
      return (
        <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" disabled aria-label={t('users.cannotManageHint')} data-tooltip={t('users.cannotManageHint')}>
          <Icon name="MoreVertical" size={16} />
        </button>
      );
    }

    return (
      <DropdownMenu
        trigger={
          <button
            type="button"
            className="btn btn-icon-sm btn-outline-secondary-custom"
            aria-label={t('users.userOptions')}
            data-tooltip={t('users.moreOptions')}
          >
            <Icon name="MoreVertical" size={16} />
          </button>
        }
      >
        {({ close }) => (
          <>
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                onFormStateChange({ isOpen: true, editingUser: user });
                close();
              }}
            >
              <Icon name="Edit3" size={16} /> {t('common.edit')}
            </button>
            {isSelf || user.status !== USER_STATUS.ACTIVE ? null : (
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setUserPendingPasswordReset(user);
                  close();
                }}
              >
                <Icon name="KeyRound" size={16} /> {t('users.resetPassword')}
              </button>
            )}
            {isSelf ? null : (
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  handleToggleStatus(user);
                  close();
                }}
              >
                <Icon name={user.status === USER_STATUS.DISABLED ? 'CheckCircle2' : 'Ban'} size={16} />
                {user.status === USER_STATUS.DISABLED ? t('common.enable') : t('common.disable')}
              </button>
            )}
            {isSelf ? null : <div className="dropdown-divider" />}
            {isSelf ? null : (
              <button
                type="button"
                className="dropdown-item text-danger"
                onClick={() => {
                  setUserPendingDelete(user);
                  close();
                }}
              >
                <Icon name="Trash2" size={16} /> {t('common.delete')}
              </button>
            )}
          </>
        )}
      </DropdownMenu>
    );
  }

  return (
    <>
      {users.length === 0 ? null : <StatCardGrid cards={statCards} />}

      {users.length === 0 ? null : (
        <div className="panel-card mb-4">
          <div className="panel-card__body filter-bar">
            <div className="search-input filter-bar__search">
              <Icon name="Search" size={16} />
              <input
                type="search"
                className="form-control"
                placeholder={t('users.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="filter-bar__field">
              <select className="form-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">{t('users.allRoles')}</option>
                {roleChoices.map((role) => (
                  <option key={role.id} value={role.id}>
                    {roleLabel(t, role.id, roleNameById)}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-bar__field">
              <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">{t('users.allStatuses')}</option>
                {Object.values(USER_STATUS).map((status) => (
                  <option key={status} value={status}>
                    {t(USER_STATUS_LABEL_KEY[status])}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}


      <div className="panel-card">
        {filteredUsers.length > 0 ? <TableToolbar pagination={pagination} /> : null}
        <BulkActionBar selection={{ count: selectedIds.size, clear: () => setSelectedIds(new Set()) }} show={filteredUsers.length > 0}>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatusChange(USER_STATUS.ACTIVE)}>
            <Icon name="CheckCircle2" size={14} /> {t('common.enable')}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatusChange(USER_STATUS.DISABLED)}>
            <Icon name="Ban" size={14} /> {t('common.disable')}
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkDeleteConfirmOpen(true)}>
            <Icon name="Trash2" size={14} /> {t('common.delete')}
          </button>
        </BulkActionBar>
        <div className="panel-card__body panel-card__body--flush">
          {users.length === 0 ? (
            <EmptyState icon="Users" title={t('users.emptyTitle')} description={t('users.emptyText')} />
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon="Users" title={t('users.noneTitle')} description={t('users.noneText')} />
          ) : isMobile ? (
            <div className="d-flex flex-column gap-3 p-4">
              {pagination.pageItems.map((user) => (
                <div key={user.id} className="surface-card">
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="checkbox"
                      className="form-check-input flex-shrink-0"
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleSelectOne(user.id)}
                      disabled={user.id === currentUserId || !canManageRole(user.role)}
                      title={user.id === currentUserId ? t('users.selfBulkHint') : !canManageRole(user.role) ? t('users.cannotManageHint') : undefined}
                      aria-label={t('users.selectUser', { name: user.name })}
                    />
                    <Avatar name={user.name} size="sm" />
                    <div className="flex-grow-1 overflow-hidden">
                      <div className="table-row-title text-truncate">{user.name}</div>
                      <div className="table-row-subtitle text-truncate">{user.email}</div>
                    </div>
                    <UserActionsMenu user={user} />
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <span className={`status-badge status-badge--${USER_STATUS_MODIFIER[user.status]}`}>
                      {t(USER_STATUS_LABEL_KEY[user.status])}
                    </span>
                    <span className="small text-muted-custom">{roleLabel(t, user.role, roleNameById)}</span>
                    <span className="small text-muted-custom">·</span>
                    <span className="small text-muted-custom">{t('users.accounts', { count: user.accountsAssigned })}</span>
                    <span className="small text-muted-custom">·</span>
                    <span className="small text-muted-custom" lang={getLanguage(user.language).htmlLang}>{getLanguage(user.language).nativeName}</span>
                  </div>
                  <div className="small text-muted-custom mt-2">
                    {t('users.lastActive', { when: user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : t('common.never') })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-checkbox-col">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        aria-label={t('users.selectAllUsers')}
                      />
                    </th>
                    <th>{t('users.colUser')}</th>
                    <th>{t('users.colRole')}</th>
                    <th>{t('users.colStatus')}</th>
                    <th>{t('users.colLanguage')}</th>
                    <th>{t('users.colAccounts')}</th>
                    <th>{t('users.colLastActive')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((user) => (
                    <tr key={user.id} className={selectedIds.has(user.id) ? 'is-selected' : ''}>
                      <td className="table-checkbox-col">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleSelectOne(user.id)}
                          disabled={user.id === currentUserId || !canManageRole(user.role)}
                          title={user.id === currentUserId ? t('users.selfBulkHint') : !canManageRole(user.role) ? t('users.cannotManageHint') : undefined}
                          aria-label={t('users.selectUser', { name: user.name })}
                        />
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <Avatar name={user.name} size="sm" />
                          <div>
                            <div className="table-row-title">{user.name}</div>
                            <div className="table-row-subtitle">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{roleLabel(t, user.role, roleNameById)}</td>
                      <td>
                        <span className={`status-badge status-badge--${USER_STATUS_MODIFIER[user.status]}`}>
                          {t(USER_STATUS_LABEL_KEY[user.status])}
                        </span>
                      </td>
                      <td lang={getLanguage(user.language).htmlLang}>{getLanguage(user.language).nativeName}</td>
                      <td>{user.accountsAssigned}</td>
                      <td>{user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : t('common.never')}</td>
                      <td>
                        <UserActionsMenu user={user} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pager pagination={pagination} />
      </div>

      <UserFormModal
        isOpen={formState.isOpen}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        editingUser={formState.editingUser}
        isEditingSelf={formState.editingUser?.id === currentUserId}
      />

      <ConfirmDialog
        isOpen={Boolean(userPendingDelete)}
        onClose={() => setUserPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        title={t('users.removeTitle')}
        message={t('users.removeText')}
        confirmLabel={t('common.remove')}
        isDanger
      />

      <ConfirmDialog
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title={t('users.removeBulkTitle', { count: selectedIds.size })}
        message={t('users.removeBulkText')}
        confirmLabel={t('common.remove')}
        isDanger
      />

      <ConfirmDialog
        isOpen={Boolean(userPendingPasswordReset)}
        onClose={() => setUserPendingPasswordReset(null)}
        onConfirm={handlePasswordResetConfirmed}
        title={t('users.resetPasswordTitle', { name: userPendingPasswordReset?.name || '' })}
        message={t('users.resetPasswordText')}
        confirmLabel={t('users.resetPassword')}
      />
    </>
  );
}

export default UsersPanel;
