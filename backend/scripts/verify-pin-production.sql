-- ============================================================================
-- VOUCHER PIN AUTHENTICATION - PRODUCTION VERIFICATION SCRIPTS
-- ============================================================================
-- 
-- Purpose: Validate data integrity and security after PIN authentication deployment
-- Usage: Run these queries in production to verify correct implementation
-- 
-- ============================================================================

-- ============================================================================
-- 1. SECURITY CHECKS (CRITICAL)
-- ============================================================================

-- 1.1: Verify NO plaintext PINs in sales metadata
-- Expected Result: 0 rows
SELECT 
    id, 
    created_at, 
    metadata->>'voucherPin' AS leaked_pin,
    metadata->>'voucherLast4' AS leaked_last4
FROM sales_transactions 
WHERE 
    source = 'store_voucher'
    AND (
        metadata->>'voucherPin' IS NOT NULL 
        OR metadata->>'voucherLast4' IS NOT NULL
    )
ORDER BY created_at DESC;

-- 1.2: Verify bcrypt hash format correctness
-- Expected Result: 0 rows
SELECT 
    id,
    card_code,
    customer_id,
    pin_hash
FROM customer_cards 
WHERE 
    pin_hash IS NOT NULL 
    AND pin_hash NOT LIKE '$2b$12$%';

-- 1.3: Check for weak bcrypt rounds (should be 12)
-- Expected Result: 0 rows
SELECT 
    id,
    card_code,
    SUBSTRING(pin_hash, 1, 20) AS hash_prefix
FROM customer_cards 
WHERE 
    pin_hash IS NOT NULL 
    AND pin_hash NOT LIKE '$2b$12$%';


-- ============================================================================
-- 2. DATA INTEGRITY CHECKS
-- ============================================================================

-- 2.1: Cards without PIN hash (should be 0 after migration)
-- Expected Result: 0 rows
SELECT 
    cc.id,
    cc.card_code,
    cc.created_at,
    c.name AS customer_name,
    c.email,
    c.phone
FROM customer_cards cc
JOIN customers c ON c.id = cc.customer_id
WHERE cc.pin_hash IS NULL
ORDER BY cc.created_at DESC;

-- 2.2: Orphaned locks (locked but no failed attempts)
-- Expected Result: 0 rows
SELECT 
    id,
    card_code,
    customer_id,
    pin_attempts,
    pin_locked_until,
    EXTRACT(EPOCH FROM (pin_locked_until - NOW())) / 60 AS minutes_remaining
FROM customer_cards 
WHERE 
    pin_locked_until IS NOT NULL 
    AND pin_attempts = 0;

-- 2.3: High attempts without lockout (possible cleared locks)
-- Expected Result: Rows with pin_locked_until in the past are OK
SELECT 
    id,
    card_code,
    customer_id,
    pin_attempts,
    pin_locked_until,
    CASE 
        WHEN pin_locked_until < NOW() THEN 'Lock Expired (OK)'
        ELSE 'INVALID: Should be locked'
    END AS status
FROM customer_cards 
WHERE 
    pin_attempts >= 3 
    AND (pin_locked_until IS NULL OR pin_locked_until < NOW())
ORDER BY pin_attempts DESC;

-- 2.4: Customers with insufficient phone for last-4 verification
-- Expected Result: 0 rows (should have been caught during creation)
SELECT 
    c.id,
    c.name,
    c.phone,
    LENGTH(REGEXP_REPLACE(c.phone, '\D', '', 'g')) AS digit_count,
    cc.card_code
FROM customers c
JOIN customer_cards cc ON cc.customer_id = c.id
WHERE 
    LENGTH(REGEXP_REPLACE(COALESCE(c.phone, ''), '\D', '', 'g')) < 4;


-- ============================================================================
-- 3. MIGRATION VERIFICATION
-- ============================================================================

-- 3.1: Total cards with PINs
SELECT 
    COUNT(*) AS total_cards,
    COUNT(pin_hash) AS cards_with_pin,
    COUNT(*) - COUNT(pin_hash) AS cards_without_pin,
    ROUND(100.0 * COUNT(pin_hash) / NULLIF(COUNT(*), 0), 2) AS pin_coverage_percent
FROM customer_cards;

-- 3.2: PIN generation audit trail
SELECT 
    action,
    COUNT(*) AS count,
    MIN(created_at) AS first_occurrence,
    MAX(created_at) AS last_occurrence
FROM audit_logs
WHERE 
    resource_type = 'customer_card'
    AND action IN ('card.created', 'card.pin_resent', 'card.pin_changed')
GROUP BY action
ORDER BY last_occurrence DESC;


-- ============================================================================
-- 4. OPERATIONAL METRICS
-- ============================================================================

-- 4.1: Failed authentication attempts (last 24 hours)
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS failed_attempts
FROM audit_logs
WHERE 
    resource_type = 'customer_card'
    AND action = 'auth.failed'
    AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- 4.2: Currently locked accounts
SELECT 
    cc.id,
    cc.card_code,
    c.name AS customer_name,
    c.phone,
    cc.pin_attempts,
    cc.pin_locked_until,
    EXTRACT(EPOCH FROM (cc.pin_locked_until - NOW())) / 60 AS minutes_remaining
FROM customer_cards cc
JOIN customers c ON c.id = cc.customer_id
WHERE 
    cc.pin_locked_until IS NOT NULL 
    AND cc.pin_locked_until > NOW()
ORDER BY cc.pin_locked_until DESC;

