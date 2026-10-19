# PayMyTax QA Findings & Architectural Deductions
**Document Version:** 1.0  
**Target Milestone:** Production Readiness & Release Hardening  
**Scope:** Backend Services, Invoicing, Accrual Debtors, DVA Inflows, Wallet Engine, and Tax Compliance  

---

## 1. Executive Summary & Core Architectural Context

Following an exhaustive, non-happy-path adversarial QA audit, this document details the key deductions, architectural findings, and edge-case risks identified across the codebase.

The platform demonstrates strong engineering foundations (PostgreSQL advisory locks on user wallets, transactional audit logging, and RBAC permission enforcement). However, critical boundaries between **cash-flow movements** (DVA transfers, wallet balances) and **statutory accrual accounting** (invoices, debtors, FIRS monthly returns) require precise hardening before production release.

---

## 2. In-Depth Deductions & Findings

---

### Deduction 1: Central Dedicated Virtual Account (DVA) vs. Business-Level Allocation

#### Architectural Intent (User Clarification)
1. **User-Level KYC & Central DVA:** Under Nigerian regulatory compliance (CBN & Paystack guidelines), KYC verification (BVN/NIN) is anchored to the individual merchant/user (`User`). A central Dedicated Virtual Account (`User.virtualAccountNumber`) is provisioned for that verified user.
2. **Shared Account Across Businesses:** All businesses created by that user share this virtual account number.
3. **Inbound Transfer Arrival (Central Landing Pool):** When a customer transfers funds into the DVA, Paystack sends a transfer webhook. Because all businesses under the merchant share the account number, routing the transfer initially to the merchant's `primaryBusinessId` serves as the central landing inbox.
4. **Classification & Ownership:** When the merchant reviews the transaction in the app (under *Unverified Transactions* or the business transaction feed), they classify the transfer. Once classified to a specific business, that transfer officially and legally belongs to that business entity for sales tracking, bookkeeping, and FIRS tax calculation.
5. **Reassignment / Transfer Move:** If a transfer is initially attributed to Business A by default, the multi-business owner has the legitimate ability to move/reassign it to Business B so that Business B's ledger accurately reflects the sale.

#### The Critical Vulnerability Boundary (Where It Can Break)
The mechanism works smoothly for general sales, but **breaks down completely if an inbound transfer is matched to an Accrual Credit Sale or an Invoice**:
* **Invoice Payments:** An invoice is a legal statutory document issued under Business A’s name, address, and Tax ID. If a customer pays for Business A's Invoice via DVA, and that transfer is subsequently moved to Business B, the cash payment is separated from the invoice. Business B records the revenue, while Business A shows an unpaid invoice.
* **Debtor Obligations (Accrual Sales):** Under accrual accounting, revenue was recognized when goods were delivered to the debtor under Business A. If the customer's DVA repayment is moved to Business B, Business B is credited with revenue it never earned, while Business A's debtor balance remains unpaid.
* **Distinct DVA Edge Case:** If Paystack assigns a distinct, unique virtual account number directly to a specific business (`Business.virtualAccountNumber`), routing should prioritize that specific business first before falling back to `User.primaryBusinessId`.

#### Recommended Rule:
1. **Allow Reassignment for General Transfers:** Unmatched DVA inflows and manual cash transfers can be freely reassigned between sibling businesses.
2. **Strict Lock for Matched Transactions:** If a transfer is linked to an `Invoice` or an `CustomerCredit` (debtor repayment), **reassignment must be strictly blocked** in both backend API and frontend UI.
3. **Exact Business DVA Match First:** If an incoming account number matches `Business.virtualAccountNumber`, allocate directly to that business; only fall back to `primaryBusinessId` when the account number matches the user-level DVA.

---

### Deduction 2: Admin Cancellation of In-Flight Payouts (Double-Spend Risk)

#### The Mechanism & Vulnerability
1. **The Flow:**
   - Merchant requests a withdrawal (`status = 'pending'`).
   - Admin approves, or auto-payout triggers: transfer is dispatched to Paystack (`status = 'processing'`).
   - At this stage, Paystack has queued or transmitted the transfer to NIBSS (Nigeria Inter-Bank Settlement System).
