import { useState, useEffect, useCallback } from 'react';
import { TRIAL_DAYS } from '@/config/subscription';

const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export interface TrialTimerState {
  hasStarted: boolean;
  isExpired: boolean;
  daysLeft: number;
  hoursLeft: number;
  minutesLeft: number;
  secondsLeft: number;
  formattedTime: string;
  percentRemaining: number;
  startTrial: () => void;
  startedAt: number | null;
  expiresAt: number | null;
}

/**
 * Backend-driven trial countdown.
 * Server is the clock: trialEndsAt comes from User.trialEndsAt (set on
 * register for free, or on admin Save Plan Changes for reset/paid).
 * No localStorage — survives logout, multi-device, and cannot be
 * manipulated. When trialEndsAt is null (logged-out or non-trial),
 * the timer stays hidden (hasStarted=false) per product spec.
 */
export function useTrialTimer(trialEndsAt?: string | null): TrialTimerState {
  const getStartedAt = useCallback((): number | null => {
    if (!trialEndsAt) return null;
    const end = new Date(trialEndsAt).getTime();
    if (Number.isNaN(end) || end <= 0) return null;
    return end - TRIAL_DURATION_MS;
  }, [trialEndsAt]);

  const getExpiresAt = useCallback((): number | null => {
    if (!trialEndsAt) return null;
    const end = new Date(trialEndsAt).getTime();
    if (Number.isNaN(end) || end <= 0) return null;
    return end;
  }, [trialEndsAt]);

  const [startedAt, setStartedAt] = useState<number | null>(getStartedAt);
  const [, setTick] = useState(0);

  useEffect(() => {
    setStartedAt(getStartedAt());
  }, [getStartedAt]);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const startTrial = useCallback(() => {
    // No-op: trial is now started by the server (register or admin Save).
    // Kept for backwards compatibility with callers that still invoke it.
  }, []);

  const expiresAt = getExpiresAt();

  if (!startedAt || !expiresAt) {
    return {
      hasStarted: false,
      isExpired: false,
      daysLeft: 30,
      hoursLeft: 0,
      minutesLeft: 0,
      secondsLeft: 0,
      formattedTime: '30 Days',
      percentRemaining: 100,
      startTrial,
      startedAt: null,
      expiresAt: null,
    };
  }

  const remainingMs = Math.max(0, expiresAt - Date.now());
  const isExpired = remainingMs <= 0;

  const daysLeft = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutesLeft = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const secondsLeft = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const percentRemaining = Math.max(
    0,
    Math.min(100, Math.round((remainingMs / TRIAL_DURATION_MS) * 100)),
  );

  const formattedTime = isExpired
    ? 'Expired'
    : daysLeft > 0
      ? `${daysLeft}d ${hoursLeft}h left`
      : `${hoursLeft}h ${minutesLeft}m left`;

  return {
    hasStarted: true,
    isExpired,
    daysLeft,
    hoursLeft,
    minutesLeft,
    secondsLeft,
    formattedTime,
    percentRemaining,
    startTrial,
    startedAt,
    expiresAt,
  };
}
