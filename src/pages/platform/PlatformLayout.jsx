import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Icon from '../../components/common/Icon';
import { API_ENABLED } from '../../config/runtime';
import { useI18n } from '../../i18n/useI18n';

// The label of each tab is platform.tabs.<key>.
const PLATFORM_TABS = [
  { key: 'overview', icon: 'LayoutDashboard' },
  { key: 'organizations', icon: 'Building2' },
  { key: 'payments', icon: 'BadgeIndianRupee' },
  { key: 'invoices', icon: 'FileText' },
  { key: 'plans', icon: 'Layers' },
  { key: 'ai', icon: 'Sparkles' },
  { key: 'settings', icon: 'Settings' },
];

/**
 * The platform owner's area (you, running the SaaS). Hidden from everyone else — and the server
 * refuses these calls for anyone who is not the platform owner anyway.
 */
function PlatformLayout() {
  const { t } = useI18n();
  const isPlatformAdmin = useSelector((state) => state.auth.currentUser?.isPlatformAdmin === true);
  if (API_ENABLED && !isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="fade-in">
      <PageHeader title={t('platform.title')} subtitle={t('platform.subtitle')} />
      {!API_ENABLED ? (
        <EmptyState icon="Building2" title={t('platform.needsServerTitle')} description={t('platform.needsServerText')} />
      ) : (
        <div className="settings-layout">
          <nav className="settings-layout__nav">
            {PLATFORM_TABS.map((tab) => (
              <NavLink key={tab.key} to={`/platform/${tab.key}`} className={({ isActive }) => `settings-layout__nav-item ${isActive ? 'is-active' : ''}`.trim()}>
                <span className="settings-layout__nav-icon">
                  <Icon name={tab.icon} size={14} />
                </span>
                {t(`platform.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>
          <div className="settings-layout__content">
            <Outlet />
          </div>
        </div>
      )}
    </div>
  );
}

export default PlatformLayout;
