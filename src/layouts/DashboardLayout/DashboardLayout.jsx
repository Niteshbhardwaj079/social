import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Sidebar from '../../components/navigation/Sidebar';
import Topbar from '../../components/navigation/Topbar';
import BottomNav from '../../components/navigation/BottomNav';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import PageCrash from '../../components/common/PageCrash';
import { warmAccountCache } from '../../services/api/socialAccountsApi';
import { warmStorageCache } from '../../services/api/storageApi';
import { getLanguageSettingsRequest } from '../../services/api/settingsApi';
import { saveWorkspaceLanguages } from '../../store/slices/i18nSlice';
import { setAiAccess } from '../../store/slices/authSlice';
import { getAiAccess } from '../../services/api/aiApi';
import { API_ENABLED } from '../../config/runtime';
import { useActiveTabInView } from '../../hooks/useActiveTabInView';
import { useStackedTableLabels } from '../../hooks/useStackedTableLabels';

function DashboardLayout() {
  const isSidebarCollapsed = useSelector((state) => state.ui.isSidebarCollapsed);
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  const contentRef = useRef(null);

  // Screens like the Inbox ask "is this platform connected?", and the Media Library "where do uploads go?",
  // while rendering — load both answers once up front.
  useEffect(() => {
    warmAccountCache();
    warmStorageCache();
  }, []);

  // Each organization chooses its own languages; the sign-in screens could only show the full list.
  useEffect(() => {
    if (!API_ENABLED) return;
    getLanguageSettingsRequest()
      .then((values) => dispatch(saveWorkspaceLanguages(values)))
      .catch(() => {}); // keep the full list if this fails — nothing breaks
    // Whether the AI Studio shows in the menu (the platform owner can switch it off or hide it).
    getAiAccess()
      .then((access) => dispatch(setAiAccess(access)))
      .catch(() => {}); // unknown: the menu simply keeps AI hidden
  }, [dispatch]);

  // On a phone, tab bars scroll sideways — keep the selected tab on screen.
  useActiveTabInView(contentRef);
  // ...and tables marked "data-table--stack" become one card per row, each value with its column name.
  useStackedTableLabels(contentRef);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`.trim()}>
      <Sidebar />
      <div className="app-main">
        <Topbar />
        <main className="app-content" ref={contentRef}>
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
