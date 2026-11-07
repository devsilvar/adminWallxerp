import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Crown, ArrowRight } from 'lucide-react';

interface PendingActivationModalProps {
  isOpen: boolean;
  requestedPlan: string;
}

const PLAN_META: Record<string, { label: string; price: string }> = {
  starter: { label: 'Starter', price: '₦5,000/mo' },
  business: { label: 'Business', price: '₦12,000/quarter' },
  scale: { label: 'Scale-Up', price: '₦45,000/year' },
};

export default function PendingActivationModal({
  isOpen,
  requestedPlan,
}: PendingActivationModalProps) {
  const navigate = useNavigate();
  const meta = PLAN_META[requestedPlan] ?? { label: requestedPlan, price: '' };

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={() => navigate('/subscription')}
          className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Go to Subscription"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-7 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <Crown className="h-3.5 w-3.5" />
            Activation required
          </span>

          <h2 className="mt-4 text-lg font-bold text-gray-900">
            You selected {meta.label}
            {meta.price ? ` — ${meta.price}` : ''}
          </h2>

          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Your plan is pending activation. Go to <strong>Subscription</strong> to
            choose — start your <strong>Free Trial</strong> or pay for{' '}
            <strong>{meta.label}</strong> to get activated by an admin.
          </p>

          <button
            type="button"
            onClick={() => navigate('/subscription')}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm px-6 py-3 shadow-sm transition-colors"
          >
            Go to Subscription
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
