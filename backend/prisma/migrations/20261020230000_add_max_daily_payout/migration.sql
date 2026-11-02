-- AlterTable
ALTER TABLE "platform_fee_configs" ADD COLUMN IF NOT EXISTS "max_daily_payout" DECIMAL(10,2) NOT NULL DEFAULT 500000.00;
