-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VoucherRequestStatus') THEN
    CREATE TYPE "VoucherRequestStatus" AS ENUM ('pending', 'awaiting_customer', 'verified', 'rejected', 'expired', 'applied');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VoucherRequestKind') THEN
    CREATE TYPE "VoucherRequestKind" AS ENUM ('top_up', 'adjustment');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "voucher_adjustment_threshold" DECIMAL(15,2) NOT NULL DEFAULT 50000.00;

-- Drop voucher_requires_approval if it was ever added by prior draft
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "voucher_requires_approval";

-- CreateTable
CREATE TABLE IF NOT EXISTS "voucher_ledger_requests" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "card_id" TEXT,
    "kind" "VoucherRequestKind" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "bonus_pct" DECIMAL(5,2),
    "bonus_amount" DECIMAL(15,2),
    "status" "VoucherRequestStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'crm',
    "created_by" TEXT NOT NULL,
    "authorized_by" TEXT,
    "authorized_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "verification_token_hash" TEXT,
    "verification_expires_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "customer_name" TEXT NOT NULL,
    "notes" TEXT,
    "ledger_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_ledger_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_ledger_requests_ledger_id_key" ON "voucher_ledger_requests"("ledger_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_ledger_requests_business_id_status_created_at_idx" ON "voucher_ledger_requests"("business_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_ledger_requests_business_id_kind_status_idx" ON "voucher_ledger_requests"("business_id", "kind", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_ledger_requests_customer_id_idx" ON "voucher_ledger_requests"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voucher_ledger_requests_verification_token_hash_idx" ON "voucher_ledger_requests"("verification_token_hash");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_ledger_requests_business_id_fkey') THEN
    ALTER TABLE "voucher_ledger_requests" ADD CONSTRAINT "voucher_ledger_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_ledger_requests_customer_id_fkey') THEN
    ALTER TABLE "voucher_ledger_requests" ADD CONSTRAINT "voucher_ledger_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_ledger_requests_card_id_fkey') THEN
    ALTER TABLE "voucher_ledger_requests" ADD CONSTRAINT "voucher_ledger_requests_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "customer_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_ledger_requests_ledger_id_fkey') THEN
    ALTER TABLE "voucher_ledger_requests" ADD CONSTRAINT "voucher_ledger_requests_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "customer_card_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
