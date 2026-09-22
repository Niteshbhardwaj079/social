import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import Icon from '../../components/common/Icon';
import { signOut } from '../../store/slices/authSlice';
import { useI18n } from '../../i18n/useI18n';

const MORE_LINKS = [
  { labelKey: 'nav.socialAccounts', path: '/social-accounts', icon: 'Share2' },
  { labelKey: 'nav.campaigns', path: '/campaigns', icon: 'Megaphone' },
  { labelKey: 'nav.ads', path: '/ads', icon: 'Target' },
  { labelKey: 'nav.recycling', path: '/recycling', icon: 'Repeat2' },
  { labelKey: 'nav.analytics', path: '/analytics', icon: 'BarChart3' },
  { labelKey: 'nav.approvals', path: '/approvals', icon: 'CheckSquare' },
  { labelKey: 'nav.mediaLibrary', path: '/media', icon: 'Images' },
  { labelKey: 'nav.linkShortener', path: '/links', icon: 'Link2' },
  { labelKey: 'nav.usersRoles', path: '/users', icon: 'Users' },
  { labelKey: 'nav.activityLogs', path: '/activity-logs', icon: 'History' },
  { labelKey: 'nav.systemEmails', path: '/system-emails', icon: 'MailCheck' },
  { labelKey: 'nav.guide', path: '/guide', icon: 'BookOpen' },
  { labelKey: 'nav.settings', path: '/settings', icon: 'Settings' },
];

function More() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.currentUser);

  function handleLogout() {
    dispatch(signOut());
    navigate('/login');
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('nav.more')} />

      <div className="panel-card mb-5">
        <button type="button" className="quick-action-card w-100" onClick={() => navigate('/settings/account')}>
          <Avatar name={currentUser?.name} imageUrl={currentUser?.avatarUrl} size="md" />
          <div className="text-start flex-grow-1">
            <div className="fw-semibold">{currentUser?.name}</div>
            <div className="small text-muted-custom">{currentUser?.email}</div>
          </div>
          <Icon name="ChevronRight" size={16} />
        </button>
      </div>

      <div className="panel-card">
        <div className="panel-card__body panel-card__body--flush">
          {MORE_LINKS.map((link) => (
            <button
              key={link.path}
              type="button"
              className="post-list-item"
              onClick={() => navigate(link.path)}
            >
              <Icon name={link.icon} size={20} />
              <span className="post-list-item__content post-list-item__text mb-0">{t(link.labelKey)}</span>
              <Icon name="ChevronRight" size={16} />
            </button>
          ))}
          <button type="button" className="post-list-item text-danger" onClick={handleLogout}>
            <Icon name="LogOut" size={20} />
            <span className="post-list-item__content post-list-item__text mb-0">{t('top.logOut')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default More;
