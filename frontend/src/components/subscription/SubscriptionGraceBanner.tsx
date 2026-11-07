/**
 * SubscriptionGraceBanner — WallXERP
 *
 * Renders an alert banner during the 2-day read-only grace period and post-trial
 * read-only lockout, informing users that their records and withdrawals are safe
 * while reminding them to upgrade without blocking dashboard access.
 *
 * @author WallX Engineering Team
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export default function SubscriptionGraceBanner() {
  const { isReadOnlyGrace, isExpired, canWrite, graceHoursRemaining, isInherited, ownerName } = useSubscriptionStatus();
  const [dismissed, setDismissed] = useState(false);

  const shouldShow = !canWrite && !!isExpired; // covers grace AND expired
  if (!shouldShow || dismissed) {
    return null;
  }

  const isGrace = isReadOnlyGrace;
  const ownerLabel = ownerName || 'your account owner';
  const message = isInherited ? (
    isGrace ? (
      <>
        <strong>Read-Only Grace Period:</strong> Your organization has{' '}
        <span className="font-semibold underline">
          {graceHoursRemaining > 0 ? `${graceHoursRemaining} hours left` : 'ending soon'}
        </span>{' '}
        in grace. Please contact {ownerLabel} to renew the subscription so you can create records.
      </>
    ) : (
      <>
        <strong>Organization subscription expired:</strong> Please contact {ownerLabel} to renew. Your data is safe and withdrawals remain available.
      </>
    )
  ) : isGrace ? (
    <>
      <strong>Read-Only Grace Period:</strong> You have{' '}
      <span className="font-semibold underline">
        {graceHoursRemaining > 0 ? `${graceHoursRemaining} hours left` : 'ending soon'}
      </span>{' '}
      to upgrade. Existing records and tax filings are safe, but new sales and invoices cannot be added.
    </>
  ) : (
    <>
      <strong>Your trial has ended.</strong> Upgrade to re-enable actions. Your data is safe and withdrawals remain available.
    </>
  );

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 sm:px-6">
      <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{message}</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/subscription"
            className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:text-purple-900 bg-white/80 hover:bg-white px-2.5 py-1 rounded-md border border-purple-200 transition-colors shadow-xs"
          >
            {isInherited ? 'View Status' : 'Upgrade Now'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="text-amber-700 hover:text-amber-900 p-0.5 rounded transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
