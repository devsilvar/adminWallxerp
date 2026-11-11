# External API Plan — letting Wowo use our sales, invoices & expenses

> **Plain-language companion, not the source of truth.**
> Read this first if you are new to the codebase.
> **Implement from `docs/external-api-service-plan.reviewed.md`** — that file has
> the file-level detail, phases and acceptance criteria. This one explains *why*.
>
> Rewritten 2026-11-10 as v11 — separate database, long-lived revocable device
> tokens, just-in-time activation codes, a subscription entitlement gate, an admin
> surface, settled payment and expense taxonomies, and expenses kept out of tax.
> `docs/archive/` holds v6, v9 and v10; all three are superseded. Do not read them.

## 0. What changed from v8 to v9

v8 put the new service on **the same Postgres database** as the SME app. v9 gives
it **its own database**. That single change deletes most of the hard parts:

| v8 problem | v9/v10 status |
|---|---|
| Two services, one `prisma migrate` — pick option A, B or C | **Gone.** Each service migrates its own database |
| Schema drift between two `schema.prisma` files | **Gone as a correctness risk.** Nothing is shared at runtime |
| `isTaxable: false` is "the most dangerous line in the build" | **Much weaker.** No tax engine reads these tables |
| Five files change in the existing backend | **Zero** |
| `SalesSource.api` must be added to the shared enum first | **Deferred and optional** |

The cost is one thing only: **the SME app can no longer see Wowo's merchants.**
That was the entire justification for the shared database, and it is a product
decision, not a technical one. It is now accepted deliberately (see §3.1).

### What changed in v10

v10 keeps the v9 architecture and fixes what a re-review found blocking:

| v9 problem | v10 |
|---|---|
| The schema was 12 tables but `Business.userId` is a required FK, and provisioning inserts a `BusinessMember` | **15 tables** — adds `users`, `business_members`, `external_admins` |
| Sales required **two** idempotency columns and defined neither | **One** — `reference_id` |
| 100,000 activation codes were exported to a single CSV | **Codes are minted one at a time**, TTL 72 h. No bulk secret file |
| A 180-day token meant ~550 human re-activations per day at 100k merchants | **Long-lived token + revocation + rotate** — no re-activation treadmill |
| No way to stop access when the month is unpaid | **Subscription expiry gate** → `402`, data retained |
| The provisioning tool was Phase 7, after the phases that need it | **Phase 1** |
| No payloads, error envelope or pagination spec | **Full contract** in the source-of-truth plan §7 |
| Admin surface undecided | **Endpoints in the new service, Phase 8 (last)** |

### What changed in v11

v11 keeps the architecture and fixes what the v10 review found.

| v10 problem | v11 |
|---|---|
| A merchant taking a card or wallet payment had no value to send | **15 payment channels** — adds `card`, `mobile_money`, `ussd`, `cheque`, `api`, `other` |
| Electricity, diesel and pension contributions had no expense category | **27 categories** — adds `power`, `statutory_contributions`, `staff_welfare`, `training`, `security`, `licenses_permits` |
| Expenses defaulted to `isDeductible: true` | **Always `false`.** Expenses here carry no tax consequence at all |
| A client reference could collide with a future invoice number | **`WX-` is reserved** — a client `referenceId` starting with it is rejected |
| Nothing stopped a negative invoice total | **`discount ≤ subtotal`**, or `400` |
| "Each row exactly once" was not true | **At-least-once**; clients upsert by `id`. Documented, not implied |
| A lost rotate response locked the device out | **10-minute grace window** on the old token |
| Only an admin could fix a misspelled business name | **Merchants can `PATCH` their own account** |
| The tenancy gate was four tests and a grep | **One scoped query layer** handlers cannot bypass |
| Load test at 25–50 accounts | **Capacity model** and a test at 1,000 accounts |
| No pen test, DPIA, DPA or breach runbook | **Phase 9** |
| ~100 h, no contingency | **~142 h engineering, ~178 h with contingency** |

## 1. The problem in one sentence

Wowo has ~100,000 small businesses that need somewhere to record **sales,
invoices and expenses**. We already built that. They want an API their mobile app
can call. It must not slow down or break our own PayMyTax app.

