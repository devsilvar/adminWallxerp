# Product Requirements Document (PRD)

## 1. Executive Summary & Objective

**PayMyTax by WallX** (WallXERP) is a comprehensive Financial Operating System and Tax Compliance Platform purpose-built for Nigerian Micro, Small, and Medium Enterprises (MSMEs). 

In Nigeria, SMEs face punitive penalties and aggressive audits from the Federal Inland Revenue Service (FIRS) / Nigeria Revenue Service (NRS) and State Internal Revenue Services (SIRS) due to poor bookkeeping, commingled personal/business bank accounts, manual credit tracking, and ignorance of statutory tax rules. PayMyTax bridges this gap by unifying transaction capture, automated accrual bookkeeping, credit debtor tracking, electronic invoicing, treasury auto-settlement, and automated tax reporting under a single platform.

---

## 2. Target Personas & Users

1. **Sole Proprietor / Retail Merchant**:
   - Manages retail store, supermarket, or pharmacy with high-volume counter cash and bank transfer sales.
   - Primary need: Instant payment verification via Dedicated Virtual Accounts (DVA), automated debtor tracking, and zero-headache tax filing.
2. **Growing SME Owner (Multi-Staff)**:
   - Manages 1 to 5 staff across sales, bookkeeping, and warehouse operations.
   - Primary need: Delegating counter-sales and invoice generation to staff without exposing company bank balances, owner withdrawal PINs, or tax remittances.
3. **Internal / External Accountant**:
   - Compiles monthly income, reconciles bank transfers, audits expenses, and generates tax schedules.
   - Primary need: Audit trails, accurate expense deductibility classification, PDF tax statements, and period-closing lockouts.
4. **Platform Administrator**:
   - Monitors system health, manages platform fees, verifies flagged unverified inflows, and configures AI provider credentials.

---

## 3. Major Workflows & Core Features

### 3.1. Transaction Ingestion & DVA Auto-Capture
- **Dedicated Virtual Accounts (DVA)**: Automated generation of Paystack virtual accounts tied to the business. Inbound bank transfers trigger webhooks that instantly log confirmed sales.
- **Counter Cash & Direct Sales**: Rapid point-of-sale recording with line items, units, and payment methods.
- **Bulk Import**: Drag-and-drop Excel/CSV import supporting dynamic header normalization, batch duplicate detection, and transaction date validation.

### 3.2. Accrual-Basis Credit Sales & Debtors Management
- **Accrual Recognition**: Issue credit sales recognizing revenue immediately on the date of goods delivery.
- **Debtor Tracking**: Real-time receivable balances, payment milestones, and automated debtor reminder emails with calendar-day rate limits.
- **Statutory Bad Debt Write-Off**: Deduct uncollectible debt as allowable bad debt expenses under CITA §25 without altering historical revenue records.

### 3.3. Invoicing Lifecycle
- **Drafting & Numbering**: Sequential invoice IDs (`INV-{YYYY}-{NNN}`), per-line VAT and discounts, and snapshot customer data.
- **Multi-Channel Dispatch**: Downloadable A4 PDF invoices, electronic email dispatch with PDF attachments via Resend, and pre-formatted WhatsApp deep links.
- **Mark as Paid**: Atomic settlement linking payments to `SalesTransaction` records with period-lock guards.

### 3.4. Tax Calculation, Period Closing & Remittance
- **Statutory Tax Engine**: Monthly tax liability computed as `Tax Payable = 7.5% × (Taxable Sales − Deductible Expenses)`.
- **Nil Return Filing**: Formal zero-tax filing when gross profit is zero or negative.
- **Period Finalization & Locking**: Irreversible period closure protecting historical months against retrospective modification.
- **Direct Paystack Remittance**: Instant payment initiation with webhook reconciliation and tamper-evident PDF tax receipts.

### 3.5. Multi-User RBAC & Organization Boundary
- **5 Granular Roles**: `owner`, `manager`, `sales_staff`, `accountant`, `viewer`.
- **Single-Owner Organization Boundary**: Members can only belong to businesses owned by the same business owner. Cross-owner invitations are strictly blocked.
- **Cap Enforcement**: Maximum 3 invited staff seats per business (exempting the owner).

### 3.6. Central Wallet, 2-Tier PIN & Treasury Auto-Sweep
- **Unified User Wallet**: Multi-business sales aggregate into a secure master wallet.
- **Security**: 4-digit bcrypt-hashed withdrawal PIN with 3-attempt lockout (15-minute cooldown) and encrypted BVN/NIN identity verification.
- **Solvency Oracle & Auto-Sweep**: Nightly automated transfer sweeps to verified commercial bank accounts protected by live ledger solvency verification.

---

## 4. Business Rules & Financial Invariants

1. **Rule 1 (Period Immutability)**: Once a monthly tax report is finalized or marked locked, NO sales, expenses, invoices, credits, or write-offs can be added, updated, or deleted within that UTC calendar month.
2. **Rule 2 (Accrual Revenue)**: Debt collection is a balance sheet event, not an income statement event. Repayments MUST NEVER create a new `SalesTransaction`.
3. **Rule 3 (DVA Repayment Reclassification)**: When a counter bank transfer auto-captured by DVA is reconciled against an existing credit debtor, its taxable flag MUST flip to `isTaxable = false` to eliminate double-taxation.
4. **Rule 4 (Owner-Only Money Guards)**: Payout requests, tax remittance, settlement bank changes, and business deletions are reserved strictly for the authenticated `owner`.
5. **Rule 5 (Solvency Check)**: A payout or sweep is only authorized if `Live Wallet Balance >= Payout Amount + Platform Fee`.

---

## 5. Non-Goals (Out of Scope for v1.0)

- **Payroll / PAYE Tax Calculation**: Automated employee PAYE deduction and state remittance schedules are reserved for v2.0.
- **Inventory Stock Reordering**: Stock level tracking is limited to invoice/credit line item counts; full warehouse replenishment automation is out of scope.
- **Multi-Currency Support**: All platform calculations and balances are strictly in Nigerian Naira (NGN, ₦). Foreign currency conversions are not supported.

---

## 6. Acceptance Criteria

- **AC-1**: All calculations preserve decimal accuracy without floating-point drift.
- **AC-2**: A business cannot issue or modify transactions in a locked tax period.
- **AC-3**: Team invitations strictly adhere to the single-owner boundary and 3-seat seat cap.
- **AC-4**: Inbound webhooks must be cryptographically verified using Paystack HMAC-SHA512 signatures and operate idempotently.
- **AC-5**: Payouts must require live PIN verification and update ledger records atomically inside database transactions.
