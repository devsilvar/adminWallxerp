-- 1. add auto_payout_enabled to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_payout_enabled" BOOLEAN NOT NULL DEFAULT false;

-- 2. backfill: auto iff ANY business was (the B3 cascade made divergence meaningless)
UPDATE "users" u SET auto_payout_enabled = true
WHERE EXISTS (SELECT 1 FROM "businesses" b WHERE b.user_id = u.id AND b.auto_payout_enabled = true);

-- 3. drop auto_payout_enabled from businesses
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "auto_payout_enabled";

-- 4. SWEEP-03: default auto_sweep_enabled to false on platform_fee_configs and reset existing default row
ALTER TABLE "platform_fee_configs" ALTER COLUMN "auto_sweep_enabled" SET DEFAULT false;
UPDATE "platform_fee_configs" SET "auto_sweep_enabled" = false WHERE id = 'default';
