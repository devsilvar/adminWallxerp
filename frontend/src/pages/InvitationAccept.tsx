import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle,
  Shield,
  ArrowRight,
  Clock,
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  Building2,
  Mail,
  LogIn,
  LogOut,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useTeamStore } from '@/stores/team.store.ts';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';
import type { ValidateInviteResponse } from '@/types/index.ts';

const ROLE_LABELS: Record<
  string,
  { label: string; desc: string; color: string; bg: string; border: string }
> = {
  manager: {
    label: 'Manager',
    desc: 'Full operational access to record transactions, manage invoices, view tax reports, and invite team members.',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  sales_staff: {
    label: 'Sales Staff',
    desc: 'Record counter sales, issue invoices to customers, and verify counter bank transfers.',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  accountant: {
    label: 'Accountant',
    desc: 'Log deductible business expenses, reconcile invoices and debtor payments, and calculate tax reports.',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  viewer: {
    label: 'Viewer',
    desc: 'Read-only access to view business performance, statements, tax reports, and transaction history.',
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
};

function PasswordRuleChip({ met, label }: { met: boolean; label: string }) {
  return (
    <div className='flex items-center gap-1.5'>
      {met ? (
        <Check
          className='h-3.5 w-3.5 text-emerald-500 shrink-0'
          strokeWidth={2.5}
        />
      ) : (
        <X className='h-3.5 w-3.5 text-gray-300 shrink-0' strokeWidth={2.5} />
      )}
      <span
        className={`text-xs ${met ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}
      >
        {label}
      </span>
    </div>
  );
}

export default function InvitationAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenFromUrl = searchParams.get('token');
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const setAuthSession = useAuthStore((s) => s.setAuthSession);
  const businesses = useBusinessStore((s) => s.businesses);
  const fetchBusinesses = useBusinessStore((s) => s.fetchBusinesses);

  const {
    validateInviteToken,
    acceptOnboarding,
    acceptInvitation,
    declineInvitation,
    myInvitations,
    fetchMyInvitations,
    isLoading: isTeamStoreLoading,
  } = useTeamStore();

  const [submittingInviteId, setSubmittingInviteId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'decline' | null>(null);

  // State for token-based onboarding flow
  const [isValidating, setIsValidating] = useState(!!tokenFromUrl);
  const [isResolvingAuth, setIsResolvingAuth] = useState(false);
  const [inviteDetails, setInviteDetails] =
    useState<ValidateInviteResponse | null>(null);

  // Form inputs for new user onboarding
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Form inputs for inline sign-in (existing account)
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // General submission / processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processedSuccess, setProcessedSuccess] = useState<string | null>(null);

  // Password rules validation for new account
  const rules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
  };
  const allRulesMet = Object.values(rules).every(Boolean);

  // 1. Resolve Auth state on public route if token exists and isAuthenticated but user is null
  useEffect(() => {
    if (isAuthenticated && !user) {
      setIsResolvingAuth(true);
      fetchMe().finally(() => {
        setIsResolvingAuth(false);
      });
    }
  }, [isAuthenticated, user, fetchMe]);

  // 2. Validate token on mount
  useEffect(() => {
    if (!tokenFromUrl) {
      setIsValidating(false);
      if (isAuthenticated) {
        fetchMyInvitations();
      }
      return;
    }

    let isMounted = true;
    const runValidation = async () => {
      setIsValidating(true);
      try {
        const res = await validateInviteToken(tokenFromUrl);
        if (isMounted) {
          setInviteDetails(res);
          if (res.fullName) {
            setFullName(res.fullName);
          }
          // Intentionally do NOT auto-logout a previously-signed-in user
          // here. The previous version called useAuthStore.getState().logout()
          // when (res.valid && !res.accountExists && isAuthenticated) — i.e.
          // a different user was signed in on this browser. That logout
          // chain commonly hit the axios 401-refresh-failure path
          // (window.location.replace('/login')) and stripped the ?token=
          // query string mid-render, trapping the invitee on /login.
          //
          // Session isolation is now handled downstream: when
          // res.valid && isAuthenticated && a different email is signed in,
          // the rendering branch at line 750+ already shows an
          // "Account Mismatch" card with a "Sign Out & Switch Account"
          // button. Server-side acceptOnboardingInvite also validates
          // the token-embedded email against the new user, so a token
          // cannot be consumed by the wrong identity even if frontend
          // state machine misbehaves.
        }
      } catch (err: any) {
        if (isMounted) {
          setInviteDetails({
            valid: false,
            reason: err.response?.data?.error?.code || 'not_found',
          });
        }
      } finally {
        if (isMounted) {
          setIsValidating(false);
        }
      }
    };

    runValidation();
    return () => {
      isMounted = false;
    };
  }, [tokenFromUrl, validateInviteToken, isAuthenticated, fetchMyInvitations]);

  // Fallback automatic redirect once processedSuccess is activated
  useEffect(() => {
    if (processedSuccess) {
      const timer = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [processedSuccess, navigate]);

  // 4. Handle Onboarding Submission (New User Registration)
  const handleOnboardingSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!tokenFromUrl || !inviteDetails?.valid) return;

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!allRulesMet) {
      toast.error('Password does not meet security requirements');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await acceptOnboarding({
        token: tokenFromUrl,
        password,
      });

      // Synchronize session and active business
      setAuthSession(res.user, res.accessToken, res.refreshToken);
      localStorage.setItem('activeBusinessId', res.business.id);

      // Pre-seed business store so dashboard and ProtectedRoute have it immediately
      useBusinessStore.setState((state) => ({
        businesses: state.businesses.some((b) => b.id === res.business.id)
          ? state.businesses
          : [{ ...res.business, myRole: res.business.role } as any, ...state.businesses],
        activeBusiness: { ...res.business, myRole: res.business.role } as any,
        isLoading: false,
      }));

      toast.success(`Welcome to ${res.business.businessName}!`);
      setProcessedSuccess(res.business.businessName);

      // Fetch fresh businesses in background (isolated so it never blocks navigation)
      try {
        await fetchBusinesses(true);
      } catch (fetchErr) {
        console.warn('Background business fetch error during onboarding:', fetchErr);
      }

      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to complete registration',
      );
      setIsSubmitting(false);
    }
  };

  // 5. Handle Inline Sign-In for Existing Account
  const handleInlineLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteDetails?.email || !loginPassword) return;

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await login(inviteDetails.email, loginPassword);
      await fetchMe();
      setLoginPassword('');
      toast.success('Signed in successfully');

      // Seamlessly auto-accept invitation now that user is verified
      if (tokenFromUrl) {
        setIsSubmitting(true);
        try {
          const res = await acceptInvitation(tokenFromUrl);
          const bizId = res?.business?.id || inviteDetails?.business?.id;
          if (bizId) {
            localStorage.setItem('activeBusinessId', bizId);
          }
          const bizName =
            res?.business?.businessName ||
            inviteDetails?.business?.businessName ||
            'the business';
          toast.success(`Joined ${bizName}!`);
          setProcessedSuccess(bizName);

          if (bizId) {
            useBusinessStore.setState({
              activeBusiness: {
                id: bizId,
                businessName: bizName,
                myRole: (res as any)?.membership?.role || inviteDetails?.role || 'viewer',
              } as any,
              isLoading: false,
            });
          }

          try {
            await fetchBusinesses(true);
          } catch (bErr) {
            console.warn('Background business fetch error:', bErr);
          }

          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 1000);
          return;
        } catch (acceptErr: any) {
          const code = acceptErr.response?.data?.error?.code;
          const status = acceptErr.response?.status;
          if (code === 'ALREADY_MEMBER' || status === 409) {
            toast.success('You are already a member of this business!');
            await fetchBusinesses(true);
            navigate('/dashboard', { replace: true });
            return;
          }
          // If auto-accept failed with another error, reload businesses so manual card can display
          await fetchBusinesses(true);
        } finally {
          setIsSubmitting(false);
        }
      } else {
        await fetchBusinesses(true);
      }
    } catch (err: any) {
      const code = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message || 'Failed to sign in';
      if (code === 'EMAIL_NOT_VERIFIED') {
        setLoginError(
          'Your email address is not yet verified. Please verify your email first, then reopen this invitation link.',
        );
      } else {
        setLoginError(message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 6. Handle Accept for Existing User (1-Click)
  const handleAcceptExisting = async () => {
    if (!tokenFromUrl) return;
    setIsSubmitting(true);
    try {
      const res = await acceptInvitation(tokenFromUrl);
      const bizId = res?.business?.id || inviteDetails?.business?.id;
      if (bizId) {
        localStorage.setItem('activeBusinessId', bizId);
      }
      const bizName =
        res?.business?.businessName ||
        inviteDetails?.business?.businessName ||
        'the business';
      toast.success(`Joined ${bizName}!`);
      setProcessedSuccess(bizName);

      if (bizId) {
        useBusinessStore.setState({
          activeBusiness: {
            id: bizId,
            businessName: bizName,
            myRole: (res as any)?.membership?.role || inviteDetails?.role || 'viewer',
          } as any,
          isLoading: false,
        });
      }

      try {
        await fetchBusinesses(true);
        await fetchMe();
      } catch (err) {
        console.warn('Background business refresh error:', err);
      }

      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err: any) {
      const status = err.response?.status;
      const code = err.response?.data?.error?.code;
      if (code === 'ALREADY_MEMBER' || status === 409) {
        toast.success('You are already a member of this business!');
        await fetchBusinesses(true);
        await fetchMe();
        navigate('/dashboard', { replace: true });
        return;
      }
      toast.error(
        err.response?.data?.error?.message || 'Failed to accept invitation',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Handle Decline for Existing User
  const handleDeclineExisting = async () => {
    if (!tokenFromUrl) return;
    setIsSubmitting(true);
    try {
      await declineInvitation(tokenFromUrl);
      toast.success('Invitation declined');
      await fetchMe();
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to decline invitation',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Handle Accept by Invitation ID (from In-App Notifications / List)
  const handleAcceptByInvitationId = async (inv: any) => {
    setSubmittingInviteId(inv.id);
    setActionType('accept');
    try {
      const res = await acceptInvitation({ invitationId: inv.id });
      const bizId = res?.business?.id || inv.business?.id;
      if (bizId) {
        localStorage.setItem('activeBusinessId', bizId);
      }
      const bizName =
        res?.business?.businessName ||
        inv.business?.businessName ||
        'the business';
      toast.success(`Joined ${bizName}!`);
      setProcessedSuccess(bizName);

      if (bizId) {
        useBusinessStore.setState({
          activeBusiness: {
            id: bizId,
            businessName: bizName,
            myRole: (res as any)?.membership?.role || inv.role || 'viewer',
          } as any,
          isLoading: false,
        });
      }

      try {
        await fetchBusinesses(true);
        await fetchMe();
      } catch (err) {
        console.warn('Background business refresh error:', err);
      }

      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err: any) {
      const status = err.response?.status;
      const code = err.response?.data?.error?.code;
      if (code === 'ALREADY_MEMBER' || status === 409) {
        toast.success('You are already a member of this business!');
        await fetchBusinesses(true);
        await fetchMe();
        navigate('/dashboard', { replace: true });
        return;
      }
      toast.error(
        err.response?.data?.error?.message || 'Failed to accept invitation',
      );
    } finally {
      setSubmittingInviteId(null);
      setActionType(null);
    }
  };

  // 9. Handle Decline by Invitation ID (from In-App Notifications / List)
  const handleDeclineByInvitationId = async (invitationId: string) => {
    setSubmittingInviteId(invitationId);
    setActionType('decline');
    try {
      await declineInvitation({ invitationId });
      toast.success('Invitation declined');
      await fetchMe();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to decline invitation',
      );
    } finally {
      setSubmittingInviteId(null);
      setActionType(null);
    }
  };

  // ─── Global Success State (Applies to both token and in-app acceptance) ───
  if (processedSuccess) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md'>
          <div className='bg-white rounded-2xl p-8 border border-emerald-100 shadow-xl text-center space-y-4 animate-fade-in'>
            <div className='h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10'>
              <CheckCircle className='h-10 w-10' />
            </div>
            <h2 className='text-2xl font-extrabold text-gray-900 tracking-tight'>
              Welcome to {processedSuccess}!
            </h2>
            <p className='text-sm text-gray-600'>
              Your workspace access is configured. Directing you to your team
              workspace...
            </p>
            <div className='h-2 w-48 bg-emerald-100 rounded-full mx-auto overflow-hidden mt-2'>
              <div className='h-full bg-emerald-600 rounded-full animate-progress' />
            </div>
            <div className='pt-2'>
              <button
                type='button'
                onClick={() => navigate('/dashboard', { replace: true })}
                className='inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] transition-all shadow-sm cursor-pointer'
              >
                <span>Enter Dashboard Now</span>
                <ArrowRight className='h-3.5 w-3.5' />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Flow A: Token Provided in URL ──────────────────────────────

  if (tokenFromUrl) {
    // 1. Loading Skeleton
    if (isValidating || isResolvingAuth) {
      return (
        <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
          <div className='sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4'>
            <OptimizedLogo size='md' className='mx-auto h-10 animate-pulse' />
            <h2 className='text-xl font-bold text-gray-900'>
              Validating your invitation...
            </h2>
            <p className='text-xs text-gray-500'>
              Checking security credentials and workspace access
            </p>
            <div className='h-2 w-48 bg-gray-200 rounded-full mx-auto overflow-hidden'>
              <div className='h-full bg-primary-600 rounded-full animate-progress' />
            </div>
          </div>
        </div>
      );
    }

    // 3. Invalid / Expired / Revoked / Ineligible State
    if (!inviteDetails?.valid) {
      let title = 'Invitation Invalid';
      let description =
        'This invitation link is not valid or has already been used.';

      const targetBiz =
        inviteDetails?.business?.businessName || (inviteDetails as any)?.businessName;

      if (inviteDetails?.reason === 'already_member') {
        title = 'Already a Team Member';
        description = targetBiz
          ? `You are already an active team member of ${targetBiz}. You already have full access to this workspace.`
          : 'You are already an active member of this business workspace.';
      } else if (inviteDetails?.reason === 'account_not_eligible') {
        title = 'Account Not Eligible';
        description =
          "This account cannot join this business. Team members can belong to only one business owner's organization. Please contact the person who invited you.";
      } else if (inviteDetails?.reason === 'expired') {
        title = 'Invitation Expired';
        description =
          'This team invitation has expired (links are valid for 7 days). Please contact the business owner to resend your invitation.';
      } else if (inviteDetails?.reason === 'revoked') {
        title = 'Invitation Revoked';
        description =
          'This invitation was revoked by the business administrator. If you believe this is an error, please reach out to the business owner.';
      } else if (inviteDetails?.reason === 'already_used') {
        if (isAuthenticated) {
          title = 'Invitation Already Accepted';
          description = targetBiz
            ? `You have already accepted this invitation to join ${targetBiz}. Go to your dashboard to access your workspace.`
            : 'This invitation has already been accepted. You can return to your dashboard to access your workspace.';
        } else {
          title = 'Invitation Already Used';
          description = targetBiz
            ? `This invitation to join ${targetBiz} has already been accepted. Sign in to your account using your email and password.`
            : 'This invitation has already been accepted. You can sign in using your email and password.';
        }
      }

      return (
        <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
          <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
            <OptimizedLogo size='md' className='mx-auto h-9' />
          </div>

          <div className='mt-8 sm:mx-auto sm:w-full sm:max-w-md'>
            <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 text-center space-y-5'>
              <div className='h-14 w-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto ring-8 ring-rose-500/10'>
                <AlertTriangle className='h-7 w-7' />
              </div>
              <h2 className='text-xl font-bold text-gray-900'>{title}</h2>
              <p className='text-sm text-gray-600 leading-relaxed'>
                {description}
              </p>

              <div className='pt-2'>
                {isAuthenticated ? (
                  <Link
                    to='/dashboard'
                    className='w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-transparent rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm'
                  >
                    Go to Dashboard
                  </Link>
                ) : (
                  <Link
                    to='/login'
                    className='w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-transparent rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm'
                  >
                    Go to Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 4. Valid Invitation Flows
    const roleInfo =
      ROLE_LABELS[inviteDetails.role || 'viewer'] || ROLE_LABELS.viewer;

    // Sub-case A: Existing User Account Flow
    if (inviteDetails.accountExists) {
      // Branch 1: Logged in as the matching user
      const isEmailMatch =
        isAuthenticated &&
        user?.email &&
        inviteDetails.email &&
        user.email.toLowerCase().trim() ===
          inviteDetails.email.toLowerCase().trim();

      if (isEmailMatch) {
        const isFreeAgent =
          businesses.length === 0 && user?.isOwnerAccount !== false;

        return (
          <div className='min-h-screen bg-linear-to-b from-gray-50 to-primary-50/20 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
            <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
              <OptimizedLogo size='md' className='mx-auto h-9' />
              <div className='mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100'>
                <Building2 className='h-3.5 w-3.5' />
                <span>Invited by {inviteDetails.business?.businessName}</span>
              </div>
              <h2 className='mt-2 text-2xl font-extrabold text-gray-900 tracking-tight'>
                Join as {roleInfo.label}
              </h2>
              <p className='mt-1 text-xs text-gray-500'>
                Accept this invitation to join with your existing account.
              </p>
            </div>

            <div className='mt-6 sm:mx-auto sm:w-full sm:max-w-md'>
              <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 space-y-6'>
                {/* Role Capabilities Preview */}
                <div
                  className={`p-4 rounded-xl border ${roleInfo.bg} ${roleInfo.border} space-y-1`}
                >
                  <div className='flex items-center gap-2'>
                    <Shield className={`h-4 w-4 ${roleInfo.color}`} />
                    <span className={`text-xs font-bold ${roleInfo.color}`}>
                      {roleInfo.label} Role
                    </span>
                  </div>
                  <p className='text-xs text-gray-600 leading-relaxed'>
                    {roleInfo.desc}
                  </p>
                </div>

                {/* Free Agent Account Notice */}
                {isFreeAgent && (
                  <div className='p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 space-y-1 text-xs'>
                    <div className='flex items-center gap-1.5 font-semibold text-amber-800'>
                      <Info className='h-4 w-4 shrink-0 text-amber-600' />
                      <span>Account Notice</span>
                    </div>
                    <p className='leading-relaxed'>
                      Joining makes this a team-member account. You won't be
                      able to register your own businesses with this email.
                    </p>
                  </div>
                )}

                {/* Active Account Identity Card */}
                <div className='p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between'>
                  <div className='min-w-0'>
                    <p className='text-[11px] font-medium text-gray-400'>
                      Signed in as
                    </p>
                    <p className='text-xs font-semibold text-gray-800 truncate'>
                      {user?.email}
                    </p>
                  </div>
                  <span className='inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100'>
                    <Check className='h-3 w-3' /> Verified
                  </span>
                </div>

                {/* Action CTA Buttons */}
                <div className='space-y-2.5 pt-1'>
                  <button
                    type='button'
                    onClick={handleAcceptExisting}
                    disabled={isSubmitting}
                    className='w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm cursor-pointer'
                  >
                    {isSubmitting ? (
                      <>
                        <div className='h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                        <span>Accepting...</span>
                      </>
                    ) : (
                      <>
                        <span>Accept & Join Workspace</span>
                        <ArrowRight className='h-4 w-4' />
                      </>
                    )}
                  </button>

                  <button
                    type='button'
                    onClick={handleDeclineExisting}
                    disabled={isSubmitting}
                    className='w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 cursor-pointer'
                  >
                    Decline Invitation
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Branch 2: Logged in, but with a DIFFERENT email
      if (isAuthenticated && !isEmailMatch) {
        return (
          <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
            <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
              <OptimizedLogo size='md' className='mx-auto h-9' />
            </div>

            <div className='mt-8 sm:mx-auto sm:w-full sm:max-w-md'>
              <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 text-center space-y-5'>
                <div className='h-14 w-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto ring-8 ring-amber-500/10'>
                  <AlertTriangle className='h-7 w-7' />
                </div>
                <h2 className='text-xl font-bold text-gray-900'>
                  Account Mismatch
                </h2>
                <p className='text-sm text-gray-600 leading-relaxed'>
                  You are currently signed in as{' '}
                  <strong className='text-gray-900'>{user?.email}</strong>, but
                  this invitation was sent to{' '}
                  <strong className='text-primary-700'>
                    {inviteDetails.email}
                  </strong>
                  .
                </p>

                <div className='pt-2 space-y-2'>
                  <button
                    type='button'
                    onClick={() => logout()}
                    className='w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-transparent rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm cursor-pointer'
                  >
                    <LogOut className='h-4 w-4' />
                    <span>Sign Out & Switch Account</span>
                  </button>
                  <Link
                    to='/dashboard'
                    className='w-full flex items-center justify-center py-2 text-xs font-semibold text-gray-500 hover:text-gray-700'
                  >
                    Return to Dashboard
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Branch 3: Logged Out — Inline Sign-In Card
      return (
        <div className='min-h-screen bg-linear-to-b from-gray-50 to-primary-50/20 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
          <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
            <OptimizedLogo size='md' className='mx-auto h-9' />
            <div className='mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100'>
              <Building2 className='h-3.5 w-3.5' />
              <span>Invited by {inviteDetails.business?.businessName}</span>
            </div>
            <h2 className='mt-2 text-2xl font-extrabold text-gray-900 tracking-tight'>
              Sign In to Accept
            </h2>
            <p className='mt-1 text-xs text-gray-500'>
              An account already exists for {inviteDetails.email}. Sign in to
              join as {roleInfo.label}.
            </p>
          </div>

          <div className='mt-6 sm:mx-auto sm:w-full sm:max-w-md'>
            <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 space-y-6'>
              {/* Role Capabilities Preview */}
              <div
                className={`p-4 rounded-xl border ${roleInfo.bg} ${roleInfo.border} space-y-1`}
              >
                <div className='flex items-center gap-2'>
                  <Shield className={`h-4 w-4 ${roleInfo.color}`} />
                  <span className={`text-xs font-bold ${roleInfo.color}`}>
                    {roleInfo.label} Role
                  </span>
                </div>
                <p className='text-xs text-gray-600 leading-relaxed'>
                  {roleInfo.desc}
                </p>
              </div>

              {loginError && (
                <div className='p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2'>
                  <AlertTriangle className='h-4 w-4 text-rose-600 shrink-0 mt-0.5' />
                  <div className='leading-relaxed'>{loginError}</div>
                </div>
              )}

              <form onSubmit={handleInlineLogin} className='space-y-4'>
                {/* Read-Only Email Field */}
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Account Email
                  </label>
                  <div className='relative'>
                    <input
                      type='email'
                      value={inviteDetails.email || ''}
                      disabled
                      readOnly
                      className='w-full pl-9 pr-4 py-2.5 bg-gray-100/80 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 cursor-not-allowed select-none'
                    />
                    <Lock className='h-4 w-4 text-gray-400 absolute left-3 top-3' />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Password
                  </label>
                  <div className='relative'>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder='Enter your password'
                      required
                      className='w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-hidden'
                    />
                    <button
                      type='button'
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className='absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors'
                    >
                      {showLoginPassword ? (
                        <EyeOff className='h-4 w-4' />
                      ) : (
                        <Eye className='h-4 w-4' />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit CTA */}
                <div className='pt-2'>
                  <button
                    type='submit'
                    disabled={isLoggingIn || !loginPassword}
                    className='w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm cursor-pointer'
                  >
                    {isLoggingIn ? (
                      <>
                        <div className='h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className='h-4 w-4' />
                        <span>Sign In to Continue</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      );
    }

    // Sub-case B: Brand-New User Onboarding Form
    return (
      <div className='min-h-screen bg-linear-to-b from-gray-50 to-primary-50/20 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
          <OptimizedLogo size='md' className='mx-auto h-9' />
          <div className='mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100'>
            <Building2 className='h-3.5 w-3.5' />
            <span>Invited by {inviteDetails.business?.businessName}</span>
          </div>
          <h2 className='mt-2 text-2xl font-extrabold text-gray-900 tracking-tight'>
            Join as {roleInfo.label}
          </h2>
          <p className='mt-1 text-xs text-gray-500'>
            Set up your password below to immediately access your company
            workspace.
          </p>
        </div>

        <div className='mt-6 sm:mx-auto sm:w-full sm:max-w-md'>
          <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 space-y-6'>
            {/* Role Capabilities Preview */}
            <div
              className={`p-4 rounded-xl border ${roleInfo.bg} ${roleInfo.border} space-y-1`}
            >
              <div className='flex items-center gap-2'>
                <Shield className={`h-4 w-4 ${roleInfo.color}`} />
                <span className={`text-xs font-bold ${roleInfo.color}`}>
                  {roleInfo.label} Role
                </span>
              </div>
              <p className='text-xs text-gray-600 leading-relaxed'>
                {roleInfo.desc}
              </p>
            </div>

            <form onSubmit={handleOnboardingSubmit} className='space-y-4'>
              {/* Read-Only Email Field */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Email Address
                </label>
                <div className='relative'>
                  <input
                    type='email'
                    value={inviteDetails.email || ''}
                    disabled
                    readOnly
                    className='w-full pl-9 pr-4 py-2.5 bg-gray-100/80 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 cursor-not-allowed select-none'
                  />
                  <Lock className='h-4 w-4 text-gray-400 absolute left-3 top-3' />
                </div>
                <p className='mt-1 text-[11px] text-gray-400'>
                  This invitation is strictly linked to this email address.
                </p>
              </div>

              {/* Full Name Field (Pre-filled from invitation) */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Full Name
                </label>
                <div className='relative'>
                  <input
                    type='text'
                    value={fullName}
                    disabled
                    readOnly
                    placeholder='Not provided'
                    className='w-full pl-9 pr-4 py-2.5 bg-gray-100/80 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 cursor-not-allowed select-none'
                  />
                  <Lock className='h-4 w-4 text-gray-400 absolute left-3 top-3' />
                </div>
                <p className='mt-1 text-[11px] text-gray-400'>
                  Your name was set by the person who invited you. If it's
                  wrong, ask them to send a new invite.
                </p>
              </div>

              {/* Password Field */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Create Password
                </label>
                <div className='relative'>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder='Enter a secure password'
                    required
                    className='w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-hidden'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword(!showPassword)}
                    className='absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors'
                  >
                    {showPassword ? (
                      <EyeOff className='h-4 w-4' />
                    ) : (
                      <Eye className='h-4 w-4' />
                    )}
                  </button>
                </div>

                {/* Password Rule Chips */}
                {password.length > 0 && (
                  <div className='mt-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-2 gap-2 animate-fade-in'>
                    <PasswordRuleChip
                      met={rules.length}
                      label='8+ Characters'
                    />
                    <PasswordRuleChip
                      met={rules.uppercase}
                      label='Uppercase letter'
                    />
                    <PasswordRuleChip
                      met={rules.lowercase}
                      label='Lowercase letter'
                    />
                    <PasswordRuleChip met={rules.number} label='Number' />
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Confirm Password
                </label>
                <div className='relative'>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder='Repeat your password'
                    required
                    className='w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-hidden'
                  />
                  <button
                    type='button'
                    onClick={() => setShowConfirm(!showConfirm)}
                    className='absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors'
                  >
                    {showConfirm ? (
                      <EyeOff className='h-4 w-4' />
                    ) : (
                      <Eye className='h-4 w-4' />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <div className='pt-2'>
                <button
                  type='submit'
                  disabled={
                    isSubmitting || !allRulesMet || password !== confirmPassword
                  }
                  className='w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm cursor-pointer'
                >
                  {isSubmitting ? (
                    <>
                      <div className='h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account & Join Team</span>
                      <ArrowRight className='h-4 w-4' />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className='text-center pt-1 border-t border-gray-100'>
              <p className='text-[11px] text-gray-400'>
                By joining, your account is immediately verified with secure
                single-session access.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Flow B: No Token in URL (Direct Visit) ─────────────────────

  if (!isAuthenticated) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
          <OptimizedLogo size='md' className='mx-auto h-10' />
          <h2 className='mt-6 text-2xl font-extrabold text-gray-900 tracking-tight'>
            Team Invitations
          </h2>
          <p className='mt-2 text-sm text-gray-600'>
            Please sign in to your account to review and accept your pending team invitations.
          </p>
        </div>

        <div className='mt-8 sm:mx-auto sm:w-full sm:max-w-md'>
          <div className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 text-center space-y-4'>
            <div className='h-12 w-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mx-auto'>
              <Mail className='h-6 w-6' />
            </div>
            <p className='text-xs text-gray-500'>
              Have an existing account? Sign in below to access your workspace invitations.
            </p>
            <Link
              to='/login?redirect=/invite'
              className='w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-transparent rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm'
            >
              <LogIn className='h-4 w-4' />
              <span>Sign In to Review</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state for authenticated user
  if (isTeamStoreLoading && myInvitations.length === 0) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4'>
          <OptimizedLogo size='md' className='mx-auto h-10 animate-pulse' />
          <h2 className='text-xl font-bold text-gray-900'>
            Loading invitations...
          </h2>
          <p className='text-xs text-gray-500'>
            Fetching your pending team invitations
          </p>
          <div className='h-2 w-48 bg-gray-200 rounded-full mx-auto overflow-hidden'>
            <div className='h-full bg-primary-600 rounded-full animate-progress' />
          </div>
        </div>
      </div>
    );
  }

  // Empty state for authenticated user
  if (myInvitations.length === 0) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
          <OptimizedLogo size='md' className='mx-auto h-9' />
          <div className='mt-8 bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 text-center space-y-4'>
            <div className='h-12 w-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto'>
              <Clock className='h-6 w-6' />
            </div>
            <h2 className='text-lg font-bold text-gray-900'>
              No Pending Invitations
            </h2>
            <p className='text-xs text-gray-500'>
              You don't have any pending team invitations at this time. When a business invites you to collaborate, it will appear here.
            </p>
            <div className='pt-2'>
              <Link
                to='/dashboard'
                className='inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors'
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isFreeAgent =
    businesses.length === 0 && user?.isOwnerAccount !== false;

  // Authenticated user listing pending invitations with full action cards
  return (
    <div className='min-h-screen bg-linear-to-b from-gray-50 to-primary-50/20 py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-xl mx-auto space-y-6'>
        <div className='text-center'>
          <OptimizedLogo size='md' className='mx-auto h-9' />
          <div className='mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100'>
            <Clock className='h-3.5 w-3.5' />
            <span>
              Pending Team Invitation{myInvitations.length > 1 ? 's' : ''} ({myInvitations.length})
            </span>
          </div>
          <h1 className='mt-2 text-2xl font-extrabold text-gray-900 tracking-tight'>
            Review & Accept Invitations
          </h1>
          <p className='mt-1 text-xs text-gray-500'>
            You have been invited to join the following business workspace{myInvitations.length > 1 ? 's' : ''}.
          </p>
        </div>

        <div className='space-y-6'>
          {myInvitations.map((inv: any) => {
            const roleInfo =
              ROLE_LABELS[inv.role || 'viewer'] || ROLE_LABELS.viewer;
            const daysRemaining = Math.max(
              0,
              Math.ceil(
                (new Date(inv.expiresAt).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            const isProcessingThis = submittingInviteId === inv.id;
            const isAccepting = isProcessingThis && actionType === 'accept';
            const isDeclining = isProcessingThis && actionType === 'decline';

            return (
              <div
                key={inv.id}
                className='bg-white py-8 px-6 shadow-xl border border-gray-100 rounded-2xl sm:px-10 space-y-6 animate-fade-in'
              >
                {/* Business Header & Invited By */}
                <div className='flex items-center gap-3.5 pb-4 border-b border-gray-100'>
                  {inv.business?.logoUrl ? (
                    <img
                      src={inv.business.logoUrl}
                      alt={inv.business.businessName}
                      className='h-12 w-12 rounded-xl object-cover border border-gray-100'
                    />
                  ) : (
                    <div className='h-12 w-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center font-bold text-lg border border-primary-100'>
                      <Building2 className='h-6 w-6' />
                    </div>
                  )}
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <h3 className='text-base font-bold text-gray-900 truncate'>
                        {inv.business?.businessName || 'Business Workspace'}
                      </h3>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${roleInfo.bg} ${roleInfo.color} ${roleInfo.border}`}
                      >
                        {roleInfo.label}
                      </span>
                    </div>
                    {inv.business?.ownerName && (
                      <p className='text-xs text-gray-500 mt-0.5'>
                        Invited by <strong className='text-gray-700 font-medium'>{inv.business.ownerName}</strong>
                      </p>
                    )}
                  </div>
                </div>

                {/* Role Capabilities Preview */}
                <div
                  className={`p-4 rounded-xl border ${roleInfo.bg} ${roleInfo.border} space-y-1`}
                >
                  <div className='flex items-center gap-2'>
                    <Shield className={`h-4 w-4 ${roleInfo.color}`} />
                    <span className={`text-xs font-bold ${roleInfo.color}`}>
                      {roleInfo.label} Role Permissions
                    </span>
                  </div>
                  <p className='text-xs text-gray-600 leading-relaxed'>
                    {roleInfo.desc}
                  </p>
                </div>

                {/* Free Agent Account Notice */}
                {isFreeAgent && (
                  <div className='p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 space-y-1 text-xs'>
                    <div className='flex items-center gap-1.5 font-semibold text-amber-800'>
                      <Info className='h-4 w-4 shrink-0 text-amber-600' />
                      <span>Account Notice</span>
                    </div>
                    <p className='leading-relaxed'>
                      Joining makes this a team-member account. You won't be
                      able to register your own businesses with this email.
                    </p>
                  </div>
                )}

                {/* Active Account Identity Card */}
                <div className='p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs'>
                  <div className='min-w-0'>
                    <p className='text-[11px] font-medium text-gray-400'>
                      Signed in as
                    </p>
                    <p className='text-xs font-semibold text-gray-800 truncate'>
                      {user?.email}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100'>
                      <Check className='h-3 w-3' /> Verified
                    </span>
                    <span className='text-[11px] text-gray-400'>
                      Expires in {daysRemaining}d
                    </span>
                  </div>
                </div>

                {/* Action CTA Buttons */}
                <div className='space-y-2.5 pt-1'>
                  <button
                    type='button'
                    onClick={() => handleAcceptByInvitationId(inv)}
                    disabled={isSubmitting || submittingInviteId !== null}
                    className='w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm cursor-pointer'
                  >
                    {isAccepting ? (
                      <>
                        <div className='h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                        <span>Accepting...</span>
                      </>
                    ) : (
                      <>
                        <span>Accept & Join Workspace</span>
                        <ArrowRight className='h-4 w-4' />
                      </>
                    )}
                  </button>

                  <button
                    type='button'
                    onClick={() => handleDeclineByInvitationId(inv.id)}
                    disabled={isSubmitting || submittingInviteId !== null}
                    className='w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 cursor-pointer'
                  >
                    {isDeclining ? (
                      <>
                        <div className='h-3.5 w-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin' />
                        <span>Declining...</span>
                      </>
                    ) : (
                      <span>Decline Invitation</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className='text-center pt-2'>
          <Link
            to='/dashboard'
            className='text-xs font-semibold text-gray-500 hover:text-gray-700'
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
