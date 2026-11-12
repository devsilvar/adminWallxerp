import type { LucideIcon } from 'lucide-react';
import Card from './Card.tsx';

/**
 * EmptyState — shown when a fetch succeeds but returns zero records.
 * Distinct from ErrorState: this means "no data yet", not "the request failed".
 */
export default function EmptyState({
  message,
  icon: Icon,
  className = '',
  children,
}: {
  message: string;
  icon: LucideIcon;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={`py-12 text-center ${className}`}>
      <Icon className="mx-auto h-10 w-10 text-gray-300" />
      <p className="mt-3 font-body text-sm text-gray-400">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}
