# PayMyTax by WallX — Phase-by-Phase Execution Plan

**Context:** 1 solo fullstack developer, strict Q2 2026 (June 30) deadline
**Start Date:** March 24, 2026
**Weeks Available:** ~14 weeks
**Existing:** Some WallX APIs exist (Paystack integration), PayMyTax backend is new
**Blocker:** FIRS payment flow NOT confirmed yet (direct API vs collection account)

---

## CRITICAL NOTE: FIRS Payment Flow

> The FIRS integration path (direct API vs collection account) is **NOT confirmed**.
> This plan designs around that uncertainty by:
> - Building payment to a **generic Paystack subaccount** in Phase 1
> - Swapping the settlement destination when FIRS confirms (Phase 2/3)
> - The payment UI and backend remain the same regardless of which option is chosen

**ACTION ITEM (Week 1):** Escalate to WallX leadership — get FIRS partnership confirmation by end of Phase 1 at the latest.

---

## Phase 0 — Project Bootstrap & DevOps (Week 1: March 24–30) ✅ COMPLETE

**Goal:** Both repos initialized, database connected, CI working, dev environment fully functional. Zero features — just plumbing.

### What was delivered:
- [x] Backend scaffold (Express + TypeScript + Prisma)
- [x] Full database schema (9 tables) migrated to Neon PostgreSQL
- [x] Folder structure: controllers, services, routes, middleware, lib, validators, config
- [x] Winston logger, global error handler, security middleware (Helmet, CORS, rate limiting)
- [x] Health check endpoint working
- [x] Seed script with test data
- [x] `.env.example` with all config options

### Not done (deferred or N/A):
- [ ] Frontend scaffold — not started yet
- [ ] Render / Vercel deployment — not set up yet
- [ ] DigitalOcean Spaces — configured in env but not tested
- [ ] GitHub branch protection — not confirmed

---

## Phase 1 — Authentication & Business Setup (Weeks 2–3: March 31 – April 13) ✅ COMPLETE

**Goal:** Users can register, login, create a business profile. Foundation for everything else.

### What was delivered:

**Backend (all complete):**
- [x] Auth system: register, login, refresh token, get me, change password, forgot password, reset password
- [x] Business CRUD: create, list (paginated), get by ID, update, delete
- [x] JWT auth with separate access/refresh secrets
- [x] `authenticate` middleware + `authorize(...roles)` middleware
- [x] Role-based authorization (admin/user enum, UserRole in Prisma)
- [x] Admin panel: dashboard stats, user management, business listing, audit logs
- [x] Auth rate limiting (5 attempts / 15 min)
- [x] Zod validation on all endpoints
- [x] Ownership enforcement on business operations
- [x] Audit logging (`logAudit()` helper, 11 events tracked across auth/business/admin)
- [x] Transaction patterns (`TxClient` type, `$transaction()` on all multi-step mutations)
- [x] Consistent bcrypt rounds (12 everywhere)
- [x] Admin seed user (admin@paymytax.com)

**Frontend (not started):**
- [ ] Login / Register pages
- [ ] Auth store (Zustand)
- [ ] Protected route component
- [ ] Dashboard layout (sidebar + header)
- [ ] Business creation form
- [ ] Business selector

**Infrastructure (not done):**
- [ ] Upstash Redis connection
- [ ] Token blacklist for logout

