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

## Phase 0 — Project Bootstrap & DevOps (Week 1: March 24–30)

**Goal:** Both repos initialized, database connected, CI working, dev environment fully functional. Zero features — just plumbing.

### Tasks:
1. **Create GitHub repos**
   - `paymytax-api` (Node/Express/TypeScript)
   - `paymytax-web` (React/Vite/TypeScript)
   - Set up branch protection on `main` (require PR)

2. **Backend scaffold**
   - Initialize Express + TypeScript project
   - Set up folder structure: `src/{controllers, services, routes, middleware, lib, validators, config}`
   - Configure: `tsconfig.json`, `nodemon`, `tsx` for dev
   - Install core deps: express, prisma, bcrypt, jsonwebtoken, helmet, cors, rate-limit, winston, zod, dotenv
   - Create `src/server.ts` with health check endpoint (`GET /health`)
   - Set up Winston logger
   - Set up global error handler middleware

3. **Database setup (Neon)**
   - Create Neon project: `paymytax-prod`
   - Initialize Prisma, write full schema (all 9 tables from implementation.md)
   - Run `prisma migrate dev --name init`
   - Verify with `prisma studio`
   - Create seed script with test data

4. **Frontend scaffold**
   - `npm create vite@latest paymytax-web -- --template react-ts`
   - Install all deps: react-router-dom, tanstack-query, zustand, axios, zod, react-hook-form, tailwind, shadcn, recharts, lucide-react, date-fns
   - Initialize Tailwind + shadcn/ui
   - Set up folder structure from implementation.md
   - Create basic routing: `/login`, `/register`, `/dashboard` (empty pages)
   - Set up Axios client with interceptors (from implementation.md)

5. **Environment & deployment pipeline**
   - Create `.env.example` for both projects
   - Set up Render for backend (auto-deploy on push to `main`)
   - Set up Vercel for frontend (auto-deploy on push to `main`)
   - Verify both deploy successfully (even if just health check + blank page)

6. **DigitalOcean Spaces**
   - Create Space: `paymytax-documents`
   - Generate access keys
   - Test upload/download from backend

### Deliverables:
- [ ] Both repos on GitHub with CI deploying
- [ ] Database migrated with all tables
- [ ] Backend returns `200 OK` on `/health` in production
- [ ] Frontend loads on Vercel (blank dashboard shell)
- [ ] DO Spaces tested

### Exit Criteria: `curl https://paymytax-api.onrender.com/health` → `{ "status": "ok" }`

---

## Phase 1 — Authentication & Business Setup (Weeks 2–3: March 31 – April 13)

**Goal:** Users can register, login, create a business profile. This is the foundation everything else builds on.

### Week 2 — Backend Auth + Business CRUD

1. **Authentication system (backend)**
   - `PasswordService` — bcrypt hashing, strength validation
   - `JwtService` — separate access/refresh secrets, token generation/verification
   - `AuthService` — register, login, refresh token
   - `AuthController` + routes: register, login, logout, refresh-token, me, update-profile, change-password
   - `authenticate` middleware (JWT verification)
   - Rate limiting on auth endpoints (5 attempts / 15 min)
   - Audit logging service (append-only)

2. **Business management (backend)**
   - `BusinessService` — CRUD operations
   - `BusinessController` + routes: create, read, update, delete, list
   - Ownership validation middleware (user can only access their own businesses)
   - Input validation with Zod schemas

3. **Upstash Redis setup**
   - Connect Redis for rate limiting
   - Set up token blacklist for logout

### Week 3 — Frontend Auth + Business UI

4. **Auth pages (frontend)**
   - Login page with form validation (react-hook-form + zod)
   - Register page with form validation
   - Auth store (Zustand with persist)
   - Protected route component
   - Token refresh interceptor in Axios client
   - Auth layout (centered card for login/register)

5. **Business setup (frontend)**
   - Dashboard layout (sidebar + header + content area)
   - Business creation form (name, owner, tax ID, type, address, city, state, profit margin)
   - Business profile/settings page
   - Business selector (if user has multiple businesses)

6. **Integration testing**
   - Test full flow: register → login → create business → view dashboard
   - Test token refresh flow
   - Test rate limiting

### Deliverables:
- [ ] User can register and login
- [ ] User can create and manage a business profile
- [ ] JWT auth with refresh tokens working
- [ ] Audit logs recording auth events
- [ ] Dashboard layout with sidebar navigation

### Exit Criteria: Full register → login → create business flow works end-to-end in production.

---

## Phase 2 — Sales & Expenses Modules (Weeks 4–5: April 14 – April 27)

**Goal:** Users can record sales and expenses. This is the data entry layer that feeds into tax calculation.

### Week 4 — Sales Module

1. **Sales backend**
   - `SalesService` — CRUD, monthly summary, bulk import
   - `SalesController` + routes
   - Zod validators for sales creation/update
   - Query filters: by month, by source, date range, pagination
   - Sales summary endpoint (total for a given month)
   - Period lock check — refuse edits if month is locked
   - Deduplication index enforcement

