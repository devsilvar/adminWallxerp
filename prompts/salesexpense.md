# Plan: Daily Sales & Expenses by Payment Type (with "Payment Type" rename + Expense Classification)

**Status:** 📝 Proposed — not yet implemented
**Scope:** Sales page, Expenses page, backend summary APIs, small schema change for expenses
**Target:** Phase 6 polish, before soft launch

---

## 1. What the user asked for (plain English)

1. **Daily money boxes at the top** of the Sales page — today's takings split by
   **Cash, POS, Bank Transfer, Paycode** (plus online store & invoice), shown as
   summary boxes/cards right at the top of the page.
2. **Every new day the boxes go back to zero** — they always show *today only*.
3. **Daily / Monthly tabs** — daily is the default and most important view;
   monthly stays available under a tab.
4. **Rename the "Source" field to "Payment Type"** everywhere the user sees it
   (forms, filters, table columns, imports).
5. **Remove "manual"** as a choice — "Cash" already covers it. Manual vs cash was
   confusing (both mean "money the customer handed over").
6. **The same daily treatment for Expenses** — daily boxes + daily/monthly tabs.
7. **A smarter way to classify expenses** — not just a flat category list.

---

## 2. Current state (verified in code)

| Area | Today | File(s) |
|---|---|---|
| Sales source enum | `bank_transfer, paycode, pos, online_store, manual, cash, invoice` (cash + invoice added 2026-08-10) | `backend/prisma/schema.prisma` (`SalesSource`), migration `20260810164700_add_cash_invoice_sources` |
| UI label for source | Renders raw enum (`sourceLabel()` just replaces `_` with space) | `frontend/src/pages/Sales.tsx:66`, `frontend/src/components/AddSaleModal.tsx` |
| Default source in the Add Sale form | `'manual'` | `AddSaleModal.tsx:67,96` |
| Summary API | **Monthly only** — `GET /sales/summary?month=&year=` returns `{ totalSales, transactionCount, sourceBreakdown }` | `backend/src/services/sales.service.ts:270` |
| Expense summary API | **Monthly only** — returns `{ totalExpenses, totalSales, categoryBreakdown, alerts }` | `backend/src/services/expense.service.ts:253` |
| Expense categories | Backend truth: **8 values** (`rent, inventory, salary, utility, fuel, logistics, marketing, other` — `schema.prisma:456-465`, mirrored in `expense.validator.ts:4-6`). ⚠️ **Pre-existing bug:** the frontend offers `gift` and `subscription` (`Expenses.tsx:25`, `AddExpenseModal.tsx:19-28`) which the backend validator will reject with 400 | see Phase D |
| Expense payment method | **Does not exist** — expenses can't record how they were paid | — |
| Existing daily-ish endpoint | `GET /sales/overview` (`granularity: 'day'`) already returns a per-day **totals** time series with **UTC day boundaries** (`sales.service.ts:602-603`, `parseDateOnly` at :540) — our daily endpoint must match this convention, not invent a new one | see §3.3 |
| Tab pattern (to copy) | URL-backed tabs `?tab=` already proven on TaxReports | `frontend/src/pages/TaxReports.tsx` |
| Indexes | Already present — sales: `[businessId, transactionDate(sort: Desc)]` + `idx_sales_tax_calc` (`schema.prisma:159,164`); expenses: `[businessId, expenseDate(sort: Desc)]` + `idx_expense_tax_calc` (`schema.prisma:183,186`). **No index migration needed** | — |
| Repo hygiene | `bckend/` is a stale full mirror of `backend/` in the repo. All edits go to `backend/` **only**; consider deleting the mirror in a separate cleanup commit | — |

**Key insight about "resets to zero":** we do **not** need a cron job to reset
anything. The daily boxes are computed from a date range (`today 00:00 →
tomorrow 00:00`) every time the page loads. At midnight the range simply moves
and yesterday's numbers are gone from the view (history is never lost — it's in
the records). Sales and expenses are **hard-deleted** in this codebase
(`salesTransaction.delete()` at `sales.service.ts:250`, `expense.delete()` at
`expense.service.ts:230` — no soft-delete columns exist despite stale claims in
`PHASE_1_COMPLETE.md`), so no `deletedAt: null` filter is needed anywhere in
the new code.

---

## 3. Design decisions (and why)

### 3.1 Rename "Source" → "Payment Type" — label-only, no DB rename
The DB column stays `source` (`sales_transactions.source`). Renaming a Postgres
enum/column for a cosmetic change is churn with zero user value. We rename
**only what humans read**:

- Form label in `AddSaleModal`: **"Payment Type"**
- Filter dropdown label in `Sales.tsx`: **"Payment Type"**
- Table column header: **"Payment Type"**
- Shared frontend constant `PAYMENT_TYPE_LABELS` so every surface (Sales,
  Transactions, Import modal, receipts) uses identical wording.
- Import template header is already `payment_method` — keep it, just document
  the label as "Payment Type" in the Instructions sheet.

