import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  console.log('Applying customer card and store voucher migrations...');

  // 1. SalesSource enum value
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'store_voucher'
                     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SalesSource')) THEN
        ALTER TYPE "SalesSource" ADD VALUE 'store_voucher';
      END IF;
    END $$;
  `);
  console.log('✔ SalesSource store_voucher applied');

  // 2. customerId on sales_transactions
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "sales_transactions" ADD COLUMN IF NOT EXISTS "customer_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sales_transactions_customer_id_fkey'
      ) THEN
        ALTER TABLE "sales_transactions"
          ADD CONSTRAINT "sales_transactions_customer_id_fkey"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "sales_transactions_customer_id_idx" ON "sales_transactions"("customer_id");
  `);
  console.log('✔ sales_transactions customer_id column, fkey, and index applied');

  // 3. CardTransactionType enum
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CardTransactionType') THEN
        CREATE TYPE "CardTransactionType" AS ENUM ('top_up', 'change_credit', 'sale_debit', 'adjustment');
      END IF;
    END $$;
  `);
  console.log('✔ CardTransactionType enum applied');

  // 4. customer_cards table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "customer_cards" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "business_id" TEXT NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
      "customer_id" TEXT NOT NULL UNIQUE REFERENCES "customers"("id") ON DELETE CASCADE,
      "card_code" TEXT NOT NULL UNIQUE,
      "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "pending_verification_id" TEXT,
      "pending_verification_requested_at" TIMESTAMP,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customer_cards_business_id_card_code_idx" ON "customer_cards"("business_id", "card_code");
  `);
  console.log('✔ customer_cards table applied');

  // 5. customer_card_ledgers table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "customer_card_ledgers" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "card_id" TEXT NOT NULL REFERENCES "customer_cards"("id") ON DELETE CASCADE,
      "type" "CardTransactionType" NOT NULL,
      "amount" DECIMAL(15,2) NOT NULL,
      "balance_before" DECIMAL(15,2) NOT NULL,
      "balance_after" DECIMAL(15,2) NOT NULL,
      "receipt_number" TEXT,
      "linked_sale_id" TEXT,
      "performed_by" TEXT,
      "notes" TEXT,
      "created_at" TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customer_card_ledgers_card_id_created_at_idx" ON "customer_card_ledgers"("card_id", "created_at" DESC);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customer_card_ledgers_receipt_number_idx" ON "customer_card_ledgers"("receipt_number");
  `);
  console.log('✔ customer_card_ledgers table applied');

  console.log('All customer card migrations applied successfully.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
