# Voucher as ATM Card — 6-Digit PIN + Last-4 Phone Auth (Rereviewed Plan)

> **Readiness: 9/10 — implementation-ready.** All file paths verified against live codebase. No migrations via `prisma migrate dev`. No `bcryptjs`.

---

## 1) Executive Verdict

**🟡 PLAN REQUIRES SIGNIFICANT REVISION — approved after fixes below.**

The original plan's product logic is sound (PIN + last-4, ATM email, deduction alert, resend/change). It fails on **four codebase-accuracy issues** — wrong bcrypt import, leaking `__voucherAuth` via `any`, holding `FOR UPDATE` through `bcrypt.compare` without ordering, and incomplete file impact (missing controller/validator/rate-limiter/frontend wiring details). The revised plan below corrects all four, verifies every path, and breaks the work into dumb-developer-proof phases.

---

## 2) What Was Wrong With the Old Plan

| # | Category | Problem |
|---|---|---|
| 1 | 🔴 WRONG | Imports `bcryptjs` — repo uses `bcrypt@6.0.0` (`backend/package.json:58`) + `@types/bcrypt`. `bcryptjs` is not installed. Must use `import bcrypt from 'bcrypt'` with 12 rounds (matches `prisma/seed.ts:12` + `auth.service` convention). |
| 2 | 🔴 WRONG | Sales wiring stores `__voucherAuth` on `payload as any` then reads it inside `runCreate` closure — type-unsafe, relies on mutation of input object. Breaks if Prisma ever clones metadata. |
| 3 | 🟠 INCOMPLETE | File impact incomplete: `customer-card.validator.ts` (`verifyOtpSchema`), `customer-card.controller.ts` (2 handlers to add / 1 to remove), `middleware/security.ts` (`voucherOtpRequestRateLimiter` rename), `frontend/src/stores/customer.store.ts`, `types/index.ts`, `components/AddSaleModal.tsx` wiring details missing or vague. |
| 4 | 🟠 INCOMPLETE | KudiSMS removal hedges "keep if still used elsewhere" — grep confirms **only** `customer-card.service.ts` imports `kudismsClient`. No debtor/transaction PIN uses it. Deletion is clean. |
| 5 | 🟡 RISKY | `debitCardForSale` does `bcrypt.compare` *inside* the `FOR UPDATE` transaction while holding the row lock (~80ms CPU). Last-4 should be checked first (cheap), then PIN checked, but still inside TX so `pinAttempts` increment serializes. Ordering not specified explicitly in old plan. |
| 6 | 🟡 RISKY | `pinAttempts` increment on wrong PIN inside the *same* sale TX that will rollback on `INVALID_VOUCHER_PIN` — increment would be lost. Must increment via a **separate, committed** update (or ensure the increment TX commits before throwing). Old plan increments inside the same TX that throws, so the count never persists. |
| 7 | 🟠 INCOMPLETE | `quickCreateCustomer` both-branch PIN issuance not line-number precise — existing-customer-without-card branch vs new-customer TX branch need different post-commit dispatch points. |
| 8 | 🟡 RISKY | Frontend `VoucherPayModal` spec hides balance from `sales_staff` until PIN verified but `AddSaleModal` needs balance for `isInsufficient` pre-check — chicken-egg not resolved. |
| 9 | 🟡 UNNECESSARY | Plan says "keep `pendingVerificationId` columns for one release" but then never reads them — leaving dead columns without a follow-up ticket creates schema drift. Commit to removal in follow-up migration (explicit TODO). |

---

## 3) What Changed (Old → New)

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| `bcryptjs` `hash/compare` | **Changed** to `bcrypt` (native) 12 rounds | `voucher-pin.service.ts` imports `bcrypt` | Matches installed dep, avoids adding unused `bcryptjs` |
| `payload as any __voucherAuth` | **Replaced** with closure-captured locals | `createSale` captures `voucherCustomerId/pin/last4` in outer scope, `runCreate` closes over them | Type-safe, no mutation |
| Vague file list | **Expanded** to exact CREATE/MODIFY/DELETE with line refs | §5 Verified File Impact lists every file with current role + change | Dumb-dev needs exact touch list |
| Hedge on KudiSMS retention | **Resolved** — delete KudiSMS voucher path entirely | Remove `kudismsClient` import + OTP routes + `pendingVerification*` writes | Grep proves single consumer |
| `bcrypt.compare` inside FOR UPDATE without ordering | **Ordered** last-4 → bcrypt + separate attempt-persist | Last-4 checked before bcrypt; wrong-PIN increment committed via `tx.customerCard.update` **before** throw but still inside same TX — relies on TX rollback semantics → fix: increment in **nested savepoint** or do attempt tracking in a **separate transaction** | Ensure attempts persist even though sale TX rolls back |
| No attempt-persist strategy | **Added** two-TX pattern for attempts | §6 Step 5c: failed PIN attempts use a separate `prisma.customerCard.update` outside the sale TX (or `prisma.$transaction` with savepoint) — documented | Prevents brute-force bypass via rollback |
| Single `generateUniqueCardCode` call site noted | **Both sites** enumerated | §6 Step 4 covers both `quickCreateCustomer` branches | Prevents missed issuance path |
| Frontend balance hide not resolved | **Resolved** — staff sees masked balance after selection, verified balance after sale | `VoucherPayModal` fetches balance only after PIN+last4 sale succeeds (or manager prefetch); insufficient check is server-side authoritative | Eliminates chicken-egg |

---

## 4) Verified File Impact

### CREATE

| File | Role | Why |
|---|---|---|
| `backend/src/services/voucher-pin.service.ts` | **new** PIN crypto | `generateVoucherPin` (100000–999999), `hashVoucherPin`/`verifyVoucherPin` via `bcrypt` 12 rounds, `validatePinFormat`, `checkPinLock`, `nextLockDuration` (3→15m, 5→1h) |
| `backend/src/lib/email/templates/voucher-deduction.ts` | **new** deduction receipt | `VoucherDeductionEmailData` + `generateVoucherDeductionHtml/Text` — red hero `–₦X`, table, unauthorized disclaimer |

