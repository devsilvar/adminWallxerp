-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE IF NOT EXISTS 'advance';

-- AlterTable
ALTER TABLE "settlement_payouts" ADD COLUMN IF NOT EXISTS "is_advance" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "settlement_payouts_business_id_is_advance_payment_status_idx" ON "settlement_payouts"("business_id", "is_advance", "payment_status");
CREATE INDEX IF NOT EXISTS "settlement_payouts_is_advance_payment_status_created_at_idx" ON "settlement_payouts"("is_advance", "payment_status", "created_at" DESC);

-- AlterTable
ALTER TABLE "platform_fee_configs" ADD COLUMN IF NOT EXISTS "advance_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 1.00;
ALTER TABLE "platform_fee_configs" ADD COLUMN IF NOT EXISTS "advance_fee_cap" DECIMAL(10,2) NOT NULL DEFAULT 500.00;
ALTER TABLE "platform_fee_configs" ADD COLUMN IF NOT EXISTS "max_advance_pct" DECIMAL(5,2) NOT NULL DEFAULT 30.00;
ALTER TABLE "platform_fee_configs" ADD COLUMN IF NOT EXISTS "min_advance_amount" DECIMAL(10,2) NOT NULL DEFAULT 1000.00;
