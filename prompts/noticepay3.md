# noticepay3.md — Implementation Plan: Payout Ops Reliability Batch (Phase 1 of the endgame)

**Date:** 2026-08-30
**Scope:** The next work set after noticepay2.md (NEW-K, NEW-I, NEW-2/1, NEW-8 partial, PIN-1 — all verified implemented in the working tree this session).
**Basis:** Every file:line below was re-verified against the current working tree in this session. No stale references.

---

## §0. Ground truth — what is DONE vs still OPEN (verified this session)

### ✅ Verified DONE (do not re-implement)

| Item | Evidence (verified) |
|---|---|
| P0: NEW-B / NEW-D / NEW-7 | `settlement.service.ts` — DVA-channel filter `:77,92`, subaccount guard `:517`, advisory-lock claim + admin approve/reject paths |
| FOUND-1 (PinModal raw pin) | `PinModal.tsx` `onSuccess(pin)`; v2.2 update: the once-"leftover" `pin.store.ts` dead `stepUpToken` field has since been removed from the tree — no dead code remains (§8 retired) |
| NEW-K (split ledger) | Migration `20260830120000_add_sales_split_ledger`; `dva.service.ts:718-720` sets `settledViaSplit/splitPct/platformRetained`; `settlement.service.ts:78,93` preview math |
| NEW-I (payout reminders) | `reminder.service.ts:35-39` types; `settlement.service.ts:478` requested; `payment.service.ts:598` completed / `:652` failed; admin approve `:849` |
| NEW-2 (PIN on auto-split) | `settlement.validator.ts:38` — `pin` required |
| NEW-1 (stepUpToken deleted server-side) | Zero occurrences in `backend/src` |
| PIN-1 (5 attempts / 24h window) | `pin.service.ts:38-46,149-155` + migration `20260830130000_add_pin_attempt_window` |
| NEW-E (update-in-place subaccount) | `settlement.service.ts:260-267` |
| NEW-J (payout account masking) | `settlement.service.ts:695` — `•••• ${slice(-4)}` |
| Carried B (partial) | `dvaFailureReason` persisted on both `assign.failed` (`:474`) and `customeridentification.failed` (`:613`); surfaced by `getVirtualAccount` (`:325`); `dva_validation_failed` reminder on identification failure (`:627-629`) |
| NEW-3 (consolidation) | `dva.service.ts:855` — DVA routes call `settlementService.connectSettlementBank` directly |
| Server-authoritative commission | `settlement.service.ts:265,277,303` always `config.settlement.platformCommissionPct`; `dva.controller.ts:101-104` never forwards client `commissionPct` |

### ❌ Verified still OPEN — the definitive remainder

| # | Item | One-line problem | Verified evidence |
|---|---|---|---|
| 1 | **NEW-C** | New Paystack transfer recipient created on EVERY payout approval — unbounded phantom `TRT_*` codes, API cost, reconciliation pain | `settlement.service.ts:794` calls `createTransferRecipient` unconditionally; `paystackRecipientCode` exists nowhere in `schema.prisma` |
| 2 | **NEW-H** | Payout stuck `processing` >24h (missed `transfer.*` webhook) silently deflates the SME's available balance forever; no re-query, no surfacing | No `verifyTransfer` on `PaymentProvider` (`types.ts:181-183` ends at `initiateTransfer`); no staleness logic in `settlement.service.ts` |
| 3 | **SLA-1** | Admin has no signal a withdrawal has sat `pending` >24h | `Reminder.businessId` is required (`schema.prisma`) — reminders can't target admins; nothing in admin dashboard/withdrawals page |
| 4 | **NEW-8 residue (cosmetic only)** | ✅ CORRECTION (re-audit): the server-side clamp IS implemented — `toggleAutoSplit` rejects out-of-range pct with `400 INVALID_SPLIT_PERCENTAGE` (`settlement.service.ts:528-542`), backed by `config.settlement.minTaxSplitPct/maxTaxSplitPct` (`config/index.ts:205-206`) documented at `.env.example:147-148`. The ONLY residue: the Zod validator label (`settlement.validator.ts:37` `.min(0).max(100)`) diverges from the service bounds — cosmetic, and naive tightening would BREAK the disable path (see §3) |
| 5 | **NEW-G remainder** | Frontend still sends dead `commissionPct: 0` (server ignores it — cleanup only) | `Account.tsx:401` (v2.2 re-audit; the earlier `:428` citation was stale) |
| 6 | ~~**Hygiene**~~ | ✅ ALREADY DONE (v2.2 re-audit): zero `stepUpToken`/`clearStepUpToken` occurrences in `frontend/src` (full recursive grep); `pin.store.ts` is 174 lines — the `:188` citation predates the cleanup, which landed after this plan was written | **Removed from the batch — see §8** |
| 7 | **Carried A** | No server-side KYC/DVA state machine — reload during KYC loses spinner; backend never returns `'identifying'` | No `kycSubmittedAt`/`dvaStatus` columns; `Account.tsx:85` `awaitingValidation` is `useState` |
| 8 | **Carried B remainder** | (a) `assign.failed` fires NO reminder (`dva.service.ts:478-484`); (b) swallowed `createDedicatedAccount` failure after identification success (`:593-599`) — no reason, no reminder; (c) no "account ready" notification on `assign.success`; (d) no reconciliation for missed `customeridentification.success` | All verified in `dva.service.ts:440-620` |
| 9 | **Carried C** | BVN + NIN plaintext **and indexed**; `bvnVerifiedAt` stamped optimistically at submission | `schema.prisma:20-22,43`; `dva.service.ts:77` |
| 10 | **Carried D** | `splitAttached: false` silently swallowed by the UI | No `splitAttached` handling in `Account.tsx` |
| 11 | **Carried E** | Progressive onboarding stepper not built | `Account.tsx` monolithic flow |
| 12 | **NEW-F** | Raw 4-digit PIN in withdraw/connect/auto-split bodies | `settlement.validator.ts:18-21,29-31,38` — **accepted risk after NEW-1 Option B** (§5) |
| 13 | **NEW-3 leftover** | `resolveSettlementAccount` still lives in `dva.service.ts:834` | grep verified |

