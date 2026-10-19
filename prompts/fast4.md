# RE-REVIEW #3: `fast3.md` (the R1 fix)

**Reviewer posture:** Principal Engineer adversarial re-review per `rereviewplan.md`. A third pass is
only worth doing if it attacks the previous pass rather than restating it — so this review takes
`fast3.md` as the artifact under test and re-verifies **its own claims against the code**, including
the code sample it handed the implementer.

---

# 1. EXECUTIVE VERDICT

## 🟡 PLAN REQUIRES MINOR REVISION — two defects in the previous review, both mine

`fast3.md`'s R1 fix — the blocking finding from pass two — **holds up under re-derivation.** I
traced `resolvePermissions` for idempotency and confirmed the recommended call is functionally
correct. That was the finding that mattered and it is sound.

But two defects survive into it, and both were introduced by me in pass two:

| | Severity | Finding |
|---|---|---|
| **F1** | 🔴 | **The Step 3 code sample calls `isCanceled(err)`, which does not exist in the backend.** It is `Dashboard.tsx:457`, an axios helper. Copy-pasting the sample yields a `ReferenceError` or a wrong import. |
| **F2** | 🟠 | **The headline metric is wrong and, more importantly, mis-framed.** `getDashboard` issues **8** queries, not 9. And the number that actually matters — sequential round trips — is **never stated anywhere** in `fast1`, `fast2`, or `fast3`. The true figure is **5 → 1**, a far stronger result than the plan claims, and its absence undercuts the Step 0 go/no-go decision. |
| **F3** | 🟡 | `hasPermission(access.role, access.permissions, p)` passes an **already-resolved** permission map into the parameter named `overrides`. Verified idempotent, so it is *correct* — but it reads like a bug and can be deleted outright. |
| **F4** | 🟡 | Step 2's replacement `select` silently truncates `currentMonth`'s shape. No live break today; a latent silent-failure trap tomorrow. |
| **F5** | 🟡 | Step 2's `select` description is self-contradictory — it asks for four fields already in the ten it names. |
| **F6** | 🟡 | Step 3 does not say *where* in `tax.routes.ts` the route goes. |

`fast3.md` is otherwise the most accurate artifact of the three. Its §3 re-verification of the
first-pass findings (E1–E8) is all still correct.

---

# 2. WHAT WAS WRONG WITH `fast3.md`

## F1 — 🔴 `isCanceled` is a frontend axios helper, not a backend function

`fast3.md`'s Step 3 — the single most copy-paste-able artifact in the plan — contains:

```ts
catch (err) {
  if (isCanceled(err)) return null;
  failedSections.push(key);
  return null;
}
```

`isCanceled` is defined at `frontend/src/pages/Dashboard.tsx:457-460`:

```ts
/**
 * axios surfaces an aborted request as ERR_CANCELED. We abort in-flight
 * dashboard requests on business switch and unmount, so a cancellation is a
 * consequence of navigation — never report it to the user as a load failure.
 */
function isCanceled(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | null;
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError';
}
```

A repo-wide search for `isCanceled|isCancelled|cancelled|canceled` across `backend/src` returns
**no such helper**. It is module-local to a different package and matches axios error shapes the
server never produces.

**The branch is not merely misplaced — it is meaningless server-side.** There is no cancellation
propagation from an aborted HTTP request into Prisma. When the client aborts, the socket closes;
in-flight queries run to completion and are discarded. The server never sees `ERR_CANCELED`.

**Fix:** delete the branch. `catch { failedSections.push(key); return null; }` is the whole correct
implementation. Handling a condition that cannot occur in this stack is exactly the speculative
defensiveness the codebase does not otherwise have.

## F2 — 🟠 The query arithmetic is wrong, and the real metric is missing entirely

I counted every Prisma call in `getDashboard` (`tax-analytics.service.ts:10-182`) against source:

