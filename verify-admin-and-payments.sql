-- ============================================================
-- Verify Admin Account - Quick Check
-- ============================================================
-- Run this in Supabase SQL Editor to check if admin exists
-- ============================================================

-- 1. CHECK IF ADMIN EXISTS
SELECT 
    id,
    email,
    role,
    is_verified,
    is_active,
    created_at,
    last_login_at
FROM users
WHERE email = 'admin@paymytax.com';

-- Expected Result:
-- If admin exists, you should see 1 row with:
-- - email: admin@paymytax.com
-- - role: admin
-- - is_verified: true
-- - is_active: true

-- If NO rows returned, run: npm run prisma:seed in backend folder


-- ============================================================
-- 2. LIST ALL ADMIN USERS
-- ============================================================
SELECT 
    id,
    email,
    role,
    is_verified,
    is_active,
    created_at,
    last_login_at
FROM users
WHERE role = 'admin'
ORDER BY created_at;


-- ============================================================
-- 3. CHECK RECENT PAYMENTS (Verify Payment Fix)
-- ============================================================
SELECT 
    tp.id,
    tp.transaction_reference,
    tp.payment_status,
    tp.amount_paid,
    tp.created_at,
    tp.updated_at,
    tp.gateway_response,
    b.business_name,
    mtr.tax_month
FROM tax_payments tp
JOIN businesses b ON tp.business_id = b.id
JOIN monthly_tax_reports mtr ON tp.tax_report_id = mtr.id
ORDER BY tp.created_at DESC
LIMIT 20;

-- Look for:
-- - Multiple payments with same tax_report_id (indicates retries)
-- - payment_status: pending, failed, completed
-- - gateway_response: check for 'abandoned', 'expired', 'amount_changed'


-- ============================================================
-- 4. CHECK FOR DUPLICATE PAYMENT ATTEMPTS (Should be handled gracefully now)
-- ============================================================
SELECT 
    tax_report_id,
    COUNT(*) as payment_attempts,
    array_agg(payment_status ORDER BY created_at) as status_history,
    array_agg(transaction_reference ORDER BY created_at) as references,
    MIN(created_at) as first_attempt,
    MAX(created_at) as last_attempt
FROM tax_payments
GROUP BY tax_report_id
HAVING COUNT(*) > 1
ORDER BY last_attempt DESC;

-- This shows tax reports with multiple payment attempts
-- After the fix, you should see:
-- - Older attempts marked as 'failed' with abandoned reason
-- - Latest attempt as 'pending' or 'completed'


-- ============================================================
-- 5. CHECK ABANDONED PAYMENTS (After Fix)
-- ============================================================
SELECT 
    id,
    transaction_reference,
    payment_status,
    amount_paid,
    gateway_response->>'abandoned' as abandon_reason,
    gateway_response->>'oldAmount' as old_amount,
    gateway_response->>'newAmount' as new_amount,
    gateway_response->>'ageMinutes' as age_minutes,
    created_at
FROM tax_payments
WHERE payment_status = 'failed' 
  AND gateway_response ? 'abandoned'
ORDER BY created_at DESC
LIMIT 10;

-- Shows payments that were automatically abandoned:
-- - amount_changed: Amount changed between retries
-- - expired: Payment session >1 hour old
-- - duplicate_cleanup: Rare duplicate reference collision handled
