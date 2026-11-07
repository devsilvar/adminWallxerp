-- AlterTable
ALTER TABLE "marketplace_products"
  ADD COLUMN IF NOT EXISTS "discount_active" BOOLEAN
  GENERATED ALWAYS AS ("compare_at_price" IS NOT NULL AND "compare_at_price" > "price") STORED;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_products_discount_active_idx" ON "marketplace_products"("discount_active");
