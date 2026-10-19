# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WallXERP by WallX** — SME tax calculation, reporting, and remittance platform for Nigerian businesses. Tax formula: `Tax Payable = 7.5% × Gross Profit` where `Gross Profit = Total Sales − Total Expenses` (the rate is overridable per-deployment via `PlatformTaxConfig`). Monorepo with separate `backend/` and `frontend/` directories.

## Commands

### Backend (`cd backend`)

- **Dev server:** `npm run dev` (tsx watch, port 3000)
- **Build:** `npm run build` (tsc → dist/)
- **Typecheck:** `npm run typecheck` (tsc --noEmit; note `tsconfig` is **not** strict — it passes clean on unsafe null derefs)
- **Start prod:** `npm start` / `npm run start:migrate` / `npm run start:no-migrate`
- **Lint / Format:** `npm run lint`, `npm run format`
- **Tests:** `npm test` (all), `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:emails`, `npm run test:setup`
- **QA audit:** `npm run audit:qa-exposure`
- **DB:** `npm run db:setup` (generate + migrate + seed), `npm run db:backup`, `npm run db:restore`, `npm run db:dr-verify`
- **Prisma:** `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:migrate:deploy`, `npm run prisma:seed`, `npm run prisma:studio`, `npm run prisma:reset` (destructive)

### Frontend (`cd frontend`)

- **Dev server:** `npm run dev` (Vite, port 5173)
- **Build:** `npm run build` (tsc + vite build → dist/)
- **Lint:** `npm run lint`
- **Tests:** `npm test`, `npm run test:watch`
- **Preview:** `npm run preview`

### Running Both

Start backend (`npm run dev` in backend/) and frontend (`npm run dev` in frontend/) in separate terminals. Frontend proxies `/api` requests to `http://localhost:3000` via Vite config.

## Test Data (Seed)

- **Admin:** `admin@paymytax.com` / `Admin@123456`
- **Test User 1:** `john@example.com` / `Password123!`
- **Test User 2:** `jane@example.com` / `Password123!`

Seed also creates businesses, sales, expenses, monthly tax reports, and transaction classifications.

## Architecture

### Backend

- **Runtime:** Node.js + TypeScript, Express 5
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT (access 15m + refresh 7d), bcrypt 12 rounds, separate secrets. PII encrypted at rest (`ENCRYPTION_KEY`), blind-indexed for lookup (`BLIND_INDEX_KEY`). Optional PIN step-up for sensitive reveals.
- **Validation:** Zod schemas in `src/validators/` — type inference via `z.infer<typeof schema>`
- **Logging:** Winston (dev colorized, prod JSON + file rotation at `logs/`); Morgan via `src/middleware/requestLogger.ts`
- **File storage:** DigitalOcean Spaces (receipts, statements) + Cloudinary (images)
- **Payments:** Paystack via `src/lib/payment/` — webhook HMAC-SHA512 verification, webhook-event idempotency table
- **PDF:** PDFKit — 11 generators under `src/services/pdf/`
- **Email:** Resend via `src/lib/email` — 19 templates in `lib/email/templates/`, dispatched from `services/email-dispatch.service.ts`. Falls back to Winston logging when `RESEND_API_KEY` is unset.
- **AI:** Groq (default) or Gemini via `config.ai`; provider config editable in admin
- **Monitoring:** Sentry — `@sentry/node` initialized in `app.ts` when `SENTRY_DSN` is set

**Source layout.** `routes/` → `controllers/` → `services/` → Prisma. `services/` is mid-refactor: flat `<domain>.service.ts` files coexist with newer per-domain directories (`services/tax/`, `services/reminder/`, `services/pdf/`, `services/wallet/`, …). Also present: `modules/` (`wallet`, `store` — the newer modular layer), `core/events/` (domain event bus), `shared/helpers/`, `jobs/` (cron), `lib/` (prisma, logger, audit, crypto, ownership, email, payment, sales-import).

**Middleware stack order (in app.ts):**

1. `trust proxy` (prod only) — must precede the rate limiter so it sees the real client IP
2. Helmet (`crossOriginEmbedderPolicy` disabled for downloads)
3. CORS
4. `express.json()` 10MB + raw-body capture for webhook HMAC
5. `express.urlencoded()` extended, 10MB
6. Request logger (Morgan → Winston)
7. Rate limiting (prod only): global, plus auth / payment / password-reset / verification limiters mounted per-route
8. Swagger UI at `/api-docs` and `/api-docs.json`
9. API routes
10. Static `/test` dashboard (dev only, or `ENABLE_TEST_DASHBOARD=true`)
11. Root service-info endpoint
12. 404 handler → Sentry error handler (if configured) → global error handler