### 3.2 Retire "manual" — hide from UI, migrate data, keep the enum member
`manual` and `cash` are the same thing to a user. Plan:

1. **Keep `manual` as a valid Postgres enum value** (removing enum members in
   Postgres is destructive and unnecessary). Validators keep accepting it so old
   API clients never break — but it disappears from every dropdown.
2. **One-time data migration:** `UPDATE sales_transactions SET source='cash'
   WHERE source='manual' AND reference_id IS NULL` — only rows without a
   `reference_id` are remapped, which makes collision with the
   `unique_sales_reference` constraint on `(business_id, source, reference_id)`
   impossible. Rows *with* a reference id (legacy tests/scripts) are left alone
   and simply never shown as an option.
3. **Default for new sales becomes `cash`** (`AddSaleModal` initial state), and
   `invoice`-related code (`paymentMethodToSalesSource` in
   `invoice.service.ts`) is untouched — it already maps cash invoice payments
   to `source='cash'`.

### 3.3 Daily = a date-bounded summary endpoint, not a new table
No "DailyRecord" table. A daily summary is just the monthly summary logic with
a one-day window. This keeps one source of truth, works for *any* date
(yesterday, last Friday), and needs zero backfill.

**New endpoints** (mirror the existing monthly ones exactly):

```
GET /api/v1/businesses/:businessId/sales/daily?date=YYYY-MM-DD
GET /api/v1/businesses/:businessId/expenses/daily?date=YYYY-MM-DD
```

Both default `date` to **today (Africa/Lagos)** when omitted.

**Sales daily response:**
```json
{
  "date": "2026-09-04",
  "totalSales": 184500,
  "transactionCount": 23,
  "sourceBreakdown": [
    { "source": "cash",          "total": 42000, "count": 9 },
    { "source": "pos",           "total": 61000, "count": 7 },
    { "source": "bank_transfer", "total": 51500, "count": 4 },
    { "source": "paycode",       "total": 20000, "count": 2 },
    { "source": "online_store",  "total": 10000, "count": 1 },
    { "source": "invoice",       "total": 0,     "count": 0 }
  ],
  "transactions": [ /* today's rows: time, amount, payment type, description, customer */ ]
}
```
*(Review correction: the key stays `sourceBreakdown` — identical to the
monthly summary — so the frontend shares one type and one mapping; the
"Payment Type" rename is purely presentational and lives in
`PAYMENT_TYPE_LABELS`.)*

**Expense daily response:** same shape, `categoryBreakdown` +
`paymentBreakdown` (once §6/Phase E ships) + today's expense rows + the
existing expense-intelligence alerts scoped to the day.

**Day boundary math — reuse the existing UTC convention (review correction):**
The codebase's aggregation convention is **UTC day boundaries**
(`getSalesAndExpensesOverview` builds `todayStart/todayEnd` via `Date.UTC` at
`sales.service.ts:602-603`; `custom` ranges via `parseDateOnly` at :540;
`getMonthlySummary`'s `new Date(year, month-1, 1)` is also midnight-UTC on a
UTC host). The v1 draft proposed Lagos-midnight (`T00:00:00+01:00`) — **that
was wrong**: it would create a second convention, and a sale recorded between
23:00–01:00 Lagos would make the daily boxes disagree with the monthly total
and with `/overview` by one boundary hour. An accountant would find that.
Instead:

```ts
// sales.service.ts already has this helper (line 540) — reuse, don't rewrite
const start = parseDateOnly(query.date);   // 'YYYY-MM-DD' → UTC midnight
const end = new Date(Date.UTC(             // same UTC day, 23:59:59.999
  start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
  23, 59, 59, 999
));
```

Filter: `transactionDate: { gte: start, lte: end }` and **exactly the same
filters as `getMonthlySummary`** — `status: { in: ['confirmed', 'completed'] }`
(see `SALES_SUMMARY_API_FIX.md` lesson: never filter on `'completed'` alone),
and **no** `isTaxable`/`isDeductible` filter. This guarantees the
reconciliation invariant **Σ(daily boxes over a month) == monthly summary
total**.

> Known pre-existing inconsistency, out of scope (do NOT silently "fix" it
> here): `/overview` and the tax engine additionally filter
> `isTaxable: true` / `isDeductible: true`, while `getMonthlySummary` does
> not. Aligning them changes visible historical numbers — track separately.

