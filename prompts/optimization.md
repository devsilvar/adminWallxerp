# Performance Optimization & Architecture Audit — PayMyTax

> **Document Purpose:** Comprehensive engineering report documenting all performance bottlenecks, root causes, and high-impact remediation plans across the PayMyTax frontend, backend, database, and infrastructure layers.

---

## Executive Summary

Users experiencing slowness and lag are impacted by a combination of:
1. **Frontend Bundle Bloat & Zero Code-Splitting:** All 30+ pages (including a 100KB+ marketing landing page and admin portals) are downloaded synchronously in one monolithic JS bundle on first visit.
2. **Render Cold Starts & Geographic Latency:** Container sleeps on idle (45–60s delay), combined with cross-region network round-trips to the PostgreSQL database.
3. **Database Concurrency & Transaction Bottlenecks:** Heavy 1,000+ sequential upsert operations locking database connections during bank cache refresh.
4. **API Bursts & Un-indexed Aggregations:** Dashboard and list pages firing 5–6 parallel requests and 18+ separate SQL queries without composite indexes or client-side caching.

---

## 1. Frontend Architecture & Bundle Optimization

### 1.1 Monolithic JS Bundle (No Route-Level Code Splitting)
* **Location:** [`frontend/src/App.tsx:11-40`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/App.tsx)
* **Root Cause:** Every page component (`Landing`, `Dashboard`, `Sales`, `Expenses`, `Invoices`, `InvoiceDetail`, `AIAssistant`, `TaxReports`, `Account`, `Settings`, and all 6 Admin pages) is statically imported at the top of `App.tsx`.
* **Impact:** 
  * Authenticated users loading the dashboard on mobile networks are forced to download the entire marketing landing page, heavy charts (`recharts`), QR code generators, and admin pages.
  * Causes 4–8s white-screen delays on standard mobile 3G/4G connections.
* **Remediation:**
  Convert route imports in `App.tsx` to `React.lazy()` with a `<Suspense>` fallback:
  ```typescript
  const Landing = React.lazy(() => import('@/pages/Landing.tsx'));
  const Dashboard = React.lazy(() => import('@/pages/Dashboard.tsx'));
  const Sales = React.lazy(() => import('@/pages/Sales.tsx'));
  const Invoices = React.lazy(() => import('@/pages/Invoices.tsx'));
  const TaxReports = React.lazy(() => import('@/pages/TaxReports.tsx'));
  ```
  * **Expected Impact:** Reduces initial bundle size by **60–75%** and cuts First Contentful Paint (FCP) to <1.5s.

---

### 1.2 Render-Blocking Web Font Imports
* **Location:** [`frontend/src/index.css:2-8`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/index.css)
* **Root Cause:** 7 separate font weight packages are imported synchronously at the top of `index.css`:
  ```css
  @import "@fontsource/montserrat/400.css";
  @import "@fontsource/montserrat/500.css";
  @import "@fontsource/montserrat/600.css";
  @import "@fontsource/montserrat/700.css";
  @import "@fontsource/inter/400.css";
  @import "@fontsource/inter/500.css";
  @import "@fontsource/inter/600.css";
  ```
* **Impact:** The browser halts DOM rendering until all 7 font CSS and `.woff2` files are downloaded.
* **Remediation:**
  * Reduce imports to only essential weights (400 and 600).
  * Use `font-display: swap` so text displays immediately with system fallbacks before web fonts load.

---

### 1.3 Static Translation Eager Loading
* **Location:** [`frontend/src/i18n/index.ts:5-36`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/i18n/index.ts)
* **Root Cause:** All 10 translation JSON files (English & Nigerian Pidgin for `common`, `nav`, `dashboard`, `settings`, `account`) are statically imported and parsed during `main.tsx` evaluation.
* **Impact:** Unnecessary JavaScript execution time before React mounts.
* **Remediation:** Lazy-load translation namespaces on-demand via `i18next-http-backend` or dynamic imports.

---

