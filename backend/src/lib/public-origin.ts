import { config } from '@/config';

const normalise = (url: string): string => url.trim().replace(/\/+$/, '');

/**
 * Frontend origins the staff app can legitimately be served from.
 * Mirrors the CORS allowlist so a link can never be minted for a host
 * we do not control.
 */
export function allowedAppOrigins(): string[] {
  return config.cors.frontendUrl
    .split(',')
    .map(normalise)
    .filter((u) => /^https?:\/\//i.test(u));
}

/**
 * Base URL for customer-facing frontend links embedded in emails.
 *
 * Prefers the origin the staff member is actually using (so a link created
 * from localhost points at localhost, and one created from a custom domain
 * points at that domain), but only when it is on the allowlist — an
 * attacker-supplied Origin header must not be able to repoint the link.
 */
export function resolveAppBaseUrl(origin?: string | null): string {
  const candidate = origin ? normalise(origin) : '';
  if (candidate && allowedAppOrigins().includes(candidate)) return candidate;
  return config.publicUrls.appBase;
}

export function buildVoucherVerifyUrl(
  requestId: string,
  token: string,
  origin?: string | null,
): string {
  return `${resolveAppBaseUrl(origin)}/verify-voucher/${requestId}?token=${encodeURIComponent(token)}`;
}