**Validation:** `salesDailyQuerySchema` / `expenseDailyQuerySchema` —
`date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` (default: today,
UTC — same rule as `/overview`'s `todayStart`), reject dates more than 1 day
in the future with `400 INVALID_DATE`.

### 3.4 Frontend: URL-backed Daily/Monthly tabs + boxes strip
Copy the proven `TaxReports.tsx` pattern:

- Tab convention — match `TaxReports.tsx:53-61` **exactly**: the default tab is
  **param-absent** (`/sales` = Daily; `/sales?tab=monthly` = Monthly; switching
  back to Daily does `p.delete('tab')`). Same for `/expenses`. URL-backed so
  refresh/back behaves. (`Account.tsx:115` uses the same read pattern —
  three precedents, zero novelty.)
- **Shared chrome stays shared:** the page header (Add Sale / Import from Excel
  / Trends buttons), `AddSaleModal`, `SalesImportModal`, and
  `TransactionDetailPanel` remain visible/functional on **both** tabs — only the
  content region below the header switches. Add Sale is a daily action; hiding
  it behind the Monthly tab would be a UX regression.
- **Import → daily boxes wiring is already free:** `SalesImportModal.tsx:190`
  already fires `invalidateDashboard('sales_imported')`; the daily fetch
  subscribes to the same `useDashboardEvents` counter, so rows imported with
  today's date appear in the boxes instantly.
- **Daily tab layout (top of page, above the table):**
  - **Total Today hero box** (biggest, primary color) — today's grand total +
    transaction count.
  - **One box per payment type** — Cash, POS, Bank Transfer, Paycode, Online,
    Invoice. Each box: icon + label + ₦ amount + count. Zero-amount boxes stay
    visible (dimmed) so the SME sees the full picture — "what came in through
    which channel today". This satisfies "at a new day it goes back to zero".
  - A date picker (defaults to **Today**) so the user can look at any day;
    non-today dates show "— Tue 2 Sep" instead of "Today".
  - **Today's register** below the boxes: chronological list of today's
    transactions (the daily cash-book view).
  - Live refresh: refetch on window focus + after any create/edit/delete
    (hook into existing `useDashboardEvents.invalidateDashboard`), plus a
    lightweight minute-tick while the tab is open so a box rolls to zero at
    midnight without a manual refresh.
- **Monthly tab** = exactly what exists today (summary card, breakdown bar,
  filters, paginated table) — moved under the tab, unchanged.
- Extract the boxes strip as a reusable component
  (`frontend/src/components/DailySummaryBoxes.tsx`) — Sales and Expenses both
  render it with different data; one implementation, two consumers.

### 3.5 Expense classification — two-level, SME-friendly
The "brilliant way" is to answer the two questions every SME actually has:
**"Where did my money go?"** and **"How did I pay for it?"**

**Level 1 — Category groups (the where):** bucket the existing categories into
three plain-English groups. No new DB column needed — the mapping lives in a
shared constant, displayed with subtotals + % of total:

| Group | Categories | What it means to the SME |
|---|---|---|
| **Cost of Goods** (money that scales with sales) | inventory, logistics, fuel | "If you sell more, this grows" |
| **Running Costs** (same bills every month) | rent, salary, utility | "Your fixed overheads" |
| **Other & Extras** | marketing, other | "Everything else — check this isn't eating profit" |

*(Second-pass correction: the v1 table listed `gift` and `subscription` here,
contradicting Phase D step 0 which removes them from the UI — the backend enum
has no such values. If the backend enum grows later — `taxreform.md` proposes
exactly that — the new categories slot into these groups; the mapping is a
constant, not a migration.)*

Rendered as grouped subtotal cards + a grouped donut/stacked bar in the monthly
tab. This also aligns with how the tax engine already thinks about
deductibility (`TAX_CALCULATION_ANALYSIS.md` groups categories) and dovetails
with `taxreform.md`'s planned extra categories (`bank_charges`, `equipment`,
…) — those would slot into *Other & Extras* later without a UI redesign.

**Level 2 — Payment method on expenses (the how):** add an optional
`paymentMethod` column to `Expense` so daily expense boxes work exactly like
sales boxes (see Phase E for the schema change).

---

## 4. Implementation phases

### Phase A — Backend: daily summary endpoints (no schema change)
1. `backend/src/services/sales.service.ts` → `getDailySummary(userId, businessId, date)`:
   aggregate + groupBy source + today's rows (take 200, ordered by time) in one
   `Promise.all`, reusing the settled-status rule.
2. Same for `expense.service.ts` → `getDailySummary` (categories; payment
   breakdown added in Phase E when the column exists).
3. Validators: `salesDailyQuerySchema` / `expenseDailyQuerySchema`.
4. Controllers + routes: `GET /sales/daily`, `GET /expenses/daily` (ownership
   check via existing `verifyBusinessOwnership`).
5. Swagger entries in `backend/src/config/swagger.ts`.
6. E2E smoke test in `tests/e2e/api.e2e.test.ts` alongside the monthly
   summary tests (exact anchors: `'GET sales/summary → 200'` at line 556,
   `'GET expenses/summary → 200'` at line 689) — seed a row "today", assert
   boxes + zero-boxes behavior for an empty future date.
7. **Route placement (critical):** register the new routes **above** the
   dynamic `/:id` routes — `sales.routes.ts` already documents this trap in a
   comment at line 61 (`/import/template` would be swallowed by `GET /:id`).
   `GET /sales/daily` goes next to `/overview` and `/summary` (lines 16–18);
   `GET /expenses/daily` goes next to `/summary` (`expense.routes.ts:11`).
   Indexes: no migration needed — `[businessId, transactionDate(sort: Desc)]`
   (`schema.prisma:159`) and `[businessId, expenseDate(sort: Desc)]`
   (`schema.prisma:183`) already cover these single-day point queries.

