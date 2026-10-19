# DASHBOARD PERFORMANCE — ARCHITECTURE AUDIT & IMPLEMENTATION PLAN

**Scope:** Deliberately **narrow**. Covers the dashboard load path only:
frontend `Dashboard.tsx` → axios → `tax/dashboard` + three list endpoints → Prisma → PostgreSQL.
The rest of the system is out of scope; template phases that don't apply are marked `NOT APPLICABLE`
rather than padded.

**Template:** SENIOR ARCHITECTURE AUDIT PROMPT v3.0 (`implementplancode.md`)
**Date:** 2026-10-04
**Product (CONFIRMED from code):** WallXERP — Nigerian SME tax/reporting/remittance platform.
`Tax Payable = 7.5% × Gross Profit`. Multi-tenant (`Business`-scoped), single operator.

---

## 1. EXECUTIVE SUMMARY

The dashboard's **frontend is well built and should not be touched**: parallel sub-requests, abort on
business switch, stale-while-revalidate seeding, lazy routing, correct indexes for month-scoped
queries. The problem is entirely in the **backend service layer**.

Three findings, in order of real impact:

**1. The backend runs a 5-stage sequential query waterfall where it needs one concurrent stage.**
`getDashboard()` (`backend/src/services/tax/tax-analytics.service.ts`) issues five successive `await`
blocks — lines **27, 37, 75, 97, 153** — not one. Three of those five (`findUnique`, `findMany`,
`aggregate`, `count`) read `monthlyTaxReport`, a table holding at most ~60 rows per business. Against a
**remote** Postgres (Neon/Supabase per `render.yaml`), each `await` is a network round trip of
30–100ms. This is the single largest latency cost on the page, and it is structural, not incidental.

**2. My original fix #1 recommendation was wrong. I am retracting it.**
I first proposed denormalizing lifetime totals onto `Business` as counters. Recon found **15+ distinct
write paths** that would each have to maintain them — including four that mutate `status`/`isTaxable`
on already-counted rows, two that move a sale between businesses, three one-off backfill scripts, and
several that **do not run inside a `$transaction`** (`sales-crud.service.ts:358`,
`expense.service.ts:42,215,274`, `payment-webhook.service.ts:281`). A silently drifted lifetime counter
produces a **wrong tax figure** — a regulatory-correctness problem, not a performance one. The
complexity does not earn its place. The correct fix extends two indexes that already exist, with zero
drift risk.

**3. One page load = 4 HTTP requests = ~15+ DB queries.**
Three of the four are full list endpoints (`limit=5`) that each re-run `verifyBusinessAccess` and each
issue a `count()` whose result the dashboard discards.

**Verdict: 🟡 Healthy, needs targeted work.** Nothing here is on fire. The wins are real, the fixes
are small, and one of them is free.

---

## 2. CURRENT ARCHITECTURE

### Request flow (as it actually executes)

```
Dashboard.tsx  (mounted, activeBusiness set)
  └─ fetchDashboardBundle()                        frontend/src/pages/Dashboard.tsx:490
       └─ Promise.all([ ...4 fetchSection() ])      :497-518
            ├─ GET /api/v1/businesses/:id/tax/dashboard?months=6
            │     └─ taxController.dashboard         controllers/tax.controller.ts:102
            │          └─ taxService.getDashboard    services/tax/tax-analytics.service.ts:10
            │               ├─ verifyBusinessAccess  lib/ownership.ts (60s in-memory cache)
            │               ├─ await findUnique      monthlyTaxReport            [RTT 1]
            │               ├─ await Promise.all     4 aggregates                 [RTT 2]
            │               │    ├─ sales  lifetime  (UNBOUNDED — scans all rows)
            │               │    ├─ expense lifetime (UNBOUNDED — scans all rows)
            │               │    ├─ sales  month
            │               │    └─ expense month
            │               ├─ await findMany       monthlyTaxReport             [RTT 3]
            │               ├─ await aggregate      monthlyTaxReport             [RTT 4]
            │               └─ await count          monthlyTaxReport             [RTT 5]
            ├─ GET /api/v1/businesses/:id/sales?limit=5
            │     └─ listSales     services/sales/sales-crud.service.ts:133
            │          ├─ verifyBusinessAccess (separate cache path)
            │          └─ Promise.all([ findMany+include , count ])              [RTT]
            ├─ GET /api/v1/businesses/:id/expenses?limit=5  → same shape         [RTT]
            └─ GET /api/v1/businesses/:id/tax/reports?limit=3
                  └─ listReports  services/tax/tax-report.service.ts:149        [RTT]
```

