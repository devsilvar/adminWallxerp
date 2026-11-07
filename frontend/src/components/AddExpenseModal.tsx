/**
 * AddExpenseModal — create or edit an expense in a modal (bottom sheet on
 * phones). Form logic moved verbatim from the former inline form in
 * `pages/Expenses.tsx`.
 *
 * Footer contract: the submit button lives in the Modal footer (outside the
 * <form> element) and targets the form via `form="add-expense-form"`.
 *
 * ── Tax Deductibility Logic (NRS / CITA / PITA) ──
 * Core expense categories (rent, inventory, salary, utility, fuel, logistics,
 * marketing) are **always tax-deductible** under Nigerian law — they represent
 * standard operating expenses incurred wholly and exclusively for the business.
 * Only "other" is ambiguous (could be bank charges = deductible, or a LASTMA
 * fine = non-deductible), so only "other" shows the interactive checkbox.
 * Backend enforces the same rule as a guardrail.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { PieChart, CheckCircle2, XCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { Expense } from '@/types/index.ts';

const CATEGORIES = [
  'bank_charges',
  'communication',
  'depreciation',
  'fuel',
  'gift',
  'insurance',
  'interest',
  'inventory',
  'logistics',
  'marketing',
  'office_supplies',
  'other',
  'professional_fees',
  'rent',
  'repairs_maintenance',
  'salary',
  'subscription',
  'tax_permit',
  'travel',
  'utility',
] as const;

/**
 * Per-category educational hints — tells the SME owner what belongs in this
 * category AND confirms it's automatically tax-deductible. Builds trust and
 * prevents misclassification.
 */
const CATEGORY_TAX_HINTS: Record<string, string> = {
  bank_charges: 'Bank charges, transaction fees, account maintenance, card processing — fully deductible as cost of doing business.',
  communication: 'Business phone, internet bills, courier services, postal fees — communication costs are fully deductible.',
  fuel: 'Generator diesel, delivery vehicle petrol, business transport fuel — fully deductible as operating costs.',
  insurance: 'Business insurance, goods-in-transit cover, fire/theft protection — premiums are fully deductible as operating expenses.',
  inventory: 'Raw materials, goods for resale, stock purchases — cost of goods sold reduces your taxable profit.',
  logistics: 'Shipping, freight, dispatch riders, haulage, courier — delivery and transport costs are fully deductible.',
  marketing: 'Advertising, social media promotion, signage, flyers, branding — business development costs are deductible.',
  office_supplies: 'Stationery, printer supplies, toner, cleaning materials, small tools — fully deductible as operating expenses.',
  professional_fees: 'Legal, accounting, consulting, audit fees — professional services for business operations are fully deductible.',
  rent: 'Shop rent, warehouse lease, office space — business premises costs are fully tax-deductible.',
  repairs_maintenance: 'Equipment repairs, building maintenance, vehicle servicing — deductible when they maintain existing assets (not upgrades).',
  salary: 'Staff wages, employee compensation, casual workers — payroll expenses are fully tax-deductible.',
  subscription: 'Software subscriptions, SaaS licenses, professional memberships — fully deductible when used for business purposes.',
  travel: 'Business travel: airfare, hotel, transport, per diem — fully deductible when for business purposes (not personal trips).',
  utility: 'Electricity (NEPA/EKEDC), water, business internet, phone bills — operating utilities are fully deductible.',
};

