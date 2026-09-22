import { Link } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import Icon from '../../components/common/Icon';
import { PLATFORMS } from '../../config/platforms';
import { getConnectGuide } from '../../config/platformConnectGuides';

function ConnectAccount() {
  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: 'Social Accounts', to: '/social-accounts' }, { label: 'Connect account' }]} />
      <PageHeader
        title="Connect account"
        subtitle="Choose a platform. Each one connects with your own developer credentials — Social never charges for a connection."
        guideChapterId="social-accounts"
      />

      <div className="connect-list">
        {PLATFORMS.map((platform) => {
          const guide = getConnectGuide(platform.key);
          return (
            <Link key={platform.key} to={`/social-accounts/connect/${platform.key}`} className="connect-row">
              <PlatformIcon platformKey={platform.key} size={52} />
              <span className="connect-row__text">
                <span className="connect-row__label">{platform.label}</span>
                {guide ? <span className="connect-row__badge">{guide.badge}</span> : null}
              </span>
              <Icon name="ChevronRight" size={18} className="connect-row__chevron" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default ConnectAccount;