### API Endpoints Delivered:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Register new user |
| POST | `/api/v1/auth/login` | No | Login |
| POST | `/api/v1/auth/refresh` | No | Refresh access token |
| GET | `/api/v1/auth/me` | JWT | Get current user |
| PUT | `/api/v1/auth/change-password` | JWT | Change password |
| POST | `/api/v1/auth/forgot-password` | No | Request password reset |
| POST | `/api/v1/auth/reset-password` | No | Reset password with token |
| POST | `/api/v1/businesses` | JWT | Create business |
| GET | `/api/v1/businesses` | JWT | List user's businesses |
| GET | `/api/v1/businesses/:id` | JWT | Get business detail |
| PUT | `/api/v1/businesses/:id` | JWT | Update business |
| DELETE | `/api/v1/businesses/:id` | JWT | Delete business |
| GET | `/api/v1/admin/dashboard` | Admin | Dashboard stats |
| GET | `/api/v1/admin/users` | Admin | List all users |
| GET | `/api/v1/admin/users/:id` | Admin | User detail |
| PATCH | `/api/v1/admin/users/:id/status` | Admin | Toggle user active |
| GET | `/api/v1/admin/businesses` | Admin | All businesses |
| GET | `/api/v1/admin/audit-logs` | Admin | Audit trail |

---

## Phase 2 — Sales & Expenses Modules (Weeks 4–5: April 14 – April 27) ⬅️ NEXT

**Goal:** Users can record sales and expenses. This is the data entry layer that feeds into tax calculation.

### Week 4 — Sales Module (Backend + Frontend if applicable)

1. **Sales backend**
   - `SalesService` — CRUD, monthly summary, bulk import
   - `SalesController` + routes
   - Zod validators for sales creation/update
   - Query filters: by month, by source, date range, pagination
   - Sales summary endpoint (total for a given month)
   - Period lock check — refuse edits if month is locked
   - Deduplication index enforcement (already in schema: `unique_sales_reference`)
   - Transaction + audit logging on all mutations

   **Endpoints to build:**
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/v1/businesses/:businessId/sales` | Create sale |
   | GET | `/api/v1/businesses/:businessId/sales` | List sales (filtered, paginated) |
   | GET | `/api/v1/businesses/:businessId/sales/:id` | Get sale detail |
   | PUT | `/api/v1/businesses/:businessId/sales/:id` | Update sale |
   | DELETE | `/api/v1/businesses/:businessId/sales/:id` | Delete sale |
   | GET | `/api/v1/businesses/:businessId/sales/summary` | Monthly sales summary |

### Week 5 — Expenses Module (Backend + Frontend if applicable)

2. **Expenses backend**
   - `ExpenseService` — CRUD, monthly summary, by-category breakdown
   - `ExpenseController` + routes
   - Zod validators
   - Query filters: by month, by category, pagination
   - Category breakdown endpoint
   - Period lock check
   - Receipt URL field (manual URL for now, upload later)
   - Transaction + audit logging on all mutations

   **Endpoints to build:**
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/v1/businesses/:businessId/expenses` | Create expense |
   | GET | `/api/v1/businesses/:businessId/expenses` | List expenses (filtered, paginated) |
   | GET | `/api/v1/businesses/:businessId/expenses/:id` | Get expense detail |
   | PUT | `/api/v1/businesses/:businessId/expenses/:id` | Update expense |
   | DELETE | `/api/v1/businesses/:businessId/expenses/:id` | Delete expense |
   | GET | `/api/v1/businesses/:businessId/expenses/summary` | Monthly summary + category breakdown |

3. **Expense Intelligence Alert** (from wallxplan MVP scope)
   - Shipped as two warning types returned in the `warnings[]` array of
     `POST /tax/calculate` (see `tax.service.ts` margin-warnings block and
     `CLAUDE.md` "Expense intelligence alerts"):
     - `no_expenses` — sales > 0 but expenses = 0 for the month
     - `margin_deviation` — actual profit margin deviates from
       `Business.defaultProfitMargin` (default 20%) by more than 15 pts
   - Each warning that fires also writes/refreshes a `margin_warning`
     reminder row via `createMarginWarning` so the bell surfaces it
   - The original `< 5% of sales` heuristic from the MVP scope was replaced
     by `margin_deviation` during Phase 3 — same goal, uses the per-business
     expected-margin baseline so businesses with non-standard cost structures
     stop seeing false positives

