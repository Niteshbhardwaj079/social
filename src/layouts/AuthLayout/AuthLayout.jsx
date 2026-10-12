import { Outlet } from 'react-router-dom';
import BrandLogo from '../../components/common/BrandLogo';
import brand from '../../config/brand';
import LanguageSwitcher from '../../components/navigation/LanguageSwitcher';
import ThemeToggle from '../../components/navigation/ThemeToggle';
import AuthShowcase from '../../components/auth/AuthShowcase';
import { useI18n } from '../../i18n/useI18n';

/**
 * Sign in / sign up / password pages: one card — the form on the left, product highlights on the
 * right (hidden on small screens) — with the copyright line underneath.
 */
function AuthLayout() {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <section className="auth-card__form">
          <header className="auth-card__header">
            <div className="auth-card__brand">
              <BrandLogo size={36} />
              <div>
                <div className="auth-card__brand-name">{brand.productName}</div>
                <div className="auth-card__brand-by">{t('auth.byCompany', { company: brand.name })}</div>
              </div>
            </div>
            <div className="auth-card__tools">
              <ThemeToggle />
              <LanguageSwitcher variant="auth" />
            </div>
          </header>
          <div className="auth-card__body">
            <Outlet />
          </div>
        </section>
        <AuthShowcase />
      </div>
      <p className="auth-page__footer">
        &copy; {brand.copyrightYear} {brand.legalName}. {t('auth.rights')}
      </p>
    </div>
  );
}

export default AuthLayout;
