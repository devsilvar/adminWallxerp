# noticepay4.md — Implementation Plan: Week-1 Critical Batch (money hygiene + PII encryption + PIN step-up)

**Date:** 2026-09-01
**Scope:** The three "fix these first" items — **P0-1** (transfer-recipient reuse), **P1-2** (BVN/NIN encryption at rest), **P1-1** (PIN step-up token so the raw PIN leaves money-request bodies).
**Basis:** every file:line below was re-verified against the working tree this session (line-window reads, not pattern-greps). No stale references.
**Relationship to prior plans:** P0-1 executes **noticepay3 §5 verbatim** (twice-audited, v2.2-corrected — do not re-derive it). P1-2 concretizes noticepay3's Phase-3 "Carried C". P1-1 is the noticepay3 Phase-3 "NEW-F revisit" — previously an accepted risk, now explicitly pulled forward; the design below is the minimal version that closes the failure class the noticepay2 era actually hit.

---

## §0. Ground truth — verified facts this batch rests on

### P0-1 (recipient reuse)
- `settlement.service.ts:798-805` — `createTransferRecipient` is called unconditionally on every admin approval, built from the **payout snapshot** (`payout.destinationAccountName/destinationAccountNum/destinationBankCode`). `paystackRecipientCode` exists nowhere in `schema.prisma`. **OPEN.**
- The payout is loaded with `include: { business }` (`:729-740`); the approve catch marks `failed` + stores the raw error at `:864-874`; audit `settlement.payout_approved` `newData` at `:834-838`.