| Line | Call | Queries | Round trip |
|---|---|---|---|
| 27 | `monthlyTaxReport.findUnique` | 1 | **RT1** |
| 39 | `salesTransaction.aggregate` | 1 | **RT2** |
| 45 | `expense.aggregate` | 1 | **RT2** |
| 49 | `salesTransaction.aggregate` | 1 | **RT2** |
| 59 | `expense.aggregate` | 1 | **RT2** |
| 75 | `monthlyTaxReport.findMany` (trends) | 1 | **RT3** |
| 97 | `monthlyTaxReport.aggregate` (`_sum` + `_count`) | 1 | **RT4** |
| 153 | `monthlyTaxReport.count` | 1 | **RT5** |

**Total: 8 queries across 5 sequential round trips.** Not 9. `fast2.md` "corrected" 9→3 to 9→5;
the numerator was never re-checked. Lines 39–63 share one `Promise.all`, so they are one round
trip carrying four queries — that is the error the earlier count fell into.

**Why round trips, not queries, is the metric that matters.** Against a remote pooler
(`lib/prisma.ts:31` confirms remote Supabase), latency is dominated by network RTT. The plan's
entire thesis is "collapse the sequential waterfall" — yet no version of the plan ever states the
waterfall depth. It is 5.

**And the corrected Step 2 does better than the plan claims.** `trendStart` and `currentMonthStart`
derive only from `now` and `trendMonths` (`L71-73`, `L22-23`). The collapsed reports `findMany`
therefore has **no dependency on the four aggregates** and can join the existing `Promise.all`:

```
Today:  RT1 ── RT2 ── RT3 ── RT4 ── RT5                      = 5 round trips, 8 queries
After:  RT1  (4 aggregates + 1 reports findMany, concurrent)  = 1 round trip,  5 queries
```

**5 → 1 round trips.** That is the number Step 0 should be measured against, and it is the number
that should justify the work. "9 → 5 queries" reads as a modest trim; "5 → 1 round trips" is a
five-fold cut in serialized network wait — the actual latency win.

## F3 — 🟡 `hasPermission` is handed a resolved map as its `overrides` argument

`fast3.md` §5 Step 3:

```ts
const can = (p: PermissionKey) => access.isOwner || hasPermission(access.role, access.permissions, p);
```

But the signature is `hasPermission(role, overrides, permission)`, and the body is
`resolvePermissions(role, overrides)[permission]` (`permission.service.ts:173-179`). `overrides` is
expected to be a *sparse* map of grants, not a full resolved map.

**I traced whether this is a live bug. It is not — `resolvePermissions` is idempotent.** Writing
`X = resolvePermissions(role, o)`, then `resolvePermissions(role, X) === X`:

- `result` starts as a copy of `ROLE_DEFAULTS[role]`;
- the override loop skips `FINANCIAL_OWNER_ONLY` keys, but those are `false` in every non-owner
  `ROLE_DEFAULTS` and cannot be granted via overrides anyway — so `X` also has them `false`;
- every other key in `X` is copied back onto `result`, and `X` was itself built from
  `ROLE_DEFAULTS` + overrides, so this is a no-op;
- `WRITE_IMPLIES_READ` is re-applied, and `X` already satisfies it.

**So the R1 fix is functionally correct.** But it reads as a bug to anyone who knows the signature,
and it is needlessly indirect — `access.permissions` *is already* the resolved map:

```ts
const can = (p: PermissionKey) => access.permissions[p] === true;
```

This deletes the `permission.service.ts` import that `fast3.md` §4 mandates, and removes the only
reason `tax-analytics.service.ts` needs to know that module exists. Smaller blast radius, same
behavior. `access.isOwner ||` is also redundant — owners get every key `true`
(`permission.service.ts:58`).

## F4 — 🟡 The replacement `select` truncates `currentMonth`, and the branches now disagree

`fast3.md` Step 2 replaces `findUnique` (L27, **full row**) with the trends `findMany`'s 10-field
`select`. But `currentMonth` is built by spreading that row:

