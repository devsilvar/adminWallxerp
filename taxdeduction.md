# Deductions & Solutions — Session Findings

**Date:** 2026-11-02
**Scope:** (1) why the tax-quiz configuration does not apply to each business, (2) corrections found while re-reviewing the multi-currency display plan.
**Method:** every claim below was read from the repository in this session. File:line references are real. Where something could not be verified it is marked **UNVERIFIED**.

---

# PART 1 — THE TAX CONFIG IS WRITTEN BUT NEVER READ

## 1.1 Executive summary

The 10-question quiz works. `evaluateTaxConfig()` produces a correct, well-structured `TaxProfileConfiguration`, it is stored per business in `business_tax_profiles.computed_config`, and it is displayed back in Settings. **No production code reads it.**

The proof is a three-line search: only three files in `backend/src` reference `businessTaxProfile` at all —

```
src/services/tax/tax-calculation-strategy.ts     ← the dispatcher
src/services/tax/tax-profile.service.ts          ← save/get the profile
src/scripts/migrate-to-profiled-calculation.ts   ← a one-off migration
```

And the dispatcher that would apply the profile (`calculateTaxWithStrategy`) has **exactly one caller in the entire repo: its own unit test**.

```
$ grep -rn "calculateTaxWithStrategy" src tests
src/services/tax/tax-calculation-strategy.ts:37:export async function calculateTaxWithStrategy(…
tests/unit/tax-calculation-strategy.test.ts:24:import { calculateTaxWithStrategy } …
tests/unit/tax-calculation-strategy.test.ts:42,61,79,96,116,148,180,216,250,285 (test calls)
```

So the feature is: *quiz → stored config → displayed in Settings → ignored everywhere money is decided.*

The consequences are not cosmetic. The number the user is asked to **pay** comes from the ignored path:

```
tax-report.service.ts:78      taxPayable = grossProfit * 7.5%      ← ignores profile
        ↓ stored on MonthlyTaxReport.taxPayable
tax-payment.service.ts:151    amount = report.taxPayable           ← charges that number
```

A VAT-exempt small company is invoicing 7.5% VAT it must not charge, and is paying a monthly "tax" computed as 7.5% of gross profit — which is neither VAT (VAT is on output, not profit) nor CIT (0%/30% on assessable profit).

---

## 1.2 What genuinely works (do not rebuild this)

| Component | Location | State |
|---|---|---|
| Quiz evaluation | `backend/src/shared/tax-quiz-engine.ts:17` `evaluateTaxConfig()` | Correct, deterministic, pure. Handles FTZ, legal structure, ₦25M VAT line, ₦100M/₦250M small-company test, professional/financial exclusion, agriculture holiday, export exemption, PAYE, WHT, CGT, manual-review flags |
| Config type | `backend/src/shared/tax-constants.ts:155` | Complete and matches the statute list |
| Statutory constants | `backend/src/shared/tax-constants.ts:11` | Verified against NTA 2025; VAT 7.5%, ₦25M VAT line, ₦100M/₦250M CIT test, 30% + 4% dev levy, PIT bands |
| Storage | `prisma/schema.prisma:1216` `BusinessTaxProfile` | Per business (`businessId @unique`), stores answers + config + review flags |
| Save/get service | `backend/src/services/tax/tax-profile.service.ts:13,36` | Permission-checked (`tax.read` / `settings.update`), audited, upsert |
| API | `backend/src/routes/tax-profile.routes.ts` | GET / POST / DELETE / obligation-report PDF |
| Profiled math | `backend/src/services/tax/tax-profiled-calculation.service.ts` | Implements the 5 scenarios — see §1.6 for the bugs inside it |
| Dispatcher | `backend/src/services/tax/tax-calculation-strategy.ts:37` | Correct shape, feature flag, legacy fallback — never called |

---

## 1.3 Root causes (ranked)

### RC-1 — Integration stopped after the quiz (the main cause)

Phase 1 (quiz + storage + display) shipped. Phase 2 (make the rest of the app obey the config) did not. Every calculation site still uses the legacy formula:

```
taxRate  = taxRateOverride ?? config.tax.defaultRate   // 7.5 from env
taxPayable = grossProfit * taxRate / 100
```

That formula is hard-coded in 9 places (§1.4). It has no concept of VAT-exemption, 0% CIT, FTZ, PIT bands, or annual vs monthly obligations.

