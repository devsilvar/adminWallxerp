# Critical Automated Email Scenarios - WallXERP

**Priority**: HIGH - Essential for trust, compliance, and business operations  
**Focus**: Only mission-critical emails that affect money, security, or compliance

---

## Philosophy

**What makes an email "critical"?**

- Involves money movement (payments, withdrawals, refunds)
- Security events (account changes, suspicious activity)
- Compliance requirements (tax deadlines, NRS remittance)
- User expects confirmation (they took an action, need proof)

**Excluded** (Nice-to-have, not critical):

- Marketing emails
- Feature announcements
- General reminders that aren't time-sensitive
- Tips and tutorials

---

## CRITICAL EMAILS (11 Total)

### 🔐 SECURITY & ACCOUNT (3 emails)

#### 1. ✅ Welcome Email (Registration)

**Status**: Already implemented ✅  
**Trigger**: User completes signup  
**Why Critical**: First touchpoint, sets expectations, provides access link  
**Template**: `welcome.ts`  
**Priority**: ESSENTIAL

#### 2. ✅ Password Reset

**Status**: Already implemented ✅  
**Trigger**: User requests password reset  
**Why Critical**: Security - user needs the link to regain access  
**Template**: `password-reset.ts`  
**Priority**: ESSENTIAL

#### 3. ❌ Account Deactivated by Admin

**Status**: NOT IMPLEMENTED  
**Trigger**: Admin deactivates a user account via `toggleUserStatus()`  
**Why Critical**:

- User suddenly can't log in
- They need to know why (security, compliance, violation)
- Provides contact info for appeal
- Legal requirement in some jurisdictions

**Recommendation**: IMPLEMENT ASAP

**Template Needs**:

```
Subject: Your WallXERP Account Has Been Deactivated
Content:
- Clear reason (if provided by admin)
- Effective date
- What happens to their data
- Support contact for questions
- Next steps (appeal process if applicable)
```

---

### 💰 MONEY MOVEMENT (5 emails)

#### 4. ✅ Payment Successful (Tax Payment)

**Status**: Already implemented ✅  
**Trigger**: Tax payment confirmed (Paystack webhook or manual verify)  
**Why Critical**:

- Proof of payment to NRS
- User needs confirmation for their records
- Receipt for tax compliance
  **Template**: `payment-receipt.ts`  
  **Priority**: ESSENTIAL

#### 5. ❌ Payment Failed

**Status**: NOT IMPLEMENTED  
**Trigger**: Tax payment attempt fails (Paystack webhook `charge.failed`)  
**Why Critical**:

- User thinks payment succeeded but it didn't
- Tax deadline may pass if they don't retry
- Fraud detection (card declined, insufficient funds)

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: Tax Payment Failed - Action Required
Content:
- Amount attempted
- Reason for failure (from Paystack)
- Link to retry payment
- Support contact
- Deadline reminder if approaching
```

#### 6. ❌ Payment Refunded

**Status**: NOT IMPLEMENTED  
**Trigger**: Payment refunded (admin action, duplicate payment, error)  
**Why Critical**:

- Money coming back to customer's account
- User needs to know why
- Accounting reconciliation

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: Tax Payment Refunded - ₦X,XXX.XX
Content:
- Original payment reference
- Refund amount
- Reason for refund
- Expected refund timeline (Paystack: 5-7 business days)
- Tax period affected
```

#### 7. ❌ Withdrawal Requested (Payout to Bank)

**Status**: NOT IMPLEMENTED  
**Trigger**: User requests withdrawal via `withdrawBalance()`  
**Why Critical**:

- Confirmation of withdrawal request
- Shows status (pending admin approval OR processing if auto-payout)
- Reference number for tracking
- Security (detect unauthorized withdrawal attempts)

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: Withdrawal Request Received - ₦X,XXX.XX
Content:
- Amount requested
- Fee charged
- Net amount to receive
- Destination bank account (masked)
- Transfer reference
- Status (pending approval / processing)
- Expected timeline
- Note: If unauthorized, contact support immediately
```

#### 8. ❌ Withdrawal Completed

**Status**: NOT IMPLEMENTED  
**Trigger**: Payout completed successfully (Paystack transfer success)  
**Why Critical**:

- Confirmation money has left the platform
- User expects this notification
- Proof of completed transaction
- Reference for bank reconciliation

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: Withdrawal Completed - ₦X,XXX.XX Sent
Content:
- Amount sent to bank
- Destination account (masked)
- Transfer reference
- Date/time completed
- Receipt/PDF download link
- Expected arrival time in bank (instant for most Nigerian banks)
```