**Total: 4 HTTP requests · 5 sequential RTT blocks inside one of them · ~15+ DB queries.**

### Data flow / state ownership
- **Authoritative state:** PostgreSQL. No server-side cache exists — `config.redis.url` is configured
  but **unused**; no Redis client appears anywhere in `backend/src`.
- **Client-side:** `dashboardCache` (in-memory `Map`, seeded on mount) + `STALE.short = 30_000`
  (`frontend/src/lib/cache.ts`).
- **Invalidation:** `useDashboardEvents` counter (`stores/dashboard.store.ts`), bumped by callers.

### Trust boundaries
Auth via JWT middleware per request; authorization via `verifyBusinessAccess(userId, businessId, perm)`
inside **each** service function. Correct, and it must be preserved through any consolidation.

### Transaction boundaries
`getDashboard` is read-only, no transaction. Correct as-is.

---

## 3. ARCHITECTURE MAP

| Layer | File | Role |
|---|---|---|
| Page | `frontend/src/pages/Dashboard.tsx` (2178 ln) | Lazy route; 4-request bundle fetch |
| Cache | `frontend/src/lib/cache.ts` | `STALE` TTLs, `isFresh()` |
| Events | `frontend/src/stores/dashboard.store.ts` | Invalidation counter (pub/sub) |
| HTTP | `frontend/src/lib/axios.ts` | Bearer + 401 refresh |
| Route | `backend/src/routes/tax.routes.ts:16` | `GET /dashboard` |
| Controller | `backend/src/controllers/tax.controller.ts:102` | Parse `months`, delegate |
| **Service** | `backend/src/services/tax/tax-analytics.service.ts:10-182` | **Primary hotspot — 9 queries, 5 sequential** |
| AuthZ | `backend/src/lib/ownership.ts` | `verifyBusinessAccess` (60s cache) |
| Schema | `backend/prisma/schema.prisma` | `Business:77`, `SalesTransaction:162`, `Expense:208` |
| Indexes | `idx_sales_tax_calc`, `idx_expense_tax_calc` | Good for month queries; **omit `amount`** |

---

## 4. WHAT IS ALREADY GOOD — **DO NOT CHANGE**

Protecting these is part of the plan:

1. **`Promise.all` in `fetchDashboardBundle`** (`Dashboard.tsx:497`). Correct.
2. **`AbortController` + `bundleAbortRef`** (`:635`) — stops stale responses landing on a switched
   business, and saves bandwidth on metered mobile. Correct.
3. **Stale-while-revalidate seeding** (`:550`, `cache.ts`). Correct.
4. **`fetchSection` three-way outcome** (permitted / ok / failed). The comment at `:470` records that
   this fixed a real bug — a network blip rendering as a dashboard of zeros. Do not "simplify" it back.
5. **`idx_sales_tax_calc (businessId, status, isTaxable, transactionDate)` and
   `idx_expense_tax_calc (businessId, isDeductible, expenseDate)`** — well-chosen for month-scoped
   aggregates. We *extend* them; we do not replace them.
6. **`verifyBusinessAccess` 60s in-memory cache** with explicit invalidation.
7. **Lazy route loading + `DashboardSkeleton`.** No recharts/moment/date-fns in the dashboard bundle —
   correctly confined to `TaxAnalytics.tsx`.
8. **UTC discipline in `getDashboard`** (`:18-24`), with a comment documenting a real month-boundary
   bug. Any rewrite must preserve this exactly.

---

## 5. ARCHITECTURAL PROBLEMS

### P-1 — Sequential query waterfall 🔴 (within this path)
`tax-analytics.service.ts` lines 27, 37, 75, 97, 153 are five successive `await` statements. Lines 75,
97 and 153 are three separate reads of `monthlyTaxReport` that could be one. Against a remote database
that is 4 avoidable sequential round trips.

