-- Add new expense categories (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ExpenseCategory' AND e.enumlabel = 'gift') THEN
    ALTER TYPE "ExpenseCategory" ADD VALUE 'gift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ExpenseCategory' AND e.enumlabel = 'subscription') THEN
    ALTER TYPE "ExpenseCategory" ADD VALUE 'subscription';
  END IF;
END $$;

-- Free-text detail captured when category = 'other' ("what do you mean by other?")
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category_detail" TEXT;
