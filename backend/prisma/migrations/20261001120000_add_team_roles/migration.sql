-- CreateEnum: BusinessRole
CREATE TYPE "BusinessRole" AS ENUM ('owner', 'manager', 'sales_staff', 'accountant', 'viewer');

-- CreateEnum: InvitationStatus
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');

-- CreateTable: business_members
CREATE TABLE "business_members" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'viewer',
    "permissions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invitations
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'viewer',
    "permissions" JSONB,
    "token_hash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: business_members unique constraint
CREATE UNIQUE INDEX "business_members_business_id_user_id_key" ON "business_members"("business_id", "user_id");

-- CreateIndex: business_members indexes
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");
CREATE INDEX "business_members_business_id_role_idx" ON "business_members"("business_id", "role");

-- CreateIndex: invitations unique token_hash
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex: invitations indexes
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "invitations_business_id_status_idx" ON "invitations"("business_id", "status");
CREATE INDEX "invitations_business_id_email_idx" ON "invitations"("business_id", "email");

-- CreateIndex: Partial unique to prevent duplicate pending invitations per email per business
CREATE UNIQUE INDEX "invitations_one_pending_per_email"
  ON "invitations"("business_id", "email")
  WHERE "status" = 'pending';

-- AddForeignKey: business_members → businesses
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_members → users
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: invitations → businesses
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Create owner membership for all existing businesses
INSERT INTO "business_members" ("id", "business_id", "user_id", "role", "is_active", "joined_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, b."id", b."user_id", 'owner'::"BusinessRole", true, b."created_at", NOW(), NOW()
FROM "businesses" b
ON CONFLICT ("business_id", "user_id") DO NOTHING;
