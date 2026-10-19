# noticepay2.md — Implementation Plan: Post-P0 Work Set

**Date:** 2026-08-30
**Scope:** The next work set after the P0 fixes (NEW-B, NEW-D, NEW-7 v2 — all implemented and verified in code on both backend and frontend).
**Basis:** Every file and line number below was read directly from the current working tree in this session. No assumptions, no stale doc references.

**Work items in this plan (in execution order):**

| # | Item | Type | Migration? | Est. |
|---|------|------|-----------|------|
| 0 | **FOUND-1** — withdrawal UI sends `stepUpToken` as `pin` (new finding, live-money path) | Bug fix | No | 30 min |
| 1 | **NEW-K** — split-settlement ledger (`settledViaSplit` / `platformRetained`) | Money correctness | **Yes** | 4 h |
| 2 | **NEW-I** — SME notifications across the payout lifecycle | UX / support-load | No | 2 h |
| 3 | **NEW-2 + NEW-1** — PIN on auto-split; delete dead `stepUpToken` | Security | No | 1–2 h |
| 4 | **NEW-8 + NEW-G** — server-authoritative split/commission clamps | Security / revenue | No | 90 min |
| 5 | **PIN-1** — 5 attempts (was 3) + rolling 24h reset window (was: attempts stuck forever) | Security / UX | **Yes** | 2–3 h |

---

## §0. Ground truth & invariants (read before touching anything)

**Verified current state (this session):**
- P0 backend done: `settlement.service.ts` — NEW-B filter at `:72`, NEW-D guard at `:465-471`, NEW-7 v2 request path `:317-450`, admin approve `:653-805`, admin reject `:811-864`. Backend `tsc --noEmit` passes clean.
- P0 frontend done: `AdminWithdrawals.tsx` routed at `/admin/withdrawals` (`App.tsx:109`), `PayoutWithdrawalModal.tsx` + `settlement.store.ts` handle the new workflow and error codes.
- NOT done (verified absent): `settledViaSplit` on `SalesTransaction` (no such column), any payout reminder (webhook handlers `payment.service.ts:560-636` only write audit logs), PIN on `toggleAutoSplit` (`settlement.service.ts:455-513` — bearer token only), any clamp on `taxSplitPercentage` (validator `:36-39` allows `min(0)`), `paystackRecipientCode` (no such column).

**Repo invariants this plan must not violate:**
1. **Reminders fire post-transaction, fire-and-forget** — `void createReminderOnce({...}).catch(err => logger.warn(...))`. Never inside a `$transaction`. Canonical example: `dva.service.ts:737-749`.
2. **Paystack HTTP calls never inside a DB transaction.** The approve path already does this correctly (`adminApproveWithdrawal`); don't regress it.
3. **bcrypt/PIN verification outside transactions** (`settlement.service.ts:334` comment).
4. **PII masking** — account numbers masked to last-4 in list responses and reminder messages (`adminListWithdrawalRequests:624` is the pattern).
5. **`createReminderOnce` owns dedup** — keyed `(businessId, reminderType, referenceType, referenceId)` when a ref is supplied (`reminder.service.ts:105-146`). Always supply a reference so webhook replays dedupe.
6. **`Reminder.reminderType` is a plain `String` column** (`schema.prisma:389`) — new reminder types need **no migration**, only the TS union in `reminder.service.ts:22-34`.
7. **E2E tests run in-band** (`backend/tests/e2e/api.e2e.test.ts`); settlement tests live in `describe('Settlement & Automated Payouts')` at `:1601` and depend on shared fixtures created earlier in the same describe block (connect at `:1602` runs before auto-split at `:1629`). Preserve ordering.

**Prerequisite (before item 0):** commit the current dirty tree (60+ modified/untracked files) and run `cd backend && npm run test:e2e` to establish a green baseline. Do not start NEW-K on top of uncommitted P0 work.

---

## §1 (Work item 0). FOUND-1 — Withdrawal UI sends `stepUpToken` where the server expects the raw PIN

**Severity: HIGH (live-money path broken for real users). Discovered during this planning pass.**

