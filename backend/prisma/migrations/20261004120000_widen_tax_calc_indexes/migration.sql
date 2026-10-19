-- DropIndex
DROP INDEX IF EXISTS "idx_sales_tax_calc";

-- CreateIndex
CREATE INDEX "idx_sales_tax_calc" ON "sales_transactions"("business_id", "status", "is_taxable", "transaction_date", "amount");

-- DropIndex
DROP INDEX IF EXISTS "idx_expense_tax_calc";

-- CreateIndex
CREATE INDEX "idx_expense_tax_calc" ON "expenses"("business_id", "is_deductible", "expense_date", "amount");
