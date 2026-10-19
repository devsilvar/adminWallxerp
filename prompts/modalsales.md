# MODALSALES — Add Sale / Add Expense as Modals (DRY, mobile-first)

**Project:** PayMyTax by WallX · Frontend reform
**Status:** REVIEWED & APPROVED FOR BUILD (v1.1) — not yet implemented
**Author note:** This plan follows `frontend/rules.txt` (readability → maintainability → reusability → simplicity → performance; strict TS; ≤500-line components; a11y labels; match existing style).

---

## 1. Goal (restated, per rules.txt "understand first")

Today, **Add Sale** and **Add Expense** render an *inline form Card* that pushes the page content down. The user wants them to behave like **Import from Excel** — clicking the button opens a **modal**, the user fills it in, closes it, and lands back on the same list with the new row visible.

Additional requirements:
1. **DRY** — reuse the modal pattern that Import Excel already uses, instead of a third hand-rolled overlay.
2. **Nothing breaks** — edit-sale flow, classification/verify behavior, dashboard refresh, filters — all must survive.
3. **Optimized for small devices** — phones are the primary device for adding sales/expenses; the modal must be thumb-friendly and fast.
4. **Good-looking, well-coded** — consistent with the existing design system (Button, Input, Card, Tailwind theme).

---

## 2. Current-State Audit (verified against the working tree)

### 2.1 The pattern we're reusing — `SalesImportModal.tsx` (~545 lines, `frontend/src/pages/`)

The Import modal is the *gold standard* in this codebase:

- **Mount-once pattern:** `<SalesImportModal isOpen={showImport} … />` rendered once at the bottom of `Sales.tsx` (line 799), state reset via `useEffect` on `isOpen` (lines 98–104).
- **Shell markup (lines 211–255):** outer `fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4` → panel `w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col` → **header** (icon chip + title + close button) → **body** (`flex-1 overflow-y-auto px-6 py-5`) → **footer** (`border-t bg-gray-50 px-6 py-4`).
- **Its own header comment (lines 13–16) says:** *"Why in-component styling for the overlay (not a shared Modal component)? … There isn't one in the design system yet (InvoiceDetail inlines its own too). Keeping consistent with that for now; **extract when we have a third caller**."*

**This plan is that third and fourth caller.** Add Sale + Add Expense modals trigger the extraction the codebase was waiting for.

### 2.2 Other hand-rolled overlays (context, not to touch)

`CreateBusinessModal.tsx` (centered, `max-w-lg`, backdrop-close), `TransactionDetailPanel.tsx` (right drawer), `PinModal`, `PaymentConfirmationModal`, `PayoutWithdrawalModal`, `StatementExportModal`, inline modals in `InvoiceDetail.tsx`. All duplicate the backdrop/close/scroll-lock dance. **Out of scope** — migrating them is a later cleanup; this plan only builds the primitive correctly so that migration becomes trivial.

### 2.3 The forms being modalized

**`Sales.tsx` (820 lines) — inline form at lines 470–557:**
- Trigger: Add Sale button (line 348) → `resetForm(); setShowForm(true)`; Edit icon → `openEdit(s)` pre-fills fields (line 230).
- Fields: Amount (₦, number), Source (select, 7 values), Description, Customer Name, Transaction Date (date), Classification (optional select, fetched from `GET /transaction-classifications` — lines 195–206).
- Submit (lines 243–279): create = `POST /businesses/:id/sales`; edit = `PUT …/:saleId` **plus** `POST …/:saleId/verify { classification }` **only when classification changed** vs `originalClassification`. Success: toast → `invalidateDashboard('sale_created' | 'sale_updated')` → `fetchSales()` + `fetchSummary()`.

**`Expenses.tsx` (~470 lines) — inline form at lines 292–331:**
- Trigger: Add Expense button (line 197); Edit → `openEdit(exp)` (line 136).
- Fields: Amount (₦), Category (select, 8 values), Description (required), Expense Date, `isDeductible` checkbox with explanatory subtext.
- Submit (lines 144–164): `POST`/`PUT /businesses/:id/expenses`, toast, `invalidateDashboard`, refetch list + summary.

### 2.4 Supporting facts

