# Tax Configuration Enforcement — Phased Execution

**For:** one junior engineer, working solo
**Source of truth:** `TAX_CONFIG_ENFORCEMENT_IMPLEMENTATION_PLAN.md` (v2.0). It explains *why*. This file says *what order* and *how to not break production*.
**Rule:** one phase = one PR. Finish, verify, merge, then start the next.

---

## Read this before Phase 1

### The six ways this work breaks production

In order of likelihood. Every guard below exists for one of these.

1. **The feature flag is ON by default.** `TAX_USE_PROFILED_CALCULATION` is read as `!== 'false'` (`config/index.ts:239`). If nobody sets it, it is **on**. Wiring the dispatcher (Phase 10) would then switch every profiled business's tax basis the moment it deploys.
2. **The form posts a VAT rate on every create.** `InvoiceForm.tsx:242`. Ship server-side enforcement (Phase 5) before the form is fixed (Phase 4) and every exempt business gets a 422 on invoice creation.
3. **Finalisation recomputes the number.** `tax-report.service.ts:315-317` recalculates `taxPayable` with the legacy formula immediately before locking it. Miss this and you fix the draft and file the wrong figure.
4. **The dispatcher drops a user-supplied rate.** `tax-calculation-strategy.ts:62-69` ignores `taxRateOverride` on the profiled path. Clients can send `taxRate` (`tax.controller.ts:14`). Silently ignoring it is a data-integrity bug.
5. **Two sources of truth drift.** Never add a `TaxPolicy` table, never copy the policy onto `Business`, never cache the resolver globally. Profiles change; read them per request.
6. **`frontend/` is a separate git repo.** Frontend and backend changes are two commits in two repos, and roll back separately.

### Non-negotiables

- Never type a literal `7.5`. The rate is `config.tax.defaultRate`.
- Never edit `services/tax.service.ts` (re-export barrel) or `shared/tax-constants.ts` (statutory figures).
- Never edit `frontend/src/pages/marketing/*` or `data/marketing.ts`.
- Never delete or skip a failing test. If it encodes 7.5%, change it with the behaviour.
- Backend = **Jest**, frontend = **Vitest**. Do not mix commands.
- Don't "fix it properly while I'm in here." Note it, finish the phase.

### Two decisions you cannot make

Stop and ask, do not guess:
- **D1** — does the monthly payment collect net VAT, or 7.5% of gross profit? Blocks Phases 9-10.
- **D4** — does `UNKNOWN` turnover charge VAT or stay exempt? Blocks Phase 6.

---

## The phases

| # | Work item | Outcome | Blocked by | Size |
|---|---|---|---|---|
| 0 | — | Flag off, baseline green | — | 30 min |
| 1 | TAX-04 | Validator stops inventing 7.5% | — | 30 min |
| 2 | TAX-01 | `resolveTaxPolicy()` exists | — | 1 day |
| 3 | TAX-03 | Frontend can read the policy | 2 | half day |
| 4 | TAX-07 | Form shows the right VAT rate | 3 | 1 day |
| 5 | TAX-05/06 | Server enforces the rate | 1, 2, 4 | 1 day |
| 6 | TAX-02 | Quiz config cannot contradict itself | **D4** | half day |
| 7 | TAX-08 | Copy and PDFs tell the truth | 3 | 1.5 days |
| 8 | TAX-09 | Profiled calculation is correct | **D1** | 1 day |
| 9 | TAX-10/11 | The charged number comes from the engine | **D1** | 1.5 days |
| 10 | TAX-12…16 | Every consumer agrees | 9 | 1.5 days |
| 11 | TAX-17…21 | It stays correct | 9 | 2 days |
| 12 | TAX-22 | Optional: filing-grade VAT | 9 live | 1.5 days |

**Phases 0-5 plus 7 are the whole user-visible fix.** Everything after changes money and needs a decision.

---

## Phase 0 — Safety net

**Do:**
1. Set `TAX_USE_PROFILED_CALCULATION=false` in **dev, staging, prod**. Unset means on.
2. Add both to `backend/.env.example`:
   ```
   TAX_USE_PROFILED_CALCULATION=false   # true only when Phase 9 is approved
   TAX_DEFAULT_RATE=7.5
   ```
3. Record a green baseline.

**Check:** `cd backend && npm run typecheck && npm run test:unit`

**Rollback:** revert the env var.

**If it is already red:** report it. Do not fix it here.

---

