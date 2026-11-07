# Tax Configuration Enforcement — Implementation Plan

**Version:** 2.0 — re-reviewed against the codebase
**Date:** 2026-11-02
**Evidence base:** `taxdeduction.md` (findings), `backend/TAX_CONFIG_ENFORCEMENT_ANALYSIS.md` (v2), plus a line-by-line re-verification of every file and line reference in v1.0
**Scope:** make the per-business tax quiz configuration actually govern invoices, tax calculation, dashboards, statements, payout reserves, payments and AI advice.
**Status:** plan only. No code changed.

> **v2.0 changes are listed in §18.** v1.0 contained three invented function names, an inverted feature-flag default, and a deploy-order hazard that would have blocked every VAT-exempt business. Those are corrected below. Anything cited in this document was verified against the file at the stated line; the few remaining `UNVERIFIED` markers are genuinely unresolvable without running the app.

---

# 1. Executive Summary

The application stores a correct per-business tax profile and then ignores it. Every money-deciding path still runs `grossProfit × 7.5%`, and invoices default to 7.5% VAT for every business regardless of turnover. The consequence is not cosmetic: the merchant is invoicing VAT they may not charge, and is charged a monthly "tax" that is neither VAT nor CIT — a number that is then **locked by finalisation** (`tax-report.service.ts:243`) and **collected by payment** (`tax-payment.service.ts:151`).

This plan fixes it in five stages:

| Stage | Outcome | Behaviour change |
|---|---|---|
| A. Foundation | One `resolveTaxPolicy()` resolver, config contradictions removed, policy exposed to the frontend | None |
| B. Invoices | VAT rate derived server-side from the policy; update path guarded; form defaults and locks correctly | Exempt businesses stop charging VAT |
| C. Calculation | The 9 formula sites (plus the finalisation recompute) routed through `calculateTaxWithStrategy` | Monthly payable changes for profiled businesses |
| D. Governance | Review queue, profile-change recalc, turnover reconciliation, honest obligation copy | Visible, but no money change |
| E. Data model (optional) | VAT/TIN columns, so VAT stops being estimated from totals | None — additive, nullable |

Testing is not a stage: every work item carries its own verification step, and the 16-case acceptance matrix is §12.

> ⚠️ **Two safety facts that v1.0 got wrong, and that change the rollout:**
>
> 1. **`TAX_USE_PROFILED_CALCULATION` defaults to ON.** `config/index.ts:239` reads `process.env.TAX_USE_PROFILED_CALCULATION !== 'false'` — when the variable is unset, profiled calculation is **enabled**. There is no "flag off by default" to hide behind: the moment any caller is wired to `calculateTaxWithStrategy`, every business with a completed profile switches basis in every environment that has not explicitly set the variable. Stage C's rollout gate is therefore *"set the env var to `false` in every environment before merging TAX-10"*, not *"the flag already ships off."*
> 2. **The invoice form always sends a VAT rate.** `InvoiceForm.tsx:242` posts `vatRate: Number(vatRate)` unconditionally, and its state starts at `'7.5'` (`:131`). If TAX-05's 422 ships before TAX-07 changes the form, **every exempt business is hard-blocked from creating invoices** — see §8.

**The one blocking decision** (Stage C cannot start without it) is in §2, D1.

---

# 2. Decisions Required Before Execution

### D1 — What does the monthly tax payment collect? 🔴 BLOCKING for Stage C

The profiled calculation returns **net VAT for the month** as `taxPayable` and moves CIT/PIT into `advisory` as annual provisions (`tax-profiled-calculation.service.ts:100,131,164`). The legacy engine returns **7.5% of gross profit**. These are different products.

**Recommended (assumed by this plan):** monthly collection = net VAT; CIT/PIT shown as an annual provision that is not collected monthly.

**Why:** it is the only reading consistent with the statutory model the config encodes, and it is what the already-written profiled calculation does.

**If you disagree:** stop after Stage B. Stages A and B are decision-free and fix the invoice problem, which is the user-visible one.

### D2 — Businesses with no completed profile

**Recommended:** behave exactly as today (7.5% of gross profit, 7.5% VAT on invoices) via `policy.source === 'DEFAULT'`. No regression, no migration.

### D3 — Unsupported obligations (PAYE, WHT, CGT, export/agriculture reliefs)

**Recommended:** keep computing them, but stop presenting them as active obligations until the underlying feature exists. Label as "advisory — no in-app workflow" in the obligation PDF and Settings.

### D4 — `UNKNOWN` turnover: charge VAT or stay exempt? 🟠 Blocking for TAX-02's acceptance criteria

Today an `UNKNOWN` turnover answer leaves `vatExempt: false` **and** `mustChargeVat: false` — two consumers reading those two fields disagree about the same business. TAX-02 resolves it by setting `mustChargeVat = !vatExempt`, which makes an unknown-turnover business **chargeable** (with `needsManualReview` still set).

**Recommended:** chargeable + flagged for review. VAT is not an opt-in obligation, so the conservative default is to charge and correct later; the review flag ensures a human sees it. The alternative — treat unknown as exempt until reviewed — is cheaper for the merchant and worse for compliance.

**If you disagree:** TAX-02 still applies, but in the other direction (`vatExempt: true`), and TAX-07's form copy must match.

---

# 3. Current Architecture (as it actually is)

```
Quiz (frontend TaxAssessmentModal)
   └─ POST /businesses/:id/tax-profile
        └─ tax-profile.service.saveTaxProfile()          ← evaluates + stores
             └─ BusinessTaxProfile.computed_config        ← written, displayed, never read

Invoice create ─ invoice.validator.ts:25 (.default(7.5))
   └─ invoice-crud.service.ts:152 (vatRate ?? 7.5)  ← profile never consulted
        └─ Invoice.vatRate / vatAmount → PDF, receipt, markInvoicePaid (:555)

Monthly tax ─ tax-report.service.ts:68-78 (grossProfit × taxRate)
   ├─ stored on MonthlyTaxReport
   ├─ finalizeReport():243 — and it RE-COMPUTES taxPayable at :315-317
   └─ tax-payment.service.ts:151 charges it

Duplicate formula sites (all profile-blind, none contain a literal 7.5 —
they read config.tax.defaultRate, so grepping for 7.5 will not find them):
   tax-report.service.ts:68-78, :316-317, :396-397, :447-448
   tax-analytics.service.ts:134, :142, :151, :168
   documents/statement.service.ts:498-503
   settlement/payout-preview.service.ts:235 (literal 0.075)
   ai/ai-context.service.ts:322, :351
   tax-profiled-calculation.service.ts:185-198 (literal 7.5 fallback)

calculateTaxWithStrategy()  ← correct, at tax-calculation-strategy.ts:37,
                              ZERO production callers, and the flag it reads
                              is ON when unset (config/index.ts:239)
```

**Business rules live in three places today:** the quiz engine (what the law says about this business), the legacy formula (what we charge), and the frontend form defaults (what the user can type). The whole defect is that these three never meet.

---

# 4. What Is Already Good — DO NOT CHANGE

| Component | Why protect it |
|---|---|
| `shared/tax-quiz-engine.ts` `evaluateTaxConfig()` | Pure, deterministic, correctly ordered priorities, statutory citations. Only the `UNKNOWN` branch needs a fix (TAX-02) |
| `shared/tax-constants.ts` | Verified NTA 2025 figures; single place to change a rate |
| `BusinessTaxProfile` model (`schema.prisma:1216`) | Correct shape and cardinality (`businessId @unique`) |
| `tax-profile.service.ts` save/get | Permission-checked, audited, upsert — reuse as-is |
| `tax-profile.routes.ts` | Correct mount and auth. Note `router.use(requireActiveSubscription)` at `:9` applies to **every** route in this file — that is right for the profile, wrong for the new policy read (TAX-03) |
| `tax-profiled-calculation.service.ts` scenario structure | Right model; only the input-VAT derivation and the silent fallthrough need fixing |
| `calculateTaxWithStrategy()` signature | Correct shape and flag handling; call it, don't rewrite it |
| `TAXABLE_SALES_WHERE` (`shared/helpers/settled-status.ts:21`) | Correct settled-status semantics; keep using it |
| `Invoice.vatRate` / `vatAmount` columns | Correct place for document VAT; do not move VAT to sales |
| `tax-profile.service.ts` audit of answers | Keep. It currently logs only the *new* answers/config (`logAudit` at `:72-79`); TAX-18 adds the previous config so the diff is auditable |

---

# 5. Target Architecture

One resolver, one calculation path, explicit enforcement points. Nothing else.

```
                     ┌───────────────────────────────┐
                     │ resolveTaxPolicy(businessId)  │  ← NEW, single source of truth
                     │  source: PROFILE | DEFAULT    │
                     │  vat.chargeable / rate        │
                     │  incomeTax / exemptions       │
                     │  obligations / flags          │
                     └───────────────┬───────────────┘
        ┌────────────────┬───────────┴──────────┬──────────────────┐
        ▼                ▼                      ▼                  ▼
  Invoice create    calculateTaxWithStrategy  Payout preview    Frontend policy
  Invoice update   (all 9 formula sites       Statement/AI       (invoice form,
  (VAT rate)                                                        labels)
```

Rules this design enforces:

