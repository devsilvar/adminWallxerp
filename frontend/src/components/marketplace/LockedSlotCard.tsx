import Button from '@/components/ui/Button.tsx';
import { Lock, Sparkles, TrendingUp, HelpCircle } from 'lucide-react';

type LockedSlotCardProps = {
  slotNumber: number;
  totalContacts: number;
  onUnlock: () => void;
};

export default function LockedSlotCard({
  slotNumber,
  totalContacts,
  onUnlock,
}: LockedSlotCardProps) {
  const hasInquiries = totalContacts >= 1;

  return (
    <div
      data-testid="locked-slot-card"
      className="border-2 border-dashed border-purple-200 bg-gradient-to-b from-purple-50/40 via-white to-gray-50/60 rounded-xl p-6 flex flex-col justify-between text-center relative overflow-hidden min-h-[300px] shadow-sm hover:border-purple-300 transition-colors"
    >
      {/* Top Badge */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded flex items-center gap-1">
          <Lock className="w-3 h-3 text-purple-600" />
          Slot {slotNumber} · Locked
        </span>

        {hasInquiries ? (
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Ready to Unlock
          </span>
        ) : (
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            Seed Stage
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="my-auto py-4 space-y-2.5">
        <div className="w-12 h-12 rounded-full bg-purple-100/80 text-purple-600 flex items-center justify-center mx-auto shadow-inner">
          <Lock className="w-6 h-6" />
        </div>

        <h3 className="font-bold text-gray-900 text-base">
          Showcase Expansion
        </h3>

        {hasInquiries ? (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-600 max-w-[240px] mx-auto">
              Your listings got{' '}
              <strong className="text-purple-700 font-semibold">
                {totalContacts} buyer {totalContacts === 1 ? 'inquiry' : 'inquiries'}
              </strong>
              . Expand capacity with a {slotNumber}th slot for{' '}
              <span className="font-bold text-gray-900">₦2,500</span>.
            </p>
            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              <Sparkles className="w-3 h-3" />
              <span>Permanent capacity expansion</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 max-w-[230px] mx-auto leading-relaxed">
              Get at least 1 buyer inquiry on your active showcase to unlock additional
              slot capacity.
            </p>
            <p className="text-[11px] text-gray-400 max-w-[220px] mx-auto flex items-center justify-center gap-1">
              <HelpCircle className="w-3 h-3" />
              <span>We gate capacity until your current listings convert.</span>
            </p>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="pt-3 border-t border-purple-100/60">
        {hasInquiries ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onUnlock}
            className="w-full justify-center bg-purple-600 hover:bg-purple-700 text-white shadow-sm font-semibold text-xs py-2"
          >
            Unlock Slot (₦2,500)
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled
            className="w-full justify-center border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed text-xs py-2"
          >
            Inquiry Required to Unlock
          </Button>
        )}
      </div>
    </div>
  );
}
