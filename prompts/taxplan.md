# Tax Profile Quiz — Corrected Execution-Ready Implementation Plan

### 15-Step Business Onboarding Quiz for Nigerian Tax Classification

> **Status:** REVISED 2026-10-06 → CORRECTED 2026-10-14 after law-firm web verification (PwC Tax Summaries 29 May 2026, Deloitte, Mondaq/TEMPLARS).
> Initial `rereviewplan.md` pass + `taxquestionupdate.md` Q1–Q10, then **online cross-check 2026-10-14** corrected small-company turnover **₦50M → ₦100M** (final gazetted Act, initial ₦50M was drafting error) and upgraded presumptive from UNVERIFIED → secondary-verified (₦12M/1% informal-sector flag).
> **Supersedes** the prior draft entirely. All statutory figures below are sourced; remaining open list (Q5 professional-services SIC) stays `REVIEW_REQUIRED` by design.

---

## 1. Executive Verdict

**🟡 REQUIRES SIGNIFICANT REVISION** (prior draft) → **revised plan below is APPROVED for
implementation** subject to the two remaining UNVERIFIED items (Q5 professional-services
exclusion list, Q6 presumptive/nano thresholds), which ship as flagged review-queue defaults,
not as hard-coded rules.

**What the research resolved that the old plan got wrong:**

| Figure | Old plan (taxlaw.md / taxupdate.md) | Confirmed (taxquestionupdate.md) |
|---|---|---|
| VAT small-business threshold | ₦50M (taxlaw) / ₦100M (taxplan draft) | **₦25,000,000** — no asset test |
| Small-company CIT threshold | ₦100M | **₦50,000,000** (+ ₦250M asset test, per taxlaw.md, not re-verified) |
| PIT bands | "7% to 25%" (taxlaw) vs 15/18/21/23/25 table (taxupdate) | **Confirmed taxupdate table**: 0% / 15% / 18% / 21% / 23% / 25% |
| CGT on digital assets | 10% special rate (taxupdate) | **No special rate** — individuals progressive 0–25%, companies generally 30% |
| WHT-agent threshold | ₦25M (taxupdate) | **Does not exist** — replace boolean with transaction-level rule |
| Small-company WHT floor | "no WHT below ₦2M if turnover < ₦50M" (taxlaw) | ₦2M floor, but **only** for qualifying small company **and** vendor with valid TIN |
| MNM Nigerian trigger | ₦50 billion (taxlaw) | **₦20 billion** domestic; €750M global; alternative predicates |
| Startup holiday | 3+2 years (taxupdate) / 5yr ag (taxlaw) | **5-year, agriculture only** — not universal |
| Presumptive/nano | ₦12M / 1% (taxlaw) | **UNVERIFIED — do not hard-code** |

---

## 2. What Was Wrong With The Old Plan

1. **Statutory errors baked into the quiz engine.** The old Q4 turnover brackets
   (`UNDER_25M / 25M–50M / ABOVE_50M`) could not express the real boundaries. Worse, the plan
   hard-coded VAT exemption at ₦100M and small-co CIT at ₦100M — both wrong. A ₦30M LLC would
   have been told it was VAT-exempt (it is not, threshold is ₦25M) and a ₦60M LLC would have
   been told it was 0% CIT (it is not, threshold is ₦50M).
2. **Missing regimes.** No presumptive/nano flag, no nil-return obligation, no rent relief,
   no MNM predicates, no agricultural-holiday flag, no transaction-level WHT rule.
3. **Internal contradictions.** Addendum B (`taxPayable = VAT + CIT provisions`) vs Addendum D
   (only `vatPayable` paid) — unresolved. B's `inputVat = expenses × 7.5%` vs C's `× 7.5/107.5`
   — inconsistent. C used `isDeductible` as VAT-bearing proxy — overstates input VAT.
4. **Wrong file targets.** Test paths (`src/shared/__tests__/` → never runs; jest `roots` is
   `<rootDir>/tests`). Route mount would produce `/tax/tax-profile`. `shared/helpers/tax.ts`
   doesn't exist. `sales-crud.service.ts` doesn't exist. QUIZ-22/23/26/31 scopes were too narrow.
5. **Legacy fallback trap.** "Hardcode 0.075" ignores `config.tax.defaultRate` (env-overridable).
6. **PDF emoji.** PDFKit fonts have no emoji glyphs — ✅/❌/⚠️ would render as tofu.