1. **No consumer reads `computedConfig` directly.** Only `resolveTaxPolicy()` does. That is what makes the config impossible to half-apply next time.
2. **`vat.chargeable` is computed once** from the profile (`!vatExempt && mustChargeVat`), so the `UNKNOWN`-turnover contradiction (`vatExempt: false` + `mustChargeVat: false`) cannot leak to two consumers that disagree.
3. **`source: 'DEFAULT'` reproduces today's behaviour exactly** — the resolver is safe to deploy before anything consumes it.
4. **The flag stays the switch — but it must be turned *off* explicitly.** `TAX_USE_PROFILED_CALCULATION` is read as `!== 'false'`, so an unset variable means **ON**. Stage C requires setting it to `false` in every environment *before* the dispatcher gains a caller, then flipping it per environment. Relying on "it defaults to off" would activate profiled calculation for every profiled business on deploy.

---

# 6. Risk Register

| Finding | Severity | Confidence | Evidence | Impact | Action |
|---|---|---|---|---|---|
| Invoice VAT ignores profile | 🔴 CRITICAL | HIGH | `invoice-crud.service.ts:152`, `invoice.validator.ts:25`, `InvoiceForm.tsx:131` | Merchant charges VAT it legally must not; customer pays it; PDF asserts it | TAX-04…08 |
| **Feature flag defaults to ON** | 🔴 CRITICAL | HIGH | `config/index.ts:239` — `!== 'false'` | Wiring any caller to the dispatcher activates profiled calculation in every environment that never set the variable. No safe default exists | TAX-01, §8 gate |
| **Form always posts a VAT rate** | 🔴 CRITICAL | HIGH | `InvoiceForm.tsx:242` posts `vatRate: Number(vatRate)`; state seeded `'7.5'` at `:131` | Shipping TAX-05's 422 before TAX-07 blocks invoice creation for every exempt business | §8 ordering |
| Payment charges a legally wrong amount | 🔴 CRITICAL | HIGH | `tax-payment.service.ts:151` ← `tax-report.service.ts:78` | Money leaves the merchant's account on a wrong basis | TAX-11, TAX-16 |
| Finalisation locks the wrong number | 🔴 CRITICAL | HIGH | `tax-report.service.ts:243`; recomputes `taxPayable` at `:315-317` | Finalisation does not merely freeze the figure — it recalculates it with the legacy formula, then sets `isFinalized` (`:328`). Immutable, filed, wrong | TAX-11, TAX-18 |
| Dispatcher has no caller | 🔴 CRITICAL | HIGH | `tax-calculation-strategy.ts:37`; grep of `backend/src` returns only the definition | Whole feature inert | TAX-01, TAX-11…16 |
| **Profiled path drops `taxRateOverride`** | 🟠 HIGH | HIGH | `tax-calculation-strategy.ts:44,47` accept it; `:62-69` never forwards it. Clients can POST `taxRate` (`tax.controller.ts:14`) | Routing calculation through the dispatcher silently discards a user-supplied rate on every profiled business | TAX-10 |
| Input VAT extracted from salaries | 🟠 HIGH | HIGH | `tax-profiled-calculation.service.ts:95,122,157`; `isVatBearingExpense` (`shared/helpers/tax.ts:29`) has zero callers | Overstated credits once wired | TAX-09 |
| VAT invented from totals, not invoices | 🟠 HIGH | MEDIUM | same lines; `SalesTransaction` has no VAT column | Wrong output VAT for cash/import sales | TAX-09, TAX-22 |
| **Statutory PDFs assert the 7.5% formula** | 🟠 HIGH | HIGH | `pdf/tax-slip.pdf.ts:274`, `pdf/tax-slip-seal.pdf.ts:57,131` | A document handed to a tax authority states "Tax Payable = 7.5% × (Sales − Expenses)" regardless of profile | TAX-08 |
| **Invoice PDF prints VAT unconditionally** | 🟠 HIGH | HIGH | `invoice.pdf.ts:420-423` | An exempt invoice renders "VAT (0%) ₦0.00"; the §12 row 3 expectation cannot pass without touching this file | TAX-08 |
| `updateInvoice` unguarded | 🟠 HIGH | HIGH | `invoice-crud.service.ts:383-405` | Exempt invoice can be edited to 7.5%. Note `:349-355` already blocks non-draft edits (409), so only the policy check is missing | TAX-06 |
| **AI prompt states a flat 7.5%** | 🟡 MEDIUM | HIGH | `ai/ai.service.ts:165` ("strictly 7.5% of Gross Profit"), `:453` | The assistant advises a rate that may not apply | TAX-15 |
| **Silent 7.5% at the DB layer** | 🟡 MEDIUM | HIGH | `Invoice.vatRate @default(7.5)` (`schema.prisma:439`), `MonthlyTaxReport.taxRate @default(7.5)` (`:283`) | Any row created without an explicit rate inherits 7.5 regardless of application code | TAX-05, TAX-11 |
| Config fields promise absent features | 🟡 MEDIUM | HIGH | PAYE/WHT/CGT read only by `pdf/tax-obligation-report.ts` | Misleading compliance copy | TAX-20 |
| `needsManualReview` never acted on | 🟡 MEDIUM | HIGH | `tax-profile.service.ts:58,66` | Uncertain classifications go unreviewed | TAX-17 |
| Static turnover never reconciled | 🟡 MEDIUM | MEDIUM | `tax-quiz-engine.ts:75-87` | Business that outgrows ₦25M keeps exemption | TAX-19 |
| Duplicate quiz engine (BE/FE) | 🟢 LOW | HIGH | Byte-identical **modulo line endings** (backend CRLF, frontend LF; `diff -w` is clean) | Future statute change drifts one copy. A naive `diff` parity check reports all 261 lines changed, so it must normalise EOL | TAX-21 |

---

# 7. Implementation Plan — Ordered Work Items

Execution order is topological. Each item is PR-sized and independently revertible.

---

## Stage A — Foundation (no behaviour change)

### TAX-01 — Create `resolveTaxPolicy()`

- **Depends on:** None
- **Files touched:** CREATE `backend/src/services/tax/tax-policy.service.ts`; CREATE `backend/tests/unit/tax-policy.service.test.ts`
- **What to do:**
  - Export `BusinessTaxPolicy` (`source`, `vat: { chargeable, rate, reason }`, `incomeTax: { type, rate, devLevyRate }`, `exemptions: { ftz, agriculture, export }`, `obligations: { paye, wht, nilReturns }`, `flags: { needsManualReview, reviewReasons }`) and `resolveTaxPolicy(businessId)`.
  - Read `business_tax_profiles` once per call (`completedAt`, `computedConfig`).
  - No completed profile, or `computedConfig` empty ⇒ `source: 'DEFAULT'`, `vat.chargeable: true`, `vat.rate: config.tax.defaultRate`, `incomeTax: { type: 'CIT', rate: config.tax.defaultRate }` — i.e. exactly today's behaviour.
  - With a profile ⇒ `vat.chargeable = !cfg.vatExempt && cfg.mustChargeVat`; `vat.rate = chargeable ? config.tax.defaultRate : 0`; income tax from `citRate` / `incomeTaxType`.
  - **Do not hard-code `7.5` here.** The whole codebase reads the rate from `config.tax.defaultRate` (`config/index.ts:234`, env `TAX_DEFAULT_RATE`, default `7.5`). Introducing a literal in the resolver would recreate the defect this plan exists to remove, and would break the existing `taxRate` override and min/max validation (`tax-report.service.ts:70`).
  - Normalise legacy rows here (a row with `vatExempt: false, mustChargeVat: false` must resolve deterministically — treat `mustChargeVat === false` as not chargeable, and log a warning with the businessId).
  - Request-scoped memoisation only (a module-level `Map` keyed by businessId **is acceptable** only if cleared per request; prefer passing the resolved policy down rather than caching globally, because profiles change).
- **Acceptance criteria:** no caller yet; the four scenario profiles (`UNDER_25M` LLC, `M50M_TO_100M` LLC, `ABOVE_100M` LLC, sole proprietor) each resolve to the expected `chargeable`/`rate`; a business with no profile resolves to `source: 'DEFAULT'`.
- **Verification:** `npm run test:unit -- tax-policy.service` green; `npm run typecheck` green.
- **Rollback:** delete the two files. Nothing imports them.
- **Effort:** M (3-4 h)
- **Risk if skipped:** every later item has nowhere to read the config from, and the next fix will again reach into `computedConfig` directly.

### TAX-02 — Make the quiz config self-consistent

- **Depends on:** None (can run parallel to TAX-01)
- **Files touched:** `backend/src/shared/tax-quiz-engine.ts`; `frontend/src/lib/tax-quiz-engine.ts`; `backend/tests/unit/tax-quiz-engine.test.ts`
- **What to do:** after the VAT block (`:75-87`), set `config.mustChargeVat = !config.vatExempt` unconditionally, so `UNKNOWN` turnover no longer produces `vatExempt: false` + `mustChargeVat: false`. Keep the existing review reason for `UNKNOWN`. Mirror the change into the frontend copy.
- **Verified diagnosis:** the struct defaults are `vatExempt: false, mustChargeVat: false` (`:21-22`); `UNDER_25M` sets both explicitly (`:76-77`) and the `else if` at `:81` excludes `UNKNOWN`, so `UNKNOWN` matches **neither** branch and keeps both defaults. Confirmed, not inferred.
- **⚠️ This is a policy change, not just a consistency fix** — see D4 in §2. The edit makes every `UNKNOWN`-turnover business VAT-chargeable. That is the conservative reading, but it must be a decision, not a side effect.
- **Mirroring note:** the two engine files are identical **modulo line endings** (backend CRLF, frontend LF). Copy the changed block by hand rather than overwriting the file, or the frontend copy inherits CRLF and every later diff is noise.
- **Acceptance criteria:** `evaluateTaxConfig({ annualTurnover: 'UNKNOWN', legalStructure: 'LLC', … })` ⇒ `vatExempt === false && mustChargeVat === true`, and still `needsManualReview === true`.
- **Verification:** unit test asserting the invariant `mustChargeVat === !vatExempt` across all five turnover answers.
- **Rollback:** revert the commit; stored configs are unaffected (no migration).
- **Effort:** S (30 min)
- **Risk if skipped:** two consumers reading two different fields will disagree, and the invoice and the calculation will contradict each other.

