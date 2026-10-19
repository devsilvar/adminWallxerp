# PayMyTax Payment & Charge Scope Specification

**Document Version:** 1.1  
**Author:** WallX Engineering & Product Architecture  
**Scope:** Inflow (Customer Deposits to Wallet) vs Outflow (SME Withdrawals to Bank)  
**Paystack Transfer Tiers & Statutory EMTL / Stamp Duty Analysis Included**

---

## 1. Executive Summary

This document specifies the exact financial, fee, and ledger contract governing how money enters and exits the PayMyTax platform. 

The system operates on a dual-flow model designed for maximum SME conversion and sustainable platform profitability:
1. **Inflow (Deposits):** **100% Free to the SME.** When buyers pay into the SME's Dedicated Virtual Account, PayMyTax absorbs Paystack's inbound processing fee (1% capped at ₦300). The SME receives 100% credit of their revenue.
2. **Outflow (Withdrawals):** **Additive Platform Surcharge.** When the SME withdraws money to their commercial bank account, the platform adds its fee (1% or 2%) on top of the requested payout. The SME receives the exact round amount in their bank, and their wallet is debited `(requested + fee)`.

---

## 2. The Two-Flow Architecture

```
═════════════════════════════════════════════════════════════════════════════════
FLOW 1: INFLOW (Customer Pays SME via DVA)
═════════════════════════════════════════════════════════════════════════════════

Customer Transfers ₦5,000.00
            │
            ▼
   [Paystack Banking Rail]
            │
            ├────────────────────────────────────────┐
            ▼                                        ▼
   ₦5,000.00 lands on                       Paystack charges fee (1% capped at ₦300)
   PayMyTax Master Account                           │
            │                                        ▼
            │                               [COMPANY ABSORBS COST]
            ▼                               (WallX pays this as a marketing
   [SME Central Wallet]                      & customer acquisition expense)
   Credited FULL: ₦5,000.00
   (SME is NEVER charged on deposit)


═════════════════════════════════════════════════════════════════════════════════
FLOW 2: OUTFLOW (SME Withdraws from Wallet to Personal Bank)
═════════════════════════════════════════════════════════════════════════════════

SME requests to withdraw ₦5,000.00 to their Access Bank / GTBank account
            │
            ▼
   [WallX Withdrawal Pricing Engine]
   • Requested Payout:       ₦5,000.00
   • Company Fee (1%):       ₦50.00
   • Total Wallet Debit:     ₦5,050.00 (5k + 1% charge)
            │
            ├────────────────────────────────────────┐
            ▼                                        ▼
   [SME Commercial Bank]                    [SME Central Wallet]
   Receives FULL: ₦5,000.00                 Debited: ₦5,050.00
   (Exact amount they asked for)            (Balance drops by ₦5,050)
            │
            ▼
   [WallX Revenue & Margin]
   • Fee collected:          ₦50.00
   • Paystack transfer cost: ₦10.00 (Band 1: ≤ ₦5,000)
   • NET COMPANY PROFIT:     ₦40.00 (Earned by WallX on this withdrawal)
═════════════════════════════════════════════════════════════════════════════════
```

---

## 3. Paystack Tiered Transfer Fees & The ₦10,000 Threshold

Paystack does **not** charge a flat percentage on interbank transfers out. Instead, Paystack's Transfer API operates on a **banded flat-fee schedule** combined with a **mandatory federal levy (EMTL / Stamp Duty)** triggered at ₦10,000.

### A. The Three Base Transfer Bands
| Band | Transfer Amount Range | Paystack Base Fee |
| :--- | :--- | :--- |
| **Band 1 (Low)** | $\le ₦5,000.00$ | **₦10.00** |
| **Band 2 (Mid)** | $₦5,000.01 - ₦50,000.00$ | **₦25.00** |
| **Band 3 (High)** | $> ₦50,000.00$ | **₦50.00** |