### P1-2 (BVN/NIN encryption)
- Fields live on the **User** model: `schema.prisma:22-25` — `bvn String? @db.VarChar(12)`, `nin String? @db.VarChar(11)`, `bvnVerifiedAt`, `ninVerifiedAt`; partial `@@index([bvn])` at `:45`.
- **v1.1 — line-numbering caveat:** grep-tool line numbers in `dva.service.ts` run ~11 lines stale against the working tree (the file gained the `dvaFailureReason` clear block; direct reads confirm the current positions). **Anchor on content, not line numbers, in this file.** Direct read: `validateCustomer` starts at `:55`; the plaintext write + optimistic stamps are the `prisma.user.update` at **`:83-91`**; the Paystack call that legitimately receives the plaintext BVN is `:73-80` (stays — it is Paystack's own validation input; only *storage* changes).
- **v1.1 CRITICAL — responses leak the plaintext today:** `sanitizeUser` (`auth.service.ts`) strips only `passwordHash` — so `GET /auth/me`, `updateMe`, and the login/register responses return **plaintext `bvn`/`nin`**. §4.7 fixes this. The zero-*lookup* claim stands: nothing queries by BVN, so no `bvnHash` column is needed.
- **DB facts (from the migrations that created/widened the column):** the index is a **partial index** — `CREATE INDEX "users_bvn_idx" ON "users"("bvn") WHERE "bvn" IS NOT NULL` — and the column carries a **`check_bvn_length` CHECK constraint** (`bvn IS NULL OR length(bvn) IN (11,12)`). The backfill would **violate that constraint** → the migration MUST drop it (§4.2).
- Logging hygiene already exists: `validateCustomer`'s audit deliberately never logs the BVN.
- The `customeridentification.success` webhook handler sits directly above the `.failed` handler (`:604-640` in current numbering) and follows the established webhook-update pattern.
- ⚠️ Pre-flight for the stamp move — **v1.2 verified**: the frontend has **exactly one** `user.bvn` read — `DVADiagnostics.tsx:99` — and that component is **dead code** (its only mount, `Dashboard.tsx:549`, is commented out; it is already on the frontend dead-code list). §4.7 handles it with a one-line field fix. `bvnVerifiedAt`/`ninVerifiedAt` have zero frontend consumers; `GET /auth/me` returns them today (sanitizeUser strips only `passwordHash`), and they remain safe to expose after §4.7.

### P1-1 (PIN step-up token)
- `POST /api/v1/auth/pin/verify` exists (`auth.routes.ts:24`); `pin.controller.verify` returns `data: { valid }` — **no token today**.
- `pin.service.verifyPin` (`:105-196`) returns `{ valid: boolean }` and owns the lockout (5 attempts / 24h window → `423 PIN_LOCKED`).
- The raw PIN is bcrypt-verified at **three service sites**: `settlement.service.ts:295` (connect — only on the `isChange` path), `:417` (withdraw), `:571` (auto-split). Verification happens outside transactions (existing pattern).
- The frontend **already runs a two-phase flow**: `PinModal.tsx:90-92` calls the verify endpoint, then `onSuccess(pin)` hands the **raw PIN** back; consumers re-submit it:
  - `PayoutWithdrawalModal.tsx:79-91` → `withdrawBalance({ amount, pin, narration })` (pin at `:83`);
  - `Account.tsx:1237-1245` → `toggleAutoSplit(biz.id, { enabled, pin })`;
  - `PaymentConfirmationModal.tsx:85` — `handlePinSuccess(_token: string)` **ignores the value** (tax pay takes no PIN);
  - `TaxReports.tsx:330` — no argument used.
- The connect payload (`Account.tsx:397-402`) carries **no PIN** today — connect demands a credential only on the `isChange` path.
- **Morgan cannot log bodies** — `middleware/requestLogger.ts` uses standard morgan tokens plus one custom response-time token; morgan's token system has no request-body token, and no body-logging middleware exists. **Honest risk statement: nothing logs request bodies today. The step-up token is defense-in-depth + future-APM safety, not the fix for an active leak.**
- **History lesson (noticepay2.md:45-48):** an earlier iteration had PinModal hand back a `stepUpToken` the server did not understand — every UI withdrawal failed PIN verification. This plan closes that class permanently: the server accepts **both** credentials, and the raw-pin e2e path stays green.
- `jsonwebtoken ^9` is already a dependency; `config.jwt.accessSecret` exists (`config/index.ts:87`).

---

## §1. Deliberately left out — and why (this is part of the spec)

1. **`bvnHash` lookup column** — zero BVN lookups exist (verified); a hash column would be dead schema. Rejected.
2. **Single-use / jti step-up tokens** — requires server-side state (Redis configured but unused). A 5-minute TTL JWT scoped to the user is the same trust class as the 15-minute access token. Accepted limitation, documented.
3. **Key-rotation service** — the `v1.` ciphertext version prefix is the rotation hook; the machinery itself is deferred until there is a second key.
4. **Log/APM redaction middleware** — nothing logs bodies today (verified); redacting a non-existent leak path is complexity without a threat. Revisit the day an APM with body capture is adopted.
5. **A `requireStepUp` middleware** (the triage doc's shape) — the three call sites verify at different depths (connect only on `isChange`); a middleware cannot express that. A **service-level helper** preserves the exact semantics. The file `middleware/stepUp.ts` from the triage list is therefore **not created**.
6. **Removing the raw-PIN path server-side** — would break the in-band e2e suite and re-open the noticepay2 regression class. Dual-accept instead; removal is a later, separate decision.
7. **KMS / envelope encryption / HSM / WebAuthn** — overkill at solo-dev stage.

---

## §2. Execution order + invariants

```
0. Green baseline: cd backend && npx tsc --noEmit && npm run lint && npm run test:e2e
1. §3 P0-1   (migration #1 — noticepay3 §5 verbatim; money correctness first)
2. §4 P1-2   (migration #2 + backfill script — backend-only; lands before §5 so
              settlement.service.ts is never touched by two items at once)
3. §5 P1-1   (no migration — backend helper + validators, then frontend consumers;
              largest blast radius lands last on a stable tree)
```

**Invariants (binding):**
1. Paystack HTTP calls never inside a DB transaction.
2. PIN/credential verification and all bcrypt work stay outside transactions.
3. No PII in logs — `validateCustomer`'s audit (the "We DELIBERATELY do not log the BVN" comment) is the pattern; the encryption lib must never log plaintext, keys, or ciphertext.
4. The existing raw-PIN e2e tests MUST stay green — dual-accept (§5) guarantees this structurally.
5. Verification gate after EVERY item: `cd backend && npx tsc --noEmit && npm run lint && npm run test:e2e`; §5 adds `cd ../frontend && npx tsc --noEmit && npm run build`.

---

## §3. P0-1 — Transfer-recipient reuse (executes noticepay3 §5 verbatim)

**Do not re-derive:** noticepay3 §5.1–§5.5 is twice-audited (v2.1 + v2.2) and re-verified this session. Condensed runbook:

1. **Migration `20260830140000_add_paystack_recipient_code`** — `businesses` gains `paystack_recipient_code TEXT NULL` + `recipient_fingerprint TEXT NULL` (schema: `paystackRecipientCode` / `recipientFingerprint`). Rollback = drop two nullable columns. No backfill.
2. **`settlement.service.ts` — new `resolveRecipientCode(provider, payout, stored)`** — fingerprint = `` `${payout.destinationBankCode}:${payout.destinationAccountNum}` `` of the **approved payout snapshot** (never live business fields — the v1→v2 correction that prevents redirecting money when the bank changed between request and approval). Reuse iff the stored fingerprint matches; otherwise `createTransferRecipient` from the **same snapshot fields as today** (`:798-805`) and store code + fingerprint post-tx (after the claim tx `:750-793` commits — Paystack HTTP stays out of DB txs). Add `import type { PaymentProvider } from '@/lib/payment/types'`.
3. **Replace the inline block at `:796-805`** with the helper call. Money path is byte-identical — only a caching layer is added. Accepted v1 race (documented in noticepay3 v2.2): two near-simultaneous approvals of one business can each create a recipient — worst case one extra phantom, i.e. status quo.
4. **Audit seam:** `settlement.payout_approved` `newData` (`:834-838`) gains `recipientReused: boolean` — the assertion seam for the in-band e2e suite (real Paystack test-mode API, no provider mock seam).
5. **Self-heal:** in the approve catch (`:864+`), recipient-related errors clear both stored fields so the next attempt re-creates.
6. **Tests:** noticepay3 §5.4 items 1–5 — reuse on second approve (`recipientReused: true`, stored code unchanged); bank-change → new fingerprint; snapshot-destination guard; recipient-error → stored code cleared, next approve succeeds. Existing approve e2e (`api.e2e.test.ts:1920`) stays green.
7. **Out-of-code:** bulk-deactivate accumulated phantom `TRT_*` codes in the Paystack dashboard once (deploy checklist).
8. **Serializer note (v1.2):** `business.service` returns the raw business row and the frontend type already carries `paystackSubaccountCode` — so `paystackRecipientCode`/`recipientFingerprint` will flow to the SME frontend the same way. Accepted: `TRT_*` codes and fingerprints are not secrets (they are useless without the Paystack secret key); no masking, consistent with the existing precedent.

---

## §4. P1-2 — BVN/NIN encryption at rest

**Design:** AES-256-GCM app-layer encryption; ONE data-preserving migration (rename + retype + drop the dead index and the stale CHECK constraint); ONE idempotent backfill script; move the `bvnVerifiedAt` stamp to the webhook that actually proves verification; fix the `sanitizeUser` response leak (§4.7). Because BVN/NIN have **zero lookups** (§0), no decryption path is wired to any endpoint and no hash column is needed — the lib ships `decryptPii` so the data is never write-only.

### 4.1 New file `backend/src/lib/encryption.ts`
- Key: `PII_ENCRYPTION_KEY` env — base64 of exactly 32 bytes. Validate on first use (decoded length check); fail with a clear error: `PII_ENCRYPTION_KEY missing or invalid (expected base64 of 32 bytes)`.
- `encryptPii(plain: string): string` → `v1.<iv.b64>.<tag.b64>.<ct.b64>` — 12-byte random IV per call (GCM standard); the `v1.` prefix is the future key-rotation hook.
- `decryptPii(payload: string): string` — parses the envelope, verifies the GCM auth tag; throws on tamper or unknown version. (A lib that writes but can never read is incomplete; this is the only read-path helper we ship — v1.1 removed `maskPii` as YAGNI: zero display consumers exist today.)
- **NEVER log plaintext, the key, or ciphertext from this lib.**
- Unit tests (rules.txt: utils at full coverage): round-trip; tampered ciphertext → throw; wrong key → throw.

### 4.2 Migration `20260901120000_encrypt_user_pii` (hand-written, data-preserving)
```sql
ALTER TABLE "users" RENAME COLUMN "bvn" TO "bvn_encrypted";
ALTER TABLE "users" RENAME COLUMN "nin" TO "nin_encrypted";
ALTER TABLE "users" ALTER COLUMN "bvn_encrypted" TYPE TEXT;
ALTER TABLE "users" ALTER COLUMN "nin_encrypted" TYPE TEXT;
DROP INDEX IF EXISTS "users_bvn_idx";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_bvn_length";
```
- RENAME (not drop/add) **preserves the existing values** — the backfill encrypts them in place.
- **v1.1 REQUIRED addition — `check_bvn_length`:** the column carries a CHECK constraint (`bvn IS NULL OR length(bvn) IN (11,12)`, confirmed in the creating migration). Ciphertext runs ~100 chars — **without dropping this constraint, every backfill UPDATE fails**. (The constraint is dropped, not recreated: length validation of the *plaintext input* already happens in the DVA validator before encryption.)
- The index is a **partial index** (`WHERE "bvn" IS NOT NULL`) — `DROP INDEX IF EXISTS "users_bvn_idx"` handles it; the name is confirmed against the creating migration.
- `schema.prisma` User: `bvnEncrypted String? @map("bvn_encrypted")`, `ninEncrypted String? @map("nin_encrypted")` (TEXT — ciphertext runs ~100 chars; the old `VarChar(12)/(11)` would truncate); **delete `@@index([bvn])`**. Regenerate the Prisma client.
- ⚠️ After the backfill, plaintext is gone from the DB and only the key can recover it — **take a DB backup before running the script** (rollback = restore backup + revert column names).

### 4.3 Backfill script `backend/scripts/encrypt-existing-pii.ts` (tsx)
- Select users where `bvnEncrypted IS NOT NULL AND NOT LIKE 'v1.%'` (same predicate for `ninEncrypted`).
- Per row: `encryptPii(...)` → `prisma.user.update`. **Idempotent via the `v1.` prefix** — a second run updates 0 rows (assert this in a test).
- Log counts only — never values. Exit non-zero on any row failure.

### 4.4 `dva.service.ts` changes (anchor on content — see §0 line-numbering caveat)
- **`validateCustomer` — the `prisma.user.update` storing BVN/NIN (currently `:83-91`):** store ciphertext — `bvnEncrypted: encryptPii(input.bvn)`, `ninEncrypted: input.nin ? encryptPii(input.nin) : undefined`. **Remove the `bvnVerifiedAt`/`ninVerifiedAt` stamps here** — they currently mark "verified" before Paystack confirms anything. The `provider.validateCustomer` call just above (`:73-80`) keeps receiving the plaintext BVN — that is Paystack's own input, untouched.
- **`customeridentification.success` handler:** stamp the truth — load `business.userId`, select `ninEncrypted`, then one `user.update` with `bvnVerifiedAt: new Date()` plus `ninVerifiedAt: new Date()` only when `ninEncrypted` is set. This mirrors the `.failed` handler's existing webhook-update pattern.
- The no-log guarantee in `validateCustomer`'s audit remains accurate — the new fields are ciphertext.

### 4.5 Tests
1. Unit: encryption lib (§4.1).
2. e2e: the validate-customer flow stays green; after submission the user row's `bvnEncrypted` starts with `v1.` and does **not** contain the raw BVN as a substring.
3. **Response-leak regression (v1.1):** `GET /auth/me` returns neither `bvn`/`nin` nor `bvnEncrypted`/`ninEncrypted`.
4. Script idempotency: second run updates 0 rows.
5. Stamp move regression: `bvnVerifiedAt` is NOT set immediately after `validate-customer`; it IS set after `customeridentification.success` (follow the existing DVA webhook test pattern).

### 4.6 Config + env
- `config/index.ts`: add `pii: { encryptionKey: process.env.PII_ENCRYPTION_KEY }` — deliberately **not** in the required-startup list, so dev environments without DVA keep booting; the lib validates on first use instead.
- **v1.1 — e2e prerequisite:** the Jest setup loads `backend/.env` via `dotenv/config` before tests run — `PII_ENCRYPTION_KEY` MUST be present there (and in any CI env), or the existing validate-customer e2e starts returning 500. Add it to `.env.example` with the generation hint `openssl rand -base64 32`, marked **REQUIRED before live DVA validation**.

### 4.7 Response surface — `sanitizeUser` + the one frontend read (v1.1/v1.2)
- `sanitizeUser` (`auth.service.ts`) currently strips only `passwordHash`, so `/auth/me`, `updateMe`, and the login/register responses return the BVN/NIN fields verbatim. Extend the destructure to also strip `bvnEncrypted` and `ninEncrypted` (one line; covers every response that flows through it — there is no other full-User serializer that reaches a client: admin `getUserDetail`/`listUsers` use explicit field selects, and `requeryDVA`'s `include: { user: true }` is internal-only — its return is `{ accountNumber, transactionCount, message }`, verified).
- **Frontend (v1.2):** the single `user.bvn` read is `DVADiagnostics.tsx:99` — a dead dev-only component (mount commented out at `Dashboard.tsx:549`). Change `user.bvn` → `user.bvnVerifiedAt` there (one line — and it becomes *truthful*: presence of a BVN never meant "verified"; the webhook-stamped date does). The component stays scheduled for deletion on the frontend dead-code list; do not invest further.
- No other frontend change: `bvn`/`nin` in `Account.tsx:71-72` are local form state for the validate-customer submission — request-side, unaffected.

---

## §5. P1-1 — PIN step-up token (the raw PIN leaves money-request bodies)

**Semantics:** keep the raw-PIN path (e2e + backward compat); ADD a 5-minute step-up token issued by the verify endpoint the frontend **already calls**. After this lands, the modal hands back a token and money bodies carry the token instead of the PIN. This closes the noticepay2-era failure class, because the server now understands exactly what the modal hands back.

### 5.1 Backend — `pin.service.ts`
- Import `jsonwebtoken` (already a dependency). Sign with `config.jwt.accessSecret` + a type discriminator — a leaked access secret is already game over, so a separate secret adds nothing here.
- `issueStepUpToken(userId: string): string` — `jwt.sign({ sub: userId, type: 'pin_step_up' }, config.jwt.accessSecret, { expiresIn: '5m' })`.
- `verifyStepUpToken(userId: string, token: string): void` — `jwt.verify`, then require `payload.type === 'pin_step_up'` AND `payload.sub === userId`; any failure → `401 INVALID_STEP_UP_TOKEN`.
- `verifyPin` success return becomes `{ valid: true, stepUpToken }` (additive — existing callers unaffected).
- New **`assertTransactionAuthorization(userId, cred: { pin?: string; stepUpToken?: string })`** — token present → `verifyStepUpToken`; else pin present → `verifyPin` (lockout logic untouched); else `400 MISSING_PIN_CREDENTIAL`. This is a **service-level helper, not middleware** (§1.5) — connect verifies only on the `isChange` path, and a helper preserves that exactly.

### 5.2 Backend — controller / validators / call sites
- `pin.controller.verify`: return `data: { valid, stepUpToken }`.
- `settlement.validator.ts`: add `stepUpToken: z.string().min(20).optional()` to the connect / withdraw / auto-split schemas; `pin` becomes `.optional()` on withdraw + auto-split — presence of exactly one credential is enforced by the service helper (service-side enforcement is this codebase's pattern, cf. `INVALID_SPLIT_PERCENTAGE`). Connect's `pin` was already optional; add the same `stepUpToken`.
- `settlement.service.ts`: replace the three raw-PIN verifications — `:295` (connect `isChange`), `:417` (withdraw), `:571` (auto-split) — with `assertTransactionAuthorization(userId, params)`. No transaction changes; verification stays outside txs.
- **v1.1 — the connect path's explicit guard goes too:** the `isChange` block currently has its own `if (!params.pin) throw 400 PIN_REQUIRED` (`:288-294`) right before the `verifyPin` call — remove it; the helper's `MISSING_PIN_CREDENTIAL` covers both checks. The error code changes from `PIN_REQUIRED` → `MISSING_PIN_CREDENTIAL`: verified safe — **zero `frontend/src` consumers match on `PIN_REQUIRED`** (full grep), and error display goes through the generic message path.

### 5.3 Frontend
- `pin.store.ts` `verifyPin` (`:91-94`): return `{ valid, stepUpToken }` from `res.data.data`.
- `PinModal.tsx:92`: `onSuccess(res.data.data.stepUpToken)` — **no fallback to pin**: on `valid` the token must exist. Retype the prop: `onSuccess: (stepUpToken: string) => void`.
- `PayoutWithdrawalModal.tsx:79-91`: rename the param to `stepUpToken`; withdraw body becomes `{ amount, stepUpToken, narration }` (was `pin` at `:83`).
- `Account.tsx:1237-1245`: `toggleAutoSplit(biz.id, { enabled, stepUpToken: token })`.
- `settlement.store.ts:83,87`: input types accept `{ pin?, stepUpToken? }` (both optional at the type level; the server enforces exactly-one).
- Unchanged consumers (verified): `PaymentConfirmationModal.tsx:85` (`_token` ignored) and `TaxReports.tsx:330` — v1.2 correction: TaxReports renders **`PaymentConfirmationModal`** (which embeds PinModal), not PinModal directly; PinModal has exactly **three** render sites (`PayoutWithdrawalModal.tsx:380`, `Account.tsx:1235`, `PaymentConfirmationModal.tsx:215`), and the token-ignoring consumer analysis covers all of them.
- **Connect change path (verified observation):** `Account.tsx:397-402` sends no credential today; the service demands one only on `isChange`. When that flow is next wired, open PinModal and send `stepUpToken` — do NOT regress to a raw pin.

### 5.4 Tests (e2e — the raw-PIN suite must stay green)
1. **Existing withdraw / auto-split / connect tests (raw pin) pass UNCHANGED** — this is the dual-accept proof and the regression guard for the noticepay2 failure class.
2. Verify → token → withdraw `200` (the new UI path, end to end).
3. Token issued to user A used by user B → `401`; tampered token → `401`; expired token (test with a short-TTL signed token) → `401`.
4. Neither credential → `400 MISSING_PIN_CREDENTIAL`.
5. Lockout untouched: 5 bad raw pins → `423 PIN_LOCKED`; the token path cannot be brute-forced (server-signed, 5-minute TTL).
6. Frontend gate: `cd frontend && npx tsc --noEmit && npm run build`.

---

## §6. Risk matrix

| Change | Risk | Mitigation |
|---|---|---|
| §3 recipient reuse | **Medium — money path** | noticepay3 §5's payout-snapshot-keyed fingerprint makes stale-code reuse structurally impossible; money path byte-identical; 5 dedicated e2e tests + `recipientReused` audit seam |
| §4 PII encryption | **Medium — data migration** | RENAME preserves data; `check_bvn_length` constraint dropped in-migration (else backfill fails); idempotent script; DB backup before backfill; documented caveat that post-backfill plaintext is only recoverable with the key; encryption lib fully unit-tested (GCM tamper detection); response leak fixed via `sanitizeUser` (§4.7) |
| §5 step-up token | **Medium — auth flow** | Dual-accept keeps the entire raw-PIN e2e suite green; the PinModal hand-back is the exact spot of the noticepay2 JWT-as-PIN bug — the server now understands the token, closing the class; both credential paths tested; lockout semantics untouched |

---

## §7. Verification, manual smoke, deploy checklist

### Verification gate (after EVERY item)
```bash
cd backend && npx tsc --noEmit && npm run lint && npm run test:e2e
# §5 additionally:
cd ../frontend && npx tsc --noEmit && npm run build
```

### Manual smoke (after all items)
1. Admin approves two payouts for the same business → Paystack dashboard gains exactly **one** new `TRT_*`; audit shows `recipientReused: false` then `true`.
2. UI withdrawal via the PIN modal succeeds (token path end to end); the withdraw request body contains `stepUpToken`, not a 4-digit PIN.
3. Wrong PIN 5× → lockout message with reset path; correct PIN after reset works.
4. `validate-customer` → the user row shows `v1.`-prefixed ciphertext only; `bvnVerifiedAt` flips only after `customeridentification.success`.

### Deploy checklist (order matters)
1. Set `PII_ENCRYPTION_KEY` in the production env **BEFORE** deploying the §4 code (without it, `validate-customer` returns 500). Also add it to `backend/.env` locally/CI — the Jest setup loads it via dotenv, and the e2e suite breaks without it.
2. Migration `20260830140000_add_paystack_recipient_code` (P0-1) → deploy P0-1 code.
3. Migration `20260901120000_encrypt_user_pii` → deploy §4 code (backend + `sanitizeUser` strip) → regenerate Prisma client.
4. **DB backup**, then run `scripts/encrypt-existing-pii.ts` once; confirm the logged counts.
5. Deploy §5 code — **backend first, frontend second** (v1.1): the PinModal hands back a token with **no fallback**, so a new frontend against an old backend would turn a valid PIN into `MISSING_PIN_CREDENTIAL`. Backend-first keeps both orderings working.
6. One-time Paystack dashboard cleanup: deactivate the accumulated phantom `TRT_*` recipients.
7. Document in the runbook: step-up tokens are 5-minute JWTs, not single-use (accepted limitation, §1.2).

---

## §8. Explicitly out of scope for this batch
- NEW-H stale-`processing` sweep + SLA-1 (planned in noticepay3 §6–§7 — next batch; note §6's `initiatedAt` claim-stamp fix and NOT-FOUND branch from the v2.2 corrections are already spec'd there).
- `bvnHash` lookup column, token revocation / Redis-backed single-use tokens, key-rotation machinery, APM adoption, WebAuthn, removing the raw-PIN path server-side (each justified in §1).
- Phase 2 DVA onboarding state machine (noticepay3 Phase 2: `kycSubmittedAt` / `dvaStatus` / assign-reminder wiring).

---

*noticepay4.md — v1.2 (Sep 1, 2026; second adversarial re-review pass after v1.1). **v1.1→v1.2 findings, all resolved by direct code reads:** (1) the frontend DOES have one `user.bvn` read — `DVADiagnostics.tsx:99` — but the component is dead code (mount commented out at `Dashboard.tsx:549`); §4.7 now fixes the field to `bvnVerifiedAt` (one line, also more truthful). (2) §5.3's PinModal consumer list corrected: TaxReports consumes PaymentConfirmationModal indirectly; PinModal has exactly three render sites. (3) `requeryDVA`'s `include: { user: true }` verified internal-only (return is `{ accountNumber, transactionCount, message }`) — no additional leak surface. (4) The DVA validator's BVN regex `/^\d{11,12}$/` confirmed (`dva.validator.ts:29-32`) — dropping `check_bvn_length` loses no validation. (5) §3 serializer note added: the new Business columns flow to the SME frontend like `paystackSubaccountCode` already does — accepted, not secrets. (6) `/auth/pin/verify` carries no auth rate limiter (per-route limiters apply only to register/login/forgot/reset) — the step-up token flow introduces no 429 risk; brute-force protection remains the PIN attempt lockout. Everything else survived both passes unchanged. Two migrations (`20260830140000`, `20260901120000`), zero new dependencies, one new lib, one backfill script.*

*noticepay4.md — v1.1 (Sep 1, 2026; re-reviewed as a full adversarial pass after v1.0). **v1.0→v1.1 corrections, all caught by direct code reads this session:** (1) **CRITICAL — response leak:** `sanitizeUser` (`auth.service.ts`) strips only `passwordHash`, so `/auth/me` + login/register returned plaintext `bvn`/`nin` — the v1.0 "no response serializer returns it" claim was wrong; fixed by new §4.7 (strip the encrypted fields) + a response-leak regression test. (2) **CRITICAL — `check_bvn_length` CHECK constraint** on `users.bvn` (confirmed in the creating migration) would make every backfill UPDATE fail — the migration now drops it (§4.2). (3) Line refs corrected: the BVN write block is `dva.service.ts:83-91` (not `:71-78`), with a standing caveat that grep-tool line numbers in this working-tree-modified file run ~11 lines stale — anchor on content. (4) The connect path's explicit `PIN_REQUIRED` guard (`:288-294`) must be removed together with the `:295` verify call; error code becomes `MISSING_PIN_CREDENTIAL` (zero frontend consumers of the old code — verified). (5) §5 deploy ordering: backend before frontend (PinModal token hand-back has no fallback). (6) e2e env prerequisite: `PII_ENCRYPTION_KEY` must be in `backend/.env` (Jest loads it via dotenv) or the validate-customer e2e breaks. (7) Simplification: `maskPii` removed from the lib (zero consumers — YAGNI); `decryptPii` retained so the lib has a complete read path. The index was additionally confirmed to be a **partial** index (`users_bvn_idx ... WHERE "bvn" IS NOT NULL`). Everything else in v1.0 — P0-1 by reference to noticepay3 §5, the §1 exclusions, §2 ordering, §5 dual-accept design, §6 risks — survived the pass unchanged. Two migrations total (`20260830140000`, `20260901120000`), zero new dependencies, one new backend lib, one new backfill script.*