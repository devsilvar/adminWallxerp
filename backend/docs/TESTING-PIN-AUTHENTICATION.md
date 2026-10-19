# Voucher PIN Authentication - Production Testing Checklist

## ✅ Pre-Deployment Checklist

### Database Migration
- [ ] Run Prisma migration: `npx prisma migrate deploy`
- [ ] Verify schema changes: `npx prisma db pull` (check pin_hash, pin_attempts, pin_locked_until columns exist)
- [ ] Count existing cards without PINs: 
  ```sql
  SELECT COUNT(*) FROM customer_cards WHERE pin_hash IS NULL;
  ```

### PIN Migration for Existing Cards
- [ ] Run migration script in dry-run mode: `npx tsx scripts/migrate-generate-pins.ts --dry-run`
- [ ] Review dry-run output (check total, skipped counts)
- [ ] Run migration script live: `npx tsx scripts/migrate-generate-pins.ts`
- [ ] Verify all cards now have PINs:
  ```sql
  SELECT COUNT(*) FROM customer_cards WHERE pin_hash IS NULL;
  -- Should return 0
  ```

### Backend Deployment
- [ ] Restart backend service
- [ ] Check logs for startup errors
- [ ] Verify bcrypt module loaded: `npm list bcrypt`
- [ ] Test health endpoint: `curl http://localhost:3000/health`

### Frontend Deployment
- [ ] Deploy frontend build
- [ ] Clear browser cache
- [ ] Verify bundle loads without errors

---

## 🧪 Critical Test Scenarios

### Test 1: New Customer Card Creation
**Scenario:** Create a new customer with voucher card

**Steps:**
1. Navigate to Customers page
2. Click "Quick-Add Customer"
3. Fill: Name="Test User", Phone="08012345678", Email="test@example.com"
4. Submit

**Expected Results:**
- ✅ Customer created successfully
- ✅ Card created with PIN hash in database
- ✅ Email sent with 6-digit PIN and ATM card design
- ✅ Database: `pin_attempts = 0`, `pin_locked_until = NULL`

**SQL Verification:**
```sql
SELECT pin_hash, pin_attempts, pin_locked_until 
FROM customer_cards 
WHERE customer_id = 'uuid';
-- pin_hash should be a bcrypt hash (starts with $2b$12$)
```

---

### Test 2: Top-Up Existing Customer (Creates Card)
**Scenario:** Top-up a customer who doesn't have a card yet

**Steps:**
1. Create customer WITHOUT card (via API or direct DB insert)
2. Navigate to Customers page
3. Click "Top Up Voucher" on the customer
4. Enter amount: 5000, Submit

**Expected Results:**
- ✅ Card created with PIN
- ✅ Balance = 5000
- ✅ Email sent with PIN (ATM card design)
- ✅ Database: pin_hash populated

---

### Test 3: Successful Voucher Payment
**Scenario:** Complete a sale with correct PIN

**Setup:**
- Customer with card, balance = 5000, PIN = 123456, phone ends in 5678

**Steps:**
1. Go to Sales → New Sale
2. Select "Store Voucher" payment
3. Select customer
4. Enter correct PIN: 123456
5. Enter correct last-4: 5678
6. Amount: 1000, Submit

**Expected Results:**
- ✅ Sale created successfully
- ✅ Balance deducted: 5000 → 4000
- ✅ Deduction receipt email sent
- ✅ Database: `pin_attempts` reset to 0
- ✅ `sales_transactions.metadata` does NOT contain `voucherPin` or `voucherLast4`

**SQL Verification:**
```sql
-- Verify PIN not in metadata
SELECT metadata FROM sales_transactions 
WHERE id = 'sale-uuid';
-- Should NOT contain "voucherPin" or "voucherLast4"

-- Verify attempts reset
SELECT pin_attempts FROM customer_cards WHERE id = 'card-uuid';
-- Should be 0
```

---

### Test 4: Wrong PIN (Progressive Lockout)
**Scenario:** Test progressive lockout after failed attempts

