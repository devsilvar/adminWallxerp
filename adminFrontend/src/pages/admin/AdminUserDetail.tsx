import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  FileText,
  Hash,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  UserX,
  Wallet,
  Zap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import Button from '@/components/ui/Button.tsx';
import ChangePlanModal from '@/components/admin/ChangePlanModal';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { AdminUserDetail as AdminUserDetailType } from '@/types/index.ts';
import { Panel, PanelEmpty, PanelHeader } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatDate, formatNaira, formatStamp } from './shared/format';

function DetailItem({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className='flex items-center justify-between py-2 border-b border-hairline last:border-b-0 text-xs'>
      <span className='text-ink-muted text-[11px]'>{label}</span>
      <div className='flex items-center gap-1.5 font-medium text-ink'>
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

const getPlanBadge = (tier?: string | null) => {
  const t = (tier || 'free').toLowerCase();
  if (t === 'scale' || t === 'scale_up') {
    return { tone: 'info' as const, label: 'Scale-Up' };
  }
  if (t === 'business') {
    return { tone: 'success' as const, label: 'Business' };
  }
  if (t === 'starter') {
    return { tone: 'info' as const, label: 'Starter' };
  }
  return { tone: 'warning' as const, label: 'Free Trial' };
};

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUserDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [togglingPayout, setTogglingPayout] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleUserAutoPayout = async () => {
    if (!user) return;
    setTogglingPayout(true);
    const newEnabled = !user.autoPayoutEnabled;
    try {
      await api.patch(`/admin/users/${user.id}/auto-payout`, { enabled: newEnabled });
      toast.success(`User payout mode set to ${newEnabled ? 'Automatic' : 'Manual'}`);
      setUser({
        ...user,
        autoPayoutEnabled: newEnabled,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to update payout mode');
    } finally {
      setTogglingPayout(false);
    }
  };

  useEffect(() => {
    api.get(`/admin/users/${userId}`)
      .then((r) => setUser(r.data.data))
      .catch((err: any) => {
        toast.error(err?.response?.data?.error?.message || 'Failed to load user profile');
      })
      .finally(() => setIsLoading(false));
  }, [userId]);

  const handleToggle = async () => {
    if (!user) return;
    setToggling(true);
    try {
      await api.patch(`/admin/users/${user.id}/status`, { isActive: !user.isActive });
      toast.success(`User account ${user.isActive ? 'deactivated' : 'activated'}`);
      setUser({ ...user, isActive: !user.isActive });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to update user status');
    } finally {
      setToggling(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!user) return;
    setVerifying(true);
    try {
      await api.patch(`/admin/users/${user.id}/email-verification`, { isVerified: !user.isVerified });
      toast.success(`Email ${user.isVerified ? 'unverified' : 'verified'} successfully`);
      setUser({ ...user, isVerified: !user.isVerified });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to update verification status');
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton width={280} height={28} rounded='lg' />
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Skeleton height={100} rounded='lg' />
          <Skeleton height={100} rounded='lg' />
          <Skeleton height={100} rounded='lg' />
          <Skeleton height={100} rounded='lg' />
        </div>
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <Skeleton height={380} rounded='lg' />
          <div className='lg:col-span-2'>
            <Skeleton width='100%' height={380} rounded='lg' />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Panel>
        <PanelEmpty icon={Shield} title='User account not found' hint='This user account does not exist or may have been removed.' />
      </Panel>
    );
  }

  const totalSalesCount = user.businesses.reduce((acc, b) => acc + (b._count?.sales ?? 0), 0);
  const totalInvoicesCount = user.businesses.reduce((acc, b) => acc + (b._count?.invoices ?? 0), 0);

  return (
    <div className='space-y-6'>
      {/* Top Breadcrumb & Header */}
      <div className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Link
            to='/admin/users'
            aria-label='Back to users directory'
            className='inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors'
          >
            <ArrowLeft className='h-3.5 w-3.5' />
            <span>Users Directory</span>
          </Link>
          <span className='text-xs text-ink-subtle'>/</span>
          <span className='text-xs font-medium text-ink-muted truncate max-w-xs'>{user.email}</span>
        </div>

        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 font-bold text-lg border border-primary-100'>
              {user.email.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h1 className='text-xl font-bold text-ink tracking-tight'>{user.email}</h1>
                <button
                  type='button'
                  onClick={() => handleCopy(user.email, 'Email')}
                  title='Copy Email'
                  className='rounded p-1 text-ink-subtle hover:text-ink hover:bg-panel-subtle transition-colors'
                >
                  {copiedKey === 'Email' ? (
                    <Check className='h-3.5 w-3.5 text-success-600' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                </button>
              </div>
              <p className='text-xs text-ink-muted mt-0.5'>
                User ID: <span className='font-mono text-ink-subtle'>{user.id}</span>
              </p>
            </div>
          </div>

          {/* Status Badges Header */}
          <div className='flex flex-wrap items-center gap-1.5'>
            <StatusPill tone={user.role === 'admin' ? 'neutral' : 'neutral'}>
              {user.role === 'admin' ? 'Platform Admin' : 'Merchant User'}
            </StatusPill>
            <StatusPill tone={user.isActive ? 'success' : 'danger'}>
              {user.isActive ? 'Active Account' : 'Inactive (Suspended)'}
            </StatusPill>
            <StatusPill tone={user.isVerified ? 'success' : 'warning'}>
              {user.isVerified ? 'Email Verified' : 'Email Unverified'}
            </StatusPill>
            <StatusPill tone={user.autoPayoutEnabled ? 'success' : 'neutral'}>
              {user.autoPayoutEnabled ? '⚡ Auto Transfers' : '🔒 Manual Review'}
            </StatusPill>
            <StatusPill tone={getPlanBadge(user.subscriptionTier).tone}>
              {getPlanBadge(user.subscriptionTier).label}
            </StatusPill>
          </div>
        </div>
      </div>

      {/* Top Action Command Bar */}
      <Panel className='p-3 bg-panel-subtle border-hairline-strong'>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
          <div className='flex items-center gap-2 text-xs text-ink-muted'>
            <Shield className='h-4 w-4 text-primary-600 shrink-0' />
            <span className='font-medium text-ink'>Account Governance & Operations:</span>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => setShowChangePlanModal(true)}
              className='shadow-sm'
            >
              <Crown className='h-3.5 w-3.5 text-amber-500' />
              <span>Change Subscription Plan</span>
            </Button>

            <Button
              size='sm'
              variant='secondary'
              onClick={handleToggleUserAutoPayout}
              isLoading={togglingPayout}
              className='shadow-sm'
            >
              <Zap className='h-3.5 w-3.5 text-primary-600' />
              <span>{user.autoPayoutEnabled ? 'Switch to Manual Payout' : 'Switch to Automatic Payout'}</span>
            </Button>

            <Button
              size='sm'
              variant={user.isVerified ? 'secondary' : 'primary'}
              onClick={handleVerifyEmail}
              isLoading={verifying}
              className='shadow-sm'
            >
              {user.isVerified ? (
                <>
                  <ShieldAlert className='h-3.5 w-3.5 text-warning-600' />
                  <span>Mark Unverified</span>
                </>
              ) : (
                <>
                  <ShieldCheck className='h-3.5 w-3.5 text-success-600' />
                  <span>Verify Email</span>
                </>
              )}
            </Button>

            <Button
              size='sm'
              variant={user.isActive ? 'danger' : 'primary'}
              onClick={handleToggle}
              isLoading={toggling}
              className='shadow-sm'
            >
              {user.isActive ? (
                <>
                  <UserX className='h-3.5 w-3.5' />
                  <span>Deactivate Account</span>
                </>
              ) : (
                <>
                  <UserCheck className='h-3.5 w-3.5' />
                  <span>Activate Account</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Panel>

      {/* KPI Overview Grid */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {/* Wallet Balance Card */}
        <Panel className='p-4 space-y-2'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Wallet Balance</span>
            <Wallet className='h-4 w-4 text-primary-600' />
          </div>
          <div className='text-2xl font-bold font-mono text-ink tracking-tight'>
            {formatNaira(user.walletBalance?.balance ?? 0)}
          </div>
          <div className='flex items-center justify-between text-[11px] text-ink-subtle'>
            <span>Locked: {formatNaira(user.walletBalance?.lockedBalance ?? 0)}</span>
            <span className='font-mono'>{user.walletBalance?.currency || 'NGN'}</span>
          </div>
        </Panel>

        {/* Subscription Plan Card */}
        <Panel className='p-4 space-y-2'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Subscription Tier</span>
            <Crown className='h-4 w-4 text-amber-500' />
          </div>
          <div className='flex items-center gap-2'>
            <StatusPill tone={getPlanBadge(user.subscriptionTier).tone}>
              {getPlanBadge(user.subscriptionTier).label}
            </StatusPill>
            {user.subscriptionTier && user.subscriptionTier !== 'free' && !user.subscriptionExpiresAt && !user.trialEndsAt && (
              <span className='text-xs font-semibold text-success-600'>Lifetime</span>
            )}
          </div>
          <div className='text-[11px] text-ink-subtle'>
            {user.subscriptionExpiresAt ? (
              <span>Expires {formatDate(user.subscriptionExpiresAt)}</span>
            ) : user.trialEndsAt ? (
              <span>Trial ends {formatDate(user.trialEndsAt)}</span>
            ) : (
              <span>Continuous active access</span>
            )}
          </div>
        </Panel>

        {/* Businesses Portfolio Card */}
        <Panel className='p-4 space-y-2'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Business Portfolio</span>
            <Building2 className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='text-2xl font-bold text-ink tracking-tight'>
            {user.businesses.length}
          </div>
          <div className='text-[11px] text-ink-subtle'>
            {totalSalesCount} sales · {totalInvoicesCount} invoices recorded
          </div>
        </Panel>

        {/* Account Timeline Card */}
        <Panel className='p-4 space-y-2'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Account Activity</span>
            <Clock className='h-4 w-4 text-indigo-600' />
          </div>
          <div className='text-xs font-medium text-ink'>
            Joined {formatDate(user.createdAt)}
          </div>
          <div className='text-[11px] text-ink-subtle'>
            Last login: {user.lastLoginAt ? formatStamp(user.lastLoginAt) : 'Never logged in'}
          </div>
        </Panel>
      </div>

      {/* Main Details Grid: Left 2 cols, Right 1 col */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3 items-start'>
        {/* Left Column: Businesses & Operational Information */}
        <div className='lg:col-span-2 space-y-6'>
          {/* Registered Businesses Section */}
          <Panel>
            <PanelHeader
              title={`Registered Businesses (${user.businesses.length})`}
              hint='Merchant entities owned and managed by this account.'
            />
            {user.businesses.length === 0 ? (
              <PanelEmpty
                icon={Building2}
                title='No businesses registered'
                hint='This user account has not created any business profiles yet.'
              />
            ) : (
              <div className='divide-y divide-hairline'>
                {user.businesses.map((b) => (
                  <div key={b.id} className='p-4 space-y-3.5 hover:bg-panel-subtle/50 transition-colors'>
                    {/* Business Header */}
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                      <div className='flex items-center gap-2.5'>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 font-bold'>
                          <Building2 className='h-4 w-4' />
                        </div>
                        <div>
                          <h3 className='text-sm font-bold text-ink'>{b.businessName}</h3>
                          <p className='text-xs text-ink-muted'>
                            Owned by <span className='font-medium text-ink'>{b.ownerName}</span> · Registered {formatDate(b.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className='flex items-center gap-1.5'>
                        {b.businessType && (
                          <StatusPill tone='neutral'>{b.businessType}</StatusPill>
                        )}
                        {b.state && (
                          <span className='text-[11px] font-mono text-ink-subtle bg-panel-subtle border border-hairline px-2 py-0.5 rounded'>
                            {b.city ? `${b.city}, ` : ''}{b.state}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tax & Banking Details Grid */}
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs'>
                      {/* DVA Info */}
                      <div className='rounded-lg border border-hairline bg-panel p-3 space-y-1.5'>
                        <div className='flex items-center justify-between text-ink-muted text-[11px] font-medium'>
                          <span>Dedicated Virtual Account (DVA)</span>
                          <span className='font-mono text-primary-600'>{b.virtualAccountBank || 'Not assigned'}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                          <span className='font-mono font-semibold text-ink text-sm'>
                            {b.virtualAccountNumber || 'No account number'}
                          </span>
                          {b.virtualAccountNumber && (
                            <button
                              type='button'
                              onClick={() => handleCopy(b.virtualAccountNumber!, `DVA-${b.id}`)}
                              className='rounded p-1 text-ink-subtle hover:text-ink hover:bg-panel-subtle'
                              title='Copy Virtual Account Number'
                            >
                              {copiedKey === `DVA-${b.id}` ? (
                                <Check className='h-3.5 w-3.5 text-success-600' />
                              ) : (
                                <Copy className='h-3.5 w-3.5' />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Settlement Bank Info */}
                      <div className='rounded-lg border border-hairline bg-panel p-3 space-y-1.5'>
                        <div className='flex items-center justify-between text-ink-muted text-[11px] font-medium'>
                          <span>Settlement Payout Account</span>
                          <span className='font-mono text-success-600'>{b.settlementBankName || 'Not linked'}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                          <span className='font-mono font-semibold text-ink text-sm'>
                            {b.settlementAccountNumber || 'No settlement account'}
                          </span>
                          {b.settlementAccountNumber && (
                            <button
                              type='button'
                              onClick={() => handleCopy(b.settlementAccountNumber!, `Settlement-${b.id}`)}
                              className='rounded p-1 text-ink-subtle hover:text-ink hover:bg-panel-subtle'
                              title='Copy Settlement Account'
                            >
                              {copiedKey === `Settlement-${b.id}` ? (
                                <Check className='h-3.5 w-3.5 text-success-600' />
                              ) : (
                                <Copy className='h-3.5 w-3.5' />
                              )}
                            </button>
                          )}
                        </div>
                        {b.settlementAccountName && (
                          <p className='text-[10px] text-ink-muted truncate'>
                            Name: {b.settlementAccountName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Operational Metrics Bar */}
                    <div className='flex flex-wrap items-center gap-3 pt-1 border-t border-hairline text-xs text-ink-muted'>
                      {b.taxId && (
                        <div className='flex items-center gap-1 font-mono text-[11px] text-ink-subtle mr-2'>
                          <Hash className='h-3 w-3' />
                          <span>TIN: {b.taxId}</span>
                        </div>
                      )}
                      <div className='flex items-center gap-4 text-[11px]'>
                        <span><strong>{b._count?.sales ?? 0}</strong> Sales</span>
                        <span><strong>{b._count?.invoices ?? 0}</strong> Invoices</span>
                        <span><strong>{b._count?.expenses ?? 0}</strong> Expenses</span>
                        <span><strong>{b._count?.customers ?? 0}</strong> Customers</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Subscription Submissions (Payment Proofs) */}
          {user.subscriptionSubmissions && user.subscriptionSubmissions.length > 0 && (
            <Panel>
              <PanelHeader
                title={`Subscription Submissions (${user.subscriptionSubmissions.length})`}
                hint='Offline transfer payment receipts submitted by the user.'
              />
              <div className='divide-y divide-hairline'>
                {user.subscriptionSubmissions.map((sub) => (
                  <div key={sub.id} className='p-3.5 flex items-center justify-between gap-3 text-xs'>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2'>
                        <span className='font-semibold text-ink capitalize'>{sub.plan} Plan</span>
                        <StatusPill
                          tone={
                            sub.status === 'approved'
                              ? 'success'
                              : sub.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {sub.status}
                        </StatusPill>
                        <span className='font-mono font-medium text-ink'>
                          {formatNaira(sub.amount)}
                        </span>
                      </div>
                      <p className='text-[11px] text-ink-muted'>
                        Cycle: <span className='capitalize font-medium'>{sub.billingCycle}</span> · Submitted {formatDate(sub.createdAt)}
                      </p>
                      {sub.notes && (
                        <p className='text-[11px] text-ink-subtle italic'>
                          "{sub.notes}"
                        </p>
                      )}
                    </div>

                    {sub.receiptUrl && (
                      <a
                        href={sub.receiptUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline shrink-0'
                      >
                        <FileText className='h-3.5 w-3.5' />
                        <span>View Receipt</span>
                        <ExternalLink className='h-3 w-3' />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Feedback & Reviews */}
          {user.feedbacks && user.feedbacks.length > 0 && (
            <Panel>
              <PanelHeader
                title={`User Feedback & Reviews (${user.feedbacks.length})`}
                hint='Product experience ratings and comments provided by this account.'
              />
              <div className='divide-y divide-hairline'>
                {user.feedbacks.map((f) => (
                  <div key={f.id} className='p-3.5 space-y-1.5 text-xs'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-1'>
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < f.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                            }`}
                          />
                        ))}
                        <span className='font-semibold text-ink ml-1.5'>{f.rating}/5</span>
                      </div>
                      <span className='text-[11px] text-ink-subtle'>{formatDate(f.createdAt)}</span>
                    </div>

                    {f.comment && (
                      <p className='text-xs text-ink bg-panel-subtle rounded p-2.5 border border-hairline'>
                        "{f.comment}"
                      </p>
                    )}

                    {f.tags && f.tags.length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-1'>
                        {f.tags.map((tag) => (
                          <span
                            key={tag}
                            className='inline-block text-[10px] bg-panel-subtle text-ink-muted px-1.5 py-0.5 rounded border border-hairline'
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Right Column: User Profile & Security Meta */}
        <div className='space-y-6'>
          {/* Identity & Profile Panel */}
          <Panel>
            <PanelHeader title='Account Profile & Identity' />
            <div className='p-3 space-y-1'>
              <DetailItem
                label='User ID'
                action={
                  <button
                    type='button'
                    onClick={() => handleCopy(user.id, 'User ID')}
                    className='rounded p-1 text-ink-subtle hover:text-ink'
                    title='Copy User ID'
                  >
                    {copiedKey === 'User ID' ? (
                      <Check className='h-3 w-3 text-success-600' />
                    ) : (
                      <Copy className='h-3 w-3' />
                    )}
                  </button>
                }
              >
                <span className='font-mono text-[11px] truncate max-w-[170px]'>{user.id}</span>
              </DetailItem>

              <DetailItem label='Email Address'>
                <span className='truncate max-w-[190px]'>{user.email}</span>
              </DetailItem>

              <DetailItem label='Phone Number'>
                {user.phone ? (
                  <span className='font-mono'>{user.phone}</span>
                ) : (
                  <span className='text-ink-subtle italic'>Not provided</span>
                )}
              </DetailItem>

              <DetailItem label='Platform Role'>
                <span className='capitalize font-medium'>{user.role}</span>
              </DetailItem>

              <DetailItem label='Email Verification'>
                <StatusPill tone={user.isVerified ? 'success' : 'warning'}>
                  {user.isVerified ? 'Verified' : 'Unverified'}
                </StatusPill>
              </DetailItem>

              <DetailItem label='Account Status'>
                <StatusPill tone={user.isActive ? 'success' : 'danger'}>
                  {user.isActive ? 'Active' : 'Suspended'}
                </StatusPill>
              </DetailItem>

              <DetailItem label='Registered At'>
                <span>{formatDate(user.createdAt)}</span>
              </DetailItem>

              <DetailItem label='Last Active Login'>
                <span>{user.lastLoginAt ? formatStamp(user.lastLoginAt) : 'Never'}</span>
              </DetailItem>

              {user.updatedAt && (
                <DetailItem label='Last Profile Update'>
                  <span>{formatDate(user.updatedAt)}</span>
                </DetailItem>
              )}
            </div>
          </Panel>

          {/* Payout & Withdrawal Flow Policy */}
          <Panel>
            <PanelHeader title='Withdrawal Flow Configuration' />
            <div className='p-3.5 space-y-3 text-xs'>
              <div className='flex items-center justify-between'>
                <span className='text-ink-muted text-[11px]'>Settlement Mode</span>
                <StatusPill tone={user.autoPayoutEnabled ? 'success' : 'neutral'}>
                  {user.autoPayoutEnabled ? '⚡ Automatic Transfers' : '🔒 Manual Review'}
                </StatusPill>
              </div>

              <p className='text-[11px] text-ink-muted leading-relaxed'>
                {user.autoPayoutEnabled
                  ? 'Transfers requested by this account are processed immediately via automated Paystack gateway transfers, subject to daily platform thresholds.'
                  : 'All withdrawal requests from this account are held in a pending state until an authorized administrator manually verifies and approves them.'}
              </p>

              <Button
                size='sm'
                variant='secondary'
                onClick={handleToggleUserAutoPayout}
                isLoading={togglingPayout}
                className='w-full'
              >
                {user.autoPayoutEnabled ? 'Switch to Manual Review' : 'Switch to Automatic Transfers'}
              </Button>
            </div>
          </Panel>

          {/* Quick Shortcuts */}
          <Panel>
            <PanelHeader title='Admin Quick Actions' />
            <div className='p-3 space-y-2'>
              <Link
                to={`/admin/withdrawals`}
                className='flex items-center justify-between p-2 rounded hover:bg-panel-subtle text-xs text-ink font-medium transition-colors border border-hairline'
              >
                <span>View Settlement Withdrawals</span>
                <ExternalLink className='h-3.5 w-3.5 text-ink-subtle' />
              </Link>
              <Link
                to={`/admin/businesses`}
                className='flex items-center justify-between p-2 rounded hover:bg-panel-subtle text-xs text-ink font-medium transition-colors border border-hairline'
              >
                <span>View Platform Businesses</span>
                <ExternalLink className='h-3.5 w-3.5 text-ink-subtle' />
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      {/* Change Plan Modal */}
      <ChangePlanModal
        isOpen={showChangePlanModal}
        onClose={() => setShowChangePlanModal(false)}
        user={user}
        onSuccess={(updated) => {
          setUser((prev) => (prev ? { ...prev, ...updated } : prev));
        }}
      />
    </div>
  );
}