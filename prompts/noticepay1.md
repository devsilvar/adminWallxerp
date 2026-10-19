# noticepay1.md — P0 Implementation Plan v2 (NEW-B, NEW-D, NEW-7 + Admin-Approved Withdrawals)

**Created:** 2026-08-29 · **Revised:** 2026-08-29 (v2 — adds boss-approved admin settlement control + duplicate-withdrawal guard)
**Author:** Senior Software Engineer
**Status:** 📋 PLAN COMPLETE — code NOT touched yet. Awaiting approval to execute.
**Method:** Systematic code reasoning — every claim verified against direct line-by-line file reads. Nothing assumed.

> **What changed in v2:** Per the product decision, withdrawals are no longer instant. The SME **requests** a withdrawal; an **admin approves or rejects it** in the admin panel; only an approved request triggers the Paystack transfer. A duplicate-request guard prevents withdrawing the same amount twice by mistake. The v1 ledger-first advisory-lock design is *kept* — it becomes the foundation: the request inserts a reserved ledger row, and the Paystack call simply moves from the user path to the admin-approval path.

---

## 0. Scope

| # | Item | One-liner | Est. | Schema change? |
|---|------|-----------|------|----------------|
| 1 | **NEW-B** | `getPayoutPreview` counts manually-entered bank transfers as withdrawable platform funds | 5 min | No |
| 2 | **NEW-D** | `toggleAutoSplit` writes `autoSplitEnabled: true` with no subaccount attached | 10 min | No |
| 3 | **NEW-7 v2** | Withdrawal → **admin approval workflow** + race-safe ledger reservation (supersedes v1 instant-withdraw design) | 3–4 h | **No** |
| 4 | **DUP-GUARD** | Reject a second withdrawal request for the same amount while one is still pending (mistake protection) | 20 min | No |
| 5 | **ADMIN-UI** | Admin panel page: withdrawal request queue with Approve / Reject(reason) | 2–3 h | No |

**Key property of this plan: zero Prisma schema changes, zero migrations.** Status semantics reuse the existing `PaymentStatus` enum (`pending` = awaiting admin approval, `processing` = approved & transfer initiated, `completed`, `failed` + `failureReason`).

**Files to be modified:**
- `backend/src/services/settlement.service.ts` — NEW-B, NEW-D, NEW-7 v2 (request path + approve/reject service fns)
- `backend/src/services/admin.service.ts` + `admin.controller.ts` + `admin.routes.ts` — withdrawal queue endpoints (`/api/v1/admin/*`, behind existing admin-role middleware)
- `backend/src/validators/settlement.validator.ts` — add `'processing'` to payout-history status filter; add reject-reason schema
- `frontend/src/components/.../PayoutWithdrawalModal.tsx` (or page owner of the modal) — confirmation step + "awaiting approval" state
- `frontend/src/pages/AdminWithdrawals.tsx` (new) + admin sidebar + admin API wiring
- `backend/tests/e2e/api.e2e.test.ts` — regression tests (§5)

**Files NOT touched:** `schema.prisma`, `paystack.provider.ts`, `payment.service.ts` (webhook handlers already status-agnostic — verified), tax engine.

---

## 1. Systematic Code Reasoning — how each piece manifests

### 1.1 NEW-B — phantom funds in the withdrawal ledger

**The money path (verified):**

```
DVA bank transfer arrives
  → Paystack webhook charge.success (channel=dedicated_nuban)
  → dva.service.ts:711 creates SalesTransaction with metadata { channel: 'dva', ... }
  → money REALITY: sits in the Paystack platform balance  ✅

SME manually logs a bank transfer (POST /sales, source=bank_transfer)
  → SalesTransaction created WITHOUT metadata.channel
  → money REALITY: in the SME's own bank, never touched Paystack  ❌

getPayoutPreview (settlement.service.ts:53-62):
  where: { businessId, source: 'bank_transfer', status: 'confirmed' }   ← matches BOTH
  → availableForWithdrawal inflated by phantom funds
  → withdrawBalance (line 310) checks against this inflated number
  → initiateTransfer pulls REAL money from the platform Paystack balance
```

**Blast radius if unfixed:** either the transfer fails at Paystack (harmless 400), or — if the platform balance holds money for *other* businesses' DVA inflows — the platform pays out funds it owes elsewhere. Catastrophic.

