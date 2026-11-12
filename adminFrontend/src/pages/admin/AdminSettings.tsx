import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, User, Save, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';
import ChangeAdminPassword from '@/components/admin/ChangeAdminPassword.tsx';

type SettingsTab = 'security' | 'profile';

export default function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as SettingsTab) || 'security';

  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Profile form state — controlled with fallback to user.fullName
  const [fullNameOverride, setFullNameOverride] = useState<string | null>(null);
  const fullName = fullNameOverride ?? user?.fullName ?? '';

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const handleTabChange = (tab: SettingsTab) => {
    setSearchParams({ tab });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }

    setIsSavingProfile(true);
    setProfileSuccess(false);

    try {
      await api.patch('/auth/me', { fullName: fullName.trim() });
      await fetchMe();
      setFullNameOverride(null);
      setProfileSuccess(true);
      toast.success('Profile updated successfully');
      setTimeout(() => setProfileSuccess(false), 4000);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className='space-y-6 pb-12'>
      {/* Page Header */}
      <div>
        <div className='flex items-center gap-2'>
          <h1 className='text-xl font-bold tracking-tight text-ink sm:text-2xl'>
            Admin Settings
          </h1>
          <span className='rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800'>
            Administrator
          </span>
        </div>
        <p className='mt-1 text-xs text-ink-muted sm:text-sm'>
          Manage your administrator profile, security preferences, and authentication credentials.
        </p>
      </div>

      {/* Tabs navigation */}
      <div
        role='tablist'
        aria-label='Admin settings sections'
        className='flex items-center gap-1 border-b border-hairline'
      >
        <button
          type='button'
          role='tab'
          aria-selected={currentTab === 'security'}
          onClick={() => handleTabChange('security')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            currentTab === 'security'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-ink-muted hover:border-hairline hover:text-ink'
          }`}
        >
          <ShieldCheck className='h-4 w-4' />
          Security
        </button>

        <button
          type='button'
          role='tab'
          aria-selected={currentTab === 'profile'}
          onClick={() => handleTabChange('profile')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            currentTab === 'profile'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-ink-muted hover:border-hairline hover:text-ink'
          }`}
        >
          <User className='h-4 w-4' />
          Profile
        </button>
      </div>

      {/* Tab Panels */}
      {currentTab === 'security' && (
        <div className='space-y-6'>
          <ChangeAdminPassword />
        </div>
      )}

      {currentTab === 'profile' && (
        <div className='max-w-2xl rounded-panel border border-hairline bg-panel p-6 shadow-2xs'>
          <div className='flex items-center gap-3 border-b border-hairline pb-4'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600'>
              <User className='h-5 w-5' />
            </div>
            <div>
              <h2 className='text-base font-semibold text-ink'>Admin Profile Details</h2>
              <p className='text-xs text-ink-muted'>
                Review administrator identity and edit your platform display name.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className='mt-6 space-y-5'>
            {profileSuccess && (
              <div className='flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800'>
                <CheckCircle2 className='h-4 w-4 text-emerald-600' />
                <span>Profile updated successfully.</span>
              </div>
            )}

            <div className='space-y-4'>
              {/* Display Name */}
              <div>
                <label
                  htmlFor='admin-display-name'
                  className='block text-xs font-semibold text-ink'
                >
                  Full / Display Name
                </label>
                <input
                  id='admin-display-name'
                  type='text'
                  value={fullName}
                  onChange={(e) => setFullNameOverride(e.target.value)}
                  placeholder='e.g. Richmond WallX'
                  required
                  className='mt-1 w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2 text-xs text-ink transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
                />
              </div>

              {/* Email Address (Read-only) */}
              <div>
                <label
                  htmlFor='admin-email-readonly'
                  className='block text-xs font-semibold text-ink'
                >
                  Email Address
                </label>
                <input
                  id='admin-email-readonly'
                  type='email'
                  value={user?.email || 'admin@wallx.co'}
                  disabled
                  readOnly
                  className='mt-1 w-full cursor-not-allowed rounded-lg border border-hairline bg-panel-subtle px-3.5 py-2 text-xs text-ink-muted'
                />
                <p className='mt-1 text-[11px] text-ink-subtle'>
                  Email address cannot be changed directly as it serves as your root administrative
                  identity.
                </p>
              </div>

              {/* Administrative Role (Read-only) */}
              <div>
                <label className='block text-xs font-semibold text-ink'>Account Role</label>
                <div className='mt-1 flex items-center gap-2'>
                  <span className='inline-flex items-center rounded-md border border-hairline bg-panel-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink'>
                    {user?.role === 'admin' ? 'Super Administrator' : user?.role || 'Admin'}
                  </span>
                  <span className='text-[11px] text-ink-subtle'>
                    Full system access and compliance privileges
                  </span>
                </div>
              </div>
            </div>

            <div className='pt-2'>
              <Button
                type='submit'
                isLoading={isSavingProfile}
                disabled={isSavingProfile || !fullName.trim()}
              >
                <Save className='mr-1.5 h-4 w-4' />
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
