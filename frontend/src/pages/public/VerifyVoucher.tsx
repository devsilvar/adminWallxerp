import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CreditCard,
  Building2,
  User,
  Sparkles,
  ArrowRight,
  Wifi,
} from 'lucide-react';
import { formatNgn } from '@/lib/format';

interface VoucherPreviewData {
  id: string;
  businessId: string;
  businessName: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  cardId?: string | null;
  cardCode?: string | null;
  cardBalance: number;
  kind: string;
  amount: number;
  bonusPct?: number | null;
  bonusAmount?: number | null;
  totalCredit: number;
  notes?: string | null;
  expiresAt?: string | null;
}

type PageState = 'loading' | 'preview' | 'awaitingPin' | 'confirming' | 'success' | 'already_verified' | 'error';

export default function VerifyVoucher() {
  const { requestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const rawToken = searchParams.get('token') || '';

  const [state, setState] = useState<PageState>('loading');
  const [preview, setPreview] = useState<VoucherPreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [confirmedBalance, setConfirmedBalance] = useState<number | null>(null);

  // Voucher PIN second-factor state
  const [pin, setPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockDuration, setLockDuration] = useState<number | null>(null);

  const apiBase =
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

  useEffect(() => {
    if (!requestId || !rawToken) {
      setState('error');
      setErrorCode(400);
      setErrorMessage('Missing verification request ID or secure token.');
      return;
    }

    let isMounted = true;

    async function loadPreview() {
      try {
        setState('loading');
        const res = await axios.get(`${apiBase}/public/voucher-verify/${requestId}`, {
          params: { token: rawToken },
        });

        if (!isMounted) return;

        if (res.data?.success && res.data?.data) {
          setPreview(res.data.data);
          setState('preview');
        } else {
          setState('error');
          setErrorMessage('Could not load voucher preview details.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        const status = err.response?.status;
        setErrorCode(status || 500);

        if (status === 409) {
          setState('already_verified');
          setErrorMessage('This voucher credit has already been verified and applied.');
        } else if (status === 410) {
          setState('error');
          setErrorMessage('This verification link has expired. Please contact the store cashier to resend a verification link.');
        } else if (status === 401) {
          setState('error');
          setErrorMessage('Invalid or tampered verification link. Please use the original link sent to your phone or email.');
        } else if (status === 429) {
          setState('error');
          setErrorMessage('Too many verification attempts. Please wait a few minutes before trying again.');
        } else {
          setState('error');
          setErrorMessage(
            err.response?.data?.error?.message ||
              err.response?.data?.message ||
              'Failed to load voucher verification. Please check your connection and try again.'
          );
        }
      }
    }

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [requestId, rawToken, apiBase]);

  const handleSubmitPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!requestId || !rawToken) return;

    if (!pin || pin.trim().length !== 6) {
      setPinError('Enter 6 digits');
      return;
    }

    setPinError(null);
    try {
      setState('confirming');
      const res = await axios.post(`${apiBase}/public/voucher-verify/${requestId}`, {
        token: rawToken,
        pin: pin.trim(),
      });

      if (res.data?.already_verified) {
        setConfirmedBalance(res.data?.balance ?? preview?.cardBalance ?? null);
        setState('already_verified');
      } else {
        setConfirmedBalance(res.data?.balance ?? null);
        setState('success');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errData = err.response?.data?.error || err.response?.data;
      const code = errData?.code;
      const msg = errData?.message;
      const details = errData?.details;

      if (status === 400 && code === 'INVALID_PIN_FORMAT') {
        setState('awaitingPin');
        setPinError('Enter 6 digits');
      } else if (status === 400 && code === 'PIN_REQUIRED') {
        setState('awaitingPin');
        setPinError('Voucher PIN is required');
      } else if (status === 401 && code === 'INVALID_PIN') {
        setState('awaitingPin');
        const remaining = details?.attemptsRemaining;
        setPinError(
          remaining !== undefined
            ? `Wrong PIN. ${remaining} attempt(s) remaining.`
            : msg || 'Wrong PIN.'
        );
      } else if (status === 423 || code === 'VOUCHER_PIN_LOCKED') {
        setState('awaitingPin');
        setIsLocked(true);
        const mins = details?.retryAfterMinutes || details?.lockedForMinutes || 15;
        setLockDuration(mins);
        setPinError(`Voucher PIN locked. Try again in ${mins} minute(s).`);
      } else if (status === 409 || code === 'ALREADY_VERIFIED') {
        setState('already_verified');
      } else if (status === 410 || code === 'LINK_EXPIRED') {
        setState('error');
        setErrorCode(410);
        setErrorMessage('This verification link has expired. Please ask the store staff to send a new link.');
      } else if (status === 401 && code === 'INVALID_TOKEN') {
        setState('error');
        setErrorCode(401);
        setErrorMessage('Verification token is invalid or has already been used.');
      } else if (status === 429) {
        setState('error');
        setErrorCode(429);
        setErrorMessage('Too many confirmation attempts. Please wait a moment and refresh the page.');
      } else {
        setState('error');
        setErrorCode(status || 500);
        setErrorMessage(msg || 'Confirmation failed. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-purple-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">PayMyTax</span>
              <span className="text-xs text-purple-400 font-semibold ml-1.5 px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/50">
                Secure Voucher
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400">Customer Verification</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8 flex flex-col justify-center">
        {state === 'loading' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-10 text-center shadow-xl">
            <div className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white">Loading Voucher Details...</h2>
            <p className="text-sm text-slate-400 mt-1">Connecting securely to verify store credit</p>
          </div>
        )}

        {state === 'preview' && preview && (
          <div className="space-y-6">
            {/* ATM Card Visual */}
            <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 border border-purple-500/30 shadow-2xl shadow-purple-950/50">
              {/* Radial glow background */}
              <div className="absolute -right-16 -top-16 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

              {/* Card Header */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-purple-300" />
                  <span className="font-semibold text-sm tracking-wide text-white uppercase">
                    {preview.businessName}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Wifi className="w-4 h-4 text-purple-300 rotate-90" />
                  <span className="text-xs font-mono tracking-widest text-purple-300/80 uppercase">
                    VIRTUAL CARD
                  </span>
                </div>
              </div>

              {/* Gold Chip & Contactless */}
              <div className="my-6 flex items-center justify-between relative z-10">
                <div className="w-11 h-8 rounded-md bg-gradient-to-tr from-amber-400 via-amber-300 to-yellow-500 border border-amber-600/50 flex flex-col justify-around p-1 shadow-inner">
                  <div className="h-0.5 bg-amber-700/40 w-full" />
                  <div className="h-0.5 bg-amber-700/40 w-full" />
                  <div className="h-0.5 bg-amber-700/40 w-full" />
                </div>
                {preview.cardCode && (
                  <span className="text-xs font-mono text-purple-200 tracking-wider">
                    {preview.cardCode}
                  </span>
                )}
              </div>

              {/* Credit Amount Highlight */}
              <div className="relative z-10">
                <div className="text-xs text-purple-200/80 uppercase tracking-wider font-medium">
                  Total Voucher Credit
                </div>
                <div className="text-3xl font-extrabold text-white tracking-tight mt-1">
                  {formatNgn(preview.totalCredit)}
                </div>

                {preview.bonusAmount && preview.bonusAmount > 0 && (
                  <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Includes +{formatNgn(preview.bonusAmount)} Store Bonus Reward ({preview.bonusPct}%)
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="mt-6 pt-4 border-t border-purple-500/20 flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-2">
                  <User className="w-3.5 h-3.5 text-purple-300" />
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">
                    {preview.customerName}
                  </span>
                </div>
                {preview.customerPhone && (
                  <span className="text-xs text-purple-200 font-mono">
                    {preview.customerPhone}
                  </span>
                )}
              </div>
            </div>

            {/* Amber Warning Strip */}
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-4 flex items-start space-x-3 shadow-lg">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90 leading-relaxed">
                <strong className="text-amber-300 block mb-0.5 font-semibold">
                  Security Authorization Required
                </strong>
                Did you make a payment or deposit in-store at <strong>{preview.businessName}</strong>?
                Tapping <strong>Verify & Claim Credit</strong> confirms this credit was requested by you
                and instantly activates this balance for purchases.
              </div>
            </div>

            {/* Details Breakdown */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 divide-y divide-slate-800 text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">Store / Merchant</span>
                <span className="font-semibold text-white">{preview.businessName}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">Base Top-Up Amount</span>
                <span className="font-medium text-slate-200">{formatNgn(preview.amount)}</span>
              </div>
              {preview.bonusAmount && preview.bonusAmount > 0 && (
                <div className="py-2.5 flex justify-between text-emerald-400">
                  <span>Store Reward Bonus ({preview.bonusPct}%)</span>
                  <span className="font-semibold">+{formatNgn(preview.bonusAmount)}</span>
                </div>
              )}
              <div className="py-2.5 flex justify-between text-base font-bold">
                <span className="text-white">Credited to Voucher</span>
                <span className="text-purple-400">{formatNgn(preview.totalCredit)}</span>
              </div>
              {preview.notes && (
                <div className="py-2.5 flex flex-col space-y-1">
                  <span className="text-xs text-slate-400">Transaction Note</span>
                  <span className="text-slate-300 text-xs italic">{preview.notes}</span>
                </div>
              )}
            </div>

            {/* Action Button */}
            <button
              onClick={() => {
                setPinError(null);
                setState('awaitingPin');
              }}
              className="w-full py-4 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl shadow-purple-600/30 transition-all duration-200 flex items-center justify-center space-x-2 active:scale-[0.99] cursor-pointer"
            >
              <span>Confirm with Voucher PIN</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-xs text-center text-slate-400 flex items-center justify-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Link secured by WallX ERP — One-time authorization</span>
            </p>
          </div>
        )}

        {state === 'awaitingPin' && preview && (
          <div className="space-y-6">
            {/* Card Summary Mini Header */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider block">
                    {preview.businessName}
                  </span>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Enter Voucher PIN
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Credit</span>
                  <span className="text-lg font-extrabold text-emerald-400">
                    {formatNgn(preview.totalCredit)}
                  </span>
                </div>
              </div>

              {preview.cardCode && (
                <div className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-slate-400">Voucher Card Code:</span>
                  <span className="font-mono text-purple-200 font-semibold">{preview.cardCode}</span>
                </div>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">
                Please enter the 6-digit PIN printed on the back of your voucher card to authenticate and apply this credit to your card.
              </p>

              {isLocked && lockDuration && (
                <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold text-red-300">Voucher Temporarily Locked</strong>
                    Too many incorrect PIN attempts. Please wait {lockDuration} minute(s) before trying again.
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitPin} className="space-y-4 pt-2">
                <div>
                  <label htmlFor="voucher-pin" className="block text-xs font-semibold text-slate-300 mb-1.5 text-center">
                    6-Digit Voucher PIN
                  </label>
                  <input
                    id="voucher-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={isLocked}
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPin(val);
                      if (pinError) setPinError(null);
                    }}
                    placeholder="••••••"
                    className="w-full max-w-xs mx-auto block py-3.5 px-4 text-center text-3xl font-mono tracking-[0.5em] bg-slate-950 border border-purple-500/40 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {pinError && (
                    <p className="mt-2 text-xs text-red-400 text-center font-medium">
                      {pinError}
                    </p>
                  )}
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={pin.length !== 6 || isLocked}
                    className="w-full py-4 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl shadow-purple-600/30 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Confirm & Activate Credit</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPinError(null);
                      setState('preview');
                    }}
                    className="w-full py-2.5 text-xs text-slate-400 hover:text-white font-medium transition-colors text-center cursor-pointer"
                  >
                    Back to Card Details
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {state === 'confirming' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center shadow-xl space-y-4">
            <div className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-white">Activating Store Credit...</h2>
            <p className="text-sm text-slate-400">
              Applying balance to your card and updating store ledger
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-8 text-center shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Voucher Credit Activated!</h2>
              <p className="text-sm text-slate-300">
                Your store voucher at <strong>{preview?.businessName}</strong> has been credited with{' '}
                <strong className="text-emerald-400 font-bold">
                  {formatNgn(preview?.totalCredit || 0)}
                </strong>
                .
              </p>
            </div>

            {confirmedBalance !== null && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 max-w-sm mx-auto">
                <span className="text-xs text-slate-400 uppercase tracking-wider block">
                  New Available Balance
                </span>
                <span className="text-2xl font-extrabold text-white mt-0.5 block">
                  {formatNgn(confirmedBalance)}
                </span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/20 text-left text-xs text-slate-300 space-y-2">
              <span className="font-semibold text-purple-300 block uppercase tracking-wider">
                How to spend your voucher:
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Tell the cashier your name at checkout — no card code needed.</li>
                <li>Enter your 6-digit transaction PIN when prompted.</li>
                <li>Any cash change from future purchases can also be saved to this card.</li>
              </ul>
            </div>

            <p className="text-xs text-slate-400">
              A receipt has been dispatched to your email. You may safely close this window.
            </p>
          </div>
        )}

        {state === 'already_verified' && (
          <div className="bg-slate-900/80 border border-indigo-500/30 rounded-2xl p-8 text-center shadow-xl space-y-5">
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Already Verified & Applied</h2>
            <p className="text-sm text-slate-300 max-w-sm mx-auto">
              This voucher transaction has already been verified and credited to your card balance.
            </p>
            {confirmedBalance !== null && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 max-w-sm mx-auto">
                <span className="text-xs text-slate-400 uppercase tracking-wider block">
                  Current Card Balance
                </span>
                <span className="text-2xl font-extrabold text-white mt-0.5 block">
                  {formatNgn(confirmedBalance)}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-400">
              No further action is required. Your funds are active and ready for in-store purchases.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="bg-slate-900/80 border border-red-500/30 rounded-2xl p-8 text-center shadow-xl space-y-5">
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              {errorCode === 410 ? <Clock className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">
                {errorCode === 410
                  ? 'Verification Link Expired'
                  : errorCode === 401
                  ? 'Invalid Verification Link'
                  : 'Verification Unavailable'}
              </h2>
              <p className="text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/"
                className="inline-flex items-center space-x-1.5 text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
              >
                <span>Return to WallXERP Home</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-900 text-center text-xs text-slate-400">
        <p>Secured by PayMyTax by WallX — Non-custodial Merchant Software</p>
      </footer>
    </div>
  );
}