### P-2 — Unbounded aggregates force a heap scan 🟠 (near-term risk)
`tax-analytics.service.ts:39-48`: `liveSalesAgg` and `liveExpenseAgg` have **no date bound**. The
composite indexes cover the *predicate* columns but **not `amount`**, so Postgres must visit the heap
for every matching row to read the sum. Cost is O(rows) per load and grows without bound.
The code comment at `:31-36` shows this liveness was a **deliberate fix** for a dashboard that froze
until recalculation. **Any replacement must preserve live reads.**

### P-3 — Four HTTP requests for one page 🟠
Each request independently re-runs JWT verification, Morgan logging, rate limiting and Zod parsing.
The three list calls issue `count()` queries whose results the dashboard discards. On Render free tier
(single CPU, 2–5s cold start) this multiplies server cost ~4×.

### P-4 — Payload/permission coupling 🟡
`listSales` returns accrual relations (`invoice`, `creditOrigin`, `creditPayment` —
`shared/helpers/accrual.ts:19`) plus a full pagination envelope. The dashboard needs a handful of
fields. Prisma loads each `include` relation via a batched secondary query — **`INFERRED`**, verify
under PERF-01 before assuming the magnitude.

---

## 6. RISK REGISTER

| Finding | Severity | Confidence | Evidence | Impact | Action |
|---|---|---|---|---|---|
| 5-deep sequential await waterfall | 🔴 | **HIGH** | `tax-analytics.service.ts:27,37,75,97,153` | 4 avoidable sequential RTTs; dominant page latency | Collapse to one concurrent stage |
| Unbounded SUM forces heap scan | 🟠 | **HIGH** | `tax-analytics.service.ts:39-48`; `amount` absent from both tax_calc indexes | O(n) per load; grows forever | Add `amount` to the two existing indexes |
| 4 HTTP requests / ~15 queries per page | 🟠 | **HIGH** | `Dashboard.tsx:497-518`; `sales-crud.service.ts:174-190` | 4× middleware + DB load | One bundle endpoint |
| No query instrumentation | 🟠 | **HIGH** | No query logging in `lib/prisma.ts`; no slow-query log | All fixes are currently unmeasured bets | Instrument first |
| Dashboard coverage is one assertion | 🟡 | **HIGH** | `tests/e2e/api.e2e.test.ts:866` (`→ 200` only) | Silent numerical regressions undetectable | Numeric regression test |

**RETRACTED — denormalizing lifetime totals onto `Business`: 🔴 risk, NOT RECOMMENDED.**
15+ write paths, 4 mutating counted rows' status, 2 reassigning `businessId`, 3 backfill scripts, and
several outside transactions. Drift would be silent and would corrupt a tax figure.

---

## 7. TARGET ARCHITECTURE

```
Dashboard.tsx
  └─ GET /api/v1/businesses/:id/dashboard-bundle      ← ONE request
       └─ JWT auth (1×)
       └─ verifyBusinessAccess (1×, cached)
       └─ Promise.all([
             getDashboard()     → 1 monthlyTaxReport read + 2 aggregates   [RTT 1]
             recent sales       → lean select, no count, no accrual include [RTT 1]
             recent expenses    → lean select                              [RTT 1]
             recent reports     → lean select                              [RTT 1]
          ])
```

**Target: 4 HTTP → 1 · ~15+ queries → ~8 · all issued in a single concurrent stage.**

### Change A — Collapse the dashboard waterfall
- **CURRENT:** 5 sequential `await` stages; `monthlyTaxReport` read 4×.
- **PROPOSED:** One `findMany` over `monthlyTaxReport` for the business; derive in JS the current-month
  report, trends slice, lifetime sum/count and unpaid count. Run it in the **same `Promise.all`** as the
  sales/expense aggregates.
- **WHY:** The table holds ≤~60 rows per business. Four round trips to fetch ≤60 rows is indefensible
  when the DB is remote.
- **BENEFIT:** Removes up to 4 sequential RTTs. **Largest single latency win.**
- **COST:** One denser function; the JS aggregation must mirror the SQL exactly.
- **RISK:** Off-by-one in trend windowing changes displayed months. Mitigated by PERF-06.

