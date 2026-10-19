# PayMyTax & Paystack Settlement Architecture — Master Implementation Plan (paymentFinalpaystack.md)

> **Document Status:** Production-Hardened Fintech Implementation Blueprint (v2.0 Senior Review)  
> **Engineering Level:** Senior Fintech Principal Engineer (Paystack, NIBSS, Core Banking & Subaccount Settlement Infrastructure)  
> **Repository Context:** PayMyTax by WallX (`backend/`, `frontend/`, PostgreSQL via Prisma, Express 5, React 19)  
> **Scope:** Modal Percentage Box Removal, Paystack T+1 Auto-Routing Deep-Dive, Subaccount Settlement Reconciliation, and Wallet Balance Release.

---

## 1. Deep-Dive: Paystack T+1 Auto-Routing & Settlement Architecture

### 1.1 What Does "Auto-Routed to Bank (T+1)" Mean?
In Paystack's architecture, when a business enables **Split Payments / Subaccounts**:
1. **The Inflow Event**: A customer transfers money (e.g. ₦800.00) into the merchant's Dedicated Virtual Account (DVA).
2. **The Gateway Split**: Paystack's split engine divides the incoming amount at the moment of capture based on the configured split percentage:
   - **Platform Retained (Tax Share, e.g. 7.5%)**: Retained on the platform main account (`₦60.00`).
   - **Subaccount Share (Revenue Share, e.g. 92.5%)**: Automatically allocated to the merchant's subaccount (`₦740.00`).
3. **The T+1 Clearing Cycle**:
   - **"T"** = Transaction Day (the day the payment was made).
   - **"T+1"** = Transaction Day + 1 business day (excluding Nigerian weekends and public holidays).
   - In **Live Mode**, Paystack executes an automated settlement batch between **4:00 AM and 9:00 AM WAT** on day $T+1$, sweeping the subaccount's accumulated balance directly through **NIBSS Instant Payment (NIP)** into the merchant's commercial bank account (OPay, GTBank, Zenith, Access, etc.).
   - The merchant does **not** need to request a withdrawal for this portion—Paystack settles it automatically.

### 1.2 Live Mode vs. Test Mode Reality
* **In LIVE Mode (`sk_live_...`)**:
  - The money **DOES** drop directly into the merchant's real bank account (OPay) on the morning of $T+1$.
* **In TEST Mode (`sk_test_...`)**:
  - Paystack's test environment is a sandbox simulation.
  - Subaccount splits and settlements are purely simulated records.
  - **No real money moves across NIBSS to any real Nigerian bank or OPay account in test mode.**
  - Because [`backend/.env`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/.env) is configured with `sk_test_...`, the ₦740 is sandbox simulated data.

