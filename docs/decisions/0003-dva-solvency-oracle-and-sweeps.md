# ADR 0003: DVA Auto-Capture, Solvency Oracle and Transfer Sweeps

## Status
Accepted

## Context
Counter bank transfers in Nigeria are susceptible to fake alerts and slow manual confirmation. PayMyTax integrates Paystack Dedicated Virtual Accounts (DVA) to automate payment reconciliation. Inflows land in the SME's wallet. To manage treasury without manual daily withdrawal friction, we designed an automated sweep mechanism.

However, money movements introduce critical financial failure modes:
1. Double-counting transfers when webhooks retry.
2. Race conditions where manual withdrawals and auto-sweeps execute concurrently against the same balance.
3. System insolvency if payout amounts exceed actual available funds.

## Decision
1. **Idempotent Webhook Capture**: Paystack webhooks (`charge.success` and `transfer.success`) match on the unique reference. `unique_sales_reference` constraint on `(businessId, source, referenceId)` provides absolute database-level idempotency against repeated delivery.
2. **Live Solvency Oracle (`assertSolvency`)**:
   - Before any payout, withdrawal, or transfer sweep is dispatched, the system runs an uncached live database query computing `liveBalance = wallet.availableBalance`.
   - The transaction asserts `liveBalance >= transferAmount + platformFee`. If insufficient, the operation is rejected immediately.
3. **Atomic Balance Holds**: Outbound transfers immediately decrement `availableBalance` and record a pending `WalletTransaction` row inside a database transaction before calling the external Paystack Transfer API. If Paystack returns a transient error, the transaction enters an ambiguous reconciliation state for requery rather than blindly rolling back funds.
4. **Nightly Auto-Sweep Job**: A scheduled cron (`02:00 Africa/Lagos`) sweeps all eligible business wallet balances above the minimum sweep threshold (`₦1,000`) into the owner's verified commercial settlement bank account.

## Consequences
- **Positive**: Zero risk of negative balances or double-payouts; eliminates manual bookkeeping for counter bank transfers; automates cash flow into commercial bank accounts.
- **Negative**: Requires strict handling of Paystack transfer status ambiguities (handled by `payout-reconciliation.cron.ts`).
