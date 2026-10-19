# Feature Specification: Statutory Tax Engine & Period Closing

## 1. Objective & User Stories
Calculate monthly FIRS tax liabilities, generate statutory compliance reports, support Nil Return filings for unprofitable periods, enforce irreversible period closing locks, and facilitate online tax remittances via Paystack.

**User Stories:**
- As a business owner, I want my monthly tax liability calculated automatically from my sales and expenses so that I always know what I owe FIRS.
- As an accountant, I want to file a Nil Return when our business operates at a loss so that our tax status remains legally compliant without penalties.
- As a business owner, I want to finalize my monthly tax report and download an official FIRS tax statement PDF for my tax consultant and audits.

---

## 2. Tax Computation Formula & Rules

### 2.1. Statutory Formula
$$\text{Taxable Sales} = \sum \text{SalesTransaction.amount} \quad (\text{where } \text{status} \in [\text{'confirmed'}, \text{'completed'}] \land \text{isTaxable} = \text{true})$$
$$\text{Deductible Expenses} = \sum \text{Expense.amount} \quad (\text{for transactions within calendar month})$$
$$\text{Gross Profit} = \text{Taxable Sales} - \text{Deductible Expenses}$$
$$\text{Tax Payable} = \begin{cases} 7.5\% \times \text{Gross Profit} & \text{if } \text{Gross Profit} > 0 \\ 0.00 & \text{if } \text{Gross Profit} \le 0 \end{cases}$$

### 2.2. Intelligence & Anomaly Alerts
During live preview (`GET /businesses/:id/tax/calculate`):
- `no_expenses`: Fired when `totalExpenses === 0` and `totalSales > 0`, warning the user to log expenses to avoid overpaying tax.
- `margin_deviation`: Fired when `|actualMargin − expectedMargin| > 15%`, alerting users to potential missing revenue or unrecorded costs.

---

## 3. Period Finalization Gate & Nil Returns

1. **Finalize Report** (`POST /businesses/:id/tax/reports/finalize`):
   - Computes final totals and locks `MonthlyTaxReport.status = 'finalized'`.
   - Sets `isLocked = true`.
   - **Enacts Period Lock**: From this point on, any insert, update, or delete of sales, expenses, or invoices in this month throws `423 PERIOD_LOCKED`.
2. **Nil Return Submission** (`POST /businesses/:id/tax/reports/nil`):
   - Permitted when `grossProfit <= 0`.
   - Sets `isNil = true`, `taxPayable = 0.00`, `status = 'finalized'`, and `isLocked = true`.
   - Stores formal Nil Return declaration for FIRS audit trail.
3. **Paystack Remittance** (`POST /businesses/:id/tax/pay`):
   - Initializes Paystack transaction for the computed `taxPayable`.
   - Webhook `charge.success` updates `TaxPayment.status = 'success'` and `MonthlyTaxReport.status = 'paid'`.
4. **Statement Generation** (`GET /businesses/:id/statements/pdf`):
   - Streams an official A4 PDF tax statement generated via PDFKit with monthly revenue breakdown, expense breakdown, gross profit, and payment receipt status.

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] Formula computes exact 7.5% on positive gross profit with decimal precision.
- [ ] Negative gross profit computes 0.00 tax payable.
- [ ] Submitting a Nil Return locks the month and prevents retroactive mutations.
- [ ] Finalizing a report blocks any new sale creation with transaction date in that month (`423 PERIOD_LOCKED`).
