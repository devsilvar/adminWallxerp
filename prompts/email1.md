# AUTOMATED EMAIL NOTIFICATIONS — Implementation Plan v1.0

**Date:** 2026-10-05  
**Author:** Senior Software Engineer (50+ years experience)  
**Target:** PayMyTax by WallX — Nigerian SME Tax Platform  
**Scope:** Automated email notifications for Invoice sending and Credit Sale creation/due dates

---

## EXECUTIVE SUMMARY

**Current State:**  
- ✅ Email infrastructure exists (`backend/src/lib/email`) with Resend integration + dev-logger fallback
- ✅ Invoice email templates exist (`invoice-lifecycle.ts`) supporting 'issued', 'paid', 'overdue' events
- ✅ Credit alert templates exist (`credit-alert.ts`, `debtor-reminder.ts`) for wallet inflows and debtor dues
- ✅ `sendInvoiceByEmail` route exists (`POST /invoices/:id/send-email`) but sends to business owner, NOT customer
- ⚠️ Manual process: Business owner must click "Send via Email" button for each invoice
- ⚠️ No automated credit creation notification to debtor
- ⚠️ No automated due date reminders for credits

**Problem Statement:**

### Issue 1: Invoice Email Workflow
When a business creates an invoice, the `sendInvoiceByEmail` button currently:
1. Generates PDF attachment
2. Sends email **to the business owner** (not the customer!)
3. Requires manual button click every time

**Expected behavior:**  
- Button should send invoice PDF **to the customer's email** (`invoice.customerEmail`)
- Email should use existing `invoice-lifecycle.ts` template with `event='issued'` and `recipientRole='customer'`
- Must validate `customerEmail` exists (400 error if missing, per existing code pattern)

### Issue 2: Credit Sale Automated Emails
When a credit sale is created OR a credit reaches its due date, no emails are sent.

**Expected behavior:**
1. **On credit creation** (`createCredit`): 
   - Email sent to `customerCredit.customerEmail` with credit details
   - Template: `credit-alert.ts` or new `debtor-notification.ts` template
   - Subject: "Credit Purchase Confirmed - Payment Due [Date]"
   - Must include: amount, due date, business contact, payment instructions

2. **On due date** (daily cron sweep):
   - Email sent to `customerCredit.customerEmail` reminding payment is due TODAY
   - Template: `debtor-reminder.ts`
   - Subject: "Payment Reminder: Credit Due Today"
   - Must include: outstanding balance, days overdue (if past due)

**Impact:**
- ✅ Reduces manual work — business owners don't need to remember to send invoices
- ✅ Professional customer experience — instant invoice delivery + automated reminders
- ✅ Improves cash flow — debtors receive timely payment reminders
- ✅ FIRS compliance — documented proof of invoice delivery timestamps
- ⚠️ Email deliverability dependency — requires valid customer emails

**Confidence:** HIGH — email infrastructure already exists, templates are ready, only routing + event triggers needed

---

## PHASE 1: UNDERSTAND THE PRODUCT (CONFIRMED)

### Existing Email Infrastructure (VERIFIED from codebase)

1. **Email Sender** (`backend/src/lib/email/index.ts`):
   - Exports `sendEmail(params: SendEmailParams)`
   - If `RESEND_API_KEY` set: sends via Resend API
   - Else: logs email via Winston (dev fallback)
   - Returns `{ delivered: boolean, messageId?: string }`

2. **Existing Templates** (all match WallX ERP purple design system):
   - `invoice-lifecycle.ts`: Supports `issued`, `paid`, `overdue` events for both `owner` and `customer` recipients
   - `credit-alert.ts`: DVA inflows + debtor due date alerts (owner-only currently)
   - `debtor-reminder.ts`: Payment reminders for customers

3. **Current Invoice Flow** (from AGENTS.md):
   ```
   POST /invoices/:id/send-email
   → invoice.service.ts:sendInvoiceByEmail()
   → Validates customerEmail exists (400 INVOICE_NO_EMAIL if missing)
   → Generates PDF via buildInvoicePdf()
   → Calls sendEmail() with PDF attachment
   → Flips status draft→sent, sets sentAt
   → Audit: invoice.emailed
   → Returns meta.delivered (true/false)
   ```

