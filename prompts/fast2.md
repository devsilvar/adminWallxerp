# RE-REVIEW: `fast1.md` (Dashboard Performance Plan)

**Reviewer posture:** Principal Engineer review per `rereviewplan.md`. The existing plan was treated as
a proposal that must earn approval. Every load-bearing claim was re-verified against the repository.

**Sources of truth:** original intent (make the dashboard load faster) · existing codebase
(authoritative for current behavior) · `fast1.md` (proposal under review).

---

# 1. EXECUTIVE VERDICT

## 🟡 PLAN REQUIRES SIGNIFICANT REVISION

**The diagnosis is correct and independently confirmed. The implementation guidance is not safe to
follow as written.**

I re-verified the plan's central claims against the code. All three core findings hold up:

- The **5-stage sequential `await` waterfall** in `getDashboard` is real — `tax-analytics.service.ts`
  lines 27, 37, 75, 97, 153 are five separate awaited statements, not one concurrent stage.
- The **two unbounded `SUM` aggregates** (`liveSalesAgg`, `liveExpenseAgg`, lines 39–48) genuinely
  carry no date bound, and `amount` is genuinely absent from both tax-calculation indexes.
- The **4-HTTP-request / ~15-query** page load is real.

However, executing the plan verbatim would produce **four blocking defects**, one of which is a
**data-exposure regression**:

| # | Severity | Defect |
|---|---|---|
| E1 | 🔴 | PERF-05 specifies the **wrong URL**. As written it 404s. |
| E2 | 🔴 | PERF-04's "lean queries" strip **authorization and `sales_staff` row filters**, exposing other users' sales and expenses. |
| E3 | 🔴 | PERF-06 can **write to the live production database** if `TEST_DATABASE_URL` is unset. |
| E4 | 🔴 | PERF-03's `CREATE INDEX CONCURRENTLY` guidance **fails inside a Prisma migration transaction**. |
| E5 | 🟠 | PERF-01 is ~80% redundant — the instrumentation it proposes adding **already exists**. |
| E6 | 🟠 | "Query count drops 9 → 3" is **wrong. It is 9 → 5.** |
| E7 | 🟠 | PERF-03's benefit is **overstated**: index-only scan is still O(n), not O(1). |
| E8 | 🟡 | Decimal summation moved into JS introduces an **unmentioned rounding risk**. |
| E9 | 🟡 | Bundle endpoint does **4× DB work under an unchanged rate limit**. |

**None of these undermine the plan's direction.** They are implementation-detail errors, three of them
introduced by recommending "lean queries" without reading what those queries actually carry. The fix
is to keep the architecture and rewrite PERF-01, PERF-03, PERF-04 and PERF-06.

**One pleasant surprise worth stating plainly:** the fastest way to validate this entire plan requires
**zero code changes** — see E5.

---

# 2. WHAT WAS WRONG WITH THE OLD PLAN

### 🔴 E1 — PERF-05 specifies a URL that does not exist

**Old plan:** `GET /businesses/${bid}/dashboard-bundle?months=6`

**Reality:** `backend/src/routes/index.ts:56` mounts tax routes at
`v1.use('/businesses/:businessId/tax', taxRoutes)`, and `tax.routes.ts` declares each path relative
to that prefix. Every existing route in that file is `/calculate`, `/reports`, `/dashboard`,
`/analytics`. A bundle route added there resolves to:

```
/api/v1/businesses/:businessId/tax/dashboard-bundle
```

A developer following `fast1.md` literally would implement a route that returns 404, then debug it.
**Fix:** pin the full path in both PERF-04 and PERF-05.

### 🔴 E2 — PERF-04's "lean queries" recommendation is a data-exposure regression

This is the most serious finding. `fast1.md` instructs:

> "use purpose-built lean queries with an explicit `select` … **do not** call
> `listSales`/`listExpenses`/`listReports` directly. Those build a pagination envelope and run a
> `count()` whose result this page discards, and `listSales` pulls accrual relations the dashboard
> never renders."

The plan never checked what else those functions carry. They carry **access control**:

