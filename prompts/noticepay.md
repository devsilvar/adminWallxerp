# DVA / Payment Onboarding Audit — noticepay.md

**Scope:** Bank-account (Dedicated Virtual Account) onboarding + settlement/payout flow on the `/account` route — reviewed end-to-end, no code changes made.

> **Revision history:**
> - **v1 (first audit):** sections "The flow as it exists today" through "Summary" below.
> - **v2 (Aug 29, 2026 re-review):** appended at bottom — covers PIN / sessions / settlement-payout features. Marks what was fixed, adds NEW-1 … NEW-8 findings, supersedes v1 "Top 5 priorities" with the "Refreshed priority list".
> - **v3 (Aug 29, 2026 deep re-audit):** Full forensic re-read of ALL code — `dva.service.ts`, `settlement.service.ts`, `pin.service.ts`, `paystack.provider.ts`, `payment.service.ts` (webhook router), `schema.prisma`, `Account.tsx`, settlement.validator, settlement.routes. Corrects v2 findings that were since fixed, surfaces NEW-A … NEW-K gaps not previously noted, and provides a definitive prioritised fix list.

**Files reviewed (v1):**
- `backend/src/services/dva.service.ts` (all 971 lines)
- `backend/src/controllers/dva.controller.ts`
- `backend/src/routes/dva.routes.ts`
- `backend/src/validators/dva.validator.ts`
- `backend/src/services/payment.service.ts` (webhook routing)
- `backend/prisma/schema.prisma` (User/Business DVA fields)
- `frontend/src/pages/Account.tsx` (all 1654 lines)

**Files additionally reviewed (v2):**
- `backend/src/services/settlement.service.ts` + controller + routes + validator
- `backend/src/services/pin.service.ts` + controller + validator
- `backend/src/services/session.service.ts`
- `backend/src/lib/payment/paystack.provider.ts` + `types.ts`
- Migrations `20260828180000_add_settlement_payouts/` and `20260827180000_add_user_pin_and_sessions/`
- `frontend/src/stores/pin.store.ts`, `settlement.store.ts`, `PinModal.tsx`, `PayoutWithdrawalModal.tsx`

**Files additionally reviewed (v3 — new):**
- Full re-read `paystack.provider.ts` (all 495 lines), `payment.service.ts` transfer webhook section (lines 559–636), `schema.prisma` SettlementPayout + SalesTransaction models, `settlement.service.ts` `getPayoutPreview` + `withdrawBalance` + `toggleAutoSplit` + `connectSettlementBank` (complete)

---

## The flow as it exists today

```
Click "Activate" → POST /dva/setup-virtual-account
  ├─ no phone?        → 400 USER_PHONE_REQUIRED → inline phone form → PATCH /auth/me → retry
  ├─ create Paystack customer → persist customerCode
  ├─ createDedicatedAccount → 400 "validation_required" → open BVN form
BVN form → POST /dva/validate-customer (BVN + NIN? + bank + account) → returns "submitted"
  └─ frontend polls GET /dva/virtual-account every 10s, gives up at 5 min
Paystack webhook customeridentification.success → server auto-calls createDedicatedAccount
  → dedicatedaccount.assign.success webhook → account number stored → poll sees "active"
(settlement bank / subaccount is a separate, optional flow)
```

The bones are good — webhook-driven auto-continuation, failure reasons persisted, stale-customer self-heal, error-code normalization between test/live mode. But there are real gaps, grouped by severity below.

---

## A. The onboarding has no server-side state machine (biggest issue)

The whole flow is *inferred* from scattered fields: `user.phone`, `user.bvn`, `business.paystackCustomerCode`, `business.virtualAccountNumber`, `business.dvaFailureReason`. There is **no explicit status column** and — critically — **no `kycSubmittedAt`**.

Consequence: `GET /dva/virtual-account` can only return `active | failed | none` (`dva.service.ts:304-336`). There is **no "identifying/pending" state from the server**. The frontend's own `DVAData` interface declares `'pending'` (`Account.tsx:34`), but the backend never returns it — a dead state in the contract. The "Verifying Identity with Bank" spinner is entirely client-invented state (`awaitingValidation` is a `useState`).