```ts
currentMonth = { ...currentReport, totalSales: new Decimal(monthSales), ... };   // L116-125
```

whereas the no-report branch hand-builds a full shape (`L129-149`):

```ts
currentMonth = { id: 'live-preview', businessId, taxMonth, ..., lockedAt: null,
                 isNilReturn: false, createdAt: now, updatedAt: now };
```

**After the change the two branches return different objects.** The spread branch loses `id`,
`lockedAt`, `isNilReturn`, `createdAt`, `updatedAt`.

I checked what the frontend actually reads off `currentMonth` (`Dashboard.tsx:895-896, 1219, 1411,
1531-1571`): `totalSales`, `totalExpenses`, `grossProfit`, `taxPayable`, `taxRate`, `profitMargin`,
`paymentStatus`, `isFinalized`, `isLocked`. **All nine are inside the 10-field select, so nothing
breaks today.** No `currentMonth.id` link exists — the card's CTA is a static `<Link to='/tax'>`
(L1587).

Still worth fixing, because of this repo's known constraint: **`tsconfig` is not strict**, so a
future `currentMonth.lockedAt` compiles clean and renders `undefined` with no type error and no
crash. Add `id`, `lockedAt`, and `isNilReturn` to the `select` — three columns — and the shape
stays whole.

## F5 — 🟡 The `select` spec contradicts itself

> "select: { …the 10 fields the current trends query already selects, plus `isFinalized`,
> `paymentStatus`, `isLocked`, `taxRate`… }"

Those four are already among the ten (`L81-92`: `taxMonth`, `totalSales`, `totalExpenses`,
`grossProfit`, `taxPayable`, `taxRate`, `profitMargin`, `paymentStatus`, `isFinalized`, `isLocked`).
Harmless, but an implementer will pause on it. Fold in F4's three additions and state the final
field list once.

## F6 — 🟡 Route placement is unspecified

`tax.routes.ts` is 19 lines. `router.get('/dashboard', …)` is L16. The new line goes immediately
after it. **No collision exists** — `/dashboard-bundle` is a literal sibling of `/dashboard`, and
`/reports/:id` (L11) sits under a different prefix, so it can never capture it. `fast3.md`'s claim
on this point is correct; it just never said where to put the line.

---

# 3. WHAT WAS WRONG WITH `fast2.md` — confirmed still fixed in `fast3.md`

Re-verified this pass; all still correct:

- ✅ **R1** — the not-permitted/failed collapse. Re-derived the fix independently and confirmed it
  is sound (see F3 for the simplification; the logic itself holds).
- ✅ **R2** `VACUUM (ANALYZE)` outside the migration · **R3** `DROP INDEX` lock · **R4** `months`
  argument in tests · **R5** explicit `select` (refined by F4) · **R6** `.data` unwrapping + the
  `payments` relation · **R7** authz baseline written before the bundle exists.
- ✅ **E1–E8** from pass one remain correctly handled (URL, no lean-query data exposure,
  `TEST_DATABASE_URL` guard, no `CONCURRENTLY` in migrations, zero-code measurement, honest O(n)
  framing, `Decimal` accumulation).

## Independently re-verified against source this pass

| Claim in `fast3.md` | Source | Status |
|---|---|---|
| `hasPermission` exported | `permission.service.ts:173` | ✅ |
| `verifyBusinessAccess` returns `BusinessAccessResult`, no throw without a perm arg | `ownership.ts:129-134, 197-202` | ✅ |
| `listReports` returns `{ data, pagination }` | `tax-report.service.ts:205-215` | ✅ |
| `listReports` carries `include: { payments: … take: 1 }` | `tax-report.service.ts:174-190` | ✅ |
| `dashboardQuerySchema` = `months`, 1–24, default 6 | `tax.validator.ts:49-51` | ✅ |
| Labels `'tax summary'`, `'recent sales'`, `'recent expenses'`, `'recent reports'` | `Dashboard.tsx:521-524` | ✅ exact |
| Limits 5 / 5 / 3 / 6 | `Dashboard.tsx:500, 505, 510, 515` | ✅ |
| `{ success: true, data }` matches `r?.data?.data` | `tax.controller.ts:110-113` | ✅ |
| No route collision | `tax.routes.ts:11, 16` | ✅ |
| `Decimal` available for the JS sum | already imported, `L4` | ✅ |
| `toNumber` helper exists | `@/shared/helpers`, used at `L65` | ✅ |