### TAX-03 — Expose the policy to the frontend

- **Depends on:** TAX-01
- **Files touched:** `backend/src/controllers/tax-profile.controller.ts`; `backend/src/routes/tax-profile.routes.ts`; `backend/src/services/tax/tax-profile.service.ts`
- **What to do:** add `GET /businesses/:businessId/tax-policy` returning the resolved policy (small payload, no answers, no review internals beyond a boolean). Mount beside the existing `/tax-profile` routes. Note: `/tax-profile` currently sits behind `requireActiveSubscription` (`tax-profile.routes.ts:9`) — the invoice form must work for a business in grace period, so mount `/tax-policy` with `authenticate` only and permission `tax.read`.
- **Acceptance criteria:** authenticated owner gets `200` with `{ source, vat: { chargeable, rate }, incomeTax }`; a user without access gets `403`; a lapsed subscription still gets `200` (this is a read of a statutory classification, not a paid feature).
- **Verification:** add a route test beside `tests/unit/tax-profile.routes.test.ts`; manual `curl`.
- **Rollback:** remove the route; nothing consumes it until TAX-07.
- **Effort:** S (1-2 h)
- **Risk if skipped:** the invoice form cannot know whether to offer VAT, and TAX-07 becomes impossible.

---

## Stage B — Invoices (the headline defect)

### TAX-04 — Stop the validator from inventing 7.5%

- **Depends on:** None
- **Files touched:** `backend/src/validators/invoice.validator.ts`
- **What to do:** change `vatRate: z.number().min(0).max(100).default(7.5)` (`:25`) to `.optional()`. Leave `updateInvoiceSchema`'s `.optional()` as is. **This is the item the previous analysis missed** — without it, no server-side default can take effect.
- **Acceptance criteria:** a `POST` body without `vatRate` reaches the service as `undefined`.
- **Verification:** unit test on the schema; existing invoice tests must still pass after TAX-05 supplies the default.
- **Rollback:** restore the `.default(7.5)`.
- **Effort:** S (15 min)
- **Risk if skipped:** every other invoice fix is silently inert.

### TAX-05 — Derive VAT on create from the policy

- **Depends on:** TAX-01, TAX-04
- **Files touched:** `backend/src/services/invoice/invoice-crud.service.ts`
- **What to do:** in `createInvoice` (`:152`), replace `input.vatRate ?? 7.5` with a policy lookup: `policy.vat.chargeable ? (input.vatRate ?? policy.vat.rate) : 0`. When `chargeable === false` and the caller sent a non-zero `vatRate`, throw `AppError(422, 'VAT_EXEMPT_BUSINESS', …)` with a message naming the profile reason. Keep `computeTotals` (`:95-111`) untouched — it rounds via `money()`.
- **⚠️ Deploy-order constraint:** `InvoiceForm.tsx:242` posts `vatRate: Number(vatRate)` on **every** create, seeded from `'7.5'` (`:131`). The 422 above therefore fires for every exempt business the moment this ships. Either land TAX-07 first, or ship this item with the rejection **logged and coerced to 0** for one release and tighten to 422 in TAX-07's PR. Do not ship the strict 422 while the old form is still live.
- **Note:** `Invoice.vatRate` carries `@default(7.5)` in the schema (`schema.prisma:439`). Always pass the rate explicitly from the service — never rely on the column default.
- **Acceptance criteria:** exempt profile + no `vatRate` ⇒ `vatRate = 0`, `vatAmount = 0`, `total = subtotal`; exempt profile + `vatRate: 7.5` ⇒ 422; default profile ⇒ unchanged behaviour.
- **Verification:** three tests in `tests/unit/` (create-exempt, create-exempt-with-override, create-default).
- **Rollback:** revert the hunk; invoices already written are unaffected.
- **Effort:** M (2-3 h)
- **Risk if skipped:** the user's stated requirement is unmet — exempt businesses keep charging VAT.

### TAX-06 — Guard the update path

- **Depends on:** TAX-05
- **Files touched:** `backend/src/services/invoice/invoice-crud.service.ts`
- **What to do:** in `updateInvoice`, `vatRateChanged` is `input.vatRate !== undefined` (`:383`); when true, apply the same policy check before the totals recompute at `:387-422`: reject a non-zero rate for a non-chargeable business. Do not retroactively zero an existing invoice — an issued invoice is a document.
- **Already true, do not re-implement:** `:349-355` already rejects edits to non-draft invoices with `409 INVOICE_NOT_EDITABLE`, so "only drafts are editable" needs no new code. This item adds the rate check only.
- **Acceptance criteria:** draft invoice of an exempt business cannot be saved with 7.5%; a non-exempt draft can change rate freely.
- **Verification:** unit tests for both directions.
- **Rollback:** revert the hunk.
- **Effort:** S (1-2 h)
- **Risk if skipped:** the create-path guard is trivially bypassed by editing.

### TAX-07 — Invoice form defaults and locks from the policy

- **Depends on:** TAX-03
- **Files touched:** `frontend/src/pages/InvoiceForm.tsx`; `frontend/src/types/index.ts` (add the policy response type — `UNVERIFIED` whether a suitable type already exists)
- **What to do:**
  - Fetch `/businesses/:id/tax-policy` on mount (same pattern as `TaxProfileCard.tsx:48`).
  - `const [vatRate, setVatRate] = useState('7.5')` (`:131`) becomes initialised from the policy (`'0'` when not chargeable).
  - When `chargeable === false`: render the VAT field disabled with the value `0`, and show the reason inline ("VAT exempt — turnover under ₦25M"). Keep the field visible (hiding it looks like a bug). The shared `Input` spreads `InputHTMLAttributes` (`ui/Input.tsx:2,25`), so `disabled` needs no component change.
  - When the policy has not loaded yet, keep today's `'7.5'` default so the form is never blocked.
  - Edit mode keeps the stored invoice's rate (`setVatRate(String(Number(inv.vatRate)))`, `:165`), not the policy.
  - The submit payload at `:242` sends `vatRate: Number(vatRate)` unconditionally — that is what makes this item the *pair* of TAX-05, not an optional follow-up.
- **Acceptance criteria:** exempt business sees a disabled `0` field and a `₦0.00` VAT total; non-exempt sees `7.5` editable; a slow/failed policy fetch does not break the form.
- **Verification:** component test with a mocked policy (chargeable true/false/error); manual check in the browser.
- **Rollback:** revert the file; backend guard (TAX-05) still protects the data.
- **Effort:** M (3-4 h)
- **Risk if skipped:** the API refuses the request but the user has no idea why — a worse experience than today.

### TAX-08 — Policy-driven copy on tax surfaces

- **Depends on:** TAX-03
- **Files touched — frontend (all verified):** `pages/Dashboard.tsx:1348`; `pages/TaxReports.tsx:810,973`; `components/FinalizeConfirmationModal.tsx:298`; `components/PaymentConfirmationModal.tsx:191` (renders `7.50%`, so a `7.5%` find-replace misses it); `components/layout/AuthLayout.tsx:71`; `components/TaxProfileCard.tsx:259`; `components/TaxAssessmentModal.tsx:280,285` (`:863` is already conditional on `vatExempt`); `pages/VerifyEmail.tsx:243`; `components/debtors/WriteOffModal.tsx:119`.
- **Files touched — backend documents (the ones that matter legally):** `services/pdf/tax-slip.pdf.ts:274`; `services/pdf/tax-slip-seal.pdf.ts:57,131` (both state "Tax Payable = 7.5% × (Sales − Expenses)" in prose); `services/pdf/sales-receipt.pdf.ts:269` (`VAT (${data.vatRate || 7.5}%)` — silent default); `services/invoice/invoice.pdf.ts:420-423` (prints the VAT line unconditionally, so an exempt invoice reads "VAT (0%) ₦0.00"); `config/swagger.ts:425`; email templates `lib/email/templates/pnl-statement-ready.ts:93,147`, `welcome.ts:71,119`, `tax-due-date.ts:81`.
- **What to do:** replace hard-coded rate labels with the rate returned by the policy/analytics payload. For an exempt business, the tax card must read "VAT exempt — no monthly remittance" rather than "7.5%". **In `invoice.pdf.ts`, suppress the VAT line entirely when `vatAmount === 0`** — that is what makes §12 row 3 pass, and no other item produces it. In the tax-slip PDFs, print the profile's actual basis and rate; these are documents a tax authority reads. Leave the marketing copy (`pages/marketing/Home.tsx`, `About.tsx`, `data/marketing.ts`) alone — it advertises the product, not this business's liability.
- **Acceptance criteria:** with an exempt profile, no **tax surface or generated document** claims 7.5%; with a default profile, output is byte-identical to today.
- **Verification:** visual check with two profiles; render one invoice and one tax-slip PDF for an exempt business and assert the string `7.5` is absent from the extracted text; snapshot assertions in the existing `TaxReports` / `Sales` tests where practical.
- **Rollback:** revert per file — note the frontend lives in its own git repo (§10), so frontend and backend reverts are separate commits.
- **Effort:** L (5-6 h) — v1.0 said M (2-3 h) against a 5-file list; the real surface is 9 frontend files plus 4 generated-document paths.
- **Risk if skipped:** the app contradicts itself — invoice says 0%, dashboard says 7.5%, and a filed PDF asserts a formula that does not apply.

