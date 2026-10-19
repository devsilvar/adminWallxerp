# Implementation Plan: PIN-Authenticated BVN Management in Settings

**v1.1 — revised after senior engineering review (Sep 2, 2026).** Incorporates all fixes from the Verification Findings section at the bottom: verification semantics (`bvnVerifiedAt`), `bvnLast4` exposure, shared step-up-token helper, BVN uniqueness, DVA-change warning, transactional audit, and error-contract symmetry.

Enable returning users to securely view, enter, or update their Bank Verification Number (BVN) directly from **Settings → Profile**, protected by 4-digit transaction PIN step-up authentication and audit logging.

## Proposed Architecture & Security Design

```
┌─────────────────┐       1. Click "Update BVN"       ┌────────────────────────┐
│ Settings UI     │ ─────────────────────────────────> │ PinModal               │
│ (Profile Tab)   │                                    │ (4-digit PIN Pad)      │
└─────────────────┘                                    └────────────────────────┘
        ▲                                                          │
        │ 3. Open UpdateBvnModal                                   │ 2. /api/v1/auth/pin/verify
        │    with stepUpToken                                      ▼
┌───────────────────────┐   4. Submit BVN + stepUpToken   ┌──────────────────────────────┐
│ UpdateBvnModal        │ ──────────────────────────────> │ Backend API                  │
│ (11-digit BVN input)  │                                 │ POST /auth/update-bvn        │
└───────────────────────┘                                 └──────────────────────────────┘
                                                                           │
                                                                           ▼
                                                  ┌───────────────────────────────────────────┐
                                                  │ • Verify stepUpToken (shared helper)      │
                                                  │ • No-op if BVN unchanged                  │
                                                  │ • Reject BVN already linked to another    │
                                                  │   account (409 BVN_ALREADY_LINKED)        │
                                                  │ • Update users.bvn + CLEAR bvnVerifiedAt  │
                                                  │   (verification returns to Pending until  │
                                                  │   the DVA/Paystack flow re-approves it)   │
                                                  │ • Transactional audit `user.bvn_updated`  │
                                                  │   (last-4 only, never raw BVN)            │
                                                  │ • Return DVA-warning meta if any of the   │
                                                  │   user's businesses has an active DVA     │
                                                  └───────────────────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> - **Security Standard**: Direct changes to BVN require **Step-Up Authentication** via the user's 4-digit transaction PIN (5-minute single-purpose `pin_step_up` JWT from `POST /auth/pin/verify`).
> - **Verification semantics (Issue 1 fix)**: A BVN entered here is **self-asserted, not verified**. On any BVN *change*, `bvnVerifiedAt` is **cleared to null** — the identity status drops to *Pending* until the existing DVA/Paystack `validate-customer` flow re-approves it. We never *grant* verification without evidence. (Follow-up option: route the update through Paystack identification directly — see Findings, Issue 1a.)
> - **PII Protection**: Raw BVN is never returned on any profile call. `sanitizeUser` gains a computed, non-reversible `bvnLast4` field (`•••••1234`) — this is the **only** masked value the frontend can render (Issue 2 fix; `bvn` itself stays stripped).
> - **Uniqueness (Gap 5 fix)**: A BVN already linked to a *different* account is rejected with `409 BVN_ALREADY_LINKED` (service pre-check for a friendly error; app-level check is the guard since no DB unique constraint exists on `users.bvn`).
> - **Audit Trail**: Every BVN update writes a transactional audit row (`user.bvn_updated`, inside `prisma.$transaction`) capturing IP, User Agent, and last-4 digits only — never the raw 11-digit BVN.
> - **DVA impact**: If any of the user's businesses has an active DVA, the response carries `meta.dvaReauthRequired` so the UI can warn that Paystack identification was performed against the old BVN.

---

## Proposed Changes

### Backend

#### [MODIFY] [pin.service.ts](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/pin.service.ts) — shared token helper (Gap 4 fix)
- Extract `verifyStepUpToken(userId: string, token: string): void` — `jwt.verify` against `config.jwt.accessSecret`, then require `payload.purpose === 'pin_step_up'` AND `payload.userId === userId`; any failure → `401 INVALID_STEP_UP_TOKEN`.
- Refactor `revealBvn`'s inlined token check (`auth.service.ts:42-51`) to call this helper, so both sensitive endpoints share one implementation and cannot drift.

#### [NEW] updateBvnSchema in [auth.validator.ts](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/validators/auth.validator.ts)
- `updateBvnSchema` with:
  - `bvn`: string matching `/^\d{11,12}$/` (matches `dva.validator.ts` convention — Paystack test-mode BVNs may be 12 digits; column is `VarChar(12)`).
  - `stepUpToken`: non-empty string (presence only; cryptographic validation happens in the service helper).
- Export `UpdateBvnInput = z.infer<typeof updateBvnSchema>`.

#### [MODIFY] [auth.service.ts](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/services/auth.service.ts)
- **`sanitizeUser` (Issue 2 fix):** expose computed `bvnLast4: user.bvn ? '•••••' + user.bvn.slice(-4) : null`. Raw `bvn`/`nin`/`transactionPin` remain stripped. `/auth/me` consumers (Settings card, Dashboard chip) get a data source for the masked display without any new endpoint.
- **`updateBvn(userId, input: UpdateBvnInput, ip?, userAgent?)`:**
  1. `pinService.verifyStepUpToken(userId, input.stepUpToken)` — shared helper, throws `401 INVALID_STEP_UP_TOKEN` on expiry/mismatch (symmetric with the reveal path).
  2. Load current user; **no-op return** if `user.bvn === input.bvn` (saves a write + audit row — same pattern as `updateMe`).
  3. **Uniqueness pre-check:** look up another user with the same `bvn`; if found → `409 BVN_ALREADY_LINKED`.
  4. Inside `prisma.$transaction`: update `bvn`, **set `bvnVerifiedAt = null`** (Issue 1 fix — self-asserted BVN must not appear verified), and write transactional `logAudit('user.bvn_updated', …, tx)` with `{ bvnLast4 }` (old + new last-4), IP, User Agent.
  5. After the tx: check whether any of the user's businesses has an active DVA (`dvaStatus === 'active'`); if so include `meta: { dvaReauthRequired: true, businessIds }` in the response (Gap 5 fix — Paystack identification was done against the old BVN).
  6. Returns `{ success: true, message: 'BVN updated. Identity verification is now pending re-approval.', meta }`.

#### [MODIFY] [auth.controller.ts](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/controllers/auth.controller.ts)
- Add `updateBvn` handler: parse with `updateBvnSchema`, call `authService.updateBvn(req.user!.userId, input, req.ip, req.headers['user-agent'])`, return 200 with the service result.

#### [MODIFY] [auth.routes.ts](file:///c:/Users/pc/Desktop/tax%20by%20wallx/backend/src/routes/auth.routes.ts)
- Wire `POST /update-bvn` with `authenticate`, grouped under the existing `// ─── Sensitive Data (PIN Step-Up Required) ───` block beside `/reveal-bvn`. No per-route rate limiter (consistent with `/reveal-bvn` — brute-force protection is the PIN attempt lockout).

