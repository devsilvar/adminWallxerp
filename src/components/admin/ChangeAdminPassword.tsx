import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KeyRound,
  Mail,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';

type WizardStep = 'request' | 'code' | 'password' | 'done';

// Mirrors the response of POST /admin/account/password/request-code.
// The server never returns the code itself — only a masked hint.
interface RequestCodeResponse {
  emailHint: string;
  expiresInMinutes: number;
  delivered: boolean;
}

// Mirrors the response of POST /admin/account/password/verify-code.
interface VerifyCodeResponse {
  changeTicket: string;
}

// The server does not dictate a resend cooldown; this is a client-side guard
// so a frustrated admin cannot hammer the endpoint.
const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return 'admin@wallx.co';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export default function ChangeAdminPassword() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Wizard state machine: 'request' | 'code' | 'password' | 'done'
  const [step, setStep] = useState<WizardStep>('request');

  // Request state
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [emailHint, setEmailHint] = useState<string>('');
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);

  // Code state
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [codeTimer, setCodeTimer] = useState<number>(600); // 10 minutes
  const [resendCooldown, setResendCooldown] = useState<number>(RESEND_COOLDOWN_SECONDS);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Password state — keep changeTicket in component state ONLY (never in storage!)
  const [changeTicket, setChangeTicket] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 600s countdown timer for code expiration
  useEffect(() => {
    if (step !== 'code' || codeTimer <= 0) return;
    const interval = setInterval(() => {
      setCodeTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, codeTimer]);

  // 60s countdown timer for resend cooldown
  useEffect(() => {
    if (step !== 'code' || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendCooldown]);

  // Reset helper
  const handleReset = () => {
    setStep('request');
    setCodeDigits(['', '', '', '', '', '']);
    setCodeError(null);
    setRemainingAttempts(null);
    setChangeTicket(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setDeliveryNote(null);
  };

  // Step 1: Request Code
  const handleRequestCode = async () => {
    setIsSendingCode(true);
    setDeliveryNote(null);
    setCodeError(null);

    try {
      const response = await api.post<{
        success: boolean;
        data: RequestCodeResponse;
        message: string;
      }>('/admin/account/password/request-code');

      const data = response.data.data;
      setEmailHint(data.emailHint);
      setCodeTimer((data.expiresInMinutes || 10) * 60);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);

      if (!data.delivered) {
        setDeliveryNote('Email delivery is not configured on this server — check the server logs.');
      } else {
        toast.success('Verification code sent to your email');
      }

      setStep('code');
      // Focus first input after advancing
      setTimeout(() => {
        codeInputsRef.current[0]?.focus();
      }, 50);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send verification code'));
    } finally {
      setIsSendingCode(false);
    }
  };

  // Step 2: Code input handlers
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...codeDigits];
      next[index] = '';
      setCodeDigits(next);
      return;
    }

    const next = [...codeDigits];
    next[index] = clean[clean.length - 1]; // take latest typed digit
    setCodeDigits(next);
    setCodeError(null);

    // Auto-advance to next box
    if (index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!codeDigits[index] && index > 0) {
        // Current empty, clear previous and move back
        const next = [...codeDigits];
        next[index - 1] = '';
        setCodeDigits(next);
        codeInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      codeInputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteText) return;

    const next = [...codeDigits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasteText[i] || '';
    }
    setCodeDigits(next);
    setCodeError(null);

    const focusIdx = Math.min(pasteText.length, 5);
    codeInputsRef.current[focusIdx]?.focus();
  };

  const fullCode = codeDigits.join('');

  // Step 2: Verify Code
  const handleVerifyCode = async () => {
    if (fullCode.length !== 6) {
      setCodeError('Please enter all 6 digits of the code.');
      return;
    }

    setIsVerifyingCode(true);
    setCodeError(null);

    try {
      const response = await api.post<{
        success: boolean;
        data: VerifyCodeResponse;
        message: string;
      }>('/admin/account/password/verify-code', { code: fullCode });

      setChangeTicket(response.data.data.changeTicket);
      setStep('password');
      toast.success('Code verified. You may now set a new password.');
    } catch (err: unknown) {
      // The API nests everything under `error`: { error: { code, message, details } }.
      const apiErr = err as {
        response?: {
          data?: {
            error?: {
              message?: string;
              code?: string;
              details?: { remainingAttempts?: number };
            };
          };
        };
      };

      const remaining = apiErr.response?.data?.error?.details?.remainingAttempts;
      if (typeof remaining === 'number') {
        setRemainingAttempts(remaining);
        setCodeError(`Incorrect code. ${remaining} attempt(s) remaining.`);
      } else {
        setCodeError(getErrorMessage(err, 'Failed to verify code'));
      }
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Step 3: Password validation rules
  const rules = [
    { label: 'At least 8 characters', valid: newPassword.length >= 8 },
    { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(newPassword) },
    { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(newPassword) },
    { label: 'At least one number (0-9)', valid: /[0-9]/.test(newPassword) },
    {
      label: 'Passwords match',
      valid: newPassword.length > 0 && newPassword === confirmPassword,
    },
  ];

  const allRulesPassed = rules.every((r) => r.valid);

  // Step 3: Submit new password
  const handleCompletePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed || !changeTicket) return;

    setIsSubmittingPassword(true);
    setPasswordError(null);

    try {
      await api.post('/admin/account/password/complete', {
        changeTicket,
        newPassword,
        confirmPassword,
      });

      setStep('done');
      toast.success('Password changed successfully. Please log in again with your new password.');

      // Revoke and clear local session, then navigate to login
      useAuthStore.getState().logout();
      navigate('/admin/login', { replace: true });
    } catch (err) {
      setPasswordError(getErrorMessage(err, 'Failed to update password'));
      setIsSubmittingPassword(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const maskedDisplayEmail = emailHint || maskEmail(user?.email);

  return (
    <div className='rounded-panel border border-hairline bg-panel p-6 shadow-2xs'>
      {/* Header */}
      <div className='flex items-start justify-between border-b border-hairline pb-4'>
        <div className='flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600'>
            <KeyRound className='h-5 w-5' />
          </div>
          <div>
            <h2 className='text-base font-semibold text-ink'>Change Admin Password</h2>
            <p className='text-xs text-ink-muted'>
              Multi-factor email-verified password change for administrator accounts.
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className='hidden items-center gap-1.5 text-xs text-ink-subtle sm:flex'>
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
              step === 'request'
                ? 'bg-primary-600 text-white'
                : 'bg-panel-subtle text-ink-muted'
            }`}
          >
            1
          </span>
          <span className='h-0.5 w-3 bg-hairline' />
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
              step === 'code'
                ? 'bg-primary-600 text-white'
                : step === 'password' || step === 'done'
                ? 'bg-emerald-600 text-white'
                : 'bg-panel-subtle text-ink-muted'
            }`}
          >
            2
          </span>
          <span className='h-0.5 w-3 bg-hairline' />
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
              step === 'password'
                ? 'bg-primary-600 text-white'
                : step === 'done'
                ? 'bg-emerald-600 text-white'
                : 'bg-panel-subtle text-ink-muted'
            }`}
          >
            3
          </span>
        </div>
      </div>

      {/* Step 1: Request Code */}
      {step === 'request' && (
        <div className='mt-6 max-w-lg space-y-4'>
          <div className='rounded-lg border border-hairline bg-canvas p-4'>
            <div className='flex items-start gap-3'>
              <Mail className='mt-0.5 h-4 w-4 shrink-0 text-primary-600' />
              <div className='text-xs text-ink-muted'>
                <p className='font-medium text-ink'>Authorization Required</p>
                <p className='mt-1'>
                  For your security, a single-use 6-digit verification code will be sent to your
                  registered administrator email address:
                </p>
                <p className='mt-2 inline-block rounded bg-panel px-2.5 py-1 font-mono text-xs font-semibold text-ink'>
                  {maskedDisplayEmail}
                </p>
              </div>
            </div>
          </div>

          <div className='pt-2'>
            <Button
              type='button'
              onClick={handleRequestCode}
              isLoading={isSendingCode}
              disabled={isSendingCode}
            >
              Send 6-digit code
              <ArrowRight className='ml-1.5 h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Code Entry */}
      {step === 'code' && (
        <div className='mt-6 max-w-lg space-y-5'>
          {deliveryNote && (
            <div className='flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' />
              <div>
                <p className='font-semibold'>Development Notice</p>
                <p className='mt-0.5'>{deliveryNote}</p>
              </div>
            </div>
          )}

          <div>
            <label className='block text-xs font-semibold text-ink'>
              Enter 6-Digit Verification Code
            </label>
            <p className='mt-1 text-xs text-ink-muted'>
              We sent a verification code to{' '}
              <span className='font-mono font-medium text-ink'>{maskedDisplayEmail}</span>. The code
              expires in{' '}
              <span className='font-semibold text-ink'>{formatTimer(codeTimer)}</span>.
            </p>
          </div>

          {/* 6 Digit Inputs */}
          <div className='flex items-center gap-2 sm:gap-3'>
            {codeDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  codeInputsRef.current[idx] = el;
                }}
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                maxLength={1}
                autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                onPaste={handlePaste}
                aria-label={`Digit ${idx + 1} of verification code`}
                className='h-12 w-11 rounded-lg border border-hairline bg-canvas text-center text-lg font-bold text-ink transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:h-14 sm:w-12'
              />
            ))}
          </div>

          {/* Code Error or Attempts Left */}
          {codeError && (
            <div className='flex items-center gap-2 text-xs font-medium text-danger-600'>
              <XCircle className='h-4 w-4 shrink-0' />
              <span>{codeError}</span>
              {remainingAttempts !== null && remainingAttempts <= 2 && (
                <span className='font-bold'>(Warning: account lockout risk)</span>
              )}
            </div>
          )}

          {codeTimer === 0 && (
            <div className='flex items-center gap-2 text-xs font-medium text-danger-600'>
              <AlertTriangle className='h-4 w-4 shrink-0' />
              <span>Code has expired. Please request a new code.</span>
            </div>
          )}

          {/* Action buttons */}
          <div className='flex flex-wrap items-center gap-3 pt-2'>
            <Button
              type='button'
              onClick={handleVerifyCode}
              isLoading={isVerifyingCode}
              disabled={isVerifyingCode || fullCode.length !== 6 || codeTimer === 0}
            >
              Verify Code
              <ArrowRight className='ml-1.5 h-4 w-4' />
            </Button>

            <button
              type='button'
              onClick={handleRequestCode}
              disabled={resendCooldown > 0 || isSendingCode}
              className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-panel-subtle disabled:opacity-50'
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSendingCode ? 'animate-spin' : ''}`} />
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>

            <button
              type='button'
              onClick={handleReset}
              className='text-xs font-medium text-ink-muted hover:text-ink hover:underline'
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Password Entry */}
      {step === 'password' && (
        <form onSubmit={handleCompletePasswordChange} className='mt-6 max-w-lg space-y-5'>
          {passwordError && (
            <div className='flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs text-danger-800'>
              <XCircle className='h-4 w-4 shrink-0' />
              <span>{passwordError}</span>
            </div>
          )}

          <div className='space-y-4'>
            {/* New Password */}
            <div>
              <label
                htmlFor='new-admin-password'
                className='block text-xs font-semibold text-ink'
              >
                New Password
              </label>
              <div className='relative mt-1'>
                <input
                  id='new-admin-password'
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete='new-password'
                  placeholder='Enter new strong password'
                  className='w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2 pr-10 text-xs text-ink transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className='absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink'
                >
                  {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor='confirm-admin-password'
                className='block text-xs font-semibold text-ink'
              >
                Confirm New Password
              </label>
              <div className='relative mt-1'>
                <input
                  id='confirm-admin-password'
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete='new-password'
                  placeholder='Re-type new password'
                  className='w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2 pr-10 text-xs text-ink transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                />
              </div>
            </div>
          </div>

          {/* Real-time Validation Checklist */}
          <div className='rounded-lg border border-hairline bg-canvas p-3.5 text-xs'>
            <p className='font-semibold text-ink'>Password Requirements:</p>
            <ul className='mt-2 space-y-1.5'>
              {rules.map((rule, idx) => (
                <li key={idx} className='flex items-center gap-2'>
                  {rule.valid ? (
                    <CheckCircle2 className='h-3.5 w-3.5 text-emerald-600' />
                  ) : (
                    <div className='h-3.5 w-3.5 rounded-full border border-hairline-strong' />
                  )}
                  <span className={rule.valid ? 'text-ink font-medium' : 'text-ink-subtle'}>
                    {rule.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action buttons */}
          <div className='flex items-center gap-3 pt-2'>
            <Button
              type='submit'
              isLoading={isSubmittingPassword}
              disabled={isSubmittingPassword || !allRulesPassed}
            >
              Update Password
              <ShieldCheck className='ml-1.5 h-4 w-4' />
            </Button>

            <button
              type='button'
              onClick={handleReset}
              className='text-xs font-medium text-ink-muted hover:text-ink hover:underline'
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <div className='mt-6 max-w-lg space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900'>
          <div className='flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-emerald-600' />
            <p className='font-semibold'>Password successfully updated!</p>
          </div>
          <p>Your sessions have been revoked. Redirecting to login…</p>
        </div>
      )}
    </div>
  );
}
