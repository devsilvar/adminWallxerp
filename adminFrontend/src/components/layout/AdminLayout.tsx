import { useState, useLayoutEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, ChevronRight, ArrowUpRight } from 'lucide-react';
import AdminSidebar from './AdminSidebar.tsx';
import { useAuthStore } from '@/stores/auth.store.ts';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const user = useAuthStore((s) => s.user);

  useLayoutEffect(() => {
    setSidebarOpen(false);

    if (mainContentRef.current) {
      if (typeof mainContentRef.current.scrollTo === 'function') {
        mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
      mainContentRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  const breadcrumbs = useMemo(() => {
    const path = location.pathname;
    const crumbs = [{ label: 'Admin', to: '/admin' }];

    if (path === '/admin') {
      crumbs.push({ label: 'Dashboard', to: '/admin' });
    } else if (path.startsWith('/admin/users')) {
      crumbs.push({ label: 'Users', to: '/admin/users' });
      if (path.split('/').length > 3) {
        crumbs.push({ label: 'User Detail', to: path });
      }
    } else if (path.startsWith('/admin/businesses')) {
      crumbs.push({ label: 'Businesses', to: '/admin/businesses' });
    } else if (
      path.startsWith('/admin/withdrawals') ||
      path.startsWith('/admin/settlement/withdrawals')
    ) {
      crumbs.push({
        label: 'Withdrawals & Settlement',
        to: '/admin/withdrawals',
      });
    } else if (path.startsWith('/admin/audit-logs')) {
      crumbs.push({ label: 'Audit Logs', to: '/admin/audit-logs' });
    } else if (path.startsWith('/admin/ai-settings')) {
      crumbs.push({ label: 'AI Provider Settings', to: '/admin/ai-settings' });
    } else if (path.startsWith('/admin/subscriptions')) {
      crumbs.push({ label: 'Subscriptions', to: '/admin/subscriptions' });
    } else if (path.startsWith('/admin/reviews')) {
      crumbs.push({ label: 'User Reviews', to: '/admin/reviews' });
    }

    return crumbs;
  }, [location.pathname]);

  return (
    <div className='flex h-screen bg-canvas text-ink antialiased'>
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <header className='flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-panel px-4 sm:px-6'>
          <div className='flex items-center gap-3'>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label='Open sidebar menu'
              className='-ml-1 flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none md:hidden'
            >
              <Menu className='h-4 w-4' />
            </button>

            <nav
              aria-label='Breadcrumbs'
              className='hidden items-center gap-1.5 text-[11px] sm:flex'
            >
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <div
                    key={crumb.to + idx}
                    className='flex items-center gap-1.5'
                  >
                    {idx > 0 && (
                      <ChevronRight
                        className='h-3 w-3 text-ink-subtle'
                        aria-hidden='true'
                      />
                    )}
                    {isLast ? (
                      <span className='font-semibold text-ink'>
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className='text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </div>
                );
              })}
            </nav>

            <span className='text-[13px] font-semibold text-ink sm:hidden'>
              Admin Portal
            </span>
          </div>

          <div className='flex items-center gap-3'>
            {/* A configuration flag, not a live signal — the old animated ping
                implied something was continuously happening here. */}

            <Link
              to='/dashboard'
              className='hidden h-7 items-center gap-1.5 rounded border border-hairline-strong bg-panel px-2.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none lg:inline-flex'
            >
              User App
              <ArrowUpRight
                className='h-3 w-3 text-ink-subtle'
                aria-hidden='true'
              />
            </Link>

            <div className='flex items-center gap-2 border-l border-hairline pl-3'>
              <span className='flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700'>
                {user?.email?.charAt(0).toUpperCase() || 'A'}
              </span>
              <div className='hidden text-left sm:block'>
                <p className='max-w-[130px] truncate text-[11px] font-semibold leading-tight text-ink'>
                  {user?.email || 'admin@paymytax.com'}
                </p>
                <p className='text-[10px] leading-tight text-ink-subtle'>
                  Super Admin
                </p>
              </div>
            </div>
          </div>
        </header>

        <main ref={mainContentRef} className='flex-1 overflow-y-auto bg-canvas'>
          <div className='mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8'>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