**The bug chain:**
- `PinModal.tsx:92` calls `onSuccess(res.stepUpToken)` — the modal hands back the JWT step-up token, never the raw PIN.
- `PayoutWithdrawalModal.tsx:79` declares `handlePinSubmit = async (pin: string) => {...}` and at `:83` sends that value as `pin` in the withdraw body.
- Server-side `withdrawBalance` → `pinService.verifyPin(userId, params.pin)` → `bcrypt.compare(pin, user.transactionPin)` (`pin.service.ts:138`).
- Therefore the real UI flow sends a JWT string as the PIN → bcrypt compare always fails → **every UI-initiated withdrawal fails PIN verification**. E2E tests never catch this because they POST directly with a real 4-digit PIN.

**Fix (backend unchanged):**
- `frontend/src/components/PinModal.tsx:92` — change `onSuccess(res.stepUpToken)` to `onSuccess(pin)` (the raw digits are already in scope at `:85`). Update the `onSuccess` type at `:9` to `(pin: string) => void`.
- `PayoutWithdrawalModal.tsx:79` — already `(pin: string)`; no change needed. This is the ONLY PinModal consumer (verified by grep), so the change is safe.

**Verification:** manual smoke — request a withdrawal through the UI with a correct PIN → succeeds; wrong PIN → "incorrect PIN" toast, attempts decrement.

## §2 (Work item 1). NEW-K — Split-settlement ledger

**Problem.** With auto-split ON, Paystack sends `(100 − taxSplitPercentage)%` of every DVA inflow straight to the SME's commercial bank and keeps only `taxSplitPercentage%` on the platform. `getPayoutPreview` (`settlement.service.ts:67-77`) counts the **full** amount of every confirmed DVA inflow as withdrawable → the SME can request, and an admin can approve, a payout of money that already left the platform. The NEW-D guard (`:465`) makes auto-split easier to adopt correctly, which *increases* exposure to this bug.

**Design decision (refinement over the noticepay.md sketch):** the sketch said "exclude `settledViaSplit=true` inflows." Excluding them **entirely** is wrong: the platform-retained share (`amount × splitPct/100`) IS real platform money the SME must still be able to withdraw (it funds their tax reserve). Excluding everything locks up that share forever. The correct ledger: a split-settled inflow contributes **`amount × splitPct / 100`** to the withdrawable balance.

To keep the preview computable with plain Prisma aggregates (no raw SQL, no row fetching), we persist the retained share at webhook time.

### 2.1 Migration

New migration `20260830120000_add_sales_split_ledger` (SQL):

```sql
ALTER TABLE "sales_transactions"
  ADD COLUMN "settled_via_split" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "split_pct"         DECIMAL(5,2),
  ADD COLUMN "platform_retained" DECIMAL(15,2);
```

`schema.prisma` — `model SalesTransaction` (starts `:127`), add:

```prisma
  settledViaSplit  Boolean  @default(false) @map("settled_via_split")
  splitPct         Decimal? @map("split_pct") @db.Decimal(5, 2)
  platformRetained Decimal? @map("platform_retained") @db.Decimal(15, 2)
```

Run `npm run prisma:generate` + `npm run prisma:migrate` locally. **Deploy note:** the migration must run before/with the code deploy (Prisma client will reference the new columns). Rollback = drop the three columns; no data loss (new columns only).

### 2.2 Flag at webhook time — `dva.service.ts` `processDVATransferWebhook` (`:645-752`)

The business row fetched at `:671-673` has no `select`, so `business.autoSplitEnabled`, `business.taxSplitPercentage`, and `business.paystackSubaccountCode` are already available. In the `salesTransaction.create` data (`:699-719`), add:

```ts
settledViaSplit: business.autoSplitEnabled && Boolean(business.paystackSubaccountCode),
splitPct:  business.autoSplitEnabled && business.paystackSubaccountCode ? business.taxSplitPercentage : null,
platformRetained: business.autoSplitEnabled && business.paystackSubaccountCode
  ? new Prisma.Decimal(amount).mul(business.taxSplitPercentage).div(100)
  : null,
```

Also record it in the sale `metadata` (`:710-714`) for provenance: `splitSettled: true` when applicable.

**Backfill decision: NO backfill.** Historical rows default `settledViaSplit=false` → treated as fully platform-held (conservative direction: overstates withdrawable for old rows only if auto-split was silently ON in the past). Current DB reality (verified this session): 45 sales total, **0 payouts ever**, auto-split only became safely usable with NEW-D (Aug 29). Risk ≈ zero; a retroactive backfill is impossible anyway (historical `autoSplitEnabled` state was never journaled).

