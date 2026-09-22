import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DropdownMenu from '../common/DropdownMenu';
import Avatar from '../common/Avatar';
import Icon from '../common/Icon';
import { signOut } from '../../store/slices/authSlice';
import { useI18n } from '../../i18n/useI18n';

function UserMenu() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.auth.currentUser);

  function handleLogout(close) {
    dispatch(signOut());
    close();
    navigate('/login');
  }

  return (
    <DropdownMenu
      trigger={
        <button type="button" className="user-menu-trigger" aria-label={t('top.accountMenu')}>
          <Avatar name={currentUser?.name} imageUrl={currentUser?.avatarUrl} size="sm" />
          <span className="user-menu-trigger__info">
            <span className="user-menu-trigger__name">{currentUser?.name}</span>
            <span className="user-menu-trigger__role">{currentUser?.role ? t(`roles.${currentUser.role}`) : ''}</span>
          </span>
          <Icon name="ChevronDown" size={16} />
        </button>
      }
    >
      {({ close }) => (
        <div className="account-menu">
          <div className="d-flex align-items-center gap-2 px-2 py-2">
            <Avatar name={currentUser?.name} imageUrl={currentUser?.avatarUrl} size="md" />
            <div className="overflow-hidden">
              <div className="fw-semibold small text-truncate">{currentUser?.name}</div>
              <div className="small text-muted-custom text-truncate">{currentUser?.email}</div>
              <div className="small text-secondary-custom">{currentUser?.role ? t(`roles.${currentUser.role}`) : ''}</div>
            </div>
          </div>
          <div className="dropdown-divider" />
          <button type="button" className="dropdown-item" onClick={() => { close(); navigate('/settings/account'); }}>
            <Icon name="User" size={16} /> {t('top.myAccount')}
          </button>
          <button type="button" className="dropdown-item" onClick={() => { close(); navigate('/settings'); }}>
            <Icon name="Settings" size={16} /> {t('nav.settings')}
          </button>
          <button type="button" className="dropdown-item" onClick={() => { close(); navigate('/settings'); }}>
            <Icon name="HelpCircle" size={16} /> {t('top.helpSupport')}
          </button>
          <div className="dropdown-divider" />
          <button type="button" className="dropdown-item text-danger" onClick={() => handleLogout(close)}>
            <Icon name="LogOut" size={16} /> {t('top.logOut')}
          </button>
        </div>
      )}
    </DropdownMenu>
  );
}

export default UserMenu;