2. **Sales frontend**
   - Sales list page with filters (month, source)
   - Add sale form (amount, source, date, description, customer name)
   - Edit/delete sale (with confirmation)
   - Sales summary card (total monthly sales)
   - Mobile-responsive table/list view

### Week 5 — Expenses Module

3. **Expenses backend**
   - `ExpenseService` — CRUD, monthly summary, by-category breakdown
   - `ExpenseController` + routes
   - Zod validators
   - Query filters: by month, by category, pagination
   - Category breakdown endpoint
   - Period lock check
   - Receipt URL field (upload comes later, manual URL for now)

4. **Expenses frontend**
   - Expenses list page with filters (month, category)
   - Add expense form (category dropdown, description, amount, date)
   - Edit/delete expense
   - Expense summary card + category breakdown chart (Recharts pie chart)

5. **Expense Intelligence Alert (from wallxplan MVP scope)**
   - Backend: When calculating, if expenses < 5% of sales, flag warning
   - Frontend: Show alert banner: "Your expenses appear too low. This may affect your tax report."

### Deliverables:
- [ ] Full sales CRUD with filtering and pagination
- [ ] Full expenses CRUD with category breakdown
- [ ] Period lock enforcement on both modules
- [ ] Expense intelligence warning
- [ ] Both modules tested end-to-end

### Exit Criteria: User can record multiple sales and expenses for a month, see summaries, and get warned if expenses are suspiciously low.

---

## Phase 3 — Tax Calculation & Dashboard (Weeks 6–7: April 28 – May 11)

**Goal:** The core value proposition — automatic tax calculation, visual dashboard, and period finalization.

### Week 6 — Tax Engine + Dashboard Backend

1. **Tax calculation engine (backend)**
   - `TaxService` — calculate monthly tax
     ```
     total_sales = SUM(confirmed sales for month)
     total_expenses = SUM(expenses for month)
     gross_profit = total_sales - total_expenses
     tax_payable = gross_profit > 0 ? gross_profit * 0.075 : 0
     profit_margin = (gross_profit / total_sales) * 100
     ```
   - Create/update `monthly_tax_reports` record
   - Finalize endpoint — sets `is_finalized = true`, prevents further edits
   - Un-finalize endpoint — only if NOT locked (not paid)
   - Dashboard data endpoint — current month summary + trends (last 6 months)

2. **Analytics endpoints**
   - Monthly trends (last 6-12 months of sales, expenses, tax)
   - Profit margin tracking over time
   - Expense breakdown by category for current month

### Week 7 — Tax Dashboard Frontend

3. **Tax dashboard page**
   - 4 summary cards: Total Sales, Total Expenses, Gross Profit, Tax Payable
   - Monthly trends line chart (Recharts)
   - Expense breakdown pie chart
   - Payment status indicator (paid/unpaid/pending)
   - "Calculate Tax" button (triggers recalculation)
   - "Finalize Month" button with confirmation dialog

4. **Tax reports page**
   - List of all monthly tax reports
   - Status badges (open, finalized, paid)
   - Click to view detail for any month
   - Profit margin met alert (from wallxplan MVP scope)
     - If profit margin > configured threshold, show green indicator
     - If below, show warning

5. **Tax reminders (basic — from wallxplan MVP scope)**
   - Business settings: "Reminder Day" (default: 25th of month)
   - Backend: Create reminder records when approaching tax deadline
   - Frontend: Show in-app notification/banner when reminder is due
   - (Email/SMS reminders deferred to Phase 5)

### Deliverables:
- [ ] Tax calculation working correctly (7.5% formula)
- [ ] Dashboard with real-time summary and charts
- [ ] Period finalization/locking flow
- [ ] Monthly tax reports list with status
- [ ] In-app tax reminders
- [ ] Profit margin alert

### Exit Criteria: User sees accurate tax calculation dashboard, can finalize a month, and gets reminded about upcoming tax deadlines.

---

## Phase 4 — Payment Integration & PDF Generation (Weeks 8–9: May 12 – May 25)

**Goal:** Users can pay their tax via Paystack and download PDF tax statements. This is the money flow.

### Week 8 — Paystack Payment Integration

1. **Paystack integration (backend)**
   - Initialize Paystack SDK
   - `PaymentService`:
     - Initialize payment (create Paystack transaction)
     - Verify payment
     - Handle webhooks
   - `PaymentController` + routes:
     - `POST /tax/pay` — initiate payment
     - `GET /tax/payments` — list payments
     - `GET /tax/payments/:id/verify` — verify specific payment
     - `POST /webhooks/paystack` — webhook handler
   - Webhook security:
     - Verify Paystack signature FIRST
     - Idempotent processing (check if already processed)
     - Return 200 immediately, process async via queue if possible
     - Log ALL webhook events to audit_logs
   - On successful payment:
     - Update `tax_payments` record
     - Update `monthly_tax_reports.payment_status = 'completed'`
     - Set `is_locked = true`, `locked_at = NOW()`
   - **Settlement:** For now, Paystack settles to WallX's designated account. When FIRS flow is confirmed, update the subaccount/settlement config.