### Deliverables:
- [ ] Full sales CRUD with filtering and pagination
- [ ] Full expenses CRUD with category breakdown
- [ ] Period lock enforcement on both modules
- [ ] Expense intelligence warning
- [ ] Audit logs for all sales/expense mutations
- [ ] Both modules use transaction patterns

### Exit Criteria: User can record multiple sales and expenses for a month, see summaries, and get warned if expenses are suspiciously low.

---

## Phase 3 — Tax Calculation & Reports (Weeks 6–7: April 28 – May 11)

**Goal:** The core value proposition — automatic tax calculation, monthly reports, and period finalization.

### Week 6 — Tax Engine Backend

1. **Tax calculation engine**
   - `TaxService`:
     ```
     total_sales = SUM(confirmed sales for month)
     total_expenses = SUM(expenses for month)
     gross_profit = total_sales - total_expenses
     tax_payable = gross_profit > 0 ? gross_profit * 0.075 : 0
     profit_margin = (gross_profit / total_sales) * 100
     ```
   - Create/update `monthly_tax_reports` record
   - Finalize endpoint — sets `is_finalized = true`, prevents further sales/expense edits
   - Un-finalize endpoint — only if NOT locked (not paid)
   - Dashboard data endpoint — current month summary + trends (last 6 months)

2. **Analytics endpoints**
   - Monthly trends (last 6-12 months of sales, expenses, tax)
   - Profit margin tracking over time
   - Expense breakdown by category for current month

   **Endpoints to build:**
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/v1/businesses/:businessId/tax/calculate` | Calculate/recalculate month |
   | GET | `/api/v1/businesses/:businessId/tax/reports` | List all monthly reports |
   | GET | `/api/v1/businesses/:businessId/tax/reports/:id` | Get report detail |
   | POST | `/api/v1/businesses/:businessId/tax/reports/:id/finalize` | Finalize month |
   | POST | `/api/v1/businesses/:businessId/tax/reports/:id/unfinalize` | Undo finalize |
   | GET | `/api/v1/businesses/:businessId/tax/dashboard` | Dashboard summary + trends |

### Week 7 — Tax Reminders (Basic)

3. **In-app reminders**
   - Business settings: "Reminder Day" (default: 25th of month, already in schema)
   - Backend: Create reminder records when approaching tax deadline
   - Profit margin met alert — include in dashboard response
   - (Email/SMS reminders deferred to Phase 5)

### Deliverables:
- [ ] Tax calculation working correctly (7.5% formula)
- [ ] Monthly tax reports list with status (open/finalized/paid)
- [ ] Period finalization/locking flow
- [ ] Dashboard summary endpoint with trends
- [ ] Profit margin alert
- [ ] In-app reminder records

### Exit Criteria: User sees accurate tax calculation, can finalize a month, and period-locked months refuse edits.

---

## Phase 4 — Payment Integration & PDF Generation (Weeks 8–9: May 12 – May 25)

**Goal:** Users can pay their tax via Paystack and download PDF tax statements.

### Week 8 — Paystack Payment Integration

1. **Paystack integration (backend)**
   - `PaymentService`:
     - Initialize payment (create Paystack transaction)
     - Verify payment
     - Handle webhooks
   - `PaymentController` + routes
   - Webhook security:
     - Verify Paystack signature FIRST
     - Idempotent processing (check if already processed)
     - Return 200 immediately, process async
     - Log ALL webhook events to audit_logs
   - On successful payment:
     - Update `tax_payments` record
     - Update `monthly_tax_reports.payment_status = 'completed'`
     - Set `is_locked = true`, `locked_at = NOW()`
   - All wrapped in `$transaction()` for atomicity

   **Endpoints to build:**
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/v1/businesses/:businessId/tax/pay` | Initiate payment |
   | GET | `/api/v1/businesses/:businessId/tax/payments` | List payments |
   | GET | `/api/v1/businesses/:businessId/tax/payments/:id/verify` | Verify payment |
   | POST | `/api/v1/webhooks/paystack` | Paystack webhook handler |

