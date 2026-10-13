/**
 * Modal — the shared modal primitive for the design system.
 *
 * Extracted from the shell that `SalesImportModal.tsx` hand-rolled (its header
 * comment asked for this exact extraction "when we have a third caller" —
 * AddSaleModal / AddExpenseModal are callers #3 and #4).
 *
 * Mobile-first: on phones the panel docks to the bottom edge (thumb-reach
 * bottom sheet); from `sm:` up it centers like a classic dialog.
 *
 * IMPORTANT — footer-outside-form contract:
 *   `footer` renders OUTSIDE the <form> element (children own the body). A
 *   submit button placed in `footer` must carry the `form="…"` attribute
 *   pointing at the form's id, otherwise onSubmit never fires.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Optional lucide icon rendered in the header chip */
  icon?: ReactNode;
  size?: ModalSize;
  /** Action bar under the body — see the footer-outside-form contract above */
  footer?: ReactNode;
  children: ReactNode;
  /** Allow closing via Escape / backdrop tap. Default true */
  dismissible?: boolean;
};

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  children,
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Escape-to-close + focus trap (Tab cycles inside the panel only)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dismissible, onClose]);

  // Body scroll lock + focus management (in on open, back on close)
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150'
      onClick={(e) => {
        // Only a direct tap on the backdrop closes — clicks inside the panel
        // bubble here but e.target !== e.currentTarget filters them out.
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='modal-title'
        tabIndex={-1}
        className={`relative z-10 flex max-h-[88vh] w-full flex-col rounded-none bg-white shadow-2xl border border-gray-300 outline-none my-auto pointer-events-auto animate-in zoom-in-95 duration-150 ${SIZE_CLASS[size]}`}
      >
        {/* Pinned Straight Header */}
        <div className='shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50'>
          <div className='flex items-center gap-2.5'>
            {icon && (
              <div className='flex h-8 w-8 items-center justify-center rounded-none bg-primary-50 text-primary-600 border border-primary-200 shrink-0'>
                {icon}
              </div>
            )}
            <div>
              <h2 id='modal-title' className='text-sm sm:text-base font-bold text-gray-900 leading-tight'>
                {title}
              </h2>
              {subtitle && <p className='text-[11px] text-gray-500 mt-0.5'>{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={() => {
              if (dismissible) onClose();
            }}
            disabled={!dismissible}
            aria-label='Close modal'
            className='rounded-none p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Scrollable Compact Body */}
        <div className='flex-1 overflow-y-auto px-5 py-4'>{children}</div>

        {/* Pinned Straight Footer */}
        {footer && (
          <div className='shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 border-t border-gray-200 px-5 py-3 bg-gray-50'>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
