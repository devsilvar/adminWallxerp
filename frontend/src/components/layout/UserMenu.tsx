import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, Settings as SettingsIcon, LogOut, Shield, Globe, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useLanguageStore } from '@/stores/language.store';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import toast from 'react-hot-toast';

/**
 * Top-bar user menu. Replaces the static avatar tile and the user/logout
 * block that previously lived at the bottom of the sidebar.
 *
 * Behaviour mirrors NotificationBell: trigger button, dropdown panel,
 * outside-click + Escape to close, focus returns to the trigger on close.
 */
export default function UserMenu() {
  const navigate = useNavigate();
  const { t } = useTranslation('nav');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { language, setLanguage } = useLanguageStore();

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    // Staff portal always returns to /login. Use replace so back-button
    // doesn't restore a dead session and trigger the "blip back to
    // dashboard" that the old push + ProtectedRoute double-navigate caused.
    navigate('/login', { replace: true });
  };

  const handleGoAdmin = () => {
    setOpen(false);
    const adminUrl = import.meta.env.VITE_ADMIN_URL || 'https://admin.paymytax.ng';
    logout();
    toast('Signed out — redirecting to Admin Portal');
    window.location.href = `${adminUrl}/admin/login`;
  };

  const displayName = user?.email?.split('@')[0] ?? 'Account';
  const isAdmin = user?.role === 'admin';
  const subStatus = useSubscriptionStatus();

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100 transition-colors hover:bg-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <UserIcon className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="User menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60"
        >
          {/* Identity block */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white shrink-0">
              <UserIcon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email ?? ''}</p>
            </div>
          </div>

          {/* Subscription status block */}
          <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 shrink-0">
                <Crown className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {subStatus.planName}
                </p>
                <p className="text-[10px] text-gray-500 capitalize leading-none mt-0.5">
                  {subStatus.isTrial
                    ? `Free Trial (${subStatus.formattedCountdown})`
                    : subStatus.isExpired
                      ? 'Expired'
                      : 'Active'}
                </p>
              </div>
            </div>
            <button
              role="menuitem"
              onClick={() => go('/subscription')}
              className="text-[11px] font-medium text-primary-600 hover:text-primary-700 bg-white border border-gray-200 hover:border-primary-300 rounded-md px-2 py-1 shadow-2xs transition-colors shrink-0"
            >
              Manage
            </button>
          </div>

          {/* Items */}
          <div className="py-1">
            <button
              role="menuitem"
              onClick={() => go('/settings')}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <SettingsIcon className="h-4 w-4 text-gray-400" strokeWidth={2} />
              {t('settings')}
            </button>
            {isAdmin && (
              <button
                role="menuitem"
                onClick={handleGoAdmin}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Shield className="h-4 w-4 text-gray-400" strokeWidth={2} />
                {t('admin')}
              </button>
            )}
          </div>

          {/* Language toggle */}
          <div className="border-t border-gray-100 py-1">
            <div className="px-4 py-2">
              <div className="flex items-center gap-2.5 mb-2">
                <Globe className="h-4 w-4 text-gray-400" strokeWidth={2} />
                <span className="text-xs font-medium text-gray-500">{t('language')}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage('en')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    language === 'en'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('english')}
                </button>
                <button
                  onClick={() => setLanguage('pcm')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    language === 'pcm'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('pidgin')}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 py-1">
            <button
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