### Change B — Extend two indexes to include `amount`
- **CURRENT:** `(businessId, status, isTaxable, transactionDate)` and
  `(businessId, isDeductible, expenseDate)` — index filter, then heap fetch for `amount`.
- **PROPOSED:** Append `amount` as the final column to both → index-only scan for the unbounded SUMs.
  **No new index.**
- **WHY:** The database derives the value; there is no application state that can drift.
- **BENEFIT:** Removes the O(n) heap traversal while preserving the liveness the code comment demands.
- **COST:** Slightly larger indexes; marginally higher write cost on bulk import.
- **RISK:** Index rebuild requires care — see Migration Strategy. Index-only scans depend on the
  visibility map; a post-migration `ANALYZE` is included.

### Change C — Bundle endpoint
- **CURRENT:** 4 parallel HTTP requests, full middleware each, plus 3 discarded `count()` queries.
- **PROPOSED:** `GET /businesses/:id/dashboard-bundle` composing the four service calls in one
  `Promise.all`. **Existing endpoints remain** — other pages consume them.
- **WHY:** One auth check, one RTT, one process.
- **BENEFIT:** ~4× less per-request overhead; removes 3 wasted `count()` queries.
- **COST:** One new endpoint; two response shapes to keep in sync.
- **RISK:** Someone edits `listSales` and the bundle silently diverges. Mitigated by PERF-06 asserting
  the bundle's `recentSales` equals the list endpoint's.

---

## 8. FILE / MODULE IMPACT

| Action | Path |
|---|---|
| MODIFY | `backend/src/lib/prisma.ts` — query logging (PERF-01) |
| CREATE | `backend/tests/integration/dashboard-numbers.test.ts` (PERF-06) |
| MODIFY | `backend/src/services/tax/tax-analytics.service.ts` — `getDashboard` (PERF-02) |
| MODIFY | `backend/prisma/schema.prisma` — 2 index defs (PERF-03) |
| CREATE | `backend/prisma/migrations/<ts>_dashboard_covering_indexes/migration.sql` (PERF-03) |
| MODIFY | `backend/src/routes/tax.routes.ts` — mount bundle route (PERF-04) |
| MODIFY | `backend/src/controllers/tax.controller.ts` — bundle handler (PERF-04) |
| MODIFY | `backend/src/services/tax/tax-analytics.service.ts` — `getDashboardBundle()` (PERF-04) |
| MODIFY | `frontend/src/pages/Dashboard.tsx:490-533` — single-request fetch (PERF-05) |
| MODIFY | `backend/tests/e2e/api.e2e.test.ts` — add bundle assertion (PERF-04) |

---

## 9. MIGRATION STRATEGY

**PERF-03 is the only schema migration.**

**Current → Target:** additive index widening. No data movement, no backfill, no new column.

- **Current:** Two indexes exist without `amount`.
- **Intermediate:** Both rebuilt with `amount` appended. Prisma cannot `ALTER INDEX` to add a column,
  so it emits `DROP INDEX` + `CREATE INDEX`, which **locks the table** for the duration on a large
  `sales_transactions`.
- **Target:** Both widened; month-scoped query plans unchanged; unbounded SUMs become index-only.

**Ordering:** hand-write `CREATE INDEX CONCURRENTLY` as raw SQL in the migration — Prisma has no
native support, and `CONCURRENTLY` **cannot run inside a Prisma migration transaction**. If the table
is still small at deploy time (likely — pre-launch), a plain `CREATE INDEX` inside the normal migration
is acceptable. **Check `SELECT count(*)` first and choose deliberately — do not guess.**

**Rollback:** `DROP INDEX` both widened indexes, revert the `schema.prisma` lines. No data at risk.

**Backward compatibility:** fully backward compatible — same tables, same columns, same API responses.
The bundle endpoint is purely additive; the frontend switches only after it exists.

---

## 10. PRIORITIZED IMPROVEMENTS

