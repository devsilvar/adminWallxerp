import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldCheck, Lock, Eye, EyeOff, CreditCard, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { maskPhoneSuffix } from '@/lib/format';

type Props = {
  isOpen: boolean;
  businessId: string;
  requiredAmount: number;
  onClose: () => void;
  onAuthorized: (data: {
    customerId: string;
    customerName: string;
    voucherPin: string;
    voucherLast4: string;
    availableBalance: number;
  }) => void;
};

export default function VoucherAuthModal({
  isOpen,
  businessId,
  requiredAmount,
  onClose,
  onAuthorized,
}: Props) {
  const { lookupVoucher } = useCustomerStore();
  const [pin, setPin] = useState('');
  const [last4, setLast4] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'pin' | 'confirm'>('pin');
  const [verified, setVerified] = useState<{
    customer: { id: string; name: string; phone?: string | null; email?: string | null };
    card: { id: string; balance: number; isActive: boolean };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setLast4('');
      setStep('pin');
      setVerified(null);
      setError(null);
      setShowPin(false);
    }
  }, [isOpen]);

  const canVerify = /^\d{6}$/.test(pin.trim()) && /^\d{4}$/.test(last4.trim()) && !loading;

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await lookupVoucher(businessId, pin.trim(), last4.trim());
      setVerified(v);
      setStep('confirm');
    } catch (err: unknown) {
      let code: string | undefined;
      let msg = '';
      let status: number | undefined;

      if (axios.isAxiosError<{ error?: { code?: string; message?: string } }>(err)) {
        code = err.response?.data?.error?.code;
        msg = err.response?.data?.error?.message || '';
        status = err.response?.status;
      }

      if (code === 'VOUCHER_PIN_LOCKED' || status === 423) {
        setError(msg || 'PIN locked. Try again later.');
      } else if (code === 'VOUCHER_LOOKUP_RATE_LIMITED' || status === 429) {
        setError('Too many tries. Wait 15 minutes or ask a manager.');
      } else {
        setError('Invalid PIN or phone. Check with the customer and retry.');
      }
    } finally {
      setLoading(false);
    }
  };

  const insufficient = verified ? verified.card.balance < requiredAmount : false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'pin' ? 'Pay with Store Voucher' : 'Voucher Verified'}
      subtitle={
        step === 'pin'
          ? 'Enter the customer PIN + last 4 of phone'
          : 'Review and confirm to use voucher'
      }
    >
      {step === 'pin' ? (
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
              1
            </span>{' '}
            Enter PIN + Last 4
            <span className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400">2 • Confirm</span>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">
              6-Digit Voucher PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                placeholder={showPin ? '123456' : '••••••'}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-3 pr-10 text-center text-lg font-mono tracking-[0.4em] border-2 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">{pin.length}/6 digits</div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">
              Last 4 digits of customer's phone <span className="text-red-500">*</span>
            </label>
            <input
              inputMode="numeric"
              maxLength={4}
              placeholder="e.g. 5678"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-3 text-center text-lg font-mono tracking-[0.4em] border-2 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Ask the customer to confirm the last 4 of the phone on file.
            </p>
          </div>
          {error && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canVerify}
              onClick={handleVerify}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 p-3 bg-gray-50 border rounded-xl">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
              {verified!.customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{verified!.customer.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {verified!.customer.phone || 'No phone'} • ●●
                {maskPhoneSuffix(verified!.customer.phone) || '----'}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                insufficient
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              ₦{verified!.card.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border rounded-lg px-3 py-2">
              <div className="text-[11px] uppercase font-bold text-gray-500">Sale total</div>
              <div className="text-sm font-extrabold">
                ₦{requiredAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div
              className={`border rounded-lg px-3 py-2 ${
                insufficient ? 'bg-red-50 border-red-200' : 'bg-white border-emerald-200'
              }`}
            >
              <div className="text-[11px] uppercase font-bold flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Voucher balance
              </div>
              <div
                className={`text-sm font-extrabold ${
                  insufficient ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                ₦{verified!.card.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          {insufficient && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Insufficient balance. Top up or reduce items — server will verify on Create.
            </div>
          )}
          <div className="flex items-start gap-2 p-3 bg-gray-50 border rounded-xl text-xs text-gray-700">
            <ShieldCheck className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            PIN + last 4 verified. Balance shown after proof-of-possession.
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep('pin');
                setError(null);
              }}
              className="rounded-full"
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onAuthorized({
                  customerId: verified!.customer.id,
                  customerName: verified!.customer.name,
                  voucherPin: pin.trim(),
                  voucherLast4: last4.trim(),
                  availableBalance: verified!.card.balance,
                });
                onClose();
              }}
              className={`rounded-full px-5 ${
                insufficient ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'
              } text-white`}
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Use Voucher
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
