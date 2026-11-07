/**
 * Session lifetime helpers — client-side inactivity + absolute timeout.
 *
 * WallX is a finance app: a 7-day refresh token that silently renews makes the
 * session effectively immortal if we only validate JWTs. These timers bound it
 * on the client without a backend change.
 *
 * Two independent clocks:
 *  - Idle:      no user interaction for N minutes  -> force logout
 *  - Absolute:  wall-clock since login for H hours -> force logout
 *
 * Both survive hard reloads via localStorage so closing the laptop lid actually
 * counts as idle time. One tab's activity syncs to siblings via the `storage` event.
 *
 * Tune via Vite env — no code change needed:
 *  VITE_SESSION_IDLE_MINUTES  (default 30)
 *  VITE_SESSION_ABSOLUTE_HOURS (default 12)
 */

const IDLE_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES ?? 30);
const ABSOLUTE_HOURS = Number(import.meta.env.VITE_SESSION_ABSOLUTE_HOURS ?? 12);

export const SESSION_IDLE_MS = Math.max(5, IDLE_MINUTES) * 60 * 1000;
export const SESSION_ABSOLUTE_MS = Math.max(1, ABSOLUTE_HOURS) * 60 * 60 * 1000;

const KEY_LAST_ACTIVE = 'wallx_last_active_at';
const KEY_SESSION_STARTED = 'wallx_session_started_at';

function now(): number {
  return Date.now();
}

function readInt(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getLastActiveAt(): number | null {
  return readInt(KEY_LAST_ACTIVE);
}

export function getSessionStartedAt(): number | null {
  return readInt(KEY_SESSION_STARTED);
}

export function touchActivity(): void {
  try {
    localStorage.setItem(KEY_LAST_ACTIVE, String(now()));
  } catch {}
}

export function startSession(): void {
  const t = String(now());
  try {
    localStorage.setItem(KEY_SESSION_STARTED, t);
    localStorage.setItem(KEY_LAST_ACTIVE, t);
  } catch {}
}

export function clearSessionMeta(): void {
  try {
    localStorage.removeItem(KEY_LAST_ACTIVE);
    localStorage.removeItem(KEY_SESSION_STARTED);
  } catch {}
}

export function isIdleExpired(at: number = now()): boolean {
  const last = getLastActiveAt();
  if (last === null) return false;
  return at - last > SESSION_IDLE_MS;
}

export function isAbsoluteExpired(at: number = now()): boolean {
  const started = getSessionStartedAt();
  if (started === null) return false;
  return at - started > SESSION_ABSOLUTE_MS;
}

export function isSessionExpired(at: number = now()): boolean {
  return isIdleExpired(at) || isAbsoluteExpired(at);
}

/**
 * Legacy sessions (pre-this-feature) have a token but no timestamps.
 * Seed them so we don't instantly expire a valid user on first deploy.
 */
export function ensureSessionMetaSeeded(): void {
  const hasToken = !!localStorage.getItem('accessToken');
  if (!hasToken) return;
  if (getSessionStartedAt() === null || getLastActiveAt() === null) {
    startSession();
  }
}

export const SESSION_KEYS = {
  lastActive: KEY_LAST_ACTIVE,
  startedAt: KEY_SESSION_STARTED,
} as const;
