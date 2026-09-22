import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageLoader from '../components/common/PageLoader';

function ProtectedRoute() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const isBootstrapping = useSelector((state) => state.auth.isBootstrapping);
  const location = useLocation();

  // The saved session is still being checked: do not bounce the person to /login yet.
  if (isBootstrapping) return <PageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