### 2.3 Preview math — `settlement.service.ts` `getPayoutPreview` (`:54-155`)

Replace the single inflow aggregate (`:67-78`) with three (all keep the NEW-B `metadata` filter at `:72`):

```ts
// Platform-held share of split-settled inflows
const splitAgg = await db.salesTransaction.aggregate({
  where: { businessId, source: 'bank_transfer', status: 'confirmed',
           metadata: { path: ['channel'], equals: 'dva' }, settledViaSplit: true },
  _sum: { platformRetained: true },
});
const totalPlatformRetained = toNumber(splitAgg._sum.platformRetained ?? 0);

// Plain (non-split) inflows count in full
const plainAgg = await db.salesTransaction.aggregate({
  where: { ...same..., settledViaSplit: false },
  _sum: { amount: true },
});
const totalPlainInflows = toNumber(plainAgg._sum.amount ?? 0);

// ALL confirmed DVA inflows — display + tax fallback only
const allAgg = await db.salesTransaction.aggregate({
  where: { businessId, source: 'bank_transfer', status: 'confirmed',
           metadata: { path: ['channel'], equals: 'dva' } },
  _sum: { amount: true },
});
const totalInflowsAll = toNumber(allAgg._sum.amount ?? 0);
```

Then:
- **Withdrawable math:** the `totalInflows` used at `:125` in `availableForWithdrawal` becomes `totalPlainInflows + totalPlatformRetained` — the money actually on the platform.
- **Tax fallback estimate (`:112-121`) MUST switch to `totalInflowsAll`, not the platform-held figure.** Tax is owed on *all* sales regardless of where the money settled. If the fallback kept using the (now smaller) platform-held number, the tax reserve would silently under-reserve for auto-split businesses. **This is the subtlest part of NEW-K — do not skip it.**
- **Response:** keep `totalInflows: totalInflowsAll` for display; add `totalSplitSettled: totalInflowsAll − (totalPlainInflows + totalPlatformRetained)` so the UI can show "settled directly to your bank" (frontend display optional; no other frontend change required).

Invariant: `availableForWithdrawal ≤ platform-held − reservations` always holds; the `Math.max(0, …)` at `:125` stays.

### 2.4 Tests (extend `describe('Settlement & Automated Payouts')`)

1. Seed via `prisma.salesTransaction.create`: one plain confirmed DVA sale (₦10,000) + one split-settled confirmed DVA sale (₦10,000, `splitPct 7.5`, `platformRetained 750`) → `GET /settlement/preview` → `totalInflows = 20000`, withdrawable math uses `10000 + 750 = 10750`.
2. Pending payout larger than platform-held → `400 INSUFFICIENT_FUNDS` even though raw inflows look bigger.
3. Tax fallback: business with no finalized reports and only split-settled inflows → `taxReserve` computed off `totalInflowsAll` (7.5% of the ₦10,000-scale profit, not the ₦750-scale).

## §3 (Work item 2). NEW-I — SME notifications across the payout lifecycle

**Problem.** The NEW-7 v2 flow made the SME wait on an admin, but nothing tells them what happened. Verified: `withdrawBalance` (`:317-450`), `adminApproveWithdrawal` (`:653-805`), `adminRejectWithdrawal` (`:811-864`), and the `transfer.success`/`transfer.failed` webhook handlers (`payment.service.ts:560-636`) write audit logs only — no `Reminder`, no email. Silence = support tickets + duplicate re-requests (the duplicate guard at `:376-395` only partially absorbs this).

**Scope decision:** in-app bell only (reminder rows). **No email in this pass** — consistent with the `payout_change_permitted` precedent (`payout.md:81-83`: "in-app bell is the delivery channel for now"); the Phase-5 email templates aren't wired yet. Adding email later is a small delta on top of these hook points.

### 3.1 New reminder types (NO migration — `reminderType` is `String`, `schema.prisma:389`)

`reminder.service.ts` — extend the union at `:22-34` (and the comment block at `:12-20`):

