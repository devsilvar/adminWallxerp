/**
 * OverpaymentModal — handles the excess when a payment exceeds invoice balance.
 *
 * Appears when recordPayment returns 400 OVERPAYMENT. Two buttons:
 *  - [Credit to voucher]: creates a walk-in customer if needed, applies excess to card
 *  - [Cancel]: dismisses, writes nothing
 *
 * No refund button in v1. The voucher is a liability, never revenue.
 */
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { formatCurrency } from '../../lib/format';
import type { ResolveOverpaymentPayload } from '../../types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  customerName: string;
  balance: number;
  enteredAmount: number;
  excess: number;
  currency: string;
  /** The original payment payload — we reuse method/date/reference/notes */
  originalPayload: Omit<ResolveOverpaymentPayload, 'resolution'>;
  onResolve: (payload: ResolveOverpaymentPayload) => Promise<void>;
};

export default function OverpaymentModal({
  isOpen,
  onClose,
  invoiceNumber,
  customerName,
  balance,
  enteredAmount,
  excess,
  currency,
  originalPayload,
  onResolve,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreditToVoucher = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onResolve({
        ...originalPayload,
        resolution: 'voucher',
      });
      // Success — parent closes both modals and refreshes
    } catch (err: any) {
      setError(err.message || 'Failed to resolve overpayment');
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Overpayment Detected"
      subtitle={`Invoice ${invoiceNumber}`}
      icon={<AlertCircle className="h-4 w-4" />}
      size="md"
      dismissible={!submitting}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCreditToVoucher}
            isLoading={submitting}
            className="w-full sm:w-auto"
          >
            Credit to Voucher
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">
            The payment amount exceeds the outstanding invoice balance.
          </p>
        </div>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-600">Outstanding Balance:</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(balance, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-600">Amount Entered:</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(enteredAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 bg-primary-50 px-3 -mx-3 rounded-md">
            <span className="text-primary-900 font-medium">Excess Amount:</span>
            <span className="font-bold text-primary-900 text-base">
              {formatCurrency(excess, currency)}
            </span>
          </div>
        </div>

        <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Credit to Voucher
          </h4>
          <p className="text-sm text-gray-700 leading-relaxed">
            The invoice will be settled with{' '}
            <span className="font-semibold">{formatCurrency(balance, currency)}</span>.
            The excess{' '}
            <span className="font-semibold">{formatCurrency(excess, currency)}</span>{' '}
            will be credited to <span className="font-semibold">{customerName}'s</span>{' '}
            store voucher card as a reusable balance.
          </p>
          <p className="text-xs text-gray-600 mt-2">
            {customerName} does not have a customer account, one will be created automatically.
          </p>
        </div>

        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs text-blue-900 leading-relaxed">
            <span className="font-semibold">Note:</span> The voucher credit is recorded as a
            liability, not revenue. No refund option is available in this version — only voucher credit.
          </p>
        </div>
      </div>
    </Modal>
  );
}