**Steps:**
1. Attempt 1: Enter wrong PIN → Should fail, attempts = 1
2. Attempt 2: Enter wrong PIN → Should fail, attempts = 2
3. Attempt 3: Enter wrong PIN → Should fail, attempts = 3, **LOCKED for 15 minutes**
4. Attempt 4 (immediate): Try any PIN → Should return **423 LOCKED** error with retry time
5. Wait 15 minutes OR manually clear lock in DB
6. Attempt 5: Enter wrong PIN → Should fail, attempts = 4
7. Attempt 6: Enter wrong PIN → Should fail, attempts = 5, **LOCKED for 1 hour**

**Expected Results:**
- ✅ Attempts increment correctly (1, 2, 3, 4, 5)
- ✅ Lockout triggers at 3 attempts (15min) and 5 attempts (1hr)
- ✅ 423 error shows `pinLockedUntil` timestamp
- ✅ No sale created on any failed attempt
- ✅ Failed attempts persisted even though TX rolled back

**SQL Verification:**
```sql
SELECT pin_attempts, pin_locked_until 
FROM customer_cards 
WHERE id = 'card-uuid';

-- After 3 failures: pin_attempts = 3, pin_locked_until = NOW() + 15 minutes
-- After 5 failures: pin_attempts = 5, pin_locked_until = NOW() + 1 hour
```

---

### Test 5: Wrong Last-4 Phone
**Scenario:** Correct PIN but wrong phone verification

**Steps:**
1. Enter correct PIN: 123456
2. Enter wrong last-4: 9999 (actual is 5678)
3. Submit

**Expected Results:**
- ✅ Payment fails with "Phone verification failed"
- ✅ Attempts increment
- ✅ No sale created
- ✅ Lockout triggers after 3 failures

---

### Test 6: Insufficient Balance
**Scenario:** PIN correct but balance too low

**Setup:**
- Customer balance = 500, Sale amount = 1000

**Steps:**
1. Enter correct PIN and last-4
2. Submit

**Expected Results:**
- ✅ Payment fails with "Insufficient voucher balance"
- ✅ Attempts NOT incremented (auth succeeded)
- ✅ No sale created
- ✅ No lockout triggered

---

### Test 7: Customer Without Phone Number
**Scenario:** Card exists but customer has NULL phone

**Setup:**
- Manually set customer.phone = NULL in database

**Steps:**
1. Attempt voucher payment

**Expected Results:**
- ✅ Payment fails with "Phone verification failed"
- ✅ Attempts increment
- ✅ System does not crash (NULL handling works)

---

### Test 8: Card Without PIN Hash
**Scenario:** Legacy card without PIN (should be none after migration)

**Setup:**
- Manually set `pin_hash = NULL` in database

**Steps:**
1. Attempt voucher payment

