-- Repair migration: schema.prisma drifted ahead of migrations for the
-- subscription / feedback / AI-log feature. These objects existed only in
-- dev (added manually) and were never in a migration, so prod queries
-- failed with P2022 (missing column). Fully idempotent.

-- 1. SubscriptionPaymentStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionPaymentStatus') THEN
    CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'approved'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubscriptionPaymentStatus')) THEN
    ALTER TYPE "SubscriptionPaymentStatus" ADD VALUE 'approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rejected'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubscriptionPaymentStatus')) THEN
    ALTER TYPE "SubscriptionPaymentStatus" ADD VALUE 'rejected';
  END IF;
END $$;

-- 2. users subscription columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_tier" TEXT DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);

-- 3. subscription_submissions
CREATE TABLE IF NOT EXISTS "subscription_submissions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "business_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "business_name" TEXT,
  "plan" TEXT NOT NULL,
  "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
  "amount" DECIMAL(15,2) NOT NULL,
  "notes" TEXT,
  "receipt_url" TEXT,
  "receipt_file_name" TEXT,
  "receipt_mime" TEXT,
  "receipt_path" TEXT,
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_submissions_pkey" PRIMARY KEY ("id")
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'subscription_submissions'::regclass AND conname = 'subscription_submissions_user_id_fkey') THEN
    ALTER TABLE "subscription_submissions" ADD CONSTRAINT "subscription_submissions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'subscription_submissions'::regclass AND conname = 'subscription_submissions_business_id_fkey') THEN
    ALTER TABLE "subscription_submissions" ADD CONSTRAINT "subscription_submissions_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "subscription_submissions_status_created_at_idx" ON "subscription_submissions"("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "subscription_submissions_user_id_idx" ON "subscription_submissions"("user_id");
CREATE INDEX IF NOT EXISTS "subscription_submissions_email_idx" ON "subscription_submissions"("email");

-- 4. user_feedbacks
CREATE TABLE IF NOT EXISTS "user_feedbacks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "business_id" TEXT,
  "user_name" TEXT,
  "user_email" TEXT,
  "rating" INTEGER NOT NULL,
  "sentiment" TEXT,
  "tags" TEXT[],
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_feedbacks_pkey" PRIMARY KEY ("id")
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_feedbacks'::regclass AND conname = 'user_feedbacks_user_id_fkey') THEN
    ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_feedbacks'::regclass AND conname = 'user_feedbacks_business_id_fkey') THEN
    ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "user_feedbacks_rating_idx" ON "user_feedbacks"("rating");
CREATE INDEX IF NOT EXISTS "user_feedbacks_created_at_idx" ON "user_feedbacks"("created_at" DESC);

-- 5. ai_query_logs
CREATE TABLE IF NOT EXISTS "ai_query_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "business_id" TEXT,
  "query_text" TEXT NOT NULL,
  "response_length" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_query_logs_pkey" PRIMARY KEY ("id")
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_query_logs'::regclass AND conname = 'ai_query_logs_user_id_fkey') THEN
    ALTER TABLE "ai_query_logs" ADD CONSTRAINT "ai_query_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_query_logs'::regclass AND conname = 'ai_query_logs_business_id_fkey') THEN
    ALTER TABLE "ai_query_logs" ADD CONSTRAINT "ai_query_logs_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "ai_query_logs_user_id_created_at_idx" ON "ai_query_logs"("user_id", "created_at");
