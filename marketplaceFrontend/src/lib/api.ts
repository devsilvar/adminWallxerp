/**
 * API Configuration and Utilities
 * Connects Marketplace Frontend to WallX Marketplace Backend API
 */

import type {
  Product,
  PaginatedProductsResponse,
  ApiResponse,
  RelatedProduct,
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

export interface GetProductsParams {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  type?: string;
}

/**
 * Fetches approved products from the public marketplace feed
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
    // Return empty fallback structure so static build or initial SSR doesn't crash on network failure
    return {
      success: false,
      data: [],
      pagination: {
        page: params?.page || 1,
        limit: params?.limit || 24,
        total: 0,
        totalPages: 1,
      },
    };
  }
}

export interface ProductDetailResult {
  product: Product;
  relatedProducts: RelatedProduct[];
}

/**
 * Fetches a single public product by slug with related listings
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
    return null;
  }
}