### NOW
| # | Problem | Solution | Benefit | Effort | Risk |
|---|---|---|---|---|---|
| PERF-01 | No instrumentation | Query logging + slow-query warn | Makes every other item verifiable | S | None |
| PERF-06 | Dashboard numbers untested | Numeric regression test | Locks correctness before refactor | S | None |
| PERF-02 | Sequential waterfall | Single concurrent stage | **Biggest latency win** | M | Med |
| PERF-03 | Heap scan on SUMs | Widen 2 indexes | Removes O(n) read | S | Low |

### NEXT
| # | Problem | Solution | Benefit | Effort | Risk |
|---|---|---|---|---|---|
| PERF-04 | 4 HTTP requests | Bundle endpoint (backend) | ~4× less per-request overhead | M | Med |
| PERF-05 | 4 HTTP requests | Frontend consumes bundle | 1 RTT | S | Low |

### LATER
- **PERF-07** — server-side memoization (60s TTL keyed `businessId+month`) **only if** PERF-01 shows the
  read is still hot. Use an in-process `Map` matching the existing `ownership.ts` pattern; adding Redis
  would be new infra for no measured gain.
- **PERF-08** — cursor pagination instead of offset. Premature at current volume.

### ❌ DO NOT DO
- **Denormalize lifetime totals onto `Business`.** Rejected — see Risk Register. Silent drift on a tax
  figure is far worse than an O(n) scan that is currently sub-millisecond.
- Add Redis or a cache layer "for scale." No measurement justifies it.
- Rewrite the dashboard frontend. It is correct.
- Remove the existing list endpoints. Other pages consume them.

---

## 11. IMPLEMENTATION PLAN

Topologically ordered. Each item is independently completable and independently revertible.

---

### PERF-01 — Instrument Prisma queries
- **Depends on:** None
- **Files touched:** `backend/src/lib/prisma.ts`
- **What to do:** Add `log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]` to
  the PrismaClient constructor and register a `$on('query', ...)` handler that logs any query over a
  threshold (start at 50ms) with duration and a truncated query string. Guard the handler so it never
  runs when `NODE_ENV === 'test'`.
- **Acceptance criteria:** A deliberately slow query appears in the log with its duration; no query
  logging during `npm test`; production log volume does not increase materially.
- **Verification:** `npm run dev`, load the dashboard, confirm per-query timings. Run
  `npm run test:integration` and confirm no new log noise.
- **Rollback:** Revert the file. Fully self-contained.
- **Effort:** S
- **Risk if skipped:** PERF-02/03/04 ship as unmeasured bets. If the dashboard is network-bound rather
  than DB-bound, all four are wasted work.

---

### PERF-06 — Numeric regression test for `getDashboard`
- **Depends on:** None. **Must land before PERF-02.**
- **Files touched:** CREATE `backend/tests/integration/dashboard-numbers.test.ts`
- **What to do:** Using the existing `tests/helpers/test-db.ts` harness, create a business with a known
  set of sales and expenses — including at least one non-settled sale and one non-deductible expense,
  both of which must be **excluded**. Call `getDashboard()` directly. Assert exact values for:
  lifetime sales, lifetime expenses, current-month sales/expenses, `trends` length and month ordering,
  `lifetime.totalTaxPayable`, and `unpaidCount`. Add a case for a business with zero rows, and one with
  no report for the current month (exercises the `live-preview` branch at
  `tax-analytics.service.ts:126`).
- **Acceptance criteria:** Suite passes on unmodified `main` **before any refactor begins** — it is the
  contract PERF-02 must preserve. If it fails on unmodified `main`, that is itself a finding: stop and
  report it rather than fixing it silently inside this item.
- **Verification:** `npm run test:integration -- dashboard-numbers`
- **Rollback:** Delete the file.
- **Effort:** S
- **Risk if skipped:** PERF-02 rewrites aggregate logic behind a test that only asserts `200`.

---

