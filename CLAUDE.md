# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PayMyTax by WallX** — SME tax calculation, reporting, and remittance platform for Nigerian businesses (FIRS compliance). Tax formula: `Tax Payable = 7.5% × Gross Profit` where `Gross Profit = Total Sales − Total Expenses`. Solo developer project targeting Q2 2026 launch. Monorepo with separate `backend/` and `frontend/` directories.

## Commands

### Backend (`cd backend`)
- **Dev server:** `npm run dev` (tsx watch, port 3000)
- **Build:** `npm run build` (tsc → dist/)
- **Start prod:** `npm start` (runs dist/server.js)
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Tests (e2e):** `npm run test:e2e` (Jest, runs from `tests/`, matches `*.e2e.test.ts`, runs in band with 30s timeout)
- **DB full setup:** `npm run db:setup` (generate + migrate + seed)
- **Prisma generate:** `npm run prisma:generate`
- **Prisma migrate:** `npm run prisma:migrate`
- **Prisma migrate deploy (prod):** `npm run prisma:migrate:deploy`
- **Prisma seed:** `npm run prisma:seed`
- **Prisma studio:** `npm run prisma:studio`
- **Prisma reset:** `npm run prisma:reset` (destructive — resets and re-seeds)

### Frontend (`cd frontend`)
- **Dev server:** `npm run dev` (Vite, port 5173)
- **Build:** `npm run build` (tsc + vite build → dist/)
- **Lint:** `npm run lint`
- **Preview:** `npm run preview`

### Running Both
Start backend (`npm run dev` in backend/) and frontend (`npm run dev` in frontend/) in separate terminals. Frontend proxies `/api` requests to `http://localhost:3000` via Vite config.

## Test Data (Seed)
- **Admin:** `admin@paymytax.com` / `Admin@123456`
- **Test User 1:** `john@example.com` / `Password123!`
- **Test User 2:** `jane@example.com`
- Seed creates businesses, sales (₦700K total), expenses (₦360K total), and a March 2026 tax report.

## Architecture

### Backend
- **Runtime:** Node.js + TypeScript, Express 5
- **Database:** PostgreSQL (Neon/Supabase) via Prisma ORM
- **Auth:** JWT (access token 15m + refresh token 7d), bcrypt 12 rounds, separate secrets for access/refresh
- **Validation:** Zod schemas in `src/validators/` — type inference via `z.infer<typeof schema>`
- **Logging:** Winston (dev: colorized, prod: JSON + file rotation at `logs/`)
- **File storage:** AWS S3 / DigitalOcean Spaces (receipts, PDF statements)
- **Payments:** Paystack integration with webhook HMAC-SHA512 verification
- **PDF generation:** PDFKit (tax statements — monthly and period ranges)

**Layered structure:** Routes → Controllers → Services → Prisma. Each domain (auth, business, sales, expense, tax, payment, statement, reminder, admin, dva) follows this pattern with matching files across `routes/`, `controllers/`, `services/`, and `validators/`.

**Middleware stack order (in app.ts):**
1. Helmet (secure headers, crossOriginEmbedderPolicy disabled for downloads)
2. CORS (localhost:5173 + 3000 in dev, config.cors.frontendUrl in prod, credentials enabled)
3. `express.json()` with 10MB limit + raw body capture (for webhook HMAC verification)
4. `express.urlencoded()` extended, 10MB limit
5. Morgan request logger (dev format in dev, combined in prod, piped to Winston)
6. Rate limiting (prod only): global 100/15min, auth 5/15min, payment 5/hour
7. Swagger UI at `/api-docs` and `/api-docs.json`
8. API routes
9. 404 handler + global error handler

**API route structure:**
```
/api/health                              — health check (no auth)
/api/v1/auth/*                           — register, login, refresh, me, change-password, forgot/reset-password
/api/v1/businesses/*                     — CRUD (authenticated)
/api/v1/businesses/:businessId/sales/*   — sales CRUD + monthly summary + Excel/CSV import
/api/v1/businesses/:businessId/expenses/*— expenses CRUD + monthly summary
/api/v1/businesses/:businessId/tax/*     — calculate, reports, finalize, dashboard
/api/v1/businesses/:businessId/tax/pay   — initiate payment
/api/v1/businesses/:businessId/tax/payments/* — list/get/verify payments
/api/v1/businesses/:businessId/reminders/*— list, mark-sent, dismiss
/api/v1/businesses/:businessId/dva/*     — setup/get virtual account
/api/v1/businesses/:businessId/statements/*— download monthly/period PDF
/api/v1/businesses/:businessId/invoices/* — CRUD + send/send-email/send-whatsapp/mark-paid/cancel + PDF download
/api/v1/admin/*                          — dashboard, users, businesses, audit-logs (admin role)
/api/webhooks/paystack                   — webhook (no auth, signature verified)
```

**Error handling:**
- `AppError` class: `new AppError(statusCode, message, code, details)`
- `asyncHandler` wrapper on all route handlers — catches promise rejections
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
- **Ownership verification:** Every service checks `business.userId === userId` before operating
- **Transaction support:** Services accept optional `tx?: TxClient` parameter for atomic operations; `const db = tx ?? prisma`
- **Audit logging:** `logAudit()` helper — fire-and-forget (no tx) or transactional (with tx); captures userId, businessId, action, old/new data, IP, user agent
- **Prisma singleton:** Stored in `globalThis.prismaGlobal` in dev to survive hot reload
- **Month locking:** Sales/expenses check `assertMonthNotLocked()` — prevents edits to finalized/paid months
- **Decimal handling:** `toNumber()` converts Prisma Decimal to JS number
- **Bcrypt outside transactions:** Password hashing done before `prisma.$transaction()` to avoid holding DB locks during CPU work

