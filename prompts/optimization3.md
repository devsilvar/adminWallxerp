# Implementation Plan — Sections 2.2 & 2.3: API Burst Consolidation & Business Ownership Caching

> **Document Purpose:** Detailed technical blueprint for optimizing the dashboard API data-loading pipeline (Section 2.2) and eliminating redundant database business-ownership verification queries across all API endpoints (Section 2.3) in the PayMyTax backend and frontend.

---

## 1. Context & Baseline Analysis

### Problem 1: Dashboard API Burst & DB Query Explosion (Section 2.2)
* **Frontend Trigger:** [`frontend/src/pages/Dashboard.tsx:344-353`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Dashboard.tsx)
  On mount, the dashboard fires **5 parallel HTTP requests**:
  1. `GET /businesses/:id/tax/dashboard?months=6`
  2. `GET /businesses/:id/sales?limit=5`
  3. `GET /businesses/:id/expenses?limit=5`
  4. `GET /businesses/:id/tax/reports?limit=3`
  5. `GET /businesses/:id/reminders/active`
  * Concurrently, [`NotificationBell.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/layout/NotificationBell.tsx) in `AppLayout` fires a **6th duplicate request** for `/reminders/active`.
* **Backend Database Explosion:** [`backend/src/services/tax.service.ts:303-380`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/tax.service.ts)
  Inside `getDashboard()`, the backend executes **8 separate database queries**:
  - Query 1: `verifyBusinessOwnership` (`SELECT * FROM businesses WHERE id = ?`)
  - Query 2: Current month report (`findUnique`)
  - Query 3: Lifetime sales aggregate (`salesTransaction.aggregate`)
  - Query 4: Lifetime expense aggregate (`expense.aggregate`)
  - Query 5: Current month sales aggregate (`salesTransaction.aggregate`)
  - Query 6: Current month expense aggregate (`expense.aggregate`)
  - Query 7: Trend reports (`monthlyTaxReport.findMany`)
  - Query 8: Lifetime tax payable aggregate (`monthlyTaxReport.aggregate`)
* **Total Cost:** A single dashboard page load triggers **6 HTTP requests and ~18 database queries**.

---

### Problem 2: Redundant Business Ownership Queries on Every Request (Section 2.3)
* **Ubiquitous Duplication:** [`backend/src/services/`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services)
  Every single service file (`sales`, `expense`, `tax`, `invoice`, `payment`, `dva`, `reminder`, `statement`, `sales-import`) maintains its own copy of `verifyBusinessOwnership()`.
* **Database Penalty:**
  When a user opens any page (Dashboard, Sales, Invoices) that triggers 3 to 6 parallel API requests, the backend fires **3 to 6 identical `SELECT * FROM businesses WHERE id = ?` queries** simultaneously.
  - None of this ownership metadata is cached in memory.
  - Generates 100% redundant database I/O and network latency on every user action.

---

## 2. Target Architecture

```
                                  CLIENT NAVIGATION
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        ▼                                                                 ▼
Dashboard Bundle                                                 NotificationBell
(Calls 4 unique endpoints;                                       (Owns single /reminders/active call)
removes duplicate reminders)
        │
        ▼
   Express Router ──> [ Ownership Cache Layer (Memory TTL: 60s) ]
        │             ├── Cache Hit: 0ms, 0 DB queries ✅
        │             └── Cache Miss: 1 DB query + Cache in RAM
        ▼
Unified getDashboard() 
        ├── Query 1: Consolidated Sales (Lifetime + Current Month in 1 SQL query)
        ├── Query 2: Consolidated Expenses (Lifetime + Current Month in 1 SQL query)
        ├── Query 3: Current Month & Trend Reports
        └── Result: From 8 queries down to 3 queries (62% reduction!)
```

---

## 3. Step-by-Step Implementation Blueprint

---

### Step 1: Centralized Business Ownership Service with In-Memory Caching (Section 2.3)
**File to create:** [`backend/src/lib/ownership.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/lib/ownership.ts)

Create a high-performance, centralized ownership verification utility with a 60-second in-memory LRU/TTL cache:

