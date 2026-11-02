-- AlterTable
ALTER TABLE "sales_transactions" ADD COLUMN IF NOT EXISTS "settled_at" TIMESTAMP(3);

-- Backfill legacy DVA sales: already settled, withdrawable immediately
UPDATE "sales_transactions"
SET "settled_at" = "created_at"
WHERE "dva_origin" = true AND "settled_at" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sales_settled_at" ON "sales_transactions"("settled_at");
