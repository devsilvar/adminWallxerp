# Phase 2: Central User Wallet & DVA Optimization — Implementation & Test Archive

**Saved on**: September 9, 2026  
**Status**: Implemented & Empirically Verified (100% Pass)  
**Purpose**: Complete architectural archive, implementation details, and test suites for Phase 2 ("Central User Wallet & DVA Optimization") as specified in `codebaserefactor.md` and `codebaserescture.md`.

---

## 1. Architectural Summary & Objectives

Phase 2 permanently eliminates the 16-aggregate-query balance calculation and 8 unindexed JSONB scans across `settlement.service.ts` and `dva.service.ts` by:
1. Converting the unindexed JSONB filter `metadata->>'channel' = 'dva'` into a first-class indexed boolean column `dvaOrigin` on `SalesTransaction` (`@@index([businessId, dvaOrigin, status])`).
2. Introducing a dedicated double-entry Central User Wallet:
   - `WalletBalance`: Pooled treasury keyed to `User.id` (`balance`, `lockedBalance`, `currency`, `version`).
   - `WalletTransaction`: Double-entry audit ledger (`walletId`, `userId`, `businessId`, `type`, `amount`, `fee`, `netAmount`, `balanceAfter`, `reference`, `source`, `idempotencyKey`, `linkedSaleId`, `linkedPayoutId`).
3. Introducing `WalletService` with O(1) balance reads, atomic balance increments/decrements, 3-tier idempotency guards, fund locking for payouts, and live Paystack balance verification before money movement.
4. Implementing a shadow mode reconciliation sweep (`wallet-reconciliation.cron.ts`) running at 01:00 Africa/Lagos protected by Postgres advisory lock `947363`.

---

## 2. Database Schema & Migration

### Schema Additions (`backend/prisma/schema.prisma`)
```prisma
// On SalesTransaction:
dvaOrigin Boolean @default(false) @map("dva_origin")
@@index([businessId, dvaOrigin, status])

// New enum:
enum WalletTxType {
  credit
  debit
  payout
  fee
  reversal
}

// Central User Wallet:
model WalletBalance {
  id            String              @id @default(uuid())
  userId        String              @unique @map("user_id")
  balance       Decimal             @default(0.00) @db.Decimal(15, 2)
  lockedBalance Decimal             @default(0.00) @map("locked_balance") @db.Decimal(15, 2)
  currency      String              @default("NGN")
  version       Int                 @default(0)
  createdAt     DateTime            @default(now()) @map("created_at")
  updatedAt     DateTime            @updatedAt @map("updated_at")
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions  WalletTransaction[]

  @@map("wallet_balances")
}

// Double-Entry Ledger:
model WalletTransaction {
  id             String            @id @default(uuid())
  walletId       String            @map("wallet_id")
  userId         String            @map("user_id")
  businessId     String?           @map("business_id")
  type           WalletTxType      @default(credit)
  amount         Decimal           @db.Decimal(15, 2)
  fee            Decimal           @default(0.00) @db.Decimal(15, 2)
  netAmount      Decimal           @map("net_amount") @db.Decimal(15, 2)
  balanceAfter   Decimal           @map("balance_after") @db.Decimal(15, 2)
  reference      String            @unique
  source         String
  description    String?
  idempotencyKey String?           @unique @map("idempotency_key")
  metadata       Json?
  linkedSaleId   String?           @unique @map("linked_sale_id")
  linkedPayoutId String?           @unique @map("linked_payout_id")
  createdAt      DateTime          @default(now()) @map("created_at")
  wallet         WalletBalance     @relation(fields: [walletId], references: [id], onDelete: Cascade)
  user           User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  business       Business?         @relation(fields: [businessId], references: [id], onDelete: SetNull)
  linkedSale     SalesTransaction? @relation(fields: [linkedSaleId], references: [id], onDelete: SetNull)
  linkedPayout   SettlementPayout? @relation(fields: [linkedPayoutId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt(sort: Desc)])
  @@index([businessId])
  @@index([walletId])
  @@index([reference])
  @@map("wallet_transactions")
}
```

### Migration Applied
- File: `backend/prisma/migrations/20260909180000_add_wallet_and_dva_origin/migration.sql`
- Deployed to Supabase PostgreSQL: `npm run prisma:migrate:deploy`

---

## 3. Services & Infrastructure Implemented

1. **`backend/src/services/wallet.service.ts`**:
   - `getOrCreateWallet(userId, tx?)`: O(1) balance lookup and auto-initialization with P2002 race recovery.
   - `getWalletBalance(userId, tx?)`: returns `{ balance, lockedBalance, availableBalance, currency, version, lastSyncedAt }`.
   - `creditWallet(params, tx?)`: atomic balance increment (`balance: { increment }`, `version: { increment }`) with idempotency checks on `idempotencyKey`, `reference`, and `linkedSaleId`. Configured with `TX_OPTIONS = { maxWait: 15000, timeout: 30000 }` to withstand high concurrency under row-locking serialization.
   - `reserveFunds(params, tx?)`: locks requested payout + fee in `lockedBalance` after asserting available balance sufficiency (throws 400 `INSUFFICIENT_FUNDS` on deficit).
   - `settlePayoutDebit(params, tx?)`: decrements both `balance` and `lockedBalance` upon transfer completion and records a `payout` transaction with negative net amount.
   - `releaseLockedFunds(params, tx?)`: returns locked funds to available balance on payout rejection or failure.
   - `checkLivePaystackBalance(amountNaira)`: queries `https://api.paystack.co/balance` before payouts; fails closed if gateway funds < payout amount.

