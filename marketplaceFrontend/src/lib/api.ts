/**
 * API Configuration and Utilities
 * Connects Marketplace Frontend to WallX Marketplace Backend API
 */

import type {
  Product,
  PaginatedProductsResponse,
  ApiResponse,
  RelatedProduct,
  SellerStorefrontResponse,
} from '@/types';

// API Base URL - defaults to localhost:3000
export const API_BASE_URL =
  import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Generic API error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Helper function to build query parameters
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.append(key, String(value).trim());
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

/**
 * Type-safe fetch wrapper with automatic error handling
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        (errorData as { message?: string })?.message || response.statusText,
        errorData
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : 'Network error occurred';
    throw new ApiError(0, message, error);
  }
}

export type GetProductsParams = {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  type?: string;
  productType?: string;
  sort?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  verifiedOnly?: boolean;
  hasDiscount?: boolean;
  inStockOnly?: boolean;
};

/**
 * Fetches approved products from the public marketplace feed.
 * Rethrows errors so calling pages can render proper HTTP status codes (e.g. 503).
 */
export async function getProducts(
  params?: GetProductsParams
): Promise<PaginatedProductsResponse> {
  const qs = params ? buildQueryString(params as Record<string, string | number>) : '';
  const endpoint = `/api/v1/marketplace/products${qs}`;

  try {
    return await apiFetch<PaginatedProductsResponse>(endpoint);
  } catch (err) {
    console.warn(`[getProducts] Failed to fetch products from ${endpoint}:`, err);
    throw err;
  }
}

export type ProductDetailResult = {
  product: Product;
  relatedProducts: RelatedProduct[];
};

/**
 * Fetches a single public product by slug with related listings.
 * Returns null if the item is not found (404), or rethrows on network/server errors.
 */
export async function getProductBySlug(
  slug: string
): Promise<ProductDetailResult | null> {
  if (!slug || !slug.trim()) {
    return null;
  }

  const endpoint = `/api/v1/marketplace/products/${encodeURIComponent(slug.trim())}`;
  try {
    const res = await apiFetch<ApiResponse<Product>>(endpoint);
    if (!res || !res.data) {
      return null;
    }
    return {
      product: res.data,
      relatedProducts: res.relatedProducts || [],
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    console.warn(`[getProductBySlug] Error fetching product ${slug}:`, err);
    throw err;
  }
}

/**
 * Fetches a merchant's public storefront profile and approved listings.
 * Returns null if the merchant is not found (404), or rethrows on network/server errors.
 */
export async function getSellerStorefront(
  identifier: string
): Promise<SellerStorefrontResponse | null> {
  if (!identifier || !identifier.trim()) {
    return null;
  }

  const endpoint = `/api/v1/marketplace/sellers/${encodeURIComponent(identifier.trim())}`;
  try {
    const res = await apiFetch<ApiResponse<SellerStorefrontResponse>>(endpoint);
    if (!res || !res.data) {
      return null;
    }
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    console.warn(`[getSellerStorefront] Error fetching seller ${identifier}:`, err);
    throw err;
  }
}

/**
 * Constructs the server-side WhatsApp redirect URL.
 * Automatically tracks the whatsapp_click event and redirects to wa.me without exposing contact numbers.
 */
export function getWhatsAppRedirectUrl(productId: string, source?: string): string {
  const query = source ? `?source=${encodeURIComponent(source)}` : '';
  return `${API_BASE_URL}/api/v1/marketplace/products/${encodeURIComponent(productId)}/whatsapp-redirect${query}`;
}

export type MarketplaceListingEventType =
  | 'view'
  | 'whatsapp_click'
  | 'call_click'
  | 'share_click'
  | 'storefront_view'
  | 'boost_impression';

/**
 * Fires a fire-and-forget interaction beacon for a marketplace listing.
 * Uses navigator.sendBeacon (best practice — non-blocking, survives page navigation)
 * with a fetch fallback for environments where sendBeacon is unavailable.
 * Never throws — analytics must never break UX.
 */
export function recordListingEvent(
  productId: string,
  type: MarketplaceListingEventType = 'view',
  source?: string
): void {
  if (!productId) return;

  const url = `${API_BASE_URL}/api/v1/marketplace/products/${encodeURIComponent(productId)}/events`;
  const payload = JSON.stringify({ type, source: source ?? 'detail_page' });

  try {
    const blob = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(url, blob);
      if (!queued && typeof fetch !== 'undefined') {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } else if (typeof fetch !== 'undefined') {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // swallow — analytics must never break the page
  }
}

/**
 * Fires a fire-and-forget view beacon for a marketplace listing.
 */
export function recordViewEvent(productId: string, source?: string): void {
  recordListingEvent(productId, 'view', source);
}