2. **The Flaw (`admin-payout.service.ts`):**
   - The admin rejection endpoint allows rejecting requests with `status: { in: ['pending', 'processing'] }`.
   - When an admin rejects a `processing` payout, the service sets `status = 'failed'` and calls `WalletService.releaseLockedFunds()`.
   - The user's locked balance is immediately released back to their available wallet balance.
   - The user can instantly initiate a new withdrawal or spend those funds.
3. **The Webhook Race (`payment-webhook.service.ts`):**
   - Paystack's bank transfer actually succeeds moments later (NIBSS completed the settlement).
   - Paystack fires `transfer.success`.
   - The webhook handler queries `where: { id: payout.id, status: { not: 'completed' } }`.
   - Because the status is `'failed'`, it matches!
   - The webhook updates status to `'completed'` and calls `WalletService.settlePayoutDebit()`.
   - `settlePayoutDebit` decrements both `balance` and `lockedBalance`.
4. **The Impact:**
   - The merchant received the bank transfer in their commercial bank account.
   - The merchant also received the unlocked funds back in their app wallet and withdrew them again.
   - The second debit forces the user's wallet into a **negative balance**, creating direct financial loss for the platform.

#### Recommended Rule:
* Admin rejection must **ONLY** be permitted when `status === 'pending'`.
* Once a payout is `processing`, it is locked in flight. It **cannot** be rejected or refunded by an admin. It can only be:
  1. Requeried via Paystack Transfer API, or
  2. Settled/failed definitively by Paystack's terminal webhook.
* In `payment-webhook.service.ts`, `transfer.success` must only transition rows with `status: 'processing'`. It must never resurrect a `failed` payout.

---

### Deduction 3: Accrual Debtors and Invoices Reassignment Guard

#### The Mechanism & Vulnerability
1. **Accrual Accounting Principles (FIRS & CITA §25):**
   - In accrual accounting, income is taxable when earned (at the time the credit sale or invoice is issued), not when cash is received.
   - If an SME issues an invoice or credit sale from Business A, Business A incurs the tax liability.
   - If the customer defaults, Business A claims a tax-deductible Bad Debt expense under CITA §25.
2. **The Flaw (`sales-verification.service.ts`):**
   - `applyReassignment` currently verifies that the merchant owns both businesses and that the tax month is not locked.
   - However, it does not check if `sale.source === 'credit'`, `sale.creditOrigin === true`, or if the sale is linked to an `Invoice`.
   - If an accrual sale is reassigned to Business B:
     - `salesTransaction.businessId` changes to Business B.
     - `CustomerCredit` remains under Business A.
     - `CreditPayment` repayments log under Business A.
     - Bad debt write-offs create deductible expenses under Business A.
     - Business B reports taxable revenue for a sale it never made or collected.
3. **Frontend Leak (`TransactionDetailPanel.tsx`):**
   - The "Move Sale" button appears for all sales transactions, exposing this action to users without validation.

#### Recommended Rule:
* Backend: Add a guard in `applyReassignment`:
  ```ts
  if (sale.source === 'credit' || sale.creditOrigin || sale.invoice) {
    throw new AppError(400, 'Cannot reassign accrual sales, credit sales, or invoice-linked transactions to another business entity', 'INVALID_TRANSACTION_TYPE');
  }
  ```
* Frontend: In `TransactionDetailPanel.tsx`, conditionally hide the "Move Sale" section if `isCreditSale` or `isInvoiceSale` is true.

---

### Deduction 4: Parameter Inversion in `WalletService.reserveFunds`