## 2. The shape we settled on

```text
   Wowo mobile app
        │  Bearer <device token>
        ▼
   NEW service  (own repo, own Railway service, own Postgres)
        │  own Prisma client, own migrations
        ▼
   ITS OWN POSTGRES DATABASE

   existing PayMyTax backend ──► its own database, untouched
```

- **New repository.** Not a folder in this codebase.
- **New Railway service.** Its own deploy, own env vars, own logs.
- **New Railway Postgres.** Its own `DATABASE_URL`, own backups, own blast radius.
- **The existing backend is not touched at all.** Not "barely" — actually zero.

## 3. What this buys us

| Win | Why it matters |
|---|---|
| **Total isolation** | A runaway Wowo client cannot touch SME-app latency. The kill switch is a real switch, and so is the database |
| **Migration freedom** | The new service runs `prisma migrate deploy` like any normal app. No shared `_prisma_migrations` table, no drift, no options to pick |
| **No guardrail copying for safety** | We lose `verifyBusinessAccess` and friends, but the *tax* consequences of getting it wrong are gone. A scoping bug is a bug, not a silent tax inflation |
| **No refactor** | We do not extract shared packages, do not restructure `src/services/**` |
| **Four blockers vanish** | We write rows directly, so we never call `createBusiness`, `checkBusinessLimit` or `generateMerchantId` |
| **A clean schema** | We define `businesses`, `sales_transactions`, `invoices` fresh, with no 40 legacy tables and no nullable-because-of-history columns |
| **Independent scaling** | Scale the partner API without touching the SME app, including its database |

### 3.1 What we give up — say it out loud

**The SME app will never show a Wowo merchant's sales, invoices or customers.**
There is no query that crosses the two databases. Consequences:

- No cross-sell inside our own app. A Wowo merchant cannot be shown "your tax
  report is ready" because we do not have their rows.
- The partner-merchant admin view lives in the **new** service, not the SME admin
  portal (§10.2).
- Any combined report ("total sales across both products") is two queries and a
  merge in application code, or a warehouse later. Not a SQL join.

This was accepted on the basis that **Wowo's merchants are Wowo's customers**,
and it is currently unknown whether any of them will ever file tax with us. That
uncertainty is why §8.3 exists: keep the merge cheap so the door stays open.

## 4. What this costs us — read this part twice

We still lose every guardrail the existing services give us for free. A separate
repo cannot import `src/services/**`. So each of these is code we write
ourselves, in the new repo:

| Guardrail | What it did | What we do now |
|---|---|---|
| `verifyBusinessAccess` | Proved the caller owns the business | **We scope every query ourselves.** This is the tenant boundary now — if it is wrong, every merchant sees everyone's data |
| `resolveTaxPolicy` | Decided the VAT rate | **We always write `vatRate: 0`.** Nothing computes VAT |
| `isTaxable: true` literal | Marked sales as taxable revenue | **We always write `isTaxable: false`** — for merge compatibility, not safety (§8.3) |
| `isDeductible: true` default | Made an expense a tax deduction | **We always write `isDeductible: false`.** Expenses on this surface are bookkeeping records only (§6) |
| `assertMonthNotLocked` | Blocked edits to finalized months | **We do not check.** Platform businesses never finalize, so no lock exists to hit |
| `logAudit` | Wrote audit rows | **We write `audit_logs` rows ourselves** |
| `generateInvoiceNumber` | Minted `INV-YYYY-NNN` | **We mint our own**, with a different prefix (§8.5) |
| 12 PDF generators | Rendered invoices and receipts | **Not importable.** We build one simple commercial-invoice PDF ourselves (§14) |

**The most dangerous line is now different.** In v8 it was the missing
`isTaxable: false`. In v10 it is **tenant scoping**: with the database no longer
shared, a scoping mistake no longer inflates a tax bill — it leaks one merchant's
data to another. That is worse, and it is why §11 makes the tenancy tests a gate.

## 5. How a request flows

