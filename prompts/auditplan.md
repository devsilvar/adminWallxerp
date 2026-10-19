# Targeted Security & Efficiency Audit Plan (`auditplan.md`)
**PayMyTax by WallX — Backend Architectural Audit**
*Audit Date: September 2026 | Environment: Production (Railway / PostgreSQL / Node.js 22)*

---

## 1. Executive Summary & Audit Scorecard

Following a deep forensic scan across all 24 route modules, 25 controller files, and domain services in `backend/src/`, this report evaluates the codebase against the two non-negotiable fintech principles:

1. **BOLA / IDOR (Cross-Tenant Data Isolation & Ownership)**
2. **Webhook Idempotency & Money Movement (Double-Crediting / Fund Leakage)**
3. **External Network Calls Inside Database Transactions (Lock Starvation)**

### Overall Audit Scorecard

| Domain / Principle | Status | Severity | Summary |
| :--- | :---: | :---: | :--- |
| **1. BOLA / IDOR Protection** | 🟢 **PASS** (Exceptional) | Low Risk | Centralized `verifyBusinessOwnership` with multi-tenant compound queries (`resource.businessId === businessId`) on all routes. |
| **2. DVA Webhook Concurrency** | 🟢 **PASS** | Low Risk | Protected by DB unique constraints `unique_sales_reference` and `P2002` deduplication catch blocks. |
| **3. Tax Payment Webhook** | 🟢 **PASS** | Low Risk | Replay-protected with 5-minute signature window and `paymentStatus === 'completed'` early exits. |
| **4. Payout Webhook Atomicity** | 🔴 **ACTION REQUIRED** | **CRITICAL** | In `payment-webhook.service.ts` (`transfer.failed` & `transfer.success`), status checks are in-memory rather than atomic DB transitions. Double webhook delivery can trigger double funds release. |
| **5. Database Lock Isolation** | 🟢 **PASS** | Low Risk | PDF generation, email dispatches, and Paystack HTTP calls are consistently isolated outside `prisma.$transaction`. |

---

## 2. Detailed Findings: BOLA / IDOR Verification

### Why BOLA / IDOR is Fully Secured in PayMyTax:
Every single domain service was inspected for authorization enforcement. The codebase enforces a uniform, two-tier authorization model:

1. **Tier 1 (Business Ownership Fence)**:
   All domain services call `verifyBusinessOwnership(userId, businessId)` from `backend/src/lib/ownership.ts`:
   - Verifies `business.userId === userId` (rejects with `403 FORBIDDEN` if another user attempts access).
   - Uses a 60-second in-memory cache for high-throughput read operations.
   - Bypasses cache automatically inside transactional contexts to ensure fresh database reads.
2. **Tier 2 (Resource-Level Scoping)**:
   Every single entity query by primary key `:id` checks that the entity's `businessId` matches the authenticated `businessId`:
   - **Sales** (`sales-crud.service.ts:216`): `if (!sale || sale.businessId !== businessId) throw new AppError(404, ...)`
   - **Expenses** (`expense.service.ts:124`): `if (!expense || expense.businessId !== businessId) throw new AppError(404, ...)`
   - **Invoices** (`invoice-crud.service.ts:288`): `if (!invoice || invoice.businessId !== businessId) throw new AppError(404, ...)`
   - **Credits / Debtors** (`credit.service.ts:344`): `if (!credit || credit.businessId !== businessId) throw new AppError(404, ...)`
   - **Tax Reports** (`tax-report.service.ts:229`): `if (!report || report.businessId !== businessId) throw new AppError(404, ...)`
   - **Receipts & Statements** (`receipt.service.ts:44`): `if (!payment || payment.businessId !== businessId) throw new AppError(404, ...)`
   - **Settlement Accounts & Payouts** (`merchant-payout.service.ts:100`): Enforces uncached `getWithdrawalActor(userId, businessId)` checking live PIN lockout and settlement bank linkage.
   - **Public Shared Links** (`public.routes.ts` & `invoice-delivery.service.ts:109`): Only invoice PDFs can be viewed publicly, strictly gated by a 32-character cryptographically random `shareToken`.

**Verdict**: The codebase has zero open BOLA/IDOR vulnerabilities in resource access.

---

## 3. Detailed Findings: Webhook Idempotency & Money Movement

### Area A: DVA Inflow Transfers (`dva-webhook.service.ts`) — 🟢 PASS
- **Concurrency Fence**: Wrapped in `prisma.$transaction`.
- **Database Unique Constraints**:
  - `@@unique([businessId, source, referenceId], name: "unique_sales_reference")` on `SalesTransaction`
  - `@unique` on `WalletTransaction.reference`
- **Graceful Conflict Handling**: Lines 512–515 catch PostgreSQL error `P2002` (unique constraint violation) and return `true` (200 OK), ensuring concurrent Paystack retries do not fail or duplicate entries.

---

### Area B: Payout Transfer Webhooks (`payment-webhook.service.ts`) — 🔴 VULNERABILITY FOUND

