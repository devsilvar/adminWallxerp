# ADR 0004: Two-Tier Transaction PIN and Settlement Security

## Status
Accepted

## Context
Because PayMyTax handles customer funds via Dedicated Virtual Accounts and allows withdrawals to external Nigerian bank accounts, securing money movement endpoints is paramount. If an attacker gains access to an authenticated session (e.g. through a stolen JWT or an unlocked computer), they must not be able to drain the merchant's wallet or redirect payouts to an arbitrary bank account.

## Decision
1. **Two-Tier Authentication**:
   - Session tier: Standard JWT access token (15m expiration) for day-to-day operations.
   - Financial execution tier: Dedicated 4-digit transaction PIN required for money movements (withdrawals, settlement bank updates).
2. **PIN Security Implementation**:
   - Hashed using `bcrypt` (12 rounds) and stored in `User.transactionPin`.
   - Verified live via uncached database queries (`getWithdrawalActor()`).
3. **Brute-Force & Lockout Protection**:
   - Tracking `User.pinAttempts`, `User.pinLockedUntil`, and `User.pinAttemptsResetAt`.
   - 3 consecutive failed attempts triggers an immediate 15-minute lockout (`423 PIN_LOCKED`).
   - Failed attempts trigger security email alerts (`pin-alert.ts`).
4. **Verified Commercial Settlement Accounts Only**:
   - Payouts can only be disbursed to pre-verified commercial bank accounts resolved via NIBSS/Paystack bank name verification.
   - Settlement bank changes require PIN verification and trigger mandatory security audit alerts.
5. **Owner-Only Guard**:
   - Only the business `owner` possesses a transaction PIN and can access withdrawal endpoints. Staff accounts (`manager`, `sales_staff`, `accountant`, `viewer`) are blocked at the route middleware layer.

## Consequences
- **Positive**: Protects merchant funds even if access tokens are compromised; adheres to CBN non-custodial fintech security standards.
- **Negative**: Adds a modal PIN entry step to manual payout workflows.