**Payment flow:**
1. Report must be finalized with non-zero tax
2. `initiatePayment` → creates TaxPayment record + calls Paystack Initialize → returns authorizationUrl
3. User completes payment on Paystack → webhook `charge.success` → updates payment + report status
4. Frontend can also call `verifyPayment` to poll Paystack Verify API

**DVA (Dedicated Virtual Account) flow:**
1. `setupVirtualAccount` → creates Paystack customer → requests dedicated account
2. On assignment webhook → stores account number/bank on business
3. On DVA transfer webhook → auto-creates SalesTransaction (source: bank_transfer, status: confirmed)

**Invoicing flow:**
1. `createInvoice` → status=`draft`, auto-generates invoice number `INV-{YYYY}-{NNN}` (per-business, per-year sequence; zero-padded 3 digits; DB unique constraint `(businessId, invoiceNumber)` is the safety net for concurrent creates)
2. Totals computed server-side: `subtotal = Σ(qty × unitPrice)`, `taxable = subtotal − discount`, `vatAmount = taxable × vatRate%`, `total = taxable + vatAmount`. VAT is shown separately per FIRS standard (VAT-exclusive)
3. `updateInvoice` / `deleteInvoice` — only allowed while status=`draft`. Line items are replaced atomically when `lines` is in the patch (deleteMany + createMany inside the same transaction)
4. `sendInvoice` → status=`sent`, sets `sentAt`. Refuses if not draft (caller must know whether they meant "send again" vs "confirm sent"). This is the "offline confirm" path — use it when the SME sent the invoice another way (printed, delivered in person). For electronic delivery, use `sendInvoiceByEmail` or `sendInvoiceByWhatsApp` (below)
4a. `sendInvoiceByEmail` → requires `customerEmail` (400 `INVOICE_NO_EMAIL` if missing). Generates PDF via `buildInvoicePdf`, attaches it, sends via `src/lib/email` (Resend if `RESEND_API_KEY` set, Winston dev-log fallback otherwise — response `meta.delivered` tells the caller which path was taken). Flips status draft→sent + sets `sentAt` on first call; idempotent re-send while sent/overdue (status unchanged). Refuses paid/cancelled. Audit: `invoice.emailed`. Route: `POST /:id/send-email`
4b. `sendInvoiceByWhatsApp` → requires `customerPhone` (400 `INVOICE_NO_PHONE` if missing). Normalizes phone to E.164 digits (handles `0803...` Nigerian local → `234803...`, strips separators, accepts `+234...` as-is). Does NOT send server-side — builds a `wa.me/<phone>?text=<encoded msg>` deep link and returns it in `meta.waUrl` + `meta.message`. The frontend opens that URL; WhatsApp launches with the message pre-filled from the SME's own account. Flips status draft→sent. Refuses paid/cancelled. Audit: `invoice.whatsapped`. Route: `POST /:id/send-whatsapp`
5. `markInvoicePaid` → status=`paid`, sets `paidAt`, auto-creates `SalesTransaction` (source=`manual`, status=`confirmed`, amount=invoice.total gross/VAT-inclusive, referenceId=invoiceNumber, transactionDate=paymentDate, description mentions invoice + customer, metadata carries invoiceId/subtotal/vatAmount/discount). Sale is linked back via `invoice.linkedSaleId` (unique → second mark-paid fails). Guards: must be sent/overdue (draft refused → must send first); paymentDate cannot precede issueDate; target month must not be finalized or locked (`assertMonthNotLocked` — revenue lands in that month). `unique_sales_reference` on `(businessId, source, referenceId)` is the DB-level safety net against double-booking
6. `cancelInvoice` → status=`cancelled`. Refuses if already paid (paid = booked revenue; would need a refund workflow, out of scope)
7. `generateInvoicePdf` → renders A4 PDF via PDFKit (`invoice.pdf.ts`): two-column header (business left / INVOICE label + number + status pill right), divider, bill-to + dates block, line-items table with zebra striping, right-aligned totals (subtotal, discount if > 0, VAT with rate, total), notes + payment terms, FIRS/VAT footer. Allowed in any status (draft preview, cancelled record-keeping); status pill in the PDF makes state visible. Returns `{ buffer, filename: "{invoiceNumber}.pdf" }`; controller sets Content-Type/Content-Disposition/Content-Length
8. All mutations use `prisma.$transaction` + transactional `logAudit` (actions: `invoice.created`, `invoice.updated`, `invoice.deleted`, `invoice.sent`, `invoice.emailed`, `invoice.whatsapped`, `invoice.paid`, `invoice.cancelled`, `invoice.pdf_downloaded`). Email send builds the PDF + calls Resend outside the transaction (network/CPU work must not hold DB locks), then opens a short tx only for the status flip + audit write — same pattern as the bcrypt-outside-tx rule

**Invoice schema:** `Invoice` (one-to-many `InvoiceLine`, optional FK to `Customer`, unique optional FK to `SalesTransaction` via `linkedSaleId`). Customer info is snapshotted on the invoice (customerName/Email/Phone/Address/TaxId) so edits/deletes to a saved Customer record don't mutate historical invoices. Indexes: `(businessId, issueDate desc)`, `(businessId, status)`, `customerId`, `dueDate`. `InvoiceStatus` enum: draft/sent/paid/overdue/cancelled. Migration: `20260417120000_add_invoices_and_customers`.

