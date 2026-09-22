import logoDefault from '../../assets/brand/logo.svg';
import logoLight from '../../assets/brand/logo-light.svg';
import logoDark from '../../assets/brand/logo-dark.svg';
import brand from '../../config/brand';

const LOGO_VARIANTS = {
  default: logoDefault,
  light: logoLight,
  dark: logoDark,
};

function BrandLogo({ variant = 'default', size = 40, className = '' }) {
  const logoSrc = LOGO_VARIANTS[variant] || LOGO_VARIANTS.default;

  return (
    <img
      src={logoSrc}
      alt={`${brand.productName} logo`}
      width={size}
      height={size}
      className={className}
    />
  );
}

export default BrandLogo;
