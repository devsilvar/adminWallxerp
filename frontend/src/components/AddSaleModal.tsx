/**
 * AddSaleModal — create or edit a sale in a modal (bottom sheet on phones).
 *
 * Form logic moved verbatim from the former inline form in `pages/Sales.tsx`
 * (create POST / edit PUT + conditional classification verify). The modal owns
 * its own state, so typing never re-renders the parent list.
 *
 * Footer contract: the submit button lives in the Modal footer (outside the
 * <form> element) and targets the form via `form="add-sale-form"`.
 */
import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { TrendingUp, Package, Banknote, HandCoins, CreditCard, ShieldCheck, AlertCircle, CheckCircle2, UserPlus } from 'lucide-react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import { useCreditStore } from '@/stores/credit.store.ts';
import { paymentTypeLabel } from '@/lib/paymentTypes.ts';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { SalesTransaction, SaleLineItem, Customer, CustomerCredit, CreateCreditPayload, VoucherLedgerRequest } from '@/types/index.ts';
import PhoneInput from '@/components/ui/PhoneInput.tsx';
import { useCustomerStore } from '@/stores/customer.store.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate.ts';
import SaleItemsEditor from './SaleItemsEditor.tsx';
import CustomerAutocomplete from '@/components/customers/CustomerAutocomplete.tsx';
import VoucherAuthModal from '@/components/customers/VoucherAuthModal.tsx';
import CustomerVoucherCreateModal from '@/components/customers/CustomerVoucherCreateModal.tsx';
import { useSSE } from '@/hooks/useSSE';
import { formatMoney } from '@/lib/currency';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

const SOURCES = [
  'bank_transfer',
  'paycode',
  'pos',
  'online_store',
  'cash',
  'invoice',
  'store_voucher',
] as const;
const CREDIT_SOURCE = 'credit' as const;

// 'manual' is retired from the UI (migration 20260904120000_retire_manual_source
// mapped old rows to 'cash') but the backend still accepts it — sourceOptions
// below keeps any retired value selectable when editing a legacy row.

type TransactionClassification = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};

type AddSaleModalProps = {
  isOpen: boolean;
  businessId: string;
  /** When set, the modal is in EDIT mode and pre-fills from this sale */
  editSale: SalesTransaction | null;
  onClose: () => void;
  /** Called after a successful create/update so the parent refetches.
   *  outcome lets the parent decide page-reset (create) vs stay-on-page (edit). */
  onSaved: (outcome: 'created' | 'updated') => void;
};

/** Extracts the API error message without `any` (rules.txt). */
function getApiErrorMessage(err: unknown, fallback: string): string {
  const apiErr = (
    err as { response?: { data?: { error?: { message?: string } } } }
  )?.response?.data?.error;
  return apiErr?.message || fallback;
}

