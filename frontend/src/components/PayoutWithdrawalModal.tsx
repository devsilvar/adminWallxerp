import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import { formatNgn } from '@/lib/format';
import { estimateWithdrawal, calculateMaxWithdrawable } from '@/lib/fees';
import { useSettlementStore, type SettlementPayoutItem } from '@/stores/settlement.store';
import { usePinStore } from '@/stores/pin.store';
import toast from 'react-hot-toast';

interface PayoutWithdrawalModalProps {
  businessId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ModalStage = 'input' | 'confirm' | 'success';

export default function PayoutWithdrawalModal({
  businessId,
  isOpen,
  onClose,
  onSuccess,
}: PayoutWithdrawalModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const { preview, withdrawBalance, withdrawing } = useSettlementStore();
  const { verifyPin, isLocked, remainingAttempts, fetchStatus } = usePinStore();

  const [stage, setStage] = useState<ModalStage>('input');
  const [amountStr, setAmountStr] = useState('');
  const [narration, setNarration] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // In-modal PIN authorization state
  const [digits, setDigits] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const [completedPayout, setCompletedPayout] = useState<SettlementPayoutItem | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('input');
      setAmountStr('');
      setNarration('');
      setShowBreakdown(false);
      setDigits(['', '', '', '']);
      setShowPin(false);
      setCompletedPayout(null);
      fetchStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (stage === 'confirm') {
      setDigits(['', '', '', '']);
      setTimeout(() => {
        pinInputRefs[0].current?.focus();
      }, 100);
    }
  }, [stage]);

  if (!isOpen || !preview) return null;

  const available = preview.availableForWithdrawal || 0;
  const numAmount = parseFloat(amountStr) || 0;
  const minWithdrawal = preview.fees?.withdrawal?.minAmount ?? preview.fees?.minWithdrawal ?? 1000;
  const feeEstimate = preview.fees ? estimateWithdrawal(preview.fees, numAmount) : null;
  const isAmountValid =
    numAmount >= minWithdrawal &&
    numAmount <= available &&
    (!feeEstimate || feeEstimate.debitAmount <= available);

  const handleMaxClick = () => {
    if (available < minWithdrawal) return;
    let maxBudget = available;
    if (preview?.dailyPayoutLimit && preview.dailyPayoutLimit > 0 && typeof preview.dailyRemaining === 'number') {
      maxBudget = Math.min(available, preview.dailyRemaining);
    }
    const maxRequested = calculateMaxWithdrawable(maxBudget, preview.fees);
    setAmountStr(String(maxRequested));
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAmountValid) {
      if (numAmount < minWithdrawal) {
        toast.error(`Minimum withdrawal amount is ${formatNgn(minWithdrawal)}`);
      } else if (numAmount > available) {
        if ((preview.pendingWithdrawn ?? 0) > 0) {
          toast.error(
            `${formatNgn(preview.pendingWithdrawn)} is currently reserved by a withdrawal that's in flight. Check the Withdrawals tab.`,
            { duration: 6000 }
          );
        } else {
          toast.error('Amount exceeds available withdrawable balance');
        }
      } else {
        toast.error('Amount plus fee exceeds your available balance');
      }
      return;
    }

    if (preview?.dailyPayoutLimit && preview.dailyPayoutLimit > 0 && typeof preview.dailyRemaining === 'number') {
      const requiredDebit = feeEstimate ? feeEstimate.debitAmount : numAmount;
      if (requiredDebit > preview.dailyRemaining) {
        toast.error(`Amount exceeds your remaining daily payout allowance of ${formatNgn(preview.dailyRemaining)}`);
        return;
      }
    }

    if (!preview.security.hasPin) {
      toast.error('Please configure your 4-digit Transaction PIN in Settings first');
      return;
    }

    if (preview.security.isPinLocked || isLocked) {
      toast.error('Transaction PIN is currently locked due to previous failed attempts');
      return;
    }

    setStage('confirm');
  };

  const handleDigitChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }

    // Auto submit on 4th digit
    if (digit && index === 3) {
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        executeWithdrawalWithPin(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      pinInputRefs[3].current?.focus();
      executeWithdrawalWithPin(pasted);
    }
  };

  const executeWithdrawalWithPin = async (pinValue?: string) => {
    const pin = pinValue || digits.join('');
    if (pin.length !== 4) {
      toast.error('Please enter your complete 4-digit PIN');
      return;
    }

    setVerifyingPin(true);
    try {
      const verifyRes = await verifyPin(pin);
      if (!verifyRes.valid || !verifyRes.stepUpToken) {
        setDigits(['', '', '', '']);
        pinInputRefs[0].current?.focus();
        return;
      }

      const result = await withdrawBalance(businessId, {
        amount: numAmount,
        stepUpToken: verifyRes.stepUpToken,
        narration: narration.trim() || undefined,
      });

      if (result) {
        setCompletedPayout(result);
        setStage('success');
        if (onSuccess) onSuccess();
      }
    } catch {
      setDigits(['', '', '', '']);
      pinInputRefs[0].current?.focus();
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleCloseAll = () => {
    setCompletedPayout(null);
    setAmountStr('');
    setNarration('');
    setStage('input');
    onClose();
  };

  const isPending = completedPayout?.status === 'pending';

  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 cursor-default" onClick={handleCloseAll} />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-md max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Pinned Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            {stage === 'confirm' ? (
              <button
                type="button"
                onClick={() => setStage('input')}
                className="flex h-7 w-7 items-center justify-center rounded-none border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Back to amount"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-none bg-gray-900 text-white">
                <Building2 className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">
                {stage === 'confirm'
                  ? 'Authorize Withdrawal'
                  : stage === 'success'
                  ? 'Withdrawal Status'
                  : 'Withdraw Funds'}
              </h3>
              <p className="text-[11px] text-gray-500 font-mono">
                {preview.settlementAccount.bankName} ••••
                {preview.settlementAccount.accountNumber?.slice(-4)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseAll}
            className="rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* STAGE 1: AMOUNT INPUT */}
          {stage === 'input' && (
            <form onSubmit={handleProceedToConfirm} className="space-y-4">
              {/* Withdrawable Balance Card */}
              <div className="rounded-none bg-gray-50 border border-gray-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">
                    Wallet Balance
                  </span>
                  <span className="text-lg font-bold text-gray-900 font-mono tabular-nums">
                    {formatNgn(available)}
                  </span>
                </div>

                {/* Collapsible Balance Details Toggle */}
                <button
                  type="button"
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer select-none"
                >
                  <span>{showBreakdown ? 'Hide balance breakdown' : 'View balance breakdown'}</span>
                  {showBreakdown ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                {showBreakdown && (
                  <div className="border-t border-gray-200 pt-2 space-y-1.5 text-[11px] text-gray-600 animate-in fade-in">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Inflows:</span>
                      <span className="font-semibold font-mono text-gray-900">{formatNgn(preview.pooledInflows ?? preview.totalInflows)}</span>
                    </div>
                    {Boolean(((preview.pooledPendingSettlement ?? preview.pendingSettlement) ?? 0) > 0) && (
                      <div className="flex justify-between" title="Held in settlement — available on next business day (T+1)">
                        <span className="text-gray-500">In settlement (T+1):</span>
                        <span className="font-semibold font-mono text-amber-700">{formatNgn((preview.pooledPendingSettlement ?? preview.pendingSettlement)!)}</span>
                      </div>
                    )}
                    {Boolean((preview.totalSplitSettled ?? 0) > 0) && (
                      <div className="flex justify-between" title="Cleared by Paystack to your commercial bank on daily schedule">
                        <span className="text-gray-500">Auto-routed to bank (T+1):</span>
                        <span className="font-semibold font-mono text-gray-900">{formatNgn(preview.totalSplitSettled!)}</span>
                      </div>
                    )}
                    {((preview.pooledTotalWithdrawn ?? preview.totalWithdrawn) > 0) && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Withdrawn / in progress:</span>
                        <span className="font-semibold font-mono text-gray-900">{formatNgn(preview.pooledTotalWithdrawn ?? preview.totalWithdrawn)}</span>
                      </div>
                    )}
                    {Boolean((preview.dailyPayoutLimit ?? 0) > 0) && (
                      <div className="flex justify-between" title="Daily rolling payout allowance across all owned businesses">
                        <span className="text-gray-500">Daily limit:</span>
                        <span className="font-semibold font-mono text-gray-900">{formatNgn(preview.dailyPayoutLimit!)}</span>
                      </div>
                    )}
                    {Boolean((preview.dailyPayoutLimit ?? 0) > 0) && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Remaining today:</span>
                        <span className="font-semibold font-mono text-emerald-700">{formatNgn(preview.dailyRemaining ?? 0)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status Alerts */}
              {!preview.security.hasPin && (
                <div className="rounded-none bg-amber-50 border border-amber-300 p-2.5 flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Transaction PIN Required</p>
                    <p className="text-amber-800 text-[11px]">
                      Configure your 4-digit PIN in Settings &gt; Security before withdrawing.
                    </p>
                  </div>
                </div>
              )}

              {(preview.security.isPinLocked || isLocked) && (
                <div className="rounded-none bg-red-50 border border-red-300 p-2.5 flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">PIN Temporarily Locked</p>
                    <p className="text-red-700 text-[11px]">Locked for 15 minutes due to failed attempts.</p>
                  </div>
                </div>
              )}

              {(preview.pendingWithdrawn ?? 0) > 0 && (
                <div className="rounded-none bg-amber-50 border border-amber-300 p-2.5 flex items-start gap-2 text-xs">
                  <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Withdrawal In Progress</p>
                    <p className="text-amber-800 text-[11px]">
                      {formatNgn(preview.pendingWithdrawn)} is currently reserved while your transfer completes. Remaining available: {formatNgn(available)}.
                    </p>
                  </div>
                </div>
              )}

              {/* Amount Input Block */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="modal-withdrawal-amount" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Withdrawal Amount
                  </label>
                  <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-none border border-gray-300 font-mono">
                    Min: ₦1,000.00
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold text-sm pointer-events-none">
                    ₦
                  </span>
                  <Input
                    id="modal-withdrawal-amount"
                    name="withdrawal-amount"
                    type="number"
                    min={minWithdrawal}
                    max={available}
                    step={100}
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="pl-8 pr-16 font-mono text-base font-bold text-gray-900 rounded-none border-gray-300 focus:border-gray-900 focus:ring-0"
                    disabled={available < minWithdrawal}
                    required
                    autoComplete="off"
                    autoFocus
                  />
                  {available >= minWithdrawal && (
                    <button
                      type="button"
                      onClick={handleMaxClick}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-bold text-gray-900 hover:bg-gray-200 bg-gray-100 border border-gray-300 rounded-none transition-colors cursor-pointer select-none"
                    >
                      Max
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-gray-500">
                  Minimum withdrawal: {formatNgn(preview.fees?.withdrawal?.minAmount ?? minWithdrawal)} · Withdrawal fee: {preview.fees?.withdrawal?.ratePercent ?? 1}% capped at {formatNgn(preview.fees?.withdrawal?.capAmount ?? 300)} max.
                  {Boolean((preview.dailyPayoutLimit ?? 0) > 0) && (
                    <span> · Daily limit: {formatNgn(preview.dailyPayoutLimit!)} ({formatNgn(preview.dailyRemaining ?? 0)} remaining)</span>
                  )}
                </p>

                {/* Real-time Dynamic Fee Calculation Card */}
                {numAmount >= minWithdrawal && feeEstimate && (
                  <div className="rounded-none bg-gray-50 border border-gray-200 p-3 space-y-1.5 text-xs animate-in fade-in">
                    <div className="flex justify-between text-gray-600">
                      <span>Amount to receive in bank:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {formatNgn(feeEstimate.netAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Withdrawal fee ({preview.fees?.withdrawal?.ratePercent ?? 1}%, max {formatNgn(preview.fees?.withdrawal?.capAmount ?? 300)}):</span>
                      <span className="font-mono font-medium text-gray-700">
                        +{formatNgn(feeEstimate.fee)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-gray-200">
                      <span className="font-medium text-gray-900">Total debited from WallX balance:</span>
                      <span className="font-mono font-bold text-gray-900 text-sm">
                        {formatNgn(feeEstimate.debitAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Narration */}
              <div className="space-y-1">
                <label htmlFor="modal-withdrawal-narration" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Narration / Note <span className="text-gray-400 font-normal lowercase">(Optional)</span>
                </label>
                <Input
                  id="modal-withdrawal-narration"
                  name="withdrawal-narration"
                  type="text"
                  maxLength={100}
                  placeholder="e.g. Supplier payment"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="rounded-none text-xs text-gray-900 border-gray-300 focus:border-gray-900 focus:ring-0"
                  autoComplete="off"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button variant="outline" size="sm" type="button" subscriptionExempt={true} onClick={handleCloseAll} className="rounded-none text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  subscriptionExempt={true}
                  disabled={
                    !isAmountValid ||
                    available < 100 ||
                    !preview.security.hasPin ||
                    preview.security.isPinLocked ||
                    isLocked
                  }
                  className="rounded-none text-xs"
                >
                  Continue to Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </form>
          )}

          {/* STAGE 2: IN-MODAL REVIEW & 4-DIGIT PIN */}
          {stage === 'confirm' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Summary Receipt Box */}
              <div className="rounded-none bg-gray-50 p-3.5 border border-gray-200 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Amount to your bank</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatNgn(feeEstimate ? feeEstimate.netAmount : numAmount)}
                  </span>
                </div>
                {feeEstimate && (
                  <div className="flex justify-between items-center text-gray-500">
                    <span>Withdrawal fee ({preview.fees?.withdrawal?.ratePercent ?? 1}%, max {formatNgn(preview.fees?.withdrawal?.capAmount ?? 300)})</span>
                    <span className="font-mono font-medium text-gray-700">
                      +{formatNgn(feeEstimate.fee)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1.5 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Total debited from balance</span>
                  <span className="font-mono font-bold text-gray-900 text-base">
                    {formatNgn(feeEstimate ? feeEstimate.debitAmount : numAmount)}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Destination Bank</span>
                    <span className="font-medium text-gray-900">
                      {preview.settlementAccount.bankName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account</span>
                    <span className="font-mono font-medium text-gray-800">
                      {preview.settlementAccount.accountNumber} ({preview.settlementAccount.accountName})
                    </span>
                  </div>
                  {narration && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Narration</span>
                      <span className="text-gray-700 truncate max-w-[180px]">{narration}</span>
                    </div>
                  )}
                </div>
              </div>

          
               

              {/* 4-Digit PIN Entry */}
              <div className="space-y-2 pt-1 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-800">
                  <Lock className="h-3.5 w-3.5 text-gray-900" />
                  <span>Enter 4-Digit Transaction PIN</span>
                </div>

                <div className="flex justify-center items-center gap-2.5">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={pinInputRefs[i]}
                      id={`payout-pin-digit-${i}`}
                      name={`payout-pin-digit-${i}`}
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      disabled={verifyingPin || withdrawing}
                      className={`w-11 h-12 text-center text-xl font-bold font-mono rounded-none border transition-all outline-none text-gray-900 ${
                        digit
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      } focus:border-gray-900 focus:bg-white focus:ring-0`}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 px-4 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="flex items-center gap-1 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
                  </button>

                  {remainingAttempts < 5 && (
                    <span className="text-amber-700 font-medium">
                      {remainingAttempts} attempts remaining
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2.5 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  subscriptionExempt={true}
                  onClick={() => setStage('input')}
                  disabled={verifyingPin || withdrawing}
                  className="rounded-none text-xs"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  type="button"
                  subscriptionExempt={true}
                  onClick={() => executeWithdrawalWithPin()}
                  isLoading={verifyingPin || withdrawing}
                  disabled={digits.some((d) => !d) || verifyingPin || withdrawing}
                  className="rounded-none text-xs"
                >
                  Authorize &amp; Submit
                </Button>
              </div>
            </div>
          )}

          {/* STAGE 3: SUCCESS STATE */}
          {stage === 'success' && completedPayout && (
            <div className="flex flex-col items-center text-center py-2 space-y-3.5 animate-in fade-in">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-none ${
                  isPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {isPending ? <Clock className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  {isPending ? 'Withdrawal Queued' : 'Transfer Started!'}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5 max-w-[280px]">
                  {isPending
                    ? "Your funds are reserved. We'll transfer as soon as our gateway is funded."
                    : 'Your funds are on their way to your bank.'}
                </p>
              </div>

              <div className="w-full rounded-none bg-gray-50 p-3.5 border border-gray-200 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-mono font-bold text-gray-900">
                    {formatNgn(completedPayout.amount)}
                  </span>
                </div>
                {completedPayout.fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Withdrawal fee</span>
                    <span className="font-mono font-medium text-gray-700">
                      +{formatNgn(completedPayout.fee)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Net Receivable</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatNgn(completedPayout.netAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Destination</span>
                  <span className="font-medium text-gray-800">
                    {completedPayout.destinationBankName} (••••
                    {completedPayout.destinationAccountNum?.slice(-4)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reference</span>
                  <span className="font-mono text-gray-600 font-semibold">
                    {completedPayout.transferReference}
                  </span>
                </div>
                {isPending && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Status</span>
                    <span className="inline-flex items-center gap-1 rounded-none bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 border border-amber-300">
                      <Clock className="h-3 w-3" /> Queued
                    </span>
                  </div>
                )}
              </div>

              <Button
                size="sm"
                subscriptionExempt={true}
                className="w-full rounded-none text-xs mt-1"
                onClick={handleCloseAll}
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