#### Sequencing note (Gap 3 fix — PII encryption)
`noticepay4.md` plans field-level encryption of `users.bvn` (`PII_ENCRYPTION_KEY` + `encryptPii()` lib); **neither the migrations nor the lib exist yet**. If noticepay4 lands first, step 4 of `updateBvn` must write `encryptPii(input.bvn)` and `bvnLast4` must derive from `decryptPii()` — write the service so the BVN write is a single assignment point (`const valueToStore = config.pii?.encryptionKey ? encryptPii(input.bvn) : input.bvn`) so both orderings work without a rewrite.

---

### Frontend

#### [NEW] [UpdateBvnModal.tsx](file:///c:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/components/UpdateBvnModal.tsx)
- Reusable, clean modal with:
  - 11-digit formatted input with instant validation (11–12 digits, matching the backend regex) and CBN disclaimer.
  - `*565*0#` USSD helper tip for Nigerian users.
  - Pre-filled with nothing (BVN is never sent to the client) but shows the currently linked masked value passed down from Settings for context.
  - Loading state while submitting to `POST /auth/update-bvn`.
  - Handles `409 BVN_ALREADY_LINKED` ("This BVN is already linked to another PayMyTax account"), `401 INVALID_STEP_UP_TOKEN` (prompt re-entry of PIN), and `meta.dvaReauthRequired` (inline amber warning: "Your Dedicated Virtual Account was verified against your previous BVN — you'll need to re-confirm your identity on the Account page").