### MODIFY — Backend

| File | Current Role | What Changes |
|---|---|---|
| `backend/prisma/schema.prisma` | `CustomerCard` 952-970 | Add `pinHash String? @map("pin_hash")`, `pinAttempts Int @default(0) @map("pin_attempts")`, `pinLockedUntil DateTime? @map("pin_locked_until")` |
| `backend/prisma/migrations/*_add_customer_card_pin_hash/migration.sql` | **hand-authored** | `ALTER TABLE customer_cards ADD COLUMN ...` (3 cols, nullable/defaulted) |
| `backend/src/lib/email/templates/voucher-notification.ts` | Notification template 1-226 | Add `pinCode?: string` to `VoucherNotificationEmailData`; when present render ATM-card hero (gradient card + chip SVG + separate white PIN box); update "How to Use" bullets to PIN+last4; text fallback adds `VOUCHER PIN:` line |
| `backend/src/services/email-dispatch.service.ts` | Dispatch 1431-1530 | `DispatchVoucherNotificationInput` gains `pinCode?`; forward to template; add `dispatchVoucherDeductionEmail({ businessId, customerId, amountDebited, receiptNumber?, saleId, transactionDate? })` — loads `customer.email/name`, `cardCode`, `business.businessName/city/phone`, builds `VoucherDeductionEmailData`, `sendEmail` fire-and-forget, never throws |
| `backend/src/services/customer-card.service.ts` | Card service 1-1256 | Add `maskPhoneSuffix`, remove `kudismsClient` + `requestCardOtp`/`verifyCardOtp`/`verifyVoucherStepUpToken`, issue PIN on card creation (both branches), `debitCardForSale(userId,businessId,customerId,amount,saleId,receiptNumber,tx,auth:{pin,last4})` verifies last-4 then PIN then FOR UPDATE → balance → ledger, add `changeVoucherPin` + `resendVoucherPin` (both post-commit email) |
| `backend/src/services/sales/sales-crud.service.ts` | Sale CRUD 1-206 | `createSale` pre-validates `metadata.voucherPin` (`^\d{6}$`) + `voucherLast4` (`^\d{4}$`) without bcrypt; captures locals for TX closure; inside TX calls `debitCardForSale(...,{pin,last4})`; after commit `void dispatchVoucherDeductionEmail(...)` (only when `!externalTx` path commits) |
| `backend/src/validators/sales.validator.ts` | Sales Zod | `metadata` for `store_voucher` adds `voucherPin: z.string().regex(/^\d{6}$/)`, `voucherLast4: z.string().regex(/^\d{4}$/)`; remove `voucherStepUpToken` reference |
| `backend/src/validators/customer-card.validator.ts` | Customer validators | Keep `verifyOtpSchema` deprecated one release OR delete; add `changeVoucherPinSchema = z.object({ currentPin: z.string().regex(/^\d{6}$/), newPin: z.string().regex(/^\d{6}$/) }).refine(d=>d.currentPin!==d.newPin)` |
| `backend/src/controllers/customer-card.controller.ts` | 7 handlers | Add `resendPin` (empty body strict) + `changePin` (parse `changeVoucherPinSchema`) handlers; remove `requestOtp`/`verifyOtp`; update `getCard` to drop `x-voucher-auth` header logic (manager bypass stays for *viewing* balance, not spending) |
| `backend/src/routes/customer-card.routes.ts` | 7 routes + 2 OTP | Remove `POST .../otp/request` + `verify`; add `POST /:customerId/card/pin/resend` (staff+, `customers.manage`, rate-limited 5/h per `customerId`) + `POST /:customerId/card/pin/change` (staff+, `customers.manage`) |
| `backend/src/middleware/security.ts` | Rate limiters | Rename `voucherOtpRequestRateLimiter` → `voucherPinRateLimiter` (or add new) `key: pin_resend:${businessId}:${customerId}` `windowMs 60*60*1000 max 5` (dev 30) |

### MODIFY — Frontend

| File | Current Role | What Changes |
|---|---|---|
| `frontend/src/lib/format.ts` (or `lib/phone.ts`) | Formatters | Add `maskPhoneSuffix(phone)` — `slice(0, len-4) + '••••'` |
| `frontend/src/pages/Customers.tsx` | Customer table | Phone column uses `maskPhoneSuffix` + eye toggle `Eye`/`EyeOff` local state `Record<id,boolean>`; no API call on reveal |
| `frontend/src/components/customers/VoucherAuthModal.tsx` → `VoucherPayModal.tsx` | Till modal (339 lines) | **Rewrite**: remove OTP state (`otpSent/otpCode/stepUpToken/maskedPhone/silentTestCode`), add `pin` (`password` + eye, `inputMode=numeric`, `maxLength 6`) + `last4` (`maxLength 4`, hint `maskPhoneSuffix`), single `Authorize & Pay →` button calls `onAuthorized({ customerId,pin,last4 })`; manager prefetch balance, staff balance hidden; error mapping for `INVALID_VOUCHER_PIN`/`VOUCHER_PIN_LOCKED`/`INVALID_LAST4`/`VOUCHER_PIN_NOT_SET` |
| `frontend/src/components/AddSaleModal.tsx` | Sale modal | Replace `VoucherAuthModal` import; state `voucherPin`+`voucherLast4` (remove `voucherStepUpToken`); `metadata` on submit = `{ voucherCustomerId, voucherPin, voucherLast4 }` |
| `frontend/src/stores/customer.store.ts` | Zustand store | Remove `requestOtp`/`verifyOtp`; add `resendVoucherPin(businessId,customerId)` → `POST .../pin/resend` + `changeVoucherPin(businessId,customerId,currentPin,newPin)` → `POST .../pin/change`; `fetchCustomerCard` drops `stepUpToken` param |
| `frontend/src/types/index.ts` | Types | `CustomerCard` gains `hasPin: boolean` (derived `pinHash!=null`); never expose hash |
| `frontend/src/pages/Customers.tsx` (detail drawer) | Detail actions | Add **Resend PIN** (ghost, `Mail` icon, toast maskedEmail, 429 handling) + **Change PIN** button opening `ChangeVoucherPinModal` |
| `frontend/src/components/customers/ChangeVoucherPinModal.tsx` | **new** | Small modal: `Current PIN` + `New PIN` + `Confirm` (all 6-digit, eye toggles), validates `new!==current` + `confirm===new`, calls `changeVoucherPin` |