**The correct pattern already exists in the codebase** — `getDVABalance` at `dva.service.ts:363-367`:

```ts
metadata: { path: ['channel'], equals: 'dva' },
```

Proven Prisma JSON-path filter in this exact project/schema (`SalesTransaction.metadata` is `Json`). We copy it — no new query techniques.

**Ripple analysis (verified callers of `getPayoutPreview`):** (1) `GET /settlement/preview` controller — displays balance; frontend renders what it's given, no change. (2) `withdrawBalance` line 310 — the guard becomes honest.

**Intentional semantic consequence (documented, not a side effect):** `totalInflows` also feeds the fallback tax-escrow estimate (lines 91-100). After the fix, escrow is computed over DVA money only — *correct*, because withdrawals can only move platform money. Manually-logged sales still count toward monthly tax reports (the tax engine reads all sales); they just can't be withdrawn as platform funds.

**Historical data check:** every DVA auto-captured sale carries `metadata.channel: 'dva'` (written unconditionally at `dva.service.ts:711`). No backfill needed.

### 1.2 NEW-D — auto-split enabled with nothing attached

**The broken flow (verified, `settlement.service.ts:412-459`):**

```ts
const updatedBusiness = await prisma.business.update({
  data: { autoSplitEnabled: params.enabled, ... },   // ← line 419-425: writes true unconditionally
});
if (business.paystackSubaccountCode) {               // ← line 428: sync only IF subaccount exists
  await provider.updateSubaccount(...)               //    skipped silently when null
}
```

If the SME never connected a settlement bank (`paystackSubaccountCode` is null):
- DB says `autoSplitEnabled: true` → UI shows "on"
- Paystack has no subaccount → **no split exists** → inflows pool 100% on the platform
- The SME believes they're auto-settling. Silent money trap + support burden.

**Design choice — gate on `paystackSubaccountCode`, not `settlementAccountNumber`:** the split attaches to the *subaccount*, which is created in exactly one place — `connectSettlementBank` (line 214, first-connect branch). So the subaccount code is the precise precondition for the line-428 sync to be meaningful.

**Asymmetry (deliberate):** *enabling* requires the subaccount; *disabling* is always allowed even without one (harmless cleanup of a never-active flag).

**E2E impact (verified):** test at `api.e2e.test.ts:1629-1642` sends `enabled: true` and expects 200. The connect test at lines 1602-1615 runs first in the same `describe` block and provisions the subaccount → guard passes → 200 unchanged. ✅

**Frontend impact:** the toggle receives `400 { code: 'SETTLEMENT_ACCOUNT_REQUIRED' }`; the existing axios + toast pipeline shows the user-facing message.

### 1.3 NEW-7 v2 — admin-approved withdrawals on a race-safe ledger

**Current flow (verified, `settlement.service.ts:290-407`) — instant, unfenced:**

```
1. verifyBusinessOwnership            (line 295)
2. settlement account connected?      (line 298)
3. pinService.verifyPin               (line 307)   ← bcrypt + read, CPU work
4. getPayoutPreview balance check     (line 310)   ← READ, no fence
5. generate reference                 (lines 330-333)  Math.random 5 chars
6. createTransferRecipient            (line 338)   ← NETWORK
7. initiateTransfer                   (line 348)   ← NETWORK — real money leaves here
8. settlementPayout.create            (line 357)   ← row saved AFTER the transfer
```

**Races in the current design:** two taps both pass step 4 → two `initiateTransfer` calls → two real payouts. And per the boss's requirement, there is *no human control* before money leaves at all.

**v2 target architecture — "request → approve → transfer":**