```text
Client app
   │  Authorization: Bearer <device token>
   ▼
New service  (/api/external/v1/...)
   │
   ├── authenticateDevice   → "which account does this token belong to?"
   ├── rateLimit            → "has this device used too much?"
   ├── resolveAccount       → "does the path account match the token?"
   ├── tax-guard            → vatRate 0, isTaxable false, always
   ├── idempotency          → "did we already do this exact request?"
   ▼
Own Prisma client
   │
   ▼
Own Postgres
```

## 6. The tax rule — still keep it, but it is no longer the safety net

**We compute no tax. Ever. On any write.**

- Invoice create/update → `vatRate: 0`, `vatAmount: 0`, `total = subtotal − discount`
- Sale create → `isTaxable: false`
- Expense create → **`isDeductible: false`** — an expense recorded here is a
  bookkeeping record, not a deduction
- Invoice mark-paid → the linked sale is `isTaxable: false`
- No `MonthlyTaxReport` writes, no FIRS calls, no statements

**`discount` may not exceed `subtotal`.** Reject it with `400` rather than clamping.
The SME app clamps (`Math.max(0, subtotal - discount)`), which is right for a form and
wrong for an API — a silently floored total is a data bug the client never sees.

**Two database defaults are hostile to this rule and we override both in our own
schema**, so an omitted write cannot reintroduce tax: `vat_rate` defaults to `0`
(not the SME's `7.5`), and `is_deductible` defaults to `false` (not `true`).

In v8 this rule was load-bearing because the SME tax engine read the same rows
through `TAXABLE_SALES_WHERE` (`src/shared/helpers/settled-status.ts:21-24`). In
v10 nothing reads these tables but us. We keep the rule anyway, for two reasons:

1. **Merge compatibility.** If a merchant graduates to PayMyTax (§8.3), their
   rows must already be shaped so they do not land in a tax report by accident.
2. **It keeps the new service honest.** A future reporting feature in the new
   service should not invent tax semantics either.

The rule still lives in one file (`src/tax-guard.ts`), but the three blocking
tests become ordinary unit tests. **The blocking gate moves to tenancy (§11).**

## 7. Auth — one device credential

Our app uses short-lived JWT tokens for browsers. A mobile app needs something
long-lived that is **not shipped in the binary** (an APK can be unzipped).

```text
Operator CLI ──► creates account + one-time activation code
                        │
        Wowo gives the code to the merchant
                        │
Mobile app ──POST /auth/activate { code, deviceName }──► device token (shown once)
                        │
Mobile app ──Authorization: Bearer <token>──► everything else
```

- Code: 10 characters, Crockford base32 (50 bits), single use, **72-hour expiry**,
  locks after 10 failures. **Minted one merchant at a time**, never exported in a
  bulk file — at most a handful of live codes exist at any moment.
- Token: 32 random bytes, base64url. Stored as `sha256(token)`. Shown once.
- Bound to **one** business. Any other account id → **`404`** (not `403`, which
  would confirm the account exists).
- **Long-lived, no expiry by default. Revocable on every request.**
  `POST /auth/rotate` swaps the token using the current one — no new code, no
  human involved. This is what avoids a re-activation treadmill at 100,000
  merchants.
- **Nothing secret ships in the app.** That is the whole point.

### 7.1 The subscription gate

Access stops when the month is not paid — but nothing is deleted.

- `platforms.subscription_expires_at` gates **every** account on the platform.
- `businesses.subscription_expires_at` gates one account (optional).
- `NULL` means no expiry, which is correct for the pilot.
- Expired → `402 SUBSCRIPTION_EXPIRED`, with `details.expiresAt` so the app can
  show a renewal screen.
- **`GET /me` is always reachable**, even when expired or suspended.
- Data is never deleted on expiry; an operator extends the date from the admin
  surface or the CLI.

Unchanged from v8. Device tokens live in `external_devices` in our own database,
which is now the only place they could live.

## 8. Database — ours, and only ours

### 8.1 What the new service owns

It is no longer "4 extra tables bolted onto a shared schema". The new service
owns a **complete schema** for the domain it serves:

```text
OUR POSTGRES DATABASE
│
├── CORE DOMAIN — shaped like the SME app's, owned entirely by us
│   ├── users                 (the platform owner Business.userId points at)
│   ├── businesses
│   ├── business_members      (owner row per business)
│   ├── customers
│   ├── sales_transactions
│   ├── sale_line_items
│   ├── expenses
│   ├── invoices
│   ├── invoice_lines
│   └── audit_logs
│
└── PARTNER PLUMBING — no SME equivalent
    ├── platforms            (Wowo as a tenant)
    ├── external_devices     (device tokens)
    ├── external_tombstones  (deletions feed)
    ├── external_sequences   (WOWO and WX number allocators)
    └── external_admins      (operator credentials for /admin/*)
```

**Fifteen** tables. `users` and `business_members` are not optional: `Business.userId`
is a required foreign key and provisioning inserts an owner membership row.
`external_admins` holds hashed operator credentials for the admin surface.

More DDL than v9's twelve, but it is a clean schema with no legacy and no columns
that exist only because of historical rows.

### 8.2 Nothing is added to the SME database

v8 needed these columns on tables the existing backend owns. **None of that
happens now**, because those tables are not in our database:

| v8 change | v9/v10 |
|---|---|
| `businesses` + `platform_id`, `external_customer_id`, `is_active` | Columns on **our** `businesses` |
| `customers` + `external_id` | Column on **our** `customers` |
| `sales_transactions`, `expenses`, `invoices` + `external_ref` | Columns on **our** tables |
| `audit_logs` + `platform_id`, `external_device_id` | Columns on **our** `audit_logs` |
| `SalesSource.api` enum value | Optional, and free — see §8.6 |

The existing backend's `schema.prisma` does not change. Not one line.

### 8.3 The merge-compatibility contract

We do not know yet whether a Wowo merchant will ever file tax with us. If one
does, we want moving them in to be a **copy**, not a rewrite. That costs very
little today and is worth every line of it.

**The single best piece of news: IDs already cannot collide.** Every primary key
in the SME schema is `String @id @default(uuid())`
(`schema.prisma:90, 189, 239, 375, 397, 428`). A row copied from our database
can never clash with an existing one. No renumbering, no mapping table.

The contract, in full:

| Rule | Why |
|---|---|
| **Same table names, same column names** | A merge is `INSERT … SELECT`, not a transform |
| **Same types** — `Decimal(12,2)` / `Decimal(15,2)`, `DateTime`, enums | Silent truncation is the classic merge bug |
| **Same enum members** | Copy `SalesSource`, `TransactionStatus`, `InvoiceStatus` wholesale |
| **UUID primary keys** | Free. Never use a sequential integer |
| **`WOWO-` merchant prefix, `WX-` invoice prefix** | Already required (§8.5); also makes the origin of every row self-evident |
| **`platform_id` on every business** | Tells you exactly what to copy when a merchant graduates |
| **Never repurpose a shared-named column** | If our `sales_transactions.status` means something different from theirs, the merge is no longer a copy. This is the one rule that actually costs money to break |

**And one genuine upgrade we get for free:** `SalesTransaction.referenceId` is
`String?` in the SME schema (`schema.prisma:194`) only because existing rows
predate it. In our database every row has one, so it becomes `NOT NULL` with
`@@unique([businessId, source, referenceId])`. That turns idempotency from "a
nullable column we hope is unique" into a real database guarantee.

**When a merchant graduates, the merge is roughly:**

1. Insert their `businesses` row (same `id`, new `userId` pointing at a real
   PayMyTax user).
2. Insert `customers`, `sales_transactions`, `sale_line_items`, `expenses`,
   `invoices`, `invoice_lines`, `audit_logs` filtered by that `businessId`.
3. Rewrite `merchantId` from `WOWO…` to `PMTW…` if the SME app requires it.
4. Add a `SalesSource.api` value to the SME enum if it is not already there.
5. Delete from our database, or leave it and mark the account migrated.

Steps 1–3 are a script. Step 4 is a one-line migration (§8.6). Nothing here
needs to be built in v1 — it needs the schema to make it possible later.

### 8.4 Migrations — no conflict, ever

The new service runs `prisma migrate deploy` normally. Its `_prisma_migrations`
table is its own. It never sees the SME app's 78 migrations
(`backend/prisma/migrations/`), and the SME app never sees ours.

v8's open question "pick option A, B or C" is **closed**. There is nothing to
pick. `npm start` in the new service is fine.

The only remaining discipline is local: never point both repos at the same local
database during development, or you will recreate the v8 problem by accident.

### 8.5 Merchant IDs and invoice numbers

Do **not** reimplement `generateMerchantId` (it scans every `PMTW%` business).

- **Merchant IDs:** new service uses a different prefix, e.g. `WOWO0000001`,
  allocated from its own sequence table. `Business.merchantId` is `@unique`
  globally (`schema.prisma:134`), so the prefix is what keeps a merge from
  colliding. It also means the existing code needs no change.
- **Invoice numbers:** new service mints `WX-YYYY-NNN` from its own sequence.
  Different prefix from the SME app's `INV-YYYY-NNN`, so
  `@@unique([businessId, invoiceNumber])` cannot collide across databases either.

### 8.6 The enum question — resolved: superset, backend untouched

External sales carry `source = 'api'`. The SME's `SalesSource` has no such member
(verified: `bank_transfer, paycode, pos, online_store, manual, cash, invoice,
credit, store_voucher`), so v10's "copy the enum wholesale" rule could not hold.

**Decision (D44): our enums are supersets and `backend/` is not touched.**

For the record, v8's claim that adding the value would break the existing backend
was wrong. I re-checked on 2026-11-10:

| File | v8 claim | Reality |
|---|---|---|
| `src/services/pdf/sales-receipt.pdf.ts:19` | Literal union, "will not compile" | A union on an **interface field**, not derived from `SalesSource`. Unaffected |
| `src/services/pdf/sales-report.pdf.ts:46` | "prints a raw fallback string" | `Record<string, string>` with a fallback. Unaffected |
| `src/services/documents/statement.service.ts:391` | Same | `Record<string, string>`. Unaffected |
| Anywhere else | — | No `Record<SalesSource, …>` exists in `src/`, and `SalesSource` is not referenced in `src/services/pdf/` or `src/services/documents/` at all |

So the migration really would have been free. It is declined anyway: "zero changes
to `backend/`" is worth more than one enum value, because it keeps this project's
deploy completely decoupled from PayMyTax. The cost lands at graduation, where the
SME enum gains the missing members *before* the merge inserts — one
`ALTER TYPE … ADD VALUE` migration that rewrites no table.

**In practice:** our `SalesSource` has 15 members and the SME's has 9, with every
shared member spelled identically. A merge only ever *extends* the SME enum; it
never rewrites a value.

### 8.7 The full taxonomy

Both lists live in the source-of-truth plan (§5.7). In short:

- **15 payment channels** — the 9 SME members plus `api`, `card`, `mobile_money`,
  `ussd`, `cheque`, and `other`. Three of those (`card`, `mobile_money`, `cheque`)
  already existed in the SME's `InvoicePaymentMethod` but were missing from
  `SalesSource`, so a merchant taking a card payment had no correct value to send.
  `other` is a deliberate catch-all so the long tail never needs another migration.
- **27 expense categories** — the 21 SME members plus `power`,
  `statutory_contributions`, `staff_welfare`, `training`, `security`,
  `licenses_permits`. `power` (electricity, diesel, generator) and statutory
  contributions (PENCOM, NHF, NSITF, ITF) are large recurring Nigerian SME costs
  that had no correct home at all.

Deliberately left out: `crypto`, `direct_debit`, `payment_link`, `cleaning_waste`,
`packaging`. All are plausible later; none is needed now.

## 9. What still changes in the existing backend

**Nothing.** In v8 this section listed five files. All five are gone, because
none of them were about the new service — they existed only to accommodate rows
landing in a shared database.

The existing backend keeps working exactly as it does today, with no deploy
coupled to this project.

## 10. Deployment

### 10.1 Railway

- **One new Railway Postgres.** Its own `DATABASE_URL`. Take the pooled
  connection string if the plan provides one, but there is no cross-service
  connection pressure any more — the two pools no longer share a server limit.
- **One new Railway service.** Its own deploy, own env vars, own logs.
- **Normal start command.** `npm start` is fine now; it runs `prisma migrate
  deploy` against **our** database, which is exactly what we want.
- **Separate backups.** Our database needs its own backup schedule. The SME app's
  `npm run db:backup` does not cover it.

### 10.2 Admin — decided: endpoints in the new service, built last

You need to see how Wowo is using the API, so admin is **not** optional. It lives
in the new service (same repo, same deploy) and ships in **Phase 8, after the
pilot phases**. Auth is an operator token from `external_admins`, hashed at rest,
separate from device tokens.

It exposes: platform fee and subscription expiry, suspend/resume at platform and
account level, activation-code issuance, device list and revocation, audit-log
search, and usage stats — last seen, request volume, and row counts per account.

A read-only UI on top of those endpoints is a later, separate piece of work; the
endpoints are enough to operate 100,000 merchants from a terminal.

## 11. Phased rollout

| Phase | What | Gate |
|---|---|---|
| **0** | Scaffold, separate Railway project + Postgres + staging, CI, request IDs, error envelope | `/health` green |
| **1** | 15-table schema, sequences, **provisioning CLI (no codes)** | 100 accounts, twice, zero duplicates |
| **2** | Device auth: activate / rotate / revoke / me, entitlement gate, rate limits | Code is single-use; expired subscription → 402 |
| **3** | **Tenant isolation** | **One scoped query layer + per-resource negative matrix. Do not pass until green** |
| **4** | Contract: OpenAPI from Zod, customers, sales, expenses, `PATCH /accounts`, idempotency, tombstones, keyset cursor, error catalogue | Equal-timestamp paging returns each row once |
| **5** | Invoices: create → issue → mark-paid → cancel → delete, commercial PDF, public pdf-link | Replay creates one sale |
| **6** | Sync completion, retention jobs, capacity work, load test at **1,000 accounts** | `EXPLAIN` clean; p95 within target |
| **7** | Integration guide, sandbox tenant, runbook, alerts, backup + **restore rehearsal** | Wowo can integrate |
| **8** | **Admin surface** (last, as requested) | Operator can see usage and act without SQL |
| **9** | **Security and legal gate** — pen test, DPIA, DPA, breach runbook, DSAR path | Must close before onboarding past the pilot |

**≈ 142 h engineering, ≈ 178 h with contingency. Pilot (0–5) ≈ 96 h, ≈ 120 h with
contingency.** v10's 100 h had no buffer for the tenancy layer, the capacity work or
the security gate.

**Later:** sale-receipt PDFs, report PDFs, admin UI, bulk import, webhooks, `/v2`.

**Do not start Phase 4 until Phase 3 is green.** With `verifyBusinessAccess` gone
and the database private, a scoping mistake is a cross-tenant data breach, not a
bug — and there is no shared table to catch it.

**Phase 1 moved earlier on purpose.** v9 scheduled provisioning last, but nothing
in Phases 2–5 can be tested without a provisioned account.

## 12. What stays true from the old plans

- No tax computed, filed or remitted.
- **Expenses carry no tax consequence either** — `isDeductible: false` on every row.
- No business logic copied from the SME app.
- No webhooks — Wowo polls with `updatedSince` + cursor.
- **Sync is at-least-once**, not exactly-once. Clients upsert by `id`.
- Deletes are hard deletes + a tombstone row.
- `externalRef` (not an `Idempotency-Key` header) is the idempotency mechanism.
- **`WX-` is a reserved reference prefix** — clients may not use it.
- One flat fee, invoiced out of band. No payment rail.
- No send/deliver endpoints. Wowo delivers; we return documents.
- **Receipts are optional and not hosted** — a nullable `receiptUrl`, no uploads.

## 13. Open questions

1. **Billing unit** — does Wowo pay one platform fee, or is each merchant billed
   separately? The schema supports both; the default check is platform-level.
2. **Who at Wowo delivers activation codes**, and through which channel? We mint
   them; they deliver them.
3. **Fee amount** — structure built, number pending.
4. **Pilot size** — recommend 25–50 accounts before committing to 100,000.
5. **Transaction volume per merchant per month** — sales, expenses, invoices.
   **This is the most important missing number**, because the capacity plan assumes
   30 / 10 / 3 and everything in §14.1 scales from it.
6. **Rename `tax_permit`?** It conflates tax with permits, and tax is a liability,
   not an expense. Free now, a data migration after launch.
7. **Admin token policy** — expiry and IP allowlist, or long-lived only?
8. **Pen test and DPA** — external firm, and who drafts the agreement?
9. **Graduation tooling** — build the merge script in v1, or handle the first
   merchant manually? Recommend manual until someone asks.

**Closed:** token lifetime (long-lived + revocation + rotate + grace window), code
delivery (just-in-time, never bulk), admin surface (endpoints in the new service,
last), credential model (device tokens only), migration ownership (each service owns
its database), expense tax treatment (none), enum parity (superset, backend
untouched), sync guarantee (at-least-once), receipts (optional, not hosted),
merchant profile editing (allowed), rate-limit store (decided in Phase 2).

## 14. The commercial invoice PDF (decided)

We build **one** PDF in the new service. We do **not** copy the SME app's
`invoice.pdf.ts` — it is ~400 lines plus brand fonts, and a copy would drift the
first time either side changes.

**Scope:** invoice only. No sale receipts, no report PDFs, in v1.

**Stack:** `pdfkit` with the standard Helvetica fonts. No font files, no logo
fetch, no shared helpers.

**Layout:** A4, 40 pt margins. Business block top-left, `COMMERCIAL INVOICE`
top-right, invoice number / dates / bill-to, then a line-item table, then totals,
then the disclaimer footer.

**The rules that matter:**

| Rule | Why |
|---|---|
| Title is `COMMERCIAL INVOICE` | Never `TAX INVOICE` / `VAT INVOICE` / `FIRS INVOICE` |
| **No VAT line at all** | There is no VAT. Do not print "VAT: ₦0" — omit the row |
| `total = subtotal − discount` | Taken from the stored row, never recomputed |
| Totals come from the invoice, not config | A re-rendered PDF must not change when a setting changes |
| No QR, no signature, no "verified" wording | These are not tamper-evident documents |

**Footer, verbatim:**

> This is a commercial billing document generated via Wowo. This document does
> not constitute a statutory FIRS Tax Invoice, VAT receipt or tax return filing.
> Statutory tax compliance and fiscalisation (if required by applicable law)
> remain the sole responsibility of the billing entity.

**Endpoints:**

```text
GET …/invoices/:id/pdf        application/pdf, filename WX-2026-001.pdf
                              ?disposition=inline for the OS viewer
GET …/invoices/:id/pdf-link   { url, shareToken }
```

Headers: `Cache-Control: private, max-age=60`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex, nofollow, noarchive`. A cancelled invoice returns `410`; a
deleted or expired one returns `404`. Generate outside any transaction — it is CPU
work.

**The public link is a credential in a URL, so it gets treated like one.** The
merchant forwards it to their own customer, so it cannot be authenticated — which
means the hardening has to carry the weight: noindex, no-referrer, rate limited per
IP *and* per token, the token redacted from access logs, a bounded 30-day TTL, and
regenerating the link kills the old one immediately. An expired token and a wrong
token both return `404`, so neither confirms the other.

**Cost:** ~8 h. Tests: no VAT line, disclaimer present, title is not a tax invoice,
headers present, both rate limits fire, regeneration invalidates the old token.

## 15. Which file to work from

| File | Role | Status |
|---|---|---|
| **`docs/external-api-service-plan.reviewed.md`** | **Source of truth** — data model, contract, phases, acceptance criteria | **v11, current. Work from this** |
| `docs/external-api-plan.md` | This file. Orientation and rationale | v11, current. Explains *why*, not *how* |
| `docs/archive/external-api-service-plan-v10.md` | Historical | Superseded. Ignore it |
| `docs/archive/external-api-service-plan-v9.md` | Historical | Superseded. Ignore it |
| `docs/archive/external-api-service-plan-v6.md` | Historical | Superseded. Ignore it |

Both current docs were updated to v11 on 2026-11-10 and agree with each other.
If they ever disagree again, **the reviewed plan wins.**

The archives are kept only for history. v6 describes an embedded app importing
`src/services/**` and is wrong on topology, the database and the file list. v9 had
the twelve-table schema, the bulk activation-code file and the 180-day token. v10
had the 9-member `SalesSource`, the 21-member `ExpenseCategory`, expenses on a
`true` default, and no capacity model.
