import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ErrorBoundary from '@/components/ErrorBoundary.tsx';
import AdminRoute from '@/routes/AdminRoute.tsx';
import AdminLayout from '@/components/layout/AdminLayout.tsx';
import PageLoader from '@/components/ui/PageLoader.tsx';
import ScrollToTop from '@/components/ScrollToTop.tsx';
import { useAuthStore } from '@/stores/auth.store.ts';
import { getSSEClient } from '@/lib/sse-client.ts';

// Admin pages — code-split and lazy-loaded
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin.tsx'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.tsx'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers.tsx'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail.tsx'));
const AdminBusinesses = lazy(() => import('@/pages/admin/AdminBusinesses.tsx'));
const AdminAuditLogs = lazy(() => import('@/pages/admin/AdminAuditLogs.tsx'));
const AdminWithdrawals = lazy(
  () => import('@/pages/admin/AdminWithdrawals.tsx'),
);
const AdminTransactions = lazy(
  () => import('@/pages/admin/AdminTransactions.tsx'),
);
const AdminUnverifiedInflows = lazy(
  () => import('@/pages/admin/AdminUnverifiedInflows.tsx'),
);
const AdminAISettings = lazy(() => import('@/pages/admin/AdminAISettings.tsx'));
const AdminSubscriptions = lazy(
  () => import('@/pages/admin/AdminSubscriptions.tsx'),
);
const AdminReviews = lazy(() => import('@/pages/admin/AdminReviews.tsx'));
const AdminBroadcasts = lazy(() => import('@/pages/admin/AdminBroadcasts.tsx'));
const NotFound = lazy(() => import('@/pages/NotFound.tsx'));

function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [bootReady, setBootReady] = useState(false);

  // Admin security: Force fresh login on every page load by clearing any existing tokens.
  // This prevents stale token issues where the app gets stuck on "Verifying session..."
  // for minutes when old tokens exist in localStorage. Admins MUST login fresh each time.
  useEffect(() => {
    const hasToken = !!localStorage.getItem('accessToken');
    if (hasToken) {
      // Clear tokens silently without triggering navigation or API calls
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      // Reset auth state to force login screen
      useAuthStore.setState({ user: null, isAuthenticated: false });
      setBootReady(true);
    } else {
      setBootReady(true);
    }
  }, []); // Only run once on mount

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (isAuthenticated && !user) {
        try {
          await fetchMe();
        } finally {
          if (!cancelled) setBootReady(true);
        }
      } else {
        setBootReady(true);
      }
    }
    boot();
    const t = setTimeout(() => {
      if (!cancelled) setBootReady(true);
    }, 2800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isAuthenticated, user, fetchMe]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    getSSEClient().connect();
  }, [isAuthenticated, user]);

  if (!bootReady && isAuthenticated && !user) {
    return <PageLoader minHeight="min-h-screen" message="Restoring session…" />;
  }

  return (
    <>
      <ScrollToTop />
      <Toaster
        position='top-right'
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }}
      />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path='/' element={<Navigate to='/admin' replace />} />
            <Route path='/admin/login' element={<AdminLogin />} />
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path='/admin' element={<AdminDashboard />} />
                <Route path='/admin/users' element={<AdminUsers />} />
                <Route path='/admin/users/:userId' element={<AdminUserDetail />} />
                <Route path='/admin/businesses' element={<AdminBusinesses />} />
                <Route path='/admin/withdrawals' element={<AdminWithdrawals />} />
                <Route path='/admin/settlement/withdrawals' element={<AdminWithdrawals />} />
                <Route path='/admin/transactions' element={<AdminTransactions />} />
                <Route path='/admin/unverified-inflows' element={<AdminUnverifiedInflows />} />
                <Route path='/admin/audit-logs' element={<AdminAuditLogs />} />
                <Route path='/admin/ai-settings' element={<AdminAISettings />} />
                <Route path='/admin/subscriptions' element={<AdminSubscriptions />} />
                <Route path='/admin/reviews' element={<AdminReviews />} />
                <Route path='/admin/broadcasts' element={<AdminBroadcasts />} />
              </Route>
            </Route>
            <Route path='*' element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