### RC-2 — The legacy engine and the config model are different shapes

The config describes a **two-tax system**: VAT on sales (monthly) + CIT/PIT on annual profit (annual). The legacy engine produces **one flat number per month**. Wiring the dispatcher is therefore not a drop-in replacement — it changes what the product charges:

- profile present → `taxPayable` becomes **net VAT for the month** (`tax-profiled-calculation.service.ts:100,131,164`), while CIT/PIT move into `advisory` (`annualCitEstimate`, `annualPitEstimate`) and are **not collected monthly**.
- no profile → legacy flat 7.5% of gross profit, unchanged.

That is a product/revenue-model decision, not a refactor. It must be decided before any wiring, otherwise the payment flow silently changes amount semantics for profiled businesses. **This is the single most important thing to settle before code is written.**

### RC-3 — The data needed to compute VAT correctly does not exist

- `Invoice` has `vatRate` / `vatAmount` (`schema.prisma:439-440`) — good.
- `SalesTransaction` has **no VAT fields at all** (only `isTaxable`, `schema.prisma:206`), and `isTaxable` is hard-set to `true` everywhere (`invoice-crud.service.ts:824`, `credit.service.ts:128`, `dva-webhook.service.ts:513`), so it gates nothing.
- `Expense` has **no VAT field and no vendor TIN** (model at `schema.prisma:230`).

Consequence: input VAT and WHT cannot be computed from recorded data. The profiled calculation *invents* input VAT by extracting 7.5% from the total of every deductible expense — including salaries, which bear no VAT. The helper that knows this (`isVatBearingExpense`, `shared/helpers/tax.ts:29`, with `NON_VAT_EXPENSE_CATEGORIES` at `:10`) exists and is **never called**.

### RC-4 — The profile is a static opinion, never reconciled with reality

`annualTurnover` is a quiz answer (`UNDER_25M`, `M25M_TO_50M`, `M50M_TO_100M`, `ABOVE_100M`, `UNKNOWN`). It is never compared with actual recorded turnover. A business that crosses ₦25M keeps "VAT exempt" indefinitely, and one that drops below never gains it. There is no re-evaluation job, no warning at threshold, and no link between the profile and the numbers the app already knows.

### RC-5 — Config fields that promise features the app does not have

These are computed by the quiz, shown to the user in the obligation report, and have **no consumer in code**:

| Field | Consumed by | Meaning in the app |
|---|---|---|
| `mustDeductPAYE` / `mustSplitPAYEByState` | obligation PDF only (`pdf/tax-obligation-report.ts:178-181`) | No payroll module exists |
| `mustDeductWHT` / `whtTransactionExemptionLimit` / `enableWHTCreditTracking` | obligation PDF only (`:186-189`) | `evaluateWhtOnPayment()` (`helpers/tax.ts:113`) is **never called** |
| `cgtTreatment` | obligation PDF | No capital-gains tracking |
| `hasExportExemption` / `hasAgricultureHoliday` | obligation PDF | No effect on any calculation |
| `requiresNilReturns` / `filingDeadline` | obligation PDF | Nil returns are derived from `totalSales === 0` instead (`tax-report.service.ts:313`) |
| `devLevyRate` | profiled calc only | Dead with the dispatcher |

`computeRentRelief()` (`helpers/tax.ts:158`) is also never called.

So the profile is **advisory in the UI and absent in the ledger** — which is exactly the user-visible symptom: "the config is not applying to each business".

---

## 1.4 Complete inventory of enforcement gaps

### A. Tax calculation sites (all profile-blind)

