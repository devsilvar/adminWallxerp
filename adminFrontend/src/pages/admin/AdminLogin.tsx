import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import Button from '@/components/ui/Button.tsx';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
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
    } catch (err: unknown) {
      const msg =
        err !== null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      toast.error(msg || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* hairline top bar */}
      <header className="sticky top-0 z-10 border-b border-hairline bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="WallX" className="h-7 w-7 rounded-md object-contain ring-1 ring-black/5" />
            <span className="text-[13px] font-semibold tracking-tight text-ink">WallXERP</span>
            <span className="hidden rounded-full border border-hairline bg-panel-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted sm:inline-flex">
              Admin
            </span>
          </Link>
          <a
            href="/"
            className="text-xs font-medium text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Back to site
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1120px] grid-cols-1 gap-0 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-12">
        {/* left — editorial */}
        <div className="order-2 lg:order-1">
          <div className="max-w-[560px] pt-2 lg:pt-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-panel-subtle px-2.5 py-1">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium tracking-wide text-ink-muted">Secure administration</span>
            </div>

            <h1 className="mt-5 font-sans text-[30px] font-semibold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[36px]">
              Operations,
              <br />
              <span className="font-normal tracking-[-0.02em] text-ink-muted">under control.</span>
            </h1>

            <p className="mt-4 max-w-[44ch] text-[14px] leading-6 text-ink-muted">
              Review businesses, verify inflows, reconcile withdrawals and audit every action. Sign in with your administrator account to continue.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { k: 'Audit', v: 'Every action logged' },
                { k: 'Verify', v: 'Inflows & withdrawals' },
                { k: 'Control', v: 'Users & businesses' },
              ].map((item) => (
                <div key={item.k} className="rounded-xl border border-hairline bg-panel p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-subtle">{item.k}</p>
                  <p className="mt-1 text-[12px] font-medium leading-snug text-ink">{item.v}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-100">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-ink">Protected & audited</p>
                <p className="text-[12px] leading-snug text-ink-muted">All admin sessions are short-lived and fully traceable.</p>
              </div>
            </div>

            <p className="mt-6 text-[11px] leading-5 text-ink-subtle">
              Need help? Contact platform engineering. This portal is restricted to WallX operators.
            </p>
          </div>
        </div>

        {/* right — sign-in card */}
        <div className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[420px] lg:ml-auto">
            <div className="rounded-2xl border border-hairline bg-white shadow-[0_8px_30px_rgba(15,17,21,0.06)]">
              <div className="border-b border-hairline px-6 py-5 sm:px-7">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl object-contain ring-1 ring-black/5" />
                  <div>
                    <h2 className="text-[14px] font-semibold tracking-tight text-ink">Admin sign in</h2>
                    <p className="text-[12px] text-ink-muted">Use your administrator credentials.</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6 sm:px-7">
                <div className="space-y-1.5">
                  <label htmlFor="admin-email" className="block text-xs font-medium text-ink">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                    <input
                      id="admin-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@wallx.ng"
                      required
                      autoComplete="email"
                      className="block w-full rounded-xl border border-hairline-strong bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="admin-password" className="block text-xs font-medium text-ink">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="block w-full rounded-xl border border-hairline-strong bg-white py-2.5 pl-9 pr-10 text-sm text-ink placeholder:text-ink-subtle focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-subtle hover:bg-panel-subtle hover:text-ink"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" isLoading={isLoading} className="mt-1 w-full justify-center rounded-xl bg-ink py-2.5 text-sm font-medium text-white hover:bg-black">
                  <span className="inline-flex items-center gap-1.5">
                    {isLoading ? 'Signing in…' : 'Sign in'}
                    {!isLoading && <ArrowRight className="h-4 w-4 opacity-70" />}
                  </span>
                </Button>

                <p className="pt-1 text-center text-[13px] text-ink-muted">
                  Not an admin?{' '}
                  <Link to="/login" className="font-medium text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
                    Customer login
                  </Link>
                </p>
              </form>

              <div className="rounded-b-2xl border-t border-hairline bg-panel-subtle px-6 py-3 sm:px-7">
                <p className="text-center text-[11px] text-ink-subtle">Protected · Role-checked · All actions are audited</p>
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] text-ink-subtle">WallXERP — FIRS-ready tax & ledger for Nigerian SMEs</p>
          </div>
        </div>
      </main>
    </div>
  );
}