```typescript
import prisma, { TxClient } from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import type { Business } from '@prisma/client';

interface CachedOwnership {
  business: Business;
  expiresAt: number;
}

const OWNERSHIP_TTL_MS = 60 * 1000; // 60 seconds TTL
const ownershipCache = new Map<string, CachedOwnership>();

function getCacheKey(userId: string, businessId: string): string {
  return `${userId}:${businessId}`;
}

/**
 * Invalidate cached business ownership (call on business update/delete/reconnect)
 */
export function invalidateOwnershipCache(businessId: string, userId?: string): void {
  if (userId) {
    ownershipCache.delete(getCacheKey(userId, businessId));
  } else {
    for (const [key] of ownershipCache.entries()) {
      if (key.endsWith(`:${businessId}`)) {
        ownershipCache.delete(key);
      }
    }
  }
}

/**
 * Verifies that a business exists and belongs to the authenticated user.
 * Reads from a fast 60s memory cache for standard queries; bypasses cache when in a transaction.
 */
export async function verifyBusinessOwnership(
  userId: string,
  businessId: string,
  tx?: TxClient
): Promise<Business> {
  const db = tx ?? prisma;

  // Transactions must read fresh DB state
  if (!tx) {
    const key = getCacheKey(userId, businessId);
    const cached = ownershipCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.business;
    }
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  if (business.userId !== userId) {
    throw new AppError(403, 'You do not have access to this business', 'FORBIDDEN');
  }

  // Cache warm result
  if (!tx) {
    const key = getCacheKey(userId, businessId);
    ownershipCache.set(key, {
      business,
      expiresAt: Date.now() + OWNERSHIP_TTL_MS,
    });
  }

  return business;
}
```

---