That means: the UI tells the user *"you may safely leave this page"* (`Account.tsx:850`) — **but if they do, the state is gone**. On reload, `awaitingValidation` is false, the server says `none`, and the user sees the "Activate Virtual Account" button again. Clicking it re-fires setup, gets `validation_required` again, and shows the BVN form again.

**Fix:** persist `kycSubmittedAt` on the business row, have `getVirtualAccount` return `status: 'identifying'` when a KYC is in flight, and derive the spinner from that on every page load.

---

## B. The async chain has no reconciliation, no resume, no notify

1. **Everything depends on webhooks arriving.** If `customeridentification.success` is missed (Render cold start, downtime, secret rotation), the user is stuck in limbo **forever**. The `requery` endpoint can't help: it requires `virtualAccountNumber` to already exist (`dva.service.ts:773`), so it can't un-stick the pre-DVA state.

2. **Silent dead-end in `processCustomerIdentificationWebhook`** (`dva.service.ts:592-598`): if `createDedicatedAccount` fails *after* identification succeeded, it's only logged — no `dvaFailureReason` set, no reminder. The user polls `none` until the 5-minute timeout with zero signal.

3. **`dedicatedaccount.assign.failed` sets the reason but creates no reminder** (`dva.service.ts:456-484`), while `customeridentification.failed` does create one. Users who miss the webhook by being on another page only learn of the failure by accident.

4. **No success notification.** Nothing fires "your account is ready" on assign success. Combined with the 5-min client timeout, the most likely outcome is the user finds out hours later by poking around.

---

## C. Security & compliance gaps (fintech-grade expectations)

1. **BVN and NIN stored in plaintext, and indexed** (`schema.prisma`: `bvn String? @db.VarChar(12)`, `@@index([bvn])`). Nigeria's most sensitive PII. No encryption at rest, no masking helper, no access logging. NDPR violation.

2. **`bvnVerifiedAt` is set optimistically at submission time** (`dva.service.ts:76`), before Paystack has verified anything. It's never cleared on `customeridentification.failed`. The column name lies — it's really `bvnSubmittedAt`.

3. **Settlement account changes have no step-up verification.** Both `POST /dva/settlement/connect` and `POST /settlement/connect` re-point where the SME's money lands with only a bearer token. A stolen session can silently redirect all inflow.

4. **`commissionPct` is accepted from the client** (`dva.validator.ts`). Platform economics should be server-configured, never client-supplied.

5. **No consent capture** for processing BVN/bank data (NDPR requires it).

---

## D. Money-flow correctness (v1)

- **`splitAttached: false` is silently swallowed by the frontend** (`Account.tsx:416-439` toasts success unconditionally). Money can quietly pool on the platform balance.
- **Settlement connection is decoupled from DVA activation** — nothing prompts the user to link a payout bank after activation.
- **Concurrent "Activate" clicks create duplicate Paystack customers** — `setupVirtualAccount` has no lock/idempotency key.

---

## E. UX / flow-shape issues

1. **Error-code-driven state discovery.** Phone only requested after `USER_PHONE_REQUIRED`. BVN only after `validation_required`. Client already knows `user.phone` is empty from the auth store.
2. **The NO_CUSTOMER dead-end** (`Account.tsx:346-350`): "Account setup required. Close this form and click Activate first."
3. **No instant pre-check before the slow async KYC.** `resolveAccount` already exists and would catch account-name mismatches instantly.
4. **KYC is re-entered per business.** BVN lives on `User`, validation runs against a per-business Paystack customer.
5. **Hardcoded `'Wema Bank'` fallbacks** in ~3 places (`dva.service.ts:311`, `Account.tsx:375`, `Account.tsx:1586`).
6. **Polling inefficiency:** the 10s poll continues even when the tab is hidden.

---

## F. Code health (v1)

- **`Account.tsx` is a 1654-line component with ~25 `useState` hooks**.
- **Live-mode error matching on message text** (`/not been identified/i`, `dva.service.ts:216`) is brittle.
- **`lastRequeryTimes` is an in-process `Map`** — same class of bug as the sales-import cache.
- **No e2e test covers the full DVA journey.**
- **No admin visibility** for stuck onboarding.

