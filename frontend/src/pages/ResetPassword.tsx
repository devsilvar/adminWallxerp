import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import { ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

function calculatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  
  let score = 0;
  let label = 'Weak';
  let color = 'red';

  if (passedChecks >= 5) {
    score = 4;
    label = 'Very Strong';
    color = 'green';
  } else if (passedChecks >= 4) {
    score = 3;
    label = 'Strong';
    color = 'green';
  } else if (passedChecks >= 3) {
    score = 2;
    label = 'Fair';
    color = 'yellow';
  } else if (passedChecks >= 2) {
    score = 1;
    label = 'Weak';
    color = 'orange';
  }

  return { score, label, color, checks };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const strength = calculatePasswordStrength(newPassword);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setTokenValid(false);
      toast.error('Invalid reset link');
    } else {
      setToken(tokenParam);
      setTokenValid(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (strength.score < 2) {
      toast.error('Please choose a stronger password');
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post('/auth/reset-password', {
        token,
        newPassword,
      });

      toast.success(data.message || 'Password reset successful!');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 'Failed to reset password';
      
      if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
        setTokenValid(false);
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Invalid or missing token
  if (tokenValid === false) {
    return (
      <div>
        <div className="mb-8 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" strokeWidth={2} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Invalid or expired link</h2>
          <p className="mt-3 font-body text-[15px] text-gray-600 leading-relaxed">
            This password reset link is invalid or has expired. Reset links are only valid for 60 minutes.
          </p>
        </div>

        <div className="space-y-3">
          <Link to="/forgot-password">
            <Button className="w-full py-3 text-[15px] rounded-full">
              Request a new reset link
            </Button>
          </Link>

          <Link to="/login">
            <Button variant="outline" className="w-full py-3 text-[15px] rounded-full">
              Back to login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Create new password</h2>
        <p className="mt-2 font-body text-[15px] text-gray-500">
          Choose a strong password to secure your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* New Password */}
        <div>
          <div className="relative">
            <Input
              label="New password"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter your new password"
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <Eye className="h-5 w-5" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Password Strength Indicator */}
          {newPassword && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Password strength:</span>
                <span className={`text-xs font-semibold text-${strength.color}-600`}>
                  {strength.label}
                </span>
              </div>
              <div className="flex gap-1 mb-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i < strength.score
                        ? `bg-${strength.color}-500`
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              
              {/* Password Requirements Checklist */}
              <div className="space-y-1.5 text-xs">
                {Object.entries({
                  length: 'At least 8 characters',
                  uppercase: 'One uppercase letter',
                  lowercase: 'One lowercase letter',
                  number: 'One number',
                  special: 'One special character (!@#$%...)',
                }).map(([key, label]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 ${
                      strength.checks[key as keyof typeof strength.checks]
                        ? 'text-green-700'
                        : 'text-gray-500'
                    }`}
                  >
                    {strength.checks[key as keyof typeof strength.checks] ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.5} />
                    ) : (
                      <X className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.5} />
                    )}
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <div className="relative">
            <Input
              label="Confirm new password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <Eye className="h-5 w-5" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Password Match Indicator */}
          {confirmPassword && (
            <div className="mt-2">
              {newPassword === confirmPassword ? (
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  <span>Passwords match</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  <span>Passwords do not match</span>
                </div>
              )}
            </div>
          )}
        </div>

        <Button
          type="submit"
          isLoading={isLoading}
          disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword}
          className="w-full py-3 text-[15px] rounded-lg"
        >
          {isLoading ? 'Resetting password...' : 'Reset password'}
          {!isLoading && <ArrowRight className="h-4.5 w-4.5 ml-2" strokeWidth={2.5} />}
        </Button>
      </form>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <p className="text-center font-body text-[15px] text-gray-500">
          Remember your password?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-500 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
