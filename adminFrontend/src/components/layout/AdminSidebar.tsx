import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Wallet,
  ScrollText,
  ArrowLeft,
  ArrowDownLeft,
  ArrowLeftRight,
  LogOut,
  X,
  ShieldCheck,
  Bot,
  CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AdminSidebar({
  isOpen = false,
  onClose,
}: AdminSidebarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const handleSwitchToSmePortal = () => {
    const smeUrl = import.meta.env.VITE_SME_URL || 'https://app.paymytax.ng';
    useAdminStatsStore.getState().clear();
    logout();
    toast('Signed out of Admin — redirecting to SME Portal');
    window.location.href = `${smeUrl}/login`;
  };
  const pendingWithdrawals = useAdminStatsStore((s) => s.stats?.withdrawalSla?.pendingCount ?? 0);
  const unverifiedInflows = useAdminStatsStore((s) => s.stats?.unverifiedInflows?.count ?? 0);
  const pendingSubscriptions = useAdminStatsStore((s) => s.stats?.pendingSubscriptionsCount ?? 0);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [isOpen]);

  useEffect(() => {
    // Shared with the dashboard + withdrawals list — one request, not three.
    useAdminStatsStore.getState().fetchStats();
  }, []);

  const handleNavClick = () => {
    onClose?.();
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      mainEl.scrollTop = 0;
    }
  };

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/businesses', label: 'Businesses', icon: Building2 },
    {
      to: '/admin/subscriptions',
      label: 'Subscriptions',
      icon: CreditCard,
      badge: pendingSubscriptions > 0 ? pendingSubscriptions : undefined,
    },
    {
      to: '/admin/withdrawals',
      label: 'Withdrawals',
      icon: Wallet,
      badge: pendingWithdrawals > 0 ? pendingWithdrawals : undefined,
    },
    { to: '/admin/transactions', label: 'Transactions', icon: ArrowLeftRight },
    {
      to: '/admin/unverified-inflows',
      label: 'Unverified Inflows',
      icon: ArrowDownLeft,
      badge: unverifiedInflows > 0 ? unverifiedInflows : undefined,
    },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
    { to: '/admin/ai-settings', label: 'AI Settings', icon: Bot },
  ];

  const sidebarContent = (
    <>
      <div className='flex items-center justify-between border-b border-hairline bg-panel px-4 py-3'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary-600 text-[11px] font-semibold text-white'>
            PMT
          </span>
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span className='text-[13px] font-semibold text-ink'>WallXERP</span>
              <span className='rounded border border-hairline bg-panel-subtle px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-muted'>
                Admin
              </span>
            </div>
            <p className='truncate text-[10px] text-ink-subtle'>Platform Management</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label='Close sidebar'
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none md:hidden'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      <nav className='flex-1 overflow-y-auto px-2.5 py-3'>
        <div className='px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle'>
          Core Controls
        </div>
        <ul className='space-y-0.5'>
          {navItems.map(({ to, label, icon: Icon, end, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${
                    isActive
                      ? 'bg-ink font-semibold text-panel'
                      : 'text-ink-muted hover:bg-panel-subtle hover:text-ink'
                  }`
                }
              >
                <span className='flex min-w-0 items-center gap-2.5'>
                  <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />
                  <span className='truncate'>{label}</span>
                </span>
                {badge !== undefined && (
                  <span className='ml-2 shrink-0 rounded-full border border-warning-200 bg-warning-50 px-1.5 text-[10px] font-semibold tabular-nums text-warning-700'>
                    {badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className='border-t border-hairline bg-panel p-2.5'>
        <div className='mb-2 flex items-center gap-2.5 rounded border border-hairline bg-panel-subtle px-2 py-1.5'>
          <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700'>
            {user?.email?.charAt(0).toUpperCase() || 'A'}
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-[11px] font-semibold text-ink'>
              {user?.email || 'admin@paymytax.com'}
            </p>
            <p className='flex items-center gap-1 text-[10px] text-ink-subtle'>
              <ShieldCheck className='h-3 w-3' aria-hidden='true' /> Super Admin
            </p>
          </div>
        </div>

        <div className='space-y-0.5'>
          <button
            type='button'
            onClick={handleSwitchToSmePortal}
            className='flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none text-left'
          >
            <ArrowLeft className='h-3.5 w-3.5 shrink-0 text-ink-subtle' aria-hidden='true' />
            Switch to SME Portal
          </button>
          <button
            onClick={handleLogout}
            className='flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50 hover:text-danger-700 focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:outline-none'
          >
            <LogOut className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
            Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className='z-20 hidden h-screen w-64 shrink-0 flex-col border-r border-hairline bg-panel md:flex'>
        {sidebarContent}
      </aside>

      <div className='md:hidden'>
        <div
          className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={onClose}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-panel shadow-2xl transition-transform duration-300 ease-out ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
