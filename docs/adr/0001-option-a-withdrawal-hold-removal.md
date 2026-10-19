# ADR-0001: Option A — Withdrawal Tax Hold Removal

## Status

Accepted (September 2026)

## Context

In earlier system iterations, the platform evaluated whether to apply a mandatory tax hold (reserving 7.5% of gross profit from user payout withdrawals) at the moment a payout was requested.

This design caused severe usability and operational friction:

1. **Double Taxation / Double Hold**: For automated DVA and online payments, 7.5% tax is already physically split and withheld directly into the dedicated tax collection subaccount at the payment gateway level (Paystack Transaction Splits). Holding additional funds at withdrawal time resulted in a double deduction from the merchant's working capital.
2. **Cash Flow Strain for SMEs**: SMEs require immediate liquidity from confirmed non-taxable transactions (capital injections, owner equity, loan proceeds) and settled operational cash flow.
3. **Statutory Alignment with NRS**: NRS remittance is formally reconciled on a monthly basis (`MonthlyTaxReport` due on the 21st of the subsequent month). Holding arbitrary amounts on each ad-hoc withdrawal does not align with Nigerian tax filing schedules.

## Decision

We adopt **Option A (Tax Reserve is Display-Only / Advisory)**:

1. **No Withdrawal Withholding**: The platform does NOT freeze or withhold tax amounts during user withdrawal requests. Withdrawable balance equals settled available balance minus in-flight payout reservations.
2. **Advisory Tax Display**: The UI displays the estimated monthly tax obligation as an informational badge/card to help business owners plan for their monthly remittance.
3. **Automated Remittance via Split or Direct Settlement**:
   - For gateway-collected transactions, Paystack Subaccount splits isolate tax into the tax remittance pool.
   - For manual and un-split sales, users remit their tax when finalizing their monthly tax report via Paystack remittance checkout.

## Consequences

- **Positive**: Simplified payout calculations, zero double-withholding, clean accounting for SMEs, and predictable cash flow.
- **Positive**: Elimination of complex, buggy dynamic tax hold reconciliations in `settlement.service.ts`.
- **Negative / Risk**: If an SME withdraws 100% of their available revenue and fails to budget for monthly tax, their tax report will remain unpaid at month end. This is mitigated by in-app reminders, email alerts, and deadline notifications (`tax_deadline`, `unpaid_tax`).