```ts
| 'payout_requested'   // SME submitted a withdrawal request
| 'payout_approved'    // admin approved; Paystack transfer initiated
| 'payout_rejected'    // admin rejected (reason included)
| 'payout_completed'   // transfer.success webhook confirmed the money landed
| 'payout_failed'      // transfer.failed/reversed webhook, or Paystack error at approval
```

Extend `ReminderReferenceType` at `:36` with `'settlement_payout'`.

### 3.2 Hook points (all: `void createReminderOnce({...}).catch(err => logger.warn(...))`, post-transaction, deduped by `referenceType: 'settlement_payout'`, `referenceId: payout.id`)

1. **Request submitted** — `withdrawBalance`, immediately after the `logAudit` at `:417-429` (outside the tx). Type `payout_requested`. Message: `"Withdrawal request of {formatNaira(amount)} received (ref {transferReference}). We'll notify you once it's reviewed — usually within 1–2 business hours."`
2. **Approved** — `adminApproveWithdrawal`, next to the success `logAudit` at `:753-764` (post-Paystack, post-tx). Type `payout_approved`. Message: `"Your withdrawal of {formatNaira(amount)} (ref {transferReference}) was approved. The transfer to your {destinationBankName} account ••••{last4} is in progress."` (`payout.destinationAccountNum.slice(-4)` — PII rule.)
3. **Rejected** — `adminRejectWithdrawal`, replacing the commented stub at `:859-861`. Type `payout_rejected`. Message includes the admin's reason and states funds are back in the available balance.
4. **Transfer confirmed** — `payment.service.ts` `transfer.success` block, after the status flip at `:575-581`, next to the audit at `:583-589`. Type `payout_completed`.
5. **Transfer failed/reversed** — `payment.service.ts` `transfer.failed|transfer.reversed` block, after `:614-620`, next to the audit at `:622-628`. Type `payout_failed`. Message includes `reason` but **not** raw Paystack internals beyond what's already user-safe.
6. **Paystack error at approval time** — `adminApproveWithdrawal` catch block, after the failed-mark at `:779-785`. Type `payout_failed`. Message: generic ("the transfer could not be initiated; the amount is back in your available balance. Support has been notified.") — do not leak raw provider error strings.

**Dedup behavior is correct by construction:** each type keys on `(businessId, type, 'settlement_payout', payout.id)`, so webhook replays (common for `transfer.success`) create zero duplicates. The `failed → completed` webhook self-heal (`noticepay1.md`) fires `payout_failed` then `payout_completed` — two distinct types, so both reminders appear, which is the desired history.

### 3.3 Frontend wiring (avoids the known drift pattern)

- `frontend/src/types/index.ts:400` — extend `ReminderType` union with the five new types.
- `frontend/src/components/layout/NotificationBell.tsx` — `ROUTE_FOR_REMINDER` (`:35`): all five → `'/account'` (the settlement/payout home). Extend the adjacent type-color map (amber for requested/approved-progress, green for completed, red for rejected/failed). The unknown-type fallback at `:153` already prevents crashes if backend/frontend drift — but don't rely on it; wire the types properly (the `payment_refunded` drift in `deductions/02-issues.md` is the cautionary tale).
- `frontend/src/pages/Reminders.tsx` — extend the type-badge map for the five new types.
- `frontend/src/stores/settlement.store.ts` — no change required (reminders arrive via the bell).

### 3.4 Tests

1. After `POST /settlement/withdraw` → `prisma.reminder.findFirst({ where: { reminderType: 'payout_requested', referenceId: payoutId } })` is non-null.
2. After admin reject → `payout_rejected` row exists, message contains the reason substring.
3. Replay the same webhook payload twice → still exactly one `payout_completed` row (dedup proof).
4. Non-payout reminder counts unchanged (no accidental duplicates from `createReminderOnce` without ref).

## §4 (Work item 3). NEW-2 completion + NEW-1 — PIN on auto-split; delete dead `stepUpToken`

**Problem (verified).** `toggleAutoSplit` (`settlement.service.ts:455-513`) requires only a bearer token. A stolen session can't withdraw a naira (withdraw is PIN-gated) but CAN re-point where all future inflows settle and change the split percentage. `PATCH /settlement/auto-split` (`settlement.routes.ts:14`) is the only unprotected money-flow mutation left.

