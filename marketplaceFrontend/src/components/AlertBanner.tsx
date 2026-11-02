import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  XCircle, 
  X,
  Zap,
  ArrowRight,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { useState } from 'react';

type AlertType = 'info' | 'success' | 'warning' | 'error' | 'tax' | 'action';

interface AlertBannerProps {
  type?: AlertType;
  title: string;
  description: string;
  actionText?: string;
  actionUrl?: string;
  onClose?: () => void;
  dismissible?: boolean;
  variant?: 'default' | 'gradient' | 'minimal' | 'bold';
}

const alertConfig = {
  info: {
    icon: Info,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-100',
    gradient: 'from-blue-500 to-cyan-500'
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/50',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-900 dark:text-green-100',
    gradient: 'from-green-500 to-emerald-500'
  },
  warning: {
    icon: AlertCircle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-900 dark:text-amber-100',
    gradient: 'from-amber-500 to-orange-500'
  },
  error: {
    icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-900 dark:text-red-100',
    gradient: 'from-red-500 to-rose-500'
  },
  tax: {
    icon: ShieldCheck,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-900 dark:text-purple-100',
    gradient: 'from-purple-500 to-indigo-500'
  },
  action: {
    icon: Zap,
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-950/50',
    border: 'border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-900 dark:text-indigo-100',
    gradient: 'from-indigo-500 to-blue-500'
  }
};

export default function AlertBanner({
  type = 'info',
  title,
  description,
  actionText,
  actionUrl,
  onClose,
  dismissible = true,
  variant = 'default'
}: AlertBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = alertConfig[type];
  const Icon = config.icon;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  // Variant: Default (Clean, Professional)
  if (variant === 'default') {
    return (
      <div className={`${config.bg} ${config.border} border-l-4 shadow-sm`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 ${config.iconBg} rounded-lg p-2`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-semibold ${config.text}`}>
                {title}
              </h3>
              <p className={`mt-1 text-sm ${config.text} opacity-80`}>
                {description}
              </p>
            </div>

            {/* Action Button */}
            {actionText && actionUrl && (
              <a
                href={actionUrl}
                className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all hover:scale-105 ${config.iconBg} ${config.iconColor} hover:shadow-md`}
              >
                {actionText}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}

            {/* Close Button */}
            {dismissible && (
              <button
                onClick={handleClose}
                className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 transition-opacity`}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Variant: Gradient (Modern, Eye-catching)
  if (variant === 'gradient') {
    return (
      <div className={`bg-gradient-to-r ${config.gradient} shadow-lg`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Icon with glow effect */}
            <div className="flex-shrink-0 bg-white/20 backdrop-blur-sm rounded-xl p-2.5 shadow-lg">
              <Icon className="h-5 w-5 text-white" />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {title}
              </h3>
              <p className="mt-1 text-sm text-white/90">
                {description}
              </p>
            </div>

            {/* Action Button */}
            {actionText && actionUrl && (
              <a
                href={actionUrl}
                className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-all hover:scale-105 shadow-md"
              >
                {actionText}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}

            {/* Close Button */}
            {dismissible && (
              <button
                onClick={handleClose}
                className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Variant: Minimal (Clean, Subtle)
  if (variant === 'minimal') {
    return (
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <Icon className={`h-5 w-5 flex-shrink-0 ${config.iconColor}`} />
            
            {/* Content */}
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{title}:</span>
              <span className="text-sm text-muted-foreground">{description}</span>
            </div>

            {/* Action Link */}
            {actionText && actionUrl && (
              <a
                href={actionUrl}
                className={`flex-shrink-0 text-sm font-medium ${config.iconColor} hover:underline inline-flex items-center gap-1`}
              >
                {actionText}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}

            {/* Close Button */}
            {dismissible && (
              <button
                onClick={handleClose}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Variant: Bold (Strong, Attention-grabbing)
  if (variant === 'bold') {
    return (
      <div className={`${config.bg} border-y-2 ${config.border}`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {/* Large Icon */}
            <div className={`flex-shrink-0 ${config.iconBg} rounded-2xl p-3 shadow-md`}>
              <Icon className={`h-6 w-6 ${config.iconColor}`} strokeWidth={2.5} />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className={`text-base font-bold ${config.text} tracking-tight`}>
                {title}
              </h3>
              <p className={`mt-0.5 text-sm ${config.text} opacity-75`}>
                {description}
              </p>
            </div>

            {/* Action Button */}
            {actionText && actionUrl && (
              <a
                href={actionUrl}
                className={`flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all hover:scale-105 shadow-md hover:shadow-lg bg-gradient-to-r ${config.gradient} text-white`}
              >
                <Zap className="h-4 w-4" />
                {actionText}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}

            {/* Close Button */}
            {dismissible && (
              <button
                onClick={handleClose}
                className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 transition-opacity`}
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
