import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Clock, ArrowRight } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

interface TrialWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  businessName?: string;
  trigger: 'registration' | 'business_creation';
  createdAt?: string; // Kept for interface compatibility but no longer used
}

export default function TrialWelcomeModal({
  isOpen,
  onClose,
  userName,
  businessName,
  trigger,
}: TrialWelcomeModalProps) {
  const subscriptionStatus = useSubscriptionStatus();

  // Real-time countdown derived from subscription status (server-backed trialEndsAt)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isOpen]);

  const { daysLeft, hoursLeft, minutesLeft, secondsLeft, percentRemaining } =
    (() => {
      if (!subscriptionStatus.expiresAt) {
        return {
          daysLeft: 30,
          hoursLeft: 0,
          minutesLeft: 0,
          secondsLeft: 0,
          percentRemaining: 100,
        };
      }
      const remainingMs = Math.max(
        0,
        subscriptionStatus.expiresAt.getTime() - nowMs,
      );
      const totalMs = 30 * 24 * 60 * 60 * 1000; // 30-day trial
      const daysLeft = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      const hoursLeft = Math.floor(
        (remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
      );
      const minutesLeft = Math.floor(
        (remainingMs % (60 * 60 * 1000)) / (60 * 1000),
      );
      const secondsLeft = Math.floor((remainingMs % (60 * 1000)) / 1000);
      const percentRemaining = Math.max(
        0,
        Math.min(100, Math.round((remainingMs / totalMs) * 100)),
      );
      return {
        daysLeft,
        hoursLeft,
        minutesLeft,
        secondsLeft,
        percentRemaining,
      };
    })();

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isExpired =
    daysLeft === 0 &&
    hoursLeft === 0 &&
    minutesLeft === 0 &&
    secondsLeft === 0 &&
    Boolean(subscriptionStatus.expiresAt);

  const timeRemainingText =
    daysLeft > 0
      ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
      : hoursLeft > 0
        ? `${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}`
        : minutesLeft > 0
          ? `${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'}`
          : 'less than a minute';

  const badgeText = isExpired
    ? 'Trial expired'
    : daysLeft > 0
      ? `Full access — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
      : hoursLeft > 0
        ? `Full access — ${hoursLeft}h left`
        : minutesLeft > 0
          ? `Full access — ${minutesLeft}m left`
          : 'Trial ending soon';

  const heading =
    trigger === 'registration'
      ? `Welcome, ${userName || 'there'}!`
      : `${businessName || 'Your business'} is live`;

  const subheading = isExpired
    ? 'Your trial has ended. Upgrade to continue.'
    : trigger === 'registration'
      ? `Workspace ready. You have ${timeRemainingText} left.`
      : `All set. You have ${timeRemainingText} left.`;

  return createPortal(
    <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-purple-900/30 via-black/50 to-black/60 backdrop-blur-md overflow-hidden'>
      {/* Backdrop */}
      <div className='absolute inset-0 cursor-default' onClick={onClose} />

      {/* Modal Dialog */}
      <div className='relative z-10 w-full max-w-[400px] rounded-xl bg-white shadow-2xl border border-gray-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200'>
        {/* Brand accent bar */}
        <div className='h-1 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600' />

        {/* Header */}
        <div className='relative p-5 pb-4'>
          <button
            type='button'
            onClick={onClose}
            className='absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
            aria-label='Close welcome modal'
          >
            <X className='h-4 w-4' />
          </button>

          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset mb-3 ${
              isExpired
                ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
            }`}
          >
            <span className='relative flex h-2 w-2'>
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isExpired ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isExpired ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            <span>{badgeText}</span>
          </div>

          <h2 className='text-xl font-bold text-gray-900 tracking-tight leading-tight'>
            {heading}
          </h2>
          <p className='mt-1.5 text-[13px] leading-relaxed text-gray-500'>
            {subheading}
          </p>
        </div>

        {/* Content Body */}
        <div className='px-5 pb-5 space-y-4'>
          {/* Friendly trial window — not a ticking bomb */}
          <div className='rounded-lg border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white p-4'>
            <div className='flex items-center justify-between gap-3 mb-3'>
              <div className='flex items-center gap-2'>
                <div className='h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0'>
                  <Clock className='h-4 w-4' />
                </div>
                <div>
                  <h3 className='text-sm font-semibold text-gray-900 leading-none'>
                    Your trial
                  </h3>
                  <p className='text-[11px] text-gray-500 leading-none mt-1'>
                    We’ll remind you before it ends — no surprise charges.
                  </p>
                </div>
              </div>
            </div>
            {/* Digital Timer Display with Colons */}
            <div className='bg-gray-900 rounded-lg p-3 mb-2.5'>
              <div className='flex items-center justify-center gap-1 text-emerald-400'>
                {/* Days */}
                <div className='flex flex-col items-center'>
                  <div className='text-2xl font-bold tabular-nums font-mono tracking-tight'>
                    {daysLeft.toString().padStart(2, '0')}
                  </div>
                  <div className='text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5'>
                    Days
                  </div>
                </div>

                <span className='text-2xl font-bold text-emerald-500/60 pb-3'>
                  :
                </span>

                {/* Hours */}
                <div className='flex flex-col items-center'>
                  <div className='text-2xl font-bold tabular-nums font-mono tracking-tight'>
                    {hoursLeft.toString().padStart(2, '0')}
                  </div>
                  <div className='text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5'>
                    Hours
                  </div>
                </div>

                <span className='text-2xl font-bold text-emerald-500/60 pb-3'>
                  :
                </span>

                {/* Minutes */}
                <div className='flex flex-col items-center'>
                  <div className='text-2xl font-bold tabular-nums font-mono tracking-tight'>
                    {minutesLeft.toString().padStart(2, '0')}
                  </div>
                  <div className='text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5'>
                    Mins
                  </div>
                </div>

                <span className='text-2xl font-bold text-emerald-500/60 pb-3'>
                  :
                </span>

                {/* Seconds */}
                <div className='flex flex-col items-center'>
                  <div className='text-2xl font-bold tabular-nums font-mono tracking-tight'>
                    {secondsLeft.toString().padStart(2, '0')}
                  </div>
                  <div className='text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5'>
                    Secs
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className='w-full h-1.5 rounded-full bg-gray-200 overflow-hidden'>
              <div
                className='h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-1000'
                style={{ width: `${percentRemaining}%` }}
              />
            </div>
          </div>

          {/* What's included — human, benefit-led */}
        </div>

        {/* Actions — low pressure, clear next step */}
        <div className='px-5 pb-4 flex items-center justify-between gap-2.5'>
          <Link
            to='/subscription'
            onClick={onClose}
            className='text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline inline-flex items-center gap-1'
          >
            <span>Compare plans</span>
            <ArrowRight className='h-3 w-3' />
          </Link>

          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold text-sm shadow-sm transition-colors'
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
