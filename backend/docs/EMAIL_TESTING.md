# Email Testing Guide for WallXERP

## Overview

This guide covers testing all automated email scenarios in the WallXERP application.

## Email Scenarios Implemented

### 1. ✅ Welcome Email (On Signup)

- **Trigger**: User completes registration
- **Template**: `backend/src/lib/email/templates/welcome.ts`
- **Status**: Fully implemented (fire-and-forget)
- **Features**:
  - Personalized greeting with user email
  - Dashboard link
  - Getting started checklist
  - Professional HTML + plain text versions

### 2. ✅ Password Reset Email

- **Trigger**: User requests password reset via "Forgot Password"
- **Template**: `backend/src/lib/email/templates/password-reset.ts`
- **Status**: Fully implemented
- **Features**:
  - Secure reset link with token
  - 60-minute expiry
  - Professional HTML + plain text versions
  - Dev mode fallback (returns link in API response when email fails)

### 3. ✅ Payment Receipt Email

- **Trigger**: Tax payment successful (webhook or manual verification)
- **Template**: `backend/src/lib/email/templates/payment-receipt.ts`
- **Status**: Implemented
- **Features**:
  - Business name, amount, tax month
  - Transaction reference
  - Dashboard link

## Prerequisites

### 1. Resend Configuration

You already have Resend configured in `.env`:

```bash
RESEND_API_KEY=re_REPLACE_WITH_YOUR_RESEND_KEY
EMAIL_FROM=WallXERP <noreply@paymytax.ng>
```

### 2. Domain Verification

**CRITICAL**: Check if `paymytax.ng` is verified in your Resend dashboard:

1. Go to: https://resend.com/domains
2. Look for `paymytax.ng`
3. Status should be "Verified" (green checkmark)

**If not verified**:

- Emails will fail with "domain is not verified" error
- In development mode, they will fall back to console logging
- You need to add DNS records provided by Resend

**Quick fix for testing**: Use a Resend test domain or your own verified email:

```bash
EMAIL_FROM=WallXERP <onboarding@resend.dev>  # Resend's test domain
```

## Testing Methods

### Method 1: Automated Test Script (Recommended)

Run the comprehensive test script:

```bash
cd backend

# Test all email scenarios
npm run test:emails -- --email your@email.com

# Test specific scenario
npm run test:emails -- --email your@email.com --scenario welcome
npm run test:emails -- --email your@email.com --scenario reset
npm run test:emails -- --email your@email.com --scenario payment
```

**What it does**:

- Checks configuration
- Sends test emails for each scenario
- Shows delivery status
- Provides summary report

### Method 2: Real Flow Testing

#### A. Test Welcome Email (Signup)

```bash
# Start backend
cd backend
npm run dev

# Register a new user via API or frontend
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@12345"
  }'
```

**Expected**: Welcome email sent to `test@example.com`

#### B. Test Password Reset Email

```bash
# Request password reset
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected**:

- Password reset email sent
- In dev mode with email failure: API returns `resetLink` in response

#### C. Test Payment Receipt Email

This requires completing an actual payment flow:

1. Create a business
2. Add sales/expenses
3. Calculate tax
4. Make payment via Paystack
5. Payment webhook triggers email

Or test the payment service directly (requires existing payment record).

### Method 3: Manual Template Testing

Send individual templates via Node REPL:

```bash
cd backend
node --loader tsx/esm

# In Node REPL:
const { sendEmail } = await import('./src/lib/email/index.ts');
const { generateWelcomeHtml } = await import('./src/lib/email/templates/welcome.ts');

const result = await sendEmail({
  to: 'your@email.com',
  subject: 'Test',
  html: generateWelcomeHtml({
    userEmail: 'your@email.com',
    dashboardLink: 'http://localhost:5173/dashboard'
  })
});

console.log(result);
```

## Checking Results

### 1. Email Delivery

- Check inbox for test email
- Check spam/junk folder
- Check Resend dashboard logs: https://resend.com/emails

### 2. Backend Logs

Watch backend logs for email status:

```bash
cd backend
npm run dev

# Look for log entries:
# - "Email sent" (success)
# - "EMAIL (dev fallback)" (no API key)
# - "Resend domain not verified" (domain issue)
# - "Resend send failed" (other error)
```

### 3. Resend Dashboard

https://resend.com/emails

- View sent emails
- Check delivery status
- View email content
- See bounce/complaint reports

## Common Issues & Solutions

### Issue 1: "Domain is not verified"

**Symptom**: Emails fail with domain verification error

**Solution**:

```bash
# Option A: Verify your domain at https://resend.com/domains
# Add the DNS records they provide