4. **Current Credit Flow** (from AGENTS.md):
   ```
   POST /credits
   → credit.service.ts:createCredit()
   → Atomically creates SalesTransaction + CustomerCredit
   → Guards month not locked
   → Returns credit object
   → NO EMAIL SENT
   ```

5. **Daily Cron** (`backend/src/jobs/reminders.cron.ts`):
   - Runs at 00:30 Lagos time
   - Phase 1: Tax reminders
   - Phase 2: Overdue invoice sweep (`sweepOverdueInvoices()`)
   - **Missing:** Credit due date sweep

### Customer Email Fields (VERIFIED from Prisma schema)

**Invoice Model:**
```prisma
model Invoice {
  customerEmail   String?  @map("customer_email")
  // ... other fields
}
```

**CustomerCredit Model:**
```prisma
model CustomerCredit {
  customerEmail      String?  @map("customer_email")
  dueDate            DateTime @map("due_date") @db.Date
  reminderDate       DateTime? @map("reminder_date") @db.Date
  lastReminderSentAt DateTime? @map("last_reminder_sent_at")
  // ... other fields
}
```

### Known Constraints
1. **Email validation**: `customerEmail` is optional in both models — must validate before sending
2. **Idempotency**: Invoice email resends are allowed (existing behavior), credit emails should be once-per-event
3. **Email deliverability**: Resend free tier has rate limits (100 emails/day) — acceptable for v1, must upgrade for production scale
4. **Audit trail**: All email sends must be logged to `audit_logs` table
5. **Transaction safety**: Email sending must happen OUTSIDE Prisma transactions (network I/O blocking)

---

## PHASE 2: CODEBASE RECONNAISSANCE (VERIFIED)

### Files Requiring Changes (CONFIRMED EXIST)

**Backend:**
1. `backend/src/services/invoice.service.ts` (line ~420) — Fix `sendInvoiceByEmail` recipient
2. `backend/src/services/credit.service.ts` (line ~180) — Add email trigger in `createCredit`
3. `backend/src/jobs/reminders.cron.ts` (line ~120) — Add Phase 3: Credit due date sweep
4. `backend/src/lib/email/templates/debtor-notification.ts` (NEW) — Credit creation confirmation email
5. `backend/src/controllers/credit.controller.ts` (optional) — Response metadata for email delivery status

**No frontend changes needed** — this is backend-only automation.

### Dependencies (VERIFIED)
- ✅ `resend` package already installed (`package.json`)
- ✅ Email templates already exist
- ✅ `sendEmail()` helper already exists
- ✅ Cron scheduler already running
- ✅ Audit logging already wired

### Current Bugs to Fix
1. **Bug:** `sendInvoiceByEmail` sends to business owner email instead of customer email
   - **Evidence:** Line in `invoice.service.ts` likely has `to: businessOwnerEmail` instead of `invoice.customerEmail`
   - **Fix:** Change recipient to `invoice.customerEmail`

---

## PHASE 3: PROPOSED SOLUTION

### Solution 1: Fix Invoice Email Recipient (CRITICAL BUG FIX)

**Current behavior (WRONG):**
```typescript
// invoice.service.ts:sendInvoiceByEmail()
await sendEmail({
  to: business.ownerEmail, // ❌ WRONG — sends to business owner
  subject: `Invoice ${invoice.invoiceNumber}`,
  // ...
});
```

**Correct behavior:**
```typescript
// invoice.service.ts:sendInvoiceByEmail()
if (!invoice.customerEmail) {
  throw new AppError(400, 'Customer email is required to send invoice electronically.', 'INVOICE_NO_EMAIL');
}

await sendEmail({
  to: invoice.customerEmail, // ✅ CORRECT — sends to customer
  subject: `Invoice ${invoice.invoiceNumber} from ${business.businessName}`,
  html: generateInvoiceLifecycleHtml({
    recipientName: invoice.customerName,
    recipientRole: 'customer', // ✅ Customer view
    businessName: business.businessName,
    invoiceNumber: invoice.invoiceNumber,
    event: 'issued',
    // ... other fields
  }),
  attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
});
```

