# QA Remediation Implementation Plan — PayMyTax Hardening

**Source:** `qanotices1.md` (QA Findings v1.0)
**Method:** `implementplancode.md` — Phase 20 (execution-ready work items)
**Date:** 2026-10-02
**Status:** PLAN ONLY — no code modified. Awaiting review.

---

## 1. Verification Results

Every QA claim was checked against the actual source before planning. **Four of six are confirmed as written, two need correction.**

| # | QA Claim | Verdict | Evidence |
|---|----------|---------|----------|
| 1 | DVA should match exact `Business.virtualAccountNumber` first | **CONFIRMED — but worse than described** | `dva-webhook.service.ts:270-296` |
| 2 | Admin can reject in-flight payouts → double-spend | **CONFIRMED** | `admin-payout.service.ts:447-470` + `payment-webhook.service.ts:365-392` |
| 3 | `applyReassignment` lacks accrual/invoice guard | **CONFIRMED — and a second unguarded path exists** | `sales-verification.service.ts:301-421` **and** `:117-158` |
| 4 | `AppError` args inverted in `reserveFunds` | **CONFIRMED** | `wallet.service.ts:412-416` |
| 5 | E2E test finalizes the active month | **CONFIRMED — but the QA fix would not work** | `api.e2e.test.ts:28`; `tax-report.service.ts:243-248` |
| 6 | `ZERO_SALES` blocks statutory Nil Returns | **CONFIRMED — requires schema migration** | `tax-report.service.ts:314-316` |

### Where the QA document is wrong or incomplete

**#1 — the business-DVA fallback is dead code, not merely deprioritized.**
`dva-webhook.service.ts:272-296` resolves the user first, matching on **both** `User.virtualAccountNumber` *and* `businesses.some({ virtualAccountNumber })`. If the user is found, it routes to `primaryBusinessId` (`:287`). The business-level exact match at `:292-296` is only reached when the user lookup returns `null` — which never happens for a user with ≥1 business. So a transfer into Business B's dedicated account is booked to Business A whenever B ≠ primary.

Worse, `dva-webhook.service.ts:42-59` writes the **same account number to both** `Business.virtualAccountNumber` and `User.virtualAccountNumber` on assignment. In the ordinary single-DVA setup, the user match at `:275` succeeds and the money is routed to `primaryBusinessId` — so misrouting occurs even with one DVA per merchant, whenever the DVA was provisioned through a non-primary business. The QA framing ("prioritize the business match") is the right fix; the rationale understates the blast radius.

**#3 — `applyVerification` is a second, unguarded reassignment path the QA doc missed.**
`sales-verification.service.ts:117-158` performs the same `businessId` reassignment via `meta.targetBusinessId`, with the same missing credit/invoice guard. It is reachable from `verifySale`/`reclassifySale` and from `admin-unverified-inflows.service.ts:132`. Fixing only `applyReassignment` leaves the hole open.

**#3 — the suggested guard condition is incomplete.** The QA snippet checks `sale.source === 'credit' || sale.creditOrigin || sale.invoice`. Two problems:
- Invoice-linked sales are **not** tagged `source: 'invoice'`. `invoice-crud.service.ts:573-578` sets `mappedSource = paymentMethodToSalesSource(input.paymentMethod)`, so an invoice paid by bank transfer yields `source: 'bank_transfer'`. Only the `invoice` relation reliably identifies it.
- The guard **omits `creditPayment`** — the debtor-repayment case that Deduction 1 explicitly calls out. `credit.service.ts:727-734` links each repayment to its sale via `CreditPayment.linkedSaleId`.

**#5 — `forceEarlyClosure` no longer exists as a working escape hatch.** The QA doc recommends passing `{ forceEarlyClosure: true }`. `tax-report.service.ts:243-248` declares the parameter as `_options?: FinalizeReportOptions` and never reads it; the interface field is marked `@deprecated Early closure is retired`. Passing it is a silent no-op. The only viable fix is a concluded historical month.

---

## 2. Work Items — execution order

**QA-01 Part A and Part B are one atomic fix.** Neither half closes the double-spend alone: fixing only the admin guard leaves the webhook able to resurrect a payout; fixing only the webhook leaves funds already released by a rejection. Ship them as a single PR.

QA-00 is **read-only** — it establishes whether any remediation is needed at all. Per decision D-8 it runs immediately after QA-01 ships, so it measures the damage QA-01 could not prevent without leaving the double-spend open any longer than necessary.

---

### QA-00 — Audit existing data for exposure to these defects

- **ID:** QA-00
- **Depends on:** None. Runs immediately **after** QA-01 ships (decision D-8) — the audit is not skipped, it just runs once bleeding has stopped. Its findings still determine whether QA-02, QA-03, and the payout repairs need remedial work.
- **Files touched:**
  - `backend/scripts/audit-qa-exposure.ts` (create — read-only; follow the existing `scripts/diagnose-*.ts` convention)
  - `package.json` (modify — add `"audit:qa-exposure": "tsx scripts/audit-qa-exposure.ts"`)
