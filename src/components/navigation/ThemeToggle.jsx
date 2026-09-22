import { useDispatch, useSelector } from 'react-redux';
import Icon from '../common/Icon';
import { setTheme } from '../../store/slices/uiSlice';
import { useI18n } from '../../i18n/useI18n';

function ThemeToggle() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const theme = useSelector((state) => state.ui.theme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="topbar-icon-btn"
      onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
      aria-label={isDark ? t('top.lightMode') : t('top.darkMode')}
      data-tooltip={isDark ? t('top.lightMode') : t('top.darkMode')}
      data-tooltip-position="bottom"
    >
      <Icon name={isDark ? 'Sun' : 'Moon'} size={19} />
    </button>
  );
}

export default ThemeToggle;