### PERF-02 — Collapse the dashboard query waterfall
- **Depends on:** PERF-01, PERF-06
- **Files touched:** `backend/src/services/tax/tax-analytics.service.ts` (`getDashboard`, lines 10–182)
- **What to do:**
  1. Replace the four `monthlyTaxReport` reads (lines 27, 75, 97, 153) with a **single**
     `findMany({ where: { businessId }, orderBy: { taxMonth: 'asc' } })`. Fetching all reports for the
     business is bounded (~60 rows) and lets you derive in JS: the current-month report (match `taxMonth`
     against the UTC first-of-month), the trends slice (filter `>= trendStart`, `<= currentMonthStart`),
     `lifetime._sum.taxPayable`, `lifetime._count`, and `unpaidCount`.
  2. Restructure so that reports read and the sales/expense aggregates are issued in **one**
     `Promise.all`, not five sequential awaits.
  3. **Leave the live-vs-report precedence logic (lines 111–150) untouched** — it is deliberate and
     documented.
  4. **Preserve the UTC month-bound construction at lines 18–24 character for character.**
- **Acceptance criteria:** PERF-06 passes unmodified. Query count for `getDashboard` drops from 9 to 3
  (verify via PERF-01 logging). Response payload is identical to before except `trends`, which must
  contain the same rows in the same order.
- **Verification:** `npm run test:integration -- dashboard-numbers`; `npm run test:e2e`; load the
  dashboard in a browser and compare every visible number against `main`.
- **Rollback:** `git revert` the commit. Service-local; nothing else depends on the new shape.
- **Effort:** M
- **Risk if skipped:** 4 sequential remote-DB round trips stay on the critical path of the most
  visited page.

---

### PERF-03 — Widen the two tax-calculation indexes to include `amount`
- **Depends on:** PERF-01
- **Files touched:** `backend/prisma/schema.prisma` (`SalesTransaction:162`, `Expense:208`); CREATE
  `backend/prisma/migrations/<ts>_dashboard_covering_indexes/migration.sql`
- **What to do:** Append `amount` as the final column to the two existing indexes:
  - `(businessId, status, isTaxable, transactionDate)` → `(businessId, status, isTaxable, transactionDate, amount)`
  - `(businessId, isDeductible, expenseDate)` → `(businessId, isDeductible, expenseDate, amount)`

  This keeps the existing month-scoped queries fully covered **and** makes the two unbounded SUMs
  index-only. **Do not create a third index — extend these.** Hand-write the migration SQL rather than
  letting Prisma emit `DROP`+`CREATE`; use `CREATE INDEX CONCURRENTLY` if the row count warrants it
  (check first — see Migration Strategy). Run `ANALYZE sales_transactions; ANALYZE expenses;` afterwards
  so planner stats and the visibility map are current.
- **Acceptance criteria:** `EXPLAIN (ANALYZE, BUFFERS)` on both SUM aggregates shows `Index Only Scan`
  (or at minimum no heap fetches for matching rows) where it previously showed heap accesses. No other
  query plan regresses — spot-check the month-scoped aggregates and `listSales`.
- **Verification:** Capture before/after `EXPLAIN (ANALYZE)` for both aggregates; PERF-06 green;
  `npm run test:integration`.
- **Rollback:** `DROP INDEX` both widened indexes and revert the `schema.prisma` lines. No data loss.
- **Effort:** S (M if `CONCURRENTLY` is needed on a large table)
- **Risk if skipped:** The unbounded SUM keeps a heap traversal proportional to total transaction
  count. Harmless today; becomes the dominant cost as a business accumulates history.

---

### PERF-04 — Add the dashboard bundle endpoint
- **Depends on:** PERF-02
- **Files touched:** `backend/src/routes/tax.routes.ts`; `backend/src/controllers/tax.controller.ts`;
  `backend/src/services/tax/tax-analytics.service.ts`; `backend/tests/e2e/api.e2e.test.ts`
- **What to do:** Add `getDashboardBundle(userId, businessId, months)` issuing `getDashboard()`, recent
  sales, recent expenses and recent reports in a **single `Promise.all`**.
  - For the three lists, use purpose-built lean queries with an explicit `select` of only the fields the
    dashboard renders — **do not** call `listSales`/`listExpenses`/`listReports` directly. Those build a
    pagination envelope and run a `count()` whose result this page discards, and `listSales` pulls
    accrual relations the dashboard never renders.
  - **Preserve the per-section permission gating** from `fetchSection` (`Dashboard.tsx:495-518`):
    `sales.read`, `expenses.read`, `tax.read`, `dashboard.read` must each be evaluated, and a section
    the caller lacks permission for must be omitted rather than returned empty. A team member with
    `dashboard.read` but not `sales.read` must still get a working dashboard.
  - **Preserve the `failedSections` semantics** — a sub-request that throws must be reported as failed,
    not silently rendered as an empty list. This distinction is the bug fix recorded at
    `Dashboard.tsx:470`.
  - Reuse the existing `dashboardQuerySchema` (`months`, 1–24) and return
    `{ dashboard, recentSales, recentExpenses, recentReports, failedSections }`.