---

## Stage C — Calculation (gated on D1)

### TAX-09 — Fix the defects inside the profiled calculation

- **Depends on:** D1 decision
- **Files touched:** `backend/src/services/tax/tax-profiled-calculation.service.ts`; `backend/src/shared/helpers/tax.ts`
- **What to do:**
  1. Input VAT: replace `extractVatFromInclusive(expenses, RATE)` (`:95,122,157`) with a sum over **VAT-bearing** expense categories using `isVatBearingExpense()` (`helpers/tax.ts:29` — currently zero callers). This requires the per-category expense totals, not the single aggregate — add an optional `expensesByCategory` input and fall back to the current behaviour when it is absent.
  2. Empty config: replace the silent fallthrough at `:185-198` — literal `grossProfit * 7.5 / 100`, `taxRate: 7.5`, and the note `'Standard tax assessment (7.5% default rate).'` — with an explicit review result; do not produce a "profiled" number from an empty profile. Note these are **hard-coded literals**, not `config.tax.defaultRate`, so this is the one place in the calculation path that ignores even the env-configured rate.
  3. Keep the 5 scenarios' arithmetic; only the inputs change.
- **Acceptance criteria:** salary-only expenses produce zero input VAT; empty `computedConfig` with `completedAt` set returns a review flag and note, never a silent 7.5%.
- **Verification:** extend `tests/unit/` profiled-calculation tests; new cases for salary-only and empty config.
- **Rollback:** revert the file; dispatcher still unused until TAX-10.
- **Effort:** M (3-4 h)
- **Risk if skipped:** wiring the dispatcher would start under-reporting VAT and over-claiming input VAT in the same deploy.

### TAX-10 — Route `calculateTax` through the dispatcher

- **Depends on:** TAX-01, TAX-09, D1
- **Files touched:** `backend/src/services/tax/tax-report.service.ts` (`calculateTax` is at `:13`, body `:68-78`); `backend/src/services/tax/tax-calculation-strategy.ts` (for the override fix below)
- **What to do:**
  - In `calculateTax` (`:68-78`), call `calculateTaxWithStrategy({ businessId, month, year, totalSales, totalExpenses, grossProfit, taxRateOverride })` and persist `result.taxPayable` / `result.taxRate`.
  - **Fix the override gap first.** `calculateTaxWithStrategy` accepts `taxRateOverride` (`:44,47`) but never forwards it on the PROFILED branch (`:62-69`) — legacy honours it, profiled silently ignores it. Clients can supply one: `tax.controller.ts:14` parses `taxRate` from the body into `calculateTax`. Either pass the override into `calculateProfiledTax` (and define what it means when the basis is net VAT) or reject a non-undefined override with `422` on the profiled path. Do not leave it silently dropped — that converts a user-specified rate into a different number with no error.
  - `MonthlyTaxReport` has **no** column for `advisory` or a payment basis — verified field list in §16. Return `result.advisory` in the API response only; do not persist it in this stage.
- **Acceptance criteria:** profile ⇒ profiled numbers; no profile ⇒ byte-identical legacy numbers; a request carrying `taxRate` either honours it on both paths or is rejected with a clear error on both; the min/max range check at `:70` still applies.
- **Verification:** the 16-case matrix rows 6-10; regression on `tests/unit/tax-calculation.test.ts`; one new test asserting the override behaves identically on LEGACY and PROFILED.
- **Rollback:** revert; the flag also allows disabling at runtime — but see the flag default in §8.
- **Effort:** M (3-4 h)
- **Risk if skipped:** the stored, charged, filed number stays wrong.

### TAX-11 — Route finalisation and auto-finalisation through the dispatcher

> **v1.0 named three functions that do not exist** (`calculateAllMonthlyReports`, `calculateYearlyReports`, `recalculateAllReports`). There is no "batch recalc" API in this codebase. The real sites are below, and they are more serious than a batch job: **finalisation is what produces the number that gets locked and charged.**

- **Depends on:** TAX-10
- **Files touched:** `backend/src/services/tax/tax-report.service.ts:315-317` (inside `finalizeReport`, `:243`); `:396-397` and `:447-448` (the create and update branches of `autoFinalizeConcludedMonth`, `:364`); `backend/src/services/reminder/reminder-generation.service.ts:470` (the per-business loop `autoFinalizeConcludedMonthForAllBusinesses`, iterating at `:491`); `backend/src/jobs/reminders.cron.ts:116` (the scheduler entry point)
- **What to do:**
  - `finalizeReport` re-aggregates (`:296-309`) and **recomputes** `taxPayable` with `grossProfit × taxRate` (`:315-317`) before setting `isFinalized: true` (`:328`). Replace that recompute with the dispatcher result. Do not merely "lock" the figure — finalisation is currently where a correct draft number becomes a wrong filed number.
  - Apply the same substitution in both branches of `autoFinalizeConcludedMonth` (`:396-397`, `:447-448`), which fires automatically from cron on the configured auto-finalise day.
  - In `autoFinalizeConcludedMonthForAllBusinesses` (`:470`), fetch each business's policy **once per business** and pass it into the dispatcher via the existing `profile` parameter, rather than letting each call re-query.
- **Acceptance criteria:** finalising a profiled business produces the profiled figure, not `grossProfit × 7.5%`; a finalised report's stored `taxPayable` equals what the payment path will charge; the cron sweep issues one profile query per business, not one per month.
- **Verification:** the existing `tests/integration/tax-finalization-gate.test.ts` plus a new case asserting `finalizeReport` output for an exempt profile is `0`; a spy on `prisma.businessTaxProfile.findUnique` for the sweep.
- **Rollback:** revert; already-finalised rows keep their (wrong) historical values — a data correction is a separate, deliberate decision, not a rollback.
- **Effort:** M (3-4 h) — v1.0 said S (1-2 h) against a non-existent loop.
- **Risk if skipped:** every auto-finalised report continues to bake in the legacy formula at the exact moment the figure becomes immutable and chargeable.

### TAX-12 — Dashboard analytics

- **Depends on:** TAX-10
- **Files touched:** `backend/src/services/tax/tax-analytics.service.ts:134,142,151,168`
- **What to do:** replace the three inline `(grossProfit × rate) / 100` sites (`:134`, `:151`, and the rate lookup at `:142`) with the strategy result; replace `taxConfig.currentRate: config.tax.defaultRate` (`:168`) with the resolved policy rate, and add `vatExempt`/`chargeable` so the frontend can label correctly.
- **Acceptance criteria:** the dashboard's live preview equals `calculateTax`'s output for the same month and profile.
- **Verification:** test asserting preview === calculated for all four profile shapes.
- **Rollback:** revert.
- **Effort:** M (2 h)
- **Risk if skipped:** the dashboard keeps advertising a number the engine will not produce.

### TAX-13 — P&L statement

- **Depends on:** TAX-10
- **Files touched:** `backend/src/services/documents/statement.service.ts:498-503`
- **What to do:** when a report exists, keep using it (already correct). When none exists, use the dispatcher instead of `grossProfit × defaultRate`. Keep the existing "no report" labelling in the PDF so a reader can tell a projection from a filing.
- **Acceptance criteria:** statement tax line matches the report when one exists; matches the dispatcher when none does.
- **Verification:** unit test both branches.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped:** a PDF handed to a lender or auditor contradicts the dashboard.

### TAX-14 — Payout preview reserve

- **Depends on:** TAX-01
- **Files touched:** `backend/src/services/settlement/payout-preview.service.ts:235`
- **What to do:** replace `grossProfit * 0.075` with the policy-driven monthly figure (dispatcher). For a non-chargeable business the reserve is `0`. Keep `taxReserve = Math.max(0, …)`.
- **Acceptance criteria:** exempt business sees `taxReserve = 0`; large company sees net VAT.
- **Verification:** there is **no existing test for `payout-preview.service.ts`** (five `payout*.test.ts` files exist; none covers this service). Create `tests/unit/payout-preview.test.ts` with an exempt profile and a large-company profile.
- **Rollback:** revert.
- **Effort:** S (1-2 h)
- **Risk if skipped:** money is withheld from a merchant who owes nothing this month.

### TAX-15 — AI context

- **Depends on:** TAX-01
- **Files touched:** `backend/src/services/ai/ai-context.service.ts:322,351`; `backend/src/services/ai/ai.service.ts:165,453`
- **What to do:** replace the flat-rate arithmetic with the policy-derived figures, and include the policy's `vat.chargeable`/`reason` in the context so the model stops advising a rate that does not apply. **Also fix the system prompt:** `ai.service.ts:165` instructs the model that *"The Nigerian tax rate is strictly 7.5% of Gross Profit"*, and `:453` renders `**Estimated Tax (7.5%)**`. v1.0 listed only `ai-context.service.ts`, which would have left the model confidently asserting the wrong rule regardless of the numbers in its context.
- **Acceptance criteria:** the context payload for an exempt business contains no 7.5% liability figure.
- **Verification:** unit test on the context builder.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped:** the AI tells an exempt merchant they owe VAT.