2. **`backend/src/scripts/backfill-wallet-balances.ts`**:
   - Replays legacy `getPayoutPreview` per user (accounting for split settlement, processing fees, and payouts) to initialize `WalletBalance` rows.
   - Supports `--dry-run` flag printing old vs new balances before writing.

3. **`backend/src/jobs/wallet-reconciliation.cron.ts`**:
   - Scheduled daily at 01:00 Africa/Lagos, protected by Postgres advisory lock `947363`.
   - **Invariant 1**: Asserts `WalletBalance.balance == Σ(WalletTransaction.netAmount)` for recorded transactions.
   - **Invariant 2**: Compares `WalletBalance.balance` against `getPayoutPreview().availableForWithdrawal` (reconciliation oracle) and alerts if drift > ₦0.01.
   - Registered in `backend/src/server.ts`.

4. **Query Optimizations in `settlement.service.ts` & `dva.service.ts`**:
   - Replaced all 8 unindexed JSONB scans (`metadata: { path: ['channel'], equals: 'dva' }`) with `dvaOrigin: true` leveraging the composite B-tree index.
   - Added `dvaOrigin: true` on auto-captured sales in `processDVATransferWebhook`.
   - Replaced dynamic `await import('@/lib/payout-lock')` with top-level static import.

5. **Typed Domain Event Bus (`backend/src/core/events/event-bus.ts`)**:
   - Zero-dependency in-process typed event bus leveraging Node.js `EventEmitter`.
   - Strongly-typed `AppDomainEvents` interface covering `order.payment_confirmed`, `invoice.paid`, `dva.transfer_received`, `wallet.credited`, `payout.completed`.
   - Isolated asynchronous execution wrappers with Winston error logging preventing listener crashes from cascading.
   - Enforces post-commit side-effect pattern (financial transactions commit before event emission).

6. **Wallet HTTP API Layer**:
   - `backend/src/validators/wallet.validator.ts`: Zod query schema with coercion and pagination guards (`walletHistoryQuerySchema`).
   - `backend/src/controllers/wallet.controller.ts`: `getWalletBalance` and `getWalletHistory`.
   - `backend/src/routes/wallet.routes.ts`: Authenticated router mounted at `/api/v1/wallet`.
   - Main router registration: Mounted under `v1.use('/wallet', walletRoutes)` in `backend/src/routes/index.ts`.

7. **DVA Transaction Reclassification Synchronization**:
   - In `backend/src/services/sales.service.ts`: When an auto-captured DVA sale is reclassified or reassigned to a target business (`targetBusinessId`), the linked `WalletTransaction.businessId` is atomically updated.

---

## 4. Test Suites Created & Commands to Run

### Test Files Created
1. **WalletService Unit Test Suite**:
   - File: `backend/tests/unit/wallet.service.test.ts` (567 lines, 18 test cases, 100% pass)
2. **TypedEventBus Unit Test Suite**:
   - File: `backend/tests/unit/event-bus.test.ts` (105 lines, 5 test cases, 100% pass)
3. **Wallet API Integration Suite**:
   - File: `backend/tests/integration/wallet-api.test.ts` (140 lines, 6 test cases, 100% pass)
4. **Live Database Integration Suite**:
   - File: `backend/tests/integration/wallet-live.test.ts` (401 lines, 14 test cases, 100% pass)
5. **Phase 2 Adversarial QA & Stress Suite**:
   - File: `backend/tests/integration/phase2-adversarial-qa.test.ts` (310 lines, 12 test cases, 100% pass)
   - Tests: Sub-millisecond duplicate idempotency key collisions, double-withdrawal over-reservation attack serialization, IEEE-754 decimal drift torture, physical index existence verification in PostgreSQL catalog (`pg_indexes`), foreign key constraint enforcement, SQL injection protection, pagination boundary torturing, multi-listener error blast radius, and active ledger tampering detection.

### Exact Commands to Re-run Verification

```powershell
cd backend

# 1. Typecheck the entire codebase (0 errors)
npm run typecheck

# 2. Run TypedEventBus Unit Tests (5 passed, 0 failures)
npx jest --config jest.config.ts tests/unit/event-bus.test.ts

# 3. Run WalletService Unit Tests (18 passed, 0 failures)
npx jest --config jest.config.ts tests/unit/wallet.service.test.ts

# 4. Run All Unit Tests (8 suites, 91 passed, 0 failures)
npm run test:unit

# 5. Run Wallet HTTP API Integration Tests (6 passed, 0 failures)
npx jest --config jest.config.ts tests/integration/wallet-api.test.ts --runInBand

# 6. Run Live Database Wallet Integration Tests (14 passed, 0 failures)
npx jest --config jest.config.ts tests/integration/wallet-live.test.ts --runInBand

# 7. Run Phase 2 Adversarial QA & Stress Tests (12 passed, 0 failures)
npx jest --config jest.config.ts tests/integration/phase2-adversarial-qa.test.ts --runInBand

# 8. Run Phase 1 Hardening Live Tests (15 passed, 0 failures)
npx jest --config jest.config.ts tests/integration/phase1-hardening-live.test.ts --runInBand

# 9. Run Backfill Tool (Dry Run)
npx tsx src/scripts/backfill-wallet-balances.ts --dry-run
```
