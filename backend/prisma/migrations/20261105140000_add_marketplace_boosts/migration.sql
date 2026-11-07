-- CreateEnum
CREATE TYPE "BoostPlan" AS ENUM ('week', 'fortnight', 'month');

-- CreateEnum
CREATE TYPE "BoostStatus" AS ENUM ('waitlisted', 'active', 'expired', 'refunded', 'paused');

-- AlterTable
ALTER TABLE "marketplace_products" ADD COLUMN "boost_ends_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "marketplace_boosts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "plan" "BoostPlan" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "BoostStatus" NOT NULL DEFAULT 'active',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "wallet_tx_ref" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_boosts_wallet_tx_ref_key" ON "marketplace_boosts"("wallet_tx_ref");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_boosts_idempotency_key_key" ON "marketplace_boosts"("idempotency_key");

-- CreateIndex
CREATE INDEX "marketplace_boosts_product_id_status_ends_at_idx" ON "marketplace_boosts"("product_id", "status", "ends_at");

-- CreateIndex
CREATE INDEX "marketplace_boosts_business_id_created_at_idx" ON "marketplace_boosts"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "marketplace_boosts_status_ends_at_idx" ON "marketplace_boosts"("status", "ends_at");

-- CreateIndex
CREATE INDEX "marketplace_products_boost_ends_at_idx" ON "marketplace_products"("boost_ends_at");

-- AddForeignKey
ALTER TABLE "marketplace_boosts" ADD CONSTRAINT "marketplace_boosts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "marketplace_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_boosts" ADD CONSTRAINT "marketplace_boosts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