#### 9. ❌ Withdrawal Failed/Rejected

**Status**: NOT IMPLEMENTED  
**Trigger**:

- Admin rejects withdrawal request
- Paystack transfer fails
- Bank account invalid

**Why Critical**:

- Money is still in their account (funds unreserved)
- User expects the money and needs to know it failed
- May need to update bank details and retry
- Fraud prevention (wrong account)

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: Withdrawal Failed - Funds Returned to Balance
Content:
- Amount
- Reason for failure (admin rejection reason / bank error)
- Funds returned to available balance
- Action required (update bank details / contact support)
- Link to retry or update settlement account
```

---

### 📊 TAX COMPLIANCE (2 emails)

#### 10. ❌ Tax Report Finalized

**Status**: NOT IMPLEMENTED  
**Trigger**: User finalizes monthly tax report via `finalizeReport()`  
**Why Critical**:

- Locks the report (can't edit anymore)
- User needs confirmation of what was locked
- Shows tax payable amount
- Record for their files before payment

**Recommendation**: CONSIDER IMPLEMENTING

**Template Needs**:

```
Subject: Tax Report Finalized - {Month Year}
Content:
- Tax period
- Total sales, expenses, profit
- Tax payable (7.5%)
- Status: Finalized (locked)
- Payment due date
- Link to pay now
- PDF download of finalized report
```

**Note**: This is borderline critical. User is already on the platform when they finalize, so they see the confirmation screen. Email is for their records.

#### 11. ❌ Tax Payment Overdue

**Status**: PARTIALLY IMPLEMENTED (reminder system exists, email not wired)  
**Trigger**: Tax report finalized but unpaid after due date  
**Why Critical**:

- NRS compliance - penalties for late payment
- User may have forgotten
- Business reputation risk
- Legal consequences

**Recommendation**: IMPLEMENT (wire existing reminder to email)

**Template Needs**:

```
Subject: URGENT: Tax Payment Overdue - {Month Year}
Content:
- Tax period
- Amount owed
- Original due date
- Days overdue
- Potential NRS penalties
- Link to pay immediately
- Support contact
- Reminder of compliance importance
```

---

## BONUS: IMPORTANT BUT LOWER PRIORITY (Consider Later)

### 12. DVA Transaction Auto-Captured

**Status**: In-app reminder exists, email not wired  
**Trigger**: Dedicated Virtual Account receives a bank transfer  
**Why Somewhat Important**:

- User may not be logged in when money arrives
- Good to know their DVA is working
- Confirmation of auto-booking

**Priority**: Medium (nice-to-have, not critical)  
**Why Not Critical**: Money is already in their account and showing in sales. Email is just FYI.

### 13. Invoice Overdue (Customer Owes Them Money)

**Status**: In-app reminder exists, email not wired  
**Trigger**: Invoice past due date  
**Why Somewhat Important**:

- Helps user chase customers
- Cash flow management

**Priority**: Medium  
**Why Not Critical**: This is business-to-customer collections, not platform-to-user. User can check dashboard.

---

## ADMIN-SIDE CRITICAL EMAILS

### 14. ❌ Withdrawal Approval Needed (Admin Notification)

**Status**: NOT IMPLEMENTED  
**Trigger**: User requests withdrawal (when auto-payout disabled)  
**Why Critical**:

- Admin needs to approve manually
- Prevents user waiting indefinitely
- SLA management (admin should respond within X hours)

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: [ADMIN] Withdrawal Approval Required - ₦X,XXX.XX
To: Admin email(s)
Content:
- Business name
- Amount requested
- User details
- Settlement account
- Link to admin approval page
- Time requested
```

### 15. ❌ High-Value Withdrawal Alert (Admin Notification)

