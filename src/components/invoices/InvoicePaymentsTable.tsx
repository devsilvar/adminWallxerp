/**
 * InvoicePaymentsTable — renders payment history for an invoice.
 *
 * Shared by InvoiceDetail page and (future) PDF preview. Displays all payments
 * including voided ones (grayed out with strikethrough).
 *
 * Void button requires `invoices.mark_paid` permission and is disabled for
 * payments in locked months.
 */
import { CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../../lib/format';
import { invoicePaymentMethodLabel, type InvoicePayment } from '../../types';
import Button from '../ui/Button';

type Props = {
  payments: InvoicePayment[];
  currency: string;
  canVoid: boolean;
  onVoid?: (paymentId: string) => void;
  voidingId?: string | null;
};

export default function InvoicePaymentsTable({
  payments,
  currency,
  canVoid,
  onVoid,
  voidingId,
}: Props) {
  if (!payments || payments.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-6 text-center">
        <p className="text-sm text-gray-600">No payments recorded yet.</p>
      </div>
    );
  }

  // Sort by payment date descending (most recent first)
  const sorted = [...payments].sort((a, b) => {
    return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime();
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Method
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Reference
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Status
            </th>
            {canVoid && (
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sorted.map((payment) => {
            const isVoided = !!payment.voidedAt;
            const rowClass = isVoided ? 'bg-gray-50 opacity-60' : '';
            const textClass = isVoided ? 'line-through text-gray-500' : 'text-gray-900';

            return (
              <tr key={payment.id} className={rowClass}>
                <td className={`px-4 py-3 text-sm ${textClass} whitespace-nowrap`}>
                  {formatDate(payment.paymentDate)}
                </td>
                <td className={`px-4 py-3 text-sm ${textClass}`}>
                  {invoicePaymentMethodLabel(payment.method) || payment.method}
                </td>
                <td className={`px-4 py-3 text-sm ${textClass} font-mono max-w-xs truncate`}>
                  {payment.reference || '—'}
                </td>
                <td className={`px-4 py-3 text-sm ${textClass} text-right font-semibold whitespace-nowrap`}>
                  {formatCurrency(payment.amount, currency)}
                </td>
                <td className="px-4 py-3 text-center">
                  {isVoided ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 border border-red-200 text-xs font-medium text-red-800">
                      <XCircle className="h-3.5 w-3.5" />
                      Voided
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 border border-green-200 text-xs font-medium text-green-800">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Confirmed
                    </div>
                  )}
                </td>
                {canVoid && (
                  <td className="px-4 py-3 text-center">
                    {!isVoided && onVoid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onVoid(payment.id)}
                        isLoading={voidingId === payment.id}
                        disabled={!!voidingId}
                        title="Void this payment"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
          <tr>
            <td colSpan={canVoid ? 3 : 3} className="px-4 py-3 text-sm font-semibold text-gray-700">
              Total Paid (excluding voided)
            </td>
            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">
              {formatCurrency(
                sorted
                  .filter((p) => !p.voidedAt)
                  .reduce((sum, p) => sum + p.amount, 0),
                currency
              )}
            </td>
            <td colSpan={canVoid ? 2 : 1}></td>
          </tr>
        </tfoot>
      </table>

      {/* Void reasons for voided payments */}
      {sorted.some((p) => p.voidedAt) && (
        <div className="mt-3 space-y-2">
          {sorted
            .filter((p) => p.voidedAt)
            .map((payment) => (
              <div
                key={payment.id}
                className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-red-900">
                  {formatDate(payment.paymentDate)} payment voided:
                </span>{' '}
                <span className="text-red-800">
                  {payment.voidReason || 'No reason provided'}
                </span>
                {payment.voidedAt && (
                  <span className="text-red-700 ml-2">
                    (on {formatDate(payment.voidedAt)})
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
