import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  CreditCard,
  Plus,
  Search,
  ArrowUpRight,
  History,
  Wallet,
  Coins,
  RefreshCw,
  UserCheck,
  Loader2,
  KeyRound,
  Gift,
  Sparkles,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import Modal from '@/components/ui/Modal.tsx';
import PhoneInput from '@/components/ui/PhoneInput.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { getErrorMessage } from '@/lib/axios.ts';
import { maskPhoneSuffix, formatNaira } from '@/lib/format';
import { TopUpVoucherModal } from '@/components/customers/VoucherActionModals.tsx';
import VoucherRequestsTab from '@/components/customers/VoucherRequestsTab.tsx';
import type { Customer } from '@/types/index.ts';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || 'CU'
  );
}

export default function Customers() {
  useDisplayCurrency();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const myRole = activeBusiness?.myRole;
  const isManagerOrOwner = myRole === 'owner' || myRole === 'manager';
  const { blockIfNeeded } = useSubscriptionWriteGate();

  const {
    customers,
    pagination,
    loading: customersLoading,
    stats,
    statsLoading,
    activities,
    activityPagination,
    activityLoading,
    searchCustomers,
    fetchStats,
    fetchActivity,
    quickCreateCustomer,
    resendVoucherPin,
  } = useCustomerStore();

  const [activeTab, setActiveTab] = useState<'customers' | 'logs' | 'requests'>('customers');

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter & Search states
  const [customerSearch, setCustomerSearch] = useState(() => searchParams.get('search') || '');
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState(() => searchParams.get('search') || '');
  const [customerPage, setCustomerPage] = useState(1);

  const [logSearch, setLogSearch] = useState('');
  const [logType, setLogType] = useState<string>('');
  const [logPage, setLogPage] = useState(1);

  // Modals state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Top Up Modal state (managed via shared TopUpVoucherModal)
  const [selectedCustomerForTopUp, setSelectedCustomerForTopUp] = useState<Customer | null>(null);

  // 300ms debounce sync for customer search with URL search param
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearch);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (customerSearch.trim()) {
            next.set('search', customerSearch.trim());
          } else {
            next.delete('search');
          }
          return next;
        },
        { replace: true }
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, setSearchParams]);

  // Initial fetch
  useEffect(() => {
    if (!activeBusiness?.id) return;
    fetchStats(activeBusiness.id);
  }, [activeBusiness?.id, fetchStats]);

  useEffect(() => {
    if (!activeBusiness?.id) return;
    searchCustomers(activeBusiness.id, debouncedCustomerSearch || undefined, customerPage, 15);
  }, [activeBusiness?.id, debouncedCustomerSearch, customerPage, searchCustomers]);

  useEffect(() => {
    if (!activeBusiness?.id || activeTab !== 'logs') return;
    fetchActivity(activeBusiness.id, {
      search: logSearch || undefined,
      type: logType || undefined,
      page: logPage,
      limit: 20,
    });
  }, [activeBusiness?.id, activeTab, logSearch, logType, logPage, fetchActivity]);

  const handleRefresh = () => {
    if (!activeBusiness?.id) return;
    fetchStats(activeBusiness.id);
    if (activeTab === 'customers') {
      searchCustomers(activeBusiness.id, debouncedCustomerSearch || undefined, customerPage, 15);
    } else {
      fetchActivity(activeBusiness.id, {
        search: logSearch || undefined,
        type: logType || undefined,
        page: logPage,
        limit: 20,
      });
    }
    toast.success('CRM refreshed');
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockIfNeeded()) return;
    if (!activeBusiness?.id || !newName.trim() || !newPhone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }

    setIsSavingCustomer(true);
    try {
      const created = await quickCreateCustomer(activeBusiness.id, {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      toast.success(`Customer ${created.name} added with Virtual Card!`);
      setIsAddCustomerOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      fetchStats(activeBusiness.id);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to create customer'));
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleResendPin = async (customer: Customer) => {
    if (blockIfNeeded()) return;
    if (!activeBusiness?.id) return;
    try {
      const res = await resendVoucherPin(activeBusiness.id, customer.id);
      toast.success(res.message || 'New PIN sent to customer email');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to resend PIN'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            Customer CRM & Virtual Store Cards
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage prepaid customer vouchers, digital change cards, and audit transaction logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            subscriptionExempt={true}
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (blockIfNeeded()) return;
              setIsAddCustomerOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Quick-Add Customer
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-3.5 bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 border-emerald-200">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Circulating Vouchers</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold text-emerald-900">
            {statsLoading ? '...' : formatNaira(stats?.circulatingBalance || 0)}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Store liability balance</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-blue-50/70 to-blue-100/30 border-blue-200">
          <div className="flex items-center justify-between text-blue-700 text-xs font-semibold">
            <span>Total Customers</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold text-blue-900">
            {statsLoading ? '...' : (stats?.totalCustomers || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-blue-600 mt-0.5">Registered accounts</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-teal-50/70 to-teal-100/30 border-teal-200">
          <div className="flex items-center justify-between text-teal-700 text-xs font-semibold">
            <span>Active Store Cards</span>
            <CreditCard className="w-4 h-4 text-teal-600" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold text-teal-900">
            {statsLoading ? '...' : (stats?.totalCards || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-teal-600 mt-0.5">Issued virtual cards</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-indigo-100/30 border-indigo-200">
          <div className="flex items-center justify-between text-indigo-700 text-xs font-semibold">
            <span>Change Credited</span>
            <Coins className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold text-indigo-900">
            {statsLoading ? '...' : formatNaira(stats?.monthChangeCredited || 0)}
          </p>
          <p className="text-[10px] text-indigo-600 mt-0.5">This month</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-amber-50/70 to-amber-100/30 border-amber-200">
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span>Vouchers Redeemed</span>
            <ArrowUpRight className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold text-amber-900">
            {statsLoading ? '...' : formatNaira(stats?.monthRedeemed || 0)}
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">Sales paid this month</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-violet-50/70 to-fuchsia-50/50 border-violet-200 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-100/50" />
          <div className="relative flex items-center justify-between text-violet-700 text-xs font-semibold">
            <span className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Bonus Given</span>
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <p className="relative mt-2 text-lg sm:text-xl font-bold text-violet-900">
            {statsLoading ? '...' : formatNaira(stats?.monthBonusGiven || 0)}
          </p>
          <p className="relative text-[10px] text-violet-600 mt-0.5">Extra thank-you this month</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('customers')}
            className={`py-2.5 px-1 border-b-2 font-medium text-xs flex items-center gap-2 transition-colors ${
              activeTab === 'customers'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Customers & Virtual Cards
            {pagination && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-100 text-gray-600">
                {pagination.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2.5 px-1 border-b-2 font-medium text-xs flex items-center gap-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <History className="w-4 h-4" />
            Activity & Audit Logs ("Who Did What")
            {activityPagination && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-100 text-gray-600">
                {activityPagination.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-2.5 px-1 border-b-2 font-medium text-xs flex items-center gap-2 transition-colors ${
              activeTab === 'requests'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            Voucher Requests
          </button>
        </nav>
      </div>

      {/* Tab 1: Customers & Cards */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer name or phone..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {pagination && (
              <span className="text-xs text-gray-400">
                Showing {customers.length} of {pagination.total} customers
              </span>
            )}
          </div>

          {/* Customer Table */}
          {customersLoading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Users}
              message="No customers found. Click '+ Quick-Add Customer' to register your first customer."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Voucher Balance
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Date Registered
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {customers.map((c) => {
                    const balance = c.card ? Number(c.card.balance) : 0;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{c.name}</div>
                              {c.email && <div className="text-[11px] text-gray-400">{c.email}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {c.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">{c.phone}</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-semibold border border-blue-100">
                                ●●{maskPhoneSuffix(c.phone)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block font-bold text-xs px-2 py-0.5 rounded-full w-fit ${
                              balance > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {formatNaira(balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {c.createdAt ? formatDate(c.createdAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (blockIfNeeded()) return;
                                setSelectedCustomerForTopUp(c);
                              }}
                              className="text-xs py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                            >
                              + Top Up Voucher
                            </Button>
                            {isManagerOrOwner && c.card && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResendPin(c);
                                }}
                                className="text-xs py-1 px-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                                title="Resend voucher PIN to customer email"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    Page <span className="font-semibold text-gray-900">{customerPage}</span> of{' '}
                    <span className="font-semibold text-gray-900">{pagination.totalPages}</span> ({pagination.total} customers)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={customerPage <= 1 || customersLoading}
                      onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                      className="text-xs py-1 px-2.5"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={customerPage >= pagination.totalPages || customersLoading}
                      onClick={() => setCustomerPage((p) => p + 1)}
                      className="text-xs py-1 px-2.5"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Activity & Audit Logs ("Who Did What") */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Log Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer, staff or receipt..."
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <select
                value={logType}
                onChange={(e) => {
                  setLogType(e.target.value);
                  setLogPage(1);
                }}
                className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">All Transaction Types</option>
                <option value="change_credit">Change Deposit</option>
                <option value="sale_debit">Voucher Payment (Sale)</option>
                <option value="top_up">Prepaid Top-Up</option>
                <option value="adjustment">Manual Adjustment</option>
              </select>
            </div>
            {activityPagination && (
              <span className="text-xs text-gray-400">
                {activityPagination.total} audit entries
              </span>
            )}
          </div>

          {/* Activity Logs Table */}
          {activityLoading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : activities.length === 0 ? (
            <EmptyState
              icon={History}
              message="No voucher transactions recorded yet. Activity will appear here when cash change is deposited or vouchers are redeemed."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Customer / Card
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Action Type
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Balance Delta
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Performed By (Staff / Owner)
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                      Notes / Reference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activities.map((act) => {
                    const badgeMap: Record<string, { label: string; cls: string }> = {
                      change_credit: {
                        label: 'Change Deposit',
                        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      },
                      sale_debit: {
                        label: 'Voucher Redeemed',
                        cls: 'bg-teal-100 text-teal-800 border-teal-200',
                      },
                      top_up: {
                        label: 'Top-Up Deposit',
                        cls: 'bg-blue-100 text-blue-800 border-blue-200',
                      },
                      adjustment: {
                        label: 'Adjustment',
                        cls: 'bg-purple-100 text-purple-800 border-purple-200',
                      },
                    };
                    const badge = badgeMap[act.type] || {
                      label: act.type,
                      cls: 'bg-gray-100 text-gray-700 border-gray-200',
                    };

                    const isCredit = act.type === 'change_credit' || act.type === 'top_up' || (act.type === 'adjustment' && act.balanceAfter > act.balanceBefore);

                    return (
                      <tr key={act.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                          {formatDateTime(act.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-gray-900">{act.customerName}</div>
                          {act.customerPhone && (
                            <div className="text-[11px] text-gray-400 font-mono">●●{maskPhoneSuffix(act.customerPhone)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-bold">
                          <span className={isCredit ? 'text-emerald-700' : 'text-rose-700'}>
                            {isCredit ? '+' : '-'} {formatNaira(act.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-gray-500">
                          {formatNaira(act.balanceBefore)} →{' '}
                          <span className="font-semibold text-gray-900">{formatNaira(act.balanceAfter)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900 flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-primary-600" />
                            {act.performerName}
                          </div>
                          {act.performerEmail && (
                            <div className="text-[10px] text-gray-400">{act.performerEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                          {act.receiptNumber && (
                            <span className="font-mono text-[11px] font-bold text-gray-800 mr-1.5">
                              #{act.receiptNumber}
                            </span>
                          )}
                          <span>{act.notes || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Voucher Requests Queue */}
      {activeTab === 'requests' && activeBusiness && (
        <VoucherRequestsTab
          businessId={activeBusiness.id}
          isManagerOrOwner={isManagerOrOwner}
          isOwner={myRole === 'owner'}
          threshold={activeBusiness.voucherAdjustmentThreshold ?? 50000}
        />
      )}

      {/* Quick-Add Customer Modal */}
      <Modal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        title="Quick-Add Customer"
        subtitle="Register customer and generate their virtual store card"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-3.5 py-1">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Customer Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Alhaji Babangida"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <PhoneInput
              value={newPhone}
              onChange={setNewPhone}
              placeholder="08012345678"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">Used for virtual store voucher security and change alerts.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Email Address (Optional)
            </label>
            <input
              type="email"
              placeholder="e.g. babangida@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Regular shop customer, preferred items..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div className="pt-3 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddCustomerOpen(false)}
              disabled={isSavingCustomer}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSavingCustomer || !newName.trim() || !newPhone.trim()}
              className="bg-primary-600 hover:bg-primary-700 text-white text-xs"
            >
              {isSavingCustomer ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  Creating...
                </>
              ) : (
                'Create & Issue Card'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Top-Up Voucher Modal (MOVED to CustomerDetail + VoucherActionModals.tsx) */}
      <TopUpVoucherModal
        isOpen={Boolean(selectedCustomerForTopUp)}
        businessId={activeBusiness?.id || ''}
        customer={selectedCustomerForTopUp}
        onClose={() => setSelectedCustomerForTopUp(null)}
        onSuccess={() => {
          if (activeBusiness?.id) {
            searchCustomers(activeBusiness.id, debouncedCustomerSearch || undefined, customerPage, 15);
            fetchStats(activeBusiness.id);
          }
        }}
      />
    </div>
  );
}
