# External API — Wowo Platform Service — Implementation Plan v9

> **⭐ THIS IS THE SOURCE OF TRUTH. Work from this file.**
>
> `docs/external-api-plan.md` is a plain-language orientation companion — read it
> first if you are new, but implement from here.
> `docs/archive/external-api-service-plan-v6.md` is superseded and retained only
> for history. Do not work from it.
>
> **v9 changes the database, not the intent.** v8 put the new service on the same
> Postgres as the SME app. **v9 gives it its own database.** The service remains a
> **separate repository** and a **separate Railway service**.
>
> That one change deletes v8's hardest problems: the migration-ownership conflict
> (§2.4) is closed, schema drift (§2.5) is no longer a correctness risk, the
> five-file edit to the existing backend (§7.3) is gone, and the tax boundary
> (§5.5) stops being load-bearing. What replaces it as the critical invariant is
> **tenant scoping** (§5.2, §8 Phase 3).
>
> Every claim about the existing backend below was re-read from `backend/` on
> **2026-11-10**. Line numbers are from that date.
>
> Legend: **CONFIRMED** = read from the repository · **LIKELY** = inferred ·
> **UNVERIFIED** = needs a runtime check, vendor docs, or client input.

---

## 1. EXECUTIVE VERDICT

🟢 **PLAN IS BUILDABLE** — the architecture is settled, the last blocking
decision (migration ownership) is closed, and the build is meaningfully smaller
than v8. The trade is unchanged in kind but much reduced in risk: every safety
invariant moves from "inherited" to "hand-written", but **only one of them can
now cause real harm**, and that one is a phase gate.

**What changed for the better in v9.** Giving the new service its own database
removes four of v8's hardest problems outright:

| v8 problem | v9 status |
|---|---|
| Two services, one `_prisma_migrations` table — pick option A, B or C (§2.4) | **Closed.** Each service migrates its own database |
| Two `schema.prisma` files describing one database, kept honest by CI (§2.5) | **No longer a correctness risk.** Nothing is shared at runtime |
| Five files in the existing backend must change (§7.3) | **Zero files change** |
| A missing `isTaxable: false` silently inflates a merchant's tax bill (§5.5) | **Cannot happen.** No tax engine reads these tables |
| Schema must stay merge-compatible | **New obligation** — see §7.5. Cheap, and it keeps the graduation door open |

**What changed for the better in v8 (kept).** v7 spent significant effort on four
blockers that existed only because the new app was going to call the existing
services. Writing rows directly removes all four:

| v7 blocker | Why it disappears |
|---|---|
| `generateMerchantId` is O(n) over every `PMTW` business (`business.service.ts:26-48`) | We never call it. New service mints `WOWO…` from its own sequence; the SME app only scans `PMTW%` |
| `checkBusinessLimit` caps at 5 for a `free` owner (`subscription-guard.service.ts:208-217`, `subscription-plans.ts:70`) | We never call `createBusiness`. We insert `Business` rows directly |
| No plain customer creation — both paths mint a card + PIN (`customer-card.service.ts:189`, `:342`) | We insert `Customer` rows directly |
| `Business` has no active flag (`schema.prisma:89-166`) | We add the column; it is ours to own |

That is roughly 18 hours of v7 work deleted, and three of its riskiest edits to
shared code gone.

**What we still write ourselves.** With `src/services/**` out of reach, these are
now code we own. The third column is the one that changed in v9 — it is the blast
radius if we get it wrong.

| Inherited in v7 | We write it | Blast radius in v9 |
|---|---|---|
| `verifyBusinessAccess` — the tenant boundary (`lib/ownership.ts:162-164`) | Every query scoped by `businessId` from the device token | 🔴 **Cross-tenant data breach.** The only true red risk left |
| `resolveTaxPolicy` + `vatRate` handling (`invoice-crud.service.ts:153-162`) | Always `vatRate: 0` | 🟡 Wrong number on a commercial invoice |
| `isTaxable: true` literal (`sales-crud.service.ts:176`, `invoice-crud.service.ts:857`) | Always `isTaxable: false` | 🟢 Merge-compat only — nothing reads it |
| `assertMonthNotLocked` (7 call sites) | Not checked — moot, no reports exist | 🟢 None |
| `logAudit` (`lib/audit.ts:24`) | Direct `audit_logs` inserts | 🟡 Missing audit trail |
| `generateInvoiceNumber` (`invoice-crud.service.ts:117`) | Own sequence, own prefix | 🟡 Duplicate numbers inside our own tenant |
| 12 PDF generators | Not available (§13) | 🟢 Cosmetic |

**The verdict is not "don't do this."** It is a legitimate architecture for a
partner surface that touches three entities and computes no tax. In v8 the
load-bearing section was §6 (edge cases) because the tax guard was the risk. In
v9 **the load-bearing section is §5.2 (tenancy) and Phase 3**, because tenant
scoping is now the only mistake that leaks one merchant's data to another. Every
other guardrail is a bug, not a breach.

---

## 2. WHAT WAS WRONG WITH EARLIER PLANS, AND WHAT v9 CHANGES

### 2.1 🔴 WRONG in v7 — the topology

v7 §2: *"The same repository. A new Express app. A second deployable."*
It also stated the one-way import rule (`src/external/** → src/services/**`) as
an invariant and proposed an ESLint rule to enforce it.

None of that survives. The new service is a different repository; it cannot
import `src/services/**`, `src/lib/**`, the Prisma client, the PDF generators or
`lib/ownership.ts`. The one-way import rule is deleted, and with it the ESLint
guard — there is nothing left to guard.

**v8:** separate repo, separate Railway service, own Prisma client, shared
database.

**v9 supersedes the last item:** separate repo, separate Railway service, own
Prisma client, **own database**. The service was never going to import anything
from `backend/`; v9 simply finishes the separation.

```text
Wowo mobile app
     │  Bearer <device token>
     ▼
New service (own repo, own Railway service)
     │  own Prisma client, own migrations
     ▼
Its own Postgres

Existing PayMyTax backend ──► its own Postgres, untouched
```

**Consequence to accept explicitly:** the SME app can never show a Wowo
merchant's sales, invoices or customers. There is no query that crosses the two
databases. This is a deliberate product decision, not an oversight — and it is
why §7.5 exists, so that a merchant who later wants to file tax can be moved in
with a copy rather than a rewrite.

### 2.2 🟠 OUTDATED — the Phase 0 tax work

v7 Phase 0 modified `invoice-crud.service.ts` and `sales-crud.service.ts` to
accept `opts`. That was correct when the new app called those services. It is now
unnecessary and must not be done — the existing services stay byte-identical.

**v8:** the tax rule moves entirely into the new service (§6). The blocking tests
move with it.

### 2.3 🟠 OUTDATED — the invoice lifecycle defect, restated

v7's headline finding was that `markInvoicePaid` rejects drafts
(`invoice-crud.service.ts:612-618`) and nothing exposed the draft→sent
transition, making external invoices unpayable.

**The defect is real but its fix changes.** With direct writes there is no
`markInvoicePaid` to call, so the new service implements the whole lifecycle
itself. The requirement survives, and is now stronger — the new service must
reproduce behaviour the old service had for free:

| Behaviour | Source it must replicate |
|---|---|
| `draft → sent` on issue | `sendInvoice`, `invoice-crud.service.ts:546-558` |
| `sent → paid` creates a linked sale | `markInvoicePaid`, `:645-687` |
| `cancelled` blocks pay | `:605-611` |
| `paid` blocks cancel | `cancelInvoice`, `:948-954` |
| Only `draft` may be deleted | `deleteInvoice`, `:502-508` |
| Linked sale is unique | `Invoice.linkedSaleId @unique`, `schema.prisma:451` |
| Sale reference is unique per source | `unique_sales_reference`, `schema.prisma:224` |