### DATABASE

| Object | Change |
|---|---|
| `customer_cards` | Add `pin_hash TEXT`, `pin_attempts INT DEFAULT 0`, `pin_locked_until TIMESTAMPTZ`; keep `pending_verification_id/requested_at` one release (no writes), drop in follow-up |

### CONFIGURATION

| Var | Change |
|---|---|
| `RESEND_API_KEY` | Prod boot warning if missing — `logger.warn('voucher PIN emails will not deliver — RESEND_API_KEY missing')` |
| `KUDISMS_*` | No longer used for vouchers; keep env but no code reads it on voucher path |

### TESTS

| File | Change |
|---|---|
| `backend/tests/unit/voucher-pin.service.test.ts` | **new** — generate 6-digit, hash round-trip, `validatePinFormat` reject, `checkPinLock` 423, `nextLockDuration` mapping |
| `backend/tests/unit/voucher-notification-email.test.ts` | Extend — ATM card renders when `pinCode` present, deduction template |
| `backend/tests/unit/voucher-deduction-email.test.ts` | **new** — deduction template renders amount/balance/receipt |
| `backend/tests/integration/customer-card.test.ts` | Update — wrong PIN increments, 3rd wrong locks 15m, wrong last4 no increment, null pinHash → 409, manager view vs debit, resend/change |
| `backend/tests/e2e/api.e2e.test.ts` | Add — `POST /sales` store_voucher correct/incorrect PIN/last4, resend/change flows |

---

## 5) Improved Implementation Plan (Phased — Dumb-Developer-Proof)

> **Global rules:** migrations are hand-authored SQL only. Never `prisma migrate dev`. Never run `npm run prisma:migrate` locally. Use `bcrypt` not `bcryptjs`. Every email dispatch is `void` post-commit, never inside TX, never throws.

### Phase 0 — Schema & Migration (no code yet)

**Goal:** Add PIN columns without touching app code.

**Files:**
- `backend/prisma/schema.prisma` — `model CustomerCard` add 3 fields.
- `backend/prisma/migrations/20261008_add_customer_card_pin_hash/migration.sql` — hand-author.

**SQL:**
```sql
ALTER TABLE customer_cards ADD COLUMN pin_hash TEXT;
ALTER TABLE customer_cards ADD COLUMN pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_cards ADD COLUMN pin_locked_until TIMESTAMPTZ;
```

**Before → After (`schema.prisma` 959-962):**
```prisma
// Before
  pendingVerificationRequestedAt DateTime?  @map("pending_verification_requested_at")

// After
  pendingVerificationRequestedAt DateTime?  @map("pending_verification_requested_at")
  pinHash        String?   @map("pin_hash")
  pinAttempts    Int       @default(0) @map("pin_attempts")
  pinLockedUntil DateTime? @map("pin_locked_until")
```

**Verify:** `cd backend && npx prisma validate && npx tsc --noEmit` passes. No `migrate` run.

**Done when:** `prisma validate` green, migration file exists, `pinHash` not referenced yet.

---

### Phase 1 — PIN Crypto Service (isolated, testable)

**Goal:** Single owner for PIN generation/hashing/validation/lock logic.

**File:** `backend/src/services/voucher-pin.service.ts` — **new**.

```ts
import bcrypt from 'bcrypt';
import { AppError } from '@/middleware/errorHandler';

export const VOUCHER_PIN_LENGTH = 6;
export const VOUCHER_PIN_REGEX = /^\d{6}$/;
const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS_BEFORE_LOCK = 3;
const LOCK_15M_MS = 15 * 60 * 1000;
const LOCK_1H_MS  = 60 * 60 * 1000;

export function generateVoucherPin(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}
export async function hashVoucherPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}
export async function verifyVoucherPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
export function validatePinFormat(pin: string): void {
  if (!VOUCHER_PIN_REGEX.test(pin.trim())) throw new AppError(400, 'PIN must be exactly 6 digits', 'INVALID_PIN_FORMAT');
}
export function checkPinLock(card: { pinAttempts: number; pinLockedUntil: Date | null }): void {
  if (card.pinLockedUntil && new Date(card.pinLockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(card.pinLockedUntil).getTime() - Date.now()) / 60000);
    throw new AppError(423, `Voucher PIN locked. Try again in ${mins} minute(s).`, 'VOUCHER_PIN_LOCKED', { retryAfterMinutes: mins });
  }
}
export function nextLockDuration(attempts: number): number {
  if (attempts >= 5) return LOCK_1H_MS;
  if (attempts >= 3) return LOCK_15M_MS;
  return 0;
}
export { MAX_ATTEMPTS_BEFORE_LOCK, LOCK_15M_MS, LOCK_1H_MS };
```

**Why `bcrypt` 12 rounds:** matches `prisma/seed.ts:21` and auth convention; `bcryptjs` not installed.

**Verify:** `npx tsc --noEmit`; unit test `voucher-pin.service.test.ts` green.

---

### Phase 2 — Email Templates (no service wiring yet)

**Goal:** Render ATM card + deduction receipt. No dispatch yet.

**Files:**
- `backend/src/lib/email/templates/voucher-notification.ts` — extend interface + branch.
- `backend/src/lib/email/templates/voucher-deduction.ts` — **new**.

**2a — `voucher-notification.ts` diff:**

