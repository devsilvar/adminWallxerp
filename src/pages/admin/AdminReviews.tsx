import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search, Star, X } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import SegmentedControl from './shared/SegmentedControl';
import StatusPill from './shared/StatusPill';
import { formatStamp } from './shared/format';
import type { Pagination } from '@/types/index.ts';

type SentimentFilter = 'all' | 'positive' | 'neutral' | 'negative';
type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';

interface ReviewRow {
  id: string;
  rating: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  tags: string[];
  comment: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
  user?: { id: string; email: string; fullName: string | null; subscriptionTier: string | null } | null;
  business?: { id: string; businessName: string } | null;
}

interface Analytics {
  totalCount: number;
  averageRating: number;
  ratingDistribution: Record<string, number>;
  topTags: Array<{ tag: string; count: number }>;
}

const SENTIMENT_OPTIONS: ReadonlyArray<{ value: SentimentFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

const RATING_OPTIONS: ReadonlyArray<{ value: RatingFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: '5', label: '5★' },
  { value: '4', label: '4★' },
  { value: '3', label: '3★' },
  { value: '2', label: '2★' },
  { value: '1', label: '1★' },
];

function sentimentTone(s: string) {
  if (s === 'positive') return 'success' as const;
  if (s === 'negative') return 'danger' as const;
  return 'neutral' as const;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [rating, setRating] = useState<RatingFilter>('all');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const params: Record<string, unknown> = { page, limit: 20 };
    if (search) params.search = search;
    if (sentiment !== 'all') params.sentiment = sentiment;
    if (rating !== 'all') params.rating = Number(rating);
    api
      .get('/admin/reviews', { params })
      .then((r) => {
        setReviews(r.data.data ?? []);
        setPagination(r.data.pagination ?? null);
        if (r.data.analytics) setAnalytics(r.data.analytics);
      })
      .catch((err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to load reviews'))
      .finally(() => setHasLoadedOnce(true));
  }, [page, search, sentiment, rating]);

  const distribution = useMemo(() => {
    if (!analytics) return null;
    const max = Math.max(...Object.values(analytics.ratingDistribution), 1);
    return { max, entries: [5, 4, 3, 2, 1].map((n) => ({ n, count: analytics.ratingDistribution[String(n)] ?? analytics.ratingDistribution[n as unknown as string] ?? 0 })) };
  }, [analytics]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Reviews & Feedback"
        hint="Ratings, sentiment and tags submitted via the in-app review prompt."
        actions={
          pagination && (
            <span className="text-[11px] text-ink-muted">
              {pagination.total} {pagination.total === 1 ? 'review' : 'reviews'} total
              {analytics ? ` · avg ${analytics.averageRating.toFixed(2)}★` : ''}
            </span>
          )
        }
      />

      {analytics && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Panel className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Average rating</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">{analytics.averageRating.toFixed(2)}</span>
              <Stars rating={Math.round(analytics.averageRating)} />
              <span className="text-xs text-ink-muted">/ 5 · {analytics.totalCount} reviews</span>
            </div>
          </Panel>
          <Panel className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Rating distribution</p>
            <div className="mt-2 space-y-1">
              {distribution?.entries.map(({ n, count }) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-6 tabular-nums text-ink-muted">{n}★</span>
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${(count / (distribution?.max || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums text-ink-muted">{count}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Top tags</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analytics.topTags.length === 0 ? (
                <span className="text-xs text-ink-muted">No tags yet</span>
              ) : (
                analytics.topTags.slice(0, 8).map(({ tag, count }) => (
                  <span key={tag} className="rounded-full border border-hairline bg-panel-subtle px-2 py-0.5 text-xs text-ink">
                    {tag} <span className="text-ink-muted">×{count}</span>
                  </span>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}

      <Panel className="px-3 py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search name, email, comment…"
                aria-label="Search reviews"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-8 w-full rounded border border-hairline-strong bg-panel pl-8 pr-8 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <SegmentedControl
              label="Sentiment"
              value={sentiment}
              onChange={(v) => { setSentiment(v as SentimentFilter); setPage(1); }}
              options={SENTIMENT_OPTIONS as any}
            />
          </div>
          <SegmentedControl
            label="Rating"
            value={rating}
            onChange={(v) => { setRating(v as RatingFilter); setPage(1); }}
            options={RATING_OPTIONS as any}
          />
        </div>
      </Panel>

      {!hasLoadedOnce ? (
        <TableSkeleton rows={8} columns={5} />
      ) : reviews.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={MessageSquare}
            title="No reviews found"
            hint={search || sentiment !== 'all' || rating !== 'all' ? 'No reviews match those filters.' : 'No one has left a review yet.'}
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-1.5">User</th>
                  <th scope="col" className="px-3 py-1.5">Rating</th>
                  <th scope="col" className="px-3 py-1.5">Sentiment</th>
                  <th scope="col" className="px-3 py-1.5">Comment</th>
                  <th scope="col" className="px-3 py-1.5">Business</th>
                  <th scope="col" className="px-3 py-1.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {reviews.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-panel-subtle">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink truncate max-w-[160px]">{r.userName || r.user?.fullName || '—'}</div>
                      <div className="truncate max-w-[160px] text-[11px] text-ink-muted">{r.userEmail || r.user?.email || '—'}</div>
                      {r.user?.subscriptionTier && (
                        <span className="mt-0.5 inline-block rounded border border-hairline bg-panel px-1 py-0 text-[10px] uppercase tracking-wider text-ink-subtle">
                          {r.user.subscriptionTier}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Stars rating={r.rating} />
                      <span className="ml-1 tabular-nums text-ink-muted">{r.rating}</span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={sentimentTone(r.sentiment)}>{r.sentiment}</StatusPill>
                    </td>
                    <td className="max-w-[280px] px-3 py-2">
                      <p className="line-clamp-2 text-ink">{r.comment || <span className="text-ink-muted">—</span>}</p>
                      {r.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-ink-muted">{t}</span>
                          ))}
                          {r.tags.length > 4 && <span className="text-[10px] text-ink-subtle">+{r.tags.length - 4}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-muted truncate max-w-[140px]">{r.business?.businessName || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-ink-muted">{formatStamp(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && <PaginationBar pagination={pagination} onPageChange={setPage} noun="reviews" />}
        </Panel>
      )}
    </div>
  );
}
