import { useState, useEffect } from 'react';
import { ChevronRight, FileCheck } from 'lucide-react';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { usePermission } from '@/components/auth/PermissionGate.tsx';
import TaxAssessmentModal from '@/components/TaxAssessmentModal.tsx';

export default function TaxProfileMigrationBanner() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const canReadTax = usePermission('tax.read');
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // A 403 from this endpoint means "no tax access", not "quiz not taken".
    if (!canReadTax || !biz?.id) {
      setHasProfile(null);
      return;
    }

    let isMounted = true;
    api
      .get(`/businesses/${biz.id}/tax-profile`)
      .then((res) => {
        if (isMounted) {
          const profile = res.data?.data;
          setHasProfile(Boolean(profile?.completedAt));
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasProfile(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [biz?.id, canReadTax]);

  if (!canReadTax || hasProfile !== false || !biz) return null;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary-600/10 via-primary-500/5 to-transparent border border-primary-200/80 shadow-xs animate-fade-in mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-xs shrink-0">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-primary-950">
                Action Recommended: Complete Your NTA 2025 Tax Assessment
              </p>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                0% CIT / VAT Relief
              </span>
            </div>
            <p className="text-[11px] text-primary-800 mt-0.5 max-w-xl leading-relaxed">
              Nigeria Tax Act 2025 exempts companies under ₦100M from CIT and businesses under ₦25M from VAT. Answer 10
              quick questions to ensure your monthly tax calculations apply the correct statutory rates.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all self-start sm:self-auto shrink-0 shadow-xs cursor-pointer"
        >
          Take 2-Min Assessment <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <TaxAssessmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        businessId={biz.id}
        businessName={biz.businessName}
        onSuccess={() => {
          setIsModalOpen(false);
          setHasProfile(true);
        }}
      />
    </>
  );
}