```ts
// Interface add
pinCode?: string; // plaintext 6-digit, only when issuing

// Branch in generateVoucherNotificationHtml
if (data.pinCode) {
  // Render ATM-card hero: gradient 360x210, 16px radius, #0f172a→#1e1b4b→#4c1d95,
  // WALLX wordmark + VIRTUAL VOUCHER pill top row,
  // cardCode 22px monospace letter-spacing 8px + gold chip SVG,
  // PIN in separate white box below card (28px monospace, letter-spacing 10px, #581c87),
  // footer: customerName uppercase + BALANCE ₦ in gold.
} else {
  // Existing non-PIN layout
}
```

Update "How to Use" bullets to PIN+last4 flow. Text fallback adds `VOUCHER PIN: ${pinCode} | Card: ${cardCode} | Balance: ${balanceFormatted}`.

**Design constraints:** inline CSS + inline SVG only; no external images.

**2b — `voucher-deduction.ts` new file:**

```ts
export interface VoucherDeductionEmailData {
  customerName: string; businessName: string; cardCode: string;
  amountDebitedFormatted: string; newBalanceFormatted: string;
  receiptNumber?: string | null; storeLocation?: string | null;
  transactionDateFormatted: string; businessPhone?: string | null;
}
// generateVoucherDeductionHtml: #0f172a header, –₦X in #dc2626, table Store/Voucher/Amount/Balance/Date/Receipt, alert box "Didn't make this? Contact..."
```

**Verify:** `npm run build` + manual HTML snapshot in `voucher-notification-email.test.ts`.

---

### Phase 3 — Email Dispatch Helpers

**Goal:** Wire templates to `sendEmail` as fire-and-forget helpers.

**File:** `backend/src/services/email-dispatch.service.ts`

**Changes:**
1. `DispatchVoucherNotificationInput` add `pinCode?: string`.
2. `dispatchVoucherNotificationEmail` — forward `pinCode` to template; subject unchanged.
3. **New** `dispatchVoucherDeductionEmail(input: { businessId, customerId, amountDebited: number, receiptNumber?, saleId, transactionDate?: Date })`:
   - Load `customer{email,name}`, `card{cardCode}`, `business{businessName,city,phone}`.
   - If `!customer.email` → `logger.warn('voucher deduction alert skipped: no email', {customerId})` + return (optional TODO: KudiSMS SMS fallback).
   - Build `VoucherDeductionEmailData` via `formatNaira` + `formatHumanDateTime`.
   - `await sendEmail({ to, subject: \`Receipt: –\${formatNaira(amountDebited)} from your voucher — \${businessName}\`, html, text })`.
   - Top-level try/catch → `logger.warn`, never throw.
   - Both helpers never inside `prisma.$transaction`.

**Verify:** `npx tsc --noEmit`; grep `sendEmail` count.

---

### Phase 4 — Customer-Card Service: Helpers + PIN Issuance + Remove OTP

**Goal:** Core service — issue PIN on card creation, remove dead OTP path.

**File:** `backend/src/services/customer-card.service.ts`

**Step 4a — Add helper, remove imports:**
```ts
// Add
export function maskPhoneSuffix(phone: string): string {
  const c = phone.trim();
  if (c.length <= 4) return '••••';
  return `${c.slice(0, c.length - 4)}••••`;
}
// Remove
import { kudismsClient, normalizePhoneForKudiSms } from '@/lib/sms/kudisms.client';
import jwt from 'jsonwebtoken'; // keep only if other JWT remains; else remove
```

**Step 4b — Issue PIN on card creation (two sites):**

*Site 1 — existing customer without card (line ~161-172):*
```ts
import { generateVoucherPin, hashVoucherPin } from '@/services/voucher-pin.service';
// After create card:
const pin = generateVoucherPin();
const pinHash = await hashVoucherPin(pin);
await prisma.customerCard.update({ where: { id: card.id }, data: { pinHash, pinAttempts: 0, pinLockedUntil: null } });
if (existing.email) {
  void dispatchVoucherNotificationEmail({ businessId, customerId: existing.id, cardCode, balance: 0, actionType: 'created', pinCode: pin, toEmail: existing.email, customerName: existing.name });
}
```

*Site 2 — new customer TX branch (line ~202-243):*
```ts
// Inside tx: after tx.customerCard.create, still inside tx:
const pin = generateVoucherPin();
const pinHash = await hashVoucherPin(pin);
// hashVoucherPin is outside TX (bcrypt CPU) — hash BEFORE tx or use pre-hashed value
// Better: generate + hash BEFORE tx, then write pinHash inside tx:
await tx.customerCard.update({ where: { id: card.id }, data: { pinHash, pinAttempts: 0 } });
// Post-commit (outside tx):
if (result.email) void dispatchVoucherNotificationEmail({ ..., pinCode: pin, ... });
```
*Implementation note:* Do `pin + hashVoucherPin` **before** `prisma.$transaction` so bcrypt doesn't hold DB tx. Then write `pinHash` inside TX. Dispatch outside.

**Step 4c — Delete OTP functions:**
Delete `verifyVoucherStepUpToken`, `requestCardOtp`, `verifyCardOtp` and their `pendingVerificationId` writes. Keep `getCustomerCard` manager bypass for **viewing balance** only.

**Step 4d — Keep `getCustomerCard` but simplify:**
```ts
// Remove stepUpToken param entirely
export async function getCustomerCard(userId,businessId,customerId) {
  const access = await verifyBusinessAccess(userId,businessId,'customers.read');
  const isManagerOrOwner = access.role==='owner'||access.role==='manager';
  // No token check — viewing is allowed for all roles that passed verifyBusinessAccess
  // (existing OTP gate removed; viewing balance is not spending)
}
```
*Alternative if stricter:* keep gate but it now checks nothing — so delete it. Viewing ≠ spending.

**Verify:** `npx tsc --noEmit`, grep `kudismsClient` = 0 hits.

---

### Phase 5 — Customer-Card Service: `debitCardForSale` + PIN Lifecycle

**Goal:** Make voucher spend require PIN+last4 inside sale TX.

**File:** `backend/src/services/customer-card.service.ts` (continued)

