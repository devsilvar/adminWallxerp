import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  message?: string;
  minHeight?: string;
}

/**
 * Lightweight page loading fallback for React.lazy() Suspense boundaries.
 * Used across the app to show loading state during route chunk downloads.
 * 
 * @param message - Loading text (default: "Loading...")
 * @param minHeight - Minimum container height (default: "min-h-[50vh]")
 */
export default function PageLoader({ 
  message = 'Loading...', 
  minHeight = 'min-h-[50vh]' 
}: PageLoaderProps) {
  return (
    <div 
      role="status" 
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-8 ${minHeight}`}
    >
      <Loader2 
        className="h-8 w-8 animate-spin text-primary-600 mb-3" 
        aria-hidden="true" 
      />
      <span className="text-sm font-medium text-gray-500 animate-pulse">
        {message}
      </span>
    </div>
  );
}
