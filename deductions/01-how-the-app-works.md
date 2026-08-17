# How the Application Works — Full Mental Model

> Goal: after reading this, you can answer "what is this app, what does it do
> end to end, and where does every number on screen come from?"

---

## 1. What the product is

**PayMyTax by WallX** is a Nigerian SME tax-compliance platform. It records
sales and expenses, computes monthly tax under the FIRS formula:

```
Gross Profit = Total Sales − Total Expenses
Tax Payable  = Gross Profit × 7.5% (default rate, per-business override possible)
```

then takes the SME from **calculation → finalization → payment (Paystack) →
statement (PDF) → FIRS remittance** (currently a manual admin batch).

It also does **invoicing** (Nigerian-style: draft → sent → paid, with PDF,
email and WhatsApp delivery, VAT line items) and **DVA** (Paystack Dedicated
Virtual Accounts that auto-capture incoming bank transfers as sales).

**Stack:** monorepo — `backend/` (Express 5, TypeScript, Prisma 6, PostgreSQL,
Zod, Winston, node-cron, PDFKit) + `frontend/` (React 19, Vite 8, Tailwind 4,
Zustand, React Router 7, Recharts, react-hot-toast, i18next).

> ⚠️ **Oddity:** `frontend/` is a **git submodule** of the root repo (git shows
> `Subproject commit ... -dirty`). The backend lives in the parent repo.
> This makes committing the frontend easy to get wrong.

---

## 2. Architecture shape (backend)

Strict one-way layering, consistent across every domain:

```
routes/*.ts  →  controllers/*.ts  →  services/*.ts  →  Prisma (Postgres)
                      ↓                        ↑
               validators/*.ts (Zod)     lib/ (logger, audit, prisma, payment…)
```

**Middleware order** (`app.ts`): Helmet → CORS (prod allowlist) →
`express.json` 10MB with `rawBody` capture (for webhook HMAC) →
urlencoded → Morgan request logger → global rate limiter (prod only) →
Swagger UI → `/api` routes → 404 → Sentry handler → global error handler.

**Error contract:** every error is `{ error: { code, message, details?, stack? } }`.
Zod errors map to 400 with field details; Prisma P2002→409, P2025→404,
P2003→400; `MulterError`→friendly upload messages; custom `AppError` for domain
errors. All handlers wrapped in `asyncHandler`.

**Config:** one `src/config/index.ts`, validates `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` at import. `PORT` parsed defensively
(Render quirk). Tax rate, cron enablement, Paystack preferred bank
(`sk_test_*` → `test-bank` else `wema-bank`), etc. all centralized.

**Audit trail:** `logAudit()` on every meaningful mutation — transactional
inside `$transaction`, fire-and-forget elsewhere. PII-minimized where it
matters (phone → last-4).

---

## 3. Data model (the core entities)

```
User (role: user|admin, BVN/NIN, phone) 
  └─ Business (merchantId "PMTWxxxxxxx", defaultProfitMargin, taxReminderDay,
     DVA account fields, Paystack subaccount + settlement fields)
       ├─ SalesTransaction (source: bank_transfer|paycode|pos|online_store|manual|cash|invoice,
       │    status: confirmed|pending|reversed|disputed, isTaxable, classification,
       │    UNIQUE (businessId, source, referenceId))
       ├─ Expense (category, isDeductible)
       ├─ MonthlyTaxReport (UNIQUE businessId+taxMonth, totalSales/Expenses,
       │    grossProfit, taxRate, taxPayable, paymentStatus, isFinalized, isLocked)
       ├─ TaxPayment (→ TaxReport, UNIQUE transactionReference, remittanceStatus)
       ├─ TaxStatement (PDF url, per report)
       ├─ Invoice (draft→sent→paid|overdue|cancelled, lines[], Customer snapshot,
       │    linkedSaleId UNIQUE → the SalesTransaction created on mark-paid)
       ├─ Customer (master data reused by invoices, snapshot at create)
       ├─ Reminder (type, scheduledDate, referenceType/referenceId for dedup)
       ├─ FirsRemittance (admin batch of collected payments → FIRS)
       └─ AuditLog
Global: TransactionClassification (taxTreatment: taxable|non_taxable|review_required),
        PaystackWebhookEvent (forensics + replay dedup), Bank (cached from Paystack)
```

All money is `Decimal(15,2)`; rates `Decimal(5,2)`; dates are `@db.Date` stored
UTC — the codebase is careful about UTC bounds so "January 1" doesn't land on
Dec 31 in Lagos time.

---

## 4. The core money flows

### 4a. Tax lifecycle (the heart of the app)

1. SME records **sales** and **expenses** (CRUD, or bulk Excel/CSV import, or
   DVA auto-capture).
2. **Calculate Tax** (`POST /tax/calculate`): aggregates
   `confirmed + isTaxable` sales and `isDeductible` expenses for the month →
   upserts a `MonthlyTaxReport`. This is the *only* place report numbers are
   written. (⚠️ this is exactly why the dashboard used to freeze — see issues.)