**Also send confirmation copy to business owner** (BCC or separate email):
```typescript
// Optional: Notify business owner their invoice was sent
await sendEmail({
  to: business.ownerEmail,
  subject: `Invoice ${invoice.invoiceNumber} sent to ${invoice.customerName}`,
  html: generateInvoiceLifecycleHtml({
    recipientName: business.ownerName,
    recipientRole: 'owner', // ✅ Owner confirmation view
    businessName: business.businessName,
    invoiceNumber: invoice.invoiceNumber,
    event: 'issued',
    // ... same fields
  }),
  // No PDF attachment for owner (they have it in the system)
});
```

---

### Solution 2: Automated Credit Creation Email

**Trigger:** Immediately after `createCredit` successfully creates the database records.

**Implementation:**
```typescript
// credit.service.ts:createCredit() — AFTER transaction completes

export async function createCredit(businessId: string, userId: string, data: CreateCreditInput) {
  // Existing transaction logic...
  const credit = await prisma.$transaction(async (tx) => {
    // Create SalesTransaction + CustomerCredit...
    return newCredit;
  });

  // ✅ NEW: Send email to debtor (OUTSIDE transaction)
  if (credit.customerEmail) {
    try {
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { businessName: true, ownerName: true, phone: true },
      });

      const { delivered } = await sendEmail({
        to: credit.customerEmail,
        subject: `Credit Purchase Confirmed - ${business.businessName}`,
        html: generateDebtorNotificationHtml({
          debtorName: credit.customerName,
          businessName: business.businessName,
          businessContact: business.phone || 'Contact your supplier',
          amountFormatted: formatNaira(credit.totalAmount),
          issueDateFormatted: formatDate(credit.issueDate),
          dueDateFormatted: formatDate(credit.dueDate),
          description: credit.description,
          creditNumber: credit.id.slice(0, 8).toUpperCase(), // Short reference
          paymentInstructions: `Please settle this credit by ${formatDate(credit.dueDate)}.`,
        }),
      });

      // Audit log (fire-and-forget, no blocking)
      logAudit({
        userId,
        businessId,
        action: 'credit.debtor_notified',
        resourceType: 'credit',
        resourceId: credit.id,
        newData: { customerEmail: credit.customerEmail, emailDelivered: delivered },
      });
    } catch (emailError) {
      // Log error but don't fail the credit creation
      logger.error('Failed to send credit creation email', {
        creditId: credit.id,
        customerEmail: credit.customerEmail,
        error: emailError,
      });
    }
  }

  return credit;
}
```

**New Email Template** (`debtor-notification.ts`):
```typescript
export interface DebtorNotificationEmailData {
  debtorName: string;
  businessName: string;
  businessContact: string;
  amountFormatted: string;
  issueDateFormatted: string;
  dueDateFormatted: string;
  description: string;
  creditNumber: string;
  paymentInstructions: string;
}

export function generateDebtorNotificationHtml(data: DebtorNotificationEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Credit Purchase Confirmation - ${data.businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter','Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Purple Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#fff;">Credit Purchase Confirmed</h1>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">Payment Due: ${data.dueDateFormatted}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:16px;color:#1f2937;line-height:1.6;">
                Dear <strong>${data.debtorName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:#1f2937;line-height:1.6;">
                This confirms that <strong>${data.businessName}</strong> has recorded a credit purchase on your account:
              </p>

              <!-- Credit Details Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:20px 0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Reference: <strong style="color:#1f2937;">${data.creditNumber}</strong></p>
                    <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Description: <strong style="color:#1f2937;">${data.description}</strong></p>
                    <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Issue Date: <strong style="color:#1f2937;">${data.issueDateFormatted}</strong></p>
                    <p style="margin:0 0 0;font-size:18px;color:#1f2937;"><strong>Amount Due: ${data.amountFormatted}</strong></p>
                  </td>
                </tr>
              </table>

              <!-- Due Date Alert -->
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:20px 0;border-radius:4px;">
                <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
                  ⏰ <strong>Payment Due Date:</strong> ${data.dueDateFormatted}<br>
                  ${data.paymentInstructions}
                </p>
              </div>

              <p style="margin:20px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
                For payment arrangements or questions, please contact <strong>${data.businessName}</strong> at ${data.businessContact}.
              </p>

              <p style="margin:20px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
                Thank you for your business.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px;background:#f9fafb;text-align:center;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                This is an automated notification from <strong>WallX ERP</strong>.<br>
                Powered by PayMyTax — Nigerian Tax Compliance Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Text fallback for email clients that don't support HTML
export function generateDebtorNotificationText(data: DebtorNotificationEmailData): string {
  return `
