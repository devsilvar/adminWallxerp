-- AlterTable: backfill drift — User.acquisitionSource exists in schema.prisma but no migration ever created the column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acquisition_source" TEXT;
