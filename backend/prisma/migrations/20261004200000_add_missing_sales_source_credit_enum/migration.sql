-- SalesSource.credit and TransactionStatus.completed are declared in
-- schema.prisma but no earlier migration ever added them to Postgres, so the
-- generated Prisma client happily accepts them while the database rejects the
-- write with 22P02 "invalid input value for enum". That broke every customer
-- credit, because createCredit() always writes a linked SalesTransaction with
-- source='credit'. Prod-only symptom: a database baselined with `db push` or an
-- older applied migration set has the values; one built from these migration
-- files does not.
--
-- Guarded with a pg_enum lookup, matching 20260810164700_add_cash_invoice_sources,
-- so re-running against a database that already has the values is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'credit'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SalesSource')) THEN
    ALTER TYPE "SalesSource" ADD VALUE 'credit';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'completed'
                 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TransactionStatus')) THEN
    ALTER TYPE "TransactionStatus" ADD VALUE 'completed';
  END IF;
END $$;