**v8:** the new service owns this state machine, with the transitions in §5.4.

### 2.4 ✅ CLOSED in v9 — migration ownership

v8's hardest open question, now moot. It existed only because Prisma records
applied migrations in a `_prisma_migrations` table **inside the database**, not
per repository. The existing backend already has **78 migrations** recorded there
(`backend/prisma/migrations/`, CONFIRMED) and runs `prisma migrate deploy` on
start (`package.json`). A second service sharing that database would compare its
own folder against those 78 rows, find no matching files, and treat the state as
drift.

**v9 removes the shared database, so it removes the conflict.** Each service has
its own `_prisma_migrations` table in its own database and never sees the other's
history. There is nothing to choose and nothing to work around:

| v8 option | v9 status |
|---|---|
| A — raw idempotent SQL + own tracking table | **Not needed** |
| B — human applies one SQL file | **Not needed** |
| C — existing backend owns all migrations | **Not needed** |

**Consequences:**

- The new service runs `prisma migrate deploy` normally. **`npm start` is
  correct** for it — the v8 instruction to override the start command with
  `node dist/server.js` is withdrawn.
- `prisma generate` works as usual.
- The only surviving discipline is local: **never point both repos at the same
  development database**, or you recreate the v8 problem on your laptop.

### 2.5 ✅ DOWNGRADED in v9 — schema drift

v8 treated drift between two `schema.prisma` files as a permanent hazard needing
a CI diff, because both files described one database and a missing column
surfaced as a runtime `column does not exist`.

In v9 the two files describe **two different databases**. Drift cannot break
either service at runtime. What it can still break is a future merge (§7.5), so
the obligation is downgraded from "correctness control" to "keep the shapes
compatible on purpose" — a written rule, not a CI gate.

**v8's CI diff is withdrawn.** There is nothing to diff against.

### 2.6 🟡 UNNECESSARY — v7 work that v8 deletes

| v7 item | Hours | Why it is gone |
|---|---|---|
| P0.3–P0.5: add `opts` to `createInvoice` / `createSale` / `markInvoicePaid` | ~6 | We do not call those services |
| P1.4–P1.7: replace `generateMerchantId`, fix `checkBusinessLimit`, re-seed after restore | ~8 | We do not call those paths |
| P2.3: `AsyncLocalStorage` audit context in `lib/` | ~4 | No shared `logAudit` to feed. New service writes audit rows directly |
| P5.1–P5.2: `suppressNotifications` on `sendInvoice` | ~3 | We do not call `sendInvoice` |
| P8.2: owner guard on `toggleUserStatus` | ~3 | We never create a `Platform` owned by a user the admin portal can deactivate — §3.4 |
| ESLint one-way import rule | ~1 | Nothing to guard |

**~25 hours removed.** Some of it is replaced by new-service work (§5), but the
net is a smaller, more isolated build.

**v9 removes more:**

| v8 item | Hours | Why it is gone in v9 |
|---|---|---|
| P1.3: modify the existing backend's enum + 4 propagation files + columns | ~3 | The SME schema does not change at all (§7.3) |
| P1.5: CI diff of shared models | ~2 | Nothing is shared (§2.5) |
| Phase 8: SME compatibility pass | ~4 | No shared tables to be compatible with |
| §7.4 migration-ownership option (A/B/C) | ~2 | Closed (§2.4) |

**v9 net: 93 h → 87 h, and the pilot drops from 75 h to 72 h.** Phase 0 shrinks
5→4 h, Phase 1 shrinks 8→6 h, and Phase 8 is replaced by a 1 h merge rehearsal.

### 2.7 🟢 CORRECT — verified, keep unchanged

Everything below was checked line by line against `backend/` and holds:

| Claim | Verified at |
|---|---|
| `resolveTaxPolicy` returns chargeable VAT on a missing/incomplete profile | `tax/tax-policy.service.ts:69-103` |
| `Invoice.vatRate` defaults to `7.5` | `schema.prisma:443` |
| `SalesTransaction.isTaxable` defaults to `true` | `schema.prisma:210` |
| `TAXABLE_SALES_WHERE` filters `isTaxable: true` | `shared/helpers/settled-status.ts:21-24` |
| `markInvoicePaid` writes `isTaxable: true` | `invoice-crud.service.ts:857` |
| `reconcileInvoiceWithTransfer` also writes `isTaxable: true` | `invoice-crud.service.ts:849-857` |
| `SalesSource` is defined in **five** places | `schema.prisma:551-561`, `validators/sales.validator.ts:10-20`, `pdf/sales-receipt.pdf.ts:19`, `pdf/sales-report.pdf.ts:46`, `documents/statement.service.ts:391` |
| `Customer` has no unique constraint today | `schema.prisma:419-421` |
| `Customer.isActive` exists | `schema.prisma:407` |
| `Business.taxId` is `@unique` | `schema.prisma:94` |
| `Business.user` is `onDelete: Cascade` | `schema.prisma:137` |
| `Business.merchantId` is `@unique` and required | `schema.prisma:134` |
| `Invoice.linkedSaleId` is `@unique` | `schema.prisma:451` |
| `Invoice.shareToken` is `@unique` | `schema.prisma:458` |
| `unique_sales_reference` on `(businessId, source, referenceId)` | `schema.prisma:224` |
| `AuditLog` has 9 writable columns | `schema.prisma:374-393`, `lib/audit.ts:30-39` |
| `assertMonthNotLocked` queries `monthlyTaxReport`, throws `423` | `shared/helpers/month-lock.ts:15-45` |
| Month-lock call sites | `sales-crud.service.ts:60,500,504,626`; `expense/expense.service.ts:63,211,215,297` |
| `markInvoicePaid` silently adjusts locked-month dates | `invoice-crud.service.ts:630` → `month-lock.ts:93` |
| `createInvoice` hard-codes `status: 'draft'` | `invoice-crud.service.ts:205` |
| `markInvoicePaid` rejects drafts | `invoice-crud.service.ts:612-618` |
| `sendInvoice` fires email + reminder | `invoice-crud.service.ts:583-584` |
| `cancelInvoice` returns `409` if already cancelled | `invoice-crud.service.ts:955-957` |
| `deleteInvoice` refuses non-draft | `invoice-crud.service.ts:502-508` |
| `deleteSale` hard-deletes | `sales/sales-crud.service.ts:640` |
| `deleteExpense` hard-deletes | `expense/expense.service.ts:269` |
| `ownership.ts` caches are unbounded `Map`s, 60 s TTL | `lib/ownership.ts:24-26` |
| `requireActiveSubscription` is per-router, not global | 12 route files; `app.ts` has no mount |
| `express-rate-limit` is a dependency | `package.json` |
| `npm start` runs `prisma migrate deploy` | `package.json` scripts |
| 78 migrations recorded | `backend/prisma/migrations/` |
| No `AsyncLocalStorage` in `src/` | grep count = 0 |
| `lib/encryption.ts` is dead code | 0 importers |

**v9 re-verified three of these on 2026-11-10**, because v8 drew a wrong
conclusion from the `SalesSource` row:

| Claim | Re-checked | Result |
|---|---|---|
| `SalesSource` has 9 members and no `api` | `schema.prisma:551-561` | Confirmed — `api` is absent |
| Adding `api` breaks the PDF label maps | `sales-report.pdf.ts:46`, `statement.service.ts:391` | **False.** Both are `Record<string, string>` with fallbacks |
| Adding `api` breaks the receipt source union | `sales-receipt.pdf.ts:19` | **False.** A literal union on an *interface field*, not derived from the Prisma enum |
| Any exhaustive map over `SalesSource` exists | grep `Record<SalesSource`, `satisfies Record<…Sales`, `keyof typeof SalesSource` across `src/` | **None found** |