# Option B: Use Resend test domain for testing
EMAIL_FROM=WallXERP <onboarding@resend.dev>
```

### Issue 2: Emails go to console only

**Symptom**: Logs show "EMAIL (dev fallback - RESEND_API_KEY not set)"

**Solution**:

```bash
# Check .env has valid API key
RESEND_API_KEY=re_REPLACE_WITH_YOUR_RESEND_KEY

# Verify API key is valid at https://resend.com/api-keys
# Restart backend server after .env changes
```

### Issue 3: Emails not received

**Check**:

1. Spam folder
2. Resend dashboard for delivery status
3. Email address spelling
4. Backend logs for errors

### Issue 4: Template rendering issues

**Solution**:

- Test templates individually with test script
- Check HTML/CSS in email client
- Some email clients strip certain styles

## Testing Checklist

Use this checklist to verify all email scenarios:

### Configuration

- [ ] `RESEND_API_KEY` is set in `.env`
- [ ] `EMAIL_FROM` is set with valid sender
- [ ] Domain is verified in Resend dashboard (or using test domain)
- [ ] `FRONTEND_URL` is correct

### Welcome Email

- [ ] Email sent on new user registration
- [ ] Email contains correct user email
- [ ] Dashboard link works
- [ ] HTML version looks professional
- [ ] Plain text version is readable
- [ ] Delivered to inbox (not spam)

### Password Reset Email

- [ ] Email sent when forgot password requested
- [ ] Reset link contains token
- [ ] Link format: `{FRONTEND_URL}/reset-password?token=...`
- [ ] Expiry time mentioned (60 minutes)
- [ ] HTML version looks professional
- [ ] Plain text version is readable
- [ ] Security warning included

### Payment Receipt Email

- [ ] Email sent after successful payment
- [ ] Contains business name
- [ ] Amount formatted correctly (₦ symbol)
- [ ] Tax month displayed
- [ ] Transaction reference included
- [ ] Dashboard link works

### Error Handling

- [ ] Registration doesn't fail if email fails
- [ ] Password reset doesn't expose user existence
- [ ] Email failures logged properly
- [ ] Dev mode fallback works (console logging)

## Status Summary

| Email Type          | Status       | Template | Integration    | Tested           |
| ------------------- | ------------ | -------- | -------------- | ---------------- |
| Welcome             | ✅ Complete  | ✅ Yes   | ✅ Wired       | 🟡 Needs testing |
| Password Reset      | ✅ Complete  | ✅ Yes   | ✅ Wired       | 🟡 Needs testing |
| Payment Receipt     | ✅ Complete  | ✅ Yes   | ✅ Wired       | 🟡 Needs testing |
| Tax Reminder        | ❌ Not wired | ❌ No    | ❌ No          | ❌ No            |
| Statement Delivered | ⚠️ Partial   | ❌ No    | ⚠️ Code exists | ❌ No            |

## Next Steps

1. **Immediate**: Run the test script to verify basic email sending works
2. **Domain Setup**: Verify `paymytax.ng` in Resend (or use test domain)
3. **Flow Testing**: Test actual signup and forgot password flows
4. **Production**: Update to live Resend API key before launch

## Production Checklist

Before going live:

- [ ] Switch to production Resend API key
- [ ] Verify production domain in Resend
- [ ] Test from production frontend URL
- [ ] Set up email monitoring/alerts
- [ ] Configure SPF/DKIM/DMARC for deliverability
- [ ] Test across major email clients (Gmail, Outlook, etc.)
- [ ] Set up bounce/complaint handling

## Support

**Resend Resources**:

- Dashboard: https://resend.com
- Docs: https://resend.com/docs
- API Keys: https://resend.com/api-keys
- Domains: https://resend.com/domains
- Email Logs: https://resend.com/emails

**WallXERP Email Implementation**:

- Email service: `backend/src/lib/email/index.ts`
- Templates: `backend/src/lib/email/templates/`
- Auth service integration: `backend/src/services/auth/auth.service.ts`
- Payment service integration: `backend/src/services/payment/tax-payment.service.ts`
