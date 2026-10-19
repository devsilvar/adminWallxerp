# Team Roles & Permissions — Architecture Audit

**Date:** 2026-10-03
**Scope:** The team roles / permission override subsystem only — backend enforcement, the `myPermissions` client contract, and the override-authoring UI.
**Method:** Static code-path tracing. No code was modified. No runtime reproduction was performed (see *Remaining Unknowns*).
**Standard applied:** `implementplancode.md` (Senior Architecture Audit Prompt v3.0), scoped to this subsystem.

---

## 1. Executive Summary

Custom permission overrides are stored correctly, enforced correctly on the backend, and then **thrown away** before they reach the frontend.

The result is a split-brain:

- **Backend** reads `BusinessMember.permissions` from the database and merges overrides correctly. The API will accept an action the UI refuses to offer.
- **Frontend** receives a permission map built from **role defaults only**, and every permission check in the client reads that map.

So an owner who invites a sales rep and grants "Log expenses" sees the change saved, and the rep sees nothing change. The overrides are not lost on write — they are lost on **read-back**.

A second, independent defect compounds this: **no `.read` permission is overridable at all** in the team UI. Even with the data bug fixed, "grant Log expenses" can never grant `expenses.read` — because no such control exists.

Reported symptom — *"sales rep granted expense access, expenses absent from dashboard, cannot view any expense"* — is fully explained by the combination. It is **not** a permissions-storage problem, and it is **not** a permissions-enforcement problem.

---

## 2. What This Subsystem Actually Is

### Data model
`backend/prisma/schema.prisma:876-895` — `BusinessMember` with `role: BusinessRole` and `permissions Json?` (JSONB), unique on `(businessId, userId)`.
`backend/prisma/schema.prisma:897-915` — `Invitation` carries the same `role` + `permissions` pair through the pending state.

`BusinessRole` = `owner | manager | sales_staff | accountant | viewer`.

### The permission matrix (canonical)
`backend/src/services/team/permission.service.ts` — 30 permission keys × 5 roles, in `ROLE_DEFAULTS:57-127`.

Design that is correct and should be preserved:
- `FINANCIAL_OWNER_ONLY:41-46` — `tax.pay`, `wallet.withdraw`, `business.delete`, `settings.update` are hard-locked to the owner, un-overridable by design.
- `hasPermission:148-165` — precedence is owner → owner-only lockout → explicit override → role default. Correct.
- `resolvePermissions:174-196` — spreads role defaults, then applies valid overrides. Correct.
- Invalid keys and non-boolean values are rejected during merge. Correct.

### Enforcement layer (correct)
`backend/src/lib/ownership.ts:129-203` — `verifyBusinessAccess` resolves membership, merges overrides, and enforces `requiredPermission`. It bypasses its 60s cache inside transactions, which is the right call.

Services call it with the right keys. Verified for expenses:
```
services/expense/expense.service.ts:36,90,137,157,239,289,400
  → 'expenses.create' / 'expenses.read' / 'expenses.update' / 'expenses.delete'
```

### The client contract (broken)
`GET /businesses` returns `myRole` + `myPermissions`. This map is the **only** permission source the UI has.

Consumers, all reading `activeBusiness.myPermissions`:
| File | Line | Semantics |
|---|---|---|
| `components/layout/Sidebar.tsx` | 53 | fail-**open** (`!== false`) |
| `components/auth/PermissionGate.tsx` | 21-24 | fail-**closed** (missing ⇒ deny) |
| `pages/Dashboard.tsx` | 486 | fail-**open** (`!== false`) |
| `components/dashboard/SalesExpenseChart.tsx` | 143 | fail-**open** (`!== false`) |
| `pages/Account.tsx` | 39-41 | fail-**closed** (`=== true` + role allowlist) |

`team.routes.ts:17-22` exposes no endpoint returning the caller's merged permission map. `getBusinessById` (`business.service.ts:209`) computes it correctly but is never used to hydrate the active business.

---

## 3. What Is Already Good — DO NOT CHANGE