**Sales import flow (Excel / CSV bulk upload):**
1. `GET /sales/import/template` → streams a dynamically-built `.xlsx` (ExcelJS) with a "Sales" sheet (6 headers + 3 grey-italic example rows + source-dropdown data validation on rows 2–101) and an "Instructions" sheet. Template is generated per-request from `SALES_IMPORT_SOURCES` so the source enum is the single source of truth — no static file to drift
2. `POST /sales/import/preview` (multipart, multer memory storage, 2 MB cap, .xlsx/.csv only) → parses via `parseSalesImportBuffer` (exceljs for xlsx, minimal RFC4180 parser for csv), fuzzy-matches headers (`Amount (NGN)` → `amount`, `Txn Date` → `transaction_date` — see `HEADER_ALIASES`), classifies each row into one of 5 statuses (`valid | invalid | duplicate_in_file | duplicate_in_db | locked`), caches the importable parsed rows under a UUID `fileToken` (in-memory `Map`, 15-min TTL, lazy sweep on every get/set, scoped by userId+businessId), and returns `{ fileToken, summary, rows }`. Dup-in-db is only flagged when `referenceId` is present (the `unique_sales_reference` DB constraint on `(businessId, source, referenceId)` matches this — identical cash sales with no refId are legit, not dupes). Row cap: 100; oversized file rejected with `IMPORT_ROW_CAP_EXCEEDED`; missing required columns rejected with `IMPORT_MISSING_COLUMNS` listing each missing column by name
3. `POST /sales/import/commit` → re-checks month-locks (a report could have been finalized between preview and commit), `createMany({ skipDuplicates: true })` inside a `$transaction` with transactional `logAudit('sales.imported', { filename, counts })`. `skipDuplicates` + the DB unique constraint are the final safety net against concurrent uploads racing
4. Normalizers handle real-world mess: dates accept Excel serials (float days since 1899-12-30), ISO `YYYY-MM-DD`, and `DD/MM/YYYY`; amounts strip `₦`/`NGN`/commas/spaces, reject shorthand (`150k`, `1.5m`) with a clear error pointing at the fix; source is case/whitespace/punctuation insensitive with aliases (`Bank Transfer` → `bank_transfer`, `Cash` → `manual`, `Online` → `online_store`)
5. Empty rows in the middle of the file are silently skipped (users paste data and leave blanks). Header order does not matter — mapping is by name, not index
6. Known limitation: the `fileToken` cache is per-process in-memory. Acceptable for v1 single-instance; must move to Redis when we go multi-instance — otherwise a preview on API1 → commit on API2 returns `IMPORT_TOKEN_EXPIRED`
7. Frontend: `SalesImportModal.tsx` is a 3-step modal (Upload → Preview → Result). Upload step has a drop-zone + prominent "Download template" button. Preview step shows 5 status chips, a scrollable row table with per-row error details, and gates the primary button on `summary.valid > 0`. Result step shows imported count + skipped breakdown. Sales page also shows a DVA auto-capture banner (emerald "on" variant when `dva.status === 'active'`, primary CTA variant otherwise pointing at `/account` + the import modal) — the goal is to nudge SMEs off manual entry onto either auto-capture or bulk import
8. Files: `backend/src/lib/sales-import/{template,parser,validator,cache}.ts`, `backend/src/services/sales-import.service.ts`, `backend/src/controllers/sales-import.controller.ts`, routes wired in `sales.routes.ts` with multer. Frontend: `frontend/src/pages/SalesImportModal.tsx`, edits to `Sales.tsx`, types in `types/index.ts`

**Expense intelligence alerts** (returned with tax calculation, see `tax.service.ts:127-145`):
- `no_expenses` — fired when `totalExpenses === 0 && totalSales > 0`. Nudges the user to log expenses for accurate tax.
- `margin_deviation` — fired when `|actualMargin − expectedMargin| > 15` percentage points. `expectedMargin` reads from `Business.defaultProfitMargin` (default 20%). Catches both anomalously-low margins (likely missing sales or over-stated expenses) and anomalously-high margins (likely missing expenses).

Each warning that fires also creates/refreshes a `margin_warning` reminder row via `createMarginWarning` → `createReminderOnce({ updateMessageOnDup: true })`, so recalculating the same month doesn't spawn duplicates — it just updates the existing row's message with the latest numbers.

**Reminder types:** tax_deadline, unfiled_tax, unfinalized_report, unpaid_tax, margin_warning. Generated per business based on `taxReminderDay` field.

**Reminder generation today (truth, not aspiration):**
- `margin_warning` — auto-fires on every tax calculation (`tax.service.ts:136,142`, `createMarginWarning` in `reminder.service.ts`).
- `tax_deadline` — only created as a side effect of `GET /reminders/active` (`reminder.service.ts:440` calls `checkDeadlineReminder`), and only when today ≥ business `taxReminderDay`. If the user never opens the bell, nothing fires.
- `unfiled_tax` / `unfinalized_report` / `unpaid_tax` — only fire when the user clicks "Generate Reminders" on `/reminders` (manual, not automatic).
- `generateRemindersForAllBusinesses()` exists at `reminder.service.ts:212` but is wired to **zero callers** — no cron, no HTTP endpoint. Dead code until a scheduler is added.

