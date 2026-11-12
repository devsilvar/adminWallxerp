import {
  generateNewSignupNotificationHtml,
  generateNewSignupNotificationText,
  generateNewSignupNotificationSubject,
} from '@/lib/email/templates/new-signup-notification';

const base = {
  userEmail: 'amaka@example.com',
  fullName: 'Amaka Obi',
  phone: '+2348012345678',
  userId: 'user-123',
  signedUpAt: '11 Nov 2026, 5:00 PM WAT',
  acquisitionSource: null,
};

describe('new-signup-notification template', () => {
  describe('subject', () => {
    it('uses fullName when present', () => {
      expect(generateNewSignupNotificationSubject(base)).toBe(
        'New WallX ERP account — Amaka Obi',
      );
    });

    it('falls back to email when fullName is null', () => {
      expect(
        generateNewSignupNotificationSubject({ ...base, fullName: null }),
      ).toBe('New WallX ERP account — amaka@example.com');
    });

    it('does not contain "Not provided" in the subject', () => {
      expect(
        generateNewSignupNotificationSubject({ ...base, fullName: null }),
      ).not.toContain('Not provided');
    });
  });

  describe('HTML output', () => {
    it('contains the user name in the banner', () => {
      const html = generateNewSignupNotificationHtml(base);
      expect(html).toContain('Amaka Obi');
    });

    it('escapes HTML in fullName', () => {
      const html = generateNewSignupNotificationHtml({
        ...base,
        fullName: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in other fields', () => {
      const html = generateNewSignupNotificationHtml({
        ...base,
        userEmail: 'evil<tag>@example.com',
        phone: '<b>+234123</b>',
        acquisitionSource: '<img src=x onerror=alert(1)>',
      });
      expect(html).not.toContain('<tag>');
      expect(html).not.toContain('<b>');
      expect(html).not.toContain('<img');
    });

    it('contains no <img tags', () => {
      const html = generateNewSignupNotificationHtml(base);
      expect(html).not.toMatch(/<img/i);
    });

    it('contains no external http links in body', () => {
      const html = generateNewSignupNotificationHtml(base);
      expect(html).not.toMatch(/href="http/i);
    });

    it('shows "Not provided" for missing fullName — in the row, not the subject', () => {
      const html = generateNewSignupNotificationHtml({ ...base, fullName: null });
      expect(html).toContain('Not provided');
    });
  });

  describe('text part', () => {
    it('is non-empty', () => {
      const text = generateNewSignupNotificationText(base);
      expect(text.length).toBeGreaterThan(20);
    });

    it('contains the email address', () => {
      const text = generateNewSignupNotificationText(base);
      expect(text).toContain('amaka@example.com');
    });

    it('contains the full name when provided', () => {
      const text = generateNewSignupNotificationText(base);
      expect(text).toContain('Amaka Obi');
    });
  });
});
