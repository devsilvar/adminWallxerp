import { useEffect, useState } from 'react';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';

/**
 * MaintenanceScreen
 * 
 * Full-screen maintenance mode overlay displayed when VITE_MAINTENANCE_MODE=true.
 * Features professional copywriting, animated status indicator, and reassuring messaging
 * to keep customers informed during backend service interruptions.
 */
export default function MaintenanceScreen() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-xl mx-auto text-center space-y-8">
        
        {/* Logo at top center */}
        <div className="flex justify-center mb-4">
          <OptimizedLogo size="xl" className="h-16 w-auto" />
        </div>

        {/* Animated Status Badge */}
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Maintenance in Progress
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight">
          We'll Be Right Back
        </h1>

        {/* Reassuring Message */}
        <div className="space-y-3 text-gray-600 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
          <p>
            We're performing essential maintenance to improve your experience. 
            Our team is working to restore full service as quickly as possible.
          </p>
          <p className="text-sm">
            <strong className="text-gray-900 font-medium">Your data is safe and secure.</strong> All transactions 
            remain protected during this brief downtime.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="py-6">
          <div className="flex items-center justify-center gap-3 text-gray-600 text-sm">
            <svg
              className="w-5 h-5 text-blue-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="font-medium">
              Working on it{dots}
            </span>
          </div>
        </div>

        {/* Contact Information */}
        <div className="pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-3">
            Need urgent assistance?
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs">
            <a
              href="mailto:support@wallx.ng"
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              support@wallx.ng
            </a>
            <span className="hidden sm:inline text-gray-300">•</span>
            <a
              href="https://twitter.com/wallxng"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
              @wallxng
            </a>
          </div>
        </div>

        {/* Footer Note */}
        <div className="pt-4 text-xs text-gray-400">
          Thank you for your patience and continued trust in WallX
        </div>
      </div>
    </div>
  );
}