**Tax Analytics (`/tax?tab=analytics`):**
1. Backend single-call endpoint: `GET /api/v1/businesses/:businessId/tax/analytics?range=6m|12m|24m|all|custom&from=YYYY-MM&to=YYYY-MM`. Returns `{ window, kpis: { totalTaxPaid, totalTaxOwed, reportsFiled, averageMonthlyTax, deltas }, series[], statusDistribution, yoy }`. `range=all` resolves to `[earliestReport, currentMonth]` capped at 60 months; custom mode validates ≤60 months or returns 400 `RANGE_TOO_WIDE`. Series is gap-filled (zero-rows for months with no report, `reportId: null`). KPI `isLocked` is the source of truth for "paid" — matches the atomic `paymentStatus='completed' + isLocked=true` flip in `payment.service.ts:177,230`. YoY is non-null only when window spans ≥2 calendar years AND both have ≥1 report. Files: `tax.validator.ts:26` (`taxAnalyticsQuerySchema`), `tax.service.ts:406` (`getTaxAnalytics`), `tax.controller.ts:99`, `tax.routes.ts:15`. Smoke test: `tests/e2e/api.e2e.test.ts:636`.
2. Frontend tab shell: `TaxReports.tsx` is a URL-backed tabbed shell (`?tab=analytics`); the existing card list is extracted into `TaxReportsList`. Highlight-on-scroll: `?highlight=<reportId>` scrolls the card into view + flashes `ring-2 ring-primary-400` for 2s — used for chart-bar drill-through.
3. Analytics page (`TaxAnalytics.tsx`): lazy-loaded via `React.lazy(() => import('./TaxAnalytics.tsx'))` so Recharts (~150kB gz) doesn't ship until the tab is opened. Range selector pill group → KPI strip (4 cards, always renders even with zeros) → ComposedChart (stacked bars: sales/expenses/tax + line: profitMargin) → two-column row (Payment Status donut + YoY table) → Cumulative tax paid AreaChart. Donut + Cumulative are guarded: hidden when there are zero reports / zero paid. Bar click → `navigate('?tab=reports&highlight=' + reportId)`.
4. Recharts version: `^3.8.1` (verified to support React 19 without `--legacy-peer-deps`).

**In-app notification bell (top bar):**
1. `frontend/src/components/layout/NotificationBell.tsx` replaces the dead bell button at `AppLayout.tsx:54`. Owns: bell button + unread badge + dropdown panel + inline `ReminderDetailModal` (mirrors the Modal helper in `InvoiceDetail.tsx:539` — no shared Modal primitive yet).
2. Data source: `GET /businesses/:id/reminders/active` (returns up to 10 unsent reminders, opportunistically auto-creates a deadline reminder via `checkDeadlineReminder`). Fetched on mount, on active-business change, and on dropdown open with a 60s cooldown. **No polling.**
3. Click a reminder → modal opens → auto-fires `PATCH /:id/mark-sent` once (guarded by `firedRef` + idempotent server). Optimistic flip: badge decrements immediately; on PATCH failure, store reverts the row and toasts. Modal actions: **Go to Tax Reports** (deep-link via `ROUTE_FOR_REMINDER` map — all five existing types currently route to `/tax`), **Dismiss** (DELETE → optimistic remove + reinsert at original index on failure), **Close**.
4. State: `frontend/src/stores/reminder.store.ts` (`useReminderStore`). Split-state pattern from `invoice.store.ts`: `activeReminders[]`, `loading`, `error`, `lastFetchedBusinessId`, `lastFetchedAt`. Actions `fetchActive`, `markRead` (optimistic + revert on failure, no-ops if already read), `dismiss` (optimistic remove + splice back on failure), `clear` (called from `auth.store.ts` logout). Selector `selectUnreadCount = activeReminders.filter(r => !r.isSent).length`.
5. Outside-click + Escape close the dropdown; focus returns to the bell button. Badge caps at "9+".
6. The existing `/reminders` page (paginated list with Generate / Mark-as-read / Dismiss buttons) is unchanged — the bell does not replace it. Only the inline `Reminder` interface was extracted to `frontend/src/types/index.ts` as `Reminder` + `ReminderType` exports.

**Reminder Generation Coverage — partially shipped (see `latestClaudePlan.md`).**

Already on `main`:
- Three new reminder types live: `invoice_overdue`, `payment_successful`, `dva_received` (`reminder.service.ts:36`).
- `Reminder.referenceType` + `Reminder.referenceId` columns + `(businessId, referenceType, referenceId)` index (migration `20260422103000_add_reminder_reference`, `schema.prisma:399-408`).
- `createReminderOnce()` helper owns dedup — keyed by `(businessId, type, referenceType, referenceId)` when a ref is supplied, else `(businessId, type, scheduledDate)` (`reminder.service.ts:109`). Has `updateMessageOnDup` for `margin_warning` to refresh numbers without spawning rows.
- Event-driven creators fire post-transaction (never inside the tx — same rule as bcrypt/email):
  - `payment_successful` — `payment.service.ts:30` after Paystack webhook + manual verify both flip `paymentStatus='completed' + isLocked=true`.
  - `dva_received` — `dva.service.ts:316` after the auto-captured `SalesTransaction` is created.
  - `invoice_overdue` (Trigger 1, on send with backdated `dueDate`) — `invoice.service.ts:37`.