### Phase B — Backend: retire `manual`
1. New Prisma migration `retire_manual_source`: data-only
   `UPDATE ... SET source='cash' WHERE source='manual' AND reference_id IS NULL`.
2. `AddSaleModal.tsx`: remove `manual` from options, default `cash`.
3. `Sales.tsx` `SOURCES` filter list: remove `manual`.
4. `backend/src/lib/sales-import/template.ts`: remove `manual` from
   `SALES_IMPORT_SOURCES` display aliases but keep validator tolerance — add
   `manual → cash` to the alias map so old spreadsheets still import.
5. Update `prisma/seed.ts` (one `manual` seed row → `cash`).
6. Leave enum value, API validators, swagger enum untouched (backward compat).

### Phase C — Frontend: "Payment Type" rename + Daily/Monthly tabs on Sales
1. New shared constant `frontend/src/lib/paymentTypes.ts` — **not** a new
   `constants/` directory: `frontend/src/lib/` is the established home for
   shared frontend modules (`axios.ts`, etc.), and no `constants/` dir exists.
   Exports: `PAYMENT_TYPES`, `PAYMENT_TYPE_LABELS` (`bank_transfer: 'Bank Transfer'`,
   `cash: 'Cash'`, …), `PAYMENT_TYPE_COLORS`, `PAYMENT_TYPE_ICONS`
   (Lucide: Banknote=cash, CreditCard=pos, Landmark=bank transfer,
   QrCode=paycode, Globe=online, FileText=invoice).
2. Replace `SOURCES` (`Sales.tsx:30`, `AddSaleModal.tsx:21`),
   `sourceLabel()` (`Sales.tsx:66`), `SOURCE_COLORS` (`Sales.tsx:88`) with the
   shared constant; rename all visible labels to **"Payment Type"**. Note the
   Add Sale modal defaults are `'manual'` at `AddSaleModal.tsx:67` and `:96` —
   both become `'cash'` (Phase B dependency).
3. Tab shell on `Sales.tsx` per §3.4: default tab = Daily (no URL param),
   `?tab=monthly` = Monthly; `DailySummaryBoxes` component, today's register
   list, date picker, focus/minute-tick refresh, subscription to
   `invalidateDashboard` (create/edit/delete/import all already emit).
4. Move existing summary + table + filters under Monthly unchanged. Header,
   modals, and `TransactionDetailPanel` stay shared (see §3.4).

### Phase D — Frontend: Daily/Monthly tabs + boxes on Expenses
0. **Bug fix (pre-existing, do it first):** the expense form offers `gift` and
   `subscription` (`Expenses.tsx:25`, `AddExpenseModal.tsx:19-28`) but the
   backend enum/validator only has 8 categories (`schema.prisma:456-465`) —
   selecting them today produces a 400. Remove them from `CATEGORIES` (drop
   the `AddExpenseModal.tsx:172-175` gift hint block too) **and** from
   `CATEGORY_COLORS` (`Expenses.tsx:62-63`) so no dead keys linger; map any
   existing rows in the UI as best-effort or migrate them to `other` if any
   exist (check first: `SELECT DISTINCT category FROM expenses WHERE category
   NOT IN (...)`).
1. Same tab shell on `Expenses.tsx`.
2. Daily boxes: **Total Spent Today** + per-**category-group** boxes (Cost of
   Goods / Running Costs / Other & Extras) — before payment methods exist,
   groups are the useful daily lens for expenses.
3. Daily register list of today's expenses.
4. Monthly tab: add grouped subtotals (group cards with % of total) above the
   existing category breakdown.