**Status**: NOT IMPLEMENTED  
**Trigger**: Withdrawal request exceeds threshold (e.g., ₦500,000)  
**Why Critical**:

- Fraud prevention
- Large money movement oversight
- Risk management

**Recommendation**: IMPLEMENT

**Template Needs**:

```
Subject: [ADMIN ALERT] High-Value Withdrawal - ₦X,XXX,XXX.XX
To: Admin email(s)
Content:
- Business name
- Amount (highlighted if abnormally large)
- User history (first withdrawal? usual pattern?)
- Settlement account
- Fraud score/flags
- Link to review and approve/reject
```

---

## IMPLEMENTATION PRIORITY

### PHASE 1: IMMEDIATE (Within 1 week)

**Must-haves before launch:**

1. ✅ Welcome Email - DONE
2. ✅ Password Reset - DONE
3. ✅ Payment Successful - DONE
4. ❌ **Payment Failed** - CRITICAL GAP
5. ❌ **Account Deactivated** - CRITICAL GAP
6. ❌ **Withdrawal Requested** - CRITICAL GAP
7. ❌ **Withdrawal Completed** - CRITICAL GAP
8. ❌ **Withdrawal Failed** - CRITICAL GAP

### PHASE 2: BEFORE PRODUCTION (Within 2 weeks)

**Important for compliance:**

9. ❌ Tax Payment Overdue
10. ❌ Payment Refunded
11. ❌ Admin: Withdrawal Approval Needed

### PHASE 3: POST-LAUNCH (Within 1 month)

**Nice-to-have:**

12. Tax Report Finalized (record-keeping)
13. Admin: High-Value Withdrawal Alert
14. DVA Transaction Auto-Captured
15. Invoice Overdue

---

## IMPLEMENTATION CHECKLIST

For each email above, you need:

### 1. Email Template

- [ ] HTML version (professional design)
- [ ] Plain text version (email client compatibility)
- [ ] Template file in `backend/src/lib/email/templates/`
- [ ] Dynamic data (amounts, dates, names, links)

### 2. Integration Point

- [ ] Identify trigger in code (webhook, service function, etc.)
- [ ] Call `sendEmail()` fire-and-forget (non-blocking)
- [ ] Handle email send failures gracefully
- [ ] Log email attempt (Winston)

### 3. Testing

- [ ] Test template rendering
- [ ] Test with real data
- [ ] Test failure scenarios
- [ ] Mobile email client test
- [ ] Spam filter test

### 4. Compliance

- [ ] Unsubscribe link (if marketing-related)
- [ ] Company address in footer
- [ ] Privacy policy link
- [ ] NDPR compliance (Nigerian data protection)

---

## CURRENT STATUS SUMMARY

| Email Scenario           | Status     | Priority     | Action                 |
| ------------------------ | ---------- | ------------ | ---------------------- |
| Welcome                  | ✅ Live    | Essential    | None - working         |
| Password Reset           | ✅ Live    | Essential    | None - working         |
| Payment Successful       | ✅ Live    | Essential    | None - working         |
| **Payment Failed**       | ❌ Missing | **Critical** | **IMPLEMENT NOW**      |
| **Account Deactivated**  | ❌ Missing | **Critical** | **IMPLEMENT NOW**      |
| **Withdrawal Requested** | ❌ Missing | **Critical** | **IMPLEMENT NOW**      |
| **Withdrawal Completed** | ❌ Missing | **Critical** | **IMPLEMENT NOW**      |
| **Withdrawal Failed**    | ❌ Missing | **Critical** | **IMPLEMENT NOW**      |
| Payment Refunded         | ❌ Missing | Important    | Implement Phase 2      |
| Tax Overdue              | ⚠️ Partial | Important    | Wire existing reminder |
| Tax Finalized            | ❌ Missing | Optional     | Consider Phase 3       |
| DVA Auto-Capture         | ⚠️ Partial | Optional     | Phase 3                |
| Invoice Overdue          | ⚠️ Partial | Optional     | Phase 3                |

---

## INTEGRATION POINTS (Where to Add Email Calls)

### Payment Failed

