import { describe, test, expect } from '@jest/globals';
import { escapeHtml } from '../../src/lib/email/escape';

describe('HTML Entity Escaping Utility (escapeHtml)', () => {
  test('escapes special HTML characters (&, <, >, ", \')', () => {
    const raw = '<script>alert("XSS & attack")</script>\'test\'';
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; attack&quot;)&lt;/script&gt;&#39;test&#39;');
  });

  test('returns empty string for null, undefined, or empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  test('preserves safe characters and alphanumeric text untouched', () => {
    const safeText = 'Invoice INV-2026-001 for Alhaji Musa (₦150,000.00)';
    expect(escapeHtml(safeText)).toBe(safeText);
  });
});
