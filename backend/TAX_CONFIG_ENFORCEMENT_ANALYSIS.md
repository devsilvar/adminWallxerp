# Tax Configuration Enforcement Analysis

**Version:** 2 (re-verified against source, 2026-11-02)
**Companion document:** `../taxdeduction.md` — full findings, solutions and test matrix.
**Status:** analysis only. No code has been changed.

---

## Executive Summary

The tax quiz works end to end **up to the point of storage**. `evaluateTaxConfig()` produces a correct `TaxProfileConfiguration`, it is persisted per business, and it is rendered back in Settings and in the obligation-report PDF. **No money-deciding code path reads it.**

Two searches prove it:

```
$ grep -rln "businessTaxProfile" src
src/services/tax/tax-calculation-strategy.ts
src/services/tax/tax-profile.service.ts
src/scripts/migrate-to-profiled-calculation.ts

$ grep -rn "calculateTaxWithStrategy" src tests
src/services/tax/tax-calculation-strategy.ts:37   ← definition
tests/unit/tax-calculation-strategy.test.ts:*     ← the only callers in the repo
```

The strategy dispatcher has **no production caller**. Every calculation site still runs the legacy formula `grossProfit × 7.5%`, and the number it produces is what the merchant is asked to pay (`payment/tax-payment.service.ts:151`) and what finalisation locks (`tax/tax-report.service.ts:243`).

**Business impact**

- A business that answered "under ₦25M" still gets a 7.5% VAT field on every invoice (`validators/invoice.validator.ts:25`, `services/invoice/invoice-crud.service.ts:152`, `frontend/src/pages/InvoiceForm.tsx:132`), and the VAT is charged to its customers and printed on the PDF.
- That same business is billed a monthly "tax" equal to 7.5% of gross profit, which is neither VAT (VAT is on output, not profit) nor CIT (0%/30% on assessable profit).
- FTZ, agriculture-holiday, 0% CIT and PIT profiles all produce the identical flat number.

**Root cause**

Phase 1 (quiz + storage + display) shipped; Phase 2 (make the app obey the config) never started. The blocking question is not technical: the config models **VAT monthly + CIT/PIT annually**, while the legacy engine produces **one flat monthly number**. Wiring the dispatcher therefore changes what the product charges (see "Blocking decision" below).

---

## What is correct and should not be rebuilt

| Component | Location | Note |
|---|---|---|
| Quiz evaluation | `src/shared/tax-quiz-engine.ts:17` | Correct, pure, covers FTZ / structure / VAT line / small-company test / exclusions / PAYE / WHT / CGT / review flags |
| Config type | `src/shared/tax-constants.ts:155` | Matches the statute list |
| Statutory constants | `src/shared/tax-constants.ts:11` | NTA 2025 figures, VAT 7.5%, ₦25M, ₦100M/₦250M, 30% + 4%, PIT bands |
| Storage | `prisma/schema.prisma:1216` | `businessId @unique`, answers + config + review flags |
| Profile service | `src/services/tax/tax-profile.service.ts:13,36` | Permission-checked, audited, upsert |
| API | `src/routes/tax-profile.routes.ts` | GET / POST / DELETE / PDF |
| Profiled math | `src/services/tax/tax-profiled-calculation.service.ts` | Implements all 5 scenarios — but see the defects below |
| Dispatcher | `src/services/tax/tax-calculation-strategy.ts:37` | Correct shape + feature flag + legacy fallback |

---

## Blocking decision (must be made before wiring)

`calculateProfiledTax` returns **net VAT for the month** as `taxPayable` and moves CIT/PIT into `advisory` (`tax-profiled-calculation.service.ts:100,131,164`). The legacy engine returns **7.5% of gross profit**. These are different products.

> **Decision needed:** when a profile exists, does the monthly tax payment collect net VAT only, with CIT/PIT shown as an annual provision (not charged monthly)? If yes, the dispatcher can be wired. If no, the profiled calculation must be reshaped first.