### B. The ₦10,000 Statutory EMTL / Stamp Duty Threshold
* **Governing Regulation:** Nigeria Tax Act 2025 / Electronic Money Transfer Levy (EMTL) regulations (effective 18 Feb 2026).
* **Rule:** Any electronic transfer of **₦10,000 or more** originating from a Paystack balance attracts an extra statutory flat **₦50.00** debit.
* Paystack debits this ₦50 directly from the platform's balance alongside the base transfer fee.
* **Transfers below ₦10,000:** EMTL = **₦0.00**.
* **Transfers of ₦10,000 and above:** EMTL = **₦50.00**.

### C. Total Paystack Network Cost Summary
Combining the base transfer fee and the statutory EMTL produces four distinct operational cost tiers:

| Tier | Withdrawal Amount ($R$) | Base Fee | Stamp Duty (EMTL) | Total Paystack Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | $₦1,000 - ₦5,000$ | ₦10.00 | ₦0.00 | **₦10.00** |
| **Tier 2** | $₦5,001 - ₦9,999.99$ | ₦25.00 | ₦0.00 | **₦25.00** |
| **Tier 3 (10k Jump)** | $₦10,000 - ₦50,000$ | ₦25.00 | ₦50.00 | **₦75.00** |
| **Tier 4** | $> ₦50,000$ | ₦50.00 | ₦50.00 | **₦100.00** |

---

## 4. WallX Profitability & Margin Analysis Across All Bands

WallX applies an additive surcharge of **1.0%**, capped at **₦300.00**, with a minimum withdrawal floor of **₦1,000.00**.

Here is how the economics work across every single band:

| Requested ($R$) | WallX Fee (1%, max ₦300) | Wallet Debit ($R + F$) | SME Bank Gets | Paystack Network Cost | WallX Net Margin | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **₦1,000.00** | ₦10.00 | ₦1,010.00 | ₦1,000.00 | ₦10.00 | **₦0.00** | Break-even floor |
| **₦3,000.00** | ₦30.00 | ₦3,030.00 | ₦3,000.00 | ₦10.00 | **+₦20.00** | Profitable |
| **₦5,000.00** | ₦50.00 | ₦5,050.00 | ₦5,000.00 | ₦10.00 | **+₦40.00** | Profitable |
| **₦8,000.00** | ₦80.00 | ₦8,080.00 | ₦8,000.00 | ₦25.00 | **+₦55.00** | Profitable |
| **₦10,000.00** | ₦100.00 | ₦10,100.00 | ₦10,000.00 | ₦75.00 (₦25 + ₦50) | **+₦25.00** | Profitable |
| **₦20,000.00** | ₦200.00 | ₦20,200.00 | ₦20,000.00 | ₦75.00 (₦25 + ₦50) | **+₦125.00** | Profitable |
| **₦30,000.00** | ₦300.00 *(Cap)* | ₦30,300.00 | ₦30,000.00 | ₦75.00 (₦25 + ₦50) | **+₦225.00** | Profitable |
| **₦50,000.00** | ₦300.00 *(Cap)* | ₦50,300.00 | ₦50,000.00 | ₦75.00 (₦25 + ₦50) | **+₦225.00** | Profitable |
| **₦100,000.00**| ₦300.00 *(Cap)* | ₦100,300.00 | ₦100,000.00 | ₦100.00 (₦50 + ₦50) | **+₦200.00** | Profitable |
| **₦500,000.00**| ₦300.00 *(Cap)* | ₦500,300.00 | ₦500,000.00 | ₦100.00 (₦50 + ₦50) | **+₦200.00** | Profitable |

### Key Economic Takeaways:
1. **Zero Negative Margin:** Because the withdrawal floor is strictly set to **₦1,000.00**, WallX will never lose money on small payouts. At ₦1,000, the 1% fee (₦10) exactly covers the ₦10 Paystack base fee.
2. **Above ₦10,000 Cushion:** At ₦10,000, when the ₦50 EMTL kicks in, WallX collects ₦100 in fees. Total Paystack cost is ₦75 (₦25 + ₦50), leaving WallX with **+₦25 net profit**.
3. **High Volume Profit Engine:** On withdrawals of ₦20,000 to ₦50,000+, WallX generates between **₦125.00 and ₦225.00 net profit per withdrawal**.

---