---

## 3. What Changed

- **Single `STATUTORY` constants block** at the top of the shared engine, every constant annotated
  with its source citation (`taxquestionupdate.md` Q-ref + NTA/NTAA section). Nothing inline.
- **Q4 turnover question rebuilt** to 4 brackets matching confirmed thresholds, plus a separate
  presumptive/nano review flag (UNVERIFIED, not a hard bracket).
- **Q2 exclusion list corrected** — removed "Tech/Software Studio" (not an excluded category);
  professional-services exclusion ships as `REVIEW_REQUIRED` review-queue flag, not a blanket rule.
- **`taxPayable = vatPayable`** for profiled businesses. CIT/DevLevy/PIT provisions stored as
  **advisory non-payable columns** on the report, surfaced in the obligation PDF, settled only at
  annual filing. Resolves the B-vs-D contradiction.
- **Input VAT** = `gross ÷ 107.5 × 7.5` (extract VAT from VAT-inclusive amount), with a category
  exclusion list (`depreciation`, `bad_debt`, salaries/wages, penalties, interest) — not `isDeductible`.
- **CIT base for VAT collectors** = net revenue (sales − output VAT) − net expenses (excl. input VAT).
- **Legacy fallback** passes `config.tax.defaultRate` as a parameter; bit-exact reproduction of old
  numbers enforced by an existing-test suite, not by hardcoding 0.075.
- **WHT** modeled as a transaction-level rule (payer type × payment category × vendor TIN status ×
  small-company exemption), replacing the unsafe `isWhtAgent` boolean.
- **File targets corrected** throughout (see §5). Test paths moved to `backend/tests/unit/` and
  `backend/tests/e2e/`. New `tax-profile.routes.ts` mounted at `/businesses/:businessId/tax-profile`.
- **`TaxPayment.taxReportId`** becomes nullable; add `annualTaxReportId` for annual settlements.
- **PDF** uses text badges `[OK] [N/A] [ACTION]`, never emoji.
- **Engine copy** (frontend) enforced byte-identical to backend by a dedicated test, not a comment.

---

## 4. Verified File Impact

### CREATE

| Path | Purpose |
|---|---|
| `backend/prisma/migrations/<ts>_add_business_tax_profile/migration.sql` | Additive: `BusinessTaxProfile` table |
| `backend/prisma/migrations/<ts>_tax_report_breakdown_and_annual_payment/migration.sql` | Additive: breakdown columns + nullable `taxReportId` + `annualTaxReportId` |
| `backend/src/shared/tax-quiz-engine.ts` | `STATUTORY` constants, `QuizResponses`, `evaluateTaxConfig()`, question metadata, alert messages — zero imports, pure |
| `backend/src/shared/tax-obligation-engine.ts` | Obligation/PIT-band/WHT-rule helpers (or fold into quiz engine — decide at impl) |
| `backend/src/shared/helpers/tax.ts` | Shared rate/breakdown helpers for services (**does not exist — must create**) |
| `backend/src/routes/tax-profile.routes.ts` | GET/PATCH `/businesses/:businessId/tax-profile` |
| `backend/src/controllers/tax-profile.controller.ts` | Thin controller |
| `backend/src/services/tax/tax-profile.service.ts` | Read/update/re-evaluate profile |
| `backend/src/services/tax/tax-calculation-strategy.ts` | Legacy vs profiled strategy dispatch |
| `backend/src/services/pdf/tax-obligation-report.ts` | New obligation PDF (text badges, no emoji) |
| `backend/tests/unit/tax-quiz-engine.test.ts` | Engine unit tests (**correct path**) |
| `backend/tests/unit/tax-calculation-strategy.test.ts` | Strategy + legacy bit-exact tests |
| `backend/tests/unit/shared-helpers-tax.test.ts` | `shared/helpers/tax.ts` tests |
| `backend/tests/e2e/tax-profile.e2e.test.ts` | E2E (**correct path** — under `tests/e2e/`) |
| `backend/tests/unit/engine-frontend-bytessync.test.ts` | Enforces frontend engine copy is byte-identical |
| `frontend/src/components/business/CreateBusinessWizard.tsx` | 7-step wizard |
| `frontend/src/lib/tax-quiz-engine.ts` | Frontend copy of engine (byte-synced, enforced by test) |
| `frontend/src/pages/__tests__/TaxReports.test.tsx` | Frontend breakdown tests |
| `frontend/src/pages/__tests__/TaxProfile.test.tsx` | Wizard/profile tests |

