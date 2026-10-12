import { Link } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import Icon from '../../components/common/Icon';
import { PLATFORMS } from '../../config/platforms';
import { getConnectGuide } from '../../config/platformConnectGuides';
import { useI18n } from '../../i18n/useI18n';
import { localizeConnectGuide, useGuideText } from '../../i18n/guideText';

function ConnectAccount() {
  const { t } = useI18n();
  const guideText = useGuideText();
  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: t('nav.socialAccounts'), to: '/social-accounts' }, { label: t('socialAccounts.connectAccountTitle') }]} />
      <PageHeader
        title={t('socialAccounts.connectAccountTitle')}
        subtitle={t('socialAccounts.chooseAPlatform')}
        guideChapterId="social-accounts"
      />

      <div className="connect-list">
        {PLATFORMS.map((platform) => {
          const guide = localizeConnectGuide(platform.key, getConnectGuide(platform.key), guideText);
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
