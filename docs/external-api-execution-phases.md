# External API — Wowo — Execution Phases for a Junior Engineer

> **Authority.** This document is a *decomposition* of
> `docs/external-api-service-plan.reviewed.md` (v11). That file is the design of
> record and the only place a new decision may be made. This file adds **no new
> endpoints, columns, tables or behaviour** — it only splits the reviewed plan into
> work items small enough for an engineer with a few months of experience to
> complete correctly, one PR at a time. If anything here disagrees with the
> reviewed plan, the reviewed plan wins and this file is the bug.
>
> Verified against the repository on **2026-11-11**. `backend/` citations were
> re-read from source: `SalesSource` has 9 members, `ExpenseCategory` 21,
> `invoices.vat_rate @default(7.5)`, `expenses.is_deductible @default(true)`,
> `Invoice.linkedSale` has no `onDelete`, `sales_transactions.reference_id` is
> nullable, `Business` has no phone/email column. All still true.

---

## 0. How to use this document

1. **Work top to bottom.** Work items are numbered `P<phase>-<nn>` and listed in
   dependency order. Do not start an item whose "Depends on" is not merged.
2. **One work item = one pull request.** If an item feels too big for one PR, stop
   and say so — do not silently split or merge it.
3. **A phase is closed only when its gate is green.** The gate is a checklist at the
   end of the phase. Phase 3's gate is absolute: nothing from Phase 4 ships until it
   passes.
4. **There is no CI pipeline.** The GitHub Actions workflow was removed from this
   repo on purpose. The gate is the local command set in §0.2, run before you push.
   Railway builds and deploys on push, and it runs `npm install` + `npm run build`,
   so a red `typecheck` is a broken deploy, not just a warning.
5. **If a field, endpoint, status code or column is not in the reviewed plan, stop
   and ask.** Do not invent it "to be helpful". The plan was adversarially reviewed
   specifically to remove invented surface.

### 0.1 Phase 0 is already done — do not rebuild it

The scaffold exists and is committed. Present today:

| File | State |
|---|---|
| `src/server.ts`, `src/app.ts` | Bootstrap, graceful shutdown, `trust proxy`, helmet, 1 MB JSON limit |
| `src/config.ts` | Zod-validated env, fails fast on a bad environment |
| `src/lib/errors.ts` | `AppError` + `errorEnvelope` |
| `src/lib/logger.ts` | pino logger |
| `src/middleware/requestId.ts` | Server-minted `X-Request-Id` (inbound id deliberately ignored) |
| `src/middleware/errorHandler.ts` | Envelope for every failure; `413`/`400` body-parser mapping; `INTERNAL` never echoes internals |
| `src/middleware/requireApiEnabled.ts` | Kill-switch layer 1 (`503 API_DISABLED`) |
| `src/routes/health.routes.ts` | `/health` — liveness only, does not touch Postgres |
| `src/types/express.d.ts` | `req.id` typed |
| `prisma/schema.prisma` | Empty, with `directUrl` wired for migrations |
| `tests/helpers/createTestApp.ts`, `tests/integration/{health,errors}.test.ts`, `tests/unit/config.test.ts` | Test scaffold |

`package.json` already pins Node `>=20 <23`, has `typecheck`, `lint`, `test`,
`build`, and `prisma:*` scripts. **`pdfkit` is not installed** — Phase 5 adds it.

