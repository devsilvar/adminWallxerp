import { useState, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Button from '@/components/ui/Button.tsx';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import {
  Mail,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Info,
} from 'lucide-react';


const COOLDOWN_SECONDS = 60;

export default function VerifyEmailPending() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Multi-tier email retrieval: query param -> route state -> sessionStorage
  const emailParam = searchParams.get('email');
  const stateEmail = (location.state as { email?: string; verificationLink?: string } | null)?.email;
  const storageEmail = sessionStorage.getItem('pendingVerificationEmail');
  const email = emailParam || stateEmail || storageEmail || 'your email';

  // Dev mode verification link if returned by backend
  const devVerificationLink =
    (location.state as { verificationLink?: string } | null)?.verificationLink || null;

  const [copied, setCopied] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(COOLDOWN_SECONDS);
  const [canResend, setCanResend] = useState(false);

  // Active cooldown interval
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const copyEmail = async () => {
    if (!email || email === 'your email') return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success('Email copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;
    if (!email || email === 'your email') {
      toast.error('Unable to determine email address. Please try signing up again.');
      return;
    }

    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      toast.success('Fresh verification email sent! Check your inbox.');
      setCountdown(COOLDOWN_SECONDS);
      setCanResend(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div>
      {/* Dev Mode Banner (only visible in dev if link is returned) */}
      {devVerificationLink && (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50/90 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span className="inline-flex items-center rounded-md bg-purple-200/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-800">
                Developer Preview
              </span>
              <p className="mt-1 text-xs text-purple-900 leading-relaxed font-body">
                Email delivery is simulated in development. You can activate this account immediately:
              </p>
              <a
                href={devVerificationLink}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-800 transition-colors shadow-xs"
              >
                <span>Direct Verification Link</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="text-center">
        {/* Beacon Envelope Graphic */}
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 blur-xl animate-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-md shadow-emerald-500/5">
            <Mail className="h-9 w-9 text-emerald-600" strokeWidth={1.9} />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Check your inbox
        </h2>
        <p className="mt-2.5 text-[15px] font-body text-gray-600 leading-relaxed max-w-sm mx-auto">
          We sent a secure activation link to verify your business account.
        </p>

        {/* Target Email Chip */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-xs max-w-full">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[220px] sm:max-w-[280px]">
            {email}
          </span>
          <button
            type="button"
            onClick={copyEmail}
            title="Copy email address"
            className="ml-1 text-gray-400 hover:text-gray-700 transition-colors p-0.5 rounded"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Advisory & Nigerian SME Delivery Tips */}
      <div className="mt-7 space-y-3">
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <Info className="h-4.5 w-4.5 text-gray-500 mt-0.5 shrink-0" />
            <div className="text-xs text-gray-600 font-body leading-relaxed">
              <strong className="font-semibold text-gray-800">Can&apos;t find the email?</strong>
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-gray-500">
                <li>Check your <strong>Spam</strong>, <strong>Junk</strong>, or <strong>Promotions</strong> folder.</li>
                <li>Nigerian corporate firewalls may take 1–2 minutes to clear incoming mail.</li>
                <li>The activation link remains valid for <strong>24 hours</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-2 space-y-3">
          <Button
            type="button"
            variant={canResend ? 'primary' : 'secondary'}
            disabled={!canResend || isResending}
            isLoading={isResending}
            onClick={handleResend}
            className="w-full py-3 text-[15px]"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isResending ? 'animate-spin' : ''}`} />
            {canResend ? (
              'Resend verification email'
            ) : (
              <span>Resend email in <strong className="font-mono font-semibold">{countdown}s</strong></span>
            )}
          </Button>

          <Link to="/login" className="block">
            <Button variant="ghost" className="w-full py-2.5 text-sm text-gray-600 hover:text-gray-900">
              Return to Sign in
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer link for wrong email */}
      <div className="mt-7 border-t border-gray-100 pt-5 text-center">
        <p className="text-xs font-body text-gray-500">
          Entered the wrong email?{' '}
          <Link
            to="/register"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Register with another address
          </Link>
        </p>
      </div>
    </div>
  );
}
