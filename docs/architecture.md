# System Architecture & Technical Design

## 1. Architectural Overview

**PayMyTax by WallX** is engineered as a decoupled monorepo comprising a backend REST API and a single-page application (SPA) frontend. The system adheres to strict domain separation, layered dependency flow, and transactional consistency for all financial operations.

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (SPA)                       │
│  React 19 + TypeScript + Vite + Tailwind CSS v4        │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / REST (JSON)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Backend API                          │
│  Express 5 + TypeScript + Prisma ORM + Node.js v20+    │
├────────────────────────────────────────────────────────┤
│  Middleware Pipeline (Helmet, CORS, Rate Limit, Auth)  │
│  Controllers (Request Validation via Zod Schemas)      │
│  Services (Business Logic, Transactions, Auditing)     │
│  Canonical Domain Helpers (Math, Month-Lock, Solvency) │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                ▼                        ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│       Database (PostgreSQL)   │ │  External Integrations │
│  - Neon / Supabase Cloud DB   │ │  - Paystack (DVA/Pay) │
│  - Prisma Client Singletons   │ │  - Resend (Email)     │
│  - Row-Level Locks & Triggers │ │  - AWS S3 (Receipts)  │
└───────────────────────────────┘ └──────────────────────┘
```

---

## 2. Layered Boundaries & Dependency Direction

The backend architecture strictly enforces a **unidirectional dependency rule**:
`Routes ──> Controllers ──> Services ──> Data Access (Prisma)`

```
[ HTTP Requests ]
       │
       ▼
