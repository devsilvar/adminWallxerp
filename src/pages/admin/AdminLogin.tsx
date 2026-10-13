import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (isAuthenticated && user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      const { data } = await api.get('/auth/me');
      const me = data.data;
      if (me.role !== 'admin') {
        useAuthStore.getState().logout();
        toast.error('Access denied. Admin credentials required.');
        return;
      }
      useAuthStore.setState({ user: me });
      toast.success('Welcome, Admin');
      navigate('/admin');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080a] px-4 py-10">
      {/* senior minimal ambient — one radial, one glow. No grid, no sparkles. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(99,102,241,0.16),transparent_60%)]" />
        <div className="absolute -top-28 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        {/* brand — quiet, confident */}
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <Shield className="h-5 w-5 text-indigo-600" strokeWidth={2} />
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            WallXERP · Administration
          </p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-white">Admin Portal</h1>
          <p className="mt-1 text-[13px] text-white/50">Secure access for platform operators</p>
        </div>

        {/* card — simple, neat, cool */}
        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.8)_inset] sm:p-7">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Sign in</h2>
            <p className="mt-1 text-[13px] text-gray-500">Use your administrator credentials.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@paymytax.com"
                  required
                  autoComplete="email"
                  className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              isLoading={isLoading}
              className="mt-1 w-full justify-center rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-black"
            >
              <span className="inline-flex items-center gap-1.5">
                {isLoading ? 'Signing in…' : 'Sign in'}
                {!isLoading && <ArrowRight className="h-4 w-4 opacity-70" />}
              </span>
            </Button>

            <p className="pt-1 text-center text-[13px] text-gray-500">
              Not an admin?{' '}
              <Link to="/login" className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900">
                Customer login
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/30">Protected · All actions are audited</p>
      </div>
    </div>
  );
}