- Frontend: `routeFor(reminder)` in `NotificationBell.tsx` deep-links each type to its target (`/invoices/:id`, `/payments`, `/sales`); modal button label tracks the destination.
- `getActiveReminders` is now pure-read — the side-effect `checkDeadlineReminder` call was removed (`reminder.service.ts:474`).

**NOT YET IMPLEMENTED — Daily sweep cron (the missing scheduler).** The pieces above only fire on real events. Three flows still need the scheduler:
- Invoices that **become** overdue overnight (Trigger 2 — no real-world event fires for "time passed").
- `tax_deadline / unfiled_tax / unfinalized_report / unpaid_tax` — `generateRemindersForAllBusinesses()` exists at `reminder.service.ts:271` but is wired to **zero callers**. Until cron calls it, these reminders only fire when the user clicks the manual "Generate Reminders" button on `/reminders`.
- DB-level `Invoice.status='overdue'` — `InvoiceStatus.overdue` is already a valid enum member (`schema.prisma:74-80`); UI computes `effectiveStatus` client-side, but server-side `?status=overdue` filters return nothing until a job flips the column.

**Implementation plan — daily reminder cron:**

1. **Dependency.** `cd backend && npm install node-cron && npm install -D @types/node-cron`. (Removes the only missing piece — everything else uses libs already installed.)

2. **New file: `backend/src/jobs/reminders.cron.ts`.** Two exports:
   - `registerReminderCron()` — called from `server.ts` after `app.listen` succeeds. No-ops unless `config.cron.enabled` (see §4).
   - `runDailySweep()` — exported so a future test or one-off `tsx` script can call it directly without waiting for the cron tick.
   - Schedule: `cron.schedule('30 0 * * *', runDailySweep, { timezone: 'Africa/Lagos' })`. node-cron honors the `timezone` option even on UTC hosts (Render default).