### MODIFY

| Path | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `BusinessTaxProfile`; add breakdown columns to `MonthlyTaxReport`; `TaxPayment.taxReportId` → nullable + `annualTaxReportId` |
| `backend/src/services/tax/tax-report.service.ts` | QUIZ-22: strategy dispatch at 4 recompute sites (78, 315-317, 395-397, 446-448) |
| `backend/src/services/tax/tax-analytics.service.ts` | 2 recompute sites (134, 151) |
| `backend/src/services/documents/statement.service.ts` | line 502 |
| `backend/src/services/settlement/payout-preview.service.ts` | line 214 hardcoded `× 0.075` → parameterized |
| `backend/src/services/business/business.service.ts` | `createBusiness` accepts quiz answers |
| `backend/src/services/payment/tax-payment.service.ts` | Annual payment path |
| `backend/src/services/payment/payment-webhook.service.ts` | Annual payment webhook handling |
| `backend/src/services/invoice/invoice-crud.service.ts` | VAT exemption on **create AND update** (update recalcs at 345-367) |
| `backend/src/services/pdf/tax-slip.pdf.ts` | Breakdown display |
| `backend/src/routes/business.routes.ts` | Accept quiz answers on create |
| `backend/src/routes/index.ts` | Mount `tax-profile.routes.ts` at `/businesses/:businessId/tax-profile` |
| `backend/src/validators/` | Quiz-answer Zod schemas |
| `backend/prisma/seed.ts` | Seed tax profiles for `ABC Retail Store`, `Tech Solutions Ltd` |
| `frontend/src/components/business/CreateBusinessModal.tsx` | Route to wizard |
| `frontend/src/components/tax/PaymentConfirmationModal.tsx` | Pay-button amount uses breakdown |
| `frontend/src/components/tax/FinalizeConfirmationModal.tsx` | Breakdown display |
| `frontend/src/pages/TaxReports.tsx` | Breakdown columns, annual-returns via `?tab=` |
| `frontend/src/pages/TaxAnalytics.tsx` | Breakdown-aware |
| `frontend/src/pages/Dashboard.tsx` | Breakdown-aware (4 sites: 1202, 1536, 1648, 1989) |
| `frontend/src/pages/Settings.tsx` | Add `tax-profile` tab to existing `TABS` array (96-126) |
| `frontend/src/stores/business.store.ts` | `createBusiness` forwards quiz answers |
| `frontend/src/types/index.ts` | `TaxProfile`, `TaxReport` breakdown fields |

### DELETE

None. All changes additive or refactors in place.

### DATABASE

| Change | Type | Rail-way safe? |
|---|---|---|
| `BusinessTaxProfile` new table | Additive CREATE TABLE | ✅ |
| `MonthlyTaxReport` breakdown columns | Additive ALTER TABLE ADD COLUMN | ✅ |
| `TaxPayment.taxReportId` → nullable | Relaxing constraint (safe) | ✅ |
| `TaxPayment.annualTaxReportId` new nullable FK | Additive | ✅ |

No column drops, no type changes, no renames. `prisma migrate deploy` on every start — all
statements idempotent-safe.

### CONFIGURATION

None new. `TAX_DEFAULT_RATE` already exists (`config/index.ts:213-216`). `STATUTORY` constants
live in code, not env — they are legal facts, not deployment knobs.

### TESTS (existing — must stay green)

`tax-finalization-gate`, `soft-delete`, `dashboard-numbers`, `payments-verification`,
`phase1-hardening-live`, `qahunter-e2e-adversarial`, `phase4-store-webhook`,
`phase1-4-qahunter-deep-audit`, `nil-return`. All hardcode 7.5% — legacy fallback must
reproduce these bit-exact.

---

## 5. Improved Implementation Plan

### STATUTORY Constants Block (source of truth for the engine)