**Step 5a — New `debitCardForSale` signature:**
```ts
export async function debitCardForSale(
  userId: string, businessId: string, customerId: string,
  amount: number, saleId: string, receiptNumber: string | null,
  tx: TxClient,
  auth: { pin: string; last4: string }
)
```

**Step 5b — Verification order (cheap → expensive → lock):**
```ts
validatePinFormat(auth.pin);
if (!/^\d{4}$/.test(auth.last4.trim())) throw new AppError(400,'Last 4 must be 4 digits','INVALID_LAST4');
const preCard = await tx.customerCard.findUnique({ where:{customerId}, select:{ id:true, pinHash:true, pinAttempts:true, pinLockedUntil:true }});
if (!preCard) throw new AppError(404,'Customer has no voucher','CUSTOMER_HAS_NO_CARD');
if (!preCard.pinHash) throw new AppError(409,'Voucher PIN not set. Ask staff to resend a new PIN.','VOUCHER_PIN_NOT_SET');
checkPinLock(preCard);
const customer = await tx.customer.findUnique({ where:{id:customerId}, select:{phone:true}});
const phoneLast4 = (customer?.phone||'').trim().slice(-4);
if (phoneLast4.length!==4) throw new AppError(400,'Customer phone on file is invalid','CUSTOMER_PHONE_INVALID');
if (auth.last4.trim() !== phoneLast4) {
  // Do NOT increment pinAttempts — not a PIN guess
  throw new AppError(401,'Last 4 digits do not match the phone on file','INVALID_LAST4');
}
const pinOk = await verifyVoucherPin(auth.pin.trim(), preCard.pinHash);
if (!pinOk) {
  const attempts = preCard.pinAttempts + 1;
  const lockMs = nextLockDuration(attempts);
  // Persist attempts BEFORE throwing — but this TX will rollback on throw,
  // so we must commit attempts in a separate TX (see 5c)
  throw new AppError(401, attempts>=3 ? 'Incorrect PIN. Voucher locked for 15 minutes.' : `Incorrect PIN. ${3-attempts} attempt(s) remaining.`, 'INVALID_VOUCHER_PIN', { remainingAttempts: Math.max(0,3-attempts) });
}
// Success → reset attempts (inside sale TX, committed with sale)
await tx.customerCard.update({ where:{id: preCard.id}, data:{ pinAttempts:0, pinLockedUntil:null }});
// Then existing FOR UPDATE + balance check + decrement + ledger sale_debit
```

**Step 5c — Attempt persistence (critical fix):**

The wrong-PIN `throw` rolls back the sale TX, so an in-TX `update pinAttempts` would be lost. Fix with **two-TX pattern**:

In `sales-crud.service.ts` (Phase 6) wrap the debit call in try/catch: on `INVALID_VOUCHER_PIN`, run a **separate** `await prisma.customerCard.update({ where:{customerId}, data:{ pinAttempts: {increment:1}, ...(lockMs?{pinLockedUntil: new Date(Date.now()+lockMs)}:{}) } })` to persist the attempt, then re-throw. This is the correct layer to handle it — `debitCardForSale` should not own a second TX.

Simpler alternative: make `debitCardForSale` do a **savepoint** — but Prisma doesn't expose savepoints. So the caller persists attempts.

**Step 5d — New lifecycle methods:**
```ts
export async function resendVoucherPin(userId,businessId,customerId) {
  await verifyBusinessAccess(userId,businessId,'customers.manage');
  const card = await prisma.customerCard.findUnique({where:{customerId}});
  if (!card) throw new AppError(404,'Customer has no voucher','CUSTOMER_HAS_NO_CARD');
  const pin = generateVoucherPin();
  const pinHash = await hashVoucherPin(pin);
  const updated = await prisma.customerCard.update({ where:{id:card.id}, data:{ pinHash, pinAttempts:0, pinLockedUntil:null }});
  const customer = await prisma.customer.findUnique({where:{id:customerId}});
  if (customer?.email) void dispatchVoucherNotificationEmail({ businessId, customerId, cardCode: updated.cardCode, balance: toNumber(updated.balance), actionType:'created', pinCode: pin, toEmail: customer.email, customerName: customer.name });
  await logAudit({ userId,businessId,action:'card.pin_resent',resourceType:'customer_card',resourceId:card.id,newData:{ cardCode: updated.cardCode }});
  return { maskedEmail: customer?.email ? customer.email.replace(/(.{1}).*(@.*)/,'$1***$2') : null };
}

export async function changeVoucherPin(userId,businessId,customerId,input:{currentPin:string;newPin:string}) {
  await verifyBusinessAccess(userId,businessId,'customers.manage');
  validatePinFormat(input.newPin);
  if (input.currentPin===input.newPin) throw new AppError(400,'New PIN must differ from current','INVALID_PIN_FORMAT');
  const card = await prisma.customerCard.findUnique({where:{customerId}});
  if (!card?.pinHash) throw new AppError(409,'Voucher PIN not set','VOUCHER_PIN_NOT_SET');
  checkPinLock(card);
  const ok = await verifyVoucherPin(input.currentPin, card.pinHash);
  if (!ok) throw new AppError(401,'Current PIN is incorrect','INVALID_VOUCHER_PIN');
  const pinHash = await hashVoucherPin(input.newPin);
  await prisma.customerCard.update({ where:{id:card.id}, data:{ pinHash, pinAttempts:0, pinLockedUntil:null }});
  const customer = await prisma.customer.findUnique({where:{id:customerId}});
  // Re-fetch updated card for code
  const updatedCard = await prisma.customerCard.findUnique({where:{customerId}});
  if (customer?.email) void dispatchVoucherNotificationEmail({ businessId, customerId, cardCode: updatedCard!.cardCode, balance: toNumber(updatedCard!.balance), actionType:'created', pinCode: input.newPin, toEmail: customer.email, customerName: customer.name });
  await logAudit({ userId,businessId,action:'card.pin_changed',resourceType:'customer_card',resourceId:card.id,newData:{ cardCode: card.cardCode }});
}
```