### 0.2 The command set (run all four before every PR)

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest run
npx prisma validate    # schema is legal (needs DATABASE_URL set, even a dummy)
```

### 0.3 Definition of done for **every** work item

- [ ] The four commands in §0.2 pass.
- [ ] New behaviour has a test named in the item's **Verification**.
- [ ] No token, activation code, `shareToken`, or password appears in any log line.
- [ ] The PR title starts with the work-item ID, e.g. `P1-06 sequence allocator`.
- [ ] No file under `backend/` is modified (this repo cannot see it, but never copy a
      file back into the monorepo).

### 0.4 One gap found while breaking this down — decide before P2-06

The reviewed plan's rotate grace window (§6.4) says the **old token stays valid for
`EXTERNAL_ROTATE_GRACE_MINUTES` after a successful rotate**. But `ExternalDevice`
(§5.3) has a single `tokenHash String? @unique` column and no field for a previous
token. As written, the grace window cannot be implemented: rotating overwrites the
only hash, so the old token stops being findable the instant it is replaced.

This is a plan gap, not a junior's mistake. Two ways to close it, both confined to
**our own** `external_devices` table (this is not `backend/`, so neither violates
D31):

| Option | How | Cost |
|---|---|---|
| **A — row per token (recommended)** | Rotate inserts a **new** `ExternalDevice` row (new `tokenHash`, copied `deviceName`/`devicePlatform`) and sets the **old** row's `revokedAt = now() + grace`. Both hashes exist, so both tokens resolve until the old row is past its `revokedAt`. | `external_devices` gains a row per rotate; prune old rows in the retention job (P6-02). No schema change. |
| **B — two extra columns** | Add `previousTokenHash` and `previousTokenValidUntil` to `ExternalDevice`; rotate moves the current hash into `previous…` and writes the new one. | One schema change and a migration; no row growth; admin device list stays one row per device. |

**Recommendation: A**, because it needs no schema change and fits §5.3 exactly; the
only cost is row growth that P6-02 already prunes. **P2-06 is blocked until a human
picks A or B.** Do not implement either silently.

Also fix while you are here: a token is revoked when `revokedAt` is **non-null and in
the past**. `revokedAt` in the **future** means "scheduled revoke" (the grace window).
A junior who writes `if (device.revokedAt) reject` will kill the grace window on the
first rotate.

---

## 1. The ten rules that apply to every line you write

These are the ways this project goes wrong. Each one has a test somewhere below.

1. **Never compute tax.** Write `vatRate: 0`, `vatAmount: 0`, `isTaxable: false`,
   `isDeductible: false` explicitly on every write. Never derive a rate. The single
   place a rate is decided is `src/tax-guard.ts` (§8.3 of the plan).
2. **Every query is scoped by `businessId`.** Handlers never import Prisma and never
   read `req.params.accountId`. Both are enforced by an ESLint rule (P3-02).
   Getting this wrong leaks one merchant's data to another — the single red risk.
3. **Dates are UTC.** Build date-only values with `new Date(Date.UTC(y, m, d))`.
   Never `new Date("2026-03-15")`, never `new Date(y, m, d)`. On a UTC+1 host the
   naive version records the previous day.
4. **Money is a decimal string.** Accept `"15000.00"` (coerce a JSON number if one
   arrives); always return a string. Do arithmetic with `Prisma.Decimal`, never with
   `+`/`*` on `number`. Reject shorthand like `"150k"`.
5. **`referenceId` may not match `^WX-`.** That prefix is reserved for sales created
   by `mark-paid`. Reject with `400 INVALID_REFERENCE`.
6. **A wrong account is `404`, never `403`.** `403` confirms the account exists.
7. **Fail closed.** If auth, tenancy or entitlement cannot be proven, reject. Never
   "allow and log".
8. **Never trust the client for a server-owned field.** `source`, `status`,
   `isTaxable`, `vatRate`, `merchantId`, `subscriptionExpiresAt`, `isActive` are set
   by the server. A client sending one gets `400 UNKNOWN_FIELD` (Zod `.strict()`).
9. **Generation (PDF) never runs inside a transaction.** It is CPU work; holding a
   connection open for it starves the pool.
10. **Express 5 forwards a rejected promise from an async handler to the error
    middleware.** Throw `new AppError(status, code, message)`; do not swallow errors
    into a `200`.

---

## 2. Phase map

| Phase | Goal | Items | Gate (do not proceed until green) |
|---|---|---|---|
| 1 | Schema + provisioning | P1-01…P1-10 | 15 tables, idempotent provisioning, safe defaults |
| 2 | Device auth + entitlement | P2-01…P2-10 | one code → one token; `402`/`403`/`/me` behave |
| 3 | **Tenancy gate** | P3-01…P3-05 | **structural scoping + negative matrix green** |
| 4 | Contract + CRUD | P4-01…P4-10 | replay, keyset paging, error catalogue, OpenAPI |
| 5 | Invoices + PDF | P5-01…P5-10 | lifecycle guards, PDF, public link hardened |
| 6 | Sync + capacity | P6-01…P6-06 | deletions, retention jobs, 1,000-account load test |
| 7 | Docs + sandbox + ops | P7-01…P7-04 | integration guide, runbook, restore rehearsed |
| 8 | Admin surface | P8-01…P8-05 | operator can run the platform without SQL |
| 9 | Security + legal | P9-01…P9-04 | pen test, DPIA, DPA, breach runbook |

Phases 1–5 are the pilot (≈96 h). Phase 9 starts in parallel with Phase 4 because
pen-test scheduling and legal review are elapsed time, not dev hours.

---

# PHASE 1 — Schema and provisioning

**Goal:** an empty database becomes fifteen tables, and an operator can create
accounts from a CSV without ever producing an activation code.
**Depends on:** nothing (Phase 0 merged).

### P1-01 — Copy the ten core models into our schema
- **Depends on:** None
- **Files touched:** `prisma/schema.prisma`
- **What to do:** Copy `User`, `Business`, `BusinessMember`, `Customer`,
  `SalesTransaction`, `SaleLineItem`, `Expense`, `Invoice`, `InvoiceLine`, `AuditLog`
  from `backend/prisma/schema.prisma` (lines 12, 93, 954, 400, 192, 268, 242, 431,
  478, 378 as of 2026-11-11) into our schema. Then make **exactly three** kinds of
  edit:
  1. Delete every relation whose target table we do not own, and the FK column that
     carries it. The full list is reviewed plan §5.1 — `Business`'s `taxReports`,
     `taxProfile`, `reminders`, `payments`, `statements`, `settlementPayouts`,
     `walletTransactions`, `credits`, `invitations`, `customerCards`,
     `subscriptionSubmissions`, `feedbacks`, `aiQueryLogs`, `voucherLedgerRequests`,
     `marketplaceProducts`, `marketplaceSlotPurchases`, `marketplaceBoosts`;
     `SalesTransaction.classificationId`/`classification`/`walletTx`/`creditPayment`/
     `creditOrigin`; `Expense.linkedCreditId`/`linkedCredit`; `Customer.credits`/
     `card`/`voucherLedgerRequests`; `User`'s `sessions`/`walletBalance`/
     `walletTransactions`/`subscriptionSubmissions`/`feedbacks`/`aiQueryLogs`/
     `broadcasts`/`userMessages`.
  2. Keep every other column **exactly** as-is: same name, same type, same `@map`,
     same default, including SME-only nullable columns (`paystack*`, `virtualAccount*`,
     `settlement*`, `payout*`, `voucher*`, `split*`).
  3. Do not rename anything.
- **Acceptance criteria:** `npx prisma validate` passes; the file contains exactly
  these ten models plus the enums P1-03 adds; no relation points at a model that does
  not exist in our schema.
- **Verification:** `npx prisma validate`. Then `npx prisma format` and confirm the
  diff contains no column you did not intend.
- **Rollback:** revert the single commit; the schema is additive and no migration
  exists yet.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** every later phase is blocked; there is no database.

### P1-02 — Add the five partner models
- **Depends on:** P1-01
- **Files touched:** `prisma/schema.prisma`
- **What to do:** Paste `Platform`, `ExternalDevice`, `ExternalTombstone`,
  `ExternalSequence`, `ExternalAdmin` **verbatim** from reviewed plan §5.3. Do not
  "improve" them. Note `ExternalSequence.key` is the primary key (a string, not a
  uuid) and `ExternalTombstone` deliberately has **no** foreign key so a tombstone
  outlives a business.
- **Acceptance criteria:** all five models present and byte-identical to §5.3;
  `npx prisma validate` passes.
- **Verification:** `npx prisma validate`; diff the block against §5.3 by eye.
- **Rollback:** revert the commit.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** auth, sync and admin have nowhere to store state.

### P1-03 — Add the two superset enums
- **Depends on:** P1-01
- **Files touched:** `prisma/schema.prisma`
- **What to do:** Define `SalesSource` with **15** members and `ExpenseCategory` with
  **27** members, copied verbatim from reviewed plan §5.7. Also copy
  `TransactionStatus`, `InvoiceStatus`, `InvoicePaymentMethod`, `BusinessRole` and
  `UserRole` unchanged from `backend/prisma/schema.prisma`. Shared members keep their
  exact SME spelling — this is what makes a future merge an enum *extension*, never a
  remap. Do **not** add `crypto`, `direct_debit`, `payment_link`, `cleaning_waste` or
  `packaging`.
- **Acceptance criteria:** `SalesSource` has 15 members including `api`, `card`,
  `mobile_money`, `ussd`, `cheque`, `other`; `ExpenseCategory` has 27 including
  `power`, `statutory_contributions`, `staff_welfare`, `training`, `security`,
  `licenses_permits`.
- **Verification:** count the members in the file against §5.7 (write a tiny test in
  P1-10 that asserts the enum arrays' lengths via `Prisma`).
- **Rollback:** revert the commit.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** a merchant taking a card payment or paying PENCOM has
  no valid value to send — the create is rejected by the database.

### P1-04 — Apply the column-shape and safe-default rules
- **Depends on:** P1-01, P1-02, P1-03
- **Files touched:** `prisma/schema.prisma`
- **What to do:** Make these specific edits, and no others:
  - `User.email` and `User.passwordHash` become **nullable** in our copy (a
    platform-owned account has no login). Keep `@unique` on `email`.
  - `Business`: add `platformId`, `externalCustomerId`, `isActive @default(true)`,
    `subscriptionExpiresAt`, `contactPhone`, `contactEmail`. Add
    `@@unique([platformId, externalCustomerId])`.
  - `Customer`: add `externalId String @map("external_id")` (**NOT NULL**) and
    `@@unique([businessId, externalId])`.
  - `SalesTransaction`: make `referenceId` **NOT NULL**; keep
    `@@unique([businessId, source, referenceId], name: "unique_sales_reference")`.
  - `Expense`: add `externalRef String @map("external_ref")` (**NOT NULL**) with
    `@@unique([businessId, externalRef])`; change `isDeductible` to
    `@default(false)`.
  - `Invoice`: add `externalRef` (**NOT NULL**) + `@@unique([businessId, externalRef])`
    and `shareTokenExpiresAt`; change `vatRate` to `@default(0)`; add
    `onDelete: Restrict` to the `linkedSale` relation.
  - `AuditLog`: add `platformId`, `externalDeviceId String?` (nullable), `actor String`.
  - Add the indexes from reviewed plan §5.2 — in particular
    `@@index([businessId, updatedAt, id])` on `sales_transactions`, `expenses` and
    `invoices`. This index is **not optional**; polling depends on it.
- **Acceptance criteria:** the safe defaults are `@default(0)` for `vat_rate` and
  `@default(false)` for `is_deductible`; `linkedSale` has `onDelete: Restrict`;
  `reference_id`, `external_ref` (expenses and invoices) and `customers.external_id`
  are NOT NULL; the three `[businessId, updatedAt, id]` indexes exist.
- **Verification:** `npx prisma validate`; P1-10's `integration/tax-defaults` test
  proves the two defaults at the database.
- **Rollback:** revert the commit (no migration yet).
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** an omitted write silently produces 7.5% VAT or a
  deductible expense — the exact tax bug this project exists to avoid.

### P1-05 — Create the first migration
- **Depends on:** P1-04
- **Files touched:** `prisma/migrations/**`
- **What to do:** Run `npx prisma migrate dev --name init` against **your own local
  database only**. Never point this at the SME app's database — they are separate
  databases and `DIRECT_URL` must be the external one. Commit the generated migration.
- **Acceptance criteria:** `prisma migrate deploy` on a clean database creates 15
  tables; `_prisma_migrations` has exactly one applied row.
- **Verification:** drop and recreate the local DB, run `npx prisma migrate deploy`,
  then `\dt` shows the fifteen tables.
- **Rollback:** delete the migration folder and the local DB; regenerate.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** no deployable schema.

### P1-06 — Atomic sequence allocator
- **Depends on:** P1-05
- **Files touched:** `src/services/sequence.service.ts`, `src/db/client.ts`
- **What to do:** Implement `nextMerchantId()` → `WOWO0000001` and
  `nextInvoiceNumber(businessId, year)` → `WX-2026-001`. Allocation must be a single
  atomic statement inside the caller's transaction:
  `UPDATE external_sequences SET value = value + 1 WHERE key = $1 RETURNING value`
  via `$queryRaw`, after an upsert that creates the row at 0 if absent. A
  read-then-write pair hands the same number to two concurrent callers. Zero-pad the
  merchant number to 7 digits and the invoice number to 3.
- **Acceptance criteria:** 100 concurrent calls to `nextInvoiceNumber` for the same
  business/year return 100 distinct numbers; the sequence key format matches the plan
  (`merchant`, `invoice:{businessId}:{year}`).
- **Verification:** `tests/unit/sequence.test.ts` — fire 100 concurrent promises,
  assert `new Set(results).size === 100`.
- **Rollback:** revert; nothing consumes the numbers until Phase 4.
- **Effort:** S–M (2 h)
- **Risk if skipped/delayed:** duplicate invoice numbers, which is a financial-
  document integrity failure.

### P1-07 — UTC date helper
- **Depends on:** None (pure function)
- **Files touched:** `src/lib/dates.ts`
- **What to do:** Export `parseDateOnly(value: string): Date` that accepts
  `YYYY-MM-DD`, builds it with `Date.UTC`, and rejects a year `< 2000` or
  `> currentYear + 10` with `AppError(400, 'INVALID_DATE', …)`. Export
  `toDateOnly(date: Date): string` for responses. Every date-only parse in the
  service goes through this file.
- **Acceptance criteria:** a host in UTC+1 parses `"2026-03-15"` to the 15th, never
  the 14th; out-of-range years throw `INVALID_DATE`.
- **Verification:** `tests/unit/dates.test.ts` — assert `toISOString().slice(0,10)`
  round-trips, and the boundary cases `1999-12-31` (reject), `2099-01-01` (reject).
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** every sale and invoice records the wrong day on a
  UTC+ host — a latent, silent, historical-data bug.

### P1-08 — Money helper
- **Depends on:** None
- **Files touched:** `src/lib/money.ts`
- **What to do:** Export `parseMoney(value: unknown): Prisma.Decimal` that accepts a
  decimal string (or a JSON number), rejects negative values, rejects shorthand
  (`"150k"`, `"1,000"`), and normalises to 2 decimal places. Export
  `formatMoney(d: Prisma.Decimal): string` returning a 2-dp string. Never return a
  JS `number`.
- **Acceptance criteria:** `"15000.00"` → Decimal `15000`; `"150k"` → `INVALID_AMOUNT`;
  `-1` → `INVALID_AMOUNT`; a JSON number `15000.5` is accepted and returns `"15000.50"`.
- **Verification:** `tests/unit/money.test.ts` covering the four cases above.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** float rounding corrupts totals; the partner receives
  numbers that do not reconcile.

### P1-09 — Provisioning CLI
- **Depends on:** P1-05, P1-06
- **Files touched:** `src/cli/provision.ts`
- **What to do:** Read a CSV with columns
  `externalCustomerId, businessName, ownerName, phone, email, address, city, state`.
  For each row, in **one transaction**: skip if `(platformId, externalCustomerId)`
  already exists; insert a `User` (platform owner — reuse the one owner row, do not
  create one per account), a `Business` (`merchantId` from P1-06,
  `isActive = true`, `contactPhone`/`contactEmail` from the CSV), a `BusinessMember`
  (`role = owner`), a **dormant** `ExternalDevice` (no code, no token), and an
  `audit_logs` row (`actor = 'cli'`, `action = 'account.provisioned'`). Catch `P2002`,
  re-read, and skip. **The CLI must never emit an activation code.**
- **Acceptance criteria:** running the same 100-row CSV twice yields 100 accounts and
  zero duplicates; each account has one dormant device and no code; the output
  contains no credential.
- **Verification:** `tests/integration/provisioning.test.ts` — 100 rows, run twice,
  assert `count === 100` and no `codeHash` is set.
- **Rollback:** delete the accounts by `platformId` (no external references yet).
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** Phases 2–5 cannot be tested; there is no account to
  authenticate as.

### P1-10 — Phase 1 tests and gate
- **Depends on:** P1-01…P1-09
- **Files touched:** `tests/unit/{sequence,dates,money}.test.ts`,
  `tests/integration/{provisioning,tax-defaults}.test.ts`
- **What to do:** Write the five test files named in the reviewed plan §12 for this
  phase. `integration/tax-defaults` is the important one: insert an `Invoice` and an
  `Expense` **with `vatRate`/`isDeductible` omitted** and assert the stored values are
  `0` and `false`.
- **Acceptance criteria:** all five suites pass; the tax-defaults test fails if you
  change either `@default` back.
- **Verification:** `npm test`.
- **Rollback:** n/a (tests only).
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** the safe defaults are unproven and a later refactor
  can quietly break them.

**Phase 1 gate — all must be true before Phase 2:**
- [ ] `migrate deploy` creates 15 tables; `_prisma_migrations` has one row.
- [ ] 100 accounts provision twice → 100 rows, zero duplicates.
- [ ] No activation code exists in any file the provisioning produced.
- [ ] `integration/tax-defaults` proves `vat_rate = 0` and `is_deductible = false`
      when the field is omitted.

---

# PHASE 2 — Device auth and entitlement

**Goal:** a one-time code becomes exactly one long-lived token, and access stops when
a subscription lapses — without ever deleting data.
**Depends on:** Phase 1 gate.

### P2-01 — Token and code primitives
- **Depends on:** Phase 1
- **Files touched:** `src/lib/token.ts`
- **What to do:** `generateToken()` → 32 random bytes, base64url. `hashToken(t)` →
  `sha256` hex. `verifyToken(raw, storedHash)` using `crypto.timingSafeEqual`.
  `generateActivationCode()` → 10 chars of Crockford base32 (excludes I, L, O, U).
  Never log the raw token or code anywhere.
- **Acceptance criteria:** a generated token hashes to a 64-char hex string and
  verifies; a tampered token fails; codes are 10 chars from the Crockford alphabet.
- **Verification:** `tests/unit/token.test.ts` — generate/hash/verify, tamper,
  alphabet check.
- **Rollback:** revert.
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** auth is impossible; the credential model is the whole
  security boundary.

### P2-02 — Rate limiter (decided now, not later)
- **Depends on:** Phase 1
- **Files touched:** `src/middleware/rateLimit.ts`
- **What to do:** In-memory token bucket keyed by device token (data routes) or by IP
  (activation, public PDF). The effective limit is the configured value **divided by
  `INSTANCE_COUNT`** — document in a comment that it is approximate and per-instance.
  On exhaustion return `429 RATE_LIMITED` with a `Retry-After` header.
- **Acceptance criteria:** the N+1th request inside a minute returns `429` with
  `Retry-After`; `INSTANCE_COUNT=2` halves the per-instance ceiling.
- **Verification:** `tests/unit/rate-limit.test.ts` — exhaust the bucket, assert
  `429` + header; assert the division.
- **Rollback:** revert and mount nothing; the limiter is not yet referenced.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** deferring it means shipping a limit that silently
  multiplies by replica count.

### P2-03 — `authenticateDevice` middleware
- **Depends on:** P2-01
- **Files touched:** `src/middleware/auth.ts`, `src/types/express.d.ts`
- **What to do:** Parse `Authorization: Bearer <token>`, hash it, look up
  `external_devices` by `token_hash`, and reject with `401 TOKEN_INVALID` /
  `TOKEN_EXPIRED` if missing, unknown, revoked, or past `expiresAt`. **"Revoked"
  means `revokedAt` is non-null *and in the past*** — a `revokedAt` in the future is a
  scheduled revoke (the rotate grace window, §0.4), and the token is still valid.
  Attach
  `req.device = { id, businessId, platformId }`. Revocation is checked on **every**
  request, never cached. Throttle `last_seen_at`/`last_seen_ip` writes to at most once
  per 5 minutes per device.
- **Acceptance criteria:** a valid token authenticates; a revoked token → `401`; a
  token past `expiresAt` → `401`; `last_seen_at` does not update twice within 5 min.
- **Verification:** `tests/integration/auth.test.ts` — the revoked and expired cases
  plus the throttle.
- **Rollback:** unmount the middleware.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** nothing can authenticate.

### P2-04 — `resolveAccount` (404, never 403)
- **Depends on:** P2-03
- **Files touched:** `src/middleware/resolveAccount.ts`
- **What to do:** Compare `req.params.accountId` to `req.device.businessId` **once**.
  Mismatch → `404 NOT_FOUND` (never `403`, which would confirm the account exists).
  On success attach `req.account = { id }`. Handlers read `req.account.id` and never
  the raw param — P3-02 enforces this with a lint rule.
- **Acceptance criteria:** a token for account A hitting `/accounts/B/...` gets `404`;
  a matching account proceeds.
- **Verification:** covered by P3-04's matrix; a single case here in
  `tests/integration/auth.test.ts`.
- **Rollback:** unmount.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** cross-tenant reads become possible.

### P2-05 — Kill-switch and entitlement middleware
- **Depends on:** P2-04
- **Files touched:** `src/middleware/{requirePlatformActive,requireAccountActive,requireSubscription}.ts`
- **What to do:** Three middlewares, mounted in this order after `resolveAccount`:
  platform suspended → `403 PLATFORM_SUSPENDED`; account inactive →
  `403 ACCOUNT_INACTIVE`; subscription past → `402 SUBSCRIPTION_EXPIRED` with
  `details: { expiresAt }`. **All three are skipped for `/me`.** `NULL` expiry means
  no expiry. Data is never deleted on expiry.
- **Acceptance criteria:** an expired subscription gets `402` on data routes and `200`
  on `/me`; a suspended account gets `403 ACCOUNT_INACTIVE` on data routes and `200`
  on `/me`.
- **Verification:** `tests/integration/entitlement.test.ts` — platform expiry,
  account expiry, suspension, `/me` exemption, data retained.
- **Rollback:** unmount the three.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** an unpaid platform keeps full access.

### P2-06 — Device service (activate / rotate / revoke)
- **Depends on:** P2-01, P2-03, **and the §0.4 decision (blocked until A or B is picked)**
- **Files touched:** `src/services/device.service.ts`
- **What to do:**
  - `activate(code, deviceName, devicePlatform)`: find the device by `code_hash`;
    reject if unknown, expired (`codeExpiresAt`), or already consumed
    (`tokenHash` set) with `401 CODE_INVALID`. On success set `tokenHash`,
    `activatedAt`, clear `codeHash`, return the raw token once. Audit the attempt.
  - `rotate(currentToken)`: issue a new token and keep the old one valid for
    `EXTERNAL_ROTATE_GRACE_MINUTES` **in one transaction**. Because a device has a
    single `tokenHash`, the old hash must be preserved — implement **option A or B
    from §0.4**, whichever was chosen. The grace window is bounded and single-use.
  - `revoke(deviceId)`: set `revoked_at = now()` directly (this **bypasses** the grace
    window — an operator revoke is immediate).
  - Attempt limiting is **per source IP** (P2-02), not per code; `codeAttempts`
    counts attempts against a row that *was* matched.
- **Acceptance criteria:** a code issues exactly one token; a consumed code fails;
  rotate swaps atomically; the pre-rotate token works inside the grace window and
  fails outside it; an operator revoke is immediate.
- **Verification:** `tests/integration/{auth,rotate-grace}.test.ts`.
- **Rollback:** revert; no devices are activated in production yet.
- **Effort:** L (4 h)
- **Risk if skipped/delayed:** no way in; or a lost rotate response strands devices
  and reintroduces the re-activation treadmill.

### P2-07 — Entitlement service
- **Depends on:** P2-05
- **Files touched:** `src/services/entitlement.service.ts`
- **What to do:** Pure helpers `isPlatformExpired(platform)`,
  `isAccountExpired(business)` reading the two nullable timestamps, plus the
  `details: { expiresAt }` builder. Keep the logic in one place so the middleware
  stays thin.
- **Acceptance criteria:** `null` → not expired; a past date → expired; a future date
  → not expired.
- **Verification:** unit cases inside `tests/integration/entitlement.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** entitlement logic drifts between call sites.

### P2-08 — Auth routes, with `/me` mounted first
- **Depends on:** P2-06, P2-07
- **Files touched:** `src/routes/auth.routes.ts`, `src/app.ts`
- **What to do:** `POST /auth/activate` (public, rate limited by IP), `POST
  /auth/rotate` (device token), `POST /auth/revoke` (device token), `GET /me`.
  **Mount `/me` before `requirePlatformActive`/`requireAccountActive`/
  `requireSubscription`** so a lapsed account can still read its expiry date. `/me`
  returns the account summary and `subscriptionExpiresAt`.
- **Acceptance criteria:** the four routes exist under `/api/external/v1`; `/me`
  answers `200` for an expired subscription.
- **Verification:** `tests/integration/{auth,entitlement}.test.ts`.
- **Rollback:** unmount the router.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** clients cannot authenticate or discover their state.

### P2-09 — `issue-code` CLI
- **Depends on:** P2-06
- **Files touched:** `src/cli/admin.ts`
- **What to do:** `admin.ts issue-code --account <id>` mints one 10-char code, stores
  its hash with `codeExpiresAt = now() + EXTERNAL_CODE_TTL_HOURS`, revokes any
  half-activated device on that account, writes an `audit_logs` row
  (`actor = 'cli'`), and prints the code **once** to stdout. This is also the
  documented lost-response recovery path.
- **Acceptance criteria:** one command mints one code; the code never appears in a
  log; a half-activated device is revoked.
- **Verification:** manual run against local DB; assert one `external_devices` row has
  a `code_hash` and an audit row exists.
- **Rollback:** n/a (operator tool).
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** there is no way to activate a merchant, or to recover
  one who lost the activation response.

### P2-10 — Phase 2 tests and gate
- **Depends on:** P2-01…P2-09
- **Files touched:** `tests/unit/{token,rate-limit}.test.ts`,
  `tests/integration/{auth,entitlement,rotate-grace}.test.ts`
- **What to do:** Complete the five suites. Assert no token or code is ever logged
  (spy on the logger).
- **Acceptance criteria:** all pass; the log-spy assertion is present.
- **Verification:** `npm test`.
- **Rollback:** n/a.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** the credential model is unproven.

**Phase 2 gate:**
- [ ] A code issues exactly one token and cannot be reused.
- [ ] Rotate issues a new token and revokes the old in one transaction.
- [ ] The pre-rotate token works inside the grace window and fails outside it.
- [ ] Token on another account → `404`; revoked/expired → `401`.
- [ ] Subscription expired → `402` on data routes, `200` on `/me`.
- [ ] No token or activation code appears in any log.

---

# PHASE 3 — Tenant isolation gate (HARD GATE)

**Goal:** make it *structurally impossible* for a handler to query outside its
account. This is the only thing between a bug and a cross-tenant breach.
**Depends on:** Phase 2 gate. **Nothing in Phase 4 ships until this phase is green.**

### P3-01 — The single scoped query layer
- **Depends on:** Phase 2
- **Files touched:** `src/db/client.ts`, `src/db/scoped.ts`
- **What to do:** Create the one Prisma client in `src/db/client.ts`. In
  `src/db/scoped.ts` export repository functions whose **first argument is always
  `businessId`**, and which inject it into every `where`. Example shape:
  `findSale(businessId, id)`, `listSales(businessId, filter)`,
  `createSale(businessId, data)`. There is no function that reads or writes a
  tenant-owned row without a `businessId` argument.
- **Acceptance criteria:** every tenant-owned query in the codebase goes through
  `src/db/scoped.ts`; no handler imports the client.
- **Verification:** P3-03's CI assertion.
- **Rollback:** revert; no handlers exist yet.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** the actual attack — a nested route whose `where` omits
  `businessId` — stays possible.

### P3-02 — ESLint ban on direct Prisma use
- **Depends on:** P3-01
- **Files touched:** `eslint.config.js`
- **What to do:** Add `no-restricted-imports` so that importing `@prisma/client` or
  `../db/client` from anywhere except `src/db/**` is an error. This is what stops a
  future handler bypassing the scoped layer by accident.
- **Acceptance criteria:** a deliberately added direct import fails `npm run lint`.
- **Verification:** add one bad import locally, run `npm run lint`, confirm it errors,
  then remove it.
- **Rollback:** revert the config change.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** the scoped layer is a convention, not a guarantee.

### P3-03 — Structural CI assertion
- **Depends on:** P3-01, P3-02
- **Files touched:** `scripts/assert-tenancy.mjs`, `package.json`
- **What to do:** A small Node script that fails if any file under `src/routes/**` or
  `src/services/**` imports `prisma` directly, or reads `body.businessId`, or reads
  `req.params.accountId`. Wire it as `npm run assert:tenancy` and add it to the
  pre-PR command set in §0.2.
- **Acceptance criteria:** the script exits non-zero on a planted violation and zero
  on a clean tree.
- **Verification:** plant each of the three violations in turn; confirm each fails.
- **Rollback:** remove the script and the npm alias.
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** a grep catches `body.businessId` but misses an
  unscoped nested `where` — the real attack. This script is not a substitute for
  P3-01; it is the alarm.

### P3-04 — Per-resource × per-verb negative matrix
- **Depends on:** P3-01
- **Files touched:** `tests/integration/tenancy.test.ts`
- **What to do:** Seed **two** accounts. For every resource (customers, sales,
  expenses, invoices, deletions, PDF) × every verb (list, get, create, update,
  delete, action) use account A's token against account B's ids and assert `404`
  (never `403`). This is the matrix the plan requires — not four tests.
- **Acceptance criteria:** the matrix is complete; every cross-account id returns
  `404`.
- **Verification:** `npm test -- tenancy`.
- **Rollback:** n/a (tests only).
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** a scoping bug ships undetected.

### P3-05 — Phase 3 gate review
- **Depends on:** P3-01…P3-04
- **Files touched:** none
- **What to do:** Run the gate checklist and record the result in the PR description.
- **Acceptance criteria:** all boxes green.
- **Verification:** `npm run lint && npm run assert:tenancy && npm test -- tenancy`.
- **Rollback:** n/a.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** the red risk is unowned.

**Phase 3 gate — do not start Phase 4 until every box is green:**
- [ ] No handler imports `prisma` directly (ESLint + `assert:tenancy`).
- [ ] No handler reads `body.businessId` or `req.params.accountId`.
- [ ] The per-resource × per-verb negative matrix is green.
- [ ] A cross-account id on every nested route returns `404`, never `403`.

---

# PHASE 4 — Contract and CRUD

**Goal:** customers, sales, expenses, account self-service, idempotency, keyset
paging, the full error catalogue, and a generated OpenAPI spec.
**Depends on:** Phase 3 gate.

### P4-01 — Keyset cursor helper
- **Depends on:** Phase 3
- **Files touched:** `src/lib/cursor.ts`
- **What to do:** Encode/decode an opaque base64url `{ updatedAt, id }`. The list
  query orders **ascending `(updatedAt, id)` when `updatedSince` is supplied** (sync)
  and **descending otherwise** (browse). `?limit` default 50, max 200.
- **Acceptance criteria:** a round-trip preserves the pair; a page of 50 rows sharing
  one `updatedAt` returns each exactly once.
- **Verification:** `tests/unit/cursor.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** equal timestamps skip or duplicate rows during sync.

### P4-02 — Idempotency translation
- **Depends on:** Phase 3
- **Files touched:** `src/services/idempotency.ts`
- **What to do:** On a create, look up the row by its idempotency column
  (`sales.referenceId`, `expenses.externalRef`, `invoices.externalRef`). If it exists,
  compare a `sha256` of the **canonicalised** body (sorted keys, money normalised to
  2 dp) stored alongside the row: same hash → `200` with the original row; different
  hash → `409 DUPLICATE_REFERENCE`. Never silently overwrite.
- **Acceptance criteria:** a replayed create returns the original row with `200`; the
  same reference with a different payload → `409`.
- **Verification:** `tests/integration/idempotency.test.ts`.
- **Rollback:** revert.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** a retried create duplicates a sale, and a later
  `mark-paid` links the wrong money.

### P4-03 — Zod validators (`.strict()`)
- **Depends on:** Phase 3
- **Files touched:** `src/validators/{account,customer,sale,expense}.validator.ts`
- **What to do:** One `.strict()` schema per request body (Zod 4: `.strict()` or
  `z.strictObject`). Unknown fields → `400 UNKNOWN_FIELD`. Enforce: `items[].name`
  ≤ 200 chars (the SME column is `VarChar(200)`); `referenceId` may not match `^WX-`
  → `INVALID_REFERENCE`; money fields go through P1-08; dates through P1-07.
- **Acceptance criteria:** sending `vatRate` or `businessId` → `400 UNKNOWN_FIELD`; an
  over-long item name → `400` (not a database error).
- **Verification:** covered by the integration tests in P4-10.
- **Rollback:** revert.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** the client can set server-owned fields, including a
  tax rate.

### P4-04 — Customers
- **Depends on:** P4-01, P4-02, P4-03
- **Files touched:** `src/services/customer.service.ts`,
  `src/routes/customers.routes.ts`
- **What to do:** List (`?updatedSince ?cursor ?limit`), create, get by id, get by
  `externalId`, patch, delete. `externalId` is **immutable** after create. Delete is
  soft: `isActive = false` + a tombstone; the `(businessId, externalId)` pair stays
  reserved. Re-creating a deleted `externalId` returns `200` with the reactivated row.
- **Acceptance criteria:** every operation is scoped; a delete writes a tombstone; a
  re-create reactivates rather than duplicating.
- **Verification:** `tests/integration/tenancy.test.ts` covers the verbs; add the
  soft-delete cases to `tests/integration/sync.test.ts`.
- **Rollback:** unmount the router.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** invoices and sales cannot reference a customer.

### P4-05 — Sales
- **Depends on:** P4-01, P4-02, P4-03
- **Files touched:** `src/services/sale.service.ts`, `src/routes/sales.routes.ts`,
  `src/tax-guard.ts`
- **What to do:** List, create, get, put, delete. On create set
  `source = 'api'`, `status = 'confirmed'`, `isTaxable = false`. Compute
  `lineTotal = quantity × unitPrice`; if `amount` disagrees with the sum of lines →
  `400 AMOUNT_MISMATCH` (do not pick one silently). **Refuse `DELETE` on a sale that
  is invoice-linked** → `409 SALE_LINKED_TO_INVOICE`. Touching child rows must move
  the parent's `updatedAt`.
- **Acceptance criteria:** every sale has `source='api'` and `isTaxable=false`; an
  amount mismatch → `400`; a linked sale cannot be deleted; editing items moves
  `updatedAt`.
- **Verification:** `tests/integration/{sales-delete,sync,reference-namespace}.test.ts`.
- **Rollback:** unmount the router.
- **Effort:** L (4–5 h)
- **Risk if skipped/delayed:** the core product surface is missing.

### P4-06 — Expenses
- **Depends on:** P4-01, P4-02, P4-03
- **Files touched:** `src/services/expense.service.ts`,
  `src/routes/expenses.routes.ts`
- **What to do:** List, create, get, put, delete. `category` optional, default
  `other`. **Always set `isDeductible = false`** (the database default is already
  false; still write it explicitly). `receiptUrl` is optional and nullable — a create
  with no receipt must succeed.
- **Acceptance criteria:** every expense has `isDeductible = false`; a create with and
  without `receiptUrl` both succeed.
- **Verification:** `tests/integration/expense-receipt.test.ts`.
- **Rollback:** unmount the router.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** expenses silently become tax deductions.

### P4-07 — Account self-service
- **Depends on:** P4-03
- **Files touched:** `src/routes/accounts.routes.ts`,
  `src/services/account.service.ts`
- **What to do:** `GET /accounts/:accountId` and `PATCH /accounts/:accountId`.
  Merchant-editable: `businessName`, `ownerName`, `businessType`, `address`, `city`,
  `state`, `contactPhone`, `contactEmail`. Never editable: `merchantId`, `taxId`,
  `subscriptionExpiresAt`, `isActive`, `platformId`, `externalCustomerId` — sending
  any is `400 UNKNOWN_FIELD`, not a silent ignore.
- **Acceptance criteria:** a merchant can edit the allowed fields; each read-only
  field → `400`.
- **Verification:** `tests/integration/account-profile.test.ts`.
- **Rollback:** unmount.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** a merchant must ask an operator to fix a typo, and a
  client could believe it extended its own subscription.

### P4-08 — Tombstones on delete
- **Depends on:** P4-04, P4-05, P4-06
- **Files touched:** `src/services/sync.service.ts`
- **What to do:** Every hard or soft delete writes an `external_tombstones` row
  (`entityType`, `entityId`) in the same transaction. The tombstone has no FK so it
  outlives the business. The `/deletions` endpoint itself is P6-01.
- **Acceptance criteria:** deleting a sale/expense/customer leaves exactly one
  tombstone.
- **Verification:** asserted in `tests/integration/sync.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** a polling client never learns a row was deleted.

### P4-09 — OpenAPI from the validators
- **Depends on:** P4-03, P4-04, P4-05, P4-06
- **Files touched:** `src/openapi.ts`, `src/routes/docs.routes.ts`
- **What to do:** Generate the spec from the Zod validators (zod-to-openapi or
  equivalent) and serve it at `/openapi.json` plus a `/docs` HTML page. Expose the 27
  `ExpenseCategory` and 15 `SalesSource` members as enums. Document the ordering rule
  and the at-least-once sync guarantee.
- **Acceptance criteria:** `/openapi.json` validates; every route in §7.3 that exists
  is present.
- **Verification:** add a test that the spec parses and contains every mounted route.
- **Rollback:** unmount the docs routes.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** Wowo integrates against prose, not a contract.

### P4-10 — Phase 4 tests and gate
- **Depends on:** P4-01…P4-09
- **Files touched:** `tests/integration/{idempotency,sales-delete,reference-namespace,account-profile,expense-receipt,sync}.test.ts`
- **What to do:** Complete the six suites. `reference-namespace` must prove a
  near-collision (`WX-` prefix) is rejected and that a later `mark-paid` links the
  *right* sale.
- **Acceptance criteria:** all pass.
- **Verification:** `npm test`.
- **Rollback:** n/a.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** replay and paging correctness are unproven.

**Phase 4 gate:**
- [ ] Replayed create returns the original row.
- [ ] A page of equal-`updatedAt` rows returns each exactly once.
- [ ] Editing line items moves the parent's `updatedAt`.
- [ ] Customer edits appear in `?updatedSince`.
- [ ] Every external expense has `isDeductible = false`; `receiptUrl` may be null.
- [ ] A client `referenceId` matching `^WX-` → `400 INVALID_REFERENCE`.
- [ ] A merchant can `PATCH` their own business name and address; every read-only
      field → `400`.
- [ ] OpenAPI validates every route.

---

# PHASE 5 — Invoices and the PDF

**Goal:** the invoice state machine with its guards, plus the one commercial-invoice
PDF and its hardened public capability link.
**Depends on:** Phase 4 gate.

### P5-01 — Invoice validators and create
- **Depends on:** Phase 4
- **Files touched:** `src/validators/invoice.validator.ts`,
  `src/services/invoice.service.ts`
- **What to do:** Create accepts `externalRef`, `customerName`, `issueDate`,
  `dueDate`, `lines` (≥1), optional `discount`, `currency`, `notes`, `paymentTerms`.
  Reject `vatRate` if sent (`400 UNKNOWN_FIELD`). Compute
  `subtotal = Σ(qty × unitPrice)`, `total = subtotal − discount`, `vatRate = 0`,
  `vatAmount = 0`. `currency` must be `NGN` in v1. Mint the invoice number via P1-06.
- **Acceptance criteria:** every invoice has `vatRate = 0`, `vatAmount = 0`,
  `total = subtotal − discount`; a `vatRate` in the body → `400`.
- **Verification:** `tests/integration/invoice-lifecycle.test.ts`.
- **Rollback:** unmount.
- **Effort:** L (4 h)
- **Risk if skipped/delayed:** invoices cannot be created.

### P5-02 — The discount bound
- **Depends on:** P5-01
- **Files touched:** `src/services/invoice.service.ts`
- **What to do:** If `discount > subtotal` → `400 INVALID_DISCOUNT`. Do **not** clamp
  to zero (the SME app clamps for a UI form; an API must reject). `total` is always
  `≥ 0` by rejection, not by clamping.
- **Acceptance criteria:** `discount > subtotal` → `400`; `total` is never negative.
- **Verification:** `tests/integration/discount-bound.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** a silently clamped or negative total is a
  data-integrity bug the client never learns about.

### P5-03 — `PUT` is draft-only
- **Depends on:** P5-01
- **Files touched:** `src/services/invoice.service.ts`,
  `src/routes/invoices.routes.ts`
- **What to do:** `PUT` allowed only from `draft`; otherwise
  `409 INVOICE_NOT_EDITABLE`. Replace lines in the same transaction and touch the
  parent's `updatedAt`.
- **Acceptance criteria:** editing a `sent`/`paid` invoice → `409`.
- **Verification:** `tests/integration/invoice-lifecycle.test.ts`.
- **Rollback:** revert.
- **Effort:** S–M (2 h)
- **Risk if skipped/delayed:** revenue diverges from the sent document.

### P5-04 — `issue`
- **Depends on:** P5-01
- **Files touched:** `src/services/invoice.service.ts`
- **What to do:** `draft → sent`, set `sentAt = now()`. Fires nothing — no email, no
  reminder. Already sent → `200` (idempotent).
- **Acceptance criteria:** issue twice → `200`, one state change.
- **Verification:** `tests/integration/invoice-lifecycle.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** `mark-paid` (which needs `sent`) is unreachable.

### P5-05 — `mark-paid` and the linked sale
- **Depends on:** P5-04, P4-05
- **Files touched:** `src/services/invoice.service.ts`
- **What to do:** Only from `sent`/`overdue`; otherwise `409 INVOICE_NOT_SENT`. Create
  the linked sale **in the same transaction** with: `amount = invoice.total`,
  `source = 'api'`, `status = 'confirmed'`, `isTaxable = false`,
  `referenceId = invoiceNumber`, `transactionDate = paymentDate` (UTC),
  `metadata = { invoiceId, invoiceNumber, paymentMethod, subtotal, vatAmount,
  discount }`. Set `paidAt`, `paymentMethod`, `linkedSaleId`. `paymentDate` defaults
  to today and must satisfy `issueDate ≤ paymentDate ≤ today`. Already paid → `200`.
  Two concurrent calls: one wins on `linkedSaleId @unique`, the loser gets `P2002`
  → re-read → `200`.
- **Acceptance criteria:** paying twice yields one sale; a draft → `409`; a future
  payment date → `400`; the sale's `referenceId` is the invoice number.
- **Verification:** `tests/integration/invoice-lifecycle.test.ts`.
- **Rollback:** revert.
- **Effort:** L (4 h)
- **Risk if skipped/delayed:** the invoice→revenue link is missing or double-counted.

### P5-06 — `cancel` and `delete`
- **Depends on:** P5-04
- **Files touched:** `src/services/invoice.service.ts`
- **What to do:** `cancel` refused from `paid` (`409 INVOICE_PAID`); already cancelled
  → `200`. `delete` only from `draft` (`409 INVOICE_NOT_DELETABLE`); hard delete +
  tombstone in one transaction.
- **Acceptance criteria:** the four guards behave exactly as above.
- **Verification:** `tests/integration/invoice-lifecycle.test.ts`.
- **Rollback:** revert.
- **Effort:** S–M (2 h)
- **Risk if skipped/delayed:** a paid invoice can be erased.

### P5-07 — Sale-delete guard
- **Depends on:** P5-05
- **Files touched:** `src/services/sale.service.ts`
- **What to do:** `DELETE` on a sale whose `id` equals any `invoice.linkedSaleId` →
  `409 SALE_LINKED_TO_INVOICE`. The `onDelete: Restrict` from P1-04 is the database
  backstop; do not add a second guard that hides a bug.
- **Acceptance criteria:** a linked sale cannot be deleted; an unlinked one is
  tombstoned.
- **Verification:** `tests/integration/sales-delete.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** paid revenue can be silently unlinked.

### P5-08 — The commercial-invoice PDF
- **Depends on:** P5-05
- **Files touched:** `src/pdf/commercial-invoice.pdf.ts`, `src/pdf/pdf-common.ts`,
  `package.json`
- **What to do:** Add `pdfkit` (not installed yet). Render one PDF with base-14
  Helvetica, A4, 40 pt margins, a continuation page past 12 lines. Title is exactly
  `COMMERCIAL INVOICE`. **No VAT line at all** — do not print "VAT: ₦0". Amounts come
  from the stored row, never recomputed. No QR, no signature, no "verified" language.
  Footer verbatim (reviewed plan §8.4). Generation runs **outside any transaction**.
- **Acceptance criteria:** title is `COMMERCIAL INVOICE`; no VAT row; disclaimer is
  verbatim; a cancelled invoice → `410 INVOICE_CANCELLED`; a deleted one → `404`.
- **Verification:** `tests/integration/pdf.test.ts` — assert the text content of the
  generated buffer.
- **Rollback:** unmount the PDF route.
- **Effort:** L (4–5 h)
- **Risk if skipped/delayed:** the partner has no document to deliver.

### P5-09 — PDF route, capability link, and public route
- **Depends on:** P5-08
- **Files touched:** `src/routes/invoices.routes.ts`,
  `src/routes/public.routes.ts`
- **What to do:** `GET …/invoices/:id/pdf` (device token) and
  `GET /public/invoices/:shareToken/pdf` (no credential). Headers on **both**:
  `Content-Type: application/pdf`, `Content-Disposition: attachment;
  filename="WX-2026-001.pdf"` (support `?disposition=inline`),
  `Cache-Control: private, max-age=60`, `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex, nofollow, noarchive`. `pdf-link` mints a 32-byte
  `shareToken` with `shareTokenExpiresAt = now() + EXTERNAL_SHARE_TOKEN_TTL_DAYS`
  (default 30); calling it again **replaces** the token and kills the old one.
  Public route: rate limited per IP **and** per token; the `shareToken` is
  **redacted** from access logs. Expired or never-existed → `404` (indistinguishable).
- **Acceptance criteria:** the public link works with no credential; an expired token
  → `404`; regenerating kills the old token; both routes carry the headers; both
  limits fire.
- **Verification:** `tests/integration/public-pdf.test.ts`.
- **Rollback:** unmount the public route.
- **Effort:** L (4 h)
- **Risk if skipped/delayed:** either the link is unusable or it is an unhardened
  bearer credential in a query string.

### P5-10 — Phase 5 tests and gate
- **Depends on:** P5-01…P5-09
- **Files touched:** `tests/integration/{invoice-lifecycle,pdf,public-pdf,discount-bound}.test.ts`
- **What to do:** Complete the four suites, including the three PDF tests (no VAT
  line, disclaimer present, title not a tax invoice).
- **Acceptance criteria:** all pass.
- **Verification:** `npm test`.
- **Rollback:** n/a.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** the lifecycle guards and the document are unproven.

**Phase 5 gate:**
- [ ] `mark-paid` on a draft → `409`; twice → one sale; future date → `400`.
- [ ] Every invoice has `vatRate = 0`, `vatAmount = 0`, `total = subtotal − discount`.
- [ ] Every sale has `isTaxable = false`, `source = 'api'`.
- [ ] PDF title is `COMMERCIAL INVOICE`, no VAT line, disclaimer verbatim.
- [ ] `pdf-link` works with no credential; expired → `404`; cancelled → `410`.
- [ ] Both PDF routes send `X-Robots-Tag` and `Referrer-Policy`; the public route is
      rate limited per IP and per token.
- [ ] Regenerating a `pdf-link` invalidates the previous token immediately.

---

# PHASE 6 — Sync, capacity and hardening

**Goal:** the polling contract is complete, retention runs on a schedule, and the
service is measured at 1,000 accounts — not claimed at 100,000.
**Depends on:** Phase 5 gate.

### P6-01 — `/deletions`
- **Depends on:** P4-08
- **Files touched:** `src/routes/deletions.routes.ts`,
  `src/services/sync.service.ts`
- **What to do:** `GET /accounts/:accountId/deletions?since&cursor&limit` over
  `external_tombstones`, keyset `(createdAt, id)`, scoped by `businessId`.
- **Acceptance criteria:** deleted rows appear once; paging is stable.
- **Verification:** `tests/integration/sync.test.ts`.
- **Rollback:** unmount.
- **Effort:** S–M (2 h)
- **Risk if skipped/delayed:** clients never learn about deletions.

### P6-02 — Retention jobs
- **Depends on:** P6-01
- **Files touched:** `src/jobs/retention.job.ts`, `src/server.ts`
- **What to do:** A scheduled job deleting tombstones older than
  `EXTERNAL_TOMBSTONE_RETENTION_DAYS` (180) and audit logs older than
  `EXTERNAL_AUDIT_RETENTION_DAYS` (730). Run on an interval from the process (no
  external cron needed at pilot scale). Log counts only.
- **Acceptance criteria:** a row past the window is deleted; one inside it is not.
- **Verification:** unit test with an injected clock.
- **Rollback:** disable the scheduler.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** `audit_logs` grows fastest and is worth the least per
  row.

### P6-03 — `EXPLAIN` the change query
- **Depends on:** P4-01, P6-01
- **Files touched:** `tests/integration/explain.test.ts`
- **What to do:** Assert that the `updatedSince` query uses the
  `(business_id, updated_at, id)` index and does not seq-scan at a realistic row
  count. Seed enough rows for the planner to prefer the index.
- **Acceptance criteria:** the plan shows an index scan on the composite index.
- **Verification:** the test asserts on `EXPLAIN (FORMAT JSON)` output.
- **Rollback:** n/a.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** polling degrades silently as the table grows.

### P6-04 — Autovacuum tuning migration
- **Depends on:** P1-05
- **Files touched:** `prisma/migrations/**`
- **What to do:** A migration setting per-table autovacuum thresholds for
  `sales_transactions`, `audit_logs` and `external_devices` (reviewed plan §14.1
  requires this on day one). Raw SQL is acceptable in a Prisma migration.
- **Acceptance criteria:** the settings are present on the three tables.
- **Verification:** query `pg_class` / `pg_class.reloptions` after `migrate deploy`.
- **Rollback:** a migration that resets the options.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** bloat accumulates at the projected write rate.

### P6-05 — Load test at 1,000 accounts
- **Depends on:** Phase 5
- **Files touched:** `tests/load/**` (script, not part of `npm test`)
- **What to do:** Seed 1,000 accounts and drive the hot paths. Targets: p95 < 300 ms
  single-record read/write, p95 < 800 ms for a 50-row list page, error rate < 0.1%.
  Extrapolate — never claim 100k from 50.
- **Acceptance criteria:** targets met or a written explanation of what failed.
- **Verification:** run the script against staging; attach results to the PR.
- **Rollback:** n/a.
- **Effort:** L (4–6 h)
- **Risk if skipped/delayed:** scale is an assertion with no evidence.

### P6-06 — Partitioning decision record
- **Depends on:** P6-05
- **Files touched:** `docs/partitioning-decision.md`
- **What to do:** Write down the triggers from §14.1 (any table > 10 M rows → monthly
  range partitioning; `audit_logs` partition from the start) and the measured numbers
  from P6-05. This is a decision record, not code.
- **Acceptance criteria:** the document states the trigger volume and the action.
- **Verification:** reviewed in the PR.
- **Rollback:** n/a.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** the thresholds are rediscovered under load.

**Phase 6 gate:**
- [ ] `/deletions` returns deleted rows once.
- [ ] Tombstone and audit retention jobs run on a schedule, not by hand.
- [ ] The `updatedSince` query stays on the composite index under `EXPLAIN`.
- [ ] Load test at 1,000 accounts meets the targets (or is explained).
- [ ] Partitioning decision recorded with the trigger volume.

---

# PHASE 7 — Docs, sandbox and operations

**Goal:** Wowo can integrate without asking us, and we can restore our database.
**Depends on:** Phase 5 gate (can run alongside Phase 6).

### P7-01 — Integration guide
- **Depends on:** Phase 5
- **Files touched:** `docs/integration-guide.md` (in the service repo)
- **What to do:** Activation, rotation, the full error catalogue, the at-least-once
  upsert contract, the `^WX-` reservation, pagination and ordering, and the
  "no tax" statement.
- **Acceptance criteria:** a developer who has never seen the service can integrate
  from this document plus `/openapi.json`.
- **Verification:** peer review.
- **Rollback:** n/a.
- **Effort:** M (3–4 h)
- **Risk if skipped/delayed:** every question becomes a support ticket.

### P7-02 — Sandbox tenant on staging
- **Depends on:** Phase 5
- **Files touched:** operations only (no code)
- **What to do:** A provisioned sandbox account on staging with a test token, kept
  separate from any pilot data.
- **Acceptance criteria:** Wowo can call staging end-to-end.
- **Verification:** one successful end-to-end run against staging.
- **Rollback:** revoke the sandbox token.
- **Effort:** S (1–2 h)
- **Risk if skipped/delayed:** Wowo's first integration happens in production.

### P7-03 — Runbook and alerts
- **Depends on:** Phase 6
- **Files touched:** `docs/runbook.md`, alert config
- **What to do:** Alert on 5xx > 1% over 5 min; document the three kill switches, how
  to issue a code, how to extend a subscription, and how to rotate an admin token.
- **Acceptance criteria:** each incident has a named first action.
- **Verification:** walk one incident scenario through the runbook.
- **Rollback:** n/a.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** an incident is improvised.

### P7-04 — Backup and a rehearsed restore
- **Depends on:** Phase 6
- **Files touched:** operations only
- **What to do:** Our database gets its own backup schedule (separate from the SME
  app) **and a restore is rehearsed**. A backup nobody has restored from is a
  hypothesis.
- **Acceptance criteria:** a restore from the latest backup succeeds into a scratch
  database.
- **Verification:** the rehearsal is recorded with a date.
- **Rollback:** n/a.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** there is no proven recovery path for partner financial
  data.

**Phase 7 gate:**
- [ ] Integration guide published; `/openapi.json` current.
- [ ] Sandbox tenant works on staging.
- [ ] Runbook names a first action per incident; 5xx alert wired.
- [ ] Our database has its own backup schedule **and a restore has been rehearsed**.

---

# PHASE 8 — Admin surface (built last)

**Goal:** the operator can see how Wowo is using the API and act on it without SQL.
**Depends on:** Phases 5 and 7.

### P8-01 — Seed the first admin token
- **Depends on:** Phase 1
- **Files touched:** `src/cli/admin.ts`
- **What to do:** `admin.ts seed-admin --name <n> [--expires <date>] [--ips <list>]`
  generates a 32-byte token, stores `sha256` in `external_admins`, prints it once.
- **Acceptance criteria:** one command creates one admin; the token is never logged.
- **Verification:** manual run; assert one `external_admins` row.
- **Rollback:** delete the row.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** the admin surface has no credential.

### P8-02 — Admin auth middleware
- **Depends on:** P8-01
- **Files touched:** `src/middleware/adminAuth.ts`
- **What to do:** Bearer admin token → look up `external_admins` by `token_hash`;
  reject if revoked, past `expiresAt`, or the caller IP is outside a non-empty
  `allowedIps`. Update `lastUsedAt`. Never accept a device token here.
- **Acceptance criteria:** expired token → `401`; an IP outside the allowlist →
  `403`; an empty allowlist means off.
- **Verification:** `tests/integration/admin.test.ts`.
- **Rollback:** unmount.
- **Effort:** M (2–3 h)
- **Risk if skipped/delayed:** a single non-expiring token guards 100k merchants.

### P8-03 — Admin endpoints
- **Depends on:** P8-02
- **Files touched:** `src/routes/admin.routes.ts`
- **What to do:** The endpoints in reviewed plan §7.3 — platform list/edit (fee,
  subscription expiry, suspend/resume), account list/detail/suspend/resume, activation
  code issuance, device list/revoke, audit-log search, usage stats. Read-only stats
  come from the tables; do not add a reporting table.
- **Acceptance criteria:** an operator can see, for any merchant, when they last
  called, how many sales/invoices/expenses they have, their devices, and can suspend,
  extend or re-issue a code — all without touching SQL.
- **Verification:** `tests/integration/admin.test.ts`.
- **Rollback:** unmount the router.
- **Effort:** L (5–6 h)
- **Risk if skipped/delayed:** every operational action needs a developer.

### P8-04 — Admin usage warning
- **Depends on:** P8-03
- **Files touched:** `src/services/admin.service.ts`
- **What to do:** `GET /admin/usage` surfaces a warning when an admin token has no
  expiry, so a long-lived credential is visible rather than silent.
- **Acceptance criteria:** a non-expiring token is flagged in the response.
- **Verification:** `tests/integration/admin.test.ts`.
- **Rollback:** revert.
- **Effort:** S (1 h)
- **Risk if skipped/delayed:** the largest credential in the system is invisible.

### P8-05 — Phase 8 gate
- **Depends on:** P8-01…P8-04
- **Files touched:** none
- **What to do:** Run the checklist.
- **Acceptance criteria:** all green.
- **Verification:** `npm test -- admin`.
- **Rollback:** n/a.
- **Effort:** S (30 min)
- **Risk if skipped/delayed:** the surface ships unproven.

**Phase 8 gate:**
- [ ] Admin can view usage, suspend, extend a subscription, and re-issue a code.
- [ ] Admin tokens support expiry and an IP allowlist.
- [ ] A device token is rejected on `/admin/*`.

---

# PHASE 9 — Security and legal gate

**Goal:** the pilot can onboard past a handful of merchants.
**Depends on:** Phase 4 (start here in parallel; complete before onboarding beyond the
pilot). **Elapsed time, not dev hours** — these slip launch dates, so start early.

### P9-01 — External penetration test
- **Depends on:** Phase 5
- **Files touched:** none (vendor engagement)
- **What to do:** Scope to the tenancy boundary, the activation flow, the public PDF
  route and the admin surface.
- **Acceptance criteria:** report received; findings triaged; blocking findings fixed.
- **Verification:** remediation PRs referenced from the report.
- **Rollback:** n/a.
- **Effort:** L (elapsed)
- **Risk if skipped/delayed:** shipping financial data with no independent review.

### P9-02 — DPIA and DPA
- **Depends on:** Phase 4
- **Files touched:** `docs/dpia.md`, `docs/dpa.md`
- **What to do:** DPIA filed; DPA signed with Wowo as **controller** and us as
  **processor**.
- **Acceptance criteria:** both documents exist and are signed/filed.
- **Verification:** legal sign-off recorded.
- **Rollback:** n/a.
- **Effort:** M (elapsed)
- **Risk if skipped/delayed:** NDPA non-compliance.

### P9-03 — Breach-notification runbook
- **Depends on:** P9-02
- **Files touched:** `docs/breach-runbook.md`
- **What to do:** Meet NDPA's 72-hour obligation: name the contact, the exact
  categories of data we hold, and the notification path.
- **Acceptance criteria:** the runbook names a person and a 72-hour path.
- **Verification:** walk one tabletop scenario.
- **Rollback:** n/a.
- **Effort:** S (elapsed)
- **Risk if skipped/delayed:** a breach is handled ad hoc.

### P9-04 — Data-subject export and erasure path
- **Depends on:** P8-03
- **Files touched:** `src/cli/export.ts`, `docs/data-subject-requests.md`
- **What to do:** Export and erasure for a merchant, plus the documented answer to
  "delete my account" — which is **not** a hard delete of financial records.
- **Acceptance criteria:** an export produces a complete record; an erasure follows the
  documented (non-destructive) path.
- **Verification:** run an export against a seeded account.
- **Rollback:** n/a.
- **Effort:** M (3 h)
- **Risk if skipped/delayed:** no lawful answer to a data-subject request.

**Phase 9 gate:**
- [ ] Penetration test complete and blocking findings remediated.
- [ ] DPA signed, DPIA filed.
- [ ] Breach runbook names a contact and a 72-hour path.
- [ ] Export and erasure path documented and exercised.

---

## 3. Critical path and what blocks what

```text
P1 (schema) ──► P2 (auth) ──► P3 (tenancy GATE) ──► P4 (CRUD)
                                                      │
                                                      ├──► P5 (invoices/PDF) ──► P6 (sync/capacity)
                                                      │                         │
                                                      └──► P9 (legal, parallel)  ├──► P7 (docs/ops)
                                                                                 └──► P8 (admin)
```

- **P3 is a hard stop.** Nothing from P4 is merged before the Phase 3 gate is green.
- **P9 starts at P4** and finishes before onboarding beyond the pilot. It is elapsed
  time — book the pen test and legal review the day P4 starts.
- **P8 is last** by decision (D34): the admin surface is needed to *operate* the pilot,
  not to build it.

## 4. When you are blocked

Stop and ask. Do not guess. The reviewed plan §15 lists the open questions; these
specific items are blocked until a human answers:

| Blocked item | Open question (plan §15) |
|---|---|
| P2-05, P2-07 | #1 Billing unit — platform-level for the pilot unless told otherwise |
| **P2-06** | **§0.4 — rotate grace storage: option A (row per token) or B (two columns)** |
| P2-09 | #2 Who at Wowo delivers activation codes, and through which channel |
| P4-10 | #4 Pilot size |
| P6-05, P6-06 | #6 Transaction volume per account per month — **the most important missing number** |
| P8-01, P8-02 | #8 Admin token policy |
| P9-01, P9-02 | #9, #10 Pen test firm and DPA status |
| P1-03 | #7 Rename `tax_permit`? Default: keep as-is for now |

## 5. The definition of done for the pilot

One green end-to-end test:

> provision → issue code → activate → create customer → create sale → create invoice
> → issue → mark-paid → replay → render PDF → confirm one sale and one invoice in the
> database, confirm every expense has `isDeductible = false` and every invoice
> `vatRate = 0`, and confirm the SME app's database was never touched.

Write that test as `tests/integration/pilot-e2e.test.ts` in Phase 5. It is the single
acceptance criterion that matters most.