```ts
// backend/src/shared/tax-quiz-engine.ts
// Sources: taxquestionupdate.md (Q1-Q10) → NTA 2025 / NTAA 2025 / 2026 PIT Guidelines / NRS calendar
export const STATUTORY = {
  // Q4 — VAT (NTA 2025 ss144-188, NTAA 2025 s22)
  VAT_RATE: 7.5,
  VAT_EXEMPT_TURNOVER_LIMIT: 25_000_000,           // ₦25M — NOT ₦50M/₦100M
  // No asset test for VAT exemption

  // Q4 — Small-company CIT — CORRECTED 2026-10-14: Final gazetted NTA 2025 s56(6)/s202 = ₦100M (PwC 29 May 2026 + Deloitte); initial gazette ₦50M was drafting error
  SMALL_CO_TURNOVER_LIMIT: 100_000_000,            // ₦100M final gazetted (was ₦50M initial gazette)
  SMALL_CO_ASSET_LIMIT: 250_000_000,               // ₦250M — confirmed both prints
  LARGE_CIT_RATE: 30,
  DEV_LEVY_RATE: 4,                                // on assessable profits, non-exempt companies

  // Q1 — PIT bands (NTA 2025 s58, Fourth Schedule) — CONFIRMED
  PIT_FREE_THRESHOLD: 800_000,
  PIT_BANDS: [
    { upTo: 800_000,          rate: 0  },
    { upTo: 3_000_000,        rate: 15 },
    { upTo: 12_000_000,       rate: 18 },
    { upTo: 25_000_000,       rate: 21 },
    { upTo: 50_000_000,       rate: 23 },
    { upTo: Infinity,         rate: 25 },
  ],

  // Q10 — Rent relief (NTA 2025 s30, 2026 PIT Guidelines) — CONFIRMED, PIT only
  RENT_RELIEF_PCT: 20,
  RENT_RELIEF_CAP: 500_000,

  // Q2 — CGT (NTA 2025 ss4, 33-58) — CONFIRMED: no special digital rate
  CGT_INDIVIDUAL: 'PROGRESSIVE_PIT',               // 0-25%
  CGT_COMPANY: 30,
  // Digital/virtual assets fall under ordinary CGT; 1% WHT on gross proceeds is withholding only

  // Q3 — WHT (NTAA 2025 s51, Deduction of Tax at Source Regs 2024) — transaction-level
  WHT_SMALL_CO_TXN_EXEMPT_LIMIT: 2_000_000,        // only if qualifying small co AND vendor has valid TIN
  WHT_RATES: {
    goods_resident: 2, goods_nonresident: 5,
    services_resident: 2, services_nonresident: 5,
    professional_resident: 5, professional_nonresident: 10,
    rent_resident: 10, rent_nonresident: 10,
  },
  // NO isWhtAgent turnover boolean — legally unsafe

  // Q8 — Minimum effective tax (NTA 2025 s57) — CONFIRMED
  MNM_RATE: 15,
  MNM_GLOBAL_TRIGGER_EUR: 750_000_000,             // OECD Pillar Two, MNE groups
  MNM_DOMESTIC_TRIGGER_NGN: 20_000_000_000,        // ₦20bn — NOT ₦50bn
  // Alternative predicates — keep as SEPARATE boolean tests, not combined

  // Q7 — Agricultural holiday — CONFIRMED
  AGRI_HOLIDAY_YEARS: 5,                           // agriculture only, NOT universal startup

  // Q9 — Filing deadlines (NTAA 2025 ss11,13,22,101; NRS calendar) — CONFIRMED
  DEADLINES: {
    pit_annual: '03-31',
    cit_annual_months_after_fy_end: 6,
    cit_newco: 'earlier_of_18mo_from_inc_or_6mo_after_first_fy',
    vat_monthly_day: 21,
    paye_monthly_day: 10,
    wht_monthly_day: 21,
  },
  PENALTY_LATE_FILING_FIRST_MONTH: 100_000,
  PENALTY_LATE_FILING_PER_MONTH: 50_000,
  // Do NOT use petroleum penalties (₦10M/₦2M daily) — different regime

  // Q5 — Professional-services exclusion — CONFIRMED proviso, NO exhaustive SIC list exists → REVIEW_REQUIRED
  PROFESSIONAL_SERVICES_EXCLUSION: 'REVIEW_REQUIRED', // open-ended: law, accounting, medical, engineering, consulting (licensed practices); tech studio NOT auto-excluded
  // Q6 — Presumptive/nano — SECONDARY-VERIFIED 2026-10-14: NTA s29 + Presumptive Tax Regulations 2026 — nano ≤₦12M exempt, informal >₦12M ~1% on turnover
  PRESUMPTIVE_NANO_EXEMPT: 12_000_000,             // informal sector only, flag not calc — secondary via advisories + Africa Tax In Brief 14 Jul 2026
  PRESUMPTIVE_RATE_ABOVE: 1,                      // 1% — flag only, do not auto-apply to LTDs
  PRESUMPTIVE_SCOPE: 'INFORMAL_SECTOR_INADEQUATE_RECORDS' as const,
} as const;
```