3. **Finalize** (`POST /tax/reports/:id/finalize`): locks the month against
   further edits (`assertMonthNotLocked`). Cannot finalize zero-sales reports.
4. **Pay** (`POST /tax/pay`): creates a pending `TaxPayment`, calls Paystack
   `initialize`, returns `authorizationUrl`. Idempotent on pending payment
   (reuses it; abandons if amount drifted). On `charge.success` webhook (or
   frontend `verify` polling), payment → `completed` and report →
   `completed + isLocked=true` atomically in one transaction.
5. **Statement PDF** per report (PDFKit), downloadable.
6. **FIRS remittance**: admin batches collected payments (manual transport —
   FIRS has no API).

### 4b. Invoicing flow

- Invoice created as `draft`, auto-numbered `INV-YYYY-NNN` per business/year,
  totals computed **server-side** (subtotal → −discount → ×VAT → total).
- `send` (offline confirm) / `send-email` (Resend w/ dev-logger fallback, PDF
  attached) / `send-whatsapp` (wa.me deep link, no server SMS).
- **Mark paid** → auto-creates a `SalesTransaction` (source `cash` for cash
  payments, `invoice` for everything else), linked via `linkedSaleId` (UNIQUE =
  DB safety net). Guards: must be sent/overdue, paymentDate sane, month not
  locked.
- **Cancel** (if unpaid) / **overdue** (flipped by nightly cron).
- `charge.refunded` webhook reverses the linked sale + unlinks the invoice.

### 4c. DVA (auto sales capture)

- `setupVirtualAccount` → Paystack dedicated account (test mode uses
  `test-bank`).
- Transfer webhook (`charge.success` with `dedicated_nuban`) → creates a
  **pending** `SalesTransaction` with `needsVerification` → SME reviews on
  `/sales/unverified` → verifies/classifies → becomes confirmed+taxable.
- BVN validation via Paystack customer identification (async webhook result).

### 4d. Reminders & cron

- Event-driven reminders fire post-transaction: `payment_successful`,
  `dva_received`, `dva_validation_failed`, `invoice_overdue` (on send with
  backdated due date), margin warnings on every tax calc.
- **Nightly cron** (00:30 Africa/Lagos, `node-cron`): `generateRemindersForAllBusinesses`
  (tax_deadline/unfiled_tax/unfinalized_report/unpaid_tax) + `sweepOverdueInvoices`
  (sent + past due → overdue, reminder created first, flip after — self-healing
  on crash). Whole sweep under a Postgres **advisory lock** (multi-instance safe),
  lock released in `finally`.

---

## 5. Frontend architecture

- **Stores (Zustand):** auth (tokens in localStorage), business (multi-business,
  active persisted), invoice (list/detail split + `patchInList`), reminder
  (top-bar bell), dashboard (event counter), language (en/pcm).
- **Axios client:** base `/api/v1` (Vite proxy → :3000 in dev); auto Bearer
  header; response interceptor does refresh-on-401 + single retry, then
  logout+redirect. `axios-retry` replays GET/HEAD on network errors & 502/503/504
  with exponential backoff (Render cold-start + Nigerian 4G hardening). **No
  cross-tab sync** (Zustand is per-tab).
- **Dashboard:** 5 parallel requests (dashboard, sales, expenses, reports,
  reminders) → module-level cache, 30s stale-while-revalidate, plus a
  pub/sub invalidation counter that pages fire after mutations
  (`invalidateDashboard('sale_created')` etc.), debounced 500ms refetch.
- **Route guards:** ProtectedRoute / GuestRoute / AdminRoute. Admin section has
  its own layout + login.
- **i18n:** en + Nigerian Pidgin (`pcm`) locale files exist, but coverage is
  partial — most page strings are hardcoded English.

---

## 6. Deployment & CI

- **Backend:** Render web service (`render.yaml`) — builds with
  `npm ci --include=dev && npm run build`, starts with `npm start`
  (`prisma migrate deploy && node dist/server.js`), health check `/api/health`.
  Env placeholders for DATABASE_URL, Paystack, Resend, Termii, Sentry.
- **Frontend:** Vercel (`vercel.json`) — Vite build, SPA catch-all rewrite.
- **CI** (`.github/workflows/ci.yml`): on push/PR to main/develop — Node 20 +
  Postgres 15 service, install backend deps, `prisma generate`, run migrations,
  validate schema. **No tests, no lint, no frontend build** (see issues #5).

---

## 7. Where every dashboard number comes from (post-fix)

| Card | Source (now) |
|---|---|
| Total Sales / Total Expenses | **Live** `SalesTransaction` (confirmed+taxable) / `Expense` (deductible) aggregates |
| Total Tax Payable | Sum of `MonthlyTaxReport.taxPayable` (tax only exists once calculated) |
| Reports Filed | Count of reports |
| This Month card | **Live** current-month sales/expenses/gross profit, merged with the report's rate/status when one exists; locked months show the stored report untouched |
| Monthly Trends | Last 6 months of report rows |
| Recent Sales / Expenses lists | Live list endpoints (limit 5) |
| Unpaid alert | Count of finalized + pending reports |
