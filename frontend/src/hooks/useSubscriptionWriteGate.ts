import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import toast from 'react-hot-toast';

export function useSubscriptionWriteGate() {
  const sub = useSubscriptionStatus();
  const writesBlocked = !sub.canWrite && !!sub.expiresAt;

  const blockIfNeeded = (opts?: { message?: string }): boolean => {
    if (writesBlocked) {
      toast.error(opts?.message ?? 'Your trial has ended — upgrade to continue.');
      return true; // caller should return early
    }
    return false;
  };

  return {
    writesBlocked,
    blockIfNeeded,
    reason: sub.isReadOnlyGrace ? 'TRIAL_IN_GRACE_PERIOD' : 'TRIAL_EXPIRED',
    expiresAt: sub.expiresAt,
    isReadOnlyGrace: sub.isReadOnlyGrace,
    isExpired: sub.isExpired,
  };
}
