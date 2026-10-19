# TAXREFORM — Sales & Expense Classification Reform Plan

**Project:** PayMyTax by WallX · Nigerian SME tax platform (FIRS)
**Status:** REVIEWED & APPROVED FOR BUILD (v1.2) — not yet implemented
**Scope:** Make sales/expense classification honest, explained, tamper-resistant, and fully transparent — so nobody gets cheated in either direction.

---

## 1. Guiding Principles

1. **The tax engine is the source of truth, not the user's mood.** Classification changes _inputs_; the formula stays `Tax = 7.5% × (Taxable Sales − Deductible Expenses)`.
2. **Default = safest for revenue.** When we don't know, money counts as **taxable sales**. Non-taxable is an _earned claim_, not a default.
3. **Nothing hidden.** Every naira excluded from tax must be visible, counted, and explainable — to the user, to an auditor, and to FIRS.
4. **Claims leave a paper trail.** Every "not taxable" decision stores _who, when, why, and the tax impact_ (audit log already exists — we use it).
5. **Explain in market language.** No `taxTreatment: non_taxable` jargon in the UI. "This is money you owe tax on" / "This is not business income".
6. **Both directions are cheating.** Marking real profit as "gift" cheats FIRS; marking personal spend as deductible cheats the system too. Guard **both**.
7. **Locked months are immutable.** After finalization/payment, classifications freeze — same as sales/expense edits today.

### 1.5 The simplicity law — will users actually understand it?

**North Star:** a Nigerian SME owner on a phone should classify any sale or expense in **≤2 taps**, and should _always_ be able to answer "what is counted for tax and why" in one glance.

| Rule                                   | Enforced by                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One binary question, then done         | Every manual sale starts with "Is this money BUSINESS INCOME? YES / NO". ~90% of genuine sales stop at YES — no classification matrix, no jargon                 |
| Non-taxable = ≤3 taps                  | NO → tap a reason chip (Loan, My own money, Transfer, Refund…) → optional detail. Free typing only if "Something else"                                           |
| Nothing appears unless relevant        | Claims Review card renders only when exclusions exist; "Other" fields only expand when "Other" is picked; expense ₦-impact only shows once the toggle is touched |
| Consequences are stated, never implied | Every tax-affecting control shows its ₦ effect immediately (sale: "counts for tax"; expense: "OFF adds ₦X to tax")                                               |
| Deductibility follows the category     | Category cards pre-set the toggle (Equipment→OFF, fines→OFF) so the user isn't left to guess                                                                     |

**Success metrics (measure 2 weeks after P1+P3):**

- ≥90% of manual sales classified with a single YES (no matrix shown).
- Non-taxable claim completes in ≤3 taps; reason requirement blocks <10% of legitimate claims (preset chips make it one tap).
- Zero silent tax changes: 100% of exclusions visible in Claims Review before finalize.
- Sales-related "why is this taxed?" support tickets ≤5% of total.

---

## 2. Current-State Audit

### 2.1 What already exists (we build on it, not rebuild)

| Piece                       | Location                                                                                                | State                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Classification master data  | `backend/prisma/seeds/transaction-classifications.ts`                                                   | 8 seeded: Product Sale, Service Revenue (taxable); Capital Injection, Loan Received, Gift Received, Grant Received, Transfer Between Accounts, Refund Received (non-taxable); Other (review_required)                    |
| Classification model        | `schema.prisma:110` `TransactionClassification`                                                         | `category` (revenue/capital/loan/transfer/refund/grant/gift/investment/tax_refund/insurance/asset_sale/other), `taxTreatment` (taxable/non_taxable/review_required), `isRevenue`, `isExpense`, `description`, `isActive` |
| Sales classification fields | `schema.prisma:129` `SalesTransaction`                                                                  | `classificationId` FK, `finalClassification`, `isTaxable` (**default true**), `needsVerification`, `verifiedAt/By`                                                                                                       |
| Apply-classification engine | `sales.service.ts:370` `verifySale()`                                                                   | Maps `taxTreatment → isTaxable`, sets `finalClassification`, confirms sale, audit-logs                                                                                                                                   |
| Reclassify endpoint         | `POST /sales/:id/reclassify` → alias of verifySale                                                      | **Same restrictions as verify**                                                                                                                                                                                          |
| Classification API          | `GET /transaction-classifications(/revenue                                                              | /category/:c)`                                                                                                                                                                                                           | Read-only, active-only |
| DVA verification flow       | `needsVerification=true` → `UnverifiedTransactions.tsx` modal                                           | User picks classification; "Other" has a free-text reason box — **the right UX seed already exists**                                                                                                                     |
| Expense taxability          | `schema.prisma:168` `Expense.isDeductible` + checkbox in `Expenses.tsx`                                 | Works, but dumb: no guidance, no evidence, no shown consequence                                                                                                                                                          |
| Tax engine consumption      | `tax.service.ts` (`status in (confirmed, completed)` + `isTaxable`); expense aggregate (`isDeductible`) | Correctly honors both flags                                                                                                                                                                                              |
| Anomaly detection           | `margin_deviation` (tax.service) + `HIGH_EXPENSE_WARNING` (expense.service)                             | Exists — good hook                                                                                                                                                                                                       |
| Month locking               | `assertMonthNotLocked()`                                                                                | Applied to sale/expense CRUD — **not** to classification changes                                                                                                                                                         |

