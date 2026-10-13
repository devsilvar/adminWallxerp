import { AlertTriangle, type LucideIcon } from 'lucide-react';
import Card from './Card.tsx';
import Button from './Button.tsx';

/**
 * ErrorState — shown when a list/data fetch fails (network error, 5xx, etc).
 * Distinct from EmptyState: this means "the request failed", not "there's no data".
 */
export default function ErrorState({
  message,
  onRetry,
  icon: Icon = AlertTriangle,
  className = '',
}: {
  message: string;
  onRetry?: () => void;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={`border-red-200 bg-red-50 py-8 text-center ${className}`}>
      <Icon className="mx-auto h-8 w-8 text-red-300" />
      <p className="mt-3 font-body text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} className="mt-4">
          Retry
        </Button>
      )}
    </Card>
  );
}
