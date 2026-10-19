# ADR 0001: Accrual-Basis Accounting for Credit Sales and Debtors

## Status
Accepted

## Context
In Nigerian commerce, informal credit and "buy now, pay later" sales are pervasive among MSMEs. Previously, the application treated sales as cash-basis only. When credit debtor management was introduced, we needed to decide how and when revenue is recognized for tax reporting:
- **Option A (Cash Basis)**: Only record sales revenue when the debtor actually makes a cash repayment.
- **Option B (Accrual Basis)**: Record sales revenue immediately upon delivery/credit issuance, and treat debt collections as balance sheet cash movements rather than new income.

Under statutory Nigerian tax law (CITA and FIRS principles), revenue is earned at the point of invoice/goods delivery, not at cash collection. Furthermore, treating debtor payments as new sales creates massive double-counting if a transaction is recorded at delivery and again upon repayment.

## Decision
1. **Atomic Issuance**: `createCredit` atomically creates BOTH a `SalesTransaction` (source=`credit`, status=`confirmed`, `isTaxable=true`, date=`issueDate`) and a `CustomerCredit` row linked via `linkedSaleId`.
2. **Repayments Do Not Create Sales**: `recordPayment` only reduces `CustomerCredit.balance` and logs a `CreditPayment` record. It **NEVER** creates a `SalesTransaction`.
3. **DVA Reclassification**: When an inbound bank transfer auto-captured by DVA is reconciled against an existing credit debtor, the transfer's tax flag is flipped to `isTaxable = false` with classification `Credit Repayment (Non-Taxable)`.
4. **Statutory Bad Debt Write-Offs**: If debt is deemed uncollectible, `writeOffCredit` marks the balance as written off and atomically creates an allowable deduction expense (`category: bad_debt`) under CITA §25. The original revenue transaction is untouched because the revenue was legally earned.

## Consequences
- **Positive**: Eliminates revenue duplication; guarantees strict compliance with FIRS accrual accounting rules; provides automatic tax relief for bad debts.
- **Negative**: Requires strict month-lock validations on credit issuance dates so old tax reports cannot be retroactively altered.
