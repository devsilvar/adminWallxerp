-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verification_token_hash" TEXT,
ADD COLUMN     "verification_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_verification_token_hash_idx" ON "users"("verification_token_hash");
