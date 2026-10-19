# User Verification Plan — PayMyTax

> **Document purpose:** Covers two independent verification flows:
> 1. **Part A — Admin-side manual verification** (already implemented backend+frontend, just needs testing + minor UX polish)
> 2. **Part B — Self-service email verification on signup** (plan now, implement later when Resend domain is verified)

---

## Codebase Audit (Ground Truth — Inspected, Not Assumed)

### What already exists ✅

| Layer | File | What is there |
|---|---|---|
| **DB Schema** | `backend/prisma/schema.prisma:24` | `isVerified Boolean @default(false)` on User — column exists |
| **Admin service** | `backend/src/services/admin.service.ts:156-234` | `verifyUserEmail()` + `unverifyUserEmail()` both implemented with `logAudit` |
| **Admin controller** | `backend/src/controllers/admin.controller.ts:60-74` | `toggleEmailVerification` — reads `verifyEmailSchema`, dispatches to service |
| **Admin validator** | `backend/src/validators/admin.validator.ts:17-19` | `verifyEmailSchema = z.object({ isVerified: z.boolean() })` |
| **Admin route** | `backend/src/routes/admin.routes.ts:15` | `PATCH /users/:id/email-verification` wired, guarded by `authenticate + authorize('admin')` |
| **Admin UI (list)** | `frontend/src/pages/admin/AdminUsers.tsx` | Shield icon button calls `PATCH /admin/users/:id/email-verification` |
| **Admin UI (detail)** | `frontend/src/pages/admin/AdminUserDetail.tsx` | "Verify Email" / "Unverify Email" Button fully wired |
| **Email lib** | `backend/src/lib/email/index.ts` | `sendEmail()` — Resend when `RESEND_API_KEY` set, Winston dev-fallback otherwise |
| **Frontend types** | `frontend/src/types/index.ts:312-326` | `AdminUser` + `AdminUserDetail` include `isVerified` field |

### What is MISSING ❌

| Gap | Impact |
|---|---|
| No `emailVerificationTokenHash` / `emailVerificationTokenExpiry` on User schema | Email-link verification cannot work |
| No `verification.service.ts` | No service layer for token generation / token verification |
| No `verification.controller.ts` | No endpoints for self-service email verify |
| No auth routes for `POST /verify-email` or `POST /resend-verification` | Frontend cannot trigger self-service flow |
| No `email/templates/verify-email.ts` | No HTML email template for verification link |
| Registration does not send a verification email | Users register and stay `isVerified=false` forever |
| No frontend `VerifyEmail.tsx` page | No landing page for the email link |
| No `EmailVerificationBanner` component | No nudge shown to unverified users in the app |
| No `/verify-email` route in `App.tsx` | Frontend router cannot handle the link |
| No verification status section in `Account.tsx` | No self-service resend from the account page |

---

## PART A — Admin-Side Manual Verification

### Current State Summary

**The backend is 100% complete and functional today.**
`PATCH /api/v1/admin/users/:id/email-verification` with body `{ "isVerified": true }` or `{ "isVerified": false }` works right now.
The service is idempotent, audit-logged, and error-safe.

**The frontend Admin UI is also 100% complete and functional.**
- `AdminUsers.tsx` — table with `ShieldCheck`/`ShieldAlert` icon button per row
- `AdminUserDetail.tsx` — "Verify Email" / "Unverify Email" button in the user detail panel

### Immediate Testing Steps (5 minutes)

1. Log in as admin at `/admin/login` (admin@paymytax.com / Admin@123456)
2. Navigate to `/admin/users`
3. Find a user with a **yellow** "Unverified" badge
4. Click the `ShieldAlert` icon → should flip to green `ShieldCheck` + re-fetch the list
5. Click the `Eye` icon → go to user detail → confirm "Verify Email" / "Unverify Email" button is present and functional
6. Check `/admin/audit-logs` — confirm entry `admin.user_email_verified` appears

