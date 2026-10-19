-- Clean any dangling primary_business_id references before adding foreign key
UPDATE "users"
SET "primary_business_id" = NULL
WHERE "primary_business_id" IS NOT NULL
  AND "primary_business_id" NOT IN (SELECT "id" FROM "businesses");

-- AddForeignKey: users → businesses (PrimaryBusiness)
ALTER TABLE "users" ADD CONSTRAINT "users_primary_business_id_fkey" FOREIGN KEY ("primary_business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