## Phase 1 — TAX-04: stop the validator inventing 7.5%

**File:** `backend/src/validators/invoice.validator.ts`

**Do:** line 25, `.default(7.5)` → `.optional()`. Nothing else.

**Check:** `cd backend && npm run test:unit -- invoice && npm run typecheck` — all existing tests still pass. This phase is deliberately invisible: `createInvoice` still supplies `?? 7.5`.

**Rollback:** restore the default.

**Why first:** 15 minutes, and every later invoice fix is inert without it.

---

## Phase 2 — TAX-01: build the resolver

**Files:** CREATE `backend/src/services/tax/tax-policy.service.ts`, CREATE `backend/tests/unit/tax-policy.service.test.ts`

**Do:** export exactly this, nothing more:

```ts
export interface BusinessTaxPolicy {
  source: 'PROFILE' | 'DEFAULT';
  vat: { chargeable: boolean; rate: number; reason: string | null };
  incomeTax: { type: 'CIT' | 'PIT'; rate: number; devLevyRate: number };
}
export async function resolveTaxPolicy(businessId: string): Promise<BusinessTaxPolicy>
```

Rules:
- Read `business_tax_profiles` once per call (`completedAt`, `computedConfig`). No caching.
- No profile, or empty `computedConfig` ⇒ `source: 'DEFAULT'`, `vat.chargeable: true`, `vat.rate: config.tax.defaultRate`. This reproduces today exactly.
- With a profile ⇒ `chargeable = !vatExempt && mustChargeVat`; `rate = chargeable ? config.tax.defaultRate : 0`; income tax from `incomeTaxType` / `citRate` / `devLevyRate`.
- A row with `vatExempt: false` **and** `mustChargeVat: false` is legacy junk: treat as not chargeable, `logger.warn` with the businessId.

**Check:** `npm run test:unit -- tax-policy.service && npm run typecheck`. Five tests: `UNDER_25M`, `M50M_TO_100M`, `ABOVE_100M`, sole proprietor, no profile.

**Rollback:** delete the two files. Nothing imports them.

---

## Phase 3 — TAX-03: expose the policy

**Files:** `backend/src/services/tax/tax-profile.service.ts`, `backend/src/controllers/tax-profile.controller.ts`, `backend/src/routes/tax-profile.routes.ts`

**Do:** add `GET /businesses/:businessId/tax-policy` returning the resolved policy.

**Critical:** `tax-profile.routes.ts:9` has `router.use(requireActiveSubscription)`, which applies to the whole file. Mount `/tax-policy` on a router with **`authenticate` only** — the invoice form must work during a grace period. Authorise with the existing `tax.read` permission.

**Check:** owner `200`; no access `403`; lapsed subscription still `200`.

```bash
curl -H "Authorization: Bearer <token>" localhost:<port>/businesses/<id>/tax-policy
```

**Rollback:** remove the route. Nothing consumes it until Phase 4.

---

## Phase 4 — TAX-07: the form learns the rate

> **Must merge before Phase 5.** The form posts `vatRate` on every create; enforce first and you block every exempt business.

**File:** `frontend/src/pages/InvoiceForm.tsx`

**Do:**
1. Fetch `/businesses/:id/tax-policy` on mount — copy the pattern from `TaxProfileCard.tsx:48`.
2. Line 131: seed `vatRate` from the policy (`'0'` when not chargeable), not the literal `'7.5'`.
3. Not chargeable ⇒ input `disabled`, value `0`, reason shown inline ("VAT exempt — turnover under ₦25M"). Keep it **visible**; hiding it looks like a bug.
4. Fetch failed or still loading ⇒ keep today's `'7.5'`. Never block the form on this.
5. Edit mode keeps the stored invoice's rate (`:165`), not the policy.

**Check:** `cd frontend && npm test` (confirm the script name in `frontend/package.json`) + browser check with one exempt and one normal business.

**Rollback:** revert the file. Phase 5 is server-side and still protects the data.

---

## Phase 5 — TAX-05/06: enforce server-side

**File:** `backend/src/services/invoice/invoice-crud.service.ts`

**Do:**
1. Create (`:152`): `input.vatRate ?? 7.5` → `policy.vat.chargeable ? (input.vatRate ?? policy.vat.rate) : 0`.
2. Not chargeable **and** a non-zero rate was sent ⇒ `AppError(422, 'VAT_EXEMPT_BUSINESS', ...)`, message names the profile reason.
3. Update (`:383`): `vatRateChanged` is `input.vatRate !== undefined`. Same check before the recompute at `:387-422`.
4. **Do not** add a draft guard — `:349-355` already returns `409` for non-draft invoices.
5. **Do not** zero existing invoices. Forward-only.

