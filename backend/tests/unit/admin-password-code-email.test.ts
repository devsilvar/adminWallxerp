import 'dotenv/config';
import {
  generateAdminPasswordCodeHtml,
  generateAdminPasswordCodeText,
  AdminPasswordCodeEmailData,
} from '../../src/lib/email/templates/admin-password-code';
import { dispatchAdminPasswordCodeEmail } from '../../src/services/email-dispatch.service';
import * as emailModule from '../../src/lib/email';
import prisma from '../../src/lib/prisma';

describe('Admin Password Code Email & Dispatcher — Phase 7 (qahunter.md RTM)', () => {
  const mockEmailData: AdminPasswordCodeEmailData = {
    code: '749201',
    expiryMinutes: 10,
    userEmail: 'richmond@wallx.co',
    requestIp: '197.210.65.12',
    requestUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    requestedAt: 'November 11, 2026 at 22:45 UTC',
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // REQ-EMAIL-01: HTML Security Invariants
  describe('generateAdminPasswordCodeHtml', () => {
    it('generates valid HTML containing all required metadata and security alert [positive]', () => {
      const html = generateAdminPasswordCodeHtml(mockEmailData);

      expect(html).toContain('WallX ERP');
      expect(html).toContain('Admin Password Change');
      expect(html).toContain('749201');
      expect(html).toContain('richmond@wallx.co');
      expect(html).toContain('197.210.65.12');
      expect(html).toContain('November 11, 2026 at 22:45 UTC');
      expect(html).toContain('If you did not request this, someone has access to an admin session. Report it to platform engineering immediately.');
    });

    it('CRITICAL SECURITY: code MUST NOT appear within the first 200 characters of the HTML [boundary]', () => {
      const html = generateAdminPasswordCodeHtml(mockEmailData);
      const first200 = html.slice(0, 200);

      expect(first200.includes(mockEmailData.code)).toBe(false);
      // Even check individual components of code
      expect(first200).not.toContain(mockEmailData.code);
    });
  });

  // REQ-EMAIL-02: Plain Text Fallback
  describe('generateAdminPasswordCodeText', () => {
    it('generates plain-text fallback containing the code and security details [positive]', () => {
      const text = generateAdminPasswordCodeText(mockEmailData);

      expect(text).toContain('749201');
      expect(text).toContain('richmond@wallx.co');
      expect(text).toContain('197.210.65.12');
      expect(text).toContain('If you did not request this, someone has access to an admin session');
    });
  });

  // REQ-EMAIL-03: Email Dispatcher Behavior & Invariants
  describe('dispatchAdminPasswordCodeEmail', () => {
    it('dispatches email with exact subject and without code in subject line [positive/security]', async () => {
      const sendEmailSpy = jest.spyOn(emailModule, 'sendEmail').mockResolvedValueOnce({
        id: 'msg-mock-123',
        delivered: true,
      });

      const admin = await prisma.user.findUnique({
        where: { email: 'richmond@wallx.co' },
      });
      if (!admin) throw new Error('Admin richmond@wallx.co must exist.');

      const result = await dispatchAdminPasswordCodeEmail(admin.id, '654321', {
        ip: '127.0.0.1',
        userAgent: 'JestTestRunner',
      });

      expect(result.delivered).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      const callArgs = sendEmailSpy.mock.calls[0][0];
      expect(callArgs.to).toBe('richmond@wallx.co');
      expect(callArgs.subject).toBe('WallX admin password change — verification code');
      // Subject line MUST NOT leak the code
      expect(callArgs.subject.includes('654321')).toBe(false);
      expect(callArgs.html).toContain('654321');
      expect(callArgs.text).toContain('654321');

      sendEmailSpy.mockRestore();
    });

    it('returns delivered: false when user is not found [negative]', async () => {
      const result = await dispatchAdminPasswordCodeEmail('00000000-0000-0000-0000-000000000000', '123456');
      expect(result.delivered).toBe(false);
    });

    it('catches sendEmail rejection gracefully and returns delivered: false without throwing [resilience]', async () => {
      const sendEmailSpy = jest.spyOn(emailModule, 'sendEmail').mockRejectedValueOnce(
        new Error('Resend network timeout')
      );

      const admin = await prisma.user.findUnique({
        where: { email: 'richmond@wallx.co' },
      });
      if (!admin) throw new Error('Admin richmond@wallx.co must exist.');

      const result = await dispatchAdminPasswordCodeEmail(admin.id, '123456');
      expect(result.delivered).toBe(false);

      sendEmailSpy.mockRestore();
    });
  });
});