3. **Sweep body** — wrap the whole thing in a Postgres advisory lock so a future multi-instance deploy does not double-run. `LOCK_KEY = 947362` (arbitrary 32-bit int; document it in a comment so nobody collides):
   ```ts
   const [{ locked }] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
     SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked
   `;
   if (!locked) { logger.info('Reminder cron sweep: lock held, skipping'); return; }
   try { ... } finally {
     await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
   }
   ```
   Lock release MUST be in `finally` — Postgres will release on session close if the Node process crashes mid-sweep, but a clean unlock prevents the next minute's run from being skipped if cron is set tight in dev.

   Inside the lock, two phases:
   - **Phase 1 — tax-state reminders:** `await generateRemindersForAllBusinesses()`. Already idempotent via `createReminderOnce`.
   - **Phase 2 — overdue invoices** (`sweepOverdueInvoices()`):
     ```ts
     const today = new Date(); today.setHours(0, 0, 0, 0);
     const invoices = await prisma.invoice.findMany({
       where: { status: 'sent', dueDate: { lt: today } },
       select: { id, businessId, invoiceNumber, customerName, total, dueDate },
     });
     ```
     For each invoice, run reminder-create **then** status-flip as two sequential awaits (not a transaction). Order matters: the sweep query filters `status='sent'`, so creating the reminder first means a mid-row crash leaves the row as `sent` — tomorrow's sweep re-finds it, `createReminderOnce` dedupes the existing reminder (no-op), and the flip retries. The system self-heals on the next run. Flipping first would break this — the next sweep would skip the row and the user would never get notified. Per-invoice `try/catch` with `logger.warn` so one bad row never aborts the sweep. `createReminderOnce({ reminderType: 'invoice_overdue', referenceType: 'invoice', referenceId: invoice.id, ... })` deduplicates by `(businessId, type, 'invoice', invoiceId)` so a re-run of the sweep creates zero new reminders. The status flip from `sent → overdue` is also idempotent (the next-day query filters on `status='sent'` so already-flipped invoices aren't re-processed).

4. **Config.** Add to `backend/src/config/index.ts`:
   ```ts
   cron: {
     enabled: process.env.ENABLE_CRON === 'true' || process.env.NODE_ENV === 'production',
   },
   ```
   In dev, `ENABLE_CRON` defaults false — `tsx watch` would otherwise re-register the schedule on every file save and spam logs. Prod auto-enables. Document `ENABLE_CRON=true` in `.env.example` (optional vars block).

5. **`server.ts` registration.** Inside the `app.listen(...)` callback, after the startup banner. Wrap the `registerReminderCron()` call in `try/catch` with `logger.error` — a cron registration failure must NOT crash the API. Tests are unaffected because `tests/e2e/api.e2e.test.ts:3` imports `createApp` directly from `app.ts` (cron lives in `server.ts`, never bound during tests).

6. **Logging.** Structured Winston entries: `Reminder cron sweep: start`, `Reminder cron sweep: done` with counts `{ businessesProcessed, deadlinesCreated, taxRemindersCreated, invoiceRemindersCreated, invoicesFlippedToOverdue }`, `Reminder cron sweep: failed` on top-level error.

7. **Formatters.** Use `formatNaira` and `formatDateISO` from `@/lib/format.ts` — backend-only formatters already exist. Do not import frontend helpers.

**Risks / non-issues:**
- Timezone drift on UTC host — handled by `{ timezone: 'Africa/Lagos' }`.
- Long sweep blocking event loop — current data volumes (solo dev, beta-stage) keep the sweep sub-second. If volumes grow, swap the per-invoice `for` loop for chunked `Promise.all`. Not a v1 concern.
- Backfill — existing `sent` invoices with past `dueDate` are picked up by the first post-deploy sweep. No separate backfill job needed.
- Lock starvation if a previous run hung — Postgres advisory locks release on session close, so a Node crash auto-releases.

**Out of scope (explicitly):** dev-only manual-trigger endpoint (verification path is `ENABLE_CRON=true` + temporary tight schedule); BullMQ/Redis-backed runner (advisory lock is sufficient for v1); per-invoice snooze; recurring overdue reminders every N days; email/SMS delivery (Phase 5).

**Config:** Centralized in `src/config/index.ts`. Validates required env vars on import:
- Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Important optional: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `FRONTEND_URL`, `RESEND_API_KEY`, `TERMII_API_KEY`

**Payment provider abstraction:** `src/lib/payment/` — `PaymentProvider` interface with `PaystackProvider` implementation. Factory function `getPaymentProvider()` allows swapping providers via `config.payment.provider`. Paystack amounts convert naira↔kobo (×100).

### Frontend
- **Framework:** React 19 + TypeScript, Vite 8
- **Styling:** Tailwind CSS 4 with custom theme (primary=blue, success=green, warning=amber, danger=red)
- **Fonts:** Montserrat (headings), Inter (body)
- **State:** Zustand stores with localStorage persistence for tokens and active business
- **Routing:** React Router v7 with nested route guards
- **HTTP:** Axios with interceptors (auto-inject Bearer token, auto-refresh on 401)
- **Icons:** Lucide React
- **Notifications:** react-hot-toast (top-right, 3s duration)
- **Path alias:** `@/` → `src/` (in tsconfig and vite.config.ts)

**Stores:**
- `auth.store.ts` — user, isAuthenticated, isLoading; login/register/logout/fetchMe/setLoading. Tokens in localStorage (`accessToken`, `refreshToken`). `logout` calls `useReminderStore.getState().clear()` before nulling user, so the next user doesn't see the prior user's bell state.
- `business.store.ts` — businesses[], activeBusiness, isLoading; fetchBusinesses/setActiveBusiness/createBusiness. Active business ID persisted in localStorage.
- `invoice.store.ts` — split list/detail state: `invoices[]`+`pagination`+`listLoading`+`listError` for the list page, `activeInvoice`+`detailLoading`+`detailError` for the detail page. Actions: fetchInvoices/fetchInvoice/create/update/delete/send/markPaid/cancel/downloadPdf/clearActive. Lifecycle actions patch the list cache in place (`patchInList`) so a status transition on the detail page is reflected when navigating back without a refetch. `downloadInvoicePdf` uses `responseType: 'blob'` + anchor+click pattern, revokes the object URL after 1s.
- `reminder.store.ts` — scoped to the top-bar bell's active list (does NOT replace `Reminders.tsx` page state, which still owns its own paginated/filterable local state). Fields: `activeReminders[]`, `loading`, `error`, `lastFetchedBusinessId`, `lastFetchedAt`. Actions: `fetchActive` / `markRead` (optimistic + revert on failure) / `dismiss` (optimistic remove + reinsert on failure) / `clear`. Selector: `selectUnreadCount`.

**Axios client (`src/lib/axios.ts`):**
- Base URL: `/api/v1` (proxied to backend via Vite)
- Request interceptor: attaches Bearer token
- Response interceptor: on 401, attempts refresh via POST `/auth/refresh`, retries original request once, redirects to `/login` on failure

**Route guards:**
- `ProtectedRoute` — requires authentication, redirects to /login
- `GuestRoute` — redirects authenticated users (admin→/admin, user→/dashboard)
- `AdminRoute` — requires authentication + admin role, shows spinner during fetchMe, redirects non-admin to /dashboard

**Layouts:**
- `AuthLayout` — centered card for login/register with PayMyTax branding
- `AppLayout` — sidebar + main content; shows CreateBusinessModal if user has 0 businesses
- `AdminLayout` — admin sidebar + main content (max-width 7xl)

**Sidebar (`Sidebar.tsx`):** Business selector dropdown (switch/create), quick-action shortcuts (Record sale / Calculate tax), nav items grouped by intent (Operate / Money / Account) with active route highlighting, admin link for admin users. **No user/email block or logout button at the bottom — those moved to the top-bar `UserMenu` (see below).**

**Top bar (`AppLayout.tsx`):** Mobile menu trigger (left), page title, search affordance, `NotificationBell`, and `UserMenu` (right). The user identity + profile shortcut + logout all live here now — the sidebar is purely navigation.

**UserMenu (`components/layout/UserMenu.tsx`):** Top-right circular avatar button (Lucide `User` icon, `bg-primary-50` ring), opens a dropdown panel with: identity block (display name from `email.split('@')[0]`, full email), View profile / Settings (both deep-link to `/settings`), Admin panel (admin-only), and Log out (red, calls `useAuthStore.logout()` → `navigate('/login')`). Closes on outside-click + Escape; focus returns to the trigger on close. Mirrors `NotificationBell` interaction patterns (refs + `pointerdown` listener + `aria-expanded`/`aria-haspopup="menu"`/`role="menu"`/`role="menuitem"`).

**Why the user block moved to the top bar:** The sidebar's bottom-fixed user/logout tile was a dead zone on mobile (sat below the fold inside the drawer), competed with primary nav for visual weight, and forced two clicks to reach Settings. The top-right avatar is the platform convention (Stripe, Linear, Notion) — it scales to mobile (always visible without opening the drawer), keeps the sidebar focused on navigation only, and gives users a single click to profile/settings/logout. Logout still triggers the full domain-store cache wipe via `auth.store.logout()` (clears reminder/business/invoice stores) before redirect.

**UI components (`components/ui/`):**
- `Button` — variants: primary, secondary, danger, ghost; sizes: sm, md, lg; isLoading prop with spinner
- `Input` — forwardRef, label, error message display
- `Card` — rounded-xl wrapper with shadow

**Page components:** Dashboard (stat cards, trends, recent activity), Sales (CRUD + filter by source), Expenses (CRUD + filter by category), Invoices (list + filter + PDF download), InvoiceForm (create/edit with line-item editor + live totals), InvoiceDetail (status badge, lifecycle actions, linked sale, pay/cancel modals), TaxReports (calculate, finalize, pay), Payments (list + verify), Reminders (generate, mark sent, dismiss), Settings (profile + business edit + change password), Landing (public homepage), NotFound (404).

**Invoicing pages:**
- `Invoices.tsx` — list at `/invoices`. Debounced search (300ms, resets to page 1), status/date filters with active-filter count badge, status pill (incl. client-side `effectiveStatus` that shows `overdue` when `status=sent` and `dueDate < now` — the backend leaves rows as `sent` until a background job flips them, so this bridges the visual gap). Row click → detail; inline PDF download button. Responsive: desktop table, mobile card list (card is a `<button>` for accessibility + keyboard nav). Empty states differ for "no invoices yet" vs "no results for your filters".
- `InvoiceForm.tsx` — one component serves both `/invoices/new` and `/invoices/:id/edit` (routed by `useParams().id`). When editing, prefetches the invoice; if status ≠ `draft`, renders a "not editable" card with a back link (avoids filling a form just to hit a 409). Line-item editor with add/remove rows (can't remove the last row), live totals via `useMemo` mirroring the backend `computeTotals` exactly (subtotal → −discount → ×VAT → total, `Math.round(n*100)/100` rounding). Client-side validation before submit: required customer name, due ≥ issue, qty > 0, price ≥ 0, VAT 0–100, discount ≥ 0. Save goes to detail page on success.
- `InvoiceDetail.tsx` — at `/invoices/:id`. Status-gated action buttons (derived via `canEdit`/`canSend`/`canMarkPaid`/`canCancel`/`canDelete`) — only the valid transitions for the current status are rendered, so a paid invoice simply doesn't show Cancel. Mark-paid and Cancel use inline modals (lightweight — no standalone Modal component in the design system yet; inlined as a local `<Modal>` helper at the bottom of the file). Mark-paid form restricts paymentDate to `[issueDate, today]`. Shows a "Linked sale" callout when `linkedSaleId` is set, with a link to the Sales page. `useEffect` cleanup calls `clearActive()` on unmount to avoid flashing stale data on next navigation.

**Invoicing UX decisions:**
- Totals computed client-side AND server-side. Client-side for instant feedback; server is the source of truth (payload sends line inputs, not totals, and totals come back from the API). This matches the backend contract and avoids drift.
- Draft is the only editable/deletable status. Sent/overdue use Cancel (preserves audit trail). Paid can only be downloaded — reversing revenue needs a refund workflow we haven't built.
- PDF download works in any status — useful to preview a draft before sending, or to keep a record of a cancelled invoice. The PDF has a status pill so the state is visible in the downloaded file.
- Sidebar item placed between Expenses and Tax Reports (revenue → expenses → invoices → tax is the natural SME workflow).
- **Customer contact fields are optional but matter for delivery.** `customerEmail` and `customerPhone` are both `String?` on the Invoice (snapshotted at create time). The form accepts either/both — but at least one is required for electronic send. The detail page renders "Send via Email" and "Send via WhatsApp" buttons side-by-side; each is disabled (with an explanatory tooltip) when its corresponding field is missing. A third "Mark as sent" ghost button remains for offline-delivery confirmations. Once sent, both delivery buttons relabel to "Resend via …" so collections follow-up is a single click.
- **WhatsApp via wa.me, not Meta Cloud API.** The SME sends from their own WhatsApp account — zero infra, no business verification, and it matches how Nigerian SMEs already communicate with customers. The backend only composes the message and builds the `wa.me` URL; the frontend `window.open()`s it. True server-side WhatsApp delivery (Meta Cloud API or Termii WhatsApp channel) was considered but rejected as heavy for a solo-dev stage.
- **Email via Resend with dev-logger fallback.** `src/lib/email` abstracts the sender. When `RESEND_API_KEY` is unset, payloads are logged via Winston and the API returns `meta.delivered=false` so the frontend can show "logged server-side only" instead of a bogus success toast. This lets the full flow work in dev without a Resend account.

**Admin pages:** AdminLogin (dark theme, role-verified), AdminDashboard (stats + recent signups), AdminUsers (search, pagination, status toggle), AdminUserDetail (profile + businesses), AdminBusinesses (read-only list), AdminAuditLogs (filterable, color-coded action badges).

**Formatting helpers (inline in pages):** `formatNaira()` for ₦ currency, `formatDate()`/`formatMonth()` for date display, status badge functions with color coding.

### Database Schema (Prisma)
Key models: `User` (roles: user/admin) → `Business` (multi-business per user, merchantId format: `PMTW` + 7 digits) → `SalesTransaction`, `Expense`, `MonthlyTaxReport` (unique on businessId+taxMonth), `TaxPayment` (unique transactionReference), `TaxStatement` (unique taxReportId), `Reminder`, `AuditLog`. All tables use snake_case mapping via `@@map`. Decimal fields use `@db.Decimal(15,2)` for money, `@db.Decimal(5,2)` for rates/percentages.

**Enums:** UserRole (user/admin), PaymentMethod (wallet/bank_transfer/card/paycode/ussd), PaymentStatus (pending/processing/completed/failed/refunded), SalesSource (bank_transfer/paycode/pos/online_store/manual), TransactionStatus (confirmed/pending/reversed/disputed), ExpenseCategory (rent/inventory/salary/utility/fuel/logistics/marketing/other).

### Domain Context
- Nigerian tax system — default VAT rate 7.5%, tax authority is FIRS
- Currency: NGN (Nigerian Naira, symbol ₦)
- DVA = Dedicated Virtual Account (Paystack feature — auto-captures bank transfers as sales)
- Tax reports are monthly, can be finalized (locks editing) → paid (locks permanently via isLocked)
- Merchant ID format: `PMTW` prefix + sequential digits
- Tax reminder day is configurable per business (1-28, default 25th of month)
- Password requirements: 8+ chars, uppercase + lowercase + number
- FIRS payment flow not yet confirmed (direct API vs collection account) — currently using generic Paystack flow

### Project Status & Phases
- **Phase 0:** ✅ Bootstrap, DB schema, infra
- **Phase 1:** ✅ Auth (register/login/refresh/forgot-password), business CRUD, admin panel, role-based authz
- **Phase 2:** ✅ Sales (CRUD + monthly summary + Excel/CSV bulk import), expenses (CRUD + category breakdown), period locking
- **Phase 3:** ✅ Tax engine (7.5% formula), monthly reports, finalize/unfinalize, dashboard, tax analytics, in-app reminders
- **Phase 4:** ✅ Paystack payment (initiate/webhook/verify), PDF tax statements (PDFKit), receipts/statements module
- **Phase 5:** 🟡 Partially shipped — daily reminder cron live, in-app bell live, Resend email abstraction wired (with dev-logger fallback). **Still missing: Termii SMS, welcome/payment-confirmation/tax-reminder email templates wired up, Sentry, production deploy, soft launch.**
- **Phase 6:** ✅ DVA auto-capture, ✅ Invoicing (CRUD + send via email/WhatsApp + PDF + paid → auto-create sale), ✅ daily reminder cron (overdue invoice sweep + tax-state reminders + advisory lock)

### Frontend coverage
- ✅ Auth pages (Login/Register), protected/admin route guards, AppLayout/AdminLayout
- ✅ Sidebar with quick actions + sectioned nav (Operate / Money / Account); top-bar `NotificationBell` + `UserMenu`
- ✅ Pages: Dashboard, Sales, Expenses, Invoices (list + detail + form), TaxReports + TaxAnalytics, Payments, Reminders, Account (DVA), Settings, Landing, NotFound
- ✅ Admin pages: Login, Dashboard, Users, UserDetail, Businesses, AuditLogs
- ✅ ErrorBoundary, Skeleton component, Dashboard.skeleton, toast notifications
- ✅ Sales import modal (3-step), CreateBusinessModal, NoBusinessPrompt
- ✅ Logout-state hygiene: auth.store.logout() clears business/invoice/reminder stores + activeBusinessId in localStorage; axios refresh-fail funnels through logout()

### What's NOT YET SHIPPED (Phase 5 remainder + ship-blockers)

**Notifications (email/SMS delivery):**
- Welcome email on registration — not wired (Resend abstraction exists, template not written)
- Password reset email — currently logs to Winston as `PASSWORD RESET EMAIL (dummy)` at `auth.service.ts:239`; Resend not connected
- Payment confirmation email — not wired
- Monthly tax statement email (with PDF attached) — not wired
- Tax reminder email — not wired (in-app bell only)
- **All Termii SMS** — config exists, no client, no integration. Tax-reminder SMS + payment-confirmation SMS are unbuilt.

**Production readiness:**
- Sentry — config slot exists (`SENTRY_DSN`), no SDK installed, no init call
- No production deployment yet (Render/Vercel) — both apps still local-only
- No custom domain / SSL setup
- No production env values for Paystack live keys, Resend, Termii
- No uptime monitor / health-check ping (Render free tier cold-starts in 2–5s — flagged in plan)

**FIRS:**
- FIRS payment integration path **still unconfirmed** (direct API vs collection account). Currently routes via generic Paystack subaccount. The plan calls this a Week-1 escalation; status today is unknown.

**E2E coverage (Phase 5 polish):**
- `tests/e2e/api.e2e.test.ts` exists with smoke tests; full register → business → sales → expenses → calculate → pay → PDF journey not exercised end-to-end
- No mobile responsiveness pass (sidebar drawer works; individual pages not audited at 375px)

### Known Limitations (technical, not blockers)
- No refresh token revocation/blacklisting (Redis configured but unused)
- No real background job runner (BullMQ/Redis); node-cron in-process is sufficient for v1 single-instance
- Offset-based pagination only
- Sales import preview cache is in-process `Map` (15-min TTL). Must move to Redis before multi-instance scale-out
- File-based logs (`logs/`) won't scale in containers
- No Docker / containerization
- PDF tax statements: no QR-code verification or SHA-256 watermark (planned in Phase 4 spec but not built — current PDF is functional but not tamper-evident)
- No "Token blacklist for logout" (Phase 1 carryover)