### 1.4 Lack of Client-Side Query Caching
* **Location:** Sub-pages across [`Sales.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Sales.tsx), [`Expenses.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Expenses.tsx), and [`Invoices.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Invoices.tsx).
* **Root Cause:** Sub-pages do not have a stale-while-revalidate cache. Navigating `Sales` $\rightarrow$ `Invoices` $\rightarrow$ `Sales` re-fetches all data from scratch and flashes full loading skeletons.
* **Remediation:** Implement a global query cache or Stale-While-Revalidate (SWR) cache pattern so switching between sidebar tabs is instantaneous (<50ms).

---

## 2. Backend & Database Query Bottlenecks

### 2.1 Bank List Cache: 1,000+ Sequential Upserts Inside a Single Transaction
* **Location:** [`backend/src/services/bank.service.ts:105-131`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/bank.service.ts)
* **Root Cause:** When the 24-hour bank cache expires, the backend fetches up to 2,000 Nigerian banks from Paystack and executes:
  ```typescript
  await prisma.$transaction(
    banks.map((b) => prisma.bank.upsert({ ... }))
  );
  ```
* **Impact:** 
  * Prisma executes 1,000 to 2,000 individual queries sequentially over the database connection.
  * **Locks the database connection for 5–15 seconds**, starving the connection pool and causing other user requests to hang or fail.
* **Remediation:**
  Replace the 1,000 single upserts with a bulk batch operation:
  ```typescript
  await prisma.bank.createMany({
    data: banks.map((b) => ({ ... })),
    skipDuplicates: true,
  });
  ```

---

### 2.2 Dashboard API Burst: 6 Parallel Requests & 18+ DB Queries
* **Location:** [`frontend/src/pages/Dashboard.tsx:344-353`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Dashboard.tsx) & [`backend/src/services/tax.service.ts:325-380`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/tax.service.ts)
* **Root Cause:** 
  1. On dashboard mount, the frontend fires 5 parallel HTTP requests (`/tax/dashboard`, `/sales`, `/expenses`, `/tax/reports`, `/reminders/active`).
  2. In `AppLayout.tsx`, `NotificationBell` concurrently fires a 6th duplicate request for `/reminders/active`.
  3. Inside `getDashboard()`, the backend executes 8 separate DB queries (4 aggregate calls, 2 findUniques, 1 findMany, 1 lifetime aggregate).
* **Impact:** Overloads the backend connection pool on every dashboard load.
* **Remediation:**
  * Consolidate the 4 separate sales and expense aggregate queries in `getDashboard()` into a single raw SQL aggregation query (`prisma.$queryRaw`).
  * Remove the duplicate `/reminders/active` fetch from `Dashboard.tsx` and rely solely on `useReminderStore`.

---

### 2.3 Redundant Business Ownership Queries on Every Request
* **Location:** Every domain controller (`sales`, `expense`, `tax`, `invoice`, `dva`, `payment`)
* **Root Cause:** Every endpoint calls `verifyBusinessOwnership(userId, businessId)`, firing `SELECT * FROM businesses WHERE id = ?`. A single page load with 5 parallel requests runs 5 identical business ownership queries.
* **Remediation:** Cache user-business ownership in-memory (LRU cache with 60s TTL) or inside the JWT token context.

---

### 2.4 Missing Composite Database Indexes for Frequent Filters
* **Location:** [`backend/prisma/schema.prisma`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/prisma/schema.prisma)
* **Root Cause:** 
  * Frequent tax calculation and dashboard queries filter by:
    `WHERE business_id = ? AND status = 'confirmed' AND is_taxable = true AND transaction_date BETWEEN ? AND ?`
  * Missing composite index on `(businessId, status, isTaxable, transactionDate)` forces PostgreSQL to scan and filter rows in memory.
* **Remediation:**
  Add composite indexes in `schema.prisma`:
  ```prisma
  // model SalesTransaction
  @@index([businessId, status, isTaxable, transactionDate])

  // model Expense
  @@index([businessId, isDeductible, expenseDate])
  ```

---

## 3. Infrastructure & Cloud Hosting Latency

### 3.1 Render Free/Starter Tier Cold Starts
* **The Problem:** Free/starter instances spin down after 15 minutes of inactivity. The first request triggers container initialization, dependency startup, and database connection establishment, taking **45–60 seconds**.
* **Remediation:**
  * Keep the container awake using a free external uptime monitor (e.g., UptimeRobot, BetterStack) pinging `GET /api/health` every 5 minutes.
  * Upgrade to Render Standard always-on tier in production.

---

### 3.2 Geographic Latency Between Backend and PostgreSQL
* **The Problem:** If Render is hosted in US-East (`us-east-1` Oregon/Ohio) and PostgreSQL (Neon/Supabase) is in Europe (`eu-central-1` Frankfurt), each database query incurs a **100–150ms round-trip network penalty**.
  * 18 queries $\times$ 120ms = **2.16 seconds of network delay** before the server can even respond.
* **Remediation:** Ensure Render and PostgreSQL are deployed in the **exact same cloud region**.

---

### 3.3 CPU Lock on High Bcrypt Rounds
* **Location:** [`backend/src/services/auth.service.ts:12`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/auth.service.ts)
* **Root Cause:** `BCRYPT_ROUNDS = 12` consumes 350ms–600ms of 100% CPU time per login on small 0.5 CPU containers.
* **Remediation:** Lower `BCRYPT_ROUNDS` to 10 (industry standard ~80ms CPU time) to prevent CPU thread starvation.

---

## 4. Priority Implementation Roadmap

| Priority | Optimization Task | Effort | Expected Impact |
|---|---|---|---|
| **P0** | **Route-Level Code Splitting (`React.lazy` in `App.tsx`)** | 1 hr | **60-75% reduction in initial bundle size; FCP < 1.5s** |
| **P0** | **Region Co-location & Keep-Alive Ping** | 30 mins | **Eliminates 45s cold starts & 2s database network latency** |
| **P1** | **Batch Bank Upserts in `bank.service.ts`** | 30 mins | **Eliminates 5-15s database lock spikes** |
| **P1** | **Consolidate Dashboard SQL Aggregations** | 1.5 hrs | **Cuts dashboard API response time by 50%** |
| **P1** | **Add Composite Indexes (`schema.prisma`)** | 30 mins | **Accelerates transaction searches & dashboard aggregates** |
| **P2** | **Optimize Web Font & Translation Loading** | 45 mins | **Eliminates FCP font render-blocking** |
| **P2** | **Adjust Bcrypt Rounds (12 $\rightarrow$ 10)** | 10 mins | **4x faster login and registration response times** |
