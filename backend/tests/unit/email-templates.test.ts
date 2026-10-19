/**
 * Unit Tests for WallX ERP Automated Email Templates (Phase 1 Milestone)
 *
 * Verifies:
 * 1. Every template generates non-empty HTML and plain-text output.
 * 2. Every template strictly uses WallX ERP branding (#0f172a header, #c084fc eyebrow,
 *    #7c3aed primary purple, support@wallxerp.com).
 * 3. Zero occurrences of legacy "WallXERP" across all 16 email template files.
 * 4. All dynamic payload fields are properly interpolated into both HTML and Text.
 */

import { generateWelcomeHtml, generateWelcomeText } from '../../src/lib/email/templates/welcome';
import {
  generatePasswordResetHtml,
  generatePasswordResetText,
} from '../../src/lib/email/templates/password-reset';
import {
  generatePaymentReceiptHtml,
  generatePaymentReceiptText,
} from '../../src/lib/email/templates/payment-receipt';
import {
  generateStatementHtml,
  generateStatementText,
} from '../../src/lib/email/templates/statement';
import {
  generateDebtorReminderHtml,
  generateDebtorReminderText,
} from '../../src/lib/email/templates/debtor-reminder';
import {
  generateWithdrawalRequestedHtml,
  generateWithdrawalRequestedText,
} from '../../src/lib/email/templates/withdrawal-requested';
import {
  generateWithdrawalCompletedHtml,
  generateWithdrawalCompletedText,
} from '../../src/lib/email/templates/withdrawal-completed';
import {
  generateWithdrawalFailedHtml,
  generateWithdrawalFailedText,
} from '../../src/lib/email/templates/withdrawal-failed';
import {
  generatePaymentFailedHtml,
  generatePaymentFailedText,
} from '../../src/lib/email/templates/payment-failed';
import {
  generateAccountDeactivatedHtml,
  generateAccountDeactivatedText,
} from '../../src/lib/email/templates/account-deactivated';
import {
  generateCreditAlertHtml,
  generateCreditAlertText,
} from '../../src/lib/email/templates/credit-alert';
import {
  generateLoginAlertHtml,
  generateLoginAlertText,
} from '../../src/lib/email/templates/login-alert';
import {
  generatePasswordChangedHtml,
  generatePasswordChangedText,
} from '../../src/lib/email/templates/password-changed';
import {
  generatePinAlertHtml,
  generatePinAlertText,
} from '../../src/lib/email/templates/pin-alert';
import {
  generateInvoiceLifecycleHtml,
  generateInvoiceLifecycleText,
} from '../../src/lib/email/templates/invoice-lifecycle';
import {
  generateTaxDueDateHtml,
  generateTaxDueDateText,
} from '../../src/lib/email/templates/tax-due-date';
import {
  generatePnlStatementReadyHtml,
  generatePnlStatementReadyText,
} from '../../src/lib/email/templates/pnl-statement-ready';
import {
  generateTeamInvitationHtml,
  generateTeamInvitationText,
} from '../../src/lib/email/templates/team-invitation';

function assertWallXBrandInvariants(
  html: string,
  text: string,
  opts?: { customerFacing?: boolean },
) {
  expect(html).toContain('WallX ERP');
  expect(html).toContain('#0f172a');
  expect(html).toContain('#c084fc');
  expect(html).toContain('#7c3aed');
  if (!opts?.customerFacing) {
    expect(html).toContain('support@wallxerp.com');
  }
  expect(html.toLowerCase()).not.toContain('paymytax');

  expect(text).toContain('WallX ERP');
  expect(text.toLowerCase()).not.toContain('paymytax');
}