### TAX-16 — Payment semantics

- **Depends on:** TAX-10, D1
- **Files touched:** `backend/src/services/payment/tax-payment.service.ts` (read path `:151`); `frontend/src/components/PaymentConfirmationModal.tsx`
- **What to do:** `report.taxPayable` stays the single source for the charge (do not compute a second number here). Derive the basis from the policy at read time and return it (`vat` / `cit-provision`) so the UI can say **what** is being paid. If D1 says annual taxes are provisions, the payment modal must not imply they were paid.
- **Already true, do not re-implement:** `:155-157` already throws `ZERO_TAX` when `amount <= 0`, so no zero-value Paystack call exists today. The "exempt business cannot pay ₦0" behaviour needs a test, not new code.
- **Constraint:** `MonthlyTaxReport` has no column for a basis or breakdown (verified — §16), so the basis cannot be persisted in this stage. Derive it from the policy on read.
- **Acceptance criteria:** payment amount equals the report; the modal names the obligation; no second calculation exists in the payment service.
- **Verification:** existing `payments-verification` integration tests plus one new case asserting an exempt business receives the existing `ZERO_TAX` error with a message that explains *why*.
- **Rollback:** revert; amount source unchanged.
- **Effort:** M (2-3 h)
- **Risk if skipped:** merchants pay a number nobody can explain, and support cannot reconcile it.

---

## Stage D — Governance

### TAX-17 — Surface `needsManualReview`

- **Depends on:** TAX-01
- **Files touched:** `frontend/src/components/TaxProfileCard.tsx`; `frontend/src/pages/Settings.tsx`; `backend/src/controllers/tax-profile.controller.ts`
- **What to do:** show a prominent banner in Settings when the profile needs review, listing `reviewReasons`. `TaxProfileMigrationBanner.tsx` already proves the pattern.
- **Acceptance criteria:** a profile with `needsManualReview: true` shows the reasons; a clean profile shows nothing.
- **Verification:** component test.
- **Rollback:** revert.
- **Effort:** S (1-2 h)
- **Risk if skipped:** uncertain classifications stay invisible and the config stays wrong by default.

### TAX-18 — Profile change → recalculate unlocked reports

- **Depends on:** TAX-10
- **Files touched:** `backend/src/services/tax/tax-profile.service.ts` (after `:69` upsert); `backend/src/services/tax/tax-report.service.ts`
- **What to do:** after a profile save, recalculate **unlocked, unfinalised** reports for the affected business (bounded: current year), and leave locked reports untouched with a log entry. There is **no** `computedUnderPreviousRules` column on `MonthlyTaxReport` (verified — §16), so a marker on the row would require a migration; do not plan one here.
- **The diff needs a read that does not exist yet.** `saveTaxProfile` (`:51`) goes straight to `upsert` and audits only the new answers/config (`logAudit` at `:72-79`). To audit a diff you must fetch the existing row (or its `computedConfig`) **before** the upsert and pass both into `logAudit`.
- **Acceptance criteria:** saving a new profile updates draft reports; locked reports are unchanged; the audit entry contains both configs.
- **Verification:** unit test with one locked and one draft report.
- **Rollback:** revert; reports keep their old numbers.
- **Effort:** M (3 h)
- **Risk if skipped:** the user fixes their quiz and sees no change — the exact complaint that started this work.

### TAX-19 — Reconcile the turnover answer with reality

- **Depends on:** TAX-01
- **Files touched:** CREATE `backend/src/services/tax/tax-profile-reconciliation.service.ts` (or add to `tax-profile.service.ts`); `backend/src/services/tax/tax-analytics.service.ts`
- **What to do:** compute trailing-12-month settled turnover (reuse `TAXABLE_SALES_WHERE`) and compare it with the answer bucket. On a threshold crossing, set `needsManualReview` + a review reason ("recorded turnover ₦X exceeds the ₦25M VAT exemption you declared"). Do not auto-flip the profile — that is a compliance decision, not a silent mutation.
- **Acceptance criteria:** a business whose recorded turnover crosses ₦25M is flagged within one calculation cycle; no profile field changes automatically.
- **Verification:** unit test with seeded sales on both sides of the threshold.
- **Rollback:** revert; the feature is advisory.
- **Effort:** M (3 h)
- **Risk if skipped:** exemption is permanent once granted, which is the compliance risk that matters most after the invoice fix.

### TAX-20 — Honest obligation copy

- **Depends on:** None
- **Files touched:** `backend/src/services/pdf/tax-obligation-report.ts`; `frontend/src/components/TaxProfileCard.tsx`
- **What to do:** mark PAYE / WHT / CGT / export / agriculture entries as "advisory — no in-app workflow" until those features exist. Do not delete the fields (the statute still applies to the user); stop implying the app enforces them.
- **Acceptance criteria:** no screen or PDF implies the app computes PAYE or WHT.
- **Verification:** visual check of the obligation PDF.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped:** the product over-promises compliance it cannot deliver.

### TAX-21 — Collapse the duplicated quiz engine

- **Depends on:** None
- **Files touched:** `frontend/src/lib/tax-quiz-engine.ts`; `frontend/src/lib/tax-constants.ts`
- **What to do:** the two copies are identical today (`diff` exit 0). Either generate the frontend copy from the backend file in the build, or add a CI check that fails when the two differ. Prefer the CI check — it is one script and no build complexity.
- **Acceptance criteria:** a deliberate edit to one file fails CI.
- **Verification:** run the check locally against a modified copy.
- **Rollback:** remove the check.
- **Effort:** S (1 h)
- **Risk if skipped:** the next statute change silently splits the quiz from the calculator.

---

## Stage E — Data model (only if real VAT figures are required)

### TAX-22 — Record VAT where it is actually knowable

- **Depends on:** Stage C complete
- **Files touched:** `backend/prisma/schema.prisma`; new migration under `backend/prisma/migrations/`; `backend/src/services/invoice/invoice-crud.service.ts`; `backend/src/services/expense*.ts` (`UNVERIFIED` exact file); `backend/src/services/sales*.ts` (`UNVERIFIED` exact file)
- **What to do:** add `Expense.vatAmount Decimal?`, `Expense.vendorTin String?`, `SalesTransaction.vatAmount Decimal?`. Populate `SalesTransaction.vatAmount` from the linked invoice at `markInvoicePaid` (`:555`) instead of booking the VAT-inclusive total as revenue. Make the expense fields optional — never required, or every existing row and every manual entry breaks.
- **Scope correction (v1.0 overstated this):** for **invoice-linked** sales, VAT is already recoverable today — `markInvoicePaid` writes `amount: total` (`:612`) but also persists `subtotal`, `vatAmount` and `discount` into `sale.metadata` (`:628-630`), and `Invoice.linkedSaleId` (`schema.prisma:447`) joins the two. So Stage E is only genuinely required for **cash, DVA and imported sales**, which have no invoice and no VAT split. Consider narrowing this item to those sources, or reading `metadata` for the invoice-linked case and skipping the column entirely.
- **Alternative worth weighing:** `SalesTransaction.metadata Json?` already exists (`schema.prisma:197`). A nullable `Decimal` column is better for aggregation and reporting, but if the only consumer is a display figure, extending `metadata` avoids a migration on a large table. Decide before writing the migration.
- **Acceptance criteria:** new invoice-linked sales carry the VAT split; existing rows remain valid (`NULL`); the profiled calculation can sum recorded VAT and stop extracting from totals.
- **Verification:** migration applied on a copy of production data; tests for null handling.
- **Rollback:** the columns are additive and nullable — no rollback needed, stop reading them.
- **Effort:** L (1-2 days incl. migration testing)
- **Risk if skipped:** VAT remains an estimate derived from totals, which is defensible for a display figure but not for a filing.

---

# 8. Sequencing & Rollout

```
Stage A: TAX-01 ── TAX-03 ── TAX-07 ─┐        (policy read path, form knows the rate)
         TAX-02 ─────────────────────┘
                                       ▼
Stage B: TAX-04 ── TAX-05 ── TAX-06   TAX-08   (enforcement AFTER the form can obey it)
Stage C: TAX-09 ── TAX-10 ─┬─ TAX-11
                           ├─ TAX-12
                           ├─ TAX-13
                           ├─ TAX-16
                           └─ TAX-14/15
Stage D: TAX-17 ── TAX-18 ── TAX-19   TAX-20 ── TAX-21
Stage E: TAX-22 (after Stage C is live)
```

**The order changed from v1.0.** TAX-07 (form) now precedes TAX-05's strict rejection, because `InvoiceForm.tsx:242` posts `vatRate` on every create. v1.0's order — enforce server-side, then fix the form — would have returned `422 VAT_EXEMPT_BUSINESS` to every exempt business on the deploy that introduced the guard.

**Rollout gates**

