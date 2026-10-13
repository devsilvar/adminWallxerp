import { useState, useEffect } from 'react';
import { Sparkles, Calendar, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import api, { getErrorMessage } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';
import type { AdminUser } from '@/types/index';

interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onSuccess: (updatedUser: Partial<AdminUser> & { id: string }) => void;
}

interface DowngradePreviewData {
  targetTier: string;
  targetPlan: string;
  limits: { maxBusinesses: number; maxTeamMembers: number; maxMonthlyAiQueries: number };
  current: { businessCount: number; teamCurrent: number; businessIds: string[] };
  overLimit: {
    businesses: { current: number; max: number; excess: number } | null;
    teams: { businessIds: string[]; current: number; max: number } | null;
  } | null;
  isOverLimit: boolean;
}

const TIERS = [
  { id: 'starter', name: 'Starter', price: '₦5,000/mo', desc: '2 Businesses, 3 Team Members, 30 AI Queries' },
  { id: 'business', name: 'Business', price: '₦12,000/qtr', desc: '5 Businesses, 10 Team Members, BNPL Credits' },
  { id: 'scale', name: 'Scale-Up', price: '₦45,000/yr', desc: 'Unlimited Businesses & Members, VIP Support' },
  { id: 'free', name: 'Free Trial', price: '₦0', desc: '30-Day Free Trial Evaluation' },
] as const;

type PresetDuration = '30' | '90' | '365' | 'lifetime' | 'reset_trial' | 'custom';

const TIER_DURATION: Record<string, PresetDuration> = {
  free: 'reset_trial',
  starter: '30',
  business: '90',
  scale: '365',
};

const TIER_ALIASES: Record<string, string> = {
  scale_up: 'scale',
  scaleup: 'scale',
  free_trial: 'free',
  trial: 'free',
};

function canonicalTier(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  return TIER_ALIASES[normalized] ?? normalized;
}

