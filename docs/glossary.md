# Domain Glossary & Terminology

This glossary defines standard terminology used across PayMyTax. Agents and engineers must use these definitions consistently across code, schemas, and specifications.

---

## 1. Tax & Regulatory Concepts

- **FIRS (Federal Inland Revenue Service)**: The primary federal tax administration authority in Nigeria (transitioning to the Nigeria Revenue Service / NRS).
- **CITA (Companies Income Tax Act)**: Primary statutory tax law governing corporate entities in Nigeria.
- **CITA §25 (Bad Debt Deduction)**: Section permitting businesses to deduct bona fide debts proven to have become irrecoverable during the fiscal year as allowable deductions against gross profit.
- **Gross Profit**: The baseline financial profit calculated as `Total Taxable Sales − Allowable Business Expenses`.
- **Statutory Tax Payable**: In PayMyTax, calculated as `7.5% × Gross Profit` (when Gross Profit > 0).
- **Nil Return**: An official tax filing declaring zero taxable profit or a loss for the period, ensuring the SME remains legally compliant without owing tax liability.
- **Period Closing / Month Lock**: The irreversible locking of a calendar month once a tax report is finalized. Prevents retrospective modifications to sales, expenses, and invoices.

---

## 2. Accounting & Invoicing Concepts

- **Accrual-Basis Accounting**: Accounting method where revenue is recognized when goods/services are delivered (credit sale issued), rather than when payment is received.
- **Debtor / Customer Credit**: A contractual receivable obligation owed by a buyer for goods or services delivered on credit.
- **Debt Repayment**: A collection of cash reducing an outstanding debtor balance. **Crucial rule**: Debt collections do NOT create new revenue or sales records.
- **Bad Debt Write-Off**: The formal cancellation of an uncollectible debtor obligation, atomically creating an allowable `bad_debt` expense.
- **Invoice**: A sequential commercial document (`INV-{YYYY}-{NNN}`) requesting payment from a customer. Can exist in `draft`, `sent`, `paid`, `overdue`, or `cancelled` status.
- **VAT-Exclusive (FIRS Standard)**: Displaying VAT as a distinct line item on top of the taxable subtotal, rather than embedding it silently in item prices.

---

## 3. Banking & Treasury Concepts

- **DVA (Dedicated Virtual Account)**: A permanent Nigerian bank account number generated via Paystack tied to a specific business or user for automated counter-payment reconciliation.
- **Auto-Sweep**: A scheduled nightly background job transferring accumulated sales wallet balances into the owner's verified commercial settlement account.
- **Solvency Oracle (`assertSolvency`)**: A live database verification ensuring that a proposed outbound transfer does not exceed the user's live available ledger balance minus platform fees.
- **Settlement Account**: A verified commercial bank account owned by the SME owner where withdrawn or auto-swept funds are deposited.
- **Blind Index**: An HMAC-SHA256 hash of a sensitive value (such as BVN or NIN) used to perform fast unique lookups without decrypting ciphertext.

---

## 4. Multi-Tenancy & Access Control Concepts

- **Business Owner**: The primary user who registered the business entity. Holds unfettered authority including money movements and business deletion.
- **Single-Owner Organization Boundary**: The architectural rule stipulating that an owner may invite members across their own businesses, but an invited staff member can NEVER belong to businesses owned by different owners.
- **3-Seat Team Cap**: The statutory quota allowing a business owner to invite up to 3 operational staff members per business (owner is exempt from the count).
- **Row-Level Scoping**: Data access restriction ensuring staff members (such as `sales_staff`) only observe transactions they authored or counter DVA transactions.
