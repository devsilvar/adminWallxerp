import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Lock, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useInvoiceStore } from '@/stores/invoice.store.ts';
import type { CreateInvoicePayload, BusinessTaxPolicy } from '@/types/index.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface LineRow {
  description: string;
  quantity: string; // keep as string while user is typing; coerce on submit
  unitPrice: string;
}

interface WalletAccountInfo {
  accountNumber: string;
  bankName: string;
  accountName: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function buildPaymentTerms(
  account: WalletAccountInfo,
  totalAmount?: number
): string {
  const parts = [
    `Please make payment to:`,
    `Bank: ${account.bankName}`,
    `Account Number: ${account.accountNumber}`,
    `Account Name: ${account.accountName}`,
  ];
  if (totalAmount !== undefined && totalAmount > 0) {
    parts.push(`Amount Due: ${formatNaira(totalAmount)}`);
  }
  return parts.join('\n');
}

const emptyLine = (): LineRow => ({ description: '', quantity: '1', unitPrice: '' });

export default function InvoiceForm() {
  useDisplayCurrency();
  const { blockIfNeeded } = useSubscriptionWriteGate();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const fetchInvoice = useInvoiceStore((s) => s.fetchInvoice);
  const createInvoice = useInvoiceStore((s) => s.createInvoice);
  const updateInvoice = useInvoiceStore((s) => s.updateInvoice);

  // Dedicated virtual account (wallet) detection & resolution
  const initialWalletAccount = useMemo<WalletAccountInfo | null>(() => {
    const acct = biz?.virtualAccountNumber || user?.virtualAccountNumber;
    if (!acct) return null;
    return {
      accountNumber: acct,
      bankName: biz?.virtualAccountBank || user?.virtualAccountBank || 'Wema Bank',
      accountName: biz?.businessName || biz?.ownerName || user?.settlementAccountName || 'Business Account',
    };
  }, [biz, user]);

  const [walletAccount, setWalletAccount] = useState<WalletAccountInfo | null>(initialWalletAccount);
  const isUserEditedTermsRef = useRef(false);

  // Sync initialWalletAccount if biz or user updates
  useEffect(() => {
    if (initialWalletAccount) {
      setWalletAccount(initialWalletAccount);
    }
  }, [initialWalletAccount]);

  // If wallet details not yet in store and in create mode, query DVA status asynchronously
  useEffect(() => {
    if (isEdit || !biz?.id || walletAccount) return;
    let isCancelled = false;

    api
      .get(`/businesses/${biz.id}/dva/virtual-account`)
      .then((res) => {
        if (isCancelled) return;
        const data = res.data?.data;
        if (data?.status === 'active' && data.accountNumber) {
          setWalletAccount({
            accountNumber: data.accountNumber,
            bankName: data.bankName || 'Wema Bank',
            accountName: data.businessName || data.accountName || biz.businessName || 'Business Account',
          });
        }
      })
      .catch(() => {
        // DVA not active or error - ignore
      });

    return () => {
      isCancelled = true;
    };
  }, [isEdit, biz?.id, walletAccount]);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');

  const [issueDate, setIssueDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(addDays(todayStr(), 14));
  const [vatRate, setVatRate] = useState('7.5');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');

  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [notEditable, setNotEditable] = useState(false);
  const [taxPolicy, setTaxPolicy] = useState<BusinessTaxPolicy | null>(null);

  // Fetch business tax policy on mount (create mode defaults from policy; edit mode keeps stored rate)
  useEffect(() => {
    if (!biz?.id) return;
    let isMounted = true;
    api
      .get(`/businesses/${biz.id}/tax-policy`)
      .then((res) => {
        if (!isMounted) return;
        const policy: BusinessTaxPolicy | null = res.data?.data ?? null;
        setTaxPolicy(policy);
        if (!isEdit && policy) {
          if (!policy.vat.chargeable) {
            setVatRate('0');
          } else if (policy.vat.rate !== undefined && policy.vat.rate !== null) {
            setVatRate(String(policy.vat.rate));
          }
        }
      })
      .catch(() => {
        // Fetch failed or slow: keep default '7.5', never block the form
      });

    return () => {
      isMounted = false;
    };
  }, [biz?.id, isEdit]);

  const isVatDisabled = Boolean(!isEdit && taxPolicy && !taxPolicy.vat.chargeable);
  const vatExemptReason = taxPolicy?.vat.reason || 'This business is exempt from charging VAT';

  // Load invoice when editing
  useEffect(() => {
    if (!biz || !isEdit || !id) return;
    setLoading(true);
    fetchInvoice(biz.id, id)
      .then((inv) => {
        if (!inv) {
          toast.error('Invoice not found');
          navigate('/invoices');
          return;
        }
        if (inv.status !== 'draft') {
          // Backend will refuse the update too, but we surface this up-front so
          // the user doesn't fill out the form just to hit a 409.
          setNotEditable(true);
        }
        setCustomerName(inv.customerName);
        setCustomerEmail(inv.customerEmail ?? '');
        setCustomerPhone(inv.customerPhone ?? '');
        setCustomerAddress(inv.customerAddress ?? '');
        setCustomerTaxId(inv.customerTaxId ?? '');
        setIssueDate(inv.issueDate.slice(0, 10));
        setDueDate(inv.dueDate.slice(0, 10));
        setVatRate(String(Number(inv.vatRate)));
        setDiscount(String(Number(inv.discount)));
        setNotes(inv.notes ?? '');
        setPaymentTerms(inv.paymentTerms ?? '');
        setLines(
          (inv.lines ?? []).map((l) => ({
            description: l.description,
            quantity: String(Number(l.quantity)),
            unitPrice: String(Number(l.unitPrice)),
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [biz, id, isEdit, fetchInvoice, navigate]);

  // Live totals — mirrors the backend computeTotals exactly
  const totals = useMemo(() => {
    const rateN = isVatDisabled ? 0 : Number(vatRate) || 0;
    const discountN = Number(discount) || 0;
    const subtotal = money(
      lines.reduce((sum, l) => {
        const q = Number(l.quantity) || 0;
        const u = Number(l.unitPrice) || 0;
        return sum + q * u;
      }, 0),
    );
    const taxable = Math.max(0, money(subtotal - discountN));
    const vatAmount = money((taxable * rateN) / 100);
    const total = money(taxable + vatAmount);
    return { subtotal, discount: discountN, vatRate: rateN, vatAmount, total };
  }, [lines, vatRate, discount, isVatDisabled]);

  // Pre-fill and synchronize payment terms with wallet account and totals (create mode only)
  useEffect(() => {
    if (isEdit) {
      isUserEditedTermsRef.current = true;
      return;
    }
    if (!walletAccount || isUserEditedTermsRef.current) return;

    setPaymentTerms(buildPaymentTerms(walletAccount, totals.total));
  }, [isEdit, walletAccount, totals.total]);

  const updateLine = (idx: number, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const validate = (): string | null => {
    if (!customerName.trim()) return 'Customer name is required';
    if (!issueDate || !dueDate) return 'Issue and due dates are required';
    if (new Date(dueDate) < new Date(issueDate)) return 'Due date cannot be before issue date';
    if (lines.length === 0) return 'Add at least one line item';
    for (const [i, l] of lines.entries()) {
      if (!l.description.trim()) return `Line ${i + 1}: description is required`;
      const q = Number(l.quantity);
      const u = Number(l.unitPrice);
      if (!Number.isFinite(q) || q <= 0) return `Line ${i + 1}: quantity must be greater than 0`;
      if (!Number.isFinite(u) || u < 0) return `Line ${i + 1}: unit price cannot be negative`;
    }
    const rateN = isVatDisabled ? 0 : Number(vatRate);
    if (!Number.isFinite(rateN) || rateN < 0 || rateN > 100) return 'VAT rate must be between 0 and 100';
    const discountN = Number(discount);
    if (!Number.isFinite(discountN) || discountN < 0) return 'Discount cannot be negative';
    return null;
  };

  const buildPayload = (): CreateInvoicePayload => ({
    customerName: customerName.trim(),
    customerEmail: customerEmail.trim() || undefined,
    customerPhone: customerPhone.trim() || undefined,
    customerAddress: customerAddress.trim() || undefined,
    customerTaxId: customerTaxId.trim() || undefined,
    issueDate,
    dueDate,
    vatRate: isVatDisabled ? 0 : Number(vatRate),
    discount: Number(discount),
    notes: notes.trim() || undefined,
    paymentTerms: paymentTerms.trim() || undefined,
    lines: lines.map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    })),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (blockIfNeeded()) return;
    if (!biz) return;

    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        await updateInvoice(biz.id, id, buildPayload());
        toast.success('Invoice updated');
        navigate(`/invoices/${id}`);
      } else {
        const created = await createInvoice(biz.id, buildPayload());
        toast.success(`Invoice ${created.invoiceNumber} created`);
        navigate(`/invoices/${created.id}`);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

if (!biz) return <p className="py-20 text-center text-gray-400">Select a business first.</p>;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-gray-200"
          >
            <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((j) => (
                <div key={j} className="h-9 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notEditable) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Lock className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              This invoice is locked for editing
            </p>
            <p className="max-w-sm text-sm text-gray-500">
              Only draft invoices can be edited. Once an invoice has been sent,
              cancel it and raise a new one instead &mdash; that keeps your
              records consistent for tax.
            </p>
            <Link
              to={`/invoices/${id}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back to invoice
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link
          to={isEdit ? `/invoices/${id}` : '/invoices'}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isEdit ? 'Back to invoice' : 'All invoices'}
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
          {isEdit ? 'Edit invoice' : 'New invoice'}
        </h1>
        <p className="mt-1 font-body text-sm text-gray-500">
          {isEdit
            ? 'Changes apply immediately to this draft.'
            : 'Saved as a draft — you can send it from the invoice page.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
          <div className="px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">Bill to</h2>
            <p className="mt-0.5 font-body text-xs text-gray-500">
              Add a WhatsApp number or an email address so you can send this
              invoice straight from the invoice page.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <Input
              label="Customer Name *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
              required
            />
            <Input
              label="Email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              maxLength={200}
              placeholder="customer@example.com"
            />
            <Input
              label="WhatsApp / Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              maxLength={30}
              placeholder="08031234567"
            />
            <Input
              label="TIN"
              value={customerTaxId}
              onChange={(e) => setCustomerTaxId(e.target.value)}
              maxLength={50}
              placeholder="Tax Identification Number"
            />
            <div className="sm:col-span-2">
              <Input
                label="Address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
        </Card>

        <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
          <div className="px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">Dates &amp; tax</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-4 py-4 sm:grid-cols-4 sm:px-5">
            <Input
              label="Issue Date *"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
            <Input
              label="Due Date *"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={issueDate}
              required
            />
            <div>
              <Input
                label="VAT Rate (%)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={isVatDisabled ? '0' : vatRate}
                disabled={isVatDisabled}
                aria-describedby={isVatDisabled ? 'vat-exempt-reason' : undefined}
                className={isVatDisabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : ''}
                onChange={(e) => setVatRate(e.target.value)}
              />
              {isVatDisabled && (
                <p id="vat-exempt-reason" className="mt-1 text-xs font-medium text-amber-700">
                  {vatExemptReason}
                </p>
              )}
            </div>
            <Input
              label="Discount (₦)"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
        </Card>

        <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">
              Line items
              <span className="ml-2 text-xs font-normal tabular-nums text-gray-400">
                {lines.length} {lines.length === 1 ? 'item' : 'items'}
              </span>
            </h2>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>

          <div className="space-y-2.5 border-t border-gray-100 px-4 py-4 sm:px-5">
            {lines.map((line, idx) => {
              const q = Number(line.quantity) || 0;
              const u = Number(line.unitPrice) || 0;
              const lineTotal = money(q * u);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3 sm:gap-3"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <label htmlFor={`line-desc-${idx}`} className="mb-1 block text-xs font-medium text-gray-500">
                      Description
                    </label>
                    <input
                      id={`line-desc-${idx}`}
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      placeholder="e.g. Consulting services, hours 1-10"
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      maxLength={500}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label htmlFor={`line-qty-${idx}`} className="mb-1 block text-xs font-medium text-gray-500">Qty</label>
                    <input
                      id={`line-qty-${idx}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-right text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label htmlFor={`line-price-${idx}`} className="mb-1 block text-xs font-medium text-gray-500">
                      Unit price
                    </label>
                    <input
                      id={`line-price-${idx}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-right text-sm tabular-nums text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                  <div className="col-span-4 flex flex-col justify-end sm:col-span-2">
                    <label className="mb-1 block text-right text-xs font-medium text-gray-500">
                      Amount
                    </label>
                    <div className="flex items-center justify-end gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-gray-900">
                      <span className="truncate">{formatNaira(lineTotal)}</span>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        title={
                          lines.length === 1
                            ? 'An invoice needs at least one line'
                            : 'Remove line'
                        }
                        className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end border-t border-gray-100 bg-gray-50/60 px-4 py-4 sm:px-5">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="tabular-nums text-gray-700">
                  {formatNaira(totals.subtotal)}
                </dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between gap-6">
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="tabular-nums text-gray-700">
                    -{formatNaira(totals.discount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-6">
                <dt className="text-gray-500">VAT ({totals.vatRate}%)</dt>
                <dd className="tabular-nums text-gray-700">
                  {formatNaira(totals.vatAmount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-t border-gray-200 pt-2">
                <dt className="font-semibold text-gray-900">Total</dt>
                <dd className="text-xl font-bold tabular-nums tracking-tight text-gray-900">
                  {formatNaira(totals.total)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
          <div className="px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">Notes &amp; terms</h2>
            <p className="mt-0.5 font-body text-xs text-gray-500">
              Appears at the bottom of the printed invoice.
            </p>
          </div>
          <div className="space-y-4 border-t border-gray-100 px-4 py-4 sm:px-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="invoice-terms"
                  className="block text-sm font-medium text-gray-700"
                >
                  Payment terms
                </label>
                {walletAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      isUserEditedTermsRef.current = false;
                      const terms = buildPaymentTerms(walletAccount, totals.total);
                      setPaymentTerms(terms);
                      toast.success('Updated with wallet account details');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
                    title="Fill with your dedicated virtual account details"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span>Use wallet details</span>
                  </button>
                )}
              </div>
              <textarea
                id="invoice-terms"
                value={paymentTerms}
                onChange={(e) => {
                  isUserEditedTermsRef.current = true;
                  setPaymentTerms(e.target.value);
                }}
                rows={4}
                maxLength={500}
                placeholder="e.g. Net 14. Pay to Access Bank acc 0123456789."
                className="block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label
                htmlFor="invoice-notes"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Notes
              </label>
              <textarea
                id="invoice-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Thank you for your business."
                className="block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          </div>
        </Card>

        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Total
            </p>
            <p className="truncate text-xl font-bold tabular-nums tracking-tight text-gray-900">
              {formatNaira(totals.total)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              subscriptionExempt={true}
              onClick={() => navigate(isEdit ? `/invoices/${id}` : '/invoices')}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {isEdit ? 'Save changes' : 'Create as draft'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}