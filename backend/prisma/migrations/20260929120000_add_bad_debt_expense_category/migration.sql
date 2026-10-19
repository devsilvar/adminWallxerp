-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'bad_debt';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "linked_credit_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "expenses_linked_credit_id_key" ON "expenses"("linked_credit_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_linked_credit_id_fkey" FOREIGN KEY ("linked_credit_id") REFERENCES "customer_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
