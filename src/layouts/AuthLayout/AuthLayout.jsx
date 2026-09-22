import { Outlet } from 'react-router-dom';
import BrandLogo from '../../components/common/BrandLogo';
import brand from '../../config/brand';
import LanguageSwitcher from '../../components/navigation/LanguageSwitcher';
import { useI18n } from '../../i18n/useI18n';

function AuthLayout() {
  const { t } = useI18n();
  return (
    <div className="auth-layout">
      <div className="auth-layout__form-side">
        <div className="auth-layout__inner">
          <div className="auth-layout__language">
            <LanguageSwitcher variant="auth" />
          </div>
          <div className="auth-layout__brand">
            <BrandLogo size={36} />
            <span>{brand.productName}</span>
          </div>
          <Outlet />
          <p className="auth-layout__footer">
            &copy; {brand.copyrightYear} {brand.legalName}. {t('auth.rights')}
          </p>
        </div>
      </div>
      <div className="auth-layout__showcase">
        <div className="auth-layout__showcase-title">{t('nav.tagline')}</div>
        <p className="auth-layout__showcase-subtitle">
          {t('auth.showcase')}
        </p>
      </div>
    </div>
  );
}

export default AuthLayout;
