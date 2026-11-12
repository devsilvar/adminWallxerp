-- Backfill users.full_name from businesses.owner_name for accounts
-- that have no usable name yet.
-- Fill only where the account has no usable name and an owned business has one.
-- Prefer the primary business, else the earliest created.
-- Idempotent — safe to run multiple times. No DDL, no table lock risk.

WITH candidate AS (
  SELECT DISTINCT ON (b.user_id)
         b.user_id,
         btrim(b.owner_name) AS owner_name
  FROM businesses b
  JOIN users u ON u.id = b.user_id
  WHERE (u.full_name IS NULL OR btrim(u.full_name) = '')
    AND b.owner_name IS NOT NULL
    AND btrim(b.owner_name) <> ''
  ORDER BY b.user_id,
           (b.id = u.primary_business_id) DESC,
           b.created_at ASC
)
UPDATE users u
SET full_name = c.owner_name
FROM candidate c
WHERE u.id = c.user_id
  AND (u.full_name IS NULL OR btrim(u.full_name) = '');