| # | File:line | Function | Current code | Impact |
|---|---|---|---|---|
| 1 | `tax/tax-report.service.ts:68-78` | `calculateTax` | `taxRate = override ?? config.tax.defaultRate` → `grossProfit * rate / 100` | **The amount stored and later charged** |
| 2 | `tax/tax-report.service.ts:316-317` | `calculateAllMonthlyReports` | same | Backfill / batch recalc |
| 3 | `tax/tax-report.service.ts:396-397` | `calculateYearlyReports` | same | Year-end figures |
| 4 | `tax/tax-report.service.ts:447-448` | `recalculateAllReports` | same | Admin recalc |
| 5 | `tax/tax-analytics.service.ts:134` | `getDashboard` (live recompute of an unlocked report) | `grossProfit * rate / 100` | Dashboard "this month" card |
| 6 | `tax/tax-analytics.service.ts:151` | `getDashboard` (draft preview, no report yet) | `grossProfit * defaultRate / 100` | Dashboard before first calculation |
| 7 | `tax/tax-analytics.service.ts:168` | `getDashboard` → `taxConfig.currentRate` | exposes `config.tax.defaultRate` to the UI | Frontend labels the rate as 7.5% unconditionally |
| 8 | `documents/statement.service.ts:498-502` | `getPnlStatementData` | `grossProfit * taxRate / 100` | P&L PDF |
| 9 | `settlement/payout-preview.service.ts:235` | `getPayoutPreview` | `grossProfit * 0.075` | Tax reserve held back from a payout |
| 10 | `ai/ai-context.service.ts:322,351` | AI context builder | `grossProfit * taxRate / 100` | AI gives the user wrong tax advice |
| 11 | `tax/tax-report.service.ts:243` | `finalizeReport` | stores whatever the above produced, then **locks** it | The legally-binding, immutable number |

### B. Invoice VAT (the user's example)

| Layer | File:line | What happens |
|---|---|---|
| Zod schema (create) | `validators/invoice.validator.ts:25` | `vatRate: z.number().min(0).max(100).default(7.5)` — **the default is applied before the service sees it**, so "user omitted" and "user chose 7.5" are indistinguishable |
| Service (create) | `invoice/invoice-crud.service.ts:152` | `const vatRate = input.vatRate ?? 7.5;` (the `?? 7.5` is dead code because of the schema default) |
| Service (update) | `invoice/invoice-crud.service.ts:383-405` | any `vatRate` 0-100 accepted, no profile guard |
| Totals | `invoice/invoice-crud.service.ts:107` | `vatAmount = taxable * vatRate / 100`, `total = taxable + vatAmount` |
| Revenue booking | `invoice/invoice-crud.service.ts:824` | `markInvoicePaid` books `invoice.total` (VAT-inclusive) as a sale with `isTaxable: true` |
| Frontend form | `frontend/src/pages/InvoiceForm.tsx:132` | `useState('7.5')` — every business, every invoice, starts at 7.5% |
| Frontend form UI | `frontend/src/pages/InvoiceForm.tsx:431` | free-text VAT rate field, `min=0 max=100`, always editable |
| Frontend totals | `frontend/src/pages/InvoiceForm.tsx:183-195` | mirrors the backend formula |
| PDF | `services/pdf/invoice.pdf.ts:405-422` | prints the stored VAT line |
| Receipt | `documents/receipt.service.ts:238-261` | prints the stored VAT |
| Frontend display | `frontend/src/pages/InvoiceDetail.tsx:518` | `VAT ({inv.vatRate}%)` |

**Net effect:** a business that answered "under ₦25M" still gets a 7.5% VAT field pre-filled, an invoice with VAT added, a customer charged that VAT, and a PDF that asserts the VAT. The config says `vatExempt: true, mustChargeVat: false` and nothing anywhere reads it.

### C. Hard-coded "7.5%" user-facing copy

These tell the user the flat rate is their obligation, regardless of profile:

- `frontend/src/pages/Dashboard.tsx:1348` — `7.5%`
- `frontend/src/pages/TaxReports.tsx:810` — `Tax (7.5%)`
- `frontend/src/pages/TaxReports.tsx:973` — `7.5% on Gross Profit`
- `frontend/src/components/FinalizeConfirmationModal.tsx:298` — `Tax Payable (7.5%)`
- `frontend/src/components/PaymentConfirmationModal.tsx:191` — `7.50%`
- `frontend/src/components/layout/AuthLayout.tsx:71` — "Official NRS 7.5% Tax Engine"

### D. Profile-change and review flows

- `needsManualReview` / `reviewReasons` are stored (`tax-profile.service.ts:58,66`) and **never acted on** — no queue, no admin surface, no UI warning.
- Re-taking the quiz silently replaces the config; no recalculation of existing reports, no audit of "what changed", no lock. `saveTaxProfile` audits the new answers (`:72-79`) but not the diff.
- `migrate-to-profiled-calculation.ts:55-56` creates profiles with `computedConfig: {}` and `completedAt: null` and `needsManualReview: true` — harmless today only because the dispatcher is never called.

---

## 1.5 Additional defects found (beyond the previous analysis doc)