2. **Payment frontend**
   - "Pay Tax to FIRS" button on dashboard (only shows when tax > 0 and unpaid)
   - Payment method selection (card, bank transfer, etc.)
   - Redirect to Paystack checkout OR inline popup
   - Payment verification callback page
   - Payment history page with status badges
   - Payment success/failure UI states

### Week 9 — PDF Tax Statement Generation

3. **PDF generation (backend)**
   - `PdfService` using PDFKit:
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
   - `StatementController` + routes:
     - `POST /tax/statements/generate`
     - `GET /tax/statements/:id/download`

4. **PDF frontend**
   - "Download Tax Statement" button on dashboard
   - Statement generation loading state
   - Download triggered via signed URL
   - Statement history list

5. **Business-scoped rate limiting**
   - Tax calculations: max 10/hour per business
   - PDF generation: max 20/day per business
   - Payment initiation: max 5/hour per business

### Deliverables:
- [ ] Full Paystack payment flow working (initiate → pay → webhook → verify)
- [ ] Tax report locked after payment
- [ ] PDF statement generation with QR code verification
- [ ] PDF upload to DO Spaces with signed URLs
- [ ] Payment history page
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
   - Full user journey: register → business → sales → expenses → calculate → pay → PDF
   - Edge cases: zero sales, zero expenses, negative profit, very large numbers
   - Mobile responsiveness testing
   - Cross-browser testing (Chrome, Safari, Firefox)

5. **UI polish**
   - Loading skeletons on all pages
   - Empty states (no sales yet, no expenses yet, no reports yet)
   - Error boundaries
   - Toast notifications for success/error actions
   - Consistent color scheme and typography
   - Accessible forms (labels, aria attributes, focus management)

6. **Security hardening**
   - Review all input validation
   - Test rate limiting
   - Verify audit log coverage
   - Review CORS settings for production
   - Ensure no sensitive data in error responses
   - Move refresh tokens to httpOnly cookies (production hardening)

### Week 12 — Pre-Launch & Soft Launch

7. **Production deployment checklist**
   - Swap all test API keys for production (Paystack live keys, etc.)
   - Set up custom domain: `paymytax.ng` or subdomain
   - SSL verification
   - Set up Sentry for error monitoring (backend + frontend)
   - Set up Morgan for HTTP logging in production
   - Database backup strategy (Neon automated backups)

8. **Soft launch**
   - Deploy to production
   - Test with 5-10 real businesses (internal or beta users)
   - Collect feedback
   - Fix critical bugs

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

These items from the original plan are **intentionally deferred** — they are either blocked (FIRS), dependent on ecosystem readiness (WallX storefront), or lower priority than shipping MVP:

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

| Week | Phase | Milestone | Ship? |
|------|-------|-----------|-------|
| 1 | Phase 0 | Repos, DB, infra, both apps deploying | No |
| 2 | Phase 1 | Backend auth + business CRUD | No |
| 3 | Phase 1 | Frontend auth + business UI | No |
| 4 | Phase 2 | Sales module (full stack) | No |
| 5 | Phase 2 | Expenses module (full stack) | No |
| 6 | Phase 3 | Tax engine + dashboard backend | No |
| 7 | Phase 3 | Tax dashboard frontend + reminders | No |
| 8 | Phase 4 | Paystack payment integration | No |
| 9 | Phase 4 | PDF generation + download | No |
| 10 | Phase 5 | Email/SMS notifications | No |
| 11 | Phase 5 | Testing, bug fixes, UI polish | No |
| 12 | Phase 5 | Production deploy + soft launch | **YES** |
| 13 | Phase 6 | Bug fixes from soft launch | **YES** |
| 14 | Phase 6 | Stretch: virtual accounts / invoicing | **YES** |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| FIRS integration path unconfirmed | HIGH — determines payment architecture | Design payment as generic Paystack flow, swap settlement target later |
| Solo developer bottleneck | HIGH — no backup if sick/blocked | Strict phase boundaries, cut scope not quality |
| Paystack webhook reliability | MEDIUM — missed payments | Idempotent processing, audit logging, manual verification endpoint |
| Neon free tier limits | LOW — may hit connection limits | Monitor, upgrade to $19/mo if needed |
| Render cold starts | LOW — first request slow after idle | Health check ping from uptime monitor |

---

## Definition of Done (MVP)

The MVP is shippable when ALL of these work in production:

- [ ] User registration and login
- [ ] Business profile creation
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

*Last Updated: March 23, 2026*
*Author: Implementation Plan for PayMyTax by WallX*
