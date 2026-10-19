# noticepay5.md — Batch 3: DVA Onboarding State Machine (P1-3) + Webhook Reconciliation (P1-4)

**Source:** "⚠️ IMPORTANT — Fix Before First SME (Week 2)" items P1-3 and P1-3's companion P1-4 in `noticepay.md` (v3 priority list: "Carried A" + "Carried B" + the `dva_activation_complete` reminder).
**Date:** Sep 2, 2026 · **Status:** Plan v1.0 — every file:line below verified against the working tree in this session.

---

## §0 Ground truth (verified, not assumed)

**The triage's P1-3 impact statement is partially obsolete — say it honestly.** "User loses progress if they refresh during KYC" is already mitigated in the current tree:

- `getVirtualAccount` (`dva.service.ts:312-361`) already returns four states: `active` (`:315-321`), `failed` with reason (`:329-335`), `pending` for identity-in-flight (`:343-355`), `none` (`:357-360`).
- `Account.tsx` re-fetches DVA state on every mount (`:199-212`), maps `pending → awaitingValidation = true` (`:136-138`), and re-arms the 10s poll / 5-min timeout (`:225-244`). A refresh no longer shows "Activate" mid-KYC.

**What is still genuinely broken (the reason this batch exists):**

1. **The `pending` inference is user-level, not business-level.** `dva.service.ts:343-355` reads `user.bvnEncrypted || user.bvnVerifiedAt` — both live on `User`, but onboarding is per-Business. A user's *second* business shows a phantom "verifying" spinner (status `pending`) even though its own flow never started.
2. **`dva.service.ts:630-636` swallows a real failure.** After `customeridentification.success`, if `provider.createDedicatedAccount` throws, the catch logs `logger.error` and returns. No `dvaFailureReason` is persisted, so `getVirtualAccount` keeps returning `pending` forever — the poll spins to its 5-min timeout with zero signal, on every refresh, forever.
3. **No timestamps and no status column.** There is no `kycSubmittedAt` and no explicit onboarding state, so (a) "pending for 2 minutes" and "pending for 2 weeks" are indistinguishable, (b) there is no way to *query* stuck onboardings, and (c) reconciliation (P1-4) has nothing to key off.
4. **Missing reminders.** `dedicatedaccount.assign.success` (`dva.service.ts:440-479`) stores the account number but fires **no** `dva_activation_complete` reminder. `dedicatedaccount.assign.failed` (`:481-509`) persists the reason but fires **no** reminder (only `customeridentification.failed` has one, `:664-677`). The SME learns their account is ready by stumbling onto `/account`.

**Verified infrastructure this plan builds on (no new primitives needed):**

- `createReminderOnce` (`reminder.service.ts:110`, params `:95-103`) — dedup by `(businessId, reminderType, referenceType, referenceId)` when a ref is supplied. `Reminder.reminderType` is a plain `String` (`schema.prisma:399`) — **new reminder types need no migration.**
- Backend `ReminderType` union: `reminder.service.ts:22-39`. Frontend mirror: `types/index.ts:405-423`. `NotificationBell.tsx` has **total** `Record<ReminderType, …>` maps (`TYPE_COLOR` `:21`, `ROUTE_FOR_REMINDER` `:43`) — adding a backend type without the frontend entries is a **compile error**, which is good: the compiler enforces the wiring.
- `POST /dva/requery` exists (`dva.routes.ts`) → `dva.service.ts:798+`, but it only refreshes *transactions for an already-active account* (throws `NO_DVA` at `:811-813` otherwise). It cannot unstick onboarding. Admin reconciliation must **re-trigger `createDedicatedAccount`** (provider `paystack.provider.ts:294-321`).
- Admin route conventions: list + action pattern already lives in `admin.routes.ts` (withdrawal `requery`/`approve`/`reject` precedent at `:26-30`); `admin.service.ts` has `listAllBusinesses` (`:268`) to sit beside.
- E2e anchors: admin login seeds `adminToken` (`api.e2e.test.ts:159-169`, `adminAuth()` helper `:31`); signed-webhook test harness exists (`:1062` "WEBHOOKS — Signature verification + DVA transfer dedupe"); admin describe block at `:1157`.
- Latest migration is `20260901120000_encrypt_user_pii` → this batch adds exactly one: **`20260902120000_add_dva_status`**.

---

## §1 Deliberately left out (complexity with no beta-stage payoff)