[ Routes ]            Mounted at /api/v1/*. Responsible only for route matching & middleware.
       │
       ▼
[ Controllers ]       Extracts params, validates payloads via Zod, passes plain DTOs to Services.
       │              NEVER contains database queries or business logic.
       ▼
[ Services ]          Executes domain operations, business validations, and database transactions.
       │              Accepts optional `tx?: TxClient` parameter for atomic multi-service composition.
       ▼
[ Prisma ORM / DB ]   Database persistence, table constraints, row-level locks.
```

### Prohibited Deviations:
- **No Controller-to-Prisma access**: Controllers must never import or query `prisma` directly.
- **No Circular Service Dependencies**: If Service A depends on Service B, Service B must not import Service A. Use domain events (`src/shared/event-bus.ts`) or composite orchestrators.
- **No Direct Mutation of Locked Records**: Every financial service must invoke canonical assertions (`assertMonthNotLocked`) before writing to the database.

---

## 3. Directory Structure

### Backend Layout (`backend/src/`)
```
backend/src/
├── controllers/          # HTTP request handlers (e.g. sales.controller.ts, tax.controller.ts)
├── services/             # Core domain logic
│   ├── sales/            # Sales transactions, Excel/CSV bulk import
│   ├── expense/          # Expense tracking, categorization, receipt attachments
│   ├── tax/              # FIRS tax calculator, period reports, Nil returns
│   ├── invoice/          # Invoicing lifecycle, PDF generator, email/WhatsApp dispatch
│   ├── credit.service.ts # Accrual credit sales, debtor collections, bad debt write-offs
│   ├── wallet.service.ts # User wallet, payouts, transfer sweeps, solvency assertions
│   ├── team.service.ts   # RBAC roster, member invitations, permission overrides
│   └── dva/              # Paystack virtual accounts and webhook ingestion
├── routes/               # Express router declarations
├── validators/           # Zod schemas (type-safe validation)
├── shared/               # Canonical domain helpers (helpers.ts, math, date boundaries)
├── lib/                  # Infrastructure libraries (prisma.ts, paystack.ts, email/, s3.ts)
├── jobs/                 # Cron jobs (auto-sweep.cron.ts, payout-reconciliation.cron.ts)
├── middlewares/          # JWT auth, RBAC verification, error handler, rate limiters
└── app.ts & server.ts    # Server bootstrapping and lifecycle hooks
```

### Frontend Layout (`frontend/src/`)
```
frontend/src/
├── components/           # Reusable UI components
│   ├── common/           # Buttons, Inputs, Modals, Skeletons, SegmentedControl
│   ├── marketing/        # Nav, Footer, HeroDashboardPreview, ShowcaseGallery, FAQSection
│   ├── debtors/          # Debtor tables, Credit modals, Write-off workflows
│   ├── account/          # DVA onboarding wizard, settlement bank cards, PIN modal
│   └── settings/         # Business settings, team membership tab, fee configurations
├── pages/                # Route views (Dashboard, Sales, Expenses, Debtors, TaxReports)
│   └── marketing/        # Public pages (Home, About, Pricing, Contact)
├── stores/               # Zustand state stores (auth.store, business.store, team.store)
├── services/             # Axios API client modules
└── types/                # Domain TypeScript contracts
```

---

## 4. Key Architectural Invariants

### 4.1. Canonical Helpers (`src/shared/helpers.ts`)
- **`toNumber(val)`**: The only permissible function for converting Prisma Decimal, strings, null, or undefined values into clean JavaScript numbers.
- **`assertMonthNotLocked(businessId, date)`**: Authoritative guard verifying whether a UTC month is closed or finalized. Throws `423 PERIOD_LOCKED` or `423 PERIOD_FINALIZED`.
- **`SETTLED_SALE_STATUSES`**: Canonical array `['confirmed', 'completed']` defining settled revenue.
- **`TAXABLE_SALES_WHERE`**: Single source of truth for taxable sales queries filtering out non-taxable debt repayments.
- **`getWithdrawalActor(userId)`**: Uncached live query retrieving up-to-date user PIN lockouts and verified settlement accounts.

### 4.2. Transactional Atomicity & CPU/Network Separation
- Mutations involving multiple records or audit logs MUST execute inside `prisma.$transaction(async (tx) => { ... })`.
- **Strict Separation**: Expensive CPU operations (bcrypt hashing, PDFKit rendering) and third-party network requests (Paystack API, Resend email dispatch) must **NEVER** run inside a database transaction block. Always perform CPU/network work first, then commit state in a short, focused database transaction.

### 4.3. Audit Logging
- Every mutation must record an audit entry using `logAudit({ userId, businessId, action, oldData, newData, req })`.
- Supports both standalone fire-and-forget logging and transactional logging using `tx`.

---

## 5. External Services & Integrations

| External Service | Role | Authentication / Security |
| :--- | :--- | :--- |
| **Paystack** | Dedicated Virtual Accounts (DVA), Customer Verification, Outbound Transfers, Tax Payments | API Secret Key, Webhook HMAC-SHA512 verification |
| **Resend** | Transactional emails (Invoices, Debtors, Welcome, Team Invites) | API Key via Authorization Bearer header, local dev Winston fallback |
| **AWS S3 / Spaces**| Expense receipts, bank statements, invoice archives | IAM Access Keys, S3 Presigned URLs |
| **Sentry** | Production application error tracking & performance monitoring | DSN configured in production runtime |
| **Groq / AI** | Virtual CFO advisory queries & tax categorization assistance | Platform Admin encrypted API keys |

---

## 6. Recent Architectural Decisions

- **2026-10-17: CRM Update 2 (Phase 1 — Foundation & Editable Threshold Plumbing)**
  - *Context*: Multi-tiered security for store voucher credit additions and deductions.
  - *Decision*: Removed the boolean `voucherRequiresApproval` toggle entirely. Introduced `Business.voucherAdjustmentThreshold` (default ₦50,000, 0–10M) editable by both `owner` and `manager` roles via `PUT /settings/voucher-adjustment-threshold` with audit logging and ownership cache invalidation. Added `VoucherLedgerRequest` table and status enums (`pending`, `awaiting_customer`, `verified`, `rejected`, `expired`, `applied`). Added `emptyToUndef` preprocessor to `updateCustomerSchema` preventing empty form strings from triggering 400 validation errors on optional fields. Added `voucherVerificationRateLimiter`.

- **2026-10-18: SSE Update 1 (Step 1 — Shared Foundation for 6 Admin Desks)**
  - *Context*: Admin desks require live multi-surface event updates without WebSocket or Redis for v1.
  - *Decision*: Extended `RealtimeEvent` with 8 typed events for broadcast progress, withdrawals, unverified inflows, and subscriptions. Initialized broadcast creation to `status: 'sending'` (eliminating the premature `'sent'` status lie). Updated `message-email.service.ts` to perform incremental `sentEmailCount` / `failedEmailCount` increments per 10-message chunk with 400ms pacing and rate-limit retries, emit `broadcast_email_progress` per chunk, resolve delivery statistics via `groupBy` on `emailStatus`, flip `status: 'sent'`, and emit `broadcast_email_completed`. Added `emitToAdmins(event)` in `realtime-admin.helper.ts` with a 60-second in-memory admin IDs cache to prevent database hammering. Provisioned `SSEClient` in `adminFrontend` and wired automatic connection in `AppShell` upon admin authentication.

- **2026-10-18: SSE Update 1 (Step 2 — AdminBroadcasts Live Updates & Idempotent Retry)**
  - *Context*: Admins need real-time feedback during large email campaigns and the ability to safely retry stuck or pending messages.
  - *Decision*: Mounted `POST /api/v1/admin/broadcasts/:id/retry` routing through `message.controller.ts` to `message.service.ts.retryBroadcast`. If remaining pending messages > 0, flips status to `'sending'`, queues asynchronous dispatch outside transaction, and returns 202 (`Retry queued`); if 0 pending, idempotently returns 200 without duplicate sends. Wired `AdminBroadcasts.tsx` with live SSE listeners for `broadcast_email_progress` and `broadcast_email_completed`, updating the live table and inspector modal. Implemented a 3-second fallback interval active only while any broadcast is in the `'sending'` state, ensuring updates even if SSE is disabled or disconnected.

- **2026-10-18: SSE Update 1 (Step 3 — AdminWithdrawals Live Updates & Realtime Status Sync)**
  - *Context*: Admins managing the withdrawal queue need immediate real-time visibility into new withdrawal requests submitted by merchants, status transitions during approval/rejection/manual settlement/requery, and automated webhook or cron status resolution without manual refreshing or re-querying.
  - *Decision*: Integrated `emitToAdmins` into the withdrawal lifecycle:
    1. `merchant-payout.service.ts`: Emits `withdrawal_created` on manual withdrawal request creation and when auto-payout queues for review due to insufficient gateway balance.
    2. `admin-payout.service.ts`: In `adminApproveWithdrawal`, emits `withdrawal_status_changed` (`processing`) immediately after atomic claim inside the advisory-lock fence, and (`completed`) when transfer succeeds. On transfer failures, emits `withdrawal_status_changed` (`pending` on gateway balance deficit, `processing` on ambiguous gateway timeout, `failed` on deterministic gateway rejection). In `adminRejectWithdrawal`, emits `failed` with rejection reason. In `adminManualSettleWithdrawal`, emits `completed`. In `adminRequeryWithdrawal`, emits `completed` or `failed` based on verified Paystack status.
    3. `payment-webhook.service.ts`: Emits `withdrawal_status_changed` (`completed` on `transfer.success`, `failed` on `transfer.failed`/`transfer.reversed`).
    4. `payout-reconciliation.cron.ts`: Emits `withdrawal_status_changed` (`completed` or `failed`) when sweeper verifies stuck payouts.
    5. `AdminWithdrawals.tsx`: Wired singleton SSE client listeners for `withdrawal_created` and `withdrawal_status_changed`, triggering immediate `fetchWithdrawals()` and `fetchStats({ force: true })`. Added 5-second polling fallback active only while any withdrawal in the table has actionable status (`pending` or `processing`).

- **2026-10-18: SSE Update 1 (Step 4 — AdminUnverifiedInflows Live Updates & Dual-Actor Classification Sync)**
  - *Context*: When DVA transfers arrive requiring transaction classification (`needsVerification: true`), admins must see them appear in the unverified queue in real-time. When either an admin or merchant classifies/verifies a transaction, all admin consoles must immediately drop the resolved row and decrement the global badge counter without page refreshes.
  - *Decision*: Integrated dual-emitter SSE architecture for unverified inflows:
    1. `dva-webhook.service.ts`: Emits `unverified_inflow_created` with `{ saleId, businessId, businessName, amount, referenceId, timestamp }` after successfully committing the atomic transaction fence whenever `sale.needsVerification === true`. Storefront orders (`ORD-...`) and duplicate reference replay events bypass emission cleanly.
    2. `admin-unverified-inflows.service.ts`: In `adminVerifySale`, calls `applyVerification` with `{ kind: 'admin', adminUserId }` and emits `unverified_inflow_verified` to admins with `{ saleId, businessId, timestamp }`.
    3. `sales-verification.service.ts`: In `applyVerification`, checks `if (actor.kind !== 'admin') emitToAdmins({ type: 'unverified_inflow_verified', ... })` so that merchant classifications in SME app automatically notify admin consoles, while suppressing redundant double emissions on admin actions.
    4. `AdminUnverifiedInflows.tsx`: Subscribed to `unverified_inflow_created` and `unverified_inflow_verified`. On creation: re-fetches queue and force-refreshes `useAdminStatsStore`. On verification: optimistically removes the verified row from local state and re-fetches queue + stats store. Implemented 7-second fallback polling active only while queue is actionable (`inflows.length > 0 || unverifiedCount > 0`).

- **2026-10-18: SSE Update 1 (Step 5 — AdminSubscriptions Live Updates & Proof Lifecycle Sync)**
  - *Context*: Subscription payment proofs submitted by merchants need to instantly appear on the Admin Subscriptions desk, increment the pending counter in the sidebar and dashboard, and vanish from the Pending tab across all connected admin consoles when approved or rejected by any admin.
  - *Decision*: Wired `emitToAdmins` across the subscription payment proof review lifecycle:
    1. `subscription.service.ts`: In `processPaymentProof`, emits `subscription_submitted` with `{ submissionId, customerName, plan, amount, timestamp }` immediately after inserting the `subscriptionSubmission` record.
    2. `admin.service.ts`: In `approveSubscription`, emits `subscription_status_changed` (`status: 'approved'`) after committing the user tier upgrade transaction. In `rejectSubscription`, emits `subscription_status_changed` (`status: 'rejected'`) after updating submission status and recording the rejection reason.
    3. `AdminSubscriptions.tsx`: Subscribed to `subscription_submitted` and `subscription_status_changed` using `getSSEClient()`. On `subscription_submitted`: re-fetches submissions and triggers a force refresh on `useAdminStatsStore`. On `subscription_status_changed`: optimistically removes the row if viewing the `pending` tab and refreshes list + stats store. Added a 7-second fallback polling interval active only while `pending` submissions exist in state or counts.

- **2026-10-18: SSE Update 1 (Step 6 — Parts 5 & 6: AdminDashboard/Treasury & AdminTransactions Live Sync)**
  - *Context*: The platform overview dashboard, treasury analytics tab, and the unified financial transactions ledger require automatic real-time sync when platform events fire across any of the operational desks, while respecting admin workflows and avoiding disruptive re-renders during active search or historical audits.
  - *Decision*:
    1. `AdminDashboard.tsx`: Wired listeners for all 8 admin events (`broadcast_email_progress`, `broadcast_email_completed`, `withdrawal_created`, `withdrawal_status_changed`, `unverified_inflow_created`, `unverified_inflow_verified`, `subscription_submitted`, `subscription_status_changed`). Firing any of these events invokes `fetchOverviewStats()` with forced cache bypass on `useAdminStatsStore`, and triggers `refreshTreasury()` whenever the admin is on the `treasury` tab. A 7-second fallback polling interval runs only while actionable queue metrics are non-zero (`stats.withdrawalSla.pendingCount > 0`, `stats.unverifiedInflows.count > 0`, or `stats.pendingSubscriptionsCount > 0`).
    2. `AdminTransactions.tsx`: Wired listeners for the 6 financial transaction-impacting events (`withdrawal_created`, `withdrawal_status_changed`, `unverified_inflow_created`, `unverified_inflow_verified`, `subscription_submitted`, `subscription_status_changed`). In order to prevent disruptive UI flickers and preserve active administrative audit workflows, an automatic refresh of `fetchTransactions()` is executed only if the admin is viewing an unfiltered state on page 1 (`!search && sourceFilter === 'all' && !fromDate && !toDate && pagination.page === 1`). Active searches and pagination cursors remain untouched.

