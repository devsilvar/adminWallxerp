# Team Roles & Permissions — Implementation Plan (v2, re-reviewed)

**Date:** 2026-10-04
**Standard:** `rereviewplan.md` (Phase 1-12) applied to v1 · `implementplancode.md` Phase 20 for work-item structure
**Sources:** `userroles.md` (audit) · live repository re-inspection
**Status:** Planning only. No code modified in producing this document.

---

# 1. EXECUTIVE VERDICT

🟡 **PLAN REQUIRES SIGNIFICANT REVISION**

v1's core diagnosis and sequencing were correct — `PERM-01` before the visibility fixes remains right, and the `PERM-02` one-line fix is accurate. But re-inspecting the repository against v1 found:

- **2 outright errors** in files/commands (wrong route mount, test command that would never run the proposed test)
- **1 security finding v1 missed entirely**, which is **live in production today** and which v1's `PERM-01` would have created a false sense of safety about
- **3 incomplete items** where v1 asserted more than the code supports

None of it invalidates the approach. All of it changes what gets built and where.

---

# 2. WHAT WAS WRONG WITH v1

## 🔴 C-1 — WRONG: `PERM-06` targeted a route path that does not exist

v1 proposed `GET /api/v1/team/my-permissions?businessId=<id>`.

Verified — `backend/src/routes/index.ts:68`:
```ts
v1.use('/businesses/:businessId/team', teamRoutes);
```

Team routes are namespaced under `/businesses/:businessId/team`. **`businessId` is already a path parameter** on every handler in `team.routes.ts`, so v1's query parameter was redundant as well as wrong. Implementing v1 as written would have created a second, competing mount for team functionality.

## 🔴 C-2 — WRONG: `PERM-08` proposed a test that the stated command never runs

v1 instructed verification via `npm run test:e2e` for a file at `tests/unit/permission-merge.test.ts`.

Verified — `backend/package.json`:
```
"test:unit": "jest --config jest.config.ts tests/unit",
"test:e2e":  "jest --config jest.config.ts tests/e2e --runInBand ..."
```

`test:e2e` is scoped to `tests/e2e`. **A unit test placed in `tests/unit` would never execute under the command v1 told the developer to run**, and would report green while testing nothing.

## 🔴 C-3 — MISSING: a live expense-data leak that v1 did not identify

`backend/src/services/ai/ai-context.service.ts:59` gates on **`ai.use` only**:
```ts
const { business } = await verifyBusinessAccess(userId, businessId, 'ai.use');
```
It then unconditionally reads business-wide expense aggregates — `prisma.expense.aggregate` (line 86) and `prisma.expense.groupBy` (line 95).

`ROLE_DEFAULTS.sales_staff` grants `'ai.use': true` (`permission.service.ts:91`) and denies `'expenses.read': false` (line 79).

**A `sales_staff` member can invoke the AI assistant and surface business-wide expense totals and top-5 expense categories, bypassing `expenses.read` entirely — today, before any v1 fix ships.** This is an existing authorization defect, not one introduced by the plan.

Critically, **v1's `PERM-01` would not have closed it**, because `PERM-01` scopes row visibility inside `expense.service.ts` and `ai-context.service.ts` reads Prisma directly. v1's acceptance criteria ("a `sales_staff` member holding `expenses.read` receives only rows where `createdBy` is their own") would have passed while the leak remained open.

## 🟠 C-4 — MISLEADING: `PERM-01` implied a subsystem-wide guarantee it does not provide

Re-verified that these files read `prisma.expense` directly, bypassing `expense.service.ts`:

```
services/ai/ai-context.service.ts
services/documents/statement.service.ts
services/report.service.ts
services/sales/sales-analytics.service.ts
services/settlement/payout-preview.service.ts
services/tax/tax-analytics.service.ts
services/tax/tax-report.service.ts
```

This is **good news for tax correctness** — scoping `expense.service.ts` cannot corrupt tax computation, because tax never goes through it. But v1 stated the blast radius as if `expense.service.ts` were the whole surface. It is not. v2 states the boundary explicitly.

