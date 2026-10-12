import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useI18n } from '../../i18n/useI18n';

// items: [{ label, to? }] — the last item is the current page and is not a link.
function Breadcrumb({ items }) {
  const { t } = useI18n();
  return (
    <nav className="breadcrumb-trail" aria-label={t('misc.breadcrumb')}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="breadcrumb-trail__item">
            {item.to && !isLast ? (
              <Link to={item.to} className="breadcrumb-trail__link">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            )}
            {isLast ? null : <Icon name="ChevronRight" size={14} />}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
