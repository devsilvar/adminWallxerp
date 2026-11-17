/**
 * RecordPaymentModal — records a single installment payment against an invoice.
 *
 * On OVERPAYMENT error (400), the parent opens OverpaymentModal with the excess
 * amount. This modal never writes an overpayment — the backend rejects it first.
 *
 * Contract: `onSuccess` receives the updated invoice. Parent invalidates list
 * cache and refreshes detail.
 */
import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { formatCurrency } from '../../lib/format';
import { INVOICE_PAYMENT_METHODS, type RecordInvoicePaymentPayload } from '../../types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  balance: number;
  currency: string;
  onSubmit: (payload: RecordInvoicePaymentPayload) => Promise<void>;
};

export default function RecordPaymentModal({
  isOpen,
  onClose,
  invoiceNumber,
  balance,
  currency,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [method, setMethod] = useState<string>('bank_transfer');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (amountNum > balance) {
      setError(`Amount exceeds outstanding balance of ${formatCurrency(balance, currency)}`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        amount: amountNum,
        paymentDate: paymentDate || undefined,
        paymentMethod: method as any,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      // Success — parent closes the modal
    } catch (err: any) {
      // OVERPAYMENT errors bubble to parent for OverpaymentModal
      // Other errors display inline
      if (err.code !== 'OVERPAYMENT') {
        setError(err.message || 'Failed to record payment');
      }
      throw err; // Re-throw so parent can handle OVERPAYMENT
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setMethod('bank_transfer');
    setReference('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Record Payment"
      subtitle={`Invoice ${invoiceNumber} • Balance: ${formatCurrency(balance, currency)}`}
      icon={<DollarSign className="h-4 w-4" />}
      size="md"
      dismissible={!submitting}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="record-payment-form"
            variant="primary"
            isLoading={submitting}
            className="w-full sm:w-auto"
          >
            Record Payment
          </Button>
        </>
      }
    >
      <form id="record-payment-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1.5">
            Amount <span className="text-red-500">*</span>
          </label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max: ${formatCurrency(balance, currency)}`}
            required
            disabled={submitting}
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the amount received. Cannot exceed outstanding balance.
          </p>
        </div>

        <div>
          <label htmlFor="paymentDate" className="block text-sm font-medium text-gray-700 mb-1.5">
            Payment Date
          </label>
          <Input
            id="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            disabled={submitting}
          />
          <p className="mt-1 text-xs text-gray-500">
            Defaults to today. Backdated payments may be shifted if the month is locked.
          </p>
        </div>

        <div>
          <label htmlFor="method" className="block text-sm font-medium text-gray-700 mb-1.5">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={submitting}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {INVOICE_PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1.5">
            Reference Number
          </label>
          <Input
            id="reference"
            type="text"
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. TRX123456"
            disabled={submitting}
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional. Bank transfer reference or receipt number.
          </p>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional payment notes..."
            disabled={submitting}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-500">
            {notes.length}/500 characters
          </p>
        </div>
      </form>
    </Modal>
  );
}