These are correct as built. Protecting them is part of the work.

1. **`permission.service.ts` merge + precedence logic** — `hasPermission` / `resolvePermissions` are right. Do not "simplify" or refactor them.
2. **`FINANCIAL_OWNER_ONLY` lockout** — a deliberate, correct safety rail. Do not make these overridable.
3. **Backend enforcement via `verifyBusinessAccess`** — override-aware, transaction-aware, correctly key-gated. The enforcement layer is not the problem.
4. **`ownership.ts` transaction cache bypass** — reading fresh state inside a transaction's isolation level is correct and must not be "optimized away."
5. **60s ownership cache with explicit invalidation** (`ownership.ts:24,39-57`) — invoked on member update (`team.service.ts:357`). Reasonable for single-instance.
6. **`BusinessMember.permissions Json?`** — flexible overrides without a join table. Appropriate at this scale.
7. **`sales-crud.service.ts:151` row-level scoping** — `sales_staff` sees only own sales + `bank_transfer`. A genuinely thoughtful control (see F-03).
8. **Override rejection of invalid keys** — the merge silently ignores unknown keys. Prevents permission-injection via crafted JSON.

---

## 4. Findings

### F-01 · 🔴 CRITICAL · Overrides are dropped when listing businesses · CONFIRMED · HIGH

`backend/src/services/business/business.service.ts:141-143` selects only `{ businessId, role }` from `businessMember` — `permissions` is never loaded. `roleMap:145` is built from that reduced set.

`business.service.ts:184`:
```ts
myPermissions: resolvePermissions(myRole),   // overrides argument omitted
```
`resolvePermissions(role, overrides?)` is called with the role only, so the override JSON never applies.

Every frontend permission check reads this value. **This is the root cause of the reported symptom.**

Contrast `business.service.ts:209`, which correctly returns `access.permissions` (merged) — but is unused for the active business.

**Why expenses specifically:** `ROLE_DEFAULTS.sales_staff` sets all four `expenses.*` keys to `false` (`permission.service.ts:79`). Overriding a default-`false` key is the case where the two maps diverge visibly. Overriding a default-`true` key (e.g. `sales.read` for `sales_staff`) produces an identical-looking map and masks the bug — which is why it read as "overrides do nothing at all."

---

### F-02 · 🔴 CRITICAL · No `.read` permission is overridable · CONFIRMED · HIGH

`frontend/src/components/settings/TeamSettingsTab.tsx:83-99` — `OVERRIDABLE_PERMS` contains **15 keys, none of them `.read`**:

`sales.create|update|delete|import`, `expenses.create|update|delete`, `invoices.create|send|mark_paid`, `debtors.manage`, `tax.calculate|finalize`, `statements.download`, `ai.use`.

Of the 30 canonical keys, 11 `.read` keys have **no UI control**: `sales.read`, `expenses.read`, `invoices.read`, `debtors.read`, `tax.read`, `payments.read`, `dashboard.read`, `settings.read`, `wallet.read`, `reminders.read`.

**This defect is independent of F-01 and survives its fix.** The backend would honour `expenses.read: true` if it were ever sent — nothing can send it.

Compounding design trap: the permission model has no implication rules. Granting `expenses.create` without `expenses.read` yields a member who can POST an expense but can never see one — an incoherent state the product can currently be put into.

---

### F-03 · 🟠 HIGH · No row-level scoping on expenses · CONFIRMED · HIGH

`sales-crud.service.ts:151-153` scopes `sales_staff` to `OR: [{ createdBy: userId }, { source: 'bank_transfer' }]`. `expense.service.ts` has **no equivalent** — role-level check only, at lines 36-400.

**Sequencing hazard:** expenses are currently invisible to `sales_staff`, so this is latent. Fixing F-01 and F-02 without addressing this **newly exposes every expense in the business** — all members', all suppliers', all amounts — to any role granted `expenses.read`. Expense records carry commercially sensitive detail.

---

### F-04 · 🟠 HIGH · Five permission predicates, two opposite semantics · CONFIRMED · HIGH

