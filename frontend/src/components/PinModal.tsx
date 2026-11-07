import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Eye, EyeOff, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { usePinStore } from '@/stores/pin.store';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (stepUpToken: string) => void;
  title?: string;
  subtitle?: string;
  description?: string;
}

export default function PinModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Authorize Action',
  subtitle = 'Enter your 4-digit transaction PIN to continue.',
  description,
}: PinModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [digits, setDigits] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const verifyPin = usePinStore((s) => s.verifyPin);
  const isLocked = usePinStore((s) => s.isLocked);
  const remainingAttempts = usePinStore((s) => s.remainingAttempts);
  const fetchStatus = usePinStore((s) => s.fetchStatus);

  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '']);
      setShowPin(false);
      fetchStatus();
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto submit on 4th digit
    if (digit && index === 3) {
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        submitPin(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      inputRefs[3].current?.focus();
      submitPin(pasted);
    }
  };

  const submitPin = async (pinValue?: string) => {
    const pin = pinValue || digits.join('');
    if (pin.length !== 4) return;

    setVerifying(true);
    try {
      const res = await verifyPin(pin);
      if (res.valid && res.stepUpToken) {
        onSuccess(res.stepUpToken);
        onClose();
      } else {
        setDigits(['', '', '', '']);
        inputRefs[0].current?.focus();
      }
    } finally {
      setVerifying(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-sm flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 p-6 sm:p-7 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={verifying}
          className="absolute top-4 right-4 p-1.5 rounded-none border border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center">
          <div className="mx-auto w-11 h-11 rounded-none bg-gray-900 flex items-center justify-center text-white mb-3 shadow-xs">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
            {description ?? subtitle}
          </p>
        </div>

        {/* Content Body */}
        <div className="mt-6">
          {isLocked ? (
            <div className="rounded-none bg-red-50 border border-red-200 p-4 text-center space-y-1.5">
              <AlertTriangle className="h-5 w-5 text-red-600 mx-auto" />
              <h4 className="text-xs font-bold text-red-900">PIN Temporarily Locked</h4>
              <p className="text-[11px] text-red-700 leading-relaxed">
                Too many incorrect attempts. For your security, this action is locked for 15 minutes.
              </p>
            </div>
          ) : (
            <>
              {/* Digit Keypad Boxes */}
              <div className="flex justify-center items-center gap-2.5 sm:gap-3">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={inputRefs[i]}
                    id={`auth-pin-digit-${i}`}
                    name={`auth-pin-digit-${i}`}
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
                    disabled={verifying || isLocked}
                    className={`w-12 h-14 sm:w-13 sm:h-15 text-center text-2xl font-bold font-mono rounded-none border transition-all outline-none text-gray-900 ${
                      digit
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    } focus:border-gray-900 focus:bg-white focus:ring-0`}
                  />
                ))}
              </div>

              {/* Show/Hide PIN toggle & Remaining attempts */}
              <div className="flex items-center justify-between text-xs text-gray-500 mt-3 px-1">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer select-none text-xs font-medium"
                >
                  {showPin ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> <span>Show</span>
                    </>
                  )}
                </button>

                {remainingAttempts < 5 && remainingAttempts > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                    <AlertTriangle className="h-3 w-3" /> {remainingAttempts} left
                  </span>
                )}
              </div>

              {/* Submit Button */}
              <Button
                onClick={() => submitPin()}
                isLoading={verifying}
                subscriptionExempt={true}
                disabled={digits.some((d) => !d) || verifying}
                className="w-full mt-5 rounded-none py-2.5 text-xs font-semibold"
              >
                Confirm PIN
              </Button>

              {/* Security Assurance */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Protected by end-to-end security</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
