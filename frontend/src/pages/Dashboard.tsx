import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CreateBusinessModal from '@/components/CreateBusinessModal.tsx';
import PinModal from '@/components/PinModal.tsx';
import FreeWelcomeModal from '@/components/FreeWelcomeModal.tsx';
import PendingActivationModal from '@/components/PendingActivationModal.tsx';
import DashboardSkeleton from '@/pages/Dashboard.skeleton.tsx';
import { STALE, isFresh } from '@/lib/cache.ts';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Receipt,
  Heart,
  BarChart3,
  Activity,
  Wallet,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CircleDollarSign,
  Plus,
  FileText,
  Zap,
  Copy,
  BadgeCheck,
  Eye,
  EyeOff,
  Shield,
  BookOpen,
  Users,
  ChevronRight,
  RefreshCw,
  Crown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useCreditStore } from '@/stores/credit.store.ts';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import api from '@/lib/axios.ts';
import type { TaxReport, SalesTransaction, Expense, User, Business, BusinessTaxPolicy } from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

// Recharts is ~100kB gzipped and this is the post-login landing page. Keeping
// the chart out of the dashboard chunk lets the KPI strip, trends and activity
// lists paint before the charting library has downloaded and parsed. Needs the
// local <Suspense> at the render site — previously the only boundary above this was
// App.tsx's full-screen loader; although AppLayout now localises route transitions
// with a dark rolling veil, this component-level boundary isolates the heavy chart
// chunk so dashboard KPIs paint immediately without triggering a layout veil.
const SalesExpenseChart = lazy(
  () => import('@/components/dashboard/SalesExpenseChart.tsx'),
);
const TaxProfileMigrationBanner = lazy(
  () => import('@/components/TaxProfileMigrationBanner.tsx'),
);

// ─── Merchant ID display format ─────────────────────────────
// Stored form (DB): `PMTW` + 7 digits, e.g. `PMTW0000001`.
// User-facing form: `PMT-0000001` — shorter and delimited per product ask.
// We format on display only; the stored value stays the source of truth.
function formatMerchantId(id: string | null | undefined): string {
  if (!id) return 'PMT-0000000';
  const digits = id.replace(/^PMTW/i, '').replace(/^PMT-?/i, '');
  return `PMT-${digits}`;
}

// ─── BVN masking helper ─────────────────────────────────────
// Shows: ••••••• 1234 when masked, full 11 digits when revealed
function maskBvn(bvn: string | null, revealed: boolean): string {
  if (revealed && bvn) return bvn;
  if (bvn) return `•••••••${bvn.slice(-4)}`;
  return '•••••••••••';
}

// ─── Types ──────────────────────────────────────────────────

interface DashboardData {
  currentMonth: TaxReport | null;
  trends: TrendItem[];
  lifetime: {
    totalSales: number;
    totalExpenses: number;
    totalTaxPayable: number;
    reportsCount: number;
  };
  unpaidCount: number;
  taxConfig: {
    currentRate: number;
    currency: string;
    authority: string;
    vatChargeable?: boolean;
    vatExempt?: boolean;
    vatReason?: string | null;
    source?: 'PROFILE' | 'DEFAULT';
  };
}

interface TrendItem {
  taxMonth: string;
  totalSales: number;
  totalExpenses: number;
  grossProfit: number;
  taxPayable: number;
  taxRate: number;
  profitMargin: number;
  paymentStatus: string;
  isFinalized: boolean;
  isLocked: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonth(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    month: 'short',
    year: 'numeric',
  });
}

