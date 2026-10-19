# ADR 0005: Tax Finalization Gate and Period-Closing Lifecycle

## Status
Accepted

## Context
A major compliance failure in SME bookkeeping occurs when transactions (sales or expenses) are retrospectively backdated, altered, or deleted after a tax period has been computed and filed with the tax authority. If an SME generates a March tax report, pays FIRS ₦25,500, and subsequently inserts ₦100,000 of new sales into March, the filed report and official PDF statement become fraudulent or out-of-sync with database records.

## Decision
1. **Canonical Month-Lock Guard**:
   - `assertMonthNotLocked(businessId, transactionDate, tx)` is enforced on all mutations touching `SalesTransaction`, `SaleLineItem`, `Expense`, `Invoice`, `CustomerCredit`, and bad debt write-offs.
   - Converts the transaction date to UTC month start and end boundaries.
   - If a `MonthlyTaxReport` for that `(businessId, year, month)` exists with `status === 'finalized'` or `status === 'paid'`, or `isLocked === true`, the database mutation is rejected with `423 PERIOD_LOCKED` or `423 PERIOD_FINALIZED`.
2. **Statutory Nil Returns**:
   - If an SME operates at a loss or zero profit in a given month, they must still file a return under FIRS statutory regulations.
   - Endpoint `/tax/reports/nil` allows submitting a formal Nil Return (`isNil: true`, `taxPayable: 0.00`) which finalizes and locks the period.
3. **Irreversible Finalization**:
   - Once finalized, a report cannot be modified without formal administrative unlocking.
   - Tamper-evident PDF tax statements can be downloaded at any time, carrying the exact historical numbers locked on the report record.

## Consequences
- **Positive**: Guarantees audit compliance; prevents accidental or fraudulent retrospective balance tampering; ensures database records match filed PDF receipts.
- **Negative**: Users must record corrections in the current open tax month (e.g. credit notes or adjustment expenses) rather than modifying closed historical months.
