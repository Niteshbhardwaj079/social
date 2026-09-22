import { NavLink } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { SIDEBAR_NAVIGATION } from '../../config/navigation';
import brand from '../../config/brand';
import BrandLogo from '../common/BrandLogo';
import Icon from '../common/Icon';
import Avatar from '../common/Avatar';
import { closeSidebar } from '../../store/slices/uiSlice';
import { useI18n } from '../../i18n/useI18n';

function Sidebar() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const isSidebarOpen = useSelector((state) => state.ui.isSidebarOpen);
  const isSidebarCollapsed = useSelector((state) => state.ui.isSidebarCollapsed);
  const currentUser = useSelector((state) => state.auth.currentUser);

  return (
    <>
      {isSidebarOpen ? (
        <div className="sidebar-backdrop" onClick={() => dispatch(closeSidebar())} />
      ) : null}

      {/* Labels below are always rendered and collapse via CSS (max-width +
      opacity), not conditionally unmounted — removing them from the DOM the
      instant the class toggles was fighting the width transition and is
      what made the collapse/expand animation look jerky. */}
      <aside
        className={`app-sidebar ${isSidebarOpen ? 'is-open' : ''} ${isSidebarCollapsed ? 'is-collapsed' : ''}`.trim()}
      >
        <div className="sidebar-brand">
          <BrandLogo variant="default" size={40} />
          <div className="sidebar-brand__text">
            <div className="sidebar-brand__name">{brand.productName}</div>
            <div className="sidebar-brand__tagline">{t('nav.tagline')}</div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => dispatch(closeSidebar())}
            aria-label={t('top.closeMenu')}
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Plain `title` here, not our styled `data-tooltip` — this list
        scrolls (overflow-y: auto), and CSS forces overflow-x to clip too in
        that case, so a styled tooltip trying to render outside this narrow
        collapsed rail gets cut off. A native title tooltip isn't part of
        the DOM's clipping box, so it always renders correctly. */}
        <nav className="sidebar-nav">
          {SIDEBAR_NAVIGATION.map((group, groupIndex) => (
            <div key={group.sectionKey || `group-${groupIndex}`}>
              {group.sectionKey ? <div className="sidebar-section-label">{t(group.sectionKey)}</div> : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className={({ isActive }) => `sidebar-nav-item ${isActive ? 'is-active' : ''}`.trim()}
                  onClick={() => dispatch(closeSidebar())}
                  title={isSidebarCollapsed ? t(item.labelKey) : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/settings/account"
            className="sidebar-user text-decoration-none"
            title={isSidebarCollapsed ? currentUser?.name : undefined}
          >
            <Avatar name={currentUser?.name} imageUrl={currentUser?.avatarUrl} size="sm" />
            <div className="sidebar-user__text">
              <div className="sidebar-user__name">{currentUser?.name}</div>
              <div className="sidebar-user__role">{currentUser?.email}</div>
            </div>
          </NavLink>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
