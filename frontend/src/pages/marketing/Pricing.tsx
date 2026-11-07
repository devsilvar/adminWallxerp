import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle.ts';
import { ScrollReveal } from '@/components/marketing/anim.tsx';
import { SectionHeader, SectionContainer } from '@/components/marketing/Section.tsx';
import FAQSection from '@/components/marketing/FAQSection.tsx';
import FinalCta from '@/components/marketing/FinalCta.tsx';
import PlanComparisonTable from '@/components/PlanComparisonTable.tsx';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useTrialTimer } from '@/hooks/useTrialTimer.ts';
import {
  freeTrialPlan,
  paidPricingPlans,
  pricingFaqs,
} from '@/data/marketing.ts';

export default function Pricing() {
  useDocumentTitle(
    'Subscription Plans | WallXERP',
    'Simple, predictable subscription plans for Nigerian SMEs. 30-days FREE Trial, Starter at ₦5,000/mo, Business at ₦12,000/quarter, and Scale-Up at ₦45,000/yr.',
  );

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    hasStarted,
    isExpired,
    daysLeft,
    hoursLeft,
    minutesLeft,
    secondsLeft,
    percentRemaining,
    startTrial,
  } = useTrialTimer(isAuthenticated ? user?.trialEndsAt ?? null : null);

  return (
    <div className='bg-white'>
      {/* ── 1. Hero Header (Canonical Marketing Heading Size) ── */}
      <section className='pt-12 sm:pt-16 lg:pt-20 pb-12 sm:pb-16 bg-white border-b border-gray-100'>
        <div className='mx-auto max-w-4xl px-4 sm:px-6 text-center'>
          <ScrollReveal>
            <div className='inline-flex items-center gap-2 rounded-full bg-purple-50 border border-purple-200/80 px-4 py-1.5 mb-4 sm:mb-5 shadow-2xs'>
              <span className='text-xs font-bold tracking-wider text-[#352778] uppercase'>
                Pricing for WallX Business Suite
              </span>
            </div>

            <h1 className='text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight sm:leading-snug'>
              Transparent subscription plans that scale with{' '}
              <span className='text-primary-600'>your business.</span>
            </h1>

            <p className='mt-4 sm:mt-5 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed'>
              Start with a 30-days FREE Trial with full unrestricted access across all features. No credit card required. Upgrade whenever you need higher capacity and multi-branch management.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── 2. Plans Showcase (Sleek Freemium Bar + Wide Sharp Cards) ── */}
      <SectionContainer background='gray'>
        {/* Executive Split Freemium Spotlight Bar (Solid Black Left Anchor + Clean Descriptive Right) */}
        <ScrollReveal>
          <div className='max-w-7xl mx-auto mb-10 overflow-hidden rounded-2xl md:rounded-full bg-white border border-gray-200/90 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row items-stretch md:items-center'>
            {/* Left Block: Solid Black Anchor with Initial Short Words */}
            <div className='bg-[#0B0F17] text-white px-5 sm:px-6 py-3.5 sm:py-4 flex items-center gap-3 shrink-0 md:rounded-l-full'>
              <span className='relative flex h-2.5 w-2.5 shrink-0'>
                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500' />
              </span>
              <div className='flex items-baseline gap-2'>
                <span className='font-bold text-xs sm:text-sm tracking-tight text-white uppercase'>
                  {freeTrialPlan.name}
                </span>
                <span className='text-emerald-400 font-extrabold text-sm sm:text-base'>
                  — ₦0
                </span>
              </div>
            </div>

            {/* Right Block: Personalized Countdown Timer OR Standard Invitation + Rounded Pill Button */}
            <div className='flex-1 px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 bg-emerald-50/20 md:bg-transparent md:rounded-r-full'>
              {isAuthenticated && hasStarted && !isExpired ? (
                <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3.5 min-w-0'>
                  <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-200/90 shadow-2xs shrink-0'>
                    <span className='h-2 w-2 rounded-full bg-emerald-600 animate-pulse' />
                    <span>{daysLeft}d : {hoursLeft}h : {minutesLeft}m : {secondsLeft}s Left</span>
                  </div>
                  <div className='min-w-0'>
                    <p className='text-xs sm:text-sm text-gray-800 font-semibold leading-snug'>
                      Personalized 30-Day Trial Active
                      <span className='text-gray-500 font-normal hidden lg:inline ml-1.5'>
                        • Full unrestricted access across all tiers.
                      </span>
                    </p>
                    <div className='w-36 h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1'>
                      <div
                        className='h-full rounded-full bg-emerald-500 transition-all duration-500'
                        style={{ width: `${percentRemaining}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : isAuthenticated && isExpired ? (
                <div>
                  <p className='text-xs sm:text-sm font-bold text-gray-900 leading-snug'>
                    30-Day Trial Period Concluded
                  </p>
                  <p className='text-xs text-gray-500 mt-0.5'>
                    Select an executive plan below to lock in permanent capacity.
                  </p>
                </div>
              ) : (
                <p className='text-xs sm:text-sm text-gray-700 font-medium leading-snug'>
                  Full unrestricted access across Starter, Business & Scale-Up. No credit card required.
                </p>
              )}

              <div className='shrink-0 sm:self-center'>
                {isAuthenticated ? (
                  <Link to='/dashboard' className='inline-block w-full sm:w-auto'>
                    <button
                      type='button'
                      className='w-full sm:w-auto px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 active:scale-[0.98]'
                    >
                      <span>Go to Dashboard</span>
                      <ArrowRight className='h-3.5 w-3.5' />
                    </button>
                  </Link>
                ) : (
                  <Link
                    to={freeTrialPlan.ctaLink}
                    onClick={() => startTrial()}
                    className='inline-block w-full sm:w-auto'
                  >
                    <button
                      type='button'
                      className='w-full sm:w-auto px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 active:scale-[0.98]'
                    >
                      <span>{hasStarted ? 'Continue Registration' : freeTrialPlan.ctaText}</span>
                      <ArrowRight className='h-3.5 w-3.5' />
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* 3 Wide, Sharp Executive Cards Grid */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto items-stretch pt-2'>
          {paidPricingPlans.map((plan) => {
            const isQuarterly = plan.id === 'business';
            const isAnnual = plan.id === 'scale';
            const priceDisplay = isAnnual
              ? '₦45,000'
              : isQuarterly
                ? '₦12,000'
                : '₦5,000';
            const periodDisplay = isAnnual
              ? '/Yearly'
              : isQuarterly
                ? '/Quarterly'
                : '/Monthly';
            const planBadge = isQuarterly
              ? 'Quarterly • Most Popular'
              : isAnnual
                ? 'Annual • Best Value'
                : 'Monthly Plan';

            return (
              <ScrollReveal key={plan.id}>
                <div
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                  className={`h-full flex flex-col justify-between rounded-2xl p-6 sm:p-7 lg:p-8 transition-all duration-200 relative ${
                    isQuarterly
                      ? 'bg-[#352778] text-white border-2 border-purple-400/40 shadow-xl shadow-[#352778]/30 transform lg:-translate-y-1.5'
                      : 'bg-white border border-gray-200 shadow-md shadow-gray-200/50 hover:border-[#352778]/40 hover:shadow-xl'
                  }`}
                >
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
                      <h3
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                        className={`text-2xl sm:text-[26px] font-extrabold tracking-tight ${
                          isQuarterly ? 'text-white' : 'text-[#352778]'
                        }`}
                      >
                        {plan.name}
                      </h3>
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
                      <ul className='space-y-3' style={{ fontFamily: "'Montserrat', sans-serif" }}>
                        {plan.features.map((feat) => (
                          <li key={feat} className='flex items-start gap-3'>
                            <CheckCircle2
                              className={`h-5.5 w-5.5 sm:h-6 sm:w-6 shrink-0 mt-0.5 ${
                                isQuarterly
                                  ? 'text-white/95'
                                  : 'text-[#352778]'
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
                          className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                            isQuarterly ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {priceDisplay}
                        </span>
                        <span
                          style={{ fontFamily: "'Montserrat', sans-serif" }}
                          className={`text-sm sm:text-base font-normal ${
                            isQuarterly ? 'text-purple-200' : 'text-gray-500'
                          }`}
                        >
                          {periodDisplay}
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

                    <Link
                      to={isAuthenticated ? `/subscription?plan=${plan.id}` : plan.ctaLink}
                      className='block mt-5'
                    >
                      <button
                        type='button'
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                        className={`w-full py-3.5 sm:py-4 px-6 rounded-full text-sm sm:text-base font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-md active:scale-[0.98] ${
                          isQuarterly
                            ? 'bg-[#E85918] hover:bg-[#D44E12] text-white shadow-orange-950/25 hover:shadow-lg'
                            : 'bg-[#352778] hover:bg-[#2A1E63] text-white shadow-purple-950/20 hover:shadow-lg'
                        }`}
                      >
                        <span>{plan.ctaText}</span>
                        <ArrowRight className='h-4 w-4' />
                      </button>
                    </Link>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </SectionContainer>

      {/* ── 3. Plan Comparison Matrix ── */}
      <SectionContainer background='white'>
        <SectionHeader
          eyebrow='Detailed Matrix'
          title='Compare plan features side-by-side.'
          accentWord='features'
          subtitle='Transparent breakdown of caps, allowances, and plan features.'
        />

        <PlanComparisonTable />
      </SectionContainer>

      {/* ── 4. Pricing FAQs ── */}
      <FAQSection
        items={pricingFaqs}
        title='Frequently asked questions about subscription'
        accentWord='subscription'
        subtitle='Details regarding payments, trial periods, and account activations.'
      />

      {/* ── 5. Final CTA ── */}
      <FinalCta
        title='Ready to get started? Test WallXERP with zero risk.'
        accentWord='zero'
        subtitle='Sign up in under 2 minutes. Start with a 30-day free trial with complete access across all features.'
        buttonText='Start 30-Day Free Trial'
        buttonLink='/register?plan=free'
      />
    </div>
  );
}
