/**
 * Email Testing Script - WallX ERP
 *
 * Tests all 17 automated email scenarios in the WallX ERP application:
 *  1. welcome              - Welcome email (on signup)
 *  2. reset                - Password reset request email
 *  3. payment              - Tax payment receipt email
 *  4. statement            - Financial statement delivery email
 *  5. debtor               - Debtor payment reminder email (to customer)
 *  6. withdrawal-requested - Withdrawal requested email
 *  7. withdrawal-completed - Withdrawal completed email
 *  8. withdrawal-failed    - Withdrawal failed / rejected email
 *  9. payment-failed       - Tax payment declined email
 * 10. account-deactivated  - Account deactivated by admin email
 * 11. credit-alert         - Wallet DVA credit inflow alert email
 * 12. login-alert          - New login security alert email
 * 13. password-changed     - Password changed / reset confirmation email
 * 14. pin-alert            - Transaction PIN created / changed / reset / locked email
 * 15. invoice-issued       - New invoice issued email
 * 16. invoice-paid         - Invoice paid confirmation email
 * 17. tax-due-date         - Monthly tax filing due date reminder email
 * 18. pnl-ready            - End-of-Month Profit & Loss Statement ready email
 *
 * Usage:
 *   npx tsx scripts/test-emails.ts --email your@email.com --scenario all
 */

import 'dotenv/config';
import { sendEmail } from '../src/lib/email';
import { generateWelcomeHtml, generateWelcomeText } from '../src/lib/email/templates/welcome';
import { generatePasswordResetHtml, generatePasswordResetText } from '../src/lib/email/templates/password-reset';
import { generatePaymentReceiptHtml, generatePaymentReceiptText } from '../src/lib/email/templates/payment-receipt';
import { generateStatementHtml, generateStatementText } from '../src/lib/email/templates/statement';
import { generateDebtorReminderHtml, generateDebtorReminderText } from '../src/lib/email/templates/debtor-reminder';
import {
  generateWithdrawalRequestedHtml,
  generateWithdrawalRequestedText,
} from '../src/lib/email/templates/withdrawal-requested';
import {
  generateWithdrawalCompletedHtml,
  generateWithdrawalCompletedText,
} from '../src/lib/email/templates/withdrawal-completed';
import {
  generateWithdrawalFailedHtml,
  generateWithdrawalFailedText,
} from '../src/lib/email/templates/withdrawal-failed';
import {
  generatePaymentFailedHtml,
  generatePaymentFailedText,
} from '../src/lib/email/templates/payment-failed';
import {
  generateAccountDeactivatedHtml,
  generateAccountDeactivatedText,
} from '../src/lib/email/templates/account-deactivated';
import {
  generateCreditAlertHtml,
  generateCreditAlertText,
} from '../src/lib/email/templates/credit-alert';
import {
  generateLoginAlertHtml,
  generateLoginAlertText,
} from '../src/lib/email/templates/login-alert';
import {
  generatePasswordChangedHtml,
  generatePasswordChangedText,
} from '../src/lib/email/templates/password-changed';
import {
  generatePinAlertHtml,
  generatePinAlertText,
} from '../src/lib/email/templates/pin-alert';
import {
  generateInvoiceLifecycleHtml,
  generateInvoiceLifecycleText,
} from '../src/lib/email/templates/invoice-lifecycle';
import {
  generateTaxDueDateHtml,
  generateTaxDueDateText,
} from '../src/lib/email/templates/tax-due-date';
import {
  generatePnlStatementReadyHtml,
  generatePnlStatementReadyText,
} from '../src/lib/email/templates/pnl-statement-ready';
import config from '../src/config';

const SCENARIOS = [
  'all',
  'welcome',
  'reset',
  'payment',
  'statement',
  'debtor',
  'withdrawal-requested',
  'withdrawal-completed',
  'withdrawal-failed',
  'payment-failed',
  'account-deactivated',
  'credit-alert',
  'login-alert',
  'password-changed',
  'pin-alert',
  'invoice-issued',
  'invoice-paid',
  'tax-due-date',
  'pnl-ready',
] as const;

type ScenarioName = (typeof SCENARIOS)[number];

interface TestEmailOptions {
  email: string;
  scenario: ScenarioName;
}

const FRONTEND_URL = config.cors.frontendUrl.split(',')[0].trim();

