import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Receipt,
  ShieldCheck,
  CreditCard,
  Zap,
  ChevronRight,
  Clock,
  BarChart3,
  FileText,
  Globe2,
  Bell,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle.ts';
import { ScrollReveal } from '@/components/marketing/anim.tsx';
import { SectionHeader, SectionContainer } from '@/components/marketing/Section.tsx';
import FinalCta from '@/components/marketing/FinalCta.tsx';
import { howItWorksSteps, trustIndicators } from '@/data/marketing.ts';
import { prefetchRoute } from '@/lib/routeChunks.ts';

/* ─── Hero 3D Interactive Dashboard Mockup ─── */
function HeroDashboardPreview() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      x: (y - 0.5) * -10,
      y: (x - 0.5) * 14,
    });
    setMousePos({ x: x * 100, y: y * 100 });
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div className='mt-10 sm:mt-14 lg:mt-16 relative mx-auto max-w-5xl px-2 sm:px-0'>
      {/* Dynamic ambient backdrops */}
      <div
        className={`absolute -inset-8 rounded-3xl bg-gradient-to-r from-primary-500/30 via-purple-500/20 to-pink-500/30 blur-3xl transition-all duration-700 pointer-events-none ${
          isHovered ? 'opacity-85 scale-105' : 'opacity-50 scale-100'
        }`}
      />
      <div
        className='absolute -top-4 -left-4 sm:-left-8 w-16 sm:w-24 h-16 sm:h-24 bg-gradient-to-br from-primary-400/20 to-purple-400/20 blur-xl animate-blob-morph animate-bounce-gentle pointer-events-none'
        style={{ animationDelay: '0s' }}
      />
      <div
        className='absolute -bottom-4 -right-4 sm:-right-8 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-purple-400/20 to-pink-400/20 blur-xl animate-blob-morph pointer-events-none'
        style={{ animationDelay: '2s' }}
      />
      <div
        className='absolute top-1/2 -right-6 w-12 h-12 bg-gradient-to-br from-fuchsia-400/15 to-purple-400/15 blur-lg animate-sway pointer-events-none'
        style={{ animationDelay: '1s' }}
      />

      {/* Floating Badge 1 - Top Left: Live FIRS Engine Active */}
      <div
        className='absolute -top-4 -left-1 sm:-left-5 z-30 hidden sm:flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md border border-gray-200/80 px-3.5 py-1.5 shadow-lg shadow-primary-900/10 transition-all duration-300 hover:scale-105 animate-bounce-gentle select-none cursor-default'
        style={{ animationDuration: '6s' }}
      >
        <span className='relative flex h-2 w-2'>
          <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
          <span className='relative inline-flex rounded-full h-2 w-2 bg-emerald-500' />
        </span>
        <span className='text-xs font-bold text-gray-800 tracking-tight'>
          FIRS Engine Active
        </span>
      </div>

      {/* Floating Badge 2 - Bottom Right: Auto Tax Calculation */}
      <div
        className='absolute -bottom-4 -right-1 sm:-right-5 z-30 hidden sm:flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-gray-200/80 px-3.5 py-2 shadow-lg shadow-primary-900/10 transition-all duration-300 hover:scale-105 animate-sway select-none cursor-default'
        style={{ animationDuration: '7s', animationDelay: '1s' }}
      >
        <div className='h-7 w-7 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white shadow-sm'>
          <Zap className='h-3.5 w-3.5 fill-current' />
        </div>
        <div className='text-left'>
          <div className='text-[9px] uppercase font-bold text-gray-400 leading-tight'>
            Auto-calculated
          </div>
          <div className='text-xs font-bold text-gray-900 tabular-nums leading-tight'>
            ₦25,500 in 0.3s
          </div>
        </div>
      </div>

      {/* 3D Interactive Browser Mockup Container */}
      <div
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className='relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-2xl shadow-primary-900/10 mx-2 sm:mx-0 will-change-transform'
        style={{
          transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(${isHovered ? 1.015 : 1}, ${isHovered ? 1.015 : 1}, 1)`,
          transition: isHovered
            ? 'transform 0.12s ease-out'
            : 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Dynamic Specular Light Glare following mouse */}
        {isHovered && (
          <div
            className='absolute inset-0 pointer-events-none z-20 transition-opacity duration-300'
            style={{
              background: `radial-gradient(circle 420px at ${mousePos.x}% ${mousePos.y}%, rgba(255, 255, 255, 0.45), transparent 80%)`,
            }}
          />
        )}

        {/* Browser Top Bar */}
        <div className='flex items-center gap-2 border-b border-gray-100 bg-gray-50/90 px-3 sm:px-4 py-2 sm:py-3'>
          <div className='flex gap-1.5'>
            <span className='h-2.5 sm:h-3 w-2.5 sm:w-3 rounded-full bg-red-400 transition-transform duration-200 hover:scale-125' />
            <span className='h-2.5 sm:h-3 w-2.5 sm:w-3 rounded-full bg-amber-400 transition-transform duration-200 hover:scale-125' />
            <span className='h-2.5 sm:h-3 w-2.5 sm:w-3 rounded-full bg-green-400 transition-transform duration-200 hover:scale-125' />
          </div>
          <div className='mx-auto hidden sm:flex h-5 sm:h-6 items-center rounded-md bg-gray-100 px-2 sm:px-3'>
            <span className='font-body text-[9px] sm:text-[10px] text-gray-400'>
              app.paymytax.com/dashboard
            </span>
          </div>
        </div>

        <div className='grid grid-cols-12'>
          <div className='col-span-3 hidden lg:block border-r border-gray-100 bg-gray-50/50 p-3 sm:p-4'>
            <div className='flex items-center gap-2 mb-4 sm:mb-6'>
              <div className='h-7 sm:h-8 w-7 sm:w-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm'>
                <span className='text-white text-[10px] sm:text-xs font-bold'>
                  P
                </span>
              </div>
              <span className='text-[10px] sm:text-xs font-semibold text-gray-800'>
                PayMyTax
              </span>
            </div>
            {[
              'Dashboard',
              'Sales',
              'Expenses',
              'Tax Reports',
              'Payments',
            ].map((item, i) => (
              <div
                key={item}
                className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[9px] sm:text-[11px] font-medium transition-colors ${
                  i === 0
                    ? 'bg-primary-50 text-primary-700 shadow-xs'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                }`}
              >
                {item}
              </div>
            ))}
          </div>

          <div className='col-span-12 lg:col-span-9 p-3 sm:p-5'>
            <div className='flex items-center justify-between mb-3 sm:mb-5'>
              <div>
                <div className='text-xs sm:text-sm font-semibold text-gray-800'>
                  Good morning, John
                </div>
                <div className='font-body text-[9px] sm:text-[11px] text-gray-400'>
                  Here's your tax overview
                </div>
              </div>
              <div className='flex items-center gap-1.5 sm:gap-2'>
                <div className='relative h-6 sm:h-7 w-6 sm:w-7 rounded-full bg-primary-100 flex items-center justify-center group hover:bg-primary-200 transition-colors cursor-pointer'>
                  <Bell className='h-3 sm:h-3.5 w-3 sm:w-3.5 text-primary-600 group-hover:rotate-12 transition-transform' />
                  <span className='absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-red-500 animate-ping' />
                  <span className='absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-red-500' />
                </div>
                <div className='h-6 sm:h-7 w-6 sm:w-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-[8px] sm:text-[10px] font-bold shadow-sm'>
                  J
                </div>
              </div>
            </div>

            <div className='grid grid-cols-3 gap-1.5 sm:gap-3 mb-3 sm:mb-5'>
              {[
                {
                  label: 'Total Sales',
                  value: '₦700,000',
                  change: '+12%',
                  color: 'text-green-500',
                },
                {
                  label: 'Total Expenses',
                  value: '₦360,000',
                  change: '-3%',
                  color: 'text-red-400',
                },
                {
                  label: 'Tax Payable',
                  value: '₦25,500',
                  change: '7.5%',
                  color: 'text-primary-500',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className='rounded-xl border border-gray-100 bg-white p-1.5 sm:p-3 shadow-xs min-w-0 transition-all duration-300 hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5 cursor-default'
                >
                  <div className='font-body text-[8px] sm:text-[10px] text-gray-400 truncate'>
                    {s.label}
                  </div>
                  <div className='mt-0.5 text-[10px] sm:text-sm font-bold text-gray-800 tabular-nums truncate'>
                    {s.value}
                  </div>
                  <div
                    className={`mt-0.5 font-body text-[8px] sm:text-[10px] font-medium ${s.color}`}
                  >
                    {s.change}
                  </div>
                </div>
              ))}
            </div>

            <div className='rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-2 sm:p-4'>
              <div className='flex items-center justify-between mb-1.5 sm:mb-3'>
                <span className='text-[10px] sm:text-xs font-semibold text-gray-700'>
                  Monthly Revenue
                </span>
                <span className='font-body text-[8px] sm:text-[10px] text-gray-400 hidden sm:block'>
                  Last 6 months
                </span>
              </div>
              <svg viewBox='0 0 400 80' className='w-full h-12 sm:h-20'>
                <defs>
                  <linearGradient
                    id='heroChartGrad'
                    x1='0'
                    y1='0'
                    x2='0'
                    y2='1'
                  >
                    <stop
                      offset='0%'
                      stopColor='#7c3aed'
                      stopOpacity='0.35'
                    />
                    <stop
                      offset='100%'
                      stopColor='#7c3aed'
                      stopOpacity='0'
                    />
                  </linearGradient>
                </defs>
                <path
                  d='M0,65 C30,60 60,48 100,40 C140,32 170,44 200,28 C230,12 260,20 300,16 C340,12 370,8 400,4 L400,80 L0,80 Z'
                  fill='url(#heroChartGrad)'
                />
                <path
                  d='M0,65 C30,60 60,48 100,40 C140,32 170,44 200,28 C230,12 260,20 300,16 C340,12 370,8 400,4'
                  fill='none'
                  stroke='#7c3aed'
                  strokeWidth='2'
                  strokeLinecap='round'
                />
                <circle
                  cx='400'
                  cy='4'
                  r='3.5'
                  fill='#7c3aed'
                  className='animate-pulse'
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  useDocumentTitle(
    'The Toolkit for African Business Owners | WallXERP',
    'Track Sales, Expenses, Profit and Loss with Tax Management, Debtors Management, and AI Powered Virtual CFO.',
  );

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className='bg-white'>
      {/* ── 1. Original Preserved Hero Heading Section ── */}
      <section className='relative pt-16 sm:pt-20 lg:pt-24 pb-8 sm:pb-12 lg:pb-16 overflow-hidden'>
        <div className='absolute inset-0 bg-gradient-to-b from-primary-50/80 via-white to-white' />
        <div
          className='absolute inset-0 opacity-[0.03]'
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%237c3aed' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-primary-400/15 via-transparent to-transparent blur-3xl animate-blob-morph' />
        <div
          className='absolute top-40 -right-40 w-[500px] h-[500px] bg-purple-300/10 blur-3xl animate-blob-morph'
          style={{ animationDelay: '3s' }}
        />
        <div
          className='absolute top-60 -left-40 w-[400px] h-[400px] bg-indigo-300/10 blur-3xl animate-blob-morph'
          style={{ animationDelay: '1.5s' }}
        />

        <div className='relative mx-auto max-w-7xl px-4 sm:px-6 py-10'>
          <div className='text-center'>
            {/* Premium Trust Badge */}
            <ScrollReveal delay={0}>
              <div className='inline-flex items-center gap-2 bg-white rounded-full border border-gray-200 px-4 py-2 mb-6 sm:mb-10 shadow-sm hover:shadow-md transition-shadow duration-300'>
                <div className='flex -space-x-2'>
                  {[
                    '/images-optimized/nigerian1-sm.webp',
                    '/images-optimized/nigerian2-sm.webp',
                    '/images-optimized/nigerian3-sm.webp',
                    '/images-optimized/nigerian4-sm.webp',
                  ].map((avatar, i) => (
                    <img
                      key={i}
                      src={avatar}
                      alt={`Business owner ${i + 1}`}
                      width='28'
                      height='28'
                      className='h-7 w-7 rounded-full border-2 border-white object-cover'
                    />
                  ))}
                </div>
                <span className='font-body text-sm font-semibold text-gray-700 pl-1'>
                  Trusted by 2,500+ businesses
                </span>
              </div>
            </ScrollReveal>

            {/* Headline - Refined Typography */}
            <ScrollReveal delay={100}>
              <h1 className='relative text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-gray-900 leading-[1.2] sm:leading-[1.15] max-w-4xl mx-auto'>
                The Toolkit for African{' '}
                <span className='relative inline-block mt-1 sm:mt-0 group'>
                  <span className='bg-gradient-to-r from-primary-700 via-primary-500 to-purple-500 bg-clip-text text-transparent animate-gradient'>
                    Business Owners
                  </span>
                  <svg
                    className='absolute -bottom-2 left-0 w-full'
                    viewBox='0 0 300 16'
                    fill='none'
                    aria-hidden='true'
                  >
                    <path
                      d='M3 10 C58 4, 115 5, 148 8 C165 9, 185 11, 220 9 C245 8, 270 6, 297 7'
                      stroke='url(#underlineGradHero)'
                      strokeWidth='3.5'
                      strokeLinecap='round'
                      opacity='0.9'
                    />
                    <path
                      d='M5 11.5 C60 5.5, 118 6, 150 9 C167 10, 188 12.5, 223 10.5 C248 9.5, 272 7.5, 295 8.5'
                      stroke='url(#underlineGradHero)'
                      strokeWidth='2.5'
                      strokeLinecap='round'
                      opacity='0.6'
                    />
                    <defs>
                      <linearGradient
                        id='underlineGradHero'
                        x1='0'
                        y1='0'
                        x2='300'
                        y2='0'
                        gradientUnits='userSpaceOnUse'
                      >
                        <stop stopColor='#7c3aed' />
                        <stop offset='0.5' stopColor='#8b5cf6' />
                        <stop offset='1' stopColor='#a855f7' />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>
            </ScrollReveal>

            {/* Subheadline */}
            <ScrollReveal delay={200}>
              <p className='mx-auto mt-4 sm:mt-5 max-w-2xl sm:max-w-3xl font-body text-sm sm:text-base lg:text-lg leading-relaxed text-gray-600 px-2'>
                Track You Sales, Expenses,Business Profit and Loss, Tax
                Management, Debtor Management, A.I Powered Virtual CFO and other
                Business Management tools
              </p>
            </ScrollReveal>

            {/* CTA Buttons - Pill Shaped with Sheen & Glow */}
            <ScrollReveal delay={300}>
              <div className='mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 px-4 sm:px-0'>
                <Link
                  to={isAuthenticated ? '/dashboard' : '/register'}
                  onMouseEnter={() =>
                    prefetchRoute(isAuthenticated ? '/dashboard' : '/register')
                  }
                  onFocus={() =>
                    prefetchRoute(isAuthenticated ? '/dashboard' : '/register')
                  }
                  className='w-full sm:w-auto'
                >
                  <button className='w-full sm:w-auto relative inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-primary-600 via-primary-500 to-purple-600 px-6 sm:px-7 py-3 sm:py-3.5 text-sm sm:text-[15px] font-bold text-white shadow-xl shadow-primary-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-primary-500/50 hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden group'>
                    <span className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700' />
                    <span className='relative flex items-center gap-2'>
                      {isAuthenticated ? 'Go to Dashboard' : 'Start Free Today'}{' '}
                      <ArrowRight className='h-4.5 w-4.5 transition-transform duration-300 group-hover:translate-x-1' />
                    </span>
                  </button>
                </Link>
                <Link
                  to={isAuthenticated ? '/tax' : '/login'}
                  onMouseEnter={() =>
                    prefetchRoute(isAuthenticated ? '/tax' : '/login')
                  }
                  onFocus={() =>
                    prefetchRoute(isAuthenticated ? '/tax' : '/login')
                  }
                  className='w-full sm:w-auto'
                >
                  <button className='w-full sm:w-auto relative inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white/80 backdrop-blur px-6 sm:px-7 py-3 sm:py-3.5 text-sm sm:text-[15px] font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:bg-white hover:shadow-md hover:text-primary-700 hover:-translate-y-0.5 active:scale-[0.98]'>
                    <FileText className='h-4 w-4' /> View Tax Reports
                  </button>
                </Link>
              </div>
            </ScrollReveal>

            {/* Trust indicators */}
            <ScrollReveal delay={400}>
              <div className='mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-5 sm:gap-x-8 gap-y-3 px-4'>
                {trustIndicators.map(({ icon: Icon, text }, i) => (
                  <div
                    key={text}
                    className='flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur border border-gray-200/80 hover:bg-primary-50/50 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-300 cursor-default group'
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    <Icon className='h-4 w-4 text-primary-500 group-hover:scale-110 transition-transform duration-300' />
                    <span className='font-body text-xs sm:text-sm text-gray-600 font-medium group-hover:text-gray-900 transition-colors'>
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollReveal>

            {/* Interactive 3D Dashboard Preview */}
            <ScrollReveal delay={500}>
              <HeroDashboardPreview />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── 2. Stat Strip ── */}
      <section className='bg-gray-50 border-y border-gray-200 py-10 sm:py-12'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6'>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8'>
            {[
              { value: '7.5%', label: 'Standard VAT Rate', detail: 'Plus profit tax on earnings' },
              { value: '100%', label: 'NRS Compliant', detail: 'FIRS audit trail' },
              { value: '<2 min', label: 'Fast Onboarding', detail: 'Zero setup friction' },
              { value: '₦0', label: 'Free Tier to Start', detail: 'Essential features included' },
            ].map((stat, i) => (
              <ScrollReveal key={stat.label} delay={i * 50}>
                <div className='text-left border-l-2 border-primary-500 pl-4 py-1'>
                  <div className='text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight'>
                    {stat.value}
                  </div>
                  <div className='text-sm font-semibold text-gray-800 mt-0.5'>
                    {stat.label}
                  </div>
                  <div className='text-xs text-gray-500 mt-0.5'>
                    {stat.detail}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Top Core Features ── */}
      <SectionContainer background='white' id='features'>
        <SectionHeader
          eyebrow='Core Capabilities'
          eyebrowIcon={<Zap className='h-3.5 w-3.5 text-primary-600' />}
          title='Everything needed to operate cleanly and stay compliant.'
          accentWord='compliant.'
          subtitle='Built specifically for the everyday financial workflow of Nigerian sole proprietors and registered companies.'
        />

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7'>
          {[
            {
              icon: TrendingUp,
              title: 'Real-Time Sales Tracking',
              description:
                'Record daily counter sales, bank transfers, and POS transactions. Instant revenue breakdowns by channel.',
              badge: 'Revenue',
            },
            {
              icon: Receipt,
              title: 'Allowable Expense Management',
              description:
                'Track operating expenses across deductible categories so your gross profit and tax burden are never overstated.',
              badge: 'Deductions',
            },
            {
              icon: ShieldCheck,
              title: 'Automated Tax Engine',
              description:
                'VAT at the standard 7.5% plus tax on your chargeable profit — computed in real time from your actual sales and allowable expenses, with month-lock protections and audit logging.',
              badge: 'NRS 2026',
            },
            {
              icon: Clock,
              title: 'Debtors & Credit Sales (BNPL)',
              description:
                'Issue customer credit on an accrual basis, monitor overdue receivables, and send automated WhatsApp reminders.',
              badge: 'Receivables',
            },
            {
              icon: CreditCard,
              title: 'Dedicated Virtual Account (DVA)',
              description:
                'Assign customer transfers straight to your business bank account, auto-capturing inflows into verified sales.',
              badge: 'Auto-Capture',
            },
            {
              icon: BarChart3,
              title: 'Executive Financial KPIs',
              description:
                'Understand your cash-at-hand, true gross margin, and business performance without hiring a full-time accountant.',
              badge: 'Intelligence',
            },
          ].map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 50}>
              <div className='h-full flex flex-col justify-between rounded-xl border border-gray-200/90 bg-white p-6 shadow-2xs hover:shadow-md hover:border-gray-300 transition-all duration-200'>
                <div>
                  <div className='flex items-center justify-between mb-4'>
                    <div className='flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 border border-primary-100'>
                      <item.icon className='h-5 w-5' />
                    </div>
                    <span className='text-[11px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700'>
                      {item.badge}
                    </span>
                  </div>
                  <h3 className='text-lg font-bold text-gray-900 mb-2'>
                    {item.title}
                  </h3>
                  <p className='text-sm text-gray-600 leading-relaxed'>
                    {item.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <div className='mt-10 text-center'>
          <Link
            to='/about'
            onMouseEnter={() => prefetchRoute('/about')}
            onFocus={() => prefetchRoute('/about')}
            className='inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700'
          >
            <span>Explore our full architecture & compliance story</span>
            <ChevronRight className='h-4 w-4' />
          </Link>
        </div>
      </SectionContainer>

      {/* ── 4. How It Works (3 Steps) ── */}
      <SectionContainer background='gray' id='how-it-works'>
        <SectionHeader
          eyebrow='Simple Workflow'
          eyebrowIcon={<CheckCircle2 className='h-3.5 w-3.5 text-primary-600' />}
          title='Get compliant in three effortless steps.'
          accentWord='three'
          subtitle='Designed for Nigerian business owners who need speed and clarity, not complicated accounting spreadsheets.'
        />

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8'>
          {howItWorksSteps.map((step) => (
            <ScrollReveal key={step.title} delay={step.stepNum * 60}>
              <div className='h-full flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs hover:shadow-md transition-all'>
                {/* Image */}
                <div className='relative h-44 overflow-hidden bg-gray-100'>
                  <picture>
                    <source type='image/webp' srcSet={step.webpMd} />
                    <img
                      src={step.image}
                      alt={step.title}
                      className='w-full h-full object-cover'
                      loading='lazy'
                    />
                  </picture>
                  <div className='absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-900 text-xs font-bold shadow-2xs border border-gray-200'>
                    {step.stepNum}
                  </div>
                </div>

                {/* Content */}
                <div className='p-5 sm:p-6 flex-1 flex flex-col justify-between'>
                  <div>
                    <h3 className='text-lg font-bold text-gray-900 mb-2'>
                      {step.title}
                    </h3>
                    <p className='text-sm text-gray-600 leading-relaxed'>
                      {step.description}
                    </p>
                  </div>
                  <div className='mt-5 pt-4 border-t border-gray-100 text-xs font-semibold text-primary-600 uppercase tracking-wider'>
                    Step {step.stepNum} of 3
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </SectionContainer>

      {/* ── 5. Preserved "Trusted by growing businesses" (Showcase Gallery) ── */}
      <section className='py-14 sm:py-18 lg:py-24 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6'>
          {/* Header */}
          <ScrollReveal className='mx-auto max-w-4xl text-center mb-10 sm:mb-14'>
            <span className='inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-50 to-purple-50 border border-primary-100 px-4 py-1.5 mb-4 sm:mb-5 shadow-sm'>
              <Globe2 className='h-3.5 w-3.5 text-primary-600' />
              <span className='font-body text-xs sm:text-sm font-semibold tracking-wide text-primary-700'>
                In Practice
              </span>
            </span>
            <h2 className='text-2xl sm:text-3xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-snug'>
              Trusted by{' '}
              <span className='bg-gradient-to-r from-primary-600 via-purple-500 to-fuchsia-500 bg-clip-text text-transparent'>
                growing businesses
              </span>
            </h2>
            <p className='mt-3 sm:mt-4 font-body text-sm sm:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed'>
              From startups to established enterprises — see how businesses
              across Nigeria manage taxes with clarity and confidence
            </p>
          </ScrollReveal>

          {/* Creative Masonry Gallery */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 auto-rows-max'>
            {[
              {
                imageName: 'workspace',
                title: 'Professional Setup',
                subtitle: 'Clean workspace, clear finances',
                span: 'sm:col-span-1 lg:col-span-1',
                height: 'h-44 sm:h-48 lg:h-52',
              },
              {
                imageName: 'team-efficiency',
                title: 'Team Efficiency',
                subtitle: 'Collaborative financial management',
                span: 'sm:col-span-1 lg:col-span-2 lg:row-span-1',
                height: 'h-44 sm:h-48 lg:h-52',
              },
              {
                imageName: 'mobile-interface',
                title: 'On-The-Go',
                subtitle: 'Tax management, anywhere, anytime',
                span: 'sm:col-span-1 lg:col-span-1 lg:row-span-2',
                height: 'h-44 sm:h-48 lg:h-full lg:min-h-[440px]',
              },
              {
                imageName: 'business-growth',
                title: 'Growth Metrics',
                subtitle: 'Track expansion with precision',
                span: 'sm:col-span-1 lg:col-span-1',
                height: 'h-44 sm:h-48 lg:h-52',
              },
              {
                imageName: 'dashboard-hero',
                title: 'Real-Time Insights',
                subtitle: 'Live dashboards for smart decisions',
                span: 'sm:col-span-1 lg:col-span-1',
                height: 'h-44 sm:h-48 lg:h-52',
              },
              {
                imageName: 'compliance-secure',
                title: 'Security & Trust',
                subtitle: 'Enterprise protection for your data',
                span: 'sm:col-span-1 lg:col-span-2',
                height: 'h-44 sm:h-48 lg:h-52',
              },
            ].map((item, i) => (
              <ScrollReveal
                key={item.title}
                delay={i * 100}
                className={`group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1 cursor-pointer ${item.height} ${item.span || ''}`}
              >
                {/* Image with overlay */}
                <picture>
                  <source
                    type='image/webp'
                    srcSet={`
                      /images-optimized/${item.imageName}-sm.webp 640w,
                      /images-optimized/${item.imageName}-md.webp 768w,
                      /images-optimized/${item.imageName}-lg.webp 1024w
                    `}
                    sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                  />
                  <img
                    src={`/images/${item.imageName}.jpg`}
                    alt={item.title}
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    loading={i < 3 ? 'eager' : 'lazy'}
                  />
                </picture>

                {/* Gradient Overlay */}
                <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500' />

                {/* Content */}
                <div className='absolute inset-0 flex flex-col justify-end p-4 sm:p-5'>
                  <h3 className='text-lg sm:text-xl font-bold text-white leading-snug mb-1'>
                    {item.title}
                  </h3>
                  <p className='font-body text-xs sm:text-sm text-white/90'>
                    {item.subtitle}
                  </p>

                  {/* Hover indicator */}
                  <div className='mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                    <div className='flex-1 h-0.5 bg-gradient-to-r from-white to-transparent' />
                    <ChevronRight className='h-4 w-4 text-white' />
                  </div>
                </div>

                {/* Corner accent on hover */}
                <div className='absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-bl-2xl' />
              </ScrollReveal>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className='mt-10 sm:mt-14 flex justify-center'>
            <Link
              to={isAuthenticated ? '/dashboard' : '/register'}
              onMouseEnter={() =>
                prefetchRoute(isAuthenticated ? '/dashboard' : '/register')
              }
              onFocus={() =>
                prefetchRoute(isAuthenticated ? '/dashboard' : '/register')
              }
            >
              <button className='group px-6 sm:px-7 py-3 sm:py-3.5 min-h-[44px] rounded-full bg-gradient-to-r from-primary-600 to-purple-600 text-white text-sm sm:text-base font-semibold shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 hover:-translate-y-0.5'>
                <span className='flex items-center gap-2'>
                  {isAuthenticated
                    ? 'Go to Dashboard'
                    : 'Join growing businesses'}
                  <ArrowRight className='h-4.5 w-4.5 group-hover:translate-x-1 transition-transform' />
                </span>
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 6. Final CTA ── */}
      <FinalCta
        title='Start tracking your business and staying compliant today.'
        accentWord='compliant'
        subtitle='Join Nigerian SMEs automating their taxes and counter sales. Get set up in under 2 minutes.'
        buttonText='Create Free Account'
        buttonLink='/register'
      />
    </div>
  );
}
