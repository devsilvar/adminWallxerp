# RE-REVIEW #2: `fast2.md` (Dashboard Performance Plan)

**Reviewer posture:** Principal Engineer adversarial re-review per `rereviewplan.md`. `fast2.md` was
treated as a proposal that must earn approval, not as a finished artifact. Every claim was re-checked
against the repository — including the claims **I** made in `fast2.md`.

---

# 1. EXECUTIVE VERDICT

## 🟡 PLAN REQUIRES MINOR REVISION — one blocking defect, six precision gaps

`fast2.md` is a substantial improvement on `fast1.md`. The security regression (E2) is fully
retracted and replaced with a verified-correct approach, the migration error is fixed, the live-DB
hazard is closed, and the query-count arithmetic is now right. The plan's ordering and its insistence
on measurement before modification are good.

**But the plan contains one blocking defect that I introduced, and I did not catch it in the first
review.**

**`fast2.md` Step 3 would regress every restricted-permission user on the platform.**

### The defect

`fast2.md` Step 3 says:

> `getDashboardBundle(...)` → `Promise.all([getDashboard(), listSales(...), listExpenses(...),
> listReports(...)])`
> "Each list call catches independently and populates `failedSections`"

This is wrong, because `verifyBusinessAccess` **throws** rather than returning a null result when a
permission is missing:

```ts
// backend/src/lib/ownership.ts:143-145
if (requiredPermission && !hasPermission(cached.result.role, cached.result.permissions, requiredPermission)) {
  throw new AppError(403, `You do not have permission to perform this action (requires ${requiredPermission})`, 'PERMISSION_DENIED');
}
```

The doc comment states it explicitly at `ownership.ts:127`:
*"@throws AppError 403 PERMISSION_DENIED if user lacks the required permission"*.

So for a team member without `sales.read`:

| | Current behavior | `fast2.md` Step 3 as written |
|---|---|---|
| Frontend gate | `fetchSection` checks `permitted('sales.read')` and **never issues the request** (`Dashboard.tsx:498`) | N/A — server issues it unconditionally |
| Service | not called | `listSales` → `verifyBusinessAccess(…, 'sales.read')` → **throws 403** |
| Result | Clean dashboard, sales section simply absent | 403 caught as a **failure** → `failedSections: ['recent sales']` → **spurious error banner** |

The `fetchSection` three-way model (`Dashboard.tsx:473-488`) exists precisely to distinguish
*not permitted* from *permitted but failed*. My Step 3 collapsed that distinction on the server by
catching a 403 and reporting it as a failure — inverting the meaning of the very field I told the
implementer to populate.

**This is a UX regression for exactly the users the original design protected**, and it contradicts
`fast2.md`'s own acceptance criterion #3 ("a member lacking `sales.read` receives no sales section —
no empty-array stand-in"), which the step as written gives no mechanism to achieve.

### The fix (verified against the code)

`verifyBusinessAccess` **without** a permission argument does **not** throw for missing permissions —
it returns `BusinessAccessResult` (`ownership.ts:12-17`):

```ts
export interface BusinessAccessResult {
  business: Business;
  role: BusinessRole;
  permissions: Record<PermissionKey, boolean>;
  isOwner: boolean;
}
```

And `hasPermission` is already exported from `@/services/team/permission.service.ts:173`. So a
server-side pre-check is straightforward and uses existing code — no new helper required:

```ts
const access = await verifyBusinessAccess(userId, businessId, 'dashboard.read'); // throws only 404/403-not-a-member
const can = (p: PermissionKey) =>
  access.isOwner || hasPermission(access.role, access.permissions, p);
```

Call each list service **only when `can(...)` is true**, and mirror `fetchSection`'s three-way
resolution server-side:

| Condition | Action | `failedSections` |
|---|---|---|
| not permitted | omit the section entirely | **do not touch** |
| permitted, resolved | include data | unchanged |
| permitted, threw | include `null` | push section name |

The remaining steps of `fast2.md` are unaffected.

---

# 2. WHAT WAS WRONG WITH `fast2.md`

