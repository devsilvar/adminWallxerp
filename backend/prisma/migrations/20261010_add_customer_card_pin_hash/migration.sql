-- Add PIN authentication columns to customer_cards
-- Part of Voucher PIN Authentication feature (replacing OTP system)
-- Migration created: 2026-10-10

-- Add pin_hash column (nullable, will be populated as PINs are issued)
ALTER TABLE customer_cards ADD COLUMN pin_hash TEXT;

-- Add pin_attempts column (tracks failed PIN attempts for lockout)
ALTER TABLE customer_cards ADD COLUMN pin_attempts INTEGER NOT NULL DEFAULT 0;

-- Add pin_locked_until column (timestamp for lockout expiry)
ALTER TABLE customer_cards ADD COLUMN pin_locked_until TIMESTAMPTZ;
