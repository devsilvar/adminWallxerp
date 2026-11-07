import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Check, Crown, ArrowRight } from 'lucide-react';

interface FreeWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName?: string;
}

export default function FreeWelcomeModal({
  isOpen,
  onClose,
  businessName,
}: FreeWelcomeModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden'>
      {/* Backdrop */}
      <div className='absolute inset-0 cursor-default' onClick={onClose} />

      {/* Modal Dialog */}
      <div className='relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150'>
        {/* Header */}
        <div className='relative p-5 sm:p-6 pb-4 border-b border-gray-100'>
          <button
            type='button'
            onClick={onClose}
            className='absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
            aria-label='Close welcome modal'
          >
            <X className='h-4 w-4' />
          </button>

          <div className='inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 mb-2.5'>
            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
            <span>Compliance Foundation Active</span>
          </div>

          <h2 className='text-lg sm:text-xl font-bold text-gray-900 tracking-tight'>
            Welcome to WallXERP{businessName ? `, ${businessName}` : ''}!
          </h2>
          <p className='mt-1 text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Your business profile is set up and active on the <strong>Free Plan</strong>. You have complete access to essential compliance tools at zero cost.
          </p>
        </div>

        {/* Content Body */}
        <div className='p-5 sm:p-6 space-y-4'>
          {/* What's Included */}
          <div>
            <span className='text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-2'>
              Included in your Free Plan:
            </span>
            <ul className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600'>
              <li className='flex items-center gap-2 p-2 rounded-lg bg-gray-50/70 border border-gray-100'>
                <Check className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
                <span>1 Business Profile</span>
              </li>
              <li className='flex items-center gap-2 p-2 rounded-lg bg-gray-50/70 border border-gray-100'>
                <Check className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
                <span>Up to 3 Team Members</span>
              </li>
              <li className='flex items-center gap-2 p-2 rounded-lg bg-gray-50/70 border border-gray-100'>
                <Check className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
                <span>5 Invoices / month</span>
              </li>
              <li className='flex items-center gap-2 p-2 rounded-lg bg-gray-50/70 border border-gray-100'>
                <Check className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
                <span>Instant NRS Tax Reports</span>
              </li>
            </ul>
          </div>

          {/* Pro Growth Callout */}
          <div className='rounded-xl border border-primary-100 bg-primary-50/40 p-3.5 sm:p-4 flex items-start gap-3'>
            <div className='h-8 w-8 rounded-lg bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-2xs'>
              <Crown className='h-4 w-4' />
            </div>
            <div className='text-xs'>
              <span className='font-bold text-gray-900 block'>
                Need more features as your business grows?
              </span>
              <p className='text-gray-600 mt-0.5 leading-relaxed'>
                Upgrade to <strong>Starter</strong> (₦5,000/mo) for unlimited invoices and Excel bulk imports, or <strong>Business</strong> (₦12,000/quarter · Save ₦3,000) for AI CFO queries and customer credit.
              </p>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className='p-4 sm:p-5 bg-gray-50/80 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5'>
          <Link
            to='/subscription'
            onClick={onClose}
            className='text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline inline-flex items-center gap-1'
          >
            <span>Explore Pro Plans & Pricing</span>
            <ArrowRight className='h-3 w-3' />
          </Link>

          <button
            type='button'
            onClick={onClose}
            className='w-full sm:w-auto px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors'
          >
            Start Using Dashboard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