#### The Vulnerability:
In `backend/src/services/payment/payment-webhook.service.ts`:
- **`transfer.failed` / `transfer.reversed` (Lines 400–420)**:
  ```typescript
  // IN-MEMORY CHECK:
  const wasPendingOrProcessing = payout.status === 'pending' || payout.status === 'processing';

  // UNCONDITIONAL UPDATE (No transaction, no conditional WHERE):
  await prisma.settlementPayout.update({
    where: { id: payout.id },
    data: { status: 'failed', failureReason: reason },
  });

  // FUND RELEASE:
  if (wasPendingOrProcessing && payout.business?.userId) {
    await WalletService.releaseLockedFunds({
      userId: payout.business.userId,
      amount: payout.amount,
      fee: 0,
    });
  }
  ```
- **`transfer.success` (Lines 319–340)**:
  ```typescript
  const wasCompleted = payout.status === 'completed';

  await prisma.settlementPayout.update({
    where: { id: payout.id },
    data: { status: 'completed', completedAt: new Date() },
  });

  if (!wasCompleted && payout.business?.userId) {
    await WalletService.settlePayoutDebit({ ... });
  }
  ```

#### Why This Is Dangerous:
1. **Double Fund Release on Failed Payout**:
   If Paystack fires two concurrent webhook requests for a failed transfer (or retries during network latency):
   - Request A and Request B both read `payout.status` as `'processing'`.
   - Both evaluate `wasPendingOrProcessing === true`.
   - Both execute `WalletService.releaseLockedFunds`.
   - In `WalletService.releaseLockedFunds`, `lockedBalance` is decremented by `payout.amount` **twice**.
   - Because `availableBalance = balance - lockedBalance`, decrementing `lockedBalance` twice **gives the user free balance that did not exist**.
2. **Missing Catch for P2002 on `transfer.success`**:
   `WalletService.settlePayoutDebit` writes a `WalletTransaction` with unique `reference`. If two `transfer.success` webhooks race, the second one throws `P2002` and responds with HTTP 500 rather than a clean HTTP 200 acknowledgment.

#### The Golden Standard Already in the Codebase:
Notice that `backend/src/modules/wallet/services/admin-payout.service.ts:423-437` already solves this correctly using an atomic conditional update:
```typescript
const res = await prisma.settlementPayout.updateMany({
  where: { id: payout.id, status: 'pending' },
  data: { status: 'failed', failureReason: ... },
});

if (res.count === 0) {
  // Another process already updated this row — do NOT release funds again!
  return;
}
```

---

## 4. Remediation Plan

### Fix 1: Make `transfer.failed` & `transfer.reversed` Atomic in Webhook Handler
**File**: `backend/src/services/payment/payment-webhook.service.ts`

Replace the in-memory status check with an atomic `updateMany` inside a transaction:
```typescript
if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
  // ... find payout ...
  if (payout && payout.business?.userId) {
    const userId = payout.business.userId;

    // Atomically transition status from pending/processing -> failed
    const updateResult = await prisma.$transaction(async (tx) => {
      const updated = await tx.settlementPayout.updateMany({
        where: {
          id: payout.id,
          status: { in: ['pending', 'processing'] },
        },
        data: {
          status: 'failed',
          failureReason: reason,
        },
      });

      // ONLY release locked funds if THIS call was the one that flipped the status
      if (updated.count === 1) {
        await WalletService.releaseLockedFunds(
          {
            userId,
            amount: payout.amount,
            fee: 0,
          },
          tx
        );
      }

      return updated.count;
    });

    if (updateResult === 0) {
      logger.info('Duplicate or late transfer.failed webhook ignored — payout already transitioned', {
        payoutId: payout.id,
        currentStatus: payout.status,
      });
      return;
    }

    // Emit logs, audit, and reminders
    // ...
  }
}
```

---

### Fix 2: Make `transfer.success` Atomic in Webhook Handler
**File**: `backend/src/services/payment/payment-webhook.service.ts`

Replace lines 321–349 with an atomic conditional update and transaction fence:
```typescript
if (event.event === 'transfer.success') {
  // ... find payout ...
  if (payout && payout.business?.userId) {
    const userId = payout.business.userId;

    const updateResult = await prisma.$transaction(async (tx) => {
      const updated = await tx.settlementPayout.updateMany({
        where: {
          id: payout.id,
          status: { not: 'completed' },
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      if (updated.count === 1) {
        await WalletService.settlePayoutDebit(
          {
            userId,
            businessId: payout.businessId,
            amount: payout.amount,
            fee: 0,
            reference: payout.transferReference,
            linkedPayoutId: payout.id,
            description: `Settlement payout completed to ${payout.destinationBankName}`,
          },
          tx
        );
      }

      return updated.count;
    });

    if (updateResult === 0) {
      logger.info('Duplicate transfer.success webhook ignored — payout already completed', {
        payoutId: payout.id,
      });
      return;
    }

    // Emit eventBus, logAudit, and send notifications outside transaction
    // ...
  }
}
```

---

## 5. Verification Checklist

1. **Automated Unit/Integration Verification**:
   - Simulate duplicate `transfer.failed` webhook delivery: Verify `WalletBalance.lockedBalance` is decremented exactly once.
   - Simulate duplicate `transfer.success` webhook delivery: Verify `WalletBalance.balance` is debited exactly once and second call exits cleanly with 200 OK.
2. **TypeScript Compilation Check**:
   - Run `npx tsc --noEmit` in `backend/` to verify zero type mismatches or compilation errors.
3. **Database Audit**:
   - Verify `SettlementPayout` rows and `WalletTransaction` records maintain 100% mathematical parity.