### 1.3 Where to Check This on Your Paystack Dashboard
To inspect the subaccount split and settlement records directly inside Paystack:
1. Log in to your Paystack Dashboard: **[https://dashboard.paystack.com](https://dashboard.paystack.com)**.
2. In the top corner, verify the mode toggle is set to **"Test Mode"** (matching your `.env` test keys).
3. **Transactions Page** (`/transactions`):
   - Find the `₦800.00` transaction.
   - Click on it to open the transaction drawer.
   - Look under **"Split Details"**:
     - Subaccount (`ACCT_l0jz8gnaqyjmbru`): `₦740.00`
     - Main Account: `₦60.00`
4. **Subaccounts Page** (`/subaccounts`):
   - You will see your settlement bank account (OPay) registered under subaccount code `ACCT_l0jz8gnaqyjmbru`.
5. **Settlements Page** (`/settlements`):
   - In live mode, all automated daily payouts appear here with NIBSS clearing reference numbers, status, and bank credit timestamps. In test mode, it will only list mock test settlement entries.

---

## 2. The Problem: Why ₦740 Keeps Staying in "Auto-Routed to Bank" & How to Fix It

### 2.1 The Root Cause in the Database
* In our database, transaction `68244216` (amount: ₦800.00) has:
  ```json
  {
    "id": "68244216-...",
    "amount": 800.00,
    "settledViaSplit": true,
    "splitPct": 7.5,
    "platformRetained": 60.00
  }
  ```
* In [`settlement.service.ts`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/settlement.service.ts), the formula computes:
  ```ts
  const platformHeldFunds = totalPlainInflows (300) + totalPlatformRetained (60) = 360.00;
  const totalSplitSettled = totalInflowsAll (1100) - platformHeldFunds (360) = 740.00;
  ```
* Because `settledViaSplit` is `true`, the system treats ₦740 as having already been paid out to your bank by Paystack!
* Consequently:
  1. It locks ₦740 away from your withdrawable platform funds.
  2. Your Wallet Balance is only **₦360.00** instead of the full **₦1,100.00**.
  3. The Account page and Transaction History persistently show `Auto-routed to bank (T+1): ₦740.00`.

### 2.2 The Solution: Release the ₦740 to Your Wallet Balance
We will run a targeted database fix script ([`backend/scripts/fix-split-transaction.ts`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/scripts/fix-split-transaction.ts)):
1. Target transaction `68244216` for business `Findme` (`0ca4c440-5358-4ac6-923c-71317014baf7`).
2. Update:
   - `settledViaSplit: false`
   - `platformRetained: null`
   - `splitPct: null`
3. Include an audit log record (`sale.reclassified_split_to_plain`) for compliance.
4. **The Immediate Systemic Effect**:
   - `totalPlainInflows` increases to **₦1,100.00**.
   - `totalPlatformRetained` drops to **₦0.00**.
   - `platformHeldFunds` becomes the full **₦1,100.00**!
   - `totalSplitSettled` drops to **₦0.00**!
   - "Auto-routed to bank (T+1)" completely disappears from the Account page breakdown.
   - Your **Wallet Balance** immediately jumps from ₦360 to the full **₦1,100.00**!
   - On `/transactions`, the 4 summary cards show:
     - `Money Received (+)`: `+₦1,100.00`
     - `Transfers to Bank (-)`: `₦0.00`
     - `Tax Remitted (-)`: `₦0.00`
     - `Digital Bank Balance`: **₦1,100.00**
   - You now have all ₦1,100 available in your wallet to test withdrawals with no funds locked or trapped.

---

## 3. UI Update: Removing Percentage Boxes from "Withdraw Funds" Modal

### 3.1 What Will Be Changed
In [`frontend/src/components/PayoutWithdrawalModal.tsx`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/PayoutWithdrawalModal.tsx):
1. **Remove** the `[25%]`, `[50%]`, and `[75%]` percentage quick-select chip row (lines 381–406).
2. **Remove** the unused `handleQuickPercent` function (lines 92–102) to maintain zero TypeScript lint warnings.
3. **Embed** a sleek **`Max`** button directly inside the input container on the right (similar to Binance, OPay, and Moniepoint standards).
4. **Retain** the clean numerical input with Naira prefix (`₦`), minimum withdrawal badge (`Min: ₦100.00`), transfer fee guidance, and real-time fee calculation card.

### 3.2 Before & After UI Specification
```
BEFORE:
┌─────────────────────────────────────────────────────────┐
│ Withdrawal Amount                        Min: ₦100.00   │
│ [ ₦  0.00                                             ] │
│ [ 25% ]  [ 50% ]  [ 75% ]  [ Max ]                      │
│ Minimum withdrawal: ₦100.00 · Transfer fee: ₦10...      │
└─────────────────────────────────────────────────────────┘

AFTER:
┌─────────────────────────────────────────────────────────┐
│ Withdrawal Amount                        Min: ₦100.00   │
│ [ ₦  0.00                                     ] [ Max ] │
│ Minimum withdrawal: ₦100.00 · Transfer fee: ₦10...      │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Steps & Code Plan

### Step 1: Database Script to Release the ₦740
Create and execute [`backend/scripts/fix-split-transaction.ts`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/scripts/fix-split-transaction.ts):
```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const businessId = '0ca4c440-5358-4ac6-923c-71317014baf7';

async function main() {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { userId: true },
  });

  if (!business) {
    console.error('Business not found');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Convert split transactions to plain inflows
    const result = await tx.salesTransaction.updateMany({
      where: {
        businessId,
        settledViaSplit: true,
      },
      data: {
        settledViaSplit: false,
        platformRetained: null,
        splitPct: null,
      },
    });

    // 2. Audit log entry
    await tx.auditLog.create({
      data: {
        userId: business.userId,
        businessId,
        action: 'sale.reclassified_split_to_plain',
        resourceType: 'sales_transaction',
        newData: {
          affectedTransactions: result.count,
          reason: 'Reclassified test auto-split transaction to plain inflow to restore full wallet balance',
        },
      },
    });

    console.log(`✅ Successfully updated ${result.count} transaction(s) to plain platform inflows.`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Step 2: Remove Percentage Boxes & Clean Up `PayoutWithdrawalModal.tsx`
In [`frontend/src/components/PayoutWithdrawalModal.tsx`](file:///c:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/PayoutWithdrawalModal.tsx):
1. Delete the `handleQuickPercent` function (lines 92–102).
2. Replace the amount input container and chip section (lines 359–406) with an input housing an inline `Max` button:
```tsx
<div className="relative">
  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold text-sm pointer-events-none">
    ₦
  </span>
  <Input
    id="modal-withdrawal-amount"
    name="withdrawal-amount"
    type="number"
    min={100}
    max={available}
    step={100}
    placeholder="0.00"
    value={amountStr}
    onChange={(e) => setAmountStr(e.target.value)}
    className="pl-8 pr-16 font-mono text-base font-bold text-gray-900"
    disabled={available < 100}
    required
    autoComplete="off"
    autoFocus
  />
  {available >= 100 && (
    <button
      type="button"
      onClick={handleMaxClick}
      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-100/80 hover:bg-purple-200 rounded-md transition-colors cursor-pointer select-none"
    >
      Max
    </button>
  )}
</div>
```

### Step 3: End-to-End Verification Commands
```bash
# 1. Run the database fix script
cd backend && npx tsx scripts/fix-split-transaction.ts

# 2. Verify payout preview math via diagnostic script
cd backend && npx tsx scripts/diagnose-payout-preview.ts

# 3. Verify backend TypeScript compilation
cd backend && npx tsc --noEmit

# 4. Verify frontend build
cd frontend && npm run build
```

---

## 5. Verification Matrix & Expected Outputs

| Surface | Metric / Element | Expected Value | Status |
| :--- | :--- | :--- | :--- |
| **`diagnose-payout-preview.ts`** | `totalPlainInflows` | `1100` | To Verify |
| **`diagnose-payout-preview.ts`** | `totalPlatformRetained` | `0` | To Verify |
| **`diagnose-payout-preview.ts`** | `platformHeldFunds` | `1100` | To Verify |
| **`diagnose-payout-preview.ts`** | `totalWithdrawn` | `0` | Verified (Reversed) |
| **`diagnose-payout-preview.ts`** | `availableForWithdrawal` | **`1100`** | To Verify |
| **`/account`** | Hero Wallet Balance | **`₦1,100.00`** | Expected |
| **`/account`** | Right Rail Breakdown | "Auto-routed to bank" row is **hidden** | Expected |
| **`/account`** | Card 1: Total Inflows | **`₦1,100.00`** | Expected |
| **`/account`** | Card 2: Total Withdrawn | **`₦0.00`** | Verified |
| **Withdraw Modal** | Quick percentage buttons | `[25%]`, `[50%]`, `[75%]` are **removed** | Expected |
| **Withdraw Modal** | Max button | Inline inside input on right | Expected |
| **`/transactions`** | Card 1: Money Received (+) | **`+₦1,100.00`** | Expected |
| **`/transactions`** | Card 2: Transfers to Bank (-) | **`₦0.00`** | Expected |
| **`/transactions`** | Card 3: Tax Remitted (-) | **`₦0.00`** | Expected |
| **`/transactions`** | Card 4: Digital Bank Balance | **`₦1,100.00`** | Expected |
| **Double-Entry Math Identity** | $1,100.00 - 0.00 - 0.00$ | **`= ₦1,100.00`** (Reconciled) | Expected |
