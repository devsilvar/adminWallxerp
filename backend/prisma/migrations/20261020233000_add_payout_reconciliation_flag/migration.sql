-- AlterTable
ALTER TABLE "settlement_payouts" ADD COLUMN IF NOT EXISTS "needs_reconciliation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settlement_payouts" ADD COLUMN IF NOT EXISTS "reconciliation_reason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_settlement_payouts_needs_reconciliation" ON "settlement_payouts"("needs_reconciliation");
