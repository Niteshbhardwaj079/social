import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout/DashboardLayout';
import AuthLayout from '../layouts/AuthLayout/AuthLayout';
import ProtectedRoute from './ProtectedRoute';
import GuestRoute from './GuestRoute';
import PageLoader from '../components/common/PageLoader';

const Login = lazy(() => import('../pages/auth/Login'));
const Register = lazy(() => import('../pages/auth/Register'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/auth/ResetPassword'));
const AcceptInvite = lazy(() => import('../pages/auth/AcceptInvite'));

const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));

const SocialAccounts = lazy(() => import('../pages/socialAccounts/SocialAccounts'));
const ConnectAccount = lazy(() => import('../pages/socialAccounts/ConnectAccount'));
const ConnectAccountForm = lazy(() => import('../pages/socialAccounts/ConnectAccountForm'));

const Posts = lazy(() => import('../pages/posts/Posts'));
const CreatePost = lazy(() => import('../pages/posts/CreatePost'));
const Calendar = lazy(() => import('../pages/posts/Calendar'));

const Campaigns = lazy(() => import('../pages/campaigns/Campaigns'));
const CampaignDetail = lazy(() => import('../pages/campaigns/CampaignDetail'));
const ContentRecycling = lazy(() => import('../pages/recycling/ContentRecycling'));

const Inbox = lazy(() => import('../pages/inbox/Inbox'));
const Comments = lazy(() => import('../pages/inbox/Comments'));
const Mentions = lazy(() => import('../pages/inbox/Mentions'));

const AnalyticsOverview = lazy(() => import('../pages/analytics/AnalyticsOverview'));
const ContentAnalytics = lazy(() => import('../pages/analytics/ContentAnalytics'));

const Ads = lazy(() => import('../pages/ads/Ads'));
const CreateAd = lazy(() => import('../pages/ads/CreateAd'));
const AdDetail = lazy(() => import('../pages/ads/AdDetail'));
const Approvals = lazy(() => import('../pages/approvals/Approvals'));
const MediaLibrary = lazy(() => import('../pages/media/MediaLibrary'));
const LinkShortener = lazy(() => import('../pages/links/LinkShortener'));

const Users = lazy(() => import('../pages/users/Users'));
const ActivityLogs = lazy(() => import('../pages/activityLogs/ActivityLogs'));
const SystemEmails = lazy(() => import('../pages/systemEmails/SystemEmails'));
const Guide = lazy(() => import('../pages/guide/Guide'));

const SettingsLayout = lazy(() => import('../pages/settings/SettingsLayout'));
const GeneralSettings = lazy(() => import('../pages/settings/GeneralSettings'));
const AccountSettings = lazy(() => import('../pages/settings/AccountSettings'));
const NotificationSettings = lazy(() => import('../pages/settings/NotificationSettings'));
const AppearanceSettings = lazy(() => import('../pages/settings/AppearanceSettings'));
const SecuritySettings = lazy(() => import('../pages/settings/SecuritySettings'));
const StorageSettings = lazy(() => import('../pages/settings/StorageSettings'));
const EmailSettings = lazy(() => import('../pages/settings/EmailSettings'));
const IntegrationSettings = lazy(() => import('../pages/settings/IntegrationSettings'));
const LanguageSettings = lazy(() => import('../pages/settings/LanguageSettings'));

const MorePage = lazy(() => import('../pages/more/More'));
const NotFound = lazy(() => import('../pages/NotFound'));

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/social-accounts" element={<SocialAccounts />} />
            <Route path="/social-accounts/connect" element={<ConnectAccount />} />
            <Route path="/social-accounts/connect/:platformKey" element={<ConnectAccountForm />} />

            <Route path="/posts" element={<Posts />} />
            <Route path="/posts/create" element={<CreatePost />} />
            <Route path="/posts/:postId/edit" element={<CreatePost />} />
            <Route path="/calendar" element={<Calendar />} />

            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:campaignId" element={<CampaignDetail />} />
            <Route path="/recycling" element={<ContentRecycling />} />

            <Route path="/inbox" element={<Inbox />} />
            <Route path="/inbox/comments" element={<Comments />} />
            <Route path="/inbox/mentions" element={<Mentions />} />

            <Route path="/analytics" element={<AnalyticsOverview />} />
            <Route path="/analytics/content" element={<ContentAnalytics />} />

            <Route path="/ads" element={<Ads />} />
            <Route path="/ads/create" element={<CreateAd />} />
            <Route path="/ads/:adId" element={<AdDetail />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/media" element={<MediaLibrary />} />
            <Route path="/links" element={<LinkShortener />} />

            <Route path="/users" element={<Users />} />
            <Route path="/roles" element={<Navigate to="/users" replace />} />
            <Route path="/activity-logs" element={<ActivityLogs />} />
            <Route path="/system-emails" element={<SystemEmails />} />
            <Route path="/guide" element={<Guide />} />

            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/general" replace />} />
              <Route path="general" element={<GeneralSettings />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="notifications" element={<NotificationSettings />} />
              <Route path="appearance" element={<AppearanceSettings />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="storage" element={<StorageSettings />} />
              <Route path="email" element={<EmailSettings />} />
              <Route path="integrations" element={<IntegrationSettings />} />
              <Route path="language" element={<LanguageSettings />} />
            </Route>

            <Route path="/more" element={<MorePage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
