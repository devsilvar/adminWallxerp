-- Add BVN/NIN fields to users table.
-- This directory is a no-op recovery stub: the idempotent twin
-- 20260624120000_add_user_kyc_fields applies these first (sorts earlier).
-- Kept idempotent so it can never 42701 on any database.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bvn" VARCHAR(11);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nin" VARCHAR(11);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bvn_verified_at" TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nin_verified_at" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "users_bvn_idx" ON "users"("bvn") WHERE "bvn" IS NOT NULL;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_bvn_length";
ALTER TABLE "users" ADD CONSTRAINT "check_bvn_length"
  CHECK (bvn IS NULL OR length(bvn) = 11);
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_nin_length";
ALTER TABLE "users" ADD CONSTRAINT "check_nin_length"
  CHECK (nin IS NULL OR length(nin) = 11);
