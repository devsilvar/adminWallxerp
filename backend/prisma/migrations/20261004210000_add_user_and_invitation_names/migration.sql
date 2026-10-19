-- AlterTable: users - add full_name
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" TEXT;

-- AlterTable: invitations - add full_name
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "full_name" TEXT;

-- Backfill: promote existing JSONB memberName into users.full_name
UPDATE "users" u
SET "full_name" = btrim(b.permissions->>'memberName')
FROM "business_members" b
WHERE b."user_id" = u.id
  AND u."full_name" IS NULL
  AND b.permissions->>'memberName' IS NOT NULL
  AND btrim(b.permissions->>'memberName') <> '';