- **No cron sweep for stuck onboardings.** The triage mentions reconciliation via admin endpoint — keep it manual. At beta scale a daily sweep adds scheduling, alerting, and double-run questions for zero users helped. The admin "stuck" list (§4.3) makes the manual pass a 30-second job. Revisit when SME count makes manual checks unrealistic.
- **No email/SMS on DVA activation.** The in-app bell reminder satisfies "user learns it's ready". Email templates are a Phase-5 item tracked separately.
- **No `listDedicatedAccount` provider method.** Paystack has `GET /dedicated_account`, but reconciliation doesn't need a read — re-triggering creation is idempotent at Paystack (they return the existing account) and strictly more useful.
- **No frontend onboarding stepper** ("Carried E" — Phone → BVN → Activate → Settlement). Real UX win, but it's a redesign, not a fix; it would triple this batch's surface. Kept in the P2 list.
- **No removal of the `bvnEncrypted` heuristic elsewhere.** Only `getVirtualAccount` switches to the authoritative column. Nothing else reads `bvnEncrypted` for status.
- **No webhook event-log table.** Dedup and audit already exist per-handler; a generic event store is launch-phase overkill.

---

## §2 Execution order and binding invariants

**Order:** §3 (P1-3, one migration) → §4 (P1-4, code + routes). §4.3's admin stuck-list **depends on** `dvaStatus` existing, hence the order. Frontend touches (§4.4) ship in the same deploy — the backend must never return a reminder type the deployed frontend's union doesn't know (the `Record` maps make this a hard TS guarantee, but only if both ship together).

**Invariants (non-negotiable, matching house rules):**

1. **Webhook handlers stay webhook-shaped:** DB writes + audit inside the handler; `createReminderOnce` calls fire-and-forget with `.catch(logger.warn)` — never inside a Prisma transaction, never allowed to fail the webhook (mirrors `dva.service.ts:664-677`).
2. **`POST /webhooks/paystack` must keep returning 200 fast.** No new Paystack HTTP calls on the synchronous path of the webhook handler. The §4.2 fix persists state only; the retry-creation call in §4.3 runs from the admin endpoint, not the webhook.
3. **One migration total** (`20260902120000_add_dva_status`), additive + data-preserving backfill (§3.2). No column drops, no renames.
4. **HTTP contract of `GET /dva/virtual-account` is frozen:** still `{ status: 'active' | 'failed' | 'pending' | 'none', ... }`. Frontend changes in this batch are reminder-type plumbing only (§4.4). This is the single biggest simplification vs the triage, which implied a frontend rewrite.


---

## §3 P1-3 — `dvaStatus` state machine (server-internal, API contract frozen)

### 3.1 Schema

`backend/prisma/schema.prisma`, Business model (after `dvaFailedAt`, `:77`):

```prisma
  // Authoritative DVA onboarding state. Derived states were previously
  // inferred from scattered fields (user.bvnEncrypted is USER-level, which
  // made a second business of the same user show a phantom "verifying"
  // spinner). dvaStatus is per-business truth.
  //   none          — flow never started (default)
  //   kyc_submitted — BVN+bank submitted to Paystack, awaiting customeridentification.*
  //   identifying   — identity confirmed / DVA requested, awaiting account number
  //   active        — virtualAccountNumber stored
  //   failed        — terminal failure, see dvaFailureReason
  dvaStatus        DvaStatus @default(none) @map("dva_status")
  kycSubmittedAt   DateTime? @map("kyc_submitted_at")
```

And the enum (near the other enums, e.g. after `PaymentMethod`):

```prisma
enum DvaStatus {
  none
  kyc_submitted
  identifying
  active
  failed
}
```

### 3.2 Migration `20260902120000_add_dva_status` (additive + backfill, one file)

Prisma generates the `ALTER TABLE` + `CREATE TYPE`; append the backfill to the same `migration.sql` (pure SQL — no app code, no secrets, unlike the PII backfill):

```sql
-- Derive dvaStatus for existing rows from fields we already trust.
-- kycSubmittedAt intentionally left NULL for legacy rows: we cannot know
-- when historical submissions happened, and it is only used for staleness
-- going forward.
UPDATE businesses SET
  dva_status = CASE
    WHEN virtual_account_number IS NOT NULL THEN 'active'::"DvaStatus"
    WHEN dva_failure_reason IS NOT NULL     THEN 'failed'::"DvaStatus"
    ELSE 'none'::"DvaStatus"
  END;
```

**Accepted regression (documented, self-healing):** a legacy row mid-onboarding (customer code + submitted BVN, no account, no failure) backfills to `none`, so the user sees "Activate" again. Clicking it is safe: `setupVirtualAccount` reuses the stored customer code (`:168-192`), and if identity already cleared at Paystack, `createDedicatedAccount` succeeds synchronously → `active`. One click, correct outcome. Not worth a backfill heuristic.


