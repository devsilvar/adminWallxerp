import React from 'react';
import { Landmark, Copy, Info, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

export interface DvaDetailsCardProps {
  accountNumber?: string;
  bankName?: string;
  accountName?: string;
  onShowQR?: () => void;
  onShare?: () => void;
  onCopy?: (text: string) => void;
  className?: string;
}

export const DvaDetailsCard: React.FC<DvaDetailsCardProps> = ({
  accountNumber,
  bankName = 'Wema Bank',
  accountName,
  onShowQR,
  onCopy,
  className = '',
}) => {
  const handleCopy = (text: string) => {
    if (onCopy) {
      onCopy(text);
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success('Account number copied');
    }
  };

  if (!accountNumber) {
    return null;
  }

  return (
    <div
      data-testid="dva-details-card"
      className={`order-1 sm:order-2 flex items-center justify-between gap-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 shadow-inner ${className}`}
    >
      <div>
        <div className="flex items-center gap-1.5 text-[11px] text-purple-200/80">
          <Landmark className="h-3.5 w-3.5" />
          <span>{bankName}</span>
        </div>
        <p
          data-testid="dva-account-number"
          className="font-mono text-xl sm:text-2xl font-bold text-white tracking-widest tabular-nums mt-0.5"
        >
          {accountNumber}
        </p>
        {accountName && (
          <div
            data-testid="dva-account-name"
            className="mt-0.5 text-[11px] text-purple-300/70 truncate max-w-[200px]"
          >
            {accountName}
          </div>
        )}
        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-purple-200/90 bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
          <Info className="h-3 w-3 text-purple-300 shrink-0" />
          <span>1% fee on incoming transfers (max ₦300)</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => handleCopy(accountNumber)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors cursor-pointer"
          title="Copy Account Number"
          aria-label="Copy Account Number"
        >
          <Copy className="h-4 w-4 text-purple-200" />
        </button>
        {onShowQR && (
          <button
            type="button"
            onClick={onShowQR}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors cursor-pointer"
            title="Scan QR Code"
            aria-label="Scan QR Code"
          >
            <QrCode className="h-4 w-4 text-purple-200" />
          </button>
        )}
      </div>
    </div>
  );
};

export default DvaDetailsCard;
