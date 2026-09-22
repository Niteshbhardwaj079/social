import brand from '../../config/brand';

function BrandName({ showTagline = false, className = '' }) {
  return (
    <span className={className}>
      <span className="d-block">{brand.productName}</span>
      {showTagline ? <span className="d-block">{brand.tagline}</span> : null}
    </span>
  );
}

export default BrandName;