### Phase E — Expense payment method (schema change)
1. `schema.prisma`: `Expense.paymentMethod PaymentType?` — new enum
   `PaymentType { cash, pos, bank_transfer, paycode, online_store, other }`
   (the sales label map reuses it; `invoice` deliberately excluded for
   expenses — you don't "pay an expense by invoice"). Nullable column,
   backfill migration `UPDATE expenses SET payment_method='cash' WHERE
   payment_method IS NULL` — cash is the realistic default for SME spend.
2. Validator: optional field on expense create/update schemas.
3. `AddExpenseModal.tsx`: "Payment Type" dropdown (optional, defaults Cash).
4. `expense.service.ts` daily/monthly summaries gain `paymentBreakdown`.
5. Daily expense boxes gain per-payment-method view (toggle: by group / by
   payment type).

### Phase F — Polish & docs
1. Optional: **"Close of Day" summary print** — reuse the PDFKit pattern from
   `receipt.pdf.ts` to render a one-page daily cash-up (boxes + register) the
   SME can print for their records. Small, high perceived value.
2. Update `AGENTS.md` (route structure, daily endpoints, renamed labels).
3. Update `TESTING_CHECKLIST.md` with the manual flows in §6.
4. Frontend `npm run lint` + backend `npm run lint` + `npm run build` clean.

---

## 5. Execution order & rough sizing

| Phase | Depends on | Size |
|---|---|---|
| A — daily endpoints | — | ~half day incl. tests |
| B — retire manual | — | ~2 hrs |
| C — Sales rename + tabs | A, B | ~1 day |
| D — Expenses tabs | A | ~half day (reuses C's components) |
| E — expense payment method | D | ~half day incl. migration |
| F — polish/docs | all | ~half day |

**Rollout order:** A → B → C/D. The frontend feature-detects: if `/daily`
returns 404 (backend not yet deployed), fall back to monthly-only view —
so a partial deploy never breaks the pages.

---

## 6. Manual test checklist (post-implementation)

1. Open `/sales` → Daily tab default; boxes show today's per-type totals;
   unused types show ₦0 dimmed.
2. Add a ₦5,000 cash sale → Cash box and Total Today increase immediately
   (invalidateDashboard hook), register list shows the row.
3. Change date picker to yesterday → boxes show yesterday's numbers; back to
   Today → fresh numbers.
4. Leave page open past midnight (or fake system clock) → boxes roll to zero
   on the minute tick without reload.
5. Add Sale modal → label reads **Payment Type**, no `manual` option, default
   Cash; create with each type → correct box increments.
6. `/sales?tab=monthly` → identical to today's Sales page (regression).
7. Filter by Payment Type = Bank Transfer → only transfer rows.
8. Import template download → dropdown contains Cash (no Manual); importing a
   row that says "manual" still succeeds and lands as Cash.
9. Legacy DB check: old `manual` rows now display as Cash and count in the
   Cash box.
10. `/expenses` daily boxes + grouped subtotals; after Phase E, add an expense
    "paid by POS" → POS box increments.
11. Business switching → all boxes refetch for the new active business (no
    stale numbers — sequence-guard like the existing summary fetch).
12. Month locked (finalized report) → daily *view* still works (read-only);
    editing is still blocked by `assertMonthNotLocked` (unchanged).
13. Bulk import rows dated **today** → daily boxes update immediately
    (`sales_imported` event, `SalesImportModal.tsx:190`); rows dated another
    day don't touch today's boxes.
14. Tab URLs: `/sales` opens Daily; `/sales?tab=monthly` opens Monthly; browser
    back/forward switches tabs correctly; switching back to Daily clears the
    param (matches `TaxReports.tsx` behavior).

---

## 7. Risks & non-issues

- **"Daily reset" is not a job** — date-windowed queries make it free; nothing
  to schedule, nothing to forget.
- **Timezone** — the new endpoints deliberately reuse the codebase's existing
  **UTC day-boundary convention** (`parseDateOnly` + `Date.UTC`, as used by
  `/overview` and `getMonthlySummary`) so daily and monthly numbers always
  reconcile. Consequence: the "day" flips at 01:00 Lagos time, not midnight.
  If product later wants Lagos-midnight days, change it **once** in a shared
  `dayWindow()` helper for BOTH daily and monthly endpoints — never per-endpoint.
- **Enum removal** — deliberately avoided; Postgres enum member removal is
  lossy. Hiding + migrating data achieves the goal with zero blast radius.
- **Performance** — one-day groupBy on indexed columns is trivial even at
  thousands of rows/day; register list capped at 200 rows.
- **Backward compatibility** — `manual` stays accepted by the API forever;
  only the UI stops offering it.
- **Out of scope (explicitly):** renaming the DB column/enum; recurring
  "day close" jobs; per-day expense budget alerts (future idea — the
  category-group data makes it easy later); Redis caching (volumes don't need it);
  reconciling the pre-existing `isTaxable`/`isDeductible` filter mismatch
  between `/overview`+tax engine vs `getMonthlySummary` (visible number changes
  — needs a product decision, tracked separately); deleting the stale `bckend/`
  mirror (separate cleanup commit).

---

## 8. Review log (senior review, 2026-09-04)

The v1 draft was re-verified against the actual code before sign-off. Six
corrections were applied above; two were bugs that would have shipped.

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | v1 proposed **Lagos-midnight** (`+01:00`) day windows while the whole codebase aggregates on **UTC day boundaries** (`sales.service.ts:602-603`, `parseDateOnly` :540). Two conventions → daily boxes would disagree with monthly totals for transactions near midnight. | **Bug** — corrected | Reuse UTC convention; day flips at 01:00 Lagos; document as deliberate (§7) |
| 2 | v1 response field `paymentTypeBreakdown` diverged from the monthly summary's `sourceBreakdown`, forcing a second frontend mapping. | **Design smell** — corrected | Keep `sourceBreakdown` key; "Payment Type" is presentation-only via `PAYMENT_TYPE_LABELS` |
| 3 | v1 claimed soft deletes exist ("no `deletedAt: null` filter needed" was asserted without proof; meanwhile stale docs like `PHASE_1_COMPLETE.md:40-45` claim the columns exist). Reality: **hard deletes** (`sales.service.ts:250`, `expense.service.ts:230`), no such columns in `schema.prisma`. | **Wrong claim (in the scary direction)** — the conclusion (no filter) is right, but for the right reason now, and the stale-docs trap is recorded so nobody "restores" phantom columns | §1 + §3.2 rewritten |
| 4 | Pre-existing live bug found during review: frontend offers `gift`/`subscription` expense categories (`Expenses.tsx:25`, `AddExpenseModal.tsx:19-28`) but the backend enum has only 8 values (`schema.prisma:456-465`) → guaranteed 400 today. | **Codebase landmine** — must be fixed in this feature's path | Added as Phase D step 0 |
| 5 | v1 said "add `@@index([businessId, expenseDate])` only if missing" — review confirmed both indexes already exist (`schema.prisma:159,183`), and also confirmed the Express route-ordering trap that the repo itself documents (`sales.routes.ts:61`). | **Confirmed + sharpened** | Phase A step 7 rewritten: no migration; routes above `/:id` |
| 6 | Repo contains a stale full mirror of the backend at `bckend/` (duplicated sources, tests, scripts). Easy to edit the wrong tree. | **Codebase landmine** | §1 + §7: all edits to `backend/` only; mirror deletion as separate cleanup |

**Verified-accurate claims that survived review:** the 7 sales sources incl.
`cash` (`sales.validator.ts:6`); `/daily` is not yet taken by any route;
`?tab=` URL pattern proven in `TaxReports.tsx`; `manual → cash` migration is
safe because `unique_sales_reference` only constrains `(businessId, source,
referenceId)` and the data migration skips reference-carrying rows; settled-
status rule `['confirmed', 'completed']` matches the monthly summary.

### Second pass (same day) — full moving-parts walkthrough

Every remaining unverified claim was traced to source. All confirmed:
`sourceBreakdown` shape (`sales.service.ts:315-326` ↔ `Sales.tsx:72-84` type),
`categoryBreakdown` + `alerts` (`expense.service.ts:302-355` ↔
`Expenses.tsx:36-50`), `AddSaleModal` defaults (`:67,:96`), seed `manual` row
(`seed.ts:168`), import invalidation (`SalesImportModal.tsx:190`),
`TaxReports.tsx` tab pattern (`:53-61`). Six refinements applied:

1. **Tab default = param-absent** (`/sales` = Daily), matching
   `TaxReports.tsx:54-60` byte-for-byte — v1 said `?tab=daily` default, which
   would have been the only page on the codebase with a param-ful default.
2. **Shared chrome** — header buttons, all three modals/panels explicitly stay
   on both tabs; v1 was silent, risking an "Add Sale hidden on Daily tab"
   regression.
3. **Import wiring** — `sales_imported` event already exists; daily fetch
   subscribes to it (checklist item 13 added). Zero new plumbing.
4. **§3.5 group table contradiction** — removed `gift`/`subscription` from the
   grouping (they're being deleted in Phase D step 0; the v1 table still
   referenced them).
5. **Constants location** — `frontend/src/lib/paymentTypes.ts`, not a new
   `constants/` dir (none exists; `lib/` is the established home).
6. **Phase D step 0 extended** — also clean `CATEGORY_COLORS` dead keys
   (`Expenses.tsx:62-63`).

**UI/UX soundness check:** boxes strip = `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
pattern already used by the monthly legend (`Sales.tsx:359`), zero-sum boxes
dimmed not hidden, date picker defaults Today, register capped at 200 rows,
minute-tick only while tab is open, mobile-first (boxes stack, register is a
card list mirroring `Invoices.tsx` mobile pattern). No new dependencies, no
new stores needed (page-local state + existing dashboard events), no breaking
API changes (all additions, zero modifications to existing endpoints).

**Status: plan is implementation-ready.** Nothing touched: auth, tax engine,
payments, invoices, reminders, admin, DVA, statements. All new surface area is
additive endpoints + presentational frontend changes + one data-only migration.

---

# §5 — Multi-Item (Basket) Sales + Expense Quantity (Plan v3, re-reviewed)

> Feature: a walk-in customer buys 5 things → one sale record with item lines,
> not five separate sales. Also: `Expense` gains `quantity` (+ derived
> `unitPrice`). Legacy rows are qty 1. This section supersedes the earlier
> v1/v2 chat plans — v3 fixes drift errors found during the re-review.

## 5.0 Re-review corrections (what changed vs v2)

1. **`qty` → `quantity`.** `InvoiceLine` (schema.prisma) uses
   `quantity Decimal(12,2) @default(1)` — the codebase convention. v2 said
   `qty`; that would have been a naming drift on day one.
2. **`createSaleSchema.amount` is currently required** (verified) — items mode
   must make it optional with a `superRefine` (amount XOR ≥1 items), otherwise
   every basket POST fails validation before reaching the service.
3. **`updateExpense` merged-recompute rule added** (v2 missed it): the service
   patches fields independently, so a qty-only change must compute
   `unitPrice` from the *merged* values (`existing.amount` + new `quantity`),
   never from the payload alone.
4. **`sortOrder` added to `SaleLineItem`** to mirror `InvoiceLine` exactly
   (stable line ordering in the UI and PDFs later).
5. **`createSale` is called with `tx` by DVA auto-capture and invoice
   mark-paid** (sales.service.ts:57 signature) — `items` stays optional so
   both callers remain untouched.
6. **Component-size rule** (rules.txt: <500 lines): the items editor is
   extracted to `SaleItemsEditor.tsx` rather than growing `AddSaleModal.tsx`.

## 5.1 Design decisions (locked)

- **One sale = one tax event.** `SalesTransaction.amount` remains the basket
  total and the only number the tax engine, monthly/daily summaries,
  analytics, DVA, and ledger read. Σ(daily) == monthly == tax stays
  guaranteed with zero math changes.
- **No `quantity` column on `SalesTransaction`.** Baskets carry per-line
  quantity; a single-amount sale *is* quantity 1 by definition. Legacy rows
  are "seeded 1" implicitly — no column, no backfill, no fake data.
- **Expense: `amount` stays the total** and the tax source of truth;
  `quantity` (default 1) is how many units the total covers;
  `unitPrice = amount / quantity` is derived server-side and stored. The
  client may never send `unitPrice` (single source of truth).
- **Product-catalog ready, not built.** Structured rows
  (`name/quantity/unitPrice/lineTotal`), not JSON blobs. A future `productId`
  FK is one nullable column away on both domains.

## 5.2 Phase A — Schema & migration (one migration)

`backend/prisma/schema.prisma`:

```prisma
model SaleLineItem {
  id        String           @id @default(uuid())
  saleId    String           @map("sale_id")
  name      String           @db.VarChar(200)
  quantity  Decimal          @default(1) @db.Decimal(12, 2)
  unitPrice Decimal          @map("unit_price") @db.Decimal(15, 2)
  lineTotal Decimal          @map("line_total") @db.Decimal(15, 2)
  sortOrder Int              @default(0) @map("sort_order")
  createdAt DateTime         @default(now()) @map("created_at")
  sale      SalesTransaction @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@index([saleId, sortOrder])
  @@map("sale_line_items")
}
// On SalesTransaction:
//   items SaleLineItem[]
```

`Expense` additions:

```prisma
quantity  Decimal  @default(1) @db.Decimal(12, 2)
unitPrice Decimal? @map("unit_price") @db.Decimal(15, 2)   // derived: amount / quantity
```

Migration `add_sale_items_and_expense_quantity` — three ordered statements:
1. `CREATE TABLE "sale_line_items" ...` (per schema above)
2. `ALTER TABLE "expenses" ADD COLUMN "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1`
   (legacy rows instantly qty 1)
3. `ALTER TABLE "expenses" ADD COLUMN "unit_price" DECIMAL(15,2)` +
   `UPDATE "expenses" SET "unit_price" = "amount" WHERE "unit_price" IS NULL`
   (quantity is 1 for all legacy rows → exact copy, zero rounding drift)

No backfill for sales (single-amount sales have zero lines; UI renders them
as qty 1).

## 5.3 Phase B — Validators

`sales.validator.ts`:

```ts
const saleLineItemSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  quantity: z.number().positive().max(100_000),
  unitPrice: z.number().nonnegative().max(1e13),
});
```

- `createSaleSchema`: `amount` becomes `.optional()` + `items:
  z.array(saleLineItemSchema).max(50).optional()` + `.superRefine`: if `items`
  is a non-empty array → amount optional (server recomputes); if `items`
  absent → `amount` required positive as today. `items: []` on create → 400.
- `updateSaleSchema`: `items` optional. Update semantics (documented
  contract): `items` with ≥1 lines → atomically replace all lines + recompute
  amount (client `amount` ignored); `items: []` → delete all lines, `amount`
  required in the same payload (basket → single-amount conversion);
  `items` absent → lines untouched (existing behavior byte-identical).

`expense.validator.ts` (verified current shape, lines 8–24):

- `createExpenseSchema` / `updateExpenseSchema`: add
  `quantity: z.number().positive('Quantity must be greater than 0').max(100_000).optional()`.
  **No `unitPrice` field accepted** — derived server-side.

## 5.4 Phase C — Backend services

`sales.service.ts`:

- `computeSaleTotal(items)` — `lineTotal = Math.round(quantity × unitPrice ×
  100) / 100` per line, sum, same rounding as invoice `computeTotals`.
- `createSale` (sales.service.ts:57): when `items` present → wrap in
  `prisma.$transaction`: create parent (amount = computed total) +
  `createMany` lines (with sortOrder) + transactional `logAudit('sale.created')`
  with `itemCount` in newData. Description fallback when absent:
  `"3 items: Rice 5kg, Beans 2kg, Oil…"` (truncate 500) — keeps the sales
  table, daily register, and receipt PDF readable. When `items` absent →
  existing path byte-identical (DVA + invoice mark-paid unaffected).
- `updateSale` (sales.service.ts:178): add the `items` branch per the §5.3
  contract — deleteMany + createMany inside the same tx as the parent update
  (invoice.service.ts:392 pattern); recompute amount; audit `itemCount`.
- `getSaleById` (sales.service.ts:164): `include: { items: { orderBy:
  sortOrder } }`. `listSales` (sales.service.ts:137): add
  `_count: { select: { items: true } }`. `getDailySummary`
  (sales.service.ts:342): rows select gains the items `_count` — **no math
  change** (boxes aggregate parent `amount`).

`expense.service.ts`:

- `createExpense` (expense.service.ts:51): `quantity = input.quantity ?? 1`,
  `unitPrice = Math.round((amount / quantity) × 100) / 100`, both stored;
  audit newData gains quantity.
- `updateExpense` (expense.service.ts:160): **merged-recompute rule** — the
  effective pair is `(input.amount ?? existing.amount, input.quantity ??
  existing.quantity)`; if either changed, recompute and store `unitPrice`.
  Handles qty-only, amount-only, and both-changed edits correctly.
- `listExpenses` / `getDailySummary` selects add `quantity, unitPrice` —
  read-side only; totals untouched.

## 5.5 Phase D — Frontend

- **`frontend/src/components/SaleItemsEditor.tsx` (NEW)** — line editor rows
  (name / quantity / unit price), add-row, remove-row (can't remove the
  last), live total via `useMemo` mirroring the backend rounding exactly.
  Keeps `AddSaleModal.tsx` well under the 500-line rule.
- **`AddSaleModal.tsx`** — segmented toggle **Single amount | Multiple items**
  (default single → zero regression). Items mode submits `{ items }` and no
  `amount`. Edit prefill: `items.length > 0` → items mode hydrated;
  otherwise single mode. Legacy-source prefill (`sourceOptions`) untouched.
- **`AddExpenseModal.tsx`** — optional Quantity field (default 1, min > 0)
  beside Amount + live helper when qty > 1: *"₦10,000 each × 5 = ₦50,000"*.
  Edit prefills quantity from the row.
- **`types/index.ts`** — `SalesTransaction` (line 46) gains
  `items?: SaleLineItem[]`, `itemsCount?: number`; `Expense` (line 65) gains
  `quantity: number; unitPrice?: number | null`; new `SaleLineItem` interface.
- Refresh wiring already exists (create/edit/delete/import emit dashboard
  invalidation) — daily boxes and registers update automatically.

## 5.6 Phase E — Display

- `TransactionDetailPanel`: basket rows render a line-items table (name,
  quantity, unit price, line total) with the parent total above.
- Sales table + daily register: `· N items` chip from `itemsCount`.
- Expense tables (monthly + daily): `5 × ₦10,000` when quantity > 1, plain
  amount when quantity = 1 — **which renders every legacy row correctly with
  zero migration**, the "seed 1" requirement made visible.

## 5.7 Phase F — Seed (`backend/prisma/seed.ts`)

- One basket sale (e.g. "Counter sale — 3 items", POS, ₦12,500 with 3
  `SaleLineItem` rows) alongside `salesData` (lines 164–170).
- One quantity expense in `expensesData` (lines 195–200): *"12 crates of
  eggs", inventory, amount 42,000, quantity 12 → unitPrice 3,500*.
- Legacy-style rows remain untouched → demonstrates both shapes after
  `npm run db:setup`.

## 5.8 Out of scope (v1, explicit)

- Product catalog / `productId` FK (schema ready for it).
- Receipt PDF line-items table (description fallback keeps receipts sane;
  items table is a cheap Phase-2 add to `receipt.pdf.ts`).
- DVA auto-capture, invoice mark-paid, Excel import: single-amount, no items.
- No VAT per sale line (sales are tax-inclusive receipts; VAT display is
  invoice territory). No per-item taxability flags.

## 5.9 Blast radius (rules.txt check) — what is NOT touched

Auth, tax engine (reads `amount`), monthly/daily summary math, analytics,
Paystack payments, month locking, DVA, ledger, statements, reminders, admin,
webhooks, sales-import pipeline (creates parent-only rows). Existing e2e
tests stay green — every change is additive (new optional field, new optional
relations, new columns with defaults). The stale `bckend/` mirror is not
touched.

## 5.10 Execution order & validation checklist

1. Migration + `prisma:generate` (or `npm run db:setup` locally).
2. Validators → services (sales, then expense) → controllers (passthrough —
   no route changes; existing endpoints unchanged).
3. `SaleItemsEditor.tsx` → `AddSaleModal.tsx` → `AddExpenseModal.tsx` →
   types → displays.
4. Seed (Phase F).
5. Validate: `backend npx tsc --noEmit` = 0; `frontend npm run build` ✓;
   `npm run test:e2e` green.
6. Manual: create basket sale → daily Total box = Σ lines ✓; edit basket
   (replace lines) ✓; basket → single (`items: []` + amount) ✓; expense
   qty 12 → `12 ×` ✓; legacy expense row → plain amount (qty 1) ✓; edit in
   locked month → 423 ✓; single-amount flow + DVA + invoice→sale unchanged ✓.

**Status: v3 plan is implementation-ready.** All file/line references in this
section were verified against the live codebase during the re-review.







