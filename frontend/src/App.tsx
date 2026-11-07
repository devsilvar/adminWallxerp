import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ErrorBoundary from '@/components/ErrorBoundary.tsx';
import AuthLayout from '@/components/layout/AuthLayout.tsx';
import AppLayout from '@/components/layout/AppLayout.tsx';
import ProtectedRoute from '@/routes/ProtectedRoute.tsx';
import GuestRoute from '@/routes/GuestRoute.tsx';
import PageLoader from '@/components/ui/PageLoader.tsx';
import ScrollToTop from '@/components/ScrollToTop.tsx';
import MaintenanceScreen from '@/components/MaintenanceScreen.tsx';

import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useSessionTimeout } from '@/hooks/useSessionTimeout.ts';
import { getSSEClient } from '@/lib/sse-client';
import { isMaintenanceModeActive } from '@/lib/maintenance';

const MarketingLayout = lazy(() => import('@/components/marketing/MarketingLayout.tsx'));
const Home = lazy(() => import('@/pages/marketing/Home.tsx'));
const About = lazy(() => import('@/pages/marketing/About.tsx'));
const Pricing = lazy(() => import('@/pages/marketing/Pricing.tsx'));
const Contact = lazy(() => import('@/pages/marketing/Contact.tsx'));

const Login = lazy(() => import('@/pages/Login.tsx'));
const Register = lazy(() => import('@/pages/Register.tsx'));
const Terms = lazy(() => import('@/pages/Terms.tsx'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword.tsx'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword.tsx'));
const VerifyEmailPending = lazy(() => import('@/pages/VerifyEmailPending.tsx'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail.tsx'));
const Dashboard = lazy(() => import('@/pages/Dashboard.tsx'));

const Sales = lazy(() => import('@/pages/Sales.tsx'));
const Expenses = lazy(() => import('@/pages/Expenses.tsx'));
const Invoices = lazy(() => import('@/pages/Invoices.tsx'));
const InvoiceForm = lazy(() => import('@/pages/InvoiceForm.tsx'));
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail.tsx'));
const Debtors = lazy(() => import('@/pages/Debtors.tsx'));
const DebtorDetail = lazy(() => import('@/pages/DebtorDetail.tsx'));
const Customers = lazy(() => import('@/pages/Customers.tsx'));
const CustomerDetail = lazy(() => import('@/pages/CustomerDetail.tsx'));
const Inventory = lazy(() => import('@/pages/Inventory.tsx'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant.tsx'));
const isSimulatorEnabled = import.meta.env.VITE_ENABLE_TRANSFER_SIMULATOR === 'true';
const TestTransferSimulator = isSimulatorEnabled
  ? lazy(() => import('@/pages/TestTransferSimulator.tsx'))
  : () => null;
const TaxReports = lazy(() => import('@/pages/TaxReports.tsx'));
const PaymentCallback = lazy(() => import('@/pages/PaymentCallback.tsx'));
const Transactions = lazy(() => import('@/pages/Transactions.tsx'));
const Settlement = lazy(() => import('@/pages/Settlement.tsx'));
const Settings = lazy(() => import('@/pages/Settings.tsx'));
const Account = lazy(() => import('@/pages/Account.tsx'));
const Subscription = lazy(() => import('@/pages/Subscription.tsx'));
const Messages = lazy(() => import('@/pages/Messages.tsx'));
const InvitationAccept = lazy(() => import('@/pages/InvitationAccept.tsx'));
const VerifyVoucher = lazy(() => import('@/pages/public/VerifyVoucher.tsx'));
const NotFound = lazy(() => import('@/pages/NotFound.tsx'));

function SalesUnverifiedRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={`/sales?tab=unverified${qs ? `&${qs}` : ''}`} replace />;
}

function SubscriptionGuard() {
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const businessStoreLoading = useBusinessStore((s) => s.isLoading);

  if (isBootstrapping || !hasCheckedAuth) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/pricing" replace />;
  }

  if (businessStoreLoading) {
    return <PageLoader />;
  }

  return (
    <AppLayout>
      <Subscription />
    </AppLayout>
  );
}

function AppRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const user = useAuthStore((s) => s.user);
  const fetchBusinesses = useBusinessStore((s) => s.fetchBusinesses);

  useEffect(() => {
    useAuthStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (hasCheckedAuth && isAuthenticated && !isBootstrapping) {
      fetchBusinesses();
    }
  }, [hasCheckedAuth, isAuthenticated, isBootstrapping, fetchBusinesses]);

  const sseEnabled = isAuthenticated && !!user && hasCheckedAuth && !isBootstrapping;
  useEffect(() => {
    if (!sseEnabled) return;
    getSSEClient().connect();
  }, [sseEnabled]);

  useSessionTimeout();

  return (
    <>
      <ScrollToTop />
      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{ duration: 3000, style: { zIndex: 99999 } }}
      />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader minHeight="min-h-screen" message="Loading WallXERP..." />}>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email-pending" element={<VerifyEmailPending />} />
              </Route>
            </Route>

            <Route element={<AuthLayout />}>
              <Route path="/verify-email" element={<VerifyEmail />} />
            </Route>

            <Route path="/invite" element={<InvitationAccept />} />
            <Route path="/verify-voucher/:requestId" element={<VerifyVoucher />} />
            <Route path="/terms" element={<Terms />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/sales/unverified" element={<SalesUnverifiedRedirect />} />
                {isSimulatorEnabled && (
                  <Route path="/test/transfer-simulator" element={<TestTransferSimulator />} />
                )}
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/new" element={<InvoiceForm />} />
                <Route path="/invoices/:id" element={<InvoiceDetail />} />
                <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
                <Route path="/debtors" element={<Debtors />} />
                <Route path="/debtors/:id" element={<DebtorDetail />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:customerId" element={<CustomerDetail />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/ai" element={<AIAssistant />} />
                <Route path="/tax" element={<TaxReports />} />
                <Route path="/payments" element={<Navigate to="/tax?tab=payments" replace />} />
                <Route path="/payments/callback" element={<PaymentCallback />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/settlement" element={<Settlement />} />
                <Route path="/reminders" element={<Navigate to="/dashboard" replace />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/account" element={<Account />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="/subscription" element={<SubscriptionGuard />} />

            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/contact" element={<Contact />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  // Check for maintenance mode before rendering the app
  if (isMaintenanceModeActive()) {
    return <MaintenanceScreen />;
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