```
SME (POST /settlement/withdraw)
  1. ownership + settlement-connected + PIN verify      (outside tx, unchanged)
  2. prisma.$transaction(async tx => {                  ← THE FENCE
       a. pg_try_advisory_xact_lock(businessId)         → 409 WITHDRAWAL_IN_PROGRESS if held
       b. tx-aware balance check                        → 400 INSUFFICIENT_FUNDS
       c. duplicate guard: same amount still pending/processing ≤30 min
                                        → 409 DUPLICATE_WITHDRAWAL_REQUEST
       d. INSERT SettlementPayout status='pending'      ← the reservation IS the fence
     })
  3. respond 200 { ...payout, status:'pending', message:'submitted for approval' }
     ← NO Paystack call on the user path. Zero money moves. Zero network risk.

ADMIN (POST /admin/settlement/withdrawals/:id/approve)
  4. prisma.$transaction(async tx => {                  ← THE APPROVAL FENCE
       a. pg_try_advisory_xact_lock(businessId)         → 409 if another approval in flight
       b. recompute balance EXCLUDING this row          → 409 INSUFFICIENT_FUNDS_AT_APPROVAL
          (a new unpaid tax report may have grown the reserve since request time)
       c. conditional claim: updateMany({ where: { id, status: 'pending' },
            data: { status: 'processing' } })           → count 0 ⇒ 409 ALREADY_PROCESSED
     })
  5. outside tx: createTransferRecipient + initiateTransfer(reference)
  6. success → store transferCode (+ completed if immediate); error → status='failed'
     + failureReason + audit 'settlement.payout_failed' + rethrow

ADMIN (POST /admin/settlement/withdrawals/:id/reject  { reason })
  7. conditional update: status 'pending' → 'failed',
     failureReason = 'Rejected by admin: <reason>'      → ledger releases the reserve
  8. audit 'settlement.payout_rejected' (+ optional reminder to the SME)
```

**Why this is now triple-fenced (each layer independently sufficient):**
- **Fence 1 — advisory xact lock** (request tx and approval tx): serializes money ops per business; `prisma.$transaction(async cb)` pins one pooled connection so the lock cannot leak across connections (the `reminders.cron.ts:57` session-scoped pattern is fine for a rare global sweep but must NOT be copied here).
- **Fence 2 — the ledger reservation:** pending/processing rows count as withdrawn in the preview aggregate (lines 66-75), so a second request — even serialized after the first commits — sees a reduced balance and fails `INSUFFICIENT_FUNDS` honestly.
- **Fence 3 — conditional claim on approve:** `updateMany({ where: { id, status: 'pending' } })` is atomic at the DB level. Admin double-click → second call claims 0 rows → 409 `ALREADY_PROCESSED`. One request can only ever be approved once.

**Boss requirement #2 — same-amount-twice protection (mistake double-taps):**
- **Server (authoritative):** inside the request fence, `findFirst({ businessId, amount: params.amount, status: { in: ['pending','processing'] }, createdAt: { gte: now − 30 min } })` → 409 `DUPLICATE_WITHDRAWAL_REQUEST`. Legit repeat withdrawals remain possible after the earlier request resolves or the 30-min window passes (documented constant in-code; no env knob in v1).
- **Ledger (automatic):** each request reserves its amount, so the balance visibly shrinks per request.
- **Frontend (defense-in-depth):** confirmation modal (amount + bank name + account last-4 + "funds are reserved until an admin approves"), submit button disabled while in flight, and a post-submit "awaiting approval" state.

**Status semantics (existing enum, no migration):**
`pending` = awaiting admin approval · `processing` = approved, transfer initiated · `completed` · `failed` (+ `failureReason`). Two existing code sites must learn `'processing'`: the withdrawn-aggregate in `getPayoutPreview` (line 69: `in: ['completed','pending']` → `['completed','pending','processing']`) and `payoutHistoryQuerySchema` (`settlement.validator.ts:44`).

**Self-heal edge case (verified safe):** if the transfer actually succeeded but the response was lost, the payout row is marked `failed` — but the `transfer.success` webhook (`payment.service.ts:565-595`) matches by reference with **no status filter** and flips it to `completed`. No money lost, no reconciliation job.

**Bonus side effect:** the SME path no longer calls Paystack at all — the test-suite live-key guardrail (`tests/helpers/loadEnv.ts`) matters on fewer paths, and a user request can never partially move money.

---

## 2. Exact edits — NEW-B (5 min)

**File:** `backend/src/services/settlement.service.ts` — `getPayoutPreview`, lines 53-62.

```diff
  const inflowsAggregate = await prisma.salesTransaction.aggregate({
    where: {
      businessId,
      source: 'bank_transfer',
      status: 'confirmed',
+     // DVA-originated inflows only — matches getDVABalance (dva.service.ts:363-367).
+     // Manually-entered bank transfers never touched the platform balance and
+     // MUST NOT be withdrawable. (noticepay.md NEW-B)
+     metadata: { path: ['channel'], equals: 'dva' },
    },
    _sum: { amount: true },
  });
```