0. **Before anything else, set `TAX_USE_PROFILED_CALCULATION=false` explicitly in every environment** (and add it to `backend/.env.example`). The variable defaults to **ON** when unset (`config/index.ts:239`), so there is no implicit safe default. Confirm the deployed value, not just the intended one.
1. Ship Stage A. Nothing changes behaviour: the resolver has no callers, and the policy endpoint is a read. Verify `GET /businesses/:id/tax-policy` returns `DEFAULT` for un-profiled businesses.
2. Ship Stage B in two steps: **TAX-07 first** (form reads the policy and disables VAT for exempt businesses), then **TAX-05/06** (server enforcement). If you must ship enforcement first, ship it coercing to `0` and logging, and tighten to `422` in the TAX-07 PR. Watch the logs for businesses whose profile says exempt while the form still sends 7.5 — that list is the migration's real work.
3. Ship Stage C code with the flag explicitly `false`. Enable in staging, reconcile 10 real businesses month-by-month against the legacy numbers, then enable in production **after** D1 is reflected in the payment copy (TAX-16). Confirm the flag flipped by reading a log line, not by assuming the env var took effect.
4. Stage D any time after A. Stage E last.
5. **Every item reverts independently, but frontend and backend are separate git repositories** (`frontend/` has its own `.git`; there is no `.gitmodules`). A cross-cutting item like TAX-08 is therefore two commits in two repos and two reverts — plan the release notes accordingly.

---

# 9. Prioritized Improvements — NOW / NEXT / LATER / DO NOT DO

The stages in §7 are the *execution* order. This is the *value* order: what buys the most correctness per hour, and what is deliberately deferred.

## NOW — decision-free, ship this week

Nothing here depends on D1, and everything here is independently revertible.

| Order | Item | Why it is NOW | Effort |
|---|---|---|---|
| 1 | TAX-04 | 15 minutes, and without it every other invoice fix is inert | S |
| 2 | TAX-01 | Nothing else has a policy to read until this exists | M |
| 3 | TAX-03 | The form cannot lock VAT without the policy endpoint | S |
| 4 | TAX-07 | The form must stop sending 7.5 **before** the server rejects it | M |
| 5 | TAX-05 | Stops an exempt business charging VAT — the original complaint | M |
| 6 | TAX-06 | Closes the one-line bypass of TAX-05 | S |
| 7 | TAX-02 | Removes the `UNKNOWN`-turnover contradiction before two consumers read it (needs D4) | S |

TAX-04 is still first — cheapest item, and it gates everything downstream. But the **user-visible** sequence is TAX-01 → TAX-03 → TAX-07 → TAX-05, not TAX-05 first: the form must learn to stop posting 7.5 before the API starts rejecting it (§8). TAX-02 sits last in NOW only because D4 decides its direction.

## NEXT — after D1 is answered

| Item | Why NEXT |
|---|---|
| TAX-09 | The profiled calculation must be correct *before* it is wired to anything |
| TAX-10, TAX-11 | Routing the formula sites **and the finalisation recompute** is the actual behaviour change; flag-gated |
| TAX-12, TAX-13, TAX-14, TAX-15 | All read from the same dispatcher; cheap once TAX-10 lands |
| TAX-16 | Payment copy must match D1 or merchants are told the wrong thing |
| TAX-17, TAX-18, TAX-19 | Governance — high compliance value, no money change, no blocker |
| TAX-20 | Copy honesty; must land with or before TAX-16 |
| TAX-08 | Visible-only fix; do it once the policy endpoint is stable (TAX-03) |

## LATER — real, but not urgent

| Item | Why LATER |
|---|---|
| TAX-21 | The two quiz engines are identical modulo line endings; parity CI is prevention, not repair |
| TAX-22 | Stage E. Only worth doing once Stage C is live and someone needs a filing-grade VAT figure |

## DO NOT DO

Restated from §14 so it is not re-litigated mid-execution: no rewrite of the legacy 7.5% engine, no `TaxPolicy` table, no policy copy on the `Business` row, no class hierarchy around `calculateProfiledTax`, no nightly recompute job, no forced quiz completion, no PAYE/WHT/CGT engines. Each is excluded with a cited reason in §14.

---

# 10. File & Module Impact Map

Every path below was checked to exist. Line references live in §7.

### MUST CREATE

| File | Role |
|---|---|
| `backend/src/services/tax/tax-policy.service.ts` | The resolver (TAX-01) |
| `backend/tests/unit/tax-policy.service.test.ts` | Resolver tests |
| `backend/tests/unit/payout-preview.test.ts` | **No test for `payout-preview.service.ts` exists today** — five `payout*.test.ts` files exist, none covers it (TAX-14) |
| `backend/tests/helpers/tax-fixtures.ts` | A profile/scenario factory. `tests/helpers/` currently holds only `loadEnv.ts` and `test-db.ts`, so this is new work, not a reuse |
| `backend/src/services/tax/tax-profile-reconciliation.service.ts` | Turnover reconciliation (TAX-19) — or fold into `tax-profile.service.ts` |
| `backend/scripts/check-tax-engine-parity.ts` | Engine parity check (TAX-21). **Must normalise line endings** — the backend copy is CRLF and the frontend copy is LF, so a raw `diff` reports all 261 lines changed |

### MUST MODIFY — backend

| File | Item | What changes |
|---|---|---|
| `services/tax/tax-report.service.ts` | TAX-10, TAX-11, TAX-18 | `calculateTax` (`:13`, body `:68-78`); `finalizeReport` recompute (`:315-317`); both `autoFinalizeConcludedMonth` branches (`:396-397`, `:447-448`) |
| `services/tax/tax-calculation-strategy.ts` | TAX-10 | Forward `taxRateOverride` on the profiled branch (`:62-69` currently drops it) |
| `services/tax/tax-profiled-calculation.service.ts` | TAX-09 | Input VAT (`:95,122,157`); literal 7.5 fallback (`:185-198`) |
| `services/tax/tax-analytics.service.ts` | TAX-12 | `:134`, `:142`, `:151`, `:168` |
| `services/tax/tax-profile.service.ts` | TAX-18, TAX-19 | Pre-read before upsert for the audit diff (`:51-79`) |
| `services/invoice/invoice-crud.service.ts` | TAX-05, TAX-06 | Create (`:152`); update (`:383-422`) |
| `validators/invoice.validator.ts` | TAX-04 | `:25` — drop `.default(7.5)` |
| `services/documents/statement.service.ts` | TAX-13 | `:498-503` |
| `services/settlement/payout-preview.service.ts` | TAX-14 | `:235` |
| `services/ai/ai-context.service.ts` | TAX-15 | `:322`, `:351` |
| `services/ai/ai.service.ts` | TAX-15 | `:165` system prompt, `:453` label — **missed by v1.0** |
| `services/payment/tax-payment.service.ts` | TAX-16 | Read path `:151`; basis derived, not persisted |
| `services/pdf/tax-obligation-report.ts` | TAX-20 | Obligation copy |
| `services/pdf/tax-slip.pdf.ts`, `services/pdf/tax-slip-seal.pdf.ts` | TAX-08 | Statutory prose asserting 7.5% |
| `services/pdf/sales-receipt.pdf.ts` | TAX-08 | `:269` silent `|| 7.5` default |
| `services/invoice/invoice.pdf.ts` | TAX-08 | `:420-423` — suppress the VAT line when `vatAmount === 0` |
| `services/reminder/reminder-generation.service.ts` | TAX-11 | `:470` per-business sweep |
| `lib/email/templates/pnl-statement-ready.ts`, `welcome.ts`, `tax-due-date.ts` | TAX-08 | Rate claims in outbound email |
| `shared/tax-quiz-engine.ts` | TAX-02 | VAT block `:75-87` |
| `controllers/tax-profile.controller.ts` | TAX-03, TAX-17 | New policy handler; review surfacing |
| `routes/tax-profile.routes.ts` | TAX-03 | Mount `/tax-policy` with `authenticate` only |
| `config/swagger.ts` | TAX-08 | `:425` documents 7.5 |

### MAY MODIFY

| File | Why it might change |
|---|---|
| `config/index.ts` | Only if you invert the flag default to `=== 'true'` (recommended — see §8 gate 0). No other change needed |
| `shared/helpers/tax.ts` | Only if `isVatBearingExpense` (`:29`) needs a signature change for TAX-09 |
| `frontend/src/types/index.ts` | Add the policy response type — `UNVERIFIED` whether a suitable type already exists |

### MUST MODIFY — frontend (`frontend/`, separate git repo)

`pages/InvoiceForm.tsx` (TAX-07); `lib/tax-quiz-engine.ts` (TAX-02); and for TAX-08: `pages/Dashboard.tsx`, `pages/TaxReports.tsx`, `pages/VerifyEmail.tsx`, `components/FinalizeConfirmationModal.tsx`, `components/PaymentConfirmationModal.tsx`, `components/layout/AuthLayout.tsx`, `components/TaxProfileCard.tsx`, `components/TaxAssessmentModal.tsx`, `components/debtors/WriteOffModal.tsx`. `pages/Settings.tsx` and `components/InvoiceDetail.tsx` only for TAX-17's review banner.

### DO NOT TOUCH

| File | Why |
|---|---|
| `services/tax.service.ts` | Pure re-export barrel (`export *` from `tax-report` and `tax-analytics`). Editing it would be a no-op or a mistake |
| `shared/tax-constants.ts` | Verified NTA 2025 figures — the one place a rate should change |
| `jobs/reminders.cron.ts` | Calls the service; the fix belongs in the service, not the scheduler |
| `prisma/schema.prisma` | Untouched until Stage E |
| `frontend/src/pages/marketing/*`, `data/marketing.ts` | Product advertising, not this business's liability |

### DATABASE

Stage E only: additive, nullable columns on `expenses` and `sales_transactions` plus one migration. No enum changes.

Two DB-level defaults matter and should be decided, not ignored: `Invoice.vatRate @default(7.5)` (`schema.prisma:439`) and `MonthlyTaxReport.taxRate @default(7.5)` (`:283`). Application code must always pass an explicit rate; changing the column default is a separate, riskier migration and is **not** part of this plan.