---

# 4. VERIFIED FILE IMPACT (delta from `fast3.md`)

Per **F3**, `fast3.md` §4's file impact is now wrong: it mandates importing `hasPermission` into
`tax-analytics.service.ts`. **That import is not needed.**

### MODIFY
| File | Change vs `fast3.md` |
|---|---|
| `backend/src/services/tax/tax-analytics.service.ts` | F1: drop `isCanceled`. F3: `can()` reads `access.permissions[p] === true` — **no new import**. F4: add `id`, `lockedAt`, `isNilReturn` to the `select`. Add `getDashboardBundle` here. |
| `backend/src/routes/tax.routes.ts` | F6: `router.get('/dashboard-bundle', taxController.dashboardBundle);` immediately after L16. |
| `backend/src/controllers/tax.controller.ts` | New `dashboardBundle` handler, `asyncHandler`-wrapped, parsing `dashboardQuerySchema`. |
| `frontend/src/pages/Dashboard.tsx` | Point `fetchDashboardBundle` at the new URL. Keep everything else (§5, Step 5). |

### CREATE
- `backend/tests/integration/dashboard-numbers.test.ts`
- `backend/tests/integration/dashboard-list-authz-baseline.test.ts`
- One Prisma migration (indexes only, Step 6)

### DO NOT TOUCH
- `backend/src/lib/ownership.ts` — its throwing behaviour is correct contract, not a bug. The bundle
  must work *with* it.
- `backend/src/services/team/permission.service.ts` — `hasPermission` / `resolvePermissions` are
  correct. Per F3 the bundle no longer imports from this file at all.
- `backend/src/validators/tax.validator.ts` — `dashboardQuerySchema` is reused as-is.
- `backend/src/lib/prisma.ts` — dev query logging already exists (L27-36); Step 0 is zero-code.

---

# 5. IMPLEMENTATION PLAN (corrected — supersedes `fast3.md` §5)

### STEP 0 — Measure. Zero code changes.
`lib/prisma.ts:28` already logs dev queries. **Measure round trips, not query count** — that is the
corrected framing (F2). Time `GET /api/v1/businesses/:id/tax/dashboard?months=6` end-to-end and
count the serialized `await` boundaries. Confirm whether production Postgres is remote; if local,
Step 2's benefit shrinks and the priority order changes.

### STEP 1 — Two baseline test files, before touching production code

**`backend/tests/integration/dashboard-numbers.test.ts`**
- **Precondition:** `TEST_DATABASE_URL` set, pointing at a non-production DB. Guard: throw if the
  resolved URL equals `DATABASE_URL` (`test-db.ts:7-15` otherwise falls back to live).
- Call **`getDashboard(userId, businessId, 6)`** — `trendMonths` is required and determines `trends`
  length.
- Fixtures: ≥1 `status: 'pending'` sale, ≥1 `isTaxable: false` sale, ≥1 `isDeductible: false`
  expense — all three must be excluded from the sums.
- Assert exact: lifetime sales/expenses, current-month sales/expenses, `lifetime.totalTaxPayable`,
  `lifetime.reportsCount`, `unpaidCount`, `trends` length + month ordering.
- Plus a zero-row business, and a business with no current-month report (exercises the
  `live-preview` branch, `L126-150`).
- **Add:** assert `currentMonth` has `id`, `lockedAt`, `isNilReturn` defined in *both* branches —
  this is the F4 regression guard.

