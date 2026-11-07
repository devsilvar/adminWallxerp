/**
 * Payment-type labels — single source of truth for the user-facing name of
 * every `SalesTransaction.source` value. The DB column stays `source`; the
 * "Payment Type" wording lives only here (salesexpense.md §3.1).
 *
 * 'manual' is retired but kept as a label so any pre-migration row with a
 * referenceId still renders sensibly instead of a raw snake_case string.
 */
export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  paycode: 'Paycode',
  pos: 'POS',
  online_store: 'Online Store',
  cash: 'Cash',
  invoice: 'Invoice',
  manual: 'Cash (legacy)',
  credit: 'Credit / Debt (Buy Now, Pay Later)',
  store_voucher: 'Store Voucher',
};

export function paymentTypeLabel(source: string): string {
  return PAYMENT_TYPE_LABELS[source] ?? source.replace(/_/g, ' ');
}
