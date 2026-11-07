import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = '', noPadding, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-gray-200 bg-white shadow-sm ${noPadding ? '' : 'p-4 sm:p-6'} ${className}`}
    >
      {children}
    </div>
  );
}
