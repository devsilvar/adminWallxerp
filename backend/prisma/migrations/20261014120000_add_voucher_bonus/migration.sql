-- Add voucher bonus columns for global + per-customer + ledger tracking
ALTER TABLE "businesses" ADD COLUMN "voucher_bonus_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "customers" ADD COLUMN "voucher_bonus_pct" DECIMAL(5,2);
ALTER TABLE "customer_card_ledgers" ADD COLUMN "bonus_amount" DECIMAL(15,2);
ALTER TABLE "customer_card_ledgers" ADD COLUMN "bonus_pct" DECIMAL(5,2);