### Suggested UX Improvements (Part A — minor)

#### A.1 — Search Box in AdminUsers
The backend `GET /admin/users?search=` is already implemented but there is no search input in the UI.
**File:** `frontend/src/pages/admin/AdminUsers.tsx`
Add a text input that debounces (400ms) and passes `?search=` to the API call — allows admin to quickly find unverified users by email.

#### A.2 — Confirmation Dialog Before Unverifying
Currently clicking the shield icon immediately fires the PATCH. For the "unverify" direction (flipping a verified user to unverified) a confirm dialog should be shown to prevent accidental revocation.
Use `window.confirm()` or a small inline modal — no new library needed.

---

## PART B — Self-Service Email Verification on Signup

> **Implementation status:** Planned, not yet built.
> **Blocked on:** Nothing technical. Can be built and tested in dev right now (token appears in Winston logs as a fallback). Goes live automatically once Resend domain is verified.

### Architecture Flow

```
User registers (POST /auth/register)
    │
    ▼  [outside the DB transaction — matches bcrypt-outside-tx rule]
verification.service.ts:generateVerificationToken(userId)
    │  stores SHA-256(token) hash + 24h expiry in DB
    ▼
sendVerificationEmail(userId, email, rawToken)
    │  lib/email → Resend (prod) or Winston log (dev fallback)
    ▼
User receives email → clicks link: /verify-email?token=<rawToken>
    │
    ▼
VerifyEmail.tsx page → POST /api/v1/auth/verify-email { token }
    │
    ▼
verification.service.ts:verifyEmail(rawToken)
    │  SHA-256 hash → findFirst by hash + expiry > now
    │  sets isVerified=true, clears token, writes audit log
    ▼
User.isVerified = true ✅
```

---

### Phase B.1 — Schema Migration

**File to modify:** `backend/prisma/schema.prisma`

Add to the `model User {}` block (after `resetTokenHash` field, line ~30):

```prisma
emailVerificationTokenHash   String?   @map("email_verification_token_hash")
emailVerificationTokenExpiry DateTime? @map("email_verification_token_expiry")
```

**Security rationale:** Store only the SHA-256 hash — matches the existing `resetTokenHash` / `resetTokenExpiresAt` pattern in `forgotPassword`. A DB breach cannot be used to verify accounts.

**Migration command:**
```bash
cd backend
npx prisma migrate dev --name add_email_verification_token
```

---

### Phase B.2 — Verification Service

**New file:** `backend/src/services/verification.service.ts`

Key functions:

```typescript
// Generates a raw token, stores only its hash + expiry
async function generateVerificationToken(userId: string): Promise<string>

// Sends the verification email via lib/email (Resend or Winston fallback)
async function sendVerificationEmail(
  userId: string,
  email: string,
  rawToken: string
): Promise<{ delivered: boolean }>

// Verifies a token — hash match, not expired, sets isVerified=true in a transaction
async function verifyEmail(rawToken: string): Promise<{ userId: string; email: string }>

// Resend — authenticated, must be unverified; generates new token (invalidates old one)
async function resendVerificationEmail(userId: string): Promise<{ delivered: boolean }>
```

---

### Phase B.3 — Email Template

**New file:** `backend/src/lib/email/templates/verify-email.ts`

Follows exact same pattern as `password-reset.ts` — exports `generateVerifyEmailHtml()` and `generateVerifyEmailText()`.
PayMyTax-branded HTML with a clear "Verify Email" CTA button, 24-hour expiry notice, and footer.

---

### Phase B.4 — Verification Controller

**New file:** `backend/src/controllers/verification.controller.ts`

Two handlers:
- `verifyEmail` — public route, reads `token` from body, calls service, returns 200
- `resendVerification` — authenticated route, calls service, returns 200 with `delivered` flag and appropriate message for dev vs prod

---

### Phase B.5 — Auth Routes