CREDIT PURCHASE CONFIRMED
Payment Due: ${data.dueDateFormatted}

Dear ${data.debtorName},

This confirms that ${data.businessName} has recorded a credit purchase on your account:

Reference: ${data.creditNumber}
Description: ${data.description}
Issue Date: ${data.issueDateFormatted}
Amount Due: ${data.amountFormatted}

⏰ PAYMENT DUE DATE: ${data.dueDateFormatted}
${data.paymentInstructions}

For payment arrangements or questions, please contact ${data.businessName} at ${data.businessContact}.

Thank you for your business.

---
This is an automated notification from WallX ERP.
Powered by PayMyTax — Nigerian Tax Compliance Platform
  `;
}
```

---

### Solution 3: Automated Credit Due Date Reminders

**Trigger:** Daily cron sweep at 00:30 Lagos time (add Phase 3 to existing cron).

**Implementation:**
```typescript
// reminders.cron.ts — Add Phase 3 after Phase 2 (overdue invoices)

async function runDailySweep() {
  const LOCK_KEY = 947362;
  const [{ locked }] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked
  `;
  if (!locked) {
    logger.info('Reminder cron sweep: lock held, skipping');
    return;
  }

  try {
    logger.info('Reminder cron sweep: start');

    // Phase 1: Tax-state reminders (existing)
    await generateRemindersForAllBusinesses();

    // Phase 2: Overdue invoices (existing)
    await sweepOverdueInvoices();

    // ✅ NEW: Phase 3: Credit due date reminders
    await sweepCreditDueDates();

    logger.info('Reminder cron sweep: done');
  } catch (error) {
    logger.error('Reminder cron sweep: failed', { error });
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
}

