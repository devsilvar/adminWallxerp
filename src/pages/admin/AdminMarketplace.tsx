import { useEffect, useState } from 'react';
import {
  Package,
  Check,
  X,
  AlertTriangle,
  Search,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  ShieldCheck,
  Phone,
  Mail,
  Building,
  MapPin,
  Image as ImageIcon,
  Receipt,
  FileText,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Modal from '@/components/ui/Modal.tsx';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import PageHeader from './shared/PageHeader.tsx';
import PaginationBar from './shared/Pagination.tsx';
import { Panel, PanelEmpty } from './shared/Panel.tsx';
import StatusPill, { type Tone } from './shared/StatusPill.tsx';
import { formatNaira, formatStamp, timeAgo } from './shared/format.ts';
import type {
  AdminMarketplaceProduct,
  AdminProductListingStatus,
  AdminSlotPurchase,
} from '@/types/index.ts';

type QueueTab = 'pending_approval' | 'approved' | 'rejected' | 'archived' | 'slots';

const TABS: Array<{ key: QueueTab; label: string; tone: Tone }> = [
  { key: 'pending_approval', label: 'Pending Review', tone: 'warning' },
  { key: 'approved', label: 'Live Listings', tone: 'success' },
  { key: 'rejected', label: 'Rejected', tone: 'danger' },
  { key: 'archived', label: 'Taken Down / Archived', tone: 'neutral' },
  { key: 'slots', label: 'Slot Purchases', tone: 'info' },
];

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'fashion', label: 'Fashion & Apparel' },
  { value: 'bags', label: 'Bags & Luggage' },
  { value: 'electronics', label: 'Electronics & Gadgets' },
  { value: 'furniture', label: 'Home & Furniture' },
  { value: 'food', label: 'Food & Groceries' },
  { value: 'books', label: 'Books & Stationery' },
  { value: 'services', label: 'Professional Services' },
  { value: 'other', label: 'Other Products' },
];

const QUICK_REJECTION_REASONS = [
  'Low quality, blurry, or watermarked product photos.',
  'Misleading product description or unsupported claims.',
  'Pricing discrepancy or unreasonable discount values.',
  'Prohibited, restricted, or hazardous merchandise.',
  'Missing required category specifications (size, brand, etc.).',
];

