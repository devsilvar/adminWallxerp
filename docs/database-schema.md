# Database Schema & Entity Documentation

## 1. Overview & Migration Policy

The PayMyTax persistence tier runs on PostgreSQL 16+ via Prisma ORM (`backend/prisma/schema.prisma`). All database modifications must occur via Prisma migrations (`npm run prisma:migrate`).

**Migration Invariants:**
- Never edit applied migration files in `prisma/migrations/`.
- Never run manual DDL or DML statements directly against production without an accompanying migration script.
- All monetary columns use `@db.Decimal(12, 2)` or `@db.Decimal(15, 2)` to prevent floating-point inaccuracies.
- Physical disaster recovery backups (`npm run db:backup`) export full snapshots with schema integrity validations.

---

## 2. Core Entities & Relationships

### 2.1. User & Authentication
- **`User` (`users`)**:
  - Primary identity record for business owners, invited staff, and system administrators (`role: user | admin`).
  - **KYC & Encryption**: `bvn` and `nin` are encrypted at rest using AES-256-GCM (`enc:v1:iv:tag:ciphertext`). Blind indices `bvnHash` and `ninHash` (HMAC-SHA256) provide indexed $O(1)$ uniqueness lookups.
  - **Transaction PIN**: 4-digit bcrypt-hashed PIN (`transactionPin`), tracking `pinAttempts`, `pinLockedUntil` (cooldown lock), and reset timestamps.
  - **Settlement Account**: Stores verified commercial bank details (`settlementBankCode`, `settlementAccountNumber`, `settlementAccountName`) and `autoPayoutEnabled`.
  - Relations: Owns `Business[]`, `AuditLog[]`, `Session[]`, `WalletBalance`, `WalletTransaction[]`, `BusinessMember[]` (memberships).

### 2.2. Businesses & Multi-Tenancy
- **`Business` (`businesses`)**:
  - Tenant boundary for financial operations (`userId` FK to `User`).
  - **DVA Configuration**: `paystackCustomerCode`, `virtualAccountNumber`, `virtualAccountBank`, and `dvaFailureReason`.
  - **Tax Settings**: `defaultProfitMargin` (Decimal, default 20.00), `taxReminderDay` (Int, default 25), `taxSplitPercentage` (default 7.50).
  - Relations: Has many `SalesTransaction`, `Expense`, `Invoice`, `CustomerCredit`, `MonthlyTaxReport`, `BusinessMember`, `Invitation`.

### 2.3. Team & Access Control (RBAC)
- **`BusinessMember` (`business_members`)**:
  - Links a `User` to a `Business` with an operational role (`owner`, `manager`, `sales_staff`, `accountant`, `viewer`).
  - `permissionOverrides`: JSONB object holding granular boolean permission flags.
  - Unique constraint: `@@unique([businessId, userId])`.
- **`Invitation` (`invitations`)**:
  - 32-byte cryptographically secure hex token (`token`), 7-day expiration (`expiresAt`), status (`pending`, `accepted`, `declined`, `revoked`, `expired`).
  - Bounded by owner organization: An invitee cannot belong to another owner's organization.

### 2.4. Sales & Bulk Ingestion
- **`SalesTransaction` (`sales_transactions`)**:
  - Records gross revenue across channels (`source: manual | bank_transfer | pos | online_store | credit`).
  - Status: `pending`, `confirmed`, `completed`, `failed`, `cancelled`.
  - **Accrual & Taxable Flags**: `isTaxable` (Boolean, default true). Reclassified to `false` when a bank transfer is reconciled against an existing credit debtor.
  - `referenceId`: Unique payment/credit reference. Unique index: `@@unique([businessId, source, referenceId], name: "unique_sales_reference")`.
- **`SaleLineItem` (`sale_line_items`)**:
  - Child items on a transaction: `itemName`, `quantity`, `unitPrice`, `totalPrice`.

### 2.5. Expenses & Deductions
- **`Expense` (`expenses`)**:
  - Deductible business costs (`amount`, `expenseDate`, `category`, `description`, `receiptUrl`).
  - **Bad Debt Protection**: System-generated bad debt write-offs (`category = 'bad_debt'`) carry an immutable lock preventing arbitrary manual edits.
  - Linked to `MonthlyTaxReport` via period date scoping.

### 2.6. Invoicing
- **`Invoice` (`invoices`)**:
  - Sequenced per-business: `invoiceNumber` (`INV-{YYYY}-{NNN}`). Unique constraint: `@@unique([businessId, invoiceNumber])`.
  - Financials: `subtotal`, `discountAmount`, `taxableAmount`, `vatRate`, `vatAmount`, `total`.
  - Snapshotted customer info: `customerName`, `customerEmail`, `customerPhone`, `customerAddress`, `customerTaxId`.
  - `status`: `draft`, `sent`, `paid`, `overdue`, `cancelled`.
  - `linkedSaleId`: Optional unique FK to `SalesTransaction` created atomically upon settlement.
- **`InvoiceLine` (`invoice_lines`)**: Line items (`description`, `quantity`, `unitPrice`, `amount`).
- **`Customer` (`customers`)**: Reusable client directory with phone, email, and tax ID.

### 2.7. Credit Sales & Debtors (Accrual Accounting)
- **`CustomerCredit` (`customer_credits`)**:
  - Tracks debt obligations (`totalAmount`, `balance`, `issueDate`, `dueDate`, `status: unpaid | partially_paid | paid | overdue | written_off`).
  - `linkedSaleId`: FK to the revenue `SalesTransaction` created at credit issuance.
- **`CreditPayment` (`credit_payments`)**:
  - Repayment installments (`amount`, `paymentDate`, `paymentMethod`, `notes`).
  - Crucial invariant: Manual repayments have `linkedSaleId = null` and NEVER create a new `SalesTransaction`.
- **`CreditLineItem` (`credit_line_items`)**: Line items attached to credit contracts.

### 2.8. Tax Reports & Periods
- **`MonthlyTaxReport` (`monthly_tax_reports`)**:
  - Aggregate tax filings for a given calendar month (`year`, `month`, `status: draft | pending | finalized | paid`).
  - Metrics: `totalSales`, `totalExpenses`, `grossProfit`, `taxRate`, `taxPayable`.
  - `isNil`: True when filing a formal Nil Return (gross profit $\le 0$).
  - `isLocked`: True when period closing is enacted. Prevents retrospective modifications.
  - Unique constraint: `@@unique([businessId, year, month])`.
- **`TaxPayment` (`tax_payments`)**:
  - Settlement records initiated via Paystack (`reference`, `amount`, `status: pending | success | failed`).

### 2.9. Central Wallet & Solvency
- **`WalletBalance` (`wallet_balances`)**:
  - User-scoped central balance (`userId` unique FK).
  - Tracks `availableBalance`, `ledgerBalance`, `lockedBalance`.
- **`WalletTransaction` (`wallet_transactions`)**:
  - Immutable audit trail of fund movements (`type: inflow | payout | fee | reversal`, `amount`, `balanceBefore`, `balanceAfter`, `reference`).

---

## 3. Critical Constraints & Indexes

1. **`unique_sales_reference`**: `(businessId, source, referenceId)` prevents duplicate transaction capture from replayed webhooks or concurrent imports.
2. **`unique_business_invoice_number`**: `(businessId, invoiceNumber)` guarantees monotonic numbering without collisions.
3. **`unique_monthly_tax_report`**: `(businessId, year, month)` restricts each business to exactly one statutory report per calendar month.
4. **`bvnHash` & `ninHash` Indexes**: Blind HMAC hashes enable $O(1)$ unique lookups while keeping plaintext identity values encrypted.
