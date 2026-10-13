# Shared UI Contract — `frontend` ↔ `adminFrontend`

> **Purpose:** The two Vite frontends (`frontend` on `:5173` / `app.*` and `adminFrontend` on `:5174` / `admin.*`) share a small, explicitly-enumerated set of UI, lib, and type files via **disciplined copy** (not a package). This document is the source of truth for that copy set. Keep it in sync.

## Copy set (authoritative)

> Every file listed below exists in **both** apps at the same relative path `src/...` and must be byte-identical except for the one-line header `// Shared with frontend — see docs/shared-ui.md` at the top of the `adminFrontend` copy.

### `components/ui` — 10 files

- `src/components/ui/Button.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/Skeleton.tsx` (exports `Skeleton` + `TableSkeleton`)
- `src/components/ui/EmptyState.tsx`
- `src/components/ui/ErrorState.tsx`
- `src/components/ui/PageLoader.tsx`
- `src/components/ui/OptimizedImage.tsx` + `OptimizedLogo.tsx` + `ResponsiveImage.tsx` (3, but counted as part of the image set)
- `src/components/ui/PhoneInput.tsx`

### `lib` — 3 files

- `src/lib/format.ts` — `formatNaira`, `formatDate`, `formatMonth`, etc.
- `src/lib/fees.ts` — merchant fee preview helpers (mirrors `backend/src/lib/paystack-fees.ts`)
- `src/lib/axios.ts` — `axios.create`, `axios-retry`, refresh mutex, `isAdminArea ? '/admin/login' : '/login'` branch, cross-tab sync, zombie-session guard. **Verbatim copy** — `adminFrontend` may add `useAdminStatsStore.clear()` in `auth.store` but `lib/axios.ts` itself stays identical.

### `types` — 1 file

- `src/types/index.ts` — **full file** (~1260 lines), not a slice. Contains `User`, `Business`, `AdminDashboardStats`, `TeamMember`, `Invoice`, etc. Admin needs the whole surface.

### `lib` supporting (if transitively required)

- `src/lib/cache.ts` — only if `axios.ts` imports it (currently self-contained; copy only if needed)
- `src/lib/pageTitles.ts` — only if `AdminLayout` references it

## Rule

> **Any edit to a shared file must be mirrored to the sibling app in the same PR.**

If you touch `frontend/src/components/ui/Button.tsx`, apply the same change to `adminFrontend/src/components/ui/Button.tsx` in the same commit (or the same PR, adjacent commit). Do not let the two copies drift.

**When to extract to a package:**

If this happens **3 times** (same file touched in 3 PRs with the same drift fix), extract `packages/ui` (`@wallx/ui`) + Tailwind preset and replace the copy with a local dependency. Until then, copy is cheaper and reversible.

## Drift guard (CI, optional, 30s)

Add a CI step that fails if the two copies diverge beyond the header:

```bash
# Fail if any shared file differs beyond the first line header
for f in $(cat docs/shared-ui.md | grep -E '^src/' | awk '{print $1}'); do
  # Strip the first-line header from the admin copy before diffing
  tail -n +2 "adminFrontend/$f" | diff -q "frontend/$f" - || \
    (echo "DRIFT: $f differs — copy the fix to both apps" && exit 1)
done
```

Or simpler (enumerated):

```bash
diff <(tail -n +2 adminFrontend/src/components/ui/Button.tsx) frontend/src/components/ui/Button.tsx
diff <(tail -n +2 adminFrontend/src/lib/format.ts) frontend/src/lib/format.ts
diff adminFrontend/src/types/index.ts frontend/src/types/index.ts # no header in types
```

If CI is not yet set up for this, at least run the loop locally before merging any shared-file change.

## Admin-specific (NOT shared)

These live **only** in `adminFrontend` and must not be copied back to `frontend`:

- `src/pages/admin/*` (11 pages v1 — `AdminReviews` deferred)
- `src/components/admin/*` (`AdminTransferDetailModal`, `ChangePlanModal`)
- `src/components/layout/AdminLayout.tsx` + `AdminSidebar.tsx`
- `src/routes/AdminRoute.tsx`
- `src/stores/admin.stats.store.ts`
- `src/pages/admin/shared/*` (`PageHeader`, `Pagination`, `Panel`, `SegmentedControl`, `StatusPill`, `format.ts`)

## SME-specific (NOT shared)

These live **only** in `frontend` and must not be copied to `adminFrontend`:

- `src/pages/Dashboard.tsx`, `Sales.tsx`, `Expenses.tsx`, `Invoices.tsx`, `InvoiceForm.tsx`, `InvoiceDetail.tsx`, `Debtors.tsx`, `Customers.tsx`, `AIAssistant.tsx`, `TaxReports.tsx`, `Transactions.tsx`, `Account.tsx`, `Settings.tsx`, etc.
- `src/components/layout/AppLayout.tsx` + `Sidebar.tsx`
- `src/stores/business.store.ts`, `invoice.store.ts`, `reminder.store.ts`, etc.

---

*Last verified: 2026-10-13. Update this file whenever the copy set changes.*
