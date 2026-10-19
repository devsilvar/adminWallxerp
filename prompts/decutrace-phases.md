# Race Condition Fix — Phased Execution Plan

Source plan: `decutrace-review.md` (10/10 readiness, fully verified against the codebase on 2026-09-24).

**How to use this document:** Execute phases in order. Each phase is self-contained — it names the exact file, the exact current code to find, and the exact new code to put there. After each phase there is a **Verify** step and a **Stop and report** instruction. Do not start the next phase until the current phase's verify step passes. If the current code at a file does not match what's quoted below (someone edited it since this plan was written), STOP and report the mismatch instead of guessing.

General rule for every phase: this is an **additive-only fix**. Do not delete any existing line unless the instructions explicitly say to replace it. Do not rename any function, prop, or exported symbol. Do not change any UI/JSX/markup — every change in Phases 1–6 is inside a `fetch*` function body only.

---

## PHASE 0 — Pre-flight check

**Goal:** confirm the repo is in the expected state before touching anything.

1. Run `git status` in `c:\Users\pc\Desktop\tax by wallx`. Confirm there are no uncommitted changes to these six files (if there are, STOP and ask the human first — do not overwrite in-progress work):
   - `frontend/src/stores/credit.store.ts`
   - `frontend/src/stores/settlement.store.ts`
   - `frontend/src/pages/Sales.tsx`
   - `frontend/src/pages/Expenses.tsx`
   - `frontend/src/pages/TaxReports.tsx`
   - `frontend/src/hooks/useAccountData.ts`
2. Confirm these backend files exist (read-only check, do not edit yet):
   - `backend/src/services/dva.service.ts`
   - `backend/src/controllers/dva.controller.ts`
   - `backend/src/routes/dva.routes.ts`
   - `backend/src/services/settlement/payout-preview.service.ts`

**Stop and report:** confirm all files exist and are clean, then proceed to Phase 1.

---

## PHASE 1 — `credit.store.ts` sequence guard

**Why:** `fetchCredits` and `fetchSummary` in this store have no protection against out-of-order responses. If a user types a search term, deletes it, and retypes (Debtors.tsx page), or if the active business is switched quickly (Dashboard.tsx), an older, slower response can overwrite the store with stale data after a newer request already returned. This phase adds a request counter so only the most-recently-issued call's response is ever written to state.

**File:** `frontend/src/stores/credit.store.ts`

**Step 1.1 — Add two module-level counters.**

Find this line near the top of the file (right after the imports, before the `interface CreditState` block):

```typescript
interface CreditState {
```

Insert two lines directly ABOVE it, so the file reads:

```typescript
let fetchCreditsSeq = 0;
let fetchSummarySeq = 0;

interface CreditState {
```

**Step 1.2 — Guard `fetchCredits`.**

Find this exact block:

```typescript
  fetchCredits: async (businessId, query) => {
    set({ listLoading: true, listError: null });
    try {
      const params: Record<string, any> = {
        page: query.page ?? 1,
        limit: query.limit ?? 15,
      };
      if (query.status) params.status = query.status;
      if (query.search) params.search = query.search;

      const res = await api.get(basePath(businessId), { params });
      const rawData = res.data?.data;
      const data = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
      const summary = res.data?.summary ?? rawData?.summary ?? null;
      const pagination = res.data?.pagination ?? rawData?.pagination ?? null;

      set({
        credits: data,
        summary: summary || get().summary,
        pagination,
        listLoading: false,
      });
    } catch (err: any) {
      set({
        listLoading: false,
        listError: err.response?.data?.message || err.message || 'Failed to fetch credits',
      });
    }
  },
```

Replace it with:

```typescript
  fetchCredits: async (businessId, query) => {
    const seq = ++fetchCreditsSeq;
    set({ listLoading: true, listError: null });
    try {
      const params: Record<string, any> = {
        page: query.page ?? 1,
        limit: query.limit ?? 15,
      };
      if (query.status) params.status = query.status;
      if (query.search) params.search = query.search;

      const res = await api.get(basePath(businessId), { params });
      if (seq !== fetchCreditsSeq) return; // a newer fetchCredits call superseded this one
      const rawData = res.data?.data;
      const data = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
      const summary = res.data?.summary ?? rawData?.summary ?? null;
      const pagination = res.data?.pagination ?? rawData?.pagination ?? null;

      set({
        credits: data,
        summary: summary || get().summary,
        pagination,
        listLoading: false,
      });
    } catch (err: any) {
      if (seq !== fetchCreditsSeq) return;
      set({
        listLoading: false,
        listError: err.response?.data?.message || err.message || 'Failed to fetch credits',
      });
    }
  },
```

**What changed, precisely:** added `const seq = ++fetchCreditsSeq;` as the first line of the function body, and added `if (seq !== fetchCreditsSeq) return;` immediately after `await api.get(...)` resolves (both in the try block, right after getting `res`, and in the catch block, right after entering catch). Everything else — every field being set, every existing line — is unchanged.

**Step 1.3 — Guard `fetchSummary`.**

Find this exact block:

```typescript
  fetchSummary: async (businessId) => {
    try {
      const res = await api.get(`${basePath(businessId)}/summary`);
      const summary = res.data?.data ?? null;
      if (summary) {
        set({ summary });
      }
      return summary;
    } catch (err) {
      return null;
    }
  },
```