---

## §1. Phase roadmap — ALL remaining issues

**Phase 1 — Payout ops reliability + quick closeouts (SELECTED — fully planned in §2–§8)**
Items: **NEW-C (1), NEW-H (2), SLA-1 (3), NEW-G remainder (5), Hygiene (6)** — plus §3's OPTIONAL validator polish (NEW-8 is verified done; see the re-audit correction).
Rationale: completes the payout-operations story end-to-end (recipient hygiene → stuck-payout self-heal → admin SLA visibility) and closes the cheap client-trust residue that noticepay2 §5 planned but did not fully land. Exactly one migration. Zero frontend-breaking changes.

**Phase 2 — DVA onboarding state machine (next pass)**
Items: **Carried A (7) + Carried B remainder (8)**
Shape: one migration adding `kycSubmittedAt DateTime?` + `dvaStatus` enum (`none | identifying | active | failed`) on Business; `getVirtualAccount` returns `'identifying'`; `Account.tsx` spinner derives from server state (kills the `awaitingValidation` useState at `:85`); reminders on `assign.failed` + `assign.success` ("your account is ready") via `createReminderOnce`; wire `dvaFailureReason` + reminder into the swallowed catch at `dva.service.ts:593-599`; extend `requery` to cover the pre-DVA state (re-call `createDedicatedAccount` when `customeridentification.success` was missed).

**Phase 3 — PII / compliance (before public launch)**
Items: **Carried C (9) + NEW-F (12, revisit)**
Shape: AES-256-GCM app-layer encryption of `bvn`/`nin` at rest (`PII_ENCRYPTION_KEY` env; store ciphertext; drop `@@index([bvn])`, add a `bvnHash` lookup column); move the `bvnVerifiedAt` stamp from `validateCustomer` (`dva.service.ts:77`) into the `customeridentification.success` webhook handler only. NEW-F is only worth revisiting if out-of-band PIN verification is ever re-introduced; inline-PIN-with-bcrypt is the documented accepted trade-off.

**Phase 4 — Onboarding UX polish (parallelizable with Phase 2)**
Items: **Carried D (10) + Carried E (11) + NEW-3 leftover (13)**
Shape: surface `splitAttached` from the connect response as a warning callout in `handleConnectSettlement`; progressive stepper + instant `resolveAccount` name-check before BVN submission; move `resolveSettlementAccount` into `settlement.service.ts` as the single home.

Dependency note: Phase 1 touches disjoint columns/services from Phase 2 — landing Phase 1 does not block Phase 2 design.

---

## §2. SELECTED BATCH (Phase 1) — execution order

```
0. Green baseline: cd backend && npx tsc --noEmit && npm run lint && npm run test:e2e
1. §4 NEW-G remainder  (frontend dead-payload cleanup — one line + tsc/build gate)
2. §5 NEW-C   (migration #1 — recipient reuse; MUST land BEFORE NEW-H, because
               NEW-H's re-query-retry path also creates recipients)
3. §6 NEW-H   (no migration — provider.verifyTransfer + guarded outcome applier
               + cron Phase 3 + admin requery endpoint)
4. §7 SLA-1   (no migration — admin SLA count + banner; rides §6's admin-page wiring)
5. §3 (OPTIONAL) validator superRefine — skip by default; see §3.2 recommendation
   (§8 Hygiene REMOVED in v2.2 — already done in the tree; see §8)
```

**Why this order:** NEW-C before NEW-H because NEW-H's retry path calls the same recipient code — reuse must exist first or the retry recreates the phantom-recipient problem NEW-C fixes. SLA-1 last on the backend because it reuses §6's admin-page changes. §3 (NEW-8) dropped from the mandatory sequence after the re-audit confirmed it is already implemented — only the optional cosmetic validator refinement remains. §8 dropped entirely (v2.2): the dead `stepUpToken` store field was already removed — confirmed by full-tree grep; `pin.store.ts` has no such field. §6 now carries one extra one-line code fix (the `initiatedAt` stamp at claim time — see §6.3) that must land with the sweep or the sweep's clock is wrong.

### Invariants (inherited from noticepay2 §0 — still binding)

1. Reminders fire **post-transaction, fire-and-forget** (`void createReminderOnce({...}).catch(...)`). Never inside `$transaction`.
2. **Paystack HTTP calls never inside a DB transaction.**
3. **PII masking** — account numbers only as last-4 in logs/audit/responses (`settlement.service.ts:695` is the pattern).
4. **`createReminderOnce` owns dedup** — always supply `(referenceType, referenceId)` so webhook replays dedupe.
5. E2E runs in-band; settlement fixtures at `tests/e2e/api.e2e.test.ts:1601+` depend on shared ordering — preserve.
6. Any new sweep phase MUST live inside the advisory lock in `jobs/reminders.cron.ts` (`LOCK_KEY = 947362`).

---

## §3. NEW-8 — ✅ VERIFIED ALREADY IMPLEMENTED (re-audit correction); optional validator alignment only

> **⚠️ Re-audit correction (this session):** the initial draft of this plan claimed the clamp "never landed". That was wrong — the line-window read of `toggleAutoSplit` shows the clamp block exists and is correct. What the earlier pattern-grep missed: the clamp references `config.settlement.minTaxSplitPct`, which the grep pattern did not include. **Lesson recorded: pattern-greps are for discovery; line-window reads are for verification.**

### 3.1 What is already shipped (verified — do not re-implement)