So v8's five-file claim (§7.3) was wrong: adding `SalesSource.api` to the SME
schema is one migration with zero code changes. v9 does not need it at all, but
it is a free hedge for a future merge (§7.5).

---

## 3. OBJECTIVE

Give Wowo's mobile app a scoped, authenticated API over **sales, invoices and
expenses** for ~100,000 of their small businesses, in a new service with its own
repository, its own deploy and its own database — sharing nothing with the
PayMyTax app — without computing or filing any tax and without touching the
existing backend in any way.

---

## 4. REQUIREMENTS

| # | Decision | Status |
|---|---|---|
| D1 | Scope is **sales, invoices, expenses** only | Settled |
| D2 | **No tax computed.** No VAT, PAYE, FIRS, statements, remittance | Settled |
| D3 | **No tax fields in the payload.** External invoices are always 0% VAT | Settled |
| D4 | KYC is Wowo's. We store what they send | Settled |
| D5 | Wowo has no backend; the mobile app is the only consumer at launch | Settled |
| D6 | Wowo delivers invoices. We return documents; we never send them | Settled |
| D7 | **No lock bypass — locks are simply not checked** (§6.5) | **Corrected v8** |
| D8 | External sales carry `source = 'api'` | Settled |
| D9 | One flat fee, editable, default from env | Settled |
| D10 | Tenancy is platform-owned businesses — one platform `User` owns all accounts | Settled |
| D11 | The end customer is a resource reference, not a principal | Settled |
| D12 | No webhooks. Wowo polls with `updatedSince` + cursor | Settled |
| D13 | External deletes are hard deletes + a tombstone row | Settled |
| D14 | No platform API key until Wowo has a server | Settled |
| D15 | Account scoped in the path; foreign account → **404, not 403** | Settled |
| D16 | Three-layer kill switch: env → platform → account | Settled |
| D19 | Commercial Invoices only. FIRS non-fiscal disclaimer | Settled |
| D20 | NDPA via data minimisation & B2B DPA. Wowo is Controller | Settled |
| D21 | OpenAPI served by the new service at `/docs` | Settled |
| D22 | One credential: per-account device token from a one-time activation code | Settled |
| D23 | Provisioning is operator-side CLI, not an HTTP endpoint | Settled |
| D24 | No `Idempotency-Key` header. `externalRef` + idempotent transitions | Settled |
| **D25** | **Separate repository, separate Railway service, separate Postgres** | **New v8, revised v9** |
| **D26** | **New service writes rows directly; it never calls the existing backend** | **New v8** |
| **D27** | **New service owns its whole schema and runs its own `prisma migrate`** | **New v8, revised v9** |
| **D28** | **Every safety invariant the old services gave us is now explicit code with a test** | **New v8** |
| **D29** | **The SME app never sees a partner merchant's data. Accepted, not a bug** | **New v9** |
| **D30** | **Schema stays merge-compatible so a merchant can graduate later (§7.5)** | **New v9** |
| **D31** | **The existing backend's `schema.prisma` does not change at all** | **New v9** |

---

## 5. CURRENT SYSTEM AND THE CORRECTED APPROACH

### 5.1 What the new service must not disturb — nothing

In v8 this section listed invariants the shared tables imposed. **In v9 there is
nothing to disturb.** The existing backend runs against its own database; the new
service never touches it. There is no shared row, no shared constraint, no
shared migration history, and no deploy coupling.

The only obligations that survive are **internal to the new service** — the
constraints it puts on its own rows:

| Constraint | Where it comes from |
|---|---|
| `Business.merchantId` unique, prefix `WOWO` | §5.3, and the merge contract (§7.5) |
| `Invoice.invoiceNumber` unique per business, prefix `WX-` | §5.4, and the merge contract (§7.5) |
| `SalesTransaction.source` a valid enum member | §7.2 |
| `referenceId` non-null and unique per `(businessId, source)` | §7.2 — **stricter than the SME schema**, which allows null |

The last row is a genuine upgrade. In the SME schema `referenceId` is
`String?` (`schema.prisma:194`) only because existing rows predate it, so
`unique_sales_reference` (`:224`) is a nullable-sometimes constraint. In our own
database every row has one, so idempotency becomes a database guarantee rather
than a convention.

### 5.2 Tenancy — the boundary is now ours

```
Wowo (Platform row)
 └── N × Business  (owned by ONE platform User)
       ├── ExternalDevice   ← one per installed app per merchant
       └── M × Customer
             └── Sales / Expenses / Invoices
```

One `User` owns every connected `Business`. That user is **not** an admin and
**not** an SME customer with a subscription — it exists to satisfy
`Business.userId` being non-null.

**Rule:** every query in the new service takes `businessId` from the
authenticated device, never from the request body or an unscoped path segment.
A handler that accepts `body.businessId` is a cross-tenant breach.

`accountId` in the path must equal the token's `businessId`, else
`403 TOKEN_ACCOUNT_MISMATCH`. A path account that does not exist, or belongs to
another platform, returns `404` — not `403` (D15), so the surface does not
confirm which accounts exist.

### 5.3 Provisioning — now a bulk insert

`POST /accounts` is not exposed (D23). The flow is a CLI command:

```
npx tsx src/cli/provision.ts --platform wowo --file ./wowo-merchants.csv
```

Per row, one transaction:

1. Look up `(platformId, externalCustomerId)`. Found → skip, report `skipped`.
2. Insert `Business` with:
   - `userId = platform.ownerUserId`
   - `platformId`, `externalCustomerId`
   - `merchantId` from the new service's own sequence, prefix `WOWO`
   - `isActive = true`
