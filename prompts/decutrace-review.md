# Re-Review: Race Condition Remediation Plan (decutrace.md)

Reviewed against the actual codebase at `c:\Users\pc\Desktop\tax by wallx` on 2026-09-24. No code was modified — this is a plan-only correction.

---

# 1. EXECUTIVE VERDICT

🟡 **PLAN REQUIRES SIGNIFICANT REVISION**

The audit's *diagnosis* (Sections 1–6 of decutrace.md) is factually accurate — every claim was independently re-verified against the real files and holds up, with two small path-name corrections. The problem is the *cure* (Tier 1/2/3 remediation sketch at the bottom): it recommends new composite backend endpoints as the primary fix for `Account.tsx`, and generic "add AbortController everywhere" for the rest, without checking whether that matches the actual shape of the code. Once you look at the real files, the cheapest, lowest-blast-radius fix for 5 of the 6 pages is a **frontend-only guard pattern that already exists twice in this codebase** (`business.store.ts`'s `inflight` dedup, `invoice.store.ts`'s `listCacheKey` guard). Only `Account.tsx` genuinely benefits from a backend change, and even there the "6 calls" framing is wrong — it's 4 calls in steady state, not 6.

---

# 2. WHAT WAS WRONG WITH THE OLD PLAN

🟠 **OUTDATED / imprecise endpoint paths.** decutrace.md calls the settlement endpoints `/settlements/preview` and `/settlements/payouts` (plural "settlements"). The actual routes are `/settlement/preview` and `/settlement/history` (singular "settlement", and "history" not "payouts"). Minor, but a plan handed to a coding agent with wrong paths wastes a cycle.

🔴 **WRONG — "6 separate uncoordinated API calls" on every load/refresh.** Re-reading `useAccountData.ts` line by line:
- `fetchDVA()` and `fetchTransactions()` always fire (2 calls).
- `fetchSettlementPreview(bizId)` and `fetchPayoutHistory(...)` fire *if the callbacks were passed in* (2 calls) — these live in `settlement.store.ts`, not inline in the hook.
- `fetchBusinesses(true)` only fires when `isManual` is true (manual refresh button), not on every mount.
- `/banks` fetches exactly once, guarded by `if (!banks)` (`useAccountData.ts:171`) — it does not re-fire on every refresh.

So steady-state mount is **4 calls**, and manual refresh is **5 calls** (adds `fetchBusinesses`). The plan's "6 calls every refresh" number overstates the fan-out and would lead a developer to design a composite endpoint scoped to the wrong set of calls. The race condition itself (client-computed balance from 50 transactions vs. server ledger balance from settlement preview) is real and correctly diagnosed — just the call count is off.

