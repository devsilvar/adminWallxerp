import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  User,
  Building2,
  Lock,
  Save,
  Mail,
  Shield,
  CheckCircle2,
  Calendar,
  Percent,
  MapPin,
  FileText,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Copy,
  Check,
  Briefcase,
  Upload,
  Laptop,
  Smartphone,
  ShieldCheck,
  LogOut,
  Trash2,
  Users,
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';

import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import PinModal from '@/components/PinModal.tsx';
import UpdateBvnModal from '@/components/UpdateBvnModal.tsx';
import TeamSettingsTab from '@/components/settings/TeamSettingsTab.tsx';
import VoucherBonusCard from '@/components/voucher/VoucherBonusCard.tsx';
import VoucherThresholdCard from '@/components/voucher/VoucherThresholdCard.tsx';
import TaxProfileCard from '@/components/TaxProfileCard.tsx';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { usePinStore } from '@/stores/pin.store.ts';
import { hasPerm } from '@/components/auth/PermissionGate.tsx';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getPlanLimits } from '@/config/subscription';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';

import { NIGERIAN_STATES } from '@/config/states.ts';

// Must match CreateBusinessModal — backend stores the enum value (`sole_proprietorship` / `llc`).
const BUSINESS_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship (Individual)' },
  { value: 'llc', label: 'Registered Business (LLC)' },
];

const businessTypeLabel = (value?: string | null) =>
  BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value ?? '—';

type TabId = 'profile' | 'business' | 'team' | 'security';