**File to modify:** `backend/src/routes/auth.routes.ts`

Add two routes:
```typescript
router.post('/verify-email', verificationController.verifyEmail);
router.post('/resend-verification', authRateLimiter, authenticate, verificationController.resendVerification);
```

`/verify-email` — public (user may open link in a different browser)
`/resend-verification` — requires authentication + uses existing `authRateLimiter`

---

### Phase B.6 — Registration Hook

**File to modify:** `backend/src/services/auth.service.ts`

After the `prisma.$transaction` block that creates the user (currently ends at line 70), add — outside the transaction:

```typescript
// Fire-and-forget verification email. Must not block registration if email fails.
let verificationLinkForDev: string | undefined;
try {
  const rawToken = await generateVerificationToken(user.id);
  const emailResult = await sendVerificationEmail(user.id, user.email, rawToken);
  // In dev, when Resend is not configured, expose the link so it can be tested
  if (config.app.isDevelopment && !emailResult.delivered) {
    const frontendUrl = config.cors.frontendUrl.split(',')[0].trim();
    verificationLinkForDev = `${frontendUrl}/verify-email?token=${rawToken}`;
  }
} catch (err) {
  logger.error('Failed to send verification email on register', { userId: user.id, error: err });
}

return {
  user: sanitizeUser(user),
  ...tokens,
  verificationLink: verificationLinkForDev, // undefined in prod, URL in dev when email fails
};
```

This is the identical pattern used by `forgotPassword` with `resetLinkForDev`.

---

### Phase B.7 — Frontend: VerifyEmail Page

**New file:** `frontend/src/pages/VerifyEmail.tsx`

- Reads `?token=` from URL search params
- On mount: `POST /auth/verify-email { token }`
- Three states: `loading` (spinner), `success` (green check, auto-redirect to `/dashboard` after 2s, calls `fetchMe()` to refresh `isVerified` in store), `error` (red X, message, "Resend Email" button navigating to `/account`)
- Accessible via the email link — must work for unauthenticated users

---

### Phase B.8 — Frontend: EmailVerificationBanner

**New file:** `frontend/src/components/EmailVerificationBanner.tsx`

- Renders only when `user && !user.isVerified && !dismissed`
- Fixed amber banner at the top (same visual style as the DVA auto-capture banner in `Sales.tsx`)
- "Resend Email" button → `POST /auth/resend-verification` → toast
- × dismiss button → sets local `dismissed = true`

**File to modify:** `frontend/src/components/layout/AppLayout.tsx`
Import and render `<EmailVerificationBanner />` inside the layout.

---

### Phase B.9 — Frontend: Account Page Status

**File to modify:** `frontend/src/pages/Account.tsx`

Add a verification status card in the Security section (already has BVN/NIN status cards as a pattern).
- Verified: emerald card, ✅ icon, "Your email {email} is verified"
- Unverified: amber card, ⚠️ icon, "Please verify {email}" + "Resend Email" button

---

### Phase B.10 — Frontend: Router

**File to modify:** `frontend/src/App.tsx`

```typescript
import VerifyEmail from '@/pages/VerifyEmail';
// Public route — no auth guard required
<Route path="/verify-email" element={<VerifyEmail />} />
```

---

## Implementation Checklists

### Part A — Admin Verification (Already Built — Just Test + Polish)

- [ ] Test: Admin verifies user via shield icon in `/admin/users` list
- [ ] Test: Admin verifies user via button in `/admin/users/:id` detail page
- [ ] Test: Idempotent — double-clicking "Verify" does not throw an error
- [ ] Test: Audit log `admin.user_email_verified` appears in `/admin/audit-logs`
- [ ] UX: Add search box to `AdminUsers.tsx` (email search using existing `?search=` API)
- [ ] UX: Add confirmation dialog before unverifying a user

### Part B — Email Verification on Signup

