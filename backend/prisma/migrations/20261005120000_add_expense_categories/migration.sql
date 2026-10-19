-- AlterEnum
-- Add 11 new expense categories for Nigerian CITA compliance
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'bank_charges';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'communication';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'depreciation';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'gift';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'interest';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'office_supplies';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'professional_fees';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'repairs_maintenance';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'subscription';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'tax_permit';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'travel';
