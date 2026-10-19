-- CreateIndex
CREATE INDEX "idx_sales_unverified_queue" ON "sales_transactions"("needs_verification", "transaction_date" DESC);