---

## Every enforcement gap (verified)

### 1. Tax calculation sites — all profile-blind

| # | File:line | Function | Current | Consequence |
|---|---|---|---|---|
| 1 | `tax/tax-report.service.ts:68-78` | `calculateTax` | `grossProfit × rate` | **The amount stored, then charged** |
| 2 | `tax/tax-report.service.ts:316-317` | `calculateAllMonthlyReports` | same | Batch recalc |
| 3 | `tax/tax-report.service.ts:396-397` | `calculateYearlyReports` | same | Year-end |
| 4 | `tax/tax-report.service.ts:447-448` | `recalculateAllReports` | same | Admin recalc |
| 5 | `tax/tax-analytics.service.ts:134` | `getDashboard` unlocked report | same | Dashboard card |
| 6 | `tax/tax-analytics.service.ts:151` | `getDashboard` draft preview | same | Dashboard before first calc |
| 7 | `tax/tax-analytics.service.ts:168` | `taxConfig.currentRate` | exposes env 7.5 to UI | UI labels the rate unconditionally |
| 8 | `documents/statement.service.ts:498-502` | `getPnlStatementData` | same | P&L PDF |
| 9 | `settlement/payout-preview.service.ts:235` | `getPayoutPreview` | `grossProfit × 0.075` | Tax reserve withheld from payouts |
| 10 | `ai/ai-context.service.ts:322,351` | AI context | same | Wrong AI advice |
| 11 | `tax/tax-report.service.ts:243` | `finalizeReport` | locks the value from #1 | Immutable, filed number |

### 2. Invoice VAT

| Layer | File:line | Behaviour |
|---|---|---|
| Validator (create) | `validators/invoice.validator.ts:25` | `.default(7.5)` — **applied before the service runs**, so omission cannot be detected |
| Service (create) | `invoice/invoice-crud.service.ts:152` | `input.vatRate ?? 7.5` (the fallback is dead code) |
| Service (update) | `invoice/invoice-crud.service.ts:383-405` | any 0-100 accepted, no guard |
| Totals | `invoice/invoice-crud.service.ts:107` | `vatAmount = taxable × rate`, `total = taxable + vat` |
| Revenue booking | `invoice/invoice-crud.service.ts:824` | books VAT-inclusive `total` as a sale, `isTaxable: true` |
| Frontend | `frontend/src/pages/InvoiceForm.tsx:132,431` | `useState('7.5')`, free-text field |
| PDF / receipt | `pdf/invoice.pdf.ts:405-422`, `documents/receipt.service.ts:238-261` | print the stored VAT |

> The previous version of this document proposed changing only `invoice-crud.service.ts:152`. **That alone would not work** — the Zod default means `input.vatRate` is never `undefined`.

### 3. Config fields with no consumer

`mustDeductPAYE`, `mustSplitPAYEByState`, `mustDeductWHT`, `whtTransactionExemptionLimit`, `enableWHTCreditTracking`, `cgtTreatment`, `hasExportExemption`, `hasAgricultureHoliday`, `requiresNilReturns`, `filingDeadline` are read only by `services/pdf/tax-obligation-report.ts`. No payroll, WHT or CGT feature exists, and `evaluateWhtOnPayment()` (`shared/helpers/tax.ts:113`) and `computeRentRelief()` (`:158`) are never called.

### 4. Review flags

`needsManualReview` / `reviewReasons` are written (`tax-profile.service.ts:58,66`) and never read by any workflow. There is no queue, no admin surface, no UI warning.

---

## Defects inside the "ready" profiled calculation

