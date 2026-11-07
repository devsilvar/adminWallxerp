import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', { email: unverifiedEmail });
      toast.success('Verification email sent! Please check your inbox.');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      // Fetch user to determine redirect — this portal is staff-only.
      // Admins must use /admin/login. We enforce it here so an admin
      // who accidentally types their admin creds into the staff form
      // doesn't silently land in /admin and think the portals are mixed.
      const { data } = await api.get('/auth/me');
      const user = data.data;
      if (user.role === 'admin') {
        useAuthStore.getState().logout();
        const adminUrl = import.meta.env.VITE_ADMIN_URL || 'https://admin.paymytax.ng';
        toast.error('Admin accounts must sign in via the Admin Portal.');
        window.location.replace(`${adminUrl}/admin/login`);
        return;
      }
      useAuthStore.setState({ user });
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      const code = err.response?.data?.error?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email);
        toast.error('Please verify your email address before signing in');
      } else {
        toast.error(err.response?.data?.error?.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
        <p className="mt-2 font-body text-[15px] text-gray-500">
          Sign in to your account to continue
        </p>
      </div>

      {unverifiedEmail && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">Email Verification Required</h3>
              <p className="mt-1 text-xs text-amber-700 leading-relaxed font-body">
                Your account ({unverifiedEmail}) has not been verified yet. Please check your inbox for your activation link.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="inline-flex items-center text-xs font-semibold text-amber-800 hover:text-amber-950 underline transition-colors disabled:opacity-50"
                >
                  {isResending ? 'Sending link...' : 'Resend verification link'}
                </button>
                <span className="text-amber-300">•</span>
                <Link
                  to={`/verify-email-pending?email=${encodeURIComponent(unverifiedEmail)}`}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 underline transition-colors"
                >
                  View instructions
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}


      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <div>
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={2.5} /> : <Eye className="h-5 w-5" strokeWidth={2.5} />}
            </button>
          </div>
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="font-body text-sm font-medium text-primary-600 hover:text-primary-500 transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" isLoading={isLoading} className="w-full py-3 text-[15px] rounded-full">
          Sign in
          {!isLoading && <ArrowRight className="h-4.5 w-4.5 ml-2" strokeWidth={2.5} />}
        </Button>
      </form>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <p className="text-center font-body text-[15px] text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-500 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
