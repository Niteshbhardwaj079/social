import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/common/Icon';
import BrandLogo from '../components/common/BrandLogo';
import brand from '../config/brand';
import { useI18n } from '../i18n/useI18n';

function NotFound() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-page__glow" aria-hidden="true" />

      <div className="not-found-page__brand">
        <BrandLogo size={32} />
        <span>{brand.productName}</span>
      </div>

      <div className="not-found-page__code">404</div>

      <div className="not-found-page__icon">
        <Icon name="Compass" size={26} />
      </div>

      <h1 className="not-found-page__title">{t('misc.notFoundTitle')}</h1>
      <p className="not-found-page__description">
        {t('misc.notFoundText', { product: brand.productName })}
      </p>

      <div className="not-found-page__actions">
        <Link to="/dashboard" className="btn btn-primary">
          {t('misc.backToDashboard')}
        </Link>
        <button type="button" className="btn btn-outline-secondary-custom" onClick={() => navigate(-1)}>
          {t('misc.goBack')}
        </button>
      </div>

      <p className="not-found-page__footer">
        &copy; {brand.copyrightYear} {brand.legalName}
      </p>
    </div>
  );
}

export default NotFound;