export default function ChangePlanModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: ChangePlanModalProps) {
  const [selectedTier, setSelectedTier] = useState<string>('starter');
  const [durationPreset, setDurationPreset] = useState<PresetDuration>('30');
  const [customDate, setCustomDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [preview, setPreview] = useState<DowngradePreviewData | null>(null);
  const [confirmChecked, setConfirmChecked] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      const normalized = canonicalTier(user.subscriptionTier || 'starter');
      setSelectedTier(normalized);
      setDurationPreset('30');
      setCustomDate('');
      setReason('');
      setPreview(null);
      setConfirmChecked(false);
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (!user || !isOpen) {
      setPreview(null);
      setConfirmChecked(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/admin/users/${user.id}/downgrade-preview`, {
          params: { tier: selectedTier },
        });
        if (res.data?.success && res.data?.data) {
          setPreview(res.data.data);
          setConfirmChecked(false);
        }
      } catch {
        setPreview(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedTier, user, isOpen]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('Please provide a mandatory audit reason (minimum 3 characters)');
      return;
    }

    setIsSubmitting(true);
    try {
      let durationDays: number | null | undefined = undefined;
      let resetTrial = false;
      let customExpiresAt: string | undefined = undefined;

      if (durationPreset === 'lifetime') {
        durationDays = null;
      } else if (durationPreset === 'reset_trial') {
        resetTrial = true;
      } else if (durationPreset === 'custom') {
        if (!customDate) {
          toast.error('Please select a valid custom expiration date');
          setIsSubmitting(false);
          return;
        }
        customExpiresAt = new Date(customDate).toISOString();
      } else {
        durationDays = parseInt(durationPreset, 10);
      }

      const payload = {
        tier: selectedTier,
        durationDays,
        resetTrial,
        customExpiresAt,
        confirmDowngrade: confirmChecked,
        reason: reason.trim(),
      };

      const res = await api.patch(`/admin/users/${user.id}/subscription`, payload);

      toast.success(res.data?.message || `Subscription updated to ${selectedTier.replace('_', ' ').toUpperCase()}`);
      onSuccess({
        id: user.id,
        subscriptionTier: res.data?.data?.subscriptionTier || selectedTier,
        subscriptionExpiresAt: res.data?.data?.subscriptionExpiresAt || null,
        trialEndsAt: res.data?.data?.trialEndsAt || null,
      });
      onClose();
      if (user.id === useAuthStore.getState().user?.id) {
        void useAuthStore.getState().fetchMe();
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to update user subscription'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Manage User Subscription'
      subtitle={`Assign or adjust subscription plan for ${user.email}`}
      icon={<Sparkles className='h-4 w-4 text-primary-600' />}
      size='md'
      footer={
        <div className='flex items-center justify-end gap-2 w-full'>
          <button
            type='button'
            onClick={onClose}
            disabled={isSubmitting}
            className='rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-panel-subtle hover:text-ink transition-colors'
          >
            Cancel
          </button>
          <button
            type='submit'
            form='change-plan-form'
            disabled={isSubmitting || (!!preview?.isOverLimit && !confirmChecked)}
            className='inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 transition-colors'
          >
            {isSubmitting ? 'Updating Plan…' : 'Save Plan Changes'}
          </button>
        </div>
      }
    >
      <form id='change-plan-form' onSubmit={handleSubmit} className='space-y-4 text-xs'>
        {/* Current Plan Notice */}
        <div className='rounded-lg border border-hairline bg-panel-subtle p-3 flex items-center justify-between'>
          <div>
            <span className='text-ink-subtle text-[11px] block'>Current Plan</span>
            <span className='font-semibold text-ink capitalize'>
              {user.subscriptionTier ? user.subscriptionTier.replace('_', ' ') : 'Free Trial'}
            </span>
          </div>
          {user.subscriptionExpiresAt && (
            <div className='text-right'>
              <span className='text-ink-subtle text-[11px] block'>Expires On</span>
              <span className='font-mono text-ink text-[11px]'>
                {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Tier Selector */}
        <div>
          <label className='block font-semibold text-ink mb-1.5'>Select Target Tier</label>
          <div className='grid grid-cols-2 gap-2'>
            {TIERS.map((tier) => {
              const isSelected = selectedTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type='button'
                  onClick={() => {
                    setSelectedTier(tier.id);
                    const autoDuration = TIER_DURATION[tier.id];
                    if (autoDuration && autoDuration !== durationPreset) {
                      setDurationPreset(autoDuration);
                    }
                  }}
                  className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-primary-600 bg-primary-50/50 dark:bg-primary-950/20 ring-1 ring-primary-500'
                      : 'border-hairline hover:bg-panel-subtle'
                  }`}
                >
                  <div className='flex items-center justify-between w-full'>
                    <span className='font-semibold text-ink'>{tier.name}</span>
                    <span className='text-[10px] text-ink-muted'>{tier.price}</span>
                  </div>
                  <span className='text-[10px] text-ink-subtle mt-1 leading-tight'>{tier.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Duration Presets */}
        <div>
          <label className='block font-semibold text-ink mb-1.5 flex items-center gap-1.5'>
            <Clock className='h-3.5 w-3.5 text-ink-muted' />
            Duration & Expiry
          </label>
          <div className='flex flex-wrap gap-1.5'>
            <button
              type='button'
              onClick={() => setDurationPreset('30')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === '30'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              30 Days (1 Mo)
            </button>
            <button
              type='button'
              onClick={() => setDurationPreset('90')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === '90'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              90 Days (Quarter)
            </button>
            <button
              type='button'
              onClick={() => setDurationPreset('365')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === '365'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              1 Year (Annual)
            </button>
            <button
              type='button'
              onClick={() => setDurationPreset('lifetime')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === 'lifetime'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              Lifetime (No Expiry)
            </button>
            <button
              type='button'
              onClick={() => setDurationPreset('reset_trial')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === 'reset_trial'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              Reset 30-Day Trial
            </button>
            <button
              type='button'
              onClick={() => setDurationPreset('custom')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                durationPreset === 'custom'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-hairline text-ink hover:bg-panel-subtle'
              }`}
            >
              Custom Date
            </button>
          </div>

          {durationPreset === 'custom' && (
            <div className='mt-2'>
              <div className='relative'>
                <input
                  type='date'
                  value={customDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className='w-full rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs text-ink focus:border-primary-500 focus:outline-none'
                />
                <Calendar className='pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-ink-muted' />
              </div>
            </div>
          )}
        </div>

        {/* Over-Limit Downgrade Warning & Confirmation */}
        {preview?.isOverLimit && (
          <div className='rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2 text-amber-900 dark:text-amber-200'>
            <div className='flex items-start gap-2'>
              <AlertCircle className='h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400' />
              <div>
                <span className='font-semibold block'>
                  Downgrade Warning: Account Exceeds Plan Limits
                </span>
                <p className='text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 space-y-0.5'>
                  {preview.overLimit?.businesses && (
                    <span className='block'>
                      • Businesses: {preview.overLimit.businesses.current} / {preview.overLimit.businesses.max} ({preview.overLimit.businesses.excess} over limit)
                    </span>
                  )}
                  {preview.overLimit?.teams && (
                    <span className='block'>
                      • Team Members on {preview.overLimit.teams.businessIds.length || 'several'} business(es) over cap of {preview.overLimit.teams.max}.
                    </span>
                  )}
                  <span className='block text-ink-muted text-[10px] mt-1'>
                    Existing data stays visible; new businesses and team invites will be blocked until under limit.
                  </span>
                </p>
              </div>
            </div>
            <label className='flex items-center gap-2 pt-1.5 border-t border-amber-200 dark:border-amber-800/50 cursor-pointer select-none font-medium text-[11px] text-amber-950 dark:text-amber-100'>
              <input
                type='checkbox'
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className='h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500'
              />
              <span>I confirm downgrading this account over plan limits</span>
            </label>
          </div>
        )}

        {/* Audit Reason */}
        <div>
          <label className='block font-semibold text-ink mb-1 flex items-center justify-between'>
            <span>Audit Reason & Notes</span>
            <span className='text-[10px] text-danger-600 font-normal'>* Mandatory for audit trail</span>
          </label>
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. Paid via GTBank direct transfer (Ref #4928), VIP partner waiver, or resolution for ticket #104'
            className='w-full rounded-lg border border-hairline bg-panel p-2 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none resize-none'
          />
        </div>

        {/* Operational Note */}
        <div className='flex items-start gap-2 rounded-md bg-info-50/50 dark:bg-info-950/20 p-2 border border-info-200 text-[11px] text-info-800 dark:text-info-200'>
          <AlertCircle className='h-3.5 w-3.5 shrink-0 mt-0.5' />
          <span>
            Upgrading plan immediately unlocks business and team quotas, feature gates, and AI query allowances for this user.
          </span>
        </div>
      </form>
    </Modal>
  );
}
