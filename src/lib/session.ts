/**
 * Admin token storage.
 *
 * The admin portal deliberately uses sessionStorage, not localStorage:
 * closing the browser must end the session. The SME app uses localStorage
 * and is unaffected — it is a separate origin and a separate decision.
 */

const ACCESS = 'accessToken';
const REFRESH = 'refreshToken';

// One-time cleanup: earlier builds wrote tokens to localStorage. Drop them
// so a stale token cannot be picked up by anything that still reads there.
localStorage.removeItem(ACCESS);
localStorage.removeItem(REFRESH);

export const getAccessToken = (): string | null => sessionStorage.getItem(ACCESS);
export const getRefreshToken = (): string | null => sessionStorage.getItem(REFRESH);

export function setTokens(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS, accessToken);
  sessionStorage.setItem(REFRESH, refreshToken);
}

export function setAccessToken(accessToken: string): void {
  sessionStorage.setItem(ACCESS, accessToken);
}

export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY = 'admin:lastActivityAt';

export function touchActivity(): void {
  sessionStorage.setItem(LAST_ACTIVITY, String(Date.now()));
}

export function isIdleExpired(): boolean {
  const raw = sessionStorage.getItem(LAST_ACTIVITY);
  if (!raw) return false; // no marker yet — treat as active, the hook sets one
  return Date.now() - Number(raw) > ADMIN_IDLE_TIMEOUT_MS;
}

export function clearActivity(): void {
  sessionStorage.removeItem(LAST_ACTIVITY);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS);
  sessionStorage.removeItem(REFRESH);
  clearActivity();
}
