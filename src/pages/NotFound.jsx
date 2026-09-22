import { Link } from 'react-router-dom';
import Icon from '../components/common/Icon';
import brand from '../config/brand';

function NotFound() {
  return (
    <div className="empty-state min-vh-100">
      <div className="empty-state__icon">
        <Icon name="Compass" size={28} />
      </div>
      <div className="empty-state__title">Page not found</div>
      <p className="empty-state__description">
        The page you are looking for doesn&apos;t exist in {brand.productName}, or may have been moved.
      </p>
      <Link to="/dashboard" className="btn btn-primary empty-state__action">
        Back to Dashboard
      </Link>
    </div>
  );
}

export default NotFound;
