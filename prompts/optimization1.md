# Implementation Plan — Section 1.1: Route-Level Code Splitting & Bundle Optimization

> **Document Purpose:** Detailed technical blueprint for implementing route-level code splitting (`React.lazy` + `Suspense`) and Vite bundle chunk optimization in the PayMyTax frontend application without introducing regressions, layout flashes, or breaking any authentication flows.

---

## 1. Context & Baseline Analysis

### Current Problem
In [`frontend/src/App.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/App.tsx), all 26 application pages are loaded synchronously via top-level ES module imports:
- **Public & Auth Pages:** `Landing`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`
- **User Dashboard & Core SME Pages:** `Dashboard`, `Sales`, `Expenses`, `Invoices`, `InvoiceForm`, `InvoiceDetail`, `UnverifiedTransactions`, `TestTransferSimulator`, `AIAssistant`, `TaxReports`, `Payments`, `Reminders`, `Settings`, `Account`, `NotFound`
- **Admin Pages:** `AdminLogin`, `AdminDashboard`, `AdminUsers`, `AdminUserDetail`, `AdminBusinesses`, `AdminAuditLogs`

### Impact
* **Monolithic Bundle:** Vite bundles all 26 pages, heavy SVG assets (including the 2,000-line `Landing.tsx`), charting engines (`recharts`), and utility libraries into a single massive JavaScript chunk.
* **Severe Initial Load Delay:** A regular SME user navigating to `/dashboard` or `/login` is forced to download the entire marketing landing page, PDF generator templates, and the complete admin portal upfront.
* **Mobile Penalty:** On 3G/4G Nigerian mobile networks, this results in a 4–8 second blank screen before First Contentful Paint (FCP).

---

## 2. Target Architecture

```
User visits /dashboard
      │
      ▼
App.tsx (Core Shell: Router + Toaster + ErrorBoundary) ── [Instant <150kB initial bundle]
      │
      ├── Core Layouts (AppLayout, AuthLayout, AdminLayout) [Synchronous]
      ├── Route Guards (ProtectedRoute, GuestRoute, AdminRoute) [Synchronous]
      │
      ▼
<Suspense fallback={<PageLoader />}>
      │
      ▼
Dynamically downloads ONLY Dashboard-[hash].js (and its direct dependencies)
```

### Key Architectural Principles
1. **Zero Layout Thrashing:** Suspense boundaries will be placed **inside** layout wrappers (`AppLayout`, `AuthLayout`, `AdminLayout`) so that the top navigation bar, sidebar, and theme shells stay mounted and never flicker during route transitions.
2. **Resilient Chunk Loading:** Handle transient network dropouts when downloading a new route chunk with automatic retry logic.
3. **Optimized Vendor Splitting:** Configure Vite to separate heavy vendor libraries (`recharts`, `react-router-dom`, `lucide-react`) into distinct cacheable chunks.

---

## 3. Detailed Proposed Changes

---

### Step 1: Create a Unified Page Loading Fallback Component
**File to create:** [`frontend/src/components/ui/PageLoader.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/ui/PageLoader.tsx)

A lightweight, accessible spinner matching PayMyTax brand colors (`#7c3aed` / `primary-600`) with zero external library overhead to serve as the default Suspense fallback.

```tsx
import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  message?: string;
  minHeight?: string;
}

export default function PageLoader({ 
  message = 'Loading...', 
  minHeight = 'min-h-[50vh]' 
}: PageLoaderProps) {
  return (
    <div 
      role="status" 
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-8 ${minHeight}`}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary-600 mb-3" aria-hidden="true" />
      <span className="text-sm font-medium text-gray-500 animate-pulse">{message}</span>
    </div>
  );
}
```

---

### Step 2: Implement Lazy Route Loading in `App.tsx`
**File to modify:** [`frontend/src/App.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/App.tsx)