## 5. Codebase Implementation & Configurations

The fee schedule and bands are fully codified and unit-tested in the codebase:

1. **Configuration (`backend/src/config/index.ts`):**
   ```ts
   // Inflow
   dvaPct: Number(process.env.PAYSTACK_DVA_FEE_PCT ?? 1),
   dvaCap: Number(process.env.PAYSTACK_DVA_FEE_CAP ?? 300),

   // Outflow base transfer bands
   transferLow: Number(process.env.PAYSTACK_TRANSFER_FEE_LOW ?? 10),
   transferLowMax: Number(process.env.PAYSTACK_TRANSFER_FEE_LOW_MAX ?? 5000),
   transferMid: Number(process.env.PAYSTACK_TRANSFER_FEE_MID ?? 25),
   transferMidMax: Number(process.env.PAYSTACK_TRANSFER_FEE_MID_MAX ?? 50000),
   transferHigh: Number(process.env.PAYSTACK_TRANSFER_FEE_HIGH ?? 50),

   // Statutory Stamp Duty / EMTL
   stampDuty: Number(process.env.PAYSTACK_STAMP_DUTY ?? 50),
   stampDutyFrom: Number(process.env.PAYSTACK_STAMP_DUTY_FROM ?? 10000),
   ```

2. **Core Calculation Engine (`backend/src/lib/paystack-fees.ts`):**
   - `transferFee(amount)`: Resolves ₦10, ₦25, or ₦50 based on low/mid thresholds.
   - `stampDuty(amount)`: Evaluates whether `amount >= 10,000` to apply the ₦50 EMTL.
   - `withdrawalCost(amount)`: Calculates total Paystack debit (`transferFee + stampDuty`).
   - `quoteWithdrawal(amount)`: Computes wallet debit, net bank payout, fee breakdown, and bearer logic.
   - `feeSchedule()`: Exposes the full fee schedule to the frontend UI so users have transparent fee previews.

3. **Automated Unit Tests (`backend/tests/unit/paystack-fees.test.ts`):**
   - 21/21 passing unit tests validating:
     - DVA 1% capped at ₦300.
     - Transfer bands (₦10, ₦25, ₦50).
     - ₦10,000 stamp duty trigger threshold.
     - ₦1,000 minimum withdrawal floor enforcement.
     - Platform bearer mode vs merchant bearer mode.

---

## 6. Security & Risk Controls

To prevent balance fraud, race conditions, or duplicate payouts:

1. **Transaction PIN + 5-Attempt Lockout:**
   - Every withdrawal requires the SME's 4-digit PIN verified via bcrypt.
   - 5 failed attempts trigger an immediate 30-minute lockout.
2. **Postgres Advisory Lock (`pg_try_advisory_xact_lock`):**
   - Serializes withdrawal requests per user at the database engine level.
   - Eliminates race conditions if the user double-clicks the withdraw button.
3. **Payout Account Anti-Hijacking Lock:**
   - Settlement bank account is permanently locked after initial setup.
   - Cannot be changed without Admin issuing a one-time 24-hour permit (`payout-change-permit`).
4. **Automatic Rollback on Bank Failure:**
   - If Paystack or NIP fails to deliver the bank transfer, the reserved funds ($R + F$) roll back automatically to the SME's wallet balance.

---

## 7. Summary Comparison

| Dimension | Inflow (Deposit to Wallet) | Outflow (Withdrawal to Bank) |
| :--- | :--- | :--- |
| **Trigger** | Customer pays DVA account | SME initiates bank payout |
| **SME Cost** | **₦0.00 (100% Free)** | **1% added to wallet debit** |
| **Who Pays Paystack?** | WallX absorbs fee (1% capped at ₦300) | SME pays WallX fee; WallX pays Paystack |
| **Paystack Network Cost** | 1% capped at ₦300 | Banded: ₦10 / ₦25 / ₦75 / ₦100 |
| **Company P&L Impact** | Customer acquisition / retention cost | Direct profit center (+₦20 to +₦225 per txn) |
| **User Experience** | Receives 100% of sale | Receives exact requested round figure in bank |
