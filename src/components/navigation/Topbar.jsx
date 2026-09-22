import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon';
import BrandLogo from '../common/BrandLogo';
import NotificationBell from './NotificationBell';
import GuideButton from './GuideButton';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import UserMenu from './UserMenu';
import { toggleSidebar, toggleSidebarCollapsed } from '../../store/slices/uiSlice';
import brand from '../../config/brand';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/useI18n';

function Topbar() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 992px)');

  function handleMenuToggle() {
    dispatch(isDesktop ? toggleSidebarCollapsed() : toggleSidebar());
  }

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="topbar-icon-btn"
        onClick={handleMenuToggle}
        aria-label={t('top.toggleNav')}
        data-tooltip={t('top.menu')}
        data-tooltip-position="bottom"
      >
        <Icon name="Menu" size={20} />
      </button>

      <div className="topbar-brand-mobile">
        <BrandLogo size={28} />
        <span>{brand.productName}</span>
      </div>

      <div className="topbar-search search-input">
        <Icon name="Search" size={16} />
        <input
          type="search"
          className="form-control"
          placeholder={t('top.searchPlaceholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.currentTarget.value.trim()) {
              navigate(`/posts?search=${encodeURIComponent(event.currentTarget.value.trim())}`);
            }
          }}
        />
      </div>

      <div className="topbar-actions">
        <LanguageSwitcher />
        <ThemeToggle />
        <NotificationBell />
        <GuideButton />
        <UserMenu />
      </div>
    </header>
  );
}

export default Topbar;
