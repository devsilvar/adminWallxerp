-- Emergency Database Fix Script
-- Run this to add missing columns from payout lock migration

-- This adds the columns that the app is looking for but are missing in your database

BEGIN;

-- Add payout change lock columns to Business table (if they don't exist)
DO $$ 
BEGIN
    -- Check and add payout_change_permitted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'payout_change_permitted'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "payout_change_permitted" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Added payout_change_permitted column';
    END IF;

    -- Check and add payout_change_permitted_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'payout_change_permitted_at'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "payout_change_permitted_at" TIMESTAMP(3);
        RAISE NOTICE 'Added payout_change_permitted_at column';
    END IF;

    -- Check and add payout_change_permitted_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'payout_change_permitted_by'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "payout_change_permitted_by" TEXT;
        RAISE NOTICE 'Added payout_change_permitted_by column';
    END IF;

    -- Check and add payout_change_used_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'payout_change_used_at'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "payout_change_used_at" TIMESTAMP(3);
        RAISE NOTICE 'Added payout_change_used_at column';
    END IF;
END $$;

-- Add index if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'Business_payout_change_permitted_by_idx'
    ) THEN
        CREATE INDEX "Business_payout_change_permitted_by_idx" ON "Business"("payout_change_permitted_by");
        RAISE NOTICE 'Added payout_change_permitted_by index';
    END IF;
END $$;

-- Verify the columns now exist
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'Business' 
    AND column_name IN (
        'payout_change_permitted',
        'payout_change_permitted_at',
        'payout_change_permitted_by',
        'payout_change_used_at'
    )
ORDER BY column_name;

COMMIT;

-- SUCCESS MESSAGE
SELECT '✅ Database schema updated successfully! Restart your backend server.' AS message;