**Check:** `npm run test:unit -- invoice`. Three new tests: exempt + no rate ⇒ 0; exempt + 7.5 ⇒ 422; default profile ⇒ unchanged.

**Rollback:** revert the hunk. Issued invoices are untouched either way.

**Watch after deploy:** `VAT_EXEMPT_BUSINESS` 422s in the logs. Expect some — those are businesses whose profile says exempt while they were charging VAT. That list is the migration's real work, not a bug.

---

## Phase 6 — TAX-02: quiz consistency

> **Blocked on D4.** Stop and ask which direction.

**Files:** `backend/src/shared/tax-quiz-engine.ts` (VAT block `:75-87`), `frontend/src/lib/tax-quiz-engine.ts`, `backend/tests/unit/tax-quiz-engine.test.ts`

**Do:** after the VAT block, make the flag consistent so `UNKNOWN` cannot leave both `vatExempt` and `mustChargeVat` at their defaults. Keep the existing review reason.

**Editing the frontend copy:** change the same lines **by hand**. Backend is CRLF, frontend is LF — copying the file over adds line-ending noise to every future diff.

**Check:** `npm run test:unit -- tax-quiz-engine` + `diff -w backend/src/shared/tax-quiz-engine.ts frontend/src/lib/tax-quiz-engine.ts` should show only your change. Test asserts `mustChargeVat === !vatExempt` for all five turnover answers.

**Rollback:** revert. Stored configs are unaffected — no migration.

---

## Phase 7 — TAX-08: make the copy honest

**Three PRs, this order. Do not skip 7b — those are the documents a tax authority reads.**

**7a — screens** (`frontend/`):
`Dashboard.tsx:1348`, `TaxReports.tsx:810,973`, `VerifyEmail.tsx:243`, `FinalizeConfirmationModal.tsx:298`, `PaymentConfirmationModal.tsx:191` (says `7.50%` — a `7.5%` search misses it), `layout/AuthLayout.tsx:71`, `TaxProfileCard.tsx:259`, `TaxAssessmentModal.tsx:280,285`, `debtors/WriteOffModal.tsx:119`.

**7b — generated documents** (`backend/`):
- `invoice.pdf.ts:420-423` — **suppress the VAT line when `vatAmount === 0`**. An exempt invoice must not print "VAT (0%) ₦0.00".
- `tax-slip.pdf.ts:274`, `tax-slip-seal.pdf.ts:57,131` — print the real basis, not the 7.5% formula in prose.
- `sales-receipt.pdf.ts:269` — remove the `|| 7.5` fallback.
- `config/swagger.ts:425`.

**7c — email:** `pnl-statement-ready.ts:93,147`, `welcome.ts:71,119`, `tax-due-date.ts:81`.

**Check:** render one invoice PDF and one tax-slip PDF for an exempt business; the extracted text must not contain `7.5`.

**Rollback:** revert per file, in the right repo.

---

## Phase 8 — TAX-09: fix the profiled calculation

> **Blocked on D1.**

**Files:** `tax-profiled-calculation.service.ts`, `shared/helpers/tax.ts`

**Do:**
1. Input VAT (`:95,122,157`) currently includes salaries. Use `isVatBearingExpense()` (`helpers/tax.ts:29`) over per-category totals. New optional `expensesByCategory` input; absent ⇒ today's behaviour.
2. Empty config (`:185-198`) silently returns `grossProfit * 7.5 / 100` — a hard-coded literal, the only place that ignores even the env rate. Return an explicit review result instead.
3. Leave the five scenarios alone. Only inputs change.

**Check:** `npm run test:unit -- tax-profiled`. New cases: salary-only ⇒ zero input VAT; `completedAt` set with `{}` ⇒ review, not 7.5%.

**Rollback:** revert. Nothing calls the dispatcher yet.

---

## Phase 9 — TAX-10/11: wire the dispatcher

> **Blocked on D1. Confirm Phase 0's flag is `false` in every environment before merging.**

**Files:** `tax-report.service.ts`, `tax-calculation-strategy.ts`, `reminder/reminder-generation.service.ts`