**File**: `backend/src/services/payment/payment-webhook.service.ts`  
**Function**: Webhook handler for `charge.failed` event  
**Current**: Logs failure, updates payment record  
**Add**: Fire `sendPaymentFailedEmail(user, business, payment, failureReason)`

### Account Deactivated

**File**: `backend/src/services/admin/admin.service.ts`  
**Function**: `toggleUserStatus()` line 144  
**Current**: Updates isActive flag, logs audit  
**Add**: If `isActive === false`, fire `sendAccountDeactivatedEmail(user, reason)`

### Withdrawal Requested

**File**: `backend/src/modules/wallet/services/merchant-payout.service.ts`  
**Function**: `withdrawBalance()` around line 160  
**Current**: Creates payout record, logs audit  
**Add**: Fire `sendWithdrawalRequestedEmail(user, business, payout)`

### Withdrawal Completed

**File**: `backend/src/modules/wallet/services/admin-payout.service.ts` (or webhook handler)  
**Function**: After Paystack transfer success  
**Current**: Updates payout status to 'completed'  
**Add**: Fire `sendWithdrawalCompletedEmail(user, business, payout)`

### Withdrawal Failed

**File**: `backend/src/modules/wallet/services/admin-payout.service.ts`  
**Function**: Admin rejection OR Paystack transfer failure  
**Current**: Updates status to 'failed'/'rejected'  
**Add**: Fire `sendWithdrawalFailedEmail(user, business, payout, reason)`

---

## DESIGN CONSISTENCY

All critical emails should follow this structure:

### Email Anatomy

1. **Header**: WallXERP logo, colored accent bar
2. **Status Badge**: Visual indicator (Success/Failed/Alert)
3. **Main Content**: Clear, concise, action-oriented
4. **Key Details Box**: Amount, reference, date (styled table)
5. **CTA Button**: Primary action (View Details / Retry / Contact Support)
6. **Footer**: Company info, support links, legal disclaimers

### Tone

- **Money movement**: Formal, factual, reassuring
- **Failures**: Empathetic, solution-oriented, urgent but not alarming
- **Security**: Serious, clear consequences, immediate action
- **Compliance**: Professional, deadline-focused, legal language

---

## EXAMPLE: Payment Failed Email Structure

```html
Subject: Tax Payment Failed - Action Required [WallXERP Header with red accent bar] ❌ Payment
Failed Hi [First Name], We were unable to process your tax payment for [Month Year].
┌─────────────────────────────┐ │ Amount: ₦XX,XXX.XX │ │ Reason: [Paystack msg] │ │ Reference:
TXN-XXXXXXXX │ │ Time: [timestamp] │ └─────────────────────────────┘ What to do next: - Check your
card has sufficient funds - Verify card is not expired - Try a different payment method - Contact
your bank if card is declined [Retry Payment Button] Tax Deadline: [Date] - [X days remaining] Need
help? Contact support@wallxerp.com [Footer: Company address, privacy policy, etc.]
```

---

## METRICS TO TRACK

Once emails are implemented, monitor:

1. **Delivery Rate**: % of emails successfully delivered
2. **Open Rate**: % of delivered emails opened
3. **Click Rate**: % of emails with CTA clicked
4. **Bounce Rate**: % of emails that bounced (invalid email)
5. **Response Time**: Time from email to user action (e.g., retry payment)
6. **Support Tickets**: Reduction in "I didn't receive confirmation" tickets

**Goal**: 95%+ delivery, 60%+ open rate for transactional emails

---

## CONCLUSION

**Critical Gaps to Close:**

- 5 withdrawal/payout emails (money movement = trust)
- 1 payment failure email (prevents lost revenue + missed tax deadlines)
- 1 account deactivation email (legal + security)

**Recommendation**: Focus on Phase 1 (withdrawal emails + payment failed) before production launch. These are essential for a fintech product handling real money.

**Next Steps**:

1. Create email templates for Phase 1 emails
2. Wire them into service functions
3. Test with real Paystack test scenarios
4. Document in `EMAIL_TEST_RESULTS.md`

---

**Document Version**: 1.0  
**Last Updated**: September 25, 2026  
**Prepared By**: Kiro AI Assistant