Nothing else in the function changes. One line, one comment.

---

## 3. Exact edits — NEW-D (10 min) and NEW-7 v2 (3-4 h)

**File:** `backend/src/services/settlement.service.ts`

### 3.1 NEW-D — guard in `toggleAutoSplit` (insert after `verifyBusinessOwnership`, ~line 417)

```ts
// Enable requires a provisioned subaccount — otherwise no split exists on the
// DVA and inflows pool 100% on the platform while the UI says "on". (NEW-D)
// Disabling is always allowed (harmless cleanup of a never-active flag).
if (params.enabled && !business.paystackSubaccountCode) {
  throw new AppError(
    400,
    'Connect your settlement account first — auto-split needs a provisioned settlement account before it can be enabled.',
    'SETTLEMENT_ACCOUNT_REQUIRED'
  );
}
```

### 3.2 Make `getPayoutPreview` tx-aware + status-list update (repo convention: `const db = tx ?? prisma`)

```diff
- export async function getPayoutPreview(userId: string, businessId: string) {
+ export async function getPayoutPreview(
+   userId: string,
+   businessId: string,
+   tx?: Prisma.TransactionClient,   // optional — inside the withdraw/approve fence tx
+   opts?: { excludePayoutId?: string }  // used by approve-time recheck
+ ) {
    const business = await verifyBusinessOwnership(userId, businessId);
+   const db = tx ?? prisma;
    // every prisma.X in the body becomes db.X
    // payouts aggregate (line 69):
-   status: { in: ['completed', 'pending'] },
+   status: { in: ['completed', 'pending', 'processing'] },  // processing = transfer in flight
+   // when opts.excludePayoutId is set, add id: { not: opts.excludePayoutId }
```

(Existing controller call site unchanged — the new params are optional.)

### 3.3 NEW-7 v2 — `withdrawBalance` becomes a request (no Paystack)

```ts
export async function withdrawBalance(userId, businessId, params) {
  const business = await verifyBusinessOwnership(userId, businessId);

  // unchanged: settlement-account check (298-304)
  // unchanged: pinService.verifyPin (307) — bcrypt CPU stays OUTSIDE any tx

  // Reference BEFORE the tx: crypto-grade, Paystack-safe charset, ≤50 chars.
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const transferReference = `PO-${dateStr}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

  const payout = await prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${businessId}::text, 0)) AS locked
    `;
    if (!locked) {
      throw new AppError(409,
        'A withdrawal request is already being processed. Please wait a few seconds and try again.',
        'WITHDRAWAL_IN_PROGRESS');
    }

    const preview = await getPayoutPreview(userId, businessId, tx);
    if (params.amount > preview.availableForWithdrawal) {
      throw new AppError(400, /* existing INSUFFICIENT_FUNDS message + details, verbatim */);
    }

    // DUP-GUARD: same amount already awaiting approval/transfer within 30 min
    // → almost certainly a double-tap. (boss requirement: no accidental double withdrawal)
    const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
    const dup = await tx.settlementPayout.findFirst({
      where: {
        businessId,
        amount: params.amount,
        status: { in: ['pending', 'processing'] },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true, transferReference: true },
    });
    if (dup) {
      throw new AppError(409,
        'You already have a withdrawal request for this exact amount that is awaiting approval. Check its status or wait for it to be processed before requesting again.',
        'DUPLICATE_WITHDRAWAL_REQUEST',
        { existingRequestId: dup.id });
    }

    // Ledger-first: the pending row IS the reservation (awaiting admin approval).
    return tx.settlementPayout.create({
      data: {
        businessId,
        amount: params.amount,
        fee: 0,
        netAmount: params.amount,
        destinationBankCode: business.settlementBankCode,
        destinationBankName: business.settlementBankName || 'Commercial Bank',
        destinationAccountNum: business.settlementAccountNumber,
        destinationAccountName: business.settlementAccountName || business.businessName,
        transferReference,
        status: 'pending',          // = awaiting admin approval
        narration: params.narration,
      },
    });
  });

  // NO Paystack call here — transfer happens on admin approval (§3.4).
  // unchanged: logAudit('settlement.payout_requested', ...) + logger.info
  return { /* existing return shape + */ status: 'pending',
           message: 'Withdrawal request submitted. It will be processed once approved.' };
}
```

