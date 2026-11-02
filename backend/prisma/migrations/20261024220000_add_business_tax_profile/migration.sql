-- CreateTable
CREATE TABLE "business_tax_profiles" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "quiz_answers" JSONB NOT NULL DEFAULT '{}',
    "computed_config" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3),
    "needs_manual_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_tax_profiles_business_id_key" ON "business_tax_profiles"("business_id");

-- CreateIndex
CREATE INDEX "business_tax_profiles_business_id_idx" ON "business_tax_profiles"("business_id");

-- CreateIndex
CREATE INDEX "business_tax_profiles_needs_manual_review_idx" ON "business_tax_profiles"("needs_manual_review");

-- AddForeignKey
ALTER TABLE "business_tax_profiles" ADD CONSTRAINT "business_tax_profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
