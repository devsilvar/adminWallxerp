import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  Check,
  UploadCloud,
  FileText,
  ArrowRight,
  ArrowLeft,
  Crown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle.ts';
import { useTrialTimer } from '@/hooks/useTrialTimer.ts';
import zenithLogo from '@/assets/zenith.png';

// Real Zenith Bank lockup (asset is opaque with a white ground — only valid on
// white surfaces). Its red is the brand's, so no brand hex is hard-coded here.
function ZenithBankLogo({ className = 'h-10' }: { className?: string }) {
  return (
    <img
      src={zenithLogo}
      alt='Zenith Bank Plc'
      width={173}
      height={183}
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  );
}

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      className={className}
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' />
    </svg>
  );
}

interface PlanOption {
  id: 'free' | 'starter' | 'business' | 'scale';
  name: string;
  priceMonth: number;
  priceQuarter: number;
  priceAnnual: number;
  tagline: string;
  popular?: boolean;
  trialBadge?: string;
  savingsBadge?: string;
  features: string[];
}

const PLANS: PlanOption[] = [
  {
    id: 'free',
    name: '30-days FREE Trial (Freemiums)',
    priceMonth: 0,
    priceQuarter: 0,
    priceAnnual: 0,
    trialBadge: '30-Day Free Trial',
    tagline: 'Full exploratory trial for growing businesses and sole vendors.',
    features: ['Everything in Starter, Business and ScaleUp'],
  },
  {
    id: 'starter',
    name: 'Monthly (Starter)',
    priceMonth: 5000,
    priceQuarter: 15000,
    priceAnnual: 50000,
    tagline: 'NRS store operations and sales records.',
    features: [
      'Up to 3 Team Members',
      'Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Manage Up to 2 businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Excel & CSV bulk sales import',
      '15 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Expense Management',
      'Generate Reports',
      'FIR/NRS Tax Calculation & Filling',
      'Customer Retention & Loyalty Program',
    ],
  },
  {
    id: 'business',
    name: 'Quarterly (Business)',
    priceMonth: 5000,
    priceQuarter: 12000,
    priceAnnual: 45000,
    popular: true,
    trialBadge: 'Saving ₦3,000',
    savingsBadge: 'Saving ₦3,000',
    tagline:
      'Quarterly Plan for scaling SMEs with customer credit and automated triggers.',
    features: [
      'Everything in Starter Plan',
      'Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Up to 10 team members',
      'Manage Up to 5 businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Unlimited Receipt',
      'Excel & CSV bulk sales & expense import',
      '30 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Customer Credit Management (BNPL)',
      'Expense Management',
      'Generate Reports',
      '19 Automated Reminders & Triggers',
      'FIR/NRS Tax Calculation & Filling',
      'Business Intelligence Reports/Analytics',
      'Customer Retention & Loyalty Program',
    ],
  },
  {
    id: 'scale',
    name: 'Annual (Scale-Up)',
    priceMonth: 5000,
    priceQuarter: 12000,
    priceAnnual: 45000,
    trialBadge: 'Saving ₦15,000',
    savingsBadge: 'Saving ₦15,000',
    tagline:
      'Annual Plan for high-volume enterprises with unlimited operations.',
    features: [
      'Everything in Business Plan',
      'Unlimited team members',
      'Unlimited Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Manage Up to Unlimited businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Bulk Invoicing & Receipting',
      'Unlimited Receipt',
      'Excel & CSV bulk sales & expense import',
      '30 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Customer Credit Management (BNPL)',
      'Expense Management',
      'Generate Reports',
      '30 Automated Reminders & Triggers',
      'Business Intelligence Reports/Analytics',
      'FIR/NRS Tax Calculation & Filling',
      'Customer Retention & Loyalty Program',
    ],
  },
];

const BANK_DETAILS = {
  bankName: 'Zenith Bank Plc',
  accountNumber: '1214382269',
  accountName: 'WallX Africa Limited',
  sortCode: '057150013',
};

const WHATSAPP_NUMBER = '2348147490832';