| # | Severity | Finding |
|---|---|---|
| R1 | 🔴 | **Step 3 collapses not-permitted into failed** — 403 becomes a spurious error banner. Fix above. |
| R2 | 🟠 | **Step 6 is missing the VACUUM step.** Index-only scans need the visibility map, which `VACUUM` sets. `VACUUM` **cannot run inside a Prisma migration transaction** — same class of error as the `CONCURRENTLY` issue already caught. `ANALYZE` alone is insufficient. |
| R3 | 🟠 | **Step 6 omits the lock behaviour of `DROP INDEX`.** It takes `ACCESS EXCLUSIVE`, blocking all concurrent reads/writes on the table for the duration. Fine at pre-launch row counts; must be stated, not assumed. |
| R4 | 🟡 | **Step 1's test spec omits the `months` argument.** `getDashboard(userId, businessId, trendMonths)` — `trends` length depends on it. The spec says "call `getDashboard()` directly" with no signature. |
| R5 | 🟡 | **Step 2's replacement `findMany` has no `select`.** It would fetch full `MonthlyTaxReport` rows when ~10 fields are needed — repeating the payload inefficiency the plan criticises elsewhere. |
| R6 | 🟡 | **Step 3 omits response unwrapping.** `listSales`/`listExpenses`/`listReports` all return `{ data, pagination }`. The bundle must take `.data`. Also, `listReports` carries `include: { payments: … }` (`tax-report.service.ts:174`) — an extra relation query that will appear in the count. |
| R7 | 🟡 | **Step 4 (authz test) is sequenced after Step 3.** The stronger ordering writes the authz baseline against the *existing* endpoints first, then asserts the bundle matches it. As written, there is no reference behaviour to compare against. |

---

# 3. WHAT WAS WRONG WITH THE ORIGINAL PLAN — confirmed fixed in `fast2.md`

Re-verified, all still correctly handled:

- ✅ **E1** — `fast2.md` correctly specifies `/businesses/:id/tax/dashboard-bundle`.
- ✅ **E2** — the data-exposure regression is retracted; `fast2.md` mandates calling the existing list
  services rather than hand-rolling lean queries.
- ✅ **E3** — `TEST_DATABASE_URL` is now a hard precondition with a guard against falling back to
  `DATABASE_URL`.
- ✅ **E4** — `CREATE INDEX CONCURRENTLY` is correctly excluded from migrations.
- ✅ **E5** — `fast2.md` correctly identifies that `lib/prisma.ts:28` already logs queries in dev, and
  makes Step 0 a zero-code measurement.
- ✅ **E6** — query count corrected to 9 → 5 with the 5 → 3 raw-SQL option explicitly declined.
- ✅ **E7** — index-only scan correctly described as still O(n), with the visibility-map caveat.
- ✅ **E8** — Decimal accumulation is now mandated.

---

# 4. VERIFIED FILE IMPACT (delta from `fast2.md`)

No new files. `hasPermission` already exists and is already exported
(`backend/src/services/team/permission.service.ts:173`) — the fix for R1 needs **no** new helper and
**no** modification to `lib/ownership.ts`.

### MODIFY
| File | What changes vs `fast2.md` |
|---|---|
| `backend/src/services/tax/tax-analytics.service.ts` | `getDashboardBundle` must import `hasPermission` from `@/services/team/permission.service` and pre-check each section before invoking the list service. Unchanged otherwise. |

### DO NOT TOUCH
- `backend/src/lib/ownership.ts` — its throwing behaviour is correct contract, not a bug. The bundle
  must work *with* it, not around it.
- `backend/src/services/team/permission.service.ts` — `hasPermission` is already exported and correct.

---

# 5. CORRECTED IMPLEMENTATION PLAN

Steps 0, 2, 5, 6 stand as written in `fast2.md`, with R2–R7 folded in below.

### STEP 0 — Measure. Zero code changes. (unchanged)
Gates everything. `lib/prisma.ts:28` already logs dev queries. Confirm whether production Postgres is
remote — if local, the waterfall benefit shrinks and the priority order changes.

### STEP 1 — Numeric + authorization baseline tests *(now includes R4 and the R7 reordering)*

Create **two** files before touching any production code:

**`backend/tests/integration/dashboard-numbers.test.ts`**
- **Precondition:** `TEST_DATABASE_URL` set and pointing at a non-production database. Guard:
  throw if the resolved URL equals `DATABASE_URL` (`test-db.ts:7-15` otherwise falls back to live).
- Call **`getDashboard(userId, businessId, 6)`** — the `trendMonths` argument is required and
  determines `trends` length. *(fixes R4)*
- Fixtures include at least one `status: 'pending'` sale, one `isTaxable: false` sale, and one
  `isDeductible: false` expense — all three must be excluded from the sums.
- Assert exact: lifetime sales/expenses, current-month sales/expenses, `lifetime.totalTaxPayable`,
  `lifetime.reportsCount`, `unpaidCount`, and `trends` length + month ordering.
- Plus a zero-row business, and a business with no current-month report (exercises the `live-preview`
  branch at `tax-analytics.service.ts:126`).

**`backend/tests/integration/dashboard-list-authz-baseline.test.ts`** *(fixes R7 — written against the
EXISTING endpoints, before the bundle exists)*
- Business with an `owner` and a `sales_staff` member.
- Owner creates sales/expenses; `sales_staff` calls `listSales` / `listExpenses` directly.
- Record the **exact current row sets** as the reference. These must match
  `sales-crud.service.ts:151-153` (own rows + `source: 'bank_transfer'`) and
  `expense.service.ts:94-96` (own rows + legacy `createdBy: null`).