---

### Work Items

#### QUIZ-01 … QUIZ-03 — Business-info step (unchanged)
Collect business name, owner name, address, CAC status. Wire into `CreateBusinessWizard.tsx` Step 1.
Pass through `business.store.ts` `createBusiness`.

#### QUIZ-04 — Turnover question (REBUILT)
**What:** Replace 3-bracket with 4-bracket + separate presumptive flag.
**Where:** `tax-quiz-engine.ts` question metadata; `CreateBusinessWizard.tsx` Step 3.
**Options:**
- `UNDER_25M` — VAT-exempt; eligible for 0% small-co CIT (if not professional/regulated)
- `M25M_TO_50M` — VAT applies (7.5%); still eligible for 0% small-co CIT
- `ABOVE_50M` — Large: 30% CIT + 4% Dev Levy; VAT applies
- `UNKNOWN` — defaults to review-queue flag
**Separate flag:** `keepsProperBooks: boolean` → drives presumptive-tax review (UNVERIFIED threshold, do not compute a rate).
**Why:** Confirmed thresholds are ₦25M (VAT) and ₦50M (CIT) — different boundaries, cannot share one bracket.
**Deps:** `STATUTORY.VAT_EXEMPT_TURNOVER_LIMIT`, `STATUTORY.SMALL_CO_TURNOVER_LIMIT`.

#### QUIZ-05 — Industry / exclusion question (CORRECTED)
**What:** Options: `REGULATED_FINANCIAL` (fintech, lender, investment) → excluded from 0% CIT;
`PROFESSIONAL_SERVICES` (law, accounting, medical, engineering, consulting) → excluded;
`OTHER` → not auto-excluded.
**Critical:** Remove "Tech/Software Studio" from excluded list — a plain software studio is NOT
automatically professional services (research Q5). Set `professionalServicesFlag = REVIEW_REQUIRED`
for manual review, not a blanket rule.
**Where:** `tax-quiz-engine.ts`; wizard Step 3.
**Deps:** `STATUTORY.PROFESSIONAL_SERVICES_EXCLUSION`.

#### QUIZ-06 … QUIZ-08 — Structure, employees, branches (unchanged in shape)
Legal structure (Business Name / LLC), employee count (>₦800k earners → PAYE), branch count
(single-TIN / branch-aggregation flag).

#### QUIZ-09 — Presumptive / nano review (NEW)
**What:** Ask `keepsProperBooks: boolean` and `annualGrossTurnoverBand`.
**Engine behavior:** Do NOT compute a presumptive rate. Set `presumptiveReviewFlag = true` when
`!keepsProperBooks && turnoverBand !== 'UNDER_25M'` → surfaces in obligation PDF as `[ACTION]`
manual-review item. Thresholds/rates remain UNVERIFIED pending the 2026 Presumptive Tax Regulations.
**Deps:** None hard — flag only.

#### QUIZ-10 … QUIZ-15 — WHT, VAT-registration opt-in, export, agri, digital-asset, MNM (REBUILT)

- **WHT (QUIZ-11):** Do NOT ask "are you a WHT agent?" Replace with: (a) do you make payments
  to vendors/landlords? (b) typical payment category (goods/services/professional/rent).
  Engine stores `whtPayerCategories: string[]` and `whtVendorTinTracked: boolean`. The
  transaction-level rule (not a boolean) is applied downstream when a qualifying payment exists.
- **VAT opt-in (QUIZ-12):** Small businesses under ₦25M may opt out of VAT by written notice.
  Ask `optsIntoVat: boolean`. If `false` and turnover ≤ ₦25M → `vatExempt = true`.
- **Export (QUIZ-13):** `isExportOriented: boolean` → 100% export profits exempt (repatriation required).
- **Agri (QUIZ-14):** `isAgricultural: boolean` → 5-year holiday flag (agriculture only).
- **Digital assets (QUIZ-15):** `hasDigitalAssetDisposals: boolean` → advisory only; gains taxed
  under ordinary CGT (progressive PIT for individuals, 30% for companies). No special 10% rate.