### CONFIGURATION

- **`TAX_USE_PROFILED_CALCULATION` must be explicitly set to `false`** in every environment before TAX-10 merges. It is read as `!== 'false'` (`config/index.ts:239`), so unset means **enabled**.
- `TAX_DEFAULT_RATE` (`config/index.ts:234`, default `7.5`) is the existing knob for the fallback rate — document it in `.env.example` alongside the flag.
- `backend/.env.example`: add both.

### TESTS

- **Create:** `tax-policy.service.test.ts`, `payout-preview.test.ts`, `tax-fixtures.ts`, profiled-calculation edge cases.
- **Update:** the files that encode 7.5 today. Verified paths: `tests/unit/tax-calculation.test.ts`, `tests/unit/statutory-tax-finalization.test.ts`, `tests/unit/tax-calculation-strategy.test.ts`, `tests/unit/tax-profile.service.test.ts`, `tests/unit/tax-quiz-engine.test.ts`, `tests/unit/shared-helpers-tax.test.ts`, `tests/unit/tax-profile.routes.test.ts`, `tests/integration/nil-return.test.ts`, **`tests/integration/dashboard-numbers.test.ts`** (not `unit/`), **`tests/integration/tax-finalization-gate.test.ts`** (not `unit/`), `tests/e2e/api.e2e.test.ts`.
- **Count correction:** v1.0 said "16 files / 49 assertions". The real figure is **17 files / 51 occurrences**, of which 2 are unrelated settlement-fee splits (`bank-resolution-split.test.ts:32`, `bank-resolution.service.test.ts:70,127` — `taxSplitPercentage: 7.5`). Tax-relevant ≈ 15 files. Several occurrences are fixture values (`taxRate: 7.5`) rather than assertions, so do not treat the count as a test-case count.
- **Runners:** backend is **Jest** (`npm run test:unit` → `jest --config jest.config.ts tests/unit`; `npm run typecheck` → `tsc --noEmit`); frontend is **Vitest**. Do not mix the commands.

---

# 11. Migration Strategy

| Concern | Approach |
|---|---|
| Existing invoices | Never rewritten. They were issued under the old assumption and are legal documents. Enforcement is forward-only. |
| Existing tax reports | Locked reports untouched forever. Unlocked reports recalculated on profile save (TAX-18). |
| Businesses with no profile | `source: 'DEFAULT'` — identical behaviour. No forced quiz. |
| Businesses whose profile says exempt but who charged VAT | Stage B starts rejecting new non-zero VAT rates. Expect a support spike; pre-write the explanation and surface it in the form (TAX-07). |
| Existing finalised reports | Left as they are. They were filed under the old formula; correcting them is a deliberate remediation exercise with an audit trail, not a migration step |
| Feature flag | Must be set to `false` **explicitly** before Stage C merges — unset means ON (`config/index.ts:239`). Verify the deployed value |
| Rollback | Every item is a revertible PR. Stage C additionally has the runtime flag. Note `frontend/` is a **separate git repository**, so cross-cutting items (TAX-07, TAX-08) roll back as two commits |
| Payment basis | Not persistable today — `MonthlyTaxReport` has no basis/breakdown column. Derived from the policy at read time until Stage E, if ever |
| Data migration | None until Stage E, which is additive and nullable |

---

# 12. Test Plan (the matrix you asked for)

Rows 1-16 fail today; rows 17-20 are behaviours that are currently undefined or unsafe and must be pinned down. Each maps to the work item that makes it pass.

| # | Scenario | Expected | Item |
|---|---|---|---|
| 1 | `UNDER_25M` LLC, invoice with no `vatRate` | 0%, no VAT | TAX-05 |
| 2 | same, `PATCH vatRate: 7.5` | 422 | TAX-06 |
| 3 | same, invoice PDF | no VAT line at all | **TAX-08** (`invoice.pdf.ts:420-423` prints it unconditionally — v1.0 assigned this to TAX-05, which does not touch the PDF) |
| 4 | `ABOVE_100M` LLC, no `vatRate` | 7.5% | TAX-05 |
| 5 | FTZ profile, invoice | 0% | TAX-05 |
| 6 | `UNDER_25M` → `calculateTax` | 0 | TAX-10 |
| 7 | `M50M_TO_100M` → `calculateTax` | net VAT | TAX-10 |
| 8 | `ABOVE_100M` → `calculateTax` | net VAT monthly + CIT/dev-levy advisory | TAX-10 |
| 9 | sole proprietor → `calculateTax` | net VAT + PIT advisory | TAX-10 |
| 10 | no profile → `calculateTax` | legacy number unchanged | TAX-10 |
| 11 | `completedAt` set, `computedConfig: {}` | explicit review, not silent 7.5% | TAX-09 |
| 12 | `UNKNOWN` turnover | one unambiguous `chargeable` (direction set by D4) | TAX-02 |
| 13 | exempt → payout preview | reserve 0 | TAX-14 |
| 14 | exempt → dashboard | no 7.5% copy | TAX-08, TAX-12 |
| 15 | salary-only expenses, VAT-charging profile | input VAT excludes salary | TAX-09 |
| 16 | profile changed after a report exists | unlocked recalculated, locked untouched | TAX-18 |
| 17 | profiled business + `POST { taxRate: 3 }` | override honoured or explicitly rejected — **never silently ignored** | TAX-10 |
| 18 | finalise a month for an exempt profile | stored `taxPayable` is `0`, not `grossProfit × 7.5%` | TAX-11 |
| 19 | old form (always posts 7.5) + exempt business | invoice still creatable during rollout | §8 gate 2 |
| 20 | `TAX_USE_PROFILED_CALCULATION` unset | document the actual behaviour; assert it matches what was deployed | §8 gate 0 |

Add a fixture factory at `backend/tests/helpers/tax-fixtures.ts` (it does not exist today) that seeds a `BusinessTaxProfile` per scenario, so each test is one line of setup.

---

# 13. Architecture Scores (current → after this plan)

| Dimension | Now | After | Why |
|---|---|---|---|
| Maintainability | 4 | 8 | One resolver instead of 11 ad-hoc formulas |
| Modularity | 5 | 7 | Tax policy becomes an explicit module boundary |
| Reliability | 4 | 7 | Payment and finalisation stop depending on a formula nobody owns |
| Security / compliance | 3 | 8 | Statutory exemptions are actually enforced |
| Testability | 6 | 8 | Pure resolver + dispatcher are easy to test; today's inline formulas are not |
| Data architecture | 5 | 7 | Stage E adds the VAT/TIN fields; until then VAT remains estimated |
| Observability | 5 | 6 | Review flags surfaced, profile diffs audited |
| Scalability | 6 | 7 | Nothing here needs new infrastructure. TAX-11 changes the batch recalc from one profile query per month to one per business — a real win at 24-month backfills, not a scaling emergency |
| API architecture | 5 | 7 | Today the policy has no API surface and enforcement is an implicit validator default. TAX-03 adds one small read endpoint; the rest is internal routing |
| Deployment architecture | 7 | 7 | No change. Single backend, and the `TAX_USE_PROFILED_CALCULATION` env flag already exists for staged rollout |
| **Overall** | **4** | **7** | Same system, one resolver and one enforcement path. No rewrite, no new service tier, no queue |

---

# 14. Red Team — what I deliberately did NOT put in this plan

| Tempting idea | Why it is excluded |
|---|---|
| A `TaxEngine` class hierarchy / strategy-per-scenario objects | The existing `calculateProfiledTax` switch is readable and correct; wrapping it in 5 classes adds indirection with no behaviour |
| A background job that recomputes every business nightly | Only needed once turnover reconciliation exists (TAX-19), and even then it is a monthly check, not a job runner |
| Storing the policy on the `Business` row | Duplicates the profile and creates a second source of truth that will drift — the exact failure this plan exists to remove |
| Rewriting the legacy 7.5% engine | It is the correct fallback for un-profiled businesses; deleting it would change behaviour for every merchant who has not taken the quiz |
| Forcing every business to complete the quiz | A migration product decision, not an engineering one. `DEFAULT` preserves today's behaviour safely |
| A new `TaxPolicy` table | The profile already holds the data; a table would just cache it badly |
| Adding PAYE/WHT/CGT engines | Those are new products. This plan makes the app honest about not having them (TAX-20) |

---

# 15. Top 10 Recommendations (ranked by value)

Ranked by correctness-and-money impact per hour of work, not by size.

| # | Recommendation | Item(s) | Why it ranks here |
|---|---|---|---|
| 1 | Derive invoice VAT server-side from the policy | TAX-04, TAX-05 | Removes the statutory violation and needs no product decision. Two small items, highest value in the plan |
| 2 | Guard the invoice update path | TAX-06 | Without it, #1 is bypassable in one PATCH |
| 3 | Build the single `resolveTaxPolicy()` | TAX-01 | Every later item reads from it; it is also what prevents this defect from recurring |
| 4 | Route finalisation and auto-finalisation through the dispatcher | TAX-11 | The figures that get **locked and charged** are computed inside `finalizeReport` and the cron sweep, not only in the single `calculateTax` path |
| 5 | Make the quiz config self-consistent | TAX-02 | Cheapest fix in the plan; removes the `UNKNOWN` contradiction before two consumers disagree |
| 6 | Name what the monthly payment is | TAX-16 | Merchants currently pay a figure nobody can explain; this is a copy-and-response change, not a calculation |
| 7 | Lock the form and fix the labels from the policy | TAX-03, TAX-07, TAX-08 | Converts a server-side rejection into an explained, disabled field |
| 8 | Recalculate unlocked reports on profile save | TAX-18 | Otherwise fixing the quiz appears to do nothing — the original user complaint |
| 9 | Reconcile declared turnover with recorded turnover | TAX-19 | The exemption is otherwise permanent once granted; this is the compliance risk that outlives the invoice fix |
| 10 | Record VAT where it is actually knowable | TAX-22 | Moves VAT from estimate to filing-grade. Genuinely last: nothing above depends on it |

