import { useState } from 'react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import {
  ShieldCheck,
  Scale,
  AlertTriangle,
  Building2,
  FileCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TermsAndIndemnityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export default function TermsAndIndemnityModal({
  isOpen,
  onClose,
  onAccept,
}: TermsAndIndemnityModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'full'>('summary');
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const toggleSection = (index: number) => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  const handleAccept = () => {
    if (onAccept) {
      onAccept();
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Terms of Service & Tax Indemnity Agreement"
      subtitle="WallX Technology Services Limited — Regulatory & Compliance Framework"
      size="lg"
      icon={<ShieldCheck className="h-5 w-5 text-purple-600" />}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 w-full">
          <p className="text-[11px] text-gray-500">
            Version 2026.1-cbn-firs • Governed by the Laws of the Federal Republic of Nigeria
          </p>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="px-4 text-xs font-semibold"
            >
              Close
            </Button>
            {onAccept && (
              <Button
                type="button"
                size="sm"
                onClick={handleAccept}
                className="px-5 text-xs font-bold rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
              >
                I Understand &amp; Accept
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-gray-700 max-h-[62vh] overflow-y-auto pr-1">
        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'summary'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Executive Plain-English Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('full')}
            className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'full'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Full Legal &amp; Indemnity Agreement
          </button>
        </div>

        {activeTab === 'summary' ? (
          <div className="space-y-4">
            {/* Plain English Banner */}
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-purple-900 font-bold text-xs uppercase tracking-wider">
                <Scale className="h-4 w-4 text-purple-700" />
                <span>Summary of Key Legal Protections for Nigerian Business Owners</span>
              </div>
              <p className="text-xs text-purple-950 leading-relaxed">
                Before signing up, please review how WallX operates. WallX provides computational accounting
                software. By creating an account, you affirm that you understand your legal duties under Nigerian tax
                and financial regulations.
              </p>
            </div>

            {/* Quick Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="border border-gray-200 rounded-xl p-3.5 bg-white shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Software Provider, Not Tax Advisors</span>
                </div>
                <p className="text-[11.5px] text-gray-600 leading-normal">
                  WallX is a technological tool for automated bookkeeping, invoicing, and tax estimations. We are
                  not licensed tax consultants, certified auditors, or legal representatives of FIRS or any State IRS.
                </p>
              </div>

              <div className="border border-gray-200 rounded-xl p-3.5 bg-white shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Sole Responsibility for Data &amp; Filings</span>
                </div>
                <p className="text-[11.5px] text-gray-600 leading-normal">
                  You are solely and legally responsible for the truthfulness, accuracy, and completeness of all sales,
                  expenses, invoices, and tax filings made with Nigerian revenue services.
                </p>
              </div>

              <div className="border border-gray-200 rounded-xl p-3.5 bg-white shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-xs">
                  <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0" />
                  <span>Complete Tax Indemnification</span>
                </div>
                <p className="text-[11.5px] text-gray-600 leading-normal">
                  You agree to fully indemnify and hold harmless WallX, its directors, and staff against any FIRS or
                  State IRS penalties, interest, audit back-duties, or liabilities arising from your entries or filings.
                </p>
              </div>

              <div className="border border-gray-200 rounded-xl p-3.5 bg-white shadow-2xs space-y-1.5">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-xs">
                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>Non-Custodial Financial Rails (CBN)</span>
                </div>
                <p className="text-[11.5px] text-gray-600 leading-normal">
                  WallX is not a bank and does not hold user deposits. Payment collections and virtual accounts are
                  managed directly by CBN-licensed financial partners (Paystack and commercial settlement banks).
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs text-gray-600 space-y-1">
              <span className="font-bold text-gray-800">Want the comprehensive statutory text?</span>
              <p className="text-[11.5px]">
                Switch to the <strong>Full Legal &amp; Indemnity Agreement</strong> tab above to read the complete
                clauses covering CITA, VATA, PITA, FIRSEA, and the Laws of the Federal Republic of Nigeria.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs leading-relaxed text-gray-700">
            {/* Header intro */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-[11.5px] text-gray-600">
              <p>
                <strong>Effective Date:</strong> January 1, 2026 • <strong>Entity:</strong> WallX Technology Services
                Limited (RC: Federal Republic of Nigeria) • <strong>Applicable Law:</strong> Laws of the Federal
                Republic of Nigeria.
              </p>
            </div>

            {/* Accordion / Detailed Sections */}
            <div className="space-y-3">
              {/* Section 1 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(1)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-purple-600" />
                    1. Nature of Service &amp; Non-Advisory Disclaimer
                  </span>
                  {expandedSection === 1 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 1 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      WallX Technology Services Limited (&quot;WallX&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a proprietary
                      cloud-based enterprise resource planning (ERP), electronic bookkeeping, invoicing, and statutory
                      tax-computation assistance platform.
                    </p>
                    <p>
                      <strong>No Professional Tax Advice:</strong> WallX is a technology company and software provider.
                      WallX is <strong>NOT</strong> an authorized tax consultancy, chartered accounting firm (ICAN/ANAN),
                      licensed legal practitioner, or designated tax advisory body under the Chartered Institute of
                      Taxation of Nigeria (CITN) Act. Calculations, statutory tax estimations (including VAT, CIT, WHT,
                      and Personal Income Tax deductions), turnover thresholds, and statutory return previews generated
                      by the software are automated mathematical estimates based strictly on user inputs and current
                      enactments of Nigerian tax legislation.
                    </p>
                    <p>
                      Users are strongly advised to seek independent advice from licensed Nigerian tax practitioners or
                      verify details directly with the Federal Inland Revenue Service (FIRS) and respective State
                      Internal Revenue Services (e.g., LIRS).
                    </p>
                  </div>
                )}
              </div>

              {/* Section 2 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(2)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-purple-600" />
                    2. Comprehensive Tax Indemnification &amp; Hold Harmless (Crucial)
                  </span>
                  {expandedSection === 2 || expandedSection === null ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {(expandedSection === 2 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p className="font-semibold text-gray-900 uppercase text-[11px] tracking-wide">
                      The User Expressly Agrees to Indemnify WallX:
                    </p>
                    <p>
                      To the fullest extent permitted under Nigerian law, you (&quot;User&quot;, &quot;Taxpayer&quot;, or &quot;Merchant&quot;)
                      irrevocably agree to defend, indemnify, and hold harmless WallX, its parent entity, affiliates,
                      directors, founders, officers, employees, agents, and technical infrastructure partners from and
                      against any and all:
                    </p>
                    <ul className="list-disc list-inside space-y-1.5 pl-2 text-[11.5px]">
                      <li>
                        <strong>Statutory Fines &amp; Penalties:</strong> Any late filing penalties, default interest,
                        best-of-judgment assessments, or statutory surcharges levied by the FIRS under the Federal
                        Inland Revenue Service (Establishment) Act 2007, Companies Income Tax Act (CITA), Personal
                        Income Tax Act (PITA), Value Added Tax Act (VATA), or any State Internal Revenue Service.
                      </li>
                      <li>
                        <strong>Audit Assessments &amp; Back-Duties:</strong> Any liabilities, tax shortfalls, or reassessments
                        arising from tax audits or investigations conducted by revenue authorities on your business.
                      </li>
                      <li>
                        <strong>Data Inaccuracies:</strong> Any damages or regulatory sanctions resulting from incorrect,
                        fraudulent, manipulated, or incomplete financial data, sales receipts, or expense records entered
                        into the software by you or your authorized representatives.
                      </li>
                      <li>
                        <strong>Legal &amp; Defense Expenses:</strong> Reasonable legal fees, solicitor charges, and costs
                        incurred by WallX in responding to statutory inquiries, subpoenas, or litigation concerning your
                        tax status or business transactions.
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Section 3 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(3)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-purple-600" />
                    3. Statutory Tax Filing &amp; Record-Keeping Obligations
                  </span>
                  {expandedSection === 3 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 3 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      <strong>Statutory Taxpayer Status:</strong> The statutory duty to file accurate returns, deduct
                      applicable Withholding Tax (WHT), charge and remit Value Added Tax (VAT), and settle Company
                      Income Tax (CIT) rests solely on the taxpayer under Nigerian law. WallX does not file tax returns
                      on your behalf unless explicitly engaged via an authorized separate service contract.
                    </p>
                    <p>
                      <strong>Mandatory 6-Year Record Retention:</strong> In compliance with Section 63 of the
                      Companies Income Tax Act and Section 58 of the Personal Income Tax Act, you acknowledge that you are
                      obligated to maintain primary records, invoices, bank statements, and tax receipts for a minimum of
                      six (6) consecutive years. WallX is a digital processing ledger and cannot substitute for your
                      obligation to retain primary statutory business records.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 4 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(4)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-purple-600" />
                    4. Non-Custodial Fintech Role (Central Bank of Nigeria Compliance)
                  </span>
                  {expandedSection === 4 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 4 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      In compliance with the Central Bank of Nigeria (CBN) regulatory framework on Non-Bank Financial
                      Technology Platforms:
                    </p>
                    <p>
                      WallX is <strong>NOT</strong> a deposit-taking commercial bank or non-bank financial institution.
                      All electronic wallet balances, Dedicated Virtual Accounts (DVA), payment collections, and
                      automated settlement transfers are hosted and routed through licensed Payment Solution Service
                      Providers (PSSP — Paystack Payments Limited) and CBN-regulated commercial banking institutions
                      (including Titan Trust Bank Limited and Wema Bank Plc).
                    </p>
                    <p>
                      WallX holds zero customer deposits and operates exclusively as an electronic ledger and management
                      software service.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 5 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(5)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-purple-600" />
                    5. Marketplace &amp; Commercial Transaction Disclaimers
                  </span>
                  {expandedSection === 5 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 5 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      WallX Marketplace is an open directory designed to facilitate verified direct contact between
                      Nigerian buyers and registered SME merchants.
                    </p>
                    <p>
                      WallX does not inspect merchant merchandise, process merchant payments as an escrow party, or
                      guarantee the merchantability, fitness, authenticity, or delivery of products listed. All
                      commercial arrangements, product warranties, and return agreements are strictly bilateral contracts
                      between the buyer and the seller.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 6 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(6)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-purple-600" />
                    6. Limitation of Liability &amp; Maximum Cap
                  </span>
                  {expandedSection === 6 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 6 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      Under no circumstances shall WallX, its directors, or affiliates be liable for any indirect,
                      incidental, punitive, special, or consequential damages (including loss of profits, tax penalties,
                      goodwill, or business interruption) arising out of the use or inability to use the platform.
                    </p>
                    <p>
                      To the maximum extent permissible under the Federal Competition and Consumer Protection Act 2018
                      (FCCPA), WallX&apos;s aggregate liability for any direct claim arising from contract, tort, or statutory
                      duty shall be strictly limited to the amount actually paid by the user to WallX in platform
                      subscription fees during the one (1) month preceding the event giving rise to the claim.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 7 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(7)}
                  className="w-full px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-left font-bold text-gray-900 text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-purple-600" />
                    7. Governing Law &amp; Dispute Resolution
                  </span>
                  {expandedSection === 7 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {(expandedSection === 7 || expandedSection === null) && (
                  <div className="p-4 space-y-2 border-t border-gray-100 text-[12px] text-gray-600">
                    <p>
                      These terms shall be governed by, construed, and enforced in accordance with the substantive laws
                      of the Federal Republic of Nigeria.
                    </p>
                    <p>
                      Any dispute arising out of or related to this Agreement shall first be submitted to good-faith
                      amicable resolution between the parties within twenty-one (21) days. If unresolved, the dispute
                      shall be submitted to the exclusive jurisdiction of the state or federal courts situated in Lagos
                      State, Nigeria.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