**`backend/tests/integration/dashboard-list-authz-baseline.test.ts`**
- Written against the **EXISTING** endpoints, before the bundle exists.
- Business with an `owner` and a `sales_staff` member.
- Owner creates sales/expenses; `sales_staff` calls `listSales` / `listExpenses` directly.
- Record the exact current row sets as reference. These must match `sales-crud.service.ts:151-153`
  (own rows + `source: 'bank_transfer'`) and `expense.service.ts:94-96` (own rows + legacy
  `createdBy: null`).
- If this fails on unmodified `main`, that is a **pre-existing leak** — report separately.

**Exit condition:** both green on unmodified `main`. Anything else is a pre-existing finding.

### STEP 2 — Collapse the sequential waterfall *(corrected: 8 queries / 5 round trips → 5 / 1)*

Replace the four `monthlyTaxReport` reads (L27, L75, L97, L153) with **one** `findMany` covering all
reports for the business, and issue it **inside the existing `Promise.all` alongside the four
aggregates** — it has no dependency on them (`trendStart` derives only from `now`/`trendMonths`).

```ts
const [liveSalesAgg, liveExpenseAgg, monthSalesAgg, monthExpenseAgg, allReports] =
  await Promise.all([
    /* …the four existing aggregates, unchanged… */
    prisma.monthlyTaxReport.findMany({
      where: { businessId },
      orderBy: { taxMonth: 'asc' },
      select: {
        id: true, taxMonth: true,            // F4: id for the spread branch
        lockedAt: true, isNilReturn: true,   // F4: keep currentMonth's shape whole
        totalSales: true, totalExpenses: true, grossProfit: true,
        taxPayable: true, taxRate: true, profitMargin: true,
        paymentStatus: true, isFinalized: true, isLocked: true,
      },
    }),
  ]);
```

Then derive in JS:
- **current report** — `allReports.find(r => r.taxMonth.getTime() === currentMonthStart.getTime())`
- **trends** — `allReports.filter(r => r.taxMonth >= trendStart && r.taxMonth <= currentMonthStart)`
- **lifetime** — `totalTaxPayable` = **Decimal sum** of every `r.taxPayable`, one `toNumber()` at the
  end; `reportsCount` = `allReports.length`
- **unpaidCount** — `allReports.filter(r => r.isFinalized && r.paymentStatus === 'pending').length`

Rules:
- **Accumulate `taxPayable` with `Decimal` arithmetic** (`Decimal` is already imported at L4);
  `toNumber()` once at the end. Postgres `SUM(numeric)` was exact — a JS float sum would not be.
- Leave the live-vs-report precedence logic (L111-150) **untouched**.
- Preserve the UTC month-bound construction (L17-24) character for character.
- F5 resolved: the field list above is the complete list. Do not re-add fields already present.

**Result: 5 sequential round trips → 1; 8 queries → 5.**

### STEP 3 — Bundle endpoint *(corrected)*

In `tax-analytics.service.ts`:

```ts
import { verifyBusinessAccess } from '@/lib/ownership';
import { type PermissionKey } from '@/services/team/permission.service'; // type-only
import { listSales } from '@/services/sales.service';
import { listExpenses } from '@/services/expense.service';
import { listReports } from '@/services/tax/tax-report.service';

export async function getDashboardBundle(userId: string, businessId: string, months: number) {
  // Throws 404 / not-a-member only. Does NOT throw for a missing permission.
  const access = await verifyBusinessAccess(userId, businessId, 'dashboard.read');

  // F3: access.permissions IS the resolved map (ownership.ts:181). Read it directly.
  const can = (p: PermissionKey) => access.permissions[p] === true;

  const failedSections: string[] = [];

  // F1: no isCanceled. The server never observes a client abort.
  const section = async <T>(key: string, perm: PermissionKey, run: () => Promise<T>) => {
    if (!can(perm)) return null;          // not permitted → omit, do NOT record a failure
    try { return await run(); }
    catch { failedSections.push(key); return null; }
  };

  const [dash, sales, expenses, reports] = await Promise.all([
    section('tax summary',     'dashboard.read', () => getDashboard(userId, businessId, months)),
    section('recent sales',    'sales.read',     async () => (await listSales(userId, businessId, { page: 1, limit: 5 })).data),
    section('recent expenses', 'expenses.read',  async () => (await listExpenses(userId, businessId, { page: 1, limit: 5 })).data),
    section('recent reports',  'tax.read',       async () => (await listReports(userId, businessId, { page: 1, limit: 3 })).data),
  ]);

  return {
    dashboard: dash,
    recentSales: sales ?? [],
    recentExpenses: expenses ?? [],
    recentReports: reports ?? [],
    failedSections,
  };
}
```