**API route map (routes/index.ts):**

```
/api/health                                     — health check (no auth)
/api/v1/public/*                                — unauthenticated (token exchange, public invoice/statement views)
/api/v1/auth/*                                  — register, login, refresh, me, change-password, forgot/reset-password, verify-email
/api/v1/invitations/*                           — team invitation accept/decline
/api/v1/businesses/*                            — CRUD
/api/v1/businesses/:id/sales/*                  — CRUD + monthly summary + Excel/CSV import
/api/v1/businesses/:id/expenses/*               — CRUD + monthly summary
/api/v1/businesses/:id/tax/*                    — calculate, reports, finalize, analytics, dashboard
/api/v1/businesses/:id/tax/payments/*           — initiate, list, verify
/api/v1/businesses/:id/statements/*             — tax statement PDFs
/api/v1/businesses/:id/reminders/*              — list, generate, mark-sent, dismiss, active
/api/v1/businesses/:id/dva/*                    — virtual account setup/get
/api/v1/businesses/:id/settlement/*             — split payout settlement
/api/v1/businesses/:id/invoices/*               — CRUD + send/email/whatsapp/mark-paid/cancel + PDF
/api/v1/businesses/:id/credits/*                — customer credit notes (buy-now-pay-later)
/api/v1/businesses/:id/receipts/*               — sales/tax receipts
/api/v1/businesses/:id/ledger/*                 — account ledger + statements
/api/v1/businesses/:id/search/*                 — cross-entity search
/api/v1/businesses/:id/ai/*                     — AI assistant
/api/v1/businesses/:id/team/*                   — team members, roles, permissions
/api/v1/banks/*                                 — bank list / name resolution
/api/v1/transaction-classifications/*          — transaction classification rules
/api/v1/wallet/*                                — wallet balance, transactions, withdrawals
/api/v1/admin/*                                 — dashboard, users, businesses, withdrawals, unverified inflows, audit-logs, ai-settings
/api/v1/test/*                                  — dev/test only, not mounted in production
/api/webhooks/*                                 — Paystack webhooks (no auth, signature verified)
```

**Error handling:**

- `AppError` class: `new AppError(statusCode, message, code, details)`
- `asyncHandler` wrapper on route handlers — catches promise rejections
- Zod errors auto-mapped to field-level validation details
- Prisma errors mapped: P2002→DUPLICATE_ENTRY(409), P2025→NOT_FOUND(404), P2003→FOREIGN_KEY_CONSTRAINT(400)

**Response format:**

```json
// Success
{ "success": true, "data": {...}, "message": "..." }
// Paginated
{ "success": true, "data": [...], "pagination": { "page", "limit", "total", "totalPages", "hasNext", "hasPrev" } }
// Error
{ "error": { "code": "ERROR_CODE", "message": "...", "details": {...}, "stack": "..." } }
```

**Key patterns:**

- **Ownership verification:** `verifyBusinessOwnership()` / `verifyBusinessAccess()` in `src/lib/ownership.ts` (cached; invalidate on change). Team members use the access variant, which enforces `BusinessRole` permissions.
- **Transaction support:** services accept an optional `tx?: TxClient`; `const db = tx ?? prisma`
- **Audit logging:** `logAudit()` in `src/lib/audit.ts` — fire-and-forget or transactional
- **Prisma singleton:** `globalThis.prismaGlobal` in dev to survive hot reload
- **Month locking:** `assertMonthNotLocked()` / `isMonthLockedOrFinalized()` in `src/shared/helpers/month-lock.ts`
- **UTC `@db.Date` columns** must be constructed and queried in UTC — see the memory note on this bug class before touching date columns
- **CPU/network work outside transactions:** bcrypt hashing and outbound email/Resend calls happen before `prisma.$transaction()` or after it, never inside — never hold DB locks across CPU or network work
- **Domain events:** `src/core/events/` — listeners registered in `server.ts` via `registerDomainEventListeners()`

**Payment flow:** report must be finalized with non-zero tax → `initiatePayment` creates a `TaxPayment` and calls Paystack Initialize → Paystack `charge.success` webhook (or manual `verifyPayment`) flips `paymentStatus='completed' + isLocked=true` atomically and emits a `payment_successful` reminder → a `FirsRemittance` batch tracks collected/remitting/remitted state.

