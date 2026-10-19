import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as emailModule from '../../src/lib/email';
import * as invoiceService from '../../src/services/invoice.service';
import * as creditService from '../../src/services/credit.service';
import { sweepCreditReminders } from '../../src/services/reminder.service';

describe('Automated Email Notifications — Invoice Delivery & Credit Sales', () => {
  let userId: string;
  let businessId: string;
  let ownerEmail: string;
  const createdInvoiceIds: string[] = [];
  const createdCreditIds: string[] = [];
  const createdExtraUserIds: string[] = [];

  let sendEmailSpy: any;
  const capturedEmails: emailModule.SendEmailInput[] = [];

  async function waitForEmail(
    predicate: (email: emailModule.SendEmailInput) => boolean,
    timeoutMs = 20000,
  ): Promise<emailModule.SendEmailInput | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = capturedEmails.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 250));
    }
    return undefined;
  }

  beforeAll(async () => {
    ownerEmail = `biz-owner-${Date.now()}@paymytax.test`;
    const user = await createTestUser(ownerEmail);
    userId = user.id;

    const business = await createTestBusiness(userId, 'Automated Email Test SME');
    businessId = business.id;
  }, 60000);

  afterAll(async () => {
    try {
      if (createdInvoiceIds.length > 0) {
        await testDb.invoiceLine.deleteMany({
          where: { invoiceId: { in: createdInvoiceIds } },
        });
        await testDb.invoice.deleteMany({
          where: { id: { in: createdInvoiceIds } },
        });
      }
      if (createdCreditIds.length > 0) {
        await testDb.creditLineItem.deleteMany({
          where: { creditId: { in: createdCreditIds } },
        });
        await testDb.creditPayment.deleteMany({
          where: { creditId: { in: createdCreditIds } },
        });
        await testDb.customerCredit.deleteMany({
          where: { id: { in: createdCreditIds } },
        });
      }
      await testDb.salesTransaction.deleteMany({
        where: { businessId },
      });
      await testDb.reminder.deleteMany({
        where: { businessId },
      });
      await testDb.auditLog.deleteMany({
        where: { businessId },
      });
      await testDb.businessMember.deleteMany({
        where: { businessId },
      });
      await testDb.business.deleteMany({
        where: { id: businessId },
      });
      await testDb.user.deleteMany({
        where: { id: userId },
      });
      if (createdExtraUserIds.length > 0) {
        await testDb.user.deleteMany({
          where: { id: { in: createdExtraUserIds } },
        });
      }
    } catch {
      // Ignore cleanup errors
    } finally {
      await testDb.$disconnect();
    }
  }, 60000);

  beforeEach(() => {
    capturedEmails.length = 0;
    if (sendEmailSpy) sendEmailSpy.mockRestore();
    sendEmailSpy = jest.spyOn(emailModule, 'sendEmail').mockImplementation(async (input) => {
      capturedEmails.push(input);
      return { delivered: true, id: `mock-msg-${Date.now()}` };
    });
  });

  describe('1. Invoice Electronic Delivery via Email (sendInvoiceByEmail)', () => {
    test('REJECTS sending when invoice has no customer email (400 INVOICE_NO_EMAIL)', async () => {
      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Customer Without Email',
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [{ description: 'Consulting services', quantity: 1, unitPrice: 50000 }],
      });
      createdInvoiceIds.push(invoice.id);

      await expect(
        invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVOICE_NO_EMAIL',
        }),
      );

      expect(capturedEmails.length).toBe(0);
    });

    test('SUCCESSFULLY delivers invoice PDF to customer email and copy to business owner with frontend link', async () => {
      const customerEmail = 'client.recipient@example.com';
      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Alpha Client Ltd',
        customerEmail,
        customerPhone: '08012345678',
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [
          { description: 'Enterprise Tax Audit', quantity: 1, unitPrice: 150000 },
          { description: 'FIRS Filing Support', quantity: 2, unitPrice: 25000 },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      expect(invoice.status).toBe('draft');

      const result = await invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id);

      expect(result.delivered).toBe(true);
      expect(result.to).toBe(customerEmail);
      expect(result.invoice.status).toBe('sent');
      expect(result.invoice.sentAt).not.toBeNull();

      // Check emails sent: 1 to customer with PDF attachment, 1 confirmation to owner
      expect(capturedEmails.length).toBe(2);

      const customerEmailCall = capturedEmails.find((e) => e.to === customerEmail);
      expect(customerEmailCall).toBeDefined();
      expect(customerEmailCall?.subject).toContain(invoice.invoiceNumber);
      expect(customerEmailCall?.attachments?.length).toBe(1);
      expect(customerEmailCall?.attachments?.[0].filename).toBe(`${invoice.invoiceNumber}.pdf`);
      expect(customerEmailCall?.attachments?.[0].contentType).toBe('application/pdf');

      const ownerEmailCall = capturedEmails.find((e) => e.to === ownerEmail);
      expect(ownerEmailCall).toBeDefined();
      expect(ownerEmailCall?.subject).toContain('Invoice Sent');
      expect(ownerEmailCall?.subject).toContain(invoice.invoiceNumber);
      // Owner link must point to the frontend SPA route, not the backend API host
      expect(ownerEmailCall?.html).toContain(`/invoices/${invoice.id}`);
      expect(ownerEmailCall?.html).not.toContain(':3000/invoices');
    });

    test('ESCAPES HTML characters in customer name and lines in email html', async () => {
      const maliciousName = '<script>alert("xss")</script> Bad Actor';
      const maliciousEmail = 'xss.target@example.com';
      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: maliciousName,
        customerEmail: maliciousEmail,
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [{ description: 'Normal item', quantity: 1, unitPrice: 25000 }],
      });
      createdInvoiceIds.push(invoice.id);

      await invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id);

      const sentEmail = capturedEmails.find((e) => e.to === maliciousEmail);
      expect(sentEmail).toBeDefined();
      expect(sentEmail?.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(sentEmail?.html).not.toContain('<script>alert("xss")</script>');
    });

    test('RE-SENDING sent invoice is idempotent and preserves sent status', async () => {
      const customerEmail = 'beta.client@example.com';
      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Beta Client',
        customerEmail,
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [{ description: 'Support Pack', quantity: 1, unitPrice: 75000 }],
      });
      createdInvoiceIds.push(invoice.id);

      // First send
      await invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id);
      capturedEmails.length = 0;

      // Re-send
      const resendResult = await invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id);
      expect(resendResult.invoice.status).toBe('sent');
      expect(capturedEmails.length).toBe(2);
      expect(capturedEmails.some((e) => e.to === customerEmail)).toBe(true);
    });

    test('REJECTS sending when invoice is cancelled (409 INVOICE_CANCELLED)', async () => {
      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Cancelled Client',
        customerEmail: 'cancelled@client.com',
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [{ description: 'Item 1', quantity: 1, unitPrice: 20000 }],
      });
      createdInvoiceIds.push(invoice.id);

      await invoiceService.cancelInvoice(userId, businessId, invoice.id, { reason: 'Client revoked request' });

      await expect(
        invoiceService.sendInvoiceByEmail(userId, businessId, invoice.id),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 409,
          code: 'INVOICE_CANCELLED',
        }),
      );
    });

    test('REJECTS sending when user lacks invoices.send permission (403)', async () => {
      const viewerUser = await createTestUser(`viewer-${Date.now()}@paymytax.test`);
      createdExtraUserIds.push(viewerUser.id);
      await testDb.businessMember.create({
        data: {
          businessId,
          userId: viewerUser.id,
          role: 'viewer',
        },
      });

      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Viewer Test Client',
        customerEmail: 'viewer.test@example.com',
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-15'),
        lines: [{ description: 'Test', quantity: 1, unitPrice: 10000 }],
      });
      createdInvoiceIds.push(invoice.id);

      await expect(
        invoiceService.sendInvoiceByEmail(viewerUser.id, businessId, invoice.id),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 403,
        }),
      );
    });
  });

  describe('2. Automated Debtor Notification on Credit Sale (createCredit)', () => {
    test('DISPATCHES notification email to debtor with audit log when credit is created with customerEmail', async () => {
      const debtorEmail = 'debtor.purchase@example.com';

      const credit = await creditService.createCredit(userId, businessId, {
        customerName: 'Alhaji Musa Enterprises',
        customerEmail: debtorEmail,
        customerPhone: '08098765432',
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-31'),
        description: '30 Bags of Cement on 30-day credit',
        totalAmount: 180000,
        items: [
          { name: 'Dangote Cement 50kg', quantity: 30, unitPrice: 6000 },
        ],
      });
      createdCreditIds.push(credit.id);

      // Wait for asynchronous post-transaction email dispatch to resolve
      const debtorEmailCall = await waitForEmail((e) => e.to === debtorEmail);
      expect(debtorEmailCall).toBeDefined();
      expect(debtorEmailCall?.subject).toContain('Credit Purchase Confirmed');
      expect(debtorEmailCall?.html).toContain('Alhaji Musa Enterprises');
      expect(debtorEmailCall?.html).toContain('₦180,000.00');

      // Verify audit log row was written
      const auditLog = await testDb.auditLog.findFirst({
        where: {
          businessId,
          action: 'credit.debtor_notified',
          resourceId: credit.id,
        },
      });
      expect(auditLog).not.toBeNull();
      expect((auditLog?.newData as any)?.to).toBe(debtorEmail);
    });

    test('ESCAPES HTML in customer name and description in debtor confirmation email', async () => {
      const xssDebtorEmail = 'xss.debtor@example.com';
      const credit = await creditService.createCredit(userId, businessId, {
        customerName: '<img src=x onerror=alert(1)> Debtor',
        customerEmail: xssDebtorEmail,
        issueDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-31'),
        description: '<b>5 cartons</b> of juice',
        totalAmount: 50000,
      });
      createdCreditIds.push(credit.id);

      const debtorEmailCall = await waitForEmail((e) => e.to === xssDebtorEmail);
      expect(debtorEmailCall).toBeDefined();
      expect(debtorEmailCall?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(debtorEmailCall?.html).not.toContain('<img src=x onerror=alert(1)>');
      expect(debtorEmailCall?.html).toContain('&lt;b&gt;5 cartons&lt;/b&gt;');
      expect(debtorEmailCall?.html).not.toContain('<b>5 cartons</b>');
    });

    test('REJECTS credit creation when customerEmail is missing or invalid', async () => {
      await expect(
        creditService.createCredit(userId, businessId, {
          customerName: 'Cash-Flow Debtor No Email',
          issueDate: new Date('2026-10-01'),
          dueDate: new Date('2026-10-31'),
          totalAmount: 45000,
        } as any),
      ).rejects.toThrow('Customer email is required');

      await expect(
        creditService.createCredit(userId, businessId, {
          customerName: 'Invalid Email Debtor',
          customerEmail: 'notanemail',
          issueDate: new Date('2026-10-01'),
          dueDate: new Date('2026-10-31'),
          totalAmount: 45000,
        } as any),
      ).rejects.toThrow('Enter a valid email address');
    });
  });

  describe('3. Automated Credit Due Date Reminders Sweep', () => {
    test('SWEEPS overdue credit, creates in-app reminder, and enforces calendar-day cooldown', async () => {
      const debtorEmail = 'overdue.debtor@example.com';
      const pastDueDate = new Date('2026-09-15');

      const credit = await creditService.createCredit(userId, businessId, {
        customerName: 'Overdue Debtor Ltd',
        customerEmail: debtorEmail,
        issueDate: new Date('2026-09-01'),
        dueDate: pastDueDate,
        totalAmount: 95000,
      });
      createdCreditIds.push(credit.id);

      // Wait for credit creation email to complete first
      await waitForEmail((e) => e.to === debtorEmail && e.subject.includes('Credit Purchase Confirmed'));
      capturedEmails.length = 0;

      // 1. First credit reminders sweep: sends email and creates reminder
      const sweepResult = await sweepCreditReminders(businessId);

      expect(sweepResult.remindersCreated).toBeGreaterThanOrEqual(1);
      expect(sweepResult.emailsSent).toBeGreaterThanOrEqual(1);

      const reminderEmail = await waitForEmail((e) => e.to === debtorEmail && e.subject.includes('Payment Reminder'));
      expect(reminderEmail).toBeDefined();
      expect(reminderEmail?.subject).toContain('Payment Reminder');

      // Await owner alert from sweep 1 before testing sweep 2 cooldown
      await waitForEmail((e) => e.to === ownerEmail && e.subject.includes('Debtor Due Date Alert'));

      // 2. Second sweep on same calendar day: cooldown prevents duplicate send
      capturedEmails.length = 0;
      const secondSweepResult = await sweepCreditReminders(businessId);
      expect(secondSweepResult.emailsSent).toBe(0);
      expect(capturedEmails.length).toBe(0);
    });
  });
});
