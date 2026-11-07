import { useState, useEffect, useId, type FormEvent } from 'react';
import { UserPlus, Sparkles, ChevronDown, CreditCard } from 'lucide-react';
import Modal from '@/components/ui/Modal.tsx';
import Input from '@/components/ui/Input.tsx';
import Button from '@/components/ui/Button.tsx';
import PhoneInput, { extractLocalNigerianDigits } from '@/components/ui/PhoneInput.tsx';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { formatNaira } from '@/lib/format.ts';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { getErrorMessage } from '@/lib/axios.ts';
import type { Customer, VoucherLedgerRequest } from '@/types/index.ts';

interface CustomerVoucherCreateModalProps {
  isOpen: boolean;
  businessId: string;
  initialName?: string;
  initialPhone?: string;
  initialEmail?: string;
  onClose: () => void;
  onCreated: (customer: Customer, voucherRequest: VoucherLedgerRequest | null) => void;
}

export default function CustomerVoucherCreateModal({
  isOpen,
  businessId,
  initialName = '',
  initialPhone = '',
  initialEmail = '',
  onClose,
  onCreated,
}: CustomerVoucherCreateModalProps) {
  useDisplayCurrency();
  const formId = useId();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const quickCreateWithVoucher = useCustomerStore((s) => s.quickCreateWithVoucher);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [initialTopUpAmount, setInitialTopUpAmount] = useState('');
  const [bonusPct, setBonusPct] = useState('');
  const [showAddressSection, setShowAddressSection] = useState(false);
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial prefilled values from sales form whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setPhone(initialPhone || '');
      setEmail(initialEmail || '');
      setAddress('');
      setNotes('');
      setInitialTopUpAmount('');
      setBonusPct('');
      setShowAddressSection(false);
      setShowNotesSection(false);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialName, initialPhone, initialEmail]);

  const storeBonusPct = activeBusiness?.voucherBonusPct ?? 0;
  const effectiveBonusPct =
    bonusPct !== '' && !isNaN(Number(bonusPct))
      ? Math.min(Math.max(Number(bonusPct), 0), 10)
      : storeBonusPct;

  const fundingAmount =
    initialTopUpAmount !== '' && !isNaN(Number(initialTopUpAmount))
      ? Math.max(0, Number(initialTopUpAmount))
      : 0;

  const bonusAmount = fundingAmount > 0 ? Math.round((fundingAmount * effectiveBonusPct) / 100) : 0;
  const totalCredited = fundingAmount + bonusAmount;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Customer full name is required');
      return;
    }

    const localDigits = extractLocalNigerianDigits(phone);
    if (localDigits.length < 10) {
      setError('Valid Nigerian phone number with at least 10 digits is required');
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please provide a valid email address');
      return;
    }

    if (fundingAmount > 10_000_000) {
      setError('Initial top-up amount cannot exceed ₦10,000,000');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await quickCreateWithVoucher(businessId, {
        name: trimmedName,
        phone: phone.trim(),
        email: trimmedEmail || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        initialTopUpAmount: fundingAmount > 0 ? fundingAmount : undefined,
        bonusPct: bonusPct !== '' ? effectiveBonusPct : undefined,
      });

      onCreated(result.customer, result.voucherRequest);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create customer and store voucher'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Customer & Store Voucher"
      subtitle="Register customer details and instantly generate a secure 6-digit PIN virtual store voucher."
      icon={<UserPlus className="w-5 h-5 text-emerald-600" />}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {isSubmitting
              ? 'Creating...'
              : fundingAmount > 0
                ? 'Create & Queue Voucher'
                : 'Create Customer & Card'}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-md">
            {error}
          </div>
        )}

        {/* Identity Fields */}
        <div className="space-y-3">
          <Input
            label="Full Name *"
            placeholder="e.g. Alhaji Aliko Dangote"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <PhoneInput
              label="Phone Number *"
              value={phone}
              onChange={(full) => setPhone(full)}
              placeholder="803 123 4567"
              required
              helperText="Saved as +234. Customer uses their phone number + PIN to authenticate store voucher debits."
            />
          </div>

          <div>
            <Input
              label="Email Address (Optional)"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Customer receives their initial card PIN and receipts at this email address.
            </p>
          </div>
        </div>

        {/* Collapsible Location */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAddressSection((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left text-xs font-semibold text-gray-700 transition-colors"
          >
            <span>Street Address (Optional)</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showAddressSection ? 'rotate-180' : ''}`}
            />
          </button>
          {showAddressSection && (
            <div className="p-3 bg-white border-t border-gray-100">
              <Input
                label="Street Address"
                placeholder="e.g. 15 Commercial Avenue, Ikeja"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Collapsible Notes */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowNotesSection((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left text-xs font-semibold text-gray-700 transition-colors"
          >
            <span>Internal Notes (Optional)</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showNotesSection ? 'rotate-180' : ''}`}
            />
          </button>
          {showNotesSection && (
            <div className="p-3 bg-white border-t border-gray-100">
              <Input
                label="Notes"
                placeholder="e.g. Preferred delivery customer, VIP client"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Voucher Funding Card */}
        <div className="border border-emerald-200/90 bg-emerald-50/30 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
              Initial Voucher Funding (Optional)
            </h4>
          </div>

          <p className="text-[11px] text-emerald-800/90 leading-relaxed">
            Leave 0 or blank for an instant zero-balance virtual card. If funded, balance credit will
            queue for manager authorization and customer email verification.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Input
                label="Fund Voucher Now (₦)"
                type="number"
                min="0"
                max="10000000"
                step="100"
                placeholder="0"
                value={initialTopUpAmount}
                onChange={(e) => setInitialTopUpAmount(e.target.value)}
              />
              <p className="text-[11px] text-emerald-800/80 mt-1">
                Initial prepaid balance
              </p>
            </div>

            <div>
              <Input
                label="Bonus Rate % (Optional)"
                type="number"
                min="0"
                max="10"
                step="0.5"
                placeholder={`Store: ${storeBonusPct}%`}
                value={bonusPct}
                onChange={(e) => setBonusPct(e.target.value)}
              />
              <p className="text-[11px] text-emerald-800/80 mt-1">
                Leave blank to use store default ({storeBonusPct}%)
              </p>
            </div>
          </div>

          {fundingAmount > 0 && (
            <div className="mt-2 p-2.5 bg-emerald-100/70 border border-emerald-300 rounded text-xs space-y-1.5 text-emerald-950">
              <div className="flex items-center justify-between font-medium">
                <span className="flex items-center gap-1.5 text-emerald-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Top-up amount:
                </span>
                <span className="font-mono font-semibold">{formatNaira(fundingAmount)}</span>
              </div>
              {effectiveBonusPct > 0 && (
                <div className="flex items-center justify-between text-emerald-800 text-[11px]">
                  <span>Bonus reward ({effectiveBonusPct}%):</span>
                  <span className="font-mono font-medium">+{formatNaira(bonusAmount)}</span>
                </div>
              )}
              <div className="border-t border-emerald-300/70 pt-1.5 flex items-center justify-between font-bold text-emerald-950">
                <span>Total credited upon verification:</span>
                <span className="font-mono text-sm text-emerald-900">{formatNaira(totalCredited)}</span>
              </div>
              <p className="text-[10px] text-emerald-700 italic pt-0.5">
                Funding request will land in Manager Approval Queue and await customer email magic link confirmation.
              </p>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