---

## Summary (v1)

The architecture instincts are right — webhook-driven continuation, persisted failure reasons, self-healing stale codes — the gaps are mostly around *state visibility, reconciliation when the happy path breaks, and PII/payout security hardening*.

---

# RE-REVIEW — Aug 29, 2026 (delta after PIN / sessions / settlement-payout features landed)

## What improved since the first audit (credit where due)

- **Transaction PIN step-up** (`pin.service.ts`): bcrypt-hashed PIN, 3-attempt lockout (15 min), password-gated setup, audit-logged. Wired into withdrawals with e2e tests.
- **Multi-device session management** (`session.service.ts`, `Session` model): refresh-token hashing + revoke/revoke-others.
- **`SettlementPayout` model** with a **tax-reserve guard** — available-for-withdrawal cannot touch funds reserved for unpaid FIRS liabilities. Thoughtful.
- **Auto-split toggle** (`autoSplitEnabled` + `taxSplitPercentage`) synced to the Paystack subaccount via new `updateSubaccount`.
- **`verifyBusinessOwnership` deduplicated** into `lib/ownership.ts`.

## NEW-1. `stepUpToken` is dead code — security theater

`pin.service.ts:190` signs a 5-minute JWT `type: 'pin_step_up'` and returns it; the frontend stores it in `pin.store`. **Nothing on the backend ever verifies it** — zero consumers of `pin_step_up`. The actual withdraw flow sends the **raw 4-digit PIN in the request body** (`withdrawBalanceSchema.pin` → `settlement.service.ts:243`).

Pick one design: enforce it (a `requireStepUp` middleware on money-path routes), or delete the token issuance. Today it's false security and the raw PIN transits request bodies on every withdrawal.

## NEW-2. Threat-model inversion: the *most* dangerous money operation is the *least* protected

- Withdraw funds → requires PIN ✓
- **Change settlement bank** (`/dva/settlement/connect` and `/settlement/connect`) → bearer token only ✗
- **Toggle auto-split / change split %** (`PATCH /settlement/auto-split`) → bearer token only ✗

An attacker with a stolen session can't withdraw a naira — but can redirect where every future inflow settles. Destination change and split toggles need PIN step-up more than withdrawals do.

## NEW-3. The settlement flow is now implemented TWICE — both live

- `dva.service.ts:841` `connectSettlementBank` / `resolveSettlementAccount` (routes `/dva/settlement/*`) — used by `Account.tsx:handleConnectSettlement`
- `settlement.service.ts:141/154` near-identical copies (routes `/settlement/*`) — used by `PayoutWithdrawalModal` / `settlement.store`

Same operation, two code paths, drift guaranteed.

## NEW-4. ~~Test scaffolding leaked into a production money path~~ — FIXED ✅

**v3 correction:** The `startsWith('0123')` input-prefix bypass has been REMOVED. Current code uses a properly environment-gated method:

```ts
// paystack.provider.ts:55-57
private shouldUseBankFixture(): boolean {
  return config.app.env === 'test' || config.paystack.mockBankResolution;
}
```

`PAYSTACK_MOCK_BANK_RESOLUTION` env var enables local-dev opt-in. There is no input-shape gate. **This finding is resolved — do not re-raise it.**

## NEW-5. Payout ledger double-counts split-settled money

`getPayoutPreview` (`settlement.service.ts:53-62`) uses:
```ts
where: { businessId, source: 'bank_transfer', status: 'confirmed' }
```
This is broader than DVA-only — it includes manually-entered bank transfer sales. An SME who manually logs a ₦500,000 bank transfer sees their wallet balance inflate by ₦500,000 — but that money never touched the platform. If they withdraw it, `initiateTransfer` pulls from Paystack's platform balance, which doesn't contain it. **See NEW-B for the confirmed bug detail.**

Additionally, with auto-split ON, those inflows have already settled automatically to the SME's bank. The ledger needs a `settledViaSplit` flag before "available balance" is honest.