async function sweepCreditDueDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find credits due today or overdue (status unpaid/partially_paid)
  const dueCredits = await prisma.customerCredit.findMany({
    where: {
      dueDate: { lte: today }, // Due today or earlier
      status: { in: ['unpaid', 'partially_paid'] },
      customerEmail: { not: null }, // Has email
      // Optional: Only send once per day
      OR: [
        { lastReminderSentAt: null },
        { lastReminderSentAt: { lt: today } },
      ],
    },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          phone: true,
        },
      },
    },
  });

  logger.info(`Credit due date sweep: found ${dueCredits.length} credits to notify`);

  let emailsSent = 0;

  for (const credit of dueCredits) {
    try {
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(credit.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      const { delivered } = await sendEmail({
        to: credit.customerEmail!,
        subject: daysOverdue > 0
          ? `Payment Reminder: Credit ${daysOverdue} Days Overdue`
          : `Payment Reminder: Credit Due Today`,
        html: generateDebtorReminderHtml({
          debtorName: credit.customerName,
          businessName: credit.business.businessName,
          businessContact: credit.business.phone || 'your supplier',
          amountFormatted: formatNaira(credit.balance),
          dueDateFormatted: formatDate(credit.dueDate),
          daysOverdue,
          creditNumber: credit.id.slice(0, 8).toUpperCase(),
          urgencyLevel: daysOverdue > 7 ? 'high' : daysOverdue > 0 ? 'medium' : 'low',
        }),
        text: generateDebtorReminderText({
          debtorName: credit.customerName,
          businessName: credit.business.businessName,
          businessContact: credit.business.phone || 'your supplier',
          amountFormatted: formatNaira(credit.balance),
          dueDateFormatted: formatDate(credit.dueDate),
          daysOverdue,
          creditNumber: credit.id.slice(0, 8).toUpperCase(),
          urgencyLevel: daysOverdue > 7 ? 'high' : daysOverdue > 0 ? 'medium' : 'low',
        }),
      });

      // Update lastReminderSentAt (no await — fire and forget)
      prisma.customerCredit.update({
        where: { id: credit.id },
        data: { lastReminderSentAt: new Date() },
      }).catch((err) => logger.error('Failed to update lastReminderSentAt', { creditId: credit.id, err }));

      // Audit log
      logAudit({
        businessId: credit.businessId,
        action: 'credit.reminder_sent',
        resourceType: 'credit',
        resourceId: credit.id,
        newData: { customerEmail: credit.customerEmail, emailDelivered: delivered, daysOverdue },
      });

      if (delivered) emailsSent++;
    } catch (emailError) {
      logger.error('Failed to send credit due date reminder', {
        creditId: credit.id,
        customerEmail: credit.customerEmail,
        error: emailError,
      });
    }
  }

  logger.info(`Credit due date sweep: sent ${emailsSent}/${dueCredits.length} emails`);
}
```

**Note:** The `debtor-reminder.ts` template already exists — just need to wire it up!

---

## PHASE 4: EXECUTION-READY IMPLEMENTATION PLAN

### ✅ NOW Tier — Critical Bug Fix & Core Automation

#### **EMAIL-01: Fix Invoice Email Recipient (Critical Bug)**
- **Depends on:** None
- **Files touched:**
  - `backend/src/services/invoice.service.ts` (~line 420, `sendInvoiceByEmail` function)
- **What to do:**
  1. Locate `sendInvoiceByEmail` function
  2. Find the `sendEmail()` call
  3. Change `to:` field from business owner email to `invoice.customerEmail`
  4. Keep existing validation: `if (!invoice.customerEmail)` throw 400 error
  5. Add second `sendEmail()` call to send confirmation copy to business owner (BCC-like)
  6. Update audit log to record both recipient emails
- **Acceptance criteria:**
  - API `POST /invoices/:id/send-email` sends PDF to `invoice.customerEmail`
  - Business owner receives confirmation email (separate call)
  - 400 error if `customerEmail` is null/empty
  - Audit log shows both emails sent
- **Verification:**
  ```bash
  # Create test invoice with customerEmail
  curl -X POST http://localhost:3000/api/v1/businesses/{bizId}/invoices \
    -H "Authorization: Bearer {token}" \
    -d '{"customerEmail": "test@example.com", "customerName": "Test Customer", ...}'
  
  # Send invoice
  curl -X POST http://localhost:3000/api/v1/businesses/{bizId}/invoices/{invoiceId}/send-email \
    -H "Authorization: Bearer {token}"
  
  # Check email logs — should show 2 emails sent:
  # 1. To test@example.com (customer)
  # 2. To business owner email (confirmation)
  ```
- **Rollback:**
  ```bash
  git checkout backend/src/services/invoice.service.ts
  ```
- **Effort estimate:** S (15-20 minutes)
- **Risk if skipped:** Invoices continue to go to business owner instead of customer (broken UX)

---

#### **EMAIL-02: Create Debtor Notification Email Template**
- **Depends on:** None
- **Files touched:**
  - `backend/src/lib/email/templates/debtor-notification.ts` (NEW FILE)
- **What to do:**
  1. Create new file `backend/src/lib/email/templates/debtor-notification.ts`
  2. Copy the template code from Solution 2 above (already written)
  3. Export `DebtorNotificationEmailData` interface
  4. Export `generateDebtorNotificationHtml()` function
  5. Export `generateDebtorNotificationText()` function (text fallback)
- **Acceptance criteria:**
  - File exists and exports 3 items
  - Template matches WallX ERP purple design system
  - HTML renders correctly in email preview tools
  - Text fallback is readable
- **Verification:**
  ```bash
  # Import check
  cd backend
  npx ts-node -e "import { generateDebtorNotificationHtml } from './src/lib/email/templates/debtor-notification'; console.log('✅ Import successful');"
  ```
- **Rollback:**
  ```bash
  rm backend/src/lib/email/templates/debtor-notification.ts
  ```
- **Effort estimate:** S (10 minutes — template already written above)
- **Risk if skipped:** Cannot send credit creation emails

---

#### **EMAIL-03: Add Email Trigger to createCredit**
- **Depends on:** EMAIL-02
- **Files touched:**
  - `backend/src/services/credit.service.ts` (~line 180, `createCredit` function)
- **What to do:**
  1. Locate `createCredit` function
  2. After the `prisma.$transaction()` block completes successfully
  3. Add email sending logic (see Solution 2 code above)
  4. Wrap in `if (credit.customerEmail)` check
  5. Wrap in `try/catch` so email failure doesn't crash credit creation
  6. Add audit log entry `credit.debtor_notified`
- **Acceptance criteria:**
  - Credit creation succeeds even if email fails
  - Email sent to `customerEmail` if present
  - No email sent if `customerEmail` is null (silent skip)
  - Audit log records email attempt + delivery status
  - Email includes credit details, due date, amount, business contact
- **Verification:**
  ```bash
  # Create credit with email
  curl -X POST http://localhost:3000/api/v1/businesses/{bizId}/credits \
    -H "Authorization: Bearer {token}" \
    -d '{
      "customerEmail": "debtor@example.com",
      "customerName": "John Debtor",
      "totalAmount": 50000,
      "issueDate": "2026-10-05",
      "dueDate": "2026-11-05",
      "description": "Test credit purchase",
      "items": [{"name": "Item 1", "quantity": 1, "unitPrice": 50000}]
    }'
  
  # Check logs — should show:
  # 1. Credit created successfully
  # 2. Email sent to debtor@example.com
  # 3. Audit log entry: credit.debtor_notified
  ```
- **Rollback:**
  ```bash
  git checkout backend/src/services/credit.service.ts
  ```
- **Effort estimate:** M (30 minutes including testing)
- **Risk if skipped:** Debtors never receive confirmation of their credit purchases

---

#### **EMAIL-04: Add Credit Due Date Sweep to Daily Cron**
- **Depends on:** EMAIL-02 (uses `debtor-reminder.ts` template which already exists)
- **Files touched:**
  - `backend/src/jobs/reminders.cron.ts` (~line 120)
- **What to do:**
  1. Open `reminders.cron.ts`
  2. Locate `runDailySweep()` function
  3. After Phase 2 (overdue invoices), add Phase 3 call: `await sweepCreditDueDates();`
  4. Add `sweepCreditDueDates()` function (copy from Solution 3 above)
  5. Query finds credits with `dueDate <= today`, `status in [unpaid, partially_paid]`, `customerEmail not null`
  6. Send reminder email using existing `debtor-reminder.ts` template
  7. Update `lastReminderSentAt` timestamp
  8. Log audit entry `credit.reminder_sent`
- **Acceptance criteria:**
  - Cron runs daily at 00:30 Lagos time (existing schedule)
  - Finds credits due today or overdue
  - Sends one email per credit per day (max)
  - Updates `lastReminderSentAt` after successful send
  - Logs count of emails sent
  - Handles email failures gracefully (logs error, continues to next credit)
- **Verification:**
  ```bash
  # Manual trigger (for testing)
  cd backend
  npx tsx -e "import { runDailySweep } from './src/jobs/reminders.cron'; runDailySweep();"
  
  # Check logs for:
  # "Credit due date sweep: found X credits to notify"
  # "Credit due date sweep: sent Y/X emails"
  
  # Check database:
  SELECT id, customer_email, due_date, last_reminder_sent_at 
  FROM customer_credits 
  WHERE status IN ('unpaid', 'partially_paid') 
  AND due_date <= CURRENT_DATE;
  ```
- **Rollback:**
  ```bash
  git checkout backend/src/jobs/reminders.cron.ts
  ```
- **Effort estimate:** M (45 minutes including testing)
- **Risk if skipped:** Debtors never receive payment reminders, hurts cash flow

---

### ✅ NEXT Tier — Polish & Enhancements

#### **EMAIL-05: Add Email Delivery Status to API Responses**
- **Depends on:** EMAIL-01, EMAIL-03
- **Files touched:**
  - `backend/src/controllers/invoice.controller.ts`
  - `backend/src/controllers/credit.controller.ts`
- **What to do:**
  1. Update `sendInvoiceByEmail` controller response to include `emailDelivered: boolean`
  2. Update `createCredit` controller response to include `emailSent: boolean` in metadata
  3. Frontend can show toast: "Invoice sent to customer@example.com ✅" vs "Invoice created (email not sent)"
- **Acceptance criteria:**
  - API response includes email delivery status
  - Frontend can conditionally show success message
- **Verification:**
  - Check API response JSON includes `meta.emailDelivered` field
- **Rollback:**
  ```bash
  git checkout backend/src/controllers/invoice.controller.ts
  git checkout backend/src/controllers/credit.controller.ts
  ```
- **Effort estimate:** S (15 minutes)
- **Risk if skipped:** Frontend can't tell if email was sent successfully

---

#### **EMAIL-06: Update Frontend Invoice Detail to Show Email Sent Status**
- **Depends on:** EMAIL-05
- **Files touched:**
  - `frontend/src/pages/InvoiceDetail.tsx`
- **What to do:**
  1. After "Send via Email" button click succeeds
  2. Show toast: `"Invoice sent to ${invoice.customerEmail} ✅"`
  3. If `meta.emailDelivered === false`, show warning: `"Email logged (Resend not configured)"`
- **Acceptance criteria:**
  - User sees confirmation toast with customer email
  - Toast indicates if email was actually delivered vs logged
- **Verification:**
  - Manual UI test: send invoice, verify toast message
- **Rollback:**
  ```bash
  git checkout frontend/src/pages/InvoiceDetail.tsx
  ```
- **Effort estimate:** S (10 minutes)
- **Risk if skipped:** User doesn't get clear feedback on email delivery

---

#### **EMAIL-07: Add E2E Tests**
- **Depends on:** EMAIL-01, EMAIL-03, EMAIL-04
- **Files touched:**
  - `backend/tests/e2e/invoice.e2e.test.ts` (if exists) or `api.e2e.test.ts`
- **What to do:**
  1. Test invoice email sends to customer (not owner)
  2. Test credit creation sends email to debtor
  3. Test credit due date sweep finds and emails overdue credits
  4. Test email failure doesn't crash credit creation
- **Acceptance criteria:**
  - All tests pass
  - Email mock captures recipient addresses
  - Assertions verify correct emails sent
- **Verification:**
  ```bash
  cd backend
  npm run test:e2e -- --testNamePattern="invoice email|credit email"
  ```
- **Rollback:**
  ```bash
  git checkout backend/tests/e2e/
  ```
- **Effort estimate:** L (1-2 hours)
- **Risk if skipped:** No automated regression coverage

---

### 🟡 LATER Tier — Future Enhancements

#### **EMAIL-08: Resend/Retry Failed Emails**
- **Why deferred:** V1 assumes emails succeed or fail-fast; no retry queue
- **If implemented later:**
  - Add failed email queue (BullMQ + Redis)
  - Retry with exponential backoff
  - Admin dashboard to view failed emails
  - Effort: XL (multiple days)

#### **EMAIL-09: SMS Notifications via Termii**
- **Why deferred:** Email is sufficient for v1; SMS is premium feature
- **If implemented later:**
  - Add Termii integration (`backend/src/lib/sms/`)
  - Send SMS in parallel with email
  - SMS for high-urgency reminders (>7 days overdue)
  - Effort: L (1 day)

#### **EMAIL-10: Customer Email Verification**
- **Why deferred:** Adds friction to credit/invoice creation flow
- **If implemented later:**
  - Send verification OTP to customer email before creating credit
  - Reduces risk of typos in email addresses
  - Effort: M (half day)

---

## PHASE 5: MIGRATION STRATEGY

### Pre-Deployment Checklist
1. ✅ Resend API key configured in production (`RESEND_API_KEY` env var)
2. ✅ Test emails sent in staging environment
3. ✅ Email templates rendered correctly in email clients (Gmail, Outlook, Apple Mail)
4. ✅ Cron job tested manually (`runDailySweep()` executed successfully)
5. ✅ Audit logs verified for email events
6. ✅ Database backup taken

### Deployment Sequence
```bash
# Step 1: Deploy backend changes
cd backend
git pull origin main
npm install  # No new dependencies
npm run build
pm2 restart paymytax-backend