### Week 9 — PDF Tax Statement Generation

2. **PDF generation (backend)**
   - `PdfService` using PDFKit (already installed):
     - Business information header
     - Sales summary section
     - Expense summary section
     - Profit calculation section
     - Tax computation section
     - Payment status section
     - QR code with verification URL
     - SHA-256 hash footer watermark
     - "Electronically generated" disclaimer
   - Upload PDF to DigitalOcean Spaces
   - Generate signed download URL (expires in 24h)

   **Endpoints to build:**
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/v1/businesses/:businessId/tax/statements/generate` | Generate PDF |
   | GET | `/api/v1/businesses/:businessId/tax/statements/:id/download` | Download PDF |
   | GET | `/api/v1/businesses/:businessId/tax/statements` | List statements |

3. **Business-scoped rate limiting**
   - Tax calculations: max 10/hour per business
   - PDF generation: max 20/day per business
   - Payment initiation: max 5/hour per business (rate limiter already exists)

### Deliverables:
- [ ] Full Paystack payment flow (initiate -> pay -> webhook -> verify)
- [ ] Tax report locked after payment
- [ ] PDF statement generation with all sections from wallxplan spec
- [ ] PDF upload to DO Spaces with signed URLs
- [ ] Payment history
- [ ] Rate limiting per business

### Exit Criteria: User can pay tax via Paystack, see payment confirmed, and download a professional PDF tax statement.

---

## Phase 5 — Notifications, Polish & MVP Launch (Weeks 10–12: May 26 – June 15)

**Goal:** Add email/SMS notifications, polish UI, fix bugs, prepare for launch.

### Week 10 — Notifications & Reminders

1. **Email notifications (Resend)**
   - Welcome email on registration
   - Tax reminder email (sent on configured reminder day)
   - Payment confirmation email
   - Monthly tax statement email (attach PDF or link)

2. **SMS notifications (Termii)**
   - Tax reminder SMS
   - Payment confirmation SMS

3. **Reminder cron job**
   - Scheduled job: check businesses whose reminder_day matches today
   - Generate reminders, send email + SMS
   - Mark reminders as sent

### Week 11 — Testing, Bug Fixes & UI Polish

4. **End-to-end testing**
   - Full user journey: register -> business -> sales -> expenses -> calculate -> pay -> PDF
   - Edge cases: zero sales, zero expenses, negative profit, very large numbers
   - Mobile responsiveness testing

5. **UI polish**
   - Loading skeletons on all pages
   - Empty states
   - Error boundaries
   - Toast notifications
   - Accessible forms

6. **Security hardening**
   - Review all input validation
   - Test rate limiting
   - Verify audit log coverage
   - Review CORS settings for production
   - Ensure no sensitive data in error responses

### Week 12 — Pre-Launch & Soft Launch

7. **Production deployment checklist**
   - Swap all test API keys for production (Paystack live keys, etc.)
   - Set up custom domain
   - SSL verification
   - Set up Sentry for error monitoring
   - Database backup strategy (Neon automated backups)

8. **Soft launch**
   - Deploy to production
   - Test with 5-10 real businesses (internal or beta users)
   - Collect feedback, fix critical bugs

### Deliverables:
- [ ] Email + SMS notifications working
- [ ] Tax reminder system automated
- [ ] All major bugs fixed
- [ ] Mobile responsive
- [ ] Production deployed on custom domain
- [ ] Sentry monitoring active
- [ ] Soft launch with beta users

### Exit Criteria: 5-10 real users have completed the full tax calculation and payment flow without blockers.

---

## Phase 6 — Post-MVP / Phase 2 Features (Weeks 13–14: June 16 – June 30)

**Goal:** Buffer for bug fixes from soft launch + start on high-priority Phase 2 items if time permits.

### Week 13 — Bug Fixes & Critical Feedback

1. Fix all bugs reported during soft launch
2. Performance optimizations if needed
3. User documentation / help section

### Week 14 — Stretch Goals (only if Phase 5 is clean)

4. **Paystack Virtual Accounts** (auto-capture sales)
   - Set up Dedicated Virtual Accounts via Paystack
   - Webhook to auto-record incoming transfers as sales
   - Dashboard shows "Auto" vs "Manual" sales

5. **Simple Invoicing** (if time allows)
   - Basic invoice creation form
   - PDF invoice generation
   - Email invoice to customer

---

## DEFERRED to Post-Launch (Q3 2026)

| Feature | Reason Deferred | Phase |
|---------|----------------|-------|
| FIRS Direct API Integration | Blocked — partnership not confirmed | Post-launch |
| WallX Storefront Integration | Depends on WallX storefront API readiness | Post-launch |
| Advanced Analytics | Nice-to-have, not MVP | Post-launch |
| Bulk Sales Import (CSV) | Nice-to-have, manual entry sufficient for MVP | Post-launch |
| DigitalOcean Migration | Only needed at scale (1000+ users) | Post-launch |
| Refresh Token Rotation | Security improvement, not launch-blocking | Post-launch |
| Receipt Upload for Expenses | File upload complexity, URL field sufficient for MVP | Post-launch |

---

## Weekly Milestone Summary

| Week | Phase | Milestone | Status |
|------|-------|-----------|--------|
| 1 | Phase 0 | Repos, DB, infra, both apps deploying | ✅ Complete |
| 2 | Phase 1 | Backend auth + business CRUD | ✅ Complete |
| 3 | Phase 1 | Frontend auth + business UI | ❌ Backend only |
| 4 | Phase 2 | Sales module (backend) | ⬅️ Next |
| 5 | Phase 2 | Expenses module (backend) | Planned |
| 6 | Phase 3 | Tax engine + dashboard backend | Planned |
| 7 | Phase 3 | Tax reminders | Planned |
| 8 | Phase 4 | Paystack payment integration | Planned |
| 9 | Phase 4 | PDF generation + download | Planned |
| 10 | Phase 5 | Email/SMS notifications | Planned |
| 11 | Phase 5 | Testing, bug fixes, UI polish | Planned |
| 12 | Phase 5 | Production deploy + soft launch | **SHIP** |
| 13 | Phase 6 | Bug fixes from soft launch | **SHIP** |
| 14 | Phase 6 | Stretch: virtual accounts / invoicing | **SHIP** |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| FIRS integration path unconfirmed | HIGH — determines payment architecture | Design payment as generic Paystack flow, swap settlement target later |
| Solo developer bottleneck | HIGH — no backup if sick/blocked | Strict phase boundaries, cut scope not quality |
| Paystack webhook reliability | MEDIUM — missed payments | Idempotent processing, audit logging, manual verification endpoint |
| Neon free tier limits | LOW — may hit connection limits | Monitor, upgrade to $19/mo if needed |
| Render cold starts | LOW — first request slow after idle | Health check ping from uptime monitor |
| Frontend not started | MEDIUM — backend-heavy so far | Can be parallelized or built as React app consuming existing API |

---

## Definition of Done (MVP)

The MVP is shippable when ALL of these work in production:

- [x] User registration and login
- [x] Business profile creation
- [ ] Manual sales entry with monthly totals
- [ ] Manual expense entry with category breakdown
- [ ] Automatic tax calculation (7.5% of gross profit)
- [ ] Tax dashboard with summary cards and charts
- [ ] Month finalization and locking
- [ ] Tax payment via Paystack
- [ ] PDF tax statement download with QR verification
- [ ] Email notifications (welcome, payment confirmation, tax reminder)
- [ ] Mobile-responsive UI
- [ ] Error monitoring (Sentry)

---

*Last Updated: March 27, 2026*
*Author: Implementation Plan for PayMyTax by WallX*
