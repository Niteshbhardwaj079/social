import Icon from './Icon';
import { useI18n } from '../../i18n/useI18n';

function ErrorState({
  title,
  description,
  onRetry,
  className = '',
}) {
  const { t } = useI18n();
  return (
    <div className={`error-state ${className}`.trim()}>
      <div className="empty-state__icon">
        <Icon name="AlertTriangle" size={28} />
      </div>
      <div className="empty-state__title">{title ?? t('common.errorTitle')}</div>
      <div className="empty-state__description">{description ?? t('common.errorText')}</div>
      {onRetry ? (
        <button type="button" className="btn btn-outline-secondary-custom empty-state__action" onClick={onRetry}>
          <Icon name="RefreshCw" size={16} />
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