type AddExpenseModalProps = {
  isOpen: boolean;
  businessId: string;
  /** When set, the modal is in EDIT mode and pre-fills from this expense */
  editExpense: Expense | null;
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

export default function AddExpenseModal({
  isOpen,
  businessId,
  editExpense,
  onClose,
  onSaved,
}: AddExpenseModalProps) {
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);

  // Form state (moved from Expenses.tsx)
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<string>('rent');
  const [categoryDetail, setCategoryDetail] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isDeductible, setIsDeductible] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEdit = editExpense !== null;
  
  // 3-tier tax deductibility classification
  const alwaysDeductible = [
    'rent', 'inventory', 'salary', 'utility', 'fuel', 'logistics', 'marketing',
    'subscription', 'insurance', 'professional_fees', 'repairs_maintenance',
    'bank_charges', 'communication', 'office_supplies', 'travel'
  ];
  const conditionalDeductible = ['gift', 'depreciation', 'interest', 'other'];
  const neverDeductible = ['tax_permit'];
  
  const isAlwaysDeductible = alwaysDeductible.includes(category);
  const isConditional = conditionalDeductible.includes(category);
  const isNeverDeductible = neverDeductible.includes(category);

  // ── Sync deductibility when category changes ───────────────
  // Always-deductible categories force isDeductible=true
  // Never-deductible categories force isDeductible=false
  // Conditional categories respect user's choice
  useEffect(() => {
    if (isAlwaysDeductible) {
      setIsDeductible(true);
    } else if (isNeverDeductible) {
      setIsDeductible(false);
    }
    // For conditional categories, preserve user's choice
  }, [category, isAlwaysDeductible, isNeverDeductible]);

  // Reset-on-open + edit pre-fill (same pattern as SalesImportModal)
  useEffect(() => {
    if (!isOpen) return;
    if (editExpense) {
      setAmount(String(Number(editExpense.amount)));
      setQuantity(
        String(editExpense.quantity ? Number(editExpense.quantity) : 1),
      );
      setCategory(editExpense.category);
      setCategoryDetail(editExpense.categoryDetail || '');
      setDescription(editExpense.description || '');
      setExpenseDate(
        new Date(editExpense.expenseDate).toISOString().slice(0, 10),
      );
      setIsDeductible(editExpense.isDeductible ?? true);
    } else {
      setAmount('');
      setQuantity('1');
      setCategory('rent');
      setCategoryDetail('');
      setDescription('');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setIsDeductible(true);
    }
  }, [isOpen, editExpense]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const basePath = `/businesses/${businessId}/expenses`;
    const qtyNum = Number(quantity);
    const body = {
      amount: Number(amount),
      quantity: qtyNum > 0 ? qtyNum : 1,
      category,
      // Only carry the detail for 'other'; switching away clears the stale value.
      categoryDetail: category === 'other' ? categoryDetail.trim() : null,
      description,
      expenseDate,
      // Deductibility resolution: always-deductible categories force true,
      // never-deductible (tax_permit) force false, conditional categories respect user choice.
      isDeductible: isAlwaysDeductible ? true : isNeverDeductible ? false : isDeductible,
    };
    try {
      if (editExpense) {
        await api.put(`${basePath}/${editExpense.id}`, body);
        toast.success('Expense updated');
        invalidateDashboard('expense_updated');
        onSaved('updated');
      } else {
        await api.post(basePath, body);
        toast.success('Expense created');
        invalidateDashboard('expense_created');
        onSaved('created');
      }
      onClose();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!saving}
      title={isEdit ? 'Edit Expense' : 'New Expense'}
      subtitle='Money your business spends'
      icon={<PieChart className='h-5 w-5 text-warning-500' />}
      size='md'
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
            form='add-expense-form'
            isLoading={saving}
            className='rounded-none'
          >
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id='add-expense-form'
        onSubmit={handleSubmit}
        className='grid grid-cols-1 gap-4 sm:grid-cols-2'
      >
        <Input
          label='Total Amount (₦)'
          type='number'
          inputMode='decimal'
          step='0.01'
          min='0.01'
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required
        />
        <Input
          label='Quantity'
          type='number'
          inputMode='decimal'
          step='any'
          min='0.01'
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required
        />
        {Number(quantity) > 1 && Number(amount) > 0 && (
          <div className='sm:col-span-2 -mt-2 px-3 py-1.5 rounded-none bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between'>
            <span>Per unit breakdown:</span>
            <span className='font-medium text-primary-600'>
              ₦
              {(
                Math.round(
                  ((Number(amount) || 0) / (Number(quantity) || 1)) * 100,
                ) / 100
              ).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              each × {quantity} = ₦
              {Number(amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
        <div className='space-y-1 sm:col-span-2'>
          <label
            htmlFor='expense-category'
            className='block text-xs font-semibold text-gray-700'
          >
            Category
          </label>
          <select
            id='expense-category'
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className='block w-full rounded-none border border-gray-300 px-3 py-2 text-xs focus:border-gray-900 focus:ring-0 outline-none transition-all'
          >
            {CATEGORIES.map((c) => {
              // Format labels: bank_charges → Bank Charges
              const label = c === 'office_supplies' ? 'Office Supplies'
                : c === 'professional_fees' ? 'Professional Fees'
                : c === 'repairs_maintenance' ? 'Repairs & Maintenance'
                : c === 'bank_charges' ? 'Bank Charges'
                : c === 'tax_permit' ? 'Tax/Permit'
                : c.charAt(0).toUpperCase() + c.slice(1);
              return (
                <option key={c} value={c}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        {category === 'other' && (
          <div className='sm:col-span-2'>
            <Input
              label='What is this expense? (required for "Other")'
              placeholder='e.g. Bank charges, office repairs, cleaning supplies'
              value={categoryDetail}
              onChange={(e) => setCategoryDetail(e.target.value)}
              maxLength={200}
              className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
              required
            />
            <p className='mt-0.5 text-xs text-gray-500'>
              Help us understand what &quot;Other&quot; means so your records
              stay accurate for tax filing.
            </p>
          </div>
        )}
        <Input
          label='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required
        />
        <Input
          label='Expense Date'
          type='date'
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
          required
        />

        {/* ── Tax Deductibility Section ─────────────────────────────
             Always deductible: green badge with educational hint
             Never deductible: red badge (tax_permit only)
             Conditional: amber badge with checkbox + category-specific guidance */}
        {isAlwaysDeductible ? (
          <div className='rounded-none border border-emerald-200 bg-emerald-50/60 p-3 sm:col-span-2'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
              <span className='text-xs font-semibold text-emerald-800'>
                Tax Deductible — CITA Allowable
              </span>
            </div>
            <p className='mt-1 text-[11px] text-emerald-700 leading-relaxed'>
              {CATEGORY_TAX_HINTS[category]}
            </p>
          </div>
        ) : isNeverDeductible ? (
          <div className='rounded-none border border-red-200 bg-red-50/60 p-3 sm:col-span-2'>
            <div className='flex items-center gap-2'>
              <XCircle className='h-4 w-4 text-red-600 shrink-0' />
              <span className='text-xs font-semibold text-red-800'>
                Non-Deductible — CITA §27(a)
              </span>
            </div>
            <p className='mt-1 text-[11px] text-red-700 leading-relaxed'>
              Government taxes, fines, penalties, and regulatory fees are NOT tax-deductible per CITA §27.
            </p>
          </div>
        ) : isConditional ? (
          <div className='rounded-none border border-amber-200 bg-amber-50 p-3 sm:col-span-2 space-y-2'>
            <div className='flex items-start gap-3'>
              <input
                id='isDeductible'
                type='checkbox'
                checked={isDeductible}
                onChange={(e) => setIsDeductible(e.target.checked)}
                className='mt-0.5 h-4 w-4 rounded-none border-gray-300 text-primary-600 focus:ring-primary-500'
              />
              <div className='flex-1'>
                <label
                  htmlFor='isDeductible'
                  className='block cursor-pointer text-xs font-semibold text-gray-900'
                >
                  Tax deductible
                </label>
                <p className='mt-0.5 text-[11px] text-gray-700 leading-relaxed'>
                  {category === 'gift' && (
                    isDeductible
                      ? 'Small promotional gifts to customers (≤₦500K/year total) are deductible under CITA. Personal gifts, lavish gifts, or gifts to directors/owners are NOT deductible.'
                      : 'Mark non-deductible if: gift exceeds ₦500K total per year, or is a personal/lavish gift, or to a director/owner/related party.'
                  )}
                  {category === 'depreciation' && (
                    isDeductible
                      ? 'Capital allowances per CITA §28-29 Schedule 2. Only claim depreciation if you are using the capital allowance method for this asset (not if you already expensed the full purchase cost).'
                      : 'Mark non-deductible if you already claimed the full asset cost as an expense in a prior period, or if the asset is personal/non-business.'
                  )}
                  {category === 'interest' && (
                    isDeductible
                      ? 'Interest on business loans is deductible under CITA §24(f), subject to thin-capitalization rules (debt-to-equity ratio limits). Business loans only — not personal loans.'
                      : 'Mark non-deductible if: the loan was for personal use, or your business exceeds thin-capitalization limits (debt > 3× equity for non-financial businesses).'
                  )}
                  {category === 'other' && (
                    isDeductible
                      ? 'This expense will reduce your taxable profit. Appropriate for legitimate business costs.'
                      : 'This expense will NOT reduce your taxable profit. Appropriate for government fines & penalties, personal/domestic expenses, owner drawings, or non-approved donations.'
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