- `Input` (`components/ui/Input.tsx`) extends `InputHTMLAttributes` and spreads `...props` — `inputMode`, `autoFocus`, `max`, `step` pass through untouched. (Verified.)
- Tailwind theme already has the animation utilities used elsewhere (`animate-fade-in`, `animate-slide-in-right` in `TransactionDetailPanel`) — reuse, no config change.
- No modal library in `package.json`; rules.txt forbids unnecessary dependencies — **zero new deps**.

---

## 3. Design Decisions (options compared)

### D1 — Shared `Modal` primitive vs copy-paste the Import shell

| Option | Pros | Cons |
|---|---|---|
| A. Copy the SalesImportModal shell into each new modal | Fastest, zero risk to Import | 3rd/4th copy of backdrop+close+scroll-lock; a11y fixes would need N patches; violates DRY and the rules.txt checklist item "Is any logic duplicated?" |
| B. **Extract `components/ui/Modal.tsx`, build both modals on it** | One shell, one a11y implementation; Import modal can migrate later; the codebase's own comment asks for this | Must not change Import modal behavior (it isn't touched in this plan) |

**Chosen: B.** The codebase literally planned for this ("extract when we have a third caller").

### D2 — Where do the new files live?

`SalesImportModal.tsx` lives in `pages/`; other modals live in `components/` (`CreateBusinessModal`, `PinModal`, …). The shared primitive goes in **`components/ui/Modal.tsx`** (beside `Button`/`Input`/`Card`). The two form modals go in **`components/`** (they're features, not routes — matching the `CreateBusinessModal` convention).

### D3 — Edit flow: one modal handles create AND edit

Keep one modal component per entity handling **both create and edit** (exactly like today's inline form switches on `editId`). The parent passes `editSale` / `editExpense`; the modal derives the edit id. Avoids a second component and keeps `openEdit` a one-liner.

### D4 — Export style (rules.txt conflict, flagged)

`rules.txt` says "all exports named", but **every component in this codebase uses default exports** (`SalesImportModal`, `CreateBusinessModal`, `Button`, `Input`). Per rules.txt's own "Match my existing code style" rule, new components use **default exports** to match. (Flagged per the same rule.)

### D5 — What happens to the inline forms?

**Removed**, not hidden. Keeping both would mean two sources of truth for the same submit logic. The Add buttons now open the modal; each page slims by ~150 lines (moving `Sales.tsx` from ~820 lines toward the 500-line rules.txt ceiling — a goal already stated in `PRODUCT_ARCHITECTURE_PLAN.md`).

---

## 4. `components/ui/Modal.tsx` — the shared primitive (spec)

```ts
type ModalSize = 'sm' | 'md' | 'lg';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Optional icon rendered in the header chip (lucide component) */
  icon?: React.ReactNode;
  size?: ModalSize;            // sm: max-w-md, md: max-w-lg, lg: max-w-2xl
  footer?: React.ReactNode;    // rendered in the sticky footer bar
  children: React.ReactNode;
  /** Allow closing via backdrop tap / Escape. Default true */
  dismissible?: boolean;
};
```

**Behavior (all built once, here):**
1. **Backdrop close** — tap outside closes when `dismissible` (matches `CreateBusinessModal`).
2. **Escape key** — `keydown` listener while open; ignored while a request is in flight (callers gate this via `dismissible={false}` or by not closing when `saving`).
3. **Body scroll lock** — set `document.body.style.overflow = 'hidden'` on open, restore on close/unmount (today NO modal in the codebase does this — a real mobile-scroll bug this fixes).
4. **Focus management** — focus the panel on open; return focus to the previously-focused element on close; **Tab is trapped inside the modal** (simple keydown trap cycling first/last focusable element — a11y per rules.txt, ~15 lines).
5. **A11y** — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, close button with `aria-label="Close modal"` (rules.txt non-negotiables).
6. **Mobile-first layout (the small-device optimization):**
   - Outer: `fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 p-0 sm:p-4` → on phones the panel **docks to the bottom edge** (thumb-reach bottom sheet); on ≥sm it centers like today.
   - Panel: `w-full sm:max-w-{size} rounded-t-2xl sm:rounded-xl bg-white shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh]` — `dvh` so mobile browser chrome (URL bar) doesn't clip the footer.
   - Header/body/footer structure copied exactly from `SalesImportModal` (lines 214–255) so the visual language is identical.
   - Drag-handle bar visible on mobile only (`sm:hidden` 40px-wide gray pill) — affordance that it's a sheet.
7. **Animations** — `animate-fade-in` on the backdrop, `animate-scale-in` (desktop) on the panel; existing utilities only.
8. **Footer-outside-form contract:** action buttons in `footer` render *outside* the `<form>` element. Any footer submit button MUST carry the `form="…"` attribute pointing at the form's `id` (e.g. `form="add-sale-form"`) — otherwise `onSubmit` never fires. This is the classic modal-form bug; the primitive's doc comment calls it out.
9. **Mobile keyboard:** with the keyboard open, the visual viewport shrinks — `dvh` + the scrollable body keep the Save footer reachable; nothing extra needed.

Zero dependencies. ~120 lines. One file. Under every rules.txt checklist item.

---

## 5. `components/AddSaleModal.tsx` — spec

**Props:**
```ts
type AddSaleModalProps = {
  isOpen: boolean;
  businessId: string;
  /** When set, the modal is in EDIT mode and pre-fills from this sale */
  editSale: SalesTransaction | null;
  onClose: () => void;
  /** Called after create/update so the parent refetches list + summary.
   *  outcome lets the parent decide page-reset (create) vs stay-on-page (edit). */
  onSaved: (outcome: 'created' | 'updated') => void;
};
```

**Moved wholesale from `Sales.tsx` (verbatim logic, new home):**
- Form state: `amount, source, description, customerName, transactionDate, classification, originalClassification, saving`.
- `fetchClassifications()` — `GET /transaction-classifications`, runs when the modal opens (not on page mount — a small perf win; the page no longer fetches classifications until the user actually adds/edits).
- `handleSubmit()` — the exact branch logic: create → `POST /businesses/:businessId/sales`; edit → `PUT …/:saleId` + conditional `POST …/:saleId/verify` **only when `classification !== originalClassification`** (the behavior must survive byte-for-byte).
- Toasts, typed error extraction (`err as { response?: … }` — no `any`, per rules.txt), `invalidateDashboard('sale_created' | 'sale_updated')`.
- `SOURCES` const and the source `<select>`.

**Changed vs today (the modal upgrades):**
1. Reset-on-open via `useEffect(isOpen)` (same pattern as `SalesImportModal` lines 98–104) — replaces `resetForm()` gymnastics in the parent.
2. Edit pre-fill happens in the same effect when `editSale` is set (parent's `openEdit` becomes `setEditSale(s); setOpen(true)`).
3. Amount input gains `inputMode='decimal'` → numeric keypad on phones (prop passes through `Input`, verified §2.4).
4. Footer: `Cancel` + `Create`/`Update` (with `isLoading={saving}`); while `saving`, `dismissible={false}` so Escape/backdrop can't kill an in-flight request (error-handling rule: never swallow). The `<form>` gets `id="add-sale-form"` and the footer submit button carries `form="add-sale-form"` (§4 item 8 — footer sits outside the form element).
5. Header: `Receipt` icon chip (already imported in Sales.tsx), title `New Sale` / `Edit Sale`, subtitle "Money received from selling".
6. Size `md`. Fields stacked 1-col on mobile, 2-col from `sm:` (same grid as today).

**Parent contract (`onSaved`):** parent runs `fetchSales(); fetchSummary();` always, and `setPage(1)` **only when `outcome === 'created'`** — a new sale must be visible on page 1, but an edit on page 3 must stay on page 3 (today's behavior; a blanket page-jump would be a regression). Mirrors the `SalesImportModal` `onImported` handling at `Sales.tsx:803-815`, refined with the outcome parameter.

---

## 6. `components/AddExpenseModal.tsx` — spec

Same shape as §5, with the expense specifics moved from `Expenses.tsx` lines 129–164 + 292–331:

- Fields: `amount, category (select from CATEGORIES), description (required), expenseDate, isDeductible` — checkbox keeps its explanatory subtext ("Uncheck if this is a personal expense…").
- Submit: `POST`/`PUT /businesses/:businessId/expenses`, toasts `expense_created` / `expense_updated`, `onSaved` → parent refetch.
- Edit pre-fill from `editExpense` (mirrors `openEdit`, line 136).
- `PieChart` icon chip in the header (already imported in Expenses.tsx). Size `md`. Form id `add-expense-form` with the footer submit button carrying `form="add-expense-form"` (§4 item 8).

---

## 7. Parent Page Changes

### `Sales.tsx` — net ≈ −150 lines

**Removed:** the inline form Card (lines 470–557), all 8 form state atoms (lines 134–147), `fetchClassifications` + classification state, `handleSubmit`, `resetForm` (parent keeps a stub-free version — nothing), and the `X`/form-only imports if unused.

**Kept/changed:**
- Add button → `onClick={() => { setEditSale(null); setShowAddModal(true); }}`.
- Row edit icon → `setEditSale(s); setShowAddModal(true);` (replaces `openEdit`).
- Mount `<AddSaleModal isOpen={showAddModal} businessId={biz.id} editSale={editSale} onClose={…} onSaved={…} />` once, beside the existing `SalesImportModal` (same mount-once pattern).
- `onSaved(outcome)`: `fetchSales(); fetchSummary();` always, plus `setPage(1)` only when `outcome === 'created'` (new row must be visible on page 1; edits stay on the current page — mirrors the Import handling without its blanket reset).

### `Expenses.tsx` — net ≈ −120 lines

Mirror of the above: remove inline form (lines 292–331) + form state (lines 79–102 region) + `handleSubmit`; wire `AddExpenseModal`; `onSaved` → `fetchExpenses(); fetchSummary();` (+ `setPage(1)`).

---

## 8. Small-Device & Performance Optimizations (explicit list)

1. **Bottom-sheet on phones** — panel docks to the bottom edge (`items-end sm:items-center`); one-handed reach; feels native, like Paystack/OPay sheets.
2. **`dvh` height** — `max-h-[92dvh]` prevents the mobile URL bar from clipping the Save button (the current `max-h-[90vh]` pattern has this bug on iOS Safari).
3. **Body scroll lock** — background page no longer scrolls behind the modal (fixes a real bug present in *all* current modals).
4. **Numeric keypad** — `inputMode='decimal'` on Amount; `text-[15px]` inputs already prevent iOS focus-zoom (existing `Input` styling).
5. **Isolated form state** — form state moves *out of the page* into the modal. Today every keystroke in the inline form re-renders the entire Sales page including the table and chart. After this change, typing re-renders only the modal subtree — the single biggest small-device performance win here.
6. **Lazy classification fetch** — `GET /transaction-classifications` moves from page-mount to modal-open; users who only browse the list skip the request entirely.
7. **Zero bundle growth** — no new dependencies; reuses `Button`, `Input`, lucide icons already in the pages.
8. **Full-width footer buttons** on mobile (`flex-col-reverse` → Save on bottom, thumb-reach), row on `sm:`.

---

## 9. Blast Radius — what must NOT break (verification checklist)

| Behavior | Where it lives today | Survives because |
|---|---|---|
| Create sale (POST) | `Sales.tsx:267` | Logic moved verbatim into `AddSaleModal` |
| Edit sale (PUT) | `Sales.tsx:255` | Same |
| Classification verify-on-change only | `Sales.tsx:257–262` | Same condition, moved |
| Dashboard refresh events | `invalidateDashboard('sale_created'…)` | Same calls in the modal |
| List + summary refetch after save | `fetchSales/fetchSummary` | Parent `onSaved` callback |
| Import modal unaffected | `Sales.tsx:799` | `SalesImportModal` untouched in this plan |
| Expense create/edit + isDeductible | `Expenses.tsx:144–164` | Moved verbatim |
| No-business guard | `if (!biz) return <NoBusinessPrompt/>` | Parent-level, unchanged; modal only renders when `biz` exists |
| Filters/pagination state | unchanged | Modal state is separate; nothing resets filters except intentional `onSaved` page-reset (create only) |
| Stay on current page after EDIT save | today's behavior (`Sales.tsx` refetches in place) | Preserved via `onSaved('updated')` NOT resetting the page |

---

## 10. Build Order (each step leaves the app working)

| Step | Deliverable | Files | Est. |
|---|---|---|---|
| 1 | `Modal` primitive (shell only, no callers yet) | `components/ui/Modal.tsx` *(new)* | 0.5d |
| 2 | `AddSaleModal` built on it; wire Sales.tsx (add + edit + onSaved); delete inline form | `components/AddSaleModal.tsx` *(new)*, `pages/Sales.tsx` | 0.5d |
| 3 | `AddExpenseModal`; wire Expenses.tsx; delete inline form | `components/AddExpenseModal.tsx` *(new)*, `pages/Expenses.tsx` | 0.5d |
| 4 | Mobile pass on a real device: bottom-sheet, keypad, scroll-lock, dvh, footer buttons | polish only | 0.25d |
| 5 | (Optional, separate PR) Migrate `SalesImportModal` + `CreateBusinessModal` onto the `Modal` shell | cleanup | 0.5d |

Steps 2 and 3 are independent — ship separately if desired. Step 5 is deliberately out of the critical path so this change can land with zero risk to the working Import flow.

## 11. Test Checklist (manual + acceptance)

**Create flow (phone width, Chrome DevTools 375px + real device):**
- [ ] Add Sale → bottom-sheet modal opens docked to bottom; background list does NOT scroll behind it
- [ ] Amount field opens numeric keypad; typing does not jank the page
- [ ] Submit → toast, modal closes, list shows new sale on page 1, Monthly Summary updates, Dashboard totals update (invalidation event)
- [ ] Same for Add Expense, including the deductible checkbox subtext

**Edit flow:**
- [ ] Edit icon → modal pre-fills every field; header says "Edit Sale"
- [ ] Change classification → save → verify endpoint fires (network tab) ; save WITHOUT changing classification → verify does NOT fire
- [ ] Locked/finalized month → server 423 error surfaces as a toast, modal stays open with data intact
- [ ] EDIT while on page 3 → after save, still on page 3 and the edited row is visible (no page jump)
- [ ] Keyboard Tab cycles inside the modal only (focus trap); focus returns to the Edit/Add button on close

**Close/dismiss safety:**
- [ ] Escape + backdrop tap close when idle
- [ ] While saving: close button/backdrop/Escape do nothing (or are disabled) — no half-saved state
- [ ] Reopen after close → fields are fresh (reset-on-open works)

**Regression:**
- [ ] Import from Excel flow unchanged, opens/closes as before
- [ ] Filters, pagination, month navigation, Trends & Insights unaffected
- [ ] Desktop ≥sm: modal centered like before, not bottom-docked
- [ ] `npx tsc -b --noEmit` — no new type errors (pre-existing ones in untouched files are documented elsewhere and out of scope)

## 12. Risks & Notes

- **Largest risk is behavioral drift in the sale edit path** (the conditional verify call). Mitigation: logic moved verbatim + network-tab checklist above.
- **`dvh` support:** all modern mobile browsers (iOS Safari 15.4+, Chrome 108+); the `sm:max-h-[90vh]` fallback covers old desktop browsers. Acceptable.
- **Z-index:** `z-50` matches every existing modal — no stacking changes.
- **Explicitly NOT in this plan:** migrating other modals to the primitive (Step 5, optional), any backend change, any design-system dependency, the taxreform.md classification changes (independent track).

---

## Document History & Review Log

| Version | Change | Verified by |
|---|---|---|
| v1.0 | Initial plan: audit of SalesImportModal/Sales/Expenses, 5 design decisions (D1–D5), Modal primitive + 2 form modal specs, blast-radius table, build order | Full read of `SalesImportModal.tsx`, `Sales.tsx`, `Expenses.tsx`, `Input.tsx`, `CreateBusinessModal.tsx`, both `rules.txt` files |
| v1.1 | Adversarial re-review caught 3 defects: (1) blanket `setPage(1)` on every save would have regressed edit-on-page-3 UX → `onSaved(outcome)` contract; (2) footer submit button renders outside `<form>` → `form="id"` attribute contract added to §4/§5/§6; (3) no focus trap → Tab-cycling trap added to §4. Checklist items added for all three | Line-level re-read of the full plan + behavior cross-check against current page behavior |

**Final verdict (v1.1):** solid to build. Step 1 (primitive) → Step 2/3 (modals) → device pass; Import flow untouched throughout.

---

## 13. IMPLEMENTATION STATUS (live log — update as work proceeds)

**Last updated:** end of implementation session · all 5 plan steps for the core build (1–4) COMPLETE, pending final type-check.

### ✅ Done

| Step | File | State |
|---|---|---|
| 1 — Modal primitive | `frontend/src/components/ui/Modal.tsx` *(new, ~170 lines)* | DONE — bottom-sheet on mobile / centered on sm+, Escape + backdrop close (`dismissible`), body scroll-lock, focus return, Tab focus trap, drag handle (mobile), `role="dialog"`/aria, size sm/md/lg, footer-outside-form contract documented in header |
| 2 — AddSaleModal | `frontend/src/components/AddSaleModal.tsx` *(new)* | DONE — create + edit, reset-on-open + prefill from `editSale`, classifications fetched on open (not page mount), conditional verify-on-change preserved, `inputMode='decimal'`, `dismissible={!saving}`, `form="add-sale-form"` wired to footer submit |
| 2 — Sales.tsx rewired | `frontend/src/pages/Sales.tsx` | DONE — inline form deleted; `showAddModal`/`editSale` state; `openEdit` = one-liner; `handleSaveComplete(outcome)` (page-1 reset on create only); `<AddSaleModal>` mounted once beside `SalesImportModal`; orphaned imports removed (`Input`, `X`, `FormEvent`, `TransactionClassification`) |
| 3 — AddExpenseModal | `frontend/src/components/AddExpenseModal.tsx` *(new)* | DONE — create + edit, same patterns; `isDeductible` checkbox with subtext preserved; `form="add-expense-form"` |
| 3 — Expenses.tsx rewired | `frontend/src/pages/Expenses.tsx` | DONE — inline form deleted; same state/wiring pattern; orphaned imports removed |
| Type-check | `tsc -b --noEmit` | ✅ **DONE — EXITCODE 0, zero errors across the whole frontend** (new components + rewired pages compile clean) |

### 🔁 Re-review pass (post-implementation audit — 2 fixes applied)

A line-level re-read of the shipped code (not the plan) found and fixed:

1. **`Modal.tsx` — header X button ignored `dismissible`.** Escape and backdrop were gated during an in-flight save, but the X button called `onClose` unconditionally → a user could dismiss mid-request, violating the "no half-saved state" guarantee. **Fixed:** X now respects `dismissible` (guarded onClick + `disabled` styling).
2. **`autoFocus` race removed from both modals.** React applies `autoFocus` at commit, then the Modal's rAF focuses the panel (stealing focus back — so it never worked as intended); on mobile it would also pop the keyboard over the bottom sheet. **Removed** — panel focus is the a11y-safe default; the keyboard only opens when the user taps a field.

Post-fix verification: `tsc -b --noEmit` re-run → **✅ EXITCODE 0, zero errors** — the whole frontend (3 new components + 2 rewired pages) compiles clean after the fixes.

### ⏳ Remaining (to continue from here)

1. ~~**Check the type-check result**~~ ✅ DONE — `EXITCODE 0`, zero errors (the previously-documented pre-existing errors in Account.tsx/Sales.tsx/pin.store.ts no longer appear).
2. ~~**Delete the temp checker**~~ ✅ DONE.
3. **Manual device pass** (Step 4 of the plan, §11 checklist): 375px viewport + real phone — bottom sheet, numeric keypad, scroll-lock, edit-stays-on-page, Import modal regression. ← **the only thing left**

### ⚠️ Session note (for whoever continues)

Mid-session, one batch of 6 edits was **interrupted** and had to be re-verified file-by-file: Sales.tsx had 1 orphaned `import Input` left; Expenses.tsx had 5 edits unapplied (imports edit had applied, the rest hadn't — the file was temporarily broken with `FormEvent` used but not imported). All were re-applied and verified by grep before the type-check was run. If anything looks off, the grep recipe to re-verify state is in the session log: search each page for `import Input|showForm|handleSubmit|resetForm` — all must be absent, and `showAddModal`/`handleSaveComplete`/`<AddSaleModal`/`<AddExpenseModal` present.

### 📋 Manual test checklist (from §11 — run after type-check passes)

- [ ] Add Sale at 375px → bottom sheet, background doesn't scroll, numeric keypad on Amount
- [ ] Submit → toast, modal closes, list on page 1, Monthly Summary + Dashboard update
- [ ] Add Expense → same, incl. deductible checkbox
- [ ] Edit → pre-filled; classification change fires verify, no-change doesn't (network tab)
- [ ] Edit on page 3 → stays on page 3 after save
- [ ] Locked month → 423 toast, modal stays open
- [ ] Escape/backdrop close when idle; blocked while saving; fresh fields on reopen
- [ ] Import from Excel flow unchanged; desktop ≥sm centered dialog

---

*End of plan — build Step 1 (Modal primitive) first; Steps 2–3 are the user-visible change.*
