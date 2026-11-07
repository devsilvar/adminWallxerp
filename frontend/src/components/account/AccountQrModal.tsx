import React, { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Loader2, X } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import toast from 'react-hot-toast';

const QRCode = lazy(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })));

export interface AccountQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export const AccountQrModal: React.FC<AccountQrModalProps> = ({
  isOpen,
  onClose,
  businessName,
  bankName,
  accountNumber,
  accountName,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || !accountNumber) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${bankName} - ${accountNumber}`);
    toast.success('Copied to clipboard');
  };

  return createPortal(
    <div
      data-testid="account-qr-modal"
      className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
      onClick={onClose}
    >
      <div
        className="relative z-10 w-full max-w-sm flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 p-6 sm:p-7 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-none border border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center mb-5">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Scan to Transfer</h3>
          <p className="text-xs text-gray-500 mt-0.5">Show this to a customer to receive an instant transfer</p>
        </div>

        <div className="bg-gray-50 rounded-none p-5 mb-5 border border-gray-200">
          <div className="bg-white p-4 rounded-none border border-gray-200 flex flex-col items-center shadow-xs">
            <Suspense fallback={<Loader2 className="h-10 w-10 animate-spin text-gray-300 my-12" />}>
              <QRCode
                value={`Pay ${businessName}\nBank: ${bankName}\nAccount Number: ${accountNumber}\nAccount Name: ${accountName}`}
                size={170}
                level="M"
                marginSize={2}
              />
            </Suspense>
            <p className="text-center font-mono text-2xl font-bold text-gray-900 mt-4 tracking-widest tabular-nums">
              {accountNumber}
            </p>
            <p className="text-center text-xs text-gray-600 mt-1">
              {bankName} · <span className="font-semibold text-gray-900">{accountName}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1 text-xs rounded-none" subscriptionExempt={true} onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy Details
          </Button>
          <Button variant="outline" size="sm" subscriptionExempt={true} onClick={onClose} className="text-xs rounded-none">
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AccountQrModal;
