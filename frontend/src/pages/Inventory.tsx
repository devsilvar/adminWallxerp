import { useEffect, useState } from 'react';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useMarketplaceStore } from '@/stores/marketplace.store.ts';
import ProductModal from '@/components/marketplace/ProductModal.tsx';
import PurchaseSlotModal from '@/components/marketplace/PurchaseSlotModal.tsx';
import LockedSlotCard from '@/components/marketplace/LockedSlotCard.tsx';
import ListingOptimizationPanel from '@/components/marketplace/ListingOptimizationPanel.tsx';
import MarketplaceAnalyticsPanel from '@/components/marketplace/MarketplaceAnalyticsPanel.tsx';
import Button from '@/components/ui/Button.tsx';
import PageLoader from '@/components/ui/PageLoader.tsx';
import {
  Package,
  Plus,
  ExternalLink,
  Edit2,
  Send,
  Archive,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Eye,
  MessageSquare,
} from 'lucide-react';
import type { MarketplaceProduct, CreateProductPayload } from '@/types/index.ts';

export default function Inventory() {
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const {
    products,
    loading,
    error,
    submitting,
    fetchProducts,
    createProduct,
    updateProduct,
    submitForApproval,
    archiveProduct,
    markAsSold,
    renewProduct,
    analytics,
    analyticsLoading,
    fetchAnalytics,
  } = useMarketplaceStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProduct | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);

  useEffect(() => {
    if (activeBusiness?.id) {
      fetchProducts(activeBusiness.id);
      fetchAnalytics(activeBusiness.id, analyticsDays);
    }
  }, [activeBusiness?.id, analyticsDays, fetchProducts, fetchAnalytics]);

  // Dynamic slot allowance from activeBusiness (defaults to 3 free slots)
  const slotAllowance = activeBusiness?.marketplaceSlotAllowance ?? 3;

  // Active products are any listings that are NOT archived (draft, pending_approval, approved, rejected)
  const activeProducts = products.filter((p) => p.status !== 'archived');
  const archivedProducts = products.filter((p) => p.status === 'archived');
  const activeCount = activeProducts.length;
  const emptySlotsCount = Math.max(0, slotAllowance - activeCount);

  // Evidence calculation: total recorded buyer inquiries across the business
  const totalContacts = products.reduce((acc, p) => acc + (p.contactCount ?? 0), 0);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
    setActionSuccess(null);
  };

  const handleOpenEdit = (product: MarketplaceProduct) => {
    setEditingProduct(product);
    setIsModalOpen(true);
    setActionSuccess(null);
  };

  const handleSaveProduct = async (payload: CreateProductPayload, submitImmediately: boolean) => {
    if (!activeBusiness?.id) return;

    if (editingProduct) {
      const updated = await updateProduct(activeBusiness.id, editingProduct.id, payload);
      if (updated.status === 'pending_approval') {
        setActionSuccess(`"${updated.name}" updated and sent back for review. You'll be notified once approved.`);
      } else if (submitImmediately) {
        if (updated.listingScore && updated.listingScore.score < 50) {
          setActionSuccess(
            `"${updated.name}" updated, but listing strength is ${updated.listingScore.score}/100. Minimum 50 required for approval.`
          );
          return;
        }
        await submitForApproval(activeBusiness.id, updated.id);
        setActionSuccess(`"${updated.name}" updated and submitted for approval!`);
      } else {
        setActionSuccess(`"${updated.name}" updated successfully.`);
      }
    } else {
      const created = await createProduct(activeBusiness.id, payload);
      if (submitImmediately) {
        if (created.listingScore && created.listingScore.score < 50) {
          setActionSuccess(
            `"${created.name}" created as draft. Listing strength is ${created.listingScore.score}/100 (minimum 50 required to submit).`
          );
          return;
        }
        await submitForApproval(activeBusiness.id, created.id);
        setActionSuccess(`"${created.name}" created and submitted for review!`);
      } else {
        setActionSuccess(`"${created.name}" saved as draft.`);
      }
    }
  };

  const handleSubmitForReview = async (product: MarketplaceProduct) => {
    if (!activeBusiness?.id) return;
    if (product.listingScore && product.listingScore.score < 50) {
      alert(
        `Listing strength is currently ${product.listingScore.score}/100. WallX requires a minimum score of 50 to submit for approval. Please edit the listing to add photos, detailed description, or attributes.`
      );
      return;
    }
    try {
      await submitForApproval(activeBusiness.id, product.id);
      setActionSuccess(`"${product.name}" submitted for moderation review.`);
    } catch {
      // Error handled in store
    }
  };

  const handleMarkAsSold = async (product: MarketplaceProduct) => {
    if (!activeBusiness?.id) return;
    const confirmSold = window.confirm(
      `Mark "${product.name}" as sold? This will move it to your archived items and free up an active showcase slot.`
    );
    if (!confirmSold) return;

    try {
      await markAsSold(activeBusiness.id, product.id);
      setActionSuccess(`"${product.name}" marked as sold! An active slot has been freed.`);
    } catch {
      // Error handled in store
    }
  };

  const handleRenew = async (product: MarketplaceProduct) => {
    if (!activeBusiness?.id) return;
    if (emptySlotsCount <= 0) {
      alert(
        `You have reached your showcase capacity of ${slotAllowance} active products. Archive or mark another product as sold before renewing this listing, or unlock an additional slot.`
      );
      return;
    }

    try {
      await renewProduct(activeBusiness.id, product.id);
      setActionSuccess(
        `"${product.name}" renewed for another 90 days and restored to your active showcase!`
      );
    } catch {
      // Error handled in store
    }
  };

  const handleArchive = async (product: MarketplaceProduct) => {
    if (!activeBusiness?.id) return;
    const confirmArchive = window.confirm(
      `Are you sure you want to archive "${product.name}"? Archiving will remove it from active listings and free up an inventory slot.`
    );
    if (!confirmArchive) return;

    try {
      await archiveProduct(activeBusiness.id, product.id);
      setActionSuccess(`"${product.name}" archived. An inventory slot has been freed!`);
    } catch {
      // Error handled in store
    }
  };

  if (!activeBusiness) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a business to manage inventory &amp; marketplace products.
      </div>
    );
  }

  if (loading && products.length === 0) {
    return <PageLoader message="Loading your inventory showcase..." />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Slot Counter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
              <Package className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Inventory &amp; Marketplace
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Showcase up to {slotAllowance} featured products or services directly on the public WallX Marketplace.
          </p>
        </div>

        {/* Slot Availability Counter */}
        <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
          <div className="text-right">
            <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
              Showcase Capacity
            </p>
            <p className="text-sm font-bold text-purple-700">
              {activeCount} of {slotAllowance} Active Slots Used
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap max-w-[120px] justify-end">
            {Array.from({ length: slotAllowance }, (_, i) => i + 1).map((slot) => (
              <span
                key={slot}
                className={`w-3 h-3 rounded-full ${
                  slot <= activeCount ? 'bg-purple-600' : 'bg-gray-200'
                }`}
                title={`Slot ${slot} of ${slotAllowance}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Action Notification */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 font-semibold hover:underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Marketplace Demand & Performance Analytics (Phase 15) */}
      <MarketplaceAnalyticsPanel
        analytics={analytics}
        loading={analyticsLoading}
        periodDays={analyticsDays}
        onPeriodChange={(days) => setAnalyticsDays(days)}
      />

      {/* Why Isn't This Selling? Optimization Panel (Placed above slots and upsell per plan §2.6) */}
      <ListingOptimizationPanel
        products={activeProducts}
        onEditProduct={handleOpenEdit}
      />

      {/* Active Product Slots Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span>Active Product Slots</span>
            <span className="text-xs font-normal text-gray-500">
              ({emptySlotsCount} slot{emptySlotsCount !== 1 ? 's' : ''} available)
            </span>
          </h2>

          {/* Quick unlock button when capacity is reached and inquiries exist */}
          {emptySlotsCount === 0 && totalContacts >= 1 && (
            <button
              type="button"
              onClick={() => setIsPurchaseModalOpen(true)}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Unlock Slot #{slotAllowance + 1}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Active Product Cards */}
          {activeProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Product Cover Thumbnail */}
                <div className="relative aspect-video w-full bg-gray-100 overflow-hidden border-b border-gray-100">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Package className="w-10 h-10 mb-1" />
                      <span className="text-xs">No image provided</span>
                    </div>
                  )}

                  {/* Status Pill Badge */}
                  <div className="absolute top-2.5 right-2.5">
                    {product.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Live on Marketplace
                      </span>
                    )}
                    {product.status === 'pending_approval' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-sm">
                        <Clock className="w-3.5 h-3.5" />
                        Under Review
                      </span>
                    )}
                    {product.status === 'draft' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-600 text-white shadow-sm">
                        Draft
                      </span>
                    )}
                    {product.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-600 text-white shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Action Needed
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded capitalize">
                      {product.category}
                    </span>
                    <span className="text-[11px] text-gray-400 uppercase">
                      {product.productType}
                    </span>
                  </div>

                  <h3 className="font-semibold text-gray-900 text-base line-clamp-1">
                    {product.name}
                  </h3>

                  <p className="text-xs text-gray-500 line-clamp-2">
                    {product.description}
                  </p>

                  {/* Pricing and Stock */}
                  <div className="pt-1 flex items-baseline justify-between">
                    <div>
                      <span className="text-lg font-bold text-gray-900">
                        ₦{Number(product.price).toLocaleString()}
                      </span>
                      {product.compareAtPrice && (
                        <span className="text-xs text-gray-400 line-through ml-2">
                          ₦{Number(product.compareAtPrice).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-right text-gray-500">
                      {product.productType === 'physical' ? (
                        product.trackInventory ? (
                          <span
                            className={
                              (product.stockQuantity ?? 0) > 0
                                ? 'text-emerald-700 font-medium'
                                : 'text-red-600 font-medium'
                            }
                          >
                            {product.stockQuantity ?? 0} in stock
                          </span>
                        ) : (
                          'In stock'
                        )
                      ) : (
                        'Service'
                      )}
                    </div>
                  </div>

                  {/* Per-Listing Analytics: Views and Contacts (Renders "—" if not recorded, never "0" fallback) */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                    <div className="flex items-center gap-1.5" title="Total public listing views">
                      <Eye className="w-3.5 h-3.5 text-purple-600" />
                      <span>
                        <strong className="text-gray-900 font-semibold">
                          {product.viewCount !== undefined && product.viewCount !== null
                            ? product.viewCount.toLocaleString()
                            : '—'}
                        </strong>{' '}
                        views
                      </span>
                    </div>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1.5" title="Buyer inquiries (WhatsApp and Phone contacts)">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        <strong className="text-gray-900 font-semibold">
                          {product.contactCount !== undefined && product.contactCount !== null
                            ? product.contactCount.toLocaleString()
                            : '—'}
                        </strong>{' '}
                        contacts
                      </span>
                    </div>
                  </div>

                  {/* Moderator Feedback if applicable */}
                  {(product.status === 'rejected' || product.status === 'pending_approval') && product.rejectionReason && (
                    <div
                      className={`mt-2 p-2.5 rounded text-xs border ${
                        product.status === 'rejected'
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <p className="font-semibold mb-0.5">Moderator Feedback:</p>
                      <p>{product.rejectionReason}</p>
                    </div>
                  )}

                  {/* Listing Strength Meter */}
                  {product.listingScore && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-600 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          Listing Strength:
                          <span className="capitalize font-semibold text-gray-900">
                            {product.listingScore.label}
                          </span>
                        </span>
                        <span className="font-bold text-gray-900">
                          {product.listingScore.score}/100
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            product.listingScore.score >= 80
                              ? 'bg-emerald-500'
                              : product.listingScore.score >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, product.listingScore.score))}%` }}
                        />
                      </div>
                      {product.listingScore.tips &&
                        product.listingScore.tips.length > 0 &&
                        product.status !== 'approved' && (
                          <div className="mt-2 text-[11px] bg-purple-50/60 p-2 rounded border border-purple-100 text-purple-900">
                            <p className="font-medium mb-1">To boost visibility &amp; approval:</p>
                            <ul className="list-disc pl-3.5 space-y-0.5 text-purple-800">
                              {product.listingScore.tips.slice(0, 2).map((tip, idx) => (
                                <li key={idx}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEdit(product)}
                    className="text-xs text-gray-700"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>

                  {(product.status === 'draft' || product.status === 'rejected') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSubmitForReview(product)}
                      disabled={submitting}
                      className="text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Submit
                    </Button>
                  )}

                  {product.status === 'approved' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkAsSold(product)}
                        disabled={submitting}
                        className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        title="Mark this item as sold and free up a showcase slot"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Sold
                      </Button>
                      <a
                        href={`/marketplace/products/${product.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs text-purple-700 hover:underline px-2 py-1 font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Live
                      </a>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleArchive(product)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                  title="Archive Product"
                >
                  <Archive className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Empty Slot Placeholders */}
          {Array.from({ length: emptySlotsCount }).map((_, index) => (
            <button
              key={`empty-${index}`}
              type="button"
              onClick={handleOpenCreate}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-purple-500 hover:bg-purple-50/30 transition-all min-h-[300px] group"
            >
              <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-800 text-base">
                + Add Product
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                Slot {activeCount + index + 1} of {slotAllowance} available. Click to create a featured listing.
              </p>
            </button>
          ))}

          {/* Locked Slot Card (Upsell for slotAllowance + 1) */}
          <LockedSlotCard
            slotNumber={slotAllowance + 1}
            totalContacts={totalContacts}
            onUnlock={() => setIsPurchaseModalOpen(true)}
          />
        </div>
      </div>

      {/* Explainer / Onboarding Section */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-6">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-2">
          <Info className="w-5 h-5 text-purple-600" />
          How WallX Marketplace Syndication Works
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Every verified SME on WallX ERP is allocated up to {slotAllowance} active showcase slots to advertise their best-selling products or services on Nigeria’s public business marketplace.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-4 rounded-lg border border-purple-100 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs mb-2">
              1
            </div>
            <h4 className="font-semibold text-gray-800 text-sm mb-1">Create Listing</h4>
            <p className="text-xs text-gray-500">
              Add clear product photos, pricing, stock levels, and category specifications.
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-purple-100 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs mb-2">
              2
            </div>
            <h4 className="font-semibold text-gray-800 text-sm mb-1">Moderation Review</h4>
            <p className="text-xs text-gray-500">
              Our trust &amp; safety team reviews listings to ensure pricing and quality meet standard guidelines.
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-purple-100 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs mb-2">
              3
            </div>
            <h4 className="font-semibold text-gray-800 text-sm mb-1">Live Inquiries</h4>
            <p className="text-xs text-gray-500">
              Once approved, customers view your listing and contact you directly via WhatsApp or phone.
            </p>
          </div>
        </div>
      </div>

      {/* Archived Products Drawer */}
      {archivedProducts.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-800">
                Archived Products ({archivedProducts.length})
              </span>
              <span className="text-xs text-gray-400">
                - Inactive items previously removed from active slots
              </span>
            </div>
            {showArchived ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showArchived && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {archivedProducts.map((archived) => {
                const isSold = Boolean(archived.soldAt);
                const isExpired =
                  archived.expiresAt &&
                  new Date(archived.expiresAt) <= new Date() &&
                  !isSold;
                const canRenew = isExpired && emptySlotsCount > 0;

                return (
                  <div
                    key={archived.id}
                    className="px-5 py-3 flex items-center justify-between text-sm hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {archived.images && archived.images[0] ? (
                          <img
                            src={archived.images[0]}
                            alt={archived.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{archived.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="capitalize">{archived.category}</span>
                          <span>•</span>
                          <span>₦{Number(archived.price).toLocaleString()}</span>
                          {archived.soldAt && (
                            <>
                              <span>•</span>
                              <span>Sold on {new Date(archived.soldAt).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSold ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Sold
                        </span>
                      ) : isExpired ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> Expired
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canRenew || submitting}
                            onClick={() => handleRenew(archived)}
                            className="text-xs border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                            title={
                              emptySlotsCount === 0
                                ? `All ${slotAllowance} active slots are in use. Free up a slot or unlock capacity to renew.`
                                : 'Renew this listing for 90 days'
                            }
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Renew (90d)
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Product Create / Edit Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={editingProduct}
        onSave={handleSaveProduct}
        isSubmitting={submitting}
        businessId={activeBusiness.id}
      />

      {/* Showcase Slot Purchase Modal */}
      <PurchaseSlotModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        businessId={activeBusiness.id}
        currentAllowance={slotAllowance}
        totalContacts={totalContacts}
        onSuccess={(msg) => setActionSuccess(msg)}
      />
    </div>
  );
}
