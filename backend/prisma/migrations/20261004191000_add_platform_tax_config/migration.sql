-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_tax_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "auto_finalize_day" INTEGER NOT NULL DEFAULT 20,
    "auto_finalize_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "platform_tax_configs_pkey" PRIMARY KEY ("id")
);

-- Insert default row if not exists
INSERT INTO "platform_tax_configs" ("id", "auto_finalize_day", "auto_finalize_enabled", "updated_at")
VALUES ('default', 20, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;