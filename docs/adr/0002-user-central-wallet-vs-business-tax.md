# ADR-0002: User-Level Central Treasury (Wallet) vs Business-Level NRS Tax

## Status

Accepted (September 2026)

## Context

WallXERP by WallX allows an individual entrepreneur (represented by one User account with verified BVN/NIN and Paystack customer code) to create and operate multiple businesses (e.g., a bakery, a retail boutique, and a consulting firm).

The system must satisfy two conflicting domain boundaries:

1. **NRS Regulatory Requirement**: Each registered business is an independent tax entity with its own Tax Identification Number (TIN). Tax payable must be calculated independently per business as `7.5% × Gross Profit` (`Total Taxable Sales − Deductible Expenses`). Expenses or losses in Business A cannot arbitrarily offset taxable profits in Business B without formal consolidated filing.
2. **Fintech Treasury & Banking Requirement**: In Nigerian banking and Paystack integration, an individual person has one BVN, one KYC verification, and one central Dedicated Virtual Account (DVA) pool. Merchants want a centralized wallet where liquidity from all their ventures is accessible for withdrawal to their verified personal/commercial settlement bank account.
3. **Future Extension (Storefronts)**: When online storefronts (`Store`) are added later, an SME will be able to sell products online. Online orders book sales to the linked `Business` (for VAT and income tax reporting) while depositing funds into the User's central Treasury.

## Decision

We decouple the **User Treasury Context** from the **Business Legal Context**:

1. **User Context (Central Wallet)**:
   - Owns `WalletBalance` (`userId`, `availableBalance`, `lockedBalance`, `currency`, `version`).
   - Owns `WalletTransaction` (`userId`, `businessId?`, `type`, `amount`, `balanceAfter`, `reference`, `idempotencyKey`).
   - Owns Payout/Withdrawal requests (`PayoutRequest`), KYC, Settlement Accounts, and PIN security.
   - Centralizes DVA cash collection and withdrawal payouts.

2. **Business Context (Tax & Accounting)**:
   - Owns `SalesTransaction` (with `isTaxable`, `source`, `category`).
   - Owns `Expense` (with `isDeductible`, `category`).
   - Owns `Invoice` and `InvoiceLine`.
   - Owns `MonthlyTaxReport` and `TaxPayment`.

3. **Inter-Context Interaction**:
   - When a sale or DVA transfer occurs, revenue and tax liability are recorded in the target `Business` (`SalesTransaction`).
   - Simultaneously, an atomic entry is made in `WalletTransaction` under the owning `User`, updating `WalletBalance.availableBalance`.
   - When Storefronts are introduced later, `Store` orders create a `SalesTransaction` on the business and a `WalletTransaction` on the user, preserving both tax compliance and unified treasury without architecture rewrite.

## Consequences

- **Positive**: Clean domain boundaries. Resolves the "phantom wallet" calculation bottleneck (16 aggregate queries with 8 JSONB scans on every balance check).
- **Positive**: Simplifies withdrawal processing to a simple check on `WalletBalance.availableBalance`.
- **Positive**: Strict regulatory compliance: NRS reports remain 100% scoped to individual business entities.
- **Negative / Operational Requirement**: Requires atomic ledger recording across `sales_transactions` and `wallet_transactions` via Prisma transactions (`prisma.$transaction`).