1. **Input VAT on non-VAT expenses.** `tax-profiled-calculation.service.ts:96,123,158` extracts 7.5% from *all* deductible expenses, including salaries, depreciation and bank charges. `isVatBearingExpense()` + `NON_VAT_EXPENSE_CATEGORIES` (`shared/helpers/tax.ts:10,29`) exist precisely for this and are unused.
2. **Output VAT invented from totals.** `extractVatFromInclusive(sales, 7.5)` assumes every sale was VAT-inclusive. Sales rows carry no VAT (`SalesTransaction` has only `isTaxable`, `schema.prisma:206`); only invoices do.
3. **Empty config becomes 7.5% silently.** The fallthrough at `:185` returns the legacy number for a profile with `completedAt` set and `computedConfig: {}` — i.e. it *looks* profiled while behaving legacy.
4. **Contradictory flags for `UNKNOWN` turnover.** `shared/tax-quiz-engine.ts:75-87` leaves `vatExempt: false` and `mustChargeVat: false` together. Two consumers can read different answers.
5. **Profile never reconciled with reality.** `annualTurnover` is a quiz answer that is never compared with recorded turnover; a business that crosses ₦25M keeps its exemption indefinitely.

---

## Feature flag

`config/index.ts:239` — `useProfiledCalculation: process.env.TAX_USE_PROFILED_CALCULATION !== 'false'` (default **true**). Because nothing calls the dispatcher the flag is inert today; the moment the dispatcher is wired, every business with a completed profile changes calculation model in one deploy. Wire it, but ship it **off** and enable per environment.

---

## Recommended fix (see `../taxdeduction.md` §1.6–1.8 for detail)

1. **`resolveTaxPolicy(businessId)`** — one server-side resolver returning a single unambiguous `vat.chargeable` (kills the `vatExempt`/`mustChargeVat` contradiction), plus income-tax, exemptions and obligations. No profile → `source: 'DEFAULT'` (current behaviour).
2. **Invoices** — drop the Zod default, derive `vatRate` from the policy, guard `updateInvoice`, expose the policy to the frontend so the form defaults correctly and locks when not chargeable.
3. **Calculations** — route all 11 sites through `calculateTaxWithStrategy`, flag off by default.
4. **Data model** — add `Expense.vatAmount` + `Expense.vendorTin` and a VAT split on sales before trusting VAT figures; until then exclude non-VAT categories.
5. **Review queue** — surface `needsManualReview`, audit profile diffs, recalculate unlocked reports on profile change.

---

## Testing

`../taxdeduction.md` §1.8 lists 16 concrete cases, each of which fails today. The ones that matter most:

- `UNDER_25M` + LLC → invoice with no `vatRate` ⇒ 0% and no VAT on the PDF.
- Same profile → `PATCH vatRate: 7.5` ⇒ rejected.
- Same profile → `calculateTax` ⇒ `taxPayable = 0`.
- `ABOVE_100M` ⇒ monthly net VAT, annual CIT + dev levy in advisory.
- No profile ⇒ legacy number unchanged.
- `computedConfig: {}` + `completedAt` ⇒ explicit manual review, not a silent 7.5%.

Note: 16 existing test files (49 assertions) encode the 7.5% behaviour. They assert current behaviour and must be updated alongside any wiring, not deleted.

---

## What changed in this version

| Previous version | Correction |
|---|---|
| "9 calculation sites" | 11 (adds `tax-payment.service.ts:151` — the charged amount — and `finalizeReport:243` — the locked one) |
| Fix proposed only in `invoice-crud.service.ts:152` | Insufficient: `validators/invoice.validator.ts:25` defaults `vatRate` to 7.5 before the service sees it |
| Did not mention `updateInvoice` | It has no VAT guard at all |
| Presented the profiled calculation as fully correct | Four defects inside it (input VAT on salaries, VAT invented from totals, silent 7.5% fallthrough, contradictory `UNKNOWN` flags) |
| Did not question the money model | Blocking decision: profiled path charges net VAT monthly, not 7.5% of profit |
| Did not mention data-model gaps | `Expense` has no VAT or TIN field, so input VAT and WHT are not derivable |

---

**Last Updated:** 2026-11-02 · analysis complete, no code changed
