-- AlterTable
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'paystack_recipient_code') THEN
    ALTER TABLE "businesses" ADD COLUMN "paystack_recipient_code" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'recipient_fingerprint') THEN
    ALTER TABLE "businesses" ADD COLUMN "recipient_fingerprint" TEXT;
  END IF;
END $$;