3. Insert the owner `BusinessMember` row (the SME app's queries assume it).
4. Insert a dormant `ExternalDevice` + a one-time activation code.
5. Insert an `audit_logs` row, action `account.provisioned`.

On `P2002` for `(platformId, externalCustomerId)` → re-read and skip.

Output: CSV of `externalCustomerId, accountId, activationCode` for Wowo's
onboarding team.

**No `taxProfile`. `taxId` is never accepted** — it is `@unique`
(`schema.prisma:94`), so two merchants sharing a TIN would fail, and we do not
remit tax, so a TIN buys nothing.

**Why the `WOWO` prefix matters:** `generateMerchantId`
(`business.service.ts:26-48`) scans every business where
`merchantId LIKE 'PMTW%'`. A different prefix means our 100,000 rows never enter
that scan, so the existing backend's provisioning stays fast and we do not touch
its code. This is the single cleanest consequence of the split architecture.

### 5.4 Invoice lifecycle — the state machine we now own

The existing service's rules, reproduced exactly:

```
draft ──issue──► sent ──mark-paid──► paid
  │                │
  │                └──cancel──► cancelled
  └──delete──► (row removed + tombstone)
```

| Transition | Rules to enforce |
|---|---|
| `issue` | Only from `draft`. Sets `sentAt = now()`. **Fires nothing** — no email, no reminder |
| `mark-paid` | Only from `sent` or `overdue`. Creates the linked `SalesTransaction` **in the same transaction**. Sets `paidAt`, `paymentMethod`, `linkedSaleId` |
| `cancel` | Refused from `paid` (`409 INVOICE_PAID`). Already cancelled → `200` |
| `delete` | Only from `draft` (`409 INVOICE_NOT_DELETABLE`) |

**The linked sale must be written with:**

| Field | Value | Why |
|---|---|---|
| `businessId` | invoice's business | tenancy |
| `amount` | invoice `total` | — |
| `source` | `'api'` | D8 |
| `status` | `'confirmed'` | matches `SETTLED_SALE_STATUSES` |
| **`isTaxable`** | **`false`** | **the tax boundary** |
| `referenceId` | invoice number | matches existing behaviour |
| `transactionDate` | payment date, UTC | §5.6 |
| `metadata` | `{ invoiceId, invoiceNumber, paymentMethod, subtotal, vatAmount, discount }` | matches existing shape |

`Invoice.linkedSaleId` is `@unique` (`schema.prisma:451`) — the database enforces
one sale per invoice. `unique_sales_reference` on
`(businessId, source, referenceId)` (`:224`) enforces one sale per reference per
source. Both are your safety net; do not add a second guard that hides a bug.

### 5.5 Tax — keep the rule, demote the gate

One module owns the decision:

```ts
// src/tax-guard.ts
// The external surface never computes tax. This is the only place that decides
// a tax rate, and it always decides zero.
export const EXTERNAL_TAX = { vatRate: 0, isTaxable: false } as const;
```

Applied at every write:

| Write | Effect |
|---|---|
| Invoice create | `vatRate: 0`, `vatAmount: 0`, `total = subtotal − discount` |
| Invoice update | **Explicitly** rewrite `vatRate: 0`. Never leave a stored rate |
| Sale create | `isTaxable: false` |
| Sale created by `mark-paid` | `isTaxable: false` (§5.4) |
| Any `MonthlyTaxReport` write | None. Ever |

**Why v9 keeps this even though nothing enforces it.** In v8 a forgotten
`isTaxable: false` silently inflated a merchant's tax bill, because
`TAXABLE_SALES_WHERE` (`shared/helpers/settled-status.ts:21-24`) read the same
rows. **That cannot happen in v9** — the SME tax engine reads a different
database. So the rule is no longer a safety net; it is hygiene, for two reasons:

1. **Merge compatibility (§7.5).** If a merchant graduates to PayMyTax, their
   rows must not land in a tax report by accident on the day they arrive.
2. **It stops the new service inventing tax semantics** when someone later adds
   a reporting feature.

**The blocking test moves with the risk.** §8.1's tax tests stay, as ordinary
unit tests. **The phase gate is now Phase 3, tenant isolation** — that is the
only mistake left with a real blast radius (§1).

### 5.6 Dates

`transactionDate`, `expenseDate` and `issueDate` are `@db.Date`. Build every one
in UTC: `new Date(Date.UTC(y, m, d))`, never `new Date("2026-03-15")` and never
a local-time constructor. On a UTC+1 host the naive version records the previous
day. One helper, `src/lib/dates.ts`, and every parse goes through it.

Absurd dates are input validation, not policy: year < 2000 or > current+10 →
`400 INVALID_DATE`.

### 5.7 The endpoint surface

Carried forward unchanged from v6 §8 — this list was never the part that changed.
Base path `/api/external/v1`.

```text
POST   /auth/activate                        public (rate limited)
POST   /auth/revoke                          device token
GET    /me                                   device token, never blocked
GET    /openapi.json                         public
GET    /docs                                 public (HTML)

# connected account (one, by token)
GET    /accounts/:accountId

# customers
GET    /accounts/:accountId/customers
POST   /accounts/:accountId/customers
GET    /accounts/:accountId/customers/by-external-id/:externalId
GET    /accounts/:accountId/customers/:id
PATCH  /accounts/:accountId/customers/:id
DELETE /accounts/:accountId/customers/:id

# sales
GET    /accounts/:accountId/sales            ?updatedSince ?from ?to ?cursor ?limit
POST   /accounts/:accountId/sales
GET    /accounts/:accountId/sales/:id
PUT    /accounts/:accountId/sales/:id
DELETE /accounts/:accountId/sales/:id

# expenses
GET    /accounts/:accountId/expenses         ?updatedSince ?from ?to ?cursor ?limit
POST   /accounts/:accountId/expenses
GET    /accounts/:accountId/expenses/:id
PUT    /accounts/:accountId/expenses/:id
DELETE /accounts/:accountId/expenses/:id

# invoices
GET    /accounts/:accountId/invoices         ?updatedSince ?status ?cursor ?limit
POST   /accounts/:accountId/invoices
GET    /accounts/:accountId/invoices/:id
PUT    /accounts/:accountId/invoices/:id
DELETE /accounts/:accountId/invoices/:id
POST   /accounts/:accountId/invoices/:id/issue
POST   /accounts/:accountId/invoices/:id/mark-paid
POST   /accounts/:accountId/invoices/:id/cancel
GET    /accounts/:accountId/invoices/:id/pdf
GET    /accounts/:accountId/invoices/:id/pdf-link

# sync
GET    /accounts/:accountId/deletions        ?since ?cursor
```

**`POST …/invoices/:id/issue` is required in v9.** v6's list omitted it, but
`mark-paid` only accepts `sent` (§5.4), and without an issue endpoint an external
invoice can never leave `draft`. This was v7's headline defect; do not reproduce
it.

**Deferred out of v1** (§7.7.1): `GET …/sales/:id/pdf`,
`GET …/reports/sales.pdf`, `GET …/reports/expenses.pdf`.

**No send endpoints** (D6) — there is no `/send`, `/send-email` or
`/send-whatsapp`. Wowo delivers; we return documents.

**No account-create endpoints** (D23) — accounts come from the operator CLI
(§5.3).

Path-scoped accounts mirror the internal `/businesses/:businessId/...` shape, so
a cross-tenant mistake is visible in the URL rather than hidden in a header.

---

## 6. EDGE CASES

### 6.1 Cross-service invariants — none exist in v9

v8 listed four cases where the two services could interfere through shared
tables. **All four are impossible now**, because they read different databases.

| v8 case | v9 |
|---|---|
| SME app edits a business the platform owns | Cannot see it |
| SME app creates an invoice for a platform business | Cannot see it |
| Platform business somehow gets a `MonthlyTaxReport` | No such table in our database |
| `merchantId` collision across services | Still prevented by prefix, now belt-and-braces for the merge |

What replaces this section is the **merge contract (§7.5)** — the rules that keep
a future copy-in possible. Those are the real cross-service invariants now.

### 6.2 Lifecycle

| Case | Handling |
|---|---|
| Client retries a create after timeout | `externalRef` unique → re-read → `200` |
| Client retries `mark-paid` | Already `paid` and `linkedSaleId` set → `200` with the invoice |
| Client pays a draft | `409 INVOICE_NOT_SENT` — call `/issue` first; documented |
| Client issues an already-sent invoice | `200` with current state (idempotent) |
| Client cancels a paid invoice | `409 INVOICE_PAID` |
| Client deletes a sent invoice | `409 INVOICE_NOT_DELETABLE` — cancel instead |
| Two concurrent `mark-paid` | Both see `sent`; one wins on `linkedSaleId @unique`, the other gets `P2002` → re-read → `200` |
| Two concurrent invoice creates | Both mint the same `WX-` number → `P2002` on `(businessId, invoiceNumber)` → retry once |

### 6.3 Sync and deletes

| Case | Handling |
|---|---|
| Hard delete | Row gone + tombstone inserted, one transaction |
| Client polls `?updatedSince` | Tombstones come from `/deletions`, not from the resource lists |
| Customer delete | `isActive = false` + tombstone. The `(businessId, externalId)` pair stays reserved |
| Re-create after delete with the same `externalRef` | Succeeds — the row is gone, the unique index is clear |

### 6.4 Auth

| Case | Handling |
|---|---|
| Two devices for one merchant | Allowed by design; each holds its own token |
| Merchant changes phone | CLI issues a code on a new row and revokes the old |
| Account suspended mid-session | `403 ACCOUNT_INACTIVE`; `/me` still `200` |
| Revoked token | `401` on the next request — checked per request, never cached |

### 6.5 Month locks — gone, not deferred

The existing services call `assertMonthNotLocked` on 7 paths and throw `423`
(`shared/helpers/month-lock.ts:15-45`). **The new service has nothing to check
and no asymmetry to document.**

v8 kept this as a documented risk: if a platform business ever acquired a
`MonthlyTaxReport` row, the SME app would refuse to edit that month while the
external API kept accepting writes. In v9 **there is no `monthly_tax_reports`
table in our database at all**, so the condition cannot arise. The section is
closed rather than deferred.

If a merchant graduates to PayMyTax (§7.5), the month-lock rules apply to them
from that moment, enforced by the SME app — which is correct, because from that
moment they are filing tax.

### 6.6 Failure modes

| Case | Handling |
|---|---|
| Postgres connection exhausted | **No longer a shared limit.** Our pool is ours alone. Still cap it — 100,000 merchants is a lot of concurrent devices — but the SME app can no longer be starved by us |
| PDF generation | CPU work — never inside a transaction |
| External service down | Wowo's app retries; `externalRef` makes it safe |

---

## 7. FILE CHANGES

### 7.1 CREATE — new repository

| File | Purpose |
|---|---|
| `src/server.ts` | entry: prisma connect, app, listen, graceful shutdown |
| `src/app.ts` | Express app factory: helmet, JSON (1 MB), logger, routes, errors |
| `src/routes/{auth,accounts,customers,sales,expenses,invoices,pdf,deletions}.routes.ts` | thin routers |
| `src/middleware/auth.ts` | `authenticateDevice`, `resolveAccount`, `requirePlatformActive` |
| `src/middleware/rateLimit.ts` | activation / per-device / per-IP buckets |
| `src/middleware/logger.ts` | logging with `Authorization` + code redaction |
| `src/services/account.service.ts` | provisioning, suspend/resume, flat fee |
| `src/services/device.service.ts` | mint code, activate, verify, revoke |
| `src/services/invoice.service.ts` | **the lifecycle state machine (§5.4)** |
| `src/services/sale.service.ts` | create/update/delete + linked-sale writer |
| `src/services/expense.service.ts` | CRUD + tombstone |
| `src/services/customer.service.ts` | CRUD + `externalId` reservation |
| `src/services/sync.service.ts` | `updatedSince` + cursor + tombstones |
| `src/services/audit.service.ts` | direct `audit_logs` inserts |
| `src/services/sequence.service.ts` | merchant IDs (`WOWO`) + invoice numbers (`WX`) |
| `src/services/idempotency.ts` | replay translation |
| `src/tax-guard.ts` | **the only place that decides a tax rate — always zero** |
| `src/lib/token.ts` | 32-byte token + base32 codes, `sha256`, `timingSafeEqual` |
| `src/lib/cursor.ts` | encode/decode + query binding |
| `src/lib/dates.ts` | UTC date parsing |
| `src/pdf/commercial-invoice.pdf.ts` | **the one PDF generator (§7.7)** |
| `src/pdf/pdf-common.ts` | page chrome, money formatting, footer |
| `src/validators/*.validator.ts` | Zod `.strict()` schemas |
| `src/cli/provision.ts` | bulk account creation + activation codes |
| `src/cli/admin.ts` | suspend / resume / devices / revoke |
| `docs/openapi.json` | OpenAPI 3.1 |
| `prisma/schema.prisma` | **the complete schema for our own database** (§7.2) |
| `prisma/migrations/**` | normal Prisma migrations — we own our history (§2.4) |

### 7.2 CREATE — the whole schema, in our own database

v8 added four tables to a shared database. **v9 defines twelve, because we own
the database.** Eight are the domain tables the API actually serves; four are
partner plumbing with no SME equivalent.

| Table | Origin | Notes |
|---|---|---|
| `businesses` | our copy | + `platform_id`, `external_customer_id`, `is_active` |
| `customers` | our copy | + `external_id` |
| `sales_transactions` | our copy | + `external_ref`; **`referenceId` NOT NULL** |
| `sale_line_items` | our copy | |
| `expenses` | our copy | + `external_ref` |
| `invoices` | our copy | + `external_ref` |
| `invoice_lines` | our copy | |
| `audit_logs` | our copy | + `platform_id`, `external_device_id` |
| `platforms` | new | Wowo as a tenant |
| `external_devices` | new | device tokens |
| `external_tombstones` | new | deletions feed |
| `external_sequences` | new | `WOWO-` and `WX-` allocators |

**We do not copy the SME app's 40 other tables.** No `monthly_tax_reports`, no
`wallet_balances`, no `customer_credits`, no `tax_payments`, no subscriptions.
If a feature is not in the endpoint list (§5.7), it does not get a table.

**Required indexes** (carried from v8 §7.6, now on our own tables):
`@@index([businessId, updatedAt])` on `sales_transactions`, `expenses` and
`invoices` — the polling query depends on it. Plus
`@@unique([businessId, externalRef])` on all three, and
`@@unique([platformId, externalCustomerId])` and
`@@unique([businessId, externalId])`.

The four partner-plumbing models are unchanged from v8:

```prisma
model Platform {
  id              String    @id @default(uuid())
  name            String
  ownerUserId     String    @unique @map("owner_user_id")
  isActive        Boolean   @default(true) @map("is_active")
  suspendedAt     DateTime? @map("suspended_at")
  suspendedReason String?   @map("suspended_reason")
  flatFeeNgn      Decimal?  @map("flat_fee_ngn") @db.Decimal(12, 2)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  @@map("platforms")
}

/// One row per installed app per merchant. Dormant until activated.
model ExternalDevice {
  id             String    @id @default(uuid())
  platformId     String    @map("platform_id")
  businessId     String    @map("business_id")
  codeHash       String?   @unique @map("code_hash") @db.VarChar(64)
  codeExpiresAt  DateTime? @map("code_expires_at")
  codeAttempts   Int       @default(0) @map("code_attempts")
  tokenHash      String?   @unique @map("token_hash") @db.VarChar(64)
  expiresAt      DateTime? @map("expires_at")
  deviceName     String?   @map("device_name")
  devicePlatform String?   @map("device_platform")
  activatedAt    DateTime? @map("activated_at")
  lastSeenAt     DateTime? @map("last_seen_at")
  revokedAt      DateTime? @map("revoked_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  @@index([platformId, businessId])
  @@index([businessId, revokedAt])
  @@map("external_devices")
}

/// Deletions, so a polling client can see them. No FK — must outlive a business.
model ExternalTombstone {
  id         String   @id @default(uuid())
  businessId String   @map("business_id")
  entityType String   @map("entity_type") // 'sale' | 'expense' | 'invoice' | 'customer'
  entityId   String   @map("entity_id")
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([businessId, createdAt])
  @@map("external_tombstones")
}

/// One row per allocator. 'merchant' → WOWO0000001, 'invoice:{businessId}' → WX-2026-001
model ExternalSequence {
  key   String @id
  value Int    @default(0)
  @@map("external_sequences")
}
```

### 7.3 MODIFY — existing backend (zero files)

**v9 changes nothing in `backend/`.** v8's five-file list is withdrawn in full.

Two things to understand about why:

1. **The columns were only needed because the tables were shared.** `platform_id`,
   `external_ref` and friends are now columns on **our** tables (§7.2).
2. **v8's `SalesSource.api` claim was wrong anyway.** It said adding the enum
   value would break `sales-receipt.pdf.ts:19`, `sales-report.pdf.ts:46` and
   `statement.service.ts:391`. Re-checked on 2026-11-10: the first is a literal
   union on an *interface field*, not derived from the Prisma enum; the other two
   are `Record<string, string>` with fallbacks. There is no `Record<SalesSource, …>`
   anywhere in `src/`. The addition would have been one migration and zero code
   changes — see §2.7.

**Optional hedge — do this only if you want a merge to be a pure copy.** Add
`api` to the `SalesSource` enum in `backend/prisma/schema.prisma`
(`:551-561`, currently 9 members, CONFIRMED no `api`). One migration, no code
changes, and it removes one step from a future graduation (§7.5). Skip it if you
prefer `backend/` to stay completely untouched.

**DO NOT TOUCH** in the existing backend:

| Thing | Why |
|---|---|
| `src/lib/sales-import/template.ts` `SOURCE_VALUES` | SME spreadsheet dropdown — deliberately narrower |
| `src/services/**` (all other services) | We do not call them |
| `src/middleware/subscription.ts` | Not our surface |
| `src/lib/ownership.ts` | We do not use it |
| `src/lib/audit.ts` | We write audit rows directly |
| `Business.user` foreign key | Leave `Cascade` |
| `src/shared/helpers/month-lock.ts` | Do not weaken it for this feature |
| All 12 PDF generators | Not duplicated — see §7.7 |

### 7.4 DATABASE — our own Postgres, our own migrations

**One Railway Postgres, ours alone.** The existing backend keeps its own
`DATABASE_URL` and is not involved.

| Thing | Ours | The SME app's |
|---|---|---|
| Postgres instance | ✅ | ✅ (separate) |
| `DATABASE_URL` | ✅ own | ✅ own |
| `_prisma_migrations` table | ✅ own | ✅ own (78 rows, untouched) |
| `prisma migrate deploy` on start | ✅ correct | ✅ correct |

**The start command is `npm start`.** v8's instruction to override it with
`node dist/server.js` is **withdrawn** — that override existed only to stop the
new service polluting the SME app's migration table, which it can no longer
reach.

**Operational requirements:**

- Separate backup schedule. The SME app's `npm run db:backup` does not cover
  this database, and a partner-merchant's ledger is not something to leave
  unprotected.
- Cap the connection pool. Not because it competes with the SME app — it does
  not — but because 100,000 devices will arrive at once and Postgres has a hard
  connection limit.
- Use the pooled connection string if Railway provides one.

**Why v8 rejected this:** because the SME app had to see partner merchants'
records. That requirement is now explicitly dropped (D29). The remaining
justification for one database was "a second database means copying data between
them" — and that is exactly what §7.5 keeps cheap.

### 7.5 The merge-compatibility contract

We do not know whether a Wowo merchant will ever file tax with PayMyTax. If one
does, moving them in must be a **copy**, not a rewrite. This section is the whole
of what that costs us.

**The hardest part is already solved.** Every primary key in the SME schema is
`String @id @default(uuid())` (`schema.prisma:90, 189, 239, 375, 397, 428`,
CONFIRMED). A row copied from our database cannot collide with an existing one.
No renumbering, no mapping table.

**The contract — six rules:**

| Rule | Why | Consequence if broken |
|---|---|---|
| Same table names, same column names | A merge is `INSERT … SELECT` | A transform script, and a new chance for bugs |
| Same types — `Decimal(12,2)` / `(15,2)`, `DateTime`, enums | Silent truncation is the classic merge bug | Money silently wrong after a migration |
| Same enum members | Copy `SalesSource`, `TransactionStatus`, `InvoiceStatus` wholesale | Enum value mismatch on insert |
| UUID primary keys | Already true | — |
| `WOWO-` merchant IDs, `WX-` invoice numbers | Also required by §5.3/§5.4 | `@unique` collision on `merchantId` |
| **Never repurpose a shared-named column** | If our `sales_transactions.status` means something different from theirs, the merge stops being a copy | **The one rule that actually costs money to break** |

**The graduation script, for reference — do not build it in v1:**

1. Insert their `businesses` row with the same `id`, pointing `userId` at a real
   PayMyTax user.
2. Insert `customers`, `sales_transactions`, `sale_line_items`, `expenses`,
   `invoices`, `invoice_lines`, `audit_logs` filtered by that `businessId`.
3. Rewrite `merchantId` from `WOWO…` to `PMTW…` if the SME app requires it.
4. Ensure `SalesSource.api` exists in the SME enum (see §7.3 — one migration).
5. Mark the account migrated, or delete it here.

Steps 1–3 are a script. Step 4 is one line. Nothing here blocks v1.

**What v9 withdraws:** v8's CI job that diffed the two `schema.prisma` files.
They describe two different databases now, so drift cannot break either service.
The contract above is a written rule, not an automated gate.

### 7.6 Partner columns — on our own tables, and stricter than v8

In v8 these columns were nullable because the SME app also wrote those tables.
**We are the only writer now, so the constraints tighten:**

| Table | Columns | v8 | v9 |
|---|---|---|---|
| `businesses` | `platform_id`, `external_customer_id`, `is_active` | nullable, many `NULL` pairs allowed | **`NOT NULL`**, `@@unique([platformId, externalCustomerId])` |
| `customers` | `external_id` | `@@unique([businessId, externalId])` | same, **`NOT NULL`** |
| `sales_transactions`, `expenses`, `invoices` | `external_ref` | nullable, `@@unique([businessId, externalRef])` | **`NOT NULL`** + unique |
| `sales_transactions` | `referenceId` | `String?` (inherited) | **`NOT NULL`** — idempotency is a real constraint (§5.1) |
| `audit_logs` | `platform_id`, `external_device_id` | nullable | `NOT NULL` |

Plus `@@index([businessId, updatedAt])` on `sales_transactions`, `expenses` and
`invoices` — the polling query behind `?updatedSince` depends on it. All
three have `updatedAt` in the SME schema (`schema.prisma:199`, `:250`, `:453`),
so keep the same column name and type (§7.5).

**Why `NOT NULL` matters here:** in v8, `external_ref` had to be nullable, so
"unique external ref" was a promise about rows that happened to have one. In v9
every row has one, so the constraint is unconditional and a duplicate write
fails at the database rather than in application code.

### 7.7 PDFs — build one commercial invoice (DECIDED)

The 12 generators in `backend/src/services/pdf/**` cannot be imported. They also
depend on internal modules the new repo does not have: `receipt-common.pdf`
(brand font registration), `@/lib/pdf-utils` (`fetchLogoForPdf`), `@/config`.

**Decision: build one purpose-built commercial invoice PDF in the new service.**
Do **not** duplicate `invoice.pdf.ts` — it is ~400 lines plus brand fonts, and it
would drift from the SME app's copy the first time either changes.

The external invoice is a *different document* anyway (D19: "COMMERCIAL INVOICE"
plus a FIRS non-fiscal disclaimer), so this is not duplication — it is a separate
artefact that happens to share a layout.

#### 7.7.1 Scope

| In v1 | Out of v1 |
|---|---|
| `GET …/invoices/:id/pdf` → `application/pdf` | Sale receipts |
| `GET …/invoices/:id/pdf-link` → `{ url, shareToken }` | Sales / expense report PDFs |
| | Ledger, P&L, tax slips, DVA receipts |

Only the invoice. Everything else is deferred until Wowo asks.

#### 7.7.2 Stack

`pdfkit` (already the SME app's library, `package.json`) plus its types. No brand
fonts, no logo fetch, no shared helpers — the new service is self-contained. Use
the four standard PDF base-14 fonts (`Helvetica`, `Helvetica-Bold`) so there are
no font files to ship.

#### 7.7.3 Page layout

A4 portrait, 40 pt margins, one page for ≤ 12 line items, then a continuation
page with `COMMERCIAL INVOICE · page N` in the header.

```
┌──────────────────────────────────────────────────────┐
│  <business name>                      COMMERCIAL     │
│  <address, city, state>               INVOICE        │
│  <phone / email>                                     │
│  ──────────────────────────────────────────────────  │
│  Invoice no.  WX-2026-001      Issue date  15 Mar 26 │
│  Bill to:     <customer name>  Due date    30 Mar 26 │
│               <address>        Status      Sent      │
│  ──────────────────────────────────────────────────  │
│  DESCRIPTION                QTY    UNIT     AMOUNT   │
│  <line>                      2    ₦5,000   ₦10,000   │
│  …                                                   │
│  ──────────────────────────────────────────────────  │
│                            Subtotal      ₦10,000     │
│                            Discount      −₦500      │
│                            Total         ₦9,500      │
│  ──────────────────────────────────────────────────  │
│  <footer disclaimer>                                 │
│  Page 1 of 1                                         │
└──────────────────────────────────────────────────────┘
```

#### 7.7.4 Mandatory content rules

| Rule | Reason |
|---|---|
| Title is **`COMMERCIAL INVOICE`** | Never `TAX INVOICE`, `VAT INVOICE` or `FIRS INVOICE` |
| **No VAT line** is ever rendered | D2/D3 — there is no VAT. Do not print "VAT: ₦0"; omit the row |
| Total = `subtotal − discount` | Matches the stored `Invoice.total`; never recomputed |
| Amounts come from the **stored row**, never from config or today's settings | A PDF must not change because a setting changed |
| Currency is the invoice's stored `currency` (default `NGN`) | |
| Footer disclaimer verbatim (below) | D19 |
| No QR, no signature, no "verified" language | These are not tamper-evident documents |

Footer text, exactly:

> This is a commercial billing document generated via Wowo. This document does
> not constitute a statutory FIRS Tax Invoice, VAT receipt or tax return filing.
> Statutory tax compliance and fiscalisation (if required by applicable law)
> remain the sole responsibility of the billing entity.

#### 7.7.5 HTTP behaviour

| Concern | Rule |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="WX-2026-001.pdf"`; `?disposition=inline` for the OS viewer |
| `Cache-Control` | `private, max-age=60` |
| `Referrer-Policy` | `no-referrer` — the `pdf-link` is a capability |
| Cancelled invoice | `410 INVOICE_CANCELLED` (matches SME app, `invoice-delivery.service.ts:144`) |
| Deleted invoice | `404` — the row is gone, the share token resolves to nothing |
| Generation | **Outside any transaction.** PDF is CPU work |
| `pdf-link` | Reuse the existing `Invoice.shareToken` (`@unique`, `schema.prisma:458`). Do not invent a second token type |

#### 7.7.6 Cost

~6 h: 4 h generator, 1 h routes and headers, 1 h tests. Three tests are enough:
no VAT line, disclaimer present, title is not a tax invoice.

**Do not** describe these PDFs as tax invoices or as verifiable.

### 7.8 CONFIGURATION

```text
DATABASE_URL=<our own Postgres, pooled connection string>
EXTERNAL_API_ENABLED=true
PLATFORM_FLAT_FEE_NGN=0
EXTERNAL_DATA_RATE_LIMIT=120
EXTERNAL_ACTIVATION_RATE_LIMIT=10
```

No new secrets. No pepper, no token secret.

**`DATABASE_URL` points at a different database from the SME app's.** That is the
one config change that matters, and it is the whole of v9. Do not copy the SME
app's value.

### 7.9 TESTS — new repository

| Suite | Covers |
|---|---|
| `tests/unit/token.test.ts` | generate/hash/verify, tamper, code lockout |
| `tests/unit/dates.test.ts` | UTC boundary at 23:59 UTC+1 |
| `tests/unit/cursor.test.ts` | round-trip + query binding |
| `tests/unit/sequence.test.ts` | concurrent allocation, no gaps that matter |
| `tests/integration/tax-boundary.test.ts` | §5.5 — ordinary unit tests in v9, not a gate |
| `tests/integration/tenancy.test.ts` | four isolation negatives |
| `tests/integration/invoice-lifecycle.test.ts` | issue → mark-paid → replay |
| `tests/integration/idempotency.test.ts` | replay semantics |
| `tests/integration/provisioning.test.ts` | 100 accounts, re-run, concurrency |
| `tests/integration/merge-rehearsal.test.ts` | **the §7.5 graduation script inserts one account into a scratch SME-schema database** |

**`sme-compat.test.ts` is deleted in v9** — there are no shared tables to be
compatible with. `merge-rehearsal.test.ts` replaces it and proves the same thing
that still matters: that a merchant *could* be moved into PayMyTax without a
schema fight.

---

## 8. IMPLEMENTATION STEPS

### Phase 0 — Scaffold and the tax guard (4 h)

| ID | What | Done when |
|---|---|---|
| P0.1 | Repo, Railway Postgres, `DATABASE_URL` pointing at **our** database | `prisma db pull`/`push` reaches it |
| P0.2 | `tax-guard.ts` constant + its tests (§5.5) | unit tests pass — no longer a gate |
| P0.3 | Invoice create/update force `vatRate: 0` | invoice test passes |
| P0.4 | Sale create and `mark-paid` force `isTaxable: false` | mark-paid test passes |

**The gate moved.** v8 put the tax boundary first because a mistake there was
silent and expensive. In v9 the equivalent risk is tenancy, and it is gated at
**Phase 3**.

### Phase 1 — Schema and sequences (6 h)

| ID | What | Done when |
|---|---|---|
| P1.1 | `prisma/schema.prisma`: the 12 tables of §7.2, names and types matching the SME schema | `prisma generate` clean |
| P1.2 | First migration applied to our own database | `prisma migrate deploy` succeeds, `_prisma_migrations` has 1 row |
| P1.3 | `sequence.service.ts` — `WOWO` merchant IDs, `WX-` invoice numbers | concurrent allocation test passes |

**P1.3 is gone** (no existing-backend edits) and **P1.5 is gone** (no CI diff).
If you took the optional `SalesSource.api` hedge in §7.3, it is one migration in
`backend/`, tracked separately and not blocking.

### Phase 2 — App, device auth, audit (14 h)

`app.ts`, `server.ts`, `/health`, `/me`, `/auth/activate`, `/auth/revoke`,
`authenticateDevice`, `resolveAccount`, `requirePlatformActive`, logger
redaction, rate limits, direct audit inserts.

**Order matters:** `/me` must be mounted **before** `requirePlatformActive`,
otherwise a billing lapse becomes a 2 a.m. incident.

### Phase 3 — Tenant isolation hardening (8 h) — **gate**

Four negative tests: foreign account → `404`; token on wrong account → `403`;
revoked → `401`; expired → `401`. Plus a grep assertion that no handler reads
`body.businessId`.

**Do not proceed to Phase 4 until this is green.** With
`verifyBusinessAccess` gone, this is the only thing standing between a bug and a
cross-tenant breach.

### Phase 4 — Customers, sales, expenses (18 h)

CRUD, `externalRef` idempotency, tombstones, cursor + `updatedSince`.

### Phase 5 — Invoices and the commercial PDF (22 h)

| ID | What | Done when |
|---|---|---|
| P5.1 | §5.4 state machine: `issue`, `mark-paid` (with the linked sale), `cancel`, `delete` (draft only) | issue → mark-paid → replay = one sale, one `200` |
| P5.2 | `pdf-common.ts` + `commercial-invoice.pdf.ts` (§7.7.3, §7.7.4) | Renders a one-page invoice from a stored row |
| P5.3 | `GET …/invoices/:id/pdf` + `?disposition` + headers (§7.7.5) | `application/pdf`, stable filename |
| P5.4 | `GET …/invoices/:id/pdf-link` via existing `shareToken` | Link works with no credential; deleted → `404`, cancelled → `410` |
| P5.5 | Three PDF tests (§7.7.6) | No VAT line, disclaimer present, title is not a tax invoice |

**Out of scope for v1:** sale receipts, report PDFs (§7.7.1).

### Phase 6 — Sync completion (6 h)

`/deletions`, cursor query binding, `EXPLAIN ANALYZE` on the change query.

### Phase 7 — Spec, docs, CLI (8 h)

`openapi.json`, `/docs`, client integration guide, `provision.ts`, `admin.ts`.

### Phase 8 — REMOVED in v9

v8's SME compatibility pass tested that the existing backend's suites still
passed against a database containing externally-written rows. **There is no such
database.** The phase is deleted, and so is the `sme-compat.test.ts` suite.

What replaces it, at ~1 h, is a **merge-rehearsal test** in our own repo: seed a
scratch copy of the SME schema, run the graduation script from §7.5 against one
provisioned account, and assert the rows insert without a type or uniqueness
error. That is the same assurance, without needing both services live.

**v9 total: 87 h.** Phase 0 (4) + Phase 1 (6) + Phase 2 (14) + Phase 3 (8) +
Phase 4 (18) + Phase 5 (22) + Phase 6 (6) + Phase 7 (8) + merge rehearsal (1).
**Pilot (Phases 0–5): 72 h.**

---

## 9. ACCEPTANCE CRITERIA

### 9.1 Tax hygiene (not blocking in v9)

- [ ] Invoice created externally for a business with no tax profile has `vatRate = 0`, `vatAmount = 0`, `total = subtotal − discount`
- [ ] Marking it paid creates a linked sale with `isTaxable = false`
- [ ] External sales carry `source = 'api'` and `isTaxable = false`
- [ ] Our database contains **no** `monthly_tax_reports` table at all
- [ ] A sale written by the new service cannot reach the SME app's `TAXABLE_SALES_WHERE` — **true by construction**, different database (§7.4)

**Tenancy is the blocking criterion now — see §9.3.**

### 9.2 Invoice lifecycle

- [ ] A fresh external invoice is `draft`; `mark-paid` on it returns `409 INVOICE_NOT_SENT`
- [ ] `/issue` moves it to `sent` and dispatches **no** email and **no** reminder
- [ ] After issue, `mark-paid` succeeds and creates exactly one sale
- [ ] `mark-paid` twice → `200` twice, one sale
- [ ] `cancel` on a paid invoice → `409`; on a cancelled one → `200`
- [ ] `delete` on a non-draft → `409`

### 9.3 Tenancy and auth — **the blocking criteria in v9**

- [ ] An activation code issues exactly one device token; the code cannot be reused
- [ ] Token on another account → `403`; revoked → `401`; expired → `401`
- [ ] A nonexistent or foreign account id → `404`, not `403`
- [ ] No secret ships in the client

### 9.4 Merge compatibility (replaces v8's cross-service checks)

- [ ] Table and column names for the 8 domain tables match the SME schema exactly
- [ ] Column types match — `Decimal(12,2)` / `Decimal(15,2)`, `DateTime`, enum members
- [ ] All primary keys are `uuid`, never sequential
- [ ] `merchantId` is always `WOWO…`; `invoiceNumber` is always `WX-…`
- [ ] No shared-named column has been given a different meaning from the SME schema (§7.5)
- [ ] The graduation script inserts one account's rows into a scratch SME-schema database without error

**Removed from v8:** "the SME app's test suites pass unchanged" (nothing changed),
and "only one service runs migrations" (each owns its own).

### 9.5 Commercial invoice PDF

- [ ] `GET …/invoices/:id/pdf` returns `application/pdf` with a stable filename
- [ ] The document title reads `COMMERCIAL INVOICE` — never `TAX INVOICE` or `VAT INVOICE`
- [ ] **No VAT line appears anywhere on the document**
- [ ] The FIRS non-fiscal disclaimer footer is present, verbatim (§7.7.4)
- [ ] Totals equal the stored `Invoice` row; changing a config value does not change a re-rendered PDF
- [ ] `pdf-link` serves the same document with no credential; a deleted invoice → `404`, a cancelled one → `410`

### 9.6 Operations

- [ ] `Platform.isActive = false` → `403` everywhere but `/me`
- [ ] `EXTERNAL_API_ENABLED=false` → `503` on API routes; `/health` still `200`
- [ ] No token or activation code appears in any log file
- [ ] Our database has its own backup schedule, separate from the SME app's
- [ ] The new service's deploy log **does** show `migrate deploy` — against its own database (§7.4)

---

## 10. REMAINING QUESTIONS

**Closed in v9:** migration ownership (§2.4). Nothing to pick.

**Open, and blocking something:**

| # | Question | Blocks |
|---|---|---|
| 1 | **Partner-merchant admin** — endpoints in the new service, a read-only view in the SME admin portal, or operator CLI only for v1? | Phase 7. **Recommended: admin endpoints in the new service** — the CLI already lives there, same auth model, no new service-to-service credential |
| 2 | **Activation code delivery** — who sends the code to the merchant, and how? | Phase 2 |
| 3 | **Fee amount** — structure built, number pending | Phase 7 |
| 4 | **Pilot size** — recommend 25–50 accounts before committing to 100,000 | Phase 4 |

**Open, not blocking:**

| # | Question |
|---|---|
| 5 | **Railway project layout** — one project with two services, or two projects? Only affects env var duplication now; the `railway.json` start-command override is no longer needed (§7.4) |
| 6 | **Graduation tooling** — build the §7.5 merge script in v1, or handle the first merchant manually? Recommend manual until someone actually asks |

**Settled:** the commercial invoice PDF is built in the new service (§7.7), not
duplicated from the SME app. The database is ours alone (§7.4). The existing
backend is untouched (§7.3).

---

## 11. FINAL READINESS SCORE

**9/10** — *ready to build*, up from v8's 7/10.

**Why it went up:** the separate database removed the two things that made v8
hard — a shared migration table (§2.4) and a shared tax engine (§5.5). It also
removed every edit to `backend/` (§7.3), so this project cannot regress the
PayMyTax app at all. The build is ~4 hours smaller and the pilot ~5 hours smaller,
and the one decision that blocked Phase 1 is closed.

**Why not 10:**
- **Tenant scoping is now the single red risk** and it is hand-written. A mistake
  leaks one merchant's data to another. Phase 3 gates it, but it is still the
  thing to be careful about.
- The merge contract (§7.5) is a written rule with no automated enforcement. It
  is cheap to follow and expensive to break.
- Two open questions still block phases: admin surface (#1) and activation code
  delivery (#2).

**What is solid:**
- Every existing-backend fact in §2.7 was verified line by line, and the three
  `SalesSource` claims v8 got wrong are corrected with the evidence.
- The existing backend needs no deploy coupled to this project.
- The tax rule survives as a constant with tests, so the merge door stays open.
- The tenancy boundary is a phase gate, not a checklist item.

**What would make it a 10:**
1. Migration ownership decided and documented (§7.4).
2. One green end-to-end test: provision → activate → create invoice → issue →
   mark-paid → replay → render the PDF → verify the sale is invisible to the SME
   tax query.