### Step 2: Refactor Services to Use the Centralized Ownership Utility (Section 2.3)
**Files to update:**
- [`backend/src/services/tax.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/tax.service.ts)
- [`backend/src/services/sales.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/sales.service.ts)
- [`backend/src/services/expense.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/expense.service.ts)
- [`backend/src/services/invoice.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/invoice.service.ts)
- [`backend/src/services/dva.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/dva.service.ts)
- [`backend/src/services/payment.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/payment.service.ts)
- [`backend/src/services/reminder.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/reminder.service.ts)
- [`backend/src/services/statement.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/statement.service.ts)
- [`backend/src/services/sales-import.service.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/sales-import.service.ts)

**Action:** Replace local duplicate `async function verifyBusinessOwnership` definitions with:
```typescript
import { verifyBusinessOwnership } from '@/lib/ownership';
```
And call `invalidateOwnershipCache(businessId, userId)` inside `business.service.ts` when a business is updated or deleted.

---

### Step 3: Consolidate Dashboard SQL Aggregations in Backend (Section 2.2)
**File to modify:** [`backend/src/services/tax.service.ts:325-349`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/tax.service.ts)

Replace the 4 separate Prisma aggregate queries with 2 consolidated SQL conditional aggregation queries:

```typescript
// Consolidated Sales (Lifetime + Current Month in 1 SQL query)
// Consolidated Expenses (Lifetime + Current Month in 1 SQL query)
const [salesAggResult, expenseAggResult] = await Promise.all([
  prisma.$queryRaw<Array<{ lifetime_sales: number; month_sales: number }>>`
    SELECT
      COALESCE(SUM(CASE WHEN is_taxable = true AND status = 'confirmed' THEN amount ELSE 0 END), 0)::FLOAT AS lifetime_sales,
      COALESCE(SUM(CASE WHEN is_taxable = true AND status = 'confirmed' AND transaction_date >= ${currentMonthStart} AND transaction_date <= ${currentMonthEnd} THEN amount ELSE 0 END), 0)::FLOAT AS month_sales
    FROM sales_transactions
    WHERE business_id = ${businessId}
  `,
  prisma.$queryRaw<Array<{ lifetime_expenses: number; month_expenses: number }>>`
    SELECT
      COALESCE(SUM(CASE WHEN is_deductible = true THEN amount ELSE 0 END), 0)::FLOAT AS lifetime_expenses,
      COALESCE(SUM(CASE WHEN is_deductible = true AND expense_date >= ${currentMonthStart} AND expense_date <= ${currentMonthEnd} THEN amount ELSE 0 END), 0)::FLOAT AS month_expenses
    FROM expenses
    WHERE business_id = ${businessId}
  `,
]);

const lifetimeSales = salesAggResult[0]?.lifetime_sales ?? 0;
const monthSales = salesAggResult[0]?.month_sales ?? 0;
const lifetimeExpenses = expenseAggResult[0]?.lifetime_expenses ?? 0;
const monthExpenses = expenseAggResult[0]?.month_expenses ?? 0;
```

---

### Step 4: Frontend Request Deduplication in `Dashboard.tsx` (Section 2.2)
**File to modify:** [`frontend/src/pages/Dashboard.tsx:343-361`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Dashboard.tsx)

Remove the redundant `GET /businesses/:id/reminders/active` call from `fetchDashboardBundle`. The top-bar [`NotificationBell.tsx`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/layout/NotificationBell.tsx) already fetches and stores active reminders in `useReminderStore`.

```typescript
async function fetchDashboardBundle(bid: string): Promise<DashboardBundle> {
  const [dashRes, salesRes, expensesRes, reportsRes] =
    await Promise.all([
      api.get(`/businesses/${bid}/tax/dashboard?months=6`),
      api.get(`/businesses/${bid}/sales?limit=5`),
      api.get(`/businesses/${bid}/expenses?limit=5`),
      api.get(`/businesses/${bid}/tax/reports?limit=3`),
    ]);

  // Read active reminders from the store (populated by NotificationBell)
  const activeReminders = useReminderStore.getState().activeReminders;

  return {
    dashboard: dashRes.data.data,
    recentSales: salesRes.data.data,
    recentExpenses: expensesRes.data.data,
    recentReports: reportsRes.data.data,
    reminders: activeReminders || [],
  };
}
```

---

## 4. Edge Cases & Safety Guards

1. **Transactional Integrity & Rollback Safety:**
   When a service function is executed inside a transaction (`prisma.$transaction(async (tx) => { ... })`), `verifyBusinessOwnership` receives `tx` and automatically **bypasses the memory cache**, querying PostgreSQL directly within the transaction's isolation level.
2. **Business Updates & Cache Invalidation:**
   Any mutation modifying business details (`updateBusiness`, `deleteBusiness`, settlement connection) calls `invalidateOwnershipCache(businessId, userId)` immediately, ensuring stale ownership or configuration data is never served.
3. **Cross-Tenant Access Prevention:**
   Ownership verification still strictly enforces `business.userId === userId`. Even on a cache hit, the cache key is scoped to `${userId}:${businessId}`, preventing unauthorized users from accessing cached business objects.

---

## 5. Verification & Testing Checklist

### Performance Verification
| Metric | Before Optimization | After Optimization | Target Improvement |
|---|---|---|---|
| **Dashboard HTTP Requests** | 6 parallel requests | 4 parallel requests | **33% reduction in HTTP overhead** |
| **Dashboard Database Queries** | 18+ queries | 7-8 queries | **>55% reduction in DB queries** |
| **Ownership Verification DB Calls** | 5 queries per page load | 1 query per 60s per user | **90% reduction in ownership queries** |
| **Dashboard API Latency** | 600ms – 1,200ms | 180ms – 300ms | **2x to 4x faster response time** |

### Functional Regression Tests
1. **Dashboard Data Integrity:** Verify all 4 KPI cards (Sales, Expenses, Gross Profit, Tax Payable), trend charts, and recent transaction lists render identical numeric totals.
2. **Multi-Business Switching:** Switch between business accounts in the sidebar selector $\rightarrow$ verify ownership is re-verified, cached correctly, and data renders for the active business.
3. **Unauthorized Access:** Attempt accessing a business with an unauthorized user token $\rightarrow$ verify `403 FORBIDDEN` is returned without cache leakage.
4. **Reminders Top-Bar & Dashboard Alignment:** Verify that dismissed reminders in the top-bar notification bell update both the bell dropdown and the dashboard card.