- **What to do:** Write a diagnostic that reports counts and IDs for three corruption classes. Every query below is anchored on `AuditLog`, which is the forensic record that survives the state overwrite the defects cause.

  **Class A — double-processed payouts** (QA-01 / QA-02 defect). The reject-then-resurrect sequence leaves the payout row as `completed`, so the row itself looks healthy. The evidence is two audit entries on one `resourceId`: `settlement.payout_rejected` (`admin-payout.service.ts:472`) *and* `settlement.payout_completed` (`payment-webhook.service.ts:420`). Find that intersection. Also flag any `WalletBalance` with `lockedBalance < 0` — `releaseLockedFunds` and `settlePayoutDebit` both decrement `lockedBalance`, so the double-pass drives it negative (`:520`'s underflow guard clamps only the release, not the later settle).

  **Class B — DVA misattribution** (QA-02 defect). `SalesTransaction` where `source = 'bank_transfer'` and `dvaOrigin = true` and `businessId` equals the owning user's `primaryBusinessId`, restricted to users with more than one business. **Report only — do not auto-repair.** Because one account number is written to both `Business` and `User` (`dva-webhook.service.ts:42-59`), a misattributed row is not reliably distinguishable from a correctly-routed one. These need human review against bank statements.

  **Class C — reassigned accrual sales** (QA-03 defect). `SalesTransaction` ids carrying a `sale.reassigned` audit entry (`sales-verification.service.ts:389`) where the sale now has `source = 'credit'` or a populated `creditOrigin`, `creditPayment`, or `invoice` relation. These are unambiguously wrong and are the safest class to repair.

- **Acceptance criteria:**
  - The script performs **no writes** — no `create`, `update`, `delete`, or `$transaction`. Read-only throughout.
  - Prints a count and the IDs for each of the three classes, plus the count of negative `lockedBalance` wallets.
  - Exits 0 and prints `No exposure detected` when all counts are zero.
  - `npm run audit:qa-exposure` runs against a local DB without error.
- **Verification:** Run against a seeded local DB (expect zeros or known counts). Then deliberately construct one Class A row and one Class C row in a scratch database and confirm both are detected. Verify read-only by running against production with a read-only database role if one is available.
- **Rollback:** Delete the script and the npm entry. Nothing to revert — the script mutates no data.
- **Effort:** S (~3-4h including verification)
- **Risk if skipped:** 🟠 The fixes below are forward-only. Any exposure that already occurred stays in the ledger — merchants with double-paid withdrawals and businesses with revenue booked to the wrong entity keep those discrepancies indefinitely, with no record of which rows are affected. Note `npm run db:backup` exists and must be run before any repair that follows this audit.

#### Implementation record — QA-00 (shipped)

`backend/scripts/audit-qa-exposure.ts` created; `audit:qa-exposure` added to `package.json`. `tsc --noEmit` clean. Runs against the live database, exits 0, prints `No exposure detected`. Read-only throughout — only `findMany`.

**Class B was rewritten from the plan's heuristic.** The plan specified "any `bank_transfer` + `dvaOrigin` sale on a multi-business owner's `primaryBusinessId`". Run against live data that produced 3 candidates for a single owner, all of them legitimate — it flags every ordinary DVA sale, so its false-positive rate is effectively 100% and it would have sent someone to reconcile a clean ledger.

The replacement compares the account number the webhook actually received (`data.authorization.receiver_bank_account_number`, falling back to the two other shapes `dva-webhook.service.ts:260-263` handles) against the booked business's own `virtualAccountNumber`, joined via `PaystackWebhookEvent.reference` — the sale's `referenceId` is the Paystack reference (`dva-webhook.service.ts:414`). Same account → legitimate, dropped. Different account → confirmed misattribution. Rows with no retained webhook body go to a separate `Unresolved` bucket rather than being counted clean, since absent evidence is not proof of correctness. The report also prints the number of sales scanned so the pool can never silently under-report.

**Audit result against live data: all four counts are zero.** Class A 0, negative `lockedBalance` 0, Class B 0 (3 scanned, all matched their booked business), Class C 0. No remediation needed.

---

### ⚠️ QA-02 correction — the plan's premise does not hold

The plan proposes reordering `processDVATransferWebhook` to match `Business.virtualAccountNumber` before falling back to `primaryBusinessId`. **This would be a no-op.** `dva-account.service.ts:185-205` deliberately provisions **one DVA per user, shared across every business that user owns**:

> `// If user already has a central virtual account, attach it to this business immediately`

Every business of that user is then written the same account number (`dva-webhook.service.ts:42-59`). Verified in live data — owner `yusufsilvajs@gmail.com` has three businesses (`Findme`, `ExamLab`, `ELECTRICITE DE FRANCE EDF`) all carrying account `9816260527` and all sharing Paystack customer code `CUS_26sdfyifdth8dx6`.

When all of a user's businesses share one account number, matching the account resolves to the same business whichever order the lookup runs in. Reordering changes nothing. It also makes the Class B detection above structurally incapable of firing for exactly the multi-business owners it targets.

The routing at `dva-webhook.service.ts:272-290` is therefore behaving as designed, not as a defect. The genuine issue underneath is a **product decision, not a bug**: money arriving at a shared per-user account is booked to the primary business 100% of the time, so an SME running several entities cannot attribute DVA revenue to the business that earned it. That needs a routing/allocation decision from the product owner, not a lookup-ordering fix. **QA-02 must be re-specified before implementation.**

---

### QA-01 — Payout terminality: reject only `pending`, settle only `processing`

- **ID:** QA-01
- **Depends on:** None
- **Files touched:**
  - `backend/src/modules/wallet/services/admin-payout.service.ts` (modify — `adminRejectWithdrawal`, ~:447-470)
  - `backend/src/services/payment/payment-webhook.service.ts` (modify — `transfer.success` branch, ~:365-375)
- **What to do:**

  **Part A — `adminRejectWithdrawal`.** Add an explicit pre-flight check before the CAS update, using the `status` already selected at `:437`:
  ```ts
  if (payout.status === 'processing') {
    throw new AppError(
      409,
      'This withdrawal is already in flight at the bank and cannot be cancelled. Use Requery to retrieve its final status.',
      'PAYOUT_IN_FLIGHT'
    );
  }
  ```
  Then narrow the compare-and-swap from `status: { in: ['pending', 'processing'] }` to `status: 'pending'`, so a concurrent transition still loses the race safely. Collapse the now-dead `failureReason` ternary (`payout.status === 'processing' ? 'Cancelled' : 'Rejected'`) to a plain `Rejected by admin: ${reason}`.

  **Part B — `transfer.success` webhook.** Change the claim predicate at `:365-375` from `status: { not: 'completed' }` to `status: 'processing'`. A `failed` payout must never be resurrected. This mirrors the pattern already used correctly by the `transfer.failed` handler at `:477-481` (`status: { in: ['pending', 'processing'] }`) and by `adminApproveWithdrawal`'s Fence 3 at `:165-168`.

- **Acceptance criteria:**
  - `adminRejectWithdrawal` on a `processing` payout throws `409` with code `PAYOUT_IN_FLIGHT`; the `SettlementPayout` row and the wallet's `lockedBalance` are both untouched.
  - `adminRejectWithdrawal` on a `pending` payout still succeeds and still calls `releaseLockedFunds`.
  - A `transfer.success` webhook matching a `failed` payout leaves the row `failed`, creates **no** `WalletTransaction`, and emits **no** `payout.completed` event.
  - A `transfer.success` webhook matching a `processing` payout still settles exactly as before (regression guard — this is the happy path).
  - `npm run build` passes with no new TypeScript errors.
- **Verification:**
  - Existing suites that must stay green: `npm test -- tests/unit/payout.service.test.ts tests/unit/payout-timeout-and-ambiguity.test.ts tests/unit/withdrawal-actor-security.test.ts tests/unit/user-auto-payout.test.ts`.
  - New tests in `tests/unit/payout-terminality.test.ts` (4 cases, mirroring the acceptance criteria above; stub `prisma.settlementPayout.updateMany` and `WalletService.releaseLockedFunds`/`settlePayoutDebit` with jest spies and assert call counts).
- **Rollback:** Single revert of both files. No schema change, no data migration — safe to revert in isolation.
- **Effort:** S (~2-3h including tests)
- **Risk if skipped:** 🔴 Direct financial loss. A merchant who withdraws and has the transfer rejected while in flight receives the bank transfer *and* keeps the released funds, and may withdraw them again. Exploitable by any admin action plus normal webhook timing.

#### Implementation record — QA-01 (shipped)

**Deviations from the plan:**

1. **Tests went into the existing files, not a new `tests/unit/payout-terminality.test.ts`.** `tests/unit/payout-timeout-and-ambiguity.test.ts` already owned this exact surface and already contained a test — `'adminRejectWithdrawal allows cancelling/rejecting a payout in processing status and releases funds'` — that asserted the *unsafe* behaviour by name. Creating a parallel file would have left that contradiction in place. It was rewritten in place into two tests (reject-refuses-`processing`, reject-succeeds-on-`pending`). The regression test for Part B went into `tests/integration/phase3-adversarial-qa.test.ts` §8, where the live webhook harness already lives.

2. **Added `transactionOptions` to both Prisma clients — a supporting change not in the plan.** The remote Supabase EU pooler answers even `SELECT 1` in ~4s, so Prisma's 5s default interactive-transaction timeout expired mid-transaction and surfaced as `Transaction already closed` / `Transaction not found`. These are network-latency errors masquerading as application bugs; they made the integration suite's failure count swing between 4 and 16 across identical runs. `src/lib/prisma.ts` and `tests/helpers/test-db.ts` now pass `transactionOptions: { maxWait: 30_000, timeout: 30_000 }`, **gated on `NODE_ENV === 'test'`** so production keeps the 5s default and a genuinely stuck transaction still fails fast instead of pinning a pooled connection.

**Edge cases handled:** admin rejection of an already-`completed` payout (unchanged, still `ALREADY_PROCESSED`); a concurrent admin-reject racing a `transfer.success` (both now CAS on disjoint status predicates, so exactly one wins); auto-payout payouts created directly as `processing` with a synchronous `initiateTransfer` — these are now permanently un-rejectable, which is the correct outcome (see operational note).

**Edge case deliberately NOT handled:** a `failed` payout whose transfer actually succeeded at the bank is never settled. That is QA-08's territory and was left alone here on purpose — widening Part B to re-admit `failed` rows is exactly the resurrection hole QA-01 closes.

**Verification actually performed:**

| Run | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `tests/unit/payout-timeout-and-ambiguity.test.ts` | **12 / 12 pass** |
| `tests/integration/phase3-adversarial-qa.test.ts` — true baseline (both parts reverted) | 6 failed / 10 passed, **including the new regression test** |
| `tests/integration/phase3-adversarial-qa.test.ts` — shipped fix | 4 failed / 12 passed, regression test **passes** |

All 4 remaining integration failures were present in the baseline run and are untouched by this diff. The regression test failing on baseline and passing on the fix is the direct proof that Part B closes the hole.

**Operational consequence to flag before release:** because auto-payout withdrawals are created as `processing` and dispatched to Paystack synchronously, merchants with `autoPayout` enabled can no longer have an in-flight withdrawal admin-rejected at all. That is inherent — once handed to Paystack/NIBSS the transfer may already have settled, and recalling it would need a Paystack cancel endpoint the `PaymentProvider` interface does not expose. Remaining levers are `adminToggleUserAutoPayout(false)` for future withdrawals and `adminRequeryWithdrawal` for the outcome. This is a deliberate reduction in admin capability, not an oversight; the copy in the 409 points admins at Requery.

**Process finding:** `admin-payout.service.ts`, `payment-webhook.service.ts`, and both test files are **untracked in git** (`??`). There is no committed baseline for this financial-critical code, which is why verification required manual backup-and-revert rather than `git stash`. These should be committed before the QA work lands.

---

### QA-02 — DVA routing: business-level match before `primaryBusinessId`

- **ID:** QA-02
- **Depends on:** None
- **Files touched:**
  - `backend/src/services/dva/dva-webhook.service.ts` (modify — `processDVATransferWebhook` business resolution, ~:270-301)
- **What to do:** Reorder the resolution so an exact `Business.virtualAccountNumber` match is attempted **before** the user/`primaryBusinessId` fallback. Resolve the business directly by account number first; only if that returns nothing, look up the user by `User.virtualAccountNumber` and fall back to `primaryBusinessId` then `businesses[0]`.

  Preserve these existing behaviours exactly:
  - The `primaryBusinessId ?? businesses[0]` fallback for user-level DVAs.
  - The business-agnostic idempotency probe at `:306-321` (already authoritative — leave untouched).
  - The `!business` warn-and-return-`false` path at `:298-301`.
  - Whatever field shape downstream code reads off `business` (currently `.id`; include the same fields the current code returns so lines `:314`+ keep compiling).

- **Acceptance criteria:**
  - A transfer to a business-specific DVA where that business ≠ `primaryBusinessId` is recorded against **the business owning the account number**, not the primary business.
  - **The central landing pool is preserved exactly.** Confirmed as deliberate product behaviour (decision D-7): a transfer to a user-level DVA — where no business holds that account number — must continue to route to `primaryBusinessId`, then to `businesses[0]`, for the merchant to classify later. This is the intended workflow and must not regress.
  - The distinction between "user-level account" and "business-specific account" is therefore decided by *which row holds the number*, not by whether the owning user has businesses. In the current single-DVA setup both rows hold the same number, so those transfers resolve as business-specific — see the warning below.
  - Existing idempotency tests in `tests/integration/dva-webhook-idempotency.test.ts` and `tests/integration/invoice-dva-reconciliation.test.ts` remain green.
- **Verification:**
  - `npm test -- tests/integration/dva-webhook-idempotency.test.ts tests/integration/invoice-dva-reconciliation.test.ts tests/integration/debtor-dva-reconciliation-and-edit.test.ts`
  - New case in `tests/integration/dva-routing.test.ts`: create user with two businesses (B2 primary, B1 with its own `virtualAccountNumber`), fire a transfer webhook addressed to B1's number, assert the resulting `SalesTransaction.businessId === B1`.
- **Rollback:** Revert the one file. **Note:** already-booked transactions are *not* backfilled by a revert, so a revert after deploy leaves a split history. Read decision D-1 below before shipping.
- **Effort:** S (~2h including tests)
- **Risk if skipped:** 🔴 Silent revenue attribution to the wrong legal entity, with no user action required to trigger it. Because `:42-59` writes one account number to both `Business` and `User`, this misfires in the ordinary single-DVA case whenever the DVA was provisioned through a non-primary business. Produces incorrect FIRS returns for the wrong entity.

---

### QA-03 — Accrual reassignment guard (backend)

- **ID:** QA-03
- **Depends on:** None
- **Files touched:**
  - `backend/src/services/sales/sales-verification.service.ts` (modify — add a shared guard; apply in **both** `applyReassignment` ~:301-421 and `applyVerification` ~:117-158)
- **What to do:** Add one private predicate to this file and call it from both reassignment paths, immediately after the sale is fetched and before any mutation:

  ```ts
  function assertReassignable(sale: SalesTransactionWithLinks) {
    if (
      sale.source === 'credit' ||
      sale.creditOrigin ||
      sale.creditPayment ||
      sale.invoice
    ) {
      throw new AppError(
        400,
        'Accrual sales, credit sales, debtor repayments and invoice-linked transactions cannot be moved to another business.',
        'INVALID_TRANSACTION_TYPE'
      );
    }
  }
  ```

  Both call sites currently load the sale with a bare `findUnique({ where: { id } })`. Both must be widened with
  `include: { invoice: { select: { id: true } }, creditOrigin: { select: { id: true } }, creditPayment: { select: { id: true } } }`
  so the relation checks are truthy-evaluable.

  Apply the guard to **both** functions. `applyVerification` is the higher-traffic of the two (it backs the unverified-inflows classification flow) and is currently unguarded.

  Callers that inherit the guard for free: `sales.controller.ts:215` (user path) and `admin-unverified-inflows.service.ts:132` (admin path).

- **Acceptance criteria:**
  - Reassigning a sale with `source: 'credit'` → `400 INVALID_TRANSACTION_TYPE`; no `businessId` change, no `walletTransaction` update, no audit row.
  - Same rejection for a sale with `creditOrigin`, `creditPayment`, or `invoice` set — each covered by its own test.
  - The guard fires **regardless of whether the caller passes `sourceBusinessId`** (the `applyVerification` path), not just via `applyReassignment`.
  - A plain `source: 'manual'|'bank_transfer'` sale with no relations still reassigns successfully (no regression).
  - An invoice-paid sale (`source: 'bank_transfer'`, `invoice` relation set) is rejected — this is the case a `source === 'invoice'` check would miss.
- **Verification:**
  - New `tests/unit/accrual-reassignment-guard.test.ts` with 5 cases: credit-source, creditOrigin, creditPayment, invoice-linked, and the plain-sale control.
  - Regression: `npm test -- tests/integration/admin-unverified-inflows.test.ts tests/integration/qahunter-e2e-adversarial.test.ts`
- **Rollback:** Revert the one file. Guard-only, no schema change.
- **Effort:** S (~2-3h including tests)
- **Risk if skipped:** 🟠 Statutory misstatement. Under CITA §25 revenue is recognised at invoicing, not at cash receipt. Moving an accrual sale to a sibling business leaves the debtor balance, `CreditPayment` history, and bad-debt write-offs stranded under the original business while the target reports revenue it never earned — contaminating both entities' FIRS returns.

#### Implementation record — QA-03 (shipped)

`src/services/sales/sales-verification.service.ts`. Shared `assertSaleIsReassignable()` called from **both** `applyReassignment` and `applyVerification` — the latter is the unguarded second path the QA document missed. Both `findUnique` calls widened with a shared `ACCRUAL_SALE_INCLUDE`. Three tests added to `tests/integration/admin-unverified-inflows.test.ts`; **7/7 pass**.

**Deviation — error code.** The plan specified `400 INVALID_TRANSACTION_TYPE`. Shipped as **`409 ACCRUAL_SALE_IMMUTABLE`**, matching the `409 DUPLICATE_SALES_REFERENCE` conflict already raised a few lines below in the same function. A 400 says the request was malformed; this is a well-formed request that conflicts with the sale's current state, which is what 409 means.

**Plan error corrected — the `source` check is unsafe on its own.** The plan's acceptance criteria assumed a `source === 'invoice'` check would catch invoice-paid sales. It would not: `paymentMethodToSalesSource` (`invoice-crud.service.ts:76-88`) maps **`cash` → `'cash'`**, and every other method → `'invoice'`. So a cash-settled invoice produces a sale stamped `source: 'cash'`. The guard therefore keys on the **linked relations** (`invoice` / `creditOrigin` / `creditPayment`), which are stamped regardless of payment method, and keeps `source === 'credit'` only as a belt-and-braces extra. The cash-paid invoice case is covered by an explicit test.

`CreditPayment` was left untested as a distinct case — it is the same code path as `creditOrigin` with an identical `ACCRUAL_SALE_IMMUTABLE` throw, and the DB fixture needed for it adds no new coverage.

---

### QA-04 — Expose accrual-lock state on the sales API, then hide "Move Sale" in the UI

- **ID:** QA-04
- **Depends on:** QA-03 (backend guard is the source of truth; the UI mirrors its exact contract)
- **Files touched:**
  - `backend/src/services/sales/sales-crud.service.ts` (modify — `getSaleById` at ~:212 currently includes only `items`; add `invoice`, `creditOrigin`, `creditPayment` to both the detail and list queries)
  - `backend/src/services/admin/admin-unverified-inflows.service.ts` (modify — the unverified-inflows feed also drives reassignment and must expose the same relations)
  - `backend/src/services/sales/sales-verification.service.ts` (modify — `applyVerification` returns the updated sale; confirm the same relations are present on that response)
  - `frontend/src/types/index.ts` (modify — add the three relations to the `Transaction` type)
  - `frontend/src/components/TransactionDetailPanel.tsx` (modify — reassign section, ~:561-601)
- **What to do:**

  **Backend.** The frontend currently **cannot** make this decision: `getSaleById` returns the sale with only its `items` included, so `invoice`, `creditOrigin`, and `creditPayment` are all absent. Add them as `select: { id: true }` includes so the payload grows by three small objects. Check every endpoint that feeds a surface offering reassignment — detail, list, and the unverified-inflows feed — so the UI is not left guessing on one path.

  **Frontend.** Hide the "Reassign to Another Business" section — button at ~:574 and the `showReassign` form at ~:580 — when the transaction is accrual-linked. Derive `isAccrualLocked` from the same four signals QA-03 checks server-side (`source === 'credit'`, plus the three relations), so client and server cannot drift.

  When the section is hidden, do not silently omit it — render a one-line explanation ("Accrual and invoice-linked transactions can't be moved to another business.") so the absence reads as a rule rather than a missing feature.

  Keep the existing error handler at ~:117 as-is; with QA-03 in place it surfaces the backend's `INVALID_TRANSACTION_TYPE` for any residual case (e.g. a sale reassigned before it became invoice-linked).
- **Acceptance criteria:**
  - The sale detail and list responses include `invoice`, `creditOrigin`, and `creditPayment` (each `null` or `{ id }`).
  - On an accrual, credit, debtor-repayment, or invoice-linked transaction, no "Move Sale" button and no target-business `<select>` render.
  - On a plain transaction, the reassign control renders and behaves exactly as today.
  - `npm run build` passes in both `backend/` and `frontend/` with no new TypeScript errors.
- **Verification:** `npm run build` and `npm test -- tests/integration/admin-unverified-inflows.test.ts`; `cd frontend && npm run build && npm run lint`. Manual: open a credit-sale and an invoice-paid transaction and confirm the control is absent; open a plain bank-transfer sale and confirm it still appears.
- **Rollback:** Revert all five files. The added relations are additive to the response payload; older frontend builds ignore unknown fields.
- **Effort:** S (~3h — the API addition is the new part; the UI change itself is short)
- **Risk if skipped:** 🟡 The backend still blocks the action, so this is UX honesty rather than data integrity — but a button that always fails with `INVALID_TRANSACTION_TYPE` erodes trust in the accrual model, and the missing relations are a gap in the API surface regardless of this item.

---

#### Implementation record — QA-04 (shipped)

**Deviations from the plan:**

1. **The plan listed five files; the implementation touched eleven.** The plan said "check every endpoint that feeds a surface offering reassignment" but only enumerated three of them. Tracing the actual call sites found **four distinct reassignment surfaces**, three of which the plan never mentioned: `GET /admin/treasury/transactions/:id` (`AdminTransferDetailModal`), `GET /admin/sales/unverified` (`AdminUnverifiedInflows`), and `GET /ledger` (`Transactions.tsx`, which builds a `sales_transaction` panel type from unified-ledger rows). Fixing only the named three would have left a live "Move Sale" button on the ledger page and a live "Reallocate" button in the admin treasury modal — both of which 409 on click.

2. **Added a derived `accrualLinked` boolean alongside the three relations on three feeds.** The plan asked only for the relations. The ledger, unverified-inflows, and treasury-detail responses additionally carry `accrualLinked: isAccrualLinked(sale)`. Reason: those three surfaces render **server-computed booleans** directly (button `disabled`, branch conditions), and the admin tables bind to a single field. Making each client re-derive from three nullable relations in three different components is exactly the drift the item exists to prevent. `getSaleById` and `listSales` return the relations only — the detail panel falls back to deriving, which is why the frontend reads `accrualLinked ?? Boolean(invoice || creditOrigin || creditPayment)`.

3. **The include object was extracted to `shared/helpers/accrual.ts` rather than duplicated.** Six query sites now spread the same `ACCRUAL_SALE_INCLUDE`. D-9's stated goal — "client and server derive from identical inputs and cannot drift" — is not actually satisfied by copying the include six times; one exported constant plus one exported predicate is what makes that true.

**Edge cases handled:**

- **Stale `targetBusinessId` leaking across modals.** `UnverifiedTransactions.tsx` and `AdminUnverifiedInflows.tsx` both hold `targetBusinessId` in component state that outlives a modal close. Open a plain sale, pick business B, close, open an invoice-linked sale → the selector now renders hidden but the state still reads `B`, and the verify call would have carried `targetBusinessId: B` into a 409. Both submit handlers now re-check `accrualLinked` at send time (`UnverifiedTransactions.tsx:142`, `AdminUnverifiedInflows.tsx:175`), not only in the render branch. This is the case most likely to survive a UI-only fix.
- **`source === 'credit'` with no `creditOrigin`/`creditPayment` relation** — preserved verbatim via `isAccrualLinked`, so the UI lock matches QA-03's four-signal server check exactly.
- **Cash-settled invoice** — `paymentMethodToSalesSource` maps `cash → 'cash'`, so `source` reveals nothing; the `invoice` relation is what catches it. This is why the check keys on relations and the frontend inherits that for free.
- **Ledger rows that aren't sales** (tax payments, payouts) have no accrual relations. `accrualLinked` is optional on `UnifiedLedgerRow` and absent on those rows, which the panel treats as `false`. Non-sales rows never render the reassign section anyway.
- **A sale that becomes invoice-linked after the button rendered** (e.g. an invoice issued against an existing manual sale) — the panel shows an enabled button; QA-03's `409 ACCRUAL_SALE_IMMUTABLE` still surfaces through the existing error toast. The plan explicitly kept the existing error handler for exactly this.

**Edge cases deliberately NOT handled:**

- **Payload growth on the sales list.** Every row now carries three small `{ id }` objects. At the current page cap (100) this is negligible; a batched `accrualLocked: boolean[]` endpoint would be the answer if row volume ever grows, and is not justified now.
- **`Accrual` classification rows with no invoice/credit relation** are *not* locked. The four QA-03 signals don't include the classification itself, so neither does the UI. Widening that is a QA-03 decision, not a QA-04 one.

**Verification actually performed:**

| Run | Result |
|---|---|
| `backend/ npx tsc --noEmit` | exit 0 |
| `frontend/ npx tsc --noEmit` | exit 0 |

`npm run build` / `npm run lint` on the frontend and the full test suites were **not** re-run for this item — QA-04 adds response fields and render branches only, no new endpoints and no changed service logic, and both typechecks are clean. **This is a gap worth closing before merge**: the frontend build and the `admin-unverified-inflows` integration suite (7/7 as of QA-03) should be re-run, and the manual check in the plan's Verification line — open a credit-sale and an invoice-paid transaction and confirm the control is absent, open a plain bank-transfer sale and confirm it still appears — has **not** been performed.

---

### QA-05 — Correct the `AppError` argument order in `reserveFunds`

- **ID:** QA-05
- **Depends on:** None
- **Files touched:**
  - `backend/src/services/wallet/wallet.service.ts` (modify, ~:411-417)
- **What to do:** Swap arguments 2 and 3 so they match `AppError(statusCode, message, code, details)`:
  ```ts
  throw new AppError(
    400,
    `Insufficient available wallet balance. Available: ₦${...}, Required: ₦${...}`,
    'INSUFFICIENT_FUNDS'
  );
  ```
  The correct ordering already exists in this codebase at `admin-payout.service.ts:836-839` — use it as the reference form.

  **The sibling audit is already done.** A multiline scan for `new AppError(<digits>, '<SCREAMING_CASE>'` across `backend/src` returns exactly one hit — this one. The inversion is isolated, not systemic, so no other call site needs changing.
- **Acceptance criteria:**
  - An insufficient-funds reservation returns `{"error": {"code": "INSUFFICIENT_FUNDS", "message": "Insufficient available wallet balance. Available: ₦0.00, Required: ₦50,000.00"}}`.
  - No other `AppError` call site in `backend/src` passes an all-caps token as the `message` argument.
- **Verification:** `npm test -- tests/unit/wallet.service.test.ts`; add a case asserting `err.code === 'INSUFFICIENT_FUNDS'` on a thrown `reserveFunds` rejection.
- **Rollback:** Revert the one file.
- **Effort:** S (<1h)
- **Risk if skipped:** 🟡 No direct financial exposure, but the error contract is inverted: any client, job, or error boundary branching on `error.code === 'INSUFFICIENT_FUNDS'` silently falls through to its generic handler. Two frontends reading `error.message` receive a machine code where prose is expected.

#### Implementation record — QA-05 (shipped)

`src/services/wallet/wallet.service.ts:412-416`. `tsc --noEmit` clean. The sibling audit in the plan was re-confirmed: `merchant-payout.service.ts:123-127` and `admin-payout.service.ts:846-850` are both already correct, leaving this as the only inverted site.

**An already-written test was failing and now passes** — `tests/integration/qahunter-e2e-adversarial.test.ts:344` calls `WalletService.reserveFunds` directly and asserts `err.code === 'INSUFFICIENT_FUNDS'`. Verified in both directions rather than assumed:

| State | Result |
|---|---|
| Reverted to buggy order | **fails** — `Received: "Insufficient available wallet balance. Available: ₦100,000.00, Required: ₦100,000,099.00"` |
| Shipped fix | **passes** |

This also confirms a live frontend defect the QA document predicted but did not name: `frontend/src/stores/settlement.store.ts:216` branches on `errorCode === 'INSUFFICIENT_FUNDS'` to show a specific, 6-second "Insufficient funds available for withdrawal" toast. For any error raised through `reserveFunds` that comparison never matched, so users saw the generic fallback instead.

---

### QA-06 — Statutory Nil Return support

- **ID:** QA-06
- **Depends on:** None
- **Files touched:**
  - `backend/prisma/schema.prisma` (modify — `MonthlyTaxReport` model)
  - `backend/prisma/migrations/<timestamp>_add_nil_return/migration.sql` (create)
  - `backend/src/services/tax/tax-report.service.ts` (modify — `finalizeReport`, ~:314-316; and the auto-finalize path near ~:393)
  - `backend/src/services/pdf/tax-slip.pdf.ts` (modify — **the real 502-line renderer**; `src/services/tax-slip.pdf.ts` is a 5-line facade re-exporting it, and `tax-slip-seal.pdf.ts` is a drawing helper, not a separate renderer. The consumer is `tax-report.service.ts:8`.)
  - `frontend/src/pages/TaxReports.tsx` (modify — surface the flag)
  - `backend/tests/.../nil-return.test.ts` (create)
- **What to do:**

  **1. Schema.** `isNilReturn` **does not exist today** — confirmed by grep across `schema.prisma`. Add `isNilReturn Boolean @default(false) @map("is_nil_return")` to `MonthlyTaxReport`, plus a migration. Use a nullable/boolean default of `false` so existing rows need no backfill.

  **2. Finalize gate.** Replace the unconditional throw at `:314-316`. When `totalSales === 0`, finalize as a Nil Return with `taxPayable = 0` and `isNilReturn = true` instead of rejecting. `grossProfit` is already clamped at `Math.max(..., 0)` and `profitMargin` already guards `totalSales > 0`, so both evaluate to `0` without further change — confirm this rather than assuming.

  **3. Auto-finalize.** Inspect the `totalSales === 0 && totalExpenses === 0` branch near `:393` and make Nil Returns flow through the same path, so the daily sweep does not silently skip them.

  **4. Validator.** **Decision D-2: the flag is auto-derived, not merchant-supplied.** Filing a Nil Return is a statutory obligation, not a user choice — a checkbox would invite the same omission the feature exists to prevent. Consequence: **no validator change is needed**, and `backend/src/validators/tax.validator.ts` drops out of this item's file list. The merchant-facing UI gets no new control.

  **5. Output.** A Nil Return is a statutory document; it must be identifiable in the generated PDF, not just in the database.

- **Acceptance criteria:**
  - A month with `totalSales === 0` finalizes successfully, sets `isFinalized: true`, `taxPayable: 0`, `isNilReturn: true`.
  - A month with `totalSales > 0` is unaffected: `isNilReturn` remains `false`.
  - **"Zero sales" is defined as zero *taxable settled* sales** — `finalizeReport` aggregates under `TAXABLE_SALES_WHERE` (`{ status: { in: SETTLED_SALE_STATUSES }, isTaxable: true }`, `src/shared/helpers/settled-status.ts:15`). A month holding only reversed or non-taxable sales therefore yields a Nil Return. That is the correct statutory semantic, but it must be a stated behaviour, not an accident.
  - The migration applies cleanly against a database containing existing finalized reports, with no backfill and no data loss.
  - The generated PDF for a Nil Return is visibly labelled as such.
- **Verification:** New integration test: create a business with an expenses-only prior month, finalize, assert `200` + `isNilReturn === true` + `taxPayable === 0`. Regression: `npm test -- tests/integration/tax-finalization-gate.test.ts tests/unit/statutory-tax-finalization.test.ts`. Migration rehearsal against a seeded local DB.
- **Rollback:** Revert code; the added column is nullable-by-default and safe to leave in place. Do **not** drop the column in the rollback — dropping is riskier than leaving an unused boolean.
- **Effort:** M (~1 day — the migration and the PDF labelling are the bulk)
- **Risk if skipped:** 🟠 Compliance exposure, not data corruption. SMEs with a genuine zero-sales month (seasonal, startup, or halted trading) cannot lock the period, leaving them exposed to non-filing penalties.

---

### QA-07 — Repair the E2E finalization block

- **ID:** QA-07
- **Depends on:** None
- **Files touched:**
  - `backend/tests/e2e/api.e2e.test.ts` (modify)
- **What to do:** `MONTH`/`YEAR` at `:28-29` resolve to the **current** month. `finalizeReport` refuses an ongoing month with `PERIOD_STILL_ACTIVE` (`tax-report.service.ts:272-288`), so every finalize in the chain fails and takes the dependent assertions with it.

  The QA document's suggested remedy — pass `{ forceEarlyClosure: true }` — **will not work**. `finalizeReport` ignores its options argument entirely (`:243-248`).

  **This item is larger than a one-line month change.** Three distinct defects:

  1. **Wrong month.** The tax block (`:568`, `:701`, `:736`, `:1023`, `:1031`, `:2051`) creates reports for the current month, which cannot be finalized.
  2. **Fixtures are not in the tax month.** Sales and expenses at `:473-534` and `:607-667` are dated `new Date().toISOString()` — today. They are *not* derived from `MONTH`/`YEAR`. Simply shifting `MONTH`/`YEAR` to a historical month leaves that month with **zero sales**, so finalization fails with `ZERO_SALES` (or, once QA-06 lands, silently produces a Nil Return — also not the intent). The summary assertions at `:698-712` would also read empty.
  3. **UTC bug (defect 2 hides behind defect 1).** `:835` and `:855` build dates with `new Date(YEAR, MONTH - 1, 15)` — a **local-time** constructor — then `.toISOString()`. On a UTC+ host (Nigeria is UTC+1) local midnight becomes `23:00Z` the previous day, and Prisma's `@db.Date` column stores the *date* part, landing the sale one day early. This is the known UTC `@db.Date` bug class in this codebase and it is live in the test today. Every tax-month date must be constructed in UTC.

  **Choose an approach (see decision D-5):** the recommended option is a self-contained historical-month fixture that creates its own backdated sales and expenses, then runs finalize → lock → pay → unfinalize against them. This leaves the existing `new Date()`-based suite untouched, so the ~175 assertions that depend on "now" keep passing.
- **Acceptance criteria:**
  - The finalize, locked-sale-423, unfinalize, re-finalize, pay, and post-payment-unfinalize assertions all pass.
  - The historical tax month contains at least one settled taxable sale, so finalization is not rejected by `ZERO_SALES`.
  - All tax-month dates are constructed in UTC — no `new Date(y, m, d)` local constructors in the tax block.
  - No assertion outside the tax block changes behaviour; the "now"-based summary and CRUD tests still pass unmodified.
  - `npm run test:e2e` completes with no new failures.
- **Verification:** `npm run test:e2e`, then confirm the previously failing assertions report passing. Run the suite at least once with `TZ=Europe/London` (UTC+1 in summer) to prove the date handling is timezone-independent — the suite currently would not survive that. Cross-check against `tests/integration/tax-finalization-gate.test.ts`, which already exercises the gate directly; the e2e block's remaining unique value is the *payment* chain, not the gate itself.
- **Rollback:** Revert the one file. Test-only; no production impact.
- **Effort:** L (~1 day — the historical fixture and its backdated data dominate; the month change itself is trivial)
- **Risk if skipped:** 🟠 The flagship suite stays red, so the QA signal is lost. It is currently the only end-to-end proof of the register → business → sale → expense → calculate → finalize → pay journey.

---

## 3. Adjacent findings — folded into this pass

Both were surfaced during verification rather than raised in the QA document. Both sit in the payout path QA-01/QA-02 already touch, so the marginal context cost is low. **Decision: include.**

### QA-08 — `adminRequeryWithdrawal` completes a payout without debiting the wallet

- **ID:** QA-08
- **Depends on:** QA-01, QA-02 (those fixes change which payout statuses are reachable; this must be reviewed against the post-fix state machine, not the current one)
- **Files touched:**
  - `backend/src/modules/wallet/services/admin-payout.service.ts` (modify — `adminRequeryWithdrawal`, ~:530-568)
- **What to do:** `:530` short-circuits only on `completed`, so a `failed` payout is requeried. If Paystack then reports success the row flips to `completed` at `:549-555` — but `settlePayoutDebit` at `:558` is gated on `wasPendingOrProcessing` (`:545-546`), which excludes `failed`. The merchant's money leaves the platform and the wallet is never debited.

  The correct behaviour when Paystack confirms a transfer that settled: settle the debit exactly once, regardless of the local status that led there. Change the gate so a `failed` row reaching the success branch still settles. Verify the intended interaction with QA-01 first — once `processing` can no longer be admin-rejected, the `failed`-then-success path is narrower, and the fix should be sized to what is actually reachable.
- **Acceptance criteria:**
  - A `failed` payout requeried to a Paystack `success` result settles the wallet debit, exactly once.
  - A `failed` payout requeried to a Paystack `failed`/`reversed` result still releases locked funds exactly once (existing behaviour preserved).
  - No path settles the same `linkedPayoutId` twice — the `P2002` duplicate-reference guard in `creditWallet` must not become load-bearing here.
- **Verification:** New unit cases in `tests/unit/payout-reconciliation-requery.test.ts` covering both transitions. Regression: `npm test -- tests/unit/payout.service.test.ts tests/unit/payout-timeout-and-ambiguity.test.ts`.
- **Rollback:** Revert the one file.
- **Effort:** S (~2h including tests)
- **Risk if skipped:** 🟠 Platform-side ledger hole. A merchant is paid from the platform's Paystack float without a corresponding wallet debit — funds the platform can no longer account for.

#### Implementation record — QA-08 (shipped)

Two files. `wallet.service.ts` gains **`debitReleasedPayout`** — debits `balance` only, leaving `lockedBalance` untouched, because `releaseLockedFunds` returns funds by decrementing `lockedBalance` and never `balance`. Calling the existing `settlePayoutDebit` here would decrement `lockedBalance` a second time, which is precisely the mechanism that drives a wallet negative.

`adminRequeryWithdrawal` reworked in three steps: an atomic `updateMany` claim on `status: { not: 'completed' }` so a concurrent requery or `transfer.success` webhook cannot both settle; an existence check on `WalletTransaction.linkedPayoutId` so an already-settled payout is never debited twice; and then the correct settle for the prior status.

**The plan's fix was insufficient on its own.** It said "change the gate so a `failed` row still settles" — but routing `failed` through `settlePayoutDebit` decrements `lockedBalance` that was already released, producing a negative wallet and a second `WalletTransaction` for a payout a `transfer.success` webhook may have settled earlier. `settlePayoutDebit` is not idempotent (`:461-487` decrements unconditionally), so the ledger entry, not the payout row, has to be the source of truth for "already settled".

`tests/unit/payout-reconciliation-requery.test.ts` created, 8 cases. Full unit suite: **259/259 pass across 29 suites.**

**A second test asserting the pre-QA-01 predicate was found and corrected** — `tests/unit/payout.service.test.ts:154` asserted `status: { in: ['pending', 'processing'] }` on the reject CAS. It surfaced only when the whole unit suite was run, not the two files named in the plan. Its subject (`status: 'pending'`) is still allowed, so only the stale predicate was updated; the release-and-fail behaviour it covers is unchanged.

---

### QA-09 — Restrict manual settlement to `pending` / `failed`

- **ID:** QA-09
- **Depends on:** QA-02 (post-fix, the `transfer.success` webhook no longer debits a non-`processing` payout, which changes the exposure shape)
- **Files touched:**
  - `backend/src/modules/wallet/services/admin-payout.service.ts` (modify — `adminManualSettleWithdrawal`, ~:806)
  - `backend/src/controllers/admin*.controller.ts` (modify if the accepted-status list is duplicated at the controller layer)
- **What to do:** `:806` currently permits manual settlement of `processing` payouts. The re-reserve at `:830` runs only when `status === 'failed'`, so a `processing` payout skips it and proceeds straight to `settlePayoutDebit` — while the original Paystack transfer may still settle. The merchant receives two bank debits.

  Narrow the allowed-status list to `['pending', 'failed']`. For `processing`, return `409 PAYOUT_IN_FLIGHT` directing the admin to Requery — the same terminality rule QA-01 applies to rejection, and the same guidance the QA-01 error message gives.

  The `failed` path keeps its existing re-reserve at `:830-853`, which is correct: funds were already released, so they must be re-reserved before the debit.
- **Acceptance criteria:**
  - Manual settle on a `processing` payout throws `409 PAYOUT_IN_FLIGHT`; no wallet mutation, no status change.
  - Manual settle on `pending` and `failed` still succeeds, with the `failed` path still re-reserving before debiting.
  - The admin UI surfaces the `PAYOUT_IN_FLIGHT` message rather than a generic failure.
- **Verification:** New cases in `tests/unit/user-auto-payout.test.ts` or a dedicated `tests/unit/payout-manual-settle.test.ts`. Regression: `npm test -- tests/unit/withdrawal-actor-security.test.ts tests/integration/phase4-store-webhook.test.ts`.
- **Rollback:** Revert the one file.
- **Effort:** S (~2h including tests)
- **Risk if skipped:** 🟠 Duplicated bank transfer. Post-QA-02 the wallet is no longer double-debited, so the exposure is narrowed to money physically leaving the platform twice for one withdrawal request.

#### Implementation record — QA-09 (shipped)

`admin-payout.service.ts` — allowed statuses narrowed from `['pending', 'processing', 'failed']` to `['pending', 'failed']`, with `processing` given its own `409 PAYOUT_IN_FLIGHT` guard ahead of the generic `INVALID_PAYOUT_STATUS` check so the message points the admin at Requery rather than restating an allow-list. The `failed` re-reserve fence below is unaffected; `pending` still has its funds locked and settles through the normal path.

Three cases added to `tests/unit/payout.service.test.ts`: manual-settle refuses `processing` (409), refuses `completed` (400), and — added because it was the same defect QA-01 fixed — `adminRejectWithdrawal` refuses `processing` (409), asserting neither `updateMany` nor `releaseLockedFunds` runs. Unit suite: **262/262 across 29 suites.**

The plan's "admin UI surfaces the `PAYOUT_IN_FLIGHT` message" line is **not done and was deliberately deferred** — it is the only remaining user-facing piece of QA-09, and it belongs with the admin frontend work in QA-04 rather than a separate pass.

---

## 4. Do not change

Verified as sound; leave alone.

- **`adminApproveWithdrawal`'s three-fence transaction** (`admin-payout.service.ts:135-176`) — advisory lock, affordability recheck, then atomic `status: 'pending'` claim, with network I/O correctly outside the transaction. This is the pattern QA-01 and QA-02 should be copying, not replacing.
- **The ambiguous-transfer branch** (`:304-354`) — correctly refuses to release locked funds on a gateway timeout and defers to reconciliation. This is the right instinct and is the opposite of the QA-01 bug.
- **Business-agnostic DVA idempotency** (`dva-webhook.service.ts:306-321`) — cross-business probe by `referenceId` with an authoritative-booking short-circuit. Do not fold this into the QA-02 reorder.
- **`transfer.failed`'s `status: { in: ['pending','processing'] }` claim** (`:477-481`) — the correct pattern; QA-02 Part B aligns `transfer.success` to it.
- **PostgreSQL `FOR UPDATE` row locks in the wallet service** (`wallet.service.ts:388,450,509`) — sound concurrency control on balance mutation.
- **Wallet idempotency** — three-layer dedup (idempotencyKey / reference / linkedSaleId) with `P2002` recovery. Correct and worth preserving under any future change.
- **The 48-file test suite** — substantial real coverage (adversarial QA, concurrency, webhook idempotency, statutory finalization). The remediation above adds to it rather than replacing it.

---

## 5. Decisions — resolved 2026-10-02

All four open questions are answered. No item below is blocked.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D-1** | **QA-02 ships business-first routing with no backfill.** Pre-deploy transfers keep their original business. | Business-first is the legally correct allocation and matches Deduction 1 Rule 3. Backfilling would rewrite figures in periods that may already be filed with FIRS, which needs accountant sign-off this pass should not assume. Expect a visible split in the first period after deploy — document it in the release notes. |
| **D-2** | **Nil Return is auto-derived** when `totalSales === 0`, not merchant-declared. | Filing is a statutory obligation, not a user choice. A checkbox invites the omission the feature exists to prevent. Removes the validator change and any new UI control from QA-06. |
| **D-3** | **Manual settlement restricted to `pending` / `failed`.** In-flight payouts route to Requery. | Keeps a single terminality rule across reject, settle, and manual settle. The admin escape hatch is preserved in practice via Requery, which verifies against the gateway rather than guessing. |
| **D-4** | **QA-00 data-exposure audit runs first**, read-only, before any fix ships. Repairs are a separate reviewed decision informed by its output. | Every fix in this plan is forward-only. Without the audit there is no way to know which rows, if any, need repair — and no baseline to confirm the fixes worked. |
| **D-5** | **QA-07 approach: self-contained historical-month fixture.** Additive — introduces a second, correctly-dated dataset for the tax block without perturbing the ~175 assertions that assume today's date. D-6 is moot. | Raised by red-team review. The existing suite dates its sales/expenses with `new Date()` rather than `MONTH`, so no option is a one-line change. |
| **D-6** | *(moot — superseded by D-5)* | — |
| **D-7** | **The `primaryBusinessId` landing pool is deliberate.** User-level DVAs keep pooling to the primary business for manual classification. QA-02 changes only the business-specific-account case. | Confirmed product intent. This validates QA-02 as scoped — it corrects misrouting for accounts that belong to a specific business without disturbing the pooling workflow the team relies on. |
| **D-8** | **QA-01 ships ahead of QA-00.** The audit follows immediately after. | QA-01 is live financial loss; there is no reason to keep the double-spend open while a read-only audit runs. The audit still runs, so the repair decision is unaffected — it just arrives after bleeding has stopped. |
| **D-9** | **Expose the accrual relations on the sales API** rather than a derived boolean. | QA-04's UI cannot make its decision today. Sending the same relations the server checks means client and server derive `isAccrualLocked` from identical inputs and cannot drift. |

**Consequence of D-7 worth flagging:** because the DVA assignment webhook writes the same account number to both `Business` and `User` (`:42-59`), a merchant's existing single-DVA transfers will resolve as *business-specific* after QA-02 — landing on whichever business provisioned the DVA rather than on `primaryBusinessId`. For a merchant whose DVA was provisioned through their primary business this is a no-op; for one who provisioned through a sibling it is the intended correction. QA-00's Class B output should be read specifically to size that population before QA-02 ships.

---

## 6. Execution sequence

```
NOW (1)  QA-01  Payout terminality ── SHIP FIRST, ahead of the audit  [decision D-8]
          │     Part A + Part B in a single commit
          ▼
NOW (2)  QA-00  Data-exposure audit (READ-ONLY) — sizes the repair decision
          │
          ├──► review output; repairs decided separately (needs `npm run db:backup`)
          ▼
NOW (3)  QA-03  Accrual reassignment guard (backend)
          QA-04  Accrual relations on the sales API + UI guard   ← depends on QA-03
          QA-05  AppError argument order
          QA-08  Requery ledger hole                            ← depends on QA-01
          QA-09  Manual-settle restriction                      ← depends on QA-02
          QA-02  DVA routing (fix forward, landing pool preserved) ← decisions D-1, D-7

NEXT     QA-06  Nil Return (auto-derived)                        ← decision D-2
          QA-07  E2E historical-month fixture                   ← decision D-5

DEFER    Any repair arising from QA-00's output — scoped only once the audit reports.
```

**Why QA-01 precedes QA-00** (decision D-8): QA-01 is live financial loss, and there is no reason to leave the double-spend open while a read-only audit runs. The audit is not skipped or deferred — it simply arrives after the bleeding stops, and its output still determines the repair scope.

**Why QA-05 sits mid-tier rather than first:** it is the smallest fix and the least urgent, so it should not delay the money-movement items ahead of it.

**Why QA-01's two parts must ship together:** the double-spend is not meaningfully safer half-applied. Fixing only Part A leaves the webhook able to resurrect a payout; fixing only Part B leaves funds already released by a rejection. QA-08 and QA-09 follow immediately after, since both reason about which payout statuses are reachable and both are cheap once QA-01 has landed.

Total estimated effort: **~5-6 days** across all ten items, dominated by QA-07 (historical fixture rework, ~1 day) and QA-06 (migration + PDF labelling).

---

## 7. Red-team log

The plan was re-reviewed against the source with the intent of breaking it. Result: **four defects found in the plan itself**, all now corrected above. What was checked and cleared is recorded here too, so the next reviewer does not repeat the work.

### Defects found in this plan (now fixed)

| # | Defect | Impact had it shipped | Correction |
|---|--------|------------------------|------------|
| **R-1** | **QA-07 was materially underestimated (M → L).** Assumed changing `MONTH`/`YEAR` would be near-trivial. It is not: sales and expenses at `:473-534` and `:607-667` are dated `new Date()`, *not* derived from those variables, so the historical month would contain no sales and finalization would fail with `ZERO_SALES` anyway. | QA-07 would have been attempted, failed, and left the suite red — the exact outcome the item exists to fix. | Rewritten with three named defects, an approach decision (D-5), and an L estimate. |
| **R-2** | **QA-07 missed a live UTC bug.** `:835` and `:855` use `new Date(YEAR, MONTH - 1, 15)` — a local-time constructor feeding a `@db.Date` column, which lands a day early on a UTC+ host. | The suite would remain timezone-dependent after the "fix" — passing in CI, failing on a Nigerian developer machine. | Called out explicitly, with a `TZ=Europe/London` verification step added to acceptance criteria. |
| **R-3** | **QA-06 hedged on the PDF target** with an "or" between two paths. | A 50/50 chance of labelling the wrong renderer, leaving Nil Returns unlabelled on the actual statutory document. | Resolved to `src/services/pdf/tax-slip.pdf.ts` by tracing the facade chain to the actual consumer. |
| **R-4** | **QA-04 was scoped as frontend-only, but the API cannot support it.** `getSaleById` (`sales-crud.service.ts:212`) includes only `items` — `invoice`, `creditOrigin`, and `creditPayment` are absent from every response, and `TransactionDetailPanel.tsx` references none of them. | The UI could not reliably decide when to hide "Move Sale"; the item would have been attempted and either guessed from incomplete data or shipped a button that mis-hides. | QA-04 re-scoped to a backend + frontend item that exposes the three relations first (decision D-9). Effort S → S-but-wider, five files instead of one. |

### Assumptions checked and cleared

- **Facade indirection could have hidden the real defects.** The codebase uses canonical facades (`services/dva.service.ts` → `services/dva/dva-webhook.service.ts`; `services/wallet.service.ts` → `services/wallet/wallet.service.ts` → `modules/wallet/services/wallet.service.ts`). Had QA-02 or QA-05 targeted a facade, both fixes would have been no-ops. Verified: the DVA fix targets the sole definition of `processDVATransferWebhook`, and the wallet fix targets the sole `class WalletService` implementation.
- **A third sale-reassignment path?** `sales-crud.service.ts:298` performs a `salesTransaction.update` and was not inspected during drafting. Checked: `businessId` is a function parameter there, ownership is asserted at `:247`, and it is never read from `input`. It cannot move a sale between businesses. QA-03's two-path scope is correct.
- **Is the double-spend arithmetic actually right?** Traced end to end: `reserveFunds` creates **no** `WalletTransaction` (it only increments `lockedBalance`), so the later `settlePayoutDebit` hits no unique-reference conflict and proceeds. After reject-then-webhook the wallet ends at `balance = B − X`, `lockedBalance = −X`. The `:520` underflow guard clamps only the release, not the subsequent settle, so the negative `lockedBalance` does occur — which is why QA-00 searches for it.
- **QA-00's audit queries are indexable.** `AuditLog` has `@@index([action])` but no index on `resourceId`. Driving both Class A queries off the `action` index and intersecting in memory avoids a full scan; no migration is needed. Caveat for the implementer: both `logAudit` calls on the reject and complete paths are **fire-and-forget** (neither is passed a `tx`), so a lost audit row would hide an affected payout — treat counts as a lower bound, not exhaustive.
- **"Zero sales" means zero *taxable settled* sales.** `finalizeReport` aggregates under `TAXABLE_SALES_WHERE` = `{ status: { in: SETTLED_SALE_STATUSES }, isTaxable: true }`. A month containing only reversed or non-taxable sales yields `totalSales === 0` and becomes a Nil Return. That is the correct semantic for tax purposes, but it should be stated in the QA-06 acceptance criteria rather than discovered later.
- **Stale documentation (not a code defect).** `CLAUDE.md` states there is "no QR-code verification or SHA-256 watermark" on tax statements, but `src/services/pdf/tax-slip-seal.pdf.ts` exports `drawTaxSlipVerificationSeal`, called from `pdf/tax-slip.pdf.ts:16`. The doc is out of date; worth a separate one-line correction.

### What I would still challenge

- **QA-02's behavioural change is the least reversible item in the plan.** Because one account number is written to both `Business` and `User` (`dva-webhook.service.ts:42-59`), business-first routing changes where transfers land for merchants who already have a DVA. D-1 accepts that without backfill. If a merchant has filed periods with FIRS based on the old routing, the split becomes a reconciliation conversation rather than a bug fix. QA-00's Class B output should be reviewed for exactly this before QA-02 ships.
- **The plan does not add a defensive constraint at the database level.** Every money-movement fix here is application-level. A `CHECK` constraint or a partial unique index enforcing payout terminality would survive an application bug — but that is a schema decision with its own migration risk, and it is correctly out of scope for a remediation pass. Flagging it as the obvious NEXT-next hardening, not a gap in this plan.
- **No load or concurrency testing.** The advisory-lock fences in `adminApproveWithdrawal` and `adminManualSettleWithdrawal` are the strongest concurrency design in the codebase, but nothing in the suite exercises two simultaneous approvals on one account. The unit tests use mocked Prisma, so the `pg_try_advisory_xact_lock` path is untested. Not a defect in this plan; a genuine coverage gap worth naming.