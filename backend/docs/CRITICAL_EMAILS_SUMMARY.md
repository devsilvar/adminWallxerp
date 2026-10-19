# Critical Emails - Quick Reference

## ✅ Already Working (3)
1. **Welcome Email** - User signup
2. **Password Reset** - Forgot password
3. **Payment Successful** - Tax payment confirmed

---

## ❌ CRITICAL GAPS - Need ASAP (5)

### Money Movement (Most Critical)
4. **Withdrawal Requested** - User requests payout to bank
5. **Withdrawal Completed** - Money sent to bank
6. **Withdrawal Failed/Rejected** - Payout didn't go through
7. **Payment Failed** - Tax payment declined/failed

### Security
8. **Account Deactivated** - Admin disabled account

---

## ⚠️ Important But Can Wait (3)

9. **Payment Refunded** - Money returned
10. **Tax Payment Overdue** - Late payment alert
11. **Admin: Withdrawal Approval Needed** - Notify admin to approve

---

## 📊 Priority Ranking

**Must have before launch:**
- ❌ Withdrawal emails (4, 5, 6) - **Users will withdraw money, need confirmation**
- ❌ Payment failed (7) - **Users need to know and retry**
- ❌ Account deactivated (8) - **Legal requirement**

**Important for trust:**
- Payment refunded (9)
- Tax overdue (10)

**Operational:**
- Admin notifications (11)

---

## Implementation Estimate

| Email | Template Work | Integration | Testing | Total |
|-------|--------------|-------------|---------|-------|
| Withdrawal Requested | 2 hours | 1 hour | 1 hour | 4 hours |
| Withdrawal Completed | 2 hours | 1 hour | 1 hour | 4 hours |
| Withdrawal Failed | 2 hours | 1 hour | 1 hour | 4 hours |
| Payment Failed | 2 hours | 1 hour | 1 hour | 4 hours |
| Account Deactivated | 2 hours | 1 hour | 1 hour | 4 hours |

**Total for critical gaps: ~20 hours (2-3 days)**

---

## See Full Details
📄 `backend/docs/CRITICAL_EMAIL_SCENARIOS.md` - Complete analysis with examples
