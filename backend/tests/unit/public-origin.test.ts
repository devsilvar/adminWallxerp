import { describe, it, expect } from '@jest/globals';
import config from '@/config';
import {
  allowedAppOrigins,
  buildVoucherVerifyUrl,
  resolveAppBaseUrl,
} from '@/lib/public-origin';

describe('public-origin — customer-facing link bases', () => {
  it('never emits a comma-separated URL as the app base', () => {
    // FRONTEND_URL is a CORS allowlist. Building a link from it wholesale
    // produced "http://localhost:5173,https://app.example.com/verify-voucher/…"
    // which no mail client can open — the original voucher-link bug.
    expect(config.publicUrls.appBase).not.toContain(',');
    expect(config.publicUrls.apiBase).not.toContain(',');
    expect(config.publicUrls.appBase).toMatch(/^https?:\/\//);
  });

  it('exposes only absolute http(s) origins from the allowlist', () => {
    const origins = allowedAppOrigins();
    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(origin).toMatch(/^https?:\/\/[^,\s]+$/);
      expect(origin.endsWith('/')).toBe(false);
    }
  });

  it('uses the caller origin when it is on the allowlist', () => {
    const [first] = allowedAppOrigins();
    expect(resolveAppBaseUrl(first)).toBe(first);
  });

  it('normalises a trailing slash on an allowlisted origin', () => {
    const [first] = allowedAppOrigins();
    expect(resolveAppBaseUrl(`${first}/`)).toBe(first);
  });

  it('falls back to the configured base for an unknown origin', () => {
    expect(resolveAppBaseUrl('https://attacker.example.com')).toBe(config.publicUrls.appBase);
    expect(resolveAppBaseUrl(null)).toBe(config.publicUrls.appBase);
    expect(resolveAppBaseUrl(undefined)).toBe(config.publicUrls.appBase);
  });

  it('builds the verification link the customer receives', () => {
    const origin = allowedAppOrigins()[0];
    const url = buildVoucherVerifyUrl(
      '8c661382-9afe-493e-b3f0-0718599121de',
      '8d16740845432f756abfec7a30e30508be56abfd6a71f25c2ed9e0abd26ff61f',
      origin,
    );
    expect(url).toBe(
      `${origin}/verify-voucher/8c661382-9afe-493e-b3f0-0718599121de?token=8d16740845432f756abfec7a30e30508be56abfd6a71f25c2ed9e0abd26ff61f`,
    );
    expect(url.startsWith('http') && url.includes(',')).toBe(false);
  });
});