```ts
// backend/src/services/sales/sales-crud.service.ts:147-153
const access = await verifyBusinessAccess(userId, businessId, 'sales.read');
const where: any = { businessId };
if (access.role === 'sales_staff') {
  where.OR = [{ createdBy: userId }, { source: 'bank_transfer' }];
}
```

```ts
// backend/src/services/expense/expense.service.ts:91-96
const access = await verifyBusinessAccess(userId, businessId, 'expenses.read');
const where: any = { businessId };
if (access.role === 'sales_staff') {
  where.OR = [{ createdBy: userId }, { createdBy: null }];   // null policy for legacy rows
}
```

Two things are enforced there, and a hand-rolled lean query silently drops both:

1. **The permission check itself** — `verifyBusinessAccess(…, 'sales.read')` / `'expenses.read'`.
2. **Role-based row filtering** with *different* semantics per table (sales: own rows + bank transfers;
   expenses: own rows + legacy null-createdBy rows).

The old plan did mention "preserve the per-section permission gating," but framed it as a frontend
concern inherited from `fetchSection`. It is primarily a **backend** obligation, and it is stricter
than the frontend gate: the frontend's `hasPerm` (`PermissionGate.tsx:12`, owner-bypass + a
`myPermissions` map) is a *rendering* convenience. **The backend is the only real boundary.**

Net effect if implemented as written: a `sales_staff` team member requests the bundle and receives
**every sale and every expense in the business**, not just their own. This is a cross-tenant data leak
introduced by a performance plan.

**Fix:** PERF-04 must **call the existing list services**, or replicate `verifyBusinessAccess` + the
exact per-table `sales_staff` filter, verified by test.

### 🔴 E3 — PERF-06 can write to the production database

**Old plan:** "Using the existing `tests/helpers/test-db.ts` harness, create a business with a known
set of sales and expenses…"

```ts
// backend/tests/helpers/test-db.ts:7-15
export const testDb = new PrismaClient(
  process.env.TEST_DATABASE_URL
    ? { datasources: { db: { url: process.env.TEST_DATABASE_URL } }, … }
    : { transactionOptions: { maxWait: 30_000, timeout: 30_000 } }   // ← falls back to DATABASE_URL
);
```

With `TEST_DATABASE_URL` unset, the harness binds to the **live** database. `test-db.ts` has
`captureBaseline()` protection, but that prevents *deleting* pre-existing accounts — it does not
prevent *creating* new ones. PERF-06 would write a business plus sales and expenses rows into
production, and `prisma.ts:31` confirms the environment is a **remote Supabase pooler**, i.e. a real
shared database.

**Fix:** hard precondition — verify `TEST_DATABASE_URL` is set and points at a separate database
*before* running PERF-06, and fail loudly otherwise.

### 🔴 E4 — `CREATE INDEX CONCURRENTLY` cannot run inside a Prisma migration

**Old plan:** "hand-write the migration SQL rather than letting Prisma emit `DROP`+`CREATE`; use
`CREATE INDEX CONCURRENTLY` if the row count warrants it."

Prisma executes each `migration.sql` file **inside a transaction**. PostgreSQL rejects
`CREATE INDEX CONCURRENTLY` inside a transaction block. A hand-written migration containing it would
**fail the deploy**.

**Fix:** two valid paths — (a) plain `CREATE INDEX` inside the normal migration (correct and simple
given pre-launch row counts), or (b) run `CONCURRENTLY` manually via `psql`, then reconcile the
migration history with `prisma migrate resolve --applied <name>`.

### 🟠 E5 — PERF-01 is mostly redundant; measurement is available today

**Old plan:** "Add `log: [{ emit: 'event', level: 'warn' }, …]` to the PrismaClient constructor and
register a `$on('query', …)` handler."

```ts
// backend/src/lib/prisma.ts:27-30  — ALREADY PRESENT
return new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
  …
```

Dev-mode query logging **already exists**. `PERF-01`'s real remaining gap is narrower than stated:
there is **no duration threshold** (every query logs, so signal-to-noise is poor on a busy page) and
**no production visibility** (`['error']` only).