- `settlement.service.ts:528-542` — enable path: `splitPct` outside `[minTaxSplitPct, maxTaxSplitPct]` → `400 INVALID_SPLIT_PERCENTAGE` (`:532-538`); disable path ignores the submitted pct entirely and preserves the stored value (`:539-541`).
- `config/index.ts:205-206` — `minTaxSplitPct` (`SETTLEMENT_MIN_TAX_SPLIT_PCT ?? 7.5`), `maxTaxSplitPct` (`SETTLEMENT_MAX_TAX_SPLIT_PCT ?? 50`).
- `.env.example:147-148` — both env vars already documented.
- noticepay2 §5.4's intended tests are satisfiable today: `{enabled: true, taxSplitPercentage: 0}` → 400 `INVALID_SPLIT_PERCENTAGE`; `{enabled: false, taxSplitPercentage: 0}` → 200 with stored value unchanged.

### 3.2 Residue — validator label divergence (OPTIONAL, cosmetic)

`settlement.validator.ts:37` still declares `.min(0).max(100)`. The service is the enforcement point and is correct, so this is purely a schema-honesty nit.

**Do NOT "fix" this with a naive `.min(config.settlement.minTaxSplitPct)`:** Zod validation runs BEFORE the service, and the disable path legitimately allows a below-min (or zero) `taxSplitPercentage` in the body — the service ignores it (`:539-541`). A strict schema would turn `{ enabled: false, taxSplitPercentage: 0 }` into a spurious 400 and break the friction-free-disable contract.

If alignment is wanted, the only correct shape is a sibling-conditional refinement:

```ts
.superRefine((val, ctx) => {
  if (val.enabled && val.taxSplitPercentage !== undefined) {
    if (val.taxSplitPercentage < config.settlement.minTaxSplitPct
        || val.taxSplitPercentage > config.settlement.maxTaxSplitPct) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        path: ['taxSplitPercentage'],
        message: `Tax split percentage must be between ${config.settlement.minTaxSplitPct}% and ${config.settlement.maxTaxSplitPct}%`,
      });
    }
  }
})
```

