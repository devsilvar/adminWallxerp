import React, { useEffect, useState } from 'react';
import {
  Landmark,
  Zap,
  FileCheck,
  ShieldCheck,
  Loader2,
  Phone,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import PhoneInput from '@/components/ui/PhoneInput.tsx';
import BankSelect from '@/components/BankSelect.tsx';
import type { Bank } from '@/types';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import { mapPaystackError, type BackendErrorLike } from '@/lib/paystack-errors';

export interface DvaOnboardingWizardProps {
  businessId: string;
  businessName: string;
  loading?: boolean;
  dvaStatus?: string;
  dvaMessage?: string;
  banks: Bank[] | null;
  banksLoading?: boolean;
  banksError?: string;
  onSuccess: (dvaData: any) => Promise<void> | void;
  onNeedsValidation: () => void;
  onRefreshMe: () => Promise<void> | void;
}

const BENEFITS = [
  { icon: Zap, label: 'Instant auto-capture', tone: 'text-emerald-600' },
  { icon: FileCheck, label: 'Zero reconciliation', tone: 'text-blue-600' },
  { icon: ShieldCheck, label: 'NRS & CBN compliant', tone: 'text-primary-600' },
] as const;

export const DvaOnboardingWizard: React.FC<DvaOnboardingWizardProps> = ({
  businessId,
  businessName,
  loading = false,
  dvaStatus,
  dvaMessage,
  banks,
  banksLoading = false,
  banksError = '',
  onSuccess,
  onNeedsValidation,
  onRefreshMe,
}) => {
  const [bvn, setBvn] = useState('');
  const [bvnError, setBvnError] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [validating, setValidating] = useState(false);

  // Phone number state
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // NIBSS name enquiry: bank + account number resolve to the account holder's
  // name, so the user sees who we'll submit before a BVN is spent.
  const [accountName, setAccountName] = useState('');
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [resolveNote, setResolveNote] = useState('');

  useEffect(() => {
    setAccountName('');
    setResolveNote('');

    if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
      setResolvingAccount(false);
      return;
    }

    let cancelled = false;
    setResolvingAccount(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.post(
          `/businesses/${businessId}/dva/settlement/resolve`,
          { bankCode, accountNumber },
        );
        if (cancelled) return;
        setAccountName(res.data.data?.accountName || '');
      } catch (err) {
        if (cancelled) return;
        setResolveNote(
          (err as BackendErrorLike)?.response?.data?.error?.message ||
            "We couldn't verify this account name. Double-check the bank and account number.",
        );
      } finally {
        if (!cancelled) setResolvingAccount(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bankCode, accountNumber, businessId]);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\+?[1-9]\d{1,14}$/.test(phone.trim())) {
      setPhoneError('Enter a valid phone number');
      return;
    }
    setSavingPhone(true);
    try {
      await api.patch('/auth/me', { phone: phone.trim() });
      await onRefreshMe();
      toast.success('Phone number saved');
      setShowPhoneForm(false);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to save phone';
      setPhoneError(msg);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSubmitOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{11,12}$/.test(bvn)) {
      setBvnError('BVN must be 11 or 12 digits');
      return;
    }
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      setBvnError('Select your bank and enter your 10-digit account number');
      return;
    }

    setValidating(true);
    setBvnError('');

    try {
      try {
        const setupRes = await api.post(
          `/businesses/${businessId}/dva/setup-virtual-account`,
          {
            bvn,
            bankCode,
            accountNumber,
          },
        );
        if (setupRes.data.data.status === 'active') {
          toast.success('🎉 Dedicated virtual account activated!');
          await onSuccess(setupRes.data.data);
          return;
        }
      } catch (setupErr) {
        const sErr = setupErr as BackendErrorLike;
        const code = sErr.response?.data?.error?.code;
        const paystackCode = sErr.response?.data?.error?.details?.paystackCode;

        if (code === 'USER_PHONE_REQUIRED') {
          setShowPhoneForm(true);
          toast('Add your phone number to continue.', { icon: 'ℹ️' });
          return;
        }

        if (code === 'BVN_ALREADY_LINKED') {
          setBvnError(
            'This BVN is already linked to another WallXERP account.',
          );
          return;
        }

        const isExpectedValidation =
          paystackCode === 'validation_required' ||
          /not been identified|customer.*not.*identified/i.test(
            sErr.response?.data?.error?.message || '',
          );

        if (!isExpectedValidation) {
          const mapped = mapPaystackError(sErr);
          if (mapped.intent === 'inline')
            setBvnError(`${mapped.title}. ${mapped.body}`);
          else toast.error(mapped.body);
          return;
        }
      }

      await api.post(`/businesses/${businessId}/dva/validate-customer`, {
        bvn,
        bankCode,
        accountNumber,
      });

      toast.success('Verification submitted! Checking with NIBSS.');
      onNeedsValidation();
    } catch (rawErr) {
      const err = rawErr as BackendErrorLike;
      const errorMessage =
        err.response?.data?.error?.message || 'Verification failed';
      const mapped = mapPaystackError(err);
      if (mapped.intent === 'inline') {
        setBvnError(`${mapped.title}: ${mapped.body}`);
      } else {
        setBvnError(errorMessage);
        if (mapped.intent === 'toast') {
          toast.error(mapped.body);
        }
      }
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      data-testid='dva-onboarding-wizard'
      className='mx-auto max-w-3xl space-y-4 animate-in fade-in duration-200 py-2'
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className='relative overflow-hidden rounded-xl bg-white ring-1 ring-gray-200'>
        <span
          className='absolute left-0 top-0 h-full w-[3px] bg-primary-500'
          aria-hidden
        />
        <div className='flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6'>
          <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700'>
            <Landmark className='h-5 w-5' />
          </div>

          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-gray-400'>
                Dedicated business account
              </p>
              <span className='rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20'>
                Instant NUBAN
              </span>
            </div>

            <h1 className='mt-1 text-lg font-bold tracking-tight text-gray-900 sm:text-xl'>
              Activate Your Dedicated Business Account
            </h1>
            <p className='mt-1 text-xs leading-relaxed text-gray-500 sm:text-sm'>
              Get an instant Nigerian NUBAN account number for{' '}
              <span className='font-semibold text-gray-900'>{businessName}</span>
              . Customer transfers will be auto-captured and recorded for
              seamless NRS tax compliance.
            </p>

            <div className='mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3.5'>
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <span
                    key={b.label}
                    className='inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200'
                  >
                    <Icon className={`h-3.5 w-3.5 ${b.tone}`} />
                    {b.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Setup Card ──────────────────────────────────────── */}
      <div className='overflow-hidden rounded-xl bg-white ring-1 ring-gray-200'>
        {loading ? (
          <div className='flex flex-col items-center gap-3 px-6 py-16'>
            <Loader2 className='h-6 w-6 animate-spin text-primary-600' />
            <p className='text-xs text-gray-500'>Loading account status…</p>
          </div>
        ) : showPhoneForm ? (
          <>
            <div className='flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-3.5'>
              <div className='flex items-center gap-2.5'>
                <span className='flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500'>
                  <Phone className='h-3.5 w-3.5' />
                </span>
                <p className='text-sm font-semibold text-gray-900'>
                  Add phone number
                </p>
              </div>
              <span className='rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ring-1 ring-inset ring-gray-200'>
                Required
              </span>
            </div>

            <form onSubmit={handleSavePhone} className='space-y-4 p-5 sm:p-6'>
              <p className='text-xs leading-relaxed text-gray-500'>
                Paystack requires a phone number on file to complete identity
                verification before your account number can be issued.
              </p>
              <PhoneInput
                label='Phone number'
                required
                value={phone}
                onChange={(fullE164) => {
                  setPhone(fullE164);
                  setPhoneError('');
                }}
                error={phoneError}
              />
              <div className='flex gap-2 border-t border-gray-100 pt-4'>
                <Button type='submit' isLoading={savingPhone}>
                  Save &amp; Continue
                </Button>
                <Button variant='ghost' onClick={() => setShowPhoneForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className='flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-3.5'>
              <div className='flex items-center gap-2.5'>
                <span className='flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-primary-600'>
                  <ShieldCheck className='h-3.5 w-3.5' />
                </span>
                <p className='text-sm font-semibold text-gray-900'>
                  Verify your identity
                </p>
              </div>
              <span className='rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ring-1 ring-inset ring-gray-200'>
                CBN requirement
              </span>
            </div>

            <form onSubmit={handleSubmitOnboarding} className='space-y-5 p-5 sm:p-6'>
              <p className='text-xs leading-relaxed text-gray-500'>
                Enter your 11-digit BVN and a bank account in your name to
                activate your dedicated virtual account.
              </p>

              {(bvnError || dvaStatus === 'failed') && (
                <div className='flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3'>
                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-rose-500' />
                  <div className='min-w-0'>
                    <p className='text-xs font-semibold text-rose-800'>
                      Verification Alert
                    </p>
                    <p className='mt-0.5 text-xs leading-relaxed text-rose-700'>
                      {bvnError ||
                        dvaMessage ||
                        'Please check your details and try again.'}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Input
                  label='Bank Verification Number (BVN)'
                  type='text'
                  maxLength={12}
                  value={bvn}
                  onChange={(e) => {
                    setBvn(e.target.value.replace(/\D/g, ''));
                    setBvnError('');
                  }}
                  placeholder='Enter 11-digit BVN'
                  required
                />
                <p className='mt-1 text-[11px] text-gray-400'>
                  Dial *565*0# on your registered SIM to check your BVN
                </p>
              </div>

              <div>
                <p className='mb-1 block text-sm font-medium text-gray-700'>
                  Your Bank
                </p>
                <BankSelect
                  banks={banks}
                  loading={banksLoading}
                  error={banksError}
                  value={bankCode}
                  onChange={(code) => {
                    setBankCode(code);
                    setBvnError('');
                  }}
                />
              </div>

              <div>
                <Input
                  label='Bank Account Number (10 digits)'
                  type='text'
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value.replace(/\D/g, ''));
                    setBvnError('');
                  }}
                  placeholder='0123456789'
                  required
                />
                <p className='mt-1 text-[11px] text-gray-400'>
                  The account name on this bank must match your BVN name
                </p>

                {resolvingAccount ? (
                  <p className='mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200'>
                    <Loader2 className='h-3 w-3 animate-spin' /> Checking
                    account name…
                  </p>
                ) : accountName ? (
                  <p
                    title={accountName}
                    className='mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                  >
                    <CheckCircle2 className='h-3.5 w-3.5 shrink-0' />
                    <span className='truncate'>{accountName}</span>
                  </p>
                ) : resolveNote ? (
                  <p className='mt-2 text-[11px] leading-relaxed text-amber-600'>
                    {resolveNote}
                  </p>
                ) : null}
              </div>

              <div className='flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 ring-1 ring-inset ring-gray-200/70'>
                <ShieldCheck className='mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600' />
                <p className='text-[11px] leading-relaxed text-gray-500'>
                  Your details are encrypted at rest and verified directly via
                  NIBSS — never shared with third parties.
                </p>
              </div>

              <div className='border-t border-gray-100 pt-4'>
                <Button
                  type='submit'
                  size='lg'
                  className='w-full sm:w-auto'
                  isLoading={validating}
                >
                  <ShieldCheck className='h-4 w-4' /> Verify &amp; Activate
                  Account
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default DvaOnboardingWizard;