## 🟠 C-5 — INCOMPLETE: `Expense.createdBy` is nullable and v1 called it populated

v1: *"`Expense.createdBy` already exists (populated at `expense.service.ts:53`)."*

Verified — `schema.prisma:222`: `createdBy String? @map("created_by")`. It **is** populated with the user id on the two application paths (`expense.service.ts:53`, `credit.service.ts:305` — both verified as `createdBy: userId`).

But `scripts/db-restore.ts:106` uses `expense.createMany`, and any row predating the column has `NULL`. Scoping `where.createdBy = userId` **silently hides all such rows** from a `sales_staff` member — with no error and no indication that data is missing. v1 did not address this.

## 🟠 C-6 — INCOMPLETE: `PERM-01` claimed no new query is needed, without noting the current code discards the result

v1: *"`verifyBusinessAccess` … already returns `role`, so no new query is needed."*

True — but every current call in `expense.service.ts` (lines 36, 90, 137, 157, 239, 289, 400) uses `await verifyBusinessAccess(...)` and **discards the returned `BusinessAccessResult`**. Each read site must change to `const access = await ...` before `access.role` is reachable. Minor, but an implementer following v1 literally would hit a type error and could work around it with a redundant membership query.

## 🟢 C-7 — CORRECT (verified, no change)

- `PERM-02`'s root cause is exactly as stated: `business.service.ts:184` `resolvePermissions(myRole)`, with `permissions` absent from the `select` at lines 141-143.
- `PERM-01`'s ordering rationale holds.
- `FINANCIAL_OWNER_ONLY` lockout, `hasPermission`/`resolvePermissions` precedence, and the 60s cache with invalidation are all correct as built.
- All 30 keys are present in the frontend `PermissionKey` union (`frontend/src/types/index.ts:32-44`) — no type drift between front and back.

---

# 3. WHAT CHANGED

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| `PERM-06` → `GET /api/v1/team/my-permissions?businessId=` | 🔴 Corrected | `GET /businesses/:businessId/team/my-permissions` — `businessId` from `req.params`, no query param | Mount is `routes/index.ts:68`; path param already bound |
| `PERM-08` verify via `npm run test:e2e` | 🔴 Corrected | `npm run test:unit` for `tests/unit/`, `npm run test:e2e` for `tests/e2e/` — stated per file | `test:e2e` is path-scoped to `tests/e2e` |
| *(absent)* | 🔴 **Added `PERM-01b`** — gate AI context expense reads on `expenses.read` | New item, sequenced with `PERM-01` | C-3: live leak, and `PERM-01` does not close it |
| `PERM-01` blast radius implied global | 🟠 Corrected | Scope stated explicitly: `expense.service.ts` only; direct Prisma readers enumerated | C-4 |
| `PERM-01` "`createdBy` populated" | 🟠 Completed | Null policy specified; `createdBy IS NULL` handling defined | C-5 |
| `PERM-01` "no new query needed" | 🟠 Completed | Call sites must capture the return value | C-6 |
| 9 items | — | **10 items** (+1) | `PERM-01b` |

---

# 4. VERIFIED FILE IMPACT

### CREATE
| File | Why |
|---|---|
| `backend/tests/unit/permission-merge.test.ts` | Unit coverage for merge + implication rules. No DB. |
| `backend/tests/e2e/permission-overrides.e2e.test.ts` | Override grant → member-visible permissions, including the AI-context gate. |

