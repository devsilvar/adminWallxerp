import { useLayoutEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  TrendingUp,
  Zap,
  BadgeCheck,
  Lock,
  Receipt,
  HandCoins,
  FileText,
  BarChart3,
} from 'lucide-react';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';

const highlights = [
  {
    icon: TrendingUp,
    title: 'Real-Time Business Management',
    circleStyle:
      'border-2 border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.3)] ring-1 ring-emerald-300/30 group-hover:shadow-[0_0_22px_rgba(52,211,153,0.5)] group-hover:border-emerald-300',
  },
  {
    icon: Zap,
    title: 'Fast Tax Calculation',
    circleStyle:
      'border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.3)] ring-1 ring-amber-300/30 group-hover:shadow-[0_0_22px_rgba(251,191,36,0.5)] group-hover:border-amber-300',
  },
  {
    icon: Receipt,
    title: 'Sales & Expense Mgt',
    circleStyle:
      'border-2 border-rose-400/50 bg-gradient-to-br from-rose-500/20 to-pink-500/10 text-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.3)] ring-1 ring-rose-300/30 group-hover:shadow-[0_0_22px_rgba(251,113,133,0.5)] group-hover:border-rose-300',
  },
  {
    icon: HandCoins,
    title: 'Debtors Mgt',
    circleStyle:
      'border-2 border-sky-400/50 bg-gradient-to-br from-sky-500/20 to-indigo-500/10 text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.3)] ring-1 ring-sky-300/30 group-hover:shadow-[0_0_22px_rgba(56,189,248,0.5)] group-hover:border-sky-300',
  },
  {
    icon: FileText,
    title: 'e-Invoice/Receipts',
    circleStyle:
      'border-2 border-violet-400/50 bg-gradient-to-br from-violet-500/20 to-purple-500/10 text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.3)] ring-1 ring-violet-300/30 group-hover:shadow-[0_0_22px_rgba(167,139,250,0.5)] group-hover:border-violet-300',
  },
  {
    icon: BarChart3,
    title: 'CRM and Business Performance Reporting Tool',
    circleStyle:
      'border-2 border-orange-400/50 bg-gradient-to-br from-orange-500/20 to-amber-500/10 text-orange-300 shadow-[0_0_14px_rgba(251,146,60,0.3)] ring-1 ring-orange-300/30 group-hover:shadow-[0_0_22px_rgba(251,146,60,0.5)] group-hover:border-orange-300',
  },
  {
    icon: ShieldCheck,
    title: 'Data Encryption Security',
    circleStyle:
      'border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.3)] ring-1 ring-cyan-300/30 group-hover:shadow-[0_0_22px_rgba(34,211,238,0.5)] group-hover:border-cyan-300',
  },
  {
    icon: BadgeCheck,
    title: 'A.I Powered Virtual CFO',
    circleStyle:
      'border-2 border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/20 to-purple-500/10 text-fuchsia-300 shadow-[0_0_14px_rgba(232,121,249,0.3)] ring-1 ring-fuchsia-300/30 group-hover:shadow-[0_0_22px_rgba(232,121,249,0.5)] group-hover:border-fuchsia-300',
  },
];