---

### Phase 6 — Sales Wiring (the ATM at the till)

**Goal:** `POST /sales` with `source:store_voucher` now requires PIN+last4.

**File:** `backend/src/services/sales/sales-crud.service.ts`

**Before (74-101):**
```ts
const voucherCustomerId = input.metadata?.voucherCustomerId ?? (input as any).customerId;
if (input.source==='store_voucher') { /* checks voucherCustomerId + stepUpToken via verifyVoucherStepUpToken */ }
```

**After:**
```ts
// Capture outside TX (no DB, just format checks)
let voucherCustomerId: string | undefined;
let voucherPin: string | undefined;
let voucherLast4: string | undefined;
if (input.source === 'store_voucher') {
  voucherCustomerId = (input.metadata?.voucherCustomerId as string | undefined) ?? (input as any).customerId;
  voucherPin  = input.metadata?.voucherPin as string | undefined;
  voucherLast4= input.metadata?.voucherLast4 as string | undefined;
  if (!voucherCustomerId) throw new AppError(400,'voucherCustomerId is required in metadata for store voucher','VOUCHER_CUSTOMER_REQUIRED');
  if (!voucherPin || !/^\d{6}$/.test(voucherPin)) throw new AppError(400,'6-digit voucher PIN is required','VOUCHER_PIN_REQUIRED');
  if (!voucherLast4 || !/^\d{4}$/.test(voucherLast4)) throw new AppError(400,'Last 4 digits of customer phone are required','VOUCHER_LAST4_REQUIRED');
  // Do NOT bcrypt here — verified inside TX
}
// Inside runCreate closure, replace:
//   await debitCardForSale(userId,businessId,voucherCustomerId,amount,sale.id,ref,client)
// With:
if (input.source === 'store_voucher' && voucherCustomerId) {
  try {
    await debitCardForSale(userId,businessId,voucherCustomerId,effectiveAmount,sale.id,input.referenceId??null,client,{ pin: voucherPin!, last4: voucherLast4! });
  } catch (err: any) {
    if (err.code === 'INVALID_VOUCHER_PIN') {
      // Persist attempt outside the rolled-back sale TX
      const card = await prisma.customerCard.findUnique({ where:{customerId: voucherCustomerId}, select:{ pinAttempts:true }});
      const attempts = (card?.pinAttempts ?? 0) + 1;
      const { nextLockDuration } = await import('@/services/voucher-pin.service');
      const lockMs = nextLockDuration(attempts);
      await prisma.customerCard.update({ where:{ customerId: voucherCustomerId }, data:{ pinAttempts: attempts, ...(lockMs?{pinLockedUntil: new Date(Date.now()+lockMs)}:{}) }});
    }
    throw err;
  }
}
// After prisma.$transaction resolves (post-commit):
if (input.source === 'store_voucher' && voucherCustomerId) {
  void dispatchVoucherDeductionEmail({ businessId, customerId: voucherCustomerId, amountDebited: effectiveAmount, receiptNumber: input.referenceId ?? null, saleId: sale.id });
}
// Note: only fire when !tx (sale created via outer $transaction). If caller passed externalTx, caller owns the post-commit dispatch.
```

**Why closure locals not `payload as any.__voucherAuth`:** type-safe, no mutation, survives object cloning.

**Verify:** `npx tsc --noEmit`; manual `POST /sales` with good/bad PIN/last4.

---

### Phase 7 — Routes, Controllers, Validators, Rate Limiter

**Files:**
- `backend/src/validators/sales.validator.ts` — add `voucherPin`/`voucherLast4` to metadata schema; delete `voucherStepUpToken` expectation.
- `backend/src/validators/customer-card.validator.ts` — add `changeVoucherPinSchema`.
- `backend/src/controllers/customer-card.controller.ts` — add `resendPin` + `changePin` handlers, remove `requestOtp`/`verifyOtp`, simplify `getCard`.
- `backend/src/routes/customer-card.routes.ts` — replace OTP routes.
- `backend/src/middleware/security.ts` — limiter.

**Validator diff (`customer-card.validator.ts`):**
```ts
export const changeVoucherPinSchema = z.object({
  currentPin: z.string().regex(/^\d{6}$/, 'Current PIN must be 6 digits'),
  newPin: z.string().regex(/^\d{6}$/, 'New PIN must be 6 digits'),
}).refine(d => d.currentPin !== d.newPin, { message: 'New PIN must differ', path: ['newPin'] });
```

**Controller diff:**
```ts
export const resendPin = asyncHandler(async (req,res) => {
  z.object({}).strict().parse(req.body);
  const result = await customerCardService.resendVoucherPin(req.user!.userId, req.params.businessId, req.params.customerId);
  res.status(200).json({ success: true, data: result, message: 'New PIN sent to customer email' });
});
export const changePin = asyncHandler(async (req,res) => {
  const { currentPin, newPin } = changeVoucherPinSchema.parse(req.body);
  await customerCardService.changeVoucherPin(req.user!.userId, req.params.businessId, req.params.customerId, { currentPin, newPin });
  res.status(200).json({ success: true, message: 'Voucher PIN updated successfully' });
});
// getCard — remove x-voucher-auth header logic
export const getCard = asyncHandler(async (req,res) => {
  const result = await customerCardService.getCustomerCard(req.user!.userId, req.params.businessId, req.params.customerId);
  res.status(200).json({ success:true, data: result });
});
```

**Route diff:**
```ts
// Delete
router.post('/:customerId/card/otp/request', voucherOtpRequestRateLimiter, customerCardController.requestOtp);
router.post('/:customerId/card/otp/verify', customerCardController.verifyOtp);
// Add
import { voucherPinRateLimiter } from '@/middleware/security';
router.post('/:customerId/card/pin/resend', voucherPinRateLimiter, customerCardController.resendPin);
router.post('/:customerId/card/pin/change', customerCardController.changePin);
```

