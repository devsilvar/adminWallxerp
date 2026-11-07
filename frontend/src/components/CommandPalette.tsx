import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Receipt,
  Wallet,
  FileText,
  Calculator,
  CreditCard,
  Landmark,
  BookOpen,
  Settings as SettingsIcon,
  Plus,
  Zap,
  RefreshCw,
  LogOut,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  User as UserIcon,
} from 'lucide-react';
import api from '@/lib/axios.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface SearchResults {
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    total: number;
    status: string;
    issueDate: string;
    dueDate: string;
  }>;
  customers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    invoiceCount: number;
  }>;
  totalCount: number;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type ItemKind = 'nav' | 'action' | 'invoice' | 'customer' | 'business';

interface Item {
  id: string;
  kind: ItemKind;
  label: string;
  hint?: string;
  meta?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onSelect: () => void;
}

interface Section {
  id: string;
  label: string;
  items: Item[];
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function CommandPalette({
  isOpen,
  onClose,
}: CommandPaletteProps) {
  useDisplayCurrency();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness);
  const { blockIfNeeded } = useSubscriptionWriteGate();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset on open / close. Auto-focus the input when opened.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setResults(null);
      setActiveIndex(0);
      // Defer focus past the open animation so the caret actually lands.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounce query (200ms — fast enough to feel snappy, slow enough to not spam the API).
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  // Fetch records when debounced query crosses 2 chars.
  useEffect(() => {
    if (!isOpen) return;
    if (!activeBusiness?.id) return;
    if (debouncedQuery.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .get(`/businesses/${activeBusiness.id}/search`, {
        params: { q: debouncedQuery },
        signal: ctrl.signal,
      })
      .then((r) => {
        if (cancelled) return;
        setResults(r.data?.data ?? null);
      })
      .catch((err) => {
        if (cancelled || err?.code === 'ERR_CANCELED') return;
        setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery, isOpen, activeBusiness?.id]);

  // Build the section list. Always show nav + actions; conditionally append record results.
  const sections = useMemo<Section[]>(() => {
    const close = (fn: () => void) => () => {
      onClose();
      fn();
    };

    const navSection: Section = {
      id: 'nav',
      label: 'Navigate',
      items: [
        {
          id: 'nav-dashboard',
          kind: 'nav',
          label: 'Dashboard',
          icon: LayoutDashboard,
          onSelect: close(() => navigate('/dashboard')),
        },
        {
          id: 'nav-sales',
          kind: 'nav',
          label: 'Sales',
          icon: Receipt,
          onSelect: close(() => navigate('/sales')),
        },
        {
          id: 'nav-expenses',
          kind: 'nav',
          label: 'Expenses',
          icon: Wallet,
          onSelect: close(() => navigate('/expenses')),
        },
        {
          id: 'nav-invoices',
          kind: 'nav',
          label: 'Invoices',
          icon: FileText,
          onSelect: close(() => navigate('/invoices')),
        },
        {
          id: 'nav-debtors',
          kind: 'nav',
          label: 'Debtors & Credit Book',
          icon: BookOpen,
          onSelect: close(() => navigate('/debtors')),
        },
        {
          id: 'nav-tax',
          kind: 'nav',
          label: 'Tax Reports',
          icon: Calculator,
          onSelect: close(() => navigate('/tax')),
        },
        {
          id: 'nav-payments',
          kind: 'nav',
          label: 'Tax Payments & Receipts',
          icon: CreditCard,
          onSelect: close(() => navigate('/tax?tab=payments')),
        },
        {
          id: 'nav-settlement',
          kind: 'nav',
          label: 'Settlement',
          icon: Landmark,
          onSelect: close(() => navigate('/settlement')),
        },
        {
          id: 'nav-account',
          kind: 'nav',
          label: 'Banking & Wallet',
          icon: Landmark,
          onSelect: close(() => navigate('/account')),
        },
        {
          id: 'nav-settings',
          kind: 'nav',
          label: 'Settings',
          icon: SettingsIcon,
          onSelect: close(() => navigate('/settings')),
        },
      ],
    };

    const actionsSection: Section = {
      id: 'actions',
      label: 'Quick actions',
      items: [
        {
          id: 'act-sale',
          kind: 'action',
          label: 'Record a sale',
          hint: 'Open the sales page',
          icon: Plus,
          onSelect: close(() => navigate('/sales')),
        },
        {
          id: 'act-invoice',
          kind: 'action',
          label: 'Create new invoice',
          hint: 'Open the invoice form',
          icon: FileText,
          onSelect: close(() => {
            if (blockIfNeeded()) return;
            navigate('/invoices/new');
          }),
        },
        {
          id: 'act-tax',
          kind: 'action',
          label: 'Calculate tax',
          hint: 'Open tax reports',
          icon: Zap,
          onSelect: close(() => navigate('/tax')),
        },
        {
          id: 'act-logout',
          kind: 'action',
          label: 'Log out',
          hint: 'Sign out of this account',
          icon: LogOut,
          onSelect: close(() => {
            logout();
            navigate('/login', { replace: true });
          }),
        },
      ],
    };

    // Filter nav + actions client-side using the typed query (not debounced — feels snappier).
    const q = query.trim().toLowerCase();
    const filterCmd = (s: Section): Section => ({
      ...s,
      items: q
        ? s.items.filter(
            (i) =>
              i.label.toLowerCase().includes(q) ||
              i.hint?.toLowerCase().includes(q),
          )
        : s.items,
    });

    const cmdSections: Section[] = [
      filterCmd(navSection),
      filterCmd(actionsSection),
    ].filter((s) => s.items.length > 0);

    // Business switcher — only when there's >1 business and the query matches a name.
    const otherBusinesses = businesses.filter(
      (b) => b.id !== activeBusiness?.id,
    );
    if (otherBusinesses.length > 0) {
      const match = otherBusinesses.filter((b) =>
        q ? b.businessName.toLowerCase().includes(q) : true,
      );
      if (match.length > 0 && (q || businesses.length > 1)) {
        cmdSections.push({
          id: 'businesses',
          label: 'Switch business',
          items: match.slice(0, 4).map((b) => ({
            id: `biz-${b.id}`,
            kind: 'business' as const,
            label: b.businessName,
            hint: 'Make this the active business',
            icon: RefreshCw,
            onSelect: close(() => setActiveBusiness(b)),
          })),
        });
      }
    }

    // Record sections — only when we actually queried something.
    if (debouncedQuery.length >= 2 && results) {
      if (results.invoices.length > 0) {
        cmdSections.push({
          id: 'invoices',
          label: 'Invoices',
          items: results.invoices.map((inv) => ({
            id: `inv-${inv.id}`,
            kind: 'invoice' as const,
            label: `${inv.invoiceNumber} · ${inv.customerName}`,
            meta: `${formatNaira(inv.total)} · ${inv.status}`,
            hint: `Issued ${formatDate(inv.issueDate)}`,
            icon: FileText,
            onSelect: close(() => navigate(`/invoices/${inv.id}`)),
          })),
        });
      }
      if (results.customers.length > 0) {
        cmdSections.push({
          id: 'customers',
          label: 'Customers',
          items: results.customers.map((c) => ({
            id: `cust-${c.id}`,
            kind: 'customer' as const,
            label: c.name,
            meta: `${c.invoiceCount} ${c.invoiceCount === 1 ? 'invoice' : 'invoices'}`,
            hint: c.email ?? c.phone ?? undefined,
            icon: UserIcon,
            // Customers don't have a detail page yet — link to invoices filtered by name.
            onSelect: close(() =>
              navigate(`/invoices?search=${encodeURIComponent(c.name)}`),
            ),
          })),
        });
      }
    }

    return cmdSections;
  }, [
    query,
    debouncedQuery,
    results,
    navigate,
    onClose,
    logout,
    businesses,
    activeBusiness?.id,
    setActiveBusiness,
  ]);

  // Flat list for keyboard navigation; index 0..N maps to all visible items in order.
  const flatItems = useMemo(
    () =>
      sections.flatMap((s) => s.items.map((i) => ({ section: s.id, item: i }))),
    [sections],
  );

  // Reset active index when result set changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Keyboard handler — bound while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) =>
          flatItems.length === 0 ? 0 : (i + 1) % flatItems.length,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) =>
          flatItems.length === 0
            ? 0
            : (i - 1 + flatItems.length) % flatItems.length,
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatItems[activeIndex]?.item.onSelect();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, flatItems, activeIndex, onClose]);

