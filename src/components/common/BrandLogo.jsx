import logoDefault from '../../assets/brand/logo.svg';
import logoLight from '../../assets/brand/logo-light.svg';
import logoDark from '../../assets/brand/logo-dark.svg';
import brand from '../../config/brand';
import { pxToRem } from '../../utils/uiScale';

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
      // Grows with the rest of the UI on 4K / 8K screens (the width/height above are only the base size).
      style={{ width: pxToRem(size), height: pxToRem(size) }}
      className={className}
    />
  );
}

export default BrandLogo;