export default function Subscription() {
  useDocumentTitle(
    'Subscription & Plans | WallXERP',
    'Manage your subscription plan tier, direct Zenith Bank payment transfer, and proof of payment upload.',
  );

  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);

  // Default to query param if provided, otherwise 'business' (most popular upgrade)
  const isNewBiz =
    searchParams.get('new') === 'true' ||
    searchParams.get('firstBiz') === 'true';
  const initialPlanParam = searchParams.get('plan');
  const validInitial: 'starter' | 'business' | 'scale' =
    initialPlanParam === 'starter' ||
    initialPlanParam === 'business' ||
    initialPlanParam === 'scale'
      ? initialPlanParam
      : 'business';

  const [selectedPlanId, setSelectedPlanId] =
    useState<PlanOption['id']>(validInitial);
  // Two-step flow: pick a tier first, then reveal bank transfer + receipt upload.
  const [step, setStep] = useState<'plans' | 'payment'>('plans');

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId) || PLANS[2];

  const getPlanPricingDetails = (plan: PlanOption) => {
    if (plan.id === 'starter') {
      return {
        amount: 5000,
        period: '/mo',
        cycle: 'monthly',
        billingLabel: 'Monthly',
        termLabel: 'Monthly Plan',
        subtext: 'Billed monthly at ₦5,000/mo',
      };
    }
    if (plan.id === 'business') {
      return {
        amount: 12000,
        period: '/quarter',
        cycle: 'quarterly',
        billingLabel: 'Quarterly',
        termLabel: 'Quarterly Plan',
        subtext: 'Billed quarterly · Saving ₦3,000',
      };
    }
    if (plan.id === 'scale') {
      return {
        amount: 45000,
        period: '/yr',
        cycle: 'annual',
        billingLabel: 'Annual',
        termLabel: 'Annual Plan',
        subtext: 'Billed annually · Saving ₦15,000',
      };
    }
    return {
      amount: 0,
      period: '',
      cycle: 'trial',
      billingLabel: '30-Day Free Trial',
      termLabel: '30-Day Free Trial',
      subtext: 'Free for 30 days',
    };
  };

  const selectedPricing = getPlanPricingDetails(selectedPlan);
  const payableAmount = selectedPricing.amount;
  const billingCycle = selectedPricing.cycle;

  const { daysLeft, hoursLeft, minutesLeft, secondsLeft, percentRemaining, isExpired } =
    useTrialTimer(activeBusiness?.createdAt || user?.createdAt);

  // Form fields
  const [name, setName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [businessName, setBusinessName] = useState(
    activeBusiness?.businessName || '',
  );
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user?.fullName && !name) setName(user.fullName);
    if (user?.email && !email) setEmail(user.email);
    if (user?.phone && !phone) setPhone(user.phone);
    if (activeBusiness?.businessName && !businessName) {
      setBusinessName(activeBusiness.businessName);
    }
  }, [user, activeBusiness, name, email, phone, businessName]);

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(BANK_DETAILS.accountNumber);
      setCopied(true);
      toast.success('Zenith Bank account number copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy account number');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('File size must be under 10MB');
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmitProof = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter your phone or WhatsApp number');
      return;
    }
    if (!file) {
      toast.error('Please select your payment receipt or transfer screenshot');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('email', email.trim());
      formData.append('phone', phone.trim());
      if (businessName.trim()) {
        formData.append('businessName', businessName.trim());
      }
      formData.append(
        'plan',
        `${selectedPlan.name} (${billingCycle.toUpperCase()})`,
      );
      formData.append('amount', payableAmount.toLocaleString());
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }
      formData.append('file', file);

      const res = await fetch('/api/v1/subscription/proof', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.error?.message || data.message || 'Submission failed',
        );
      }

      setSubmitted(true);
      toast.success('Proof of payment received! Sent to subscription@wallx.co');
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to submit proof. You can also chat on WhatsApp.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=Hello%20WallXERP%20Billing,%20I%20have%20transferred%20₦${payableAmount.toLocaleString()}%20for%20the%20${encodeURIComponent(
    selectedPlan.name,
  )}%20(${billingCycle})%20plan%20to%20Zenith%20Bank%201214382269.%20Email:%20${encodeURIComponent(
    email || name || 'Subscriber',
  )}`;

  // The scroll container is <main> inside AppLayout, not window.
  const scrollMainToTop = () => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPayment = () => {
    setStep('payment');
    scrollMainToTop();
  };

  const goToPlans = () => {
    setStep('plans');
    scrollMainToTop();
  };

  return (
    <div
      className={`space-y-5 ${
        !isAuthenticated ? 'mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10' : ''
      }`}
    >
      {/* ── 1. Page Header ── */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2'>
          <h1 className='text-xl sm:text-2xl font-bold tracking-tight text-gray-900'>
            Subscription & Plans
          </h1>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600'>
            Free Plan Active
          </span>
        </div>

        <div className='flex items-center gap-3'>
          {/* Step indicator — gives a sense of forward motion through the flow */}
          <div className='hidden sm:flex items-center gap-2 text-xs font-semibold text-gray-500'>
            <span
              className={
                step === 'plans' ? 'text-primary-700' : 'text-gray-500'
              }
            >
              1. Plan
            </span>
            <span className='h-px w-4 bg-gray-200' />
            <span
              className={
                step === 'payment' ? 'text-primary-700' : 'text-gray-500'
              }
            >
              2. Payment
            </span>
          </div>
          <a
            href={whatsappUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/70 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs'
          >
            <WhatsAppIcon className='h-3.5 w-3.5 text-emerald-600' />
            <span>Chat on WhatsApp</span>
          </a>
        </div>
      </div>

      {/* ── Optional: New Business Setup Banner ── */}
      {isNewBiz && step === 'plans' && (
        <div className='rounded-2xl border border-primary-200/90 bg-primary-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs'>
          <div className='flex items-start sm:items-center gap-3'>
            <div className='h-9 w-9 rounded-full bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-2xs'>
              <Crown className='h-5 w-5' />
            </div>
            <div>
              <p className='text-xs sm:text-sm font-bold text-gray-900'>
                Business created successfully!
              </p>
              <p className='text-xs text-gray-600 mt-0.5'>
                Choose your <strong>{selectedPlan.name}</strong> plan below,
                then transfer to Zenith Bank Plc to activate it — or explore
                your dashboard and pay whenever you are ready.
              </p>
            </div>
          </div>
          <Link
            to='/dashboard'
            className='inline-flex items-center justify-center px-4 py-2 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors shrink-0 shadow-2xs'
          >
            <span>Skip for now, Go to Dashboard →</span>
          </Link>
        </div>
      )}

      {/* ── Step 1: Choose a plan tier ── */}
      {step === 'plans' ? (
        <div className='space-y-6'>
          <div className='pb-2 border-b border-gray-100'>
            <h2 className='text-sm font-semibold text-gray-900'>
              1. Choose a Subscription Plan
            </h2>
            <p className='text-xs text-gray-500 mt-0.5'>
              Direct monthly, quarterly, or annual plans for your business.
            </p>
          </div>

          {/* ── Executive Split Freemium Spotlight Bar (Solid Black Left Anchor + Clean Descriptive Right) ── */}
          <div className='overflow-hidden rounded-2xl md:rounded-full bg-white border border-gray-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col md:flex-row items-stretch md:items-center'>
            {/* Left Block: Solid Black Anchor with Initial Short Words */}
            <div className='bg-[#0B0F17] text-white px-5 sm:px-6 py-3.5 sm:py-4 flex items-center gap-3 shrink-0 md:rounded-l-full'>
              <span className='relative flex h-2.5 w-2.5 shrink-0'>
                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500' />
              </span>
              <div className='flex items-baseline gap-2'>
                <span className='font-bold text-xs sm:text-sm tracking-tight text-white uppercase'>
                  {PLANS[0].name}
                </span>
                <span className='text-emerald-400 font-extrabold text-sm sm:text-base'>
                  — ₦0
                </span>
              </div>
            </div>

            {/* Right Block: Personalized Countdown Timer + Status Pill Badge */}
            <div className='flex-1 px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 bg-emerald-50/20 md:bg-transparent md:rounded-r-full'>
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3.5 min-w-0'>
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs shrink-0 ${
                    isExpired
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-200/90'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isExpired
                        ? 'bg-amber-600'
                        : 'bg-emerald-600 animate-pulse'
                    }`}
                  />
                  <span>
                    {isExpired
                      ? 'Trial Period Concluded'
                      : `${daysLeft}d : ${hoursLeft}h : ${minutesLeft}m : ${secondsLeft}s Left`}
                  </span>
                </div>
                <div className='min-w-0'>
                  <p className='text-xs sm:text-sm text-gray-800 font-semibold leading-snug'>
                    {isExpired
                      ? 'Your 30-day trial has concluded'
                      : 'Full unrestricted access active across Starter, Business & Scale-Up'}
                    <span className='text-gray-500 font-normal hidden lg:inline ml-1.5'>
                      •{' '}
                      {isExpired
                        ? 'Upgrade below to retain access.'
                        : 'Upgrade below to lock in permanent capacity.'}
                    </span>
                  </p>
                  {!isExpired && (
                    <div className='w-36 h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1'>
                      <div
                        className='h-full rounded-full bg-emerald-500 transition-all duration-500'
                        style={{ width: `${percentRemaining}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className='shrink-0 sm:self-center'>
                <span
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border ${
                    isExpired
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${isExpired ? 'text-amber-600' : 'text-emerald-600'}`}
                  />
                  <span>
                    {isExpired ? 'Upgrade Required' : 'Freemium Active'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* 3 Executive Subscription Cards Grid (Sharp, Wide, WallX Inspired) */}
          <fieldset className='grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch pt-2'>
            <legend className='sr-only'>Choose a subscription plan</legend>
            {PLANS.slice(1).map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const pricing = getPlanPricingDetails(plan);
              const isQuarterly = plan.id === 'business';
              const isAnnual = plan.id === 'scale';
              const planBadge = isQuarterly
                ? 'Quarterly • Most Popular'
                : isAnnual
                  ? 'Annual • Best Value'
                  : 'Monthly Plan';

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                  className={`h-full flex flex-col justify-between rounded-2xl p-6 sm:p-7 lg:p-8 transition-all duration-200 relative cursor-pointer ${
                    isQuarterly
                      ? `bg-[#352778] text-white border-2 ${
                          isSelected
                            ? 'border-orange-400 ring-4 ring-orange-400/40 shadow-2xl'
                            : 'border-purple-400/40 shadow-xl shadow-[#352778]/30'
                        } transform lg:-translate-y-1.5`
                      : `bg-white border ${
                          isSelected
                            ? 'border-[#352778] ring-4 ring-[#352778]/20 shadow-xl'
                            : 'border-gray-200 shadow-md shadow-gray-200/50 hover:border-[#352778]/40'
                        }`
                  }`}
                >
                  <input
                    type='radio'
                    name='subscription-plan'
                    value={plan.id}
                    checked={isSelected}
                    onChange={() => setSelectedPlanId(plan.id)}
                    className='sr-only'
                  />

                  {/* Floating Pill Badge at Top Edge */}
                  <div className='absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap'>
                    <span
                      style={{ fontFamily: "'Montserrat', sans-serif" }}
                      className={`px-5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${
                        isQuarterly
                          ? 'bg-[#E85918] text-white'
                          : 'bg-[#352778] text-white'
                      }`}
                    >
                      {planBadge}
                    </span>
                  </div>

                  <div>
                    {/* Header */}
                    <div className='pt-1'>
                      <div className='flex items-center justify-between'>
                        <h3
                          style={{ fontFamily: "'Montserrat', sans-serif" }}
                          className={`text-2xl sm:text-[26px] font-extrabold tracking-tight ${
                            isQuarterly ? 'text-white' : 'text-[#352778]'
                          }`}
                        >
                          {plan.name}
                        </h3>
                        <span
                          className={`h-6 w-6 rounded-full flex items-center justify-center border-2 transition-all ${
                            isSelected
                              ? isQuarterly
                                ? 'border-orange-400 bg-[#E85918] text-white'
                                : 'border-[#352778] bg-[#352778] text-white'
                              : isQuarterly
                                ? 'border-purple-400/60 bg-transparent'
                                : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isSelected && (
                            <Check className='h-3.5 w-3.5 stroke-[3]' />
                          )}
                        </span>
                      </div>
                      <p
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                        className={`mt-2 text-xs sm:text-sm font-normal leading-relaxed min-h-[38px] ${
                          isQuarterly ? 'text-purple-100/90' : 'text-gray-600'
                        }`}
                      >
                        {plan.tagline}
                      </p>
                    </div>

                    {/* Features List — Razor-sharp Montserrat Regular with Crisp Check Icons */}
                    <div
                      className={`my-5 pt-4 border-t ${
                        isQuarterly ? 'border-purple-500/30' : 'border-gray-100'
                      }`}
                    >
                      <ul
                        className='space-y-3'
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                      >
                        {plan.features.map((feat) => (
                          <li key={feat} className='flex items-start gap-3'>
                            <CheckCircle2
                              className={`h-5.5 w-5.5 sm:h-6 sm:w-6 shrink-0 mt-0.5 ${
                                isQuarterly ? 'text-white/95' : 'text-[#352778]'
                              }`}
                              strokeWidth={1.8}
                            />
                            <span
                              style={{ fontFamily: "'Montserrat', sans-serif" }}
                              className={`text-[13.5px] sm:text-[14px] font-normal leading-snug tracking-[-0.01em] antialiased ${
                                isQuarterly ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {feat}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Pricing and Action CTA Block */}
                  <div
                    className={`mt-6 pt-4 border-t ${
                      isQuarterly ? 'border-purple-500/30' : 'border-gray-100'
                    }`}
                  >
                    <div>
                      <span
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                        className={`text-xs uppercase font-bold tracking-wider block mb-1 ${
                          isQuarterly ? 'text-purple-200/80' : 'text-gray-500'
                        }`}
                      >
                        Pricing
                      </span>
                      <div className='flex items-baseline gap-1.5'>
                        <span
                          style={{ fontFamily: "'Montserrat', sans-serif" }}
                          className={`text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                            isQuarterly ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          ₦{pricing.amount.toLocaleString()}
                        </span>
                        <span
                          style={{ fontFamily: "'Montserrat', sans-serif" }}
                          className={`text-sm sm:text-base font-normal ${
                            isQuarterly ? 'text-purple-200' : 'text-gray-500'
                          }`}
                        >
                          {pricing.period}
                        </span>
                      </div>

                      {/* Savings Pill */}
                      {plan.trialBadge ? (
                        <div className='mt-2'>
                          <span
                            style={{ fontFamily: "'Montserrat', sans-serif" }}
                            className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              isQuarterly
                                ? 'bg-[#E85918]/20 text-orange-200 border-orange-400/40'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            {plan.trialBadge}
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{ fontFamily: "'Montserrat', sans-serif" }}
                          className='mt-2 text-xs font-normal text-gray-500'
                        >
                          Billed monthly
                        </div>
                      )}
                    </div>

                    <button
                      type='button'
                      style={{ fontFamily: "'Montserrat', sans-serif" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanId(plan.id);
                        goToPayment();
                      }}
                      className={`w-full py-3.5 sm:py-4 px-6 rounded-full text-sm sm:text-base font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-md active:scale-[0.98] mt-5 ${
                        isQuarterly
                          ? 'bg-[#E85918] hover:bg-[#D44E12] text-white shadow-orange-950/25 hover:shadow-lg'
                          : 'bg-[#352778] hover:bg-[#2A1E63] text-white shadow-purple-950/20 hover:shadow-lg'
                      }`}
                    >
                      <span>
                        {isSelected
                          ? `Pay ₦${pricing.amount.toLocaleString()} via Transfer`
                          : `Choose ${plan.name}`}
                      </span>
                      <ArrowRight className='h-4 w-4' />
                    </button>
                  </div>
                </div>
              );
            })}
          </fieldset>
        </div>
      ) : (
        <div className='space-y-6'>
          {/* ── Step 2: Payment transfer & upload ── */}
          <div className='rounded-xl border border-primary-100 bg-primary-50/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
            <div className='flex items-start sm:items-center gap-3'>
              <button
                type='button'
                onClick={goToPlans}
                className='inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shrink-0 shadow-2xs'
              >
                <ArrowLeft className='h-3.5 w-3.5' />
                <span>Change plan</span>
              </button>
              <div>
                <h2 className='text-sm font-bold text-gray-900'>
                  You're upgrading to {selectedPlan.name}
                </h2>
                <p className='text-xs text-gray-600 mt-0.5'>
                  One transfer away from unlocking it —{' '}
                  {selectedPricing.termLabel}.
                </p>
              </div>
            </div>
            <div className='text-left sm:text-right shrink-0'>
              <span className='text-2xl font-extrabold text-primary-700 tabular-nums'>
                ₦{payableAmount.toLocaleString()}
              </span>
              <p className='text-xs text-gray-500 mt-0.5'>
                {selectedPricing.period === '/yr'
                  ? 'per year'
                  : selectedPricing.period === '/quarter'
                    ? 'per quarter'
                    : 'per month'}
              </p>
            </div>
          </div>

          <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'>
            {/* Zenith Bank Account Details Card */}
            <div className='lg:col-span-5 rounded-xl border border-gray-200/90 bg-white p-6 shadow-2xs space-y-5'>
              <div>
                <div className='flex items-center justify-between pb-3 border-b border-gray-100'>
                  <div className='flex items-center gap-2.5'>
                    <ZenithBankLogo className='h-9' />
                    <div>
                      <h3 className='text-sm font-bold text-gray-900 leading-snug'>
                        {BANK_DETAILS.bankName}
                      </h3>
                      <p className='text-xs text-gray-500 leading-snug'>
                        Official Collection Account
                      </p>
                    </div>
                  </div>

                  <span className='inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20'>
                    Verified
                  </span>
                </div>
              </div>

              {/* Account Number Box */}
              <div className='rounded-lg border border-gray-200 bg-gray-50/60 p-3.5'>
                <div className='text-xs font-semibold uppercase tracking-wider text-gray-600 leading-snug mb-1'>
                  Account Number
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-mono text-2xl font-bold tracking-wider text-gray-900 tabular-nums select-all'>
                    {BANK_DETAILS.accountNumber}
                  </span>
                  <button
                    type='button'
                    onClick={copyAccountNumber}
                    className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                      copied
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-2xs'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className='h-3 w-3' /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className='h-3 w-3' /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Details Table */}
              <div className='rounded-lg border border-gray-100 divide-y divide-gray-100 text-[13px] leading-snug'>
                <div className='flex items-center justify-between gap-3 p-3'>
                  <span className='text-gray-600'>Account Name</span>
                  <span className='font-semibold text-gray-900 text-right'>
                    {BANK_DETAILS.accountName}
                  </span>
                </div>
                <div className='flex items-center justify-between gap-3 p-3'>
                  <span className='text-gray-600'>Plan Selected</span>
                  <span className='font-semibold text-gray-900 text-right'>
                    {selectedPlan.name}
                  </span>
                </div>
                <div className='flex items-center justify-between gap-3 p-3'>
                  <span className='text-gray-600'>Amount to Transfer</span>
                  <span className='font-extrabold text-primary-700 text-sm tabular-nums'>
                    ₦{payableAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <p className='text-xs text-gray-600 leading-relaxed'>
                Put your business name or email in the transfer narration so we
                can match your payment automatically.
              </p>

              {/* Direct WhatsApp Quick Chat */}
              <div className='pt-2 border-t border-gray-100'>
                <a
                  href={whatsappUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-colors'
                >
                  <WhatsAppIcon className='h-4 w-4 text-emerald-600' />
                  <span>Chat on WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Proof of Payment Upload Card */}
            <div className='lg:col-span-7 rounded-xl border border-gray-200/90 bg-white p-6 shadow-2xs'>
              <div className='pb-3 border-b border-gray-100 mb-5'>
                <h2 className='text-sm font-semibold text-gray-900'>
                  Upload Proof of Payment
                </h2>
                <p className='text-xs text-gray-600 mt-1 leading-relaxed'>
                  Upload your receipt and we'll send it to{' '}
                  <span className='font-medium text-gray-800'>
                    subscription@wallx.co
                  </span>
                  .
                </p>
              </div>

              {submitted ? (
                <div className='p-8 rounded-lg bg-emerald-50/60 border border-emerald-200 text-center space-y-3'>
                  <div className='h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto'>
                    <CheckCircle2 className='h-8 w-8' />
                  </div>
                  <h3 className='text-lg font-bold text-gray-900'>
                    You're all set 🎉
                  </h3>
                  <p className='text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto'>
                    Your receipt for the <strong>{selectedPlan.name}</strong>{' '}
                    plan is in. We're activating it now — welcome to the
                    upgrade.
                  </p>
                  <div className='pt-2 flex flex-wrap items-center justify-center gap-2'>
                    <a
                      href={whatsappUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors'
                    >
                      <WhatsAppIcon className='h-3.5 w-3.5' />
                      <span>Notify Support on WhatsApp</span>
                    </a>
                    <button
                      type='button'
                      onClick={() => {
                        setSubmitted(false);
                        setFile(null);
                      }}
                      className='inline-flex items-center px-4 py-2.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold'
                    >
                      Upload Another Receipt
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitProof} className='space-y-5'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5'>
                    <div>
                      <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                        Full Name *
                      </label>
                      <input
                        type='text'
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder='e.g. Adebayo Adeleke'
                        className='w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                      />
                    </div>

                    <div>
                      <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                        Email Address *
                      </label>
                      <input
                        type='email'
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder='e.g. adebayo@example.com'
                        className='w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                      />
                    </div>

                    <div>
                      <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                        Phone / WhatsApp *
                      </label>
                      <input
                        type='tel'
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder='e.g. 08147490832'
                        className='w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                      />
                    </div>

                    <div>
                      <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                        Business Name
                      </label>
                      <input
                        type='text'
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder='e.g. Balogun Ventures'
                        className='w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                      />
                    </div>
                  </div>

                  {/* Selected Plan Summary */}
                  <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs'>
                    <span className='text-gray-600'>
                      Paying for{' '}
                      <strong className='text-gray-900'>
                        {selectedPlan.name}
                      </strong>
                    </span>
                    <span className='font-extrabold text-primary-700 tabular-nums'>
                      ₦{payableAmount.toLocaleString()}
                    </span>
                  </div>

                  {/* File Upload Dropzone */}
                  <div>
                    <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                      Upload Payment Receipt / Transfer Screenshot *
                    </label>
                    <div className='relative rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-500 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/30 transition-colors p-5 text-center bg-gray-50/50 hover:bg-white cursor-pointer'>
                      <input
                        type='file'
                        required
                        accept='image/jpeg,image/png,image/webp,application/pdf'
                        onChange={handleFileChange}
                        className='absolute inset-0 w-full h-full opacity-0 cursor-pointer'
                      />
                      {file ? (
                        <div className='flex items-center justify-center gap-2.5 text-emerald-700'>
                          <FileText className='h-6 w-6 text-emerald-600 shrink-0' />
                          <div className='text-left min-w-0'>
                            <p className='text-xs font-bold text-gray-900 truncate max-w-xs'>
                              {file.name}
                            </p>
                            <p className='text-xs text-gray-600 mt-0.5'>
                              {(file.size / 1024 / 1024).toFixed(2)} MB • Click
                              to replace file
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <UploadCloud className='mx-auto h-7 w-7 text-gray-400 mb-1.5' />
                          <p className='text-[13px] font-semibold text-gray-700 mt-1'>
                            Click or drag transfer receipt here
                          </p>
                          <p className='text-xs text-gray-600 mt-1'>
                            PNG, JPG, WebP or PDF (up to 10MB)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                      Transaction Reference or Notes (Optional)
                    </label>
                    <input
                      type='text'
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder='e.g. Session ID 000015'
                      className='w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                    />
                  </div>

                  {/* Submit Button */}
                  <div className='pt-1'>
                    <button
                      type='submit'
                      disabled={submitting}
                      className='w-full py-3.5 px-6 rounded-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-bold text-xs sm:text-sm shadow-md shadow-primary-900/15 hover:shadow-lg hover:shadow-primary-900/20 transition-all flex items-center justify-center gap-1.5'
                    >
                      {submitting ? (
                        <>
                          <span className='animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent' />
                          <span>Submitting…</span>
                        </>
                      ) : (
                        <>
                          <span>Complete My Upgrade</span>
                          <ArrowRight className='h-3.5 w-3.5' />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