### MODIFY
| File | Role today | Why affected |
|---|---|---|
| `backend/src/services/business/business.service.ts` | `listBusinesses` / `getBusinessById` | `myPermissions` built without overrides (line 184); `permissions` not selected (141-143) |
| `backend/src/services/expense/expense.service.ts` | Expense CRUD + summaries | No row scoping; discards `verifyBusinessAccess` return at 6 read sites |
| `backend/src/services/ai/ai-context.service.ts` | Builds AI business context | Gates on `ai.use` only (59) then reads all expenses (86, 95) — **C-3** |
| `backend/src/services/team/permission.service.ts` | Canonical 30×5 matrix | Add write-implies-read to `resolvePermissions` |
| `backend/src/services/team/team.service.ts` | Team CRUD / invites | Populate role-defaults payload for the override UI |
| `backend/src/controllers/team.controller.ts` | Team HTTP handlers | New `myPermissions` + `roleDefaults` handlers |
| `backend/src/routes/team.routes.ts` | Team router | Register two new GET routes |
| `backend/src/config/swagger.ts` | API docs | Document both new endpoints |
| `frontend/src/components/settings/TeamSettingsTab.tsx` | Team management UI | `OVERRIDABLE_PERMS` lacks `.read`; duplicated `ROLE_DEFAULT_PERMS` |
| `frontend/src/components/auth/PermissionGate.tsx` | `usePermission` hook | Home for the shared fail-closed helper |
| `frontend/src/components/layout/Sidebar.tsx` | Nav | Fail-open predicate (line 53) |
| `frontend/src/components/dashboard/SalesExpenseChart.tsx` | Dashboard chart | Fail-open predicate (line 143) |
| `frontend/src/pages/Dashboard.tsx` | Dashboard bundle | Local `permitted()` fail-open (line 486) |
| `frontend/src/pages/Account.tsx` | Banking page | Fail-closed predicate (lines 39-41) |
| `frontend/src/stores/business.store.ts` | Business state | Needs forced refresh after permission change |
| `frontend/src/stores/team.store.ts` | Team state | Trigger refresh + hold role defaults |
| `frontend/src/types/index.ts` | Shared types | Override payload typing (already correct for the 30 keys) |

### DELETE
None. `ROLE_DEFAULT_PERMS` is *removed* (item `PERM-07`), but no file is deleted.

### DATABASE
**None.** No schema change, no migration. Verified: `Expense.createdBy` already exists.

### CONFIGURATION
**None.** No new environment variables or feature flags.

### TESTS
| File | Action |
|---|---|
| `backend/tests/unit/permission-merge.test.ts` | **Create** — run with `npm run test:unit` |
| `backend/tests/e2e/permission-overrides.e2e.test.ts` | **Create** — run with `npm run test:e2e` |
| `backend/tests/e2e/team-permissions.e2e.test.ts` | **Modify** — add expense row-scoping case |

---

# 5. IMPROVED IMPLEMENTATION PLAN

## Sequencing

> **`PERM-01` and `PERM-01b` must both land before `PERM-02` / `PERM-03`.**

`PERM-02` and `PERM-03` make expenses visible to roles that currently cannot see them. Every surface that would then expose expense data must be scoped or gated first. v1 shipped `PERM-01` for this reason; v2 adds `PERM-01b` because `PERM-01` alone leaves the AI path open.

`PERM-01b` is independently shippable — it closes a live defect on its own and should be treated as urgent regardless of the rest.

## Priority

### NOW
| ID | Problem | Solution | Effort | Risk if skipped |
|---|---|---|---|---|
| `PERM-00` | Diagnosis unconfirmed at runtime | Direct-URL probe | S | Fixing the wrong defect |
| `PERM-01` | Expenses unscoped by role | Row-scope in `expense.service.ts` | M | Data exposure on our own fix |
| `PERM-01b` | **AI context bypasses `expenses.read`** | Gate on `expenses.read` | S | **Live leak persists** |
| `PERM-02` | Overrides dropped on read-back | Merge in `listBusinesses` | S | Feature stays dead |
| `PERM-03` | `.read` not grantable | Expose `.read`; imply read on write | M | Original bug persists post-fix |
| `PERM-04` | Divergent predicates | One fail-closed helper | M | Latent fail-open on next key |
| `PERM-05` | No client refresh | Force-refresh on member update | S | Fix looks broken to users |

