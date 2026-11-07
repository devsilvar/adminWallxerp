import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import PhoneInput from '@/components/ui/PhoneInput.tsx';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ArrowRight, Check, X, Crown } from 'lucide-react';

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <div className='flex items-center gap-2'>
      {met ? (
        <Check className='h-4 w-4 text-green-500' strokeWidth={2.5} />
      ) : (
        <X className='h-4 w-4 text-gray-300' strokeWidth={2.5} />
      )}
      <span
        className={`text-xs font-body ${met ? 'text-green-600' : 'text-gray-400'}`}
      >
        {label}
      </span>
    </div>
  );
}

const PLAN_DETAILS: Record<
  string,
  {
    name: string;
    price: string;
    period: string;
    term: string;
    badge?: string;
    highlight: string;
  }
> = {
  free: {
    name: '30-days FREE Trial (Freemiums)',
    price: '₦0',
    period: 'for 30 days',
    term: '30-Day Free Trial',
    badge: '30-Day Free Trial Account',
    highlight:
      'Full unrestricted access across Starter, Business & Scale-Up. No credit card required.',
  },
  starter: {
    name: 'Monthly PLAN (Starter)',
    price: '₦5,000',
    period: '/month',
    term: 'Monthly Plan',
    highlight: 'Up to 3 team members • Manage up to 2 businesses',
  },
  business: {
    name: 'Quarterly (Business)',
    price: '₦12,000',
    period: '/quarter',
    term: 'Quarterly Plan',
    badge: 'Saving ₦3,000',
    highlight: 'Up to 10 team members • Customer Credit (BNPL)',
  },
  scale: {
    name: 'Annual (Scale-Up)',
    price: '₦45,000',
    period: '/year',
    term: 'Annual Plan',
    badge: 'Saving ₦15,000',
    highlight: 'Unlimited team members • Bulk invoicing & triggers',
  },
};