### 2.2 Gap analysis

**GAP-1 — Confirmed sales can never be reclassified (integrity bug).**
`verifySale()` throws `ALREADY_VERIFIED` when `needsVerification=false`. Manually created sales are born without verification, `isTaxable=true`, unclassified — and **permanently stuck**. If an SME records ₦500k as a "sale" and it was actually a loan repayment, there is no UI or API path to fix it. This is the single worst defect in the flow.

**GAP-2 — Manual sales skip classification entirely.**
The guided "what is this money?" step only runs for DVA inflows. The manual Sales form never asks "is this business income?" and has no classification field.

**GAP-3 — No evidence captured for non-taxable claims.**
`verifySale()` accepts only a classification _name_. Nothing records _why_ ₦2m is claimed as a "loan". In a dispute, there is nothing. Gaming vector: click "Gift Received", pay tax on zero.

**GAP-4 — Zero transparency on what was excluded.**
No screen answers "of my ₦5m inflow, ₦4.2m was taxable, ₦800k excluded — here is each exclusion and why". Users can't verify they're not being cheated; auditors can't verify claims.

**GAP-5 — Expense "Other" is a black hole.**
`description` requires only 1 character ("x" passes). No structured "what is this for?" when `category=other`. Deductibility is a naked checkbox with zero consequence display and identical defaults for every category.

**GAP-6 — Sales import bypasses classification.**
Bulk imports create rows with no `finalClassification`, `isTaxable` defaults true — silently. A bulk-imported loan would be taxed.

**GAP-7 — Classification ignores month locking.**
`verifySale()` doesn't call `assertMonthNotLocked()`. A user can reclassify a sale in a finalized/paid month, diverging live aggregates from the locked report snapshot.

**GAP-8 — No review surface for claims.**
No list of "all money you declared non-taxable this month", no admin view, no claim-total acknowledged at finalize time.

**GAP-9 — TransactionDetailPanel hardcodes a one-click reclassify** (`category: 'transfer', isTaxable: false`) — no picker, no reason, no impact preview. Cheap to abuse.

---

## 3. Threat Model — how it gets gamed, and how we close each door

| #   | Cheat vector                                                    | Hurts                     | Closure                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Record real sales as "Gift / Loan / Capital" → tax on ₦0        | FIRS + honest competitors | Non-taxable claims **require a one-tap preset reason chip** (`Something else` needs a 10-char note); claims aggregate into a **Claims Review** card shown _before_ finalize ("You are excluding ₦820,000 — confirm each item"); extend `margin_deviation` to flag abnormal excluded-vs-taxable ratio |
| T2  | Re-label a sale after the month is paid                         | FIRS                      | Locked/finalized months immutable for classification (GAP-7 fix)                                                                                                                                                                                                                                     |
| T3  | Mark personal spend as deductible                               | FIRS                      | Category→deductibility defaults; toggle shows **live ₦ impact** ("unchecking adds ₦3,750 to this month's tax"); receipt required above ₦50,000 (Phase 4); "Other" demands a real description                                                                                                         |
| T4  | Dump everything into "Other"                                    | FIRS                      | Keep "Other" (removing it strands users) but gate it: mandatory specific description (min 10 chars, Nigerian examples as placeholder) + `review_required` treatment → lands in Claims Review                                                                                                         |
| T5  | User cheated: DVA personal transfer auto-becomes a taxable sale | User                      | Flow already good (classify-to-confirm). Extend the same respect to manual sales via a classification picker on the Sales form                                                                                                                                                                       |
| T6  | Silent one-click non-taxable via TransactionDetailPanel         | FIRS                      | Replace hardcoded reclassify with the full guided modal (picker + reason + impact preview)                                                                                                                                                                                                           |
| T7  | Bulk-import "loans" as sales                                    | FIRS                      | Import gains classification mapping, or defaults to revenue + lands on the classification to-do list                                                                                                                                                                                                 |