- **Fail-open** — `Sidebar.tsx:53`, `Dashboard.tsx:486`, `SalesExpenseChart.tsx:143`: `perms[key] !== false`. A **missing key grants access**.
- **Fail-closed** — `PermissionGate.tsx:21-24`, `Account.tsx:39`: absent or non-boolean ⇒ deny.

Currently **latent**: I counted all five role maps and each defines a complete 30 keys, so `undefined` does not occur in practice today.

It becomes live the moment a key is added to `ALL_PERMISSIONS` and omitted from one role map — the sidebar would then expose a page that `PermissionGate` simultaneously hides. There is no test guarding this (see F-08).

---

### F-05 · 🟠 HIGH · Client never refreshes after a permission change · CONFIRMED · HIGH

`frontend/src/stores/business.store.ts:41-45` early-returns unless `force` is passed and the cache is stale. Nothing calls `fetchBusinesses(true)` after a member update.

The backend correctly invalidates its cache (`team.service.ts:357`). So after an owner edits permissions, **the backend is fresh and the client is stale** until a full reload. Even with F-01 fixed, an edit appears not to take effect.

---

### F-06 · 🟡 MEDIUM · Fourth copy of the permission matrix · CONFIRMED · HIGH

`TeamSettingsTab.tsx:101-135` defines `ROLE_DEFAULT_PERMS` — a frontend reimplementation of `ROLE_DEFAULTS`, partial (overridable keys only). It is **live**, used at 7 sites to seed override forms (lines 187, 198, 225, 241, 592, 717).

Two sources of truth for the same business rule. It has already drifted: the backend matrix is complete (30 keys), this one is not. Any role-default change must be made twice.

---

### F-07 · 🟡 MEDIUM · No endpoint exposes the caller's merged permissions · CONFIRMED · HIGH

`team.routes.ts:17-22` — `/`, `/invite`, `PATCH /members/:memberId`, `DELETE /members/:memberId`, `/invitations/:id/revoke`, `/invitations/:id/resend`. Nothing returns the caller's resolved permission map.

This forces the UI to source permissions from an unrelated endpoint (`GET /businesses`), which is why the defect was possible and why fixing F-01 leaves the contract fragile.

---

### F-08 · 🟡 MEDIUM · Tests cover role defaults only · CONFIRMED · HIGH

`backend/tests/e2e/team-permissions.e2e.test.ts` — 20+ cases across `sales_staff`, `accountant`, `viewer`, `manager`. Every case exercises **role defaults**. There is:

- no test with a custom permission override,
- no assertion on `myPermissions` in any `GET /businesses` response.

The suite validates the half of the system that works and cannot see the half that is broken. **This is why the bug survived a well-built test suite** — it is a coverage-shape gap, not a coverage-volume gap.

---

### F-09 · 🟢 LOW · 60s staleness window on revocation · CONFIRMED / MEDIUM

`ownership.ts:24` caches membership for 60s. A revoked member can retain access for up to 60s. Invalidation exists, so this is bounded and acceptable at current scale. Noted for awareness, not for action.

---

## 5. Risk Register

| ID | Finding | Severity | Confidence | Evidence | Impact | Action |
|---|---|---|---|---|---|---|
| F-01 | Overrides dropped in `listBusinesses` | 🔴 CRITICAL | HIGH | `business.service.ts:141-145,184` | Feature entirely non-functional; owners believe access is granted when it is not | Fix merge |
| F-02 | `.read` permissions not overridable | 🔴 CRITICAL | HIGH | `TeamSettingsTab.tsx:83-99` | "Grant expense access" is unreachable even after F-01 | Expose `.read` |
| F-03 | No row-level expense scoping | 🟠 HIGH | HIGH | `sales-crud.service.ts:151` vs `expense.service.ts` | Fixing F-01/F-02 alone newly exposes all expense data | Scope before unblocking |
| F-04 | Divergent fail-open/closed predicates | 🟠 HIGH | HIGH | `Sidebar.tsx:53` vs `PermissionGate.tsx:21` | Latent authz UI divergence on any future key addition | Unify |
| F-05 | No client refresh post-edit | 🟠 HIGH | HIGH | `business.store.ts:41-45` | Edits appear inert until reload | Force-refresh |
| F-06 | 4th copy of role matrix | 🟡 MEDIUM | HIGH | `TeamSettingsTab.tsx:101` | Rule drift; changes applied twice or missed | Remove |
| F-07 | No my-permissions endpoint | 🟡 MEDIUM | HIGH | `team.routes.ts:17-22` | Fragile contract; forced indirection | Add |
| F-08 | No override test coverage | 🟡 MEDIUM | HIGH | `team-permissions.e2e.test.ts` | Regression will recur silently | Add |
| F-09 | 60s revocation window | 🟢 LOW | MEDIUM | `ownership.ts:24` | Bounded staleness | No action |

