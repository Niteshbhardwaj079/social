import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useI18n } from '../../i18n/useI18n';

function PageHeader({ title, subtitle, actions, guideChapterId, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`page-header ${className}`.trim()}>
      <div>
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {guideChapterId ? (
            <Link
              to={`/guide?chapter=${guideChapterId}`}
              className="page-guide-link"
              aria-label={t('top.guideFor', { title })}
              data-tooltip={t('top.openGuide')}
            >
              <Icon name="HelpCircle" size={18} />
            </Link>
          ) : null}
        </div>
        {subtitle ? <p className="page-subtitle mb-0">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;
