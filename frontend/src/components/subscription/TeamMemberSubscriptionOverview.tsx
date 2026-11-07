/**
 * TeamMemberSubscriptionOverview — WallXERP
 *
 * Dedicated read-only view for team members (managers, cashiers, accountants, viewers)
 * operating under an organization subscription managed by the business owner.
 *
 * @author WallX Engineering Team
 */

import { Crown, ShieldCheck, CheckCircle2, Info, Building2, UserCheck, Calendar } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useBusinessStore } from '@/stores/business.store';

const TIER_FEATURES: Record<string, string[]> = {
  starter: [
    'Sales & Expense Management',
    'Dedicated Virtual Bank Account (DVA)',
    'Up to 3 Team Members',
    'Manage up to 2 businesses / branches',
    'Custom Invoices & Auto Collection',
    '30 AI CFO queries / month',
    'Payment & Debtors Management',
    'FIRS / NRS Tax Calculation & Filing',
  ],
  business: [
    'Up to 10 Team Members',
    'Customer Credit Management (BNPL)',
    'Manage up to 5 businesses / branches',
    '100 AI CFO queries / month',
    'Dedicated Virtual Account (DVA) auto-capture',
    'Advanced Debtors Reminders & Triggers',
    'Business Intelligence & Profit/Loss Analytics',
    'FIRS / NRS Tax Calculation & Filing',
  ],
  scale: [
    'Unlimited Team Members',
    'Unlimited Businesses / Branches',
    'Unlimited AI CFO queries / month',
    'Customer Credit Management (BNPL)',
    'High-Volume Bulk Sales & Expense Import',
    'Complete Multi-Branch Audit Logs',
    'FIRS / NRS Tax Calculation & Period Closures',
    'Priority Enterprise Operational Support',
  ],
  free: [
    'Exploratory 30-Day Free Trial',
    'Sales & Expense Management',
    'Team Collaboration & Permissions',
    'Dedicated Virtual Account (DVA)',
    'AI CFO Financial Queries',
    'Invoicing & Receipt Generation',
    'FIRS / NRS Tax Computations',
  ],
};

export default function TeamMemberSubscriptionOverview() {
  const sub = useSubscriptionStatus();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const ownerDisplayName = sub.ownerName || 'Account Owner';
  const tierKey = (sub.tier || 'free').toLowerCase();
  const features = TIER_FEATURES[tierKey] || TIER_FEATURES.free;

  const isActive = sub.hasAccess && !sub.isReadOnlyGrace;
  const isGrace = sub.isReadOnlyGrace;

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* ── 1. Header with organization badge ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl border border-primary-200/60 bg-gradient-to-r from-primary-50/70 via-purple-50/40 to-white shadow-2xs">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 border border-primary-200/50 mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary-600" />
              <span>Team Member Access</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Organization Subscription
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Your account access is fully covered by{' '}
              <span className="font-semibold text-gray-900">{ownerDisplayName}</span>
              {activeBusiness ? ` for ${activeBusiness.businessName}` : ''}.
            </p>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-200/70">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">Coverage Status</span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isActive
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : isGrace
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-rose-100 text-rose-800 border border-rose-200'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? 'bg-emerald-500' : isGrace ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
            {isActive ? 'Active Coverage' : isGrace ? 'Read-Only Grace Period' : 'Subscription Expired'}
          </span>
        </div>
      </div>

      {/* ── 2. Current Plan Details Card ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Current Plan Tier</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-0.5">{sub.planName}</h2>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Plan Duration</p>
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mt-0.5">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{sub.formattedCountdown}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Included Organization Capabilities:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 3. Billing Management Notice ── */}
        <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white p-6 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs">
              <Info className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Billing Notice</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Subscription renewals, tier changes, and official invoice receipts are managed exclusively by your business owner (<span className="font-medium text-gray-800">{ownerDisplayName}</span>).
            </p>
          </div>

          <div className="pt-4 border-t border-blue-100/80 space-y-2 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-gray-400 shrink-0" />
              <span>Owner: {ownerDisplayName} {sub.ownerEmail ? `(${sub.ownerEmail})` : ''}</span>
            </div>
            {activeBusiness && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                <span>Assigned Branch: {activeBusiness.businessName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