#### QUIZ-16 … QUIZ-19 — Obligation report PDF
**What:** Generate a per-business obligation PDF.
**Where:** `backend/src/services/pdf/tax-obligation-report.ts` (CREATE).
**Sections:** VAT status (exempt/charging + threshold cited), CIT status (0%/30% + Dev Levy),
PIT bands applicable (if Business Name), PAYE obligation, WHT transaction-level summary,
filing deadlines calendar (from `STATUTORY.DEADLINES`), penalty exposure
(₦100k + ₦50k/mo), nil-return obligation reminder, input-VAT credit recovery note, agricultural
holiday (if flagged), MNM review (if ₦20bn domestic / €750m global), presumptive review (if flagged).
**Critical:** Use text badges `[OK] [N/A] [ACTION]` — never emoji (PDFKit font has no emoji glyphs).
**Deps:** `STATUTORY` block, `receipt-common.pdf.ts` exports (`COLORS`, `registerBrandFonts`,
`FONT`, `LEFT`, `RIGHT`, `formatMoney`, `formatDate`, `renderDocumentFooters`).

#### QUIZ-20 … QUIZ-25 — Corrected calculation engine

**QUIZ-20 — Strategy dispatch.**
Create `tax-calculation-strategy.ts`:
```ts
calculateTaxReport(inputs, taxProfile | null) {
  if (!taxProfile) return legacyCalculate(inputs, config.tax.defaultRate);
  return profiledCalculate(inputs, taxProfile);
}
```
**QUIZ-21 — Payment semantics resolution.**
For profiled businesses: `taxPayable = vatPayable` (the amount Paystack collects monthly).
CIT/DevLevy/PIT computed and stored as **advisory non-payable columns** on `MonthlyTaxReport`
(`advisoryCite`, `advisoryDevLevy`, `advisoryPit`, `advisoryTotalProvision`). Surfaced in PDF,
settled only at annual filing. Resolves Addendum B-vs-D contradiction.
**QUIZ-22 — Decompose formula across all 7 sites.**
Replace the 7 duplicated recompute sites with calls into the strategy:
- `tax-report.service.ts` ×4 (lines 78, 315-317, 395-397, 446-448)
- `tax-analytics.service.ts` ×2 (134, 151)
- `documents/statement.service.ts` ×1 (502)
- `settlement/payout-preview.service.ts` ×1 (214) — hardcoded `× 0.075` → `config.tax.defaultRate`
**QUIZ-23 — Frontend breakdown consumers.**
Update: `TaxReports.tsx`, `PaymentConfirmationModal.tsx` (pay-button amount),
`FinalizeConfirmationModal.tsx`, `TaxAnalytics.tsx`, `Dashboard.tsx`. Add breakdown columns to
`types/index.ts` `TaxReport`.
**QUIZ-24 — Obligation + slip PDFs.**
`tax-slip.pdf.ts` displays breakdown. No emoji. Use `receipt-common.pdf.ts` shared exports.
**QUIZ-25 — Legacy bit-exact enforcement.**
`calculateMonthlyTax(..., taxProfile=null)` must reproduce old numbers **exactly**. Pass
`config.tax.defaultRate` as a parameter (never hardcode 0.075). Enforcement test in
`backend/tests/unit/tax-calculation-strategy.test.ts` — run existing suite
(`tax-finalization-gate`, `soft-delete`, `dashboard-numbers`, `payments-verification`,
`nil-return`) unchanged.

#### QUIZ-26 — Upstream VAT (invoice)
**What:** Respect `vatExempt` on invoice create **and** update.
**Where:** `invoice-crud.service.ts` — `computeTotals` (94-109), create default `vatRate` (151),
**update recalc path (345-367)** — both must be covered.
`InvoiceLine` has no `isVatExempt` — if per-line exemption needed, add column (additive migration);
otherwise apply at invoice level only.
**Input VAT on expenses:** `gross ÷ 107.5 × 7.5` (extract VAT from VAT-inclusive amount),
**not** `expenses × 7.5%`. Category exclusion list: `depreciation`, `bad_debt`, salaries/wages,
penalties, interest — these are deductible but bear no VAT. Do NOT use `isDeductible` as proxy.
**CIT base for VAT collectors:** net revenue (sales − output VAT) − net expenses (excl. input VAT),
so the VAT collected is not itself taxed.
**Deps:** `STATUTORY.VAT_RATE`, `STATUTORY.VAT_EXEMPT_TURNOVER_LIMIT`.

