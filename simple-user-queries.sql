-- ============================================================
-- SIMPLE USER QUERIES - Just working queries to see users
-- ============================================================

-- 1. COUNT TOTAL USERS
SELECT COUNT(*) AS total_users FROM users;


-- 2. LIST ALL USERS (Simple)
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    last_login_at,
    created_at
FROM users
ORDER BY created_at DESC;


-- 3. LIST ALL USERS (Detailed)
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    CASE WHEN bvn IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_bvn,
    CASE WHEN nin IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_nin,
    last_login_at,
    created_at,
    updated_at
FROM users
ORDER BY created_at DESC;


-- 4. USERS WITH THEIR BUSINESS COUNT
SELECT 
    u.id,
    u.email,
    u.phone,
    u.role,
    u.is_active,
    u.created_at,
    COUNT(b.id) AS business_count
FROM users u
LEFT JOIN businesses b ON u.id = b.user_id
GROUP BY u.id, u.email, u.phone, u.role, u.is_active, u.created_at
ORDER BY business_count DESC;


-- 5. QUICK STATS
SELECT 
    COUNT(*) AS total_users,
    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_users,
    SUM(CASE WHEN is_verified THEN 1 ELSE 0 END) AS verified_users,
    SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
FROM users;


-- 6. RECENT USERS (Last 30 days)
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    created_at
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;


-- 7. ADMIN USERS ONLY
SELECT 
    id,
    email,
    phone,
    is_active,
    created_at
FROM users
WHERE role = 'admin'
ORDER BY created_at;


-- 8. INACTIVE OR UNVERIFIED USERS
SELECT 
    id,
    email,
    phone,
    is_verified,
    is_active,
    created_at
FROM users
WHERE is_active = false OR is_verified = false
ORDER BY created_at DESC;


-- 9. SEARCH USER (Change 'search_term' to email or phone)
SELECT 
    id,
    email,
    phone,
    role,
    is_verified,
    is_active,
    created_at
FROM users
WHERE email ILIKE '%search_term%'
   OR phone ILIKE '%search_term%'
ORDER BY created_at DESC;


-- 10. USERS AND ALL THEIR BUSINESSES
SELECT 
    u.email,
    u.phone,
    u.is_active AS user_active,
    u.created_at AS user_created,
    b.business_name,
    b.merchant_id,
    b.tax_id,
    b.created_at AS business_created
FROM users u
LEFT JOIN businesses b ON u.id = b.user_id
ORDER BY u.created_at DESC;