**Do, in this order:**
1. **Fix the override** (`tax-calculation-strategy.ts:62-69`): it accepts `taxRateOverride` and drops it on the profiled path. Forward it into `calculateProfiledTax`, or reject it with a clear error. Pick one — do not leave it silent.
2. `calculateTax` (`:13`, body `:68-78`): call `calculateTaxWithStrategy`, persist `taxPayable` / `taxRate`. Return `advisory` in the response only — **there is no column, do not add one.**
3. `finalizeReport` (`:315-317`): replace the legacy recompute. **This is the most important line in the project** — it is where a correct draft becomes a wrong filed number.
4. `autoFinalizeConcludedMonth` (`:396-397`, `:447-448`): same substitution, both branches.
5. `autoFinalizeConcludedMonthForAllBusinesses` (`:470`): fetch each business's policy once, pass it via the existing `profile` parameter.

**Check:** `npm run test:unit -- tax-calculation tax-finalization`. New: exempt profile finalised ⇒ stored `taxPayable` is `0`; override behaves identically on both strategies.

**Rollback:** revert. The flag is the second lever. Already-finalised rows keep historical values — correcting them is a separate, deliberate exercise.

**Watch after deploy:** compare 10 real businesses month-by-month against the pre-deploy numbers before flipping the flag anywhere.

---

## Phase 10 — TAX-12…16: the remaining consumers

**Files:** `tax-analytics.service.ts:134,142,151,168`, `statement.service.ts:498-503`, `payout-preview.service.ts:235`, `ai-context.service.ts:322,351` **and** `ai.service.ts:165,453`, `tax-payment.service.ts:151`

**Do:** replace each inline formula with the dispatcher result.

- **AI:** also fix the system prompt at `ai.service.ts:165` ("strictly 7.5% of Gross Profit"). Correct numbers in the context will not save you if the prompt states the rule.
- **Payout:** exempt business ⇒ reserve `0`. Keep `Math.max(0, ...)`.
- **Payment:** do not compute a second number. Derive the basis from the policy. `ZERO_TAX` already exists (`:155-157`) — no new guard.

**Check:** `npm run test:unit && npm run typecheck`. **There is no test for `payout-preview.service.ts`** — create `tests/unit/payout-preview.test.ts`.

**Rollback:** revert per file.

---

## Phase 11 — TAX-17…21: keep it correct

1. **TAX-17** — review banner in Settings when `needsManualReview`. Copy `TaxProfileMigrationBanner.tsx`.
2. **TAX-18** — after a profile save, recalculate unlocked reports for the current year; locked stay untouched (log only, no column for a note). The audit diff needs the **previous** config: read the row *before* the upsert at `tax-profile.service.ts:51`.
3. **TAX-19** — trailing-12-month settled turnover vs the declared bucket; on a crossing set `needsManualReview` with a reason. **Never auto-change the profile.**
4. **TAX-20** — label PAYE/WHT/CGT advisory where no workflow exists.
5. **TAX-21** — `backend/scripts/check-tax-engine-parity.ts`, **normalising line endings**, plus an npm script. Without normalisation it fails on line one for no reason.

**Check:** `npm run test:unit && npm run typecheck`, parity script exits `0`.

---

## Phase 12 — TAX-22: optional

**Only if someone needs a filing-grade VAT figure.** Narrower than the plan first implied.

Invoice-linked sales **already** store `subtotal`, `vatAmount`, `discount` in `salesTransaction.metadata` (`:628-630`) and link via `Invoice.linkedSaleId`. Only cash, DVA and imported sales lack a split.

If you proceed: add `Expense.vatAmount Decimal?`, `Expense.vendorTin String?`, `SalesTransaction.vatAmount Decimal?` — all nullable, one migration, no enum changes. Stop booking VAT-inclusive totals as revenue at `markInvoicePaid` (`:555`).

**Check:** migration on a copy of production data; existing rows valid with `NULL`.

---

## Every PR

- [ ] `cd backend && npm run typecheck` clean
- [ ] `cd backend && npm run test:unit` — nothing deleted, nothing skipped
- [ ] Frontend touched? `cd frontend && npm test` clean
- [ ] No new literal `7.5`
- [ ] `git status` shows only the phase's files
- [ ] PR title names the work item (`TAX-05`)

## Stop and ask

- A test fails and you don't understand why.
- The phase is marked BLOCKED.
- You need a file that isn't listed.
- You're tempted to refactor something adjacent. Note it, move on.
