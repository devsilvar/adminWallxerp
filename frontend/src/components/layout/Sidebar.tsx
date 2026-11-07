import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { prefetchRoute } from '@/lib/routeChunks.ts';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  FileText,
  Calculator,
  Landmark,
  Settings,
  ChevronDown,
  Plus,
  Check,
  X,
  Zap,
  Bot,
  BookOpen,
  Crown,
  Users,
  Package,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import CreateBusinessModal from '@/components/CreateBusinessModal.tsx';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';
import { hasPerm } from '@/components/auth/PermissionGate.tsx';
import type { PermissionKey } from '@/types/index.ts';
import toast from 'react-hot-toast';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { getPlanLimits } from '@/config/subscription';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { t } = useTranslation('nav');
  const user = useAuthStore((s) => s.user);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness);
  const subStatus = useSubscriptionStatus();
  const { blockIfNeeded } = useSubscriptionWriteGate();
  const planLimits = getPlanLimits(subStatus.tier);
  const isBusinessOverLimit = planLimits.maxBusinesses !== -1 && businesses.length >= planLimits.maxBusinesses;

  const [showBizDropdown, setShowBizDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // An account is an owner account if:
  // 1. It owns at least one business (myRole === 'owner' or b.userId === user.id)
  // 2. OR user has no businesses yet and is not marked as non-owner (user.isOwnerAccount !== false)
  const isOwnerAccount = businesses.length > 0
    ? businesses.some((b) => b.myRole === 'owner' || b.userId === user?.id)
    : user?.isOwnerAccount !== false;

  const checkPermission = (perm?: PermissionKey): boolean => {
    if (!perm) return true;
    return hasPerm(perm, activeBusiness, user?.id);
  };

  const navSections: Array<{
    label: string;
    items: Array<{ to: string; label: string; icon: any; permission?: PermissionKey }>;
  }> = [
    {
      label: t('sections.operate'),
      items: [
        { to: '/dashboard', label: t('Dashboard'), icon: LayoutDashboard, permission: 'dashboard.read' },
        { to: '/sales', label: t('Sales'), icon: Receipt, permission: 'sales.read' },
        { to: '/expenses', label: t('Expenses'), icon: Wallet, permission: 'expenses.read' },
        { to: '/invoices', label: t('Invoices'), icon: FileText, permission: 'invoices.read' },
        {
          to: '/debtors',
          label: t('Debtors', { defaultValue: 'Debtors' }),
          icon: BookOpen,
          permission: 'debtors.read',
        },
        {
          to: '/customers',
          label: t('customers', { defaultValue: 'Customer CRM' }),
          icon: Users,
          permission: 'customers.read',
        },
        {
          to: '/inventory',
          label: t('Inventory & Marketplace', { defaultValue: 'Inventory & Marketplace' }),
          icon: Package,
        },
        { to: '/ai', label: t('Ai Assistant'), icon: Bot, permission: 'ai.use' },
      ],
    },
    {
      label: t('sections.money'),
      items: [
        { to: '/tax', label: t('Tax Reports'), icon: Calculator, permission: 'tax.read' },
        {
          to: '/transactions',
          label: t('Transaction History'),
          icon: FileText,
          permission: 'wallet.read',
        },
        {
          to: '/settlement',
          label: t('settlement', { defaultValue: 'Settlement' }),
          icon: Landmark,
          permission: 'wallet.read',
        },
        { to: '/account', label: t('bank_account', { defaultValue: 'Banking & Wallet' }), icon: Landmark, permission: 'wallet.read' },
      ],
    },
    {
      label: t('sections.account'),
      items: [
        {
          to: '/subscription',
          label: t('subscription', { defaultValue: 'Subscription' }),
          icon: Crown,
        },
        { to: '/settings', label: t('Settings'), icon: Settings }, // personal settings always visible
      ],
    },
  ];

  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => checkPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [isOpen]);

  const handleNavClick = () => {
    onClose?.();
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      mainEl.scrollTop = 0;
    }
  };

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }
    };
  }, []);

  const schedulePrefetch = (to: string) => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
    }
    prefetchTimerRef.current = setTimeout(() => {
      void prefetchRoute(to);
    }, 50);
  };

  const cancelPrefetch = () => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  };

  const getRoleBadge = (role?: string) => {
    if (!role || role === 'owner') return { label: 'Owner', class: 'bg-purple-50 text-purple-700 border-purple-200' };
    if (role === 'manager') return { label: 'Manager', class: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (role === 'sales_staff') return { label: 'Sales Staff', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (role === 'accountant') return { label: 'Accountant', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'Viewer', class: 'bg-gray-50 text-gray-700 border-gray-200' };
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className='flex items-center justify-between px-5 py-5'>
        <OptimizedLogo size='md' className='h-8' />
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className='md:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors'
        >
          <X className='h-4 w-4 text-gray-500' />
        </button>
      </div>

      {/* Business selector */}
      <div className='relative mx-4 mb-2'>
        {activeBusiness ? (
          <button
            onClick={() => setShowBizDropdown(!showBizDropdown)}
            className='flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gradient-to-r from-gray-50/80 to-gray-50/40 px-3 py-2.5 text-left transition-all duration-200 hover:border-primary-200 hover:bg-gradient-to-r hover:from-primary-50/50 hover:to-primary-50/20 group'
          >
            <div className='flex items-center gap-2.5 min-w-0'>
              <div className='flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12px] font-bold shrink-0 shadow-sm shadow-primary-500/20 overflow-hidden'>
                {activeBusiness.logoUrl ? (
                  <img
                    src={activeBusiness.logoUrl}
                    alt={activeBusiness.businessName}
                    className='h-full w-full object-cover'
                  />
                ) : (
                  activeBusiness.businessName.charAt(0).toUpperCase()
                )}
              </div>
              <div className='min-w-0'>
                <p className='text-[13px] font-semibold text-gray-900 truncate'>
                  {activeBusiness.businessName}
                </p>
                <div className='flex items-center gap-1.5 mt-0.5'>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${getRoleBadge(activeBusiness.myRole).class}`}>
                    {getRoleBadge(activeBusiness.myRole).label}
                  </span>
                  <span className='text-[10px] text-gray-400'>
                    {t('business.active_workspace')}
                  </span>
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform duration-200 group-hover:text-primary-500 ${showBizDropdown ? 'rotate-180' : ''}`}
            />
          </button>
        ) : isOwnerAccount ? (
          <button
            onClick={() => {
              if (blockIfNeeded()) return;
              setShowCreateModal(true);
            }}
            className='flex w-full items-center gap-2 rounded-xl border border-dashed border-primary-200 px-3 py-2.5 text-[13px] font-medium text-primary-600 hover:bg-primary-50 hover:border-primary-300 transition-all'
          >
            <Plus className='h-4 w-4' />
            {t('actions.create_business')}
          </button>
        ) : (
          <div className='rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500 text-center font-medium'>
            {t('business.no_business_assigned', { defaultValue: 'No business assigned' })}
          </div>
        )}

        {/* Dropdown */}
        {showBizDropdown && (
          <>
            <div
              className='fixed inset-0 z-10'
              onClick={() => setShowBizDropdown(false)}
            />
            <div className='absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl shadow-gray-200/50 animate-in'>
              {businesses.map((biz) => (
                <button
                  key={biz.id}
                  onClick={() => {
                    setActiveBusiness(biz);
                    setShowBizDropdown(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-[13px] transition-colors ${
                    biz.id === activeBusiness?.id
                      ? 'text-primary-700 font-medium bg-primary-50/70'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold overflow-hidden shrink-0 ${
                        biz.id === activeBusiness?.id
                          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {biz.logoUrl ? (
                        <img
                          src={biz.logoUrl}
                          alt={biz.businessName}
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        biz.businessName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className='truncate'>{biz.businessName}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border shrink-0 ${getRoleBadge(biz.myRole).class}`}>
                      {getRoleBadge(biz.myRole).label}
                    </span>
                  </div>
                  {biz.id === activeBusiness?.id && (
                    <Check className='h-3.5 w-3.5 text-primary-500 shrink-0 ml-1' />
                  )}
                </button>
              ))}

              {isOwnerAccount && (
                <div className='border-t border-gray-50 mt-1 pt-1 px-1.5'>
                  <button
                    onClick={() => {
                      if (isBusinessOverLimit) {
                        toast.error(`At plan cap of ${planLimits.maxBusinesses} businesses — upgrade or remove a business.`);
                        return;
                      }
                      if (blockIfNeeded()) return;
                      setShowCreateModal(true);
                      setShowBizDropdown(false);
                    }}
                    disabled={isBusinessOverLimit}
                    title={isBusinessOverLimit ? 'At plan cap — upgrade or remove a business' : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors ${
                      isBusinessOverLimit
                        ? 'text-gray-400 hover:bg-transparent cursor-not-allowed opacity-60'
                        : 'text-primary-600 hover:bg-primary-50'
                    }`}
                  >
                    <Plus className='h-3.5 w-3.5' />
                    {t('actions.new_business', { defaultValue: 'New Business / Branch' })}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isOwnerAccount && (
        <CreateBusinessModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {(checkPermission('sales.create') || checkPermission('tax.calculate')) && (
        <div className='px-4 mt-1 mb-3 space-y-1.5'>
          {checkPermission('sales.create') && (
            <NavLink
              to='/sales'
              onClick={handleNavClick}
              onMouseEnter={() => schedulePrefetch('/sales')}
              onMouseLeave={cancelPrefetch}
              onFocus={() => void prefetchRoute('/sales')}
              onTouchStart={() => void prefetchRoute('/sales')}
              className='flex items-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm shadow-primary-500/20 transition-all duration-200 hover:bg-primary-700 active:scale-[0.99]'
            >
              <Plus className='h-4 w-4' strokeWidth={2.4} />
              {t('actions.record_sale')}
            </NavLink>
          )}
          {checkPermission('tax.calculate') && (
            <NavLink
              to='/tax'
              onClick={handleNavClick}
              onMouseEnter={() => schedulePrefetch('/tax')}
              onMouseLeave={cancelPrefetch}
              onFocus={() => void prefetchRoute('/tax')}
              onTouchStart={() => void prefetchRoute('/tax')}
              className='flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 transition-all duration-200 hover:border-primary-200 hover:bg-primary-50/40 hover:text-primary-700'
            >
              <Zap className='h-4 w-4 text-amber-500' strokeWidth={2.2} />
              {t('actions.calculate_tax')}
            </NavLink>
          )}
        </div>
      )}

      {/* Navigation — grouped by intent (Operate / Money / Account) */}
      <nav className='flex-1 overflow-y-auto px-3' aria-label='Main navigation'>
        {filteredSections.map((section) => (
          <div key={section.label} className='mb-4 last:mb-0'>
            <p className='px-3 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider'>
              {section.label}
            </p>
            <ul className='space-y-0.5'>
              {section.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={handleNavClick}
                    onMouseEnter={() => schedulePrefetch(to)}
                    onMouseLeave={cancelPrefetch}
                    onFocus={() => void prefetchRoute(to)}
                    onTouchStart={() => void prefetchRoute(to)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-primary-50 to-primary-50/40 text-primary-700'
                          : 'text-gray-500 hover:bg-gray-50/80 hover:text-gray-700'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className='absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-gradient-to-b from-primary-500 to-primary-600' />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : ''}`}
                          strokeWidth={isActive ? 2 : 1.8}
                        />
                        <span className="truncate">{label}</span>
                        {to === '/subscription' && (
                          <span
                            className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                              subStatus.tier === 'free'
                                ? 'bg-gray-100 text-gray-600'
                                : subStatus.tier === 'scale'
                                  ? 'bg-purple-100 text-purple-700'
                                  : subStatus.tier === 'business'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {subStatus.tier === 'scale' ? 'Scale-Up' : subStatus.tier}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className='hidden lg:flex h-screen w-[260px] flex-col bg-white border-r border-gray-100 shrink-0'>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — overlay drawer */}
      <div className='lg:hidden'>
        {/* Backdrop with blur */}
        <div
          className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={onClose}
          aria-hidden='true'
        />
        {/* Drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[300px] max-w-[85vw] flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
          aria-label='Navigation sidebar'
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
