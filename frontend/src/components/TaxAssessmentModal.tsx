import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  CheckCircle2,
  Download,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import api, { getErrorMessage } from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import {
  evaluateTaxConfig,
  type QuizAnswers,
  type TaxProfileConfiguration,
} from '@/lib/tax-quiz-engine.ts';

interface TaxAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  businessName?: string;
  initialAnswers?: QuizAnswers;
  onSuccess?: () => void;
}

const DEFAULT_ANSWERS: QuizAnswers = {
  legalStructure: 'BUSINESS_NAME',
  annualTurnover: 'UNDER_25M',
  fixedAssetsValue: 'UNDER_250M',
  businessType: 'STANDARD',
  businessTypeOther: '',
  hasEmployeesAbove800k: false,
  isMultiState: false,
  hasDigitalAssets: false,
  isExportOriented: false,
  hasCorporateClientsWithWHT: false,
  isInFreeTradeZone: false,
};

export default function TaxAssessmentModal({
  isOpen,
  onClose,
  businessId,
  businessName,
  initialAnswers,
  onSuccess,
}: TaxAssessmentModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers ?? DEFAULT_ANSWERS);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [computedResult, setComputedResult] = useState<TaxProfileConfiguration | null>(null);

  // Sync initial answers when opened
  useEffect(() => {
    if (isOpen) {
      if (initialAnswers) {
        setAnswers(initialAnswers);
      }
      setCurrentStep(1);
      setComputedResult(null);
    }
  }, [isOpen, initialAnswers]);

  if (!isOpen) return null;

  const totalQuestions = 10;
  const progressPct = currentStep <= totalQuestions ? Math.round((currentStep / totalQuestions) * 100) : 100;

  function updateAnswer<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      const liveConfig = evaluateTaxConfig(answers);
      setComputedResult(liveConfig);

      await api.post(`/businesses/${businessId}/tax-profile`, { answers });
      toast.success('Tax profile assessed and saved successfully');
      setCurrentStep(11); // Results view
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Failed to save tax assessment');
    } finally {
      setSubmitting(false);
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
      toast.success('Obligation report downloaded');
    } catch (err: any) {
      let message = 'Failed to download report';
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

  function handleCompleteAndClose() {
    onSuccess?.();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary-600 text-white rounded-lg shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {currentStep <= totalQuestions ? 'Statutory Tax Profile Assessment' : 'Assessment Summary'}
              </h2>
              <p className="text-xs text-gray-500">
                {businessName ? `${businessName} • ` : ''}Nigeria Tax Act (NTA) 2025
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar (Questions 1-10) */}
        {currentStep <= totalQuestions && (
          <div className="bg-gray-100 h-1.5 w-full">
            <div
              className="bg-primary-600 h-1.5 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Question 1: Legal Structure */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 1 of 10</span>
                <span>Legal Structure</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                How is your business registered in Nigeria?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Why this matters:</strong> Companies (LTD/LLC) fall under Federal NRS jurisdiction for Company
                  Income Tax (CIT), whereas Business Names and Individuals pay Personal Income Tax (PIT) to their State IRS.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: 'BUSINESS_NAME' as const,
                    title: 'Registered Business Name (Sole Proprietorship / Enterprise)',
                    desc: 'Registered with CAC as an enterprise or business name. Subject to Personal Income Tax (State IRS).',
                  },
                  {
                    value: 'LLC' as const,
                    title: 'Limited Liability Company (LTD / LLC)',
                    desc: 'Incorporated company. Governed by Federal NRS for Corporate Income Tax (CIT).',
                  },
                  {
                    value: 'UNREGISTERED' as const,
                    title: "Unregistered (Freelancer, Personal Hustle)",
                    desc: 'Operating without CAC registration. Subject to individual Personal Income Tax (State IRS).',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateAnswer('legalStructure', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.legalStructure === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.legalStructure === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.legalStructure === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 2: Turnover */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 2 of 10</span>
                <span>Annual Revenue</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                What is your estimated annual turnover (total sales)?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Statutory Thresholds (NTA 2025):</strong> Businesses with turnover under ₦25M are completely{' '}
                  <strong>exempt from VAT</strong>. Companies with turnover up to ₦100M enjoy{' '}
                  <strong>0% Corporate Income Tax</strong>.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: 'UNDER_25M' as const,
                    title: 'Under ₦25 Million',
                    desc: '100% VAT-Exempt under NTA 2025 ss144-188. No monthly VAT remittance required.',
                  },
                  {
                    value: 'M25M_TO_50M' as const,
                    title: '₦25 Million to ₦50 Million',
                    desc: 'Subject to standard VAT collection. Qualifies for 0% CIT (if corporate and assets ≤ ₦250M).',
                  },
                  {
                    value: 'M50M_TO_100M' as const,
                    title: '₦50 Million to ₦100 Million',
                    desc: 'Subject to standard VAT collection. Qualifies for 0% Small Company CIT (gazetted NTA 2025 s56).',
                  },
                  {
                    value: 'ABOVE_100M' as const,
                    title: 'Above ₦100 Million',
                    desc: 'Standard Large Corporate Tax: 30% CIT + 4% Development Levy on profits.',
                  },
                  {
                    value: 'UNKNOWN' as const,
                    title: "I don't know yet (New or early-stage business)",
                    desc: 'We will apply conservative small business relief and prompt for year-end confirmation.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateAnswer('annualTurnover', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.annualTurnover === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.annualTurnover === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.annualTurnover === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 3: Fixed Assets */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 3 of 10</span>
                <span>Fixed Assets Value</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                What is the total value of your business fixed assets?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Asset Test:</strong> Total book value of plant, machinery, vehicles, tools, and business property.
                  Companies with assets exceeding ₦250 Million are classified as large companies regardless of revenue.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: 'UNDER_250M' as const,
                    title: '₦250 Million or less',
                    desc: 'Meets the statutory asset threshold for small company 0% CIT relief.',
                  },
                  {
                    value: 'ABOVE_250M' as const,
                    title: 'More than ₦250 Million',
                    desc: 'Exceeds asset threshold; standard corporate tax rules apply.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateAnswer('fixedAssetsValue', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.fixedAssetsValue === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.fixedAssetsValue === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.fixedAssetsValue === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 4: Business Type */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 4 of 10</span>
                <span>Industry Classification</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                What industry best describes your business activity?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Statutory Exclusions & Incentives:</strong> Primary agriculture qualifies for a 5-year tax holiday.
                  Professional services (law, accounting, engineering) are excluded from the 0% small-company CIT rate.
                </span>
              </p>

              <div className="space-y-2 pt-2">
                {[
                  {
                    value: 'STANDARD' as const,
                    title: 'Retail, Trading, E-commerce, Manufacturing, or Hospitality',
                  },
                  {
                    value: 'PROFESSIONAL' as const,
                    title: 'Professional Services (Legal, Accounting, Consulting, Medical, Engineering)',
                  },
                  {
                    value: 'TECH_SOFTWARE' as const,
                    title: 'Tech/Software Studio, SaaS, or Digital Agency',
                  },
                  {
                    value: 'AGRICULTURE' as const,
                    title: 'Primary Agriculture, Crop Farming, or Agro-Processing (5-Yr Holiday)',
                  },
                  {
                    value: 'REGULATED_FINANCIAL' as const,
                    title: 'Regulated Financial Services (Fintech, Lending, Investments)',
                  },
                  {
                    value: 'OTHER' as const,
                    title: 'Other Business Activity',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateAnswer('businessType', opt.value)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                      answers.businessType === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <span className="font-semibold text-sm text-gray-900">{opt.title}</span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        answers.businessType === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.businessType === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}

                {answers.businessType === 'OTHER' && (
                  <div className="pt-2">
                    <Input
                      label="Please describe your business activity"
                      placeholder="e.g. Creative Photography & Video Studio"
                      value={answers.businessTypeOther ?? ''}
                      onChange={(e) => updateAnswer('businessTypeOther', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Question 5: High-earning Employees */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 5 of 10</span>
                <span>Employee Payroll (PAYE)</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Do you have employees earning more than ₦800,000 per year?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>NTA 2025 s81 PAYE Threshold:</strong> Employees earning ₦800,000 or less per year (₦66,667/month)
                  are tax-free. If you pay any worker above this, you must deduct PAYE monthly and remit by the 10th.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'No, all staff earn ₦800,000 or less (or no staff)',
                    desc: 'No monthly PAYE payroll tax deduction or split remittance required.',
                  },
                  {
                    value: true,
                    title: 'Yes, at least one employee earns above ₦800,000/year',
                    desc: 'Must register with State IRS and remit employee PAYE deductions by the 10th of every month.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('hasEmployeesAbove800k', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.hasEmployeesAbove800k === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.hasEmployeesAbove800k === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.hasEmployeesAbove800k === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 6: Multi-State Presence */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 6 of 10</span>
                <span>Geographic Presence</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Do you have shops, offices, or remote staff in multiple Nigerian states?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Multi-Jurisdiction PAYE:</strong> In Nigeria, employee personal tax is owed to the State where
                  the employee resides, not where the company is headquartered.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'Single state only',
                    desc: 'All business activities and staff are located in one primary Nigerian state.',
                  },
                  {
                    value: true,
                    title: 'Multiple states (branches, physical offices, or remote employees)',
                    desc: 'Requires multi-state split payroll returns to respective State Internal Revenue Services.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('isMultiState', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.isMultiState === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.isMultiState === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.isMultiState === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 7: Digital Assets */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 7 of 10</span>
                <span>Digital Assets</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Does your business trade, hold, or accept digital assets (crypto, tokens)?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Capital Gains Tax (CGT):</strong> NTA 2025 explicitly recognizes digital asset disposals. Small
                  companies qualifying for 0% CIT enjoy 0% CGT, whereas standard companies pay 30%.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'No, we only transact in standard currency (Naira, USD, etc.)',
                    desc: 'No specialized digital asset capital gains tax tracking required.',
                  },
                  {
                    value: true,
                    title: 'Yes, we trade, buy, or hold digital assets/cryptocurrencies',
                    desc: 'Digital asset disposals will be audited for Capital Gains Tax compliance.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('hasDigitalAssets', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.hasDigitalAssets === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.hasDigitalAssets === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.hasDigitalAssets === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 8: Export Oriented */}
          {currentStep === 8 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 8 of 10</span>
                <span>Export Revenue</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Does your business generate 100% of its revenue from foreign exports?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Export Incentives:</strong> 100% export businesses selling goods or services abroad may qualify
                  for zero-rated VAT and profit tax exemptions (subject to repatriation proof).
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'No, we sell to Nigerian customers (or mixed domestic/export)',
                    desc: 'Standard domestic Nigerian market tax rules apply.',
                  },
                  {
                    value: true,
                    title: 'Yes, 100% of our goods/services are exported abroad',
                    desc: 'May qualify for zero-rated VAT and specialized export tax relief.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('isExportOriented', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.isExportOriented === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.isExportOriented === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.isExportOriented === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 9: Corporate Clients (WHT) */}
          {currentStep === 9 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 9 of 10</span>
                <span>Withholding Tax Credits</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Do corporate clients deduct Withholding Tax (WHT) before paying your invoices?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Tax Credits:</strong> WHT deducted by corporate clients (2% - 10%) is an advance payment of your
                  tax. Enabling WHT credit tracking lets you accumulate credit notes to offset against your tax liability.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'No, we sell direct to consumers (B2C) or receive 100% gross payout',
                    desc: 'No client withholding credit deductions to track.',
                  },
                  {
                    value: true,
                    title: 'Yes, corporate clients deduct WHT (2% to 10%) from our payments',
                    desc: 'We will enable WHT credit note tracking to offset your annual tax obligations.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('hasCorporateClientsWithWHT', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.hasCorporateClientsWithWHT === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.hasCorporateClientsWithWHT === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.hasCorporateClientsWithWHT === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question 10: Free Trade Zone */}
          {currentStep === 10 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-600 uppercase tracking-wider">
                <span>Question 10 of 10</span>
                <span>Free Trade Zone Status</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Is your business licensed and physically located inside a Free Trade Zone (FTZ)?
              </h3>
              <p className="text-xs text-gray-500 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>100% Tax Exemption:</strong> Businesses operating under NEPZA or OGFZA licenses in authorized
                  Free Trade Zones (e.g. Lekki Free Zone) enjoy full statutory exemption from CIT, VAT, CGT, and WHT.
                </span>
              </p>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    value: false,
                    title: 'No, we operate in the standard Nigerian tax jurisdiction',
                    desc: 'Standard Nigerian tax laws and statutory rates apply.',
                  },
                  {
                    value: true,
                    title: 'Yes, we are licensed in an approved Free Trade Zone (e.g. NEPZA, Lekki FTZ)',
                    desc: 'Full 100% statutory exemption from Nigerian taxes.',
                  },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => updateAnswer('isInFreeTradeZone', opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start justify-between ${
                      answers.isInFreeTradeZone === opt.value
                        ? 'border-primary-600 bg-primary-50/40 ring-1 ring-primary-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                        answers.isInFreeTradeZone === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {answers.isInFreeTradeZone === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 11: Assessment Summary & Results */}
          {currentStep === 11 && computedResult && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Tax Profile Assessment Complete</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Your statutory classification has been determined under the Nigeria Tax Act (NTA) 2025.
                </p>
              </div>

              {/* Status Banner */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Statutory Classification
                  </span>
                  <span className="px-3 py-1 text-xs font-bold rounded-full bg-primary-100 text-primary-800 border border-primary-200">
                    {computedResult.isFtzExempt
                      ? 'Free Trade Zone (100% Tax Exempt)'
                      : computedResult.incomeTaxType === 'PIT'
                      ? 'Personal Income Tax (PIT)'
                      : computedResult.citRate === 0
                      ? '0% Small Company CIT'
                      : '30% CIT + 4% Dev Levy'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-gray-500">VAT Status:</span>
                    <div className="font-semibold text-gray-900 mt-0.5">
                      {computedResult.vatExempt ? 'Exempt (< ₦25M turnover)' : 'Standard VAT'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Tax Authority:</span>
                    <div className="font-semibold text-gray-900 mt-0.5">
                      {computedResult.primaryTaxAuthority === 'NRS_FEDERAL' ? 'Federal NRS' : 'State IRS (SIRS)'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Annual Return Due:</span>
                    <div className="font-semibold text-gray-900 mt-0.5">
                      {computedResult.incomeTaxType === 'CIT' ? '30 June (CIT)' : '31 March (PIT)'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Employee PAYE:</span>
                    <div className="font-semibold text-gray-900 mt-0.5">
                      {computedResult.mustDeductPAYE ? 'Required Monthly' : 'Not Required'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Cards */}
              <div className="p-4 rounded-xl border border-primary-100 bg-primary-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Official Obligation Report (PDF)</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Comprehensive legal assessment ready for your records, bank, or tax consultant.
                    </div>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadPdf}
                  isLoading={downloadingPdf}
                  className="whitespace-nowrap w-full sm:w-auto"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Download PDF
                </Button>
              </div>

              {computedResult.reviewReasons.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    Review Findings:
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
                    {computedResult.reviewReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Statutory Indemnity & Non-Affiliation Disclaimer (Layer 4) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-slate-700" />
                  Statutory Disclaimer & Non-Affiliation Notice
                </div>
                <p className="leading-relaxed text-[11px] text-slate-600">
                  PayMyTax by WallX is an automated financial record-keeping software tool. It is not an agent, representative, or affiliate of the Federal Inland Revenue Service (FIRS), Nigeria Revenue Service (NRS), or any State Internal Revenue Service (SIRS). All assessments and obligation reports are educational software estimates based on user-provided inputs under the Nigeria Tax Act (NTA) 2025 and do not constitute professional tax, accounting, or legal advice.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          {currentStep <= totalQuestions ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                disabled={currentStep === 1 || submitting}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                {currentStep < totalQuestions ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCurrentStep((prev) => Math.min(totalQuestions, prev + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleFinish}
                    isLoading={submitting}
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Submit & Evaluate
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <Button variant="primary" size="md" onClick={handleCompleteAndClose}>
                Done & View Dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
