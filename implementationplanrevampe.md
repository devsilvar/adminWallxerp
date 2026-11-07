# Frontend UI Revamp Plan — Align to `/inventory` Design Language

> **Review pass applied** (per `prompts/rereviewplan.md`). Corrections integrated below. Audited against the actual codebase (CLAUDE.md + file tree). No implementation performed.

## Review findings (corrected)

- 🔴 **WRONG — dead routes:** `Reminders.tsx` and `Payments.tsx` are NOT routed (`/reminders` → `/dashboard`, `/payments` → `/tax?tab=payments`). They are not revamp targets. Only touch them if deliberately re-wiring. Removed from scope.
- 🔴 **MISSING — money route:** `Settlement.tsx` (live money route) was omitted. Added to Phase 5.
- 🔴 **MISSING — settings:** `Settings.tsx` (Account nav group) was omitted. Added to Phase 6.
- 🟠 **INCOMPLETE — i18n:** Several pages use `useTranslation`. Do not hardcode English; keep `t()` calls, change only layout/markup.
- 🟠 **INCOMPLETE — reuse, don't duplicate:** `EmptyState.tsx`, `ErrorState.tsx`, `Card.tsx`, `Modal.tsx` already exist. Phase 1 primitives must compose/reuse these, not reimplement.
- 🟠 **INCOMPLETE — test/aria safety:** Preserve `data-testid`, `aria-*`, accessible names. Changed header text must keep the strings tests query (or update tests in the same commit, clearly noted). No modal-width regressions.
- 🟠 **INCOMPLETE — subscription page:** `Subscription.tsx` exists but routing is unconfirmed. Verify in App.tsx before including; otherwise skip.
- ✅ **No breaking API changes:** Plan is presentational only; no endpoint/param/store changes. Confirmed.

---

**Scope:** Frontend only (`frontend/src`). No API, backend, or database changes. No changes to data flow, stores, or routing contracts. Visual/presentational changes only.

**Reference:** `frontend/src/pages/Inventory.tsx` — the "neat, clean, dramatic" page that sets the standard.

**Goal:** Bring every user-facing route up to Inventory's level: one consistent page shell, header, banner, section, card, empty-state, and responsive-table vocabulary.

**Constraint:** API behaviour must remain untouched. All changes are markup/styling/layout. Existing tests must keep passing (no logic changes).

---

## 0. Inventory design language (the spec to match)

- **Shell:** `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8`
- **Header:** bottom-bordered (`border-b border-gray-200 pb-6`), icon badge (`p-2 bg-<color>-100 rounded-lg text-<color>-700`), `h1 text-2xl font-bold tracking-tight`, subtitle `text-sm text-gray-500 mt-1`
- **Banners:** colored left-bordered cards (emerald success / red error / amber info) with icon + dismiss
- **Section headers:** `h2 text-base font-semibold` with muted count suffix
- **Cards:** `rounded-xl` + shadow; zebra/striping on lists; responsive table → card at mobile
- **Empty states:** split "no data yet" (with CTA) vs "no results for filters"
- **Icons:** Lucide, consistent sizing (w-5/w-6)
- **Loading:** dedicated skeleton component per page where one exists

---

## Phase 1 — Shared page primitives

**Files touched:** new `frontend/src/components/layout/PageShell.tsx` (or split into `PageHeader.tsx`, `PageBanner.tsx`, `SectionHeader.tsx`).

**Deliverables:**
- `PageHeader` — props: `icon`, `title`, `subtitle`, `actions?` (ReactNode). Renders the Inventory header block.
- `PageBanner` — props: `variant: 'success'|'error'|'info'`, `message`, `onDismiss?`. Renders colored bordered card with icon.
- `SectionHeader` — props: `title`, `count?`, `suffix?`. Renders `h2 text-base font-semibold`.

**Rules:**
- No logic, no state, no data fetching. Pure presentation.
- Tailwind classes only; no new dependencies.
- Inventory itself is NOT refactored in this phase (it stays the reference).

**Exit criteria:** primitives render in isolation (Storybook not required; a quick dev check suffices). `npm run build` (tsc -b) passes.

---

## Phase 2 — Dashboard (`Dashboard.tsx`)

**Current pain:** mixed stat-card layouts, scattered quick actions, inconsistent spacing.

**Changes:**
- Wrap in shell; replace ad-hoc header with `PageHeader` (icon: `BarChart3` or `LayoutDashboard`, title "Dashboard", subtitle business name / period).
- KPI strip: single 4-col responsive grid of bordered cards (revenue, expenses, tax payable, profit). Same card height, same number formatting.
- Quick actions row directly under header: "Record sale", "Calculate tax", "View reports" — compact, icon + label.
- Recent activity: zebra-striped rows, consistent row height, hover highlight, empty state.
- Loading: keep `DashboardSkeleton` (already exists).
- Error banner: `PageBanner variant="error"`.