export default function Register() {
  const [searchParams] = useSearchParams();
  const rawPlan = searchParams.get('plan')?.toLowerCase();
  const initialPlan = ['starter', 'business', 'scale', 'free'].includes(
    rawPlan || '',
  )
    ? rawPlan!
    : localStorage.getItem('signupPlan') || 'free';

  const [selectedPlan, setSelectedPlan] = useState<string>(initialPlan);

  useEffect(() => {
    if (rawPlan && ['starter', 'business', 'scale', 'free'].includes(rawPlan)) {
      setSelectedPlan(rawPlan);
      localStorage.setItem('signupPlan', rawPlan);
    } else if (!localStorage.getItem('signupPlan')) {
      localStorage.setItem('signupPlan', 'free');
    }
  }, [rawPlan]);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [localDigits, setLocalDigits] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const rules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
  };
  const allMet = Object.values(rules).every(Boolean);
  const passwordTouched = password.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (localDigits.length > 0 && localDigits.length < 10) {
      setPhoneError(
        'Please enter all 10 digits of your mobile number (e.g. 803 123 4567)',
      );
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (!allMet) {
      toast.error('Password does not meet requirements');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register(email, phone, password, selectedPlan);
      const userEmail = result.email || email;
      sessionStorage.setItem('pendingVerificationEmail', userEmail);
      // Trial clock is now purely backend-driven (User.trialEndsAt set on
      // admin Save Plan Changes / startFreeTrial). No wallx_trial_started_at.
      toast.success('Account created successfully!');

      // Navigate directly to email verification
      navigate(`/verify-email-pending?email=${encodeURIComponent(userEmail)}`, {
        state: { email: userEmail },
      });
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || 'Registration failed';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className='mb-8'>
        <h2 className='text-2xl font-bold text-gray-900'>NRS</h2>

        {/* Selected Plan Display & Interactive Selector */}
        {(() => {
          const currentPlan = PLAN_DETAILS[selectedPlan] || PLAN_DETAILS.free;
          const isFree = selectedPlan === 'free';
          return (
            <div className='mt-4'>
              {isFree ? (
                <div className='p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white border border-emerald-300 text-xs shadow-xs'>
                  <div className='flex items-start sm:items-center justify-between gap-3'>
                    <div className='flex items-start sm:items-center gap-2.5'>
                      <span className='relative flex h-2.5 w-2.5 shrink-0 mt-1 sm:mt-0'>
                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
                        <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500' />
                      </span>
                      <div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-extrabold text-gray-900 text-sm'>
                            {currentPlan.name}
                          </span>
                          <span className='px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200'>
                            30-Day Free Trial Account
                          </span>
                        </div>
                        <p className='text-xs text-gray-600 mt-1 leading-relaxed'>
                          {currentPlan.highlight}
                        </p>
                      </div>
                    </div>
                    <div className='text-right shrink-0'>
                      <span className='font-extrabold text-emerald-700 text-base tabular-nums'>
                        ₦0
                      </span>
                      <span className='text-[10px] text-gray-500 block leading-tight'>
                        for 30 days
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className='p-3.5 sm:p-4 rounded-xl bg-primary-50/80 border border-primary-200/90 text-xs shadow-xs'>
                  <div className='flex items-start sm:items-center justify-between gap-3'>
                    <div className='flex items-start sm:items-center gap-2.5'>
                      <Crown className='h-4 w-4 text-primary-600 shrink-0 mt-0.5 sm:mt-0' />
                      <div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-extrabold text-gray-900 text-sm'>
                            {currentPlan.name}
                          </span>
                          {currentPlan.badge && (
                            <span className='px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200'>
                              {currentPlan.badge}
                            </span>
                          )}
                        </div>
                        <p className='text-xs text-gray-600 mt-1 leading-relaxed'>
                          {currentPlan.highlight}
                        </p>
                      </div>
                    </div>
                    <div className='text-right shrink-0'>
                      <span className='font-extrabold text-primary-700 text-base tabular-nums'>
                        {currentPlan.price}
                      </span>
                      <span className='text-[10px] text-gray-500 block leading-tight'>
                        {currentPlan.period}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <form onSubmit={handleSubmit} className='space-y-6'>
        <Input
          label='Email address'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder='you@example.com'
          required
        />

        <PhoneInput
          label='Phone number'
          value={phone}
          onChange={(fullE164, digits) => {
            setPhone(fullE164);
            setLocalDigits(digits);
            if (digits.length > 0 && digits.length < 10) {
              setPhoneError('Please enter all 10 digits (e.g. 803 123 4567)');
            } else {
              setPhoneError(null);
            }
          }}
          error={phoneError}
          helperText='Enter 10 or 11 digits (e.g. 080... or 80...). Saved as +234...'
        />

        <div>
          <div className='relative'>
            <Input
              label='Password'
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='Create a strong password'
              required
            />
            <button
              type='button'
              onClick={() => setShowPassword(!showPassword)}
              className='absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors'
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className='h-5 w-5' strokeWidth={2.5} />
              ) : (
                <Eye className='h-5 w-5' strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Password strength rules */}
          {passwordTouched && (
            <div className='mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5'>
              <PasswordRule met={rules.length} label='8+ characters' />
              <PasswordRule met={rules.uppercase} label='Uppercase letter' />
              <PasswordRule met={rules.lowercase} label='Lowercase letter' />
              <PasswordRule met={rules.number} label='Number' />
            </div>
          )}
        </div>

        <div className='relative'>
          <Input
            label='Confirm password'
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder='Repeat your password'
            required
            error={
              confirmPassword.length > 0 && password !== confirmPassword
                ? 'Passwords do not match'
                : undefined
            }
          />
          <button
            type='button'
            onClick={() => setShowConfirm(!showConfirm)}
            className='absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors'
            tabIndex={-1}
          >
            {showConfirm ? (
              <EyeOff className='h-5 w-5' strokeWidth={2.5} />
            ) : (
              <Eye className='h-5 w-5' strokeWidth={2.5} />
            )}
          </button>
        </div>

        <Button
          type='submit'
          isLoading={isLoading}
          className='w-full py-3 text-[15px] rounded-full'
        >
          Create account
          {!isLoading && (
            <ArrowRight className='h-4.5 w-4.5 ml-2' strokeWidth={2.5} />
          )}
        </Button>
      </form>

      <div className='mt-8 border-t border-gray-100 pt-6'>
        <p className='text-center font-body text-[15px] text-gray-500'>
          Already have an account?{' '}
          <Link
            to='/login'
            className='font-semibold text-primary-600 hover:text-primary-500 transition-colors'
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