### 3.3 State transitions — every touchpoint (all verified)

| # | Site | Was | Now |
|---|------|-----|-----|
| 1 | `validateCustomer` failure-clear update (`dva.service.ts:93-96`) | clears `dvaFailureReason/dvaFailedAt` | same **+** `dvaStatus: 'kyc_submitted'`, `kycSubmittedAt: new Date()` (re-stamped on retry — the timestamp means "latest submission") |
| 2 | `setupVirtualAccount` sync-success update (`:264-272`) | stores account | same **+** `dvaStatus: 'active'` |
| 3 | `setupVirtualAccount` async path (`:292-307`) | returns `pending` | add one `prisma.business.update` → `dvaStatus: 'identifying'` (DVA requested, awaiting assign webhook) |
| 4 | `assign.success` webhook update (`:460-468`) | stores account, clears failure | same **+** `dvaStatus: 'active'` **+** `dva_activation_complete` reminder (§4.1) |
| 5 | `assign.failed` webhook update (`:496-500`) | stores reason | same **+** `dvaStatus: 'failed'` **+** `dva_activation_failed` reminder (§4.1) |
| 6 | `identification.success` failure-clear (`:562-565`) | clears failure | same **+** `dvaStatus: 'identifying'` |
| 7 | `identification.success` sync store (`:602-611`) | stores account | same **+** `dvaStatus: 'active'` **+** `dva_activation_complete` reminder |
| 8 | `identification.success` swallowed catch (`:630-636`) | `logger.error` only | **fix:** persist `dvaStatus: 'failed'` + reason + `dva_activation_failed` reminder — see §4.2 |
| 9 | `identification.failed` update (`:648-651`) | stores reason | same **+** `dvaStatus: 'failed'` (its existing `dva_validation_failed` reminder at `:664-677` stays) |

