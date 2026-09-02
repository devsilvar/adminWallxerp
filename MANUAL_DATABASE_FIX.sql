-- ========================================================================
-- MANUAL DATABASE FIX FOR SUPABASE
-- ========================================================================
-- Purpose: Ensure TransactionStatus enum matches code reality
-- Date: 2026-08-31
-- Run this in Supabase SQL Editor
--
-- IMPORTANT: PostgreSQL requires enum values to be committed before use.
-- You MUST run this in 3 SEPARATE queries (copy each section separately)
-- ========================================================================

-- ════════════════════════════════════════════════════════════════════════
-- QUERY 1: Add Enum Values (Run this first)
-- ════════════════════════════════════════════════════════════════════════

-- Add 'confirmed' if missing (safe - does nothing if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'public."TransactionStatus"'::regtype 
        AND enumlabel = 'confirmed'
    ) THEN
        ALTER TYPE "TransactionStatus" ADD VALUE 'confirmed';
        RAISE NOTICE 'Added confirmed to TransactionStatus enum';
    ELSE
        RAISE NOTICE 'confirmed already exists in TransactionStatus enum';
    END IF;
END $$;

-- Add 'completed' if missing (safe - does nothing if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'public."TransactionStatus"'::regtype 
        AND enumlabel = 'completed'
    ) THEN
        ALTER TYPE "TransactionStatus" ADD VALUE 'completed';
        RAISE NOTICE 'Added completed to TransactionStatus enum';
    ELSE
        RAISE NOTICE 'completed already exists in TransactionStatus enum';
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- QUERY 2: Update Data (Run this second, in a NEW query)
-- ════════════════════════════════════════════════════════════════════════

-- This ensures all sales use 'confirmed' (matching your code)
UPDATE sales_transactions
SET status = 'confirmed'
WHERE status = 'completed';

-- Show how many were updated:
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'All ' || COUNT(*) || ' sales now use confirmed status'
        ELSE 'No sales found (this is fine for new projects)'
    END as result
FROM sales_transactions
WHERE status = 'confirmed';

-- ════════════════════════════════════════════════════════════════════════
-- QUERY 3: Verification (Run this third, in a NEW query)
-- ════════════════════════════════════════════════════════════════════════

-- Check 1: Verify enum has all required values
SELECT 'Enum values:' as check_name, enumlabel as value
FROM pg_enum 
WHERE enumtypid = 'public."TransactionStatus"'::regtype 
ORDER BY enumsortorder;

-- Check 2: Verify sales status distribution
SELECT 'Sales status distribution:' as check_name, 
       status as value, 
       COUNT(*) as count
FROM sales_transactions
GROUP BY status
ORDER BY count DESC;

-- ════════════════════════════════════════════════════════════════════════
-- EXPECTED FINAL STATE:
-- ════════════════════════════════════════════════════════════════════════
-- 
-- TransactionStatus enum should contain:
--   - confirmed   (✅ actively used by code)
--   - completed   (✅ exists for compatibility)
--   - pending
--   - reversed
--   - disputed
--
-- All sales_transactions.status should be: 'confirmed'
--
-- ========================================================================
-- END OF MANUAL FIX
-- ========================================================================