---

# 16. Remaining Unknowns

**Still open:**

1. **D1** — monthly collection basis (blocks Stage C).
2. **D4** — direction of the `UNKNOWN`-turnover fix (blocks TAX-02's acceptance).
3. Whether product wants VAT exemption to be *automatic* once recorded turnover crosses ₦25M, or only *flagged* (TAX-19 assumes flagged, and recommends flagged).
4. What `TAX_USE_PROFILED_CALCULATION` is actually set to in each deployed environment. The code default is ON, but the deployed values were not observable from here — this must be checked before TAX-10, not assumed.

**Resolved in v2.0 (were `UNVERIFIED` in v1.0):**

- **`MonthlyTaxReport` has no advisory/breakdown/basis column.** Verified field list: `id, businessId, taxMonth, totalSales, totalExpenses, grossProfit, taxRate, taxPayable, profitMargin, paymentStatus, isFinalized, isLocked, lockedAt, isNilReturn, createdAt, updatedAt`. TAX-10 and TAX-16 can return a basis but cannot persist one without a migration.
- **No branch in the codebase wires the dispatcher.** A grep of `backend/src` returns only the definition at `tax-calculation-strategy.ts:37`; the sole caller is a unit test.
- **Stage E file names confirmed:** `backend/src/services/expense.service.ts` and `backend/src/services/sales.service.ts` both exist.
- **`computedUnderPreviousRules` does not exist** on `MonthlyTaxReport` — TAX-18 uses a log entry, not a column.
- **The two quiz engines are identical modulo line endings**, not byte-identical. Backend is CRLF, frontend is LF.

---

# 17. Final Verdict

- **Biggest strength:** the statutory model and the quiz engine are genuinely good — correct, cited, testable. The hard part is already built.
- **Biggest problem:** the config is written and never read; the number it should govern is charged and locked.
- **Biggest risk if unchanged:** merchants keep charging VAT they are exempt from, and pay a monthly figure that is neither VAT nor CIT — with an audit trail that says it was filed.
- **Highest-value first move:** TAX-04, then TAX-01 → TAX-03 → TAX-07 → TAX-05. Four small items stop exempt businesses charging VAT. That is the user's original complaint, and it is independent of every open decision — but the form must be taught the rate before the server enforces it (§8).
- **Overall:** 🟠 **Significant debt, but tractable** — roughly 9-12 focused days for Stages A-D (v1.0 said 6-8; the corrections to TAX-08 and TAX-11 add real surface), one to two more for Stage E. No rewrite required, no new infrastructure, one new service and one new endpoint.
- **Confidence:** high. Every file and line in this revision was checked against the repository. The three items that cannot be settled from code alone are D1, D4, and the deployed value of the feature flag.

---

# 18. Review Changelog — v1.0 → v2.0

What the re-review found and changed. Classifications follow the review rubric: 🔴 WRONG, 🔴 MISSING, 🟠 INCOMPLETE, 🟠 OUTDATED, 🟡 RISKY, 🟢 CORRECT.

| Previous plan (v1.0) | Decision | Improved plan (v2.0) | Reason |
|---|---|---|---|
| "Flag ships `false`; enable per environment" | 🔴 WRONG | Flag read as `!== 'false'` — **ON when unset**. Gate 0 requires setting it explicitly to `false` before TAX-10 | `config/index.ts:239`. The v1.0 rollout would have activated profiled calculation for every profiled business on deploy |
| TAX-11 routes `calculateAllMonthlyReports`, `calculateYearlyReports`, `recalculateAllReports` | 🔴 WRONG | **None of those functions exist.** Real sites: `finalizeReport` (`:315-317`), both branches of `autoFinalizeConcludedMonth` (`:396-397`, `:447-448`), the sweep at `reminder-generation.service.ts:470` | Invented names; also mis-framed as a "batch recalc" when the real risk is the finalisation recompute |
| TAX-11 effort S (1-2 h) | 🔴 WRONG | M (3-4 h) | Three real call sites plus a cron sweep, not a loop |
| `markInvoicePaid` at `:824` | 🔴 WRONG | `:555` (`:824` is the DVA reconciliation path) | Verified |
| Test row 3 ("invoice PDF → no VAT line") assigned to TAX-05 | 🔴 WRONG | TAX-08, and it must explicitly suppress the line when `vatAmount === 0` | `invoice.pdf.ts:420-423` prints VAT unconditionally; TAX-05 never touches the PDF, so the test could not pass |
| TAX-05 enforce immediately | 🔴 WRONG (ordering) | TAX-07 precedes TAX-05, or TAX-05 ships coercing-and-logging | `InvoiceForm.tsx:242` always posts `vatRate`; the strict 422 would block every exempt business |
| TAX-01 `vat.rate = chargeable ? 7.5 : 0` | 🔴 WRONG | Use `config.tax.defaultRate` | Hard-coding 7.5 recreates the defect; the rate is env-configurable (`TAX_DEFAULT_RATE`) |
| Dispatcher described as ready to use | 🟠 INCOMPLETE | TAX-10 must fix the dropped `taxRateOverride` | `tax-calculation-strategy.ts:62-69` ignores an override the legacy path honours, and clients can POST one |
| TAX-08 lists 5 frontend files | 🔴 MISSING | 9 frontend files, 4 generated-document paths, 3 email templates, swagger | 18 files contain 7.5; the statutory PDFs and `ai.service.ts` prompt were absent |
| TAX-15 covers `ai-context.service.ts` only | 🔴 MISSING | Adds `ai.service.ts:165,453` | The system prompt states the rate is "strictly 7.5% of Gross Profit" |
| TAX-09 cites `:96,123,158` | 🟠 OUTDATED | `:95,122,157`, plus the literal-7.5 fallback at `:185-198` | Off-by-one, and the fallback lines were unlisted |
| TAX-18 wants a `computedUnderPreviousRules` note "if a field exists" | 🟠 INCOMPLETE | Field verified absent — log entry only; and the audit diff needs a pre-upsert read that does not exist yet | `schema.prisma:276-301`; `saveTaxProfile` upserts blind at `:51` |
| TAX-22 premise: "VAT is not knowable" | 🟠 INCOMPLETE | VAT is already in `salesTransaction.metadata` (`:628-630`) for invoice-linked sales; Stage E is narrower than claimed | `linkedSaleId` joins invoice and sale |
| TAX-06 constrains "draft edits only" | 🟡 UNNECESSARY | Already enforced at `:349-355` (409); TAX-06 adds the rate check only | Avoids re-implementing an existing guard |
| TAX-16 blocks zero-value payments | 🟡 UNNECESSARY | `ZERO_TAX` already thrown at `:155-157` — test-only | Verified |
| Test paths `unit/dashboard-numbers.test.ts`, `unit/tax-finalization-gate.test.ts` | 🟠 OUTDATED | Both live in `tests/integration/` | Verified |
| "16 files / 49 assertions" | 🟠 INCOMPLETE | 17 files / 51 occurrences, 2 unrelated to tax | Verified |
| Verification says `npm run test:unit` / `typecheck` | 🟢 CORRECT | Kept, with the note that backend is Jest and frontend is Vitest | Verified |
| "frontend (submodule)" | 🟠 OUTDATED | `frontend/` is a **separate git repo**, no `.gitmodules` | Changes the rollback story for every cross-cutting item |
| Quiz engines "identical today" | 🟢 CORRECT (qualified) | Identical **modulo CRLF/LF**; parity check must normalise | Verified with `diff -w` |
| TAX-02 makes `UNKNOWN` chargeable | 🟡 RISKY (undisclosed) | Raised as **D4** — a product decision, not a side effect | The fix silently flips policy for unknown-turnover businesses |
| Risk register cited TAX-21/22/23 for TAX-20/19/21 | 🟠 OUTDATED | IDs remapped | Earlier draft drift |
| §4 said the audit diff is "TAX-19" | 🟠 OUTDATED | TAX-18 | Cross-reference error |
| `services/tax.service.ts` absent from the impact map | 🟢 CORRECT (clarified) | Added to DO NOT TOUCH — it is a re-export barrel | Prevents an implementer editing a facade |
| `MonthlyTaxReport` basis column listed as `UNVERIFIED` | 🟠 INCOMPLETE | Verified absent; basis is derived, not persisted | Field list checked |
| "11 legacy sites" | 🟠 OUTDATED | 9 formula sites plus the finalisation recompute | Verified; none contain a literal `7.5`, so a grep cannot validate the list |
| No fixture factory existed to reuse | 🟠 INCOMPLETE | Marked CREATE: `tests/helpers/tax-fixtures.ts` | `tests/helpers/` holds only `loadEnv.ts` and `test-db.ts` |
| Effort 6-8 days | 🟠 OUTDATED | 9-12 days | TAX-08 and TAX-11 are larger than described |
