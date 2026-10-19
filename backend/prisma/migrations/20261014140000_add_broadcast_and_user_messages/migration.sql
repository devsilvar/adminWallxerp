-- CreateTable
CREATE TABLE IF NOT EXISTS "broadcasts" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "audience_type" TEXT NOT NULL,
    "audience_user_id" TEXT,
    "created_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_email_count" INTEGER NOT NULL DEFAULT 0,
    "failed_email_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "broadcast_id" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "email_status" TEXT NOT NULL DEFAULT 'pending',
    "email_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "broadcasts_created_by_created_at_idx" ON "broadcasts"("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "broadcasts_created_at_idx" ON "broadcasts"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_messages_user_id_is_read_created_at_idx" ON "user_messages"("user_id", "is_read", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_messages_user_id_created_at_idx" ON "user_messages"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_messages_broadcast_id_idx" ON "user_messages"("broadcast_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcasts_created_by_fkey') THEN
    ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_messages_user_id_fkey') THEN
    ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_messages_broadcast_id_fkey') THEN
    ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