**Design stance:** we do not _block_ non-taxable claims (users legitimately receive loans/gifts/transfers) — we make every claim **deliberate, evidenced, visible, and acknowledged**. Friction is proportional to money at stake.

---

## 4. Taxonomy Redesign (the "words" matter as much as the code)

### 4.1 Sales classifications — final list (seed update)

Grouped as the user sees them. Each gets: plain-English description, a Nigerian example, and a pre-written tax-impact line.

| Display name                      | category   | taxTreatment    | UI copy (description line)                                                                                              |
| --------------------------------- | ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Money from Sales                  | revenue    | **taxable**     | "Payment for goods you sold or services you rendered — this is your business income"                                    |
| Money from Sales (Products)       | revenue    | taxable         | "e.g. customer pays ₦15,000 for the goods in your shop"                                                                 |
| Money from Sales (Services)       | revenue    | taxable         | "e.g. client pays ₦80,000 for a job you completed"                                                                      |
| Money You Put In (Capital)        | capital    | non_taxable     | "Your own personal money you moved into the business. Not income — you are not taxed on your own money"                 |
| Loan / Money Borrowed             | loan       | non_taxable     | "Money someone gave you that you must pay back — e.g. bank loan, family loan. Not income"                               |
| Loan Repayment Received           | loan       | non_taxable     | "A customer or friend paying back money YOU lent them. Not new income"                                                  |
| Money Moved Between Your Accounts | transfer   | non_taxable     | "Moving your own money from one of your accounts/banks to another. Not income"                                          |
| Refund / Money Returned           | refund     | non_taxable     | "A supplier or platform returned money you paid earlier. Not income"                                                    |
| Gift Received                     | gift       | non_taxable     | "A genuine gift to the business. _Note: gifts used to run the business day-to-day may be reviewed_"                     |
| Grant Received                    | grant      | non_taxable     | "Free money from a government programme, NGO or competition — e.g. YouWin, Tony Elumelu grant"                          |
| Investment Received               | investment | non_taxable     | "Money an investor put into the business in exchange for shares/partnership"                                            |
| Asset Sale Proceeds               | asset_sale | review_required | "Money from selling business equipment/property (gen, fridge, shop). Special FIRS rules may apply — flagged for review" |
| Something Else                    | other      | review_required | "Anything that does not fit above. You must describe it — we will check it doesn't miss tax"                            |
| Interest / Savings Income         | investment | review_required | "Interest your bank paid you, or dividends. Treated separately for tax — flagged for review"                            |
| Rent / Property Income            | revenue    | taxable         | "Money your business earns from renting out space or equipment — counts for tax"                                        |

Rules encoded in seed: the **revenue category is the only `taxable` treatment** — `Product Sale`/`Service Revenue` are the canonical taxable rows (existing DB rows reference these names — keep names stable, only _add_ new rows, never rename in place); `Rent / Property Income` is also taxable (new revenue row). New rows to add: Loan Repayment Received, Investment Received, Asset Sale Proceeds, Interest / Savings Income, Rent / Property Income. `Money from Sales (Products)` / `(Services)` are display aliases — implement as `description` variants on the two existing taxable rows rather than new DB rows, to avoid duplicate taxable paths.

**Gift threshold rule (legal nuance, zero UI cost):** `Gift Received` defaults `non_taxable` (informal family gifts match Nigerian market reality) **but any single gift ≥ ₦100,000 auto-escalates to `review_required`** — gifts received _in the course of trade_ can be taxable income, so large gifts must never silently escape tax.