#### [MODIFY] [Settings.tsx](file:///c:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/pages/Settings.tsx)
- Add **Identity & KYC (BVN)** Card to `ProfilePanel`:
  - Shows current status from `user.bvnVerifiedAt` (Verified Tier 2 / Pending) — already returned by `/auth/me`.
  - Shows masked BVN from `user.bvnLast4` (Issue 2 fix — rendered as `•••••••1234`) or "No BVN linked".
  - Action button: **"Update BVN"** or **"Link BVN"**.
  - Clicking opens the existing `PinModal` (`frontend/src/components/PinModal.tsx` — reuse, do not rebuild; its `onSuccess(stepUpToken)` contract is exactly this flow).
  - On PIN success, opens `UpdateBvnModal` pre-authenticated with `stepUpToken`.
  - On save, triggers `fetchMe()` to refresh `bvnLast4` + `bvnVerifiedAt` globally across the dashboard. Status will read **Pending** after a change — this is intended behavior (verification re-approves via the DVA flow), so the card copy explains it rather than looking like an error.

---

## Verification Plan

### Automated Tests & Type Checking
- Run `npx tsc --noEmit` on backend to verify types.
- Run `npm run typecheck` or `npm run build` on frontend to verify components.
- Add e2e cases to `tests/e2e/api.e2e.test.ts`: update without token → 401; with token → bvn changed + `bvnVerifiedAt` null + `user.bvn_updated` audit row; duplicate BVN → 409; unchanged BVN → no audit row; response shape of `/auth/me` contains `bvnLast4` but not `bvn` (regression guard for Issue 2).

### Manual Verification Flow
1. Navigate to **Settings → Profile**.
2. Locate the **Identity & Verification (BVN)** card.
3. Click **Update BVN** → Verify `PinModal` opens.
4. Enter 4-digit PIN `1234` (seed default) → Verify `PinModal` validates PIN and transitions to BVN Input modal.
5. Enter an 11-digit test BVN **not used by seed users** (e.g. `33333333331` — `22222222221`/`22222222222` collide with seeds and the new uniqueness check would 409) and click **Save BVN**.
6. Verify success toast appears, Profile displays the new masked `bvnLast4`, and status reads **Pending** (verification cleared — correct behavior).
7. Return to **Dashboard** → Verify the BVN chip reflects the pending status and PIN reveal works seamlessly.
8. Re-enter the seed BVN of another user → Verify `409 BVN_ALREADY_LINKED` surfaces a friendly error.

---

## ✅ Verification Findings (Senior Engineer Audit — Sep 2, 2026)

> [!NOTE]
> **v1.1 status: all findings below are now incorporated into the plan above.** Issue 1 → option (b) implemented (verification cleared on change; Paystack-routed update noted as follow-up). Issue 2 → `bvnLast4` in `sanitizeUser`. Gap 3 → sequencing note in Proposed Changes. Gap 4 → shared `verifyStepUpToken` helper. Gap 5 → uniqueness check, DVA meta warning, transactional audit. Minor nits 1, 2, 4 → fixed in diagram, test steps, and error contract; nit 3 (token replay) remains a noted v1 security-review item.

Verified line-by-line against the working tree. **Verdict: architecturally sound — the plan correctly builds on existing, proven infrastructure — but 2 blocking issues and 3 gaps must be fixed before implementation.**

### What checks out (confirmed in code)

| Plan assumption | Verified at |
|---|---|
| `PinModal` exists with `onSuccess(stepUpToken)` | `frontend/src/components/PinModal.tsx:9,96` |
| `POST /auth/pin/verify` returns `{ valid, stepUpToken }` | `auth.routes.ts:27`, `pin.service.ts:218` |
| Token signed `{ userId, purpose: 'pin_step_up' }`, accessSecret, 5-min expiry | `pin.service.ts:211-216` |
| Validation contract (`purpose` + `userId` match) identical to shipped `revealBvn` | `auth.service.ts:44-51` |
| `/auth/me` strips raw BVN/NIN/PIN (PII claim holds) | `auth.service.ts:29-32` (`sanitizeUser`) |
| `ProfilePanel` exists in Settings.tsx with **no** BVN card yet (no duplication w/ Account.tsx) | `Settings.tsx:407` |
| BVN regex `^\d{11,12}$` matches codebase convention (Paystack test-mode 12-digit BVNs; `VarChar(12)`) | `dva.validator.ts`, `schema.prisma` |
| Audit last-4-only rule matches repo precedent | `dva.service.ts:96-98` |
| Test PIN `1234` + BVN `22222222221` match seed | `prisma/seed.ts` (`defaultPinHash`) |