**Recommendation:** skip it in this pass. It duplicates the service check for zero behavioral gain; the service remains the single enforcement point. If a future client needs field-level validation details surfaced by Zod (rather than the service's `AppError`), pick this up then. Tests: none required (no behavior change); if implemented, run the four §3.1 contract cases to prove no regression.

---

## §4. NEW-G remainder — client `commissionPct` cleanup

**Problem (verified).** `Account.tsx:401` still sends `commissionPct: 0` in the connect payload (v2.2 re-verified — earlier `:428` citation was stale). The server already ignores it (`dva.controller.ts:101-104` parses only `bankCode/bankName/accountNumber/pin`; the settlement service hardcodes `config.settlement.platformCommissionPct`). This is dead-payload removal, kept in this batch because it is the frontend twin of §3's server-authority story and is a one-line change.

**Fix:** delete `commissionPct: 0` from the connect payload in `Account.tsx:401`. ⚠️ **Do NOT remove `platformCommissionPct?` from `frontend/src/types/index.ts:36`** — a blind grep for `commissionPct` will match it, but that is a *response* type field (the connect response legitimately returns `platformCommissionPct` from `settlement.service.ts:307`); it stays. The request payload is the only thing being cleaned. Verified (v2.2 re-grep): `Account.tsx:401` is the only request-payload occurrence in `frontend/src` (full-tree grep).

**Verification:** `cd frontend && npx tsc --noEmit && npm run build` — a clean build proves no consumer depended on the field.

---

## §5. NEW-C — Paystack transfer-recipient reuse

**Problem (verified).** `adminApproveWithdrawal` calls `provider.createTransferRecipient(...)` unconditionally (`settlement.service.ts:798` — v2.2 re-verified; earlier `:794` citation drifted) — a fresh `TRT_*` code per approved payout: unbounded phantom recipients in the Paystack dashboard, per-recipient API cost, broken reconciliation. noticepay1.md §9 triaged this as "when convenient"; it is now convenient, and it must precede NEW-H (whose retry path creates recipients too).

### 5.1 Migration `20260830140000_add_paystack_recipient_code`

```sql
ALTER TABLE "businesses"
  ADD COLUMN "paystack_recipient_code" TEXT,
  ADD COLUMN "recipient_fingerprint"   TEXT;
```

`schema.prisma` `model Business` (after the settlement fields):

```prisma
  // Paystack transfer recipient — created on first approved payout, reused while
  // the settlement bank account is unchanged. recipientFingerprint guards reuse:
  // it is `bankCode:accountNumber` of the settlement account the code was built
  // for; a bank change produces a new fingerprint, so the stale code is never
  // reused (self-invalidating — no explicit wipe needed).
  paystackRecipientCode String? @map("paystack_recipient_code")
  recipientFingerprint  String? @map("recipient_fingerprint")
```

Rollback = drop two nullable columns. No backfill (next approval recreates and persists).

### 5.2 Service — `settlement.service.ts`

**⚠️ Design correction (re-audit):** the current code builds the recipient from the **PAYOUT SNAPSHOT** (`payout.destinationAccountName/destinationAccountNum/destinationBankCode` at `:794-801`, incl. `currency: 'NGN'` + `description`) — NOT from the business's current settlement account. That is correct behavior: if the bank was legally changed between request and approval (via the `payoutChangePermitted` unlock), the admin approved a transfer to the account the SME *requested*, and the recipient must be built from that snapshot. **The reuse fingerprint is therefore keyed on the PAYOUT's destination fields, never on live business fields.** A business-field-keyed helper would silently redirect money to the current account — the exact catastrophe class this audit exists to prevent.

**a. Extract a helper (single source of truth for approve and any future retry path).** Note: `settlement.service.ts` imports `getPaymentProvider` from `@/lib/payment` (`:3`) but not the `PaymentProvider` type — add `import type { PaymentProvider } from '@/lib/payment/types';` for the helper signature (or type the param as `ReturnType<typeof getPaymentProvider>`):

```ts
async function resolveRecipientCode(
  provider: PaymentProvider,
  payout: {
    destinationBankCode: string;
    destinationAccountNum: string;
    destinationAccountName: string;
    businessId: string;
    businessName: string;
  },
  stored: { paystackRecipientCode: string | null; recipientFingerprint: string | null },
): Promise<{ recipientCode: string; reused: boolean }> {
  // Fingerprint of the account THIS payout is destined for (the approved snapshot)
  const fingerprint = `${payout.destinationBankCode}:${payout.destinationAccountNum}`;

  // Reuse ONLY when the stored code was provably built for this exact destination
  if (stored.paystackRecipientCode && stored.recipientFingerprint === fingerprint) {
    return { recipientCode: stored.paystackRecipientCode, reused: true };  // fast path — zero Paystack calls
  }

  const { recipientCode } = await provider.createTransferRecipient({
    type: 'nuban',
    name: payout.destinationAccountName,
    accountNumber: payout.destinationAccountNum,
    bankCode: payout.destinationBankCode,
    currency: 'NGN',
    description: `Payout for ${payout.businessName}`,
  });

  await prisma.business.update({
    where: { id: payout.businessId },
    data: { paystackRecipientCode: recipientCode, recipientFingerprint: fingerprint },
  });
  return { recipientCode, reused: false };
}
```

**b. `adminApproveWithdrawal` (`:728-893`; the inline recipient block to replace is `:796-805`):** replace the inline `createTransferRecipient` block with `resolveRecipientCode(provider, { ...payout destination fields, businessId, businessName: payout.business.businessName }, payout.business)`. The payout is loaded with `include: { business }` (`:729-740`), so the new Business columns arrive automatically — no select changes needed. The business update in the helper happens AFTER the claim tx has committed (`:750-793`) and outside any transaction — Paystack HTTP stays out of DB txs (invariant 2), same as today. **Behavior is byte-identical for the money path:** the recipient is always built from the same `payout.destination*` fields as before; only the *caching layer* is new. **Race note (v2.2, accepted for v1):** the fingerprint store happens post-tx, outside the per-business advisory xact lock — two near-simultaneous approvals of the same business can each create a recipient. Worst case = one extra phantom recipient, i.e. the status quo this batch fixes at scale; do not add locking for this.

**Observability seam (required for testability):** extend the existing `settlement.payout_approved` audit `newData` (`:834-838` v2.2 re-verified) with `recipientReused: reused`. `TRT_*` codes are not PII, so `recipientCode` may be logged too — but the boolean is what the e2e suite asserts (see 5.4). Without this flag, "recipient was not re-created" is unobservable from an in-band test suite, which calls the real Paystack test-mode API (the `loadEnv` guard permits `sk_test_`; there is no provider mock seam in e2e).

**c. Why the fingerprint is safe (write this as a code comment too):** the stored fingerprint records which destination account the stored recipient code was built for. A payout's destination changes ONLY via the admin-granted `payoutChangePermitted` bank-change flow — and a changed destination produces a changed fingerprint → the stale code can never be reused. Reuse is offered only when the stored code provably corresponds to the exact account this payout is going to.

**d. Failure self-heal:** in the approve catch block (`:864+` v2.2 re-verified, where the payout is marked `failed`), if the error is recipient-related (loose match on `recipient` in the message — log the classification), clear `{ paystackRecipientCode: null, recipientFingerprint: null }` so the next attempt re-creates. Note: the existing catch already stores the raw error into `failureReason` (`:872`) — leave that as-is (it is the support/debug surface), but the SME-facing `payout_failed` reminder must keep using the generic wording, as `payment.service.ts:654` already does.

### 5.3 Frontend

None. Entirely server-side; the approve flow and error codes are unchanged.

### 5.4 Tests (e2e — assertions via the `recipientReused` audit flag, since the in-band suite hits the real Paystack test-mode API)

1. Approve payout #1 (`:1920` flow) → 200; audit `settlement.payout_approved` has `recipientReused: false`; business row gains `paystackRecipientCode` + fingerprint equal to `bankCode:accountNumber` of the payout destination.
2. Request + approve payout #2 (same business, unchanged bank → same snapshot fingerprint) → 200; audit flag `recipientReused: true`; business row's stored code **unchanged** (same value as after payout #1).
3. Change settlement bank (via the `payoutChangePermitted` flow), request + approve a new payout → new payout's snapshot fingerprint differs → audit flag `recipientReused: false` again; fingerprint updated to the NEW snapshot.
4. Recipient error on approve → payout marked `failed`, stored code cleared (null in DB), next approve attempt succeeds with `recipientReused: false`.
5. Snapshot guard: approve a payout whose `payout.destination*` differs from live `business.settlement*` (simulate by direct DB update of the business between request and approve) → recipient built from the payout snapshot; audit `newData` carries the snapshot-derived fingerprint (regression guard for the §5.2 correction). The existing approve e2e (`:1920`) must keep passing unchanged.

### 5.5 Live-account hygiene note (out of code scope)

Existing phantom `TRT_*` codes on the Paystack dashboard can be bulk-deactivated from the dashboard once; no API work needed. Note it in the deploy checklist.

---

## §6. NEW-H — stale-`processing` payout sweep + admin re-query

**Problem (verified).** If a `transfer.*` webhook never arrives (cold start, downtime, secret rotation), the payout stays `processing` forever and its amount stays deducted from the SME's `availableForWithdrawal` — silent balance deflation with no surfacing anywhere. The provider interface has no `verifyTransfer` (`types.ts:181-183`), so there is currently no way to self-heal.

⚠️ **Semantics (carried from noticepay1.md — do not regress):** `pending` = awaiting admin approval = LEGITIMATE, never auto-touched. Only `processing` (transfer already initiated) older than 24h is swept.

### 6.1 Provider — `verifyTransfer`

**`backend/src/lib/payment/types.ts`** (after `initiateTransfer`):

```ts
export interface VerifyTransferResult {
  status: 'success' | 'failed' | 'reversed' | 'otp' | 'pending';
  failureReason?: string;
}
```

Add `verifyTransfer(reference: string): Promise<VerifyTransferResult>;` to the `PaymentProvider` interface.

**`paystack.provider.ts`** — `GET /transfer/verify/:reference`; map `data.status`: `success` → `'success'`, `failed`/`reversed` → themselves + `failureReason: data.reason || data.complete_message`, `otp` → `'otp'`, everything else → `'pending'`. Follow the existing provider conventions: no raw account data in logs, fixture path only under `shouldUseBankFixture()` (reuse the test-mode pattern from `resolveAccount`).

### 6.2 Shared outcome applier — refactor before wiring

The webhook handlers (`payment.service.ts:559-660`) already contain the `transfer.success` / `transfer.failed`/`transfer.reversed` flip logic (status flip, audit `settlement.payout_completed` / `settlement.payout_failed`, fire-and-forget reminders `payout_completed` / `payout_failed` at `:596-608` / `:650-662`).

**⚠️ Re-audit correction:** the webhook handlers currently use a **plain `update`** (`:575-581`, `:628-634`) — NOT a guarded flip. The initial draft wrongly claimed a guarded `updateMany` already existed there. The extraction must **introduce** the guard:

**Extract that body into an exported `applyTransferOutcome(payoutId, outcome: 'success' | 'failed', reason?)` in `settlement.service.ts`**, with the status flip as a guarded `updateMany`:

```ts
// success:
const res = await prisma.settlementPayout.updateMany({
  where: { id: payoutId, status: 'processing' },   // ← never un-flip a terminal state
  data: { status: 'completed', completedAt: new Date() },
});
// failed: same guard, data: { status: 'failed', failureReason: reason }
```

Rationale: the sweep and the webhook can race (webhook lands mid-sweep); a single applier keeps status transition, audit shape, and reminder dedup identical on both paths. `createReminderOnce` dedup on `(businessId, type, 'settlement_payout', payout.id)` makes double-fire harmless.

**Guard semantics (precise spec):**
- **Success applier** — `updateMany where { id, status: { in: ['processing', 'failed'] } }` → `completed`. Allowing `failed → completed` is REQUIRED: it preserves the existing self-heal (approve-path Paystack error marks the payout `failed` at `settlement.service.ts:864-870`; a late `transfer.success` webhook must still be able to complete it — documented at `:861-862`). A `completed` row can never regress.
- **Failure applier** — `updateMany where { id, status: 'processing' }` → `failed`. A `completed` (or already-`failed`) payout can NEVER be marked failed — this fixes the latent pre-existing bug where a late `transfer.failed`/`transfer.reversed` webhook would regress a `completed` payout (`:628-634` has no such guard today).

Both where-clause shapes are covered by tests 6.5.6–6.5.8.

**No-op semantics (v2.2 — previously unspecified):** when the guarded `updateMany` returns `count === 0` (webhook raced a terminal state, or double-apply), the applier MUST `logger.warn` with `{ payoutId, attemptedOutcome }` and **skip the reminder** — a no-op must not look like a success (`createReminderOnce` dedup would suppress a duplicate anyway, but the log is the detection surface). Documented known limitation: `transfer.reversed` arriving after `completed` is intentionally a no-op (the failure guard blocks the flip); funds reclamation in that rare case is manual ops, and the warn log is what makes it visible.

The webhook handlers in `payment.service.ts` then delegate to the applier — their current plain `update` calls are replaced, which is a strict improvement, and the existing transfer-webhook e2e (`api.e2e.test.ts:2039`) must stay green unchanged.

### 6.3 Sweep — `settlement.service.ts` + cron wiring

New export `sweepStalePayouts(): Promise<{ checked: number; completed: number; failed: number; stillPending: number }>`:

1. `findMany({ where: { status: 'processing', initiatedAt: { lt: new Date(Date.now() - staleHours*3600*1000) } } })` — 24h from `config.settlement.payoutStaleHours` (new optional env `PAYOUT_STALE_HOURS ?? 24`). ⚠️ **v2.2 correction + REQUIRED one-line fix:** `initiatedAt` is `DateTime @default(now())` and is currently **never set at claim time** — the atomic claim in `adminApproveWithdrawal` (`settlement.service.ts:782-785`) writes only `status: 'processing'`, so today `initiatedAt == createdAt` (request time). **Add `initiatedAt: new Date()` to that claim `updateMany`'s `data`** as part of this item; otherwise any payout that sat `pending` >24h shows the §6.4 "Stale" badge the instant it is approved and is swept on the first tick. Once fixed, `initiatedAt` (transfer initiated at claim time) is the semantically correct clock for BOTH the sweep and §6.4's `isStale` — do not mix `createdAt`/`initiatedAt` between them. (The originally drafted `transferReference: { not: null }` filter was dropped in v2.2 — the column is `String @unique`, non-nullable; the filter was a no-op.) Legacy `processing` rows keep `initiatedAt == createdAt` — the conservative direction, acceptable.
2. Per payout, `try/catch` with `logger.warn` (one bad row never aborts the sweep — same pattern as the invoice sweep):
   - `verifyTransfer(transferReference)` →
     - `success` → `applyTransferOutcome(id, 'success')`
     - `failed`/`reversed` → `applyTransferOutcome(id, 'failed', reason)` — funds auto-release because `getPayoutPreview` already excludes `failed` (verified NEW-6a behavior)
     - provider NOT-FOUND (Paystack 404 / "Transfer not found") → `applyTransferOutcome(id, 'failed', 'Transfer not found at provider — initiation never completed')`. **v2.2 addition:** a claim can commit and then crash before `initiateTransfer` runs (or the initiation throws before the catch completes), leaving `status='processing'` with a reference Paystack doesn't know. Without this branch the row stays `processing` forever — NEW-H's exact failure mode — and the §6.4 requery endpoint hits the same throw.
     - `otp` or `pending` → leave untouched, count in `stillPending` (log only; Paystack still owns it)
3. Return counts.

**Cron wiring — `jobs/reminders.cron.ts`:** add as **Phase 3** inside `runDailySweep`, after the invoice sweep, inside the existing advisory lock. Call `void`-style? No — it must be awaited so the `done` log includes its counts; extend the structured log payload with `stalePayouts: { checked, completed, failed, stillPending }`. The daily 00:30 Africa/Lagos cadence is acceptable for v1 (a stuck payout self-heals within ~25h worst case).

### 6.4 Admin surfacing — list badge + manual re-query endpoint

- **List badge:** the admin listing is `adminListWithdrawalRequests` (`settlement.service.ts:653` v2.2 re-verified; `listPayoutHistory` at `:593` is the SME-facing history — do not touch). Its mapper (`:691-708`) already returns `status`, `createdAt` AND `initiatedAt` (v2.2 re-verified — no select changes needed for the badge); add a computed `isStale` boolean (`status === 'processing' && initiatedAt < now - staleHours`) to the mapped item. `frontend/src/pages/admin/AdminWithdrawals.tsx` renders an amber "Stale — re-querying pending" pill on `isStale` rows.
- **Manual re-query:** new admin route `POST /api/v1/admin/settlement/withdrawals/:id/requery` — ⚠️ route family is `/admin/settlement/withdrawals/*` (verified: `admin.routes.ts:24-26` — `GET /settlement/withdrawals`, `POST .../:id/approve`, `POST .../:id/reject`), NOT `/admin/withdrawals/*`. Admin role middleware, same as approve/reject. Controller: load payout, refuse if not `processing` (`409 PAYOUT_NOT_PROCESSABLE`), call the §6.3 sweep logic for this single row, return the outcome so the admin sees "Completed / Failed (reason) / Still pending at Paystack" in the toast. Audit `settlement.payout_requeried`. Frontend: a "Re-query Paystack" button on stale rows in `AdminWithdrawals.tsx` — note this page calls the API directly via `api` from `@/lib/axios` (`:16`) with local state, NOT through `settlement.store.ts`; follow the page's existing pattern (`fetchWithdrawals` at `:70`) and add a `requeryWithdrawal` helper alongside its inline approve/reject calls.

### 6.5 Tests

1. Create payout row `status='processing'`, `initiatedAt` backdated 25h (v2.2: backdate `initiatedAt`, NOT `createdAt` — the sweep filters on `initiatedAt`; see §6.3), mocked provider `verifyTransfer → success` → sweep flips to `completed`, reminder `payout_completed` exists, audit written.
2. Same setup with `verifyTransfer → failed` → flips `failed`, `payout_failed` reminder message contains the reason (masked appropriately), balance preview re-includes the amount.
3. Same setup with `verifyTransfer → 'otp'` → row still `processing` after sweep (`stillPending` count 1).
4. `processing` but 23h old → not swept.
5. `pending` (awaiting approval) 72h old → **never swept** (regression guard for the semantics rule).
6. Guard direction A: `applyTransferOutcome(id, 'success')` on a `failed` row → flips to `completed` (self-heal preserved).
7. Guard direction B: `applyTransferOutcome(id, 'failed')` on a `completed` row → **no-op** (regression guard for the latent-unflip fix).
8. Guard direction C: double-apply success → second call no-ops on status, creates no duplicate reminder (dedup proof).
9. `POST /admin/settlement/withdrawals/:id/requery` on a `pending` row → 409.
10. Provider NOT-FOUND on verify (claim committed, initiation never ran — v2.2) → flips `failed` with the "not found at provider" reason, balance preview re-includes the amount, no duplicate reminder on re-run.

---

## §7. SLA-1 — approval-SLA visibility for admins

**Problem (verified).** Under the v2 admin-queue workflow, an SME's withdrawal sits `pending` until an admin approves. Nothing tells the admin a request has breached 24h — the SME just waits. `Reminder.businessId` is NOT NULL (`schema.prisma`), so the existing reminder infra cannot target admins without a schema change; we deliberately do NOT take a migration for this in Phase 1.

**Design decision — dashboard KPI + page banner, not reminders.** The admin audience is one person (solo-dev stage); a passive surface they already open beats new notification plumbing. Revisit real admin notifications (adminwatch.md) post-launch.

### 7.1 Backend — `admin.service.ts` / `admin.controller.ts` / `admin.routes.ts`

Extend the existing `getDashboardStats()` (`admin.service.ts:5`) payload with:

```ts
withdrawalSla: {
  pendingCount: number;          // all pending
  breachedCount: number;         // pending AND createdAt < now - SLA_HOURS
  oldestPendingHours: number;    // for the banner copy
}
```

`SLA_HOURS` = reuse `config.settlement.payoutStaleHours` (24) from §6.3 — one knob, one meaning ("how long a payout stage may sit before someone must look"). Pure `count`/`aggregate` queries; if the dashboard payload isn't a natural fit, a small `GET /admin/settlement/withdrawals/sla` endpoint under the same route family as approve/reject (`admin.routes.ts:24-26`) is the fallback.

### 7.2 Frontend

- `AdminDashboard.tsx` — KPI card: "Withdrawals awaiting approval: N (M > 24h)", breached count amber/red when > 0, linking to `/admin/withdrawals?status=pending`.
- `AdminWithdrawals.tsx` — amber banner above the list when `breachedCount > 0`: *"N withdrawal request(s) have been pending for more than 24 hours."* Reuse the existing banner/pill styling in that file — zero new components.

### 7.3 Tests

1. Seed 2 pending payouts (one backdated 30h) → payload `{ pendingCount: 2, breachedCount: 1 }`.
2. Approve one → counts drop accordingly.
3. Zero pending → both 0, banner suppressed (frontend build check only).

---

## §8. Hygiene — dead `stepUpToken` frontend state — ✅ ALREADY DONE (v2.2 re-audit; REMOVED from the batch)

**Re-audit (Sep 1, 2026).** Zero `stepUpToken`/`clearStepUpToken` occurrences in `frontend/src` (full recursive grep over `*.ts`/`*.tsx`); `pin.store.ts` is 174 lines — the plan's `:188` citation predates the cleanup, which landed in the working tree after this plan was written. The server side was already clean (NEW-1: zero occurrences in `backend/src`).

**No action required.** The §2 execution order no longer includes this item, and the §9 risk-matrix row is retired. If a future grep ever re-surfaces the field, the original fix stands: remove `stepUpToken` from the state interface + initial state, delete `clearStepUpToken`, gate with `cd frontend && npx tsc --noEmit && npm run build`.

---

## §9. Risk matrix, verification, deploy checklist

### Risk matrix

| Change | Risk | Mitigation |
|---|---|---|
| §5 recipient reuse | **Medium — money path** | Payout-snapshot-keyed fingerprint makes stale-code reuse structurally impossible (§5.2c — money path behavior byte-identical, only caching added); recipient-error self-heal (§5.2d); 5 dedicated e2e tests incl. bank-change and snapshot-destination guards |
| §6 `applyTransferOutcome` refactor | **Medium — touches webhook behavior** | Guarded flip spec is explicit (§6.2): success allows `processing/failed → completed` (self-heal preserved), failure allows only `processing → failed` (latent un-flip bug fixed); transfer-webhook e2e (`:2039`) must stay green; tests 6.5.6–6.5.8 cover all guard directions |
| §6 stale sweep | Low | Only `processing` >24h touched; `pending` never swept (test 6.5.5); per-row try/catch; runs inside the existing advisory lock |
| §7 SLA KPI | Very low | Read-only aggregates; no state change |
| ~~§8 store cleanup~~ | — | RETIRED (v2.2 re-audit): already done in the tree — zero `stepUpToken` consumers remain; no action |

### Verification checklist (run after EVERY item)

```bash
cd backend
npx tsc --noEmit          # 0 errors
npm run lint
npm run test:e2e          # full in-band suite must stay green

cd ../frontend
npx tsc --noEmit && npm run build
```

### Manual smoke (after all items)

1. Admin: approve two payouts for the same business → second approval skips recipient creation; Paystack dashboard gains exactly one new `TRT_*`.
2. Backdate a `processing` payout >24h (or run the cron) → sweep log shows `stalePayouts` counts; row flips; SME bell shows `payout_completed`/`payout_failed`.
3. Dashboard card shows the breached-pending count; `/admin/withdrawals` banner matches; "Re-query Paystack" on a stale row resolves it.
4. API: `PATCH auto-split { enabled: true, taxSplitPercentage: 0 }` → 400 `INVALID_SPLIT_PERCENTAGE` (already implemented — regression check only); `{ enabled: false, taxSplitPercentage: 0 }` → 200, value unchanged.
5. UI: settlement connect still succeeds (no `commissionPct` in payload); PIN lockout UX unchanged.

### Deploy checklist

1. Run migration `20260830140000_add_paystack_recipient_code` **before/with** the code deploy (Prisma client references the new columns). Rollback = drop the two columns.
2. Optional env `PAYOUT_STALE_HOURS` (default 24) documented in `.env.example`. (`SETTLEMENT_MIN_TAX_SPLIT_PCT` / `SETTLEMENT_MAX_TAX_SPLIT_PCT` already exist at `.env.example:147-148` — nothing to add.)
3. One-time: deactivate the accumulated phantom `TRT_*` recipients in the Paystack dashboard (§5.5).
4. Confirm cron is enabled in prod — §6.3's sweep rides the existing daily schedule; without it, manual re-query remains the backstop.

### Explicitly out of scope for this pass

- **Phase 2** (Carried A/B remainder — KYC state machine, assign.failed/success reminders, missed-webhook reconciliation), **Phase 3** (Carried C BVN encryption, NEW-F revisit), **Phase 4** (Carried D/E, NEW-3 leftover) — shapes committed in §1.
- Cron cadence faster than daily for the stale sweep (hourly is a one-line schedule change if volume ever justifies it).
- Admin *notification* infrastructure (email/WhatsApp to the admin) — SLA-1 uses passive surfaces until the adminwatch.md notification layer exists.
- Auto-retry of failed transfers — a failed payout releases funds and notifies; re-requesting is the SME's action.

---

*noticepay3.md — v2.1 (twice re-audited), Aug 30, 2026. **v1→v2 corrections, all caught by a line-window re-read of the code after the initial pattern-grep pass:** (1) §3/NEW-8 — the split clamp was already implemented (`settlement.service.ts:528-542`, `INVALID_SPLIT_PERCENTAGE`); demoted from the work list to an optional cosmetic validator note, with an explicit warning that naive Zod tightening would break the disable path; (2) §5 — the recipient-reuse helper was redesigned to key its fingerprint on the **payout destination snapshot** (`payout.destination*`, matching the existing `:794-801` behavior), not live business fields — the v1 sketch would have redirected money to the current account when the bank changed between request and approval; (3) §6.2 — the webhook handlers use plain `update`, not a guarded flip; the applier now specifies exact guard semantics (`success: processing|failed → completed` preserving the self-heal; `failed: processing → failed` only, fixing a latent completed→failed regression); (4) naming fixes: `adminListWithdrawalRequests` (not `getPayoutHistory`), `getDashboardStats` (`admin.service.ts:5`), `AdminWithdrawals.tsx` uses direct `api` calls (not `settlement.store`), env vars `SETTLEMENT_MIN/MAX_TAX_SPLIT_PCT` already documented at `.env.example:147-148`.

**v2→v2.1 corrections (second adversarial pass — claims that had rested on inference, now directly verified):** (5) FOUND-1 confirmed by direct read — `PinModal.tsx:91-92` `if (res.valid) { onSuccess(pin); }`, no `stepUpToken` consumer anywhere in `frontend/src` except the dead store field §8 removes; (6) §6.4/§7.1 route family corrected to `/admin/settlement/withdrawals/*` (verified `admin.routes.ts:24-26` — the draft's `/admin/withdrawals/*` would 404); (7) §5.4 tests redesigned around a new `recipientReused` audit flag in `settlement.payout_approved` — the in-band e2e suite hits the real Paystack test-mode API (no mock seam), so "recipient not re-created" was previously unassertable; (8) §4 gained a guard: `types/index.ts:36 platformCommissionPct?` is a response-type field and must NOT be removed by a blind `commissionPct` grep; (9) §5.2a notes the missing `PaymentProvider` type import. **"Relax/remove" review outcome:** nothing in the batch was dropped — each remaining item is either money-correctness (NEW-C/NEW-H), support-load (SLA-1), or a verified live defect (NEW-G payload, dead store field); §3's optional polish is explicitly recommended to SKIP. Every ✅/❌ in §0 verified against the working tree this session. Migration count: exactly one (`20260830140000_add_paystack_recipient_code`). No new dependencies.*

*v2.2 corrections (third adversarial pass — full working-tree re-audit, Sep 1, 2026). Every §0/§5/§6/§7 claim re-verified by line-window reads. The plan's architecture, ordering, invariants, and §6.2 guard semantics are CONFIRMED CORRECT against the tree. Four corrections required before execution:*

1. **§6.3 BLOCKER — the `initiatedAt` premise is false.** `SettlementPayout.initiatedAt` is `DateTime @default(now())` and is **never written anywhere** — the atomic claim in `adminApproveWithdrawal` (`settlement.service.ts:782-785`) sets only `status: 'processing'`. In practice `initiatedAt == createdAt` (request time). Executed as-written: (a) any payout that sat `pending` >24h shows the §6.4 "Stale" badge immediately on approval and is swept on the first tick — the badge lies about transfer-stuck-ness; (b) §6.5 tests 1–3 say "backdate **createdAt**" while the sweep filters `initiatedAt` — internally inconsistent, tests fail as specified. **Fix (one line):** add `initiatedAt: new Date()` to the approve-path claim `updateMany` data (`:782-785`), and change §6.5 tests 1–3 to backdate `initiatedAt`. Legacy `processing` rows keep initiatedAt=createdAt — the conservative direction, acceptable.

2. **§8 is ALREADY DONE — remove from the batch.** Zero `stepUpToken`/`clearStepUpToken` occurrences in `frontend/src` (full recursive grep); `pin.store.ts` is 174 lines (the plan cites `:188`, which cannot exist). The cleanup landed after this doc was written. Execution step: confirm the grep, skip §8.

3. **§6.3 gap — Paystack "transfer not found" (404) has no branch.** A crash between the claim tx and `initiateTransfer` (or a claim followed by a rejected initiation that itself threw before the catch completed) leaves `status='processing'` with a `transferReference` that does not exist at Paystack. `verifyTransfer` throws; the per-row try/catch warns but the row stays `processing` forever — NEW-H's exact goal unmet for that row, and the §6.4 manual re-query hits the same throw. **Fix:** in `sweepStalePayouts` (and the requery endpoint), map provider not-found (Paystack 404 / "Transfer not found") to `applyTransferOutcome(id, 'failed', 'Transfer not found at provider — initiation never completed')`. Add a §6.5 test for it.

4. **§6.2 applier — `updateMany count = 0` behavior unspecified.** Specify: when the guarded flip matches 0 rows, `logger.warn` with the payout id + attempted outcome and **skip the reminder** (dedup would suppress it anyway, but a no-op should not look like a success). Document the known limitation: `transfer.reversed` arriving after `completed` is intentionally a no-op (the failure guard blocks the flip) — funds reclamation needs manual ops; the warn log is the detection surface.

*Minor drift (claims still true, references stale — trust the behavior, not the number):* §4/§0#5 `commissionPct: 0` is at `Account.tsx:401` (not `:428`); `awaitingValidation` at `Account.tsx:83` (not `:85`); in `settlement.service.ts`: recipient block `:798-805` (not `:794`), `adminListWithdrawalRequests` `:653` (not `:649`), `listPayoutHistory` `:593` (not `:589`), masking `:699` (not `:695`), audit newData `:834-838`, catch failureReason `:872`. `transferReference` is `String @unique` (non-nullable) — the sweep's `{ not: null }` filter is a harmless no-op. Migration name `20260830140000` sorts after the latest existing migration (`20260830130000_add_pin_attempt_window`) ✓. §5 residual risks accepted for v1: (a) the fingerprint store happens post-tx outside the per-business advisory xact lock, so two near-simultaneous approvals of the same business can each create a recipient — worst case one extra phantom, i.e. status quo ante; (b) the fingerprint keys on `bankCode:accountNumber` only — a name-only change reuses the recipient built with the old name (Paystack NUBAN routes by account number; acceptable). §7's `createdAt`-based SLA clock is correct for `pending` rows (queue-wait semantics) — no initiatedAt confusion there.

**v2.2.1 — fold-in complete.** All v2.2 deductions are now merged into the section bodies above: §0 items 5–6 (NEW-G line ref `:401`; Hygiene retired), §2 execution order (§8 removed; `initiatedAt` stamp added to §6's scope), §4, §5.2b/d (drifted refs + accepted race note), §6.2 (no-op/`count===0` semantics + reversed-after-completed limitation), §6.3 (`initiatedAt` claim-stamp REQUIRED fix; NOT-FOUND branch added; no-op `transferReference` filter dropped), §6.4 (mapper refs + `initiatedAt` already returned), §6.5 (tests 1–3 backdate `initiatedAt`, not `createdAt`; new test 10 for NOT-FOUND), §8 (retired as ALREADY DONE), §9 (risk-matrix row retired). **The section bodies are now authoritative — where pre-v2.2 wording survives elsewhere in the doc, the sections win.** Effective batch after fold-in: §4 (one line) → §5 NEW-C (one migration) → §6 NEW-H (+ the `initiatedAt` one-liner) → §7 SLA-1; §3 optional polish and §8 both explicitly skipped.