**DVA flow:** `setupVirtualAccount` creates a Paystack customer and requests a dedicated account → assignment webhook stores the account on the business → transfer webhook auto-creates a confirmed `SalesTransaction` (`source: bank_transfer`) and a `dva_received` reminder.

**Settlement & wallet:** split payouts route each collection into a merchant share, a tax split (`SETTLEMENT_MIN_TAX_SPLIT_PCT`–`MAX`), and a platform fee. A nightly auto-sweep clears merchant balances to verified bank accounts. Wallet models (`WalletBalance`, `WalletTransaction`, `SettlementPayout`, `PlatformFeeConfig`) are the newer non-custodial layer — treat `modules/wallet` and `services/wallet/` as the live implementation and the flat `wallet.service.ts` as legacy where they overlap.

**Customer credits:** `CustomerCredit` (buy-now-pay-later) recognizes revenue at issuance via a linked `SalesTransaction`; supports partial payments, overdue sweeps, and reminders.

**Invoicing:** `createInvoice` → `draft` + auto-generated `INV-{YYYY}-{NNN}` (per-business per-year sequence, DB-unique). Totals are computed server-side (`subtotal = Σ qty × unitPrice`; `taxable = subtotal − discount`; `vatAmount = taxable × vatRate`; `total = taxable + vatAmount`). Only `draft` is editable/deletable; lines are replaced atomically inside the transaction. `sendInvoice` is the offline-confirm path; `sendInvoiceByEmail` attaches the rendered PDF; `sendInvoiceByWhatsApp` returns a `wa.me` deep link for the frontend to open (the SME sends from their own account — no server-side WhatsApp). `markInvoicePaid` requires `sent`/`overdue`, validates the payment date, asserts the target month is unlocked, and creates the linked `SalesTransaction` (the DB unique constraint is the double-booking backstop). `cancelInvoice` refuses once paid. PDF download works in any status. Every mutation is transactional with an audit row (`invoice.*`).

**Sales import:** `GET /sales/import/template` streams a generated `.xlsx` built from `SALES_IMPORT_SOURCES`. `POST /sales/import/preview` parses xlsx/csv (2MB cap), normalizes messy dates and amounts, classifies rows as `valid | invalid | duplicate_in_file | duplicate_in_db | locked`, and caches them under a TTL `fileToken`. `POST /sales/import/commit` re-checks month locks and `createMany({ skipDuplicates: true })` inside a transaction. **Known limit:** the `fileToken` cache is per-process in-memory — must move to Redis before multi-instance deploys.

**Expense intelligence alerts** (returned with tax calculation): `no_expenses` when there are sales but no expenses; `margin_deviation` when `|actualMargin − Business.defaultProfitMargin| > 15` points. Each also refreshes a `margin_warning` reminder via `createReminderOnce({ updateMessageOnDup: true })`.

**Reminders (as built).** 19 types across `services/reminder/`: `tax_deadline`, `unfiled_tax`, `unfinalized_report`, `unpaid_tax`, `margin_warning`, `invoice_overdue`, `payment_successful`, `payment_refunded`, `dva_received`, `dva_validation_failed`, `transaction_needs_verification`, `payout_change_permitted`, `payout_requested`, `payout_approved`, `payout_rejected`, `payout_completed`, `payout_failed`, `credit_overdue`, `pnl_statement_ready`. `createReminderOnce()` owns dedup, keyed by `(businessId, type, referenceType, referenceId)` when a reference is supplied, else `(businessId, type, scheduledDate)`. Creators split between event-driven (fired post-transaction) and the daily sweep. `getActiveReminders()` is pure-read — no side effects.

**Scheduled jobs (`src/jobs/`, node-cron).** All registered from `server.ts` inside the `listen` callback, wrapped in try/catch so a registration failure can't crash the API. Gated by `config.cron.enabled` (`ENABLE_CRON=true`, auto-on in production) — off in dev so `tsx watch` doesn't re-register on every save.

| Job | Schedule | Purpose |
|---|---|---|
| `reminders.cron.ts` | `30 0 * * *` Africa/Lagos | Tax-state reminders, overdue invoice + credit sweeps, month-end-concluded notices, safety-net auto-finalization |
| `wallet-reconciliation.cron.ts` | — | Reconciles wallet balances |
| `payout-reconciliation.cron.ts` | — | Reconciles settlement payouts against Paystack |
| `wallet-auto-sweep.cron.ts` | `AUTO_SWEEP_SCHEDULE` (02:00) | Nightly balance clearing to verified banks |

