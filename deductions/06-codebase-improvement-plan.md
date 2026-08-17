# Codebase Improvement Plan — Backend First

> **Status:** Proposed · **Date:** 2026-08-11 · **Governed by:** `rules.md`, `rules.txt`
> **Approach:** Backend first (this document), then frontend (Part B — written next, per owner).
> Every phase is independently shippable, app-safe, and verified before moving on.

---

## 0. Method (what this plan is based on)

Full-stack scan performed 2026-08-11: every service/controller/route, the schema,
middleware, config, cron, webhook path, tests, CI, and both rules files. Where a
hypothesis about a lurking issue was raised, it was **verified in code** before being
included. Verified-good areas are listed in §5 and are **not** to be touched.

Improvement rules applied (from rules.md / rules.txt):
- **Don't break the app.** Each phase lists its blast radius and verification.
- **KISS / YAGNI.** Nothing here builds for hypothetical scale; everything is a real,
  current risk or a documented ceiling with a trigger condition.
- **Incremental.** No big-bang rewrites. Each phase is small, reversible, tested.
- **Update `architecture.md`** in the same change as every phase (rules.md §7).

---

## 1. Findings — what's actually lurking (verified)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | 🔴 Security | **Auth rate limiter is effectively off**: `max: 5000`/15min **and** `skipSuccessfulRequests: true`. CLAUDE.md says 5, comment says 50, code says 5000 — three different claims, one broken protection. ~5,000 free password guesses per IP per window. | `middleware/security.ts:104-115` |
| F2 | 🔴 Security | **Test routes are unauthenticated in any non-prod deploy**: `GET /test/businesses-with-dva` leaks every business's DVA account number + owner email; `POST /test/simulate-transfer` fabricates a sale into *any* businessId. Router mount guard is `NODE_ENV !== 'production'` — so every staging/preview deploy is exposed. | `routes/test.routes.ts` (all 3 routes), `routes/index.ts:87-89` |
| F3 | 🟠 Type safety | **19 `any` drift points** in services/controllers: `where: any` query builders (7 services), DVA webhook `event: any` handlers (3), `sanitizeUser(user: any)`, `(req as any).rawBody`, `result as any` (Paystack responses), `invoice: any`. Each one is a future bug wearing a disguise — the compiler stops checking that path. | see §2 B1 table |
| F4 | 🟠 Correctness | **Non-deterministic pagination**: list queries order by `transactionDate`/`issueDate`/`createdAt` with **no secondary sort key**. Rows sharing the same date can flip between pages → duplicate/missing records on page boundaries. | `sales.service.ts:363`, `invoice.service.ts:293`, `expense.service.ts:144`, `payment.service.ts:535`, `admin.service.ts` |
| F5 | 🟠 Gates | **CI runs no tests, no lint, no builds** (only `prisma generate` + migrate + validate). Backend lint is **broken config** (ESLint 9 + legacy `.eslintrc.json`). E2E dashboard test 401s (seed gap). Giant single-file e2e suite (`api.e2e.test.ts`) is hard to maintain. | `.github/workflows/ci.yml`, `backend/package.json:30,84-86` |
| F6 | 🟡 Growth | **Unbounded tables**: `AuditLog` and `PaystackWebhookEvent` grow forever (every webhook is logged). No retention job. AuditLog also lacks the `(action, createdAt)` composite index for admin search. | `schema.prisma` (AuditLog, PaystackWebhookEvent) |
| F7 | 🟡 Hygiene | Stray/dead files: `backend/migration.sql`, `backend/verify-phase0.js`, `backend/tsconfig.tsbuildinfo` (build artifact), root-level one-off scripts (`sampleTest.js`, `seed-classifications-now.js`, `diagnostic-dashboard-test.js`, `.bat` files, etc.). `frontend/tests/e2e/api.e2e.test.js` is a compiled artifact. | root + `backend/` listings |
| F8 | 🟡 Exposure | **Swagger UI mounted in production** (`/api-docs`, `/api-docs.json`) — free API-surface documentation for attackers. | `app.ts:82-89` |
| F9 | 🟡 Docs | **CLAUDE.md drifted**: claims auth limit 5/15min (code: 5000), Sentry not installed (it is — `app.ts:26-33`), "CI gate prevents regressions" (it doesn't). | `CLAUDE.md` vs code |
| F10 | 🟠 Config | **`DATABASE_URL` points at Supabase transaction-mode pooler (`:6543`)**. Prisma advisory locks (reminder cron's `pg_try_advisory_lock`) and `migrate deploy` don't behave reliably across pooled connections — silent failure mode at first multi-instance deploy / first prod migration. | `.env.example:12` (`pooler.supabase.com:6543`), `jobs/reminders.cron.ts` |
| F11 | 🟠 Readability | **God-services**: `invoice.service.ts` 1176 lines, `dva.service.ts` 777, `tax.service.ts` 757, `reminder.service.ts` 639, `payment.service.ts` 567 — hard to navigate, hard to extend (rules.txt's "no god components" spirit, server-side). | `wc -l services/*.ts` |
| F12 | 🟡 Growth | **`Reminder` table is unbounded** — rows are never pruned (dismiss only sets `isSent`). Same retention gap as AuditLog + webhook events. | `schema.prisma` (Reminder); no deleteMany in `reminder.service.ts` |
| F13 | 🟡 Race | **Sequential-ID races**: `merchantId` (`business.service.ts:7-19`) and invoice numbers read `last + 1` then insert — concurrent creates collide → P2002 → user sees 409. DB unique is the safety net; a small retry-on-collision makes signups bulletproof at launch traffic. | `business.service.ts:7-19`, `invoice.service.ts:160` |
| F14 | 🟠 Correctness | **Mixed UTC vs server-local month math**: tax/reminder/lock-checks build months with `Date.UTC(...)`, but 8+ call sites use `new Date(year, month-1, 1)` (server-local): `sales.service.ts:146,295`, `expense.service.ts:132,277`, `statement.service.ts:155`, `sales-import.service.ts:99`, plus `setHours(0,0,0,0)` at `reminder.service.ts:454`, `invoice.service.ts:35`. Identical on a UTC host; diverges by an hour at month boundaries on any non-UTC host → sales/expenses mis-bucketed and lock-check vs summary can disagree. `process.env.TZ` is set nowhere. | see call sites |
| F15 | 🟡 Readability | **Controller envelope style split + boilerplate**: 7 controllers respond `{ success, ...result }` (spread) while the rest use explicit `{ success, data }` — keys end up the same, but the contract is expressed two ways across ~500 lines of copy-paste `parse → service → json` boilerplate. | `payment.controller.ts:31`, `tax.controller.ts:38`, `sales.controller.ts:41,118`, `expense.controller.ts:35`, `reminder.controller.ts:33`, `invoice.controller.ts:36` |
| F16 | 🟡 DRY/doc drift | **`assertMonthNotLocked()` does not exist** — CLAUDE.md documents it as a named helper, but the ~10-line lock check is copy-pasted (with slight variations) in `sales.service.ts:42-53`, `expense.service.ts:34-45`, `invoice.service.ts:512-519`. Drift risk: a variation could check the wrong month and let a locked month be edited. | `CLAUDE.md` vs the three services |
| F17 | 🟠 Money flow | **Paystack `channel` is written straight into the `PaymentMethod` enum**: `paymentMethod: channel \|\| 'card'` (`payment.service.ts:282`) and `(result.channel as any) \|\| 'card'` (`:460`). Real Paystack channels (`bank`, `qr`, `mobile_money`, `eft`, `nuban`, `pos`) are **not** enum members (`wallet\|bank_transfer\|card\|paycode\|ussd`) → Prisma throws inside the completion transaction → webhook 500 → Paystack retries forever → **money collected, report never marked paid**. Same path in `verifyPayment`. Likely already hit in the wild with "Pay with Bank" payments. | `payment.service.ts:282,460`, `schema.prisma` (PaymentMethod) |
| F18 | 🟡 Money integrity | **No amount/currency verification on `charge.success`** (webhook and `verifyPayment`): a successful charge for the reference is trusted as-is; a wrong-amount charge would still flip the report to completed+locked. Classic Paystack/Stripe rule: compare `event.amount/100` + `currency` against `amountPaid` before completing. | `payment.service.ts:250-314,449-495` |
| F19 | 🟡 Config | **No production boot guard for Paystack keys** — required envs are only `DATABASE_URL` + JWT secrets; `PAYSTACK_SECRET_KEY`/`WEBHOOK_SECRET` default to `''` (`config/index.ts:112-114`). A prod deploy with missing Paystack keys boots fine, then every payment initiation + webhook fails at runtime with cryptic errors. Fail fast in prod. | `config/index.ts:112-114` |
| F20 | 🟡 CPU/DoS | **Period statements have no max-span cap** — validator allows `year: 2020–2100`; `downloadPeriodStatement` has only a `from > to` check, then loads **all** reports and renders them synchronously via PDFKit on the request thread (960 rows for an 80-year range). Analytics already caps at 60 months — same rule missing here. | `statement.validator.ts:9-14`, `statement.service.ts:178-200` |
| F21 | 🟡 DRY | **Shared helpers are copy-pasted per service**: `verifyBusinessOwnership` is defined in **9 services** (60+ call sites, minor variations — tax takes an optional `db` param, others don't), and `toNumber` exists in **5 variants** (`lib/format.ts` w/o null-guard, `tax/statement` w/ null-guard, `invoice.pdf` w/ undefined guard, `invoice.service` typed `unknown`). Drift risk exactly like F16: a variant could check the wrong thing. | `grep` — 9 service files; `lib/format.ts:8`, `invoice.service.ts:74`, `invoice.pdf.ts:7`, `statement.service.ts:12`, `tax.service.ts:28` |
| F22 | 🟢 Hygiene | **Dead code hides behind `noUnusedLocals: false`**: `supabaseAdmin` is imported in `statement.service.ts:7` but never used; the Supabase admin client is initialized + logs at boot but nothing uses it (config comment agrees: "currently unused"). Dead imports compile silently today. | `statement.service.ts:7`, `lib/supabase.ts`, `tsconfig.json:17-18` |
| F23 | 🟢 Config | **`PAYMENT_PROVIDER` env is dead config** — `getPaymentProvider()` hardcodes `new PaystackProvider()` and ignores `config.payment.provider`; `'wallx'` is in the union but unimplemented. Setting `PAYMENT_PROVIDER=wallx` silently still uses Paystack (contrast: the remittance transport factory fails loud on unknown names). | `lib/payment/index.ts:4-6`, `config/index.ts:100` |

**Documented ceilings (deferred, NOT this plan's job):** in-memory import cache
(multi-instance → Redis), `ILIKE` search (>100k rows → pg_trgm), offset pagination
(>10k rows → cursor), sync PDF in request path (latency → background queue). All four
are already flagged **in the code itself** with trigger conditions — respect that.

---

## 2. Phase B0 — Security hardening (do first: smallest, highest risk)

*Goal: close the two real holes + the prod API-surface leak. Zero behavior change for users.*

1. **Restore auth rate limiting** — `security.ts`: `max: 5000` → **`30`** per 15 min.
   Keep `skipSuccessfulRequests: true` (successful logins shouldn't count) — the fix is
   the failed-attempt budget. Fix the stale comment ("50 requests… increased for testing").
   Update `CLAUDE.md` claim to match.
2. **Lock the test routes** — add `authenticate` + an `admin`-role check to the `/test`
   router (middleware in `test.routes.ts` or at the `routes/index.ts` mount). Keep the
   existing `NODE_ENV` guards as defense-in-depth, not the only line. `check-classifications`
   also gets the guard + router-level gate.
3. **Gate Swagger** — skip mounting `/api-docs` + `/api-docs.json` when
   `config.app.isProduction` (`app.ts`).
4. **CORS** — leave as-is (no-origin requests are intentionally allowed for API clients;
   prod allowlist + localhost defaults are a documented minor). Not in scope.
5. **Admin surface** — verified: admin panel routes are already gated by
   `authenticate + authorize('admin')` at the router level, and the admin login page rides
   the standard `POST /auth/login` (role checked client-side after) — so B0's limiter covers
   admin login too. Add an e2e assertion that admin routes return 403 for non-admin tokens.
6. **Fix the payment-channel enum crash + amount verification (F17, F18 — money flow)** —
   add `mapPaystackChannel(channel): PaymentMethod` in `lib/payment/paystack.provider.ts`
   (card→card, ussd→ussd, bank/bank_transfer/nuban/eft→bank_transfer, qr/mobile_money/pos→
   wallet or card — decision at implementation; **never write a raw channel into the enum**).
   Use it in both the webhook (`payment.service.ts:282`) and `verifyPayment` (`:460`),
   replacing the `as any` casts. Add the amount check: `event.amount/100 === amountPaid &&
   currency === 'NGN'` before completing — on mismatch, mark the payment `failed` with
   `gatewayResponse: { reason: 'amount_mismatch' }`, `logger.error` + Sentry alert, and leave
   the report unlocked (operator reconciles). Same check in `verifyPayment`. Unit-test all
   channel mappings + the mismatch path (B3).

**Blast radius:** `security.ts` (imports unchanged), `routes/index.ts`, `test.routes.ts`,
`app.ts`. No API contracts change; only non-prod behavior + rate limits.
**Verify:** `npx tsc --noEmit`; manual curl: `/api-docs` 404 in prod-mode, login >30
failed attempts → 429, `/test/*` → 401 without admin token, admin routes → 403 for non-admin.
**Update `architecture.md`** (security section + decisions log).

---

## 3. Phase B1 — Type safety & working lint

*Goal: the compiler stops being silent on 19 paths; lint starts existing again.*
**Follows rules.txt:** no `any`; explicit types; JSDoc on exported functions.

| Location | Current | Target |
|---|---|---|
| `sales.service.ts:132`, `expense.service.ts:120`, `tax.service.ts:167`, `reminder.service.ts:516`, `payment.service.ts:525`, `invoice.service.ts:272`, `admin.service.ts:199` | `const where: any = { businessId }` | `Prisma.XxxWhereInput` (e.g. `Prisma.SalesTransactionWhereInput`), built via a small typed helper if branching is needed |
| `dva.service.ts:325,399,523` | `event: any` webhook params | Shared typed interfaces in `lib/payment/types.ts` (PaystackEvent union) — already the home of payment types |
| `auth.service.ts:26` | `sanitizeUser(user: any)` | `User` (Prisma-generated) with explicit `select` on the query |
| `payment.controller.ts:66` | `(req as any).rawBody` | Express `Request` type augmentation in `types/index.ts` (declare module) |
| `payment.service.ts:460-461,503` | `result as any` (Paystack verify) | Typed verify-response interface in `lib/payment/types.ts` |
| `invoice.service.ts:1036` | `invoice: any` | `InvoiceForPdf` type already exists in `invoice.pdf.ts` — reuse it |
| `transaction-classification.service.ts:16,50` | `catch (error: any)`, `category as any` | `unknown` + narrowing; typed enum mapping |
| `sales.service.ts` / others | — | Add JSDoc to newly typed exports |

2. **Restore backend lint** — migrate `.eslintrc.json` → `eslint.config.mjs` (flat config,
   ESLint 9-native) with `typescript-eslint` recommended. Fix the surfaced errors
   incrementally (they're mostly the `any`s above). Add `npm run lint` to the plan's gate.

### B1b — Service readability: split the god-services (F11)

*Goal: the files that own the most money logic become navigable. Pure code moves — zero
logic changes; tests green after each file. The backend version of rules.txt "no god components."*

1. **`invoice.service.ts` (1176 lines)** → extract delivery/PDF helpers into
   `invoice.delivery.ts` (email + WhatsApp send paths already read as one unit); keep the
   lifecycle (create/update/send/mark-paid/cancel) in the core file.
2. **`payment.service.ts` (567)** → extract webhook event handlers into `payment.webhook.ts`
   (charge.success / charge.refunded / DVA branches); core keeps initiate/verify.
3. **`dva.service.ts` (777)** → extract the three webhook processors into `dva.webhook.ts`.
4. **`reminder.service.ts` (639)** → split creators (`reminder.creators.ts`) from queries.
5. **`tax.service.ts` (757)** → extract analytics (`tax.analytics.service.ts`) once the
   dashboard work from the earlier audit is stable.

One file per commit; `npx tsc --noEmit` + unit tests after each. Controllers re-import from
the new modules — route/controller layer untouched.

**Blast radius:** import paths only; function signatures and behavior unchanged.
**Verify:** `tsc` + existing unit tests green after **each** file move; e2e smoke on
invoice/payment/dva/tax endpoints after the phase.
**Update `architecture.md`** (conventions section).

### B1c — Shared guards, helpers & response consistency (F15, F16, F21)

*Goal: one way to lock a month, one way to verify ownership, one `toNumber`, one way to
answer a request. Mechanical, low-risk.*

1. **Extract `assertMonthNotLocked` (F16)** — create `lib/month-lock.ts` exporting
   `assertMonthNotLocked(db, businessId, transactionDate)` (UTC month bounds, checks
   `isFinalized`/`isLocked` on the report, throws `AppError(409, ...)`). Replace the
   three inline copies in sales/expense/invoice services. Add a unit test: locked month
   → throws; open month → passes; boundary date → correct month. Then **fix the CLAUDE.md
   claim** (it already "documents" this function — after extraction the doc becomes true).
2. **Extract `verifyBusinessOwnership` + consolidate `toNumber` (F21)** — create
   `lib/ownership.ts` with `verifyBusinessOwnership(userId, businessId, db?)` (keep the
   optional-tx variant; drop per-service copies in all 9 services). Consolidate the 5
   `toNumber` variants into one null-safe `toNumber` in `lib/format.ts`
   (`Decimal | number | string | null | undefined → number`); replace all call sites.
   Unit tests: ownership (not-found/403/ok), `toNumber` (Decimal, string, null, undefined).
3. **Response helper (F15)** — add `lib/respond.ts` with a typed `ok(res, data, message?)`
   (and `created(res, ...)` where used). Standardize all controllers on it — the spread
   style (`{ success, ...result }`) becomes explicit `ok(res, result.data, ...)`. Pure
   refactor: response JSON keys unchanged, so the frontend contract is untouched.

**Blast radius:** three service imports + all controller response lines; JSON shapes
unchanged. No API contract change.
**Verify:** `tsc`; full e2e suite (envelope assertions still pass); unit test for the
month-lock helper.
**Update `architecture.md`** (conventions section).

---

## 4. Phase B2 — Config, query robustness & data growth

*Goal: the DB connection is correct at scale; pagination stops glitching; hot tables stay
fast; unbounded tables stop growing.*

0. **DB connection correctness (F10 — do first in this phase)** — `DATABASE_URL` points at
   the Supabase **transaction-mode pooler (`:6543`)**. Prisma advisory locks (reminder cron's
   `pg_try_advisory_lock`) and `migrate deploy` do not behave reliably across pooled
   connections. Fix:
   - Add `directUrl = env("DIRECT_URL")` to the Prisma datasource; `DIRECT_URL` = direct
     5432 connection, used by `prisma migrate deploy`.
   - Keep the pooler URL as `DATABASE_URL` with `pgbouncer=true` and a sensible
     `connection_limit` (match the pooler's max; Prisma 6 supports this natively).
   - Verify the cron's advisory lock holds on a single connection — either the pooler
     keeps it on one session (session mode) or acquire via a dedicated client; add a
     smoke check that two overlapping sweeps don't double-run.
   - Add both URLs to `.env.example` with comments.

0b. **Unify month/date arithmetic (F14 — do with item 0)** — add `lib/dates.ts` with
   `monthStartUtc(year, month)`, `monthEndUtc(year, month)`, `startOfUtcDay(date)`, and
   replace every local-constructed month bound (`sales.service.ts:146,295`,
   `expense.service.ts:132,277`, `statement.service.ts:155`, `sales-import.service.ts:99`,
   `setHours(0,0,0,0)` at `reminder.service.ts:454` + `invoice.service.ts:35`). Belt-and-
   braces: set `process.env.TZ = 'UTC'` at the top of `server.ts` so a non-UTC host can't
   silently change month boundaries. No behavior change on a UTC host; corrects the
   latent divergence everywhere else.

1. **Deterministic pagination** — add `id: 'desc'` (or `asc`) as the tiebreaker
   secondary sort to every list `orderBy`: sales (`transactionDate, id`), invoices
   (`issueDate, id`), expenses (`expenseDate, id`), payments (`createdAt, id`),
   admin users/businesses/audit lists (`createdAt, id`).
2. **AuditLog composite index** — additive migration:
   `@@index([action, createdAt(sort: Desc)])`. Speeds the admin audit-log filter.
3. **Retention job for unbounded tables (F6 + F12)** — extend the existing daily cron
   (`jobs/reminders.cron.ts`, advisory-lock pattern) with a **data-maintenance phase**:
   delete `PaystackWebhookEvent` rows older than 90 days (forensics window),
   `AuditLog` rows older than 365 days (or archive to S3 JSON — decide at implementation),
   and prune `Reminder` rows that are `isSent` and older than 180 days. All thresholds
   configurable via env; log counts per run.
4. **Sequential-ID collision retry (F13)** — wrap `merchantId` and invoice-number
   generation in a small retry-on-P2002 helper (max 3 attempts, exponential backoff,
   then surface the 409). Same helper reused by both call sites; keeps signups and
   invoice creation bulletproof under concurrent load.
5. **Production boot guards (F19)** — in `config/index.ts`, when `NODE_ENV === 'production'`,
   also require `PAYSTACK_SECRET_KEY` + `PAYSTACK_WEBHOOK_SECRET` (and warn — not fail — for
   `RESEND_API_KEY`/`SENTRY_DSN` since email/logging have safe fallbacks). Fail fast on the
   money-critical ones so a misconfigured prod deploy dies at boot, not on the first payment.
6. **Cap period statements (F20)** — add a max span (60 months, mirroring the analytics
   `ANALYTICS_MAX_MONTHS` rule) to `periodStatementSchema` **and** a service-side guard in
   `downloadPeriodStatement` (validator is first line of defense; service owns the invariant).
   Prevents the unbounded sync-PDF generation.
7. **Import cap note** — leave `SALES_IMPORT_ROW_CAP = 100` (documented); raising it is a
   product decision, not a stability fix.

**Blast radius:** additive index + cron phase only; **env change** (new `DIRECT_URL` —
additive, old `DATABASE_URL` still works); no API changes. The cron already has
advisory-lock + `finally`-release discipline to copy.
**Verify:** migration applies on scratch DB; e2e list tests still pass; cron smoke run
(`npm run` one-off via `tsx`) with dry-run logging first; pooler-vs-direct connection
check against a prod-like pool.
**Update `architecture.md`** (data layer, decisions log).

---

## 5. Phase B3 — Tests & CI gates

*Goal: regressions become visible. This is the phase that makes all the others durable.*

1. **Fix the e2e seed gap** — `tests/helpers/test-db.ts`: the dashboard test 401s because
   the seeded test user/business state doesn't satisfy the endpoint's expectations.
   Diagnose + fix so the existing suite runs green locally.
2. **Split `api.e2e.test.ts`** (one giant file) into per-domain files:
   `auth.e2e.test.ts`, `business.e2e.test.ts`, `sales.e2e.test.ts`, `expenses.e2e.test.ts`,
   `tax.e2e.test.ts`, `invoices.e2e.test.ts`, `webhooks.e2e.test.ts` — shared helpers moved
   to `tests/helpers/`. (Match existing jest config; no new tooling.)
3. **Add unit tests for the hardening work**: rate-limit config (exported constants),
   test-route guard behavior, pagination tiebreaker (two rows same date → stable order),
   webhook signature verify (valid/invalid/replay) **plus double-process idempotency**
   (a replayed `charge.success` after the 5-min window must not double-book — tax payment
   + report lock + reminder dedup are all idempotent; assert it), **`mapPaystackChannel`
   for every real Paystack channel** (bank/qr/mobile_money/eft/nuban/pos must map to an
   enum member, never crash) **+ the amount-mismatch path** (charge of wrong amount →
   payment failed + report unlocked + error logged), **the 60-month statement cap** (span
   > 60 months rejected in validator AND service), AuditLog/Reminder retention query
   bounds, and the sequential-ID retry helper (concurrent creates → exactly one winner).
4. **CI gates** (`.github/workflows/ci.yml`): add `npx tsc --noEmit`, `npm run lint`,
   `npm test` (unit), and keep migrations. Frontend gates come with Part B.

**Blast radius:** tests + CI only. No runtime code changes.
**Verify:** `npm test` green; `npx tsc --noEmit` green; CI workflow passes on a branch.
**Update `architecture.md`** (testing section).

---

## 6. Phase B4 — Observability & hygiene

*Goal: traceable requests, honest docs, clean repo.*

1. **Request ID tracing** — tiny `x-request-id` middleware (accept inbound or generate
   UUID), attach to Winston `defaultMeta` + morgan tokens + `AppError` responses.
   (Architecture already lists this; it's ~30 lines.)
2. **Hygiene sweep** — delete/move: `backend/migration.sql`, `backend/verify-phase0.js`,
   `backend/tsconfig.tsbuildinfo` (add `*.tsbuildinfo` to `.gitignore`), root one-off
   scripts (move anything still used to `backend/scripts/`, delete the rest),
   `backend/tests/e2e/api.e2e.test.js` (compiled artifact). Remove the dead
   `supabaseAdmin` import in `statement.service.ts` (F22) — keep `lib/supabase.ts` only if
   storage is actually adopted, else delete it + its boot log. Wire or drop the dead
   `PAYMENT_PROVIDER` config (F23) — mirror the remittance transport factory's fail-loud
   switch, or remove the env from config. After B1 cleanup, flip `noUnusedLocals` +
   `noUnusedParameters` to `true` so dead code stops compiling silently.
3. **Doc refresh** — correct `CLAUDE.md` F9 items (rate limit, Sentry, CI claims).
   Note: CLAUDE.md claims the global prod rate limit is 100/15min — the actual default is
   **10,000/15min** (`config/index.ts` `RATE_LIMIT_MAX_REQUESTS`), which is fine for the
   SPA; only the doc is stale. Keep `architecture.md` current per rules.md §7.
4. **Optional, cheap:** Sentry is wired ✅ — confirm one test error surfaces with a real
   `SENTRY_DSN`; add `tracesSampleRate` note to deployment checklist.

**Blast radius:** middleware additive; deletions are confirmed-dead files only.
**Verify:** `tsc`, unit tests, manual request shows `x-request-id` in logs + error bodies
(dev only), repo root listing is clean.
**Update `architecture.md`** (monitoring section).

---

## 7. Deferred (documented ceilings — revisit when triggered)

| Item | Trigger | Fix |
|---|---|---|
| In-memory import cache | second backend instance | Redis-backed token store (`lib/sales-import/cache.ts`) |
| Offset pagination | >10k rows per business on list pages | cursor pagination on `(sortKey, id)` |
| `ILIKE` search | >100k rows per business | pg_trgm / tsvector (`search.service.ts`) |
| Sync PDF generation | p95 latency complaints on statement/invoice download | background job + stored PDF URL |
| DB read replicas / Redis cache | ~10k businesses | per `architecture.md` scaling notes |

---

## 8. Explicitly NOT doing (YAGNI)

- ❌ Not rewriting services "cleaner" — the layering (routes → controllers → services → Prisma)
  is consistent and good; B1 only removes `any` where it exists.
- ❌ No new architecture (no queues, no microservices, no Redis) — the ceilings in §7 have
  trigger conditions and aren't hit yet.
- ❌ No schema redesign — migrations are additive only (index, no column drops).
- ❌ No switching from Zod (backend convention, works) — frontend is the no-Zod side per rules.txt.
- ❌ No 2FA/session-blacklist in this pass — real but orthogonal; already logged in `architecture.md`.

---

## 9. Verified-good — do NOT "fix" these

Scan confirmed the following are already correct; leave them alone:
- **Trust proxy** set before rate limiters in prod (`app.ts:46-48`) ✅
- **Graceful shutdown** + 30s force-exit + `uncaughtException`/`unhandledRejection`
  handlers (`server.ts:47-89`) ✅
- **Webhook money path is atomic**: `paymentStatus='completed' + isLocked=true` in one
  `$transaction`; replay dedup (5-min signature window) + full event logging; errors
  propagate → Paystack retries. ✅
- **No generic `throw new Error`** anywhere in `src` — AppError contract is consistent ✅
- **No N+1** in invoice list (uses `_count` include) ✅
- **Logger** console-first (correct for container hosts), JSON in prod, file logs opt-in ✅
- **Month locking is enforced** (currently inline in sales/expense/invoice — F16 extracts it
  into a shared helper), ownership checks on every service, DB unique constraints as safety
  nets ✅
- **Reminder cron** advisory lock + self-healing sweep ✅
- **Month math in tax + reminder services is consistently `Date.UTC`** with explanatory
  comments (`tax.service.ts:47-49,310-311`) — the fix (F14) standardizes the stragglers
  onto the same convention ✅
- **Envelope keys are functionally consistent** — the `{ success, ...result }` spread
  produces the same `data`/`pagination` keys as the explicit form; F15 is style-only ✅
- **Paystack provider is typed** (`InitializePaymentResult`, `VerifyPaymentResult`) ✅
- **`logAudit` is transactional when a tx is passed, fire-and-forget otherwise** ✅
- **Error responses include `stack` only in development** (`errorHandler.ts:132-133`) ✅
- **Admin panel routes gated by `authenticate + authorize('admin')` at router level**;
  admin login rides the standard rate-limited `/auth/login` ✅
- **Payment webhook + verifyPayment early-return on already-completed payments** ✅
- **Payment webhook replay is idempotent** beyond the 5-min dedup window (value updates +
  `createReminderOnce` dedup) ✅
- **`forgotPassword` is enumeration-safe** (same message whether or not the email exists) ✅
- **Invoice validator is thorough** (lines `.min(1)`, qty > 0, price ≥ 0, due ≥ issue, all
  string caps) — no gaps found ✅
- **Global rate limit default is 10,000/15min** — generous for the multi-request SPA; the
  "100/15min" in CLAUDE.md is stale doc drift, not a code problem ✅
- **Email lib is a clean abstraction** — Resend when configured, Winston fallback with
  `delivered: false`; callers don't care which path runs ✅
- **Remittance transport factory fails loud on unknown names** — the pattern the payment
  provider factory should copy (F23) ✅
- **Auth middleware + refresh re-check user active; login rejects inactive accounts** ✅
- **Reset tokens are single-use** (hash cleared in the same tx as the password change) ✅
- **`sanitizeUser` + all admin selects exclude `passwordHash`** ✅
- **All `_sum` aggregate call sites are null-safe** (`?? 0` or tax.service's local `toNumber`
  with a null guard) — no empty-data crash on dashboard/calculate ✅

---

## 10. Order of execution & verification summary

```
B0 security  → tsc + curl checks + 401/403/429 tests +   (1 day, incl. F17/F18
              payment-channel mapping + amount checks      money-flow fix)
B1 types+lint → tsc + lint green + unit tests            (1–2 days)
B1b split services → tests green after each file         (1–2 days, overlapped)
B1c guards+responses → month-lock helper + respond helper (half a day)
B2 config+queries → migration + cron smoke + pool check  (1–2 days)
B3 tests/CI  → jest green + CI green                     (1–2 days)
B4 hygiene   → tsc + repo clean + docs honest            (half a day)
```

Each phase ends with `architecture.md` updated and the app running. **Part B (frontend)**
follows next iteration: rules.txt compliance (folder structure, named exports,
services/hooks layer), split of 400+ line components, `utils/format.ts` extraction,
Vitest + RTL, lint backlog, UI primitives (Modal/EmptyState/StatusBadge), i18n,
virtualization, mobile pass — aligned with `PRODUCT_ARCHITECTURE_PLAN.md` Phase 0.
