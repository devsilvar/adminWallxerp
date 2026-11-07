import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Mail,
  Phone,
  FileText,
  Calendar,
  Wallet,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { useCreditStore } from '@/stores/credit.store.ts';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/axios.ts';

interface CreateCreditModalProps {
  businessId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateCreditModal({
  businessId,
  isOpen,
  onClose,
  onCreated,
}: CreateCreditModalProps) {
  const createCredit = useCreditStore((s) => s.createCredit);

  const todayStr = new Date().toISOString().slice(0, 10);

  const getComputedDueDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const getComputedReminderDate = (dueStr: string) => {
    const d = new Date(dueStr);
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  };

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [selectedTermDays, setSelectedTermDays] = useState<number>(14);
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(() => getComputedDueDate(14));
  const [reminderDate, setReminderDate] = useState(() =>
    getComputedReminderDate(getComputedDueDate(14)),
  );
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [loading, setLoading] = useState(false);

  // Lock background scroll & handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleTermSelect = (days: number) => {
    setSelectedTermDays(days);
    const computedDue = getComputedDueDate(days);
    setDueDate(computedDue);
    setReminderDate(getComputedReminderDate(computedDue));
  };

  const handleQuickAmount = (val: number) => {
    setTotalAmount(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!description.trim()) {
      toast.error('Description of goods/items is required');
      return;
    }
    const email = customerEmail.trim();
    if (!email) {
      toast.error('Customer email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    const numAmount = Number(totalAmount);
    if (!numAmount || numAmount < 100) {
      toast.error('Amount must be at least ₦100');
      return;
    }
    if (new Date(dueDate) < new Date(issueDate)) {
      toast.error('Due date cannot be earlier than issue date');
      return;
    }

    setLoading(true);
    try {
      await createCredit(businessId, {
        customerName: customerName.trim(),
        customerEmail: email,
        customerPhone: customerPhone.trim() || undefined,
        description: description.trim(),
        totalAmount: numAmount,
        issueDate,
        dueDate,
        reminderDate: reminderDate || undefined,
        guarantorName: guarantorName.trim() || undefined,
        guarantorPhone: guarantorPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast.success('Credit recorded in Debt Book');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className='fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150'
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      {/* Straight-Edged, Neat Designed Modal Dialog */}
      <div className='relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 my-auto pointer-events-auto animate-in zoom-in-95 duration-150'>
        {/* Pinned Straight Header */}
        <div className='shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-none bg-primary-50 text-primary-600 border border-primary-200 shrink-0'>
              <Wallet className='h-4 w-4' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h2 className='text-sm sm:text-base font-bold text-gray-900'>
                  Record Customer Debt
                </h2>
                <span className='text-[10px] font-semibold px-1.5 py-0.2 rounded-none bg-emerald-50 text-emerald-700 border border-emerald-300'>
                  Cash-Basis
                </span>
              </div>
              <p className='text-[11px] text-gray-500'>
                Sales tax recognized only upon collection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className='rounded-none p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors'
            title='Close modal'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Scrollable Compact Form Body */}
        <form
          id='create-credit-form'
          onSubmit={handleSubmit}
          className='flex-1 overflow-y-auto px-5 py-4 space-y-3.5'
        >
          {/* Row 1: Debtor Name */}
          <div>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>
              Customer Name <span className='text-rose-500'>*</span>
            </label>
            <div className='relative'>
              <User className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400' />
              <input
                type='text'
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder='e.g. Alhaji Musa'
                className='w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
              />
            </div>
          </div>

          {/* Row 2: Customer Email & Phone */}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1'>
                Customer Email <span className='text-rose-500'>*</span>
              </label>
              <div className='relative'>
                <Mail className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400' />
                <input
                  type='email'
                  required
                  autoComplete='email'
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder='customer@example.com'
                  className='w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
                />
              </div>
              <p className='text-[10px] text-gray-500 mt-1'>
                Debtor will be emailed on creation and when payment is due. Payment instructions include your wallet account for direct transfer.
              </p>
            </div>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1'>
                Phone (WhatsApp)
              </label>
              <div className='relative'>
                <Phone className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400' />
                <input
                  type='tel'
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder='0803 000 0000'
                  className='w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
                />
              </div>
            </div>
          </div>

          {/* Row 2: Amount & Quick Chips */}
          <div>
            <div className='flex items-center justify-between mb-1'>
              <label className='text-xs font-semibold text-gray-700'>
                Amount Owed (₦) <span className='text-rose-500'>*</span>
              </label>
              <div className='flex items-center gap-1'>
                {[20000, 50000, 100000, 250000].map((val) => (
                  <button
                    key={val}
                    type='button'
                    onClick={() => handleQuickAmount(val)}
                    className={`text-[10px] px-2 py-0.5 rounded-none font-medium border transition-colors ${
                      totalAmount === val
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    ₦{(val / 1000).toLocaleString()}k
                  </button>
                ))}
              </div>
            </div>
            <div className='relative'>
              <span className='absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-gray-500 text-sm'>
                ₦
              </span>
              <input
                type='number'
                min='100'
                step='any'
                required
                value={totalAmount}
                onChange={(e) =>
                  setTotalAmount(
                    e.target.value === '' ? '' : Number(e.target.value),
                  )
                }
                placeholder='50,000'
                className='w-full rounded-none border border-gray-300 pl-8 pr-3 py-2 text-sm font-bold text-gray-900 focus:border-gray-900 focus:ring-0 outline-none transition-all tabular-nums'
              />
            </div>
          </div>

          {/* Row 3: Items / Goods Supplied */}
          <div>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>
              Items / Good Supplied / Services{' '}
              <span className='text-rose-500'>*</span>
            </label>
            <div className='relative'>
              <FileText className='absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400' />
              <textarea
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='e.g. 5 bags of rice and 2 cartons of cooking oil on credit'
                className='w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all resize-none'
              />
            </div>
          </div>

          {/* Row 4: Timeline & Due Date */}
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <label className='text-xs font-semibold text-gray-700'>
                Repayment Due Date
              </label>
              <div className='flex items-center gap-1'>
                {[7, 14, 30, 60].map((days) => (
                  <button
                    key={days}
                    type='button'
                    onClick={() => handleTermSelect(days)}
                    className={`text-[10px] px-2 py-0.5 rounded-none font-semibold transition-all border ${
                      selectedTermDays === days
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div>
                <span className='text-[10px] font-medium text-gray-400 block mb-0.5'>
                  Issue Date
                </span>
                <div className='relative'>
                  <Calendar className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400' />
                  <input
                    type='date'
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className='w-full rounded-none border border-gray-300 pl-8 pr-2 py-1.5 text-xs focus:border-gray-900 outline-none'
                  />
                </div>
              </div>

              <div>
                <span className='text-[10px] font-medium text-gray-400 block mb-0.5'>
                  Due Date
                </span>
                <div className='relative'>
                  <Calendar className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400' />
                  <input
                    type='date'
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      setSelectedTermDays(0);
                    }}
                    className='w-full rounded-none border border-gray-300 pl-8 pr-2 py-1.5 text-xs focus:border-gray-900 outline-none'
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible: Optional Details (Guarantor, Email, Notes) */}
          <div className='pt-1'>
            <button
              type='button'
              onClick={() => setShowOptionalFields(!showOptionalFields)}
              className='text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors'
            >
              {showOptionalFields ? (
                <ChevronUp className='h-3.5 w-3.5' />
              ) : (
                <ChevronDown className='h-3.5 w-3.5' />
              )}
              {showOptionalFields
                ? 'Hide extra details'
                : '+ Add guarantor, email or internal notes'}
            </button>

            {showOptionalFields && (
              <div className='mt-2.5 p-3 rounded-none bg-gray-50 border border-gray-200 space-y-3 animate-in fade-in duration-100'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2.5'>
                  <div>
                    <label className='block text-[11px] font-medium text-gray-600 mb-0.5'>
                      Guarantor Name
                    </label>
                    <input
                      type='text'
                      value={guarantorName}
                      onChange={(e) => setGuarantorName(e.target.value)}
                      placeholder='e.g. Chief Okafor'
                      className='w-full rounded-none border border-gray-300 px-2.5 py-1.5 text-xs focus:border-gray-900 outline-none bg-white'
                    />
                  </div>
                  <div>
                    <label className='block text-[11px] font-medium text-gray-600 mb-0.5'>
                      Guarantor Phone
                    </label>
                    <input
                      type='tel'
                      value={guarantorPhone}
                      onChange={(e) => setGuarantorPhone(e.target.value)}
                      placeholder='0802 000 0000'
                      className='w-full rounded-none border border-gray-300 px-2.5 py-1.5 text-xs focus:border-gray-900 outline-none bg-white'
                    />
                  </div>
                </div>

                <div>
                  <label className='block text-[11px] font-medium text-gray-600 mb-0.5'>
                    Internal Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder='Agreed payment terms or collateral notes...'
                    className='w-full rounded-none border border-gray-300 px-2.5 py-1.5 text-xs focus:border-gray-900 outline-none bg-white resize-none'
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Pinned Straight Footer — Always visible without scrolling */}
        <div className='shrink-0 flex items-center justify-end gap-2.5 border-t border-gray-200 px-5 py-3 bg-gray-50'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={onClose}
            disabled={loading}
            className='rounded-none border-gray-300'
          >
            Cancel
          </Button>
          <Button
            type='submit'
            form='create-credit-form'
            variant='primary'
            size='sm'
            disabled={loading}
            className='rounded-none flex items-center gap-1.5 shadow-sm'
          >
            {loading ? (
              'Saving...'
            ) : (
              <>
                <Plus className='h-3.5 w-3.5' /> Record Debt
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