-- 4.3: Cards with high failure counts (potential fraud)
SELECT 
    cc.id,
    cc.card_code,
    c.name AS customer_name,
    c.phone,
    c.email,
    cc.pin_attempts,
    cc.pin_locked_until,
    cc.created_at,
    COUNT(al.id) AS total_auth_attempts
FROM customer_cards cc
JOIN customers c ON c.id = cc.customer_id
LEFT JOIN audit_logs al ON 
    al.resource_id = cc.id 
    AND al.action IN ('auth.success', 'auth.failed')
WHERE cc.pin_attempts >= 3
GROUP BY cc.id, cc.card_code, c.name, c.phone, c.email, cc.pin_attempts, cc.pin_locked_until, cc.created_at
ORDER BY cc.pin_attempts DESC, total_auth_attempts DESC
LIMIT 20;


-- ============================================================================
-- 5. PERFORMANCE CHECKS
-- ============================================================================

-- 5.1: Check for missing indexes
-- Verify index on customer_id exists
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE 
    schemaname = 'public'
    AND tablename = 'customer_cards'
    AND indexname LIKE '%customer%';

-- 5.2: Slow queries check (requires pg_stat_statements extension)
-- Run this ONLY if pg_stat_statements is enabled
-- SELECT 
--     query,
--     calls,
--     ROUND(mean_exec_time::numeric, 2) AS avg_ms,
--     ROUND(total_exec_time::numeric, 2) AS total_ms
-- FROM pg_stat_statements
-- WHERE query LIKE '%customer_cards%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 10;


-- ============================================================================
-- 6. BUSINESS VALIDATION
-- ============================================================================

-- 6.1: Voucher sales after PIN deployment
SELECT 
    DATE(created_at) AS sale_date,
    COUNT(*) AS total_voucher_sales,
    SUM(amount) AS total_amount,
    AVG(amount) AS avg_amount
FROM sales_transactions
WHERE 
    source = 'store_voucher'
    AND created_at > '2025-01-01'  -- Adjust to deployment date
GROUP BY DATE(created_at)
ORDER BY sale_date DESC
LIMIT 30;

-- 6.2: Customer card balance summary
SELECT 
    COUNT(*) AS total_cards,
    SUM(balance) AS total_outstanding_balance,
    AVG(balance) AS avg_balance,
    MAX(balance) AS max_balance,
    MIN(balance) AS min_balance
FROM customer_cards;


-- ============================================================================
-- 7. CLEANUP & MAINTENANCE
-- ============================================================================

-- 7.1: Clear expired locks (run as maintenance job)
-- This is SAFE to run - only clears locks that have naturally expired
UPDATE customer_cards
SET 
    pin_locked_until = NULL
WHERE 
    pin_locked_until IS NOT NULL 
    AND pin_locked_until < NOW();
-- Returns: Number of locks cleared

-- 7.2: Reset failed attempts for expired locks (optional)
-- Use with caution - only for accounts with expired locks
UPDATE customer_cards
SET 
    pin_attempts = 0
WHERE 
    pin_locked_until IS NOT NULL 
    AND pin_locked_until < NOW()
    AND pin_attempts > 0;
-- Returns: Number of attempt counters reset


-- ============================================================================
-- 8. EMERGENCY PROCEDURES
-- ============================================================================

-- 8.1: Manually unlock a specific customer card (emergency only)
-- Replace 'CARD_CODE_HERE' with actual card code
-- UPDATE customer_cards
-- SET 
--     pin_locked_until = NULL,
--     pin_attempts = 0
-- WHERE card_code = 'CARD_CODE_HERE';

-- 8.2: Generate audit report for specific card
SELECT 
    al.created_at,
    al.action,
    al.actor_id,
    u.full_name AS actor_name,
    al.changes,
    al.metadata
FROM audit_logs al
LEFT JOIN users u ON u.id = al.actor_id
WHERE 
    al.resource_type = 'customer_card'
    AND al.resource_id = 'CARD_ID_HERE'  -- Replace with actual UUID
ORDER BY al.created_at DESC;


-- ============================================================================
-- 9. REPORTING QUERIES
-- ============================================================================

-- 9.1: Daily PIN authentication statistics
SELECT 
    DATE(created_at) AS date,
    COUNT(*) FILTER (WHERE action = 'auth.success') AS successful_auths,
    COUNT(*) FILTER (WHERE action = 'auth.failed') AS failed_auths,
    COUNT(*) FILTER (WHERE action = 'card.pin_resent') AS pins_resent,
    COUNT(*) FILTER (WHERE action = 'card.pin_changed') AS pins_changed
FROM audit_logs
WHERE 
    resource_type = 'customer_card'
    AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 9.2: Customer engagement with voucher cards
SELECT 
    c.id,
    c.name,
    c.phone,
    cc.card_code,
    cc.balance,
    COUNT(st.id) AS total_transactions,
    SUM(st.amount) AS total_spent,
    MAX(st.created_at) AS last_transaction_date,
    cc.pin_attempts,
    CASE 
        WHEN cc.pin_locked_until > NOW() THEN 'Locked'
        WHEN cc.pin_attempts > 0 THEN 'Has Failures'
        ELSE 'Active'
    END AS account_status
FROM customers c
JOIN customer_cards cc ON cc.customer_id = c.id
LEFT JOIN sales_transactions st ON 
    st.source = 'store_voucher' 
    AND st.metadata->>'customerCardId' = cc.id::text
GROUP BY c.id, c.name, c.phone, cc.card_code, cc.balance, cc.pin_attempts, cc.pin_locked_until
ORDER BY total_transactions DESC, last_transaction_date DESC
LIMIT 50;


-- ============================================================================
-- END OF VERIFICATION SCRIPTS
-- ============================================================================
