/**
 * InvoiceStatusPill — renders a colored status badge for invoices.
 *
 * Status hierarchy:
 * - draft: gray
 * - sent: blue
 * - partial: amber (partially paid)
 * - paid: green
 * - overdue: red
 * - cancelled: gray/strikethrough
 */
import type { InvoiceStatus } from '../../types';

type Props = {
  status: InvoiceStatus;
  className?: string;
};

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; bgColor: string; borderColor: string; textColor: string }
> = {
  draft: {
    label: 'Draft',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-700',
  },
  sent: {
    label: 'Sent',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-800',
  },
  partial: {
    label: 'Partial',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-800',
  },
  paid: {
    label: 'Paid',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
    textColor: 'text-green-800',
  },
  overdue: {
    label: 'Overdue',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    textColor: 'text-red-800',
  },
  cancelled: {
    label: 'Cancelled',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-600',
  },
};

export default function InvoiceStatusPill({ status, className = '' }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${config.bgColor} ${config.borderColor} ${config.textColor} ${className}`}
    >
      {config.label}
    </span>
  );
}
