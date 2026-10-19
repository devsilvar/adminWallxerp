-- AlterTable
ALTER TABLE "customer_credits" ADD COLUMN     "linked_sale_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customer_credits_linked_sale_id_key" ON "customer_credits"("linked_sale_id");

-- CreateIndex
CREATE INDEX "customer_credits_linked_sale_id_idx" ON "customer_credits"("linked_sale_id");

-- AddForeignKey
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_linked_sale_id_fkey" FOREIGN KEY ("linked_sale_id") REFERENCES "sales_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;