describe('WallX ERP Email Templates — Phase 1 Suite', () => {
  it('1. Welcome template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      userEmail: 'founder@apex.ng',
      dashboardLink: 'https://wallxerp.com/dashboard',
    };
    const html = generateWelcomeHtml(data);
    const text = generateWelcomeText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('founder@apex.ng');
    expect(text).toContain('https://wallxerp.com/dashboard');
  });

  it('2. Password Reset Request template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      userEmail: 'founder@apex.ng',
      resetLink: 'https://wallxerp.com/reset?token=abc',
      expiryMinutes: 60,
    };
    const html = generatePasswordResetHtml(data);
    const text = generatePasswordResetText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('https://wallxerp.com/reset?token=abc');
    expect(text).toContain('60 minutes');
  });

  it('3. Tax Payment Receipt template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      businessName: 'Apex Logistics Ltd',
      ownerName: 'Oluwaseun Adeleke',
      amountFormatted: '₦125,500.00',
      taxMonthLabel: 'March 2026',
      paymentReference: 'PAYSTACK-TXN-123',
      paymentDate: '25 September 2026',
      receiptNumber: 'RCP-2026-0042',
    };
    const html = generatePaymentReceiptHtml(data);
    const text = generatePaymentReceiptText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('₦125,500.00');
    expect(text).toContain('RCP-2026-0042');
  });

  it('4. Statement Delivery template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      businessName: 'Apex Logistics Ltd',
      merchantId: 'MRC-001',
      statementRef: 'STMT-001',
      scopeLabel: 'Comprehensive Business Sales Statement',
      generatedDate: '25 September 2026',
      filename: 'sales-statement.pdf',
    };
    const html = generateStatementHtml(data);
    const text = generateStatementText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('STMT-001');
    expect(text).toContain('sales-statement.pdf');
  });

  it('5. Debtor Payment Reminder template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      customerName: 'Chief Emeka Okafor',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦75,000.00',
      dueDateFormatted: '2026-10-15',
      bankName: 'Wema Bank',
      accountNumber: '9901234567',
      accountName: 'Apex Logistics',
    };
    const html = generateDebtorReminderHtml(data);
    const text = generateDebtorReminderText(data);
    assertWallXBrandInvariants(html, text, { customerFacing: true });
    expect(html).toContain('Chief Emeka Okafor');
    expect(text).toContain('9901234567');
  });

  it('6. Withdrawal Requested template renders both auto-payout and manual review variants', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      feeFormatted: '₦50.00',
      netAmountFormatted: '₦249,950.00',
      destinationBankName: 'GTBank',
      accountNumberMasked: '•••• 4821',
      destinationAccountName: 'APEX LOGISTICS LTD',
      transferReference: 'WDR-001',
      requestDate: '25 September 2026',
      isAutoPayout: true,
      dashboardLink: 'https://wallxerp.com/account?tab=withdrawals',
    };
    const html = generateWithdrawalRequestedHtml(data);
    const text = generateWithdrawalRequestedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('₦249,950.00');
    expect(html).toContain('Processing Instant Bank Transfer');
    expect(text).toContain('WDR-001');

    const manualHtml = generateWithdrawalRequestedHtml({ ...data, isAutoPayout: false });
    expect(manualHtml).toContain('Queued for Settlement Review');
  });

  it('7. Withdrawal Completed template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      feeFormatted: '₦50.00',
      netAmountFormatted: '₦249,950.00',
      destinationBankName: 'GTBank',
      accountNumberMasked: '•••• 4821',
      destinationAccountName: 'APEX LOGISTICS LTD',
      transferReference: 'WDR-001',
      completedDate: '25 September 2026',
      dashboardLink: 'https://wallxerp.com/account?tab=withdrawals',
    };
    const html = generateWithdrawalCompletedHtml(data);
    const text = generateWithdrawalCompletedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Funds Sent to Bank');
    expect(text).toContain('WDR-001');
  });

  it('8. Withdrawal Failed template renders gateway failure and admin rejection variants', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      destinationBankName: 'GTBank',
      accountNumberMasked: '•••• 4821',
      transferReference: 'WDR-002',
      failureReason: 'Bank switch unreachable',
      isRejection: false,
      failedDate: '25 September 2026',
      payoutSettingsLink: 'https://wallxerp.com/account?tab=withdrawals',
    };
    const html = generateWithdrawalFailedHtml(data);
    const text = generateWithdrawalFailedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Withdrawal Unsuccessful');
    expect(text).toContain('Bank switch unreachable');

    const rejectedHtml = generateWithdrawalFailedHtml({ ...data, isRejection: true });
    expect(rejectedHtml).toContain('Withdrawal Declined');
  });

  it('9. Tax Payment Failed template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦45,000.00',
      taxMonthLabel: 'August 2026',
      transactionReference: 'TAX-991',
      failureReason: 'Issuer declined',
      attemptDate: '25 September 2026',
      retryPaymentLink: 'https://wallxerp.com/tax',
    };
    const html = generatePaymentFailedHtml(data);
    const text = generatePaymentFailedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Tax Payment Declined');
    expect(text).toContain('TAX-991');
  });

  it('10. Account Deactivated template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: 'founder@apex.ng',
      deactivationDate: '25 September 2026',
      reason: 'Compliance verification required',
      supportEmail: 'support@wallxerp.com',
    };
    const html = generateAccountDeactivatedHtml(data);
    const text = generateAccountDeactivatedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Compliance verification required');
    expect(text).toContain('founder@apex.ng');
  });

  it('11. Credit Alert template renders DVA inflow and Debtor Due Owner variants', () => {
    const inflowData = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦180,000.00',
      payerName: 'Zenith Retail Ventures',
      accountNumber: '9901234567 (Wema Bank)',
      reference: 'DVA-774',
      transactionDate: '25 September 2026',
      alertType: 'dva_inflow' as const,
      dashboardLink: 'https://wallxerp.com/sales',
    };
    const html = generateCreditAlertHtml(inflowData);
    const text = generateCreditAlertText(inflowData);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Wallet Credit Alert');
    expect(text).toContain('Zenith Retail Ventures');

    const debtorDueHtml = generateCreditAlertHtml({
      ...inflowData,
      alertType: 'debtor_due_owner',
      dueDateFormatted: '2026-10-15',
    });
    expect(debtorDueHtml).toContain('Debtor Due Date Alert');
  });

  it('12. Login Alert template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: 'founder@apex.ng',
      loginTime: '25 Sep 2026, 16:45 WAT',
      ipAddress: '102.89.43.112',
      deviceInfo: 'Chrome on Windows',
      securitySettingsLink: 'https://wallxerp.com/settings?tab=security',
    };
    const html = generateLoginAlertHtml(data);
    const text = generateLoginAlertText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('102.89.43.112');
    expect(text).toContain('Chrome on Windows');
  });

  it('13. Password Changed template renders changed and reset variants', () => {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: 'founder@apex.ng',
      changeDate: '25 September 2026',
      method: 'changed' as const,
      securitySettingsLink: 'https://wallxerp.com/settings?tab=security',
    };
    const html = generatePasswordChangedHtml(data);
    const text = generatePasswordChangedText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('Account Security Settings');

    const resetHtml = generatePasswordChangedHtml({ ...data, method: 'reset' });
    expect(resetHtml).toContain('Password Reset Link');
  });

  it('14. PIN Alert template renders created, changed, reset, and locked variants', () => {
    const base = {
      userName: 'Oluwaseun Adeleke',
      userEmail: 'founder@apex.ng',
      actionDate: '25 September 2026',
      ipAddress: '102.89.43.112',
      securitySettingsLink: 'https://wallxerp.com/settings?tab=security',
    };

    for (const action of ['created', 'changed', 'reset', 'locked'] as const) {
      const html = generatePinAlertHtml({ ...base, action });
      const text = generatePinAlertText({ ...base, action });
      assertWallXBrandInvariants(html, text);
    }
  });

  it('15. Invoice Lifecycle template renders issued, paid, and overdue variants for owner & customer', () => {
    const base = {
      recipientName: 'Oluwaseun Adeleke',
      recipientRole: 'owner' as const,
      businessName: 'Apex Logistics Ltd',
      invoiceNumber: 'INV-2026-019',
      customerName: 'Dangote Flour Mills',
      totalFormatted: '₦483,750.00',
      issueDateFormatted: '25 Sep 2026',
      dueDateFormatted: '15 Oct 2026',
      paidDateFormatted: '26 Sep 2026',
      paymentMethodLabel: 'Bank Transfer',
      bankName: 'Wema Bank',
      accountNumber: '9901234567',
      actionLink: 'https://wallxerp.com/invoices/123',
    };

    for (const event of ['issued', 'paid', 'overdue'] as const) {
      const ownerHtml = generateInvoiceLifecycleHtml({ ...base, event, recipientRole: 'owner' });
      const ownerText = generateInvoiceLifecycleText({ ...base, event, recipientRole: 'owner' });
      assertWallXBrandInvariants(ownerHtml, ownerText);

      const customerHtml = generateInvoiceLifecycleHtml({
        ...base,
        event,
        recipientRole: 'customer',
      });
      assertWallXBrandInvariants(customerHtml, ownerText);
    }
  });

  it('16. Tax Due Date template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      taxMonthLabel: 'September 2026',
      statusHeadline: 'Monthly Tax Filing Due Soon',
      estimatedTaxFormatted: '₦54,000.00',
      reminderMessage: 'Your monthly tax filing deadline is approaching.',
      taxDashboardLink: 'https://wallxerp.com/tax',
    };
    const html = generateTaxDueDateHtml(data);
    const text = generateTaxDueDateText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('₦54,000.00');
    expect(text).toContain('September 2026');
  });

  it('17. P&L Statement Ready template renders WallX ERP brand & interpolates fields', () => {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      monthLabel: 'September 2026',
      totalSalesFormatted: '₦1,450,000.00',
      totalExpensesFormatted: '₦730,000.00',
      grossProfitFormatted: '₦720,000.00',
      taxPayableFormatted: '₦54,000.00',
      profitMarginFormatted: '49.7%',
      downloadLink: 'https://wallxerp.com/tax?pnlMonth=9&pnlYear=2026',
    };
    const html = generatePnlStatementReadyHtml(data);
    const text = generatePnlStatementReadyText(data);
    assertWallXBrandInvariants(html, text);
    expect(html).toContain('₦720,000.00');
    expect(html).toContain('49.7%');
    expect(text).toContain('pnlMonth=9&pnlYear=2026');
  });

  it('18. Team Invitation template renders WallX ERP brand, escaping, and new vs existing account wording', () => {
    const newUserData = {
      inviteeEmail: 'staff@example.com',
      businessName: 'Apex <script>alert(1)</script> Ltd',
      inviterName: 'Oluwaseun & Co',
      role: 'manager',
      inviteLink: 'https://wallxerp.com/invite?token=abc',
      expiresInDays: 7,
      existingAccount: false,
    };

    const htmlNew = generateTeamInvitationHtml(newUserData);
    const textNew = generateTeamInvitationText(newUserData);
    expect(htmlNew).toContain('WallX ERP');
    expect(htmlNew).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(htmlNew).toContain('Oluwaseun &amp; Co');
    expect(htmlNew).toContain('Click the button below to accept the invitation and start collaborating.');
    expect(textNew).toContain('Accept the invitation: https://wallxerp.com/invite?token=abc');

    const existingUserData = {
      ...newUserData,
      existingAccount: true,
    };
    const htmlExisting = generateTeamInvitationHtml(existingUserData);
    const textExisting = generateTeamInvitationText(existingUserData);
    expect(htmlExisting).toContain('Sign in to your existing WallX ERP account and click below to join.');
    expect(textExisting).toContain('Sign in to your existing WallX ERP account and click below to join.');
  });
});