---

## 6. Scores — Subsystem Only

| Dimension | Score | Basis |
|---|---|---|
| Security (authz enforcement) | **8/10** | Backend enforcement correct and override-aware. Deductions: F-03 latent exposure, F-04 latent divergence. |
| Data Architecture | **7/10** | JSONB overrides appropriate; untyped keys permit drift; merge logic duplicated across layers. |
| API Architecture | **6/10** | No my-permissions endpoint (F-07); list payload field silently misleading. |
| Maintainability | **5/10** | Four copies of the matrix (F-06); five divergent predicates (F-04). |
| Testability | **4/10** | Good e2e discipline on enforcement; structural blind spot on overrides and client contract (F-08). |
| Reliability | **5/10** | Backend/client cache divergence (F-05). |

**Overall: 5.5/10 — sound enforcement, broken contract.** The difficult half was built correctly.

---

## 7. Remaining Unknowns

1. **No runtime reproduction.** All findings are from static tracing. The direct-URL test in §8 should be run first to confirm F-01.
2. **Service coverage is sampled, not exhaustive.** Expenses and sales verified in depth. `dva.service.ts:36,118,522`, `tax-payment.service.ts:128` and `sales-verification.service.ts:168,482-483` still call owner-only `verifyBusinessOwnership` — plausibly intentional for payout and account-setup surfaces, **not audited for necessity**.
3. **Invoices, debtors, tax, payments row-level scoping** — not audited. F-03 may recur per domain.
4. **Production data shape** — whether live `BusinessMember.permissions` values contain keys absent from `ALL_PERMISSIONS` is unverified.
5. **Whether F-02 is intentional product scope** ("write permissions only, read follows role") was not confirmed with the product owner. If intentional, the model needs to state it — as shipped, the UI implies otherwise.

---

## 8. Fastest Confirmation Test

Have the sales rep navigate **directly** to `/expenses` by URL.

- **Page loads with data** ⇒ backend permits, UI map denies ⇒ **F-01 confirmed**.
- **Page 403s** ⇒ the override never persisted and F-01 is not the whole story — re-check `team.service.ts:176` and `:837-847`.

This single test separates the two hypotheses in under a minute and should precede any code change.

---

## 9. Bottom Line

| | |
|---|---|
| **Biggest strength** | The enforcement layer. `hasPermission` / `resolvePermissions` / `verifyBusinessAccess` are correct, well-factored, and hard to break. |
| **Biggest problem** | A correct backend feeding an incorrect client contract. One omitted argument at `business.service.ts:184`. |
| **Biggest risk if unchanged** | Owners grant permissions, believe they succeeded, and onboard staff who silently cannot work — with no error anywhere. Trust damage on a feature sold as collaboration. |
| **Highest-value first move** | Scope expenses row-level (F-03) **before** unblocking visibility — otherwise the fix creates a data-exposure incident. |
| **Verdict** | 🟠 **Significant debt — in one specific subsystem.** The architecture is sound and needs targeted work, not redesign. F-01 is a one-line fix; F-02 is a UI omission; F-03 is the one that must not be skipped. |

Implementation plan: **`userrolesfixed.md`**