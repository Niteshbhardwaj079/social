import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Sidebar from '../../components/navigation/Sidebar';
import Topbar from '../../components/navigation/Topbar';
import BottomNav from '../../components/navigation/BottomNav';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import PageCrash from '../../components/common/PageCrash';
import { warmAccountCache } from '../../services/api/socialAccountsApi';
import { warmStorageCache } from '../../services/api/storageApi';

function DashboardLayout() {
  const isSidebarCollapsed = useSelector((state) => state.ui.isSidebarCollapsed);
  const { pathname } = useLocation();

  // Screens like the Inbox ask "is this platform connected?", and the Media Library "where do uploads go?",
  // while rendering — load both answers once up front.
  useEffect(() => {
    warmAccountCache();
    warmStorageCache();
  }, []);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`.trim()}>
      <Sidebar />
      <div className="app-main">
        <Topbar />
        <main className="app-content">
          <ErrorBoundary resetKey={pathname} fallback={({ reset }) => <PageCrash onRetry={reset} />}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export default DashboardLayout;
