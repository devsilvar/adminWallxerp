/**
 * Accrual-link detection for sales.
 *
 * A sale carrying any of these relations is an accrual entry, not a cash
 * movement: under CITA §25 revenue is recognised when it is earned — at
 * invoicing — so the revenue is already attributed to the business that issued
 * the invoice or extended the credit.
 *
 * The check is on the linked relations rather than on `source`, because
 * `paymentMethodToSalesSource` (`invoice-crud.service.ts:76-88`) maps **`cash` →
 * `'cash'`**, so a cash-settled invoice produces a sale whose source gives
 * nothing away. The relations are stamped regardless of payment method.
 */

/**
 * Prisma include adding the three accrual relations. Kept as `{ id: true }`
 * selects so the payload grows by three tiny objects rather than whole records.
 */
export const ACCRUAL_SALE_INCLUDE = {
  invoice: { select: { id: true, invoiceNumber: true } },
  creditOrigin: { select: { id: true } },
  creditPayment: { select: { id: true } },
} as const;

/**
 * True when the sale is linked to a customer credit (debtor ledger). Customer credits
 * are strictly non-transferable between businesses.
 */
export function isCreditLinked(sale: {
  source?: string | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
}): boolean {
  return Boolean(sale.creditOrigin || sale.creditPayment || sale.source === 'credit');
}

/**
 * True when the sale is linked to an invoice.
 */
export function isInvoiceLinked(sale: {
  source?: string | null;
  invoice?: { id: string } | null;
}): boolean {
  return Boolean(sale.invoice || sale.source === 'invoice');
}

/**
 * True when the sale's revenue was recognised under accrual basis.
 */
export function isAccrualLinked(sale: {
  source?: string | null;
  customerId?: string | null;
  invoice?: { id: string } | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
}): boolean {
  return Boolean(
    sale.invoice ||
      sale.creditOrigin ||
      sale.creditPayment ||
      sale.source === 'credit' ||
      sale.source === 'store_voucher' ||
      sale.customerId != null
  );
}