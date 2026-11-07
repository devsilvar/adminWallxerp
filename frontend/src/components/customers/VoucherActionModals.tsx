import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { getErrorMessage } from '@/lib/axios.ts';
import { maskPhoneSuffix, formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { Customer } from '@/types/index.ts';

export interface VoucherModalProps {
  isOpen: boolean;
  businessId: string;
  customer: Customer | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export interface VoucherHistoryModalProps {
  isOpen: boolean;
  businessId: string;
  customer: Customer | null;
  onClose: () => void;
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * TopUpVoucherModal
 * Handles cash deposits to increase prepaid voucher balance.
 */
export function TopUpVoucherModal({
  isOpen,
  businessId,
  customer,
  onClose,
  onSuccess,
}: VoucherModalProps) {
  const topUpCard = useCustomerStore((s) => s.topUpCard);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);

  const [topUpAmount, setTopUpAmount] = useState<string>('');
  const [topUpBonusPct, setTopUpBonusPct] = useState<string>('');
  const [topUpNotes, setTopUpNotes] = useState<string>('');
  const [topUpSource, setTopUpSource] = useState<'cash' | 'bank_transfer'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTopUpAmount('');
      setTopUpBonusPct('');
      setTopUpNotes('');
      setTopUpSource('cash');
      setIsSubmitting(false);
    }
  }, [isOpen, customer]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !customer) return;

    const num = Number(topUpAmount);
    if (isNaN(num) || num <= 0) {
      toast.error('Please enter a valid top-up amount');
      return;
    }

    const bonusOverride = topUpBonusPct.trim() === '' ? undefined : Number(topUpBonusPct);
    if (bonusOverride !== undefined && (isNaN(bonusOverride) || bonusOverride < 0 || bonusOverride > 10)) {
      toast.error('Bonus must be between 0 and 10%');
      return;
    }

    setIsSubmitting(true);
    try {
      const res: any = await topUpCard(businessId, customer.id, {
        amount: num,
        bonusPct: bonusOverride,
        notes: topUpNotes.trim() || 'Prepaid voucher deposit',
        source: topUpSource,
      });

      if (res?.status === 'pending' || res?.data?.status === 'pending') {
        toast.success(`Top-up requested for ${customer.name} — queued for manager authorization`);
      } else if (res?.status === 'awaiting_customer' || res?.data?.status === 'awaiting_customer') {
        toast.success('Top-up request created — verification link sent to customer.');
      } else {
        const bonus = bonusOverride !== undefined ? bonusOverride : (customer.voucherBonusPct ?? activeBusiness?.voucherBonusPct ?? 0);
        const credited = bonus > 0 ? Math.round(num * (1 + bonus / 100)) : num;

        toast.success(
          bonus > 0
            ? `₦${num.toLocaleString()} + ${bonus}% bonus (₦${Math.round((num * bonus) / 100).toLocaleString()}) → ₦${credited.toLocaleString()} credited to ${customer.name}!`
            : `₦${num.toLocaleString()} credited to ${customer.name}'s voucher!`
        );
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to top up card'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentBalance = customer.card ? Number(customer.card.balance) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Top Up Voucher — ${customer.name}`}
      subtitle={`Current Balance: ₦${currentBalance.toLocaleString()}`}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Amount to Deposit (₦) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="50"
            step="any"
            placeholder="e.g. 2000"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(e.target.value)}
            className="w-full px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            required
            autoFocus
          />
          <div className="flex gap-1.5 mt-2">
            {[500, 1000, 2000, 5000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTopUpAmount(String(preset))}
                className="text-[11px] py-1 px-2.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
              >
                +₦{preset.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Payment Source <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTopUpSource('cash')}
              className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center flex items-center justify-center gap-1.5 ${
                topUpSource === 'cash'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>💵 Cash</span>
            </button>
            <button
              type="button"
              onClick={() => setTopUpSource('bank_transfer')}
              className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center flex items-center justify-center gap-1.5 ${
                topUpSource === 'bank_transfer'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>🏦 Bank Transfer</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <label className="block text-xs font-bold text-amber-900 mb-1.5">
            Bonus extra — your retention thank-you (optional)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                placeholder={(() => {
                  const eff = customer.voucherBonusPct ?? activeBusiness?.voucherBonusPct ?? 0;
                  return eff > 0 ? `Store ${eff}% (leave blank to use)` : '0 — leave blank for store default';
                })()}
                value={topUpBonusPct}
                onChange={(e) => setTopUpBonusPct(e.target.value)}
                className="w-full px-3 py-2 pr-8 text-sm font-bold border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 outline-none tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">
                %
              </span>
            </div>
            {topUpBonusPct !== '' && (
              <button
                type="button"
                onClick={() => setTopUpBonusPct('')}
                className="px-2.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 underline"
              >
                Use default
              </button>
            )}
          </div>
          {(() => {
            const num = Number(topUpAmount) || 0;
            if (!num) {
              return (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Enter an amount to see preview. Customer personal:{' '}
                  {customer.voucherBonusPct !== null && customer.voucherBonusPct !== undefined
                    ? `${customer.voucherBonusPct}%`
                    : `inherits store ${activeBusiness?.voucherBonusPct ?? 0}%`}
                  .
                </p>
              );
            }
            const eff =
              topUpBonusPct.trim() !== ''
                ? Number(topUpBonusPct)
                : (customer.voucherBonusPct ?? activeBusiness?.voucherBonusPct ?? 0);
            const bonus = eff > 0 ? Math.round((num * eff) / 100) : 0;
            const credited = num + bonus;
            return (
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                  eff > 0
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-white border border-zinc-200 text-zinc-600'
                }`}
              >
                {eff > 0 ? (
                  <>
                    Customer pays <span className="font-bold">₦{num.toLocaleString()}</span> → voucher gets{' '}
                    <span className="font-extrabold">₦{credited.toLocaleString()}</span>{' '}
                    <span className="font-bold text-emerald-700">
                      (+₦{bonus.toLocaleString()} · {eff}% bonus)
                    </span>
                  </>
                ) : (
                  <>
                    No bonus — voucher gets exactly <span className="font-bold">₦{num.toLocaleString()}</span>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Deposit Note / Reference (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Cash received at register, change advance"
            value={topUpNotes}
            onChange={(e) => setTopUpNotes(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
          Top-up deposits are customer liabilities. They increase the customer's available voucher balance and only
          count as earned taxable revenue when redeemed on a sale.
        </div>

        <div className="pt-3 border-t flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || !Number(topUpAmount)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                Crediting...
              </>
            ) : (
              'Credit Voucher Balance'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * AdjustBalanceModal
 * Handles manual adjustments to customer voucher balances (positive credit or negative deduction).
 */
export function AdjustBalanceModal({
  isOpen,
  businessId,
  customer,
  onClose,
  onSuccess,
}: VoucherModalProps) {
  const createVoucherRequest = useCustomerStore((s) => s.createVoucherRequest);

  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAdjustAmount('');
      setAdjustReason('');
      setIsSubmitting(false);
    }
  }, [isOpen, customer]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !customer) return;

    const num = Number(adjustAmount);
    if (isNaN(num) || num === 0) {
      toast.error('Adjustment amount cannot be zero');
      return;
    }
    if (!adjustReason.trim()) {
      toast.error('Adjustment reason is required');
      return;
    }
    if (adjustReason.trim().length < 10) {
      toast.error('Adjustment reason must be at least 10 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await createVoucherRequest(businessId, {
        kind: 'adjustment',
        customerId: customer.id,
        amount: num,
        reason: adjustReason.trim(),
      });
      toast.success(
        num > 0
          ? `Adjustment requested for ${customer.name} — requires manager authorization & customer verification`
          : `Deduction request queued for ${customer.name} — awaiting authorization`
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to request adjustment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Adjust Balance — ${customer.name}`}
      subtitle="Owner & Manager balance override"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Adjustment Amount (₦) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="any"
            placeholder="Positive to add, negative to subtract (e.g. 500 or -500)"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            required
            autoFocus
          />
          <p className="text-[10px] text-gray-400 mt-1">Use a negative sign (-) to deduct balance.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Reason for Adjustment <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Correcting cashier entry error on receipt #1042"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            required
          />
          <p className="text-[10px] text-gray-400 mt-1">Must be at least 10 characters explaining the change.</p>
        </div>

        <div className="pt-3 border-t flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || !Number(adjustAmount) || adjustReason.trim().length < 10}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                Saving...
              </>
            ) : (
              'Apply Adjustment'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * ChangePinModal
 * Allows manager or owner to update a customer's 6-digit PIN with phone verification.
 */
export function ChangePinModal({
  isOpen,
  businessId,
  customer,
  onClose,
  onSuccess,
}: VoucherModalProps) {
  const changeVoucherPin = useCustomerStore((s) => s.changeVoucherPin);

  const [pinOldPin, setPinOldPin] = useState<string>('');
  const [pinNewPin, setPinNewPin] = useState<string>('');
  const [pinLast4, setPinLast4] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPinOldPin('');
      setPinNewPin('');
      setPinLast4('');
      setIsSubmitting(false);
    }
  }, [isOpen, customer]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !customer) return;

    if (!/^\d{6}$/.test(pinOldPin.trim())) {
      toast.error('Old PIN must be exactly 6 digits');
      return;
    }
    if (!/^\d{6}$/.test(pinNewPin.trim())) {
      toast.error('New PIN must be exactly 6 digits');
      return;
    }
    if (!/^\d{4}$/.test(pinLast4.trim())) {
      toast.error('Last 4 digits of phone must be exactly 4 digits');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changeVoucherPin(businessId, customer.id, {
        oldPin: pinOldPin.trim(),
        newPin: pinNewPin.trim(),
        last4Phone: pinLast4.trim(),
      });
      toast.success(res.message || 'Voucher PIN changed successfully');
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to change PIN'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Change Voucher PIN — ${customer.name}`}
      subtitle="Update customer's 6-digit voucher PIN"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Old 6-Digit PIN <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            maxLength={6}
            placeholder="••••••"
            value={pinOldPin}
            onChange={(e) => setPinOldPin(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 text-center text-lg font-mono tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            New 6-Digit PIN <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            maxLength={6}
            placeholder="••••••"
            value={pinNewPin}
            onChange={(e) => setPinNewPin(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 text-center text-lg font-mono tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Last 4 Digits of Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            maxLength={4}
            placeholder="●●●●"
            value={pinLast4}
            onChange={(e) => setPinLast4(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 text-center text-lg font-mono tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            required
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Verification: {customer.phone || 'Phone on file'}
          </p>
        </div>

        <div className="pt-3 border-t flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              isSubmitting ||
              pinOldPin.length !== 6 ||
              pinNewPin.length !== 6 ||
              pinLast4.length !== 4
            }
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                Changing...
              </>
            ) : (
              'Change PIN'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * VoucherHistoryModal
 * Displays full statement and ledger of all voucher transactions for a customer.
 */
export function VoucherHistoryModal({
  isOpen,
  businessId,
  customer,
  onClose,
}: VoucherHistoryModalProps) {
  useDisplayCurrency();
  const { activeCustomerCard, cardLoading, fetchCustomerCard } = useCustomerStore();

  useEffect(() => {
    if (isOpen && customer && businessId) {
      fetchCustomerCard(businessId, customer.id).catch(() => {});
    }
  }, [isOpen, customer, businessId, fetchCustomerCard]);

  if (!isOpen || !customer) return null;

  const balance = activeCustomerCard?.card.balance ?? (customer.card ? Number(customer.card.balance) : 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Voucher Statement — ${customer.name}`}
      subtitle={`Phone: ${customer.phone || '—'}`}
    >
      <div className="space-y-4 py-1">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500">Available Voucher Balance</span>
            <div className="text-xl font-bold text-gray-900">{formatNaira(balance)}</div>
          </div>
          {customer.phone && (
            <div className="text-right font-mono text-xs text-gray-500">
              Suffix: <span className="font-bold text-gray-800">●●{maskPhoneSuffix(customer.phone)}</span>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
            Card Transaction History
          </h3>
          {cardLoading ? (
            <div className="py-8 text-center text-xs text-gray-400">Loading ledger...</div>
          ) : !activeCustomerCard?.card.ledgers || activeCustomerCard.card.ledgers.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No card activity recorded yet for this customer.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {activeCustomerCard.card.ledgers.map((l) => (
                <div
                  key={l.id}
                  className="p-2.5 bg-white border border-gray-100 rounded hover:bg-gray-50 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-gray-900 capitalize flex items-center gap-1.5">
                      <span>{l.type.replace('_', ' ')}</span>
                      {l.receiptNumber && (
                        <span className="text-[10px] text-gray-400 font-mono">#{l.receiptNumber}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400">{formatDateTime(l.createdAt)}</div>
                    {l.notes && <div className="text-[11px] text-gray-600 mt-0.5">{l.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        l.type === 'sale_debit' ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {l.type === 'sale_debit' ? '-' : '+'} {formatNaira(Number(l.amount))}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      Bal: {formatNaira(Number(l.balanceAfter))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
