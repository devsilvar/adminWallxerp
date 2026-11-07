import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  subscriptionExempt?: boolean;
  children: ReactNode;
}

const variants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-primary-500',
  danger: 'bg-danger-600 text-white hover:bg-danger-500 focus:ring-danger-500',
  ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
  outline: 'bg-white text-primary-600 border-2 border-primary-600 hover:bg-primary-50 focus:ring-primary-500',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  subscriptionExempt,
  children,
  disabled,
  title,
  className = '',
  ...props
}: ButtonProps) {
  const sub = useSubscriptionStatus();
  const writesBlocked = !sub.canWrite && !!sub.expiresAt;
  const shouldGate = writesBlocked && !subscriptionExempt;

  const isDisabled = disabled || isLoading || shouldGate;
  const resolvedTitle = shouldGate ? 'Upgrade your plan to enable this action' : title;

  const roundedClass = className.includes('rounded-') ? '' : 'rounded-lg';

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 ${roundedClass} font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isDisabled}
      title={resolvedTitle}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