Replace it with:

```typescript
  fetchSummary: async (businessId) => {
    const seq = ++fetchSummarySeq;
    try {
      const res = await api.get(`${basePath(businessId)}/summary`);
      if (seq !== fetchSummarySeq) return null; // a newer fetchSummary call superseded this one
      const summary = res.data?.data ?? null;
      if (summary) {
        set({ summary });
      }
      return summary;
    } catch (err) {
      return null;
    }
  },
```

**Note:** this function is also called internally by `createCredit`, `updateCredit`, `recordPayment`, `reconcileDva`, and `writeOffCredit` (via `get().fetchSummary(businessId)`) to refresh the KPI numbers after a mutation. Do not touch those call sites — they still work exactly the same, they just also now benefit from the guard.

**Verify:**
1. Open the file and confirm it still has exactly one `export const useCreditStore = create<CreditState>(...)` block, unchanged in structure.
2. Run the frontend TypeScript check: from `frontend/`, run `npx tsc --noEmit` (or `npm run build` if that's faster to eyeball) and confirm no new type errors were introduced by this file.
3. Do NOT run the app yet — later phases touch related files. Full manual verification happens in Phase 8.

**Stop and report:** paste the diff of this file, confirm no TypeScript errors, then proceed to Phase 2.

---

## PHASE 2 — `settlement.store.ts` sequence guard

**Why:** this store backs `Account.tsx` (the CRITICAL-severity page in the audit) via callbacks injected into `useAccountData.ts`. It has the exact same missing-guard problem as `credit.store.ts` — confirmed by reading the file, it has zero request-id or business-id protection today. Fixing this closes the cross-business leakage risk on the Account page.

**File:** `frontend/src/stores/settlement.store.ts`

**Step 2.1 — Add two module-level counters.**

Find this line (it's the first line after the last interface/type definition, right before `export const useSettlementStore`):

```typescript
export const useSettlementStore = create<SettlementStore>((set, get) => ({
```

Insert two lines directly ABOVE it:

```typescript
let fetchPreviewSeq = 0;
let fetchHistorySeq = 0;

export const useSettlementStore = create<SettlementStore>((set, get) => ({
```

**Step 2.2 — Guard `fetchPreview`.**

Find this exact block:

```typescript
  fetchPreview: async (businessId: string) => {
    set({ loadingPreview: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/preview`);
      set({
        preview: res.data.data,
        regulatory: res.data.meta?.regulatory ?? null,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch settlement details'));
    } finally {
      set({ loadingPreview: false });
    }
  },
```

Replace it with:

```typescript
  fetchPreview: async (businessId: string) => {
    const seq = ++fetchPreviewSeq;
    set({ loadingPreview: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/preview`);
      if (seq !== fetchPreviewSeq) return; // a newer fetchPreview call superseded this one
      set({
        preview: res.data.data,
        regulatory: res.data.meta?.regulatory ?? null,
      });
    } catch (err) {
      if (seq !== fetchPreviewSeq) return;
      toast.error(getErrorMessage(err, 'Failed to fetch settlement details'));
    } finally {
      // loadingPreview must always drop to false for the CURRENT request,
      // even if this call was superseded — otherwise a stale in-flight
      // request that finishes after being superseded could leave loading
      // stuck true forever. Only skip if a newer call already flipped it.
      if (seq === fetchPreviewSeq) set({ loadingPreview: false });
    }
  },
```

**Important nuance for this one (read carefully):** the original `finally` block always sets `loadingPreview: false`, unconditionally. If you guard the `finally` block the same way as `try`/`catch` (i.e. skip it when superseded), that's actually correct here and matches the pattern — the newest call's own `finally` will set `loadingPreview: false` when IT finishes, so the loading flag still gets cleared correctly, just by the call that matters. Do not skip guarding the `finally` block — an unguarded `finally` would let a stale, superseded request incorrectly flip `loadingPreview` back to `false` while a newer request is still in flight, causing a UI flash of "not loading" for a split second on a page that is, in fact, still loading fresh data.

**Step 2.3 — Guard `fetchHistory`.**

Find this exact block:

```typescript
  fetchHistory: async (businessId: string, page = 1, status?: string, search?: string) => {
    set({ loadingHistory: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/history`, {
        params: {
          page,
          limit: 10,
          ...(status && status !== 'all' ? { status } : {}),
          ...(search && search.trim() ? { search: search.trim() } : {}),
        },
      });
      set({
        history: res.data.data,
        pagination: res.data.pagination || { page, limit: 10, total: res.data.data.length, totalPages: 1 },
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch payout history'));
    } finally {
      set({ loadingHistory: false });
    }
  },
```

Replace it with:

```typescript
  fetchHistory: async (businessId: string, page = 1, status?: string, search?: string) => {
    const seq = ++fetchHistorySeq;
    set({ loadingHistory: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/history`, {
        params: {
          page,
          limit: 10,
          ...(status && status !== 'all' ? { status } : {}),
          ...(search && search.trim() ? { search: search.trim() } : {}),
        },
      });
      if (seq !== fetchHistorySeq) return; // a newer fetchHistory call superseded this one
      set({
        history: res.data.data,
        pagination: res.data.pagination || { page, limit: 10, total: res.data.data.length, totalPages: 1 },
      });
    } catch (err) {
      if (seq !== fetchHistorySeq) return;
      toast.error(getErrorMessage(err, 'Failed to fetch payout history'));
    } finally {
      if (seq === fetchHistorySeq) set({ loadingHistory: false });
    }
  },
```

**Do not touch `withdrawBalance`, `toggleAutoSplit`, or `connectBank`** — they call `get().fetchPreview(businessId)` / `get().fetchHistory(businessId, 1)` internally to refresh after a mutation, which is fine as-is; the guard you just added protects those calls too, automatically, with zero extra changes needed.

**Verify:**
1. Confirm the file still exports the same `SettlementStore` interface, unchanged.
2. Run `npx tsc --noEmit` from `frontend/` again, confirm no new errors.

**Stop and report:** paste the diff, confirm no TypeScript errors, then proceed to Phase 3.

---

## PHASE 3 — `Sales.tsx` sequence guard

**Why:** `fetchSales`, `fetchSummary`, and `fetchDaily` are three independent fetch functions living as local functions inside the `Sales` component (not a store). Rapidly changing month, page, or filters fires overlapping requests with no protection — a slower response for an old month can arrive after a newer one and overwrite the screen with mismatched data (e.g. header says "February" but the numbers are "March"'s).

**File:** `frontend/src/pages/Sales.tsx`

**Step 3.1 — Import `useRef` (it's already imported — check first).**

Find line 1:

```typescript
import { useEffect, useState } from 'react';
```

Replace with:

```typescript
import { useEffect, useRef, useState } from 'react';
```

**Step 3.2 — Add three ref counters inside the component.**

Find this block (near the top of the `Sales` component body):

```typescript
export default function Sales() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const [sales, setSales] = useState<SalesTransaction[]>([]);
```

Replace with:

```typescript
export default function Sales() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const fetchSalesSeqRef = useRef(0);
  const fetchSummarySeqRef = useRef(0);
  const fetchDailySeqRef = useRef(0);
  const [sales, setSales] = useState<SalesTransaction[]>([]);
```

**Step 3.3 — Guard `fetchSales`.**

Find this exact block:

```typescript
  const fetchSales = () => {
    if (!biz) return;
    setIsLoading(true);
    const params: Record<string, string | number> = { page, limit: 15 };
    if (filterSource) params.source = filterSource;
    if (filterStatus) params.status = filterStatus;
    if (filterStartDate) params.startDate = filterStartDate;
    if (filterEndDate) params.endDate = filterEndDate;
    api
      .get(basePath, { params })
      .then((r) => {
        setSales(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => setIsLoading(false));
  };
```

Replace with:

```typescript
  const fetchSales = () => {
    if (!biz) return;
    const seq = ++fetchSalesSeqRef.current;
    setIsLoading(true);
    const params: Record<string, string | number> = { page, limit: 15 };
    if (filterSource) params.source = filterSource;
    if (filterStatus) params.status = filterStatus;
    if (filterStartDate) params.startDate = filterStartDate;
    if (filterEndDate) params.endDate = filterEndDate;
    api
      .get(basePath, { params })
      .then((r) => {
        if (seq !== fetchSalesSeqRef.current) return; // a newer fetchSales call superseded this one
        setSales(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => {
        if (seq === fetchSalesSeqRef.current) setIsLoading(false);
      });
  };
```

**Step 3.4 — Guard `fetchSummary`.**

Find this exact block:

```typescript
  const fetchSummary = () => {
    if (!biz) return;
    setSummaryLoading(true);
    api
      .get(`${basePath}/summary`, {
        params: { month: summaryMonth, year: summaryYear },
      })
      .then((r) => setSummary(r.data.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  };
```

Replace with:

```typescript
  const fetchSummary = () => {
    if (!biz) return;
    const seq = ++fetchSummarySeqRef.current;
    setSummaryLoading(true);
    api
      .get(`${basePath}/summary`, {
        params: { month: summaryMonth, year: summaryYear },
      })
      .then((r) => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(null);
      })
      .finally(() => {
        if (seq === fetchSummarySeqRef.current) setSummaryLoading(false);
      });
  };
```

**Step 3.5 — Guard `fetchDaily`.**

Find this exact block:

```typescript
  const fetchDaily = () => {
    if (!biz) return;
    setDailyLoading(true);
    api
      .get(`${basePath}/daily`, { params: { date: dailyDate } })
      .then((r) => setDaily(r.data.data))
      .catch(() => setDaily(null))
      .finally(() => setDailyLoading(false));
  };
```

Replace with:

```typescript
  const fetchDaily = () => {
    if (!biz) return;
    const seq = ++fetchDailySeqRef.current;
    setDailyLoading(true);
    api
      .get(`${basePath}/daily`, { params: { date: dailyDate } })
      .then((r) => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(null);
      })
      .finally(() => {
        if (seq === fetchDailySeqRef.current) setDailyLoading(false);
      });
  };
```

**Do not touch:** the `useEffect` hooks that call these functions (lines ~215-241), the 60-second polling interval (`setInterval(fetchDaily, 60_000)`), `handleSaveComplete`, the import-modal `onImported` callback, or the `TransactionDetailPanel`'s `onVerifySuccess` — they all call `fetchSales()`/`fetchSummary()`/`fetchDaily()` as before and will automatically benefit from the guard with no changes needed there.

**Verify:**
1. Run `npx tsc --noEmit` from `frontend/`, confirm no new errors.
2. Confirm the JSX (the entire `return (...)` block, lines ~373 onward) is byte-for-byte unchanged — this phase only touches the three fetch functions and the ref declarations above them.

**Stop and report:** paste the diff, confirm no TypeScript errors and no JSX changes, then proceed to Phase 4.

---

## PHASE 4 — `Expenses.tsx` sequence guard

**Why:** identical structure and identical bug to `Sales.tsx` — mirror the same fix exactly.

**File:** `frontend/src/pages/Expenses.tsx`

**Step 4.1 — Import `useRef`.**

Find line 1:

```typescript
import { useEffect, useState } from 'react';
```

Replace with:

```typescript
import { useEffect, useRef, useState } from 'react';
```

**Step 4.2 — Add three ref counters inside the component.**

Find:

```typescript
export default function Expenses() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const [expenses, setExpenses] = useState<Expense[]>([]);
```

Replace with:

```typescript
export default function Expenses() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const fetchExpensesSeqRef = useRef(0);
  const fetchSummarySeqRef = useRef(0);
  const fetchDailySeqRef = useRef(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
```

**Step 4.3 — Guard `fetchExpenses`.**

Find:

```typescript
  const fetchExpenses = () => {
    if (!biz) return;
    setIsLoading(true);
    const params: Record<string, string | number> = { page, limit: 15 };
    if (filterCat) params.category = filterCat;
    if (filterStartDate) params.startDate = filterStartDate;
    if (filterEndDate) params.endDate = filterEndDate;
    api.get(basePath, { params })
      .then((r) => { setExpenses(r.data.data); setPagination(r.data.pagination); })
      .finally(() => setIsLoading(false));
  };
```

Replace with:

```typescript
  const fetchExpenses = () => {
    if (!biz) return;
    const seq = ++fetchExpensesSeqRef.current;
    setIsLoading(true);
    const params: Record<string, string | number> = { page, limit: 15 };
    if (filterCat) params.category = filterCat;
    if (filterStartDate) params.startDate = filterStartDate;
    if (filterEndDate) params.endDate = filterEndDate;
    api.get(basePath, { params })
      .then((r) => {
        if (seq !== fetchExpensesSeqRef.current) return;
        setExpenses(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => {
        if (seq === fetchExpensesSeqRef.current) setIsLoading(false);
      });
  };
```

**Step 4.4 — Guard `fetchSummary`.**

Find:

```typescript
  const fetchSummary = () => {
    if (!biz) return;
    setSummaryLoading(true);
    api.get(`${basePath}/summary`, { params: { month: summaryMonth, year: summaryYear } })
      .then((r) => setSummary(r.data.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  };
```

Replace with:

```typescript
  const fetchSummary = () => {
    if (!biz) return;
    const seq = ++fetchSummarySeqRef.current;
    setSummaryLoading(true);
    api.get(`${basePath}/summary`, { params: { month: summaryMonth, year: summaryYear } })
      .then((r) => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(null);
      })
      .finally(() => {
        if (seq === fetchSummarySeqRef.current) setSummaryLoading(false);
      });
  };
```

**Step 4.5 — Guard `fetchDaily`.**

Find:

```typescript
  const fetchDaily = () => {
    if (!biz) return;
    setDailyLoading(true);
    api
      .get(`${basePath}/daily`, { params: { date: dailyDate } })
      .then((r) => setDaily(r.data.data))
      .catch(() => setDaily(null))
      .finally(() => setDailyLoading(false));
  };
```

Replace with:

```typescript
  const fetchDaily = () => {
    if (!biz) return;
    const seq = ++fetchDailySeqRef.current;
    setDailyLoading(true);
    api
      .get(`${basePath}/daily`, { params: { date: dailyDate } })
      .then((r) => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(null);
      })
      .finally(() => {
        if (seq === fetchDailySeqRef.current) setDailyLoading(false);
      });
  };
```

**Do not touch:** `useEffect` hooks, the 60-second polling interval, `handleSaveComplete`, or any JSX.

**Verify:**
1. Run `npx tsc --noEmit` from `frontend/`, confirm no new errors.
2. Confirm JSX is unchanged.

**Stop and report:** paste the diff, confirm no errors, then proceed to Phase 5.

---

## PHASE 5 — `TaxReports.tsx` sequence guard

**Why:** `TaxReportsList`'s `fetchReports` re-fetches on every filter/pagination change with zero cancellation — rapid status-pill clicking can leave the UI showing "Finalized" as the selected badge while the list still displays "All" or "Pending" reports from a slower, older request.

**File:** `frontend/src/pages/TaxReports.tsx`

**Step 5.1 — Confirm `useRef` is already imported.** Check the top-of-file import line that includes `useEffect` (around line 4 in this file — it's a multi-line import block, not a single line like Sales/Expenses). If `useRef` is not already in that import list, add it. Do not remove any other imported name from that block.

**Step 5.2 — Add one ref counter inside `TaxReportsList`.**

Find:

```typescript
function TaxReportsList({ highlightedReportId }: { highlightedReportId: string | null }) {
```

Look at the next few lines (the `useState` declarations right after it — e.g. `const [reports, setReports] = useState<TaxReport[]>([]);`). Insert the new ref declaration immediately after the opening line of the function, before the first `useState`:

```typescript
function TaxReportsList({ highlightedReportId }: { highlightedReportId: string | null }) {
  const fetchReportsSeqRef = useRef(0);
```

(Keep every existing `useState` line below it exactly as-is — you are only adding one new line, not replacing anything here.)

**Step 5.3 — Guard `fetchReports`.**

Find this exact block:

```typescript
  const fetchReports = () => {
    if (!biz) return;
    setIsLoading(true);
    const params: Record<string, any> = { page, limit: 12 };
    if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
    if (filterYear && filterYear !== 'all') params.year = Number(filterYear);

    api.get(`${taxPath}/reports`, { params })
      .then((r) => {
        setReports(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => setIsLoading(false));
  };
```

Replace with:

```typescript
  const fetchReports = () => {
    if (!biz) return;
    const seq = ++fetchReportsSeqRef.current;
    setIsLoading(true);
    const params: Record<string, any> = { page, limit: 12 };
    if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
    if (filterYear && filterYear !== 'all') params.year = Number(filterYear);

    api.get(`${taxPath}/reports`, { params })
      .then((r) => {
        if (seq !== fetchReportsSeqRef.current) return; // a newer fetchReports call superseded this one
        setReports(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => {
        if (seq === fetchReportsSeqRef.current) setIsLoading(false);
      });
  };
```

**Do not touch:** the `useEffect` at line ~239 that calls `fetchReports()`, the highlight/scroll `useEffect` at line ~245, `handleCalculate`, or any of the other ~5 call sites of `fetchReports()` further down the file (e.g. inside finalize/pay success handlers around lines 266, 285, 297, 316, 787) — they all call the same guarded function and need no changes themselves.

**Verify:**
1. Run `npx tsc --noEmit` from `frontend/`, confirm no new errors.
2. Confirm the file's other component (the tab-shell component that renders `<TaxReportsList />` and the lazy-loaded `TaxAnalytics`) is completely untouched.

**Stop and report:** paste the diff, confirm no errors, then proceed to Phase 6.

**Frontend guard phases are now complete (Phases 1–5).** Phases 6–8 below are backend + one hook change, and are independent of Phases 1–5 — they can be done in a separate sitting.

---

## PHASE 6 — Backend: new `getAccountSummary` service function

**Why:** `useAccountData.ts` currently computes the displayed balance (`totalBalance`) and `receivedThisMonth` by summing over a client-side array of at most 50 DVA transactions (`useAccountData.ts:99-108`). This is a real correctness bug, not just a race condition: any business with more than 50 DVA transactions gets a truncated, wrong balance. The fix is a new backend endpoint that returns the authoritative ledger balance (already computed correctly by `payout-preview.service.ts`'s `availableForWithdrawal`) plus a new server-side "received this month" aggregation, so the frontend never does this math itself again.

**File to modify:** `backend/src/services/dva.service.ts`

**Step 6.1 — Read the file first.** Open `backend/src/services/dva.service.ts` and locate:
- The existing `getVirtualAccount` and `getDVATransactions` (or equivalently-named) exported functions, to see the exact import style and how they call `getWithdrawalActor` / do ownership checks (if they don't do ownership checks themselves, they may rely on it happening in the controller — check `dva.controller.ts` too, see Phase 7).
- Confirm the existing import path used elsewhere in this codebase for the settlement preview service: `import { getPayoutPreview } from '@/services/settlement/payout-preview.service';` (verify the exact export name and path by opening `backend/src/services/settlement/payout-preview.service.ts` — the exported function is `getPayoutPreview(userId, businessId, tx?, opts?)`).
- Confirm `SETTLED_SALE_STATUSES` is exported from `@/shared/helpers` (it is — used at `payout-preview.service.ts:12`).

**Step 6.2 — Add the new exported function.** At the end of `backend/src/services/dva.service.ts` (after the last existing exported function, do not insert in the middle of the file), add:

```typescript
export async function getAccountSummary(userId: string, businessId: string) {
  const now = new Date();
  const startOfMonthUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonthUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [dva, transactions, preview, monthlyAgg] = await Promise.all([
    getVirtualAccount(userId, businessId),
    getDVATransactions(userId, businessId, { page: 1, limit: 50 }),
    getPayoutPreview(userId, businessId),
    prisma.salesTransaction.aggregate({
      where: {
        businessId,
        source: 'bank_transfer',
        dvaOrigin: true,
        status: { in: SETTLED_SALE_STATUSES },
        transactionDate: { gte: startOfMonthUTC, lt: startOfNextMonthUTC },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    dva,
    transactions,
    ledgerBalance: preview.availableForWithdrawal,
    receivedThisMonth: toNumber(monthlyAgg._sum.amount ?? 0),
  };
}
```

**Step 6.3 — Add the required imports.** At the top of `backend/src/services/dva.service.ts`, check whether these are already imported (this file likely already imports `prisma` and `toNumber` since it's a service file doing Prisma queries — do NOT add duplicate imports if they already exist). Add only what's missing:

```typescript
import { getPayoutPreview } from '@/services/settlement/payout-preview.service';
import { SETTLED_SALE_STATUSES } from '@/shared/helpers';
```

If `prisma` and/or `toNumber` are not already imported in this file, also add:

```typescript
import prisma from '@/lib/prisma';
import { toNumber } from '@/shared/helpers';
```

**Critical correctness note — read this before writing the code:** the month boundaries MUST be built with `Date.UTC(...)`, not `new Date(year, month, 1)`. This codebase has a documented, known bug class where `@db.Date`/date-range Prisma queries built with local-time `Date` construction drift by one day on a UTC+ host (the app server may run in a timezone ahead of UTC while the database stores UTC). Using `Date.UTC(...)` explicitly avoids this. Do not "simplify" this to a shorter local-time date construction even if it looks equivalent in testing on a UTC host — it will break in production.

**Verify:**
1. Confirm `getVirtualAccount` and `getDVATransactions` are the correct existing exported function names in this file (read the file to confirm — do not assume the names match exactly what's written above; adjust the calls in Step 6.2 to match whatever the actual existing exported names are).
2. Run the backend build: from `backend/`, run `npm run build`. Confirm no new TypeScript errors.

**Stop and report:** paste the new function and the import diff, confirm `npm run build` passes, then proceed to Phase 7.

---

## PHASE 7 — Backend: controller + route for the new endpoint

**Why:** exposes Phase 6's service function as an HTTP endpoint, following this codebase's existing ownership-check and response-shape conventions exactly (see `getVirtualAccount` in `dva.controller.ts:53-66` as the template).

**File 1:** `backend/src/controllers/dva.controller.ts`

**Step 7.1 — Add the new controller function.** Find the existing `getVirtualAccount` controller:

```typescript
export const getVirtualAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await dvaService.getVirtualAccount(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      regulatory: config.regulatory,
    },
  });
});
```

Immediately after this block (before `getBalance`), add:

```typescript
export const getAccountSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await dvaService.getAccountSummary(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});
```

**Note on ownership verification:** this mirrors `getVirtualAccount` exactly — ownership checking (`business.userId === userId`) happens inside the service layer (via `getWithdrawalActor` inside `getPayoutPreview`, and whatever equivalent check `getVirtualAccount`/`getDVATransactions` already do), not in the controller. Do not add a separate ownership check in the controller — that would duplicate logic and diverge from the existing pattern in this exact file.

**File 2:** `backend/src/routes/dva.routes.ts`

**Step 7.2 — Add the new route.** Find:

```typescript
router.get('/virtual-account', dvaController.getVirtualAccount);
router.get('/balance', dvaController.getBalance);
router.get('/transactions', dvaController.getDVATransactions);
```

Replace with:

```typescript
router.get('/virtual-account', dvaController.getVirtualAccount);
router.get('/balance', dvaController.getBalance);
router.get('/transactions', dvaController.getDVATransactions);
router.get('/account-summary', dvaController.getAccountSummary);
```

This mounts the new endpoint at `GET /api/v1/businesses/:businessId/dva/account-summary` (the route file is mounted with `mergeParams: true` under the `businesses/:businessId` prefix — same as every other route in this file, confirmed by the existing routes above it).

**Note:** there is a commented-out legacy version of this route file at the top (lines 1-16, everything inside `// ...`). Do not touch or "clean up" that commented block — it is out of scope for this fix and touching unrelated code violates the additive-only rule for this plan.

**Verify:**
1. Run `npm run build` from `backend/`, confirm no new errors.
2. Start the backend dev server (`npm run dev` from `backend/`) and manually hit the new endpoint with a valid auth token and a real businessId (use an existing seeded test account — see CLAUDE.md's Test Data section for credentials) via curl or Postman: `GET http://localhost:3000/api/v1/businesses/<id>/dva/account-summary`. Confirm it returns `{ success: true, data: { dva, transactions, ledgerBalance, receivedThisMonth } }` with no 500 error.
3. Test the ownership boundary: hit the same endpoint with a valid token for a DIFFERENT user who does not own that business. Confirm it returns 403/404 (not 200) — matching the existing pattern for every other `businesses/:businessId/...` route in this codebase.

**Stop and report:** paste the diff for both files and the curl/Postman output from step 2 and 3, then proceed to Phase 8.

---

## PHASE 8 — Frontend: consume the new endpoint in `useAccountData.ts`

**Why:** this is the step that actually fixes the CRITICAL-severity bug — replacing client-side arithmetic (wrong for >50 transactions, and racy against the settlement-preview call) with the new backend endpoint's authoritative numbers.

**File:** `frontend/src/hooks/useAccountData.ts`

**Step 8.1 — Read the current `fetchTransactions` function again before editing** (quoted here for reference — this is the current code as of this plan being written):

```typescript
  const fetchTransactions = useCallback(async () => {
    if (!bizId) return;
    setLoadingTransactions(true);
    try {
      const res = await api.get<DvaTransactionsResponse>(`/businesses/${bizId}/dva/transactions`, {
        params: { page: 1, limit: 50 },
      });
      const dvaData: DvaTransactionRow[] = res.data.data || [];
      const dvaTxns: DvaTransactionItem[] = dvaData.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: 'inbound' as const,
        status:
          t.needsVerification
            ? 'pending'
            : t.status === 'confirmed' || t.status === 'completed'
            ? 'completed'
            : 'pending',
        description: t.customerHint || t.customerName || 'Inbound Transfer',
        date: t.transactionDate,
        referenceId: t.referenceId ?? undefined,
        needsVerification: t.needsVerification,
        customerHint: t.customerHint ?? undefined,
      }));
      setTransactions(dvaTxns);
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const totalBalance = dvaTxns
        .filter((t) => t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);
      const receivedThisMonth = dvaTxns
        .filter((t) => t.status === 'completed')
        .filter((t) => {
          const d = new Date(t.date);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      setMoneyIn({ totalBalance, receivedThisMonth });
    } catch (err) {
      console.error('DVA transaction fetch error:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }, [bizId]);
```

**Step 8.2 — Replace it with this version**, which keeps the transaction-list mapping (for display) but sources `moneyIn` from the new endpoint instead of computing it from the capped 50-row list:

```typescript
  const fetchTransactions = useCallback(async () => {
    if (!bizId) return;
    setLoadingTransactions(true);
    try {
      const res = await api.get<DvaTransactionsResponse>(`/businesses/${bizId}/dva/transactions`, {
        params: { page: 1, limit: 50 },
      });
      const dvaData: DvaTransactionRow[] = res.data.data || [];
      const dvaTxns: DvaTransactionItem[] = dvaData.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        type: 'inbound' as const,
        status:
          t.needsVerification
            ? 'pending'
            : t.status === 'confirmed' || t.status === 'completed'
            ? 'completed'
            : 'pending',
        description: t.customerHint || t.customerName || 'Inbound Transfer',
        date: t.transactionDate,
        referenceId: t.referenceId ?? undefined,
        needsVerification: t.needsVerification,
        customerHint: t.customerHint ?? undefined,
      }));
      setTransactions(dvaTxns);
    } catch (err) {
      console.error('DVA transaction fetch error:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }, [bizId]);

  const fetchAccountSummary = useCallback(async () => {
    if (!bizId) return;
    try {
      const res = await api.get(`/businesses/${bizId}/dva/account-summary`);
      const { ledgerBalance, receivedThisMonth } = res.data.data;
      setMoneyIn({ totalBalance: Number(ledgerBalance), receivedThisMonth: Number(receivedThisMonth) });
    } catch (err) {
      console.error('Account summary fetch error:', err);
    }
  }, [bizId]);
```

**What changed, precisely:**
- `fetchTransactions` no longer computes `totalBalance`/`receivedThisMonth` and no longer calls `setMoneyIn` at all — it now only fetches the list and maps it for display, same as before minus the arithmetic block.
- A new function `fetchAccountSummary` is added right after it, responsible only for `moneyIn`.
- The `dvaTxns`/`now`/`thisMonth`/`thisYear` local variables used only for the old arithmetic are removed since they're no longer needed in this function (they still exist implicitly wherever `dvaTxns` itself is used for the `setTransactions` call, just not the summing logic below it).

**Step 8.3 — Call the new function alongside the old ones.** Find:

```typescript
  const refreshAccountData = useCallback(
    async (isManual = false) => {
      if (!bizId) return;
      setIsRefreshing(true);
      try {
        const tasks: Promise<any>[] = [fetchDVA(), fetchTransactions()];
        if (fetchSettlementPreview) tasks.push(fetchSettlementPreview(bizId));
        if (fetchPayoutHistory) {
          tasks.push(
            fetchPayoutHistory(
              bizId,
              1,
              payoutStatusFilter !== 'all' ? payoutStatusFilter : undefined,
              payoutSearch
            )
          );
        }
        if (isManual && fetchBusinesses) tasks.push(fetchBusinesses(true));
        await Promise.allSettled(tasks);
        if (isManual) toast.success('Account and balance refreshed');
      } finally {
        setIsRefreshing(false);
      }
    },
    [bizId, fetchBusinesses, fetchDVA, fetchTransactions, fetchSettlementPreview, fetchPayoutHistory, payoutStatusFilter, payoutSearch]
  );
```

Replace with:

```typescript
  const refreshAccountData = useCallback(
    async (isManual = false) => {
      if (!bizId) return;
      setIsRefreshing(true);
      try {
        const tasks: Promise<any>[] = [fetchDVA(), fetchTransactions(), fetchAccountSummary()];
        if (fetchSettlementPreview) tasks.push(fetchSettlementPreview(bizId));
        if (fetchPayoutHistory) {
          tasks.push(
            fetchPayoutHistory(
              bizId,
              1,
              payoutStatusFilter !== 'all' ? payoutStatusFilter : undefined,
              payoutSearch
            )
          );
        }
        if (isManual && fetchBusinesses) tasks.push(fetchBusinesses(true));
        await Promise.allSettled(tasks);
        if (isManual) toast.success('Account and balance refreshed');
      } finally {
        setIsRefreshing(false);
      }
    },
    [bizId, fetchBusinesses, fetchDVA, fetchTransactions, fetchAccountSummary, fetchSettlementPreview, fetchPayoutHistory, payoutStatusFilter, payoutSearch]
  );
```

**What changed:** added `fetchAccountSummary()` to the `tasks` array, and added `fetchAccountSummary` to the `useCallback` dependency array. Nothing else in this function changed.

**Step 8.4 — Add `fetchAccountSummary` to the hook's return value (optional, only if some other component needs to call it directly).** Find the `return { ... }` block at the bottom of the file:

```typescript
  return {
    dva,
    setDva,
    loading,
    banks,
    banksLoading,
    banksError,
    awaitingValidation,
    setAwaitingValidation,
    transactions,
    loadingTransactions,
    moneyIn,
    isRefreshing,
    fetchDVA,
    fetchTransactions,
    refreshAccountData,
  };
```

Leave this as-is — `fetchAccountSummary` does not need to be exposed externally since it's only ever called from inside `refreshAccountData`, matching how the hook already works today (`fetchDVA`/`fetchTransactions` are exposed mainly because other code calls them directly in specific flows — check `Account.tsx` for any direct calls to `fetchTransactions` before assuming `fetchAccountSummary` needs the same treatment; if `Account.tsx` never calls `fetchTransactions()` directly outside of `refreshAccountData`, then `fetchAccountSummary` doesn't need to be exposed either).

**Verify:**
1. Run `npx tsc --noEmit` from `frontend/`, confirm no new errors.
2. Start both backend (`npm run dev` in `backend/`) and frontend (`npm run dev` in `frontend/`).
3. Log in with a seeded test account (see CLAUDE.md Test Data section), navigate to `/account`, confirm the page loads with no console errors and a balance is displayed.
4. Open browser DevTools Network tab, confirm a request to `dva/account-summary` fires and returns 200.

**Stop and report:** paste the diff, confirm the manual browser check passes, then proceed to Phase 9.

---

## PHASE 9 — Full manual verification (all fixes together)

**Why:** confirms the fixes actually eliminate the races described in the original audit, not just that the code compiles.

Run each scenario below in the browser with both servers running. For each one, report pass/fail — do not just say "looks fine," describe what you actually saw on screen.

1. **Sales.tsx month-flip race:** go to `/sales`, switch to the Monthly tab. Using browser DevTools, throttle network to "Slow 3G". Click the "previous month" arrow 3 times as fast as you can. Wait for it to settle. Confirm the month label shown in the header matches the numbers shown below it (they must always agree — no combination where the header says one month and the totals belong to another).
2. **Expenses.tsx category-filter race:** go to `/expenses`, open Filters, rapidly click through 3 different category options. Confirm the table only ever shows rows matching the LAST category clicked, never an intermediate one.
3. **Debtors.tsx search race:** go to `/debtors` (or wherever this page is routed — check `Sidebar.tsx` or the router config if unsure of the exact path). Type "Emeka" character by character quickly, then immediately backspace to "Em". Confirm the table settles on results for "Em", not "Emeka".
4. **Dashboard.tsx cross-business leakage:** requires at least two businesses under the same test account with different debtor/credit data (seed a second business if needed — see `backend/prisma/seed.ts` for how test data is created, or create one manually via the UI and add a credit/debtor to it). Go to `/dashboard`, switch business via the sidebar dropdown rapidly back and forth between the two businesses 3-4 times. Confirm the debtors widget always shows the debtors belonging to whichever business is currently selected in the sidebar — never the other one.
5. **TaxReports.tsx filter race:** go to `/tax`, click through status pills ("All" → "Pending" → "Finalized") as fast as possible. Confirm the highlighted/selected pill always matches what's actually displayed in the list below it.
6. **Account.tsx balance correctness:** if a test business with 50+ DVA transactions exists, confirm the displayed balance matches the ledger total (`ledgerBalance` from the new endpoint), not a sum that looks suspiciously capped. If no such business exists in test data, this specific check can be marked "not testable in this environment" rather than skipped silently — report that explicitly rather than claiming it passed.

**Stop and report:** for each of the 6 scenarios, report pass/fail with a one-sentence description of what was observed. If anything fails, STOP — do not proceed to any cleanup or additional phases. Report the failure with enough detail (which phase, which file, what was expected vs what happened) for a human to diagnose it.

---

## PHASE 10 — Backend e2e smoke test (optional but recommended)

**Why:** locks in Phase 6-8's fix so a future change can't silently reintroduce the truncation bug.

**File:** `backend/tests/e2e/api.e2e.test.ts`

**Step 10.1 — Read the existing test file's conventions first** (how it sets up a test user/business, how it authenticates, how ownership-boundary tests are structured — e.g. search the file for an existing test that checks a 403/404 on a foreign business, and copy that pattern).

**Step 10.2 — Add a new test block** for `GET /businesses/:id/dva/account-summary`:
- Happy path: authenticated request for a business the test user owns returns 200 with `data.dva`, `data.transactions`, `data.ledgerBalance`, `data.receivedThisMonth` all present in the response shape.
- Auth-required: request without a token returns 401.
- Ownership: request for a business belonging to a different seeded user returns 403 or 404 (match whatever the existing tests in this file expect for the equivalent check on another route — do not invent a new status code convention).

**Verify:** run `npm run test:e2e` from `backend/`, confirm the new test passes and no existing test broke.

**Stop and report:** paste the test output.

---

## Summary checklist for the executing agent

- [ ] Phase 0 — pre-flight clean
- [ ] Phase 1 — `credit.store.ts` guarded
- [ ] Phase 2 — `settlement.store.ts` guarded
- [ ] Phase 3 — `Sales.tsx` guarded
- [ ] Phase 4 — `Expenses.tsx` guarded
- [ ] Phase 5 — `TaxReports.tsx` guarded
- [ ] Phase 6 — `dva.service.ts` new function added
- [ ] Phase 7 — controller + route added
- [ ] Phase 8 — `useAccountData.ts` consumes new endpoint
- [ ] Phase 9 — all 6 manual scenarios pass
- [ ] Phase 10 — e2e test added and passing

Each unchecked box after a failed verify step is where to resume. Do not mark a phase complete unless its Verify section fully passed.
