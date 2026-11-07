import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  Pencil,
  Archive,
  ArchiveRestore,
  ShoppingBag,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Coins,
  ChevronRight,
  ChevronDown,
  Trash2,
  Lock,
  SlidersHorizontal,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import Modal from '@/components/ui/Modal.tsx';
import Input from '@/components/ui/Input.tsx';
import PhoneInput, { extractLocalNigerianDigits } from '@/components/ui/PhoneInput.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import NoBusinessPrompt from '@/components/NoBusinessPrompt.tsx';

import { useBusinessStore } from '@/stores/business.store.ts';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { getErrorMessage } from '@/lib/axios.ts';
import api from '@/lib/axios.ts';
import CustomerBonusControl from '@/components/voucher/CustomerBonusControl.tsx';
import {
  TopUpVoucherModal,
  AdjustBalanceModal,
  ChangePinModal,
  VoucherHistoryModal,
} from '@/components/customers/VoucherActionModals.tsx';
import { CrmDailyTotals } from '@/components/customers/CrmDailyTotals.tsx';
import type { TimelineItem, UpdateCustomerPayload, SalesTransaction, Invoice, CustomerHistoryQuery } from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name?: string | null) {
  if (!name) return 'CU';
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || 'CU'
  );
}

const TIMELINE_KIND_META: Record<
  TimelineItem['kind'],
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  sale: {
    label: 'Sale',
    icon: ShoppingBag,
    color: 'text-primary-700',
    bg: 'bg-primary-50',
    border: 'border-primary-200',
  },
  invoice: {
    label: 'Invoice',
    icon: FileText,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  credit: {
    label: 'Credit Issued',
    icon: Clock,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  credit_payment: {
    label: 'Repayment',
    icon: CheckCircle2,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  voucher: {
    label: 'Voucher',
    icon: CreditCard,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
};

/* ─── Main Component ───────────────────────────────────────── */

export default function CustomerDetail() {
  useDisplayCurrency();
  const { customerId } = useParams<{ customerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const myRole = activeBusiness?.myRole;
  const isManagerOrOwner = myRole === 'owner' || myRole === 'manager';
  const { blockIfNeeded } = useSubscriptionWriteGate();

  const {
    activeCustomer,
    activeCard,
    activeKpis,
    detailLoading,
    detailError,
    history,
    historyPagination,
    historyLoading,
    fetchCustomer,
    fetchHistory,
    updateCustomer,
    archiveCustomer,
    unarchiveCustomer,
    deleteCustomer,
    clearActiveCustomer,
  } = useCustomerStore();

  // History filter
  const [historyType, setHistoryType] = useState<CustomerHistoryQuery['type'] | 'all'>('all');
  const [historyPage, setHistoryPage] = useState<number>(1);

  // Tab-specific loaded data
  const [salesData, setSalesData] = useState<SalesTransaction[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [invoicesData, setInvoicesData] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Voucher action modals state
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Edit form collapsed sections state (default closed)
  const [showLocationSection, setShowLocationSection] = useState(false);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);

  // Copy state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<UpdateCustomerPayload>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    taxId: '',
    notes: '',
    voucherBonusPct: null,
  });

  // Initial fetch
  useEffect(() => {
    if (!activeBusiness?.id || !customerId) return;
    fetchCustomer(activeBusiness.id, customerId).catch(() => {});
    return () => {
      clearActiveCustomer();
    };
  }, [activeBusiness?.id, customerId, fetchCustomer, clearActiveCustomer]);

  // Sync edit form on customer load
  useEffect(() => {
    if (!activeCustomer) return;
    setEditForm({
      name: activeCustomer.name,
      email: activeCustomer.email || '',
      phone: activeCustomer.phone || '',
      address: activeCustomer.address || '',
      city: activeCustomer.city || '',
      state: activeCustomer.state || '',
      taxId: activeCustomer.taxId || '',
      notes: activeCustomer.notes || '',
      voucherBonusPct: activeCustomer.voucherBonusPct ?? null,
    });
  }, [activeCustomer]);

  // Fetch history when tab is overview
  useEffect(() => {
    if (!activeBusiness?.id || !customerId || currentTab !== 'overview') return;
    fetchHistory(activeBusiness.id, customerId, {
      page: historyPage,
      limit: 20,
      type: historyType === 'all' ? undefined : historyType,
    }).catch(() => {});
  }, [activeBusiness?.id, customerId, currentTab, historyPage, historyType, fetchHistory]);

  // Fetch sales when sales tab is selected
  useEffect(() => {
    if (!activeBusiness?.id || !customerId || currentTab !== 'sales') return;
    setSalesLoading(true);
    api
      .get(`/businesses/${activeBusiness.id}/sales`, {
        params: { customerId, limit: 50 },
      })
      .then((res) => {
        setSalesData(res.data.data || []);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load sales'));
      })
      .finally(() => setSalesLoading(false));
  }, [activeBusiness?.id, customerId, currentTab]);

  // Fetch invoices when invoices tab is selected
  useEffect(() => {
    if (!activeBusiness?.id || !customerId || currentTab !== 'invoices') return;
    setInvoicesLoading(true);
    api
      .get(`/businesses/${activeBusiness.id}/invoices`, {
        params: { search: activeCustomer?.name, limit: 50 },
      })
      .then((res) => {
        const invs = (res.data.data || []) as Invoice[];
        setInvoicesData(invs.filter((i) => i.customerId === customerId || i.customerName === activeCustomer?.name));
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load invoices'));
      })
      .finally(() => setInvoicesLoading(false));
  }, [activeBusiness?.id, customerId, currentTab, activeCustomer?.name]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`Copied ${field} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleToggleArchive = async () => {
    if (!activeBusiness?.id || !activeCustomer || !isManagerOrOwner) return;
    if (blockIfNeeded()) return;

    const willArchive = activeCustomer.isActive;
    const actionPromise = willArchive
      ? archiveCustomer(activeBusiness.id, activeCustomer.id)
      : unarchiveCustomer(activeBusiness.id, activeCustomer.id);

    try {
      await actionPromise;
      toast.success(willArchive ? 'Customer archived successfully' : 'Customer restored to active');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to update customer status'));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness?.id || !activeCustomer || !isManagerOrOwner) return;
    if (blockIfNeeded()) return;

    const trimmedName = editForm.name?.trim();
    if (!trimmedName) {
      toast.error('Customer name is required');
      return;
    }

    const trimmedPhone = editForm.phone?.trim();
    if (trimmedPhone) {
      const localDigits = extractLocalNigerianDigits(trimmedPhone);
      if (localDigits.length < 10) {
        toast.error('Phone number must contain at least 10 digits');
        return;
      }
    }

    const trimmedEmail = editForm.email?.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
    }

    let parsedBonus: number | null | undefined = undefined;
    if (
      editForm.voucherBonusPct !== null &&
      editForm.voucherBonusPct !== undefined &&
      editForm.voucherBonusPct !== ('' as unknown)
    ) {
      const numBonus = Number(editForm.voucherBonusPct);
      if (isNaN(numBonus) || numBonus < 0 || numBonus > 10) {
        toast.error('Voucher bonus must be between 0% and 10%');
        return;
      }
      parsedBonus = numBonus;
    } else {
      parsedBonus = null;
    }

    // Helper to compute dirty string field (omits if unchanged, null if explicitly cleared from prior non-empty value)
    const computeDirtyString = (currentVal: string | null | undefined, formVal: string | null | undefined) => {
      const curNorm = currentVal?.trim() || null;
      const formNorm = formVal?.trim() || null;
      if (formNorm === curNorm) return undefined;
      return formNorm === null ? null : formNorm;
    };

    const dirtyPayload: UpdateCustomerPayload = {
      name: trimmedName,
    };

    const dirtyEmail = computeDirtyString(activeCustomer.email, editForm.email);
    if (dirtyEmail !== undefined) dirtyPayload.email = dirtyEmail;

    const dirtyPhone = computeDirtyString(activeCustomer.phone, editForm.phone);
    if (dirtyPhone !== undefined) dirtyPayload.phone = dirtyPhone;

    const dirtyAddress = computeDirtyString(activeCustomer.address, editForm.address);
    if (dirtyAddress !== undefined) dirtyPayload.address = dirtyAddress;

    const dirtyCity = computeDirtyString(activeCustomer.city, editForm.city);
    if (dirtyCity !== undefined) dirtyPayload.city = dirtyCity;

    const dirtyState = computeDirtyString(activeCustomer.state, editForm.state);
    if (dirtyState !== undefined) dirtyPayload.state = dirtyState;

    const dirtyTaxId = computeDirtyString(activeCustomer.taxId, editForm.taxId);
    if (dirtyTaxId !== undefined) dirtyPayload.taxId = dirtyTaxId;

    const dirtyNotes = computeDirtyString(activeCustomer.notes, editForm.notes);
    if (dirtyNotes !== undefined) dirtyPayload.notes = dirtyNotes;

    const curBonus =
      activeCustomer.voucherBonusPct !== null && activeCustomer.voucherBonusPct !== undefined
        ? Number(activeCustomer.voucherBonusPct)
        : null;
    if (parsedBonus !== curBonus) {
      dirtyPayload.voucherBonusPct = parsedBonus;
    }

    setIsSaving(true);
    try {
      await updateCustomer(activeBusiness.id, activeCustomer.id, dirtyPayload);
      toast.success('Customer details updated');
      setIsEditModalOpen(false);
      await fetchCustomer(activeBusiness.id, activeCustomer.id);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to update customer'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeBusiness?.id || !activeCustomer || !isManagerOrOwner) return;
    if (blockIfNeeded()) return;

    setIsDeleting(true);
    try {
      await deleteCustomer(activeBusiness.id, activeCustomer.id);
      toast.success('Customer deleted');
      window.location.href = '/customers';
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to delete customer'));
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!activeBusiness) {
    return <NoBusinessPrompt />;
  }

  if (detailLoading) {
    return (
      <div className="space-y-6 animate-fade-in p-4 sm:p-6 lg:p-8">
        <div className="flex items-center space-x-4">
          <div className="h-10 w-24 bg-gray-200 animate-pulse rounded-lg" />
          <div className="h-10 w-48 bg-gray-200 animate-pulse rounded-lg" />
        </div>
        <div className="h-44 bg-gray-100 animate-pulse rounded-2xl" />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (detailError || !activeCustomer) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Link
          to="/customers"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Customers
        </Link>
        <ErrorState
          message={detailError || 'Customer not found'}
          onRetry={() => activeBusiness?.id && customerId && fetchCustomer(activeBusiness.id, customerId)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/50 to-white">
      <div className="space-y-6 pb-16 animate-fade-in p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* ─── Breadcrumb & Top Bar ────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Link
            to="/customers"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-white/60 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Customers</span>
          </Link>

          {isManagerOrOwner && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {activeCard && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (blockIfNeeded()) return;
                      setIsChangePinOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs"
                  >
                    <Lock className="h-3.5 w-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Change PIN</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (blockIfNeeded()) return;
                      setIsAdjustOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-purple-600" />
                    <span className="hidden sm:inline">Adjust Balance</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    subscriptionExempt={true}
                    onClick={() => setIsHistoryOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs"
                  >
                    <History className="h-3.5 w-3.5 text-gray-500" />
                    <span className="hidden md:inline">Voucher History</span>
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleToggleArchive}
                className={`inline-flex items-center gap-1.5 text-xs ${
                  activeCustomer.isActive ? 'text-gray-600 hover:text-amber-700' : 'text-emerald-700 hover:text-emerald-800'
                }`}
              >
                {activeCustomer.isActive ? (
                  <>
                    <Archive className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Archive</span>
                  </>
                ) : (
                  <>
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Restore</span>
                  </>
                )}
              </Button>
              {activeKpis?.orderCount === 0 && activeKpis?.totalInvoices === 0 && activeKpis?.totalCredits === 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="inline-flex items-center text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ─── Customer Profile Header Card ────────────────────── */}
        <Card className="overflow-hidden border-0 shadow-lg shadow-gray-100/50">
          <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 px-6 py-8">
            {/* Decorative gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mt-20 -mr-20" />
            
            <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white text-2xl font-bold shadow-xl flex-shrink-0">
                  {getInitials(activeCustomer.name)}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{activeCustomer.name}</h1>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                        activeCustomer.isActive
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/30'
                          : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          activeCustomer.isActive ? 'bg-emerald-300' : 'bg-gray-300'
                        }`}
                      />
                      {activeCustomer.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs text-primary-100">
                      Member since {formatDate(activeCustomer.createdAt)}
                    </p>
                    {activeKpis?.firstSeenAt && (
                      <>
                        <span className="text-primary-300">•</span>
                        <p className="text-xs text-primary-100">
                          First purchase {formatDate(activeKpis.firstSeenAt)}
                        </p>
                      </>
                    )}
                  </div>

                  {(isManagerOrOwner && activeBusiness?.id) || activeCustomer.voucherBonusPct !== null && activeCustomer.voucherBonusPct !== undefined ? (
                    <div className="pt-1">
                      {isManagerOrOwner && activeBusiness?.id ? (
                        <CustomerBonusControl
                          businessId={activeBusiness.id}
                          customerId={activeCustomer.id}
                          businessDefaultPct={activeBusiness.voucherBonusPct ?? 0}
                          personalPct={activeCustomer.voucherBonusPct}
                          onSaved={() => {
                            if (activeBusiness?.id && activeCustomer?.id) {
                              fetchCustomer(activeBusiness.id, activeCustomer.id);
                            }
                          }}
                        />
                      ) : (
                        activeCustomer.voucherBonusPct !== null && activeCustomer.voucherBonusPct !== undefined && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-100 border border-purple-400/30 backdrop-blur-sm">
                            <Coins className="h-3 w-3" />
                            {activeCustomer.voucherBonusPct}% Bonus Rate
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info Section */}
          <div className="bg-white p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeCustomer.phone ? (
                <button
                  onClick={() => copyToClipboard(activeCustomer.phone!, 'phone')}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-all text-left group border border-transparent hover:border-gray-200"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                      <p className="truncate font-medium text-sm font-mono">{activeCustomer.phone}</p>
                    </div>
                  </div>
                  {copiedField === 'phone' ? (
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-gray-400 border border-gray-100">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                    <p className="text-sm italic">Not provided</p>
                  </div>
                </div>
              )}

              {activeCustomer.email ? (
                <button
                  onClick={() => copyToClipboard(activeCustomer.email!, 'email')}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-all text-left group border border-transparent hover:border-gray-200"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Email</p>
                      <p className="truncate font-medium text-sm">{activeCustomer.email}</p>
                    </div>
                  </div>
                  {copiedField === 'email' ? (
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-gray-400 border border-gray-100">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm italic">Not provided</p>
                  </div>
                </div>
              )}

              {activeCustomer.address || activeCustomer.city || activeCustomer.state ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Location</p>
                    <p className="truncate font-medium text-sm">
                      {[activeCustomer.address, activeCustomer.city, activeCustomer.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-gray-400 border border-gray-100">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Location</p>
                    <p className="text-sm italic">Not provided</p>
                  </div>
                </div>
              )}

              {activeCustomer.taxId ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Tax ID (TIN)</p>
                    <p className="truncate font-medium text-sm font-mono">{activeCustomer.taxId}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-gray-400 border border-gray-100">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Tax ID (TIN)</p>
                    <p className="text-sm italic">Not provided</p>
                  </div>
                </div>
              )}
            </div>

            {activeCustomer.notes && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200/60">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-100">
                    <FileText className="h-3.5 w-3.5 text-amber-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-900 mb-1">Notes</p>
                    <p className="text-xs text-amber-800 leading-relaxed">{activeCustomer.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ─── 6-Card KPI Strip ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className="p-5 border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50/50">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <ShoppingBag className="h-5 w-5 text-emerald-700" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Spent</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
              {formatNaira(activeKpis?.totalSpent ?? 0)}
            </p>
            <p className="text-[11px] text-gray-500">Lifetime revenue</p>
          </Card>

          <Card className="p-5 border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50/50">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <CheckCircle2 className="h-5 w-5 text-blue-700" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Orders</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
              {activeKpis?.orderCount ?? 0}
            </p>
            <p className="text-[11px] text-gray-500">
              {activeKpis?.avgOrder ? `Avg: ${formatNaira(activeKpis.avgOrder)}` : 'No orders yet'}
            </p>
          </Card>

          <Card
            className={`p-5 border-0 shadow-md hover:shadow-lg transition-shadow ${
              (activeKpis?.outstandingCredit ?? 0) > 0
                ? 'bg-gradient-to-br from-rose-50 to-rose-100/50'
                : 'bg-gradient-to-br from-white to-gray-50/50'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${
                (activeKpis?.outstandingCredit ?? 0) > 0 ? 'bg-rose-200' : 'bg-gray-100'
              }`}>
                <AlertCircle className={`h-5 w-5 ${
                  (activeKpis?.outstandingCredit ?? 0) > 0 ? 'text-rose-700' : 'text-gray-500'
                }`} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Debt</span>
            </div>
            <p
              className={`text-2xl font-bold tracking-tight mb-1 ${
                (activeKpis?.outstandingCredit ?? 0) > 0 ? 'text-rose-700' : 'text-gray-900'
              }`}
            >
              {formatNaira(activeKpis?.outstandingCredit ?? 0)}
            </p>
            <p className="text-[11px] text-gray-500">
              {(activeKpis?.totalCredits ?? 0) > 0
                ? `${activeKpis?.totalCredits} credit line(s)`
                : 'No outstanding debt'}
            </p>
          </Card>

          <Card className="p-5 border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-purple-50 to-purple-100/50">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-purple-200">
                <CreditCard className="h-5 w-5 text-purple-700" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Store Card</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 tracking-tight mb-1">
              {formatNaira(activeCard?.balance ?? activeKpis?.voucherBalance ?? 0)}
            </p>
            <p className="text-[11px] text-gray-600 font-mono">
              {activeCard?.cardCode ? activeCard.cardCode : 'Not activated'}
            </p>
          </Card>

          <Card className="p-5 border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50/50">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <FileText className="h-5 w-5 text-amber-700" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Invoices</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
              {activeKpis?.totalInvoices ?? 0}
            </p>
            <p className="text-[11px] text-gray-500">Total issued</p>
          </Card>

          <Card className="p-5 border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50/50">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-gray-100">
                <Clock className="h-5 w-5 text-gray-700" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Last Order</span>
            </div>
            <p className="text-sm font-bold text-gray-900 tracking-tight mb-1 truncate">
              {activeKpis?.lastPurchaseAt ? formatDate(activeKpis.lastPurchaseAt) : 'Never'}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {activeKpis?.lastPurchaseAt ? 'Most recent' : 'No activity'}
            </p>
          </Card>
        </div>

        {/* ─── Tabs Navigation ─────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 -mb-px">
          {[
            { id: 'overview', label: 'Timeline & History' },
            { id: 'sales', label: `Sales (${activeKpis?.orderCount ?? 0})` },
            { id: 'invoices', label: `Invoices (${activeKpis?.totalInvoices ?? 0})` },
            { id: 'credits', label: `Credit Obligations (${activeKpis?.totalCredits ?? 0})` },
            { id: 'vouchers', label: 'Store Card' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`py-3.5 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                currentTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Tab Content: Overview (Unified Timeline) ────────── */}
      {currentTab === 'overview' && (
        <div className="space-y-4">
          {/* Sub-filter chips */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            {[
              { id: 'all' as const, label: 'All Activity' },
              { id: 'sale' as const, label: 'Sales Only' },
              { id: 'invoice' as const, label: 'Invoices Only' },
              { id: 'credit' as const, label: 'Credits Issued' },
              { id: 'credit_payment' as const, label: 'Repayments' },
              { id: 'voucher' as const, label: 'Card Ledgers' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => {
                  setHistoryType(chip.id);
                  setHistoryPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  historyType === chip.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {historyLoading ? (
            <TableSkeleton rows={6} />
          ) : history.length === 0 ? (
            <EmptyState message="No activity recorded for this customer yet." icon={ShoppingBag} />
          ) : (
            <Card className="divide-y divide-gray-100 border border-gray-200/80 shadow-sm">
              {history.map((item) => {
                const meta = TIMELINE_KIND_META[item.kind] || TIMELINE_KIND_META.sale;
                const Icon = meta.icon;
                return (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-gray-50/70 transition-colors flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start space-x-3.5 min-w-0">
                      <div className={`p-2.5 rounded-xl ${meta.bg} ${meta.color} flex-shrink-0 mt-0.5`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{item.title}</span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${meta.bg} ${meta.color} border ${meta.border}`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs text-gray-400">• {formatDateTime(item.date)}</span>
                        </div>
                        {item.subtitle && <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>}
                        {item.refId && (
                          <p className="text-[11px] font-mono text-gray-400">Ref: {item.refId}</p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg mt-1 italic border border-gray-100">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-sm font-bold text-gray-900 font-mono tracking-tight">
                        {formatNaira(item.amount)}
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          item.status === 'confirmed' || item.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.status === 'overdue' || item.status === 'written_off'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Pagination */}
          {historyPagination && historyPagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">
                Showing page {historyPagination.page} of {historyPagination.totalPages} (
                {historyPagination.total} total events)
              </p>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!historyPagination.hasPrev}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!historyPagination.hasNext}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab Content: Sales ──────────────────────────────── */}
      {currentTab === 'sales' && (
        <div className="space-y-4">
          {salesLoading ? (
            <TableSkeleton rows={5} />
          ) : salesData.length === 0 ? (
            <EmptyState message="No sales records linked to this customer yet." icon={ShoppingBag} />
          ) : (
            <Card className="divide-y divide-gray-100 border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase text-gray-500 grid grid-cols-12 gap-4">
                <span className="col-span-3">Reference / Description</span>
                <span className="col-span-3">Date</span>
                <span className="col-span-2">Source</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-2 text-right">Status</span>
              </div>
              {salesData.map((s) => (
                <div
                  key={s.id}
                  className="px-4 py-3.5 hover:bg-gray-50/70 transition-colors grid grid-cols-12 gap-4 items-center text-sm"
                >
                  <div className="col-span-3 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {s.description || s.referenceId || 'Standard Sale'}
                    </p>
                    {s.referenceId && <p className="text-xs font-mono text-gray-400 truncate">{s.referenceId}</p>}
                  </div>
                  <div className="col-span-3 text-xs text-gray-500">{formatDateTime(s.transactionDate)}</div>
                  <div className="col-span-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 capitalize">
                      {s.source.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-mono font-semibold text-gray-900">
                    {formatNaira(s.amount)}
                  </div>
                  <div className="col-span-2 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        s.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : s.status === 'reversed'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ─── Tab Content: Invoices ───────────────────────────── */}
      {currentTab === 'invoices' && (
        <div className="space-y-4">
          {invoicesLoading ? (
            <TableSkeleton rows={5} />
          ) : invoicesData.length === 0 ? (
            <EmptyState message="No invoices issued to this customer." icon={FileText} />
          ) : (
            <Card className="divide-y divide-gray-100 border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="bg-gray-50/80 px-4 py-3 text-xs font-semibold uppercase text-gray-500 grid grid-cols-12 gap-4">
                <span className="col-span-3">Invoice Number</span>
                <span className="col-span-3">Issue / Due Date</span>
                <span className="col-span-2 text-right">Total</span>
                <span className="col-span-2 text-right">Status</span>
                <span className="col-span-2 text-right">Action</span>
              </div>
              {invoicesData.map((inv) => (
                <div
                  key={inv.id}
                  className="px-4 py-3.5 hover:bg-gray-50/70 transition-colors grid grid-cols-12 gap-4 items-center text-sm"
                >
                  <div className="col-span-3 font-mono font-semibold text-gray-900">
                    {inv.invoiceNumber}
                  </div>
                  <div className="col-span-3 text-xs text-gray-500 space-y-0.5">
                    <p>Issued: {formatDate(inv.issueDate)}</p>
                    <p>Due: {formatDate(inv.dueDate)}</p>
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-gray-900">
                    {formatNaira(inv.total)}
                  </div>
                  <div className="col-span-2 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        inv.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700'
                          : inv.status === 'overdue'
                          ? 'bg-rose-50 text-rose-700'
                          : inv.status === 'sent'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium inline-flex items-center"
                    >
                      View <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ─── Tab Content: Credit Obligations ─────────────────── */}
      {currentTab === 'credits' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Credit sales and repayments tracked in the debtor ledger for this client.
            </p>
            <Link to="/debtors" className="text-xs text-primary-600 hover:underline font-medium">
              Open Full Debtors Ledger →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 border border-amber-200/80 bg-amber-50/20">
              <p className="text-xs font-semibold uppercase text-amber-800">Outstanding Balance</p>
              <p className="text-3xl font-extrabold text-amber-900 mt-2 font-mono">
                {formatNaira(activeKpis?.outstandingCredit ?? 0)}
              </p>
              <p className="text-xs text-amber-700/80 mt-1">
                Total credit obligations remaining unpaid.
              </p>
            </Card>

            <Card className="p-5 border border-emerald-200/80 bg-emerald-50/20">
              <p className="text-xs font-semibold uppercase text-emerald-800">Total Repaid</p>
              <p className="text-3xl font-extrabold text-emerald-900 mt-2 font-mono">
                {formatNaira(activeKpis?.totalCreditPayments ?? 0)}
              </p>
              <p className="text-xs text-emerald-700/80 mt-1">
                Total recoveries credited towards debtor ledger.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ─── Tab Content: Store Card (Vouchers) ───────────────── */}
      {currentTab === 'vouchers' && (
        <div className="space-y-6">
          {(myRole === 'manager' || myRole === 'owner') && activeBusiness?.id ? (
            <CrmDailyTotals businessId={activeBusiness.id} />
          ) : null}

          {activeCard && isManagerOrOwner && (
            <div className="flex items-center justify-end gap-2 flex-wrap pb-2 border-b border-gray-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (blockIfNeeded()) return;
                  setIsTopUpOpen(true);
                }}
                className="text-xs py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
              >
                + Top Up Voucher
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (blockIfNeeded()) return;
                  setIsAdjustOpen(true);
                }}
                className="text-xs py-1.5 px-3 text-purple-700 hover:text-purple-800 hover:bg-purple-50"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                Adjust Balance
              </Button>
              <Button
                variant="secondary"
                size="sm"
                subscriptionExempt={true}
                onClick={() => setIsHistoryOpen(true)}
                className="text-xs py-1.5 px-3 text-gray-700 hover:text-gray-900"
              >
                <History className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
                View Full Voucher Statement
              </Button>
            </div>
          )}

          {activeCard ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Virtual Card Preview */}
              <div className="rounded-2xl p-6 bg-gradient-to-tr from-gray-900 via-gray-800 to-primary-950 text-white shadow-xl relative overflow-hidden flex flex-col justify-between h-56">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-primary-500/20 rounded-full blur-2xl" />
                <div className="flex justify-between items-start z-10">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-primary-300 font-semibold">Store Card</p>
                    <p className="text-sm font-bold mt-1 text-gray-200">{activeBusiness.businessName}</p>
                  </div>
                  <CreditCard className="h-6 w-6 text-primary-400" />
                </div>
                <div className="z-10">
                  <p className="text-xs text-gray-400 font-mono tracking-wider">Card Code</p>
                  <p className="text-xl font-mono tracking-widest font-bold text-gray-100">{activeCard.cardCode}</p>
                </div>
                <div className="flex justify-between items-end z-10 pt-2 border-t border-white/10">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Customer</p>
                    <p className="text-sm font-semibold">{activeCustomer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</p>
                    <p className="text-lg font-bold font-mono text-emerald-400">{formatNaira(activeCard.balance)}</p>
                  </div>
                </div>
              </div>

              {/* Card Details & Actions */}
              <Card className="p-6 border border-gray-200/80 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-gray-900">Virtual Card Privileges</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Status</span>
                    <span className="font-semibold text-emerald-700">
                      {activeCard.isActive ? 'Active' : 'Frozen'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500">Personal Bonus Rate</span>
                    {isManagerOrOwner ? (
                      <CustomerBonusControl
                        businessId={activeBusiness.id}
                        customerId={activeCustomer.id}
                        businessDefaultPct={activeBusiness.voucherBonusPct ?? 0}
                        personalPct={activeCustomer.voucherBonusPct}
                        onSaved={() => {
                          if (activeBusiness?.id && activeCustomer?.id) {
                            fetchCustomer(activeBusiness.id, activeCustomer.id);
                          }
                        }}
                      />
                    ) : (
                      <span className="font-semibold text-gray-900">
                        {activeCustomer.voucherBonusPct !== null && activeCustomer.voucherBonusPct !== undefined
                          ? `${activeCustomer.voucherBonusPct}%`
                          : `Default (${activeBusiness.voucherBonusPct ?? 0}%)`}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Card Issued</span>
                    <span className="font-mono text-xs text-gray-700">{formatDate(activeCard.createdAt)}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <Link to="/customers" className="text-xs text-primary-600 hover:underline font-medium">
                    Manage voucher top-ups on Customers directory →
                  </Link>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed border-2 border-gray-200">
              <CreditCard className="mx-auto h-10 w-10 text-gray-300" />
              <h3 className="mt-3 text-base font-bold text-gray-900">No Virtual Store Card</h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                This client does not have a virtual store card assigned yet. Virtual cards allow cash-change crediting and loyalty top-ups.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ─── Edit Customer Modal ──────────────────────────────── */}
      {/* ─── Edit Customer Modal (3 Progressive Disclosure Sections) ─── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer Profile"
        subtitle="Name, phone and email are enough. Add address, TIN or a personal bonus only if you need them."
        icon={<Pencil className="h-5 w-5 text-primary-600" />}
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-3 w-full">
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button form="edit-customer-form" type="submit" isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        }
      >
        <form id="edit-customer-form" onSubmit={handleSaveEdit} className="space-y-4">
          {/* Section 1: Identity (Always Visible) */}
          <div className="space-y-3.5">
            <Input
              label="Full Name *"
              value={editForm.name || ''}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              autoFocus
              placeholder="e.g. Adebayo Ogunlesi"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <PhoneInput
                  label="Phone Number"
                  value={editForm.phone || ''}
                  onChange={(val) => setEditForm((prev) => ({ ...prev, phone: val }))}
                  placeholder="0803 123 4567"
                  helperText="Needed for voucher PIN / last-4. Saved as +234…"
                />
              </div>
              <div>
                <Input
                  label="Email Address"
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="client@example.com"
                />
                <p className="text-[11px] text-gray-500 mt-1">For PIN and receipts. Optional but recommended.</p>
              </div>
            </div>
          </div>

          {/* Section 2: Location (Collapsed Disclosure, Default Closed) */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLocationSection((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100/80 text-left transition-colors text-xs font-semibold text-gray-700"
            >
              <span>Location & Address (Optional)</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform ${showLocationSection ? 'rotate-180' : ''}`}
              />
            </button>
            {showLocationSection && (
              <div className="p-3.5 space-y-3 bg-white border-t border-gray-100">
                <Input
                  label="Street Address"
                  value={editForm.address || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="12 Commercial Avenue"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="City"
                    value={editForm.city || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="Ikeja"
                  />
                  <Input
                    label="State"
                    value={editForm.state || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, state: e.target.value }))}
                    placeholder="Lagos"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Advanced (Collapsed Disclosure, Default Closed) */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedSection((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100/80 text-left transition-colors text-xs font-semibold text-gray-700"
            >
              <span>Advanced Settings — TIN & Personal Bonus (Optional)</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform ${showAdvancedSection ? 'rotate-180' : ''}`}
              />
            </button>
            {showAdvancedSection && (
              <div className="p-3.5 space-y-3.5 bg-white border-t border-gray-100">
                <div>
                  <Input
                    label="Tax Identification Number — TIN (optional, B2B only)"
                    value={editForm.taxId || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, taxId: e.target.value }))}
                    placeholder="Leave blank"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Only needed when this customer requires a TIN on invoices for VAT reclaim. Leave blank for walk-in / retail customers.
                  </p>
                </div>

                <div>
                  <Input
                    label="Voucher Bonus % (Optional)"
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={
                      editForm.voucherBonusPct !== null && editForm.voucherBonusPct !== undefined
                        ? editForm.voucherBonusPct
                        : ''
                    }
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        voucherBonusPct: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    placeholder={
                      activeBusiness?.voucherBonusPct ? `Store ${activeBusiness.voucherBonusPct}% (leave blank)` : 'e.g. 5'
                    }
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Leave blank to use store default ({activeBusiness?.voucherBonusPct ?? 0}%). Maximum 10%.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white transition-all"
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Special customer preferences, delivery notes, etc."
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* ─── Delete Confirmation Modal ───────────────────────── */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Customer Profile"
        icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
        size="sm"
        footer={
          <div className="flex items-center justify-end space-x-3 w-full">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={isDeleting}>
              Confirm Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to permanently delete{' '}
          <strong className="text-gray-900">{activeCustomer.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          This operation is only allowed for customers with zero sales, invoice, or credit history.
        </p>
      </Modal>

      {/* ─── Voucher Action Modals ────────────────────────────── */}
      <TopUpVoucherModal
        isOpen={isTopUpOpen}
        businessId={activeBusiness.id}
        customer={activeCustomer}
        onClose={() => setIsTopUpOpen(false)}
        onSuccess={() => {
          fetchCustomer(activeBusiness.id, activeCustomer.id);
        }}
      />

      <AdjustBalanceModal
        isOpen={isAdjustOpen}
        businessId={activeBusiness.id}
        customer={activeCustomer}
        onClose={() => setIsAdjustOpen(false)}
        onSuccess={() => {
          fetchCustomer(activeBusiness.id, activeCustomer.id);
        }}
      />

      <ChangePinModal
        isOpen={isChangePinOpen}
        businessId={activeBusiness.id}
        customer={activeCustomer}
        onClose={() => setIsChangePinOpen(false)}
        onSuccess={() => {
          fetchCustomer(activeBusiness.id, activeCustomer.id);
        }}
      />

      <VoucherHistoryModal
        isOpen={isHistoryOpen}
        businessId={activeBusiness.id}
        customer={activeCustomer}
        onClose={() => setIsHistoryOpen(false)}
      />
      </div>
    </div>
  );
}
