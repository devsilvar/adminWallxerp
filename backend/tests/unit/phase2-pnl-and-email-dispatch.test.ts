/**
 * Unit Tests for Phase 2 — Profit & Loss PDF Generator, Centralized Email Dispatcher, and Event Bus
 */

import { buildPnlStatementPdf } from '../../src/services/pdf/pnl-statement.pdf';
import * as emailModule from '../../src/lib/email';
import prisma from '../../src/lib/prisma';
import {
  maskAccountNumber,
  parseDeviceFromUserAgent,
  dispatchWithdrawalRequestedEmail,
  dispatchWithdrawalCompletedEmail,
  dispatchWithdrawalFailedEmail,
  dispatchWalletCreditAlertEmail,
  dispatchPaymentFailedEmail,
  dispatchAccountDeactivatedEmail,
  dispatchLoginAlertEmail,
  dispatchPasswordChangedEmail,
  dispatchPinAlertEmail,
  dispatchDebtorDueOwnerEmail,
  dispatchTaxDueDateEmail,
} from '../../src/services/email-dispatch.service';
import { eventBus, registerDomainEventListeners } from '../../src/core/events';

describe('Phase 2 — P&L PDF Builder, Email Dispatcher & Event Bus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Profit & Loss PDF Builder (buildPnlStatementPdf)', () => {
    it('generates a valid PDF buffer with revenue by channel and expenses by category', async () => {
      const buffer = await buildPnlStatementPdf({
        business: {
          businessName: 'Apex Logistics Ltd',
          merchantId: 'MRC-9941',
          ownerName: 'Oluwaseun Adeleke',
          taxId: 'TIN-23456789-0001',
          address: '14 Admiralty Way, Lekki Phase 1, Lagos',
        },
        periodLabel: 'September 2026',
        statementRef: 'PNL-MRC-9941-202609',
        revenue: {
          totalSales: 1450000,
          totalTransactions: 12,
          bySource: [
            { source: 'bank_transfer', label: 'Bank Transfer / DVA', count: 8, amount: 1100000 },
            { source: 'manual', label: 'Cash / Manual Entry', count: 4, amount: 350000 },
          ],
        },
        expenses: {
          totalExpenses: 730000,
          deductibleExpenses: 700000,
          nonDeductibleExpenses: 30000,
          totalEntries: 6,
          byCategory: [
            { category: 'inventory', label: 'Inventory & Stock Purchases', count: 3, amount: 500000 },
            { category: 'fuel', label: 'Fuel & Generator', count: 3, amount: 230000 },
          ],
        },
        summary: {
          grossProfit: 750000,
          netProfitAfterTax: 663750,
          profitMargin: 51.72,
          taxRate: 7.5,
          taxPayable: 56250,
          reportStatus: 'Finalized',
        },
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1500);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('generates a valid PDF buffer even when revenue and expenses are zero', async () => {
      const buffer = await buildPnlStatementPdf({
        business: {
          businessName: 'Zero Activity Venture',
          merchantId: 'MRC-0000',
          ownerName: 'Jane Doe',
          taxId: null,
        },
        periodLabel: 'January 2026',
        statementRef: 'PNL-MRC-0000-202601',
        revenue: {
          totalSales: 0,
          totalTransactions: 0,
          bySource: [],
        },
        expenses: {
          totalExpenses: 0,
          deductibleExpenses: 0,
          nonDeductibleExpenses: 0,
          totalEntries: 0,
          byCategory: [],
        },
        summary: {
          grossProfit: 0,
          netProfitAfterTax: 0,
          profitMargin: 0,
          taxRate: 7.5,
          taxPayable: 0,
          reportStatus: 'Live Snapshot',
        },
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('2. Dispatcher Formatting & Security Helpers', () => {
    it('masks bank account numbers properly', () => {
      expect(maskAccountNumber('0123456789')).toBe('•••• 6789');
      expect(maskAccountNumber('9876')).toBe('•••• 9876');
      expect(maskAccountNumber(null)).toBe('••••');
    });

    it('parses browser and OS from User-Agent header', () => {
      expect(
        parseDeviceFromUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
        ),
      ).toBe('Chrome on Windows');
      expect(
        parseDeviceFromUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        ),
      ).toBe('Safari on iOS');
      expect(parseDeviceFromUserAgent(undefined)).toBe('Web Browser');
    });
  });

  describe('3. Centralized Email Dispatch Service & Non-Blocking Error Boundaries', () => {
    const mockPayout = {
      id: 'payout-1',
      amount: 100000,
      fee: 50,
      netAmount: 99950,
      destinationBankName: 'GTBank',
      destinationAccountNum: '0123456789',
      destinationAccountName: 'APEX LOGISTICS',
      transferReference: 'WDR-TEST-001',
      status: 'processing',
      initiatedAt: new Date(),
      completedAt: new Date(),
      failureReason: 'Switch timeout',
      business: {
        businessName: 'Apex Logistics Ltd',
        ownerName: 'Oluwaseun Adeleke',
        user: { email: 'owner@apex.ng' },
      },
    };

    it('dispatches withdrawal requested, completed, and failed emails with WallX ERP branding', async () => {
      const sendSpy = jest
        .spyOn(emailModule, 'sendEmail')
        .mockResolvedValue({ delivered: true, id: 'msg-1' });
      jest
        .spyOn(prisma.settlementPayout, 'findUnique')
        .mockResolvedValue(mockPayout as any);

      await dispatchWithdrawalRequestedEmail('payout-1');
      await dispatchWithdrawalCompletedEmail('payout-1');
      await dispatchWithdrawalFailedEmail('payout-1', 'Bank switch error', false);

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sendSpy.mock.calls[0][0].subject).toContain('Withdrawal Requested');
      expect(sendSpy.mock.calls[1][0].subject).toContain('Withdrawal Completed');
      expect(sendSpy.mock.calls[2][0].subject).toContain('Withdrawal Unsuccessful');
      expect(sendSpy.mock.calls[2][0].html).toContain('•••• 6789');
    });

    it('dispatches wallet credit alert, payment failed, account deactivated, login, password, PIN, debtor, and tax due emails', async () => {
      const sendSpy = jest
        .spyOn(emailModule, 'sendEmail')
        .mockResolvedValue({ delivered: true, id: 'msg-2' });

      jest.spyOn(prisma.business, 'findFirst').mockResolvedValue({
        id: 'biz-1',
        businessName: 'Apex Logistics Ltd',
        ownerName: 'Oluwaseun Adeleke',
        virtualAccountNumber: '9901234567',
        virtualAccountBank: 'Wema Bank',
        user: { email: 'owner@apex.ng' },
      } as any);

      jest.spyOn(prisma.business, 'findUnique').mockResolvedValue({
        id: 'biz-1',
        businessName: 'Apex Logistics Ltd',
        ownerName: 'Oluwaseun Adeleke',
        user: { email: 'owner@apex.ng' },
      } as any);

      jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue({
        taxPayable: 42000,
      } as any);

      jest.spyOn(prisma.taxPayment, 'findUnique').mockResolvedValue({
        id: 'pay-1',
        taxReportId: 'rep-1',
        amountPaid: 42000,
        transactionReference: 'TAX-REF-1',
        taxReport: { taxMonth: new Date('2026-09-01T00:00:00Z') },
        business: {
          businessName: 'Apex Logistics Ltd',
          ownerName: 'Oluwaseun Adeleke',
          user: { email: 'owner@apex.ng' },
        },
      } as any);

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'usr-1',
        email: 'owner@apex.ng',
        businesses: [{ ownerName: 'Oluwaseun Adeleke', businessName: 'Apex Logistics Ltd' }],
      } as any);

      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue({
        id: 'cred-12345678',
        customerName: 'Chief Emeka',
        balance: 85000,
        dueDate: new Date('2026-10-15T00:00:00Z'),
        business: {
          businessName: 'Apex Logistics Ltd',
          ownerName: 'Oluwaseun Adeleke',
          virtualAccountNumber: '9901234567',
          virtualAccountBank: 'Wema Bank',
          user: { email: 'owner@apex.ng' },
        },
      } as any);

      await dispatchWalletCreditAlertEmail({
        accountNumber: '9901234567',
        amount: 150000,
        reference: 'DVA-1',
        payerName: 'Customer A',
      });
      await dispatchPaymentFailedEmail('pay-1', 'Card declined');
      await dispatchAccountDeactivatedEmail('usr-1', 'Audit check');
      await dispatchLoginAlertEmail('usr-1', '102.89.1.1', 'Chrome/128 Windows');
      await dispatchPasswordChangedEmail('usr-1', 'changed');
      await dispatchPinAlertEmail('usr-1', 'reset', '102.89.1.1');
      await dispatchDebtorDueOwnerEmail('cred-12345678');
      await dispatchTaxDueDateEmail('biz-1', 9, 2026, 'unpaid_tax');

      expect(sendSpy).toHaveBeenCalledTimes(8);
    });

    it('never throws even when sendEmail or database lookup rejects', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockRejectedValue(new Error('Simulated DB outage'));

      await expect(dispatchLoginAlertEmail('usr-1')).resolves.toBeUndefined();
      await expect(dispatchPasswordChangedEmail('usr-1', 'reset')).resolves.toBeUndefined();
      await expect(dispatchPinAlertEmail('usr-1', 'locked')).resolves.toBeUndefined();
    });
  });

  describe('4. Domain Event Bus Listeners Integration', () => {
    it('routes payout.completed and payout.failed events to email dispatcher', async () => {
      registerDomainEventListeners();
      const sendSpy = jest
        .spyOn(emailModule, 'sendEmail')
        .mockResolvedValue({ delivered: true, id: 'evt-1' });

      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue({
        id: 'payout-evt',
        amount: 50000,
        fee: 25,
        netAmount: 49975,
        destinationBankName: 'Access Bank',
        destinationAccountNum: '0011223344',
        destinationAccountName: 'APEX LOGISTICS',
        transferReference: 'WDR-EVT-001',
        status: 'completed',
        initiatedAt: new Date(),
        completedAt: new Date(),
        business: {
          businessName: 'Apex Logistics Ltd',
          ownerName: 'Oluwaseun Adeleke',
          user: { email: 'owner@apex.ng' },
        },
      } as any);

      eventBus.emit('payout.completed', {
        userId: 'usr-1',
        payoutId: 'payout-evt',
        amount: 50000,
        reference: 'WDR-EVT-001',
      });

      eventBus.emit('payout.failed', {
        userId: 'usr-1',
        payoutId: 'payout-evt',
        amount: 50000,
        reference: 'WDR-EVT-001',
        reason: 'Admin rejected',
        isRejection: true,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy.mock.calls[0][0].subject).toContain('Withdrawal Completed');
      expect(sendSpy.mock.calls[1][0].subject).toContain('Withdrawal Declined');
    });
  });
});
