import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store.ts';
import api from '@/lib/axios';

const SNOOZE_DURATION_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

const KEY_SNOOZED_UNTIL = 'wallx_review_snoozed_until';

export function useReviewPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [serverEligibility, setServerEligibility] = useState<{
    eligible: boolean;
    delaySeconds: number;
  } | null>(null);

  const sessionStartTimeRef = useRef<number>(Date.now());

  // 1. Fetch server eligibility once authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setServerEligibility(null);
      return;
    }

    let isMounted = true;
    api
      .get('/feedback/prompt-eligibility')
      .then((res) => {
        if (isMounted && res.data?.data) {
          setServerEligibility(res.data.data);
        }
      })
      .catch(() => {
        // Non-blocking: if network fails, gracefully degrade
        if (isMounted) setServerEligibility({ eligible: false, delaySeconds: 0 });
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const checkEligibility = useCallback(() => {
    if (!isAuthenticated) return false;

    // Check if development/testing override is requested (?test_review=true or localStorage flag)
    const isTestOverride =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('test_review') === 'true' ||
        localStorage.getItem('wallx_test_review') === 'true');

    if (isTestOverride) {
      return true;
    }

    // Must have affirmative server eligibility
    if (!serverEligibility || !serverEligibility.eligible) {
      return false;
    }

    // Check snooze timestamp
    const snoozedUntil = localStorage.getItem(KEY_SNOOZED_UNTIL);
    if (snoozedUntil) {
      const parsedSnooze = parseInt(snoozedUntil, 10);
      if (!Number.isNaN(parsedSnooze) && parsedSnooze > Date.now()) {
        return false;
      }
    }

    // Check session duration delay (e.g. 150 seconds = 2.5 minutes)
    const requiredDelayMs = (serverEligibility.delaySeconds || 150) * 1000;
    const sessionElapsedMs = Date.now() - sessionStartTimeRef.current;
    if (sessionElapsedMs < requiredDelayMs) {
      return false;
    }

    // Anti-fatigue check 1: User is actively typing into an input/textarea/select
    const activeEl = document.activeElement;
    if (
      activeEl &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)
    ) {
      return false;
    }

    // Anti-fatigue check 2: Another modal is already open
    const hasOpenModal = Boolean(
      document.querySelector('[role="dialog"]') ||
        document.querySelector('.modal-open') ||
        document.querySelector('.chakra-modal__overlay'),
    );
    if (hasOpenModal) {
      return false;
    }

    return true;
  }, [isAuthenticated, serverEligibility]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Evaluate periodically every 10 seconds
    const evaluate = () => {
      if (checkEligibility()) {
        setIsOpen(true);
      }
    };

    evaluate();
    const interval = setInterval(evaluate, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkEligibility]);

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    // Snooze for 7 days
    try {
      localStorage.setItem(
        KEY_SNOOZED_UNTIL,
        (Date.now() + SNOOZE_DURATION_MS).toString(),
      );
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSubmitted = useCallback(() => {
    setIsOpen(false);
    try {
      localStorage.removeItem('wallx_test_review');
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    isOpen,
    dismiss: handleDismiss,
    markSubmitted: handleSubmitted,
  };
}