1. **The Zod default defeats the service default.** Any fix that only changes `invoice-crud.service.ts:152` will do nothing, because `input.vatRate` is always defined by `invoice.validator.ts:25`. The schema default must be removed (`.optional()`) for the profile to be able to supply it.
2. **`updateInvoice` has no VAT guard at all** — an exempt business can create a compliant 0% invoice and then edit it to 7.5% (`invoice-crud.service.ts:383-405`).
3. **The payment amount is derived from the wrong number** (`tax-payment.service.ts:151`) — this is the highest-severity path and it was not in the previous doc.
4. **Finalisation locks the wrong number** (`tax-report.service.ts:243`) — once locked, correcting it requires an unlock/amend flow.
5. **Contradictory config for "UNKNOWN" turnover.** In `evaluateTaxConfig` (`shared/tax-quiz-engine.ts:75-87`) the `UNKNOWN` branch sets neither `vatExempt` nor `mustChargeVat`, leaving the defaults `vatExempt: false` (→ charge VAT) **and** `mustChargeVat: false` (→ don't charge). Two consumers reading different fields will disagree. Needs a single authoritative field (see §1.7).
6. **VAT is extracted from totals that were never VAT-inclusive.** `calculateProfiledTax` calls `extractVatFromInclusive(sales, 7.5)` (`tax-profiled-calculation.service.ts:95,122,157`). Sales rows carry no VAT; only invoice rows do. Cash sales and imports (no invoice) would be treated as if they carried VAT, and exempt businesses would have VAT invented for them.
7. **Input VAT is claimed on salaries.** Same lines: `extractVatFromInclusive(expenses, 7.5)` ignores `isVatBearingExpense` / `NON_VAT_EXPENSE_CATEGORIES`. Salary, depreciation, bank charges and fines would all generate input-VAT credits.
8. **Empty config silently becomes 7.5%.** `calculateProfiledTax` falls through every scenario to `(grossProfit * 7.5) / 100` (`:185`). A profile with `completedAt` set and `computedConfig: {}` would therefore look "profiled" and produce the legacy number with none of the legacy warnings.
9. **Duplicated quiz engine.** `frontend/src/lib/tax-quiz-engine.ts` is byte-identical to `backend/src/shared/tax-quiz-engine.ts` **today** (verified with `diff`, exit 0) and `tax-constants.ts` is duplicated too. The backend re-evaluates on save (`tax-profile.service.ts:48`), so the frontend copy is display-only — but the next statute change will drift one of them silently.
10. **The feature flag is a trap.** `config.tax.useProfiledCalculation` defaults to `true` (`config/index.ts:239`). The moment someone wires the dispatcher, every business with a completed profile switches calculation model in one deploy, with no rollout control.
11. **16 test files / 49 assertions encode the 7.5% behaviour** (`tests/**`). They are not wrong — they assert current behaviour — but any wiring of the profile must be accompanied by profile-aware tests, or the suite will contradict the feature.

---

## 1.6 What "applying the config" must actually mean

The config cannot be enforced by patching one function. It needs one resolver and a small number of enforcement points.

### 1.6.1 One server-side resolver (the missing piece)

```ts
// backend/src/services/tax/tax-policy.service.ts  (new)
export interface BusinessTaxPolicy {
  source: 'PROFILE' | 'DEFAULT';      // DEFAULT = no completed profile
  vat: {
    chargeable: boolean;              // single source of truth — replaces vatExempt/mustChargeVat ambiguity
    rate: number;                     // 7.5 or 0
    reason: string;                   // for UI copy + audit
  };
  incomeTax: { type: 'CIT' | 'PIT'; rate: 0 | 30; devLevyRate: 0 | 4 };
  exemptions: { ftz: boolean; agriculture: boolean; export: boolean };
  obligations: { paye: boolean; wht: boolean; nilReturns: boolean };
  flags: { needsManualReview: boolean; reviewReasons: string[] };
}

export async function resolveTaxPolicy(businessId: string): Promise<BusinessTaxPolicy>;
```

Rules:
- Reads `business_tax_profiles` once per request (cache per request, not per process — profiles change).
- No completed profile → `source: 'DEFAULT'` with the current behaviour, so nothing breaks for un-quizzed businesses.
- `chargeable` is computed once, from `!vatExempt && mustChargeVat`, so the "UNKNOWN" contradiction cannot leak into consumers.
- **Optional but recommended:** reconcile `annualTurnover` answer against actual trailing-12-month turnover and, when they disagree across a threshold, set `needsManualReview` + a review reason. That turns a static opinion into a self-checking one.

### 1.6.2 Enforcement points (and nothing else)

| Where | Change | Why |
|---|---|---|
| Invoice create | `vatRate` comes from the policy unless the caller is an explicit admin override | Stops exempt businesses charging VAT |
| Invoice update | same guard | Closes the edit loophole |
| Invoice validator | drop `.default(7.5)`; make it `.optional()` | Lets the server decide |
| Sales create (from invoice) | store the invoice's VAT split, not just `total` | Makes output VAT derivable instead of invented |
| Expense create | add optional `vatAmount` + `vendorTin` | Makes input VAT and WHT derivable |
| `calculateTax` + the 3 batch functions | call `calculateTaxWithStrategy` | Single calculation path |
| Dashboard/analytics preview | same strategy call | Preview matches the real number |
| P&L statement | read the report (already does when one exists) and use the policy when it does not | Consistency |
| Payout preview | policy-driven reserve | Stop holding 7.5% of profit from exempt businesses |
| AI context | policy-driven | Stop advising the wrong rate |
| Frontend invoice form | fetch policy with the business, default the field, disable it when not chargeable | The user's stated requirement |

### 1.6.3 Deliberately out of scope (for now)

PAYE, WHT remittance, CGT and nil-return filing have **no underlying feature** in the app. The honest options are (a) remove those fields from the user-facing report until the features exist, or (b) label them "advisory — no in-app workflow". Wiring them is a new product, not a fix.

---

## 1.7 Suggested implementation order

**Phase 0 — decide the money model (no code).** When a profile exists, does the monthly "Tax Payment" collect **net VAT only** (with CIT/PIT shown as an annual provision, not charged monthly)? This is the RC-2 decision and everything else depends on it.

**Phase 1 — the resolver.** `resolveTaxPolicy()` + unit tests. No behaviour change yet (nothing calls it).

**Phase 2 — invoices (the user's example, highest visible value).**
- Remove the validator default; derive `vatRate` server-side from the policy.
- Guard `updateInvoice`.
- Expose the policy on `GET /businesses/:id/tax-profile` (or a light `GET /businesses/:id/tax-policy`) and have `InvoiceForm` default to it, showing a locked `0% — VAT exempt` state when not chargeable.
- Invoice PDF/receipt need no change (they read the stored VAT) — but verify an exempt invoice prints no VAT line.

**Phase 3 — calculations.** Replace the 9 legacy sites with `calculateTaxWithStrategy`. Gate behind the existing flag, default it **off** until Phase 0's decision is reflected in the payment flow, then turn it on per environment.

**Phase 4 — data model for real VAT.** `Expense.vatAmount` + `Expense.vendorTin`, `SalesTransaction.vatAmount` (or derive from the linked invoice). Switch the profiled calc from "extract 7.5% from totals" to "sum recorded VAT". Until then, keep the extraction but **exclude non-VAT expense categories** using the already-written `isVatBearingExpense`.

**Phase 5 — review queue.** Surface `needsManualReview`, log profile diffs, and recalculate unlocked reports when a profile changes.

---

## 1.8 Test matrix (for the tests you said you want to write)

Every row below fails today.

| # | Scenario | Expected | Current |
|---|---|---|---|
| 1 | Profile `UNDER_25M` + `LLC` → create invoice with no `vatRate` | `vatRate = 0`, `vatAmount = 0`, `total = subtotal` | 7.5% applied |
| 2 | Same profile → `PATCH` invoice to `vatRate = 7.5` | 400/403 with a clear code | accepted |
| 3 | Same profile → invoice PDF | no VAT line | VAT line printed |
| 4 | Profile `ABOVE_100M` + `LLC` → invoice with no `vatRate` | `vatRate = 7.5` | 7.5 (passes by accident) |
| 5 | Profile FTZ → invoice | `vatRate = 0` | 7.5% |
| 6 | Profile `UNDER_25M` → `calculateTax` | `taxPayable = 0` | `grossProfit * 7.5%` |
| 7 | Profile `M50M_TO_100M` (VAT-charging, 0% CIT) → `calculateTax` | `taxPayable = net VAT` | flat 7.5% of profit |
| 8 | Profile `ABOVE_100M` → `calculateTax` | monthly = net VAT; `annualCitEstimate = 30% + 4%` in advisory | flat 7.5% |
| 9 | Profile PIT (sole proprietor) | monthly = net VAT; PIT bands in advisory | flat 7.5% |
| 10 | No profile → `calculateTax` | legacy number, unchanged | legacy (passes) |
| 11 | Profile with `computedConfig: {}` and `completedAt` set | explicit `needsManualReview`, not a silent 7.5% | silent 7.5% |
| 12 | `UNKNOWN` turnover | one unambiguous `chargeable` value | `vatExempt: false` + `mustChargeVat: false` |
| 13 | Exempt business → payout preview | reserve = 0 | 7.5% of profit |
| 14 | Exempt business → dashboard | no "7.5%" copy, no VAT card | 7.5% everywhere |
| 15 | Salary-only expenses + VAT-charging profile | input VAT excludes salary | 7.5% extracted from salary |
| 16 | Profile changed after a report exists | unlocked report recalculated / flagged; locked report untouched | nothing happens |

Test helper worth adding: a factory that seeds `businessTaxProfile` per scenario, so each test is one line of setup.

---

## 1.9 Answers to the open questions in the previous version of this doc

1. **Recalculate historical reports?** No — recalculate only unlocked reports, and mark locked ones with a "computed under previous rules" flag. Never silently rewrite a filed number.
2. **Manual VAT override for exempt businesses?** Only as an explicit admin action with an audit entry; the merchant must not be able to do it.
3. **Invoices created before profile completion?** Leave them; they were issued under the old assumption and are legal records. Apply the policy going forward.
4. **Can a business retake the quiz?** Yes, but version the profile (`updatedAt` + audit diff) and require confirmation when the VAT/CIT outcome changes.
5. **Staging?** **UNVERIFIED** — not determined from the repo.

---

# PART 2 — MULTI-CURRENCY PLAN CORRECTIONS (same session)

While re-reviewing `prompts/currency-switcher-plan.reviewed.md` the following was found and corrected in that file (v4). Summarised here because it is the same class of bug as Part 1: *a stored preference that nothing consumes*.

1. **The reactivity mechanism was wrong.** The plan assumed one `useCurrencyStore` subscription in `AppLayout` would re-render the routed page. It does not: React bails out when the child element object is unchanged, and React Router's `<Outlet />` returns a memoised element. Reproduced twice (bare tree and real `createMemoryRouter` + `Outlet`) → `RENDERS 1 1 NGN`. Fix: `useDisplayCurrency()` in every component that formats money, plus a source-scan test that fails if one is missing.
2. **Provider used `axios`, which is only a devDependency** in `backend/package.json`. Fix: `fetch` + `AbortController`, matching `paystack.provider.ts` / `kudisms.client.ts`.
3. **The overlay keyed off `loading`**, which is also set by the mount-time prefetch → the whole app would be veiled on cold load. Fix: a separate `switching` flag.
4. **"2 decimals matches the dashboard" was false** — `Dashboard.tsx:120` uses `minimumFractionDigits: 0`. The sweep changes ~15 pages' formatting; now stated as a visible change.
5. **EUR had been dropped** although the brief lists five currencies. Restored.
6. **Five NGN-primary files import `formatNaira`** (`PaymentConfirmationModal`, `PayoutWithdrawalModal`, `FinalizeConfirmationModal`, `PaymentCallback`, `public/VerifyVoucher`) and would have silently converted payment, withdrawal and legal figures. They must use `formatNgn`.

---

# PART 3 — VERIFICATION NOTES

**Verified in this session (read from source):** every file:line in Part 1; the `calculateTaxWithStrategy` call-site search; the `businessTaxProfile` reference search; the absence of VAT/TIN fields on `Expense`; `Invoice.vatRate` default 7.5 in both the schema and the Zod validator; `tax-payment.service.ts:151` charging `report.taxPayable`; `finalizeReport` locking the computed value; the two React bail-out experiments in Part 2.

**Assumed, not verified:** that the product intends to collect VAT monthly and CIT annually (this is what `calculateProfiledTax` models, but it is a product decision, not a code fact); that no other deployment branch contains a wired dispatcher (only `main` was inspected).

**Not investigated in this session:** `taxindemnify.md` / the indemnity flow, `TAX_FINALIZATION.md` end-to-end, marketplace VAT, and the admin portal's view of merchant tax.