### 3.4 NEW-7 v2 — new admin service functions in `settlement.service.ts`

```ts
/** ADMIN: list withdrawal requests (queue) — paginated, optional status filter */
export async function adminListWithdrawalRequests(query: { status?, page, limit }) {
  // prisma.settlementPayout.findMany + count, orderBy createdAt desc,
  // include business { businessName, merchantId, user: { email } }
  // map account number to last-4 in the response (do NOT expose full NUBAN in lists)
}

/** ADMIN: approve a pending request → claim → initiate the real transfer */
export async function adminApproveWithdrawal(adminUserId: string, payoutId: string) {
  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId }, include: { business: true },
  });
  if (!payout) throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');

  const provider = getPaymentProvider();
  const businessId = payout.businessId;

  // Approval fence: lock + affordability recheck + atomic claim, all in ONE tx
  await prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${businessId}::text, 0)) AS locked`;
    if (!locked) throw new AppError(409,
      'Another approval for this business is in progress', 'WITHDRAWAL_IN_PROGRESS');

    // affordability may have changed since request time (new unpaid report ⇒ bigger reserve)
    const preview = await getPayoutPreview(payout.business.userId, businessId, tx,
                                           { excludePayoutId: payout.id });
    if (toNumber(payout.amount) > preview.availableForWithdrawal) {
      throw new AppError(409,
        'Balance no longer covers this request (tax reserve may have increased). Reject it and ask the SME to re-request.',
        'INSUFFICIENT_FUNDS_AT_APPROVAL');
    }

    // atomic claim — the double-approve killer: second admin click claims 0 rows
    const res = await tx.settlementPayout.updateMany({
      where: { id: payout.id, status: 'pending' },
      data: { status: 'processing' },
    });
    if (res.count === 0) {
      throw new AppError(409, 'This request was already approved or rejected', 'ALREADY_PROCESSED');
    }
  });

  // Network — outside any tx (house rule: no DB locks during IO)
  try {
    const recipient = await provider.createTransferRecipient({
      type: 'nuban',
      name: payout.destinationAccountName,
      accountNumber: payout.destinationAccountNum,
      bankCode: payout.destinationBankCode,
      currency: 'NGN',
      description: `Payout for ${payout.business.businessName}`,
    });
    const transferResult = await provider.initiateTransfer({
      source: 'balance',
      amount: toNumber(payout.amount),
      recipient: recipient.recipientCode,
      reason: payout.narration || `Balance withdrawal for ${payout.business.businessName}`,
      reference: payout.transferReference,        // pre-generated at request time
    });
    const isComplete = transferResult.status === 'success' || transferResult.status === 'completed';
    const updated = await prisma.settlementPayout.update({
      where: { id: payout.id },
      data: {
        paystackTransferCode: transferResult.transferCode,
        ...(isComplete ? { status: 'completed', completedAt: new Date() } : {}),
      },
    });
    logAudit({ userId: adminUserId, businessId, action: 'settlement.payout_approved',
      resourceType: 'settlement_payout', resourceId: payout.id,
      newData: { amount: toNumber(payout.amount), transferReference: payout.transferReference } });
    return updated;
  } catch (err) {
    // release the reservation; late transfer.success webhook self-heals failed→completed
    try {
      await prisma.settlementPayout.update({ where: { id: payout.id },
        data: { status: 'failed', failureReason: err instanceof Error ? err.message : String(err) } });
      logAudit({ userId: adminUserId, businessId, action: 'settlement.payout_failed',
        resourceType: 'settlement_payout', resourceId: payout.id,
        newData: { transferReference: payout.transferReference,
                   reason: err instanceof Error ? err.message : String(err) } });
    } catch (markErr) {
      logger.error('Failed to mark payout failed after approval transfer error',
        { payoutId: payout.id, error: markErr instanceof Error ? markErr.message : String(markErr) });
    }
    throw err;
  }
}
```

### 3.5 NEW-7 v2 — admin reject (releases the reserved funds)

```ts
/** ADMIN: reject a pending request → releases the reserved funds */
export async function adminRejectWithdrawal(adminUserId: string, payoutId: string, reason: string) {
  const payout = await prisma.settlementPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');

  // conditional update = atomic claim; reject only works from 'pending'
  const res = await prisma.settlementPayout.updateMany({
    where: { id: payout.id, status: 'pending' },
    data: { status: 'failed', failureReason: `Rejected by admin: ${reason}` },
  });
  if (res.count === 0) {
    throw new AppError(409, 'This request was already approved or rejected', 'ALREADY_PROCESSED');
  }
  logAudit({ userId: adminUserId, businessId: payout.businessId,
    action: 'settlement.payout_rejected', resourceType: 'settlement_payout', resourceId: payout.id,
    newData: { amount: toNumber(payout.amount), reason } });
  // optional (recommended, NEW-I-adjacent): createReminderOnce → notify the SME with the reason
  return { id: payout.id, status: 'failed' };
}
```

**Wiring (backend):** add to the admin domain (routes under `/api/v1/admin/*`, behind the existing admin-role middleware, following the existing admin routes/controllers/services layered pattern):
- `GET  /admin/settlement/withdrawals?status=&page=&limit=` → `adminListWithdrawalRequests`
- `POST /admin/settlement/withdrawals/:id/approve` → `adminApproveWithdrawal`
- `POST /admin/settlement/withdrawals/:id/reject` (body `{ reason: string min 3 max 500 }`) → `adminRejectWithdrawal`

**Validator changes (`settlement.validator.ts`):** `payoutHistoryQuerySchema` status enum gains `'processing'` (line 44); new `rejectWithdrawalSchema = z.object({ reason: z.string().trim().min(3).max(500) })`.

### 3.6 Frontend (defense-in-depth + admin UI)

**SME side — `PayoutWithdrawalModal`:**
1. Add a **confirmation step** before submit: amount, bank name, account last-4, and the copy "Funds will be reserved immediately and released to your bank once an admin approves your request."
2. Disable the submit button while the request is in flight (prevents double-tap client-side).
3. On success, replace the old "money sent" framing with an **"Awaiting approval"** state (amber pill, matching the design-system status colors); show the request reference so support can find it.
4. Handle the new 409s gracefully: `DUPLICATE_WITHDRAWAL_REQUEST` → "You already have a request for this amount awaiting approval" (toast + keep modal open); `WITHDRAWAL_IN_PROGRESS` → "please wait a few seconds and retry".
5. `GET /settlement/preview` response already exposes `totalWithdrawn` — pending/processing reservations are automatically reflected in `availableForWithdrawal`, so the modal's balance readout stays honest without any extra endpoint.

**Admin side — new `AdminWithdrawals.tsx` (follows existing admin page patterns):**
- Route `/admin/withdrawals` + sidebar item ("Withdrawals" under the money/admin group), `AdminRoute`-guarded.
- Status filter pills: Pending (default) / Processing / Completed / Failed; paginated table: date, business name, merchant ID, amount (₦), destination (bank + last-4), narration, status pill.
- Row actions for `pending` rows: **Approve** (confirm dialog: "This will initiate a real ₦X transfer to ••••1234. Continue?") and **Reject** (modal requiring a reason ≥3 chars).
- Optimistic UI not recommended here — money actions should wait for the server response and re-fetch the list; show toast on 409 `ALREADY_PROCESSED` and refresh.
- New admin API functions go in the existing admin API layer (axios, same interceptors).

### 3.7 What deliberately does NOT change
- Response contract of the user withdraw endpoint (same fields; adds `message`; `status` is now `'pending'`).
- The webhook handlers (already correct and status-agnostic — verified `payment.service.ts:565-635`).
- `connectSettlementBank`, `listPayoutHistory` internals, `resolveSettlementAccount`, `toggleAutoSplit` beyond the NEW-D guard.
- Prisma schema — untouched. No migrations.
- Paystack provider — untouched.

---

## 4. Why this won't break anything — checklist

| Concern | Verdict | Evidence |
|---|---|---|
| NEW-B breaks legit historical inflows? | No | Every DVA capture writes `channel:'dva'` (`dva.service.ts:711`) since the feature shipped |
| NEW-B breaks the tax escrow? | No — improves it | Escrow re-scoped to platform money; tax *reports* still read all sales via the tax engine (separate path) |
| NEW-D breaks the auto-split e2e test? | No | Connect test (e2e:1602) runs first in the same describe block and provisions the subaccount |
| Withdraw e2e tests break? | No | Wrong-PIN test (e2e:1644) unchanged; valid-PIN test (e2e:1656) accepts `[200, 400]` — post-fix returns 400 `INSUFFICIENT_FUNDS` (phantom manual sale) or 200-with-pending-row |
| Webhook e2e test (e2e:1744) breaks? | No | Creates its own payout row directly; webhook handler is status-agnostic (verified) |
| Old rows with `status='pending'` misinterpreted? | Managed | `pending` semantics shift from "transfer initiated" to "awaiting approval" — same ledger treatment (reserved). Pre-existing stuck-pending rows are NEW-H territory (P1 staleness sweep) and are absorbed, not harmed |
| Lock leaks across pooled connections? | No | `pg_try_advisory_xact_lock` inside interactive `$transaction` — xact-scoped + connection-pinned |
| Lock held across Paystack network call? | No | Claim tx commits first; network runs outside tx (user AND admin paths) |
| Admin double-clicks Approve → two transfers? | No | Atomic conditional claim `updateMany WHERE status='pending'` → second call gets 409 `ALREADY_PROCESSED` |
| SME double-taps request → two requests? | No | Triple layer: 30-min duplicate guard + ledger reservation + advisory lock |
| Balance changes between request and approval? | Covered | Approve re-checks affordability inside the fence (`excludePayoutId`) → 409 with clear guidance (reject + re-request) |
| Failed Paystack call strands funds? | No | Row marked `failed` + `failureReason` immediately; late `transfer.success` webhook flips it back (verified status-agnostic handler) |
| Reference collision after transfer? | No | Insert (with `@unique`) happens **before** any transfer; P2002 → 409 before money moves |
| Migration risk? | None | Zero schema changes — `pending`/`processing` already valid `PaymentStatus` values |
| Frontend breakage? | Managed | User modal needs confirmation/awaiting-approval update; admin page is additive. **Deploy backend + frontend together** (or admin operates interim via Swagger at `/api-docs`) |
| PII in admin list? | Safe | Account numbers masked to last-4 in the queue response (aligns with NEW-J direction) |

## 5. Test hardening (same session, after the fixes)

Add to `api.e2e.test.ts` settlement describe:

1. **Phantom-funds regression:** manual `bank_transfer` sale → `GET /settlement/preview` excludes it; prisma-seeded sale with `metadata: { channel: 'dva' }` → included.
2. **Auto-split guard:** business with no settlement → `PATCH /auto-split { enabled: true }` → 400 `SETTLEMENT_ACCOUNT_REQUIRED`.
3. **Request path:** valid withdraw → 200 with `status:'pending'`, exactly one payout row, no Paystack call; preview's `availableForWithdrawal` drops by the amount.
4. **Duplicate guard:** second identical-amount request within 30 min → 409 `DUPLICATE_WITHDRAWAL_REQUEST`; different amount → passes.
5. **Admin approve:** seed a DVA-channel sale for balance → admin approve → row `processing`/`completed` (mock transfer); double-approve → 409 `ALREADY_PROCESSED`; payout count unchanged.
6. **Admin reject:** reject with reason → row `failed` + `failureReason` prefixed "Rejected by admin:"; preview balance released.
7. **Approve affordability recheck:** force the reserve to grow (finalize a new report) after request → approve → 409 `INSUFFICIENT_FUNDS_AT_APPROVAL`, row still `pending`.

## 6. Verification runbook (execution day)

```
cd backend
npm run build          # tsc — must be clean
npm run lint           # must be clean
npm run test:e2e       # full in-band suite — all green (new tests included)
```

Manual smoke (test-mode Paystack, `PAYSTACK_MOCK_BANK_RESOLUTION=true` if needed):
- Manual sale → preview excludes it → withdraw → 400 INSUFFICIENT_FUNDS
- DVA-channel sale → withdraw → 200 pending → balance drops → admin queue shows it
- Same-amount request again → 409 DUPLICATE; different amount → OK
- Admin approve → transfer initiated (test key) → row processing/completed; webhook `transfer.success` flips it; double-approve → 409
- Admin reject with reason → row failed, reason stored, balance released
- No settlement connected → enable auto-split → 400 → disable → allowed

## 7. Explicit non-goals (kept out to stay shippable)

- **No amount editing at approval** — admin either approves as-submitted or rejects with a reason; the SME re-requests the correct amount. Keeps the audit trail clean.
- **No SME self-cancel** of a pending request (nice-to-have, P1 follow-up).
- **No per-business auto-approval threshold** (e.g., auto-approve ≤ ₦10k) — v1 is manual for everything; trivially addable later via a Business column.
- **No approval-SLA reminders** ("request pending > 24h → nudge admin") — P1, pairs naturally with the existing reminder cron.
- **No SME push notification** on approve/reject — optional `createReminderOnce` hook is sketched in §3.5; full NEW-I (email/SMS) remains P1.
- All other noticepay.md P1/P2 items (NEW-C, NEW-K, NEW-F/G/H/8, carried A–E) remain out of scope.

## 8. Where I stopped / status

- ✅ v1 plan written and fully verified; v2 re-written for the admin-approval model + duplicate guard.
- ✅ Verified during v2 design: webhook handlers are status-agnostic (self-heal intact); `updateMany` conditional-claim pattern available for double-approve protection; `PaymentStatus` already has `pending`/`processing` (no migration); existing e2e settlement tests survive both designs.
- ⏳ **Code not yet changed.** Execution order on approval: §2 (NEW-B) → §3.1 (NEW-D) → §3.2–3.5 (backend request/approve/reject) → §3.6 (frontend) → §5 (tests) → §6 (runbook) → flip status docs to ✅ with results.

## 9. Post-P0 roadmap (priority order, updated for the v2 admin-approval flow)

| Order | Item | Why now | Effort | Migration? |
|---|---|---|---|---|
| 1 | **NEW-K** — `settledViaSplit` on SalesTransaction; exclude split-settled inflows from `getPayoutPreview` | Biggest remaining money-correctness bug. With auto-split ON, DVA inflows settle straight to the SME's bank but the ledger still counts them withdrawable → admin approves a payout of money already gone. NEW-D guard will *grow* auto-split adoption, raising exposure | 4 h | Yes (Boolean column) |
| 2 | **NEW-I** — notify SME on request received / approved / rejected(with reason) / transfer.failed via `createReminderOnce` + existing email abstraction | Promoted to near-essential by the v2 flow: the SME now waits on an admin. Silence = support tickets + duplicate re-requests. Hook already sketched in §3.5 | 1–2 h | No |
| 3 | **NEW-2 completion + NEW-1** — require PIN on `PATCH /settlement/auto-split`; enforce or delete the dead `stepUpToken` | Stolen session can't withdraw but CAN re-point where future inflows settle / change split %. Do it while we're already inside `toggleAutoSplit` for NEW-D | 30–60 min | No |
| 4 | **NEW-8 + NEW-G** — server-side clamp `taxSplitPercentage` (min = platform reserve rate, no client 0%); strip/ignore client `commissionPct` | Cheap client-trust fixes: user can currently disable their own tax escrow (bad for a tax platform) and erase platform commission | 90 min | No |
| 5 | **NEW-C** — store `paystackRecipientCode` on Business, reuse, invalidate on bank change | Unbounded phantom recipients in Paystack + API cost. Lower urgency under admin-queue volume; 2 h when convenient | 2 h | No |
| 6 | **NEW-H** — staleness sweep — ⚠️ semantics changed by v2 | `pending` (awaiting approval) is now LEGITIMATE — must NOT be auto-failed. Only `processing` stuck >24 h gets re-queried against Paystack. Pairs with existing reminders cron | 3 h | No |
| 7 | **Approval-SLA nudge** (new, from v2) — pending request >24 h → remind admins | Direct completion of the boss's workflow; trivial atop the reminders cron | 1 h | No |
| 8 | **Carried C** — encrypt BVN/NIN at rest | NDPR violation, not a money bug. Before public launch | Medium | Yes |

**Recommended split:** Week 1 = items 1–4 (clears all remaining money-correctness + money-security findings). Week 2 = items 5–7. Item 8 before public launch.

---
*All file/line references verified by direct reads on 2026-08-29. No assumptions, no hallucinations.*