**Consequence for sequencing:** the user can run `npm run dev`, load the dashboard, and read per-query
timings **right now, with zero code changes**. The plan front-loads a work item to obtain evidence that
is already available.

### 🟠 E6 — "Query count drops from 9 to 3" is arithmetically wrong

**Old plan:** "Query count for `getDashboard` drops from 9 to 3."

Counting precisely:

| Query | Now | After |
|---|---|---|
| `monthlyTaxReport.findUnique` (current month) | 1 | merged |
| `monthlyTaxReport.findMany` (trends) | 1 | merged |
| `monthlyTaxReport.aggregate` (lifetime) | 1 | merged |
| `monthlyTaxReport.count` (unpaid) | 1 | merged |
| `monthlyTaxReport.findMany` (all, new) | — | 1 |
| sales lifetime aggregate | 1 | 1 |
| sales month aggregate | 1 | 1 |
| expense lifetime aggregate | 1 | 1 |
| expense month aggregate | 1 | 1 |
| **Total** | **9** | **5** |

Reaching 3 would require collapsing sales-lifetime + sales-month into one query, and likewise for
expenses — which needs `SUM(amount) FILTER (WHERE …)`, a **raw-SQL** construct Prisma's query API does
not expose. That adds raw SQL, manual `Decimal` parsing, and a divergence from the codebase's
Prisma-everywhere pattern, to save two queries that already run **concurrently**.

**Fix:** state 9 → 5. Note in the plan that 5 → 3 is deliberately declined as complexity without
measurable benefit. The win is eliminating *sequencing*, not query count.

### 🟠 E7 — PERF-03's benefit is overstated

**Old plan:** prioritization table claims PERF-03 "Removes O(n) read"; change write-up says "Removes
the O(n) heap traversal."

Appending `amount` to the indexes converts the aggregate into an **index-only scan**. That eliminates
**heap page access** — a large constant-factor win, since index tuples are smaller and contiguous. But
the scan still visits **every matching index entry**. It remains **O(n)** in rows. It is not O(1).

Two further caveats the plan omits:
- **Visibility map dependency.** An index-only scan skips the heap only for pages whose all-visible bits
  are set. Rows inserted or updated since the last `VACUUM` still trigger heap fetches, so benefit
  varies with write volume and autovacuum cadence.
- **The `status IN ('confirmed','completed')` predicate** is an array operation against a btree-ordered
  column. Postgres handles it, but it is not a clean single-range scan — a real plan check is
  required, not an assumption.

**Fix:** restate the claim accurately and make the `EXPLAIN (ANALYZE, BUFFERS)` check the acceptance
gate rather than a formality.

### 🟡 E8 — Decimal summation moved into JS introduces rounding risk

**Old plan:** silent on numeric precision.

Today, `lifetime.totalTaxPayable` comes from Postgres `SUM(numeric)` — **exact**. PERF-02 moves that to
JS. The existing code calls `toNumber()` per value (`tax-analytics.service.ts:176`), and a naive
implementation would accumulate 60 `number` values in a float loop. IEEE-754 accumulation across
monthly tax figures can produce visible drift in a displayed monetary value on a tax product.