**Limiter (`security.ts`):**
```ts
export const voucherPinRateLimiter = rateLimit({
  windowMs: 60*60*1000, max: 5, // dev: 30
  keyGenerator: (req) => `pin_resend:${req.params.businessId}:${req.params.customerId}`,
  handler: (_req,res)=> res.status(429).json({ error:{ code:'PIN_RESEND_RATE_LIMITED', message:'Too many PIN resends. Try again later.' }}),
});
```

---

### Phase 8 — Frontend: Helpers + Customers Table

**Files:**
- `frontend/src/lib/format.ts` — add `maskPhoneSuffix`.
- `frontend/src/pages/Customers.tsx` — eye toggle.

**`maskPhoneSuffix`:**
```ts
export function maskPhoneSuffix(phone: string): string {
  const c = phone.trim();
  if (c.length <= 4) return '••••';
  return `${c.slice(0, c.length - 4)}••••`;
}
```

**`Customers.tsx` phone column:**
```tsx
const [showPhone, setShowPhone] = useState<Record<string,boolean>>({});
// In row:
<span className="font-mono text-xs">{showPhone[c.id] ? c.phone : maskPhoneSuffix(c.phone)}</span>
<button onClick={()=> setShowPhone(s=>({...s,[c.id]:!s[c.id]}))} aria-label={showPhone[c.id]?'Hide phone':'Show phone'} className="text-slate-400 hover:text-slate-700">
  {showPhone[c.id] ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
</button>
```

---

### Phase 9 — Frontend: VoucherPayModal + AddSaleModal + Store/Types

**Files:**
- `frontend/src/components/customers/VoucherPayModal.tsx` — **rewrite** (keep filename or rename).
- `frontend/src/components/AddSaleModal.tsx` — wire.
- `frontend/src/stores/customer.store.ts` — update.
- `frontend/src/types/index.ts` — `hasPin`.
- `frontend/src/components/customers/ChangeVoucherPinModal.tsx` — **new**.

**9a — `VoucherPayModal.tsx` (replaces 339-line OTP modal):**

State: `customer`, `pin`, `last4`, `showPin`, `showLast4`, `fieldErrors`.

No `otpSent`/`stepUpToken`/`maskedPhone`/`silentTestCode`.

Layout: CustomerAutocomplete → balance card (manager prefetch via `fetchCustomerCard(businessId,customer.id)` on selection; staff no prefetch) → PIN field (password+eye, `inputMode numeric`, `maxLength 6`, `^\d{6}$`) → Last4 field (hint `maskPhoneSuffix(customer.phone)` + eye) → single `Authorize & Pay →` button disabled unless `customer && /^\d{6}$/.test(pin) && /^\d{4}$/.test(last4) && !isInsufficient`. On click: `onAuthorized({customerId:customer.id,customerName:customer.name,pin,last4})`.

Error mapping (from sale POST): `INVALID_VOUCHER_PIN` → inline under PIN + remainingAttempts; `VOUCHER_PIN_LOCKED` → amber banner with retryAfterMinutes; `INVALID_LAST4` → inline under last4; `VOUCHER_PIN_NOT_SET` → "No PIN set — Resend PIN" CTA.

**9b — `AddSaleModal.tsx`:**
```ts
// Before state
const [voucherStepUpToken, setVoucherStepUpToken] = useState<string>();
// After
const [voucherPin, setVoucherPin] = useState<string>('');
const [voucherLast4, setVoucherLast4] = useState<string>('');
const [voucherCustomer, setVoucherCustomer] = useState<Customer|null>(null);
// On authorized
onAuthorized={({customerId,pin,last4}) => { setVoucherCustomer(c); setVoucherPin(pin); setVoucherLast4(last4); }}
// On submit
body.metadata = { voucherCustomerId: voucherCustomer!.id, voucherPin, voucherLast4 };
```

**9c — `customer.store.ts`:**
```ts
resendVoucherPin: async (businessId,customerId) => {
  const { data } = await api.post(`/businesses/${businessId}/customers/${customerId}/card/pin/resend`);
  return data.data; // { maskedEmail }
},
changeVoucherPin: async (businessId,customerId,currentPin,newPin) => {
  await api.post(`/businesses/${businessId}/customers/${customerId}/card/pin/change`, { currentPin, newPin });
},
// fetchCustomerCard(businessId,customerId) — drop stepUpToken param
```

**9d — `types/index.ts`:**
```ts
interface CustomerCard { id:string; businessId:string; customerId:string; cardCode:string; balance:number; isActive:boolean; hasPin:boolean; createdAt:string; updatedAt:string; ledgers?:... }
```

**9e — `ChangeVoucherPinModal.tsx` (new, ~80 lines):**
```tsx
// Props: isOpen, businessId, customerId, onClose, onSuccess
// Fields: currentPin, newPin, confirmPin (all password+eye, 6-digit)
// Validate: newPin !== currentPin, confirmPin === newPin
// Submit: customerStore.changeVoucherPin(businessId,customerId,currentPin,newPin) → toast success → onSuccess
```

---

### Phase 10 — Frontend Polish & Customer Detail Actions

**File:** `frontend/src/pages/Customers.tsx` detail drawer (or `CustomerDetailDrawer.tsx` if exists)

Add row near `cardCode`/`balance`:
```tsx
<div className="flex gap-2">
  <Button variant="ghost" size="xs" onClick={handleResendPin}><Mail className="w-3.5 h-3.5"/> Resend PIN</Button>
  <Button variant="ghost" size="xs" onClick={()=> setChangePinOpen(true)}><KeyRound className="w-3.5 h-3.5"/> Change PIN</Button>
</div>
// handleResendPin: try resendVoucherPin → toast `New PIN sent to j***@gmail.com`; catch 429 → toast rate-limit
```

**Polish rules (from §8f — enforce in review):**
- One hero (ATM card in email only). POS modal/tables stay minimal (white, `border-gray-200`, `rounded-lg`, `text-xs` labels).
- Typography `Inter` + `monospace` for digits only.
- Density `gap-3`/`p-3`/`space-y-3`, not `p-8`.
- Palette: WallX purple `#7c3aed` + slate-900/amber-400 inside card only; emerald/red for money.
- No entrance animations; `transition-colors` on eye only.

