-- ============================================================
-- PayMyTax by WallX - User Analytics SQL Queries for Supabase
-- ============================================================
-- Run these queries in Supabase SQL Editor to analyze users
-- Generated: 2026-08-15
-- ============================================================

-- 1. TOTAL USER COUNT
-- Simple count of all users in the system
SELECT COUNT(*) AS total_users FROM users;


-- 2. ALL USERS - BASIC INFO
-- Get all users with key information (no sensitive data)
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    last_login_at,
    created_at,
    updated_at
FROM users
ORDER BY created_at DESC;


-- 3. ALL USERS - DETAILED VIEW
-- Comprehensive user details including verification status
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    bvn IS NOT NULL AS has_bvn,
    nin IS NOT NULL AS has_nin,
    bvn_verified_at IS NOT NULL AS bvn_verified,
    nin_verified_at IS NOT NULL AS nin_verified,
    last_login_at,
    created_at,
    DATE_PART('day', NOW() - created_at) AS days_since_signup,
    updated_at
FROM users
ORDER BY created_at DESC;


-- 4. USERS WITH BUSINESS COUNT
-- See how many businesses each user has
SELECT 
    u.id,
    u.email,
    u.phone,
    u.role,
    u.is_verified,
    u.is_active,
    u.last_login_at,
    u.created_at,
    COUNT(b.id) AS business_count
FROM users u
LEFT JOIN businesses b ON u.id = b.user_id
GROUP BY u.id, u.email, u.phone, u.role, u.is_verified, u.is_active, u.last_login_at, u.created_at
ORDER BY business_count DESC, u.created_at DESC;


-- 5. USER STATISTICS SUMMARY
-- High-level stats about your user base
SELECT 
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE is_active = true) AS active_users,
    COUNT(*) FILTER (WHERE is_active = false) AS inactive_users,
    COUNT(*) FILTER (WHERE is_verified = true) AS verified_users,
    COUNT(*) FILTER (WHERE role = 'admin') AS admin_users,
    COUNT(*) FILTER (WHERE role = 'user') AS regular_users,
    COUNT(*) FILTER (WHERE bvn IS NOT NULL) AS users_with_bvn,
    COUNT(*) FILTER (WHERE nin IS NOT NULL) AS users_with_nin,
    COUNT(*) FILTER (WHERE last_login_at IS NOT NULL) AS users_who_logged_in,
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') AS active_last_7_days,
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') AS active_last_30_days,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS signups_last_7_days,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS signups_last_30_days
FROM users;


-- 6. RECENT SIGNUPS (Last 30 days)
-- See your newest users
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    created_at,
    DATE_PART('day', NOW() - created_at) AS days_ago
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;


-- 7. ACTIVE USERS (Logged in within last 30 days)
-- Users who have been active recently
SELECT 
    id,
    email,
    phone,
    role,
    last_login_at,
    DATE_PART('day', NOW() - last_login_at) AS days_since_login,
    created_at
FROM users
WHERE last_login_at > NOW() - INTERVAL '30 days'
ORDER BY last_login_at DESC;


-- 8. INACTIVE USERS (Never logged in or not in 90+ days)
-- Identify users who may need re-engagement
SELECT 
    id,
    email,
    phone,
    is_verified,
    is_active,
    last_login_at,
    created_at,
    CASE 
        WHEN last_login_at IS NULL THEN 'Never logged in'
        ELSE DATE_PART('day', NOW() - last_login_at)::TEXT || ' days ago'
    END AS last_activity
FROM users
WHERE last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '90 days'
ORDER BY created_at DESC;


-- 9. ADMINS LIST
-- All admin users
SELECT 
    id,
    email,
    phone,
    is_active,
    last_login_at,
    created_at
FROM users
WHERE role = 'admin'
ORDER BY created_at;


-- 10. USERS WITH ISSUES
-- Users who are inactive or unverified
SELECT 
    id,
    email,
    phone,
    is_verified,
    is_active,
    last_login_at,
    created_at,
    CASE 
        WHEN NOT is_active THEN 'Account Inactive'
        WHEN NOT is_verified THEN 'Email Not Verified'
        WHEN last_login_at IS NULL THEN 'Never Logged In'
        ELSE 'OK'
    END AS issue
FROM users
WHERE NOT is_active OR NOT is_verified OR last_login_at IS NULL
ORDER BY created_at DESC;


-- 11. USERS AND THEIR BUSINESSES
-- Full relationship view
SELECT 
    u.id AS user_id,
    u.email,
    u.phone,
    u.role,
    u.is_active AS user_active,
    u.created_at AS user_created,
    b.id AS business_id,
    b.business_name,
    b.merchant_id,
    b.tax_id,
    b.virtual_account_number,
    b.virtual_account_bank,
    b.created_at AS business_created
FROM users u
LEFT JOIN businesses b ON u.id = b.user_id
ORDER BY u.created_at DESC, b.created_at DESC;


-- 12. USER GROWTH BY MONTH
-- See signups over time
SELECT 
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS signups,
    COUNT(*) FILTER (WHERE is_verified = true) AS verified,
    COUNT(*) FILTER (WHERE role = 'admin') AS admins
FROM users
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;


-- 13. ENGAGEMENT METRICS
-- User engagement breakdown
SELECT 
    CASE 
        WHEN last_login_at > NOW() - INTERVAL '7 days' THEN 'Active (last 7 days)'
        WHEN last_login_at > NOW() - INTERVAL '30 days' THEN 'Active (last 30 days)'
        WHEN last_login_at > NOW() - INTERVAL '90 days' THEN 'Inactive (90+ days)'
        WHEN last_login_at IS NOT NULL THEN 'Inactive (90+ days)'
        ELSE 'Never logged in'
    END AS engagement_status,
    COUNT(*) AS user_count
FROM users
GROUP BY 
    CASE 
        WHEN last_login_at > NOW() - INTERVAL '7 days' THEN 'Active (last 7 days)'
        WHEN last_login_at > NOW() - INTERVAL '30 days' THEN 'Active (last 30 days)'
        WHEN last_login_at > NOW() - INTERVAL '90 days' THEN 'Inactive (90+ days)'
        WHEN last_login_at IS NOT NULL THEN 'Inactive (90+ days)'
        ELSE 'Never logged in'
    END
ORDER BY 
    CASE 
        WHEN last_login_at > NOW() - INTERVAL '7 days' THEN 1
        WHEN last_login_at > NOW() - INTERVAL '30 days' THEN 2
        WHEN last_login_at > NOW() - INTERVAL '90 days' THEN 3
        WHEN last_login_at IS NOT NULL THEN 3
        ELSE 4
    END;


-- 14. SEARCH FOR SPECIFIC USER (by email or phone)
-- Replace 'example@email.com' with actual email/phone
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    last_login_at,
    created_at,
    updated_at
FROM users
WHERE email ILIKE '%example%'  -- Change 'example' to search term
   OR phone ILIKE '%example%'
ORDER BY created_at DESC;


-- 15. PASSWORD RESET TOKENS (Active)
-- Users with active password reset tokens
SELECT 
    id,
    email,
    reset_token_expires_at,
    CASE 
        WHEN reset_token_expires_at > NOW() THEN 'Active'
        ELSE 'Expired'
    END AS token_status,
    created_at
FROM users
WHERE reset_token_hash IS NOT NULL
ORDER BY reset_token_expires_at DESC;
