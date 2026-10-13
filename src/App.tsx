import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ErrorBoundary from '@/components/ErrorBoundary.tsx';
import AdminRoute from '@/routes/AdminRoute.tsx';
import AdminLayout from '@/components/layout/AdminLayout.tsx';
import PageLoader from '@/components/ui/PageLoader.tsx';
import ScrollToTop from '@/components/ScrollToTop.tsx';

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
const NotFound = lazy(() => import('@/pages/NotFound.tsx'));

export default function App() {
  return (
    <BrowserRouter>
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
            {/* Direct root redirect to admin dashboard */}
            <Route path='/' element={<Navigate to='/admin' replace />} />

            {/* Admin login — standalone layout */}
            <Route path='/admin/login' element={<AdminLogin />} />

            {/* Protected Admin Console Routes */}
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path='/admin' element={<AdminDashboard />} />
                <Route path='/admin/users' element={<AdminUsers />} />
                <Route
                  path='/admin/users/:userId'
                  element={<AdminUserDetail />}
                />
                <Route path='/admin/businesses' element={<AdminBusinesses />} />
                <Route
                  path='/admin/withdrawals'
                  element={<AdminWithdrawals />}
                />
                <Route
                  path='/admin/settlement/withdrawals'
                  element={<AdminWithdrawals />}
                />
                <Route
                  path='/admin/transactions'
                  element={<AdminTransactions />}
                />
                <Route
                  path='/admin/unverified-inflows'
                  element={<AdminUnverifiedInflows />}
                />
                <Route path='/admin/audit-logs' element={<AdminAuditLogs />} />
                <Route
                  path='/admin/ai-settings'
                  element={<AdminAISettings />}
                />
                <Route
                  path='/admin/subscriptions'
                  element={<AdminSubscriptions />}
                />
                {/* Reviews — deferred to Phase 2 (see ADM-04b). Old bookmarks land on dashboard, not 404. */}
                <Route
                  path='/admin/reviews'
                  element={<Navigate to='/admin' replace />}
                />
              </Route>
            </Route>

            {/* Catch-all 404 handler */}
            <Route path='*' element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
