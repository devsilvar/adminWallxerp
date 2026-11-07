import React from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';
import type { RegulatoryMeta } from '@/types';

export interface ComplianceTierCardProps {
  businessName: string;
  bvnVerifiedAt?: string | null;
  regulatory?: RegulatoryMeta | null;
}

export const ComplianceTierCard: React.FC<ComplianceTierCardProps> = ({
  businessName,
  bvnVerifiedAt,
  regulatory,
}) => {
  return (
    <div
      data-testid='compliance-tier-card'
      className='rounded-xl border border-gray-200/80 bg-white shadow-xs p-5 sm:p-6'
    >
      <div className='flex items-center justify-between mb-3'>
        <h3 className='text-sm font-bold text-gray-900'>
          Compliance &amp; Custody
        </h3>
        <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase tracking-wide'>
          CBN Compliant
        </span>
      </div>
      <div className='space-y-2.5 text-xs'>
        <div className='flex items-center justify-between py-1.5 border-b border-gray-100'>
          <span className='text-gray-500'>Business</span>
          <span className='font-semibold text-gray-900 truncate max-w-[150px]'>
            {businessName}
          </span>
        </div>
        <div className='flex items-center justify-between py-1.5 border-b border-gray-100'>
          <span className='text-gray-500'>Identity (BVN)</span>
          <span className='inline-flex items-center gap-1 font-semibold text-emerald-700'>
            <ShieldCheck className='h-3.5 w-3.5 text-emerald-600' />
            {bvnVerifiedAt ? 'Verified Tier 2' : 'Pending'}
          </span>
        </div>
        <div className='flex items-center justify-between py-1.5 border-b border-gray-100'>
          <span className='text-gray-500'>Tax Status</span>
          <span className='font-semibold text-gray-800'>NRS Compliant</span>
        </div>
        <div className='flex items-center justify-between py-1.5 border-b border-gray-100'>
          <span className='text-gray-500'>Operating Model</span>
          <span className='font-semibold text-emerald-700'>
            PSP-Backed Software Provider
          </span>
        </div>
        <div className='flex items-center justify-between py-1.5'>
          <span className='text-gray-500'>Licensed Partner PSP</span>
          <span className='font-semibold text-gray-800 truncate max-w-[170px]'>
            {regulatory?.partnerPSP || 'Paystack (CBN-PSSP)'}
          </span>
        </div>
      </div>

      <div className='mt-4 pt-3 border-t border-gray-100 bg-gray-50/70 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-3.5 rounded-b-xl'>
        <div className='flex items-start gap-2'>
          <Building2 className='h-4 w-4 text-gray-400 mt-0.5 shrink-0' />
          <p className='text-[11px] text-gray-500 leading-relaxed'>
            {regulatory?.custodyNotice ||
              "WallXERP by WallX is a financial technology software platform, not a bank or deposit-taking institution. Dedicated Virtual Accounts and payouts are provided by Paystack Payments Limited, a CBN-licensed Payment Solution Service Provider. Payments received into a merchant's virtual account are held by WallX in its Paystack account and are paid out to the merchant's own bank account on request, or automatically on the next business day."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ComplianceTierCard;
