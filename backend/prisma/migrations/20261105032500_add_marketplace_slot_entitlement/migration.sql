-- CreateEnum
CREATE TYPE "SlotPurchaseStatus" AS ENUM ('pending_proof', 'active', 'rejected', 'refunded');

-- AlterTable
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "marketplace_slot_allowance" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_slot_purchases" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "SlotPurchaseStatus" NOT NULL DEFAULT 'active',
    "paid_via" TEXT NOT NULL,
    "wallet_tx_ref" TEXT,
    "proof_url" TEXT,
    "purchased_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_slot_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_slot_purchases_wallet_tx_ref_key" ON "marketplace_slot_purchases"("wallet_tx_ref");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_slot_purchases_business_id_status_idx" ON "marketplace_slot_purchases"("business_id", "status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_slot_purchases_business_id_fkey'
    ) THEN
        ALTER TABLE "marketplace_slot_purchases" ADD CONSTRAINT "marketplace_slot_purchases_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
