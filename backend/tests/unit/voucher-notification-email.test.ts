/**
 * Unit Tests for Customer Voucher Notification Email & Dispatch
 *
 * Verifies:
 * 1. HTML & Text template generation for voucher creation, top-up, and change credit.
 * 2. Proper interpolation of card code, balance, store name, customer name, and security instructions.
 * 3. dispatchVoucherNotificationEmail behaves fire-and-forget without throwing errors.
 */

import {
  generateVoucherNotificationHtml,
  generateVoucherNotificationText,
  VoucherNotificationEmailData,
} from '../../src/lib/email/templates/voucher-notification';
import {
  dispatchVoucherNotificationEmail,
  DispatchVoucherNotificationInput,
} from '../../src/services/email-dispatch.service';
import * as emailModule from '../../src/lib/email';
import prisma from '../../src/lib/prisma';

jest.mock('../../src/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-voucher-mail-id' }),
}));

describe('Customer Voucher Notification Email Templates', () => {
  const sampleData: VoucherNotificationEmailData = {
    customerName: 'Amina Bello',
    businessName: 'Lekki Supermart',
    // cardCode retired  no longer rendered; kept optional for backward compat only
    cardCode: '918273',
    balanceFormatted: '₦5,000.00',
    actionType: 'created',
    customerPhone: '08012345678',
    businessPhone: '08099998888',
    notes: 'Loyalty member signup',
  };

  it('should generate valid HTML containing brand headers, customer name, and balance for created voucher (no voucher code)', () => {
    const html = generateVoucherNotificationHtml(sampleData);

    expect(html).toContain('Lekki Supermart');
    expect(html).toContain('Amina Bello');
    expect(html).not.toContain('Voucher Code');
    expect(html).not.toContain('918273');
    expect(html).toContain('₦5,000.00');
    expect(html).toContain('Voucher Ready');
    expect(html).toContain('How to Use Your Voucher');
    expect(html).toContain('08012345678');
  });

  it('should generate valid plain text with instructions and voucher details (no voucher code, name-based lookup)', () => {
    const text = generateVoucherNotificationText(sampleData);

    expect(text).toContain('STORE VOUCHER CREATED - LEKKI SUPERMART');
    expect(text).toContain('Hello Amina Bello');
    expect(text).not.toContain('Voucher Code');
    expect(text).toContain('Available Balance: ₦5,000.00');
    expect(text).toContain('Give your name ("Amina Bello") at checkout');
  });

  it('should handle top_up and change_credit action types properly', () => {
    const topUpData: VoucherNotificationEmailData = {
      ...sampleData,
      actionType: 'top_up',
      amountFormatted: '₦2,500.00',
    };
    const htmlTopUp = generateVoucherNotificationHtml(topUpData);
    expect(htmlTopUp).toContain('Balance Added');
    expect(htmlTopUp).toContain('+₦2,500.00 Credited');

    const changeData: VoucherNotificationEmailData = {
      ...sampleData,
      actionType: 'change_credit',
      amountFormatted: '₦350.00',
    };
    const htmlChange = generateVoucherNotificationHtml(changeData);
    expect(htmlChange).toContain('Change Saved');
    expect(htmlChange).toContain('+₦350.00 Change Saved');
  });
});

describe('dispatchVoucherNotificationEmail Service Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should dispatch email when customer email is passed in input', async () => {
    jest.spyOn(prisma.business, 'findUnique').mockResolvedValue({
      id: 'biz-1',
      businessName: 'Lekki Supermart',
      user: { phone: '08099998888' },
    } as any);

    const input: DispatchVoucherNotificationInput = {
      businessId: 'biz-1',
      customerId: 'cust-1',
      cardCode: '827162',
      balance: 1500,
      actionType: 'created',
      toEmail: 'customer@example.com',
      customerName: 'Chidi Okonkwo',
    };

    await dispatchVoucherNotificationEmail(input);

    expect(emailModule.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailModule.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Your Voucher is Ready: Lekki Supermart',
      })
    );
  });

  it('should query customer from database if toEmail is not provided', async () => {
    jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
      id: 'cust-2',
      name: 'Fatima Aliyu',
      email: 'fatima@example.com',
      phone: '08022223333',
    } as any);

    jest.spyOn(prisma.business, 'findUnique').mockResolvedValue({
      id: 'biz-1',
      businessName: 'Lekki Supermart',
      user: { phone: '08099998888' },
    } as any);

    const input: DispatchVoucherNotificationInput = {
      businessId: 'biz-1',
      customerId: 'cust-2',
      cardCode: '554433',
      balance: 300,
      actionType: 'change_credit',
      amount: 300,
    };

    await dispatchVoucherNotificationEmail(input);

    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'cust-2' },
      select: { email: true, name: true, phone: true },
    });
    expect(emailModule.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailModule.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fatima@example.com',
        subject: 'Change Saved to Your Voucher: Lekki Supermart',
      })
    );
  });

  it('should silently exit without error if customer has no email address', async () => {
    jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
      id: 'cust-3',
      name: 'Walk-in Customer',
      email: null,
      phone: '08055554444',
    } as any);

    const input: DispatchVoucherNotificationInput = {
      businessId: 'biz-1',
      customerId: 'cust-3',
      cardCode: '998877',
      balance: 0,
      actionType: 'created',
    };

    await expect(dispatchVoucherNotificationEmail(input)).resolves.not.toThrow();
    expect(emailModule.sendEmail).not.toHaveBeenCalled();
  });
});