**Seed must switch from deleteMany-recreate to upsert-by-name** (current seed wipes rows that `SalesTransaction.classificationId` points at — FK hazard).

### 4.2 Expense categories — final list + deductibility defaults

| Category                    | Default deductible | UI hint                                                                                                    |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Rent (shop/office)          | ✅                 | "Rent for your business premises"                                                                          |
| Inventory / Stock           | ✅                 | "Goods you bought to resell"                                                                               |
| Salaries & Wages            | ✅                 | "Staff pay, including casual workers"                                                                      |
| Utilities                   | ✅                 | "Light (NEPA/DisCo), water, internet for the business"                                                     |
| Fuel & Transport            | ✅                 | "Fuel, transport, delivery for business runs"                                                              |
| Logistics                   | ✅                 | "Dispatch, shipping, waybill"                                                                              |
| Marketing                   | ✅                 | "Ads, flyers, data for promotion"                                                                          |
| Bank & charges              | ✅ _(new)_         | "Transfer fees, SMS alerts, card charges"                                                                  |
| Equipment / Assets          | ❌ _(new)_         | "Generator, fridge, laptop — things you KEEP. Assets follow special tax rules (not expensed in one month)" |
| Entertainment / Hospitality | ❌ _(new)_         | "Meals, parties, outings — mostly NOT deductible for tax"                                                  |
| Donations & Tithes          | ❌ _(new)_         | "Church/charity — only deductible with a FIRS receipt; add a note if you have one"                         |
| Fines & Penalties           | ❌ _(new)_         | "Fines, late fees, penalties — FIRS does not allow these"                                                  |
| Miscellaneous (Other)       | ⚠️ review          | "Anything else — you MUST say exactly what it is for"                                                      |

- Keep the existing 8 enum values (DB-safe); add `bank_charges`, `equipment`, `entertainment`, `donations`, `fines` via migration (Postgres enum append).
- **Corrected defaults (legal, see §4.3):** `Equipment / Assets`, `Entertainment / Hospitality`, `Donations & Tithes`, `Fines & Penalties` all default **`isDeductible: false`**. The UI explains why in one line; users can still flip ON (e.g. a donation with a FIRS receipt) — every flip is audit-logged.
- `other` keeps `isDeductible: true` default (small genuine items exist) **but** requires the structured detail below and surfaces in the month's review list.

---

### 4.3 FIRS legal grounding (we fix it correctly, not just hopefully)

| Sales classification                    | Why (Nigerian law, simplified)                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / Service sales                 | **Taxable.** Business income under CITA; 7.5% VAT collected on commercial sales. The bulk of SME revenue                                                                                     |
| Loan received / Loan repayment received | **Not income.** A loan is a liability that must be repaid; repayments return your principal, not profit                                                                                      |
| Capital injection / Investment received | **Not income.** Capital contributed by owner/investor (share capital); CITA does not tax capital receipts                                                                                    |
| Transfer between your own accounts      | **Not income.** No economic gain — you moved your own money                                                                                                                                  |
| Refund received                         | **Not income.** Recovery of an earlier payment, not new earnings                                                                                                                             |
| Grant received                          | **Borderline.** Capital grants may be non-taxable; revenue grants can be taxable. Default non-taxable, flagged if large                                                                      |
| Gift received                           | **Legal nuance.** Gifts received _in the course of trade_ are taxable income; informal personal gifts are not. Default non-taxable, but **≥ ₦100k auto-escalates to review_required** (§4.1) |
| Asset sale proceeds                     | **Not CIT — CGT.** Selling a business asset triggers Capital Gains Tax (10%), a _separate_ tax. Never fed into the 7.5% profit formula — flagged for review                                  |
| Interest / Savings income               | **Separate regime.** Passive income taxed distinctly; flagged, never silently folded into sales                                                                                              |
| Everything else / Other                 | **review_required** — an honest "we'll check" beats a wrong guess                                                                                                                            |