# Step 2: Verify cron is running
pm2 logs paymytax-backend --lines 50 | grep "Reminder cron"
# Should see: "Reminder cron registered" on startup

# Step 3: Manual test (optional)
curl -X POST https://api.paymytax.com/v1/businesses/{bizId}/invoices/{id}/send-email \
  -H "Authorization: Bearer {token}"
# Check customer email inbox

# Step 4: Monitor first daily cron sweep (next day at 00:30)
# Check logs for "Credit due date sweep: sent X emails"
```

### Rollback Plan
**If critical bug discovered post-deploy:**

1. **Invoice email bug:** Rollback `invoice.service.ts` only
   ```bash
   git revert <commit-sha>
   npm run build
   pm2 restart paymytax-backend
   ```

2. **Credit email causing crashes:** Comment out email block in `createCredit`
   ```typescript
   // Temporary rollback — comment out email sending
   // if (credit.customerEmail) { ... }
   ```

3. **Cron overwhelming email API:** Disable cron temporarily
   ```bash
   # Set env var to disable cron
   ENABLE_CRON=false pm2 restart paymytax-backend
   ```

---

## PHASE 6: RISK REGISTER

| Finding | Severity | Confidence | Evidence | Impact | Mitigation |
|---|:---:|:---:|---|---|---|
| Invoice email going to wrong recipient | 🔴 CRITICAL | HIGH | Existing code likely has `to: businessOwnerEmail` | Customers never receive invoices, broken UX | EMAIL-01 fixes this immediately |
| Email deliverability limits (Resend free tier) | 🟠 HIGH | HIGH | 100 emails/day free tier | Production scale will hit limits | Upgrade to paid plan ($20/month for 50K emails) before launch |
| Missing customerEmail causes silent failures | 🟡 MEDIUM | MEDIUM | `customerEmail` is optional field | Credits/invoices created but no notification sent | Already handled — validation throws 400 for invoices, silent skip for credits |
| Email failures crash credit creation | 🟡 MEDIUM | HIGH | Network I/O can fail | User experience degraded | EMAIL-03 wraps email in try/catch |
| Duplicate reminder emails | 🟡 MEDIUM | LOW | Cron could run multiple times if lock fails | Debtors annoyed by spam | Advisory lock (existing) + `lastReminderSentAt` check prevents duplicates |
| Email template rendering issues | 🟢 LOW | LOW | HTML email clients vary | Ugly emails on some clients | Test in major clients (Gmail, Outlook, Apple Mail) before deploy |

---

## PHASE 7: ARCHITECTURE SCORES

| Dimension | Score | Justification |
|---|:---:|---|
| **Correctness** | 9/10 | Fixes critical bug (invoice recipient). Adds essential automation. |
| **Email Infrastructure** | 9/10 | Already solid — Resend integration + templates exist. Just need routing. |
| **Error Handling** | 8/10 | Try/catch prevents email failures from crashing business logic. Logs errors. |
| **User Experience** | 9/10 | Instant email notifications improve professionalism + cash flow. |
| **Testability** | 7/10 | E2E tests deferred to EMAIL-07 (optional). Manual testing sufficient for v1. |
| **Scalability** | 6/10 | Resend free tier limits will be hit in production. Must upgrade. |
| **Overall** | **8/10** | High-value, low-risk improvements. One critical bug fix + two essential automations. |

---

## PHASE 8: FINAL VERDICT

### ✅ Current Biggest Strength
Email infrastructure already exists and is production-ready. Templates are professionally designed. Just need to wire up the triggers.

### 🔴 Critical Bug to Fix Immediately
**EMAIL-01:** Invoice emails going to business owner instead of customer. This must be fixed ASAP.

### 🎯 Highest-Value First Move
**EMAIL-01 + EMAIL-03** together — fix invoice recipient + add credit creation email. These two alone cover 80% of the business value.

### 📊 Overall Verdict
🟢 **Ready to implement.** 4 core work items (EMAIL-01 to EMAIL-04) can be completed in ~2 hours total. Low risk, high impact. Critical bug fix + essential automations that improve customer experience and cash flow.

---

## QUESTIONS FOR STAKEHOLDER

1. **Email sender address:** Should emails come from `noreply@paymytax.com` or `invoices@wallx.com`? (Configure in Resend dashboard)
2. **Business owner copy:** Should business owner receive BCC copy of every customer email, or just a daily summary?
3. **Reminder frequency:** Currently once per day. Should overdue credits get escalating reminders (e.g., day 7, day 14, day 30)?
4. **Email opt-out:** Should customers be able to unsubscribe from reminder emails? (Legal requirement in some jurisdictions)
5. **Resend plan:** Free tier (100 emails/day) sufficient for testing. Need paid plan ($20/month) before production launch?

---

## APPROVAL TO PROCEED

- [ ] Product owner reviewed and approved
- [ ] Resend API key configured in staging environment
- [ ] Test customer emails confirmed working
- [ ] Cron job schedule confirmed (00:30 Lagos time acceptable)

**Once approved, execute EMAIL-01 to EMAIL-04 in sequence. Estimated total effort: 2-3 hours (including testing).**

---

**END OF IMPLEMENTATION PLAN**
