-- CreateEnum
CREATE TYPE "MarketplaceEventType" AS ENUM ('view', 'whatsapp_click', 'call_click', 'share_click', 'storefront_view', 'boost_impression');

-- AlterTable
ALTER TABLE "marketplace_products" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contact_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_contacted_at" TIMESTAMP(3),
ADD COLUMN "expires_at" TIMESTAMP(3),
ADD COLUMN "sold_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "marketplace_listing_events" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "event_type" "MarketplaceEventType" NOT NULL,
    "session_hash" TEXT,
    "source" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_listing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_listing_events_product_id_event_type_session_ha_key" ON "marketplace_listing_events"("product_id", "event_type", "session_hash");

-- CreateIndex
CREATE INDEX "marketplace_listing_events_product_id_event_type_occurred_a_idx" ON "marketplace_listing_events"("product_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "marketplace_listing_events_business_id_occurred_at_idx" ON "marketplace_listing_events"("business_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "marketplace_listing_events" ADD CONSTRAINT "marketplace_listing_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "marketplace_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
