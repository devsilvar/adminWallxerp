# Feature Specification: Sales Capture, Bulk Import & DVA Auto-Capture

## 1. Objective & User Stories
Provide SME merchants with multi-channel sales capture: direct counter sales, automated Paystack Dedicated Virtual Account (DVA) bank transfer capture, and high-throughput Excel/CSV bulk import.

**User Stories:**
- As a cashier/merchant, I want to record cash and POS counter sales with itemized line items so that gross revenue is logged in real time.
- As a business owner, I want counter bank transfers to credit automatically via a dedicated bank account number so that staff don't have to verify screenshots or fake SMS alerts.
- As an accountant, I want to upload monthly sales spreadsheets in Excel/CSV format with validation checks so that historical sales are ingested in seconds.

---

## 2. Functional Requirements & Workflows

### 2.1. Dedicated Virtual Account (DVA) Auto-Capture
1. **Onboarding**: Owner configures KYC (BVN/NIN), requests a DVA via Paystack.
2. **Account Assignment**: Paystack assigns a dedicated account number (Wema Bank / Titan Trust) tied to the merchant.
3. **Inflow Ingestion**: Customer transfers funds to the account. Paystack fires `charge.success` / `transfer.success` webhook.
4. **Automated Sale Creation**: The webhook handler:
   - Verifies HMAC-SHA512 signature.
   - Extracts transfer amount, customer name, and bank transaction reference.
   - Atomically inserts a `SalesTransaction` row (`source: bank_transfer`, `status: confirmed`, `isTaxable: true`, `dvaOrigin: true`).
   - Increments the user's `WalletBalance.availableBalance`.
   - Logs an audit entry.

### 2.2. Bulk Sales Import (Excel / CSV)
1. **Dynamic Template Generation** (`GET /sales/import/template`): Streams a styled `.xlsx` template with validated source dropdowns based on `SALES_IMPORT_SOURCES`.
2. **Preview & Validation** (`POST /sales/import/preview`):
   - Accepts `.xlsx` or `.csv` (2MB max, up to 100 rows).
   - Normalizes messy date strings (Excel numeric timestamps, ISO, `DD/MM/YYYY`).
   - Cleans currency symbols (`₦`, `NGN`, commas).
   - Flags row statuses: `valid`, `invalid`, `duplicate_in_file`, `duplicate_in_db`, or `locked` (if transaction date falls into a locked tax month).
   - Caches parsed rows under a 15-minute `fileToken`.
3. **Commit** (`POST /sales/import/commit`): Re-checks month-locks and commits rows via `prisma.salesTransaction.createMany({ skipDuplicates: true })`.

---

## 3. Business Rules & Edge Cases
- **Duplicate Prevention**: Database constraint `unique_sales_reference` on `(businessId, source, referenceId)` prevents duplicate sales.
- **Month Lock**: Any sales record with a transaction date in a finalized or locked tax period is rejected (`423 PERIOD_LOCKED`).
- **Staff Scoping**: Users with `sales_staff` role can only see sales they authored (`createdBy === userId`) or counter DVA transactions (`dvaOrigin === true`).

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] DVA webhook creates a confirmed sale and credits wallet atomically.
- [ ] Replayed DVA webhooks do not create duplicate sales records (idempotent).
- [ ] Bulk import preview correctly parses Excel dates and flags rows in locked periods.
- [ ] Sales commit rejects invalid tokens or expired files.