Transition rules: `kyc_submitted → identifying` only via `identification.success` or the async setup path; `failed` is terminal-for-the-attempt and every retry path (#1, #2, #3) overwrites it; `active` is only ever written when an account number is genuinely stored.


### 3.4 `getVirtualAccount` rewrite (`dva.service.ts:312-361`)

Keep the response shape **exactly** as today. New body, in order:

1. Keep the belt-and-braces first check: `business.virtualAccountNumber` → `active` (`:315-321` unchanged — if the column and status ever disagree, money-truth wins).
2. `switch (business.dvaStatus)`:
   - `failed` → `{ status: 'failed', message: business.dvaFailureReason, failedAt: business.dvaFailedAt }` (identical to today's `:329-335`)
   - `kyc_submitted` → `{ status: 'pending', message: 'Your identity is being verified with your bank. This usually takes 1–3 minutes.' }` (same message as `:350-353` today)
   - `identifying` → `{ status: 'pending', message: 'Your account number is being set up. This usually takes a few seconds to a minute.' }` (reuses the message from `:306`)
   - `none` → fall through to `{ status: 'none', … }` (`:357-360`)
3. **Delete the user-level heuristic block** (`:343-355` — the `bvnEncrypted`/`bvnVerifiedAt` read). This is the fix for the phantom-pending second business.
4. Add `dvaStatus` and `kycSubmittedAt` to the response payload (additive; future stepper/admin UI reads truth directly).

### 3.5 Tests (e2e `api.e2e.test.ts` — the `:1062` signed-webhook harness, no Paystack stubs)

1. Fresh business → `GET /dva/virtual-account` → `{ status: 'none' }` (exists; keep green).
2. Signed `dedicatedaccount.assign.success` webhook → row has `dvaStatus: 'active'` + account number; GET returns `active`; exactly **one** `dva_activation_complete` reminder after a replay (dedupe proof).
3. Signed `dedicatedaccount.assign.failed` webhook → `dvaStatus: 'failed'`, reason set, one `dva_activation_failed` reminder; replay → deduped.
4. Signed `customeridentification.success` webhook with a `createDedicatedAccount` failure (provider throws) → `dvaStatus: 'failed'` + reason persisted (§4.2 behavior), GET returns `failed` — **the forever-spin bug, pinned by test**.
5. Backfill: a business row created before migration with `virtualAccountNumber` has `dvaStatus: 'active'` post-migrate.


---

## §4 P1-4 — Webhook reminders, swallowed-error fix, admin reconciliation

### 4.1 Two new reminder types

Backend union `reminder.service.ts:22-39` **+** comment block `:12-20`:
- `dva_activation_complete` — DVA account number assigned; SME can receive transfers.
- `dva_activation_failed` — DVA assignment failed post-identity; retry available.

Frontend: mirror both in `types/index.ts:405-423`, and add entries to `TYPE_COLOR` (`NotificationBell.tsx:21`) and `ROUTE_FOR_REMINDER` (`:43`) — both deep-link to `/account`. Add labels in `typeLabel` (`:63`). The `Record<ReminderType, …>` totals make TS refuse to compile until these exist — that's the guardrail, lean on it.

Reminder bodies (both `createReminderOnce`, fire-and-forget `.catch(logger.warn)`, mirroring `:664-677`):

| Type | Fired from | Dedup key | Message |
|------|-----------|-----------|---------|
| `dva_activation_complete` | `assign.success` (`:470` after update+audit) and `identification.success` sync store (`:611` same) | `referenceType: 'business'`, `referenceId: business.id` | "🎉 Your virtual account is ready! Transfers to {accountNumber} ({bank}) now land in {businessName} automatically." |
| `dva_activation_failed` | `assign.failed` (`:500`), the §4.2 catch, and nothing else | `referenceType: 'business'`, `referenceId: customerCode`, `updateMessageOnDup: true` | "We couldn't finish setting up your virtual account: {reason}. You can retry from the Account page, or contact support." |

Note: `identification.failed` keeps its existing `dva_validation_failed` reminder — different failure (identity vs assignment), don't churn it.

### 4.2 The swallowed catch (`dva.service.ts:630-636`)

Replace `logger.error` + return with: persist `dvaStatus: 'failed'`, `dvaFailureReason: err.message` (capped, e.g. 300 chars — Paystack messages can be long), `dvaFailedAt: new Date()`; fire the `dva_activation_failed` reminder (§4.1); keep the `logger.error`. Audit action `dva.failed` with `{ customerCode, reason }` to match `assign.failed` (`:502-508`).

Why safe: this path means identity succeeded but account creation failed. Persisting failure stops the infinite `pending` spin, the bell tells the SME why, and the retry path (`POST /dva/setup-virtual-account`, which reuses the stored customer code) overwrites `failed → identifying/active`. §2 invariant 2 holds — no Paystack call is added to the webhook path; we only persist what we already have (the caught error).

### 4.3 Admin reconciliation endpoints (backend only; admin UI optional)

**Extract the auto-create block** from `identification.success` (`:593-636`: provider fetch, subaccount resolve, `createDedicatedAccount`, sync-store-or-log) into a shared helper `requestDvaForCustomer(business, customerCode): Promise<'active' | 'identifying' | 'failed'>` in `dva.service.ts` — the webhook handler and the admin endpoint call the same function, so reconciliation produces identical side effects (including the §4.1 reminders and §4.2 failure persistence).

In `admin.service.ts` (beside `listAllBusinesses` `:268`), `admin.controller.ts`, `admin.routes.ts` (after the withdrawal block, `:30`):

1. `GET /admin/dva/stuck?limit=50` — businesses where `paystackCustomerCode != null AND virtualAccountNumber = null AND dvaStatus IN ('kyc_submitted','identifying','failed')`, ordered `kycSubmittedAt asc nulls first`, include `user { email }`. Returns `businessId, businessName, ownerEmail, dvaStatus, kycSubmittedAt, dvaFailureReason, dvaFailedAt`. (`failed` rows included deliberately — an SME who saw the failure and gave up is exactly who support needs to see. Stale-identification rows sort first because `kycSubmittedAt` is NULL for them.)
2. `POST /admin/dva/:businessId/reconcile` — load business; **400 `DVA_NOT_STUCK`** if `dvaStatus` is `none` or `active` (nothing to reconcile; `none` means KYC never done — Paystack would reject anyway); else call `requestDvaForCustomer` and return `{ dvaStatus, accountNumber?, failureReason? }`. Audit `dva.admin_reconciled` with before/after status. No rate limiter needed (admin-only route behind `authorize('admin')`), but the underlying Paystack call is inherently idempotent — safe to re-run.

### 4.4 Frontend changes (the complete list)

1. `types/index.ts` — two union members (`:405-423`).
2. `NotificationBell.tsx` — `TYPE_COLOR`, `ROUTE_FOR_REMINDER`, `typeLabel` entries (compiler-forced).
3. **`Account.tsx` — zero changes.** Status mapping (`:126-138`), poll (`:225-244`), and the verifying screen (`:495`) are driven by the unchanged HTTP contract.

### 4.5 Tests (e2e)

1. `GET /admin/dva/stuck` as admin → 200, list shape; regular user → 403 (pattern: `:1168`).
2. `POST /admin/dva/:id/reconcile` on a fresh business (no customer code) → 400 `DVA_NOT_STUCK`.
3. Full reconcile path is covered indirectly by §3.5 tests 2–4 (same helper).
4. Reminder dedupe: replay `assign.failed` twice → one `dva_activation_failed` row, message updated (the `updateMessageOnDup` path).


---

## §5 Risk matrix

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Webhook arrives for a business still on legacy inferred state (deploy race: column exists but backfill semantics differ from live writes) | Low | Migration runs before code deploy (§7). Handlers write `dvaStatus` unconditionally after deploy; backfill has already normalized rows. The `virtualAccountNumber`-first check in `getVirtualAccount` (`:315`) means even a disagreement degrades to "active", never to a false failure. |
| `createReminderOnce` failure inside webhook handler | Low, handled | Fire-and-forget + `.catch(logger.warn)` — webhook still returns 200, reminder retried on the next identical event (dedup makes replay cheap). |
| Admin reconcile fires while user is mid-retry → two `createDedicatedAccount` calls | Low | Paystack treats this idempotently (same customer → same account returned). Both paths store the same account number; last write wins, no phantom rows. |
| `dvaStatus` and legacy fields drift (a future edit updates one, not the other) | Medium over time | §3.3 table is the canonical transition list — keep it in the doc. The `virtualAccountNumber`-first guard caps the blast radius. |
| Phantom-pending fix surprises a user whose second business genuinely was verifying | Edge | If that business truly had BVN submitted, its own row has `dvaStatus: 'kyc_submitted'` (via touchpoint #1) → still `pending`. Only truly-never-started businesses lose the spinner — which is the bug fix. |

---

## §6 Verification gates

1. Green before starting: `cd backend && npx tsc --noEmit && npm run lint && npm run test:e2e`.
2. After §3: `npx prisma migrate dev` (local) applies cleanly on a DB with seed data; `prisma studio` shows backfilled `dvaStatus`; e2e §3.5 green.
3. After §4: backend + frontend both compile (TS enforces the reminder-union sync); e2e §4.5 green.
4. Manual smoke (test mode + `ENABLE_CRON` irrelevant here): full onboarding click-through — Activate → BVN submit → (webhook arrives) → bell shows activation toast-reminder → `/account` shows account number. Then kill the assign webhook (skip it) and confirm the admin stuck-list surfaces the row and `reconcile` completes it.

---

## §7 Deploy checklist (ordered)

1. `git status` clean; create branch.
2. **DB backup / snapshot** (the migration runs a data-updating `UPDATE` — cheap and additive, but take the snapshot anyway).
3. Deploy order: **backend first** (migration + §3 + §4 backend), then **frontend** (union + bell maps). The backend never emits the new reminder types until a webhook fires post-deploy, so the frontend being one deploy behind is tolerable; the reverse (frontend ahead) is also safe — the union members are just unused until the backend sends them. Strictly: run the migration with the backend deploy.
4. Post-deploy: run `GET /admin/dva/stuck` once — any rows that were in flight pre-deploy appear here (the §3.2 accepted regression); reconcile any real ones manually.
5. Verify one real test-mode onboarding end-to-end (§6.4 smoke).

---

## §8 Out of scope (explicitly)

- Daily cron sweep for stuck onboardings (§1) — manual admin pass until scale demands it.
- Onboarding stepper UI ("Carried E"), `resolveAccount` pre-check in the BVN form, error-code gauntlet cleanup — P2 list, separate batch.
- Email/SMS delivery of activation/failure notices — Phase 5 remainder.
- `Noticepay.md` P2 items NEW-J (mask account numbers in payout history), NEW-F (raw PIN removal — tracked as noticepay4 §5), NEW-3 (settlement consolidation) — untouched here.
- `requeryDVA` (`:798`) rate-limit Map is in-memory — pre-existing limitation, not this batch's problem.

---

*Plan v1.0 — Sep 2, 2026. Every file:line verified against the working tree in this session: `dva.service.ts` (1-780, key blocks 55-118, 120-361, 436-510, 530-679, 798-845), `schema.prisma` (Business 50-110, Reminder 396-413), `reminder.service.ts` (1-126), `paystack.provider.ts` (294-341), `Account.tsx` (100-300, 494-495, 660), `NotificationBell.tsx` (21-63, 89-167), `types/index.ts` (405-423), `admin.routes.ts` (tail), `admin.service.ts` (function map), `api.e2e.test.ts` (19-31, 159-169, 1062, 1157-1170), migrations list through `20260901120000`. No assumptions; where the triage's claims were stale (P1-3's refresh impact), the current code's actual behavior is stated and the scope cut accordingly.*





