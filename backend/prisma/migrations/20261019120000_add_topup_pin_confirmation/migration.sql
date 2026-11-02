-- AlterTable
ALTER TABLE "voucher_ledger_requests"
  ADD COLUMN "confirmed_pin_matched" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "pin_confirmed_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "voucher_ledger_requests_business_status_verified_at_idx"
  ON "voucher_ledger_requests" ("business_id", "status", "verified_at" DESC);
