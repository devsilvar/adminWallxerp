import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';
import { prefetchRoute } from '@/lib/routeChunks.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Contact', to: '/contact' },
];

export default function Nav() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const fetchBusinesses = useBusinessStore((s) => s.fetchBusinesses);

  useEffect(() => {
    if (isAuthenticated) {
      if (!user) void fetchMe();
      if (!activeBusiness) void fetchBusinesses();
    }
  }, [isAuthenticated, user, activeBusiness, fetchMe, fetchBusinesses]);

  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setMobileNavOpen(false);
  }

  return (
    <>
      <header className='fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200/60'>
        <div className='mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3'>
          {/* Logo */}
          <Link to='/' className='flex items-center gap-2 sm:gap-3'>
            <OptimizedLogo
              size='lg'
              className='h-8 sm:h-10 lg:h-12 w-auto'
              fetchPriority='high'
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className='hidden lg:flex items-center gap-8 my-2'>
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onMouseEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                className={({ isActive }) =>
                  `relative font-sans text-[15px] font-medium transition-colors py-1 ${
                    isActive
                      ? 'text-primary-600 font-semibold after:w-full'
                      : 'text-gray-600 hover:text-gray-900 after:w-0'
                  } after:absolute after:bottom-0 after:left-0 after:h-[2px] after:bg-primary-600 after:transition-all after:duration-200 hover:after:w-full`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right Action Area */}
          <div className='flex items-center gap-2 sm:gap-3'>
            {isAuthenticated ? (
              <Link
                to='/dashboard'
                onMouseEnter={() => prefetchRoute('/dashboard')}
                onFocus={() => prefetchRoute('/dashboard')}
                className='flex items-center gap-2 sm:gap-3 rounded-full border border-gray-200 bg-white hover:bg-gray-50 pl-1.5 pr-2 sm:pr-4 py-1.5 shadow-2xs hover:shadow-xs transition-all duration-200 group'
                title='Go to Dashboard'
              >
                <div className='flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-primary-600 text-white text-xs sm:text-sm font-bold shrink-0 overflow-hidden ring-2 ring-primary-100 shadow-2xs'>
                  {activeBusiness?.logoUrl ? (
                    <img
                      src={activeBusiness.logoUrl}
                      alt={activeBusiness.businessName}
                      className='h-full w-full object-cover'
                    />
                  ) : (
                    (activeBusiness?.businessName || user?.email || 'B')
                      .charAt(0)
                      .toUpperCase()
                  )}
                </div>
                <div className='text-left min-w-0 hidden sm:block'>
                  <p className='text-xs sm:text-sm font-bold text-gray-900 truncate max-w-[120px] sm:max-w-[160px] leading-tight'>
                    {activeBusiness?.businessName ||
                      user?.email?.split('@')[0] ||
                      'My Business'}
                  </p>
                  <p className='text-[10px] sm:text-[11px] font-semibold text-primary-600 flex items-center gap-1 leading-tight group-hover:text-primary-700'>
                    <span>Dashboard</span>
                    <ArrowRight className='h-2.5 w-2.5 sm:h-3 sm:w-3 transition-transform group-hover:translate-x-0.5' />
                  </p>
                </div>
              </Link>
            ) : (
              <>
                <Link
                  to='/login'
                  onMouseEnter={() => prefetchRoute('/login')}
                  onFocus={() => prefetchRoute('/login')}
                  className='hidden sm:block'
                >
                  <Button
                    variant='ghost'
                    size='sm'
                    className='rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all'
                  >
                    Sign in
                  </Button>
                </Link>
                <Link
                  to='/register'
                  onMouseEnter={() => prefetchRoute('/register')}
                  onFocus={() => prefetchRoute('/register')}
                  className='hidden sm:block'
                >
                  <button className='inline-flex items-center justify-center gap-1.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 text-sm font-semibold shadow-2xs hover:shadow transition-all duration-200 active:scale-[0.98]'>
                    <span>Get Started</span>
                    <ArrowRight className='h-4 w-4' />
                  </button>
                </Link>
              </>
            )}

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className='lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors'
              aria-label='Open navigation menu'
            >
              <Menu className='h-5 w-5 text-gray-700' />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          mobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden='true'
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[300px] max-w-[85vw] bg-white shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className='flex flex-col h-full overflow-y-auto overscroll-contain'>
          <div className='flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0'>
            <OptimizedLogo size='md' className='h-8 w-auto' />
            <button
              onClick={() => setMobileNavOpen(false)}
              className='min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 hover:bg-gray-100 rounded-full transition-colors'
              aria-label='Close menu'
            >
              <X className='h-5 w-5 text-gray-500' />
            </button>
          </div>

          <nav className='flex-1 px-4 py-6 space-y-1'>
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onMouseEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-3 text-[15px] font-medium rounded-xl transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className='p-4 border-t border-gray-100 space-y-3 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]'>
            {isAuthenticated ? (
              <>
                <Link
                  to='/dashboard'
                  onMouseEnter={() => prefetchRoute('/dashboard')}
                  onFocus={() => prefetchRoute('/dashboard')}
                  onClick={() => setMobileNavOpen(false)}
                  className='flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all'
                >
                  <div className='flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white text-sm font-bold shrink-0 overflow-hidden ring-2 ring-white shadow-2xs'>
                    {activeBusiness?.logoUrl ? (
                      <img
                        src={activeBusiness.logoUrl}
                        alt={activeBusiness.businessName}
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      (activeBusiness?.businessName || user?.email || 'B')
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>
                  <div className='min-w-0 flex-1 text-left'>
                    <p className='text-sm font-bold text-gray-900 truncate'>
                      {activeBusiness?.businessName ||
                        user?.email?.split('@')[0] ||
                        'My Business'}
                    </p>
                    <p className='text-xs font-semibold text-primary-600 flex items-center gap-1'>
                      Go to Dashboard <ArrowRight className='h-3 w-3' />
                    </p>
                  </div>
                </Link>
                <Link
                  to='/dashboard'
                  onMouseEnter={() => prefetchRoute('/dashboard')}
                  onFocus={() => prefetchRoute('/dashboard')}
                  onClick={() => setMobileNavOpen(false)}
                  className='block'
                >
                  <Button className='w-full justify-center rounded-full'>
                    Open Dashboard <ArrowRight className='h-4 w-4' />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link
                  to='/login'
                  onMouseEnter={() => prefetchRoute('/login')}
                  onFocus={() => prefetchRoute('/login')}
                  onClick={() => setMobileNavOpen(false)}
                  className='block'
                >
                  <Button
                    variant='outline'
                    className='w-full justify-center rounded-full'
                  >
                    Sign in
                  </Button>
                </Link>
                <Link
                  to='/register'
                  onMouseEnter={() => prefetchRoute('/register')}
                  onFocus={() => prefetchRoute('/register')}
                  onClick={() => setMobileNavOpen(false)}
                  className='block'
                >
                  <Button className='w-full justify-center rounded-full bg-primary-600 hover:bg-primary-700'>
                    Get Started <ArrowRight className='h-4 w-4' />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
