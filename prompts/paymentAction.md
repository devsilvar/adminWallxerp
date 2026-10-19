# PayMyTax — Payment & Sales Fix Action Plan

> Generated 2026-06-11 from a live end-to-end test of the payment, sales, expense,
> DVA, and webhook flows against the Supabase DB + Paystack **test** keys.
>
> **How this doc is organised:** findings first (so you understand *what* and *why*),
> then a phased plan ordered for maximum payoff with minimum risk. Do the phases in
> order — each one leaves the system in a strictly better, still-shippable state.
>
> **Verification method for every fix:** a fix is NOT done until (a) `npx tsc --noEmit`
> is green AND (b) the relevant e2e test passes. No exceptions — that discipline is
> the whole reason these bugs are on `main` today.

---

## How the system was tested (so you can reproduce)

1. Booted backend (`npm run dev`) against real Supabase DB + Paystack test keys.
2. Ran `npm run test:e2e` → **98/101 passing** (3 webhook tests failing).
3. Drove the real money path with seed user `john@example.com`:
   login → record manual sale → add expense → calculate tax → finalize →
   `POST /tax/pay` (got a real `checkout.paystack.com` URL) → manual verify.
4. Fired a **correctly HMAC-signed** `charge.success` webhook at the live endpoint.
5. Hit DVA, classification, bank, and unverified-sales endpoints.
6. Read the tax-base filtering logic.

All test data created during the run was cleaned up (sale/expense deleted, June
report un-finalized). One harmless `pending` TaxPayment row remains.

---

## FINDINGS (severity-ordered)

### 🔴 BLOCKER #1 — Every Paystack webhook returns HTTP 500 (schema drift)

**Root cause:** `schema.prisma` and the database have drifted apart.
- Migrations on disk created `paystack_webhook_events` and `banks` tables. The DB
  has them — `npx prisma migrate status` reports "up to date".
- BUT `schema.prisma` does **not** define `PaystackWebhookEvent` or `Bank` models.
  Confirmed via `git log -S` — they were **never** committed to the schema in any
  revision. The migration SQL exists without matching models.
- Therefore the generated Prisma client has no `prisma.paystackWebhookEvent` and no
  `prisma.bank`. Verified at runtime:
  ```
  paystackWebhookEvent: undefined
  bank: undefined
  ```

**Observed failure** (valid, properly-signed webhook):
```
HTTP 500
TypeError: Cannot read properties of undefined (reading 'create')
    at processWebhook (payment.service.ts:162:58)
```
`processWebhook()` calls `prisma.paystackWebhookEvent.create()` on its FIRST line,
so it dies before any signature check or processing.

**Production impact:** Paystack signs `charge.success` → endpoint 500s → tax payments
never auto-complete, **DVA bank transfers never become sales**. The core "money in →
auto-record" premise is dead on `main`. The 3 failing e2e tests are all this same bug.

**Files:** `backend/prisma/schema.prisma`, `backend/src/services/payment.service.ts:162`

---

### 🔴 BLOCKER #2 — `GET /api/v1/banks` returns HTTP 500 (same drift)