export default function AdminMarketplace() {
  const [activeTab, setActiveTab] = useState<QueueTab>('pending_approval');
  const [products, setProducts] = useState<AdminMarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Active Modals & Selected Item
  const [rejectingProduct, setRejectingProduct] = useState<AdminMarketplaceProduct | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [takedownProduct, setTakedownProduct] = useState<AdminMarketplaceProduct | null>(null);
  const [takedownReason, setTakedownReason] = useState('');
  const [isSubmittingTakedown, setIsSubmittingTakedown] = useState(false);

  const [sendBackProduct, setSendBackProduct] = useState<AdminMarketplaceProduct | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [isSubmittingSendBack, setIsSubmittingSendBack] = useState(false);

  const [inspectProduct, setInspectProduct] = useState<AdminMarketplaceProduct | null>(null);
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});

  // Slot Purchases State (Phase 11)
  const [slotPurchases, setSlotPurchases] = useState<AdminSlotPurchase[]>([]);
  const [slotStatusFilter, setSlotStatusFilter] = useState<string>('all');
  const [slotPage, setSlotPage] = useState<number>(1);
  const [slotTotalPages, setSlotTotalPages] = useState<number>(1);
  const [slotTotalCount, setSlotTotalCount] = useState<number>(0);
  const [pendingSlotProofsCount, setPendingSlotProofsCount] = useState<number>(0);

  // Slot Modals & Actions
  const [rejectingSlot, setRejectingSlot] = useState<AdminSlotPurchase | null>(null);
  const [slotRejectionReason, setSlotRejectionReason] = useState<string>('');
  const [isSubmittingSlotReject, setIsSubmittingSlotReject] = useState<boolean>(false);

  const [refundingSlot, setRefundingSlot] = useState<AdminSlotPurchase | null>(null);
  const [refundReason, setRefundReason] = useState<string>('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState<boolean>(false);

  const [approvingSlotId, setApprovingSlotId] = useState<string | null>(null);
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null);

  function getErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const res = (err as { response?: { data?: { error?: { message?: string }; message?: string } } }).response;
      return res?.data?.error?.message || res?.data?.message || fallback;
    }
    if (err instanceof Error) return err.message;
    return fallback;
  }

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      setSlotPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch queue items
  const fetchQueue = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: 15,
        status: activeTab,
      };
      if (categoryFilter !== 'all') {
        params.category = categoryFilter;
      }
      if (search) {
        params.search = search;
      }

      const { data } = await api.get('/admin/marketplace', { params });
      setProducts(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotalCount(data.pagination.total || 0);
        if (activeTab === 'pending_approval') {
          setPendingCount(data.pagination.total || 0);
        }
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to load moderation queue'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch slot purchases (Phase 11)
  const fetchSlotPurchases = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: slotPage,
        limit: 15,
      };
      if (slotStatusFilter !== 'all') {
        params.status = slotStatusFilter;
      }
      if (search) {
        params.search = search;
      }

      const { data } = await api.get('/admin/marketplace/slots', { params });
      setSlotPurchases(data.data || []);
      if (data.pagination) {
        setSlotTotalPages(data.pagination.totalPages || 1);
        setSlotTotalCount(data.pagination.total || 0);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to load slot purchases'));
    } finally {
      setLoading(false);
    }
  };

  // Keep pending count updated periodically
  const fetchPendingCounts = async () => {
    try {
      const [queueRes, slotsRes] = await Promise.all([
        api.get('/admin/marketplace', { params: { status: 'pending_approval', limit: 1 } }),
        api.get('/admin/marketplace/slots', { params: { status: 'pending_proof', limit: 1 } }),
      ]);
      if (queueRes.data.pagination) {
        setPendingCount(queueRes.data.pagination.total || 0);
      }
      if (slotsRes.data.pagination) {
        setPendingSlotProofsCount(slotsRes.data.pagination.total || 0);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (activeTab === 'slots') {
      fetchSlotPurchases();
    } else {
      fetchQueue();
    }
    fetchPendingCounts();
  }, [activeTab, page, slotPage, categoryFilter, search, slotStatusFilter]);

  // ── Actions: Slot Purchases (Phase 11) ──
  const handleApproveSlot = async (purchase: AdminSlotPurchase) => {
    setApprovingSlotId(purchase.id);
    try {
      const { data } = await api.post(`/admin/marketplace/slots/${purchase.id}/approve`);
      toast.success(data.message || `Proof approved! +${purchase.slots} slots added.`);
      await fetchSlotPurchases();
      await fetchPendingCounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to approve slot proof'));
    } finally {
      setApprovingSlotId(null);
    }
  };

  const handleOpenRejectSlot = (purchase: AdminSlotPurchase) => {
    setRejectingSlot(purchase);
    setSlotRejectionReason('');
  };

  const handleConfirmRejectSlot = async () => {
    if (!rejectingSlot) return;
    if (slotRejectionReason.trim().length < 3) {
      toast.error('Rejection reason must be at least 3 characters');
      return;
    }
    if (slotRejectionReason.trim().length > 500) {
      toast.error('Rejection reason cannot exceed 500 characters');
      return;
    }

    setIsSubmittingSlotReject(true);
    try {
      await api.post(`/admin/marketplace/slots/${rejectingSlot.id}/reject`, {
        reason: slotRejectionReason.trim(),
      });
      toast.success('Slot purchase proof was rejected');
      setRejectingSlot(null);
      setSlotRejectionReason('');
      await fetchSlotPurchases();
      await fetchPendingCounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to reject slot proof'));
    } finally {
      setIsSubmittingSlotReject(false);
    }
  };

  const handleOpenRefundSlot = (purchase: AdminSlotPurchase) => {
    setRefundingSlot(purchase);
    setRefundReason('');
  };

  const handleConfirmRefundSlot = async () => {
    if (!refundingSlot) return;
    setIsSubmittingRefund(true);
    try {
      const { data } = await api.post(`/admin/marketplace/slots/${refundingSlot.id}/refund`, {
        reason: refundReason.trim() || undefined,
      });
      toast.success(data.message || 'Slot purchase refunded successfully');
      setRefundingSlot(null);
      setRefundReason('');
      await fetchSlotPurchases();
      await fetchPendingCounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to refund slot purchase'));
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  // ── Actions: Approve, Reject, Takedown ──

  const handleApprove = async (product: AdminMarketplaceProduct) => {
    // Optimistic Update: Immediately remove from pending list
    const previousProducts = [...products];
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    setPendingCount((prev) => Math.max(0, prev - 1));

    try {
      await api.post(`/admin/marketplace/${product.id}/approve`);
      toast.success(`"${product.name}" approved and published to marketplace`);
    } catch (err: any) {
      // Rollback on failure
      setProducts(previousProducts);
      setPendingCount((prev) => prev + 1);
      toast.error(err.response?.data?.error?.message || 'Failed to approve product');
    }
  };

  const handleOpenReject = (product: AdminMarketplaceProduct) => {
    setRejectingProduct(product);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingProduct) return;
    if (rejectionReason.trim().length < 3) {
      toast.error('Rejection reason must be at least 3 characters');
      return;
    }
    if (rejectionReason.trim().length > 500) {
      toast.error('Rejection reason cannot exceed 500 characters');
      return;
    }

    setIsSubmittingReject(true);
    const productId = rejectingProduct.id;
    const productName = rejectingProduct.name;
    const previousProducts = [...products];

    // Optimistic remove
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setPendingCount((prev) => Math.max(0, prev - 1));

    try {
      await api.post(`/admin/marketplace/${productId}/reject`, {
        reason: rejectionReason.trim(),
      });
      toast.success(`"${productName}" rejected. Feedback emailed to merchant.`);
      setRejectingProduct(null);
    } catch (err: any) {
      setProducts(previousProducts);
      setPendingCount((prev) => prev + 1);
      toast.error(err.response?.data?.error?.message || 'Failed to reject product');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleOpenTakedown = (product: AdminMarketplaceProduct) => {
    setTakedownProduct(product);
    setTakedownReason('');
  };

  const handleConfirmTakedown = async () => {
    if (!takedownProduct) return;
    if (takedownReason.trim().length < 3) {
      toast.error('Takedown reason must be at least 3 characters');
      return;
    }

    setIsSubmittingTakedown(true);
    const productId = takedownProduct.id;
    const productName = takedownProduct.name;
    const previousProducts = [...products];

    setProducts((prev) => prev.filter((p) => p.id !== productId));

    try {
      await api.post(`/admin/marketplace/${productId}/takedown`, {
        reason: takedownReason.trim(),
      });
      toast.success(`"${productName}" taken down from public marketplace`);
      setTakedownProduct(null);
    } catch (err: any) {
      setProducts(previousProducts);
      toast.error(err.response?.data?.error?.message || 'Failed to take down product');
    } finally {
      setIsSubmittingTakedown(false);
    }
  };

  const handleOpenSendBack = (product: AdminMarketplaceProduct) => {
    setSendBackProduct(product);
    setSendBackReason('');
  };

  const handleConfirmSendBack = async () => {
    if (!sendBackProduct) return;
    if (sendBackReason.trim().length < 3) {
      toast.error('Send back reason must be at least 3 characters');
      return;
    }
    if (sendBackReason.trim().length > 500) {
      toast.error('Send back reason cannot exceed 500 characters');
      return;
    }

    setIsSubmittingSendBack(true);
    const productId = sendBackProduct.id;
    const productName = sendBackProduct.name;
    const previousProducts = [...products];

    // Optimistically remove from current tab's product list
    setProducts((prev) => prev.filter((p) => p.id !== productId));

    try {
      await api.post(`/admin/marketplace/${productId}/send-back`, {
        reason: sendBackReason.trim(),
      });
      toast.success(`"${productName}" sent back for review`);
      setSendBackProduct(null);
    } catch (err: unknown) {
      setProducts(previousProducts);
      toast.error(getErrorMessage(err, 'Failed to send back product'));
    } finally {
      setIsSubmittingSendBack(false);
    }
  };

  // Image carousel next/prev per product card
  const handleNextImage = (productId: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setImageIndices((prev) => {
      const cur = prev[productId] || 0;
      return { ...prev, [productId]: (cur + 1) % total };
    });
  };

  const handlePrevImage = (productId: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setImageIndices((prev) => {
      const cur = prev[productId] || 0;
      return { ...prev, [productId]: (cur - 1 + total) % total };
    });
  };

  // Status mapping
  const statusTone = (status: AdminProductListingStatus): Tone => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending_approval':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const statusLabel = (status: AdminProductListingStatus): string => {
    switch (status) {
      case 'approved':
        return 'Live';
      case 'pending_approval':
        return 'Pending Review';
      case 'rejected':
        return 'Rejected';
      case 'archived':
        return 'Archived';
      default:
        return status;
    }
  };

  // Pricing Sanity Check Logic
  const getPricingSanityFlags = (product: AdminMarketplaceProduct) => {
    const flags: string[] = [];
    const numPrice = Number(product.price);
    const numCompare = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;

    if (numPrice <= 0) {
      flags.push('Zero or Negative Price');
    } else if (numPrice > 50_000_000) {
      flags.push('Extreme Price (> ₦50M)');
    } else if (product.productType === 'physical' && numPrice < 100) {
      flags.push('Unusually Low Physical Price (< ₦100)');
    }

    if (numCompare != null && numCompare < numPrice) {
      flags.push('Compare-At is Lower than Selling Price');
    }

    if (!product.images || product.images.length === 0) {
      flags.push('No Product Images');
    }

    return flags;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <PageHeader
        title="Marketplace Moderation"
        hint="Review, approve, reject, or take down merchant product listings across WallX Marketplace."
      />

      {/* Queue Tabs with Badges */}
      <div className="flex border-b border-gray-200 gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-medium transition ${
                isActive
                  ? 'border-purple-600 text-purple-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.label}</span>
              {tab.key === 'pending_approval' && pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">
                  {pendingCount}
                </span>
              )}
              {tab.key === 'slots' && pendingSlotProofsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 animate-pulse">
                  {pendingSlotProofsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab !== 'slots' ? (
        <>
          {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search product, business, or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <span className="text-xs text-gray-500 whitespace-nowrap hidden sm:inline">
            Showing {products.length} of {totalCount}
          </span>
        </div>
      </div>

      {/* Moderation Queue Content */}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : products.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Package}
            title={
              activeTab === 'pending_approval'
                ? 'No Pending Moderation Requests'
                : 'No Products in this Queue'
            }
            hint={
              activeTab === 'pending_approval'
                ? 'All merchant product submissions have been reviewed and approved or rejected.'
                : 'No product listings found matching your current filter criteria.'
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const flags = getPricingSanityFlags(product);
            const totalImgs = product.images?.length || 0;
            const currentImgIndex = imageIndices[product.id] || 0;
            const activeImg = totalImgs > 0 ? product.images[currentImgIndex] : null;

            return (
              <div
                key={product.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs hover:border-gray-300 transition space-y-4"
              >
                {/* Header row: Product Title, Category, Status & Pricing Flag */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-50 rounded-lg text-purple-700 flex-shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">{product.name}</h3>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                          {product.category}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 capitalize">
                          {product.productType}
                        </span>
                        <StatusPill tone={statusTone(product.status)}>
                          {statusLabel(product.status)}
                        </StatusPill>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Submitted {timeAgo(product.createdAt)}</span>
                        <span>•</span>
                        <span>{formatStamp(product.createdAt)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Pricing Sanity Flags */}
                  {flags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 self-start">
                      {flags.map((flag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md font-semibold"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Body Grid: Images, Overview, Specs, Merchant KYC */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Left Column: Image Carousel / Preview */}
                  <div className="md:col-span-3">
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-gray-50 border border-gray-200 group">
                      {activeImg ? (
                        <>
                          <img
                            src={activeImg}
                            alt={product.name}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setInspectProduct(product)}
                          />
                          {totalImgs > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handlePrevImage(product.id, totalImgs, e)}
                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 text-white hover:bg-black transition"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleNextImage(product.id, totalImgs, e)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 text-white hover:bg-black transition"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded font-semibold">
                                {currentImgIndex + 1} / {totalImgs}
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-2 text-center text-xs">
                          <ImageIcon className="w-8 h-8 mb-1 text-gray-300" />
                          <span>No Image Uploaded</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: Pricing, Inventory & Specs */}
                  <div className="md:col-span-5 space-y-3">
                    {/* Price and Strikethrough */}
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-gray-900">
                          {formatNaira(Number(product.price))}
                        </span>
                        {product.compareAtPrice && (
                          <span className="text-sm text-gray-400 line-through">
                            {formatNaira(Number(product.compareAtPrice))}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {product.productType === 'physical'
                          ? product.trackInventory
                            ? `Stock: ${product.stockQuantity ?? 0} units available`
                            : 'Untracked physical stock'
                          : 'Service / Digital offering'}
                      </p>
                    </div>

                    {/* Description */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                        Description
                      </p>
                      <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    {/* Category Specs Preview */}
                    {product.attributes && Object.keys(product.attributes).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          Specifications
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(product.attributes).map(([k, v]) => (
                            <span
                              key={k}
                              className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-600"
                            >
                              <strong className="capitalize">{k}:</strong> {String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rejection reason (if rejected) */}
                    {product.rejectionReason && (
                      <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                        <strong>Rejection Reason:</strong> {product.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Merchant Profile & Verification */}
                  <div className="md:col-span-4 bg-gray-50 border border-gray-100 rounded-lg p-3.5 space-y-2.5 text-xs text-gray-700 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900">
                          <Building className="w-3.5 h-3.5 text-purple-700" />
                          <span>{product.business?.businessName || 'Merchant Business'}</span>
                        </div>
                        {product.business?.isVerified && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <ShieldCheck className="w-3 h-3" /> Verified
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {product.business?.city && (
                          <p className="flex items-center gap-1 text-gray-500">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span>
                              {product.business.city}, {product.business.state || 'Nigeria'}
                            </span>
                          </p>
                        )}
                        {product.business?.user?.email && (
                          <p className="flex items-center gap-1 text-gray-600">
                            <Mail className="w-3 h-3 text-gray-400" />
                            <span>{product.business.user.email}</span>
                          </p>
                        )}
                        {product.contactPhone && (
                          <p className="flex items-center gap-1 text-gray-600">
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{product.contactPhone}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Bar per Card */}
                    <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectProduct(product)}
                        className="text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Full Details
                      </Button>

                      {product.status === 'pending_approval' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReject(product)}
                            className="text-xs text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleApprove(product)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Approve
                          </Button>
                        </>
                      )}

                      {product.status === 'approved' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenSendBack(product)}
                            className="text-xs text-amber-700 hover:text-amber-800 border-amber-300 hover:border-amber-400 bg-amber-50/50"
                          >
                            <Undo2 className="w-3.5 h-3.5 mr-1" /> Send Back
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenTakedown(product)}
                            className="text-xs text-amber-700 hover:text-amber-800 border-amber-200 hover:border-amber-300"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Take Down
                          </Button>
                        </>
                      )}

                      {product.status === 'rejected' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(product)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Re-Approve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pt-4">
              <PaginationBar
                pagination={{
                  page,
                  totalPages,
                  total: totalCount,
                  hasPrev: page > 1,
                  hasNext: page < totalPages,
                }}
                onPageChange={(p) => setPage(p)}
                noun="listings"
              />
            </div>
          )}
        </div>
      )}
    </>
  ) : (
    <div className="space-y-4">
      {/* Slots Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search business, owner, or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={slotStatusFilter}
            onChange={(e) => {
              setSlotStatusFilter(e.target.value);
              setSlotPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
          >
            <option value="all">All Slot Purchases</option>
            <option value="pending_proof">Pending Proofs</option>
            <option value="active">Active Purchases</option>
            <option value="rejected">Rejected Proofs</option>
            <option value="refunded">Refunded Purchases</option>
          </select>

          <span className="text-xs text-gray-500 whitespace-nowrap hidden sm:inline">
            Showing {slotPurchases.length} of {slotTotalCount}
          </span>
        </div>
      </div>

      {/* Slot Purchases Content */}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : slotPurchases.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Receipt}
            title={
              slotStatusFilter === 'pending_proof'
                ? 'No Pending Slot Proofs'
                : 'No Slot Purchases Found'
            }
            hint={
              slotStatusFilter === 'pending_proof'
                ? 'All merchant slot purchase proofs have been approved or rejected.'
                : 'No slot purchases found matching your current filter criteria.'
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {slotPurchases.map((purchase) => {
            const isPending = purchase.status === 'pending_proof';
            const isActive = purchase.status === 'active';
            const isRejected = purchase.status === 'rejected';
            const isRefunded = purchase.status === 'refunded';

            let tone: Tone = 'neutral';
            let statusLabel = purchase.status as string;
            if (isPending) {
              tone = 'warning';
              statusLabel = 'Pending Review';
            } else if (isActive) {
              tone = 'success';
              statusLabel = 'Active';
            } else if (isRejected) {
              tone = 'danger';
              statusLabel = 'Rejected';
            } else if (isRefunded) {
              tone = 'neutral';
              statusLabel = 'Refunded';
            }

            return (
              <div
                key={purchase.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs hover:border-gray-300 transition space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold text-gray-900">
                        {purchase.business?.businessName || 'Business Profile'}
                      </span>
                      <StatusPill tone={tone}>{statusLabel}</StatusPill>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 capitalize">
                        Paid via {purchase.paidVia}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Created {formatStamp(purchase.createdAt)} ({timeAgo(purchase.createdAt)}) · ID:{' '}
                      <span className="font-mono text-[11px] text-gray-600">{purchase.id.slice(0, 8)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenRejectSlot(purchase)}
                          className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <X className="w-3.5 h-3.5 mr-1" /> Reject Proof
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleApproveSlot(purchase)}
                          disabled={approvingSlotId === purchase.id}
                          isLoading={approvingSlotId === purchase.id}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Approve (+{purchase.slots} Slots)
                        </Button>
                      </>
                    )}

                    {isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenRefundSlot(purchase)}
                        className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Refund Purchase
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-500 block mb-1">Slots Quantity</span>
                    <span className="text-sm font-bold text-gray-900">
                      +{purchase.slots} Listing Slot{purchase.slots === 1 ? '' : 's'}
                    </span>
                    <span className="text-gray-500 block mt-0.5">
                      Current Allowance: {purchase.business?.marketplaceSlotAllowance ?? '—'}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-500 block mb-1">Amount</span>
                    <span className="text-sm font-bold text-gray-900">{formatNaira(Number(purchase.amount))}</span>
                    <span className="text-gray-500 block mt-0.5">
                      @ {formatNaira(Number(purchase.unitPrice))} / slot
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-500 block mb-1">Merchant Details</span>
                    <span className="font-semibold text-gray-900 block truncate">
                      {purchase.business?.user?.fullName || purchase.business?.businessName}
                    </span>
                    <span className="text-gray-500 block truncate">
                      {purchase.business?.user?.email || 'No email provided'}
                    </span>
                    {purchase.business?.user?.phone && (
                      <span className="text-gray-400 block truncate">{purchase.business.user.phone}</span>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-500 block mb-1">Proof Document</span>
                    {purchase.proofUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewProofUrl(purchase.proofUrl || null)}
                        className="inline-flex items-center gap-1 text-purple-600 font-medium hover:underline text-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Receipt File
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </button>
                    ) : (
                      <span className="text-gray-400 italic">No proof file (Wallet purchase)</span>
                    )}
                    {purchase.walletTxRef && (
                      <span className="text-gray-500 block mt-0.5 font-mono text-[10px] truncate">
                        Ref: {purchase.walletTxRef}
                      </span>
                    )}
                  </div>
                </div>

                {(purchase.rejectionReason || purchase.reviewedAt) && (
                  <div className="text-xs border-t border-gray-100 pt-2 flex flex-col sm:flex-row sm:items-center justify-between text-gray-500 gap-1">
                    {purchase.rejectionReason && (
                      <p>
                        <span className="font-semibold text-gray-700">Reason / Notes:</span> {purchase.rejectionReason}
                      </p>
                    )}
                    {purchase.reviewedAt && (
                      <p className="text-[11px] text-gray-400">
                        Reviewed on {formatStamp(purchase.reviewedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {slotTotalPages > 1 && (
            <div className="pt-4">
              <PaginationBar
                pagination={{
                  page: slotPage,
                  totalPages: slotTotalPages,
                  total: slotTotalCount,
                  hasPrev: slotPage > 1,
                  hasNext: slotPage < slotTotalPages,
                }}
                onPageChange={(p) => setSlotPage(p)}
                noun="slot purchases"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )}

      {/* ── REJECTION DIALOG MODAL ── */}
      <Modal
        isOpen={Boolean(rejectingProduct)}
        onClose={() => setRejectingProduct(null)}
        title="Reject Marketplace Listing"
        subtitle={rejectingProduct ? `Listing: "${rejectingProduct.name}"` : ''}
        icon={<X className="w-5 h-5 text-red-600" />}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setRejectingProduct(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmReject}
              disabled={isSubmittingReject || rejectionReason.trim().length < 3}
              isLoading={isSubmittingReject}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm Rejection &amp; Notify Merchant
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            The feedback provided below will be emailed directly to the merchant so they can correct their listing.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Quick Feedback Templates
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_REJECTION_REASONS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRejectionReason(preset)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[11px] rounded text-gray-700 transition text-left"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain clearly what needs to be fixed (e.g. photos are too dark, price is unrealistic, etc.)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              maxLength={500}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Minimum 3 characters</span>
              <span>{rejectionReason.length} / 500</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── TAKEDOWN DIALOG MODAL ── */}
      <Modal
        isOpen={Boolean(takedownProduct)}
        onClose={() => setTakedownProduct(null)}
        title="Take Down Marketplace Listing"
        subtitle={takedownProduct ? `Delisting: "${takedownProduct.name}"` : ''}
        icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setTakedownProduct(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmTakedown}
              disabled={isSubmittingTakedown || takedownReason.trim().length < 3}
              isLoading={isSubmittingTakedown}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Takedown
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            Taking down this product immediately changes its status to archived, removing it from the public WallX catalog.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Takedown <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={takedownReason}
              onChange={(e) => setTakedownReason(e.target.value)}
              placeholder="State the reason for removing this active listing..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{takedownReason.length} / 500 characters</p>
          </div>
        </div>
      </Modal>

      {/* ── SEND BACK MODAL ── */}
      <Modal
        isOpen={Boolean(sendBackProduct)}
        onClose={() => setSendBackProduct(null)}
        title="Send Back Product for Revision"
        subtitle={sendBackProduct ? `Re-reviewing: "${sendBackProduct.name}"` : ''}
        icon={<Undo2 className="w-5 h-5 text-amber-600" />}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setSendBackProduct(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSendBack}
              disabled={isSubmittingSendBack || sendBackReason.trim().length < 3}
              isLoading={isSubmittingSendBack}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Send Back
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            Sending this product back reverts its status to pending review, temporarily unlisting it from the public marketplace so the merchant can revise it.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Feedback Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="State what needs revision before this listing can be approved again..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              maxLength={500}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Minimum 3 characters</span>
              <span>{sendBackReason.length} / 500 characters</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── FULL INSPECTOR MODAL ── */}
      {inspectProduct && (
        <Modal
          isOpen={Boolean(inspectProduct)}
          onClose={() => setInspectProduct(null)}
          title={inspectProduct.name}
          subtitle={`Slug: /p/${inspectProduct.slug}`}
          icon={<Package className="w-5 h-5 text-purple-600" />}
          size="lg"
          footer={
            <div className="flex justify-end w-full">
              <Button variant="outline" onClick={() => setInspectProduct(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Image Gallery */}
            {inspectProduct.images && inspectProduct.images.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {inspectProduct.images.map((img, i) => (
                  <a
                    key={i}
                    href={img}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 group relative block"
                  >
                    <img src={img} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 p-1 bg-black/60 text-white rounded text-[10px]">
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </a>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full Description</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1 leading-relaxed">
                {inspectProduct.description}
              </p>
            </div>

            {inspectProduct.attributes && Object.keys(inspectProduct.attributes).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Full Technical Specifications
                </p>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(inspectProduct.attributes).map(([k, v]) => (
                    <div key={k}>
                      <span className="font-semibold text-gray-600 capitalize">{k}:</span>{' '}
                      <span className="text-gray-900">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── REJECT SLOT PROOF MODAL (Phase 11) ── */}
      <Modal
        isOpen={Boolean(rejectingSlot)}
        onClose={() => setRejectingSlot(null)}
        title="Reject Slot Purchase Proof"
        subtitle={rejectingSlot ? `Business: "${rejectingSlot.business?.businessName}"` : ''}
        icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setRejectingSlot(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmRejectSlot}
              disabled={isSubmittingSlotReject || slotRejectionReason.trim().length < 3}
              isLoading={isSubmittingSlotReject}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            Rejecting this proof will mark the request as rejected. The business listing allowance will NOT be increased.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={slotRejectionReason}
              onChange={(e) => setSlotRejectionReason(e.target.value)}
              placeholder="State why this proof was rejected (e.g. invalid receipt, payment amount mismatch, illegible image)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              maxLength={500}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Minimum 3 characters</span>
              <span>{slotRejectionReason.length} / 500</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── REFUND SLOT PURCHASE MODAL (Phase 11) ── */}
      <Modal
        isOpen={Boolean(refundingSlot)}
        onClose={() => setRefundingSlot(null)}
        title="Refund Slot Purchase"
        subtitle={refundingSlot ? `Business: "${refundingSlot.business?.businessName}"` : ''}
        icon={<RotateCcw className="w-5 h-5 text-amber-600" />}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setRefundingSlot(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmRefundSlot}
              disabled={isSubmittingRefund}
              isLoading={isSubmittingRefund}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Refund
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">Important Refund Rules:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>{refundingSlot ? formatNaira(Number(refundingSlot.amount)) : 'Amount'} will be credited back to the merchant's WallX wallet.</li>
              <li>The business slot allowance will be decremented by {refundingSlot?.slots || 1} slot(s).</li>
              <li>Refund cannot reduce allowance below currently active products. If merchant has live listings filling all slots, they must archive products first.</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refund Reason / Internal Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason for processing this refund (e.g. merchant requested cancellation, duplicate charge)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{refundReason.length} / 500 characters</p>
          </div>
        </div>
      </Modal>

      {/* ── PREVIEW PROOF MODAL (Phase 11) ── */}
      {previewProofUrl && (
        <Modal
          isOpen={Boolean(previewProofUrl)}
          onClose={() => setPreviewProofUrl(null)}
          title="Payment Proof Document"
          subtitle="Receipt submitted by merchant"
          icon={<FileText className="w-5 h-5 text-purple-600" />}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <a
                href={previewProofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
              >
                Open in new tab
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
              <Button variant="outline" onClick={() => setPreviewProofUrl(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="flex items-center justify-center p-2 bg-gray-100 rounded-lg max-h-[70vh] overflow-auto">
            {previewProofUrl.startsWith('data:application/pdf') || previewProofUrl.endsWith('.pdf') ? (
              <iframe
                src={previewProofUrl}
                className="w-full h-[60vh] rounded border border-gray-300"
                title="Proof PDF Preview"
              />
            ) : (
              <img
                src={previewProofUrl}
                alt="Proof of Payment"
                className="max-h-[65vh] w-auto object-contain rounded"
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