**Exit criteria:** visual pass at 375px and 1280px; existing Dashboard tests pass.

---

## Phase 3 — Customers (`Customers.tsx`, `CustomerDetail.tsx`)

**Changes:**
- `PageHeader` with `Users` icon, title "Customers", subtitle "Manage your customer records and vouchers".
- Toolbar: debounced search (300ms, reset to page 1) + filter chips + active-filter count badge (reuse Invoices pattern).
- List: card rows — avatar initials, name, phone, voucher count — aligned to Inventory product cards.
- Empty states split: "No customers yet" (CTA: Add customer) vs "No results for your filters".
- `CustomerDetail`: `PageHeader` + tabbed sections (info / vouchers / sales) with same border rhythm.

**Exit criteria:** no behaviour change to voucher lookup or customer CRUD; tests pass.

---

## Phase 4 — AI Assistant (`AIAssistant.tsx`)

**Changes:**
- `PageHeader` with `Sparkles` icon, title "AI Assistant", subtitle.
- Chat container: max-width centered, message bubbles with consistent avatar + timestamp.
- Input bar pinned bottom with send button; suggestion chips above input.
- Remove ad-hoc padding; align to shell.

**Exit criteria:** chat send/receive behaviour unchanged; only layout.

---

## Phase 5 — Messages, Debtors, Transactions

**Files:** `Messages.tsx`, `Debtors.tsx`, `DebtorDetail.tsx`, `Transactions.tsx`, `UnverifiedTransactions.tsx`.

**Changes (all):**
- `PageHeader` + shell.
- Tables: sticky header, zebra rows, mobile card fallback (reuse Invoices responsive table pattern).
- Status pills consistent with Invoices color map (draft/sent/paid/overdue → grey/blue/green/amber).
- Empty states split.

**Exit criteria:** filters, pagination, actions unchanged; tests pass.

---

## Phase 6 — Account / Wallet (`Account.tsx`, wallet components)

**Files:** `Account.tsx`, `components/account/*` (DvaDetailsCard, DvaTransactionsTable, AccountHeader, AccountQrModal, DvaOnboardingWizard, AccountSkeleton).

**Changes:**
- `PageHeader` with `Wallet` icon, title "Account & Wallet", subtitle.
- Balance card + DVA details card in a 2-col grid (stack on mobile), consistent card styling.
- Transactions table: zebra rows, mobile card fallback.
- Onboarding wizard: keep logic, restyle steps to match shell (numbered badges, consistent spacing).
- Loading: `AccountSkeleton`.

**Exit criteria:** DVA setup, top-up, withdrawal flows unchanged; tests pass.

---

## Phase 7 — Expenses & Sales (polish pass)

**Files:** `Expenses.tsx`, `Sales.tsx`, `SalesImportModal.tsx`.

**Changes (low risk):**
- Header + banner alignment only.
- Sales import modal: already 3-step; just spacing/icon consistency.
- No structural changes.

**Exit criteria:** import flow, CRUD, filters unchanged.

---

## Phase 8 — Invoices (already reference-quality, light touch)

**Files:** `Invoices.tsx`, `InvoiceDetail.tsx`, `InvoiceForm.tsx`.

**Changes:**
- Already close to Inventory standard. Only: ensure `PageHeader` usage consistent, verify empty states split.
- No logic changes.

---

## Phase 9 — Verification & regression

**Commands:**
- `cd frontend && npm run lint`
- `cd frontend && npx tsc -b`
- `cd frontend && npm run test`
- Manual visual pass: 375px + 768px + 1280px for each touched route.

**Regression checklist:**
- Auth flows (login/register/logout) unchanged.
- Business switcher still works; active business persists.
- All API calls identical (no endpoint/param changes).
- Toast notifications still fire on success/error.
- Skeletons show during load; no flash of empty state.

---

## Rollout strategy

1. Phase 1 (primitives) as its own commit.
2. Phase 2 (Dashboard) as pilot — review before continuing.
3. Phases 3–8 in groups of 2–3 pages per commit.
4. Phase 9 verification commit (if any fixes).

Each commit: presentational only. Commit message prefix: `style(ui):`.

## Out of scope (explicitly)

- Backend / API / DB changes.
- New features or data flows.
- Admin frontend (`adminFrontend/`) — separate concern.
- Marketing pages (`marketing/*`).
- Dark mode, i18n beyond existing `useTranslation`.
- Component library extraction beyond the 3 primitives in Phase 1.

---

## Risk notes

- **Low risk overall:** markup-only. The main risk is accidentally dropping a handler/prop during JSX rewrite. Mitigation: keep diff focused, run tests per phase, review git diff before commit.
- **Responsive regressions:** mobile table→card fallback must preserve all action buttons (edit/delete/download). Verify per page.
- **Accessibility:** keep `role`, `aria-*`, keyboard handlers when replacing elements (e.g., mobile card as `<button>`). Inventory's patterns already demonstrate the correct approach.