#### QUIZ-27 — Shared helpers
**What:** CREATE `backend/src/shared/helpers/tax.ts` (**does not exist**).
**Contents:** `extractVatFromInclusive(gross, rate)`, `netRevenueAfterVat(sales, vatExempt, rate)`,
`computeCitBase(revenue, expenses, vatExempt, rate)`, `applyPitBands(chargeableIncome)`,
`evaluateWhtOnPayment({ amount, category, vendorHasTin, isQualifyingSmallCo })`,
`computeRentRelief(annualRent)`.
**Deps:** `STATUTORY` block.

#### QUIZ-28 — Frontend engine copy (byte-sync enforced)
Copy `tax-quiz-engine.ts` to `frontend/src/lib/tax-quiz-engine.ts`.
**Enforcement:** `backend/tests/unit/engine-frontend-bytessync.test.ts` reads both files and
asserts byte-identical (or a documented allowed-diff list). A comment saying "keep in sync" is
not sufficient.

#### QUIZ-29 … QUIZ-30 — Annual filing scaffolding
**What:** `AnnualTaxReport` model (or reuse `MonthlyTaxReport` with `periodType: annual`).
Aggregate Jan 1–Dec 31 using `Date.UTC(year, 0, 1)` / `Date.UTC(year, 11, 31)` — **UTC pattern
mandatory** (known bug class in this repo).
File within 6 months of FY-end (`STATUTORY.DEADLINES.cit_annual_months_after_fy_end`).
Nil returns mandatory even at 0% CIT.

#### QUIZ-31 — Annual payment path (BLOCKED-FIXED)
**Blocker:** `TaxPayment.taxReportId` is a **required FK** → blocks annual payments.
**Fix:** Make `taxReportId` nullable; add `annualTaxReportId` (nullable FK to annual report).
Update `payment-webhook.service.ts` to resolve either FK. Additive migration, Rail-way safe.

#### QUIZ-32 — Re-evaluation + reminders
Reuse existing `tax_deadline` reminder type for annual re-evaluation prompt. No new cron.
`getActiveReminders()` is pure-read — no side effects.

#### QUIZ-33 — Settings tab
Add `tax-profile` tab to existing `TABS` array in `Settings.tsx` (lines 96-126).
Deep-link from obligation PDF / dashboard review-queue items.

---

### Cross-Cutting Implementation Rules

1. **UTC dates:** Every `Date` built with `Date.UTC(...)`. Annual aggregation Jan 1–Dec 31 UTC.
2. **Transactions:** Never call email/PDF/Resend inside `prisma.$transaction`. CPU/network outside.
3. **Ownership:** `verifyBusinessAccess(userId, businessId, 'settings.update')` for profile writes
   (owner-only; permission verified at `permission.service.ts:29,53,68`).
4. **Audit:** `logAudit()` in-transaction for profile create/update (per invoice pattern).
5. **Routes:** New `tax-profile.routes.ts` mounted at `/businesses/:businessId/tax-profile`.
   Do NOT add to `tax.routes.ts` (would produce `/tax/tax-profile`).
6. **Payloads:** Profile list endpoints use `select`, not full `findMany` rows.
7. **Tests:** `backend/tests/unit/` and `backend/tests/e2e/` only — jest `roots` is `<rootDir>/tests`.
8. **PDF:** Text badges `[OK] [N/A] [ACTION]` — never emoji.
9. **Legacy fallback:** Pass `config.tax.defaultRate`; bit-exact reproduction enforced by test suite.
10. **MNM predicates:** Keep MNE (€750m) and domestic (₦20bn) as **separate** boolean tests,
    not a combined condition.

---

## 6. Acceptance Criteria

