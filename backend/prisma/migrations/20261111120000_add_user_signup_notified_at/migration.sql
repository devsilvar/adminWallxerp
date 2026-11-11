-- AlterTable: track whether the internal new-signup notification has been dispatched.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_notified_at" TIMESTAMP(3);

-- Backfill guard: every account that already exists when this ships must NOT be
-- re-announced to the internal recipient list. Stamping them as "already
-- notified" means the cron sweep only ever picks up genuinely new sign-ups.
UPDATE "users" SET "signup_notified_at" = NOW() WHERE "signup_notified_at" IS NULL;
