import type { ReactNode } from 'react';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const pill: Record<Tone, string> = {
  success: 'border-success-200 bg-success-50 text-success-700',
  danger: 'border-danger-200 bg-danger-50 text-danger-700',
  warning: 'border-warning-200 bg-warning-50 text-warning-700',
  info: 'border-info-200 bg-info-50 text-info-700',
  neutral: 'border-hairline bg-panel-subtle text-ink-muted',
};

const dot: Record<Tone, string> = {
  success: 'bg-success-600',
  danger: 'bg-danger-600',
  warning: 'bg-warning-600',
  info: 'bg-info-600',
  neutral: 'bg-ink-subtle',
};

/**
 * A configuration flag, not a live signal — the dot is deliberately static.
 * Animating it reads as "this is changing right now", which it isn't. Pass
 * `icon` only for genuinely in-flight work (a spinning transfer), and put the
 * animation on the icon rather than the pill.
 */
export default function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wider ${pill[tone]}`}
    >
      {icon ?? <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} aria-hidden='true' />}
      {children}
    </span>
  );
}