- If this test fails on unmodified `main`, that is a **pre-existing leak** — report it separately; do
  not fold it into this workstream.

**Exit condition:** both green on unmodified `main`. Anything else is a pre-existing finding.

### STEP 2 — Collapse the sequential waterfall *(plus R5)*

Replace the four `monthlyTaxReport` reads (L27, L75, L97, L153) with a single
`findMany({ where: { businessId }, orderBy: { taxMonth: 'asc' }, select: { …the 10 fields the current
trends query already selects, plus `isFinalized`, `paymentStatus`, `isLocked`, `taxRate`… } })`.
Derive current-month report, trends slice, lifetime sum/count and `unpaidCount` in JS.

- **Accumulate `taxPayable` with `Decimal` arithmetic; one `toNumber()` at the end.** *(R5: the
  `select` matters — do not fetch full rows.)*
- Issue the reports read and the four aggregates in **one `Promise.all`**.
- Leave the live-vs-report precedence logic (L111–150) untouched.
- Preserve the UTC month-bound construction (L18–24) character for character.

**Query count: 9 → 5.**

### STEP 3 — Bundle endpoint *(CORRECTED — replaces `fast2.md` Step 3 in full)*

```ts
// services/tax/tax-analytics.service.ts
import { hasPermission, type PermissionKey } from '@/services/team/permission.service';
import { verifyBusinessAccess } from '@/lib/ownership';

export async function getDashboardBundle(userId: string, businessId: string, months: number) {
  // Throws only on 404 / not-a-member. Does NOT throw for a missing permission.
  const access = await verifyBusinessAccess(userId, businessId, 'dashboard.read');
  const can = (p: PermissionKey) => access.isOwner || hasPermission(access.role, access.permissions, p);

  const failedSections: string[] = [];

  // Mirrors fetchSection()'s three-way outcome on the server.
  const section = async <T>(key: string, perm: PermissionKey, run: () => Promise<T>): Promise<T | null> => {
    if (!can(perm)) return null;              // not permitted → omit, do NOT record a failure
    try { return await run(); }
    catch (err) {
      if (isCanceled(err)) return null;
      failedSections.push(key);
      return null;
    }
  };

  const [dash, sales, expenses, reports] = await Promise.all([
    section('tax summary',    'dashboard.read', () => getDashboard(userId, businessId, months)),
    section('recent sales',   'sales.read',     async () => (await listSales(userId, businessId, { page: 1, limit: 5 })).data),
    section('recent expenses','expenses.read',  async () => (await listExpenses(userId, businessId, { page: 1, limit: 5 })).data),
    section('recent reports', 'tax.read',       async () => (await listReports(userId, businessId, { page: 1, limit: 3 })).data),
  ]);

  return { dashboard: dash, recentSales: sales ?? [], recentExpenses: expenses ?? [], recentReports: reports ?? [], failedSections };
}
```

Key points, each traceable:
- **Pre-check before invoking the service** — this is the R1 fix. `listSales` never runs for a user
  lacking `sales.read`, so `verifyBusinessAccess(…, 'sales.read')` never throws 403, so a permission
  boundary can never be misreported as a failure.
- **`.data` unwrapping** — all three list services return `{ data, pagination }`. *(R6)*
- **`listReports` carries `include: { payments: … }`** (`tax-report.service.ts:174`) — expect an extra
  relation query in the bundle's count. *(R6)*
- **Route:** `router.get('/dashboard-bundle', taxController.dashboardBundle)` in `tax.routes.ts`,
  resolving to `/api/v1/businesses/:businessId/tax/dashboard-bundle`. No collision with `/dashboard`
  or `/reports/:id` — all are literal siblings.
- **Controller** wraps as `{ success: true, data: result }` to match the existing axios `r.data.data`
  pattern.
- **Reuse `dashboardQuerySchema`** (`months`, 1–24).
- **Known trade-off:** ~4× DB work per request under the unchanged rate-limit budget. Do not add a
  tighter limiter; note it for monitoring.

### STEP 4 — Assert the bundle matches the baseline *(replaces `fast2.md` Step 4)*

Extend the baseline file from Step 1 to also call `getDashboardBundle` and assert its `recentSales`
and `recentExpenses` **deep-equal** the row sets recorded from the direct list calls, for both the owner
and the `sales_staff` member. This is the anti-drift guard: if anyone later changes a list service, the
bundle test fails.

Also assert that a member lacking `sales.read` produces `recentSales: []` with an **empty**
`failedSections` — the R1 regression test.

