# Feature Specification: Credit Sales, Debtors & Bad Debt Write-Offs

## 1. Objective & User Stories
Manage trade credit sales under statutory accrual-basis accounting, track customer receivable obligations, record installment repayments without duplicating sales revenue, and automate deductible bad debt write-offs under CITA §25.

**User Stories:**
- As a wholesaler, I want to sell goods on credit to trusted buyers so that my delivery is recorded without demanding immediate cash.
- As an accountant, I want credit sales to count toward my monthly tax revenue when issued, without double-counting when the debtor pays.
- As a business owner, I want to write off uncollectible debt after recovery attempts, so that it reduces my taxable gross profit as an allowable bad debt expense.

---

## 2. Core Workflows & Accrual Rules

### 2.1. Credit Sale Issuance (`POST /businesses/:id/credits`)
1. Validates payload via `createCreditSchema` (`customerName`, `customerEmail` [required], `totalAmount`, `issueDate`, `dueDate`, `lineItems`).
2. Asserts issue date month is not locked: `assertMonthNotLocked(businessId, issueDate)`.
3. In a single database transaction:
   - Generates unique credit UUID `creditId`.
   - Creates a `SalesTransaction` (`source: 'credit'`, `status: 'confirmed'`, `isTaxable: true`, `referenceId: creditId`, `finalClassification: 'Credit Sale'`).
   - Creates `CustomerCredit` linked to the sale via `linkedSaleId`.
   - Creates child `SaleLineItem` and `CreditLineItem` rows.
4. Dispatches email notification to debtor outside transaction with obligation amount and DVA settlement instructions.

### 2.1.1. Manual Debt Update & Payment Instructions Email (`POST /businesses/:id/credits/:id/send-email`)
1. Validates access (`debtors.manage` + `bnplCredits` feature gate).
2. Refuses settled/written-off credits (`409 CREDIT_CLOSED`).
3. Sends `debtor-reminder` email using live outstanding balance, due date, and merchant DVA bank details.
4. Bumps `lastReminderSentAt` cooldown so nightly sweep does not duplicate notifications on the same Lagos calendar day.

### 2.2. Debt Repayments (`POST /businesses/:id/credits/:id/payments`)
1. Accepts repayment amount, payment date, and method (`cash`, `bank_transfer`, `pos`).
2. Deducts amount from `CustomerCredit.balance`.
3. If balance reaches zero, updates status to `paid`; if partial, status becomes `partially_paid`.
4. Creates a `CreditPayment` row with `linkedSaleId = null`.
5. **CRITICAL ACCOUNTING RULE**: No `SalesTransaction` is created. Revenue was already booked at issuance.

### 2.3. DVA Transfer Reconciliation (`POST /businesses/:id/credits/:id/reconcile-dva`)
1. When a debtor repays by transferring funds into the merchant's DVA, the webhook initially creates a taxable bank transfer sale.
2. The merchant clicks "Reconcile to Credit" and selects the target debtor.
3. The reconciliation service:
   - Reduces the debtor balance.
   - Flips the inbound sales transaction's tax flag: `isTaxable = false` and reclassifies description as `Credit Repayment (Non-Taxable)`.
   - Eliminates revenue double-counting.

### 2.4. Statutory Bad Debt Write-Off (`POST /businesses/:id/credits/:id/write-off`)
1. Requires reason and write-off date.
2. Asserts write-off date month is not locked: `assertMonthNotLocked(businessId, writeOffDate)`.
3. In a database transaction:
   - Sets `CustomerCredit.status = 'written_off'`.
   - Creates an allowable `Expense` row (`category: 'bad_debt'`, `amount: uncollectedBalance`, `description: "Bad Debt Write-Off - CITA §25 - [Customer Name]"`).
   - Flags expense as protected against manual tampering.
   - Leaves original `SalesTransaction` intact.

---

## 3. Scheduled Reminders & Sweep
- Nightly cron (`00:30 Africa/Lagos`) executes `sweepCreditReminders`.
- Identifies credits past due date, marks status `overdue`, and dispatches email reminders to debtors with a strict 24-hour rate-limit cooldown.

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] Credit issuance creates both `SalesTransaction` and `CustomerCredit` with identical timestamps.
- [ ] Manual debt repayment reduces credit balance without creating a sales transaction.
- [ ] Reconciling DVA transfers flips `isTaxable = false`.
- [ ] Bad debt write-off creates a deductible `bad_debt` expense row reducing taxable profit.