**Fix:** mandate `Decimal` accumulation (Prisma's `Decimal`), with a single `toNumber()` at the end —
matching how the codebase already treats money elsewhere.

### 🟡 E9 — Bundle endpoint multiplies per-request cost under an unchanged rate limit

Global limiter is 10,000 per 15 min (`config/index.ts:225`). The bundle does roughly 4× the database
work of a single request under the same budget, so any client-side retry loop becomes 4× more
expensive. Not a blocker; should be stated as a known trade-off with a monitoring note.

### 🟢 Verified correct — keep these

- **The waterfall.** Lines 27, 37, 75, 97, 153 are five sequential awaits. Confirmed.
- **9 queries today.** Confirmed.
- **`services/tax.service.ts` is a barrel** (`export * from './tax/tax-analytics.service'`), so a new
  export from `tax-analytics.service.ts` reaches the controller with no extra wiring. The old plan's
  file choice is right.
- **Blast radius is tiny.** `grep -rn "getDashboard"` shows exactly one caller:
  `controllers/tax.controller.ts:104`. (The `admin.controller.ts` hit is an unrelated
  `getDashboardStats`.)
- **Unbounded aggregates carry no date bound**, and `amount` is absent from both `idx_sales_tax_calc`
  and `idx_expense_tax_calc`. Confirmed.
- **Reusing `AbortController` in PERF-05**, not deleting it. Correct.
- **Per-item rollback isolation.** Correct and worth keeping.

---

# 3. WHAT CHANGED

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| "9 queries → 3" | ✏️ Corrected | **9 → 5** | 3 requires raw SQL `FILTER`; saving 2 queries that already run concurrently is not worth raw SQL + manual Decimal parsing |
| PERF-01 adds Prisma query logging | 🔄 Replaced | **Measure today with existing `log: ['query']`; then add a duration threshold** | `lib/prisma.ts:28` already logs in dev. Evidence is available with zero code change |
| PERF-04 uses "lean queries", not the list services | ❌ **Reversed** | **Call the existing services.** Optional opt-in lean mode only if PERF-01 justifies it | Hand-rolled queries drop `verifyBusinessAccess` **and** `sales_staff` row filters → data leak |
| PERF-05 calls `/businesses/:id/dashboard-bundle` | ✏️ Corrected | **`/businesses/:id/tax/dashboard-bundle`** | `routes/index.ts:56` mounts tax routes under `/tax` |
| PERF-03: "use `CREATE INDEX CONCURRENTLY` in a migration" | ✏️ Corrected | **Plain `CREATE INDEX`, or manual `psql` + `migrate resolve`** | `CONCURRENTLY` cannot run in a Prisma migration transaction |
| PERF-03: "removes the O(n) read" | ✏️ Corrected | **Converts heap walk → index-only scan; still O(n)** | Honest asymptotics; visibility-map caveat added |
| PERF-06: "use the existing test-db harness" | ✏️ Hardened | **Verify `TEST_DATABASE_URL` is set and separate; fail loudly otherwise** | Harness silently falls back to the live DB |
| PERF-02: precision unaddressed | ➕ Added | **Accumulate in `Decimal`, single `toNumber()` at the end** | Avoids float drift on displayed tax figures |
| — | ➕ Added | **`sales_staff` row-filter regression test** | Guards the E2 leak permanently |
| — | ➕ Added | **Rate-limit note on the bundle endpoint** | Honest accounting of E9 |
| Order: 01 → 06 → 02 → 03 → 04 → 05 | 🔄 Reordered | **Measure (no code) → PERF-06 → PERF-04/05 → PERF-02 → PERF-03** | Measurement is free and should gate everything; PERF-03 last, since it is the only optional-if-unproven item |

---

# 4. VERIFIED FILE IMPACT

Recalculated from the repository, not inherited from `fast1.md`.

### CREATE
| File | Why |
|---|---|
| `backend/tests/integration/dashboard-numbers.test.ts` | Numeric regression contract for `getDashboard`. Not present today. |
| `backend/tests/integration/dashboard-bundle-authz.test.ts` | Guards the E2 leak: `sales_staff` must not see other users' rows. |

### MODIFY
| File | Current role | What changes |
|---|---|---|
| `backend/src/services/tax/tax-analytics.service.ts` | `getDashboard` (L10–182) + `getTaxAnalytics` | Collapse the sequential waterfall; add `getDashboardBundle`. `services/tax.service.ts` re-exports via `export *`, so no barrel change needed. |
| `backend/src/controllers/tax.controller.ts` | `dashboard` (L102) + analytics | Add a `dashboardBundle` handler mirroring `dashboard`. |
| `backend/src/routes/tax.routes.ts` | Routes mounted at `/businesses/:businessId/tax` | Add `router.get('/dashboard-bundle', taxController.dashboardBundle)`. |
| `backend/prisma/schema.prisma` | `SalesTransaction:162`, `Expense:208` | Append `amount` to `idx_sales_tax_calc` and `idx_expense_tax_calc`. |
| `backend/prisma/migrations/<ts>_dashboard_covering_indexes/migration.sql` | — | Drop + recreate both indexes with `amount` appended, plus `ANALYZE`. |
| `backend/src/lib/prisma.ts` | Prisma singleton, L27–30 | **Optional** — add a duration threshold to the existing dev query log. Not required to proceed. |
| `frontend/src/pages/Dashboard.tsx` | `fetchDashboardBundle` (L490–533) | Point the single request at the corrected URL. |

### DELETE
None. Every existing endpoint, service and page is retained.

### DO NOT TOUCH
- `backend/src/lib/ownership.ts` — `verifyBusinessAccess` and its 60s cache are correct.
- `backend/src/services/sales/sales-crud.service.ts` — the `sales_staff` row filter is load-bearing.
- `backend/src/services/expense/expense.service.ts` — same, with different null-policy semantics.
- `backend/tests/helpers/test-db.ts` — the baseline-protection logic is sound.
- `frontend/src/components/auth/PermissionGate.tsx` — rendering-layer gate, not a security boundary.
- `frontend/src/lib/cache.ts`, `frontend/src/stores/dashboard.store.ts` — correct as-is.

### DATABASE
- **Models:** none added or removed.
- **Indexes:** two widened by one trailing column. Additive; no data migration, no backfill.
- **Constraints:** none.

### CONFIGURATION
- None required. `TEST_DATABASE_URL` must be **verified as set** before PERF-06, but is not a new variable.

### TESTS
- CREATE `dashboard-numbers.test.ts`, `dashboard-bundle-authz.test.ts`.
- MODIFY `backend/tests/e2e/api.e2e.test.ts` — add a `GET /tax/dashboard-bundle → 200` case alongside
  the existing assertion at L866.

---

# 5. IMPROVED IMPLEMENTATION PLAN

### STEP 0 — Measure. Zero code changes. (gates everything)

`lib/prisma.ts:28` already logs every query in development. Run `npm run dev`, load the dashboard,
read the console. Record for `GET /tax/dashboard`: the count of queries and each one's duration.
Confirm from `DATABASE_URL` / `render.yaml` whether production Postgres is remote — **if it is local,
the waterfall fix's benefit shrinks substantially and the priority order below should change.**

**Exit condition:** you can state the actual query count and the actual DB time.

### STEP 1 — Add the numeric regression test *(before touching any query)*

Create `backend/tests/integration/dashboard-numbers.test.ts`.

- **Precondition:** confirm `TEST_DATABASE_URL` is set and points at a database that is **not**
  production. `test-db.ts:7-15` silently falls back to the live datasource otherwise. Add an explicit
  guard in the test file that throws if the resolved URL equals `DATABASE_URL`.
- **Fixtures:** one business, N sales and M expenses with known amounts. Include at minimum one
  `status: 'pending'` sale and one `isTaxable: false` sale (must be excluded), and one
  `isDeductible: false` expense (must be excluded). Follow the existing
  `captureBaseline()`/cleanup pattern in `tests/helpers/test-db.ts`.
- **Assertions:** exact values for lifetime sales, lifetime expenses, current-month sales/expenses,
  `lifetime.totalTaxPayable`, `lifetime.reportsCount`, `unpaidCount`, and `trends` length + month
  ordering. Plus a zero-row business, and a business with no current-month report (exercises the
  `live-preview` branch at `tax-analytics.service.ts:126`).
- **Exit condition:** green on **unmodified `main`**. If it fails on `main`, stop — that is a
  pre-existing finding, not something to fix inside this step.

### STEP 2 — Collapse the sequential waterfall

**Where:** `backend/src/services/tax/tax-analytics.service.ts`, `getDashboard` (L10–182).
**Why:** five sequential awaits to a remote DB; four read a ≤~60-row table.
**Depends on:** Step 0, Step 1.

1. Replace the four `monthlyTaxReport` reads (L27, L75, L97, L153) with one
   `findMany({ where: { businessId }, orderBy: { taxMonth: 'asc' } })`. Derive in JS: the current-month
   report, the trends slice, `lifetime` sum/count, `unpaidCount`.
2. **Accumulate `taxPayable` with `Decimal` arithmetic, not `number`.** One `toNumber()` at the very
   end. Postgres `SUM(numeric)` is exact today; a float accumulator is not.
3. Restructure so the reports read and the four aggregates are issued in **one `Promise.all`**.
4. Leave the live-vs-report precedence logic (L111–150) untouched.
5. Preserve the UTC month-bound construction (L18–24) character for character.

**Query count: 9 → 5.** Reaching 3 would need raw SQL `SUM(...) FILTER (WHERE ...)`; declined
deliberately.

**Exit condition:** Step 1 green; response identical except `trends` contains the same rows in the
same order.

### STEP 3 — Add the bundle endpoint

**Where:** `tax-analytics.service.ts` (new export), `controllers/tax.controller.ts`,
`routes/tax.routes.ts`.
**Why:** four requests → one; one auth check instead of four.
**Depends on:** Step 2.

1. `getDashboardBundle(userId, businessId, months)` → `Promise.all([getDashboard(), listSales(...),
   listExpenses(...), listReports(...)])`.
2. **Call the existing list services. Do not hand-roll lean queries.** They carry
   `verifyBusinessAccess(...)` **and** the per-table `sales_staff` row filter
   (`sales-crud.service.ts:151`, `expense.service.ts:94`). Accept the `count()` for now — Step 0 may
   show it is not worth optimising.
3. Each list call catches independently and populates `failedSections`, preserving the
   permitted/ok/failed distinction recorded at `Dashboard.tsx:470`.
4. Route: `router.get('/dashboard-bundle', taxController.dashboardBundle)` in `tax.routes.ts`, which
   resolves to **`/api/v1/businesses/:businessId/tax/dashboard-bundle`**.
5. Reuse `dashboardQuerySchema` (`months`, 1–24).
6. **Known trade-off:** ~4× DB work per request under the same rate-limit budget. Do not add a tighter
   limiter; note it for monitoring.

**Exit condition:** Step 1 green; bundle returns all four sections; existing endpoints unchanged.

### STEP 4 — Add the `sales_staff` authorization regression test

Create `dashboard-bundle-authz.test.ts`. This directly guards E2.

- Create a business with two members: one `owner`, one `sales_staff`.
- Member A (owner) creates sales and expenses. Member B (`sales_staff`) calls the bundle.
- **Assert:** B's `recentSales` contains only B's own rows + `bank_transfer` rows, and only B's own
  expenses + legacy `createdBy: null` rows — matching `sales-crud.service.ts:151-153` and
  `expense.service.ts:94-96` exactly.
- **Assert:** a member without `sales.read` gets no sales section at all.

**Exit condition:** green. If this test fails on current `main`, that is a **pre-existing leak** —
report it separately rather than folding it into this workstream.

### STEP 5 — Switch the frontend to the bundle

**Where:** `frontend/src/pages/Dashboard.tsx` (L490–533).
**Depends on:** Step 3.

Single request to `/businesses/${bid}/tax/dashboard-bundle?months=6`. **Keep** the `AbortSignal`
(`:635`), the `DashboardBundle` shape, the `failedSections` → `loadErrors` mapping (`:570`), the
cache seeding (`:550`), and the invalidation subscription (`:625`). Change nothing else.

**Exit condition:** Network tab shows one request; business-switch still aborts; warm visits still
render without a spinner.

### STEP 6 — Widen the two indexes *(do this last; it is the only optional item)*

**Where:** `schema.prisma` + one migration.
**Depends on:** Step 0 confirming the aggregates are actually slow.

- `(businessId, status, isTaxable, transactionDate)` → append `amount`
- `(businessId, isDeductible, expenseDate)` → append `amount`

Write the migration as plain `DROP INDEX` + `CREATE INDEX` + `ANALYZE`. **Do not use
`CREATE INDEX CONCURRENTLY` inside a Prisma migration** — Prisma runs migration files in a transaction
and Postgres forbids it. If the table turns out to be large, run `CONCURRENTLY` manually via `psql`
and then `prisma migrate resolve --applied <migration_name>`.

**Honest framing:** this does not make the read O(1). It converts a heap walk into an index-only scan
— same asymptotics, better constant — and index-only scans still need heap access for pages whose
visibility bits aren't set. **Do this only if Step 0 shows the aggregates matter.**

**Exit condition:** `EXPLAIN (ANALYZE, BUFFERS)` shows index-only scan or reduced heap fetches; no
regression in the month-scoped aggregates or `listSales`.

---

# 6. ACCEPTANCE CRITERIA

**Correctness — non-negotiable**
1. Step 1's numeric test passes **before and after** every subsequent step, with identical values.
2. `sales_staff` cannot obtain another user's sales or expenses through any dashboard path (Step 4).
3. A member lacking `sales.read` receives no sales section — no empty-array stand-in.
4. One section failing yields `failedSections` naming it while the other three still render.

**Performance**
5. `getDashboard` issues its queries in **one concurrent stage**; no sequential `await` chain remains.
6. Query count is **5**, not 3, and not 9.
7. Dashboard load is **one HTTP request**.
8. Any index change is justified by captured `EXPLAIN (ANALYZE)` evidence, not assumption.

**Preservation**
9. `/tax/dashboard`, `/sales`, `/expenses`, `/tax/reports` all still return 200 with unchanged shapes.
10. UTC month-bound logic (`tax-analytics.service.ts:18-24`) and the live-vs-report precedence logic
    (`:111-150`) are byte-identical.
11. Displayed monetary values match `main` exactly — no float drift.
12. Abort-on-business-switch, cache seeding and invalidation refetch all still work.

**Operational**
13. No migration contains `CREATE INDEX CONCURRENTLY`.
14. No test writes to a database identified by `DATABASE_URL`.

---

# 7. REMAINING QUESTIONS

1. **Is production Postgres remote?** `prisma.ts:31` says test/dev use a remote Supabase pooler, but
   the production host is unconfirmed. If production DB is local, Step 2's benefit shrinks and Step 6
   may become irrelevant. **Answer by inspecting `DATABASE_URL` / `render.yaml`.**
2. **Is `TEST_DATABASE_URL` actually set?** Determines whether Step 1 is safe to run at all.
3. **What are the real row counts in `sales_transactions` / `expenses`?** Determines whether Step 6's
   plain `CREATE INDEX` is acceptable or needs the manual `CONCURRENTLY` path.
4. **Does Prisma use `relationJoins` here?** Not enabled in `prisma.ts:27-36`, so relation loading is
   `query` strategy — relevant only if a future optimization targets `listSales` payload size.

None of these block Steps 0–2. All four should be answered before Step 6.

---

# 8. FINAL READINESS SCORE

## 6 / 10 — **Significant issues remain in the original plan; the revised plan is implementation-ready.**

**On `fast1.md` as submitted:** the architecture and diagnosis are strong — the waterfall finding is
genuinely valuable, the self-correction on rejecting denormalized counters was the right call, and the
"DO NOT CHANGE" section correctly protects a well-built frontend. But it is not safe to hand to a
coding agent. Four blocking defects: a URL that 404s, an index migration that fails its transaction, a
test that can write to production, and — most seriously — a recommendation whose implementation would
have leaked `sales_staff` users' sales and expenses. That last one is the kind of error that survives
code review because it looks like a sensible performance micro-optimization; it is only caught by
asking what a function carries *besides* its return value.

**On the revised plan above:** implementation-ready. Every file path is verified, every claim is traced
to code, the ordering has measurement before modification and the optional item last, the two
security-relevant behaviors are explicitly protected with regression tests, and the one genuinely
uncertain item (index widening) is gated behind evidence rather than assumed.

**To reach 9–10:** answer the four questions in §7 and confirm Step 0's measurements. If the
aggregates turn out not to be hot, **drop Step 6 entirely** — a smaller correct plan beats a complete
one.