#### A. Convert Page Imports to `React.lazy()`:
```typescript
import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ErrorBoundary from '@/components/ErrorBoundary.tsx';
import AuthLayout from '@/components/layout/AuthLayout.tsx';
import AppLayout from '@/components/layout/AppLayout.tsx';
import ProtectedRoute from '@/routes/ProtectedRoute.tsx';
import GuestRoute from '@/routes/GuestRoute.tsx';
import AdminRoute from '@/routes/AdminRoute.tsx';
import AdminLayout from '@/components/layout/AdminLayout.tsx';
import PageLoader from '@/components/ui/PageLoader.tsx';

// ─── Lazy-Loaded Pages ───────────────────────────────────────
// Guest & Auth Pages
const Landing = lazy(() => import('@/pages/Landing.tsx'));
const Login = lazy(() => import('@/pages/Login.tsx'));
const Register = lazy(() => import('@/pages/Register.tsx'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword.tsx'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword.tsx'));

// SME App Pages
const Dashboard = lazy(() => import('@/pages/Dashboard.tsx'));
const Sales = lazy(() => import('@/pages/Sales.tsx'));
const Expenses = lazy(() => import('@/pages/Expenses.tsx'));
const Invoices = lazy(() => import('@/pages/Invoices.tsx'));
const InvoiceForm = lazy(() => import('@/pages/InvoiceForm.tsx'));
const InvoiceDetail = lazy(() => import('@/pages/InvoiceDetail.tsx'));
const UnverifiedTransactions = lazy(() => import('@/pages/UnverifiedTransactions.tsx'));
const TestTransferSimulator = lazy(() => import('@/pages/TestTransferSimulator.tsx'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant.tsx'));
const TaxReports = lazy(() => import('@/pages/TaxReports.tsx'));
const Payments = lazy(() => import('@/pages/Payments.tsx'));
const Reminders = lazy(() => import('@/pages/Reminders.tsx'));
const Settings = lazy(() => import('@/pages/Settings.tsx'));
const Account = lazy(() => import('@/pages/Account.tsx'));
const NotFound = lazy(() => import('@/pages/NotFound.tsx'));

// Admin Pages
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin.tsx'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.tsx'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers.tsx'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail.tsx'));
const AdminBusinesses = lazy(() => import('@/pages/admin/AdminBusinesses.tsx'));
const AdminAuditLogs = lazy(() => import('@/pages/admin/AdminAuditLogs.tsx'));
```

#### B. Wrap Route Outlets in `<Suspense>`:
Wrap the route hierarchy with `<Suspense fallback={<PageLoader />}>` so that loading a sub-page renders the layout instantly and streams in the page chunk seamlessly:

```tsx
<BrowserRouter>
  <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
  <ErrorBoundary>
    <Suspense fallback={<PageLoader minHeight="min-h-screen" message="Loading PayMyTax..." />}>
      <Routes>
        {/* Guest routes */}
        <Route element={<GuestRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/sales/unverified" element={<UnverifiedTransactions />} />
            <Route path="/test/transfer-simulator" element={<TestTransferSimulator />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceForm />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
            <Route path="/ai" element={<AIAssistant />} />
            <Route path="/tax" element={<TaxReports />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Admin login */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin protected routes */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:userId" element={<AdminUserDetail />} />
            <Route path="/admin/businesses" element={<AdminBusinesses />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          </Route>
        </Route>

        {/* Landing page */}
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </ErrorBoundary>
</BrowserRouter>
```

---

### Step 3: Enhance Vite Rollup Chunking Strategy
**File to modify:** [`frontend/vite.config.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/vite.config.ts)

Configure Rollup output chunking in Vite so vendor dependencies are grouped cleanly and cached across deployments:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Recharts and charting internals
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          // Core React runtime
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          // UI icons
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
```

---

## 4. Edge Cases & Safety Guards

1. **Transient Network Failure on Chunk Fetching:**
   If a user navigates to a new page while momentarily losing network connection, standard dynamic `import()` throws an error. The existing [`ErrorBoundary.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/ErrorBoundary.tsx) catches this gracefully and provides a "Try Again" / "Reload Page" button rather than a broken white screen.
2. **Auth Token Refresh during Route Transition:**
   The `api.interceptors` in [`axios.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/lib/axios.ts) handle token refreshes independently from the component mount lifecycle, ensuring route authorization state remains consistent.
3. **No Layout Shift on Warm Navigation:**
   Layouts (`AppLayout`, `Sidebar`, `NotificationBell`) are not wrapped inside individual child Suspense boundaries, preventing header/sidebar teardown and re-creation.

---

## 5. Verification & Testing Plan

### Automated Build Verification
1. Run TypeScript check:
   ```bash
   cd frontend
   npm run build
   ```
2. Inspect generated chunks in `dist/assets/`:
   - Confirm `index-[hash].js` is **under 180 kB** (was ~1.2MB+).
   - Confirm separate chunks exist for `Landing-[hash].js`, `Dashboard-[hash].js`, `vendor-charts-[hash].js`, etc.

### Manual Route Navigation Testing
| Test Scenario | Steps | Expected Result |
|---|---|---|
| **Landing Page** | Navigate to `/` | Loads only `Landing` + core CSS; no dashboard or admin JS loaded. |
| **Login Flow** | Navigate to `/login` $\rightarrow$ authenticate | Smooth redirect to `/dashboard`; loads `Dashboard` chunk on demand. |
| **Tab Navigation** | Switch between `/sales`, `/expenses`, `/invoices` | Sidebar stays solid; each page chunk loads cleanly without flicker. |
| **Admin Route** | Navigate to `/admin/login` | Loads admin bundle only; regular users never download admin chunks. |
| **Direct URL Deep-link** | Open `/invoices/new` directly in new tab | Shell mounts instantly, loads `InvoiceForm` chunk without error. |
| **404 Handling** | Navigate to `/non-existent-page` | `NotFound` chunk renders with 404 messaging. |