### NEXT
| ID | Problem | Solution | Effort |
|---|---|---|---|
| `PERM-06` | No my-permissions endpoint | Add under existing team mount | M |
| `PERM-07` | Duplicated role matrix | Source from backend | M |
| `PERM-08` | No override test coverage | Unit + e2e | M |

### DO NOT DO
- ❌ Join-table permission model — JSONB is correct here.
- ❌ Make `FINANCIAL_OWNER_ONLY` overridable.
- ❌ Remove the 60s ownership cache.
- ❌ Row-scope the direct Prisma readers listed in C-4 — each is gated by its own permission and the roles that reach them legitimately need business-wide figures. **`PERM-01b` addresses the one exception (`ai-context`), which is gated on the wrong permission.**
- ❌ Define `createdBy` as a Prisma relation — out of scope; the nullable column works.

---

## Execution Checklist

### 1. `PERM-00` — Confirm the diagnosis at runtime
- **Depends on:** None · **Files:** none · **Effort:** S
- **What:** Owner invites a `sales_staff`, sets `permissions: { "expenses.read": true }` on the `BusinessMember` row. That member signs in and navigates **directly** to `/expenses` by URL.
- **Acceptance:** page renders data ⇒ F-01 confirmed, proceed. `403` ⇒ override not persisted; re-inspect `team.service.ts:176,837-847` — no item in this plan addresses that case.
- **Verification:** inspect `GET /api/v1/businesses` as the member — `myPermissions['expenses.read']` is `false` despite the DB override.
- **Rollback:** n/a. Restore the DB row to `permissions: null`.

### 2. `PERM-01b` — Gate AI context expense reads on `expenses.read` *(urgent — live leak)*
- **Depends on:** none · **Files:** `backend/src/services/ai/ai-context.service.ts`
- **What:** Line 59 currently returns only `{ business }`. Change to capture the full result: `const access = await verifyBusinessAccess(userId, businessId, 'ai.use')`. Destructure `access.role` and the member's overrides — the same values `resolvePermissions` would produce — then branch: compute `canReadExpenses = hasPermission(access.role, overrides, 'expenses.read')` using the existing exported helper from `services/team/permission.service.ts`. When false, replace the two `prisma.expense` aggregations (lines 86, 95) with empty defaults (`{ _sum: { amount: 0n } }` and `[]`) and omit the expense section from the returned `summaryText`. Import `hasPermission` rather than reimplementing the precedence rules.
- **Acceptance:**
  - `sales_staff` (default permissions, no overrides) receives **zero** expense totals and no category breakdown in AI context.
  - `accountant` and `manager` receive unchanged output — regression-identical.
  - A `sales_staff` granted `expenses.read: true` **receives** the aggregates (so the gate tracks the permission, not the role).
  - `FINANCIAL_OWNER_ONLY` and role-default precedence are unchanged — `hasPermission` is reused, not reimplemented.
- **Verification:** e2e — call the AI context endpoint as a default `sales_staff`, assert `expenses` is empty/absent; then grant `expenses.read` and assert it is populated.
- **Rollback:** revert one file. No schema, no stored data.
- **Risk if skipped:** A `sales_staff` member can read business-wide expense totals through the AI assistant **today**. This is the one item that fixes a defect independent of all others.

### 3. `PERM-01` — Row-scope expenses by role
- **Depends on:** `PERM-00`; ships **before** `PERM-02`/`PERM-03`
- **Files:** `backend/src/services/expense/expense.service.ts`
- **What:** At each read site (lines 90, 137, 289, 400), change `await verifyBusinessAccess(...)` to `const access = await verifyBusinessAccess(...)` — **the return is currently discarded; `access.role` is unreachable without this change** (C-6). Then mirror `sales-crud.service.ts:149-153`: when `access.role === 'sales_staff'`, add `createdBy = userId` to the `where` clause.
  **Null policy (C-5):** `Expense.createdBy` is `String?`. Rows created via `scripts/db-restore.ts:106` (`createMany`) and any row predating the column have `createdBy: null`. For `sales_staff`, scope to `OR: [{ createdBy: userId }, { createdBy: null }]` so legacy rows remain visible rather than silently vanishing. Document this choice in a one-line comment — a `sales_staff` member seeing unattributed legacy rows is correct; seeing *nothing* would read as data loss.
  Leave `owner`, `manager`, `accountant` unscoped — they require business-wide figures for tax work.
  **Scope boundary (C-4):** this file only. `tax-report`, `tax-analytics`, `statement`, `report`, `sales-analytics`, `settlement/payout-preview`, and `ai-context` all read `prisma.expense` directly and are **not** affected by this change. `ai-context` is handled by `PERM-01b`.