**Backend:**
- [ ] Add `emailVerificationTokenHash` + `emailVerificationTokenExpiry` to `schema.prisma`
- [ ] Run `npx prisma migrate dev --name add_email_verification_token`
- [ ] Create `backend/src/services/verification.service.ts`
- [ ] Create `backend/src/lib/email/templates/verify-email.ts`
- [ ] Create `backend/src/controllers/verification.controller.ts`
- [ ] Modify `backend/src/routes/auth.routes.ts` — add 2 routes
- [ ] Modify `backend/src/services/auth.service.ts` — send email after register
- [ ] Dev: Confirm `verificationLink` appears in register response when Resend not configured

**Frontend:**
- [ ] Create `frontend/src/pages/VerifyEmail.tsx`
- [ ] Create `frontend/src/components/EmailVerificationBanner.tsx`
- [ ] Modify `frontend/src/components/layout/AppLayout.tsx` — add banner
- [ ] Modify `frontend/src/pages/Account.tsx` — add verification status section
- [ ] Modify `frontend/src/App.tsx` — add `/verify-email` public route

**Testing (dev, no Resend needed):**
- [ ] Register → `verificationLink` in response JSON or in server logs
- [ ] Visit that URL → `isVerified = true`
- [ ] Try expired token → 400 error
- [ ] Try token twice → second call idempotent (success)
- [ ] Resend → new token generated, old invalidated
- [ ] Banner shows for unverified users, hidden after verification

**Testing (after Resend domain verified):**
- [ ] Register → actual email arrives in inbox
- [ ] Click link → verified, redirected to dashboard
- [ ] "Resend Email" from Account page delivers real email

---

## Security Summary

| Decision | Rationale |
|---|---|
| Store SHA-256 hash of token, not raw token | Matches `resetTokenHash` pattern. DB breach cannot verify accounts. |
| 24-hour token expiry | Standard practice. Long enough for SMEs who check email infrequently. |
| `resend-verification` requires authentication | Prevents strangers from triggering emails to arbitrary addresses. |
| `verify-email` is public (no auth) | User may open the link in a different browser or device. |
| Token cleared after use | One-time-use. Prevents replay attacks. |
| Email failure does not block registration | Pattern from `forgotPassword`. Email is best-effort. |
| Admin verify is idempotent | Returns current state if already verified — no error on double-click. |

---

## Files Summary

### Part A — All Already Exist (Nothing to Create)

| File | Status |
|---|---|
| `backend/src/services/admin.service.ts` | ✅ verifyUserEmail + unverifyUserEmail done |
| `backend/src/controllers/admin.controller.ts` | ✅ toggleEmailVerification done |
| `backend/src/validators/admin.validator.ts` | ✅ verifyEmailSchema done |
| `backend/src/routes/admin.routes.ts` | ✅ PATCH /users/:id/email-verification done |
| `frontend/src/pages/admin/AdminUsers.tsx` | ✅ Shield icon button done (minor UX to add) |
| `frontend/src/pages/admin/AdminUserDetail.tsx` | ✅ Verify Email button done |

### Part B — To Be Created/Modified Later

| File | Action |
|---|---|
| `backend/prisma/schema.prisma` | MODIFY — add 2 token fields |
| `backend/src/services/verification.service.ts` | NEW |
| `backend/src/lib/email/templates/verify-email.ts` | NEW |
| `backend/src/controllers/verification.controller.ts` | NEW |
| `backend/src/routes/auth.routes.ts` | MODIFY — add 2 routes |
| `backend/src/services/auth.service.ts` | MODIFY — send verification email on register |
| `frontend/src/pages/VerifyEmail.tsx` | NEW |
| `frontend/src/components/EmailVerificationBanner.tsx` | NEW |
| `frontend/src/components/layout/AppLayout.tsx` | MODIFY — add banner |
| `frontend/src/pages/Account.tsx` | MODIFY — add verification status card |
| `frontend/src/App.tsx` | MODIFY — add /verify-email public route |
