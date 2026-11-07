import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import {
  Check,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fallback resend form in error state
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setErrorMessage(
        'Missing verification token. Please use the link sent to your email.',
      );
      return;
    }

    let isMounted = true;

    async function performVerification() {
      setIsLoading(true);
      try {
        const { data } = await api.post('/auth/verify-email', { token });

        if (!isMounted) return;

        setIsSuccess(true);
        setAlreadyVerified(Boolean(data.data?.alreadyVerified));
        if (data.data?.email) {
          setVerifiedEmail(data.data.email);
          setResendEmail(data.data.email);
        }
        toast.success(data.message || 'Email verified successfully!');
      } catch (err: any) {
        if (!isMounted) return;

        const serverError = err.response?.data?.error?.message;
        setErrorMessage(
          serverError ||
            'This verification link is invalid or has expired. Please request a new one.',
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    performVerification();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', {
        email: resendEmail.trim(),
      });
      toast.success('New verification email sent! Please check your inbox.');
      navigate(
        `/verify-email-pending?email=${encodeURIComponent(resendEmail.trim())}`,
      );
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Failed to resend verification email',
      );
    } finally {
      setIsResending(false);
    }
  };

  // ─── STATE 1: LOADING (Clean Skeleton Pulse) ────────────────
  if (isLoading) {
    return (
      <div className='text-center py-8'>
        <div className='relative mx-auto mb-6 flex h-24 w-24 items-center justify-center'>
          <div className='absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse' />
          <div className='relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-500/20 bg-white shadow-md'>
            <RefreshCw className='h-8 w-8 text-emerald-600 animate-spin' />
          </div>
        </div>
        <h2 className='text-2xl font-bold tracking-tight text-gray-900'>
          Confirming your email...
        </h2>
        <p className='mt-2 text-sm text-gray-500 font-body'>
          Validating your security token with WallXERP servers.
        </p>
      </div>
    );
  }

  // ─── STATE 2: ERROR (Token Expired / Invalid) ───────────────
  if (errorMessage || !isSuccess) {
    return (
      <div>
        <div className='text-center'>
          <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600 shadow-sm'>
            <AlertCircle className='h-10 w-10' strokeWidth={1.8} />
          </div>
          <h2 className='text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl'>
            Verification link expired
          </h2>
          <p className='mt-2.5 text-[15px] font-body text-gray-600 leading-relaxed max-w-sm mx-auto'>
            {errorMessage ||
              'For your security, email verification links expire after 24 hours.'}
          </p>
        </div>

        {/* Resend Card */}
        <div className='mt-8 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm'>
          <h3 className='text-sm font-semibold text-gray-900'>
            Request a fresh verification link
          </h3>
          <p className='mt-1 text-xs text-gray-500 font-body'>
            Enter your registered email address and we&apos;ll send you a new
            activation link immediately.
          </p>

          <form onSubmit={handleResend} className='mt-4 space-y-4'>
            <Input
              label='Email address'
              type='email'
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder='you@example.com'
              required
            />

            <Button
              type='submit'
              isLoading={isResending}
              className='w-full py-3 text-[15px] rounded-full'
            >
              Send new link
              {!isResending && <ArrowRight className='h-4.5 w-4.5 ml-2' />}
            </Button>
          </form>
        </div>

        <div className='mt-6 text-center'>
          <Link
            to='/login'
            className='text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors'
          >
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  // ─── STATE 3: VERIFIED SUCCESS (THE BIG VERIFIED BADGE) ─────
  return (
    <div>
      <div className='text-center'>
        {/* THE BIG BESPOKE VERIFIED BADGE */}
        <div className='relative mx-auto mb-7 flex items-center justify-center'>
          {/* Ambient Radiant Glow Aura */}
          <div className='absolute h-36 w-36 rounded-full bg-gradient-to-tr from-emerald-500/35 via-teal-400/25 to-emerald-300/15 blur-2xl pointer-events-none' />

          {/* Outer Translucent Glass Ring */}
          <div className='relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full p-2 ring-8 ring-emerald-500/15 border border-emerald-500/30 bg-white/70 backdrop-blur-md shadow-[0_12px_36px_rgba(16,185,129,0.22)]'>
            {/* Core Dimensional Emerald Badge */}
            <div className='relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 shadow-inner overflow-hidden'>
              {/* Subtle specular gloss highlight on upper half */}
              <div className='absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent rounded-t-full pointer-events-none' />

              {/* Crisp Bold Verification Checkmark */}
              <Check className='relative z-10 h-14 w-14 sm:h-16 sm:w-16 text-white stroke-[3.2] drop-shadow-sm transform transition-transform hover:scale-105' />
            </div>
          </div>
        </div>

        {/* Verification Status Micro-Pill */}
        <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold shadow-2xs mb-3'>
          <ShieldCheck className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
          <span>
            {alreadyVerified ? 'Account Already Verified' : 'Account Activated'}
          </span>
        </div>

        {/* Celebratory Typography */}
        <h2 className='text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl'>
          {alreadyVerified ? 'You’re all set!' : 'Email Verified Successfully!'}
        </h2>

        <p className='mt-2.5 text-[15px] font-body text-gray-600 leading-relaxed max-w-sm mx-auto'>
          {alreadyVerified
            ? 'Your email was already confirmed. Your business tax portal is active and ready for use.'
            : 'Your email address has been confirmed. Your WallXERP workspace is now fully activated and secured.'}
        </p>

        {verifiedEmail && (
          <div className='mt-3.5 inline-block text-xs font-semibold text-gray-700 bg-gray-100/80 px-3 py-1 rounded-md border border-gray-200/60 font-mono'>
            {verifiedEmail}
          </div>
        )}
      </div>

      {/* <div className="mt-7 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 font-body">
          What you can do now
        </p>

        <div className="grid grid-cols-1 gap-2.5 text-left">
          <div className="flex items-center gap-3 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Automate NRS Tax Liability</p>
              <p className="text-[11px] text-gray-500 font-body">Calculate tax with 1-click filing accuracy.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0 border border-indigo-100">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Dedicated Virtual Accounts</p>
              <p className="text-[11px] text-gray-500 font-body">Auto-reconcile customer bank transfers directly into sales.</p>
            </div>
          </div>
        </div>
      </div> */}

      {/* PROMINENT PRIMARY LOGIN BUTTON BELOW (CORE REQUEST) */}
      <div className='mt-8 space-y-3'>
        <Link
          to={`/login?email=${encodeURIComponent(verifiedEmail)}`}
          className='block w-full focus:outline-none'
        >
          <Button
            type='button'
            className='w-full py-3.5 text-base font-semibold shadow-md shadow-primary-500/20 rounded-full flex items-center justify-center gap-2 group'
          >
            <span>Log in to your account</span>
            <ArrowRight
              className='h-5 w-5 transition-transform group-hover:translate-x-1'
              strokeWidth={2.5}
            />
          </Button>
        </Link>

        <p className='text-center text-xs text-gray-400 font-body'>
          Secured by WallX 256-bit bank-grade encryption
        </p>
      </div>
    </div>
  );
}