Key points:
- **Pre-check before invoking the service** — the R1 fix. `listSales` never runs for a user lacking
  `sales.read`, so `verifyBusinessAccess(…, 'sales.read')` never throws 403, so a permission
  boundary can never be misreported as a failure.
- **Section keys match `Dashboard.tsx:521-524` exactly** — `'tax summary'`, `'recent sales'`,
  `'recent expenses'`, `'recent reports'`.
- **Limits match the current frontend** — 5 / 5 / 3 / 6 (`Dashboard.tsx:500-515`).
- `.data` unwrapping on all three list services; `listReports` also issues an extra relation query
  for `include: { payments: take: 1 }` (`tax-report.service.ts:174-190`).
- **Route** (F6): `router.get('/dashboard-bundle', taxController.dashboardBundle);` immediately
  after L16 in `tax.routes.ts` → `/api/v1/businesses/:businessId/tax/dashboard-bundle`. No collision.
- **Controller**: `asyncHandler`-wrapped, `dashboardQuerySchema.parse(req.query)` for `months`, returns
  `{ success: true, data: result }` to match the existing `r?.data?.data` axios pattern.
- **Known trade-off:** ~4× DB work per request under the unchanged rate-limit budget. Note for
  monitoring; do not add a tighter limiter.

### STEP 4 — Assert the bundle matches the baseline

Extend the Step 1 baseline file to also call `getDashboardBundle` and assert its `recentSales` /
`recentExpenses` deep-equal the row sets recorded from the direct list calls, for both the owner and
the `sales_staff` member. Anti-drift guard: if anyone later changes a list service, this fails.

Also assert a member lacking `sales.read` produces `recentSales: []` with an **empty**
`failedSections` — the R1 regression test.

### STEP 5 — Switch the frontend

Single request to `/businesses/${bid}/tax/dashboard-bundle?months=6`. Keep the `AbortSignal`
(`:635`), the `DashboardBundle` shape, the `failedSections` → `loadErrors` mapping (`:570`), cache
seeding (`:550`), and the invalidation subscription (`:625`).

- **Client-side `hasPerm` gates stay for rendering only.** `PermissionGate` / `hasPerm` usage must
  not be touched — it still controls what is *drawn*.
- The `perms` argument to `fetchDashboardBundle` (`:678`) becomes unused for fetch-gating. Leaving
  it in place is harmless; removing it is optional cleanup.
- **Do not delete `fetchSection`'s three-way rendering logic** — only its use as a fetch wrapper
  goes away. The local `isCanceled` (`:457`) stays too; it is still correct client-side.

### STEP 6 — Widen the indexes *(conditional on Step 0)*

- `(businessId, status, isTaxable, transactionDate)` → append `amount`
- `(businessId, isDeductible, expenseDate)` → append `amount`

Migration: plain `DROP INDEX` + `CREATE INDEX`. **No `CREATE INDEX CONCURRENTLY`** — Prisma runs
migrations in a transaction and Postgres forbids it.