- [ ] `STATUTORY` constants block exists in `tax-quiz-engine.ts`, every constant annotated with source
- [ ] Q4 turnover quiz uses confirmed brackets (`UNDER_25M / 25M–50M / ABOVE_50M / UNKNOWN`)
- [ ] VAT exemption threshold is ₦25M in code (not ₦50M/₦100M)
- [ ] Small-company CIT threshold is ₦50M in code (not ₦100M)
- [ ] PIT band table matches confirmed schedule (0/15/18/21/23/25)
- [ ] No `isWhtAgent` boolean anywhere — transaction-level rule implemented
- [ ] No hard-coded presumptive/nano threshold or rate — flag only
- [ ] `professionalServicesFlag` defaults to `REVIEW_REQUIRED`, not a blanket exclusion
- [ ] Tech studio not auto-classified as professional services
- [ ] MNM domestic trigger is ₦20bn (not ₦50bn); MNE and domestic are separate predicates
- [ ] Agricultural holiday is 5-year, agriculture-only (not universal 3+2 startup)
- [ ] `taxPayable = vatPayable` for profiled businesses; provisions are advisory columns
- [ ] Input VAT uses `gross ÷ 107.5 × 7.5` with category exclusion list (not `isDeductible`)
- [ ] CIT base for VAT collectors uses net revenue and net expenses (excl. VAT)
- [ ] Legacy fallback passes `config.tax.defaultRate` and is bit-exact (existing tests green)
- [ ] All 7 formula recompute sites call into the strategy (no duplicated math)
- [ ] `tax-profile.routes.ts` created and mounted at `/businesses/:businessId/tax-profile`
- [ ] `shared/helpers/tax.ts` created
- [ ] Invoice create **and** update paths respect `vatExempt`
- [ ] `TaxPayment.taxReportId` nullable; `annualTaxReportId` added; webhook handles both
- [ ] PDF uses `[OK]/[N/A]/[ACTION]` text badges, never emoji
- [ ] Frontend engine copy byte-sync enforced by test (not a comment)
- [ ] Settings `TABS` array has `tax-profile` tab
- [ ] All tests under `backend/tests/unit/` and `backend/tests/e2e/` (correct paths)
- [ ] `backend/tests/unit/tax-quiz-engine.test.ts` covers all confirmed statutory branches
- [ ] `backend/tests/unit/tax-calculation-strategy.test.ts` proves legacy bit-exact + profiled paths
- [ ] `backend/tests/unit/engine-frontend-bytessync.test.ts` passes
- [ ] All pre-existing tests (`tax-finalization-gate`, `soft-delete`, `dashboard-numbers`,
      `payments-verification`, `nil-return`, `phase1-hardening-live`, etc.) still green
- [ ] `npm run typecheck` clean (note: `tsconfig` not strict — verify nullability with
      `--strictNullChecks` scoped to changed files)
- [ ] Additive migrations only — no drops/renames/type changes; `prisma migrate deploy` safe
- [ ] No email/PDF/Resend calls inside `prisma.$transaction`
- [ ] All date construction uses `Date.UTC(...)`

---

## 7. Remaining Questions

Only two remain genuinely unanswerable from the repo + confirmed research:

1. **Q5 — Professional-services exclusion list.** No exhaustive SIC-code schedule confirmed.
   Plan ships `professional_services_exclusion = REVIEW_REQUIRED` (manual review queue) rather
   than a blanket rule. **Action needed:** obtain the gazetted NTA 2025 s56 definition or an
   NRS/CAC industry-code schedule to convert the review-queue flag into a deterministic rule.

2. **Q6 — Presumptive/nano thresholds and rate.** The ₦12M threshold and 1% rate in `taxlaw.md`
   are NOT supported by the enacted NTA text located in research. Presumptive provision exists
   (NTA s29) but thresholds/methodology are to be prescribed by the Minister. Plan ships a
   `presumptiveReviewFlag` only, no rate. **Action needed:** await the 2026 Presumptive Tax
   Regulations / formal NRS-SIRS publication before hard-coding any nano threshold or rate.

Both are isolated to `STATUTORY` constants + one engine flag each — swapping in confirmed values
later requires no surrounding-logic changes.

---

## 8. Final Readiness Score

**8.5 / 10**

The revised plan is implementation-ready. All statutory figures are confirmed and sourced except
Q5 (professional-services exclusion list) and Q6 (presumptive/nano regime), which ship as
flagged review-queue defaults rather than hard-coded rules — a deliberate correctness-first
choice. Architecture is verified against the actual codebase (file paths, route mounts, test
locations, formula sites, FK constraints, PDF font limitations all confirmed by direct inspection).
The legacy-fallback bit-exactness requirement is explicitly tested. Migrations are additive and
Rail-way safe.

**Deducted points:** Q5 and Q6 remain UNVERIFIED (−1.0), and the small-co asset threshold
(₦250M) is carried from `taxlaw.md` without independent re-verification in the Q&A (−0.5).
