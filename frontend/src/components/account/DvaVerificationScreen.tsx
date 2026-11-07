import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Landmark,
  RefreshCw,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';

export interface DvaVerificationScreenProps {
  loading: boolean;
  onRefresh: () => void;
  onEditDetails: () => void;
}

export const DvaVerificationScreen: React.FC<DvaVerificationScreenProps> = ({
  loading,
  onRefresh,
  onEditDetails,
}) => {
  return (
    <div
      data-testid="dva-verification-screen"
      className="mx-auto max-w-2xl animate-fade-in py-6 sm:py-10"
    >
      <div className="rounded-2xl border border-gray-200/90 bg-white p-8 sm:p-10 shadow-lg text-center">
        {/* Animated Radar/Shield Icon */}
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-60" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 border border-primary-200/80 shadow-xs">
            <ShieldCheck className="h-10 w-10 text-primary-600" />
          </span>
        </div>

        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          Verifying Your Identity
        </h2>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Your BVN and bank account details are being cross-verified with NIBSS and Paystack.
        </p>

        {/* 3-Stage Progress Timeline */}
        <div className="my-8 max-w-sm mx-auto rounded-xl bg-gray-50/80 border border-gray-200/70 p-5 text-left space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">
                Identity Details Submitted
              </p>
              <p className="text-[11px] text-gray-500">
                BVN and bank account details received
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary-700">
                NIBSS &amp; Bank Verification
              </p>
              <p className="text-[11px] text-gray-500">
                Matching account name with BVN records in progress
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-400">
              <Landmark className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400">
                Dedicated Account Creation
              </p>
              <p className="text-[11px] text-gray-400">
                Wema Bank dedicated NUBAN assignment
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-3.5 text-xs text-blue-800 max-w-md mx-auto mb-6">
          <p className="leading-relaxed">
            ⏱️ <strong>This typically takes 1–3 minutes.</strong> We are automatically checking the status every 5 seconds. You may safely navigate to other pages — we'll notify you once active!
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={onRefresh} isLoading={loading} size="sm" subscriptionExempt={true}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditDetails} subscriptionExempt={true}>
            Edit Details
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DvaVerificationScreen;
