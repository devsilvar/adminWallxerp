# Feature Specification: Central Wallet, Settlement & Auto-Sweeps

## 1. Objective & User Stories
Provide business owners with a centralized treasury wallet pooling DVA sales inflows across businesses, protected by a 2-tier PIN security model, verified commercial bank settlements, and automated nightly balance sweeps.

**User Stories:**
- As a business owner, I want all payments from my dedicated virtual accounts to aggregate into my central wallet so I have a single view of company cash.
- As a business owner, I want my available balance auto-swept to my commercial bank account every night so I don't have to initiate manual withdrawals daily.
- As a business owner, I want manual withdrawals secured by a 4-digit PIN so that an open session cannot be exploited to steal company money.

---

## 2. Core Workflows & Financial Architecture

### 2.1. Central Wallet Structure (`WalletBalance`)
- Scoped to `User.id` (business owner).
- Fields: `availableBalance`, `ledgerBalance`, `lockedBalance`.
- Inflows: Inbound DVA bank transfers immediately increment `availableBalance` upon webhook verification.

### 2.2. Settlement Bank Account Verification
- Owner inputs commercial bank name and 10-digit NUBAN account number.
- Resolves account name via Paystack NIBSS Bank Resolution API (`/bank/resolve`).
- Connects verified settlement details to `User` and `Business` profiles.
- Changes to settlement bank account require 4-digit PIN verification and trigger email alerts.

### 2.3. Outbound Withdrawal Workflow (`POST /wallet/withdraw`)
1. **Owner-Only Guard**: Route rejected for any staff role.
2. **Actor & PIN Verification**:
   - Queries live uncached `getWithdrawalActor(userId)`.
   - Asserts `pinLockedUntil === null` (rejects with `423 PIN_LOCKED` if on cooldown).
   - Verifies 4-digit PIN via `bcrypt.compare`.
   - If invalid: increments `pinAttempts`. If attempts reach 3, sets 15-minute lock.
3. **Live Solvency Oracle (`assertSolvency`)**:
   - Asserts `availableBalance >= requestedAmount + platformFee`.
4. **Atomic Ledger Execution**:
   - Inside a database transaction:
     - Decrements `availableBalance`.
     - Inserts pending `WalletTransaction` row (`type: 'payout'`).
5. **Paystack Outbound Transfer**:
   - Dispatches transfer request to Paystack outside the database transaction.
   - If Paystack rejects: funds are restored atomically.
   - If Paystack accepts: webhook `transfer.success` marks transaction `completed`.

### 2.4. Nightly Auto-Sweep Job (`02:00 Africa/Lagos`)
- Cron worker queries all owners with `autoPayoutEnabled === true`.
- Evaluates eligible available balances above `₦1,000` minimum threshold.
- Verifies live solvency, deducts balance, and initiates automated transfer to the verified settlement account.

---

## 3. Acceptance Criteria & Test Scenarios
- [ ] 3 consecutive incorrect PIN entries triggers a 15-minute lockout.
- [ ] Withdrawal requests exceeding available funds are rejected by the Solvency Oracle.
- [ ] Non-owner accounts cannot initiate payouts or change settlement accounts.
- [ ] Nightly auto-sweep transfers eligible funds and logs transaction records.