- **Acceptance:**
  - `sales_staff` sees only own rows plus null-`createdBy` legacy rows, across list, monthly summary, and category breakdown.
  - `owner` / `manager` / `accountant` results are unchanged.
  - A `sales_staff` requesting another member's expense by id gets `404`/`403`.
  - No tax figure changes for any role — verified by the existing suite.
- **Verification:** extend `team-permissions.e2e.test.ts` — owner creates one expense, staff creates one; grant `expenses.read`; assert the staff list returns exactly the staff row and the null row, not the owner's. Run `npm run test:e2e`.
- **Rollback:** revert the file.
- **Risk if skipped:** `PERM-02`/`PERM-03` expose every expense in the business to any role granted `expenses.read`.

### 4. `PERM-02` — Apply overrides in `listBusinesses`
- **Depends on:** `PERM-00`, `PERM-01`, `PERM-01b`
- **Files:** `backend/src/services/business/business.service.ts`
- **What:** (a) Add `permissions: true` to the `select` at lines 141-143. (b) Build a map of `{ role, permissions }` at line 145. (c) Line 184: `resolvePermissions(myRole, map.get(b.id)?.permissions ?? null)`.
- **Acceptance:** overridden member receives `myPermissions['expenses.read'] === true`; a member without overrides gets a byte-identical response to today; the owner branch is untouched; no bare `resolvePermissions(role)` call remains in the file.
- **Verification:** re-run the `PERM-00` probe. `npm run test:e2e` — all 20+ existing permission tests green.
- **Rollback:** revert the file. No stored data is written at any point.
- **Effort:** S

### 5. `PERM-03` — Make `.read` grantable; imply read on write
- **Depends on:** `PERM-01`, `PERM-01b`, `PERM-02`
- **Files:** `backend/src/services/team/permission.service.ts`, `frontend/src/components/settings/TeamSettingsTab.tsx`, `frontend/src/types/index.ts`
- **What:** **(a) Backend, authoritative** — in `resolvePermissions`, after applying overrides, set each write key's sibling `*.read` to `true`. Declare the pairing once as an exported `WRITE_IMPLIES_READ` map. Server-side placement makes "can create but cannot read" unreachable through any API path. **(b) Frontend** — add the 11 missing `.read` keys to `OVERRIDABLE_PERMS` (currently 15 keys, no `.read`); render a read key as checked-and-locked when a sibling write is checked, unchecked-and-locked when none is, and freely editable otherwise (so `invoices.read` can still be granted alone).
- **Acceptance:** `resolvePermissions('sales_staff', { 'expenses.create': true })` returns `expenses.read === true`; an owner can grant `expenses.read` from the UI and the member sees the nav item and a loading page; `FINANCIAL_OWNER_ONLY` keys remain ungranted; all 30 keys have a control or a documented exclusion.
- **Verification:** e2e — invite `sales_staff`, grant "Log expenses" only, assert `myPermissions['expenses.read'] === true`. Manual — Expenses appears in the member's sidebar and the dashboard expense card renders.
- **Rollback:** revert the two commits independently.
- **Effort:** M

