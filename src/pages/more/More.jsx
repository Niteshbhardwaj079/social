import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import Icon from '../../components/common/Icon';
import { signOut } from '../../store/slices/authSlice';
import { useI18n } from '../../i18n/useI18n';
import { BOTTOM_NAVIGATION, SIDEBAR_NAVIGATION, isFeatureLocked } from '../../config/navigation';

// Already one tap away in the bottom bar, so not repeated here.
const IN_BOTTOM_BAR = new Set(BOTTOM_NAVIGATION.map((item) => item.path));

/**
 * The phone's "More" screen: every page of the sidebar, in the same groups, so everything that can be
 * done on a computer can be done on a phone too. It reads the sidebar list, so a new page added to
 * config/navigation.js shows up here by itself.
 */
function More() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.currentUser);
  const aiAccess = useSelector((state) => state.auth.aiAccess);

  const groups = SIDEBAR_NAVIGATION.filter((group) => (!group.platformOnly || currentUser?.isPlatformAdmin) && (!group.aiOnly || aiAccess?.visible))
    .map((group) => ({ ...group, items: group.items.filter((item) => !IN_BOTTOM_BAR.has(item.path)) }))
    .filter((group) => group.items.length > 0);

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

      {groups.map((group, index) => (
        <section key={group.sectionKey ?? `group-${index}`} className="more-group">
          {group.sectionKey ? <h2 className="more-group__title">{t(group.sectionKey)}</h2> : null}
          <div className="panel-card">
            <div className="panel-card__body panel-card__body--flush">
              {group.items.map((item) => {
                const locked = isFeatureLocked(item, currentUser?.plan);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className="post-list-item"
                    onClick={() => navigate(locked ? '/billing?tab=plans' : item.path)}
                    title={locked ? t('nav.upgradeToUnlock') : undefined}
                  >
                    <Icon name={item.icon} size={20} />
                    <span className="post-list-item__content post-list-item__text mb-0">{t(item.labelKey)}</span>
                    <Icon name={locked ? 'Lock' : 'ChevronRight'} size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <div className="panel-card more-group">
        <div className="panel-card__body panel-card__body--flush">
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