**After the migration, and outside it:**
```sql
VACUUM (ANALYZE) sales_transactions;
VACUUM (ANALYZE) expenses;
```
`ANALYZE` alone updates planner statistics but does **not** set the visibility map, and `VACUUM`
cannot run inside a transaction. Without this, index-only scans may still perform heap fetches and
the expected gain will not materialise.

**Locking:** `DROP INDEX` takes `ACCESS EXCLUSIVE`, blocking reads and writes for its duration. At
pre-launch row counts this is milliseconds. If the table has grown large, run both statements
manually with `DROP INDEX CONCURRENTLY` / `CREATE INDEX CONCURRENTLY` via `psql`, then
`prisma migrate resolve --applied <name>`.

**Honest framing:** this converts a heap walk into an index-only scan. Still O(n); better constant.
**Do it only if Step 0 shows the aggregates are actually slow** — and if Step 0 now shows 1 round
trip, that is a strong argument to drop this step entirely.

---

# 6. ACCEPTANCE CRITERIA

All of `fast3.md`'s criteria stand, plus:

20. **No `isCanceled` in backend code.** The bundle's catch block is
    `catch { failedSections.push(key); return null; }`. *(F1)*
21. **`getDashboard` issues 5 queries in 1 sequential round trip**, confirmed by the dev query log.
    Not 8 in 5. *(F2)*
22. `can()` is `access.permissions[p] === true`; `tax-analytics.service.ts` does **not** import
    `hasPermission`. *(F3)*
23. `currentMonth` carries `id`, `lockedAt`, `isNilReturn` in **both** the spread and `live-preview`
    branches. *(F4)*
24. `router.get('/dashboard-bundle', …)` sits immediately after `/dashboard` in `tax.routes.ts`. *(F6)*

---

# 7. REMAINING QUESTIONS

Unchanged, none blocking:

1. Is production Postgres remote? Determines whether Step 2's benefit is real. **Now the single
   highest-leverage unknown** — it gates whether this workstream is worth doing at all.
2. Is `TEST_DATABASE_URL` set and separate? Determines whether Step 1 is safe to run.
3. Real row counts in `sales_transactions` / `expenses`? Determines Step 6's migration strategy.
4. Does the team have non-owner roles beyond `sales_staff` in practice? The baseline should cover
   every role in `BusinessRole` (5 exist: owner, manager, sales_staff, accountant, viewer).

---

# 8. FINAL READINESS SCORE

## 8 / 10 — implementation-ready once F1–F3 land

**On `fast3.md`:** its central contribution — the R1 fix — survived an independent re-derivation.
That was the one finding that would have shipped a real UX regression, and it was right. Its §3
re-verification of the earlier passes is accurate. Nothing in it is architecturally wrong.

**What it still gets wrong is small and mechanical.** It called a frontend axios helper from a
backend service (F1) — the kind of slip that survives because the surrounding paragraph is sound.
It carried forward a query count it never re-derived (F2). And it reached for `hasPermission` with
the wrong argument, landing on a correct result by coincidence of idempotency rather than by design
(F3). None of these are architectural. All three are five-minute fixes.

**On this revision:** after F1–F3, this is implementation-ready. F1 deletes code. F3 deletes an
import and a function call. F2 changes no code — it corrects the number the decision is made on,
and corrects it *upward*: 5 → 1 round trips, not 9 → 5 queries. The plan is stronger than it
claimed.

**To reach 9–10:** apply F1–F6, answer §7 question 1, and run Step 0. If Step 0 confirms a remote
database, this is a straightforward four-hour change with a strong measured win. If production
Postgres is local, **drop Steps 2 and 6 entirely** and keep only the bundle endpoint (Step 3) —
the four-HTTP-request collapse still helps, but the query work does not.

**A closing note on process.** Three passes, and each pass found real defects in the previous one —
including a blocking authorization regression I introduced in pass two and a copy-paste error in
pass three. That is the expected hit rate for a plan this shape, and it is the argument for not
skipping the review even when the plan "looks done." The current artifact is materially closer to
correct than the one I would have handed over two passes ago.