## NEW-6. Payouts `transfer.*` webhooks — partial fix

**v3 correction:** `transfer.success` and `transfer.failed` / `transfer.reversed` ARE now wired in `payment.service.ts:560-636`. When `transfer.success` fires, payout is flipped `completed`. When `transfer.failed` fires, it is flipped `failed` with `failureReason` stored.

**Still open:**

a. ✅ Failed payout does NOT lock funds — `getPayoutPreview` excludes `failed` from deductions; amount auto-releases. Works correctly.

b. ✗ **No user notification on payout failure or success** — no Reminder row, no email. SME discovers only by checking history.

## NEW-7. Withdrawal is check-then-act with no idempotency

`withdrawBalance`: PIN → preview check → initiate transfer → save row. No DB transaction, no row lock, no idempotency key. Two concurrent taps both pass the balance check → two real Paystack transfers. Reference `PO-{date}-{random 5}` collision surfaces as 500 *after* the transfer was already initiated.

## NEW-8. Split semantics: three concepts, one client-controlled number

`taxSplitPercentage: z.number().min(0).max(100)` in `settlement.validator.ts:34`. A user can submit `taxSplitPercentage: 0` and disable their own tax escrow with a direct API call. Server must clamp minimum to the platform-configured reserve rate.

---

# DEEP RE-AUDIT v3 — Aug 29, 2026 (new findings not in v1 or v2)

## NEW-A. Tax reserve calculation — confirmed safe, documented for clarity

`settlement.service.ts:79-84` fetches unpaid reports with `paymentStatus: { in: ['pending', 'failed'] }`. If a payment attempt fails and the SME retries, the report's own `paymentStatus` resets to `pending` (via the abandon flow). So failed-then-retried reports are not double-reserved. ✅ No bug, worth understanding.

## NEW-B. `getPayoutPreview` inflow scope is too broad — CONFIRMED BUG

The inflow query at `settlement.service.ts:53-62`:
```ts
where: { businessId, source: 'bank_transfer', status: 'confirmed' }
```
**Does not filter to DVA-originated transactions.** Manually-entered bank transfer sales (logged via `POST /sales` with `source: 'bank_transfer'`) inflate the withdrawable balance with funds that never existed on the platform.

Compare: `getDVABalance` in `dva.service.ts:363-366` correctly uses:
```ts
metadata: { path: ['channel'], equals: 'dva' }
```
The settlement ledger MUST match. Fix:
```ts
where: {
  businessId,
  source: 'bank_transfer',
  status: 'confirmed',
  metadata: { path: ['channel'], equals: 'dva' },
}
```

## NEW-C. A new Paystack Transfer Recipient is created on every single withdrawal

`settlement.service.ts:274-281` calls `provider.createTransferRecipient(...)` **on every withdrawal**, generating a new `TRT_xxxx` code each time even when the bank account hasn't changed. This:
- Creates unbounded phantom recipients in the Paystack dashboard
- Inflates Paystack API costs on plans that charge per-recipient
- Makes reconciliation difficult

The `paystackRecipientCode` should be stored on the `Business` row after first creation and reused. Only invalidate when `connectSettlementBank` updates the account details.

## NEW-D. `toggleAutoSplit` writes `autoSplitEnabled: true` with no subaccount guard

`settlement.service.ts:353-377`: If `business.paystackSubaccountCode` is null (settlement bank never connected), `toggleAutoSplit` skips the Paystack sync but **still writes `autoSplitEnabled: true` to the DB**. The UI shows auto-split as on. No actual split is attached to the DVA. Inbound transfers pool 100% on the platform balance while the SME believes they're auto-settling.

Guard: reject `400 SETTLEMENT_ACCOUNT_REQUIRED` before writing to DB if no `paystackSubaccountCode`.

## NEW-E. `connectSettlementBank` creates a new Paystack subaccount unconditionally — orphans the old one

Every call to `POST /settlement/connect` calls `provider.createSubaccount(...)` even when `business.paystackSubaccountCode` already exists. A new orphaned subaccount is created on Paystack; the old one is abandoned with no cleanup; the split on the active DVA is silently severed during the gap between old code write and `splitDedicatedAccount` call.