**Expected Results:**
- ✅ Payment fails with 500 error: "Card PIN not initialized. Please contact support."
- ✅ Attempts NOT incremented (can't verify against NULL)
- ✅ Clear error message for support escalation

---

### Test 9: Resend PIN (Manager/Owner)
**Scenario:** Customer lost their PIN

**Steps:**
1. As manager/owner, go to Customers page
2. Click KeyRound (🔑) icon on customer row
3. Check customer email

**Expected Results:**
- ✅ Toast notification: "New PIN sent to customer email"
- ✅ Email received with NEW 6-digit PIN
- ✅ Old PIN no longer works
- ✅ New PIN works for payment
- ✅ Database: `pin_attempts` reset to 0, `pin_locked_until` cleared
- ✅ Audit log created

**SQL Verification:**
```sql
SELECT pin_attempts, pin_locked_until FROM customer_cards WHERE id = 'uuid';
-- Should be: pin_attempts = 0, pin_locked_until = NULL

SELECT * FROM audit_logs 
WHERE resource_type = 'customer_card' 
AND action = 'card.pin_resent' 
ORDER BY created_at DESC LIMIT 1;
```

---

### Test 10: Change PIN
**Scenario:** Customer wants to change their PIN

**Steps:**
1. As manager/owner, click Lock (🔒) icon on customer row
2. Enter old PIN: 123456
3. Enter new PIN: 654321
4. Enter last-4 phone: 5678
5. Submit

**Expected Results:**
- ✅ Success message: "Voucher PIN changed successfully"
- ✅ Email sent with NEW PIN
- ✅ Old PIN no longer works
- ✅ New PIN works for payments
- ✅ Attempts reset, lock cleared
- ✅ Audit log created

**Failure Cases:**
- Wrong old PIN → Fails, attempts increment
- Wrong last-4 → Fails, attempts increment
- After 3 failures → Account locks for 15 minutes

---

### Test 11: Concurrent Failed Attempts (Race Condition)
**Scenario:** Two simultaneous wrong PIN attempts

**Steps:**
1. Open two browser tabs
2. Start voucher payment in both (same customer)
3. Submit wrong PIN in BOTH tabs simultaneously

**Expected Results:**
- ✅ Both requests fail
- ✅ Attempts increment correctly (atomic increment prevents race)
- ✅ Final count should be 2 (not 1 due to race)

**SQL Verification:**
```sql
SELECT pin_attempts FROM customer_cards WHERE id = 'uuid';
-- Should be exactly 2, not 1
```

---

### Test 12: Email Delivery Failures
**Scenario:** SMTP server down during PIN issuance

**Setup:**
- Temporarily break SMTP config or disconnect network

**Steps:**
1. Create new customer with card (triggers PIN email)

**Expected Results:**
- ✅ Card created successfully (DB write succeeds)
- ✅ PIN hash stored in database
- ✅ No exception thrown to user
- ✅ Warning logged: "Failed to dispatch voucher notification email"
- ✅ Customer can still use card (PIN exists in DB)
- ✅ Manager can resend PIN manually later

---

## 🔒 Security Verification

### No Plaintext PINs in Database
```sql
-- MUST return 0 rows
SELECT * FROM sales_transactions 
WHERE metadata::text LIKE '%voucherPin%';

SELECT * FROM sales_transactions 
WHERE metadata::text LIKE '%voucherLast4%';
```

### Bcrypt Hash Format
```sql
-- All hashes should start with $2b$12$
SELECT pin_hash FROM customer_cards 
WHERE pin_hash NOT LIKE '$2b$12$%';
-- Should return 0 rows
```

### Lockout Data Integrity
```sql
-- Check for orphaned locks (locked but no attempts)
SELECT * FROM customer_cards 
WHERE pin_locked_until IS NOT NULL 
AND pin_attempts = 0;
-- Should return 0 rows

-- Check for high attempts without lock
SELECT * FROM customer_cards 
WHERE pin_attempts >= 3 
AND pin_locked_until IS NULL;
-- Should return 0 rows (or expired locks)
```

---

## 📊 Performance Testing

### Load Test: Concurrent Payments
- 10 simultaneous voucher payments (different customers)
- All should complete without deadlocks
- Pessimistic locking prevents race conditions

### Database Query Performance
```sql
-- Check for missing indexes
EXPLAIN ANALYZE 
SELECT * FROM customer_cards WHERE customer_id = 'uuid';
-- Should use index on customer_id
```

---

## 🚨 Rollback Plan

If critical issues found in production:

1. **Immediate:** 
   - Disable voucher payment source in frontend (hide option)
   - Add feature flag check in backend validator

2. **Database Rollback:**
   ```sql
   -- Rollback migration (dangerous - loses PIN data)
   ALTER TABLE customer_cards DROP COLUMN pin_hash;
   ALTER TABLE customer_cards DROP COLUMN pin_attempts;
   ALTER TABLE customer_cards DROP COLUMN pin_locked_until;
   ```

3. **Code Rollback:**
   - Redeploy previous version
   - Restore OTP system from git history

---

## ✅ Sign-Off

- [ ] All 12 test scenarios passed
- [ ] Security verification queries return 0 rows
- [ ] Performance acceptable under load
- [ ] Migration script completed without errors
- [ ] Email delivery working correctly
- [ ] Audit logs capturing all PIN operations
- [ ] Rollback plan documented and understood

**Tested By:** ________________  
**Date:** ________________  
**Production Ready:** ☐ YES  ☐ NO (explain: _______________)