Multi-instance safety uses a Postgres transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) per job, so the lock releases on commit/rollback and won't leak across a connection pooler.

**Config:** centralized in `src/config/index.ts`, validated on import.

- Required always: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- Required in production: `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`
- Important optional: `PAYSTACK_SECRET_KEY` / `PUBLIC_KEY` / `WEBHOOK_SECRET`, `FRONTEND_URL`, `RESEND_API_KEY`, `TERMII_API_KEY`, `SENTRY_DSN`, `GROQ_API_KEY`, `AUTO_SWEEP_ENABLED`, `SETTLEMENT_*`, `REDIS_URL`

**Payment provider abstraction:** `src/lib/payment/` — `PaymentProvider` interface with a Paystack implementation, selected by `getPaymentProvider()` from `config.payment.provider`. Paystack amounts convert naira↔kobo (×100).

### Frontend

- **Framework:** React 19 + TypeScript, Vite, Tailwind CSS 4
- **Fonts:** Montserrat (headings), Inter (body)
- **State:** Zustand, localStorage-persisted for tokens and active business
- **Routing:** React Router v7, every page `React.lazy`-loaded behind a `Suspense` + `PageLoader`
- **HTTP:** Axios with interceptors (Bearer injection, refresh-and-retry on 401)
- **Icons:** Lucide React · **Toasts:** react-hot-toast · **Alias:** `@/` → `src/`

**Stores (`src/stores/`):**

- `auth` — user/session; owns `logout()`, which wipes every domain store + `activeBusinessId` so the next user inherits nothing
- `business` — businesses, active business (persisted)
- `invoice` — split list/detail state; lifecycle actions patch the list cache in place
- `reminder` — the top-bar bell's active list (fetch / markRead / dismiss / clear, all optimistic with revert-on-failure)
- `dashboard`, `ledger`, `credit`, `settlement`, `team`, `pin`, `language`, `admin.stats`

**Route guards:** `ProtectedRoute` (auth), `GuestRoute` (redirect authenticated users), `AdminRoute` (auth + admin role).

**Layouts:** `AuthLayout`, `AppLayout` (sidebar + top bar), `AdminLayout`.

**Top bar:** mobile menu trigger, page title, `NotificationBell`, `UserMenu` (identity, profile/settings, admin panel, logout). User identity and logout live here, not in the sidebar.

**Sidebar (`Sidebar.tsx`):** business selector, quick actions, and nav grouped by intent (Operate / Money / Account).

**`NotificationBell.tsx`:** unread badge (caps at "9+") + dropdown + inline detail modal. Fetches `GET /businesses/:id/reminders/active` on mount, business change, and dropdown open (60s cooldown) — **no polling**. Opening a reminder auto-fires mark-sent once, optimistically. `ROUTE_FOR_REMINDER` deep-links each reminder type to its destination (`/invoices/:id`, `/payments`, `/sales`, `/account`, …); the modal button label tracks it. Closes on outside-click and Escape, returning focus to the trigger.

**UI primitives (`src/components/ui/`):** `Button`, `Input`, `Card`, `Modal`, `PhoneInput`, `Skeleton`, `EmptyState`, `ErrorState`, `PageLoader`, `OptimizedImage` / `ResponsiveImage` / `OptimizedLogo`. There *is* a shared `Modal` — use it for new modals rather than re-inlining one.

**Routes (App.tsx):**