### STEP 5 — Switch the frontend *(plus R7 cleanup)*

Single request to `/businesses/${bid}/tax/dashboard-bundle?months=6`. Keep the `AbortSignal` (`:635`),
the `DashboardBundle` shape, the `failedSections` → `loadErrors` mapping (`:570`), cache seeding
(`:550`), and the invalidation subscription (`:625`).

- **Client-side `hasPerm` gates stay for rendering only.** The component's `PermissionGate`/`hasPerm`
  usage must not be touched — it still controls what is *drawn*.
- The `perms` argument to `fetchDashboardBundle` (`:678`) becomes unused for fetch-gating once the
  server decides. It may be left in place harmlessly; removing it is optional cleanup.
- Do **not** delete `fetchSection`'s three-way rendering logic downstream — only its use as a fetch
  wrapper goes away.

### STEP 6 — Widen the indexes *(plus R2, R3)*

- `(businessId, status, isTaxable, transactionDate)` → append `amount`
- `(businessId, isDeductible, expenseDate)` → append `amount`

Migration file: plain `DROP INDEX` + `CREATE INDEX`. **No `CREATE INDEX CONCURRENTLY`** — Prisma runs
migrations in a transaction and Postgres forbids it.

**After the migration, and outside it:**
```sql
VACUUM (ANALYZE) sales_transactions;
VACUUM (ANALYZE) expenses;
```
`ANALYZE` alone updates planner statistics but does **not** set the visibility map, and `VACUUM`
cannot run inside a transaction. Without this, index-only scans may still perform heap fetches and the
expected gain will not materialise. *(fixes R2)*

**Locking:** `DROP INDEX` takes `ACCESS EXCLUSIVE`, blocking reads and writes on the table for the
duration. At pre-launch row counts this is milliseconds. If the table has grown large, run both
statements manually with `DROP INDEX CONCURRENTLY` / `CREATE INDEX CONCURRENTLY` via `psql`, then
`prisma migrate resolve --applied <name>`. *(fixes R3)*

**Honest framing, unchanged:** this converts a heap walk into an index-only scan. Still O(n); better
constant. Do it only if Step 0 shows the aggregates are actually slow.

---

# 6. ACCEPTANCE CRITERIA

All `fast2.md` criteria stand, plus:

15. **A member lacking `sales.read` receives `recentSales: []` with an EMPTY `failedSections`** and no
    error banner. *(R1 — the regression this review found.)*
16. The bundle's `recentSales`/`recentExpenses` deep-equal the direct list-service results for both an
    owner and a `sales_staff` member. *(R7)*
17. `getDashboard` is called in tests as `getDashboard(userId, businessId, 6)` and `trends` length
    matches that window. *(R4)*
18. The replacement reports `findMany` uses an explicit `select`. *(R5)*
19. `VACUUM (ANALYZE)` is run outside the migration on both tables. *(R2)*

---

# 7. REMAINING QUESTIONS

Unchanged from `fast2.md`, none blocking:

1. Is production Postgres remote? Determines whether Step 2's benefit is real.
2. Is `TEST_DATABASE_URL` set and separate? Determines whether Step 1 is safe to run at all.
3. Real row counts in `sales_transactions` / `expenses`? Determines Step 6's migration strategy.
4. Does the team have any non-owner role beyond `sales_staff` in practice? The baseline test should
   cover every role that exists in `BusinessRole`.

---

# 8. FINAL READINESS SCORE

## 7.5 / 10 — minor clarification needed; **blocked on one fix**

**On `fast2.md` as submitted:** materially better than `fast1.md` and correct on every point the first
review raised — the security regression is genuinely retracted, the migration and live-DB errors are
closed, the arithmetic is right, and the measurement-first ordering is right. What it still gets wrong
is narrower and more humbling: I told the implementer to reuse a permission model's *error semantics*,
whereas that model's whole purpose is to distinguish "not permitted" from "failed" — and catching a
403 as a failure inverts it. That is the kind of error that survives review because the surrounding
reasoning is sound; it only surfaces when you go read what the function actually throws.

**On this revision:** implementation-ready once R1 is applied. R1 needs no new files and no new
helper — `hasPermission` is already exported and `verifyBusinessAccess` already returns the
permission map. R2–R7 are precision gaps that would each have cost an hour of debugging, not a
production incident.

**To reach 9–10:** apply R1–R7, answer the four questions in §7, and run Step 0. If Step 0 shows the
aggregates are not hot, **drop Step 6 entirely.** If production Postgres turns out to be local,
**re-rank Step 2 and Step 6** — the plan is sequenced for the remote-database case, and that is the one
assumption in it that has not been verified against the actual deployment.