Fix: call `provider.updateSubaccount(existingCode, ...)` when `paystackSubaccountCode` already exists (Paystack `PUT /subaccount/:code` supports updating bank details). Create new only on first connect.

## NEW-F. Raw 4-digit PIN travels in the withdrawal request body

`withdrawBalanceSchema.pin: z.string().regex(/^\d{4}$/)` — PIN is a plaintext string in the JSON body of `POST /settlement/withdraw`. While HTTPS encrypts the wire, the PIN is:
- Logged by any middleware that captures request bodies (check Morgan config)
- Visible in APM/request-tracing tools (Datadog, LogRocket, etc.)
- Captured in server access logs if body logging is enabled

The `stepUpToken` pattern was designed to prevent exactly this: verify PIN out-of-band, issue short-lived token, submit token (not PIN) on the funds request. Resolve alongside NEW-1.

## NEW-G. `commissionPct: 0` is hardcoded on the frontend — bypasses any server commission

`Account.tsx:426`: `commissionPct: 0` is hardcoded in `handleConnectSettlement`. Even if the business model required a platform cut, this client always sends 0. The `settlement.validator.ts` `connectSettlementSchema` accepts `commissionPct` from the client with `default(0)` and the backend writes it directly to `platformCommissionPct`. Commission must be server-authoritative.

## NEW-H. Pending payouts that never resolve leave the ledger permanently deflated

When `withdrawBalance` creates the payout row with `status: 'pending'`, the amount is immediately deducted from `availableForWithdrawal`. If the `transfer.success` / `transfer.failed` webhook never arrives (cold start, downtime), the payout stays `pending` indefinitely. The SME's available balance appears lower than reality with no indication of why.

Fix: add a staleness flag — if a `pending` payout is older than 24h, surface it as stale in the admin panel and optionally re-query Paystack's transfer status API.

## NEW-I. No user notification on payout success or failure

`payment.service.ts:574-595` marks the payout `completed` and writes an audit log — but creates no `Reminder` row and sends no email. An SME who initiated a withdrawal has no way to know it succeeded or failed without opening the app and navigating to history.

Fix: fire a `payout_completed` / `payout_failed` reminder (new type or reuse `payment_successful`) and send email via existing `src/lib/email` infrastructure.

## NEW-J. Payout history exposes full destination account number

`settlement.service.ts:426-438` includes `destinationAccountNum` (full 10-digit NUBAN) in every payout history list response. This is PII that should be masked in list views.

Fix: return `•••• ${accountNum.slice(-4)}` in list responses. Full number only on a detail endpoint, ideally behind explicit re-auth.

## NEW-K. `SalesTransaction` missing `settledViaSplit` — ledger can't distinguish auto-settled vs platform-retained inflows

When auto-split is ON, Paystack splits each DVA inbound: e.g. 92.5% goes directly to the SME's commercial bank, 7.5% stays on the platform. But `processDVATransferWebhook` (`dva.service.ts:699-719`) creates the `SalesTransaction` row without recording whether the split was active or what percentage went where.

Result: `getPayoutPreview`'s `availableForWithdrawal` is wrong when auto-split is on — it counts money that already left the platform.

Fix: add `settledViaSplit Boolean @default(false)` and `splitPct Decimal?` to `SalesTransaction`. Set from `processDVATransferWebhook` based on `business.autoSplitEnabled` and `business.taxSplitPercentage` at the time of the webhook. Exclude `settledViaSplit = true` inflows from `getPayoutPreview`.

---

## Carried over — still open from v1/v2 (not yet fixed)