const TABS: Array<{
  id: TabId;
  label: string;
  description: string;
  icon: typeof User;
}> = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your account details',
    icon: User,
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Company & tax setup',
    icon: Building2,
  },
  {
    id: 'team',
    label: 'Team & Roles',
    description: 'Members & access',
    icon: Users,
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Password & sessions',
    icon: Lock,
  },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;

  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const biz = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const fetchBusinesses = useBusinessStore((s) => s.fetchBusinesses);
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness);
  const subStatus = useSubscriptionStatus();
  const planLimits = getPlanLimits(subStatus.tier);
  const isBusinessOverLimit = planLimits.maxBusinesses !== -1 && businesses.length > planLimits.maxBusinesses;
  const isTeamOverLimit = planLimits.maxTeamMembers !== -1 && businesses.some((b) => (b.memberCount ?? 0) > planLimits.maxTeamMembers);

  // Team & Roles tab is restricted to owners and managers (or members with explicit team.manage permission)
  const canManageTeam = Boolean(
    biz &&
    (biz.myRole === 'owner' ||
      biz.myRole === 'manager' ||
      hasPerm('team.manage', biz, user?.id)),
  );

  // Financial PIN is strictly owner-only
  const isOwner = Boolean(
    biz
      ? biz.myRole === 'owner' || biz.userId === user?.id
      : user?.isOwnerAccount !== false,
  );
  const isManagerOrOwner = Boolean(isOwner || biz?.myRole === 'manager');

  const visibleTabs = TABS.filter((t) => t.id !== 'team' || canManageTeam);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (tabFromUrl === 'team' && !canManageTeam) return 'profile';
    return tabFromUrl &&
      ['profile', 'business', 'team', 'security'].includes(tabFromUrl)
      ? tabFromUrl
      : 'profile';
  });

  useEffect(() => {
    if (tabFromUrl === 'team' && !canManageTeam) {
      setActiveTab('profile');
      setSearchParams({ tab: 'profile' }, { replace: true });
    } else if (
      tabFromUrl &&
      ['profile', 'business', 'team', 'security'].includes(tabFromUrl) &&
      tabFromUrl !== activeTab
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, canManageTeam]);

  const handleTabChange = (id: TabId) => {
    if (id === 'team' && !canManageTeam) return;
    setActiveTab(id);
    setSearchParams({ tab: id });
  };

  // Business form
  const [bizName, setBizName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [bizType, setBizType] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [profitMargin, setProfitMargin] = useState(20);
  const [taxReminderDay, setTaxReminderDay] = useState(25);
  const [savingBiz, setSavingBiz] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // BVN update state
  const [showBvnPinModal, setShowBvnPinModal] = useState(false);
  const [showUpdateBvnModal, setShowUpdateBvnModal] = useState(false);
  const [bvnStepUpToken, setBvnStepUpToken] = useState('');
  const hasPin = usePinStore((s) => s.hasPin);

  const handleStartBvnUpdate = () => {
    if (!isOwner) return;
    if (!hasPin) {
      toast(
        'Please configure your 4-digit transaction PIN in the Security tab first.',
        {
          icon: '🔒',
          duration: 5000,
        },
      );
      setActiveTab('security');
      return;
    }
    setShowBvnPinModal(true);
  };

  const handleBvnPinSuccess = (token: string) => {
    setBvnStepUpToken(token);
    setShowUpdateBvnModal(true);
  };

  // Snapshot of last loaded biz — drives the "unsaved changes" detection.
  const initial = useMemo(
    () =>
      biz
        ? {
            bizName: biz.businessName,
            ownerName: biz.ownerName,
            bizType: biz.businessType ?? '',
            taxId: biz.taxId ?? '',
            address: biz.address ?? '',
            city: biz.city ?? '',
            state: biz.state ?? '',
            profitMargin: Number(biz.defaultProfitMargin ?? 20),
            taxReminderDay: Number(biz.taxReminderDay ?? 25),
          }
        : null,
    [biz],
  );

  useEffect(() => {
    if (initial) {
      setBizName(initial.bizName);
      setOwnerName(initial.ownerName);
      setBizType(initial.bizType);
      setTaxId(initial.taxId);
      setAddress(initial.address);
      setCity(initial.city);
      setState(initial.state);
      setProfitMargin(initial.profitMargin);
      setTaxReminderDay(initial.taxReminderDay);
    }
  }, [initial]);

  const isDirty =
    !!initial &&
    (bizName !== initial.bizName ||
      ownerName !== initial.ownerName ||
      bizType !== initial.bizType ||
      taxId !== initial.taxId ||
      address !== initial.address ||
      city !== initial.city ||
      state !== initial.state ||
      profitMargin !== initial.profitMargin ||
      taxReminderDay !== initial.taxReminderDay);

  const handleLogoUpload = async (file: File) => {
    if (!biz) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('logo', file, file.name);
      const res = await api.post(`/businesses/${biz.id}/logo`, form, {
        headers: { 'Content-Type': undefined },
      });
      if (res.data?.data) {
        setActiveBusiness(res.data.data);
      }
      await fetchBusinesses(true);
      toast.success('Company logo uploaded successfully');
    } catch (err: any) {
      const apiErr = err?.response?.data?.error;
      toast.error(apiErr?.message || 'Failed to upload company logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!biz) return;
    setLogoUploading(true);
    try {
      const res = await api.delete(`/businesses/${biz.id}/logo`);
      if (res.data?.data) {
        setActiveBusiness(res.data.data);
      }
      await fetchBusinesses(true);
      toast.success('Company logo removed');
    } catch (err: any) {
      const apiErr = err?.response?.data?.error;
      toast.error(apiErr?.message || 'Failed to remove logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBusinessUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!biz) return;
    setSavingBiz(true);
    try {
      await api.put(`/businesses/${biz.id}`, {
        businessName: bizName,
        ownerName,
        businessType: bizType,
        taxId: taxId || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        defaultProfitMargin: Number(profitMargin),
        taxReminderDay: Number(taxReminderDay),
      });
      toast.success('Business settings updated');
      fetchBusinesses();
    } catch (err: any) {
      const apiErr = err.response?.data?.error;
      const fieldMsg =
        Array.isArray(apiErr?.details) && apiErr.details[0]
          ? `${apiErr.details[0].field}: ${apiErr.details[0].message}`
          : null;
      toast.error(fieldMsg || apiErr?.message || 'Update failed');
    } finally {
      setSavingBiz(false);
    }
  };

  const handleResetBusiness = () => {
    if (!initial) return;
    setBizName(initial.bizName);
    setOwnerName(initial.ownerName);
    setBizType(initial.bizType);
    setTaxId(initial.taxId);
    setAddress(initial.address);
    setCity(initial.city);
    setState(initial.state);
    setProfitMargin(initial.profitMargin);
    setTaxReminderDay(initial.taxReminderDay);
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      toast.error('Password must contain uppercase, lowercase, and a number');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchMe();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Password change failed',
      );
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className='space-y-7 pb-8'>
      {/* Minimal header with breadcrumb feel */}
      <header className='border-b border-gray-100 pb-4'>
        <div className='flex items-baseline gap-2 mb-1'>
          <span className='text-xs font-medium text-gray-400 tracking-wide'>
            ACCOUNT
          </span>
          <span className='text-gray-300'>/</span>
          <h1 className='text-xl font-semibold text-gray-900'>Settings</h1>
        </div>
        <p className='text-[13px] text-gray-600 leading-relaxed max-w-2xl'>
          Manage account details, business information, and security controls
        </p>
      </header>

      {/* Offset split-screen layout (asymmetric) */}
      <div className='grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12'>
        {/* Minimal sidebar nav (desktop) - no boxes, just text */}
        <nav aria-label='Settings sections' className='hidden lg:block'>
          <ul className='space-y-0.5 sticky top-4'>
            {visibleTabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => handleTabChange(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex w-full items-center gap-2.5 px-0 py-2 text-left border-l-2 transition-all ${
                      isActive
                        ? 'border-gray-900 pl-3'
                        : 'border-transparent pl-3 hover:border-gray-200 hover:pl-4'
                    }`}
                  >
                    <Icon
                      className={`h-[15px] w-[15px] transition-all ${
                        isActive
                          ? 'text-gray-900'
                          : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    <span
                      className={`text-[14px] leading-none font-medium tracking-tight transition-all ${
                        isActive
                          ? 'text-gray-900'
                          : 'text-gray-500 group-hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Mobile nav - underline style instead of pills */}
        <div className='lg:hidden -mx-4 sm:mx-0 border-b border-gray-200'>
          <div className='flex px-4 sm:px-0'>
            {visibleTabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                    isActive
                      ? 'text-gray-900 border-gray-900'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  <Icon
                    className='h-[14px] w-[14px]'
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content panel */}
        <section className='min-w-0 space-y-4'>
          {isBusinessOverLimit && (
            <div className='flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900'>
              <AlertCircle className='h-4 w-4 shrink-0 text-amber-600 mt-0.5' />
              <div className='flex-1'>
                <span className='font-semibold block'>
                  Account Exceeds Business Plan Limits
                </span>
                <p className='text-amber-800 mt-0.5'>
                  You currently manage {businesses.length} businesses, which exceeds your {planLimits.name} limit of {planLimits.maxBusinesses}. All existing businesses remain visible and accessible, but creating new businesses is blocked until you are within limits.
                </p>
              </div>
              <Link
                to='/subscription'
                className='inline-flex shrink-0 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors'
              >
                Upgrade Plan
              </Link>
            </div>
          )}
          {isTeamOverLimit && (
            <div className='flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900'>
              <Users className='h-4 w-4 shrink-0 text-amber-600 mt-0.5' />
              <div className='flex-1'>
                <span className='font-semibold block'>Team Limit Exceeded</span>
                <p className='text-amber-800 mt-0.5'>
                  One or more businesses has {planLimits.maxTeamMembers + 1}+ team members, exceeding your {planLimits.name} limit of {planLimits.maxTeamMembers} per business. Existing members stay active, but new invites will be blocked until you are within limits.
                </p>
              </div>
              <Link
                to='/subscription'
                className='inline-flex shrink-0 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors'
              >
                Upgrade Plan
              </Link>
            </div>
          )}

          {activeTab === 'profile' && (
            <ProfilePanel
              user={user}
              biz={biz}
              businesses={businesses}
              isOwner={isOwner}
              onEditBusiness={() => setActiveTab('business')}
              onUpdateBvn={handleStartBvnUpdate}
            />
          )}

          {activeTab === 'business' && biz && (
            <div className='space-y-6'>
              <TaxProfileCard businessId={biz.id} businessName={biz.businessName} />
              <BusinessPanel
              bizName={bizName}
              setBizName={setBizName}
              ownerName={ownerName}
              setOwnerName={setOwnerName}
              bizType={bizType}
              setBizType={setBizType}
              taxId={taxId}
              setTaxId={setTaxId}
              address={address}
              setAddress={setAddress}
              city={city}
              setCity={setCity}
              state={state}
              setState={setState}
              profitMargin={profitMargin}
              setProfitMargin={setProfitMargin}
              taxReminderDay={taxReminderDay}
              setTaxReminderDay={setTaxReminderDay}
              logoUrl={biz.logoUrl}
              logoUploading={logoUploading}
              onUploadLogo={handleLogoUpload}
              onRemoveLogo={handleLogoRemove}
              isDirty={isDirty}
              savingBiz={savingBiz}
              onSubmit={handleBusinessUpdate}
              onReset={handleResetBusiness}
              businessId={biz.id}
              voucherBonusPct={biz.voucherBonusPct}
              voucherAdjustmentThreshold={biz.voucherAdjustmentThreshold ?? 50000}
              isManagerOrOwner={isManagerOrOwner}
            />
            </div>
          )}

          {activeTab === 'business' && !biz && (
            <Card>
              <div className='px-6 py-12 text-center'>
                <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100'>
                  <Building2 className='h-6 w-6 text-gray-400' />
                </div>
                <p className='mt-3 text-sm font-medium text-gray-700'>
                  No business selected
                </p>
                <p className='mt-1 text-[13px] text-gray-500'>
                  Create or select a business from the sidebar to edit its
                  details.
                </p>
              </div>
            </Card>
          )}

          {activeTab === 'team' && canManageTeam && biz && <TeamSettingsTab />}

          {activeTab === 'team' && canManageTeam && !biz && (
            <Card>
              <div className='px-6 py-12 text-center'>
                <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100'>
                  <Users className='h-6 w-6 text-gray-400' />
                </div>
                <p className='mt-3 text-sm font-medium text-gray-700'>
                  No business selected
                </p>
                <p className='mt-1 text-[13px] text-gray-500'>
                  Create or select a business to view and manage its team.
                </p>
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <SecurityPanel
              user={user}
              isOwner={isOwner}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              showCurrent={showCurrent}
              setShowCurrent={setShowCurrent}
              showNew={showNew}
              setShowNew={setShowNew}
              savingPw={savingPw}
              onSubmit={handlePasswordChange}
            />
          )}
        </section>
      </div>

      {/* BVN Update PIN Step-Up Modal */}
      <PinModal
        isOpen={showBvnPinModal}
        onClose={() => setShowBvnPinModal(false)}
        onSuccess={handleBvnPinSuccess}
        title='Authorize BVN Update'
        subtitle='Enter your 4-digit transaction PIN to link or change your BVN.'
      />

      {/* BVN Entry Form Modal */}
      <UpdateBvnModal
        isOpen={showUpdateBvnModal}
        onClose={() => {
          setShowUpdateBvnModal(false);
          setBvnStepUpToken('');
        }}
        stepUpToken={bvnStepUpToken}
        currentBvnLast4={user?.bvnLast4}
      />
    </div>
  );
}

// ─── Profile panel ─────────────────────────────────────────

function ProfilePanel({
  user,
  biz,
  businesses = [],
  isOwner,
  onEditBusiness,
  onUpdateBvn,
}: {
  user: any;
  biz: any;
  businesses?: any[];
  isOwner: boolean;
  onEditBusiness: () => void;
  onUpdateBvn: () => void;
}) {
  const initial = user?.email?.charAt(0).toUpperCase() || 'U';
  const displayName = user?.email?.split('@')[0] ?? 'Account';
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>(
    user?.primaryBusinessId || '',
  );
  const [savingPrimary, setSavingPrimary] = useState(false);

  useEffect(() => {
    setSelectedPrimaryId(user?.primaryBusinessId || '');
  }, [user?.primaryBusinessId]);

  const handleSavePrimaryBusiness = async () => {
    setSavingPrimary(true);
    try {
      await api.patch('/auth/me/primary-business', {
        primaryBusinessId: selectedPrimaryId || null,
      });
      toast.success('Default receiving business updated');
      useAuthStore.getState().fetchMe();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Failed to update default business',
      );
    } finally {
      setSavingPrimary(false);
    }
  };

  const isPrimaryDirty = (user?.primaryBusinessId || '') !== selectedPrimaryId;

  return (
    <div className='space-y-7'>
      {/* Identity — minimalist with offset layout */}
      <Card>
        <div className='flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start'>
          <div className='flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xl font-medium text-white ring-4 ring-gray-100'>
            {initial}
          </div>
          <div className='min-w-0 flex-1 pt-1'>
            <h2 className='text-[15px] font-semibold text-gray-900 leading-none'>
              {displayName}
            </h2>
            <p className='mt-1.5 text-[13px] text-gray-600'>{user?.email}</p>
            <div className='mt-3 flex flex-wrap items-center gap-1.5'>
              <Badge tone={user?.isActive ? 'emerald' : 'red'}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <Badge tone='slate' capitalize>
                {user?.role ?? 'user'}
              </Badge>
              {user?.isVerified && (
                <Badge tone='emerald'>
                  <CheckCircle2 className='h-2.5 w-2.5' /> Verified
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Account info — no nested borders */}
      <Card
        title='Account information'
        subtitle='Core identity and contact details'
      >
        <div className='grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2'>
          <DetailRow icon={Mail} label='Email' value={user?.email || '—'} />
          <DetailRow
            icon={Shield}
            label='Role'
            value={user?.role || 'user'}
            capitalize
          />
        </div>
      </Card>

      {/* BVN — owners only */}
      {isOwner && (
        <Card
          title='Identity verification'
          subtitle='Bank Verification Number for NRS compliance'
          action={
            <button
              onClick={onUpdateBvn}
              className='text-[13px] font-medium text-gray-900 hover:text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 transition-colors'
            >
              {user?.bvnLast4 ? 'Update' : 'Link BVN'}
            </button>
          }
        >
          <div className='grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2'>
            <DetailRow
              icon={ShieldCheck}
              label='Status'
              value={user?.bvnVerifiedAt ? 'Tier 2 Verified' : 'Pending'}
            />
            <DetailRow
              icon={Shield}
              label='Linked BVN'
              value={user?.bvnLast4 ? `•••••${user.bvnLast4}` : 'Not linked'}
            />
          </div>
        </Card>
      )}

      {/* Business summary — editorial feel */}
      {biz && (
        <Card
          title='Current workspace'
          subtitle="The business context you're operating in"
          action={
            <button
              onClick={onEditBusiness}
              className='text-[13px] font-medium text-gray-900 hover:text-gray-700 transition-colors flex items-center gap-1'
            >
              Edit <ChevronRight className='h-3.5 w-3.5' />
            </button>
          }
        >
          <div className='px-5 pt-2 pb-4 flex items-start gap-4 border-b border-gray-100'>
            <div className='h-11 w-11 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0'>
              {biz.logoUrl ? (
                <img
                  src={biz.logoUrl}
                  alt={biz.businessName}
                  className='h-full w-full object-cover'
                />
              ) : (
                <Building2 className='h-5 w-5 text-gray-400' />
              )}
            </div>
            <div className='min-w-0 flex-1 pt-0.5'>
              <h3 className='text-[15px] font-semibold text-gray-900 truncate leading-tight'>
                {biz.businessName}
              </h3>
              <p className='text-xs text-gray-500 mt-1'>
                {businessTypeLabel(biz.businessType)}
              </p>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2 mt-5'>
            <DetailRow icon={User} label='Owner' value={biz.ownerName} />
            <DetailRow
              icon={Briefcase}
              label='Type'
              value={businessTypeLabel(biz.businessType)}
            />
            {biz.taxId && (
              <DetailRow icon={FileText} label='Tax ID' value={biz.taxId} />
            )}
            {biz.city && (
              <DetailRow
                icon={MapPin}
                label='Location'
                value={`${biz.city}${biz.state ? ', ' + biz.state : ''}`}
              />
            )}
          </div>

          {biz.virtualAccountNumber && (
            <div className='mx-5 mb-5 mt-4 flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3'>
              <CheckCircle2 className='h-4 w-4 text-blue-600 mt-0.5 shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='text-[11px] font-semibold text-blue-900 tracking-wide leading-none'>
                  VIRTUAL ACCOUNT
                </p>
                <CopyRow text={biz.virtualAccountNumber} />
                {biz.virtualAccountBank && (
                  <p className='mt-1 text-[11px] text-blue-700'>
                    {biz.virtualAccountBank}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Primary Receiving Business — multiple businesses only */}
      {businesses.length > 1 && (
        <Card
          title='Default Inflow Business'
          subtitle='Choose which business automatically receives incoming DVA bank transfers when not specified'
        >
          <div className='p-5 space-y-4'>
            <div className='max-w-md'>
              <label
                htmlFor='primary-business-select'
                className='block text-xs font-medium text-gray-700 mb-1.5'
              >
                Primary Business
              </label>
              <select
                id='primary-business-select'
                value={selectedPrimaryId}
                onChange={(e) => setSelectedPrimaryId(e.target.value)}
                className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900'
              >
                <option value=''>
                  No preference (auto-assign to first business)
                </option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.businessName} {b.merchantId ? `(${b.merchantId})` : ''}
                  </option>
                ))}
              </select>
              <p className='mt-1.5 text-[11px] text-gray-500'>
                Incoming bank transfers to your dedicated virtual account will
                be routed to this business by default.
              </p>
            </div>
            {isPrimaryDirty && (
              <div className='flex items-center gap-2 pt-2'>
                <Button
                  size='sm'
                  onClick={handleSavePrimaryBusiness}
                  isLoading={savingPrimary}
                >
                  Save Preference
                </Button>
                <Button
                  size='sm'
                  variant='secondary'
                  disabled={savingPrimary}
                  onClick={() =>
                    setSelectedPrimaryId(user?.primaryBusinessId || '')
                  }
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Logo upload card ──────────────────────────────────────

function LogoUploadCard({
  logoUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  logoUrl?: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setImgErr(false);
  }, [logoUrl]);

  const handleFile = (f: File) => {
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'jfif'];
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const isMimeValid =
      f.type.startsWith('image/') || f.type === 'image/svg+xml';
    const isExtValid = validExtensions.includes(ext);

    if (!isMimeValid && !isExtValid) {
      toast.error('Only JPEG, PNG, WebP or SVG images accepted');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller');
      return;
    }
    if (f.type === 'image/svg+xml' || ext === 'svg') {
      toast('SVG detected — will be optimized for invoices and statements', {
        icon: '✨',
      });
    }
    onUpload(f);
  };

  return (
    <Card
      title='Company logo'
      subtitle='Appears on invoices, statements, and dashboard'
    >
      <div className='flex flex-col sm:flex-row items-start gap-6 px-5 pb-6'>
        {/* Preview */}
        <div className='relative shrink-0 h-16 w-16 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50'>
          {logoUrl && !imgErr ? (
            <img
              src={logoUrl}
              alt='Company logo'
              className='h-full w-full object-contain p-2'
              onError={() => setImgErr(true)}
            />
          ) : (
            <Building2 className='h-6 w-6 text-gray-300' strokeWidth={1.5} />
          )}
        </div>

        {/* Upload area */}
        <div className='flex-1 w-full space-y-2.5'>
          <div
            className={`flex flex-col items-center justify-center rounded-lg border p-5 cursor-pointer transition-all ${
              dragActive
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-200 hover:border-gray-400 bg-white'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className='h-5 w-5 text-gray-400 mb-2' strokeWidth={1.5} />
            <p className='text-xs font-medium text-gray-700'>
              {uploading ? 'Uploading…' : 'Click or drag to upload'}
            </p>
            <p className='text-[11px] text-gray-500 mt-1'>
              PNG, JPEG, WebP, SVG • Max 5 MB
            </p>
          </div>
          <input
            ref={inputRef}
            type='file'
            accept='image/*,.png,.jpg,.jpeg,.webp,.svg'
            className='hidden'
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {logoUrl && (
            <button
              type='button'
              onClick={onRemove}
              disabled={uploading}
              className='text-[12px] font-medium text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-2 decoration-gray-300 hover:decoration-gray-500'
            >
              Remove logo
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Business panel ────────────────────────────────────────

interface BusinessPanelProps {
  bizName: string;
  setBizName: (v: string) => void;
  ownerName: string;
  setOwnerName: (v: string) => void;
  bizType: string;
  setBizType: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  profitMargin: number;
  setProfitMargin: (v: number) => void;
  taxReminderDay: number;
  setTaxReminderDay: (v: number) => void;
  logoUrl?: string | null;
  logoUploading: boolean;
  onUploadLogo: (file: File) => void;
  onRemoveLogo: () => void;
  isDirty: boolean;
  savingBiz: boolean;
  onSubmit: (e: FormEvent) => void;
  onReset: () => void;
  businessId: string;
  voucherBonusPct?: number;
  voucherAdjustmentThreshold?: number;
  isManagerOrOwner: boolean;
}

function BusinessPanel(props: BusinessPanelProps) {
  return (
    <div className='space-y-7'>
      <LogoUploadCard
        logoUrl={props.logoUrl}
        uploading={props.logoUploading}
        onUpload={props.onUploadLogo}
        onRemove={props.onRemoveLogo}
      />
      <VoucherBonusCard businessId={props.businessId} initialPct={props.voucherBonusPct ?? 0} onSaved={() => import('@/stores/business.store.ts').then(m => m.useBusinessStore.getState().fetchBusinesses(true))} />
      <VoucherThresholdCard businessId={props.businessId} initialThreshold={props.voucherAdjustmentThreshold ?? 50000} isManagerOrOwner={props.isManagerOrOwner} onSaved={() => import('@/stores/business.store.ts').then(m => m.useBusinessStore.getState().fetchBusinesses(true))} />

      <form onSubmit={props.onSubmit} className='space-y-7'>
        {/* Basic information */}
        <Card title='Basic information' subtitle='Core identifying details'>
          <div className='grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2'>
            <Input
              label='Business name'
              value={props.bizName}
              onChange={(e) => props.setBizName(e.target.value)}
              required
            />
            <Input
              label='Owner name'
              value={props.ownerName}
              onChange={(e) => props.setOwnerName(e.target.value)}
              required
            />
            <FieldShell label='Business type' required>
              <Select
                value={props.bizType}
                onChange={(v) => props.setBizType(v)}
                required
              >
                <option value=''>Select type</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FieldShell>
            <Input
              label='Tax ID / TIN'
              value={props.taxId}
              onChange={(e) => props.setTaxId(e.target.value)}
              placeholder='Optional'
              maxLength={50}
            />
          </div>
        </Card>

        {/* Location */}
        <Card title='Location' subtitle='Where this business operates'>
          <div className='grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3'>
            <div className='sm:col-span-3'>
              <Input
                label='Address'
                value={props.address}
                onChange={(e) => props.setAddress(e.target.value)}
                placeholder='Street address (optional)'
              />
            </div>
            <Input
              label='City'
              value={props.city}
              onChange={(e) => props.setCity(e.target.value)}
              placeholder='e.g. Lagos'
            />
            <FieldShell label='State'>
              <Select value={props.state} onChange={(v) => props.setState(v)}>
                <option value=''>Select state</option>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FieldShell>
          </div>
        </Card>

        {/* Tax configuration */}
        <Card
          title='Tax configuration'
          subtitle='Anomaly detection and filing reminders'
        >
          <div className='grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2'>
            <FieldShell
              label='Expected profit margin'
              iconLeft={<Percent className='h-3.5 w-3.5 text-gray-400' />}
              hint='Used to detect anomalies in monthly numbers'
            >
              <div className='relative'>
                <input
                  type='number'
                  min={0}
                  max={100}
                  step={1}
                  value={props.profitMargin}
                  onChange={(e) =>
                    props.setProfitMargin(Number(e.target.value))
                  }
                  className={fieldInputClass + ' pr-9'}
                />
                <span className='absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-gray-400'>
                  %
                </span>
              </div>
            </FieldShell>
            <FieldShell
              label='Tax reminder day'
              iconLeft={<Calendar className='h-3.5 w-3.5 text-gray-400' />}
              hint='Day of month for filing reminders (1–28)'
            >
              <input
                type='number'
                min={1}
                max={28}
                value={props.taxReminderDay}
                onChange={(e) =>
                  props.setTaxReminderDay(Number(e.target.value))
                }
                className={fieldInputClass}
              />
            </FieldShell>
          </div>
        </Card>

        {/* Sticky save bar - editorial strip */}
        <div className='sticky bottom-0 z-10 -mx-4 sm:mx-0'>
          <div
            className={`mx-4 flex items-center justify-between gap-3 bg-white border-y px-5 py-3.5 backdrop-blur transition-all sm:mx-0 ${
              props.isDirty
                ? 'border-amber-400 bg-amber-50/90'
                : 'border-gray-200/80'
            }`}
          >
            <div className='flex items-center gap-2.5 text-[13px]'>
              {props.isDirty ? (
                <>
                  <span className='flex h-1.5 w-1.5 rounded-full bg-amber-500' />
                  <span className='text-amber-900 font-medium'>
                    Unsaved changes
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2
                    className='h-[15px] w-[15px] text-emerald-600'
                    strokeWidth={2}
                  />
                  <span className='text-gray-600'>Changes saved</span>
                </>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={props.onReset}
                disabled={!props.isDirty || props.savingBiz}
                className='px-3 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-gray-700'
              >
                Discard
              </button>
              <Button
                type='submit'
                size='sm'
                isLoading={props.savingBiz}
                disabled={!props.isDirty}
              >
                <Save className='h-3.5 w-3.5' />
                Save
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Security panel ────────────────────────────────────────

function SecurityPanel({
  user,
  isOwner,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  showCurrent,
  setShowCurrent,
  showNew,
  setShowNew,
  savingPw,
  onSubmit,
}: {
  user: any;
  isOwner: boolean;
  currentPassword: string;
  setCurrentPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showCurrent: boolean;
  setShowCurrent: (v: boolean) => void;
  showNew: boolean;
  setShowNew: (v: boolean) => void;
  savingPw: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  const checks = [
    { label: 'At least 8 characters', pass: newPassword.length >= 8 },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter', pass: /[a-z]/.test(newPassword) },
    { label: 'One number', pass: /\d/.test(newPassword) },
    {
      label: 'Passwords match',
      pass: newPassword.length > 0 && newPassword === confirmPassword,
    },
  ];

  // PIN Store
  const hasPin = usePinStore((s) => s.hasPin);
  const pinSetAt = usePinStore((s) => s.pinSetAt);
  const fetchStatus = usePinStore((s) => s.fetchStatus);
  const setupPin = usePinStore((s) => s.setupPin);
  const changePin = usePinStore((s) => s.changePin);
  const sessions = usePinStore((s) => s.sessions);
  const loadingSessions = usePinStore((s) => s.loadingSessions);
  const fetchSessions = usePinStore((s) => s.fetchSessions);
  const revokeSession = usePinStore((s) => s.revokeSession);
  const revokeOtherSessions = usePinStore((s) => s.revokeOtherSessions);

  // Setup PIN Form
  const [newPin, setNewPin] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  // Change PIN Form
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPinVal, setCurrentPinVal] = useState('');
  const [updatedPinVal, setUpdatedPinVal] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    if (isOwner) {
      fetchStatus();
    }
    fetchSessions();
  }, [isOwner]);

  const handleSetupPin = async (e: FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (!pinPassword) {
      toast.error('Account password is required');
      return;
    }
    setSavingPin(true);
    const ok = await setupPin(newPin, pinPassword);
    if (ok) {
      setNewPin('');
      setPinPassword('');
    }
    setSavingPin(false);
  };

  const handleChangePin = async (e: FormEvent) => {
    e.preventDefault();
    if (updatedPinVal.length !== 4) {
      toast.error('New PIN must be exactly 4 digits');
      return;
    }
    setChangingPin(true);
    const ok = await changePin(updatedPinVal, currentPinVal);
    if (ok) {
      setCurrentPinVal('');
      setUpdatedPinVal('');
      setShowChangePin(false);
    }
    setChangingPin(false);
  };

  return (
    <div className='space-y-6'>
      {/* ── Transaction PIN Card ────────────────────────────── */}
      {isOwner && (
        <Card
          title='4-Digit Transaction PIN'
          subtitle='Authorize tax payouts, settlement withdrawals, and sensitive financial mutations.'
        >
          <div className='p-6'>
            {hasPin ? (
              <div className='space-y-4'>
                <div className='flex items-center justify-between p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl'>
                  <div className='flex items-center gap-3'>
                    <div className='p-2 rounded-lg bg-emerald-100 text-emerald-700'>
                      <ShieldCheck className='h-5 w-5' />
                    </div>
                    <div>
                      <h4 className='text-xs font-bold text-emerald-950'>
                        Transaction PIN Active
                      </h4>
                      <p className='text-[11px] text-emerald-700 mt-0.5'>
                        Your financial mutations are protected with a 4-digit
                        bcrypt hash.
                        {pinSetAt
                          ? ` (Configured ${new Date(pinSetAt).toLocaleDateString('en-GB')})`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={() => setShowChangePin(!showChangePin)}
                    className='text-xs'
                  >
                    {showChangePin ? 'Cancel' : 'Change PIN'}
                  </Button>
                </div>

                {showChangePin && (
                  <form
                    onSubmit={handleChangePin}
                    className='p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3 animate-fade-in'
                  >
                    <h4 className='text-xs font-bold text-gray-900'>
                      Change Transaction PIN
                    </h4>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                      <div>
                        <label className='block text-[11px] font-semibold text-gray-600 mb-1'>
                          Current PIN
                        </label>
                        <Input
                          type='password'
                          inputMode='numeric'
                          pattern='[0-9]*'
                          maxLength={4}
                          placeholder='Current 4-digit PIN'
                          value={currentPinVal}
                          onChange={(e) =>
                            setCurrentPinVal(
                              e.target.value.replace(/\D/g, '').slice(0, 4),
                            )
                          }
                          required
                          className='text-xs tracking-widest font-mono'
                        />
                      </div>
                      <div>
                        <label className='block text-[11px] font-semibold text-gray-600 mb-1'>
                          New 4-Digit PIN
                        </label>
                        <Input
                          type='password'
                          inputMode='numeric'
                          pattern='[0-9]*'
                          maxLength={4}
                          placeholder='New 4-digit PIN'
                          value={updatedPinVal}
                          onChange={(e) =>
                            setUpdatedPinVal(
                              e.target.value.replace(/\D/g, '').slice(0, 4),
                            )
                          }
                          required
                          className='text-xs tracking-widest font-mono'
                        />
                      </div>
                    </div>
                    <div className='flex justify-end pt-1'>
                      <Button
                        type='submit'
                        size='sm'
                        isLoading={changingPin}
                        className='text-xs'
                      >
                        Update PIN
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-start gap-3 p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-800 text-xs'>
                  <AlertCircle className='h-4 w-4 shrink-0 text-amber-600 mt-0.5' />
                  <p>
                    You haven&apos;t configured a Transaction PIN yet. A 4-digit
                    PIN is required before initiating tax remittances or
                    modifying payout bank details.
                  </p>
                </div>

                <form
                  onSubmit={handleSetupPin}
                  className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl'
                >
                  <div>
                    <label className='block text-xs font-semibold text-gray-700 mb-1'>
                      New 4-Digit PIN
                    </label>
                    <Input
                      type='password'
                      inputMode='numeric'
                      pattern='[0-9]*'
                      maxLength={4}
                      placeholder='Enter 4 digits (e.g. 8492)'
                      value={newPin}
                      onChange={(e) =>
                        setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      required
                      className='text-xs tracking-widest font-mono'
                    />
                    <p className='text-[10px] text-gray-500 mt-1'>
                      Avoid simple digits like 0000 or 1234.
                    </p>
                  </div>
                  <div>
                    <label className='block text-xs font-semibold text-gray-700 mb-1'>
                      Account Password (Confirm Identity)
                    </label>
                    <Input
                      type='password'
                      placeholder='Enter login password'
                      value={pinPassword}
                      onChange={(e) => setPinPassword(e.target.value)}
                      required
                      className='text-xs'
                    />
                  </div>
                  <div className='sm:col-span-2 pt-1'>
                    <Button
                      type='submit'
                      size='sm'
                      isLoading={savingPin}
                      className='text-xs'
                    >
                      <ShieldCheck className='h-3.5 w-3.5' /> Configure
                      Transaction PIN
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Active Device Sessions Card ──────────────────────── */}
      <Card
        title='Active Device Sessions'
        subtitle='Manage active devices and remote logins for this account.'
        action={
          sessions.filter((s) => !s.isCurrent).length > 0 ? (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => revokeOtherSessions()}
              className='text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50'
            >
              <LogOut className='h-3.5 w-3.5' /> Log Out All Other Devices
            </Button>
          ) : undefined
        }
      >
        <div className='divide-y divide-gray-100'>
          {loadingSessions ? (
            <div className='p-6 text-center text-xs text-gray-500'>
              Loading active sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className='p-6 text-center text-xs text-gray-500'>
              No other active sessions detected.
            </div>
          ) : (
            sessions.map((s) => {
              const isMobile =
                s.deviceInfo?.includes('iOS') ||
                s.deviceInfo?.includes('Android');
              return (
                <div
                  key={s.id}
                  className='p-4 flex items-center justify-between gap-3'
                >
                  <div className='flex items-center gap-3'>
                    <div className='p-2 rounded-lg bg-gray-100 text-gray-600'>
                      {isMobile ? (
                        <Smartphone className='h-4 w-4' />
                      ) : (
                        <Laptop className='h-4 w-4' />
                      )}
                    </div>
                    <div>
                      <div className='flex items-center gap-2'>
                        <h4 className='text-xs font-bold text-gray-900'>
                          {s.deviceInfo || 'Browser Session'}
                        </h4>
                        {s.isCurrent && (
                          <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700'>
                            Current Device
                          </span>
                        )}
                      </div>
                      <p className='text-[11px] text-gray-500 mt-0.5'>
                        {s.ipAddress ? `IP: ${s.ipAddress} • ` : ''}
                        Last active:{' '}
                        {new Date(s.lastActiveAt).toLocaleString('en-GB')}
                      </p>
                    </div>
                  </div>

                  {!s.isCurrent && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => revokeSession(s.id)}
                      className='text-xs text-gray-500 hover:text-red-600'
                    >
                      <Trash2 className='h-3.5 w-3.5' /> Revoke
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Change Password Card ─────────────────────────────── */}
      <Card
        title='Change Password'
        subtitle="Choose a strong password you don't use anywhere else."
      >
        <form
          onSubmit={onSubmit}
          className='grid gap-5 px-6 pb-6 lg:grid-cols-[1fr_280px]'
        >
          <div className='space-y-3.5'>
            <PasswordField
              label='Current password'
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent(!showCurrent)}
              placeholder='Enter your current password'
            />
            <PasswordField
              label='New password'
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew(!showNew)}
              placeholder='At least 8 characters'
            />
            <Input
              label='Confirm new password'
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder='Re-enter the new password'
            />
            <div className='pt-1'>
              <Button type='submit' size='sm' isLoading={savingPw}>
                <KeyRound className='h-3.5 w-3.5' /> Update password
              </Button>
            </div>
          </div>

          {/* Live requirements */}
          <aside className='rounded-xl border border-gray-100 bg-gray-50/60 p-4'>
            <p className='text-[11px] font-semibold uppercase tracking-wider text-gray-500'>
              Password requirements
            </p>
            <ul className='mt-2.5 space-y-1.5'>
              {checks.map((c) => (
                <li
                  key={c.label}
                  className='flex items-center gap-2 text-[13px]'
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      c.pass
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {c.pass ? (
                      <Check className='h-2.5 w-2.5' strokeWidth={3} />
                    ) : null}
                  </span>
                  <span className={c.pass ? 'text-gray-700' : 'text-gray-500'}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </form>
      </Card>

      <Card
        title='Account Overview'
        subtitle='User registration & status metadata.'
      >
        <dl className='grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0'>
          <DetailRow
            icon={Mail}
            label='Signed in as'
            value={user?.email || '—'}
          />
          <DetailRow
            icon={Shield}
            label='Account status'
            value={user?.isActive ? 'Active' : 'Inactive'}
          />
        </dl>
      </Card>
    </div>
  );
}

// ─── Reusable bits ─────────────────────────────────────────

const fieldInputClass =
  'block w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[14px] text-gray-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-400';

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className='rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden'>
      {(title || action) && (
        <header className='flex items-start justify-between gap-4 border-l-[3px] border-l-gray-900 bg-gray-50/50 px-5 py-4'>
          <div className='min-w-0 max-w-md'>
            {title && (
              <h2 className='text-base font-semibold text-gray-900 tracking-tight leading-tight'>
                {title}
              </h2>
            )}
            {subtitle && (
              <p className='mt-1 text-[13px] text-gray-600 leading-relaxed'>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className='shrink-0 mt-0.5'>{action}</div>}
        </header>
      )}
      <div className={title ? 'pt-2' : 'pt-5'}>{children}</div>
    </section>
  );
}

function FieldShell({
  label,
  required,
  iconLeft,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  iconLeft?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-1.5'>
      <label className='flex items-center gap-1.5 text-sm font-medium text-gray-700'>
        {iconLeft}
        {label}
        {required && <span className='text-red-500'>*</span>}
      </label>
      {children}
      {hint && <p className='text-[11px] text-gray-500'>{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  required,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className='relative'>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={fieldInputClass + ' appearance-none pr-10'}
      >
        {children}
      </select>
      <ChevronDown className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div className='space-y-1.5'>
      <label className='block text-sm font-medium text-gray-700'>{label}</label>
      <div className='relative'>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          placeholder={placeholder}
          className={fieldInputClass + ' pr-10'}
        />
        <button
          type='button'
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className='absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600'
        >
          {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  capitalize,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className='flex items-start gap-3 bg-white px-5 py-4'>
      <Icon className='h-[15px] w-[15px] text-gray-400 mt-[3px] shrink-0' />
      <div className='min-w-0 flex-1'>
        <dt className='text-[11px] font-medium text-gray-500 tracking-wide uppercase leading-none'>
          {label}
        </dt>
        <dd
          className={`mt-1.5 truncate text-[13.5px] font-medium text-gray-900 ${
            capitalize ? 'capitalize' : ''
          }`}
          title={value}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

function Badge({
  tone,
  capitalize,
  children,
}: {
  tone: 'emerald' | 'red' | 'slate';
  capitalize?: boolean;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${capitalize ? 'capitalize' : ''}`}
    >
      {children}
    </span>
  );
}

function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <div className='mt-0.5 flex items-center gap-2'>
      <span className='font-mono text-[13.5px] font-semibold tabular-nums text-blue-900'>
        {text}
      </span>
      <button
        type='button'
        onClick={onCopy}
        className='rounded p-1 text-blue-600 transition-colors hover:bg-blue-100'
        aria-label='Copy account number'
      >
        {copied ? (
          <Check className='h-3.5 w-3.5' />
        ) : (
          <Copy className='h-3.5 w-3.5' />
        )}
      </button>
    </div>
  );
}
