# Security Architecture & Policies

## 1. Authentication & Token Lifecycle

- **JWT Authentication**:
  - Access Token: 15-minute lifespan (`JWT_ACCESS_SECRET`), carries `userId` and `role`.
  - Refresh Token: 7-day lifespan (`JWT_REFRESH_SECRET`), stored in HTTP-only cookies or secure headers. Rotated on each renewal.
  - Password Hashing: `bcrypt` with 12 salt rounds. Hashing is performed strictly outside database transactions.

---

## 2. Multi-User RBAC & Permission Architecture

Access verification is enforced via `verifyBusinessAccess(userId, businessId)` in `src/lib/ownership.ts`:

### 2.1. Role Hierarchy (5 Roles)
1. **`owner`**:
   - Creator and ultimate legal administrator of the business.
   - Complete unfettered access. **Exclusive role** permitted to execute money movements (payouts, remittances), modify settlement accounts, or delete businesses.
2. **`manager`**:
   - Operational manager. Full CRUD on sales, expenses, invoices, team roster, and tax calculations.
   - Prohibited from withdrawing funds, remitting tax, or deleting businesses.
3. **`sales_staff`**:
   - Counter point-of-sale and invoicing staff.
   - **Row-Level Scoping**: Can only view and edit sales they created (`createdBy === userId`) or auto-captured DVA counter transactions (`dvaOrigin === true`).
   - Blocked from expenses, tax finalization, wallet, and settings.
4. **`accountant`**:
   - Bookkeeper. Full CRUD on expenses, invoices, debtor reconciliations, receipts, and tax calculations.
   - Blocked from creating sales, finalizing tax reports, and withdrawing money.
5. **`viewer`**:
   - Read-only access to dashboard metrics, reports, and transaction histories. Cannot create or edit transactions.

### 2.2. Permission Overrides & Caching
- Member records support granular boolean overrides stored in JSONB (`permissionOverrides`).
- Cached in-memory with a 60-second TTL (`accessCache`).
- Cache is invalidated immediately on role changes, member removal, or business updates.

### 2.3. Single-Owner Organization Boundary
- An owner can invite team members across multiple businesses they own.
- **Strict Boundary**: A team member can **never** be invited to or join a business owned by a *different* owner.
- Multi-owner invitation attempts are rejected at invite creation (400 `INVALID_INVITE_EMAIL` with anti-enumeration protection) and at token acceptance inside a transaction under row locks (`SELECT id FROM users WHERE id = ${userId} FOR UPDATE` returning 403 `ORGANIZATION_MISMATCH`).
- Seat Cap: Maximum 3 invited members per business. The owner is exempt from the cap.

---

## 3. Data Sensitivity & Encryption Standards

### 3.1. KYC Identity Data (BVN & NIN)
- **Encryption at Rest**: BVN and NIN values are encrypted using AES-256-GCM (`enc:v1:iv:tag:ciphertext`).
- **Blind Indexing**: To perform $O(1)$ unique lookups without decrypting the entire database, blind HMAC-SHA256 hashes (`bvnHash`, `ninHash`) are stored and indexed.
- **Log Masking**: Plaintext BVN and NIN must never appear in Winston logs, Sentry breadcrumbs, or error responses.

### 3.2. Transaction PIN & Lockout Protection
- Outbound withdrawals and settlement account alterations require a 4-digit PIN.
- Verified live via uncached database queries (`getWithdrawalActor()`).
- **Rate-Limiting & Lockout**:
  - Failed attempt increments `pinAttempts`.
  - 3 consecutive failed attempts triggers a mandatory 15-minute lockout (`pinLockedUntil`).
  - Subsequent requests are rejected with `423 PIN_LOCKED` until the cooldown expires.

---

## 4. Webhook Security (Paystack HMAC)

- Inbound Paystack webhooks (`/api/webhooks/paystack`) bypass JWT authentication but require cryptographic signature verification.
- Verified using `crypto.createHmac('sha512', secret).update(rawBody).digest('hex')` matched against the `x-paystack-signature` header.
- Handled idempotently using unique database transaction references.

---

## 5. Security Invariants & Actions Agents Must Never Take

1. **NEVER weaken or bypass authorization**: Do not remove role checks, ownership verifications, or permission gates to make tests pass.
2. **NEVER expose plaintext secrets**: Never commit API keys, private certificates, or JWT secrets to the repository.
3. **NEVER bypass Zod input validation**: All user-supplied input must be validated and sanitized.
4. **NEVER disable month-lock assertions**: `assertMonthNotLocked()` is mandatory for financial integrity.
5. **NEVER perform money movements for non-owners**: Endpoints handling payouts, withdrawals, or tax payments must reject all non-owner roles.
