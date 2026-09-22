import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';

function GuideButton() {
  const { t } = useI18n();
  return (
    <Link to="/guide" className="topbar-icon-btn" aria-label={t('top.guide')} data-tooltip={t('top.guide')} data-tooltip-position="bottom">
      <Icon name="HelpCircle" size={20} />
    </Link>
  );
}

export default GuideButton;
