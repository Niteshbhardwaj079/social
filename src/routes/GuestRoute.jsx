import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageLoader from '../components/common/PageLoader';

function GuestRoute() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const isBootstrapping = useSelector((state) => state.auth.isBootstrapping);

  if (isBootstrapping) return <PageLoader />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default GuestRoute;
