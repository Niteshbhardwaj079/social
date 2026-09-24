import { NavLink, Outlet } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import { useI18n } from '../../i18n/useI18n';

const SETTINGS_TABS = [
  { path: '/settings/general', labelKey: 'settings.tabs.general', icon: 'Settings' },
  { path: '/settings/account', labelKey: 'settings.tabs.account', icon: 'User' },
  { path: '/settings/notifications', labelKey: 'settings.tabs.notifications', icon: 'Bell' },
  { path: '/settings/appearance', labelKey: 'settings.tabs.appearance', icon: 'Palette' },
  { path: '/settings/security', labelKey: 'settings.tabs.security', icon: 'Lock' },
  { path: '/settings/storage', labelKey: 'settings.tabs.storage', icon: 'HardDrive' },
  { path: '/settings/email', labelKey: 'settings.tabs.email', icon: 'Mail' },
  { path: '/settings/integrations', labelKey: 'settings.tabs.integrations', icon: 'Plug' },
  { path: '/settings/language', labelKey: 'settings.tabs.language', icon: 'Languages' },
];

function SettingsLayout() {
  const { t } = useI18n();
  return (
    <div className="fade-in">
      <PageHeader title={t('nav.settings')} subtitle={t('pages.settings')} guideChapterId="settings" />

      <div className="settings-layout">
        <nav className="settings-layout__nav">
          {SETTINGS_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) => `settings-layout__nav-item ${isActive ? 'is-active' : ''}`.trim()}
            >
              <span className="settings-layout__nav-icon">
                <Icon name={tab.icon} size={14} />
              </span>
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="settings-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default SettingsLayout;
