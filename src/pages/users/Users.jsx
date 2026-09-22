import { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import UsersPanel from '../../components/users/UsersPanel';
import RolesPanel from '../../components/roles/RolesPanel';
import { useI18n } from '../../i18n/useI18n';

const TABS = [
  { key: 'people', labelKey: 'users.people' },
  { key: 'roles', labelKey: 'users.rolesTab' },
];

const EMPTY_USER_FORM_STATE = { isOpen: false, editingUser: null };

function Users() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('people');
  const [userFormState, setUserFormState] = useState(EMPTY_USER_FORM_STATE);

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.usersRoles')}
        subtitle={t('pages.users')}
        guideChapterId="users-roles"
        actions={
          activeTab === 'people' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setUserFormState({ isOpen: true, editingUser: null })}
            >
              <Icon name="UserPlus" size={16} />
              {t('users.invite')}
            </button>
          ) : null
        }
      />

      <div className="tab-strip mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab-strip__item ${activeTab === tab.key ? 'is-active' : ''}`.trim()}
            onClick={() => setActiveTab(tab.key)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'people' ? (
        <UsersPanel formState={userFormState} onFormStateChange={setUserFormState} />
      ) : (
        <RolesPanel />
      )}
    </div>
  );
}

export default Users;
