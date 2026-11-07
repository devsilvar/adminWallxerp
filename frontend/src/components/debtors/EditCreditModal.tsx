import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, Plus, Trash2, AlertTriangle, Package } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import { useCreditStore } from '@/stores/credit.store.ts';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/axios.ts';
import type { CustomerCredit } from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface EditCreditModalProps {
  businessId: string;
  credit: CustomerCredit;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

interface EditableItem {
  key: string; // local UI key for React list keys
  name: string;
  quantity: number;
  unitPrice: number;
}

let itemKeyCounter = 0;
function nextItemKey() {
  return `item-${++itemKeyCounter}`;
}

export default function EditCreditModal({
  businessId,
  credit,
  isOpen,
  onClose,
  onUpdated,
}: EditCreditModalProps) {
  useDisplayCurrency();
  const updateCredit = useCreditStore((s) => s.updateCredit);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Line items state
  const [items, setItems] = useState<EditableItem[]>([]);
  const hasLineItems = (credit.items && credit.items.length > 0) || items.length > 0;

  // Pre-fill from credit on open
  useEffect(() => {
    if (!isOpen) return;
    setCustomerName(credit.customerName || '');
    setCustomerPhone(credit.customerPhone || '');
    setCustomerEmail(credit.customerEmail || '');
    setDescription(credit.description || '');
    setDueDate(credit.dueDate ? new Date(credit.dueDate).toISOString().slice(0, 10) : '');
    setReminderDate(credit.reminderDate ? new Date(credit.reminderDate).toISOString().slice(0, 10) : '');
    setGuarantorName(credit.guarantorName || '');
    setGuarantorPhone(credit.guarantorPhone || '');
    setNotes(credit.notes || '');

    // Pre-fill line items from credit
    if (credit.items && credit.items.length > 0) {
      setItems(
        credit.items.map((item) => ({
          key: nextItemKey(),
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      );
    } else {
      setItems([]);
    }
  }, [isOpen, credit]);

  // ESC key + scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, loading, onClose]);

  // Computed totals
  const computedTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      return Math.round((sum + lineTotal) * 100) / 100;
    }, 0);
  }, [items]);

  const amountPaid = Number(credit.amountPaid || 0);
  const computedBalance = Math.max(0, Math.round((computedTotal - amountPaid) * 100) / 100);
  const isBelowPaid = items.length > 0 && computedTotal < amountPaid;

  // Item handlers
  const addItem = () => {
    setItems((prev) => [...prev, { key: nextItemKey(), name: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const updateItem = (key: string, field: keyof Omit<EditableItem, 'key'>, value: string | number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (isBelowPaid) {
      toast.error(`Total amount cannot be less than already paid amount of ${formatNaira(amountPaid)}`);
      return;
    }

    // Validate items if present
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        if (!items[i].name.trim()) {
          toast.error(`Item ${i + 1}: Name is required`);
          return;
        }
        if (items[i].quantity <= 0) {
          toast.error(`Item ${i + 1}: Quantity must be greater than 0`);
          return;
        }
        if (items[i].unitPrice < 0) {
          toast.error(`Item ${i + 1}: Unit price cannot be negative`);
          return;
        }
      }
    }

    const trimmedEmail = customerEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || '',
        customerEmail: trimmedEmail || '',
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        reminderDate: reminderDate || undefined,
        guarantorName: guarantorName.trim() || '',
        guarantorPhone: guarantorPhone.trim() || '',
        notes: notes.trim() || '',
      };

      // Include items if present
      if (items.length > 0) {
        payload.items = items.map((item) => ({
          name: item.name.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }));
      }

      await updateCredit(businessId, credit.id, payload);
      toast.success('Debtor record updated');
      onUpdated?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => !loading && onClose()}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white border border-gray-200 shadow-xl w-full max-w-2xl mx-4 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 text-primary-600 flex items-center justify-center shadow-xs">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Edit Debtor Record</h2>
              <p className="text-[11px] text-gray-500">Update debtor, items, guarantor, and schedule details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="space-y-5">
            {/* Debtor Information */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Debtor Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Customer Name"
                  placeholder="e.g. Alhaji Musa"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                  required
                />
                <Input
                  label="Phone Number"
                  placeholder="e.g. 08012345678"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Customer Email"
                    type="email"
                    placeholder="e.g. customer@email.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                  />
                  {!customerEmail.trim() ? (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      No email on file — add one to enable automatic due reminders.
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Debtor will receive payment reminders when due.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Products / Services (Line Items) */}
            {hasLineItems && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Package className="h-3 w-3" />
                    Products / Services
                  </h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1 text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-end"
                    >
                      <div>
                        {index === 0 && (
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Item Name</label>
                        )}
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.key, 'name', e.target.value)}
                          placeholder="Product or service"
                          className="w-full border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all"
                        />
                      </div>
                      <div>
                        {index === 0 && (
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Qty</label>
                        )}
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.key, 'quantity', Math.max(0.01, parseFloat(e.target.value) || 0))}
                          min="0.01"
                          step="any"
                          className="w-full border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all text-center"
                        />
                      </div>
                      <div>
                        {index === 0 && (
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit Price</label>
                        )}
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.key, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                          min="0"
                          step="any"
                          className="w-full border border-gray-300 px-2 py-1.5 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all text-right"
                        />
                      </div>
                      <div>
                        {index === 0 && (
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Total</label>
                        )}
                        <div className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600 text-right font-medium">
                          {formatNaira(Math.round(item.quantity * item.unitPrice * 100) / 100)}
                        </div>
                      </div>
                      <div>
                        {index === 0 && <div className="h-[14px] mb-1" />}
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="h-[30px] w-full flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary strip */}
                <div className="mt-3 p-3 bg-gray-50 border border-gray-200 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 font-medium">Total Amount</span>
                    <span className={`font-bold ${isBelowPaid ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatNaira(computedTotal)}
                    </span>
                  </div>
                  {amountPaid > 0 && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Already Paid</span>
                        <span className="text-green-600 font-medium">{formatNaira(amountPaid)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-gray-200 pt-1">
                        <span className="text-gray-500 font-medium">Remaining Balance</span>
                        <span className={`font-bold ${isBelowPaid ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatNaira(computedBalance)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Invariant warning */}
                {isBelowPaid && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700">
                      Total amount ({formatNaira(computedTotal)}) cannot be less than already paid amount ({formatNaira(amountPaid)}).
                      Increase item quantities or prices, or add more items.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Credit Details */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Credit Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Input
                    label="Description"
                    placeholder="Goods / services sold on credit"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                  />
                </div>
                <Input
                  label="Payment Due Date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                />
                <Input
                  label="Reminder Date"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                />
              </div>
            </div>

            {/* Guarantor Information */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Guarantor / Surety Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Guarantor Name"
                  placeholder="e.g. Alhaji Ibrahim"
                  value={guarantorName}
                  onChange={(e) => setGuarantorName(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                />
                <Input
                  label="Guarantor Phone"
                  placeholder="e.g. 08098765432"
                  value={guarantorPhone}
                  onChange={(e) => setGuarantorPhone(e.target.value)}
                  className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Internal Notes
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add private notes about this credit obligation..."
                rows={3}
                className="block w-full rounded-none border border-gray-300 px-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all resize-none"
                maxLength={2000}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="rounded-none border-gray-300 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={loading}
            disabled={isBelowPaid}
            className="rounded-none text-xs"
          >
            Save Changes
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
