/**
 * Core marketplace type definitions
 * Synchronized with WallX Backend Marketplace Schema
 */

export const MARKETPLACE_CATEGORIES = [
  'fashion',
  'bags',
  'books',
  'furniture',
  'electronics',
  'food',
  'services',
  'other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  fashion: 'Fashion & Apparel',
  bags: 'Bags & Luggage',
  books: 'Books & Stationery',
  furniture: 'Furniture & Living',
  electronics: 'Electronics & Gadgets',
  food: 'Food & Groceries',
  services: 'Professional Services',
  other: 'General & Other',
};

export type ProductType = 'physical' | 'service';

export interface SellerInfo {
  businessName: string;
  city?: string | null;
  state?: string | null;
  isVerified: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: MarketplaceCategory | string;
  productType: ProductType;
  description: string;
  price: number;
  compareAtPrice?: number | null;
  currency: string;
  stockQuantity?: number | null;
  trackInventory?: boolean;
  attributes: Record<string, any>;
  images: string[];
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  purchaseUrl?: string | null;
  seller: SellerInfo;
  createdAt: string;
  updatedAt?: string;
  inStock?: boolean;
}

export interface RelatedProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  productType: ProductType;
  price: number;
  compareAtPrice?: number | null;
  currency: string;
  images: string[];
}

export interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  productCount?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  relatedProducts?: RelatedProduct[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedProductsResponse {
  success: boolean;
  data: Product[];
  pagination: PaginationMeta;
}