| Expense category                                                                               | Deductibility (CITA principle)                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rent, Salaries/Wages, Utilities, Fuel/Transport, Logistics, Marketing, Bank charges, Inventory | **Deductible** — wholly, exclusively and necessarily incurred in generating income (Finance Act treatment)                                                             |
| Equipment / Assets                                                                             | **Not immediately deductible.** Capital expenditure is expensed through Capital Allowances, not in one month. Default OFF, with a plain note ("asset — special rules") |
| Entertainment / Hospitality                                                                    | **Largely disallowed.** Default OFF                                                                                                                                    |
| Donations / Tithes                                                                             | **Disallowed without FIRS receipt** to an approved body. Default OFF; ON requires a `receiptUrl` note                                                                  |
| Fines & Penalties                                                                              | **Disallowed** (CITA disallows penalties). Default OFF                                                                                                                 |
| Miscellaneous (Other)                                                                          | Default ON for small genuine items, but gated description (§5.3) and surfaced monthly                                                                                  |

**Why this keeps it simple:** legal correctness lives in _defaults and presets_, not in questions to the user. The user never sees "CITA S.24" — they see a pre-set sensible toggle and one sentence of plain-language reasoning they can flip if real circumstances apply.

## 5. The UX — screen by screen (Nigerian-first, nothing hidden)

### 5.1 Sales form — "What is this money?" (2-step, inline)

**Step 1 — Money questions (segmented control, 2 options):**

```
Is this money BUSINESS INCOME?
┌──────────────────────────────┬──────────────────────────────┐
│ ✅ Yes — money my business    │ ⭕ No — it's something else   │
│    earned from selling        │    (loan, gift, my own money, │
│                               │    transfer between accounts) │
│    This counts for tax        │    Tell us what it is →       │
└──────────────────────────────┴──────────────────────────────┘
```

- "Yes" → taxable path: (source, amount, date, optional description, customer name) — exactly today's form, **plus** a small line: _"₦X of this counts towards your tax this month."_
- "No" → **Step 2 — classification picker** (cards from §4.1, grouped "Not business income" / "Needs review"). Selecting any non-taxable card reveals:
  - **Why? (one tap, not an essay)** — preset reason chips: `Loan from bank/family` · `My own money` · `Moving between my accounts` · `Refund` · `Something else (type it)`. Each chip stores an audit-friendly `reasonKey`; only `Something else` requires a typed note (min 10 chars). Covers GAP-3 evidence without forcing an honest trader to type a paragraph.
  - Live impact strip: _"This will NOT be added to your tax. It will show in your money timeline and may be reviewed."_
- The sale is created with `needsVerification=false`, classification applied server-side in one call (no two-step verify dance for manual entries).
- Editing a sale after creation: classification stays editable **only while the month isn't finalized/locked** (§6, GAP-7).

### 5.2 Sales list & Transaction detail — "Fix classification" affordance

- Every sale row/card shows a classification chip: 🟢 `Business income` / ⚪ `Loan` / 🟡 `Needs review` / (blank → `Unclassified — counts as business income`).
- Clicking the chip opens the **guided reclassify modal** (same Step-2 UI as 5.1) with: current classification, new selection, **before/after tax-impact preview** ("Changing this reduces this month's taxable sales by ₦500,000 → tax drops ₦37,500"), required reason when moving taxable→non-taxable, and disabled state with explanation when the month is locked.
- Replaces the hardcoded one-click reclassify in `TransactionDetailPanel.tsx` (GAP-9).

### 5.3 Expense form — guided deductibility

- Category picker: cards with the hint lines from §4.2 (no more naked dropdown).
- Selecting **Miscellaneous (Other)** expands a required field: **"What exactly is this expense for?"** — preset chips (`Shop items` · `Repairs` · `Office supplies` · `Cleaning` · `Something else`) + an optional typed detail. Whatever is picked lands in `description` (prefixed with the preset). Server keeps `category === 'other'` requiring ≥10 chars total — a chip on its own passes, so it's fast but never "x" (GAP-5).
- Deductibility becomes an **explained toggle**, pre-set by category:
  ```
  Count this expense when calculating tax?   [ON]
  ON  = reduces your profit → reduces your tax (you pay less)
  OFF = this money is not a business cost (e.g. personal)
  Turning OFF increases this month's tax by ₦X
  ```
- If amount ≥ ₦50,000 and ON: receipt nudge ("Upload a receipt or photo so your claim is safe if reviewed" — soft in Phase 2, required in Phase 4).