function getCreditDueStatus(dueDateStr: string, status: string) {
  if (status === 'paid') {
    return {
      label: 'Settled',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  }
  if (status === 'written_off') {
    return {
      label: 'Written Off',
      color: 'text-gray-600 bg-gray-100 border-gray-200',
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: `${overdueDays}d overdue`,
      color: 'text-rose-700 bg-rose-50 border-rose-200 font-semibold',
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Due today',
      color: 'text-amber-700 bg-amber-50 border-amber-200 font-semibold',
    };
  }
  return {
    label: `Due in ${diffDays}d`,
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  };
}

function statusDot(status: string, onDark = false) {
  const colorMap: Record<string, string> = {
    pending: 'bg-amber-400',
    processing: 'bg-blue-400',
    completed: 'bg-emerald-400',
    failed: 'bg-red-400',
    confirmed: 'bg-emerald-400',
    reversed: 'bg-red-400',
  };
  const labelMap: Record<string, string> = {
    pending: onDark
      ? 'text-amber-200 bg-amber-400/20 border-amber-300/30'
      : 'text-amber-600 bg-amber-50 border-amber-100',
    processing: onDark
      ? 'text-blue-200 bg-blue-400/20 border-blue-300/30'
      : 'text-blue-600 bg-blue-50 border-blue-100',
    completed: onDark
      ? 'text-emerald-200 bg-emerald-400/20 border-emerald-300/30'
      : 'text-emerald-600 bg-emerald-50 border-emerald-100',
    failed: onDark
      ? 'text-rose-200 bg-rose-400/20 border-rose-300/30'
      : 'text-red-600 bg-red-50 border-red-100',
    confirmed: onDark
      ? 'text-emerald-200 bg-emerald-400/20 border-emerald-300/30'
      : 'text-emerald-600 bg-emerald-50 border-emerald-100',
    reversed: onDark
      ? 'text-rose-200 bg-rose-400/20 border-rose-300/30'
      : 'text-red-600 bg-red-50 border-red-100',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${labelMap[status] || (onDark ? 'text-white/90 bg-white/10 border-white/15' : 'text-gray-500 bg-gray-50 border-gray-100')}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full animate-pulse-soft ${colorMap[status] || 'bg-gray-400'}`}
      />
      {status}
    </span>
  );
}

// Time-of-day icon. We render a small inline SVG instead of an emoji so the
// glyph is consistent across OS/browsers (emoji fonts vary wildly) and we can
// theme it to the gradient banner. Five buckets: pre-dawn, sunrise, midday,
// golden hour, night.
type TimeBucket = 'predawn' | 'sunrise' | 'midday' | 'sunset' | 'night';

function getTimeBucket(hour: number): TimeBucket {
  if (hour < 5) return 'night';
  if (hour < 8) return 'sunrise';
  if (hour < 16) return 'midday';
  if (hour < 20) return 'sunset';
  return 'night';
}

function TimeOfDayIcon({
  bucket,
  className = 'h-7 w-7',
}: {
  bucket: TimeBucket;
  className?: string;
}) {
  // Two-stop radial gradient that varies by bucket. The orb sits on a thin
  // horizon line for sunrise / sunset, suspended for midday and night.
  const orbStops: Record<TimeBucket, [string, string]> = {
    predawn: ['#FDE68A', '#F59E0B'],
    sunrise: ['#FCD34D', '#F97316'],
    midday: ['#FEF3C7', '#FBBF24'],
    sunset: ['#FCA5A5', '#EF4444'],
    night: ['#E0E7FF', '#A78BFA'],
  };
  const [stop1, stop2] = orbStops[bucket];
  const gradId = `tod-${bucket}`;

  // Horizon visible only for sunrise / sunset.
  const showHorizon = bucket === 'sunrise' || bucket === 'sunset';
  // Stars only at night.
  const showStars = bucket === 'night';
  // Crescent cutout transforms the orb into a moon at night.
  const isMoon = bucket === 'night';

  return (
    <svg
      viewBox='0 0 32 32'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      className={className}
    >
      <defs>
        <radialGradient id={gradId} cx='50%' cy='50%' r='50%'>
          <stop offset='0%' stopColor={stop1} />
          <stop offset='100%' stopColor={stop2} />
        </radialGradient>
        {/* Soft outer halo */}
        <radialGradient id={`${gradId}-halo`} cx='50%' cy='50%' r='50%'>
          <stop offset='0%' stopColor={stop2} stopOpacity='0.35' />
          <stop offset='100%' stopColor={stop2} stopOpacity='0' />
        </radialGradient>
      </defs>

      {/* Halo glow */}
      <circle
        cx='16'
        cy={showHorizon ? 18 : 15}
        r='13'
        fill={`url(#${gradId}-halo)`}
      />

      {/* Sun rays — only for sunrise and midday */}
      {(bucket === 'sunrise' || bucket === 'midday') && (
        <g
          stroke={stop2}
          strokeWidth='1.25'
          strokeLinecap='round'
          opacity={bucket === 'midday' ? 0.85 : 0.7}
        >
          <line x1='16' y1='3' x2='16' y2='6' />
          <line
            x1='16'
            y1={bucket === 'midday' ? '24' : '22'}
            x2='16'
            y2={bucket === 'midday' ? '27' : '24'}
          />
          <line x1='3' y1='16' x2='6' y2='16' />
          <line x1='26' y1='16' x2='29' y2='16' />
          <line x1='6.5' y1='6.5' x2='8.5' y2='8.5' />
          <line x1='23.5' y1='6.5' x2='25.5' y2='8.5' />
          <line x1='6.5' y1='25.5' x2='8.5' y2='23.5' />
          <line x1='23.5' y1='25.5' x2='25.5' y2='23.5' />
        </g>
      )}

      {/* The orb itself — sun, or moon with a crescent cutout for night */}
      {isMoon ? (
        <g>
          {/* Moon body */}
          <circle cx='16' cy='15' r='7' fill={`url(#${gradId})`} />
          {/* Crescent: a smaller circle in the banner color "bites" out the right side */}
          <circle cx='19' cy='13' r='6' fill='#1e3a8a' />
          {/* A few stars sprinkled in the corners */}
          <g fill='#FEF9C3'>
            <circle cx='6' cy='6' r='0.9' />
            <circle cx='26' cy='9' r='0.7' />
            <circle cx='9' cy='11' r='0.55' />
            <circle cx='24' cy='22' r='0.6' />
          </g>
        </g>
      ) : (
        <circle
          cx='16'
          cy={showHorizon ? 16 : 15}
          r={bucket === 'midday' ? 7 : 6.25}
          fill={`url(#${gradId})`}
        />
      )}

      {/* Horizon line for sunrise / sunset — sun is partially submerged */}
      {showHorizon && (
        <g>
          <rect
            x='0'
            y='22'
            width='32'
            height='10'
            fill='#1e3a8a'
            opacity='0.0'
          />
          <line
            x1='3'
            y1='22'
            x2='29'
            y2='22'
            stroke={stop2}
            strokeOpacity='0.5'
            strokeWidth='1'
            strokeLinecap='round'
            strokeDasharray='2 2'
          />
        </g>
      )}

      {/* Stars duplicate for non-moon night case (kept above for moon) */}
      {showStars && !isMoon && (
        <g fill='#FEF9C3'>
          <circle cx='5' cy='6' r='0.8' />
          <circle cx='27' cy='10' r='0.6' />
        </g>
      )}
    </svg>
  );
}

function getGreetingLabel(): string {
  const hour = new Date().getHours();
  const bucket = getTimeBucket(hour);
  if (bucket === 'sunrise' || bucket === 'midday')
    return hour < 12 ? 'Good morning' : 'Good afternoon';
  if (bucket === 'sunset') return 'Good evening';
  return hour < 5 ? 'Working late' : 'Good evening';
}

export function resolveGreetingName(
  user: User | null | undefined,
  activeBusiness: Business | null | undefined,
): string {
  const userFirst = user?.fullName?.trim().split(/\s+/)[0];
  if (userFirst) return userFirst;

  const isOwner = Boolean(
    user?.id && activeBusiness?.userId && user.id === activeBusiness.userId,
  );
  if (isOwner && activeBusiness?.ownerName) {
    const ownerFirst = activeBusiness.ownerName.trim().split(/\s+/)[0];
    if (ownerFirst) return ownerFirst;
  }

  return '';
}

function getHealthScore(
  lt: DashboardData['lifetime'] | undefined,
  unpaidCount: number,
): { score: number; label: string; color: string; bg: string } {
  if (!lt || (lt.reportsCount === 0 && lt.totalSales === 0)) {
    return {
      score: 0,
      label: 'Getting started',
      color: 'text-gray-400',
      bg: 'bg-white/30',
    };
  }

  let score = 0;

  // Active sales recording: +30%
  if (lt.totalSales > 0) {
    score += 30;
  }

  // Active monthly tax reports filed: +30%
  if (lt.reportsCount > 0) {
    score += 30;

    // Up-to-date tax payments: +40%
    if (unpaidCount === 0) {
      score += 40;
    } else {
      score += Math.max(0, 40 - unpaidCount * 15);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 80)
    return {
      score,
      label: 'Excellent',
      color: 'text-emerald-600',
      bg: 'bg-emerald-400',
    };
  if (score >= 60)
    return { score, label: 'Good', color: 'text-blue-600', bg: 'bg-blue-400' };
  if (score >= 40)
    return {
      score,
      label: 'Fair',
      color: 'text-amber-600',
      bg: 'bg-amber-400',
    };
  if (score > 0)
    return {
      score,
      label: 'Needs attention',
      color: 'text-red-500',
      bg: 'bg-red-400',
    };

  return {
    score: 0,
    label: 'Getting started',
    color: 'text-gray-400',
    bg: 'bg-white/30',
  };
}

// ─── Module-level cache ─────────────────────────────────────
// One bundle of data per business. The dashboard fires 5 requests in parallel
// on mount; caching the bundle by businessId means switching businesses then
// switching back is instant. Stale-while-revalidate: serve cached frame on
// mount, refetch in background if older than STALE.short (30s).
//
// Survives navigation (Dashboard → Sales → Dashboard) but not a hard reload —
// that's fine; the cache is a nicety, not durable state.

interface DashboardBundle {
  dashboard: DashboardData | null;
  recentSales: SalesTransaction[];
  recentExpenses: Expense[];
  recentReports: TaxReport[];
  /**
   * Labels for sections this user's role is allowed to read but whose request
   * failed. A non-empty list means the numbers on screen are incomplete and
   * must not be presented as a real balance.
   */
  failedSections: string[];
}

interface CachedBundle {
  data: DashboardBundle;
  fetchedAt: number;
}

const dashboardCache = new Map<string, CachedBundle>();

/**
 * Monotonic token for dashboard bundle loads. A response may only be written to
 * state while its token is still the newest — this is what stops a slow request
 * belonging to a business the user has already navigated away from landing on
 * top of the current one. Module-scoped, matching the sequence-guard idiom
 * already used in credit.store.ts and business.store.ts.
 */
let bundleSeq = 0;

/**
 * axios surfaces an aborted request as ERR_CANCELED. We abort in-flight
 * dashboard requests on business switch and unmount, so a cancellation is a
 * consequence of navigation — never report it to the user as a load failure.
 */
function isCanceled(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | null;
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError';
}


async function fetchDashboardBundle(
  bid: string,
  _perms?: Record<string, boolean>,
  signal?: AbortSignal,
): Promise<DashboardBundle> {
  try {
    const res = await api.get(`/businesses/${bid}/tax/dashboard-bundle?months=6`, { signal });
    const bundle = res?.data?.data;
    return {
      dashboard: bundle?.dashboard ?? null,
      recentSales: bundle?.recentSales ?? [],
      recentExpenses: bundle?.recentExpenses ?? [],
      recentReports: bundle?.recentReports ?? [],
      failedSections: bundle?.failedSections ?? [],
    };
  } catch (err) {
    if (isCanceled(err)) {
      return {
        dashboard: null,
        recentSales: [],
        recentExpenses: [],
        recentReports: [],
        failedSections: [],
      };
    }
    if (import.meta.env.DEV) {
      console.error('[Dashboard] bundle request failed', err);
    }
    return {
      dashboard: null,
      recentSales: [],
      recentExpenses: [],
      recentReports: [],
      failedSections: ['tax summary', 'recent sales', 'recent expenses', 'recent reports'],
    };
  }
}

// ─── Component ──────────────────────────────────────────────

export default function Dashboard() {
  useDisplayCurrency();
  const { t } = useTranslation('dashboard');
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const businessStoreLoading = useBusinessStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const subStatus = useSubscriptionStatus();

  const isOwnerAccount =
    businesses.length > 0
      ? businesses.some((b) => b.myRole === 'owner' || b.userId === user?.id)
      : user?.isOwnerAccount !== false;

  // Seed from cache so the first render has data on warm visits — no spinner.
  const seed = activeBusiness ? dashboardCache.get(activeBusiness.id) : null;

  const [dashboard, setDashboard] = useState<DashboardData | null>(
    seed?.data.dashboard ?? null,
  );
  const [recentSales, setRecentSales] = useState<SalesTransaction[]>(
    seed?.data.recentSales ?? [],
  );
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>(
    seed?.data.recentExpenses ?? [],
  );
  const [recentReports, setRecentReports] = useState<TaxReport[]>(
    seed?.data.recentReports ?? [],
  );
  const [taxPolicy, setTaxPolicy] = useState<BusinessTaxPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(!seed);

  useEffect(() => {
    if (!activeBusiness?.id) {
      setTaxPolicy(null);
      return;
    }
    let isMounted = true;
    api
      .get(`/businesses/${activeBusiness.id}/tax-policy`)
      .then((res) => {
        if (isMounted) setTaxPolicy(res.data?.data ?? null);
      })
      .catch(() => {
        if (isMounted) setTaxPolicy(null);
      });
    return () => {
      isMounted = false;
    };
  }, [activeBusiness?.id]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateBiz, setShowCreateBiz] = useState(false);
  const { blockIfNeeded } = useSubscriptionWriteGate();

  const paywallPendingPlan = useMemo(() => {
    const serverPending = (user as any)?.pendingPlan as string | null | undefined;
    if (serverPending) return serverPending;
    // Server is source of truth once loaded. Only fall back to localStorage
    // before fetchMe (user null) or while hasPendingSubmission is still
    // undefined (fetch in-flight). Once server says hasPendingSubmission===false
    // we must NOT resurrect a stale signupPlan from a previous session.
    const serverLoaded = user != null && (user as any)?.hasPendingSubmission !== undefined;
    if (serverLoaded) return null;
    const local = localStorage.getItem('signupPlan');
    return local && local !== 'free' ? local : null;
  }, [user]);
  const paywallHasTrial = !!user?.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now();
  const paywallTier = (user?.subscriptionTier || 'free').toLowerCase();
  const showPaywall = !!paywallPendingPlan && paywallTier === 'free' && !paywallHasTrial;

  // Once server confirms activation (tier !== free) or trial start, evict any
  // stale signupPlan so it doesn't survive a logout/login on the same device.
  // logout() also clears it; this is the happy-path eviction for the current session.
  useEffect(() => {
    if (!user) return;
    const sp = localStorage.getItem('signupPlan');
    if (!sp || sp === 'free') return;
    if (paywallTier !== 'free' || paywallHasTrial) {
      localStorage.removeItem('signupPlan');
    }
  }, [user, paywallTier, paywallHasTrial]);

  // Free Plan Welcome Modal state — suppressed while paywalled
  const [showFreeWelcomeModal, setShowFreeWelcomeModal] = useState(false);

  useEffect(() => {
    if (showPaywall) return;
    if (activeBusiness && sessionStorage.getItem('justCreatedFirstBiz') === 'true') {
      sessionStorage.removeItem('justCreatedFirstBiz');
      setShowFreeWelcomeModal(true);
    }
  }, [activeBusiness, showPaywall]);

  // Sections the last load was permitted to read but failed to fetch. Drives
  // the error banner and the fatal-error state — see fetchSection().
  const [loadErrors, setLoadErrors] = useState<string[]>(
    seed?.data.failedSections ?? [],
  );
  // Bumped by the retry button to re-run the mount effect. Paired with
  // forceRefetchRef so a retry still refetches even when the cached frame is
  // younger than STALE.short.
  const [retryNonce, setRetryNonce] = useState(0);
  const forceRefetchRef = useRef(false);

  // Credit / Debtors Store
  const creditSummary = useCreditStore((s) => s.summary);
  const creditSummaryError = useCreditStore((s) => s.summaryError);
  const recentCredits = useCreditStore((s) => s.credits);
  const fetchCreditSummary = useCreditStore((s) => s.fetchSummary);
  const fetchCredits = useCreditStore((s) => s.fetchCredits);

  // BVN reveal state (PIN-authenticated, in-memory session only)
  const [showPinModal, setShowPinModal] = useState(false);
  const [bvnRevealed, setBvnRevealed] = useState(false);
  const [fullBvn, setFullBvn] = useState<string | null>(null);
  const [revealingBvn, setRevealingBvn] = useState(false);

  const handleRevealBvn = async (stepUpToken: string) => {
    setRevealingBvn(true);
    try {
      const res = await api.post<{ success: boolean; data: { bvn: string } }>(
        '/auth/reveal-bvn',
        {
          stepUpToken,
        },
      );
      if (res.data.success && res.data.data?.bvn) {
        setFullBvn(res.data.data.bvn);
        setBvnRevealed(true);
        toast.success('BVN revealed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to reveal BVN');
    } finally {
      setRevealingBvn(false);
    }
  };

  const handleToggleBvn = () => {
    if (bvnRevealed) {
      setBvnRevealed(false);
    } else if (fullBvn) {
      setBvnRevealed(true);
    } else {
      setShowPinModal(true);
    }
  };

  // Subscribe to dashboard invalidation events

  const invalidationCounter = useDashboardEvents((s) => s.invalidationCounter);

  // Ref for debouncing refetch calls
  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Controller for the bundle load currently in flight. Aborting it is what
  // stops the previous business's responses from landing on this one — and
  // saves the bandwidth, which matters on metered mobile connections.
  const bundleAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;

    const bid = activeBusiness.id;

    // A retry must hit the network even if the cached frame is younger than
    // STALE.short. Consume the flag once, on this run only.
    const forced = forceRefetchRef.current;
    forceRefetchRef.current = false;

    const cached = dashboardCache.get(bid);
    const hasFresh = cached && isFresh(cached.fetchedAt, STALE.short);

    // Hydrate state from the cache for the new business id (covers business
    // switches where seed was for the previous active business).
    if (cached) {
      setDashboard(cached.data.dashboard);
      setRecentSales(cached.data.recentSales);
      setRecentExpenses(cached.data.recentExpenses);
      setRecentReports(cached.data.recentReports);
      setLoadErrors(cached.data.failedSections);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    // Skip the network if we just fetched — the user is likely tab-flipping.
    if (hasFresh && !forced) return;

    // Cold load: full skeleton. Warm-but-stale: keep showing data, just hint
    // with the refreshing pill.
    if (cached) setIsRefreshing(true);

    bundleAbortRef.current?.abort();
    const controller = new AbortController();
    bundleAbortRef.current = controller;
    const seq = ++bundleSeq;

    fetchCreditSummary(bid);
    fetchCredits(bid, { limit: 5 });

    fetchDashboardBundle(bid, activeBusiness.myPermissions, controller.signal)
      .then((bundle) => {
        // Drop the response if a newer load superseded it, or if the user
        // navigated to a different business while it was in flight. Writing it
        // anyway is how business A's figures used to overwrite business B's.
        if (seq !== bundleSeq) return;
        if (useBusinessStore.getState().activeBusiness?.id !== bid) return;

        dashboardCache.set(bid, { data: bundle, fetchedAt: Date.now() });
        setDashboard(bundle.dashboard);
        setRecentSales(bundle.recentSales);
        setRecentExpenses(bundle.recentExpenses);
        setRecentReports(bundle.recentReports);
        setLoadErrors(bundle.failedSections);
      })
      .catch((err) => {
        // fetchSection resolves rather than rejects, so this only fires on a
        // defect in the bundler itself. Never blank the screen for it.
        if (import.meta.env.DEV) {
          console.error('[Dashboard] bundle failed:', err);
        }
      })
      .finally(() => {
        if (seq !== bundleSeq) return;
        if (useBusinessStore.getState().activeBusiness?.id !== bid) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      controller.abort();
      if (bundleAbortRef.current === controller) bundleAbortRef.current = null;
    };
  }, [activeBusiness, retryNonce]);

  // Debounced refetch helper — prevents excessive API calls when multiple
  // mutations happen rapidly (e.g., bulk import, rapid manual entries).
  // Waits 500ms after the last invalidation before refetching.
  const debouncedRefetch = useCallback((bid: string) => {
    // Clear any pending refetch
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }

    // Schedule new refetch in 500ms
    refetchTimeoutRef.current = setTimeout(() => {
      // The user may have switched businesses inside the debounce window.
      // Refetching the old one would burn the request and raise a spinner for
      // data we are not going to display.
      const currentBiz = useBusinessStore.getState().activeBusiness;
      if (currentBiz?.id !== bid) return;

      if (import.meta.env.DEV) {
        console.log('[Dashboard] Refetching due to invalidation');
      }

      setIsRefreshing(true);

      bundleAbortRef.current?.abort();
      const controller = new AbortController();
      bundleAbortRef.current = controller;
      const seq = ++bundleSeq;

      fetchCreditSummary(bid);
      fetchCredits(bid, { limit: 5 });

      fetchDashboardBundle(bid, currentBiz.myPermissions, controller.signal)
        .then((bundle) => {
          if (seq !== bundleSeq) return;
          if (useBusinessStore.getState().activeBusiness?.id !== bid) return;

          dashboardCache.set(bid, { data: bundle, fetchedAt: Date.now() });
          setDashboard(bundle.dashboard);
          setRecentSales(bundle.recentSales);
          setRecentExpenses(bundle.recentExpenses);
          setRecentReports(bundle.recentReports);
          setLoadErrors(bundle.failedSections);
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.error('[Dashboard] Refetch failed:', err);
          }
          // Soft failure — keep showing cached data. fetchSection has already
          // recorded which sections failed, so loadErrors drives the banner.
        })
        .finally(() => {
          if (seq !== bundleSeq) return;
          setIsRefreshing(false);
        });
    }, 500);
  }, []);

  // Explicit user retry after a load failure. Forces the network even when the
  // cached frame is still fresh, but keeps that frame on screen meanwhile so
  // the page doesn't collapse back to a skeleton.
  const handleRetry = useCallback(() => {
    forceRefetchRef.current = true;
    setLoadErrors([]);
    setRetryNonce((n) => n + 1);
  }, []);

  // Refetch dashboard when invalidation counter changes (data mutations)
  useEffect(() => {
    if (!activeBusiness) return;
    if (invalidationCounter === 0) return; // Skip initial mount

    debouncedRefetch(activeBusiness.id);

    // Cleanup debounce timer on unmount
    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, [invalidationCounter, activeBusiness, debouncedRefetch]);

  // Everything that failed to load this round, across the bundle and the
  // receivables call. Empty means either everything loaded, or everything
  // loaded that this role is allowed to read.
  const failedLabels = useMemo(() => {
    const failed = new Set(loadErrors);
    if (creditSummaryError) failed.add('receivables');
    return Array.from(failed);
  }, [loadErrors, creditSummaryError]);

  // A section that failed but rendered zeros is the dangerous case: it reads
  // as "you owe nothing" to an SME deciding whether to file. These flags let
  // each block say "unknown" instead.
  const salesFailed = failedLabels.includes('recent sales');
  const expensesFailed = failedLabels.includes('recent expenses');
  const receivablesUnknown = creditSummary === null;

  // Wait for businesses to load first — don't show empty state before we know if any exist.
  if (businessStoreLoading) {
    return <DashboardSkeleton />;
  }

  // No active business means user has no businesses yet.
  if (!activeBusiness) {
    return (
      <div className='flex flex-col items-center justify-center py-32 animate-fade-in'>
        <div className='relative mb-8'>
          <div className='absolute inset-0 rounded-2xl bg-primary-200 blur-2xl opacity-40 animate-pulse-soft' />
          <div className='relative rounded-2xl bg-gradient-to-br from-primary-50 to-white p-8 border border-primary-100 shadow-sm animate-float'>
            <Plus className='h-10 w-10 text-primary-400' />
          </div>
        </div>
        <p className='text-xl font-bold text-gray-900'>Welcome to WallXERP</p>
        <p className='text-sm text-gray-400 mt-2 mb-8 text-center max-w-sm'>
          {isOwnerAccount
            ? 'Create your first business to start tracking sales, expenses, and tax compliance.'
            : 'You do not have any active business invitations yet. Please contact your organization administrator.'}
        </p>
        {isOwnerAccount && (
          <>
            <Button onClick={() => {
              if (blockIfNeeded()) return;
              setShowCreateBiz(true);
            }}>Get Started</Button>
            <CreateBusinessModal
              isOpen={showCreateBiz}
              onClose={() => setShowCreateBiz(false)}
            />
          </>
        )}
      </div>
    );
  }

  // Cold load only — no cached frame to show. Once we have any data (even
  // stale), we render it and let the refreshing pill communicate freshness.
  if (isLoading && !dashboard) {
    return <DashboardSkeleton />;
  }

  // The load finished and we have nothing at all to show. Rendering the normal
  // dashboard here would present every figure as a genuine zero, which for a
  // tax product is worse than an honest error.
  if (!dashboard && failedLabels.length > 0) {
    return (
      <div className='flex flex-col items-center justify-center py-24 animate-fade-in'>
        <div className='relative mb-6'>
          <div className='absolute inset-0 rounded-2xl bg-rose-200 blur-2xl opacity-40 animate-pulse-soft' />
          <div className='relative rounded-2xl bg-gradient-to-br from-rose-50 to-white p-8 border border-rose-100 shadow-sm'>
            <AlertCircle className='h-9 w-9 text-rose-400' />
          </div>
        </div>
        <p className='text-lg font-bold text-gray-900'>
          Couldn&apos;t load your dashboard
        </p>
        <p className='text-sm text-gray-500 mt-2 mb-8 text-center max-w-sm'>
          We couldn&apos;t reach {activeBusiness.businessName}&apos;s records
          {failedLabels.length > 0 ? ` (${failedLabels.join(', ')})` : ''}. Your
          figures haven&apos;t changed — this is a connection problem, not an
          empty account.
        </p>
        <div className='flex items-center gap-3'>
          <Button onClick={handleRetry} isLoading={isRefreshing} subscriptionExempt={true}>
            Try again
          </Button>
          <Link to='/sales'>
            <Button variant='secondary' subscriptionExempt={true}>Go to Sales</Button>
          </Link>
        </div>
      </div>
    );
  }

  const lt = dashboard?.lifetime;
  const currentMonth = dashboard?.currentMonth;
  const trends = dashboard?.trends || [];
  const health = getHealthScore(lt, dashboard?.unpaidCount ?? 0);

  const userName = resolveGreetingName(user, activeBusiness);
  const todBucket = getTimeBucket(new Date().getHours());

  // Calculate max sales for trend bar visualization
  const maxSales = Math.max(...trends.map((t) => Number(t.totalSales)), 1);

  // Profit margin calculation for the current month visual
  const currentSalesNum = Number(currentMonth?.totalSales ?? 0);
  const currentProfitNum = Number(currentMonth?.grossProfit ?? 0);
  const currentMargin =
    currentSalesNum > 0 ? (currentProfitNum / currentSalesNum) * 100 : 0;
  const isOperatingLoss = currentSalesNum > 0 && currentProfitNum < 0;
  const clampedVisualMargin = Math.max(0, Math.min(100, currentMargin));

  // Receivables figures. When the summary hasn't arrived — still in flight, or
  // the request failed — every one of these reads "unknown" rather than zero.
  // A genuine ₦0 outstanding is a real, reassuring fact; an unrendered one is
  // a lie, and this is a screen people make tax decisions from.
  const receivablesOutstanding = receivablesUnknown
    ? '—'
    : formatNaira(creditSummary?.totalOutstanding ?? 0);
  const receivablesOverdue = receivablesUnknown
    ? '—'
    : formatNaira(creditSummary?.overdueAmount ?? 0);
  const receivablesRecovered = receivablesUnknown
    ? '—'
    : formatNaira(creditSummary?.recoveredThisMonth ?? 0);
  const receivablesDebtors = receivablesUnknown
    ? '—'
    : String(creditSummary?.activeDebtors ?? 0);
  const hasOverdueReceivables =
    !receivablesUnknown && (creditSummary?.overdueAmount ?? 0) > 0;

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className='space-y-6 relative'>
      {/* DVA Diagnostics Panel - Only in development mode */}
      {/* {import.meta.env.DEV && <DVADiagnostics />} */}

      {/* Refreshing pill — shown while a background revalidation is in flight.
          Cached data is already on screen; this just hints at "we're checking
          for updates" so the user knows not to panic if a number ticks. */}
      {isRefreshing && (
        <div className='pointer-events-none fixed top-4 right-4 z-40 animate-fade-in'>
          <div className='flex items-center gap-2 rounded-full border border-primary-200/70 bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-sm'>
            <div className='h-3 w-3 rounded-full border-2 border-primary-200 border-t-primary-500 animate-spin' />
            <span className='text-[11px] font-medium text-primary-600'>
              Refreshing…
            </span>
          </div>
        </div>
      )}

      {/* Partial load failure — some sections came back empty. Say so, rather
          than letting the blank ones read as real zeros. */}
      {failedLabels.length > 0 && dashboard && (
        <div
          role='alert'
          className='animate-scale-in flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-200/70 bg-rose-50/70 px-4 py-3'
        >
          <div className='flex items-start gap-2.5 min-w-0'>
            <div className='flex h-6 w-6 items-center justify-center rounded-md bg-rose-100/80 shrink-0'>
              <AlertCircle className='h-3.5 w-3.5 text-rose-600' />
            </div>
            <div className='min-w-0'>
              <p className='text-xs font-semibold text-rose-900'>
                Couldn&apos;t load {failedLabels.join(', ')}
              </p>
              <p className='text-[11px] text-rose-700/90 mt-0.5'>
                Figures marked &ldquo;&mdash;&rdquo; are unknown, not zero.
                Retry before relying on this page for tax.
              </p>
            </div>
          </div>
          <Button
            size='sm'
            variant='secondary'
            subscriptionExempt={true}
            onClick={handleRetry}
            isLoading={isRefreshing}
            className='self-start sm:self-auto shrink-0'
          >
            Retry
          </Button>
        </div>
      )}

      {/* Pending Team Invitations Alert Banner */}
      {!!user?.pendingInvitationCount && user.pendingInvitationCount > 0 && (
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 shadow-xs animate-fade-in'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs shrink-0'>
              <Users className='h-5 w-5' />
            </div>
            <div>
              <p className='text-xs font-bold text-amber-900'>
                You have {user.pendingInvitationCount} pending team invitation
                {user.pendingInvitationCount > 1 ? 's' : ''}
              </p>
              <p className='text-[11px] text-amber-700 mt-0.5'>
                Another business has invited you to collaborate. Review and
                accept to join their team.
              </p>
            </div>
          </div>
          <Link
            to='/invite'
            className='inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 active:scale-[0.98] transition-all self-start sm:self-auto shrink-0 shadow-xs'
          >
            Review & Accept <ChevronRight className='h-3.5 w-3.5' />
          </Link>
        </div>
      )}

      {/* Tax Assessment Prompt Banner (NTA 2025) */}
      <Suspense fallback={null}>
        <TaxProfileMigrationBanner />
      </Suspense>

      {/* ── Welcome Header (Stunning Purple Gradient) ────── */}
      <div className='animate-slide-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 p-5 sm:p-6 text-white shadow-xl shadow-purple-950/20 border border-purple-800/40'>
        {/* Ambient background glow accents */}
        <div className='absolute -right-10 -top-10 h-44 w-44 rounded-full bg-purple-500/20 blur-3xl pointer-events-none' />
        <div className='absolute left-1/3 -bottom-10 h-36 w-36 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none' />

        <div className='relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          {/* Left: Identity & Info */}
          <div className='flex items-center gap-4 min-w-0'>
            {/* Business Logo or Time-of-day avatar */}
            <div className='relative shrink-0'>
              {activeBusiness.logoUrl ? (
                <div className='h-14 w-14 sm:h-16 sm:w-16 rounded-full overflow-hidden border-2 border-white/25 ring-2 ring-white/10 shadow-lg bg-white/10 flex items-center justify-center backdrop-blur-sm'>
                  <img
                    src={activeBusiness.logoUrl}
                    alt={`${activeBusiness.businessName} logo`}
                    className='h-full w-full object-cover'
                  />
                </div>
              ) : (
                <div className='h-14 w-14 sm:h-16 sm:w-16 rounded-full border border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-sm shadow-inner'>
                  <TimeOfDayIcon
                    bucket={todBucket}
                    className='h-8 w-8 sm:h-9 sm:w-9 text-purple-200'
                  />
                </div>
              )}
            </div>

            <div className='min-w-0'>
              <p className='text-xs font-medium text-purple-200/90 flex items-center gap-1.5'>
                <span>
                  {getGreetingLabel()}{userName ? `, ${userName}` : ''}
                </span>
              </p>
              <h1 className='mt-0.5 text-xl sm:text-2xl font-bold text-white tracking-tight truncate'>
                {activeBusiness.businessName}
              </h1>

              {/* Meta Chips Row: Merchant ID · BVN · Tax Health */}
              <div className='mt-2.5 flex flex-wrap items-center gap-2'>
                {/* Merchant ID chip */}
                <button
                  type='button'
                  onClick={() => {
                    navigator.clipboard.writeText(
                      formatMerchantId(activeBusiness.merchantId),
                    );
                    toast.success('Merchant ID copied');
                  }}
                  title='Click to copy Merchant ID'
                  className='group flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/20 transition-all'
                >
                  <BadgeCheck className='h-3.5 w-3.5 text-purple-200' />
                  <span className='font-mono font-medium tabular-nums text-white'>
                    {formatMerchantId(activeBusiness.merchantId)}
                  </span>
                  <Copy className='h-3 w-3 text-purple-200/70 opacity-60 group-hover:opacity-100 transition-opacity' />
                </button>

                {/* BVN display chip — owners only */}
                {isOwnerAccount &&
                  (user?.bvnVerifiedAt ? (
                    <button
                      type='button'
                      onClick={handleToggleBvn}
                      disabled={revealingBvn}
                      title={
                        bvnRevealed
                          ? 'Click to hide BVN'
                          : 'Click to reveal BVN (PIN required)'
                      }
                      className='group flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/20 transition-all cursor-pointer'
                    >
                      <Shield className='h-3.5 w-3.5 text-emerald-300' />
                      <span className='text-purple-200 text-[11px] font-medium'>
                        BVN:
                      </span>
                      <span className='font-mono font-medium tabular-nums text-white'>
                        {maskBvn(fullBvn, bvnRevealed)}
                      </span>
                      {bvnRevealed ? (
                        <EyeOff className='h-3 w-3 text-purple-200/70 group-hover:text-white transition-colors' />
                      ) : (
                        <Eye className='h-3 w-3 text-purple-200/70 group-hover:text-white transition-colors' />
                      )}
                    </button>
                  ) : (
                    <Link
                      to='/account'
                      className='flex items-center gap-1.5 rounded-full bg-amber-400/15 backdrop-blur-md border border-amber-300/30 px-3 py-1 text-xs text-amber-200 hover:bg-amber-400/25 transition-all'
                      title='Verify your identity'
                    >
                      <Shield className='h-3.5 w-3.5 text-amber-300' />
                      <span className='font-medium text-[11px]'>
                        BVN Unverified
                      </span>
                    </Link>
                  ))}

                {/* Tax Health chip */}
                <div className='flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1 text-xs text-white'>
                  <Heart className='h-3.5 w-3.5 text-pink-300' />
                  <span className='text-[11px] text-purple-200 font-medium'>
                    Tax Health:
                  </span>
                  <div className='w-14 h-1.5 rounded-full bg-white/20 overflow-hidden'>
                    <div
                      className={`h-full rounded-full ${health.bg} transition-all duration-1000`}
                      style={{ width: `${health.score}%` }}
                    />
                  </div>
                  <span className='font-bold text-white text-[11px] tabular-nums'>
                    {health.score}%
                  </span>
                </div>

                {/* Subscription Plan Badge */}
                <Link
                  to='/subscription'
                  className='flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/20 transition-all hover:scale-[1.02]'
                  title={`Current Plan: ${subStatus.planName} (${subStatus.formattedCountdown})`}
                >
                  <Crown className='h-3.5 w-3.5 text-amber-300' />
                  <span className='text-[11px] text-purple-200 font-medium'>Plan:</span>
                  <span className='font-bold text-white text-[11px]'>
                    {subStatus.planName}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      subStatus.isPaid
                        ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30'
                        : subStatus.isExpired
                          ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                          : 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                    }`}
                  >
                    {subStatus.formattedCountdown}
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className='flex items-center gap-2 self-start sm:self-auto shrink-0'>
            <Link to='/sales'>
              <button
                type='button'
                className='flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
              >
                <Plus className='h-3.5 w-3.5' /> Add Sale
              </button>
            </Link>
            <Link to='/debtors'>
              <button
                type='button'
                className='flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
              >
                <BookOpen className='h-3.5 w-3.5 text-purple-200' /> Debtors
              </button>
            </Link>
            <Link to='/tax'>
              <button
                type='button'
                className='flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-purple-950 hover:bg-purple-50 transition-all shadow-md hover:scale-[1.02] active:scale-[0.98]'
              >
                <FileText className='h-3.5 w-3.5 text-purple-700' /> Tax Reports
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Alert: Unpaid Reports (Compact) ───────── */}
      {(dashboard?.unpaidCount ?? 0) > 0 && (
        <div className='animate-scale-in flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/40 to-amber-50 border border-amber-200/50 px-4 py-2.5 hover:border-amber-300/80 transition-colors duration-200'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-6 w-6 items-center justify-center rounded-md bg-amber-100/80'>
              <AlertCircle className='h-3.5 w-3.5 text-amber-600' />
            </div>
            <p className='text-xs text-amber-800 font-medium'>
              <span className='font-bold'>{dashboard!.unpaidCount}</span> unpaid
              report{dashboard!.unpaidCount > 1 ? 's' : ''} awaiting payment
            </p>
          </div>
          <Link
            to='/tax'
            className='group text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 transition-colors'
          >
            Pay now{' '}
            <ArrowRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
          </Link>
        </div>
      )}

      {/* ── Alert: Overdue Debtors ─────────────────────────── */}
      {(creditSummary?.overdueAmount ?? 0) > 0 && (
        <div className='animate-scale-in flex items-center justify-between rounded-xl border border-rose-200/60 bg-rose-50/60 px-4 py-2.5 transition-colors duration-200'>
          <p className='text-xs text-rose-700 font-medium'>
            <span className='inline-block h-1.5 w-1.5 rounded-full bg-rose-500 mr-2 align-middle' />
            <span className='font-bold'>
              {formatNaira(creditSummary!.overdueAmount)}
            </span>{' '}
            in overdue receivables
          </p>
          <Link
            to='/debtors?status=overdue'
            className='group text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 transition-colors'
          >
            Review
            <ArrowRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
          </Link>
        </div>
      )}

      {/* ── Tax & Compliance Metrics ──────────────────────── */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 stagger-children'>
        <div className='rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium text-gray-500'>
              Total Tax Payable
            </span>
            <CircleDollarSign className='h-4 w-4 text-gray-400' />
          </div>
          <p className='mt-2 text-lg sm:text-xl font-bold text-gray-900 tabular-nums'>
            {formatNaira(lt?.totalTaxPayable ?? 0)}
          </p>
          <p className='mt-1 text-[11px] text-gray-400 font-body'>
            Across all filed periods
          </p>
        </div>

        <div className='rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium text-gray-500'>
              This Month's Tax
            </span>
            <Receipt className='h-4 w-4 text-gray-400' />
          </div>
          <p className='mt-2 text-lg sm:text-xl font-bold text-gray-900 tabular-nums'>
            {formatNaira(currentMonth?.taxPayable ?? 0)}
          </p>
          <div className='mt-1 flex items-center justify-between text-[11px]'>
            <span className='text-gray-400 font-body'>
              {currentMonth ? 'Current calculation' : 'Not calculated'}
            </span>
            <Link
              to='/tax'
              className='text-primary-600 font-semibold hover:text-primary-700'
            >
              View &rarr;
            </Link>
          </div>
        </div>

        <div className='rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium text-gray-500'>
              Reports Filed
            </span>
            <CheckCircle2 className='h-4 w-4 text-gray-400' />
          </div>
          <p className='mt-2 text-lg sm:text-xl font-bold text-gray-900 tabular-nums'>
            {String(lt?.reportsCount ?? 0)}
          </p>
          <p className='mt-1 text-[11px] text-gray-400 font-body'>
            NRS compliant reports
          </p>
        </div>

        <div className='rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium text-gray-500'>
              Tax Standard
            </span>
            <Shield className='h-4 w-4 text-gray-400' />
          </div>
          {taxPolicy && !taxPolicy.vat.chargeable ? (
            <>
              <p className='mt-2 text-base sm:text-lg font-bold text-emerald-700'>
                VAT Exempt
              </p>
              <p className='mt-1 text-[11px] text-gray-400 font-body'>
                VAT exempt — no monthly remittance
              </p>
            </>
          ) : (
            <>
              <p className='mt-2 text-lg sm:text-xl font-bold text-gray-900'>
                {dashboard?.taxConfig?.currentRate ?? (taxPolicy?.vat.rate ?? '')}%{' '}
                <span className='text-xs font-normal text-gray-500'>
                  Gross Profit
                </span>
              </p>
              <p className='mt-1 text-[11px] text-gray-400 font-body'>
                NRS VAT standard
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Receivables Overview ────────────────────────────── */}
      <div className='rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs hover:border-gray-300 transition-all duration-200'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0 shadow-xs'>
              <Wallet className='h-4 w-4' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='text-[13px] font-bold text-gray-900'>
                  Receivables & Debtors
                </h3>
                <span className='inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-100/80'>
                  {receivablesDebtors} active
                </span>
              </div>
              <p className='text-[11px] text-gray-400 mt-0.5'>
                Money owed to you by customers & credit accounts
              </p>
            </div>
          </div>
          <Link
            to='/debtors'
            className='group text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 bg-primary-50/60 hover:bg-primary-50 px-2.5 py-1 rounded-lg border border-primary-200/40 transition-all'
          >
            Manage Book
            <ArrowRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
          </Link>
        </div>

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {/* Outstanding */}
          <div className='rounded-xl bg-gray-50/70 p-3 border border-gray-100/80 hover:bg-gray-50 transition-colors'>
            <div className='flex items-center justify-between'>
              <span className='text-[10px] font-medium text-gray-500 uppercase tracking-wider'>
                Outstanding
              </span>
              <CircleDollarSign className='h-3.5 w-3.5 text-amber-600' />
            </div>
            <p className='mt-1 text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-none'>
              {receivablesOutstanding}
            </p>
            <span className='text-[10px] text-gray-400 block mt-1'>
              Unpaid balance
            </span>
          </div>

          {/* Overdue */}
          <div
            className={`rounded-xl p-3 border transition-colors ${
              hasOverdueReceivables
                ? 'bg-rose-50/50 border-rose-200/70'
                : 'bg-gray-50/70 border-gray-100/80'
            }`}
          >
            <div className='flex items-center justify-between'>
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  hasOverdueReceivables ? 'text-rose-700' : 'text-gray-500'
                }`}
              >
                Overdue
              </span>
              <Clock
                className={`h-3.5 w-3.5 ${hasOverdueReceivables ? 'text-rose-600' : 'text-gray-400'}`}
              />
            </div>
            <p
              className={`mt-1 text-base sm:text-lg font-bold tabular-nums leading-none ${
                hasOverdueReceivables ? 'text-rose-600' : 'text-gray-900'
              }`}
            >
              {receivablesOverdue}
            </p>
            <span
              className={`text-[10px] block mt-1 ${
                hasOverdueReceivables
                  ? 'text-rose-600 font-medium'
                  : 'text-gray-400'
              }`}
            >
              {receivablesUnknown
                ? 'Could not load'
                : hasOverdueReceivables
                  ? 'Needs urgent collection'
                  : 'None overdue'}
            </span>
          </div>

          {/* Recovered This Month */}
          <div className='rounded-xl bg-emerald-50/40 p-3 border border-emerald-100/70 hover:bg-emerald-50/60 transition-colors'>
            <div className='flex items-center justify-between'>
              <span className='text-[10px] font-medium text-emerald-800 uppercase tracking-wider'>
                Recovered (Month)
              </span>
              <TrendingUp className='h-3.5 w-3.5 text-emerald-600' />
            </div>
            <p className='mt-1 text-base sm:text-lg font-bold text-emerald-600 tabular-nums leading-none'>
              {receivablesRecovered}
            </p>
            <span className='text-[10px] text-emerald-700/80 block mt-1'>
              Tax recognized
            </span>
          </div>

          {/* Active Debtors */}
          <div className='rounded-xl bg-indigo-50/40 p-3 border border-indigo-100/70 hover:bg-indigo-50/60 transition-colors'>
            <div className='flex items-center justify-between'>
              <span className='text-[10px] font-medium text-indigo-800 uppercase tracking-wider'>
                Debtors
              </span>
              <Users className='h-3.5 w-3.5 text-indigo-600' />
            </div>
            <p className='mt-1 text-base sm:text-lg font-bold text-indigo-900 tabular-nums leading-none'>
              {receivablesDebtors}
            </p>
            <span className='text-[10px] text-indigo-700/80 block mt-1'>
              Total owing customers
            </span>
          </div>
        </div>
      </div>

      {/* ── Financial Overview & Cashflow Trends ─────── */}
      {/* Local Suspense on purpose: the boundary above this is App.tsx's,
          whose fallback is a full-screen loader. The chart is the most
          expensive thing on the page, so it gets a height-matched placeholder
          and lets the rest of the dashboard paint first. */}
      <Suspense fallback={<SalesExpenseChartSkeleton />}>
        <SalesExpenseChart className='stagger-children' />
      </Suspense>

      {/* ── Current Month + Trends ──────────────────── */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-5 stagger-children'>
        {/* Current Month */}
        <div className='lg:col-span-2 rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden'>
          <div className='flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white border-b border-purple-800/40'>
            <div className='flex items-center gap-2'>
              <div className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse-soft shadow-xs shadow-emerald-400/50' />
              <h2 className='text-sm font-semibold text-white tracking-wide'>
                {t('kpis.this_month')}
              </h2>
            </div>
            {currentMonth && statusDot(currentMonth.paymentStatus, true)}
          </div>
          {currentMonth ? (
            <div className='px-5 py-4 space-y-3'>
              {/* Profit margin circular gauge */}
              <div className='flex flex-col items-center justify-center pt-1 pb-1'>
                <div className='relative h-24 w-24'>
                  <svg className='h-24 w-24 -rotate-90' viewBox='0 0 96 96'>
                    <defs>
                      <linearGradient
                        id='marginRingGrad'
                        x1='0%'
                        y1='0%'
                        x2='100%'
                        y2='100%'
                      >
                        <stop
                          offset='0%'
                          stopColor={
                            isOperatingLoss
                              ? '#f43f5e'
                              : currentMargin >= 20
                                ? '#10b981'
                                : '#f59e0b'
                          }
                        />
                        <stop
                          offset='100%'
                          stopColor={
                            isOperatingLoss
                              ? '#e11d48'
                              : currentMargin >= 20
                                ? '#059669'
                                : '#d97706'
                          }
                        />
                      </linearGradient>
                    </defs>
                    {/* Background Track */}
                    <circle
                      cx='48'
                      cy='48'
                      r='40'
                      fill='none'
                      stroke='#f1f5f9'
                      strokeWidth='7'
                    />
                    {/* Active Progress Arc */}
                    {clampedVisualMargin > 0 && (
                      <circle
                        cx='48'
                        cy='48'
                        r='40'
                        fill='none'
                        stroke='url(#marginRingGrad)'
                        strokeWidth='7'
                        strokeLinecap='round'
                        strokeDasharray='251.33'
                        strokeDashoffset={
                          251.33 - (clampedVisualMargin / 100) * 251.33
                        }
                        className='transition-all duration-1000 ease-out'
                      />
                    )}
                  </svg>
                  {/* Perfectly centered text overlay */}
                  <div className='absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none'>
                    <span
                      className={`text-xl font-black tabular-nums leading-none tracking-tight ${
                        isOperatingLoss ? 'text-rose-600' : 'text-gray-900'
                      }`}
                    >
                      {currentSalesNum > 0
                        ? `${currentMargin.toFixed(0)}%`
                        : '0%'}
                    </span>
                    <span className='text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1.5 leading-none'>
                      Margin
                    </span>
                  </div>
                </div>

                {/* Status benchmark pill */}
                <div className='mt-2.5 flex items-center justify-center'>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      currentSalesNum === 0
                        ? 'bg-gray-50 text-gray-500 border-gray-200'
                        : isOperatingLoss
                          ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                          : currentMargin >= 20
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                            : 'bg-amber-50 text-amber-700 border-amber-200/80'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        currentSalesNum === 0
                          ? 'bg-gray-400'
                          : isOperatingLoss
                            ? 'bg-rose-500'
                            : currentMargin >= 20
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                      }`}
                    />
                    {currentSalesNum === 0
                      ? 'No sales recorded'
                      : isOperatingLoss
                        ? 'Operating Loss'
                        : currentMargin >= 20
                          ? 'Healthy Margin (≥20%)'
                          : 'Below Target (<20%)'}
                  </span>
                </div>
              </div>

              <div className='space-y-2 border-t border-gray-100 pt-3'>
                <MetricRow
                  label='Sales'
                  value={formatNaira(Number(currentMonth.totalSales))}
                  icon={
                    <ArrowUpRight className='h-3.5 w-3.5 text-emerald-500' />
                  }
                />
                <MetricRow
                  label='Expenses'
                  value={formatNaira(Number(currentMonth.totalExpenses))}
                  icon={
                    <ArrowDownRight className='h-3.5 w-3.5 text-amber-500' />
                  }
                />
                <MetricRow
                  label={t('kpis.gross_profit')}
                  value={formatNaira(Number(currentMonth.grossProfit))}
                  icon={<TrendingUp className='h-3.5 w-3.5 text-indigo-500' />}
                />
              </div>

              <div className='border-t border-gray-100 pt-3'>
                <MetricRow
                  label={
                    (dashboard?.taxConfig?.vatChargeable ??
                      (taxPolicy ? taxPolicy.vat.chargeable : undefined)) ===
                    false
                      ? 'Monthly remittance (VAT-exempt)'
                      : `Net VAT @ ${Number(currentMonth.taxRate)}%`
                  }
                  value={formatNaira(Number(currentMonth.taxPayable))}
                  icon={
                    <CircleDollarSign className='h-3.5 w-3.5 text-rose-500' />
                  }
                  bold
                />
              </div>

              <div className='flex flex-wrap items-center gap-2 pt-2'>
                {currentMonth.isFinalized ? (
                  <span className='inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-0.5 border border-emerald-100'>
                    <CheckCircle2 className='h-3 w-3' /> Finalized
                  </span>
                ) : (
                  <span className='inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-gray-50 rounded-full px-2.5 py-0.5 border border-gray-200'>
                    <Clock className='h-3 w-3' /> Draft
                  </span>
                )}
                {currentMonth.isLocked && (
                  <span className='inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 bg-blue-50 rounded-full px-2.5 py-0.5 border border-blue-100'>
                    <CreditCard className='h-3 w-3' /> Paid
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className='px-5 py-8 text-center'>
              <FileText className='mx-auto h-6 w-6 text-gray-300' />
              <p className='mt-2 text-sm font-medium text-gray-600'>
                No report for this month yet
              </p>
              <p className='text-xs text-gray-400 mt-1 font-body'>
                Calculate your tax to see live metrics here
              </p>
              <Link to='/tax' className='mt-4 inline-block'>
                <Button
                  size='sm'
                  variant='secondary'
                  subscriptionExempt={true}
                  className='text-xs rounded-lg'
                >
                  Calculate Tax
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Monthly Trends */}
        <div className='lg:col-span-3 rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden flex flex-col justify-start'>
          <div className='flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white border-b border-purple-800/40'>
            <div className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4 text-purple-200 stroke-[2]' />
              <h2 className='text-sm font-semibold text-white tracking-wide'>
                Monthly Trends
              </h2>
            </div>
            <span className='text-[11px] font-medium text-purple-200 bg-white/10 rounded-full px-2.5 py-0.5 border border-white/15 hidden sm:inline-flex backdrop-blur-xs'>
              Last 6 months
            </span>
          </div>
          {trends.length > 0 ? (
            <div className='px-5 py-3.5 overflow-x-auto w-full'>
              <div className='min-w-[500px]'>
                <table className='w-full'>
                  <thead>
                    <tr className='text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2.5'>
                      <th className='pb-2.5 text-left font-bold'>Month</th>
                      <th
                        className='pb-2.5 text-left pl-3 font-bold'
                        style={{ width: '32%' }}
                      >
                        Sales Volume
                      </th>
                      <th className='pb-2.5 text-right font-bold'>
                        Tax Payable
                      </th>
                      <th className='pb-2.5 text-right font-bold'>Margin</th>
                      <th className='pb-2.5 text-right font-bold'>Status</th>
                    </tr>
                  </thead>
                  <tbody className='text-xs divide-y divide-gray-50'>
                    {trends
                      .slice()
                      .reverse()
                      .map((t) => {
                        const barWidth = Math.max(
                          (Number(t.totalSales) / maxSales) * 100,
                          4,
                        );
                        const marginNum = Number(t.profitMargin ?? 0);
                        return (
                          <tr
                            key={t.taxMonth}
                            className='group hover:bg-purple-50/25 transition-colors'
                          >
                            <td className='py-3 text-gray-900 font-semibold whitespace-nowrap'>
                              {formatMonth(t.taxMonth)}
                            </td>
                            <td className='py-3 pl-3'>
                              <div className='flex items-center gap-2.5'>
                                <div className='flex-1 h-2 rounded-full bg-gray-100 overflow-hidden'>
                                  <div
                                    className='h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-xs'
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className='text-gray-700 font-medium tabular-nums text-[12px] shrink-0'>
                                  {formatNaira(Number(t.totalSales))}
                                </span>
                              </div>
                            </td>
                            <td className='py-3 text-right text-gray-700 font-medium tabular-nums text-[12px]'>
                              {formatNaira(Number(t.taxPayable))}
                            </td>
                            <td className='py-3 text-right'>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums border ${
                                  marginNum >= 20
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                    : marginNum > 0
                                      ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                                      : 'bg-rose-50 text-rose-700 border-rose-200/80'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    marginNum >= 20
                                      ? 'bg-emerald-500'
                                      : marginNum > 0
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                  }`}
                                />
                                {marginNum.toFixed(1)}%
                              </span>
                            </td>
                            <td className='py-3 text-right whitespace-nowrap'>
                              {statusDot(t.paymentStatus)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className='px-5 py-8 text-center'>
              <Activity className='mx-auto h-6 w-6 text-gray-300' />
              <p className='mt-2 text-sm font-medium text-gray-600'>
                No trend data yet
              </p>
              <p className='text-xs text-gray-400 mt-1 font-body'>
                Your monthly overview will appear here
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Sales + Expenses ─────────────────── */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2 stagger-children'>
        {/* Recent Sales */}
        <div className='rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden flex flex-col justify-start'>
          <div className='flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white border-b border-purple-800/40'>
            <div className='flex items-center gap-2'>
              <Receipt className='h-4 w-4 text-purple-200 stroke-[2]' />
              <h2 className='text-sm font-semibold text-white tracking-wide'>
                Recent Sales
              </h2>
            </div>
            <Link
              to='/sales'
              className='group text-xs font-semibold text-purple-200 hover:text-white flex items-center gap-1.5 transition-colors'
            >
              View all{' '}
              <ArrowRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1' />
            </Link>
          </div>
          {recentSales.length > 0 ? (
            <div className='px-5 py-3 space-y-1 divide-y divide-gray-50 w-full'>
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className='flex items-center justify-between py-2.5 hover:bg-emerald-50/30 -mx-2.5 px-2.5 rounded-xl transition-all duration-200 group'
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <div className='flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100/80 text-emerald-600 shrink-0 shadow-xs group-hover:scale-105 group-hover:bg-emerald-100/70 transition-all duration-200'>
                      <ArrowUpRight className='h-3.5 w-3.5' strokeWidth={2} />
                    </div>
                    <div className='min-w-0'>
                      <p className='text-xs sm:text-[13px] font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors'>
                        {sale.description || sale.source.replace(/_/g, ' ')}
                      </p>
                      <p className='text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5'>
                        <span className='capitalize font-medium text-gray-600'>
                          {sale.source.replace(/_/g, ' ')}
                        </span>
                        <span className='h-1 w-1 rounded-full bg-gray-300' />
                        <span>{formatDate(sale.transactionDate)}</span>
                      </p>
                    </div>
                  </div>
                  <div className='text-right shrink-0 ml-3'>
                    <p className='text-xs sm:text-sm font-bold text-emerald-600 tabular-nums'>
                      +{formatNaira(Number(sale.amount))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : salesFailed ? (
            <div className='px-5 py-8'>
              <LoadFailureMini label='Recent sales' onRetry={handleRetry} />
            </div>
          ) : (
            <div className='px-5 py-8'>
              <EmptyMini
                icon={Receipt}
                message='No sales recorded yet'
                subMessage='Start tracking your income'
                linkTo='/sales'
                linkLabel='Add Sale'
              />
            </div>
          )}
        </div>

        {/* Recent Expenses */}
        <div className='rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden flex flex-col justify-start'>
          <div className='flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white border-b border-purple-800/40'>
            <div className='flex items-center gap-2'>
              <Wallet className='h-4 w-4 text-purple-200 stroke-[2]' />
              <h2 className='text-sm font-semibold text-white tracking-wide'>
                Recent Expenses
              </h2>
            </div>
            <Link
              to='/expenses'
              className='group text-xs font-semibold text-purple-200 hover:text-white flex items-center gap-1.5 transition-colors'
            >
              View all{' '}
              <ArrowRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1' />
            </Link>
          </div>
          {recentExpenses.length > 0 ? (
            <div className='px-5 py-3 space-y-1 divide-y divide-gray-50 w-full'>
              {recentExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className='flex items-center justify-between py-2.5 hover:bg-rose-50/30 -mx-2.5 px-2.5 rounded-xl transition-all duration-200 group'
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <div className='flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 border border-rose-100/80 text-rose-600 shrink-0 shadow-xs group-hover:scale-105 group-hover:bg-rose-100/70 transition-all duration-200'>
                      <ArrowDownRight className='h-3.5 w-3.5' strokeWidth={2} />
                    </div>
                    <div className='min-w-0'>
                      <p className='text-xs sm:text-[13px] font-semibold text-gray-900 truncate group-hover:text-rose-700 transition-colors'>
                        {exp.description || exp.category.replace(/_/g, ' ')}
                      </p>
                      <p className='text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5'>
                        <span className='capitalize font-medium text-gray-600'>
                          {exp.category.replace(/_/g, ' ')}
                        </span>
                        <span className='h-1 w-1 rounded-full bg-gray-300' />
                        <span>{formatDate(exp.expenseDate)}</span>
                      </p>
                    </div>
                  </div>
                  <div className='text-right shrink-0 ml-3'>
                    <p className='text-xs sm:text-sm font-bold text-rose-600 tabular-nums'>
                      -{formatNaira(Number(exp.amount))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : expensesFailed ? (
            <div className='px-5 py-8'>
              <LoadFailureMini label='Recent expenses' onRetry={handleRetry} />
            </div>
          ) : (
            <div className='px-5 py-8'>
              <EmptyMini
                icon={Wallet}
                message='No expenses recorded yet'
                subMessage='Track your business spending'
                linkTo='/expenses'
                linkLabel='Add Expense'
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Debtors ─────────────────────────────────── */}
      <div className='rounded-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden'>
        <div className='flex items-center justify-between px-5 py-3.5 border-b border-gray-100'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100/80 shrink-0'>
              <Users className='h-3.5 w-3.5' />
            </div>
            <div>
              <h2 className='text-[13px] font-semibold text-gray-900'>
                Recent Debtors
              </h2>
            </div>
          </div>
          <Link
            to='/debtors'
            className='group text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors'
          >
            View all debtors
            <ArrowRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
          </Link>
        </div>
        {recentCredits.length > 0 ? (
          <div className='divide-y divide-gray-50'>
            {recentCredits.slice(0, 5).map((credit) => {
              const dueStatus = getCreditDueStatus(
                credit.dueDate,
                credit.status,
              );
              const initials =
                credit.customerName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0].toUpperCase())
                  .join('') || 'C';

              return (
                <Link
                  key={credit.id}
                  to='/debtors'
                  className='flex items-center justify-between px-5 py-3 hover:bg-gray-50/70 transition-colors group'
                >
                  <div className='flex items-center gap-3 min-w-0'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/60 shrink-0 group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 transition-colors'>
                      {initials}
                    </div>
                    <div className='min-w-0'>
                      <p className='text-[13px] font-semibold text-gray-900 truncate group-hover:text-primary-700 transition-colors'>
                        {credit.customerName}
                      </p>
                      <div className='flex items-center gap-1.5 mt-0.5'>
                        {credit.customerPhone && (
                          <span className='text-[11px] text-gray-400'>
                            {credit.customerPhone}
                          </span>
                        )}
                        {credit.customerPhone && (
                          <span className='h-0.5 w-0.5 rounded-full bg-gray-300' />
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded border ${dueStatus.color}`}
                        >
                          <Clock className='h-2.5 w-2.5' />
                          {dueStatus.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className='text-right shrink-0 ml-4'>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        credit.status === 'paid'
                          ? 'text-gray-400 line-through'
                          : credit.status === 'overdue'
                            ? 'text-rose-600'
                            : 'text-gray-900'
                      }`}
                    >
                      {formatNaira(Number(credit.balance))}
                    </p>
                    <span className='text-[10px] text-gray-400'>
                      {credit.status === 'paid' ? 'Settled' : 'Balance'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className='px-5 py-8'>
            <EmptyMini
              icon={BookOpen}
              message='No debtors yet'
              subMessage='Customer credit and outstanding balances appear here'
              linkTo='/debtors'
              linkLabel='Go to Debtors'
            />
          </div>
        )}
      </div>

      {/* ── Recent Tax Reports ──────────────────────── */}
      {recentReports.length > 0 && (
        <div className='rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all duration-200 overflow-hidden'>
          <div className='flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white border-b border-purple-800/40'>
            <div className='flex items-center gap-2'>
              <FileText className='h-4 w-4 text-purple-200 stroke-[2]' />
              <h2 className='text-sm font-semibold text-white tracking-wide'>
                Recent Reports
              </h2>
            </div>
            <Link
              to='/tax'
              className='group text-xs font-semibold text-purple-200 hover:text-white flex items-center gap-1.5 transition-colors'
            >
              View all{' '}
              <ArrowRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1' />
            </Link>
          </div>
          <div className='px-5 py-4 overflow-x-auto'>
            <div className='min-w-[520px]'>
              <table className='w-full'>
                <thead>
                  <tr className='text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2.5'>
                    <th className='pb-2.5 text-left font-bold'>Period</th>
                    <th className='pb-2.5 text-right font-bold'>Sales</th>
                    <th className='pb-2.5 text-right font-bold'>Expenses</th>
                    <th className='pb-2.5 text-right font-bold'>Tax Payable</th>
                    <th className='pb-2.5 text-right font-bold'>Status</th>
                    <th className='pb-2.5 text-right font-bold'>Action</th>
                  </tr>
                </thead>
                <tbody className='text-xs divide-y divide-gray-50'>
                  {recentReports.map((report) => (
                    <tr
                      key={report.id}
                      className='group hover:bg-purple-50/25 transition-colors'
                    >
                      <td className='py-3 text-gray-900 font-semibold'>
                        <div className='flex items-center gap-2'>
                          <span>{formatMonth(report.taxMonth)}</span>
                          {report.isFinalized && (
                            <span
                              title='Finalized report'
                              className='inline-flex'
                            >
                              <CheckCircle2 className='h-3.5 w-3.5 text-emerald-500' />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className='py-3 text-right text-gray-700 font-medium tabular-nums text-[12px]'>
                        {formatNaira(Number(report.totalSales))}
                      </td>
                      <td className='py-3 text-right text-gray-500 tabular-nums text-[12px]'>
                        {formatNaira(Number(report.totalExpenses))}
                      </td>
                      <td className='py-3 text-right font-bold text-gray-900 tabular-nums text-[12px]'>
                        {formatNaira(Number(report.taxPayable))}
                      </td>
                      <td className='py-3 text-right whitespace-nowrap'>
                        {statusDot(report.paymentStatus)}
                      </td>
                      <td className='py-3 text-right whitespace-nowrap'>
                        <Link
                          to={`/tax?highlight=${report.id}`}
                          className='inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline px-2 py-0.5 rounded-md hover:bg-primary-50 transition-colors'
                        >
                          View &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────── */}
      {dashboard?.taxConfig && (
        <div className='flex items-center justify-center gap-3 py-3'>
          <div className='h-px flex-1 bg-gray-100' />
          <div className='flex items-center gap-1.5 text-gray-400'>
            <Zap className='h-3 w-3 text-gray-300' />
            <p className='text-[11px] font-medium whitespace-nowrap'>
              {dashboard.taxConfig.authority} ·{' '}
              {(dashboard.taxConfig.vatExempt ?? (taxPolicy ? !taxPolicy.vat.chargeable : false))
                ? '0% (Exempt)'
                : `${dashboard.taxConfig.currentRate}%`}{' '}
              ·{' '}
              {dashboard.taxConfig.currency}
            </p>
          </div>
          <div className='h-px flex-1 bg-gray-100' />
        </div>
      )}

      {/* ── BVN Reveal PIN Modal ───────────────────────── */}
      <PinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={handleRevealBvn}
        title='Reveal BVN'
        subtitle='Enter your 4-digit transaction PIN to view your full BVN.'
      />

      {showPaywall ? (
        <PendingActivationModal isOpen requestedPlan={paywallPendingPlan!} />
      ) : (
        <FreeWelcomeModal
          isOpen={showFreeWelcomeModal}
          onClose={() => setShowFreeWelcomeModal(false)}
          businessName={activeBusiness?.businessName}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

/**
 * Placeholder for the lazily-loaded chart. Mirrors the real card's header,
 * KPI strip and chart height so nothing on the page jumps when Recharts lands.
 */
function SalesExpenseChartSkeleton() {
  return (
    <div className='overflow-hidden rounded-t-none rounded-b-xl border border-gray-200/80 bg-white shadow-xs'>
      <div className='flex items-center gap-2 border-b border-purple-800/40 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 px-4 py-3'>
        <div className='h-4 w-4 rounded bg-white/20' />
        <div className='h-3 w-44 rounded bg-white/20' />
      </div>
      <div className='grid grid-cols-2 gap-3 border-b border-gray-100 px-4 py-4 sm:grid-cols-4'>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className='space-y-2'>
            <div className='h-2.5 w-20 animate-pulse rounded bg-gray-100' />
            <div className='h-5 w-24 animate-pulse rounded bg-gray-100' />
            <div className='h-2 w-14 animate-pulse rounded bg-gray-50' />
          </div>
        ))}
      </div>
      <div className='flex h-[21.5rem] items-center justify-center'>
        <RefreshCw className='h-5 w-5 animate-spin text-gray-300' />
      </div>
    </div>
  );
}

/**
 * Shown in place of EmptyMini when a section's request failed. The distinction
 * matters: "no sales recorded yet" invites the user to start recording, while
 * "couldn't load" is a connection problem — telling them the wrong one sends
 * them off doing work that is already done.
 */
function LoadFailureMini({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className='rounded-xl bg-rose-50/40 py-8 text-center border border-rose-100/70'>
      <AlertCircle className='mx-auto h-7 w-7 text-rose-300' />
      <p className='mt-3 text-sm text-rose-700 font-medium'>
        {label} couldn&apos;t be loaded
      </p>
      <p className='text-[11px] text-rose-500/80 mt-1'>
        This is a connection problem, not an empty list.
      </p>
      <button
        type='button'
        onClick={onRetry}
        className='mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100'
      >
        <RefreshCw className='h-3 w-3' />
        Retry
      </button>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon,
  bold,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-2.5'>
        <span className='transition-transform duration-200 group-hover:scale-110'>
          {icon}
        </span>
        <span className='text-[13px] text-gray-500'>{label}</span>
      </div>
      <span
        className={`text-[13px] tabular-nums ${bold ? 'font-bold text-gray-900 text-[14px]' : 'font-medium text-gray-600'}`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyMini({
  icon: Icon,
  message,
  subMessage,
  linkTo,
  linkLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
  subMessage?: string;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <div className='rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 py-8 text-center border border-gray-100/50'>
      <Icon className='mx-auto h-7 w-7 text-gray-300 animate-float' />
      <p className='mt-3 text-sm text-gray-400'>{message}</p>
      {subMessage && (
        <p className='text-[11px] text-gray-300 mt-1'>{subMessage}</p>
      )}
      <Link to={linkTo} className='mt-3 inline-block'>
        <Button
          size='sm'
          variant='secondary'
          subscriptionExempt={true}
          className='text-[13px] rounded-lg'
        >
          {linkLabel}
        </Button>
      </Link>
    </div>
  );
}
