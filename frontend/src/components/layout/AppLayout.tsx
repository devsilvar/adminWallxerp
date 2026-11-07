import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Search, Menu } from 'lucide-react';
import Sidebar from './Sidebar.tsx';
import NotificationBell from './NotificationBell.tsx';
import MessageBell from './MessageBell.tsx';
import UserMenu from './UserMenu.tsx';
import CurrencySwitcher from './CurrencySwitcher.tsx';
import CurrencySwitchVeil from './CurrencySwitchVeil.tsx';
import RouteTransitionLoader from './RouteTransitionLoader.tsx';
import CommandPalette from '@/components/CommandPalette.tsx';
import ReviewPromptModal from '@/components/ReviewPromptModal.tsx';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';
import SubscriptionGraceBanner from '@/components/subscription/SubscriptionGraceBanner.tsx';
import TrialWelcomeModal from '@/components/TrialWelcomeModal';
import { resolvePageTitle } from '@/lib/pageTitles.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useCurrencyStore } from '@/stores/currency.store';

// Mac users get ⌘K, everyone else gets Ctrl+K. Detected once at module load — the
// platform doesn't change mid-session.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K';

export default function AppLayout({
  children,
}: {
  children?: React.ReactNode;
} = {}) {
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showTrialWelcome, setShowTrialWelcome] = useState(false);
  const [welcomeBusinessName, setWelcomeBusinessName] = useState('');
  const user = useAuthStore((s) => s.user);

  // Check for pending trial welcome modal (1 minute after business creation).
  // Fixed: previous version returned the clearTimeout handle to an inner
  // function instead of the effect itself, so the timer leaked past logout
  // and fired the modal on a dead session (the "blip back to dashboard"
  // with 30-Day Trial modal).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const businessCreatedAt = sessionStorage.getItem('businessCreatedAt');
    const businessName = sessionStorage.getItem('businessCreatedName');

    if (businessCreatedAt && businessName) {
      const createdTime = parseInt(businessCreatedAt, 10);
      const elapsed = Date.now() - createdTime;
      const oneMinute = 60000;

      if (elapsed >= oneMinute) {
        // Guard: don't pop a trial modal after an explicit logout
        // that happened while this effect was waiting to fire.
        if (!useAuthStore.getState().isAuthenticated) return;
        setWelcomeBusinessName(businessName);
        setShowTrialWelcome(true);
        sessionStorage.removeItem('businessCreatedAt');
        sessionStorage.removeItem('businessCreatedName');
      } else {
        const remainingTime = oneMinute - elapsed;
        timer = setTimeout(() => {
          if (!useAuthStore.getState().isAuthenticated) return;
          setWelcomeBusinessName(businessName);
          setShowTrialWelcome(true);
          sessionStorage.removeItem('businessCreatedAt');
          sessionStorage.removeItem('businessCreatedName');
        }, remainingTime);
      }
    } else {
      const hasSeenWelcome = localStorage.getItem('hasSeenTrialWelcome');
      // Backend is the clock — trialEndsAt is set on admin Save Plan Changes
      // (or startFreeTrial). No wallx_trial_started_at mirror.
      const hasTrial =
        !!user?.trialEndsAt &&
        new Date(user.trialEndsAt).getTime() > Date.now();
      const tier = (user?.subscriptionTier || 'free').toLowerCase();
      const isFreeTier =
        tier === 'free' || tier === 'free_trial' || tier === 'trial';

      if (hasTrial && isFreeTier && !hasSeenWelcome && user) {
        timer = setTimeout(() => {
          if (!useAuthStore.getState().isAuthenticated) return;
          setWelcomeBusinessName('Your Business');
          setShowTrialWelcome(true);
          localStorage.setItem('hasSeenTrialWelcome', 'true');
        }, 2000);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  // When pathname or tab changes, close mobile sidebar and reset scroll to top
  const currentTab = new URLSearchParams(location.search).get('tab');
  useLayoutEffect(() => {
    setSidebarOpen(false);

    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      mainContentRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname, currentTab]);

  // Global Cmd/Ctrl+K → open palette. Escape inside the palette is handled there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    void useCurrencyStore.getState().fetchRates();
  }, []);

  const pageTitle = resolvePageTitle(location.pathname);

  return (
    <div className='flex h-screen bg-gray-100/50'>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className='flex flex-1 flex-col overflow-hidden'>
        {/* Top bar */}
        <header className='flex items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 py-3'>
          <div className='flex items-center gap-3'>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label='Open navigation menu'
              className='flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors'
            >
              <Menu className='h-6 w-6 text-gray-800' />
            </button>
            <OptimizedLogo size='md' className='w-8' />
            {pageTitle && (
              <h2 className='text-base font-semibold text-gray-900 hidden sm:block'>
                {pageTitle}
              </h2>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={() => setPaletteOpen(true)}
              aria-label='Open search and quick actions'
              className='hidden md:flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-600'
            >
              <Search className='h-4 w-4' aria-hidden='true' />
              <span>Search…</span>
              <kbd className='ml-2 inline-flex items-center rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500'>
                {SHORTCUT_LABEL}
              </kbd>
            </button>
            {/* Mobile: just the icon — palette is keyboard-driven, but tap-to-open still works */}
            <button
              type='button'
              onClick={() => setPaletteOpen(true)}
              aria-label='Open search'
              className='md:hidden flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors'
            >
              <Search className='h-5 w-5 text-gray-600' />
            </button>
            <CurrencySwitcher />
            <MessageBell />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <SubscriptionGraceBanner />

        {/* Main content */}
        <main ref={mainContentRef} className='relative flex-1 overflow-y-auto'>
          <CurrencySwitchVeil />
          <Suspense fallback={<RouteTransitionLoader />}>
            <div className='mx-auto max-w-6xl px-4 py-6'>
              {children || <Outlet />}
            </div>
          </Suspense>
        </main>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ReviewPromptModal />
      <TrialWelcomeModal
        isOpen={showTrialWelcome}
        onClose={() => {
          setShowTrialWelcome(false);
          // Mark as seen so it doesn't show again
          localStorage.setItem('hasSeenTrialWelcome', 'true');
        }}
        businessName={welcomeBusinessName}
        userName={user?.fullName || user?.email?.split('@')[0]}
        trigger='business_creation'
        createdAt={user?.createdAt}
      />
    </div>
  );
}