  // Scroll active row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el =
      listRef.current.querySelector<HTMLElement>(`[data-active="true"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  let runningIndex = -1; // assigned per item below to map to flatItems

  const showEmpty =
    sections.length === 0 && debouncedQuery.length >= 2 && !loading;
  const showShortQueryHint = query.trim().length > 0 && query.trim().length < 2;

  return (
    <div className='fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] sm:pt-[18vh]'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 bg-gray-900/40 backdrop-blur-sm'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Panel */}
      <div
        role='dialog'
        aria-label='Command palette'
        className='relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in'
      >
        {/* Search input */}
        <div className='flex items-center gap-3 border-b border-gray-100 px-4'>
          <Search className='h-4 w-4 shrink-0 text-gray-400' />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeBusiness
                ? `Search invoices, customers, or jump to a page…`
                : `Search WallXERP…`
            }
            className='h-12 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none'
          />
          {loading ? (
            <span className='text-[11px] text-gray-400'>Searching…</span>
          ) : (
            <kbd className='hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500'>
              esc
            </kbd>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className='max-h-[60vh] overflow-y-auto py-2'>
          {showShortQueryHint && (
            <p className='px-4 py-3 text-[12px] text-gray-400'>
              Keep typing to search invoices and customers…
            </p>
          )}

          {sections.map((section) => (
            <div key={section.id} className='mb-1.5'>
              <p className='px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                {section.label}
              </p>
              <ul>
                {section.items.map((item) => {
                  runningIndex += 1;
                  const itemIndex = runningIndex;
                  const isActive = itemIndex === activeIndex;
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type='button'
                        data-active={isActive ? 'true' : undefined}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={item.onSelect}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                          isActive ? 'bg-primary-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isActive
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          <Icon className='h-4 w-4' strokeWidth={2} />
                        </span>
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-[14px] font-medium text-gray-900'>
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className='block truncate text-[12px] text-gray-500'>
                              {item.hint}
                            </span>
                          )}
                        </span>
                        {item.kind === 'invoice' && item.meta && (
                          <InvoiceMeta meta={item.meta} />
                        )}
                        {item.kind === 'customer' && item.meta && (
                          <span className='shrink-0 text-[12px] text-gray-400'>
                            {item.meta}
                          </span>
                        )}
                        {isActive && (
                          <CornerDownLeft className='h-3.5 w-3.5 shrink-0 text-primary-500' />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {showEmpty && (
            <div className='px-4 py-10 text-center'>
              <p className='text-[14px] font-medium text-gray-700'>
                No results for “{debouncedQuery}”
              </p>
              <p className='mt-1 text-[12px] text-gray-500'>
                Try a customer name, invoice number, or page name.
              </p>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className='flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] text-gray-500'>
          <div className='flex items-center gap-3'>
            <FooterKey icon={ArrowUp} />
            <FooterKey icon={ArrowDown} />
            <span>Navigate</span>
            <span className='text-gray-300'>·</span>
            <FooterKey icon={CornerDownLeft} />
            <span>Open</span>
          </div>
          <span className='hidden sm:block'>WallXERP search</span>
        </div>
      </div>
    </div>
  );
}

function InvoiceMeta({ meta }: { meta: string }) {
  // meta is "₦45,000 · paid"
  const [amount, status] = meta.split(' · ');
  const tone = STATUS_TONE[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className='flex shrink-0 items-center gap-2'>
      <span className='text-[12px] font-semibold tabular-nums text-gray-700'>
        {amount}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${tone}`}
      >
        {status}
      </span>
    </span>
  );
}

function FooterKey({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <kbd className='inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200 bg-white text-gray-500'>
      <Icon className='h-3 w-3' />
    </kbd>
  );
}
