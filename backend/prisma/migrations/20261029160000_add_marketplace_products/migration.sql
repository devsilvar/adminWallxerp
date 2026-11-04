-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('physical', 'service');

-- CreateEnum
CREATE TYPE "ProductListingStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'archived');

-- CreateTable
CREATE TABLE "marketplace_products" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'physical',
    "description" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "compare_at_price" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "stock_quantity" INTEGER DEFAULT 1,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact_phone" TEXT,
    "contact_whatsapp" TEXT,
    "purchase_url" TEXT,
    "status" "ProductListingStatus" NOT NULL DEFAULT 'draft',
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_products_slug_key" ON "marketplace_products"("slug");

-- CreateIndex
CREATE INDEX "marketplace_products_attributes_idx" ON "marketplace_products" USING GIN ("attributes");

-- CreateIndex
CREATE INDEX "marketplace_products_business_id_idx" ON "marketplace_products"("business_id");

-- CreateIndex
CREATE INDEX "marketplace_products_status_created_at_idx" ON "marketplace_products"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "marketplace_products_category_idx" ON "marketplace_products"("category");

-- CreateIndex
CREATE INDEX "marketplace_products_slug_idx" ON "marketplace_products"("slug");

-- AddForeignKey
ALTER TABLE "marketplace_products" ADD CONSTRAINT "marketplace_products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
