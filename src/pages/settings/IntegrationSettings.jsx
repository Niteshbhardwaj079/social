import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import { PLATFORMS } from '../../config/platforms';
import brand from '../../config/brand';

function IntegrationSettings() {
  return (
    <div>
      <div className="callout-banner callout-banner--info mb-4">
        <Icon name="KeyRound" size={16} />
        <span>
          Every platform below connects with your own developer API credentials, entered when you connect it from
          the Social Accounts page. {brand.productName} never holds a shared API key on your behalf — so there is
          nothing here for {brand.productName} to bill you for, no matter how much you post or how many accounts
          you connect.
        </span>
      </div>
      <div className="d-flex flex-column gap-3">
        {PLATFORMS.map((platform) => (
          <div key={platform.key} className="integration-card">
            <PlatformIcon platformKey={platform.key} size={40} />
            <div className="flex-grow-1">
              <div className="fw-semibold">{platform.label}</div>
              <div className="small text-muted-custom">Connects with your own API credentials</div>
            </div>
            <Link to={`/social-accounts/connect/${platform.key}`} className="btn btn-sm btn-outline-secondary-custom">
              Manage
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default IntegrationSettings;
