import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lock, BadgeCheck, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store.ts';
import { prefetchRoute, observePrefetch } from '@/lib/routeChunks.ts';
import { ScrollReveal } from './anim.tsx';

interface FinalCtaProps {
  eyebrow?: string;
  title?: string;
  accentWord?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  className?: string;
}

export default function FinalCta({
  eyebrow = 'Get Started Today',
  title = 'Ready to streamline your business and stay NRS compliant?',
  accentWord = 'compliant?',
  subtitle = 'Join thousands of Nigerian businesses that track sales, manage debtors, and compute taxes with confidence.',
  buttonText = 'Start Free Trial',
  buttonLink = '/register',
  className = '',
}: FinalCtaProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const unobserveMain = observePrefetch(sectionRef.current, buttonLink);
    const unobservePricing = !isAuthenticated
      ? observePrefetch(sectionRef.current, '/pricing')
      : undefined;

    return () => {
      unobserveMain?.();
      unobservePricing?.();
    };
  }, [buttonLink, isAuthenticated]);

  // Render title with optional highlighted accent word
  const renderTitle = () => {
    if (!accentWord) return title;
    const parts = title.split(accentWord);
    if (parts.length === 1) return title;

    return (
      <>
        {parts[0]}
        <span className='text-primary-600'>{accentWord}</span>
        {parts.slice(1).join(accentWord)}
      </>
    );
  };

  const destination = buttonLink;
  const label = buttonText;

  return (
    <section
      ref={sectionRef}
      className={`relative py-16 sm:py-20 lg:py-24 bg-gray-50 border-t border-gray-200/80 overflow-hidden ${className}`}
    >
      <div className='mx-auto max-w-4xl px-4 sm:px-6 text-center'>
        <ScrollReveal>
          <div className='inline-flex items-center gap-2 rounded-full bg-primary-100/70 border border-primary-200/80 px-3.5 py-1 mb-4 sm:mb-5 shadow-2xs'>
            <Zap className='h-3.5 w-3.5 text-primary-600 fill-primary-600' />
            <span className='text-xs font-semibold tracking-wide text-primary-800 uppercase'>
              {eyebrow}
            </span>
          </div>

          <h2 className='text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight sm:leading-snug max-w-3xl mx-auto'>
            {renderTitle()}
          </h2>

          <p className='mt-3.5 sm:mt-4 text-sm sm:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed'>
            {subtitle}
          </p>

          <div className='mt-8 sm:mt-9 flex flex-col sm:flex-row items-center justify-center gap-3'>
            <Link
              to={destination}
              onMouseEnter={() => prefetchRoute(destination)}
              onFocus={() => prefetchRoute(destination)}
              className='w-full sm:w-auto'
            >
              <button className='w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm sm:text-base font-semibold shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]'>
                <span>{label}</span>
                <ArrowRight className='h-4.5 w-4.5' />
              </button>
            </Link>
            {!isAuthenticated && (
              <Link
                to='/pricing'
                onMouseEnter={() => prefetchRoute('/pricing')}
                onFocus={() => prefetchRoute('/pricing')}
                className='w-full sm:w-auto'
              >
                <button className='w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm sm:text-base font-semibold transition-all duration-200 active:scale-[0.98]'>
                  <span>Compare Plans</span>
                </button>
              </Link>
            )}
          </div>

          {/* Trust points */}
          <div className='mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-xs sm:text-sm text-gray-600 font-medium'>
            <span className='inline-flex items-center gap-1.5'>
              <CheckCircle2
                className='h-4 w-4 text-emerald-600'
                strokeWidth={2.2}
              />
              No credit card required
            </span>
            <span className='inline-flex items-center gap-1.5'>
              <Lock className='h-4 w-4 text-primary-600' strokeWidth={2.2} />
              Bank-grade security
            </span>
            <span className='inline-flex items-center gap-1.5'>
              <BadgeCheck
                className='h-4 w-4 text-primary-600'
                strokeWidth={2.2}
              />
              NRS 2026 compliant
            </span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