- **Acceptance criteria:** One HTTP request returns all four sections; permission-gated sections are
  omitted for a restricted user; an induced failure in one section yields `failedSections` naming it
  while the other three still render; existing `/tax/dashboard` and list endpoints remain unchanged and
  still return 200.
- **Verification:** Extend `dashboard-numbers.test.ts` to call `getDashboardBundle()` and assert its
  `recentSales` deep-equals `listSales(...).data` for the same fixture — this is the anti-drift guard.
  Add a `GET dashboard-bundle → 200` case to `api.e2e.test.ts`. Manually verify as a team member with
  `sales.read` revoked.
- **Rollback:** Remove the route registration and the `getDashboardBundle` export. The frontend is
  unchanged until PERF-05, so reverting is invisible to users.
- **Effort:** M
- **Risk if skipped:** 4× per-request middleware overhead and 3 wasted `count()` queries remain.

---

### PERF-05 — Switch the frontend to the bundle endpoint
- **Depends on:** PERF-04
- **Files touched:** `frontend/src/pages/Dashboard.tsx` (lines 490–533)
- **What to do:** Rewrite `fetchDashboardBundle` to issue a single
  `GET /businesses/${bid}/dashboard-bundle?months=6`. Keep the `AbortSignal` wiring (`:635`) — keep
  passing `{ signal }` to axios. Preserve the `DashboardBundle` return shape and the
  `failedSections` → `loadErrors` mapping (`:570`) so the error banner behaves identically. Do **not**
  change the cache-seeding logic (`:550`), the invalidation subscription (`:625`), or any rendering.
- **Acceptance criteria:** Dashboard loads from one request (verify in the Network tab); switching
  businesses still aborts the in-flight request; a forced failure in one section shows the same error
  banner as before; cached-seed path still renders without a spinner on warm visits.
- **Verification:** Browser Network tab shows exactly 1 dashboard-related request per load. Manually
  exercise: cold load, warm load, business switch mid-load, offline, and restricted-permission user.
  Run `npm test` in `frontend/`.
- **Rollback:** Revert `Dashboard.tsx` to the 4-request version. The endpoint stays available and
  harmless — it is additive and other callers may want it.
- **Effort:** S
- **Risk if skipped:** The backend work in PERF-04 is dormant; no user-visible improvement lands.

---

## 12. ARCHITECTURE SCORES

Scored for the **dashboard load path** only, not the whole application.

| Dimension | Score | Justification |
|---|---|---|
| Maintainability | 7 | Layering is clean and conventional; `getDashboard` mixes five query stages with response shaping, and `services/` is mid-refactor between flat files and per-domain dirs. |
| Modularity | 7 | Clear route/controller/service split. `tax-analytics.service.ts` is doing dashboard + analytics in one file (478 lines) — coherent but drifting toward a god service. |
| Scalability | 5 | Unbounded `SUM` reads and a 5-deep sequential waterfall. **This is the score that drives this plan.** |
| Reliability | 7 | `fetchSection` degradation, abort handling, and error banners are genuinely good. No cache means nothing to go stale. |
| Security | 8 | Per-service authz, JWT, encrypted PII, blind indexes, rate limiting, webhook signature verification. `verifyBusinessAccess` is correctly invoked in every service. |
| Testability | 4 | The most complex read path in the product is covered by a single `→ 200` assertion. This is why PERF-06 gates PERF-02. |
| Data Architecture | 7 | Good composite indexes, correct `@db.Decimal` usage, careful UTC discipline. The two indexes omit `amount`, which is the one gap that matters here. |
| API Architecture | 6 | Consistent response envelope and pagination. The dashboard is forced to compose from four general-purpose endpoints because no purpose-built read endpoint exists. |
| Observability | 4 | Winston + Morgan + Sentry are present, but **no query-level instrumentation and no slow-query signal**. You cannot currently see the cost of the thing this plan optimizes. |
| Deployment Architecture | 6 | Render blueprint, graceful shutdown, migration-on-start. Cold-start latency is acknowledged in docs. |
| **Overall** | **6.1** | **🟡 Healthy but needs targeted work.** Sound architecture with one clear, well-understood performance defect and one observability gap that hides it. |

