import { useEffect } from 'react';
import { 
  BadgeCheck, 
  MapPin, 
  Package, 
  Clock,
  ArrowRight,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import type { Product } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { API_BASE_URL, getWhatsAppRedirectUrl } from '@/lib/api';

interface ProductCardProps {
  product: Product;
}

/** Jiji-style "2 hrs ago", "3 days ago" freshness label */
function timeAgo(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(1, mins)} min${mins !== 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently listed';
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  const categoryLabel =
    CATEGORY_LABELS[product.category as keyof typeof CATEGORY_LABELS] ||
    product.category ||
    'General';

  const hasDiscount =
    product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(
        ((product.compareAtPrice! - product.price) / product.compareAtPrice!) *
          100
      )
    : 0;

  const isOutOfStock =
    Boolean(
      product.trackInventory &&
      product.stockQuantity !== null &&
      product.stockQuantity !== undefined &&
      product.stockQuantity <= 0
    );

  const isLowStock =
    Boolean(
      product.trackInventory &&
      product.stockQuantity !== null &&
      product.stockQuantity !== undefined &&
      product.stockQuantity > 0 &&
      product.stockQuantity <= 3
    );

  // Mobile contact visible only below sm (<640px) and only for in-stock listings.
  // Routes through the server-side redirect endpoint to prevent scraping and record clicks.
  const showWhatsAppOnMobile = !isOutOfStock && Boolean(product.id);
  const whatsappUrl = product.id
    ? getWhatsAppRedirectUrl(product.id, 'card_mobile')
    : null;

  const productUrl = `/p/${product.slug}`;
  const listedAgo = product.createdAt ? timeAgo(product.createdAt) : null;

  // Top-left: Promoted badge + category + discount badges
  useEffect(() => {
    if (!product.promoted || !product.id) return;

    try {
      const payload = JSON.stringify({
        type: 'boost_impression',
        source: 'feed_page1',
      });
      const blob = new Blob([payload], { type: 'application/json' });
      const eventsUrl = `${API_BASE_URL}/api/v1/marketplace/products/${product.id}/events`;

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(eventsUrl, blob);
      } else if (typeof fetch !== 'undefined') {
        fetch(eventsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Analytics failure must never block buyer interaction
    }
  }, [product.promoted, product.id]);

  // Location string — city first (Jiji pattern: "Lagos · Ikeja")
  const locationParts = [product.seller?.city, product.seller?.state].filter(Boolean);
  const locationStr = locationParts.length > 0
    ? locationParts.slice(0, 2).join(' · ')
    : null;

  const sellerIdentifier = product.seller?.merchantId || product.seller?.id;
  const storefrontUrl = sellerIdentifier ? `/s/${sellerIdentifier}` : null;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-purple-200/60 transition-all duration-200">

      {/* ── Product Image & Badges ── */}
      <a href={productUrl} className="relative aspect-[4/3] w-full overflow-hidden block bg-gray-50">
        {product.images && product.images.length > 0 && product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const placeholder = parent.querySelector('.img-placeholder');
                if (placeholder) {
                  (placeholder as HTMLElement).style.display = 'flex';
                }
              }
            }}
          />
        ) : null}

        {/* Placeholder */}
        <div
          className={`img-placeholder h-full w-full items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100/60 text-purple-300 ${
            product.images && product.images[0] ? 'hidden' : 'flex'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <Package className="h-10 w-10 stroke-[1.2] opacity-50" />
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400/80">
              {categoryLabel}
            </span>
          </div>
        </div>

        {/* Top-left: promoted + category + discount badges */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {product.promoted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
              <Sparkles className="h-3 w-3 fill-current text-amber-300" />
              Promoted
            </span>
          )}
          <span className="inline-flex items-center rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-bold text-[#352778] shadow-sm backdrop-blur border border-purple-100/50">
            {categoryLabel}
          </span>
          {hasDiscount && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-sm" style={{ backgroundColor: '#E85918' }}>
              {discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Top-right: listed time — freshness signal */}
        {listedAgo && (
          <div className="absolute top-2.5 right-2.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              <Clock className="h-2.5 w-2.5" />
              {listedAgo}
            </span>
          </div>
        )}

        {/* Bottom-right: stock/type pill */}
        <div className="absolute bottom-2.5 right-2.5">
          {product.productType === 'service' ? (
            <span className="rounded-full bg-blue-600/90 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm backdrop-blur">
              Service
            </span>
          ) : isOutOfStock ? (
            <span className="rounded-full bg-red-600/90 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm backdrop-blur">
              Sold Out
            </span>
          ) : isLowStock ? (
            <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[11px] font-bold text-amber-950 shadow-sm backdrop-blur">
              Only {product.stockQuantity} left
            </span>
          ) : null}
        </div>
      </a>

      {/* ── Product Content ── */}
      <div className="flex flex-1 flex-col p-4 pb-3">

        {/* Location */}
        {locationStr && (
          <div className="flex items-center gap-1 mb-1.5 text-[11.5px] text-[#352778] font-semibold">
            <MapPin className="h-3 w-3 shrink-0 text-[#7c3aed]" />
            <span className="truncate">{locationStr}</span>
          </div>
        )}

        <a href={productUrl} className="focus:outline-none">
          <h3
            className="line-clamp-2 text-[14.5px] font-bold text-gray-900 transition-colors group-hover:text-[#352778] leading-snug"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            {product.name}
          </h3>
        </a>

        {/* Price Row */}
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span
            className="text-[1.15rem] font-extrabold tracking-tight text-[#352778]"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            {'\u20a6'}{Number(product.price).toLocaleString()}
          </span>
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through">
              {'\u20a6'}{Number(product.compareAtPrice).toLocaleString()}
            </span>
          )}
        </div>

        {/* Merchant row with storefront link */}
        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs">
          {storefrontUrl ? (
            <a
              href={storefrontUrl}
              className="truncate font-semibold text-gray-700 hover:text-[#352778] transition-colors"
              title={`Visit ${product.seller?.businessName || 'merchant'} storefront`}
            >
              {product.seller?.businessName || 'Verified Merchant'}
            </a>
          ) : (
            <span className="truncate font-semibold text-gray-700">
              {product.seller?.businessName || 'Verified Merchant'}
            </span>
          )}
          {product.seller?.isVerified && (
            <span title="Verified Merchant" className="shrink-0">
              <BadgeCheck className="h-4 w-4 text-[#7c3aed]" />
            </span>
          )}
        </div>
      </div>

      {/* ── Actions: Mobile WhatsApp (<sm) + View Details ── */}
      <div className="p-4 pt-0">
        {showWhatsAppOnMobile && whatsappUrl ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:hidden">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2.5 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700 transition-all active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>WhatsApp</span>
              </a>
              <a href={productUrl} className="block w-full">
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#352778] to-[#7c3aed] py-2.5 text-[12px] font-bold text-white hover:opacity-90 transition-all duration-150 active:scale-[0.98]"
                >
                  <span>Details</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </a>
            </div>

            <div className="hidden sm:block">
              <a href={productUrl} className="block w-full">
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#352778] to-[#7c3aed] py-2.5 text-[12.5px] font-bold text-white hover:opacity-90 hover:-translate-y-px transition-all duration-150 active:scale-[0.98]"
                >
                  <span>View Details</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </a>
            </div>
          </div>
        ) : (
          <a href={productUrl} className="block w-full">
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#352778] to-[#7c3aed] py-2.5 text-[12.5px] font-bold text-white hover:opacity-90 hover:-translate-y-px transition-all duration-150 active:scale-[0.98]"
            >
              <span>View Details</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </a>
        )}
      </div>
    </div>
  );
}