🟠 **INCOMPLETE — the audit missed that `settlement.store.ts` has the identical vulnerability class as `credit.store.ts`.** decutrace.md's Section 4 (Dashboard) flags `credit.store.ts` for lacking a businessId/request-guard, and recommends fixing "`credit.store.ts`, `invoice.store.ts`, `ledger.store.ts`" in Tier 3 — but `invoice.store.ts` is already correct (it's in the "already protected" list one section earlier — contradictory), there is no `ledger.store.ts` in this codebase (verified via file search — it doesn't exist, the audit invented it), and `settlement.store.ts` (used by `Account.tsx`, the single highest-severity page in the report) was never mentioned at all despite having the exact same missing-guard problem as `credit.store.ts`. This is a real gap: fixing `credit.store.ts` alone leaves `Account.tsx` — the page the report calls CRITICAL — with an unguarded store underneath the very hook that was flagged.

🟡 **RISKY — Tier 1's "combine Sales/Expenses list+summary+daily into one endpoint via `?includeSummary=true&includeDaily=true`" doesn't fit the actual query contracts.** Verified: `GET /sales` takes `page/limit/source/status/startDate/endDate`; `GET /sales/summary` takes `month/year`; `GET /sales/daily` takes `date`. These are three different filter shapes (pagination+range filters vs. month/year vs. single date) serving three different UI regions (table, monthly KPI cards, daily strip) that the user can view independently. Merging them into one endpoint means every table page-turn would also re-run the monthly aggregate and the daily aggregate queries, even when neither changed — trading a request-count problem for a wasted-computation problem, and coupling three independently-cacheable widgets into one invalidation unit. The frontend-only stale-response-guard fix (Tier 2/3 style) fully eliminates the *visible bug* (wrong data on screen) without touching the backend at all, which is both safer and less work. The backend composite endpoint is not needed here.

🟡 **UNNECESSARY — Tier 2's per-component `AbortController` snippet, applied literally to Sales/Expenses/TaxReports.** These three pages hold their data in **component-local `useState`**, not in a shared Zustand store (verified: no `sales.store.ts` / `expense.store.ts` / `tax.store.ts` exist; state lives directly in `Sales.tsx`, `Expenses.tsx`, `TaxReportsList`). `AbortController` works here, but it's the wrong primitive for this codebase's established convention. This repo already has a proven, simpler pattern for exactly this problem — a monotonically increasing request-sequence guard (see `business.store.ts`'s module-level `inflight` variable and `invoice.store.ts`'s `listCacheKey` comparison) that discards a response if it's no longer current. `AbortController` requires wiring cleanup functions through every `useEffect` and passing `signal` through every call site; a sequence-number guard is a 3-line addition per fetch function with no signal plumbing. Both solve the race; the sequence-guard is less code and matches what a developer reading this codebase will already recognize.

🟢 **CORRECT — the diagnosis of Dashboard.tsx, Debtors.tsx, and TaxReports.tsx.** All three verified exactly as described: `fetchDashboardBundle` has a `cancelled` flag (`Dashboard.tsx:517,544-567`) but `useCreditStore` actions it calls do not; `Debtors.tsx` debounces search input but `credit.store.ts` has no request-id or search-term guard; `TaxReportsList` re-fetches on filter/pagination changes with zero cancellation. These findings stand as-is.

🟢 **CORRECT — the "already protected" inventory**, with one omission noted above (`settlement.store.ts` should have been flagged alongside `credit.store.ts`, and is not "protected").

---

# 3. WHAT CHANGED

- Replaced the backend-composite-endpoint strategy for Sales/Expenses with a frontend-only sequence-guard fix (matches existing query-shape constraints, zero backend risk).
- Replaced generic `AbortController` guidance for Sales/Expenses/TaxReports with the same sequence-guard pattern already proven in `business.store.ts` / `invoice.store.ts`, since those pages use local `useState`, not stores — a pattern this repo has already chosen twice, so a third page shouldn't introduce a second technique.
- Added `settlement.store.ts` to the list of stores requiring the businessId-guard fix — the audit's Tier 3 list omitted it despite `Account.tsx` (the CRITICAL page) depending on it.
- Removed the invented `ledger.store.ts` file from the fix target list (doesn't exist).
- Scoped the `Account.tsx` fix to a genuinely new, narrow backend endpoint (`GET /businesses/:id/account/summary`) that replaces only the DVA-transactions-derived client math with the server's existing settlement-preview numbers — not a full 6-way merge, since 2 of the original "6 calls" (`/banks`, `fetchBusinesses`) are either one-time or manual-only and don't belong in a dashboard-summary endpoint.
- Corrected endpoint path names (`/settlement/preview`, `/settlement/history`, singular).
- Confirmed `fetchPayoutHistory`/`fetchSettlementPreview` are store actions injected into the hook, not calls made inline inside `useAccountData.ts` — matters for where the guard code needs to live (the store, not the hook).

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| New composite endpoint merging Sales list+summary+daily | Removed | Frontend sequence-guard only | Query shapes differ (pagination vs month/year vs date); merging wastes computation and couples independent widgets |
| Same composite-endpoint idea for Expenses | Removed | Frontend sequence-guard only | Identical reasoning to Sales |
| Generic `AbortController` in every `useEffect` | Replaced | Request-sequence counter (`useRef`) per fetch function | Matches existing repo convention (`business.store.ts`, `invoice.store.ts`); no signal plumbing needed; local `useState` pages, not stores |
| Tier 3 target list: `credit.store.ts`, `invoice.store.ts`, `ledger.store.ts` | Corrected | `credit.store.ts`, `settlement.store.ts` | `invoice.store.ts` is already correct (contradicts audit's own "already protected" section); `ledger.store.ts` does not exist; `settlement.store.ts` was the real omission and sits under the CRITICAL page |
| "6 calls every refresh" for Account.tsx | Corrected | 4 calls steady-state, 5 on manual refresh, `/banks` fires once ever | Re-read `useAccountData.ts` line by line; `/banks` and `fetchBusinesses` are conditional, not part of the repeating fan-out |
| New `GET /account/dashboard` merging all 6 | Narrowed | New `GET /account/summary` merging only DVA status + transactions-derived numbers + settlement preview (3 of the 4 steady-state calls) | `/banks` is static reference data unrelated to business context and already cached once; folding it into a per-business endpoint adds no value |
| Endpoint paths `/settlements/preview`, `/settlements/payouts` | Corrected | `/settlement/preview`, `/settlement/history` | Verified against actual route file |

---

# 4. VERIFIED FILE IMPACT

### CREATE
None required. (No new files — the fix is additive guard logic inside existing files, plus one new backend route+controller function, not a new file, since `settlement.controller.ts` and `settlement.service.ts`/`payout-preview.service.ts` already exist and can host one more exported function.)

### MODIFY

**Frontend — sequence-guard fixes (Tier A, do first, lowest risk):**
- `frontend/src/stores/credit.store.ts` — add request-sequence guard to `fetchCredits` and `fetchSummary`.
- `frontend/src/stores/settlement.store.ts` — add request-sequence guard to `fetchPreview` and `fetchHistory`.
- `frontend/src/pages/Sales.tsx` — add sequence guard to `fetchSales`, `fetchSummary`, `fetchDaily` (component-local, via `useRef` counter).
- `frontend/src/pages/Expenses.tsx` — same pattern, mirrored 1:1 from Sales.tsx.
- `frontend/src/pages/TaxReports.tsx` (`TaxReportsList`) — add sequence guard to `fetchReports`.
- `frontend/src/pages/Debtors.tsx` — no code change needed beyond what `credit.store.ts` gets; the debounce already exists (`Debtors.tsx:181-188`), the store fix alone closes this race since Debtors reads from the same `fetchCredits`.

**Backend — narrow composite endpoint (Tier B, only for Account.tsx):**
- `backend/src/routes/settlement.routes.ts` — add `GET /businesses/:businessId/account/summary` route (or add to `dva.routes.ts` — see Implementation Steps for the decision and why it should live in `dva` namespace, not `settlement`).
- `backend/src/controllers/dva.controller.ts` — add `getAccountSummary` controller.
- `backend/src/services/dva.service.ts` — add `getAccountSummary` service function that runs the DVA-transactions query and calls the existing `payout-preview.service.ts` preview logic in parallel (`Promise.all`), returning one payload with the ledger balance as authoritative and the transaction list for display only (no more client-side sum).

**Frontend — consume the new endpoint:**
- `frontend/src/hooks/useAccountData.ts` — replace the client-side `totalBalance`/`receivedThisMonth` calculation (lines 99-108) with values taken directly from the new endpoint's settlement-preview-derived numbers; keep `fetchTransactions` for the list display only, not for arithmetic.

### DELETE
None.

### DATABASE
None. No schema, migration, or model changes — every fix is read-path composition or in-memory guard logic. This matches decutrace.md's own scope (it never proposed schema changes) and is confirmed correct: no new persisted state is needed to track "is this the latest request," a component ref or module-level counter is sufficient and is not something that needs to survive a page reload.

### CONFIGURATION
None.

### TESTS
- `backend/tests/e2e/api.e2e.test.ts` — add a smoke test for the new `GET /businesses/:id/account/summary` endpoint (happy path: returns dva + balance + recent transactions in one call; auth-required; ownership-checked).
- No new frontend test infra exists in this repo today (no test runner configured for `frontend/`) — do not introduce one as a side effect of this fix; that would be unrelated scope expansion. Manual verification steps are specified in Testing Strategy below instead.

---

# 5. IMPROVED IMPLEMENTATION PLAN

## 5.1 Objective

Eliminate the six confirmed frontend race conditions (stale-response overwrites and cross-business state leakage) using the smallest change that fixes each one, reusing the two guard patterns this codebase already has, and add exactly one new backend endpoint where — and only where — an endpoint is genuinely the right fix (`Account.tsx`'s client-side balance math).

## 5.2 Requirements (from decutrace.md, confirmed against code)

1. Rapid month/filter/page changes on Sales, Expenses, and TaxReports must never display a response that does not match the currently-selected filters.
2. Switching the active business must never leave stale data from the previous business visible in the Dashboard's debtor widget or in Account.tsx.
3. Fast-typing then backspacing in the Debtors search box must never display results for a stale search term.
4. Account.tsx's displayed balance must come from one authoritative source (the backend ledger via settlement preview), not a client-side sum of a capped 50-row transaction list.

## 5.3 Current System (verified)

- `business.store.ts` already solves "duplicate concurrent calls for the same data" using a module-level `inflight` promise (`business.store.ts:30,48-49,76`) — not applicable here since our problem is *out-of-order responses for different params*, not *duplicate calls for the same params*, but the *file-scoped guard variable* convention is what we reuse.
- `invoice.store.ts` already solves "out-of-order responses for different params" using a `listCacheKey` string that's recomputed from `businessId + query` before the request fires and compared after it resolves (`invoice.store.ts:96-144`). This is the exact pattern needed for `credit.store.ts`, `settlement.store.ts`, and the three `useState`-based pages — just generalized to a numeric counter since Sales/Expenses/TaxReports don't have a natural single cache key (multiple independent fetch functions per page).
- `Dashboard.tsx`'s `fetchDashboardBundle` already solves this for its own scope with a boolean `cancelled` flag closed over by the `useEffect` cleanup (`Dashboard.tsx:517,544-567`) — correct pattern, just not extended to the credit-store calls it also triggers.

## 5.4 Implementation Approach

**Pattern: monotonic request-sequence guard**, applied consistently everywhere instead of mixing `AbortController` and cache-keys and cancelled-flags. One mental model for every fix:

```typescript
// Inside a Zustand store: module-scope or store-field counter, per fetch function
let fetchCreditsSeq = 0;

fetchCredits: async (businessId, query) => {
  const seq = ++fetchCreditsSeq;
  set({ listLoading: true, listError: null });
  try {
    const res = await api.get(basePath(businessId), { params: query });
    if (seq !== fetchCreditsSeq) return; // a newer call superseded this one — discard
    set({ credits: res.data.data, listLoading: false /* ...rest of the payload */ });
  } catch (err) {
    if (seq !== fetchCreditsSeq) return;
    set({ listError: /* ... */, listLoading: false });
  }
}
```

```typescript
// Inside a component with local useState (Sales.tsx / Expenses.tsx / TaxReportsList)
const fetchSummarySeqRef = useRef(0);

const fetchSummary = useCallback(async () => {
  const seq = ++fetchSummarySeqRef.current;
  try {
    const res = await api.get(`${basePath}/summary`, { params: { month, year } });
    if (seq !== fetchSummarySeqRef.current) return;
    setSummary(res.data.data);
  } catch (err) {
    if (seq !== fetchSummarySeqRef.current) return;
    // existing error handling
  }
}, [basePath, month, year]);
```

Why this over `AbortController`: no signal plumbing through every `api.get` call site, no cleanup-function wiring in every `useEffect`, and it matches a pattern this codebase's own authors already reached for twice. Why this over the existing `cancelled`-boolean style in `Dashboard.tsx`: a boolean only tells you "did the effect unmount," not "did a *newer call to this same function* supersede me" — which is the actual failure mode in rapid filter-flipping (the effect never unmounts, the user just fires three fetches in three seconds). A counter handles both unmount and rapid-refire with one mechanism.

Each fetch function gets its **own** counter (not one shared per store/page), because `fetchCredits` and `fetchSummary` in `credit.store.ts` are triggered independently and must not block each other.

## 5.5 File Changes — Implementation Steps

**Step 1 — `frontend/src/stores/credit.store.ts`**
What: Add module-scope `let fetchCreditsSeq = 0` and `let fetchSummarySeq = 0`. Wrap `fetchCredits` and `fetchSummary` bodies with the guard pattern above.
Where: Top of file (counters), inside each action (guard checks after `await`, before every `set()`).
Why: Fixes Debtors.tsx search-race and Dashboard.tsx cross-business leakage claims (D, E) — both consume this same store.
Dependencies: None — self-contained, no other file needs to change first.

**Step 2 — `frontend/src/stores/settlement.store.ts`**
What: Same pattern for `fetchPreview` and `fetchHistory`.
Where: Top of file (counters), inside each action.
Why: This is the omission from the original audit — `Account.tsx` (CRITICAL severity) depends on this store via `useAccountData.ts`'s injected callbacks, and it has zero guards today.
Dependencies: None.

**Step 3 — `frontend/src/pages/Sales.tsx`**
What: Add three `useRef(0)` counters (one per fetch function: list, summary, daily). Guard each `set*` call after its `await`.
Where: Inside the component, near existing `fetchSales`/`fetchSummary`/`fetchDaily` definitions.
Why: Fixes the month-flip and pagination races (claim B) without touching the backend query contracts.
Dependencies: None.

**Step 4 — `frontend/src/pages/Expenses.tsx`**
What: Identical to Step 3, mirrored.
Where: Same structure as Sales.tsx.
Why: Fixes claim C.
Dependencies: None — can be done in parallel with Step 3.

**Step 5 — `frontend/src/pages/TaxReports.tsx` (`TaxReportsList`)**
What: Add one `useRef(0)` counter guarding `fetchReports`.
Where: Inside `TaxReportsList`.
Why: Fixes claim F.
Dependencies: None.

**Step 6 — Backend: `backend/src/services/dva.service.ts`**
What: Add `getAccountSummary(userId, businessId)` that runs three things via `Promise.all`: (a) the existing DVA-transactions lookup (for the list display only), (b) the existing `getPayoutPreview()` from `payout-preview.service.ts` (for `ledgerBalance`, sourced from `availableForWithdrawal`), and (c) one **new** aggregation — `businessAgg`'s exact shape (`payout-preview.service.ts:98-108`: `salesTransaction.aggregate` where `businessId`, `source: 'bank_transfer'`, `dvaOrigin: true`, `status: { in: SETTLED_SALE_STATUSES }`) with an added `transactionDate: { gte: startOfMonthUTC, lt: startOfNextMonthUTC }` filter, for `receivedThisMonth`. Build the month boundaries in UTC explicitly (`new Date(Date.UTC(year, month, 1))`), not `new Date(year, month, 1)` — this codebase has a documented bug class where local-time date construction on a UTC+ host drifts date-range queries by a day.
Where: New exported function in the existing service file — reuses `getPayoutPreview()` rather than duplicating its lifetime-total logic; only the monthly aggregation is new.
Why: This is the one place where the audit's "eliminate client-side arithmetic" recommendation is correct and necessary — the truncation bug (>50 transactions) is a real correctness bug, not just a race condition, and can only be fixed server-side. Verified by reading `payout-preview.service.ts` in full: no existing aggregation is monthly-scoped, so this one new query is required, not a duplication.
Dependencies: None — `payout-preview.service.ts`'s aggregation shape and `SETTLED_SALE_STATUSES` import are already confirmed to exist and are safe to reuse as a template.

**Step 7 — Backend: `backend/src/controllers/dva.controller.ts` + `backend/src/routes/dva.routes.ts`**
What: Add `getAccountSummary` controller (ownership check via existing `dvaService` pattern, same as `getVirtualAccount`) and mount `GET /businesses/:businessId/dva/account-summary`.
Where: Existing files, new exported function + one new route line.
Why: Exposes Step 6.
Dependencies: Step 6 must exist first.

**Step 8 — Frontend: `frontend/src/hooks/useAccountData.ts`**
What: Replace lines 99-108 (client-side `totalBalance`/`receivedThisMonth` reduce over `dvaTxns`) with values read from the new endpoint's response. Keep `transactions` state for list rendering only.
Where: Inside `fetchTransactions`, or introduce a new `fetchAccountSummary` that supersedes both `fetchDVA` and the balance portion of `fetchTransactions` — recommend keeping `fetchTransactions` for the list (unchanged shape, still useful for the transaction feed) and adding a separate lightweight call for just `ledgerBalance`/`receivedThisMonth`, to avoid a large refactor of the hook's public API that other components depend on.
Why: Removes the >50-transaction truncation bug and the balance-flicker race in one move.
Dependencies: Step 7 must be deployed first.

## 5.6 Edge Cases

- **Business switch mid-flight (Dashboard, Account, Debtors):** counter guard discards the stale response; the newer request's `set()` wins because it's the one whose sequence number matches when it resolves. If the newer request fails (e.g., network error) after the guard was already incremented, the store correctly shows the error state for the *current* business, not stale data from the old one — verified this doesn't regress existing error-handling since the guard only gates `set()` calls, not the `catch` block's early-return decision.
- **Rapid double-fire of an identical request (e.g., same month clicked twice fast):** harmless — second call increments the counter again, first call's response (whichever arrives) is superseded by whichever fires last, which is correct (last-issued request should win, and it will, since its sequence number is highest).
- **Unmount during in-flight request:** the counter guard doesn't prevent a `set()` on an unmounted component's state in the `useState` cases (Sales/Expenses/TaxReports) — this was already true before the fix (React only warns in dev, doesn't crash) and is out of scope for a race-condition fix; not a regression.
- **`>50 DVA transactions` existing businesses:** after Step 6-8 ship, their balance display corrects itself on next load with no backfill needed — it's a read-path fix, not a data fix.

## 5.7 Testing Strategy

- Backend: add e2e smoke test for `GET /businesses/:id/dva/account-summary` (`tests/e2e/api.e2e.test.ts`) — happy path + auth-required + ownership check (business belonging to a different user returns 404/403 per existing pattern in that test file).
- Manual verification (no frontend test runner exists in this repo — do not introduce one for this fix):
  1. Sales.tsx: open DevTools network throttling, rapidly click through 3 months, confirm displayed month header always matches displayed summary numbers.
  2. Expenses.tsx: same test with category filter instead of month.
  3. Debtors.tsx: type "Emeka", quickly backspace to "Em", confirm the table settles on "Em" results, not "Emeka".
  4. Dashboard.tsx: create/seed a second business with different debtor data, switch rapidly between the two via sidebar, confirm debtor widget always matches the currently active business.
  5. Account.tsx: seed a business with 60+ DVA transactions, confirm balance matches Paystack ledger truth, not a sum truncated at 50.

## 5.8 Acceptance Criteria

1. All five frontend files (`credit.store.ts`, `settlement.store.ts`, `Sales.tsx`, `Expenses.tsx`, `TaxReports.tsx`) have sequence-guarded fetch functions; no `set()`/`setState()` call in any guarded function executes without first checking its sequence number against the latest.
2. `useAccountData.ts` no longer computes `totalBalance`/`receivedThisMonth` by reducing over the `transactions` array; both values come from the new backend endpoint.
3. New endpoint has ownership verification consistent with every other `businesses/:businessId/...` route in this codebase (`business.userId === userId` check, matching the pattern documented in CLAUDE.md).
4. No existing endpoint, route, or store method signature was removed or renamed — this is purely additive plus internal guard logic, so no caller elsewhere in the app breaks.
5. Manual test scenarios in 5.7 all pass.

---

# 6. ACCEPTANCE CRITERIA
(See 5.8 above — duplicated per template structure.)

---

None. Both prior open questions were resolved by direct verification (see below) — no further input is needed before implementation.

**Resolved — `payout-preview.service.ts` monthly aggregation (was Q1):** Read the file in full (`backend/src/services/settlement/payout-preview.service.ts:1-278`). Confirmed: **no monthly-scoped figure exists anywhere in this service.** Every aggregation (`splitAgg`, `plainAgg`, `allAgg`, `businessAgg`, the withdrawal aggregates) is a lifetime total with no `transactionDate`/`createdAt` filter. `businessInflows` (line 109) is the closest reusable value — it's the authoritative lifetime sum of this business's settled DVA inflows, computed via `salesTransaction.aggregate` rather than by reducing a capped 50-row list, which is exactly the truncation bug this fix needs to close. Step 6 must add one **new** aggregation for "received this month" (same `where` shape as `businessAgg` at line 98-108, plus a `transactionDate: { gte: startOfMonth, lt: startOfNextMonth }` clause, built in UTC — see `[[utc_db_date_bug_class]]` memory, this codebase has a known landmine around `@db.Date`/date-range columns needing UTC-built boundaries on UTC+ hosts). This is a small additive query, not a duplication of existing logic — the plan in Section 5.5 Step 6 already anticipated this correctly and required no revision.

**Resolved — endpoint location (was Q2):** `dva.routes.ts` / `dva.controller.ts` / `dva.service.ts`, per the reasoning in the answer above: sole consumer already treats DVA as "the account," ownership-check pattern already exists there, keeps the domain boundary consistent with how the rest of this codebase is laid out. Final route: `GET /businesses/:businessId/dva/account-summary`.

---

# 8. FINAL READINESS SCORE

**10/10 — implementation-ready.**

Both frontend (Steps 1-5) and backend (Steps 6-8) are fully specified against verified code. `payout-preview.service.ts` was read in full — confirmed no monthly aggregation exists yet, so Step 6 correctly specifies one new query built on the exact `where`-clause shape already used at `payout-preview.service.ts:98-108`, with an explicit UTC-boundary requirement to avoid this codebase's known date-range bug class. Endpoint location is settled (`dva.routes.ts`, matching the ownership-check pattern already in `dva.controller.ts`). No open questions remain — a developer or coding agent can implement Steps 1-8 sequentially with no further research required.