### 5.4 Tax Reports — the "Nothing Hidden" card (GAP-4)

New card above Calculate, per selected month:

```
Your money this month
  Money in (all sources)            ₦5,000,000
  − Not business income (4 items)    ₦  800,000   [see list]
  = Business income (taxable)        ₦4,200,000
  − Business costs (deductible)      ₦1,850,000
  = Profit                           ₦2,350,000
  Tax (7.5%)                           ₦ 176,250
```

- "[see list]" opens the **Claims Review**: every excluded sale & non-deductible expense, with amount, classification, reason, date, who/when. Also the admin/auditor view (read-only page under `/admin` later).
- Finalize button flow gains one acknowledgment step when claims exist: _"You are excluding ₦800,000 from tax across 4 items. I confirm these are not business income."_ (checkbox; audit-logged as `tax.claims_acknowledged`).

### 5.5 DVA / Unverified flow — keep, align, upgrade

`UnverifiedTransactions.tsx` already has the right bones. Upgrades: reuse the same modal component as 5.2 (one shared `ClassificationModal`), show live impact, store reason. `TransactionDetailPanel.handleVerifyAsSales/handleReclassify` route through it too.

### 5.6 Sales import — classification-aware

- Template gains an optional **"Classification"** column; header aliases: `Classification`, `Type`, `Category`.
- Parser maps free text → classification name (fuzzy, same style as source matching); unknown → `revenue` default + row flagged in preview as "Will count as business income — change after import".
- Commit writes `classificationId`/`finalClassification` where provided (GAP-6).

---

## 6. Backend Changes (API + data)

### 6.1 Core fix — unlock reclassification (GAP-1, GAP-7)

`sales.service.ts → verifySale()`:

1. Accept `reason?: string` (required by validator only when the TARGET classification is `review_required`, or when a preset `reasonKey` isn't supplied; min 10 chars). Store in new `classificationNote` column; include in audit `newData`. Preset chips send `reasonKey` (e.g. `loan_from_bank`) and the UI expands it to a market-language label.
2. Replace the `needsVerification` guard with:
   - If `sale.needsVerification` → normal first verification (sets `verifiedAt/By`, `status='confirmed'`).
   - Else → **re-verification path**: allowed only if the sale's month is not finalized/locked — call `assertMonthNotLocked(businessId, sale.transactionDate)`. Update classification fields, keep `verifiedAt` history via audit log (`sale.reclassified`, includes old + new classification + reason).
3. Response returns old/new `isTaxable` + the tax delta for the month so the UI can render the impact strip.

### 6.2 Create-sale classification (GAP-2)

`sales.validator.ts → createSaleSchema` gains optional `classification?: string` (name) + `classificationNote?: string`. `createSale()` resolves the classification (same lookup as verifySale) and applies `isTaxable`/`classificationId` atomically at create time. Omitted → current behavior (`isTaxable=true`, unclassified).

### 6.3 Claims & transparency endpoints (GAP-4, GAP-8)

New: `GET /businesses/:id/tax/breakdown?year=&month=` →

```
{ moneyIn, excludedSales: [{id, amount, classification, reason, date}],
  excludedTotal, taxableSales, deductibleExpenses, nonDeductibleExpenses,
  grossProfit, taxRate, taxPayable }
```

Single raw/aggregate query set; consumed by the "Nothing Hidden" card and Claims Review. Extend `finalizeReport()` to require `claimsAcknowledged?: true` in the body when `excludedTotal > 0` (audit `tax.claims_acknowledged`).

### 6.4 Month-lock integrity (GAP-7)

`verifySale()` (both paths) calls `assertMonthNotLocked(businessId, sale.transactionDate)`; returns `423 PERIOD_LOCKED / PERIOD_FINALIZED` with the same copy used by sale edits.

### 6.5 Classification seed rework

`seeds/transaction-classifications.ts`: upsert-by-name (no deleteMany); add rows per §4.1; every row's `description` rewritten in market language; add `exampleNaira` copy via description text (no schema change).

### 6.6 Schema migration (one migration, additive only)

```prisma
model SalesTransaction {
  // …existing…
  classificationNote String? @map("classification_note")  // why non-taxable was claimed
}
model Expense {
  // …existing…
  deductibilityNote String? @map("deductibility_note")    // why toggled off (optional v2)
}
enum ExpenseCategory { // add FIVE members at the END (enum append = safe)
  …existing… bank_charges equipment entertainment donations fines
}
```

Migration SQL: `ALTER TABLE` adds nullable columns; `ALTER TYPE "ExpenseCategory" ADD VALUE 'bank_charges'; ADD VALUE 'equipment'; ADD VALUE 'entertainment'; ADD VALUE 'donations'; ADD VALUE 'fines';` (Postgres enum append is non-blocking; Prisma migrate handles it — verify no default-value rewrite occurs).

### 6.7 Expense validator tightening (GAP-5)

`expense.validator.ts`: when `category === 'other'`, `description` requires `.min(10, 'Please describe what this expense is for')`. **Deduction defaults (§4.3) enforced server-side:** `equipment`, `entertainment`, `donations`, `fines` create with `isDeductible: false` unless explicitly overridden; flipping `donations` to `true` requires a `receiptUrl` (or an explanatory note stored in the new `deductibilityNote` column). `isDeductible` remains user-overridable for every category — the server stays permissive but audit-logs every deductibility flip (already does via `expense.updated`). **No backfill needed:** new categories start with zero rows, and existing rows keep their stored `isDeductible` values.

---

## 7. Frontend Changes (file map)

| File                                                                             | Change                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/classification/ClassificationModal.tsx` _(new, shared)_ | The single guided picker: cards, reason field, live impact, locked-state. Used by Sales form, Sales list chip, TransactionDetailPanel, UnverifiedTransactions |
| `frontend/src/components/classification/useClassifications.ts` _(new)_           | Wraps `GET /transaction-classifications`, caches per session                                                                                                  |
| `frontend/src/pages/Sales.tsx`                                                   | 2-step "business income?" segmented control; classification field in create/edit payload; classification chip per row                                         |
| `frontend/src/pages/Expenses.tsx`                                                | Category cards + hints; "Other" detail expansion; explained deductibility toggle with ₦ impact; receipt nudge ≥ ₦50k                                          |
| `frontend/src/pages/TaxReports.tsx`                                              | "Nothing Hidden" breakdown card + Claims Review drawer + finalize acknowledgment step                                                                         |
| `frontend/src/components/TransactionDetailPanel.tsx`                             | Delete hardcoded `handleReclassify`; open shared modal instead                                                                                                |
| `frontend/src/pages/UnverifiedTransactions.tsx`                                  | Swap inline modal for shared `ClassificationModal`; keep queue behavior                                                                                       |
| `frontend/src/pages/SalesImportModal.tsx`                                        | Classification column awareness in preview (flag + per-row override later)                                                                                    |
| `frontend/src/types/index.ts`                                                    | `TransactionClassification`, `TaxBreakdown` types                                                                                                             |

## 8. Implementation Order (systematic, each step shippable)

| Phase                     | Deliverable                                                                                                                                      | Touches                                                | Effort    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------- |
| **P1 — Integrity**        | Unlock reclassify on confirmed sales; month-lock guard; `classificationNote`; reason required for non-taxable; seed upsert + new rows; migration | sales.service, sales.validator, schema+migration, seed | ~1 day    |
| **P2 — Transparency API** | `GET /tax/breakdown`; finalize acknowledgment                                                                                                    | tax.service/controller/routes                          | ~0.5 day  |
| **P3 — Shared UX**        | `ClassificationModal` + hook; wire Sales form, Sales list chips, TransactionDetailPanel, UnverifiedTransactions                                  | frontend (5 files)                                     | ~1.5 days |
| **P4 — Expense UX**       | Category cards, Other detail gate, explained toggle with impact, receipt nudge                                                                   | Expenses.tsx (+validator tweak)                        | ~1 day    |
| **P5 — Tax page**         | Nothing-Hidden card + Claims Review + finalize ack                                                                                               | TaxReports.tsx                                         | ~1 day    |
| **P6 — Import**           | Classification column in template/parser/commit                                                                                                  | sales-import lib/service                               | ~0.5 day  |
| **P7 — Guardrails**       | Extend margin alert to excluded-ratio; weekly "unclassified items" nudge via reminder system                                                     | tax.service, reminder.service                          | ~0.5 day  |

**Ship order matters:** P1+P2 (backend truth) → P3+P5 (the visible reform) → P4 → P6 → P7. Nothing in P3–P6 depends on unreleased backend pieces if built in this order.

## 9. Test Plan (acceptance criteria)

1. **Reclassify a confirmed manual sale** → works; audit row `sale.reclassified` with old+new+reason; `isTaxable` flips; dashboard/overview/tax recalc reflects it immediately (after recalculation).
2. **Non-taxable claim with a preset reason chip** → passes (reasonKey logged) + `classificationNote` persisted; `Something else` with a 9-char note → 400; 10+ → passes. The service layer merges `reasonKey` + `reason` into one audit payload.
3. **Reclassify inside a finalized month** → 423 `PERIOD_FINALIZED`; inside a paid (locked) month → 423 `PERIOD_LOCKED`.
4. **"Other" expense with a preset chip** → passes (no typing needed); a 9-char typed-only description → 400; 10+ chips/details → passes.
5. **Breakdown endpoint** totals reconcile exactly with `calculateTax` for the same month (property test: `moneyIn − excludedTotal === taxableSales` within ₦0.01).
6. **Finalize with claims and no acknowledgment** → 400 `CLAIMS_NOT_ACKNOWLEDGED`; with flag → passes + audit row.
7. **Import with unknown classification text** → preview flags row as revenue; commit stores unclassified-but-taxable.
8. **e2e:** extend `tests/e2e/api.e2e.test.ts` — journey: create manual sale → reclassify to loan (reason) → breakdown shows exclusion → finalize requires ack → paid month blocks reclassification.

## 10. Risks & Decisions

- **"Other" kept, not removed** — removal strands legitimate edge cases and pushes users to lie into the nearest bucket (worse than a gated Other). Decision: gated Other.
- **Reason minimums revised:** preset chips make non-taxable claims one-tap (no essay); only `Something else` needs a 10-char note. This is the friction-light calibration. If even the `Something else` note blocks legitimate users, drop to 8.
- **Existing unclassified rows** (all 55 today are `confirmed`+`isTaxable=true`) remain valid — default-taxable is our stated safe default. The Sales page chip ("Unclassified — counts as business income") makes this visible and one-click fixable, so no backfill migration is needed.
- **FIRS alignment**: the claims report (§5.4) is intentionally structured to export as CSV/PDF later — same data an auditor asks for. Direct FIRS API remains out of scope (unconfirmed path, per AGENTS.md).
- **The 7.5% formula is the product's simplification, deliberately untouched.** Nigeria's real regime is CIT (0%/20%/30% by turnover band) + VAT (7.5%) + CGT (10%) — this reform does **not** rewrite the formula; it makes the _inputs_ (taxable sales, deductible expenses) honest, evidenced, and visible. If FIRS product alignment changes the formula later, classification work carries over unchanged.
- **Not in scope:** SMS/email nudges, admin audit UI pages, receipt OCR. Phase-4 receipt enforcement is flagged, not built.

---

## Document History & Review Log

| Version | Change                                                                                                                                                                                                                                                                                                                   | Verified by                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| v1.0    | Initial plan: gaps GAP-1..9, threat model T1..T7, 7-phase build order                                                                                                                                                                                                                                                    | Codebase audit (schema, services, seed, frontend pages)                                                     |
| v1.1    | Hardening pass: §1.5 simplicity law + success metrics; §4.3 FIRS legal grounding; preset reason chips (replaces 15-char free text); corrected expense defaults (Equipment/Entertainment/Donations/Fines → OFF); added Interest/Savings + Rent/Property rows; gift ≥ ₦100k escalation; `reasonKey` threaded through §6/§9 | Adversarial self-review against the product criteria (workable / simple / FIRS / fintech / Nigerian market) |
| v1.2    | Consistency pass: fixed 3 contradictions (§3-T1 stale reason rule, §4.1 "only taxable rows" vs Rent/Property row, §9 test-item wording); added product-formula caveat to §10                                                                                                                                             | Full-document stale-reference scan — zero remaining                                                         |

**Final verdict (v1.2):** solid to build. Phase 1 is the integrity foundation; every later phase depends only on earlier phases.

---

_End of plan — implement Phase 1 first; every later phase builds on it._