### 6. `PERM-04` — One fail-closed permission helper
- **Depends on:** none
- **Files:** `PermissionGate.tsx`, `Sidebar.tsx`, `SalesExpenseChart.tsx`, `Dashboard.tsx`, `Account.tsx`
- **What:** Export `hasPerm(permission)` from `PermissionGate.tsx` beside `usePermission`: owner ⇒ true; otherwise `myPermissions[p] === true`, absent ⇒ false. Replace `Sidebar.tsx:52-53`, `Dashboard.tsx:486` (delete the local `permitted`), `SalesExpenseChart.tsx:143`, and `Account.tsx:39-41`. Keep `Account.tsx`'s role allowlist as an explicit OR — deliberate business logic, not a predicate artefact.
- **Acceptance:** grep finds zero `myPermissions[...]) !== false` and zero `=== true` predicates outside the helper; a key absent from the map is denied everywhere; behaviour for all five current roles is unchanged (all maps are complete).
- **Verification:** `npm run test:e2e`. Then temporarily delete one key from `ROLE_DEFAULTS.sales_staff` and confirm the sidebar hides *and* the gate denies.
- **Rollback:** revert. No shared state.

### 7. `PERM-05` — Refresh the client after a permission change
- **Depends on:** `PERM-02`
- **Files:** `frontend/src/stores/business.store.ts`, `frontend/src/stores/team.store.ts`
- **What:** After `updateMember` — and after `invite` and `removeMember`, which also change who sees what — call `fetchBusinesses(true)`. **The `force` argument is mandatory:** `fetchBusinesses` early-returns on freshness (`business.store.ts:41-45`), so a non-forced call is a silent no-op and the fix will appear not to work.
- **Acceptance:** an owner edits permissions; the member's nav and dashboard update without a full reload; `GET /businesses` is re-requested (network tab); the refreshed object replaces the stale one for the same id without clobbering `activeBusiness` mid-session.
- **Verification:** two-browser manual test.
- **Rollback:** revert — degrades to requiring a reload.

### 8. `PERM-06` — Expose the caller's resolved permissions
- **Depends on:** `PERM-02`
- **Files:** `backend/src/routes/team.routes.ts`, `controllers/team.controller.ts`, `config/swagger.ts`
- **What:** Register `router.get('/my-permissions', ...)` **inside the existing team router** (`routes/index.ts:68` already binds `:businessId`), giving the effective path `GET /api/v1/businesses/:businessId/team/my-permissions`. Take `businessId` from `req.params` — **do not accept a query parameter** (C-1). Call `verifyBusinessAccess(userId, req.params.businessId)` with **no** `requiredPermission`; the endpoint self-authorizes. Return `{ role, isOwner, permissions }` from the `BusinessAccessResult` built at `ownership.ts:182-187`. No new query and no cache bypass — `verifyBusinessAccess` already reads the member row and honours its 60s TTL.
- **Acceptance:** an overridden member receives merged permissions; a non-member receives `403 FORBIDDEN`; the payload contains no member identity or PII; both endpoints appear in Swagger.
- **Verification:** e2e as non-member, plain member, and owner.
- **Rollback:** remove the route. Nothing depends on it until `PERM-07`.

### 9. `PERM-07` — Remove the duplicated role matrix from the frontend
- **Depends on:** `PERM-06`
- **Files:** `TeamSettingsTab.tsx`, `team.service.ts`, `team.controller.ts`, `frontend/src/stores/team.store.ts`
- **What:** Add `GET /businesses/:businessId/team/role-defaults` returning `ROLE_DEFAULTS` for the four non-owner roles, sourced from `permission.service.ts:57` so one definition exists. Delete `ROLE_DEFAULT_PERMS` (`TeamSettingsTab.tsx:101-135`) and replace its 6 call sites (187, 198, 225, 241, 592, 717) with store-backed data fetched when the override modal opens.
- **Acceptance:** `ROLE_DEFAULT_PERMS` exists nowhere in `frontend/src`; a grep for a hardcoded role→permission map returns only `OVERRIDABLE_PERMS` (labels — presentation data, not business rules); changing a `ROLE_DEFAULTS` value changes the UI with no frontend edit.
- **Verification:** change one backend default, reload the modal, confirm.
- **Rollback:** restore the constant; the endpoint is additive.

