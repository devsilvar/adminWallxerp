import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Download,
  AlertTriangle,
  Building,
  Clock,
  Sparkles,
} from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import Skeleton from '@/components/ui/Skeleton.tsx';
import api, { getErrorMessage } from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { QuizAnswers, TaxProfileConfiguration } from '@/lib/tax-constants.ts';
import TaxAssessmentModal from '@/components/TaxAssessmentModal.tsx';

export interface BusinessTaxProfileResponse {
  id: string;
  businessId: string;
  quizAnswers: QuizAnswers;
  computedConfig: TaxProfileConfiguration;
  completedAt: string | null;
  lastReviewedAt: string | null;
  needsManualReview: boolean;
  reviewReasons: string[];
}

interface TaxProfileCardProps {
  businessId: string;
  businessName?: string;
}

export default function TaxProfileCard({ businessId, businessName }: TaxProfileCardProps) {
  const [profile, setProfile] = useState<BusinessTaxProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [businessId]);

  async function fetchProfile() {
    setLoading(true);
    try {
      const res = await api.get(`/businesses/${businessId}/tax-profile`);
      setProfile(res.data?.data ?? null);
    } catch {
      // If 404 or profile doesn't exist, profile is null
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const res = await api.get(`/businesses/${businessId}/tax-profile/obligation-report.pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-obligation-report-${businessId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Tax Obligation Report downloaded successfully');
    } catch (err: any) {
      let message = 'Failed to generate PDF report';
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          message = json?.error?.message || json?.message || message;
        } catch {
          // fallback
        }
      } else {
        message = getErrorMessage(err) || message;
      }
      toast.error(message);
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  // Profile not completed yet
  if (!profile || !profile.completedAt) {
    return (
      <>
        <Card className="p-6 mb-6 border-2 border-primary-200 bg-gradient-to-r from-primary-50/60 via-white to-primary-50/30">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary-100 text-primary-700 rounded-xl mt-0.5">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Statutory Tax Assessment (NTA 2025)
                  </h3>
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                    Action Recommended
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
                  Under the Nigeria Tax Act (NTA) 2025, small companies with turnover under ₦100M enjoy{' '}
                  <strong className="text-gray-900">0% CIT</strong> and businesses under ₦25M are{' '}
                  <strong className="text-gray-900">100% exempt from VAT</strong>. Answer 10 quick questions to evaluate
                  your statutory rates and download an official Obligation Report.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => setIsModalOpen(true)}
              className="whitespace-nowrap shadow-sm hover:shadow"
            >
              Start 2-Min Assessment
            </Button>
          </div>
        </Card>

        <TaxAssessmentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          businessId={businessId}
          businessName={businessName}
          initialAnswers={profile?.quizAnswers}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchProfile();
          }}
        />
      </>
    );
  }

  const { computedConfig } = profile;

  // Determine Primary Badge
  let badgeLabel = 'Standard Corporate Tax';
  let badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';

  if (computedConfig.isFtzExempt) {
    badgeLabel = 'Free Trade Zone (100% Tax Exempt)';
    badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else if (computedConfig.incomeTaxType === 'PIT') {
    badgeLabel = 'Personal Income Tax (0% - 25% Bands)';
    badgeColor = 'bg-purple-100 text-purple-800 border-purple-200';
  } else if (computedConfig.citRate === 0) {
    badgeLabel = '0% Small Company CIT';
    badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else {
    badgeLabel = '30% CIT + 4% Development Levy';
    badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
  }

  return (
    <>
      <Card className="p-6 mb-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-50 text-primary-700 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-semibold text-gray-900">
                  Tax Profile & Statutory Classification
                </h3>
                <span className={`px-3 py-0.5 text-xs font-semibold rounded-full border ${badgeColor}`}>
                  {badgeLabel}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Assessed under Nigeria Tax Act (NTA) 2025 • Verified on{' '}
                {new Date(profile.completedAt).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              isLoading={downloadingPdf}
              className="text-xs"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download PDF Report
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs text-gray-600 hover:text-gray-900"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Retake Quiz
            </Button>
          </div>
        </div>

        {profile.needsManualReview && profile.reviewReasons.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800 space-y-1">
              <span className="font-semibold">Review Recommendations:</span>
              <ul className="list-disc pl-4 space-y-0.5">
                {profile.reviewReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500 font-medium">VAT Obligation</span>
            <div className="text-sm font-semibold text-gray-900 mt-1 flex items-center gap-1.5">
              {computedConfig.vatExempt ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Exempt (&lt; ₦25M)
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Standard VAT
                </>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500 font-medium">Tax Authority</span>
            <div className="text-sm font-semibold text-gray-900 mt-1 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-gray-400" />
              {computedConfig.primaryTaxAuthority === 'NRS_FEDERAL' ? 'Federal NRS' : 'State IRS (SIRS)'}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500 font-medium">PAYE / Employee Tax</span>
            <div className="text-sm font-semibold text-gray-900 mt-1">
              {computedConfig.mustDeductPAYE ? 'Required (Monthly)' : 'Not Required'}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500 font-medium">Annual Income Filing</span>
            <div className="text-sm font-semibold text-gray-900 mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {computedConfig.incomeTaxType === 'CIT' ? '30 June (CIT)' : '31 March (PIT)'}
            </div>
          </div>
        </div>
      </Card>

      <TaxAssessmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        businessId={businessId}
        businessName={businessName}
        initialAnswers={profile.quizAnswers}
        onSuccess={() => {
          setIsModalOpen(false);
          fetchProfile();
        }}
      />
    </>
  );
}