export default function AddSaleModal({
  isOpen,
  businessId,
  editSale,
  onClose,
  onSaved,
}: AddSaleModalProps) {
  useDisplayCurrency();
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);

  // Mode: 'items' (Products / Goods) or 'single' (Service / Flat Amount)
  const [mode, setMode] = useState<'single' | 'items'>('items');
  const [items, setItems] = useState<SaleLineItem[]>([
    { name: '', quantity: 1, unitPrice: 0 },
  ]);

  // Form state (moved from Sales.tsx)
  const customers = useCustomerStore((s) => s.customers);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<string>('cash');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [classification, setClassification] = useState('');
  const [originalClassification, setOriginalClassification] = useState('');
  const [saving, setSaving] = useState(false);

  // Virtual store voucher state
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherCustomer, setVoucherCustomer] = useState<Customer | null>(null);
  const [voucherPin, setVoucherPin] = useState<string | null>(null);
  const [voucherLast4, setVoucherLast4] = useState<string | null>(null);
  const [voucherBalance, setVoucherBalance] = useState<number | null>(null);

  // Cash change-to-voucher state
  const [amountReceived, setAmountReceived] = useState('');
  const [creditChangeToVoucher, setCreditChangeToVoucher] = useState(false);
  const [changeCustomer, setChangeCustomer] = useState<Customer | null>(null);

  // Subscription write guard
  const { writesBlocked, blockIfNeeded } = useSubscriptionWriteGate();

  // Sales-inline Customer & Voucher creation modal state
  const [showVoucherCreate, setShowVoucherCreate] = useState(false);
  const [pendingVoucherNotice, setPendingVoucherNotice] = useState(false);

  // DVA pending transfer picker state
  const [dvaPending, setDvaPending] = useState<SalesTransaction[]>([]);
  const [loadingDva, setLoadingDva] = useState(false);
  const [linkedDvaSaleId, setLinkedDvaSaleId] = useState<string | null>(null);

  const [classifications, setClassifications] = useState<
    TransactionClassification[]
  >([]);
  const [loadingClassifications, setLoadingClassifications] = useState(false);

  const isEdit = editSale !== null;
  const isCredit = source === 'credit';
  const isVoucher = source === 'store_voucher';

  // Handler when customer & voucher are created inline from sales modal
  const handleCustomerVoucherCreated = (
    newCustomer: Customer,
    voucherRequest: VoucherLedgerRequest | null
  ) => {
    setSelectedCustomerId(newCustomer.id);
    setCustomerName(newCustomer.name);
    if (newCustomer.phone) setCustomerPhone(newCustomer.phone);
    if (newCustomer.email) setCustomerEmail(newCustomer.email);
    if (voucherRequest) {
      setPendingVoucherNotice(true);
      toast.success(
        'Voucher created — Funding pending — awaiting manager authorization & customer verification'
      );
    } else {
      toast.success(
        newCustomer.email
          ? 'Voucher created — PIN sent to email'
          : 'Customer & virtual voucher card created successfully'
      );
    }
  };

  // Editing a legacy 'manual' (or any retired) row: keep that value selectable
  // so a save doesn't silently rewrite history — the backend still accepts it.
  // When creating a new sale, append 'credit' as a selectable payment type.
  const sourceOptions: string[] =
    isEdit &&
    editSale &&
    !(SOURCES as readonly string[]).includes(editSale.source)
      ? [...SOURCES, editSale.source]
      : [...SOURCES, ...(isEdit ? [] : [CREDIT_SOURCE])];

  // Reset-on-open + edit pre-fill (same pattern as SalesImportModal)
  useEffect(() => {
    if (!isOpen) return;
    setVoucherCustomer(null);
    setVoucherPin(null);
    setVoucherLast4(null);
    setVoucherBalance(null);
    setAmountReceived('');
    setCreditChangeToVoucher(false);
    setChangeCustomer(null);
    setPendingVoucherNotice(false);

    if (editSale) {
      setAmount(String(Number(editSale.amount)));
      setSource(editSale.source);
      setDescription(editSale.description || '');
      setCustomerName(editSale.customerName || '');
      setSelectedCustomerId(editSale.customerId ?? null);
      const meta = editSale.metadata as Record<string, unknown> | null | undefined;
      setCustomerPhone(typeof meta?.customerPhone === 'string' ? meta.customerPhone : '');
      setCustomerEmail(typeof meta?.customerEmail === 'string' ? meta.customerEmail : '');
      setDueDate('');
      setGuarantorName('');
      setGuarantorPhone('');
      setTransactionDate(
        new Date(editSale.transactionDate).toISOString().slice(0, 10),
      );
      const currentClass = editSale.finalClassification || '';
      setClassification(currentClass);
      setOriginalClassification(currentClass);

      if (editSale.items && editSale.items.length > 0) {
        setMode('items');
        setItems(
          editSale.items.map((it) => ({
            name: it.name,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal ?? it.quantity * it.unitPrice),
            sortOrder: it.sortOrder,
          })),
        );
      } else {
        setMode('single');
        setItems([{ name: '', quantity: 1, unitPrice: 0 }]);
      }
    } else {
      setMode('items');
      setItems([{ name: '', quantity: 1, unitPrice: 0 }]);
      setAmount('');
      setSource('cash');
      setDescription('');
      setSelectedCustomerId(null);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().slice(0, 10));
      setGuarantorName('');
      setGuarantorPhone('');
      setTransactionDate(new Date().toISOString().slice(0, 10));
      setClassification('');
      setOriginalClassification('');
    }
  }, [isOpen, editSale]);

  // Classifications load when the modal opens (was: on page mount)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingClassifications(true);
    api
      .get('/transaction-classifications')
      .then((r) => {
        if (!cancelled && r.data.data && Array.isArray(r.data.data)) {
          setClassifications(r.data.data);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load classifications');
      })
      .finally(() => {
        if (!cancelled) setLoadingClassifications(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // DVA pending transfers fetch
  const fetchDvaPending = useCallback(async () => {
    if (!isOpen || editSale || source !== 'bank_transfer' || !businessId) return;
    setLoadingDva(true);
    try {
      const res = await api.get(`/businesses/${businessId}/sales/unverified`, {
        params: { dvaOnly: true, limit: 20 },
      });
      setDvaPending(res.data.data as SalesTransaction[]);
    } catch (err) {
      // Silent fail - picker just stays empty
    } finally {
      setLoadingDva(false);
    }
  }, [isOpen, editSale, source, businessId]);

  useEffect(() => {
    fetchDvaPending();
  }, [fetchDvaPending]);

  useSSE(
    'dva_transfer_received',
    (e: any) => {
      if (e.businessId !== businessId) return;
      fetchDvaPending();
    },
    [businessId, fetchDvaPending]
  );

  // Clear DVA state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLinkedDvaSaleId(null);
      setDvaPending([]);
    }
  }, [isOpen]);

  const currentTotal =
    mode === 'items'
      ? items.reduce(
          (sum, it) =>
            sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
          0
        )
      : Number(amount) || 0;

  // Senior UX: never let a cashier click "Use voucher" when the math can't work.
  // Server will reject anyway, but disabling here saves a round-trip, an error
  // toast, and the embarrassment of telling the customer "sorry" after they waited.
  const insufficientVoucherFunds =
    isVoucher &&
    voucherCustomer !== null &&
    voucherBalance !== null &&
    currentTotal > 0 &&
    voucherBalance < currentTotal;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // DVA claim path: verify pending transfer instead of creating new sale
    if (source === 'bank_transfer' && linkedDvaSaleId) {
      const body: Record<string, unknown> = {
        classification: classification || 'Product Sale',
        description: description || undefined,
      };
      if (selectedCustomerId) {
        body.customerId = selectedCustomerId;
      } else if (customerName.trim()) {
        body.customerName = customerName.trim();
      }
      if (mode === 'items') {
        const validItems = items.filter((i) => i.name.trim());
        if (validItems.length) {
          body.items = validItems.map((i) => ({
            name: i.name.trim(),
            quantity: Number(i.quantity || 1),
            unitPrice: Number(i.unitPrice || 0),
          }));
        }
      }
      // Single-mode sends no amount/items — server keeps DVA amount
      try {
        await api.post(`/businesses/${businessId}/sales/${linkedDvaSaleId}/verify`, body);
        toast.success(
          selectedCustomerId
            ? 'Bank transfer matched, customer linked & sale confirmed'
            : 'Bank transfer matched and sale confirmed'
        );
        invalidateDashboard('sale_created');
        onSaved('created');
        onClose();
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Failed to verify transfer'));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isCredit) {
      if (!customerName.trim()) {
        toast.error('Customer name is required for credit sales');
        setSaving(false);
        return;
      }
      const email = customerEmail.trim();
      if (!email) {
        toast.error('Customer email is required for credit sales');
        setSaving(false);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error('Enter a valid customer email address');
        setSaving(false);
        return;
      }
      if (!dueDate) {
        toast.error('Payment due date is required for credit sales');
        setSaving(false);
        return;
      }

      const creditPayload: CreateCreditPayload = {
        customerName: customerName.trim(),
        customerEmail: email,
        customerPhone: customerPhone.trim() || undefined,
        issueDate: transactionDate,
        dueDate,
        guarantorName: guarantorName.trim() || undefined,
        guarantorPhone: guarantorPhone.trim() || undefined,
      };

      if (mode === 'items') {
        const validItems = items.filter((i) => i.name.trim().length > 0);
        if (validItems.length === 0) {
          toast.error('Please enter at least one item with a name');
          setSaving(false);
          return;
        }
        creditPayload.items = validItems.map((i) => ({
          name: i.name.trim(),
          quantity: Number(i.quantity || 1),
          unitPrice: Number(i.unitPrice || 0),
        }));
        creditPayload.description = description || undefined;
      } else {
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          toast.error('Amount must be greater than 0');
          setSaving(false);
          return;
        }
        creditPayload.totalAmount = numAmount;
        creditPayload.description = description || 'Credit obligation';
      }

      try {
        const res = (await useCreditStore.getState().createCredit(businessId, creditPayload)) as CustomerCredit & {
          meta?: { revenueDeferred?: boolean };
        };
        if (res?.meta?.revenueDeferred) {
          toast.success('Debtor registered — revenue deferred (locked month)');
        } else {
          toast.success('Credit sale recorded — revenue counted, debt tracked in Debtors Book');
        }
        invalidateDashboard('sale_created');
        onSaved('created');
        onClose();
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Failed to record credit sale'));
      } finally {
        setSaving(false);
      }
      return;
    }

    const basePath = `/businesses/${businessId}/sales`;

    const body: Record<string, unknown> = {
      source,
      description: description || undefined,
      customerName: customerName || undefined,
      transactionDate,
    };

    if (mode === 'items') {
      const validItems = items.filter((i) => i.name.trim().length > 0);
      if (validItems.length === 0) {
        toast.error('Please enter at least one item with a name');
        setSaving(false);
        return;
      }
      body.items = validItems.map((i) => ({
        name: i.name.trim(),
        quantity: Number(i.quantity || 1),
        unitPrice: Number(i.unitPrice || 0),
      }));
    } else {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        toast.error('Amount must be greater than 0');
        setSaving(false);
        return;
      }
      body.amount = numAmount;
      if (editSale?.items && editSale.items.length > 0) {
        body.items = []; // Clears items on the server
      }
    }

    if (source === 'store_voucher') {
      if (insufficientVoucherFunds) {
        toast.error(
          `Voucher balance ${formatMoney(voucherBalance ?? 0)} is less than sale total ₦${currentTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })} — not enough funds`
        );
        setSaving(false);
        return;
      }
      if (!voucherCustomer || !voucherPin || !voucherLast4) {
        toast.error('Please authenticate customer store voucher before recording sale');
        setIsVoucherModalOpen(true);
        setSaving(false);
        return;
      }
      body.metadata = {
        voucherCustomerId: voucherCustomer.id,
        voucherPin: voucherPin,
        voucherLast4: voucherLast4,
      };
      body.customerId = voucherCustomer.id;
    } else if (source === 'cash' && creditChangeToVoucher && !isEdit) {
      const receivedNum = Number(amountReceived);
      const changeDue = receivedNum - currentTotal;
      if (changeDue <= 0) {
        toast.error('Amount received must be greater than sale total to credit change');
        setSaving(false);
        return;
      }
      if (!changeCustomer) {
        toast.error('Please select or quick-add the customer to receive change');
        setSaving(false);
        return;
      }
      body.metadata = {
        changeCreditCustomerId: changeCustomer.id,
        changeCreditAmount: changeDue,
      };
      body.customerId = changeCustomer.id;
    } else {
      if (selectedCustomerId) {
        body.customerId = selectedCustomerId;
        body.metadata = {
          ...(body.metadata || {}),
          customerId: selectedCustomerId,
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        };
      } else if (customerName.trim() && (customerPhone.trim() || customerEmail.trim())) {
        body.metadata = {
          ...(body.metadata || {}),
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        };
      }
    }

    try {
      if (editSale) {
        if (selectedCustomerId) {
          body.customerId = selectedCustomerId;
        }
        await api.put(`${basePath}/${editSale.id}`, body);

        // Only verify if classification changed
        if (classification && classification !== originalClassification) {
          await api.post(`${basePath}/${editSale.id}/verify`, {
            classification,
          });
        }

        toast.success('Sale updated');
        invalidateDashboard('sale_updated');
        onSaved('updated');
      } else {
        const res = await api.post(basePath, body);
        if (res.data?.meta?.customerAutoCreated) {
          toast.success(`Customer '${customerName.trim() || 'New Customer'}' created and linked`);
        } else if (res.data?.meta?.customerId) {
          toast.success(`Linked to existing '${customerName.trim() || 'Customer'}'`);
        } else {
          toast.success('Sale created');
        }
        invalidateDashboard('sale_created');
        onSaved('created');
      }
      setSelectedCustomerId(null);
      onClose();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!saving}
      title={isEdit ? 'Edit Sale' : 'New Sale'}
      subtitle={
        isCredit
          ? 'Record goods or services given on credit'
          : 'Money received from selling'
      }
      icon={<TrendingUp className='h-5 w-5 text-primary-600' />}
      size={mode === 'items' ? 'lg' : 'md'}
      footer={
        <>
          <Button
            variant='secondary'
            onClick={onClose}
            disabled={saving}
            className='rounded-none border-gray-300'
          >
            Cancel
          </Button>
          <Button
            type='submit'
            form='add-sale-form'
            isLoading={saving}
            disabled={insufficientVoucherFunds}
            title={
              insufficientVoucherFunds
                ? `Voucher balance ${formatMoney(voucherBalance ?? 0)} is less than sale total ₦${currentTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })} — top up or reduce items`
                : undefined
            }
            className='rounded-none disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isEdit ? 'Update' : isCredit ? 'Record Credit Sale' : insufficientVoucherFunds ? 'Insufficient voucher balance' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id='add-sale-form'
        onSubmit={handleSubmit}
        className='grid grid-cols-1 gap-4 sm:grid-cols-2'
      >
        {/* Transaction Type Mode Toggle */}
        <div className='sm:col-span-2 space-y-1.5'>
          <label className='block text-xs font-semibold uppercase tracking-wider text-slate-500'>
            Transaction Type
          </label>
          <div className='grid grid-cols-2 p-1 bg-gray-100 rounded-none border border-gray-200 gap-1'>
            <button
              type='button'
              onClick={() => setMode('items')}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-none transition-all ${
                mode === 'items'
                  ? 'bg-white text-primary-700 shadow-sm border border-gray-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className='w-4 h-4' />
              <span>Products / Goods</span>
            </button>
            <button
              type='button'
              onClick={() => setMode('single')}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-none transition-all ${
                mode === 'single'
                  ? 'bg-white text-primary-700 shadow-sm border border-gray-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className='w-4 h-4' />
              <span>Professional Service</span>
            </button>
          </div>
          <p className='text-[11px] text-slate-500 px-0.5'>
            {mode === 'items'
              ? 'For physical goods sold by quantity and unit price (1 product or many).'
              : 'For services, repairs, consulting, or lump-sum daily totals without item quantities.'}
          </p>
        </div>

        {mode === 'single' ? (
          <Input
            label='Amount (₦)'
            type='number'
            inputMode='decimal'
            step='0.01'
            min='0.01'
            placeholder='0.00'
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={source === 'bank_transfer' && !!linkedDvaSaleId}
            className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
            required
          />
        ) : (
          <div className='sm:col-span-2'>
            <SaleItemsEditor
              items={items}
              onChange={setItems}
              disabled={saving}
            />
          </div>
        )}
        <div className='space-y-1'>
          <label
            htmlFor='sale-source'
            className='block text-xs font-semibold text-gray-700'
          >
            Payment Type
          </label>
          <select
            id='sale-source'
            value={source}
            onChange={(e) => {
              const newSource = e.target.value;
              setSource(newSource);
              if (newSource === 'store_voucher' && !voucherCustomer) {
                setIsVoucherModalOpen(true);
              }
            }}
            className='block w-full rounded-none border border-gray-300 px-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
          >
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {paymentTypeLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {/* DVA Pending Transfer Picker - only for new bank_transfer sales */}
        {source === 'bank_transfer' && !editSale && (
          <div className='sm:col-span-2'>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <label className='block text-xs font-semibold text-gray-700'>
                  🔗 Link to pending bank transfer
                </label>
                {loadingDva && (
                  <span className='text-[10px] text-gray-500'>Loading...</span>
                )}
              </div>
              {dvaPending.length === 0 && !loadingDva ? (
                <div className='p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600'>
                  <p className='font-medium'>○ No pending transfer — sale will be recorded as manual</p>
                  <p className='text-[11px] text-gray-500 mt-1'>
                    Waiting for the bank alert? The pending transfer will appear here automatically when it arrives.
                  </p>
                </div>
              ) : (
                <div className='space-y-2 max-h-60 overflow-y-auto'>
                  <label className='flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors'>
                    <input
                      type='radio'
                      name='dva-picker'
                      checked={!linkedDvaSaleId}
                      onChange={() => {
                        setLinkedDvaSaleId(null);
                        setCustomerName('');
                        if (mode === 'single') setAmount('');
                      }}
                      className='mt-0.5'
                    />
                    <div className='flex-1'>
                      <div className='text-xs font-medium text-gray-700'>
                        No pending transfer — record as manual
                      </div>
                      <div className='text-[11px] text-gray-500 mt-0.5'>
                        Enter amount and details manually
                      </div>
                    </div>
                  </label>
                  {dvaPending.map((sale) => {
                    const isSelected = linkedDvaSaleId === sale.id;
                    const hint = (sale.customerHint as string | undefined) || sale.customerName || 'Bank Transfer';
                    const amt = Number(sale.amount);
                    const time = new Date(sale.transactionDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
                    const ref = (sale.referenceId || '').slice(-6);
                    return (
                      <label
                        key={sale.id}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500'
                            : 'bg-white border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <input
                          type='radio'
                          name='dva-picker'
                          checked={isSelected}
                          onChange={() => {
                            setLinkedDvaSaleId(sale.id);
                            setCustomerName(hint);
                            if (mode === 'single') {
                              setAmount(String(amt));
                            }
                          }}
                          className='mt-0.5'
                        />
                        <div className='flex-1 min-w-0'>
                          <div className='text-sm font-bold text-gray-900'>
                            ₦{amt.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </div>
                          <div className='text-xs text-gray-600 mt-1'>
                            {hint} · {time} {ref && `· ref_${ref}`}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {linkedDvaSaleId && mode === 'single' && (
                <div className='p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-700'>
                  Amount locked to bank transfer — this sale will record at the bank amount
                </div>
              )}
              {linkedDvaSaleId && mode === 'items' && (
                <div className='p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-700'>
                  Bank: ₦{dvaPending.find(s => s.id === linkedDvaSaleId) ? Number(dvaPending.find(s => s.id === linkedDvaSaleId)!.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '0.00'}
                  {' · '}
                  Basket: ₦{currentTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  {Math.abs(Number(dvaPending.find(s => s.id === linkedDvaSaleId)?.amount || 0) - currentTotal) > 0.01 && (
                    <span className='ml-1 text-amber-700'>
                      · Δ {(currentTotal - Number(dvaPending.find(s => s.id === linkedDvaSaleId)?.amount || 0)) > 0 ? '+' : ''}
                      ₦{Math.abs(currentTotal - Number(dvaPending.find(s => s.id === linkedDvaSaleId)?.amount || 0)).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isVoucher && (
          <div className='sm:col-span-2'>
            {voucherCustomer ? (
              <div className='p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3'>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Voucher verified — ready to redeem
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                    {voucherCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-emerald-900 truncate">{voucherCustomer.name}</div>
                    <div className="text-xs text-emerald-700 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" />
                        PIN + last 4 verified
                      </span>
                      {voucherLast4 && <span className="text-[11px]">• Last 4: ••••{voucherLast4}</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="bg-white border border-emerald-200 rounded-lg px-2.5 py-2">
                        <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Sale total</div>
                        <div className="text-sm font-extrabold text-gray-900 tabular-nums">₦{currentTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div className={`border rounded-lg px-2.5 py-2 ${voucherBalance !== null && voucherBalance < currentTotal ? 'bg-red-50 border-red-200' : 'bg-white border-emerald-200'}`}>
                        <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          Voucher balance
                        </div>
                        <div className={`text-sm font-extrabold tabular-nums ${voucherBalance !== null && voucherBalance < currentTotal ? 'text-red-700' : 'text-emerald-700'}`}>
                          {voucherBalance !== null ? formatMoney(voucherBalance) : 'Verified on submit'}
                        </div>
                      </div>
                    </div>
                    {voucherBalance !== null && voucherBalance < currentTotal && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Balance is low for this sale. Top up or reduce items — server will verify on Create.</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() => setIsVoucherModalOpen(true)}
                    className='flex-1 rounded-full'
                  >
                    Change voucher
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => { setVoucherCustomer(null); setVoucherPin(null); setVoucherLast4(null); setVoucherBalance(null); }}
                    className='rounded-full'
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className='p-4 bg-white border-2 border-dashed border-emerald-300 rounded-xl text-center space-y-3'>
                <div className="mx-auto w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className='text-sm font-bold text-gray-900'>No voucher verified yet</div>
                  <div className='text-xs text-gray-600 mt-1 max-w-sm mx-auto leading-relaxed'>
                    To pay with a store voucher, enter the customer's <strong>6-digit PIN</strong> + <strong>last 4 of phone</strong>. PIN + last 4 are verified securely.
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button
                    type='button'
                    size='sm'
                    onClick={() => setIsVoucherModalOpen(true)}
                    className='bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5'
                  >
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Verify voucher
                  </Button>
                  <span className="text-[11px] text-gray-500 self-center">Takes ~10 seconds</span>
                </div>
              </div>
            )}
          </div>
        )}

        {source === 'cash' && !isEdit && (
          <div className='sm:col-span-2 p-3 bg-gray-50 border border-gray-200 rounded space-y-2.5'>
            <Input
              label='Amount Received from Customer (₦)'
              type='number'
              inputMode='decimal'
              placeholder='e.g. 5000'
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
            />
            {Number(amountReceived) > currentTotal && (
              <div className='p-2.5 bg-emerald-50 border border-emerald-200 rounded space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-bold text-emerald-900'>
                    Change Due: ₦{(Number(amountReceived) - currentTotal).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                  <label className='flex items-center gap-1.5 text-xs font-semibold text-emerald-800 cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={creditChangeToVoucher}
                      onChange={(e) => setCreditChangeToVoucher(e.target.checked)}
                      className='rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500'
                    />
                    <span>Credit change to store voucher</span>
                  </label>
                </div>
                {creditChangeToVoucher && (
                  <div className='pt-1'>
                    <CustomerAutocomplete
                      businessId={businessId}
                      selectedCustomer={changeCustomer}
                      onSelectCustomer={(c) => {
                        setChangeCustomer(c);
                        if (c && !customerName) setCustomerName(c.name);
                      }}
                      label='Customer to Receive Change'
                      required
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isCredit && (
          <div className='sm:col-span-2 space-y-3 p-3.5 bg-emerald-50/70 border border-emerald-200'>
            <div className='flex items-start gap-2.5'>
              <HandCoins className='h-4 w-4 text-emerald-700 shrink-0 mt-0.5' />
              <div>
                <p className='text-xs font-bold text-emerald-900'>
                  ✓ Revenue Counted at Point of Sale
                </p>
                <p className='text-[11px] text-emerald-800 leading-relaxed mt-0.5'>
                  This credit sale will be recorded as revenue for the issue
                  date's month and tracked in your Debtors Book. Repayments
                  will only update the debt balance — no duplicate sales.
                </p>
              </div>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1'>
              <Input
                label='Customer Email *'
                type='email'
                placeholder='customer@example.com'
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
                required
              />
              <Input
                label='Debtor Phone (for WhatsApp Reminders)'
                placeholder='e.g. 08012345678'
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
              />
              <Input
                label='Payment Due Date'
                type='date'
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
                required
              />
              <Input
                label='Guarantor / Surety Name (Optional)'
                placeholder='e.g. Alhaji Ibrahim or Partner Name'
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
                className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
              />
              <Input
                label='Guarantor Phone (Optional)'
                placeholder='e.g. 08098765432'
                value={guarantorPhone}
                onChange={(e) => setGuarantorPhone(e.target.value)}
                className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
              />
            </div>
          </div>
        )}

        {!isCredit && !isVoucher && (
          <div className="sm:col-span-2">
            <CustomerAutocomplete
              businessId={businessId}
              selectedCustomer={
                selectedCustomerId
                  ? (customers.find((c) => c.id === selectedCustomerId) ??
                     (editSale?.customerId === selectedCustomerId && editSale.customerName
                       ? ({
                           id: selectedCustomerId,
                           name: editSale.customerName,
                           phone: customerPhone || null,
                           email: customerEmail || null,
                         } as Customer)
                       : null))
                  : null
              }
              onSelectCustomer={(c) => {
                setSelectedCustomerId(c?.id ?? null);
                if (c) {
                  setCustomerName(c.name);
                  if (c.phone) setCustomerPhone(c.phone);
                  if (c.email) setCustomerEmail(c.email);
                } else {
                  setCustomerName('');
                  setCustomerPhone('');
                  setCustomerEmail('');
                }
              }}
              label="Customer (CRM & Virtual Card)"
              placeholder="Search by customer name or phone… or tap to pick"
            />
            {!selectedCustomerId && (
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200/90 rounded-md">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-950">
                      Need to register this customer or issue a voucher?
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Works with any payment type — even Bank Transfer
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={writesBlocked}
                  onClick={() => {
                    if (blockIfNeeded()) return;
                    setShowVoucherCreate(true);
                  }}
                  className="text-xs bg-white text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-300 font-medium whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  ＋ New Customer & Voucher
                </Button>
              </div>
            )}
            {selectedCustomerId && pendingVoucherNotice && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  <strong className="font-semibold">Funding pending:</strong> Awaiting manager authorization & customer verification. Your sale will record with this customer using your selected payment method.
                </span>
              </div>
            )}
          </div>
        )}

        <Input
          label={
            mode === 'items' ? 'Order Note (Optional)' : 'Service Description'
          }
          placeholder={
            mode === 'items'
              ? 'e.g. Delivered to shop, Balance due on Friday'
              : 'e.g. Haircut & styling, Generator repair, POS daily sales'
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
        />
        <Input
          label={isCredit ? 'Customer Name (Debtor)' : 'Customer Name'}
          placeholder='e.g. Alhaji Musa'
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required={isCredit}
        />

        {!isCredit && !isVoucher && !selectedCustomerId && (
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50 border border-gray-200">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Customer Phone (Auto-Capture)
              </label>
              <PhoneInput
                value={customerPhone}
                onChange={(full) => setCustomerPhone(full)}
                placeholder="0803 123 4567"
              />
            </div>
            <Input
              label="Customer Email (Optional)"
              type="email"
              placeholder="customer@example.com"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs"
            />
          </div>
        )}
        <Input
          label='Transaction Date'
          type='date'
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required
        />
        {!isCredit && (
          <div className='space-y-1'>
            <label
              htmlFor='sale-classification'
              className='block text-xs font-semibold text-gray-700'
            >
              Classification (Optional)
            </label>
            <select
              id='sale-classification'
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className='block w-full rounded-none border border-gray-300 px-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
              disabled={loadingClassifications}
            >
              <option value=''>Not classified</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </Modal>

    <VoucherAuthModal
      isOpen={isVoucherModalOpen}
      businessId={businessId}
      requiredAmount={currentTotal}
      onClose={() => setIsVoucherModalOpen(false)}
      onAuthorized={({ customerId, customerName: cName, voucherPin: pin, voucherLast4: last4, availableBalance }) => {
        setVoucherCustomer({ id: customerId, businessId, name: cName, isActive: true, createdAt: new Date().toISOString() });
        setCustomerName(cName);
        setVoucherPin(pin);
        setVoucherLast4(last4);
        setVoucherBalance(availableBalance);
      }}
    />

    <CustomerVoucherCreateModal
      isOpen={showVoucherCreate}
      businessId={businessId}
      initialName={customerName}
      initialPhone={customerPhone}
      initialEmail={customerEmail}
      onClose={() => setShowVoucherCreate(false)}
      onCreated={handleCustomerVoucherCreated}
    />
  </>
  );
}