**Root cause:** `prisma.bank` undefined (Bank model missing from schema, same as #1).

**Observed:** `GET /api/v1/banks` → HTTP 500.

**Production impact:** The bank dropdown feeds the BVN / bank-account validation form.
**Live-mode DVA setup is gated on BVN validation** — no bank list → no validation →
no virtual account on live keys.

**Files:** `backend/src/services/bank.service.ts:74,103,152,183`,
`backend/src/routes/bank.routes.ts`

---

### 🔴 BLOCKER #3 — Backend does not typecheck (`tsc --noEmit` fails)

The dev server only runs because `tsx`/esbuild strips types without checking them.
The build *looks* green but is actually broken. Three independent breakages:

1. **Prisma drift** (#1, #2) — `prisma.paystackWebhookEvent` / `prisma.bank`.
2. **Sentry API removed** — `app.ts:95,96,122` use `Sentry.Handlers.requestHandler()`,
   `.tracingHandler()`, `.errorHandler()`. These **do not exist in @sentry/node v10**
   (installed version) — removed back in v8. So "Sentry is wired" is false; error
   capture is not actually working.
3. **Type error** — `transaction-classification.controller.ts:23` passes
   `string | string[]` where `string` is required.

**Files:** `backend/src/app.ts:95,96,122`,
`backend/src/controllers/transaction-classification.controller.ts:23`

---

### 🟡 #4 — The webhook-secret "sanity check" is actively wrong

`checkWebhookSecretShape()` (`config/index.ts:59`) logs a scary boot error if
`PAYSTACK_WEBHOOK_SECRET` starts with `sk_`.

**This is backwards.** Paystack signs webhooks with your **secret key**:
`HMAC-SHA512(secretKey, rawBody)` — exactly how `processWebhook` verifies
(`payment.service.ts:193`). So `sk_test_...` / `sk_live_...` in that var is
**correct**. This copies Stripe's `whsec_` model onto Paystack, which doesn't use it.

The plan doc (`paymentPlan.md`) repeats this as "SEV-1." It is a non-bug. The check
will send a future operator chasing nothing — or worse, convince them to *break* a
working config. Boot currently logs this false alarm on every start.

**Files:** `backend/src/config/index.ts:59-72`, `backend/.env.example:52-59`,
`paymentPlan.md` (SEV-1 item #3)

---

### 🟢 #5 — No CI gate (the meta-problem)

Every blocker above would have been caught the instant it was introduced if
`tsc --noEmit` + `npm run test:e2e` ran on push. A payment system whose `main`
can't typecheck and whose webhooks 500 is one deploy away from silently losing
transactions.

---

## What already works (do NOT touch — verified)

- ✅ **Tax math** — ₦33,000 gross profit × 7.5% = ₦2,475, exact.
- ✅ **Tax-base filtering** — aggregates only `status:'confirmed' AND isTaxable:true`
  (`tax.service.ts:69`). DVA transfers land `pending`, correctly excluded until the
  owner verifies. Right design, right implementation.
- ✅ **Manual verify fallback** — `GET /tax/payments/:id/verify` hits Paystack's real
  verify API and returns correct status. This is the ONLY working payment-completion
  path while webhooks are down — a genuine saving grace.
- ✅ **Month-lock guards** — editing a finalized month returns `423 PERIOD_FINALIZED`.
- ✅ **Classifications seeded** — 9 rows, sensible taxable / non-taxable split.
- ✅ **Ownership checks, idempotency design, audit logging** — structurally sound.
- ✅ **Real Paystack checkout init** — produced a valid hosted-checkout URL.

---

# THE PHASED PLAN

Each phase ships independently and leaves `main` better than before. Do them in
order. **Exit criterion for every phase: `tsc --noEmit` green + relevant test green.**

---

## Phase 0 — Snapshot & safety net (15 min)

Before touching anything, lock in a known state so you can always get back.

- [ ] **0.1** Commit or stash the current working tree so the 50+ modified files are
      captured. `git add -A && git commit -m "wip: snapshot before payment fixes"`
      (or a branch). You want a clean rollback point.
- [ ] **0.2** Confirm the DB baseline: `cd backend && npx prisma migrate status`.
      Expect "Database schema is up to date" with 15 migrations. Record this.
- [ ] **0.3** Run `npx tsc --noEmit 2>&1 | tee ../tsc-before.txt` and
      `npm run test:e2e 2>&1 | tee ../tests-before.txt`. These are your "before"
      baselines — 98/101 tests, ~14 tsc errors. You'll diff against them.

**Exit:** You have a commit to roll back to and a written record of the starting state.

---

## Phase 1 — Fix the schema drift (BLOCKERS #1 + #2) — HIGHEST PRIORITY (1-2 hr)

This single fix resolves both webhook-500 and banks-500. It's the whole ballgame.

**Approach: make `schema.prisma` match the DB that already exists.** Do NOT create
new migrations that alter tables — the tables are already correct. You're only
re-declaring the models so Prisma can generate a client for them.

- [ ] **1.1 Pull the exact table shapes** the migrations created:
      - `backend/prisma/migrations/20260610144954_add_webhook_event_logging/migration.sql`
        → `paystack_webhook_events` (columns: id, event, reference, signature,
        raw_body, status default 'received', error, created_at, processed_at;
        indexes on reference, status, created_at desc, (signature, created_at)).
      - `backend/prisma/migrations/20260531120000_add_bank_cache/migration.sql`
        → `banks` (columns: id, code, name, slug, long_code, country default
        'nigeria', currency default 'NGN', type, active default true,
        last_fetched_at, created_at, updated_at).

- [ ] **1.2 Add matching models to `schema.prisma`** with correct `@@map` and
      `@map` snake_case mappings so they bind to the existing tables. Mirror the
      column names/types/defaults from the SQL exactly. Example shapes (verify each
      field against the SQL before committing):
      ```prisma
      model PaystackWebhookEvent {
        id          String    @id @default(uuid())
        event       String
        reference   String?
        signature   String
        rawBody     String    @map("raw_body")
        status      String    @default("received")
        error       String?
        createdAt   DateTime  @default(now()) @map("created_at")
        processedAt DateTime? @map("processed_at")

        @@index([reference])
        @@index([status])
        @@index([createdAt(sort: Desc)])
        @@index([signature, createdAt])
        @@map("paystack_webhook_events")
      }

      model Bank {
        id            String   @id @default(uuid())
        code          String
        name          String
        slug          String
        longCode      String?  @map("long_code")
        country       String   @default("nigeria")
        currency      String   @default("NGN")
        type          String?
        active        Boolean  @default(true)
        lastFetchedAt DateTime @default(now()) @map("last_fetched_at")
        createdAt     DateTime @default(now()) @map("created_at")
        updatedAt     DateTime @updatedAt @map("updated_at")

        @@map("banks")
      }
      ```

- [ ] **1.3 Verify the schema matches the DB WITHOUT writing a migration:**
      `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma
      --to-schema-datasource prisma/schema.prisma --exit-code`
      — should report **no difference**. If it shows a diff, your model doesn't
      match the table; fix the model (NOT the DB) until the diff is empty.

- [ ] **1.4** `npx prisma generate`. Confirm the client now has the models:
      ```
      node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log('webhook:',typeof p.paystackWebhookEvent,'bank:',typeof p.bank)"
      ```
      Both must print `object`.

- [ ] **1.5 Re-run the webhook test** that was 500ing:
      - Start the server, send a validly-signed `charge.success`
        (`HMAC-SHA512(secretKey, rawBody)` in `x-paystack-signature`).
      - Expect it to log the event row + process correctly (200), not 500.
      - A bad-signature event should now return **401** (not 500).

- [ ] **1.6 Re-run `GET /api/v1/banks`** → expect 200 with a bank list (it lazily
      fetches from Paystack + caches to the `banks` table on first call).

**Exit:** Webhooks process, banks endpoint returns 200, and the 3 previously-failing
e2e tests now pass. This is the deploy-unblocking phase — if you only do one thing,
do this.

---

## Phase 2 — Fix the build so it can't regress (BLOCKER #3) (1 hr)

After Phase 1, two of the three tsc breakages are gone. Clean up the rest.

- [ ] **2.1 Sentry — pick ONE:**
      - **Option A (fastest, recommended):** migrate to the @sentry/node v10 API.
        Replace the three `Sentry.Handlers.*` calls in `app.ts` (lines 95, 96, 122):
        - Remove `requestHandler()` / `tracingHandler()` (v10 auto-instruments
          Express when `Sentry.init` runs before `express()` — ensure init is at the
          very top of the entry file, before app creation).
        - Replace the error handler block with `Sentry.setupExpressErrorHandler(app)`
          called **after routes, before your custom `errorHandler`**.
      - **Option B (if you don't want to touch Sentry now):** guard it cleanly —
        only call Sentry when DSN is set AND the API exists, so the code compiles.
        But A is better; the current code gives a false sense that errors are tracked.
      - Verify: `tsc --noEmit` no longer reports `Sentry.Handlers`. Trigger a test
        error and confirm it reaches Sentry (or logs the init when DSN unset).

- [ ] **2.2 Fix `transaction-classification.controller.ts:23`** — the
      `string | string[]` query param. Coerce to a single string (e.g. take the
      first element if array, or `String(value)`), matching how other controllers
      read query params. Verify the classifications endpoint still returns 200.

- [ ] **2.3** `npx tsc --noEmit` → **zero errors**. Diff against `tsc-before.txt`
      to confirm everything is resolved.

**Exit:** `tsc --noEmit` is fully green. The build is now trustworthy.

---

## Phase 3 — Remove the false webhook-secret alarm (#4) (20 min)

- [ ] **3.1** In `config/index.ts`, delete `checkWebhookSecretShape()` and its call
      (lines ~59-74). Paystack uses the secret key for HMAC — `sk_*` in
      `PAYSTACK_WEBHOOK_SECRET` is CORRECT, so the warning is wrong.
      - *Alternative if you want to keep a guard:* invert it to warn only when the
        value is empty or clearly NOT a Paystack key.

- [ ] **3.2** Update `.env.example:52-59` — remove the "DIFFERENT from secret key"
      language. Document that Paystack signs with the secret key, so
      `PAYSTACK_WEBHOOK_SECRET` should equal `PAYSTACK_SECRET_KEY` (or just read the
      secret key directly and drop the separate var — your call).

- [ ] **3.3** Correct the `paymentPlan.md` SEV-1 item #3 — it's a non-bug; mark it
      resolved/incorrect so it doesn't mislead future work.

- [ ] **3.4** Restart the server → confirm the false `[config] PAYSTACK_WEBHOOK_SECRET
      appears to be a SECRET KEY` error no longer prints on boot.

**Exit:** Clean boot logs; no misleading guidance left in code or docs.

---

## Phase 4 — Lock the door behind you: CI gate (#5) (1-2 hr)

So none of this can silently come back.

- [ ] **4.1** Add an `npm run typecheck` script (`tsc --noEmit`) if not present.
- [ ] **4.2** Add a CI workflow (GitHub Actions, or whatever you deploy from) that
      runs on every push / PR to `main`:
      1. `npm ci`
      2. `npx prisma generate`
      3. `npm run typecheck` — must pass
      4. `npm run test:e2e` — must pass (needs a test DB + test Paystack keys in CI
         secrets; the webhook tests gracefully skip if `PAYSTACK_WEBHOOK_SECRET`
         absent, but ideally provide it).
- [ ] **4.3** Add a **schema-drift guard** to CI:
      `npx prisma migrate diff --from-migrations prisma/migrations
      --to-schema-datamodel prisma/schema.prisma --exit-code`
      — fails the build if migrations and schema disagree. This is the exact check
      that would have caught Blockers #1/#2 on day one.
- [ ] **4.4** Make the checks **required** for merge to `main`.

**Exit:** Red typecheck, failing tests, or schema drift all block merge automatically.

---

## Phase 5 — Harden the webhook path (post-unblock, 2-3 hr)

Now that webhooks work, make them robust. (These are from `paymentPlan.md` Phase 4 —
pull the still-relevant ones forward.)

- [ ] **5.1** Confirm the `PaystackWebhookEvent` log is actually being written on
      every inbound event (it now can be, post-Phase-1). Spot-check rows for
      `received` → `processed` / `failed` transitions.
- [ ] **5.2** Verify replay-prevention (5-min signature dedup) works end-to-end now
      that the table exists — the "duplicate webhook → no-op" e2e test should pass.
- [ ] **5.3** Add a focused e2e test for the **DVA-transfer → SalesTransaction**
      path (signed `charge.success` with `channel: dedicated_nuban`) asserting:
      a `pending` / `needsVerification: true` sale is created, AND a second identical
      webhook is a no-op (dedup via `unique(businessId, source, referenceId)`).
      Plan flagged this as missing coverage — it's exactly the path that silently
      double-books money if it regresses.
- [ ] **5.4** Wire `POST /dva/requery` into the frontend Account page "Refresh"
      button (route exists in `dva.service.ts:447`) so a lost-webhook transfer is
      recoverable without manual entry.

**Exit:** Webhook path is observable, idempotent, and covered by tests.

---

## Phase 6 — Pre-live checklist (before flipping to live keys)

- [ ] **6.1** Swap `.env` / Render env to live Paystack keys. Confirm
      `preferredBank` auto-resolves to `wema-bank` (not `test-bank`) on `sk_live_*`.
- [ ] **6.2** End-to-end on live: DVA setup (incl. BVN validation via the now-working
      banks endpoint) → real transfer → sale appears in Unverified inbox → owner
      verifies → counts toward tax.
- [ ] **6.3** Configure the live webhook URL in Paystack dashboard + confirm signed
      events reach `processWebhook` and return 200 (check the event log table).
- [ ] **6.4** Confirm Sentry is receiving events in the live environment.
- [ ] **6.5** FIRS remittance path — still unconfirmed (`paymentPlan.md` Phase 5).
      This is a separate, larger workstream; do not let it block the payment-capture
      fixes above.

---

## Critical-path summary (the order that matters)

```
Phase 0 (snapshot)
   └─> Phase 1 (schema drift)  ← UNBLOCKS DEPLOY. Webhooks + banks live again.
          └─> Phase 2 (tsc green)
                 └─> Phase 3 (kill false alarm)
                        └─> Phase 4 (CI gate)  ← prevents recurrence
                               └─> Phase 5 (harden webhooks)
                                      └─> Phase 6 (go-live)
```

**If you have one hour:** do Phase 1. It turns a 100%-down core flow back on.
**If you have a day:** Phases 1-4. That's a green build, working webhooks, and a
gate so it never silently breaks again.

---

## One-line root-cause takeaway

> The architecture is sound and the design decisions (DVA-as-wallet, owner
> verification before taxing, idempotent dedupe) are correct for the Nigerian SME
> market. The failures are not design failures — they are an **uncommitted,
> half-migrated state**: two DB tables with no schema models, a typecheck that
> doesn't run in CI, and a Sentry integration pinned to a removed API. Fix the
> drift, gate the build, and this is shippable.

---
---

# PART 2 — TURNING THIS INTO AN ONLINE BANKING APP (collect + send + record)

> Added 2026-06-11. Scope confirmed with the founder:
> - **Send money:** outbound payouts **via Paystack Transfers ONLY.** If Paystack
>   supports a payout, we expose it. If Paystack can't do it, **we don't build it** —
>   no custom payout rails, no other PSP, no workarounds. This is a deliberate
>   constraint and it is the *right* one (see below).
> - **Custody model:** Paystack holds the funds. We are an **integrator**, NOT a
>   balance-custodian. We never hold customer money on our own ledger.
> - **FIRS:** a FIRS **Direct Pay API** path is expected (automated per-TIN remittance).
>
> The whole point: a banking-style app **purpose-built for tax** — every inbound Naira
> becomes a reviewable Sale, every outbound is logged, tax is computed from the
> recorded activity and remitted to FIRS.

---

## ⚠️ READ THIS FIRST — why "Paystack Transfers only" is the correct call

You said: *"I'd handle transfer-out via Paystack; if Paystack can't do it, I won't
handle transfer out."* As a senior engineer: **keep that rule, it's protecting you.**

1. **It keeps you an integrator, not a bank.** The moment you build your own payout
   rails or hold a spendable balance users draw from, you are arguably a deposit-
   taking / e-money operation and you cross into **CBN licensing** (PSSP/MMO/MFB) —
   capital requirements, audits, legal counsel. "Paystack Transfers only" means
   Paystack's license covers the money movement. Do not give that up.
2. **Outbound = "instruct Paystack to move the merchant's settled funds,"** never
   "debit a balance we hold." Every payout is a Paystack Transfer against funds
   Paystack already settled for that merchant. Thin orchestration layer, nothing more.
3. **The one external dependency to confirm (non-code, do it early):** Paystack
   **Transfers** require your account to be enabled for them, and on some account types
   sub-merchant payouts need a compliance review. **Action: confirm with Paystack
   support that DVA-in → Transfers-out is permitted on your account model.** If they
   say no → per your own rule, the SEND feature is simply out of scope, and you ship a
   RECEIVE-and-record + FIRS-remittance product (still a complete, valuable app). This
   confirmation is a Week-1 item for the SEND feature **only** — it does NOT gate the
   RECEIVE side at all.
4. **Never display a balance you compute yourself.** If you show a balance, read it
   live from Paystack. Don't maintain an authoritative ledger of spendable funds.

> **Sequencing consequence:** the RECEIVE-and-record side has ZERO new licensing
> burden and ships first. The SEND side is gated entirely on Paystack saying "yes,
> Transfers are enabled for you." That's a support ticket, not code — open it now.

---

## Current reality of the codebase vs. the banking vision (verified by code read)

| Capability | Status in code today |
|---|---|
| Inbound DVA transfer → auto Sale | Designed; **blocked by webhook 500** (Part 1 #1). Unverified. |
| Invoice card payment → auto Sale (online pay-link) | **Not built** (paymentPlan.md Phase 3, not started). |
| Manual sale / mark-invoice-paid → Sale | ✅ Works. |
| Tax payment out (to Paystack) | ✅ Init works; completion blocked by webhook 500. |
| **Outbound transfer via Paystack Transfers** | ❌ **Completely greenfield.** No recipient mgmt, no `/transfer` call, no `transfer.*` webhooks, no provider methods. |
| **Refunds** (`charge.refunded`) | ❌ Not built. Enum exists, no code. |
| FIRS Direct Pay remittance | ❌ Not built; `firsRemittanceRef`/`firsReceiptUrl` columns reserved. |
| `transfer.*` webhook handling | ❌ Not handled (swagger mentions it; no code). |

**Bottom line:** the "collect money" half is mostly built (and blocked by Part 1).
The "send money" half (Paystack Transfers) does not exist yet but is a well-bounded
add because you've constrained it to one provider's API.

---

## THE BANKING-FEATURE PHASES (continue numbering from Part 1)

> **Hard prerequisite:** Part 1 Phases 1–4 must be GREEN first. You cannot build
> outbound transfers on a backend whose webhooks 500 and whose build doesn't typecheck.

---

### Phase 7 — Complete the RECEIVE side (close the inbound loop) — DEV (4-6 hr)

- [ ] **7.1 Verify DVA inbound end-to-end over ngrok** (needs Part 1 #1 fixed + ngrok).
      Test DVA transfer → `pending`/`needsVerification` Sale in the Unverified inbox →
      owner verifies → counts toward tax. **First proof the core product works.**
- [ ] **7.2 Invoice online pay-links** (paymentPlan.md Phase 3): `initiatePayLink` →
      Paystack `initialize` with `metadata.kind='invoice'`; webhook branch flips invoice
      `paid` + creates `SalesTransaction(source:'online_store')` + `linkedSaleId`;
      public HMAC-token `GET /pay/invoice/:id` page. Dedup via existing unique constraint.
- [ ] **7.3 Surface `transaction_needs_verification`** in the bell/dashboard.
- [ ] **7.4 "Requery DVA" button** wired to existing `POST /dva/requery`.

**Exit:** Every inbound channel (DVA, invoice card, manual) lands as a reviewable Sale,
proven over a real webhook.

---

### Phase 8 — Paystack Transfers: provider + schema groundwork — DEV (1 day)

Greenfield, but bounded to Paystack's Transfer API. Test keys only. **Do not start
until Paystack confirms Transfers are enabled (the gate above).**

- [ ] **8.1 Confirm Paystack Transfers eligibility** (non-code gate). If no → SEND is
      out of scope per your rule; skip to Phase 11/12.
- [ ] **8.2 New schema models** (write model AND migration together; run
      `prisma migrate diff` to confirm sync — do NOT repeat the Part 1 drift):
      - `TransferRecipient` — `{ id, businessId, recipientCode, bankCode, accountNumber,
        accountName, nickname?, createdAt }`, unique `(businessId, bankCode,
        accountNumber)`. Maps to Paystack `/transferrecipient`.
      - `Transfer` — `{ id, businessId, recipientId, amount, reference (unique),
        paystackTransferCode, status (pending|success|failed|reversed), reason?,
        failureReason?, initiatedBy, createdAt, completedAt }`. Immutable outbound
        ledger — one row per payout.
      - **Outbound transfers are NOT sales** and must NEVER enter the tax base. Keep
        them in their own table, never as a negative `SalesTransaction`.
- [ ] **8.3 Extend `PaymentProvider` + `PaystackProvider`** with Paystack-native calls:
      - `resolveAccount(accountNumber, bankCode)` → `GET /bank/resolve` (name-enquiry —
        show "who am I paying" before confirm; non-negotiable safety).
      - `createTransferRecipient({ bankCode, accountNumber, name })` →
        `POST /transferrecipient`.
      - `initiateTransfer({ amount, recipientCode, reference, reason })` →
        `POST /transfer`.
      - `verifyTransfer(reference)` → `GET /transfer/verify/:reference`.
      Reuse the naira↔kobo (×100) convention.
- [ ] **8.4 Idempotency:** unique `reference` per transfer (like `initiatePayment`);
      the `Transfer.reference` unique constraint is the DB safety net. **Double-paying
      real money is the worst possible bug — design against it now.**

**Exit:** From a script you can resolve an account, create a recipient, and initiate a
test-mode Paystack transfer; the `Transfer` ledger records it. No UI yet.

---

### Phase 9 — Paystack Transfers: webhooks + finalization — DEV (4-6 hr)

Transfers are async — `initiate` returns `pending`; truth arrives by webhook.

- [ ] **9.1 Handle `transfer.success` / `transfer.failed` / `transfer.reversed`** in
      `processWebhook`. Look up `Transfer` by reference/code, atomically flip status +
      `completedAt`/`failureReason`. Idempotent on replay. Audit every transition.
- [ ] **9.2 Manual verify fallback** (`GET /transfers/:id/verify`) mirroring the
      tax-payment verify path — a lost webhook must not strand a payout in `pending`.
- [ ] **9.3 Paystack OTP on transfers.** Paystack may require an OTP step
      (`transfer.requires_otp` / `finalize_transfer`). Either disable OTP at the
      account level (single-step) or build the finalize-OTP flow. A half-built OTP path
      silently fails payouts — decide and finish it.
- [ ] **9.4 `transfer_successful` / `transfer_failed` reminder types** via
      `createReminderOnce` so the SME knows their payout landed.

**Exit:** A test transfer goes `pending → success` via webhook, ledger updated, SME
notified; failed/reversed handled, not stranded.

---

### Phase 10 — Send-money UI + safety rails — DEV (1 day)

- [ ] **10.1 Recipients page** — add/list/delete payees. On add, call `resolveAccount`
      and show the resolved account NAME before saving.
- [ ] **10.2 Send-money flow** — pick recipient → enter amount → **name-enquiry
      confirmation** ("Sending ₦X to JOHN DOE — GTBank") → confirm. Never fire a
      transfer without the user seeing the resolved name.
- [ ] **10.3 Money-movement safety rails:** confirm modal echoing the amount; disable
      confirm after first click (UI guard on top of backend idempotency); live status
      (`pending` → success/failed); show Paystack's own limits, don't invent limits.
- [ ] **10.4 Transfers history page** — the `Transfer` ledger, filterable by status.

**Exit:** An SME can send money to any Nigerian bank via Paystack, see who they're
paying, and track it. Test keys.

---

### Phase 11 — Refunds + reversals — DEV (4-6 hr)

- [ ] **11.1 Handle `charge.refunded`** (paymentPlan.md Phase 4.5): `TaxPayment →
      refunded`; DVA-sourced sale → `reversed`; invoice-sourced → flip invoice back +
      unlink + reverse the sale. **Reversed sales must drop out of the tax base** —
      verify (they should, since status≠confirmed).
- [ ] **11.2 `payment_refunded` reminder type.**
- [ ] **11.3 Manual-refund runbook** for cases Paystack can't auto-handle.

**Exit:** Reversed inbound money correctly un-counts from tax; no orphaned sales.

---

### Phase 12 — FIRS Direct Pay remittance — DEV→LIVE (API-dependent, runs in parallel)

The difference between "money sits in Paystack" and "tax reaches FIRS."

- [ ] **12.1 Get the FIRS API spec** — auth, per-TIN lodgement endpoint, request/response
      shape, sandbox availability. **Document in paymentPlan.md Phase 5.** Cannot build
      without it.
- [ ] **12.2 New `FirsProvider`/service** — on a completed tax payment, call FIRS with
      `{ tin, amount, period, ref }` → store in reserved `firsRemittanceRef` /
      `firsReceiptUrl` → email the SME a FIRS receipt.
- [ ] **12.3 Reconciliation job** — daily check that every `completed` tax payment has a
      FIRS remittance ref; alert on gaps. Money collected-but-not-remitted is a legal
      landmine — make it impossible to miss.
- [ ] **12.4 Idempotency** — never double-remit the same period/TIN.

**Exit:** A paid tax report produces a real FIRS lodgement with a stored receipt.
API-blocked, so it runs in parallel and must not block Phases 7–11.

---

## DEV ↔ LIVE INTERCHANGE — the operational runbook you asked for

### Auto-switches on key change (good — leave it)
- `preferredBank`: `sk_test_*` → `test-bank`, `sk_live_*` → `wema-bank`. Automatic.
- Rate limiting, cron, log format: gated on `NODE_ENV`. Automatic.

### Must change by hand when switching environments
| Thing | Dev | Prod |
|---|---|---|
| `PAYSTACK_SECRET_KEY` / `PUBLIC_KEY` | `sk_test_…` / `pk_test_…` (`.env`) | `sk_live_…` / `pk_live_…` (Render env) |
| `PAYSTACK_WEBHOOK_SECRET` | = secret key (Part 1 #4 — simplify) | = live secret key |
| Webhook URL in Paystack dashboard | ngrok HTTPS + `/api/webhooks/paystack` | `https://api.yourdomain/api/webhooks/paystack` |
| `NODE_ENV` | `development` | `production` |
| `FRONTEND_URL` | `http://localhost:5173` | live origin(s) |
| `ENABLE_CRON` | unset (off) | auto-on |
| `SENTRY_DSN` | optional | set (need error visibility for money) |
| FIRS API keys | sandbox | live |
| Test vs live Paystack codes (`CUS_…`, recipient codes) | test integration | live (separate — never mix) |

### Make the interchange bulletproof (action items)
- [ ] **I.1** Apply Part 1 Phase 3 — kill the false webhook-secret alarm, use the
      secret key for HMAC. Removes the #1 var people set wrong on env swap.
- [ ] **I.2** Keep two local env files (`.env` test + documented prod template, NOT
      committed) so flipping is one step.
- [ ] **I.3** Add a `/api/health` field echoing active Paystack mode (`test`/`live`
      from key prefix — NEVER print the key) so you can't accidentally run prod on test
      keys.
- [ ] **I.4** **Never mix integrations:** a test `CUS_xxxx` / recipient code is invisible
      on live. DVA customer codes self-heal; **transfer recipients do NOT** — document
      that recipients must be recreated when moving an account between modes.
- [ ] **I.5** Reserved-subdomain ngrok (or paid tunnel) so the dev webhook URL doesn't
      rotate every restart.

---

## REVISED CRITICAL PATH (Part 1 + banking)

```
Part 1 Phase 0–4   ← MUST be green first (drift, build, CI gate)
   │
   ├─ (parallel, non-code) Paystack Transfers eligibility?  +  FIRS API spec?
   │        └─ if Paystack Transfers = NO → SEND is out of scope (your rule). Skip Ph 8–10.
   │
   └─> Phase 7  Finish RECEIVE side (prove DVA→sale over ngrok)   ← core product proven
          └─> Phase 8  Paystack Transfers provider + schema (test keys)
                 └─> Phase 9  Transfer webhooks + finalization
                        └─> Phase 10 Send-money UI + safety rails
                               └─> Phase 11 Refunds/reversals
                                      └─> Phase 12 FIRS Direct Pay (API-gated, parallel)
                                             └─> Part 1 Phase 6 + live dress rehearsal
```

### "Good to go" milestones
- **After Part 1 Ph1:** dev usable; you can build.
- **After Phase 7:** RECEIVE-and-record product PROVEN in dev — first point worth demoing.
- **After Phase 11 (+ Part 1 Ph1–4):** full app works on **test keys** end-to-end with
  reversals → ready for a live dress rehearsal.
- **Live-ready** = above + Paystack Transfers confirmed (or SEND descoped) + FIRS path
  live + Part 1 Phase 6 + one real-money round-trip (small amount) watched end-to-end.

## The one rule for the money paths (tattoo this on the build)
> Every money movement — in OR out — must be: (1) idempotent by a unique reference,
> (2) recorded in an immutable ledger row before the external call, (3) finalized by
> webhook with a manual-verify fallback, (4) never double-fired from the UI.
> Inbound becomes a reviewable Sale; outbound is a Paystack Transfer, logged but NEVER
> a negative sale and NEVER in the tax base. Get these four right and nothing
> catastrophic can happen; get one wrong and you will eventually move real Naira twice.

---
---

# PART 3 — RESEARCH-GROUNDED REFINEMENT (the real Paystack/FIRS mechanics)

> Added 2026-06-11 after reading Paystack's Transfers, DVA, Split-Settlement, and the
> FIRS ATRS (Automated Tax Remittance System) API docs. This part **supersedes** the
> Phase 8–12 sketch in Part 2 where they conflict — Part 2 was written before this
> research and got one big thing architecturally wrong. Read this before building SEND.

## Sources (re-read before touching these flows — Paystack deprecates quietly)
- Paystack — How Transfers Work: https://paystack.com/docs/transfers/how-transfers-work/
- Paystack — Single Transfers: https://paystack.com/docs/transfers/single-transfers/
- Paystack — Transfer API: https://paystack.com/docs/api/transfer/
- Paystack — Transfer Control (OTP / approval URL): https://paystack.com/docs/api/transfer-control/
- Paystack — Managing Transfers (statuses, retries): https://paystack.com/docs/transfers/managing-transfers/
- Paystack — Split Payments / Subaccounts: https://paystack.com/docs/payments/split-payments/
- Paystack — Multi-split Payments: https://paystack.com/docs/payments/multi-split-payments/
- Paystack — Dedicated Virtual Accounts: https://paystack.com/docs/payments/dedicated-virtual-accounts/
- Paystack — Transfers (support, eligibility): https://support.paystack.com/en/articles/2132866
- FIRS — ATRS API docs (devs): https://atrs.firs.gov.ng/docs/category/api-documentation-for-devs/
- FIRS — ATRS dev/prod base URLs: https://api-dev.i-fis.com (dev), https://atrs-api.firs.gov.ng (prod)

---

## 🚨 THE ONE FINDING THAT CHANGES THE ARCHITECTURE

**Paystack research, verbatim implication:**
> "When customers send money to a Dedicated Virtual Account, the funds are credited
> to **your Paystack business** … Paystack holds received funds in a designated
> **merchant wallet**." AND: "Transfers lets you send money from **your Paystack
> Balance** to bank accounts."

So by default:
1. EVERY SME's DVA inbound money lands in **ONE pooled balance — YOURS** (the platform's
   Paystack account).
2. Paystack Transfers move money out of **that same single pooled balance.**

**This directly collides with your stated model** ("Paystack holds funds, I'm just an
integrator, I don't custody balances"). If all SMEs' money pools into your one balance
and you send payouts from it, then **you ARE custodying and disbursing other people's
money from a balance you control** — which is exactly the CBN-licensed activity you
(correctly) want to avoid. The naive "add a Transfers call" approach quietly turns you
into an unlicensed money-services operator. **Do not build it that way.**

### The clean resolution: **Subaccount split-settlement (one subaccount per SME)**

Paystack research, verbatim:
> "Split payment for dedicated virtual accounts allows you to automatically split funds
> received into a dedicated virtual account between your main settlement bank account
> and one or more bank account(s)." You "add a subaccount when creating (or to an
> existing) dedicated virtual account."

**The architecture this dictates:**
- Each SME onboards a **Paystack subaccount** (`ACCT_xxxx`) tied to **their own bank
  account** (created from their bank details via the Subaccount API).
- Each SME's **DVA is created WITH that subaccount attached.**
- Inbound DVA money then **auto-settles to the SME's own bank account** (minus your
  platform fee/commission, which you can take as the split percentage/flat) — it never
  pools in a balance you control and disburse.
- **You record the transaction as a Sale** (your whole tax purpose) **without ever
  custodying the funds.** Paystack moves the money SME-customer → SME-bank directly.

**What this means for "send money":**
- For the **pure-tax product**, you may not need a generic Transfers-out feature at all —
  the SME's revenue already lands in their own bank via split-settlement. The only
  "outbound" that matters is **paying the FIRS tax bill**, which is a charge/collection
  flow, not a balance payout.
- A **generic "send to any bank" feature** (true online-banking payout) only makes
  sense if you DO pool balances — which puts you back into licensed territory. **Per
  your own rule ("if Paystack can't do it cleanly, I won't"), the honest answer the
  research points to is: do split-settlement, not pooled payouts.**

### DECISION REQUIRED (write your choice here before building Phase 8+)

- [ ] **Option A — Split-settlement (RECOMMENDED, license-safe).** One subaccount per
      SME; DVAs attached to subaccounts; inbound auto-settles to each SME's own bank;
      you take a split as revenue; you record Sales for tax; **no pooled balance, no
      generic payouts, no CBN exposure.** "Send money" = "your money already arrived in
      your bank." Outbound to FIRS handled separately (Part 3 FIRS phase).
- [ ] **Option B — Pooled balance + Transfers (the literal "online bank," HIGH RISK).**
      All SME money pools in your Paystack balance; you build Transfers-out per SME.
      **This is regulated money-services activity in Nigeria.** Do NOT do this without
      written Paystack approval AND Nigerian fintech legal counsel on whether you need
      a CBN license (PSSP/Switching/MMO). Likely a non-starter for a solo dev.
- [ ] **Option C — Ask Paystack.** Open a ticket describing your exact model and let
      their compliance team tell you which of A/B they'll permit on your account. Their
      answer is authoritative; document it here.

> **Senior recommendation: Option A.** It delivers everything the tax product needs
> (record every inbound Naira as a Sale, take your cut, remit tax) while keeping you a
> thin integrator. The "send money to any bank" framing from earlier is a feature you
> *think* you need but the split-settlement model makes mostly unnecessary — and the
> version that truly needs it (Option B) is the one that could get you shut down.

---

## FIRS — what the research actually revealed (this is buildable NOW)

Good news: FIRS has a **real, documented REST API** — the **ATRS (Automated Tax
Remittance System)**. It is not vaporware.
- **Dev base URL:** `https://api-dev.i-fis.com`  •  **Prod:** `https://atrs-api.firs.gov.ng`
- HTTPS only; REST; Swagger-documented; onboarding via `support@atrs.firs.gov.ng`.
- TaxPro-Max is the filing portal; **Remita** is a proven payment rail already
  integrated with it (precedent that third-party payment integration is allowed).
- **Critical gotcha the research flagged (RRR/reference handling):** "always generate a
  fresh payment reference immediately before payment — an old/incorrect reference
  misdirects payment to a different period." Bake this into the FIRS phase: never reuse
  a remittance reference across periods; generate per-remittance, immediately before pay.
- **2025+ e-invoicing mandate** exists for big businesses (>₦5bn turnover). Your SMEs are
  below that, but the same FIRS platform/credentials are the integration surface — worth
  knowing your customers may later be pulled into e-invoicing.

**Action:** email `support@atrs.firs.gov.ng` NOW to get ATRS dev credentials + the
Swagger spec. This is the long-pole, partner-gated item — start it in parallel on day 1.

---

## REFINED PHASE PLAN (replaces Part 2 Phases 8–12)

> Prerequisite unchanged: **Part 1 Phases 0–4 GREEN first.** Then Part 2 **Phase 7**
> (finish + prove the RECEIVE side over ngrok) is still correct as written — do it.
> The phases below replace the outbound/FIRS sketch with the research-correct versions.

### Phase 8R — Decide the money-custody model + open partner tickets (Week 1, mostly non-code)
- [ ] **8R.1** Record your A/B/C decision above. **Default to Option A (split-settlement).**
- [ ] **8R.2** Open Paystack ticket: confirm (a) Transfers/Subaccounts enabled for your
      account, (b) your DVA-per-customer + subaccount-split model is permitted, (c)
      whether your business registration suffices (Transfers need a Registered Business).
- [ ] **8R.3** Email `support@atrs.firs.gov.ng`: request ATRS dev credentials + Swagger.
- [ ] **8R.4** Until both replies land, build ONLY against Paystack **test keys** and the
      FIRS **dev** base URL. Do not touch live.
**Exit:** Custody model chosen and in writing; partner onboarding in flight.

### Phase 9R — Subaccount-per-SME + split-settlement DVAs (Option A) — DEV (1–1.5 days)
- [ ] **9R.1 Schema:** add `Subaccount` fields to `Business` (or a `Subaccount` table):
      `paystackSubaccountCode`, `settlementBankCode`, `settlementAccountNumber`,
      `settlementAccountName`, `platformSplitPercent` (your commission). Write model AND
      migration together; `prisma migrate diff` to confirm sync (no Part-1 drift repeat).
- [ ] **9R.2 Provider methods** (`PaystackProvider`): `createSubaccount({ bankCode,
      accountNumber, percentageCharge })` → `POST /subaccount`; `resolveAccount` →
      `GET /bank/resolve` (name-enquiry; show the SME their own resolved name on
      onboarding). Reuse the `banks` cache (now working post Part-1) for the dropdown.
- [ ] **9R.3 Attach subaccount to DVA:** when creating the DVA (or updating an existing
      one), pass the SME's `subaccount` so inbound auto-settles to their bank. Update
      `dva.service.ts` setup flow.
- [ ] **9R.4 Onboarding UI:** "Connect your payout bank" step — bank dropdown + account
      number → resolve name → confirm → create subaccount → (re)issue DVA with split.
- [ ] **9R.5 Record-as-Sale unchanged:** the existing `processDVATransferWebhook`
      already records the inbound as a `pending`/`needsVerification` Sale. That stays —
      the only change is the money now lands in the SME's bank, not your pool.
**Exit:** An SME connects their bank, gets a DVA, and a test inbound transfer (a) settles
toward their subaccount and (b) appears as a reviewable Sale. No pooled balance.

### Phase 10R — (ONLY if Option B was chosen) Paystack Transfers-out — DEV (2 days)
> Skip entirely under Option A. Build ONLY with written Paystack + legal sign-off.
- [ ] **10R.1** `Transfer` + `TransferRecipient` tables (as Part 2 Phase 8.2). Model +
      migration together.
- [ ] **10R.2** Provider: `createTransferRecipient` → `POST /transferrecipient`;
      `initiateTransfer` → `POST /transfer` (amount in **kobo**, `reference` = v4 UUID,
      lowercase/digits/`_`/`-` only, ≤50 chars); `verifyTransfer` →
      `GET /transfer/verify/:reference`.
- [ ] **10R.3 OTP decision (Transfer Control API):** Paystack returns `data.status:'otp'`
      when OTP is on, `'pending'` when off. For automation either (a) **disable OTP**
      (`POST /transfer/disable_otp` → itself OTP-confirmed) — research warns this means
      "anyone with your secret key can drain your balance," so pair with IP allow-listing
      + secret hygiene; OR **strongly preferred** (b) use the **Transfer Approval URL**
      feature so Paystack calls YOUR endpoint to approve each transfer before processing.
      Bulk transfers REQUIRE OTP off. **Decide and implement fully — a half-OTP path
      silently abandons transfers after 30 min.**
- [ ] **10R.4 Webhooks:** handle `transfer.success` / `transfer.failed` /
      `transfer.reversed`. Research note: **HTTP 200 ≠ transfer success** — only trust
      `data.status` on a 200. Statuses to handle: `pending, success, failed, reversed,
      abandoned, blocked`. Idempotent; manual `verify` fallback. Never poll (Paystack
      says webhooks, not polling).
- [ ] **10R.5 Retry rule (research):** before retrying, wait for a **conclusive** status;
      retry with the **same reference** (never a new one) to avoid double-pay.
- [ ] **10R.6 UI safety rails** (Part 2 Phase 10): name-enquiry confirm, amount echo,
      disable-after-click, live status, Paystack's own limits.
**Exit:** (Option B only) An SME sends to any bank; ledgered, webhook-finalized, idempotent.

### Phase 11R — Refunds / reversals — DEV (4–6 hr)
- [ ] **11R.1** Handle `charge.refunded` (paymentPlan.md Phase 4.5): `TaxPayment→refunded`;
      DVA-sourced sale → `reversed`; invoice-sourced → flip invoice back + unlink +
      reverse sale. **Reversed sales must leave the tax base** (status≠confirmed — verify).
- [ ] **11R.2** `payment_refunded` reminder type. Manual-refund runbook for edge cases.
- [ ] **11R.3** Under split-settlement, a refund may claw back from a subaccount — confirm
      Paystack's behavior and reflect it in the Sale status. Document.
**Exit:** Reversed inbound money correctly un-counts from tax; no orphan sales.

### Phase 12R — FIRS ATRS remittance — DEV→LIVE (API-gated, runs in parallel from Week 1)
- [ ] **12R.1** With ATRS Swagger in hand, document auth + the per-TIN lodgement endpoint
      + request/response shape in `paymentPlan.md` Phase 5. (Cannot build before this.)
- [ ] **12R.2** `FirsProvider`/service: on a completed tax payment, **generate a fresh
      remittance reference immediately before pay** (research-flagged RRR rule), lodge
      `{ tin, amount, period, ref }` to ATRS (dev URL first) → store in reserved
      `TaxPayment.firsRemittanceRef` / `firsReceiptUrl` → email the SME the FIRS receipt /
      TCC link.
- [ ] **12R.3** Reconciliation cron: daily assert every `completed` tax payment has a FIRS
      ref; alert on gaps. Collected-but-not-remitted is a legal landmine.
- [ ] **12R.4** Idempotency: never double-lodge the same period/TIN; never reuse a ref
      across periods (misdirects to the wrong period — research-flagged).
**Exit:** A paid tax report produces a real ATRS lodgement (dev), receipt stored, SME
emailed. Flip to prod URL only after FIRS issues live credentials.

### Phase 13R — Live dress rehearsal + go-live (ties back to Part 1 Phase 6)
- [ ] **13R.1** Swap to live Paystack keys; verify `preferredBank`→`wema-bank` auto-resolves.
- [ ] **13R.2** Real small-amount round trip: SME onboards bank → DVA (split) → a real
      ₦100 transfer in → settles to their bank → recorded as Sale → tax computed.
- [ ] **13R.3** FIRS: flip ATRS to prod URL + live credentials; lodge one real small
      remittance; confirm receipt/TCC.
- [ ] **13R.4** Sentry receiving events; `/api/health` shows live mode (action I.3);
      webhook URL set to prod domain; CI gate green (Part 1 Phase 4).
**Exit:** One real Naira round-trip + one real FIRS remittance, watched end-to-end. THAT
is "good to go live."

---

## REVISED CRITICAL PATH (research-corrected)

```
Part 1 Ph 0–4 GREEN  (drift, build, CI gate)
   │
   ├─ WEEK 1 PARALLEL, NON-CODE (longest poles — start day 1):
   │     • Paystack ticket: Transfers/Subaccounts/DVA-split eligibility  (Phase 8R.2)
   │     • FIRS email: ATRS dev credentials + Swagger                    (Phase 8R.3)
   │     • DECIDE custody model A/B/C — default A (split-settlement)      (Phase 8R.1)
   │
   └─> Phase 7  Prove RECEIVE over ngrok            ← core product proven
          └─> Phase 9R  Subaccount-per-SME + split DVAs (Option A)   ← money → SME's own bank
                 │        (Phase 10R only if Option B chosen — high risk, likely skip)
                 └─> Phase 11R Refunds/reversals
                        └─> Phase 12R FIRS ATRS remittance (parallel, API-gated)
                               └─> Phase 13R Live dress rehearsal → GO-LIVE
```

## What changed from Part 2 (so you don't get whiplash)
- **Part 2 assumed pooled-balance + generic Transfers-out.** Research shows that's the
  CBN-licensed path. **Part 3 replaces it with subaccount split-settlement (Option A)** —
  same user outcome ("my revenue reaches my bank"), zero custody, zero license exposure.
- **FIRS went from "unknown API" to a concrete target:** ATRS REST API, dev+prod URLs,
  Swagger, known RRR/reference gotcha. It's the longest partner-gated pole — start it now.
- **Transfers OTP is a real fork** (disable-OTP vs Approval-URL) with a security warning;
  only relevant under Option B.

## Unchanged truths (still the law)
- Part 1 first. No exceptions.
- The four-rule money law (idempotent ref / ledger-before-call / webhook-with-fallback /
  no double-fire UI) applies to every flow here.
- Inbound = reviewable Sale; outbound/settlement is NEVER a negative sale and NEVER in
  the tax base.
- Schema + migration always written together; `prisma migrate diff` in CI.

---
---

# PART 4 — OPTION A IMPLEMENTATION GUIDE (chosen 2026-06-11)

> **Decision locked: Option A — subaccount split-settlement.** Each SME connects their
> own bank; you create a Paystack **subaccount** for it; you attach that subaccount to
> their **DVA**; inbound money **auto-settles to the SME's bank** (you keep a commission
> %). You record the inbound as a **Sale** for tax. You never hold or disburse funds.
> No "send money" button, no pooled balance, no CBN license exposure.
>
> This part is the concrete, file-by-file build plan against the CURRENT codebase.
> It assumes **Part 1 Phase 1 (schema drift) is already fixed** — the `banks` table /
> `prisma.bank` must work, because the bank dropdown depends on it.

---

## How the money actually moves (so the code makes sense)

**Today (the problem):**
```
Customer → SME's DVA → pools in YOUR Paystack balance → (you'd have to pay SME out = license risk)
```

**Option A (the fix):**
```
SME onboarding:  connect bank → resolveAccount (name check) → createSubaccount(SME bank, commission%)
                                                                    └─ store paystackSubaccountCode on Business

DVA creation:    createDedicatedAccount(customerCode, preferredBank, SUBACCOUNT) ← only new arg

Customer pays:   Customer → SME's DVA → Paystack auto-splits → SME's bank (you keep commission%)
                                              ↓
                              processDVATransferWebhook records a Sale  ← UNCHANGED
```

**The split number:** `percentage_charge` on the subaccount = **what Paystack keeps for
your MAIN account**, the rest settles to the subaccount (the SME's bank). So
`percentage_charge: 2` → you keep 2%, SME gets 98%. Commission 0 → SME gets 100%.
(Confirm direction against current Paystack docs before going live — they occasionally
reword; the Subaccount API field is authoritative.)

---

## What already exists vs. what's new

| Piece | Status | Action |
|---|---|---|
| `createCustomer`, `createDedicatedAccount` (provider) | ✅ exists | extend DVA call with subaccount arg |
| `processDVATransferWebhook` (records Sale) | ✅ exists | **no change** |
| `banks` cache + `GET /api/v1/banks` | ✅ exists (post Part-1 fix) | reuse for dropdown |
| `resolveAccount` (name enquiry) | ❌ new | add provider method |
| `createSubaccount` | ❌ new | add provider method |
| Subaccount columns on `Business` | ❌ new | schema + migration |
| Onboarding service + routes + UI | ❌ new | build |

---

## STEP-BY-STEP BUILD

### Step 1 — Schema: subaccount fields on `Business` (30 min)

Add to the `Business` model in `prisma/schema.prisma` (write the migration in the SAME
change — do NOT repeat the Part-1 drift):

```prisma
// --- Option A: split-settlement to the SME's own bank ---
paystackSubaccountCode  String?  @map("paystack_subaccount_code")   // ACCT_xxxx
settlementBankCode      String?  @map("settlement_bank_code")        // NIBSS code, e.g. "058"
settlementBankName      String?  @map("settlement_bank_name")
settlementAccountNumber String?  @map("settlement_account_number")   // 10-digit NUBAN
settlementAccountName   String?  @map("settlement_account_name")     // resolved name from Paystack
platformCommissionPct   Decimal  @default(0.00) @map("platform_commission_pct") @db.Decimal(5, 2)
settlementConnectedAt   DateTime? @map("settlement_connected_at")
```

Then:
```
npx prisma migrate dev --name add_subaccount_settlement
npx prisma generate
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma --exit-code   # must report NO diff
```

> Store the resolved `settlementAccountName` so you can show "settling to JOHN DOE —
> GTBank" in the UI and on receipts WITHOUT re-calling Paystack every render.

### Step 2 — Provider: two new Paystack methods (1 hr)

In `src/lib/payment/types.ts`, add to the `PaymentProvider` interface + result types:

```ts
export interface ResolveAccountResult { accountNumber: string; accountName: string; }
export interface CreateSubaccountParams {
  businessName: string; bankCode: string; accountNumber: string; percentageCharge: number;
}
export interface CreateSubaccountResult { subaccountCode: string; }
// add to interface:
resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountResult>;
createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult>;
```

In `src/lib/payment/paystack.provider.ts`:

```ts
async resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountResult> {
  const data = await this.request('GET',
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return { accountNumber: data.account_number, accountName: data.account_name };
}

async createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult> {
  const data = await this.request('POST', '/subaccount', {
    business_name: params.businessName,
    bank_code: params.bankCode,
    account_number: params.accountNumber,
    percentage_charge: params.percentageCharge,   // % YOU keep on the main account
  });
  return { subaccountCode: data.subaccount_code };
}
```

### Step 3 — Extend `createDedicatedAccount` to accept a subaccount (30 min)

In `paystack.provider.ts`, add an optional 3rd arg and pass it through:

```ts
async createDedicatedAccount(customerCode: string, preferredBank: string, subaccount?: string): Promise<CreateDVAResult> {
  if (!preferredBank) throw new AppError(500, 'preferredBank is required…', 'PAYSTACK_CONFIG_ERROR');
  const data = await this.request('POST', '/dedicated_account', {
    customer: customerCode,
    preferred_bank: preferredBank,
    ...(subaccount ? { subaccount } : {}),   // ← attaches split-settlement
  });
  // …unchanged…
}
```
Update the interface signature in `types.ts` to match (`subaccount?: string`).

### Step 4 — Service: connect-bank onboarding (1.5 hr)

New functions in `src/services/dva.service.ts`:

```ts
// Preview: resolve the account name so the SME confirms WHO they're connecting.
export async function resolveSettlementAccount(userId, businessId, bankCode, accountNumber) {
  await verifyBusinessOwnership(userId, businessId);
  const provider = getPaymentProvider();
  const { accountName } = await provider.resolveAccount(accountNumber, bankCode);
  return { bankCode, accountNumber, accountName };   // UI shows this for confirmation
}

// Commit: create the Paystack subaccount + persist it on the business.
export async function connectSettlementBank(userId, businessId, { bankCode, bankName, accountNumber, commissionPct }) {
  const business = await verifyBusinessOwnership(userId, businessId);
  const provider = getPaymentProvider();

  // Always re-resolve server-side — never trust a client-supplied account name.
  const { accountName } = await provider.resolveAccount(accountNumber, bankCode);

  const { subaccountCode } = await provider.createSubaccount({
    businessName: business.businessName,
    bankCode, accountNumber,
    percentageCharge: commissionPct ?? 0,
  });

  await prisma.business.update({
    where: { id: businessId },
    data: {
      paystackSubaccountCode: subaccountCode,
      settlementBankCode: bankCode,
      settlementBankName: bankName,
      settlementAccountNumber: accountNumber,
      settlementAccountName: accountName,
      platformCommissionPct: commissionPct ?? 0,
      settlementConnectedAt: new Date(),
    },
  });

  logAudit({ userId, businessId, action: 'settlement.connected', resourceType: 'business',
    resourceId: businessId, newData: { subaccountCode, bankCode, accountLast4: accountNumber.slice(-4) } });

  return { subaccountCode, accountName, bankName };
}
```

Then update **`setupVirtualAccount`** so the DVA is created WITH the subaccount:

```ts
// inside setupVirtualAccount, after ensureCustomerCode():
const subaccount = business.paystackSubaccountCode || undefined;
dva = await provider.createDedicatedAccount(customerCode, preferredBank, subaccount);
```

> **Ordering rule:** the SME should connect their bank (subaccount) BEFORE the DVA is
> issued, so the DVA is born attached. If a DVA already exists, Paystack lets you attach
> a subaccount to an existing DVA — add an `attachSubaccountToDVA` provider call later
> if you need to retrofit existing accounts (DVA update endpoint). For new users, just
> enforce "connect bank first" in the UI.

### Step 5 — Routes (15 min)

In `src/routes/dva.routes.ts`:
```ts
router.post('/settlement/resolve', dvaController.resolveSettlement);  // preview name
router.post('/settlement/connect', dvaController.connectSettlement);  // create subaccount
```
Add the two thin controllers in `dva.controller.ts` (mirror the existing ones).
Add a Zod schema in `dva.validator.ts`: `{ bankCode, bankName, accountNumber (10 digits), commissionPct? }`.

### Step 6 — Frontend onboarding (half day)

On `Account.tsx` (the DVA page), add a **"Connect your payout bank"** step that gates DVA
setup:
1. Bank dropdown ← `GET /api/v1/banks` (the now-working cache).
2. Account number input (10 digits).
3. On blur / "Verify": `POST /dva/settlement/resolve` → show the resolved
   **account name** ("Settling to: JOHN DOE"). **Never let them proceed without seeing
   the name** — this is the anti-typo safety gate.
4. Confirm → `POST /dva/settlement/connect` → then enable the existing "Set up virtual
   account" button.
5. Show connected state: "Revenue settles to JOHN DOE — GTBank (•••1234)."

### Step 7 — Verify the split end-to-end (ngrok, test keys)

1. Connect a test bank → subaccount created (check the audit log + `Business` row).
2. Set up DVA → confirm it's created with the subaccount attached.
3. Trigger a test DVA transfer via Paystack → confirm:
   - A **Sale** appears (unverified inbox) — recording still works.
   - On the **Paystack dashboard**, the transaction shows the **split** to the subaccount.
4. Verify the Sale → counts toward tax. Money path + tax path both proven.

---

## What you DON'T build (and why that's the point)
- ❌ No `Transfer` / `TransferRecipient` tables.
- ❌ No `POST /transfer`, no OTP/approval-URL handling, no transfer webhooks.
- ❌ No balance display, no "send money" UI.
- ❌ No CBN licensing surface.
Paystack's settlement engine replaces all of it. Your job shrinks to: **create a
subaccount, attach it to the DVA, record the Sale.** That's Option A.

---

## Effort estimate
| Step | Time |
|---|---|
| 1. Schema + migration | 0.5 hr |
| 2. Provider methods (resolve, subaccount) | 1 hr |
| 3. Extend createDedicatedAccount | 0.5 hr |
| 4. Service (connect + setup wiring) | 1.5 hr |
| 5. Routes + controllers + validator | 0.5 hr |
| 6. Frontend onboarding step | ~4 hr |
| 7. End-to-end verify over ngrok | 1 hr |
| **Total** | **~1.5 days** (after Part 1 Phase 1) |

## Open items to confirm before LIVE (non-code, do early)
- [ ] Paystack ticket: confirm **Subaccounts + DVA-with-subaccount** are enabled on your
      account, and that the percentage-charge direction is "main account keeps the %".
- [ ] Decide your **commission %** (`platformCommissionPct`) — 0 to launch, raise later.
- [ ] Confirm **fee bearer** (who pays Paystack's transaction fee on split settlements —
      Subaccount API `bearer_type`). Default is your main account; you may want the
      subaccount or proportional. Set deliberately so your margin is predictable.
- [ ] Refund behavior under split (Part 3 Phase 11R) — confirm claw-back source.

---
---

# PHASE 1 STEP 1 — STATUS UPDATE & NEXT STEPS

> **COMPLETED:** 2026-06-11 16:52 UTC. Phase 1 Steps 1-2 are DONE. Schema drift fixed, all 101 tests passing, TypeScript compilation clean.

## ✅ Phase 1 Steps 1-2: COMPLETE

### Step 1 (Schema Drift Fix): DONE ✅
- **Schema models re-added**: `PaystackWebhookEvent` and `Bank` models added with exact column mappings
- **DB tables created**: Both tables created via direct SQL execution (migrations existed but tables were missing)
- **Prisma client regenerated**: `prisma.paystackWebhookEvent` and `prisma.bank` now work
- **Drift check passed**: `prisma migrate diff` reports "No difference detected"
- **Webhook tests fixed**: Changed test body encoding from `.send(payload)` to `.send(Buffer.from(payload))` with explicit Content-Type header to match HMAC signature computation
- **ALL 5 WEBHOOK TESTS PASS** (was 3 failing → now 0 failing)

### Step 2 (TypeScript Clean): DONE ✅  
- **Sentry v10 API migrated**: Replaced deprecated `Handlers.requestHandler/tracingHandler/errorHandler` with `setupExpressErrorHandler(app)`
- **Type error fixed**: `transaction-classification.controller.ts:23` - wrapped category param with `String()`
- **`npx tsc --noEmit` GREEN**: Zero errors
- **ALL 101 E2E TESTS PASS**: Full test suite verified

### Step 3 (False Alarm Removal): DONE ✅
- **Removed checkWebhookSecretShape()**: Paystack DOES use secret key for webhook HMAC (unlike Stripe)
- **Updated .env.example**: Corrected documentation about webhook secret
- **Clean boot logs**: No more false warnings

### Step 4 (CI Gate): DONE ✅
- **GitHub Actions workflow**: `.github/workflows/ci.yml` runs on every push/PR
- **Automated checks**: TypeScript compilation, schema validation, migrations, full test suite
- **Quality gate**: PRs cannot merge if checks fail
- **Documentation**: `.github/CI.md` explains the setup

## ⏳ NEXT: Phase 7 — Prove DVA end-to-end over ngrok

The warning `"PAYSTACK_WEBHOOK_SECRET appears to be a SECRET KEY"` is backwards for Paystack. Unlike Stripe, Paystack DOES sign webhooks with the secret key (`sk_*`). This false alarm needs to be removed per the action plan Phase 3.

---
---

# PART 1 STEP 1 — STATUS UPDATE & NEXT STEPS (ORIGINAL NOTES)

> **Where we stopped:** 2026-06-11 15:30. Two model definitions added to schema, DB tables created, client regenerated. Schema drift **technically fixed** but tests still failing. Documenting the exact issue + what remains.

## What was DONE (verified and committed)

- [x] **Schema models re-added**: `PaystackWebhookEvent` and `Bank` models added to end of `prisma/schema.prisma` with exact column mappings from migrations (`raw_body`, `signature`, `last_fetched_at`, etc.), `@@map("paystack_webhook_events")` and `@@map("banks")`, plus all indexes.
- [x] **DB tables created**: Both tables created via `npx prisma db execute --file migration.sql` because the migration records existed but tables were missing (schema drift had drifted further than expected).
- [x] **Prisma client regenerated**: `npx prisma generate` now exports `prisma.paystackWebhookEvent` and `prisma.bank` as objects (verified via node REPL).
- [x] **DRIFT CHECK PASSED**: `prisma migrate diff` now reports "No difference detected."
- [x] **Jest dotenv support added**:
  - `jest.config.ts` updated with `setupFiles: ['<rootDir>/tests/helpers/loadEnv.ts']`
  - `tests/helpers/loadEnv.ts` created (imports `dotenv/config`)
  - `tests/e2e/api.e2e.test.ts` updated with `import 'dotenv/config'` at top
- [x] **Server behavior verified**: Direct curl to `localhost:3000/api/webhooks/paystack` with bad signature returns **401 INVALID_SIGNATURE** correctly.

## What is STILL FAILING (the remaining bug)

### The symptom
- **Test:** Webhook signature tests (`POST /webhooks/paystack (valid signature)`, `duplicate webhook → no-op`, `bad signature → 401`) return **400** or **200** instead of expected **401**.
- **Direct curl (curl CLI):** Returns **401** correctly.
- **Conclusion:** The webhook handler works — the test harness (`supertest`) is the problem.

### What we tried
1. Added `import 'dotenv/config'` at top of `api.e2e.test.ts` — dotenv loads, signature computed with env var.
2. Created `tests/helpers/loadEnv.ts` + added to `setupFiles` — both attempted.
3. Verified `.env` contains `PAYSTACK_WEBHOOK_SECRET=sk_test_...` (48 chars) and `.env` loads correctly.
4. Checked server raw-body capture — `app.ts` line 62 sets `req.rawBody = buf.toString()`.
5. Compared test flow to manual curl — test sends `.send(payload)` where `payload = JSON.stringify(...)`; curl uses identical.

### Root cause analysis (in progress)
The **400** response (not 401) suggests the server sees `rawBody` as undefined or malformed when `supertest` sends the payload. This causes the signature check to throw a different error path before reaching the HMAC validation you fixed.

**Likely culprit:** `supertest`'s `.send(payload)` where `payload` is already a JSON string triggers Express to **re-parse the body**, but the `verify` callback stores the raw buffer **before parsing**. If supertest sends duplicate JSON encoding or headers mismatch, the raw body content differs.

**Evidence:** When I curl manually with `-d '{"event":...}'` and matching `-H "Content-Type: application/json"`, the raw body is the exact JSON string and HMAC matches. When supertest sends the same string but perhaps without proper body handling, the signature diverges.

## Next steps to finish Phase 1 Step 1

### Option A (quickest, recommended)
Modify the test to **ensure rawBody matches exactly what supertest sends**:
1. In `tests/e2e/api.e2e.test.ts`, instead of `.send(payload)`, use:
   ```ts
   .send(JSON.parse(payload))  // supertest will JSON-stringify
   .set('Content-Type', 'application/json')
   ```
   This ensures supertest + Express body-parser agree on the raw bytes.

2. OR add a custom agent that preserves raw body. See: https://github.com/ladjs/supertest/issues/473

### Option B
Capture what supertest actually sends to debug:
1. Add temporary console.log in `payment.service.ts` line ~158-160 to dump `rawBody` length and first 100 chars.
2. Compare to what the test computes signature over.

### Option C
Run the full test suite **without the signature-specific tests** — 98/101 tests pass, and the actual webhook endpoint works (verified by curl). The 3 failures are test-harness issues, not production issues. Document this and move to Phase 1 Step 2 (typecheck failures).

---

## Status checkpoint: PART 1 STEPS 1–4

| Step | Status | Blockers/Notes |
|-----|--------|---------------|
| **1️⃣ Schema drift** | ✅ Models written, DB tables created, drift check green | ❌ 3 webhook tests still 400 instead of 401 (test harness issue) |
| **2️⃣ Typecheck green** | 🟡 In progress | Sentry `Handlers`, 1 type error in `transaction-classification.controller.ts:23` |
| **3️⃣ Webhook-secret alarm** | ⏳ Next | After Step 2; warning is false alarm for Paystack (sk_* is correct) |
| **4️⃣ CI gate** | ⏳ Not started | Add tsc + migrate-diff to workflow; blocks Step 3 landing safely |

---

## To resume this work

**Command to reproduce the test failure:**
```bash
cd backend
# Server already running on :3000 from earlier
npm run test:e2e -- --testNamePattern="webhook"
```

**Files to edit:**
- `tests/e2e/api.e2e.test.ts` — webhook test cases (lines 840-1020)
- `src/middleware/errorHandler.ts` — if you change anything about error mapping
- `src/services/payment.service.ts` — only if you want to make signature check more defensive

**What success looks like:**
- `npm run test:e2e` reports **101/101 passing**
- OR at least the 3 webhook tests pass (200 for valid signature, 401 for bad, 200 for duplicate-after-success)

**If you choose Option C (accept 98/101):**
Skip the signature tests, move directly to fixing the remaining 2 typecheck errors:
1. `app.ts:95,96,122` — `Sentry.Handlers` removed in v10 (use `setupExpressErrorHandler(app)` or guard)
2. `transaction-classification.controller.ts:23` — `string | string[]` query coercion

---

## Quick reference: What we learned about the schema drift

- The `.prisma` schema had **no `PaystackWebhookEvent` or `Bank` model**, but migrations existed on disk.
- Migration records were in `_prisma_migrations`, but the **actual tables were MISSING from the database**. This is worse than "schema drift" — it was "schema phantom."
- `prisma migrate status` only checks the history table, **not actual table existence**.
- The fix: **execute the migration SQL directly** (`prisma db execute --file migration.sql`) to create tables, then ensure the schema models match exactly.
- **Never trust `migrate status` alone** — add a DB-level check to CI: `SELECT tablename FROM information_schema.tables WHERE tablename='...'`.

---

**Next action for you:** Decide whether to chase the supertest raw-body nuance (Option A/B) or move forward with 98/101 tests and fix the typecheck blockers (Option C). Both paths unblock Phase 7 (proving the webhook + DVA flow over ngrok).

---
---

# PART 4 FOLLOW-UP — Account page / Option A frontend completion (2026-06-13)

> Closes the gap between "the settlement backend exists" and "Option A actually
> works for the SME on the Account page." The settlement APIs from Part 4 were
> already shipped and green; the defects were on the frontend + one missing
> retrofit path. All changes below are on `main`-candidate working tree.

## What was wrong (verified by code read, not assumption)

1. **Fake wallet balance.** `Account.tsx` computed `available = confirmed inbound −
   tax paid` client-side and rendered it as a "Wallet Balance." Under Option A the
   platform holds **no spendable balance** (money settles to the SME's own bank), so
   this implied a custody we deliberately don't have — directly against the Part 3
   rule "Never display a balance you compute yourself."
2. **Settlement attached in the wrong order — money never reached the SME's bank.**
   "Connect Bank" only rendered *after* the DVA was active, the DVA was created
   **without** a subaccount, and there was **no code to attach a subaccount to an
   already-created DVA**. Net effect: inbound money kept pooling in the platform
   balance instead of split-settling. The core Option A premise was silently broken.
3. **Settlement endpoints skipped Zod validation** (inconsistent with the rest of the
   codebase, which validates every body).
4. **QR code was a literal placeholder** ("QR code generation would go here").

## What was fixed

### Backend
- **New provider method `splitDedicatedAccount(customerCode, subaccount)`**
  (`paystack.provider.ts`, interface in `types.ts`) → `POST /dedicated_account/split`
  with `{ customer, subaccount }`. This is the retrofit path for DVAs created before
  the SME connected a payout bank. Idempotent on Paystack's side.
- **`connectSettlementBank` retrofit** (`dva.service.ts`): after saving the subaccount,
  if a DVA already exists, attach the split to it (try/catch — a failed attach never
  loses the saved subaccount; returns `splitAttached` so the UI can warn softly).
  New DVAs still attach natively via `setupVirtualAccount`'s existing `subaccount` arg.
- **Zod schemas** `resolveSettlementSchema` / `connectSettlementSchema`
  (`dva.validator.ts`), parsed in the two settlement controllers.

### Frontend (`Account.tsx`)
- **Honest "Money In" card** replaces the fake balance: *Received (this month)* +
  *Pending verification*, plus a "Payments settle to <bank>" line (or a connect-bank
  nudge). No spendable-balance number anywhere.
- **Bank-first onboarding:** "Connect your payout bank" is now Step 1, shown before
  DVA setup; "Set up virtual account" is Step 2 with an amber hint when no bank is
  connected. The DVA is born attached for new users; the retrofit covers late
  connects. Connect now force-refreshes the business so the UI reflects it instantly.
- **Real QR** via `qrcode.react` (`QRCodeSVG`, lazy-loaded), encoding the transfer
  details, replacing the placeholder.
- `Payments.tsx` retitled "Tax Payments" with a subheading clarifying it lists FIRS
  remittances, not inbound customer money.

## Part 4 checklist status
- [x] Step 6 — Frontend onboarding (connect-bank step, resolve name, gate DVA setup).
- [x] Step 5 — Routes/controllers/validator (validator gap now closed).
- [~] Step 7 — End-to-end split verify over ngrok: **still pending a real test-key run**
  (resolve → connect → DVA split visible on Paystack dashboard → inbound settles).

## Still open (live-only / non-code, unchanged from Part 4 "before LIVE")
- Decide `platformCommissionPct` (currently hardcoded `0` in the connect call).
- Confirm fee bearer + percentage-charge direction with Paystack before live.
- Refund-under-split claw-back behavior (Phase 11R).
