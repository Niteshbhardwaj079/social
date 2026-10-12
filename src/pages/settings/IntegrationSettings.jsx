import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import { PLATFORMS } from '../../config/platforms';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

function IntegrationSettings() {
  const { t } = useI18n();

  return (
    <div>
      <div className="callout-banner callout-banner--info mb-4">
        <Icon name="KeyRound" size={16} />
        <span>{t('settings.integrations.banner', { product: brand.productName })}</span>
      </div>
      <div className="d-flex flex-column gap-3">
        {PLATFORMS.map((platform) => (
          <div key={platform.key} className="integration-card">
            <PlatformIcon platformKey={platform.key} size={40} />
            <div className="flex-grow-1">
              <div className="fw-semibold">{platform.label}</div>
              <div className="small text-muted-custom">{t('settings.integrations.connectsWithOwnCredentials')}</div>
            </div>
            <Link to={`/social-accounts/connect/${platform.key}`} className="btn btn-sm btn-outline-secondary-custom">
              {t('socialAccounts.manage')}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default IntegrationSettings;
