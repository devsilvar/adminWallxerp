-- AlterTable
ALTER TABLE "marketplace_slot_purchases" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_slot_purchases_idempotency_key_key" ON "marketplace_slot_purchases"("idempotency_key");