### 10. `PERM-08` — Close the coverage gap
- **Depends on:** `PERM-02`, `PERM-03`
- **Files:** **Create** `backend/tests/unit/permission-merge.test.ts`; **Create** `backend/tests/e2e/permission-overrides.e2e.test.ts`; **Modify** `backend/tests/e2e/team-permissions.e2e.test.ts`
- **What:** The existing suite tests role defaults only and asserts nothing about `myPermissions` — which is why F-01 survived it. **Unit** (`npm run test:unit`, no DB): override applied; write implies read; `FINANCIAL_OWNER_ONLY` locked under any override; unknown keys and non-boolean values ignored. **Contract** (`npm run test:e2e`): `GET /businesses` returns merged `myPermissions` for an overridden member and unchanged defaults for a plain one. **E2E** (new file): invite → override → accept → assert member-visible permissions match the grant, covering `expenses.*` **and** the `PERM-01b` AI-context gate.
- **Acceptance:** every case in F-01, F-02, F-03, and C-3 has at least one test that **fails against current code**; confirmed by reverting `business.service.ts:184` locally and watching the contract test go red, then restoring.
- **Verification:** run both commands — `npm run test:unit` **and** `npm run test:e2e`. Running only `test:e2e` would not execute the unit file (C-2).
- **Rollback:** delete the new files.

---

# 6. ACCEPTANCE CRITERIA

Complete when **all** hold:

1. `npm run test:unit` and `npm run test:e2e` both pass — **both commands**, not one.
2. `npx tsc --noEmit` clean in `backend/` and `frontend/`.
3. For each of the 4 non-owner roles, granting one `.read` and one `.write` override makes **nav visibility, page load, and API acceptance agree**.
4. A `sales_staff` member with `expenses.read` sees only own + legacy-null expenses via the API, the dashboard, and the AI context — and nothing else.
5. `GET /businesses/:businessId/team/my-permissions` returns the merged map; a non-member gets `403`.
6. A permission edit is visible to the target member without a reload.
7. No new database migration was created.
8. `ROLE_DEFAULT_PERMS` no longer exists in `frontend/src`.

---

# 7. REMAINING QUESTIONS

1. **Is `.read` not being overridable intentional product scope?** If "read follows role, overrides are write-only" was deliberate, execute `PERM-03` part (a) only — the implication rule still prevents the incoherent state — and skip part (b). Everything else stands.
2. **Should `sales_staff` see null-`createdBy` legacy expenses?** v2 assumes yes (visibility over strictness). If legacy rows should be owner-only, the OR-clause becomes `createdBy = userId` alone — one-line change.
3. **Role gating on the other direct Prisma expense readers** (`statement`, `report`, `sales-analytics`, `settlement/payout-preview`, `tax-report`, `tax-analytics`) is **UNVERIFIED**. Each gates on its own permission and the roles reaching them appear to need business-wide figures, so v2 leaves them alone — but this was not individually audited.
4. **`verifyBusinessOwnership` in `dva.service.ts:36,118,522` and `tax-payment.service.ts:128`** — plausibly correct owner-only restrictions on payout and account-setup surfaces. **Not audited for necessity.** Out of scope here.

---

# 8. FINAL READINESS SCORE

## **8 / 10**

**Implementation-ready** once `PERM-00` runs and question 1 is answered. Ten ordered items, no schema migration, no new infrastructure, each independently revertible, all file paths verified against the working tree.

**Deductions from 10:**
- **−1** — `PERM-00` gates the whole plan; the diagnosis remains a static-trace inference until someone runs the probe. If the direct-URL test returns `403`, none of items 2-10 address the real defect.
- **−1** — `PERM-03` part (b) and the null-`createdBy` policy both branch on product decisions that have not been confirmed.

**Not higher because** v1 of this plan shipped two concrete errors and missed one live security defect — that record is why the score is 8 and not 9. **Not lower because** every remaining uncertainty is a small, explicitly-flagged product decision rather than an architectural unknown.