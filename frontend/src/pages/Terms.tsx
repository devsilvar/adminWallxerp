import { Link } from 'react-router-dom';
import { ShieldCheck, Scale, AlertTriangle, Building2, FileCheck2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                W
              </div>
              <span className="text-xl font-extrabold text-gray-900 tracking-tight">WallX</span>
            </Link>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              Legal &amp; Compliance
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/register">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold rounded-full">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Signup
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero Header */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-purple-700 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="h-5 w-5" />
            <span>Official Legal Framework</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Terms of Service, Tax Compliance &amp; Corporate Indemnity Agreement
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
            Governed under the Laws of the Federal Republic of Nigeria. This agreement sets forth the binding legal terms,
            taxpayer statutory liabilities, and complete corporate indemnification for WallX Technology Services Limited.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500 border-t border-gray-100">
            <span><strong>Version:</strong> 2026.1-cbn-firs</span>
            <span>•</span>
            <span><strong>Last Updated:</strong> January 1, 2026</span>
            <span>•</span>
            <span><strong>Jurisdiction:</strong> Lagos State, Nigeria</span>
          </div>
        </div>

        {/* Plain-English Executive Summary */}
        <div className="bg-purple-50/70 border border-purple-200/90 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
            <Scale className="h-4.5 w-4.5 text-purple-700" />
            <span>Summary of Key Principles for Nigerian Business Owners</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/90 border border-purple-100 rounded-xl p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Software Provider, Not Tax Advisors</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                WallX is an automated software tool. We do not provide licensed tax advice or formal audits. All tax
                estimates must be reviewed by the taxpayer or independent CITN/ICAN consultants.
              </p>
            </div>

            <div className="bg-white/90 border border-purple-100 rounded-xl p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Exclusive Taxpayer Filing Duty</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Under CITA, VATA, and PITA, the business owner retains the sole statutory obligation to accurately file
                returns and remit statutory taxes to FIRS and State Revenue Services.
              </p>
            </div>

            <div className="bg-white/90 border border-purple-100 rounded-xl p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0" />
                <span>Complete Company Indemnity</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                You agree to fully defend, indemnify, and hold harmless WallX from any tax fines, interest, audit back-duties,
                or liabilities arising from your numbers, filings, or late remittances.
              </p>
            </div>

            <div className="bg-white/90 border border-purple-100 rounded-xl p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                <span>CBN Non-Custodial Compliance</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                WallX does not hold customer deposits. Virtual accounts and settlement payouts are managed by licensed
                partners (Paystack and commercial settlement banks).
              </p>
            </div>
          </div>
        </div>

        {/* Full Agreement Body */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-10 shadow-xs space-y-8 text-gray-700 text-sm leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <FileCheck2 className="h-4.5 w-4.5 text-purple-600" />
              1. Nature of the Service &amp; Non-Advisory Disclaimer
            </h2>
            <p>
              WallX Technology Services Limited (&quot;WallX&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a cloud-based software-as-a-service
              platform for electronic bookkeeping, customer invoicing, sales recording, financial record-keeping, and
              computational assistance under Nigerian revenue regulations.
            </p>
            <p>
              <strong>Disclaimer of Professional Status:</strong> WallX is a technology software platform and is{' '}
              <strong>NOT</strong> a chartered accounting firm, certified tax auditor, legal advisory practice, or licensed
              tax consultant under the Chartered Institute of Taxation of Nigeria (CITN) Act or the Institute of Chartered
              Accountants of Nigeria (ICAN) Act.
            </p>
            <p>
              The platform calculates automated estimates based strictly on the figures, descriptions, and categories input
              by the user. WallX does not independently audit, verify, or certify user entries. Calculations of Value Added
              Tax (VAT), Withholding Tax (WHT), Company Income Tax (CIT), or Nil-return indications do not constitute
              statutory legal opinions or formal clearances from the Federal Inland Revenue Service (FIRS) or any State
              Internal Revenue Service (SIRS/LIRS).
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <ShieldCheck className="h-4.5 w-4.5 text-purple-600" />
              2. Comprehensive Tax Indemnity &amp; Hold Harmless (Corporate Protection)
            </h2>
            <p className="font-semibold text-gray-900 uppercase text-xs tracking-wider">
              Express Covenant to Indemnify:
            </p>
            <p>
              To the maximum extent permitted by applicable law in the Federal Republic of Nigeria, you (&quot;User&quot;, &quot;Taxpayer&quot;,
              or &quot;Merchant&quot;) unconditionally and irrevocably agree to defend, indemnify, and hold harmless WallX, its parent
              corporation, subsidiaries, affiliates, directors, founders, officers, employees, agents, and technical
              contractors from and against any and all claims, actions, assessments, investigations, fines, statutory
              penalties, back-duties, default interest, damages, losses, costs, or expenses (including reasonable legal and
              solicitor fees) arising directly or indirectly from:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-3 text-gray-600 text-xs sm:text-sm">
              <li>
                <strong>Statutory Revenue Fines:</strong> Any late filing penalties, statutory interest, default assessments,
                or surcharges issued by the FIRS or any State Revenue Service under the Companies Income Tax Act (CITA),
                Personal Income Tax Act (PITA), Value Added Tax Act (VATA), or the Federal Inland Revenue Service
                (Establishment) Act 2007.
              </li>
              <li>
                <strong>Audit Liabilities:</strong> Any tax audit back-duties, jeopardy assessments, or re-assessments resulting
                from governmental audits or tax examinations of your business operations.
              </li>
              <li>
                <strong>False or Erroneous Entries:</strong> Any claim or sanction arising from inaccurate, incomplete,
                fraudulent, forged, or misleading sales, expenses, deductions, or invoices uploaded to the platform by you
                or your staff.
              </li>
              <li>
                <strong>Under-remittance:</strong> Failure by the taxpayer to remit collected VAT, deducted WHT, or corporate
                income taxes to the designated government treasury accounts via the statutory Remita or FIRS TaxPro-MAX portals.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <Scale className="h-4.5 w-4.5 text-purple-600" />
              3. Statutory Tax Filing Responsibilities &amp; Mandatory 6-Year Records
            </h2>
            <p>
              Under Nigerian statutory law, the taxpayer holds the non-delegable duty to file accurate returns and pay all
              taxes due on or before statutory due dates. WallX does not serve as your statutory tax filing representative
              unless governed by a separately executed formal Power of Attorney or engagement agreement.
            </p>
            <p>
              <strong>Mandatory Record Retention:</strong> Pursuant to Section 63 of CITA and Section 58 of PITA, every
              taxpayer in Nigeria is required to keep books of account, original receipts, and supporting invoices for a
              minimum statutory period of six (6) years. The User remains solely responsible for retaining physical and
              secondary digital backups of primary documents.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <Building2 className="h-4.5 w-4.5 text-purple-600" />
              4. Non-Custodial Financial Rails (CBN Regulatory Compliance)
            </h2>
            <p>
              WallX is a software provider and is not licensed as a commercial bank, merchant bank, or microfinance bank
              by the Central Bank of Nigeria (CBN).
            </p>
            <p>
              All banking rails, Dedicated Virtual Account (DVA) numbers, payment card gateways, and settlement payouts
              are operated and managed by CBN-licensed financial institutions, including Paystack Payments Limited (licensed
              PSSP) and commercial settlement partner banks (including Titan Trust Bank Limited and Wema Bank Plc). WallX
              holds zero customer deposits and acts strictly as a non-custodial electronic ledger.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <Scale className="h-4.5 w-4.5 text-purple-600" />
              5. WallX Marketplace Commercial Disclaimers
            </h2>
            <p>
              WallX Marketplace operates as an open digital catalog connecting verified Nigerian businesses with buyers.
              WallX is not a merchant, auctioneer, escrow party, or retailer of goods and services listed by users. WallX
              disclaims all product warranties, fitness for particular purposes, merchantability, and delivery obligations.
              Disputes regarding quality, non-delivery, or refunds are strictly between buyer and merchant.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <AlertTriangle className="h-4.5 w-4.5 text-purple-600" />
              6. Limitation of Liability &amp; Exclusion of Consequential Damages
            </h2>
            <p>
              To the maximum extent permissible under the Federal Competition and Consumer Protection Act 2018 (FCCPA),
              WallX shall not be liable for any indirect, incidental, punitive, special, or consequential damages
              (including loss of revenue, business interruption, or tax audit assessments) arising from platform use.
            </p>
            <p>
              WallX&apos;s total aggregate liability under this agreement for any direct claim shall be strictly capped at the
              subscription fee actually paid by the user to WallX in the thirty (30) days preceding the event giving rise to
              the claim.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
              <Scale className="h-4.5 w-4.5 text-purple-600" />
              7. Governing Law &amp; Exclusive Jurisdiction
            </h2>
            <p>
              This Agreement shall be governed by and construed in accordance with the substantive laws of the Federal
              Republic of Nigeria.
            </p>
            <p>
              The parties submit to the exclusive jurisdiction of the state or federal courts situated in Lagos State,
              Nigeria, for the resolution of any dispute that cannot be resolved amicably within twenty-one (21) days.
            </p>
          </section>
        </div>

        {/* Bottom CTA */}
        <div className="flex items-center justify-between border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-500">
            © 2026 WallX Technology Services Limited. All rights reserved.
          </p>
          <Link to="/register">
            <Button className="rounded-full px-6 text-xs font-bold">
              Return to Registration
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