export default function AuthLayout() {
  const location = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className='min-h-screen w-full flex flex-col lg:flex-row bg-gray-50/70'>
      {/* Left panel — branding & value proposition (strictly 55% width on desktop, joined in whole-page flow) */}
      <div className='hidden lg:flex lg:w-[55%] min-h-screen relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-950 flex-col justify-between p-8 xl:p-12 2xl:p-16'>
        {/* Background ambient accents */}
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_0%,rgba(168,85,247,0.35),transparent)] pointer-events-none' />
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_80%_100%,rgba(99,102,241,0.25),transparent)] pointer-events-none' />
        <div className='absolute top-20 -left-20 w-80 h-80 bg-purple-400/20 rounded-full blur-[110px] pointer-events-none' />
        <div className='absolute bottom-20 right-0 w-96 h-96 bg-indigo-400/15 rounded-full blur-[120px] pointer-events-none' />

        {/* Content container */}
        <div className='relative z-10 flex flex-col justify-between h-full w-full max-w-xl xl:max-w-2xl mx-auto'>
          {/* Top: Brand Logo */}
          <div className='shrink-0'>
            <Link
              to='/'
              className='inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-xl transition-transform hover:scale-[1.02] duration-200'
            >
              <OptimizedLogo
                size='lg'
                className='h-14 xl:h-16 w-auto brightness-0 invert object-contain drop-shadow-sm'
                fetchPriority='high'
              />
            </Link>
          </div>

          {/* Center: Hero Messaging & Highlights */}
          <div className='my-auto py-5 xl:py-7'>
            {/* Status indicator badge */}
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-purple-100 text-xs font-semibold tracking-wide shadow-sm w-fit mb-4 xl:mb-5'>
              <span className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
              <span>Official NRS Tax Compliance Engine</span>
            </div>

            <h2 className='text-3xl sm:text-4xl xl:text-[42px] 2xl:text-5xl font-bold text-white leading-[1.15] tracking-tight'>
              Seamless Business
              <br />
              <span className='bg-gradient-to-r from-purple-200 via-white to-purple-100 bg-clip-text text-transparent'>
                Compliance Tools for SMBs.
              </span>
            </h2>

            <p className='mt-3 xl:mt-4 max-w-lg font-body text-sm xl:text-base text-purple-100/80 leading-relaxed'>
              Join thousands of Nigerian SMEs managing sales, computing accurate
              tax liabilities, and staying penalty-free with confidence.
            </p>

            {/* Core Features — Clean, boxless, neatly aligned icon + title */}
            <div className='mt-6 xl:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 xl:gap-x-7 gap-y-3 xl:gap-y-3.5'>
              {highlights.map(({ icon: Icon, title, circleStyle }) => (
                <div
                  key={title}
                  className='group flex items-center gap-3 xl:gap-3.5 py-0.5 cursor-default transition-transform duration-200'
                >
                  <div
                    className={`flex h-10 w-10 xl:h-11 xl:w-11 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 group-hover:scale-110 ${circleStyle}`}
                  >
                    <Icon className='h-4.5 w-4.5 xl:h-5 xl:w-5' strokeWidth={2.2} />
                  </div>
                  <span className='font-semibold text-white text-[13px] sm:text-[13.5px] xl:text-[14px] 2xl:text-[15px] tracking-tight group-hover:text-purple-100 transition-colors leading-snug'>
                    {title}
                  </span>
                </div>
              ))}
            </div>

            {/* SME Trust metrics bar */}
            <div className='mt-6 xl:mt-8 pt-5 xl:pt-6 border-t border-white/10 flex flex-wrap items-center gap-4 sm:gap-6 text-purple-200/80 text-xs sm:text-sm font-medium'>
              <span className='flex items-center gap-1.5'>
                <span className='text-white font-bold'>₦700M+</span> Volume
                Tracked
              </span>
              <span className='h-1 w-1 rounded-full bg-purple-300/40 hidden sm:inline-block' />
              <span className='flex items-center gap-1.5'>
                <span className='text-white font-bold'>100%</span> NRS Compliant
              </span>
              <span className='h-1 w-1 rounded-full bg-purple-300/40 hidden sm:inline-block' />
              <span className='flex items-center gap-1.5'>
                <span className='text-white font-bold'>&lt; 5 min</span> Filing
                Time
              </span>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className='flex items-center justify-between pt-6 border-t border-white/10 shrink-0'>
            <p className='font-body text-xs text-purple-200/60'>
              &copy; {new Date().getFullYear()} WallXERP by WallX. Built for
              Nigerian businesses.
            </p>
            <div className='hidden xl:flex items-center gap-2 text-xs text-purple-200/60'>
              <Lock className='h-3.5 w-3.5 text-purple-300' />
              <span>Bank-grade 256-bit encryption</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form (strictly 45% width on desktop, full width on mobile, joined in whole-page flow) */}
      <div className='flex flex-1 lg:flex-none lg:w-[45%] w-full min-h-screen flex-col items-center justify-between px-6 sm:px-10 lg:px-8 xl:px-12 py-8 sm:py-12 bg-gray-50/70'>
        {/* Mobile logo header */}
        <div className='mb-8 sm:mb-10 lg:hidden text-center shrink-0'>
          <Link
            to='/'
            className='inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl transition-transform hover:scale-[1.02] duration-200'
          >
            <OptimizedLogo
              size='lg'
              className='h-12 sm:h-14 w-auto mx-auto object-contain drop-shadow-sm'
              fetchPriority='high'
            />
          </Link>
          <p className='mt-3 font-body text-sm text-gray-500'>
            Simple tax management for Nigerian businesses
          </p>
        </div>

        {/* Form container — my-auto naturally centers when space permits, py-4 preserves bounds when scrolling */}
        <div className='w-full max-w-[420px] sm:max-w-[440px] my-auto py-4 shrink-0'>
          <Outlet />
        </div>

        {/* Mobile footer note */}
        <div className='mt-8 lg:hidden text-center shrink-0'>
          <p className='text-xs text-gray-400 font-body'>
            &copy; {new Date().getFullYear()} WallXERP by WallX
          </p>
        </div>
      </div>
    </div>
  );
}