- Public/guest: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/verify-email-pending`, `/invite`, `/admin/login`, `*`→NotFound
- App: `/dashboard`, `/sales` (unverified tab via `?tab=unverified`), `/expenses`, `/invoices` (+ `/new`, `/:id`, `/:id/edit`), `/debtors` (+ `/:id`), `/ai`, `/tax` (tab shell: reports / analytics / payments), `/payments/callback`, `/transactions`, `/account`, `/settings`
- Admin: `/admin`, `/users` (+ `/:userId`), `/businesses`, `/withdrawals`, `/settlement/withdrawals`, `/unverified-inflows`, `/audit-logs`, `/ai-settings`

Note: `Reminders.tsx` and `Payments.tsx` still exist as files but are **not routed** — `/reminders` redirects to `/dashboard` (the bell owns it) and `/payments` redirects to `/tax?tab=payments`. Treat both files as dead unless you deliberately re-wire them.

**Invoicing pages:** `Invoices.tsx` (debounced search, filters, client-side `effectiveStatus` that shows `overdue` before the sweep flips the column, desktop table + mobile card list), `InvoiceForm.tsx` (serves both new and edit; shows a "not editable" card for non-draft), `InvoiceDetail.tsx` (status-gated actions via `canEdit`/`canSend`/`canMarkPaid`/`canCancel`/`canDelete`). Client-side totals mirror the backend formula for instant feedback; the server remains the source of truth.

**Admin pages:** Login, Dashboard, Users, UserDetail, Businesses, **Withdrawals**, **UnverifiedInflows**, AuditLogs, **AISettings**.

**Formatting:** `formatNaira` / date helpers in `src/lib/format.ts` (plus fee helpers in `lib/fees.ts`).

### Database Schema (Prisma)

**Models:** `User`, `Business`, `BusinessMember`, `Invitation`, `SalesTransaction`, `SaleLineItem`, `Expense`, `TransactionClassification`, `MonthlyTaxReport`, `TaxPayment`, `FirsRemittance`, `TaxStatement`, `Invoice`, `InvoiceLine`, `Customer`, `CustomerCredit`, `CreditPayment`, `CreditLineItem`, `Reminder`, `AuditLog`, `PaystackWebhookEvent`, `Bank`, `Session`, `SettlementPayout`, `WalletBalance`, `WalletTransaction`, `PlatformFeeConfig`, `PlatformTaxConfig`, `AiProviderConfig`.

**Enums:** `UserRole`, `BusinessRole`, `InvitationStatus`, `PaymentMethod`, `PaymentStatus`, `RemittanceStatus`, `SalesSource`, `TransactionStatus`, `ExpenseCategory`, `InvoiceStatus`, `InvoicePaymentMethod`, `TransactionCategory`, `TaxTreatment`, `CreditStatus`, `WalletTxType`.

All tables map to snake_case via `@@map`. Money uses `@db.Decimal(15,2)`; rates/percentages `@db.Decimal(5,2)`.

### Domain Context

- Nigerian tax system; tax authority NRS (FIRS remittance tracked via `FirsRemittance`, currently `transport: manual`)
- Currency NGN (₦); VAT default 7.5%
- WallXERP is non-custodial software, not a deposit-taking institution — regulatory disclosure strings live in `config.regulatory`
- DVA = Dedicated Virtual Account (Paystack) — auto-captures bank transfers as sales
- Tax reports are monthly: calculated → finalized (locks editing) → paid (`isLocked`, permanent)
- Per-business `taxReminderDay` (default 25) and `defaultProfitMargin` (default 20)
- Passwords: 8+ chars, uppercase + lowercase + number

### Project Status

- **Foundation:** ✅ Bootstrap, schema, infra · ✅ Auth + business CRUD · ✅ Admin panel + role-based authz · ✅ Sales/expenses with Excel-CSV import + period locking
- **Tax engine:** ✅ 7.5% formula, monthly reports, finalize/unfinalize, dashboard, analytics, statements
- **Money in:** ✅ Paystack payments (initiate/webhook/verify), ✅ DVA auto-capture, ✅ Invoicing (email/WhatsApp/PDF/paid→auto-sale), ✅ customer credits
- **Money out:** ✅ Wallet + settlement split payouts + nightly auto-sweep + reconciliation crons
- **Platform:** ✅ Team roles/invitations, ✅ AI assistant, ✅ full email dispatch (19 templates), ✅ in-app reminder bell + daily reminder cron, ✅ Sentry
- **Not shipped:** ❌ Termii SMS (config slot only, no client), ❌ production deploy + custom domain, ❌ mobile responsiveness pass

### Known Limitations (technical, not blockers)

- No refresh token revocation/blacklisting (Redis configured but unused)
- Background jobs are in-process node-cron — fine for single-instance, needs a real runner (BullMQ/Redis) to scale out
- Sales import preview cache is per-process in-memory (15-min TTL)
- No "Token blacklist for logout"
- Offset-based pagination only
- File-based logs (`logs/`) won't scale in containers; no Docker/containerization
- `services/` layout is mid-refactor — flat files and per-domain directories coexist
- PDFs have no QR verification or tamper-evident watermark
- `tsconfig` is not strict — `npm run typecheck` passes on unsafe null derefs; verify nullability with `--strictNullChecks` scoped to your files