### 🔴 Blocking Issue 1 — `bvnVerifiedAt` becomes a self-asserted lie

`updateBvn` stamps `bvnVerifiedAt = new Date()` with **zero verification**. The only other writer of this column is `dva.service.validateCustomer`, which stamps *after* Paystack identification succeeds. `NOTICEPAY_STATUS_REPORT.md:270` already flagged optimistic stamping as "the column name lies" — this plan makes it worse: any user can self-declare an arbitrary BVN and appear "Verified Tier 2".

**Fix (pick one):**
- **(a) Preferred:** route the update through the existing `validateCustomer` path (Paystack bank_account cross-check) — step-up token proves *who*, Paystack proves the BVN is *real and theirs*.
- **(b) Minimum:** on BVN change, set `bvnVerifiedAt = null` (status drops to Pending until DVA re-validation) — never *grant* verification without evidence.

### 🔴 Blocking Issue 2 — Settings card has no data source for the masked BVN

The plan's card spec says "Shows masked BVN (`•••••••1234`)" — but `sanitizeUser` strips `bvn` entirely, so `/auth/me` returns **neither** the BVN nor its last-4. The frontend literally cannot render masked digits. `bvnVerifiedAt` IS returned (status badge works; Dashboard chip already uses it).

**Fix:** extend `sanitizeUser` to expose a computed `bvnLast4: user.bvn ? `•••••${user.bvn.slice(-4)}` : null` (never the raw value). One line + a response-shape regression test.

### 🟡 Gap 3 — Collides with the pending PII-encryption plan (noticepay4.md)

`noticepay4.md` v1.1 plans field-level encryption of `users.bvn` (`PII_ENCRYPTION_KEY`, migrations `20260830140000` + `20260901120000_encrypt_user_pii`, a new `src/lib` crypto helper). **Neither migration nor lib exists yet** (last migration: `20260830130000_add_pin_attempt_window`). Today, plaintext writes match the schema — but if noticepay4 lands first, `updateBvn` MUST encrypt before write and `revealBvn` must decrypt. **Sequence explicitly or amend this plan to call `encryptPii()` behind a helper so both orderings work.**

### 🟡 Gap 4 — DRY: extract `verifyStepUpToken(userId, token)`

`revealBvn` already contains the exact jwt.verify + purpose/userId check this plan re-specifies (`auth.service.ts:42-51`). Extract a shared `pin.service.verifyStepUpToken()` (as noticepay4 §5.1 designed) and use it in both — otherwise the two copies drift and a future fix lands in one but not the other.

### 🟡 Gap 5 — Unaddressed downstream effects of a BVN change

- **DVA linkage:** Paystack customer identification was performed against the *old* BVN. If a business has an active DVA, a silent BVN swap can break identification consistency. Define behavior: warn, block while `dvaStatus = 'active'`, or force re-identification.
- **Uniqueness:** `users.bvn` has an index but **no unique constraint** — one BVN can be linked to many accounts. Pre-existing gap, but user-self-service editing makes it exploitable. Add a service-level uniqueness check (friendly 409) at minimum.
- **Audit transactionality:** repo convention for mutations is transactional `logAudit(..., tx)` inside `prisma.$transaction` — spec it (plan currently just says "fires logAudit").

### 🟢 Minor nits

1. Diagram says "11-digit **NIBSS** input" — wrong term; NIBSS codes are the 3-digit bank codes. BVN is the 11-digit number.
2. Manual test BVN `22222222221` collides with seeded users' BVN — if Gap 5's uniqueness check is added, the test will 409. Use a different 11-digit value in the test steps.
3. Step-up token is replayable for 5 minutes across sensitive endpoints (reveal + update). Acceptable for v1; note for the security review.
4. `POST /update-bvn` should reuse the `INVALID_STEP_UP_TOKEN` (401) / `PIN_NOT_SET` (400) error codes from the reveal path — keep the error contract symmetric.

### Bottom line

Approve the **shape** of the plan (PinModal → stepUpToken → POST /update-bvn → fetchMe is exactly the established reveal-BVN pattern). Do **not** implement as written: fix Issues 1–2, decide sequencing vs noticepay4, and fold Gaps 4–5 into the service design.