### 4.1 Backend

`settlement.validator.ts` — `toggleAutoSplitSchema` (`:36-39`), add a **required** PIN:

```ts
pin: z.string().regex(/^\d{4}$/, 'Transaction PIN must be exactly 4 digits'),
```

`settlement.service.ts` `toggleAutoSplit` — verification order matters (cheap 400s must not consume PIN attempts):

1. `verifyBusinessOwnership` (`:460`) — unchanged
2. NEW-D settlement-account guard (`:465-471`) — unchanged
3. **NEW:** `await pinService.verifyPin(userId, params.pin)` — insert here (bcrypt + lockout happen outside any tx, matching `withdrawBalance:334`)
4. NEW-8 clamp (§5, lands in the same function — do both edits together)
5. Existing DB update + Paystack sync (`:473-495`) — unchanged

### 4.2 NEW-1 decision: **Option B — delete `stepUpToken` issuance**

Raw-PIN-in-HTTPS-body is the accepted pattern across `withdraw` and `connect` (validator `:19-22`, `:30-32`); `stepUpToken` has zero server-side consumers (verified by grep — only issued at `pin.service.ts:190-199`, returned at `pin.controller.ts:35`, and consumed by `PinModal.tsx:92` — which is itself the FOUND-1 bug). Building a `requireStepUp` middleware (Option A) is a bigger change with no incremental security here; defer to NEW-F if ever revisited.

Delete:
- `pin.service.ts:190-199` (JWT issuance) — change return type `:107` to `Promise<{ valid: boolean }>` and return `{ valid: true }`
- `pin.controller.ts:35` — drop `stepUpToken` from the response
- `frontend/src/stores/pin.store.ts` — drop `stepUpToken` from the `verifyPin` return type
- `PinModal.tsx:91-92` — condition becomes `if (res.valid)`; FOUND-1 fix (§1) already switched `onSuccess` to the raw pin
- e2e `api.e2e.test.ts:1550-1561` — drop the `stepUpToken` expectation, keep `valid: true`

### 4.3 Frontend (auto-split PIN)

- `Account.tsx` — the auto-split toggle currently calls the store directly (`:120-121`). Gate it: toggle click → open a `PinModal` instance (new local state `showAutoSplitPinModal` + `pendingAutoSplit: { enabled, taxSplitPercentage }`); `PinModal.onSuccess(pin)` → `toggleAutoSplit(biz.id, { ...pendingAutoSplit, pin })`.
- `settlement.store.ts:183-197` — `toggleAutoSplit(businessId, input)` already posts `input` verbatim; add error-code handling: `INVALID_PIN` → "Incorrect PIN, N attempts remaining" (actual code thrown by `pin.service.ts:176`); `PIN_LOCKED` → lockout message.
- `PinModal` title/subtitle props: `"Confirm Auto-Split Change"` / description of what the toggle will do.

### 4.4 Test updates (the in-band ordering makes this safe)