---

## 13. TOP 10 RECOMMENDATIONS (ranked by value)

1. **Instrument Prisma queries (PERF-01).** Nothing else is verifiable without it. Cheap.
2. **Write the numeric regression test (PERF-06).** Refactoring untested numbers is how tax
   calculations silently break. Cheap.
3. **Collapse the 5-deep waterfall to one concurrent stage (PERF-02).** Largest latency win —
   up to 4 sequential remote-DB round trips removed.
4. **Widen the two indexes with `amount` (PERF-03).** Removes the O(n) heap traversal with no
   application state and no risk of drift.
5. **Bundle endpoint (PERF-04).** 4 requests → 1, and 3 discarded `count()` queries gone.
6. **Frontend consumes the bundle (PERF-05).** Ships #5 to users.
7. **Preserve, do not refactor, the `fetchSection` degradation model.** It is already right.
8. **Keep the live-vs-report precedence logic in `getDashboard` untouched.** It is a deliberate,
   documented fix; replacing it with report snapshots would reintroduce a frozen-dashboard bug.
9. **Defer server-side caching (PERF-07) until measured.** The `ownership.ts` in-process pattern is
   there if needed, but no measurement currently justifies it.
10. **Do not denormalize lifetime totals.** The single most valuable thing in this plan is the decision
    *not* to do something clever.

---

## 14. REMAINING UNKNOWNS

| Unknown | Why it matters | How to resolve |
|---|---|---|
| Real row counts in `sales_transactions` / `expenses` | Decides plain `CREATE INDEX` vs `CONCURRENTLY`, and whether PERF-03 matters at all | `SELECT count(*)` — resolve during PERF-01 |
| Actual p95 dashboard latency | The entire plan is prioritized on the assumption this is DB/latency-bound | PERF-01 logging |
| Whether the DB is remote in production | PERF-02's win scales with RTT; a local DB shrinks it | Check `render.yaml` / `DATABASE_URL` host |
| Prisma relation-load strategy (`query` vs `join`) | Determines the true cost of P-4 | PERF-01 query log; if `relationJoins` is enabled, re-measure |
| Rows per `Business` / team size | Whether bundle permission gating needs per-section caching | Only relevant at large team sizes |
| Connection pooling (Neon/PgBouncer) | Only relevant if PERF-07 Redis caching lands later | Verify at PERF-07 time |

---

## 15. FINAL VERDICT

**Biggest strength.** The frontend data layer is genuinely well engineered — parallel sub-requests,
abort-on-switch, stale-while-revalidate, and a `fetchSection` helper whose comment records that it
fixed a real correctness bug. This is the part of the system most likely to have been built carefully
by someone who understood failure modes, and it is exactly why this plan says **do not touch it**.

**Biggest problem.** `getDashboard` issues five sequential `await` stages against a remote database and
reads a ≤60-row table four separate times, because nobody ever sat down and looked at the query count.
It is a plain, unglamorous inefficiency — the kind that survives for years precisely because the
endpoint "feels fast enough" in dev against a local DB.

**Biggest risk if left unchanged.** Not a performance cliff — the system will keep working and slowly
degrade as transaction volume grows, on the most-visited page, for every user, every load. The real
risk is the one I nearly walked into: that someone eventually "optimizes" the two unbounded `SUM`s by
denormalizing counters across 15+ write paths, several of which are not transactional, and ships a
silent drift bug into a system that computes statutory tax.

**Highest-value first move.** PERF-01 and PERF-06 together, in that order — roughly half a day, and
they convert the rest of this plan from opinion into evidence.

**Overall verdict: 🟡 Healthy but needs targeted work.**

The architecture does not need rescuing. It needs four small, well-understood changes and one
observability improvement — and, just as importantly, it needs the discipline to *not* do the clever
thing.