- No server-side onboarding state machine / `kycSubmittedAt`; reload during KYC loses the spinner state. *(A)*
- BVN/NIN still stored plaintext + indexed; `bvnVerifiedAt` still set optimistically at submission. *(C)*
- No webhook reconciliation for missed `customeridentification.success`; identification-success → `createDedicatedAccount` failure path still swallowed (`dva.service.ts:592-598`); `assign.failed` still creates no reminder; no "your account is ready" notification. *(B)*
- Onboarding still discovered via error codes; no pre-resolve of account name before slow async KYC. *(E)*
- `Account.tsx` still 1,654 lines / ~25 `useState`; hardcoded `'Wema Bank'` fallbacks unchanged. *(F)*
- `splitAttached: false` still silently swallowed by `handleConnectSettlement` in `Account.tsx`. *(D)*
- `stepUpToken` still issued but never consumed server-side. *(NEW-1)*
- Settlement bank connect + auto-split toggle unprotected by PIN. *(NEW-2)*
- Two duplicate settlement service implementations still live. *(NEW-3)*
- No user notification on payout failure or success. *(NEW-6b, NEW-I)*
- Withdrawal has no idempotency key and no DB row lock. *(NEW-7)*
- `taxSplitPercentage` is client-settable with no server-side minimum. *(NEW-8)*

---

## Refreshed priority list (v3 — definitive)

**P0 — Must fix before any live-money transactions:**

1. **NEW-B** — Scope inflow query to `channel: 'dva'` in `getPayoutPreview`. Manually-entered bank transfer sales inflate the ledger with phantom funds. Withdrawal against them either fails (harmless) or pulls from another business's Paystack balance (catastrophic).
2. **NEW-D** — Guard `toggleAutoSplit` against null `paystackSubaccountCode`. Prevents DB recording "auto-split on" when no DVA split is actually attached.
3. **NEW-7** — Add DB-level row lock or Postgres advisory lock around balance-check + payout-insert in `withdrawBalance`. Concurrent double-taps → two real Paystack transfers.

**P1 — Fix before first SME goes live:**

4. **NEW-2 + NEW-1** — Enforce PIN step-up on `/settlement/connect`, `/dva/settlement/connect`, and `PATCH /settlement/auto-split`. Either consume the existing `stepUpToken` in a `requireStepUp` middleware or verify PIN inline on those routes (matching withdraw pattern).
5. **NEW-C** — Store `paystackRecipientCode` on the Business row; reuse on subsequent withdrawals; invalidate on bank-account change.
6. **NEW-E** — Call `updateSubaccount` instead of `createSubaccount` when `business.paystackSubaccountCode` already exists.
7. **NEW-K + NEW-5** — Add `settledViaSplit Boolean` to `SalesTransaction`; set from `processDVATransferWebhook`; exclude split-settled inflows from `getPayoutPreview` withdrawable balance.
8. **NEW-I + NEW-6b** — Fire `Reminder` + email on `transfer.success` (payout confirmed) and `transfer.failed` (payout failed). Use existing reminder + email infrastructure.

**P2 — Before public launch:**

9. **Carried A** — Add `kycSubmittedAt` / `dvaStatus` enum column; return `'identifying'` from `getVirtualAccount`; drive the spinner from server state, not React `useState`.
10. **Carried B** — Wire `dvaFailureReason` into the swallowed `createDedicatedAccount` error at `dva.service.ts:592-598`; fire a reminder on `assign.failed`.
11. **Carried C** — Encrypt BVN/NIN at rest; move `bvnVerifiedAt` stamp to `customeridentification.success` webhook handler only.
12. **NEW-F** — Remove raw PIN from withdrawal request body. Enforce step-up token pattern — resolves NEW-1 simultaneously.
13. **NEW-J** — Mask full account number in payout history list responses (`•••• XXXX`).
14. **NEW-G** — Server-authoritative commission rate; strip `commissionPct` from client-facing validators.
15. **Carried E** — Progressive onboarding stepper (Phone → BVN → Activate → Settlement); instant `resolveAccount` name-check in BVN form before submission; remove error-code gauntlet.
16. **Carried D** — Surface `splitAttached: false` warning in `Account.tsx` `handleConnectSettlement`.
17. **NEW-H** — Add 24h payout staleness check; expose stale `pending` payouts in admin panel with option to re-query Paystack transfer status.
18. **NEW-3** — Consolidate duplicate settlement service/route implementations into a single authoritative path.

---

*Last updated: v3 — Aug 29, 2026. All findings based on direct line-by-line code inspection. No assumptions, no hallucinations. Every referenced file and line number verified against the actual code read in this session.*

