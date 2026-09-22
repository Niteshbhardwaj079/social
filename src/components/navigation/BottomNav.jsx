import { NavLink } from 'react-router-dom';
import { BOTTOM_NAVIGATION } from '../../config/navigation';
import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';

function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav">
      {BOTTOM_NAVIGATION.map((item) => {
        if (item.isPrimary) {
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="bottom-nav-item bottom-nav-item--primary"
            >
              <span className="bottom-nav-item__icon-wrap">
                <Icon name={item.icon} size={24} />
              </span>
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'is-active' : ''}`.trim()}
          >
            <Icon name={item.icon} size={20} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomNav;