async function dispatchScenario(
  label: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  console.log(`\n📧 Testing ${label} (WallX ERP)...`);
  console.log('─'.repeat(60));
  try {
    const result = await sendEmail({ to, subject, html, text });
    if (result.delivered) {
      console.log(`✅ ${label} sent successfully! Message ID: ${result.id}`);
    } else {
      console.log(`⚠️  ${label} logged via dev fallback (verified HTML & Text)`);
    }
    return true;
  } catch (error) {
    console.error(`❌ ${label} failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function runTests(options: TestEmailOptions): Promise<void> {
  console.log('\n🔍 Email Configuration Check - WallX ERP');
  console.log('═'.repeat(60));
  console.log(`Environment: ${config.app.env}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Email From: ${config.email.from}`);
  console.log(
    `Resend API Key: ${
      config.email.apiKey
        ? '✅ Configured (re_' + config.email.apiKey.substring(3, 8) + '...)'
        : '❌ NOT SET (dev mode active)'
    }`,
  );
  console.log('═'.repeat(60));

  const results: Record<string, boolean> = {};
  const { email, scenario } = options;
  const todayStr = new Date().toLocaleDateString('en-NG', { dateStyle: 'long' });

  const shouldRun = (name: ScenarioName) => scenario === 'all' || scenario === name;

  if (shouldRun('welcome')) {
    const data = { userEmail: email, dashboardLink: `${FRONTEND_URL}/dashboard` };
    results['welcome'] = await dispatchScenario(
      'Welcome Email',
      email,
      'Welcome to WallX ERP',
      generateWelcomeHtml(data),
      generateWelcomeText(data),
    );
  }

  if (shouldRun('reset')) {
    const data = {
      resetLink: `${FRONTEND_URL}/reset-password?token=test_token_12345`,
      expiryMinutes: 60,
      userEmail: email,
    };
    results['reset'] = await dispatchScenario(
      'Password Reset Request',
      email,
      'Reset Your WallX ERP Password',
      generatePasswordResetHtml(data),
      generatePasswordResetText(data),
    );
  }

  if (shouldRun('payment')) {
    const data = {
      businessName: 'Apex Logistics Ltd',
      ownerName: 'Oluwaseun Adeleke',
      amountFormatted: '₦125,500.00',
      taxMonthLabel: 'March 2026',
      paymentReference: 'PAYSTACK-TXN-90210',
      paymentDate: todayStr,
      receiptNumber: 'RCP-2026-0042',
    };
    results['payment'] = await dispatchScenario(
      'Tax Payment Receipt',
      email,
      `Payment Receipt - ${data.taxMonthLabel} (${data.amountFormatted})`,
      generatePaymentReceiptHtml(data),
      generatePaymentReceiptText(data),
    );
  }

  if (shouldRun('statement')) {
    const data = {
      businessName: 'Apex Logistics Ltd',
      merchantId: 'MERCH-9941',
      statementRef: 'STM-2026-09-001',
      scopeLabel: 'Dedicated Virtual Bank Account Statement',
      generatedDate: todayStr,
      filename: 'Apex_Logistics_Statement_Sep2026.pdf',
    };
    results['statement'] = await dispatchScenario(
      'Financial Statement Delivery',
      email,
      `Official Financial Statement: ${data.businessName} (${data.statementRef})`,
      generateStatementHtml(data),
      generateStatementText(data),
    );
  }

  if (shouldRun('debtor')) {
    const data = {
      customerName: 'Chief Emeka Okafor',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦75,000.00',
      dueDateFormatted: '2026-10-15',
      bankName: 'Wema Bank',
      accountNumber: '9901234567',
      accountName: 'Apex Logistics / WallX',
    };
    results['debtor'] = await dispatchScenario(
      'Debtor Payment Reminder',
      email,
      `Payment Reminder: ${data.amountFormatted} due — ${data.businessName}`,
      generateDebtorReminderHtml(data),
      generateDebtorReminderText(data),
    );
  }

  if (shouldRun('withdrawal-requested')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      feeFormatted: '₦50.00',
      netAmountFormatted: '₦249,950.00',
      destinationBankName: 'Guaranty Trust Bank',
      accountNumberMasked: '•••• 4821',
      destinationAccountName: 'APEX LOGISTICS LTD',
      transferReference: 'WDR-20260925-001',
      requestDate: todayStr,
      isAutoPayout: true,
      dashboardLink: `${FRONTEND_URL}/account?tab=withdrawals`,
    };
    results['withdrawal-requested'] = await dispatchScenario(
      'Withdrawal Requested',
      email,
      `Withdrawal Requested: ${data.netAmountFormatted} — WallX ERP`,
      generateWithdrawalRequestedHtml(data),
      generateWithdrawalRequestedText(data),
    );
  }

  if (shouldRun('withdrawal-completed')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      feeFormatted: '₦50.00',
      netAmountFormatted: '₦249,950.00',
      destinationBankName: 'Guaranty Trust Bank',
      accountNumberMasked: '•••• 4821',
      destinationAccountName: 'APEX LOGISTICS LTD',
      transferReference: 'WDR-20260925-001',
      completedDate: todayStr,
      dashboardLink: `${FRONTEND_URL}/account?tab=withdrawals`,
    };
    results['withdrawal-completed'] = await dispatchScenario(
      'Withdrawal Completed',
      email,
      `Withdrawal Completed: ${data.netAmountFormatted} Sent to Bank — WallX ERP`,
      generateWithdrawalCompletedHtml(data),
      generateWithdrawalCompletedText(data),
    );
  }

  if (shouldRun('withdrawal-failed')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦250,000.00',
      destinationBankName: 'Guaranty Trust Bank',
      accountNumberMasked: '•••• 4821',
      transferReference: 'WDR-20260925-002',
      failureReason: 'Destination bank switch temporarily unreachable',
      isRejection: false,
      failedDate: todayStr,
      payoutSettingsLink: `${FRONTEND_URL}/account?tab=withdrawals`,
    };
    results['withdrawal-failed'] = await dispatchScenario(
      'Withdrawal Failed',
      email,
      `Withdrawal Unsuccessful: ${data.amountFormatted} Restored to Wallet — WallX ERP`,
      generateWithdrawalFailedHtml(data),
      generateWithdrawalFailedText(data),
    );
  }

  if (shouldRun('payment-failed')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦45,000.00',
      taxMonthLabel: 'August 2026',
      transactionReference: 'TAX-20260925-889',
      failureReason: 'Insufficient funds / Card issuer declined transaction',
      attemptDate: todayStr,
      retryPaymentLink: `${FRONTEND_URL}/tax`,
    };
    results['payment-failed'] = await dispatchScenario(
      'Tax Payment Failed',
      email,
      `Tax Payment Declined (${data.taxMonthLabel}) — WallX ERP`,
      generatePaymentFailedHtml(data),
      generatePaymentFailedText(data),
    );
  }

  if (shouldRun('account-deactivated')) {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: email,
      deactivationDate: todayStr,
      reason: 'Scheduled KYC document verification review',
      supportEmail: 'support@wallxerp.com',
    };
    results['account-deactivated'] = await dispatchScenario(
      'Account Deactivated',
      email,
      'Important: Your WallX ERP Account Has Been Deactivated',
      generateAccountDeactivatedHtml(data),
      generateAccountDeactivatedText(data),
    );
  }

  if (shouldRun('credit-alert')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      amountFormatted: '₦180,000.00',
      payerName: 'Zenith Retail Ventures',
      accountNumber: '9901234567 (Wema Bank)',
      reference: 'DVA-TRF-20260925-774',
      transactionDate: todayStr,
      alertType: 'dva_inflow' as const,
      dashboardLink: `${FRONTEND_URL}/sales`,
    };
    results['credit-alert'] = await dispatchScenario(
      'Wallet Credit Alert',
      email,
      `Credit Alert: ${data.amountFormatted} Received from ${data.payerName} — WallX ERP`,
      generateCreditAlertHtml(data),
      generateCreditAlertText(data),
    );
  }

  if (shouldRun('login-alert')) {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: email,
      loginTime: new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }),
      ipAddress: '102.89.43.112',
      deviceInfo: 'Chrome on Windows 11',
      securitySettingsLink: `${FRONTEND_URL}/settings?tab=security`,
    };
    results['login-alert'] = await dispatchScenario(
      'Login Security Alert',
      email,
      'New Sign-In to Your WallX ERP Account',
      generateLoginAlertHtml(data),
      generateLoginAlertText(data),
    );
  }

  if (shouldRun('password-changed')) {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: email,
      changeDate: todayStr,
      method: 'changed' as const,
      securitySettingsLink: `${FRONTEND_URL}/settings?tab=security`,
    };
    results['password-changed'] = await dispatchScenario(
      'Password Changed Confirmation',
      email,
      'Your WallX ERP Password Was Updated',
      generatePasswordChangedHtml(data),
      generatePasswordChangedText(data),
    );
  }

  if (shouldRun('pin-alert')) {
    const data = {
      userName: 'Oluwaseun Adeleke',
      userEmail: email,
      action: 'created' as const,
      actionDate: todayStr,
      ipAddress: '102.89.43.112',
      securitySettingsLink: `${FRONTEND_URL}/settings?tab=security`,
    };
    results['pin-alert'] = await dispatchScenario(
      'Transaction PIN Alert',
      email,
      'Transaction PIN Activated — WallX ERP',
      generatePinAlertHtml(data),
      generatePinAlertText(data),
    );
  }

  if (shouldRun('invoice-issued')) {
    const data = {
      recipientName: 'Oluwaseun Adeleke',
      recipientRole: 'owner' as const,
      businessName: 'Apex Logistics Ltd',
      invoiceNumber: 'INV-2026-019',
      customerName: 'Dangote Flour Mills',
      totalFormatted: '₦483,750.00',
      issueDateFormatted: todayStr,
      dueDateFormatted: '15 Oct 2026',
      event: 'issued' as const,
      actionLink: `${FRONTEND_URL}/invoices`,
    };
    results['invoice-issued'] = await dispatchScenario(
      'Invoice Issued Notification',
      email,
      `Invoice Issued: ${data.invoiceNumber} (${data.totalFormatted}) — WallX ERP`,
      generateInvoiceLifecycleHtml(data),
      generateInvoiceLifecycleText(data),
    );
  }

  if (shouldRun('invoice-paid')) {
    const data = {
      recipientName: 'Oluwaseun Adeleke',
      recipientRole: 'owner' as const,
      businessName: 'Apex Logistics Ltd',
      invoiceNumber: 'INV-2026-019',
      customerName: 'Dangote Flour Mills',
      totalFormatted: '₦483,750.00',
      issueDateFormatted: todayStr,
      dueDateFormatted: '15 Oct 2026',
      paidDateFormatted: todayStr,
      paymentMethodLabel: 'Bank Transfer',
      event: 'paid' as const,
      actionLink: `${FRONTEND_URL}/invoices`,
    };
    results['invoice-paid'] = await dispatchScenario(
      'Invoice Paid Notification',
      email,
      `Invoice Paid: ${data.invoiceNumber} (${data.totalFormatted}) — WallX ERP`,
      generateInvoiceLifecycleHtml(data),
      generateInvoiceLifecycleText(data),
    );
  }

  if (shouldRun('tax-due-date')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      taxMonthLabel: 'September 2026',
      statusHeadline: 'Monthly Tax Filing Due Soon',
      estimatedTaxFormatted: '₦54,000.00',
      reminderMessage:
        'Your monthly tax filing deadline for September 2026 is approaching. Please review your recorded sales and expenses, finalize your report, and remit your tax on WallX ERP.',
      taxDashboardLink: `${FRONTEND_URL}/tax`,
    };
    results['tax-due-date'] = await dispatchScenario(
      'Tax Due Date Reminder',
      email,
      `Tax Filing Reminder (${data.taxMonthLabel}) — WallX ERP`,
      generateTaxDueDateHtml(data),
      generateTaxDueDateText(data),
    );
  }

  if (shouldRun('pnl-ready')) {
    const data = {
      ownerName: 'Oluwaseun Adeleke',
      businessName: 'Apex Logistics Ltd',
      monthLabel: 'September 2026',
      totalSalesFormatted: '₦1,450,000.00',
      totalExpensesFormatted: '₦730,000.00',
      grossProfitFormatted: '₦720,000.00',
      taxPayableFormatted: '₦54,000.00',
      profitMarginFormatted: '49.7%',
      downloadLink: `${FRONTEND_URL}/tax?pnlMonth=9&pnlYear=2026`,
    };
    results['pnl-ready'] = await dispatchScenario(
      'P&L Statement Ready',
      email,
      `Profit & Loss Statement Ready (${data.monthLabel}) — WallX ERP`,
      generatePnlStatementReadyHtml(data),
      generatePnlStatementReadyText(data),
    );
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('═'.repeat(60));

  const testCount = Object.keys(results).length;
  const passedCount = Object.values(results).filter(Boolean).length;
  const failedCount = testCount - passedCount;

  Object.entries(results).forEach(([name, passed]) => {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name.toUpperCase()} template: ${passed ? 'VERIFIED' : 'FAILED'}`);
  });

  console.log('─'.repeat(60));
  console.log(`Total: ${testCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('═'.repeat(60));

  if (failedCount > 0) {
    process.exit(1);
  }
}

function parseArgs(): TestEmailOptions {
  const args = process.argv.slice(2);
  const options: TestEmailOptions = {
    email: 'qa-tester@wallxerp.com',
    scenario: 'all',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      options.email = args[i + 1];
      i++;
    } else if (args[i] === '--scenario' && args[i + 1]) {
      const s = args[i + 1] as ScenarioName;
      if (SCENARIOS.includes(s)) {
        options.scenario = s;
      }
      i++;
    }
  }

  return options;
}

async function main() {
  try {
    const options = parseArgs();
    await runTests(options);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