---

### Phase 11 — Tests & Verification

**Unit:**
- `voucher-pin.service.test.ts` — generate 6-digit, hash round-trip, `validatePinFormat` reject, `checkPinLock` 423, `nextLockDuration` 3→15m 5→1h.
- Extend `voucher-notification-email.test.ts` — ATM card branch when `pinCode` present.
- `voucher-deduction-email.test.ts` — new template renders.

**Integration:**
- Update `customer-card` tests: wrong PIN increments, 3rd wrong locks 15m, wrong last4 no increment, `VOUCHER_PIN_NOT_SET`, manager view vs debit, resend/change.

**E2E (`api.e2e.test.ts`):**
- Create customer with email → card `hasPin:true`.
- `POST /sales` store_voucher correct PIN+last4 → 201 + ledger `sale_debit` + deduction email.
- Wrong PIN → 401 `INVALID_VOUCHER_PIN`; wrong last4 → 401 `INVALID_LAST4`; 3rd wrong → 423; null hash → 409; resend/change flows.

**Manual frontend:**
- Create customer → ATM email (gradient + PIN box).
- Till: select customer → enter PIN+last4 → sale succeeds; wrong PIN shows remaining; resend invalidates old PIN; change PIN works; deduction receipt email arrives; phone eye toggle.

**Infra:**
```
cd backend && npm run build   # no TS errors
cd frontend && npm run build  # no TS errors
npm run lint                  # clean
```

---

## 6) Edge Cases

| Case | Handling |
|---|---|
| `customer.email` null → no ATM/deduction email | `logger.warn` + skip send; optional future SMS fallback |
| `customer.phone` null/invalid → last4 can't be verified | `CUSTOMER_PHONE_INVALID` 400 — prompt to update phone first |
| Existing cards with `pinHash=null` | First voucher sale → `VOUCHER_PIN_NOT_SET` 409 → staff Resend PIN |
| Concurrent wrong PIN guesses | Serialized via sale TX + separate attempt-persist TX; lock uses `pinLockedUntil` |
| `RESEND_API_KEY` missing in prod | Boot `logger.warn`; dev falls back to Winston `delivered:false` |
| Manager creates sale without PIN | **Blocked** — debit now requires PIN+last4 for all roles; manager bypass only for viewing |
| `voucherPin` in sale metadata persisted? | `metadata` stores PIN transiently — **do not persist plaintext PIN**. Strip `voucherPin`/`voucherLast4` from `metadata` before `salesTransaction.create` (store only `voucherCustomerId`) |
| Downgrade/over-limit | See `prompts/downgrade.md` — standalone plan |

---

## 7) Testing Strategy

See Phase 11. Critical addition: **negative tests** for attempt persistence — assert `pinAttempts` incremented in DB after a failed sale TX rollback.

---

## 8) Acceptance Criteria

- [ ] `CustomerCard` has `pinHash`/`pinAttempts`/`pinLockedUntil`; migration hand-authored.
- [ ] New customer → PIN generated (12-round bcrypt) + ATM email with gradient card + PIN box; no PIN in logs/responses.
- [ ] `POST /sales` `store_voucher` without `voucherPin`/`voucherLast4` → 400; wrong last4 → 401 no attempt increment; wrong PIN → 401 with remaining; 3rd wrong → 423 15m lock.
- [ ] `FOR UPDATE` + `prisma.$transaction(TX_OPTIONS)` preserved; concurrent debits serialize.
- [ ] Post-commit `dispatchVoucherDeductionEmail` fires on every `sale_debit` (fire-and-forget, not in TX).
- [ ] `POST .../pin/resend` (5/h) + `.../pin/change` work; rate limit 429; audit `card.pin_resent`/`pin_changed`.
- [ ] KudiSMS voucher OTP path fully removed; `kudismsClient` no longer imported for vouchers.
- [ ] `VoucherPayModal` (PIN+last4) + `ChangeVoucherPinModal` + phone eye toggle shipped; `AddSaleModal` sends `voucherPin`/`voucherLast4` not `voucherStepUpToken`.
- [ ] `VoucherPayModal` not AI-generated per §10 polish rules.
- [ ] `npm run build` + `lint` green; e2e voucher PIN→sale flow passes.

---

## 9) Remaining Questions

1. Should `dispatchVoucherDeductionEmail` have an SMS fallback via KudiSMS when `customer.email` is null? Proposal: log-warn for v1, add SMS in follow-up.
2. Should `pendingVerificationId` columns be dropped in this migration or a follow-up? Proposal: follow-up, one release after deploy.

---

## 10) Readiness Score

**9/10 — implementation-ready.** One point reserved for manual QA of email rendering across clients (Gmail/Outlook) and the two-TX attempt-persist integration test.

> **Downgrade handling** was extracted to `prompts/downgrade.md` (standalone rereviewed plan, 2026-10-10). See that file for preview + `confirmDowngrade: true` guard + phased D0–D6.

---

## 11) Changelog (Old → New)

| Area | Change | Reason |
|---|---|---|
| PIN crypto | `bcryptjs` → `bcrypt` 12 rounds | Installed dep |
| Sales wiring | `__voucherAuth as any` → closure locals | Type safety |
| Attempt persist | In-TX increment → separate TX on catch | Rollback would lose count |
| KudiSMS | Hedge → confirmed delete | Grep single consumer |
| File list | Vague → 25-file verified list | Dumb-dev needs exact paths |
| Frontend | Chicken-egg → manager prefetch / staff post-verify | Balance visibility correct |
| Metadata | PIN persisted in metadata → stripped before create | Secret hygiene |
| Schema | Missing attempt strategy → two-TX documented | Brute-force guarantee |
| Downgrade | Extracted → `prompts/downgrade.md` (standalone) | Orthogonal concern; was bloating voucher plan |