- `:1629` auto-split happy path — add valid `pin` to the body (the connect fixture at `:1602` created the business's PIN earlier in the describe block — reuse the same fixture PIN).
- `:1771` and `:1799` NEW-D tests — add `pin` anyway; the settlement guard fires before PIN verify, so expectations (400 `SETTLEMENT_ACCOUNT_REQUIRED`) are unchanged.
- New: `PATCH auto-split` without `pin` → 400 (Zod); wrong `pin` → PIN error + attempts incremented; correct `pin` → 200.

## §5 (Work item 4). NEW-8 + NEW-G — server-authoritative split and commission

**Problem (verified).** `taxSplitPercentage: z.number().min(0)` (`settlement.validator.ts:38`) lets a direct-API user set 0% and disable their own tax escrow — unacceptable for a tax platform. `commissionPct` is client-supplied (`settlement.validator.ts:18`, `dva.validator.ts:72`) and flows straight into Paystack `percentageCharge` (`settlement.service.ts:227, 239`) and `platformCommissionPct` (`:265`) — a user can erase platform commission at will.

### 5.1 Config — `backend/src/config/index.ts` + `.env.example`

```ts
settlement: {
  minTaxSplitPct:        Number(process.env.SETTLEMENT_MIN_TAX_SPLIT_PCT ?? 7.5),
  maxTaxSplitPct:        Number(process.env.SETTLEMENT_MAX_TAX_SPLIT_PCT ?? 50),
  platformCommissionPct: Number(process.env.PLATFORM_COMMISSION_PCT ?? 0),
},
```

### 5.2 NEW-8 — clamp in `toggleAutoSplit` (same edit block as §4.1 step 4)

- When `enabled === true`: reject `taxSplitPercentage < config.settlement.minTaxSplitPct` or `> config.settlement.maxTaxSplitPct` with 400 and a message naming the allowed range. Keep the Zod schema loose (`0–100`); the **service** is the authority (single source in config, no per-env schema rebuild).
- When `enabled === false`: **ignore** a provided `taxSplitPercentage` and keep the existing value — changing the escrow share during a disable is meaningless and invites mistakes. (Currently `:477` writes `params.taxSplitPercentage ?? 7.5` even on disable — tighten that.)

### 5.3 NEW-G — strip client `commissionPct`

- Remove `commissionPct` from `connectSettlementSchema` (`settlement.validator.ts:18`) and `dva.validator.ts` `connectSettlementSchema` (`:72-75`). Plain Zod `.object()` strips unknown keys, so any frontend still sending it degrades gracefully — zero-downtime.
- `settlement.service.ts` `connectSettlementBank`: `percentageCharge: config.settlement.platformCommissionPct` at `:227` and `:239`; `platformCommissionPct: config.settlement.platformCommissionPct` at `:265`.
- `dva.controller.ts:101-110`: stop destructuring/forwarding `commissionPct` (the DVA connect delegates to the settlement service).
- Frontend cleanup (same PR, trivial): remove `commissionPct` from the connect payloads in `Account.tsx` / `PayoutWithdrawalModal.tsx` connect paths.
- ⚠️ Business decision tracked elsewhere: `platformCommissionPct` stays **0** until you decide otherwise (`paymentAction.md:1392`).

### 5.4 Tests

1. Connect with `commissionPct: 30` in the body (ignored) → DB `platformCommissionPct` equals config value (0).
2. `PATCH auto-split { enabled: true, taxSplitPercentage: 0, pin }` → 400 with range message.
3. `{ enabled: true, taxSplitPercentage: 7.5, pin }` → 200 (existing test `:1629` continues to pass).
4. `{ enabled: false, taxSplitPercentage: 0, pin }` → 200 and DB `taxSplitPercentage` **unchanged**.

## §6 (Work item 5). PIN-1 — 5 attempts with a rolling 24h reset window

**Problem (verified in code this session).** `pin.service.ts:10-11` hardcodes `MAX_PIN_ATTEMPTS = 3` / `PIN_LOCKOUT_MINUTES = 15`. The attempt counter is only cleared on success (`:182-187`), PIN setup (`:82-83`), or PIN change (`:279-280`). Consequences:
- A user who fails twice and leaves has `pinAttempts = 2` **forever** — one wrong PIN days later locks them out. (The exact complaint driving this item.)
- After a 15-min lock expires, attempts keep climbing (4, 5, …) and re-lock every 15 minutes — effectively 3 brute-force guesses per 15 minutes, indefinitely.
- **Drift bug:** `settlement.service.ts:158` hardcodes `Math.max(0, 3 - pinAttempts)` instead of the constant — the preview reports wrong remaining attempts the moment MAX changes.

**Design decision.** Five attempts per **rolling 24-hour window**; exhausting them locks the PIN **until the window resets** (i.e., `pinLockedUntil = pinAttemptsResetAt`, up to 24h). Rationale: one predictable rule instead of two interacting timers; a 4-digit PIN with 5 tries per 24h caps brute force at ~1825 guesses/year; and legitimate recovery exists without waiting — password-gated PIN change (`changePin`, `pin.service.ts:202+`, protected by account password) and the existing pin-reset token (`pinResetTokenHash`). The 15-minute lock constant is retired.

### 6.1 Config — `backend/src/config/index.ts` + `.env.example`

```ts
pin: {
  maxAttempts:       Number(process.env.PIN_MAX_ATTEMPTS ?? 5),
  attemptWindowHours: Number(process.env.PIN_ATTEMPT_WINDOW_HOURS ?? 24),
},
```

Delete `MAX_PIN_ATTEMPTS` / `PIN_LOCKOUT_MINUTES` from `pin.service.ts:10-11`; import from config (single source of truth — this is what fixes the `settlement.service.ts:158` drift class).

### 6.2 Migration `20260830130000_add_pin_attempt_window`

```sql
ALTER TABLE "users" ADD COLUMN "pin_attempts_reset_at" TIMESTAMP(3);
```

`schema.prisma` `model User`: `pinAttemptsResetAt DateTime? @map("pin_attempts_reset_at")` (alongside `pinAttempts`/`pinLockedUntil`, added in migration `20260827180000`). No backfill — null means "no open window", handled lazily at verify time (no cron needed).

### 6.3 `verifyPin` (`pin.service.ts:102-200`) — the core change

Failure branch (`:140-151`), replace the plain increment:

```ts
const windowExpired = !user.pinAttemptsResetAt || user.pinAttemptsResetAt <= now;
const newAttempts  = windowExpired ? 1 : user.pinAttempts + 1;
const resetAt      = windowExpired
  ? new Date(now.getTime() + config.pin.attemptWindowHours * 60 * 60 * 1000)
  : user.pinAttemptsResetAt;
const isNowLocked  = newAttempts >= config.pin.maxAttempts;
const lockedUntil  = isNowLocked ? resetAt : null;   // locked until the window itself resets
```

- Persist `{ pinAttempts: newAttempts, pinLockedUntil: lockedUntil, pinAttemptsResetAt: resetAt }` (`:145-151`).
- The locked message (`:163-170`) becomes: *"Too many incorrect PIN attempts. Your PIN is locked until {resetAt, en-NG long format}. You can reset it now from Settings → Security using your password."*
- Lock pre-check (`:127-135`) and audit actions (`user.pin_failed` / `user.pin_locked`, `:153-161`) are unchanged in shape.
- Success branch (`:182-187`) resets **all three**: `pinAttempts: 0, pinLockedUntil: null, pinAttemptsResetAt: null`.
- Add `pinAttemptsResetAt: true` to the `select` at `:113-115`.

### 6.4 Apply the same logic to the OTHER failure paths (easy to miss)

- **`changePin`** (`pin.service.ts:202+`) has its own duplicate increment/lock block at `:241-254` (wrong `currentPin`) — apply the identical window logic. Its success/reset at `:277-281` also clears `pinAttemptsResetAt`.
- **`setupPin`** (`:75-85`) — reset `pinAttemptsResetAt: null` alongside `pinAttempts: 0` (`:82-84`).
- **`getStatus`** (`:25-46`) — `remainingAttempts` at `:44` now uses `config.pin.maxAttempts`; add `attemptsResetAt` to the payload (optional, for UI countdown).
- **`settlement.service.ts:158`** — replace the hardcoded `3` with the exported config value (or an exported constant from `pin.service`). `verifyBusinessOwnership` already selects `pinAttempts`/`pinLockedUntil` (`:34-35`).

### 6.5 Frontend

- `pin.store.ts` — replace the hardcoded `3`s: initial state `:48`, setup success `:80`, verify success `:99`, change success `:127` → derive from `res.data.data.remainingAttempts` where available, else literal `5` with a `// keep in sync with PIN_MAX_ATTEMPTS` comment.
- `PinModal.tsx:185` — display condition `remainingAttempts < 3` → `remainingAttempts < 5` (same sync comment). The badge text (`:187`) needs no change.
- Optional polish: when `PIN_LOCKED` returns `lockedUntil`, show the countdown instead of a static message (the 423 payload already carries it, `:133`).

### 6.6 Tests

1. Wrong PIN ×4 → 401 `INVALID_PIN` with `remainingAttempts: 1`; 5th → 423 `PIN_LOCKED` with `lockedUntil ≈ resetAt`.
2. **Window reset:** backdate `pinAttemptsResetAt` via `prisma.user.update` in the test → next wrong PIN starts a fresh window (`pinAttempts: 1`, unlocked). This is the regression test for the "stuck at 2 forever" bug.
3. Success after 2 failures → all three fields cleared.
4. `changePin` with wrong current PIN participates in the same window (4 wrong verify + 1 wrong change-PIN → locked).
5. `GET /settlement/preview` → `security.remainingAttempts` consistent with the new maximum (drift guard).
6. Update any existing lockout e2e tests in the auth/PIN describe block (`api.e2e.test.ts:1500-1561` region) that assume 3 attempts / 15-minute semantics.

## §7. Execution order, risk, and verification

**Order (dependency-driven, one commit per item):**

```
0. Commit current P0 work + green e2e baseline
1. §1 FOUND-1  (PinModal raw-pin)  — tiny, standalone, fixes the live UI path
2. §2 NEW-K    (migration #1!)     — schema → webhook flag → preview math → tests
3. §3 NEW-I    (no migration)      — reminder types → hook points → frontend bell
4. §6 PIN-1    (migration #2!)     — 5 attempts + 24h window (do BEFORE §4/§5 — §4 wires
                                     PIN into auto-split, so land the new PIN semantics first)
5. §4 NEW-2/1  (no migration)      — PIN on auto-split + delete stepUpToken
6. §5 NEW-8/G  (no migration)      — clamps (same function as §4 step 4 — can share the commit)
```

RATIONALE for the order: NEW-K first — only remaining *money-correctness* bug, needs a migration. NEW-I second — zero-migration and daily support-load relief. **PIN-1 before NEW-2/1**: §4 adds a PIN gate to auto-split, so the new 5-attempt/24h semantics should already be in force — otherwise you ship a gate on the old broken lockout behavior and re-test it a day later. NEW-2/1 and NEW-8/G land back-to-back (same function).

**Risk matrix:**

| Change | Risk | Mitigation |
|---|---|---|
| NEW-K migration | Low (additive columns, defaults safe) | Rollback = drop columns; no backfill needed (§2.2) |
| NEW-K preview math | **Medium — touches withdrawable balance** | Three dedicated e2e tests (§2.4); invariant `available ≤ platform-held` |
| NEW-I hooks | Very low (fire-and-forget, post-tx) | `.catch(logger.warn)` — a reminder failure can never fail a payout |
| PIN-1 window logic | **Medium — auth path, two duplicated code sites** | Window regression test (§6.6.2); both `verifyPin` AND `changePin` covered; config-driven max kills the `3`-drift class |
| NEW-2 PIN gate | Low | Breaking for API callers only; frontend updated same PR; e2e updated |
| NEW-1 delete stepUpToken | Low — zero server consumers (verified) | FOUND-1 fix makes PinModal self-consistent first |
| NEW-G strip commissionPct | Low | Zod strips unknown keys → old clients degrade gracefully |

**Verification checklist (run after EVERY item):**

```bash
cd backend
npx tsc --noEmit          # 0 errors
npm run lint
npm run test:e2e          # full suite, in-band — must stay green
```

Manual smoke (after all items):
1. UI: request withdrawal with correct PIN → succeeds (validates FOUND-1).
2. UI: wrong PIN ×2 → "3 attempts remaining" style badge shows 5-based count; log in tomorrow (or backdate) → counter reset (validates PIN-1).
3. UI: toggle auto-split → PIN prompt → succeeds → bell shows `payout_*` reminders through the lifecycle (request → approve/reject in admin panel → bell updates).
4. Admin panel: approve → payout `processing`/`completed`; reject with reason → SME bell shows reason.
5. Direct API: `taxSplitPercentage: 0` → 400; `commissionPct: 30` → ignored.

**Explicitly out of scope for this pass (already triaged in noticepay1.md §9):**
NEW-C (`paystackRecipientCode` reuse), NEW-H (staleness sweep — only `processing` >24h, never `pending`), approval-SLA admin nudge, NEW-F (step-up middleware, moot after NEW-1 Option B), Carried C (BVN encryption), Carried A/B (KYC state machine, `dvaFailureReason` surfacing), NEW-3 consolidation leftovers, progressive onboarding stepper.

---

*noticepay2.md — v2, Aug 30, 2026. Re-checked against the working tree in this session: corrected `INVALID_PIN` error-code reference (§4.3), added PIN-1 after verifying the full lockout mechanics (`pin.service.ts:10-11, 102-200, 241-254`, drift bug at `settlement.service.ts:158`). Every file:line reference verified directly. Migration count: exactly two (NEW-K §2.1, PIN-1 §6.2). No new dependencies.*