#### The Mechanism & Vulnerability
* In [`backend/src/services/wallet/wallet.service.ts`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/wallet/wallet.service.ts#L412-L416):
  ```ts
  throw new AppError(
    400,
    'INSUFFICIENT_FUNDS',
    `Insufficient available wallet balance. Available: ₦${available.toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Required: ₦${totalDebit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
  );
  ```
* The `AppError` constructor signature in `errorHandler.ts` is:
  ```ts
  constructor(public statusCode: number, public message: string, public code?: string, public details?: any)
  ```
* Because parameters 2 and 3 are inverted, the API response outputs:
  ```json
  {
    "error": {
      "code": "Insufficient available wallet balance. Available: ₦0.00, Required: ₦50,000.00",
      "message": "INSUFFICIENT_FUNDS"
    }
  }
  ```
* Any client application, automated job, or error boundary checking `error.code === 'INSUFFICIENT_FUNDS'` fails.

#### Recommended Rule:
* Correct to:
  ```ts
  throw new AppError(
    400,
    `Insufficient available wallet balance. Available: ₦${available.toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Required: ₦${totalDebit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
    'INSUFFICIENT_FUNDS'
  );
  ```

---

### Deduction 5: Statutory Tax Period Finalization Gate vs. E2E Test Suite

#### The Mechanism & Vulnerability
1. Under FIRS regulations (VAT Act §15, CITA §55), tax returns apply to full calendar months. Locking an ongoing calendar month before it ends is statutorily prohibited unless an explicit early business closure is declared.
2. In `backend/src/services/tax/tax-report.service.ts`, `finalizeReport` enforces `assertMonthFinalizationEligible`: attempting to finalize an ongoing month returns `400 PERIOD_STILL_ACTIVE` unless `{ forceEarlyClosure: true }` is supplied.
3. In `backend/tests/e2e/api.e2e.test.ts`, line 28 sets `MONTH = now.getMonth() + 1` (current active month) and attempts to finalize it without `forceEarlyClosure`. This returns 400 and causes 8 downstream assertions to fail.

#### Recommended Rule:
* Update `api.e2e.test.ts` to test finalization using a concluded historical month (e.g. `MONTH = 1, YEAR = 2026`) or explicitly pass `{ forceEarlyClosure: true }` in the finalize payload.

---

### Deduction 6: FIRS Nil Return Filing for ₦0 Sales Months

#### The Mechanism & Vulnerability
* In `backend/src/services/tax/tax-report.service.ts`:
  ```ts
  if (totalSales === 0) {
    throw new AppError(400, 'Cannot finalize a report with zero sales', 'ZERO_SALES');
  }
  ```
* Under Nigerian tax law, registered businesses with zero sales during a month (seasonal downtime, startup phase, temporary halt) are legally mandated to submit a **Nil Return**.
* Throwing `ZERO_SALES` prevents SMEs from locking the period and generating their FIRS Nil Return report, leaving them vulnerable to statutory non-filing penalties (₦50,000 for the first month under CITA §55).

#### Recommended Rule:
* Allow report finalization when `totalSales === 0` if marked as a Nil Return (`isNilReturn: true`), locking the report with ₦0 tax payable.

---

## 3. Implementation Plan Summary

| Action Item | Target Files | Primary Objective |
| :--- | :--- | :--- |
| **DVA Routing Guard** | `backend/src/services/dva/dva-webhook.service.ts` | Match exact `Business.virtualAccountNumber` first; fallback to `primaryBusinessId` for user-level account. |
| **In-Flight Payout Protection** | `backend/src/modules/wallet/services/admin-payout.service.ts`<br>`backend/src/services/payment/payment-webhook.service.ts` | Restrict admin rejection to `status === 'pending'`; restrict webhook success to `status === 'processing'`. |
| **Accrual Reassignment Guard** | `backend/src/services/sales/sales-verification.service.ts`<br>`frontend/src/components/TransactionDetailPanel.tsx` | Block reassigning credit sales, debtor payments, and invoices. Hide "Move Sale" button for these items. |
| **AppError Parameter Order** | `backend/src/services/wallet/wallet.service.ts` | Align `reserveFunds` error arguments with constructor signature. |
| **Nil Return Support** | `backend/src/services/tax/tax-report.service.ts` | Allow ₦0 sales finalization with Nil Return flag. |
| **E2E Test Period Fix** | `backend/tests/e2e/api.e2e.test.ts` | Pass `forceEarlyClosure: true` or use historical month in E2E suite. |

---

*Generated by QA Architect Engine — PayMyTax Hardening Initiative.*
