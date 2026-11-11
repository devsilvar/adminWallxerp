# External API — Wowo Platform Service — Implementation Plan v11

> **THIS IS THE PLAN. It is the only plan document.** Everything needed to design,
> build, test and operate the service is in this file: rationale (§0), data model
> (§5), contract (§7), phases (§11), tests (§12) and acceptance criteria (§13).
>
> The former `docs/external-api-plan.md` companion was folded into this file on
> 2026-11-11 and archived: its rationale is §0, its merge-compatibility contract is
> §5.5, its enum-parity evidence is §5.7 and its migration discipline is §14. The
> companion now lives at `docs/archive/external-api-plan-v11.md` — historical only,
> like the superseded v6, v9 and v10 plans beside it. Do not work from any of them.
>
> **v11 closes the v10 review.** It settles the payment-channel and expense
> taxonomies, takes expenses out of tax entirely, closes the `referenceId` /
> invoice-number collision, hardens the public PDF capability link, adds merchant
> self-service profile editing, makes the tenancy gate structural instead of a
> grep, and replaces the pilot-volume load test with a capacity model.
>
> **Re-reviewed against the repository on 2026-11-11.** Every `backend/` citation was
> re-verified against source; three were corrected (`:107`, `:161`, 77 migrations).
> Six substantive gaps were closed: the account-level kill switch is now enforced by
> middleware rather than merely declared, `external_admins` gained the expiry and
> allowlist columns Phase 8 requires, `invoices.externalRef` is now required, the
> `onDelete: Restrict` on `Invoice.linkedSale` is specified, sequence allocation is
> mandated atomic, and the core-table DDL instructions and merge-script caveats are
> complete.
>
> Facts about `backend/` below were re-read from the repository on **2026-11-10**.
> Line numbers are from that date.
>
> Legend: **CONFIRMED** = read from the repository · **LIKELY** = inferred ·
> **UNVERIFIED** = needs a runtime check, vendor docs, or client input.

---

## 0. CONTEXT AND RATIONALE

### 0.1 The problem

Wowo has ~100,000 small businesses that need somewhere to record **sales, invoices
and expenses**. We already built that. They want an API their mobile app can call.
It must not slow down or break our own PayMyTax app.

That last sentence is the entire design constraint. Everything below follows from it.

### 0.2 What the architecture buys us

The shape is settled (§4): a **new repository, a new Railway service, a new
Postgres**. Nothing is shared with the SME app at runtime. That buys:

| Win | Why it matters |
|---|---|
| **Total isolation** | A runaway Wowo client cannot touch SME-app latency. The kill switch is a real switch, and so is the database |
| **Migration freedom** | The new service runs `prisma migrate deploy` like any normal app. No shared `_prisma_migrations`, no drift, no options to pick |
| **No guardrail copying for safety** | We lose `verifyBusinessAccess` and friends, but the *tax* consequences of getting it wrong are gone. A scoping bug is a bug, not a silent tax inflation |
| **No refactor** | We do not extract shared packages and do not restructure `src/services/**` |
| **Four blockers vanish** | We write rows directly, so we never call `createBusiness`, `checkBusinessLimit` or `generateMerchantId` |
| **A clean schema** | `businesses`, `sales_transactions` and `invoices` are defined fresh — no 40 legacy tables, no nullable-because-of-history columns |
| **Independent scaling** | Scale the partner API without touching the SME app, including its database |

### 0.3 What we give up — say it out loud

**The SME app will never show a Wowo merchant's sales, invoices or customers.**
There is no query that crosses the two databases.

- No cross-sell inside our own app. A Wowo merchant cannot be shown "your tax report
  is ready", because we do not hold their rows.
- The partner-merchant admin view lives in the **new** service (§7.3), not the SME
  admin portal.
- Any combined report — "total sales across both products" — is two queries and a
  merge in application code, or a warehouse later. Not a SQL join.

This is accepted on the basis that **Wowo's merchants are Wowo's customers**, and it
is unknown whether any of them will ever file tax with us. That uncertainty is why
§5.5 keeps a future merge cheap: so the door stays open at low cost.

### 0.4 What we lose and must re-implement

A separate repository cannot import `src/services/**`. Every guardrail the SME
services give us for free becomes code we write and test ourselves:

| Guardrail | What it did | What replaces it |
|---|---|---|
| `verifyBusinessAccess` | Proved the caller owns the business | **We scope every query ourselves.** This is the tenant boundary now — if it is wrong, every merchant sees everyone's data (§11 Phase 3) |
| `resolveTaxPolicy` | Decided the VAT rate | **We always write `vatRate: 0`.** Nothing computes VAT (§8.3) |
| `isTaxable: true` literal | Marked sales as taxable revenue | **Always `isTaxable: false`** — for merge compatibility, not safety |
| `isDeductible: true` default | Made an expense a tax deduction | **Always `isDeductible: false`.** Expenses here are bookkeeping records only (D38) |
| `assertMonthNotLocked` | Blocked edits to finalised months | **We do not check.** Platform businesses never finalise, so no lock exists to hit (D7) |
| `logAudit` | Wrote audit rows | **We write `audit_logs` rows ourselves** |
| `generateInvoiceNumber` | Minted `INV-YYYY-NNN` | **We mint `WX-YYYY-NNN`** from our own sequence (§5.2) |
| 12 PDF generators | Rendered invoices and receipts | **Not importable.** We build one commercial-invoice PDF (§8.4) |

**The most dangerous line has moved.** In v8 it was a missing `isTaxable: false`. It
is now **tenant scoping**: with the database no longer shared, a scoping mistake does
not inflate a tax bill — it leaks one merchant's data to another. That is worse,
which is why Phase 3 is a hard gate and why v11 made it structural rather than a
convention.

### 0.5 How a request flows

```text
Client app
   │  Authorization: Bearer <device token>
   ▼
New service  (/api/external/v1/...)
   │
   ├── authenticateDevice    → "which account does this token belong to?"  401
   ├── rateLimit             → "has this device used too much?"            429
   ├── resolveAccount        → "does the path account match the token?"    404
   ├── requirePlatformActive → "is the platform suspended?"                403
   ├── requireAccountActive  → "is this account suspended?"                403
   ├── requireSubscription   → "is the month paid?"                        402
   ├── tax-guard             → vatRate 0, isTaxable false, isDeductible false
   ├── idempotency           → "did we already do this exact request?"
   ▼
Scoped query layer  (businessId injected into every where — §11 Phase 3)
   ▼
Own Prisma client → own Postgres
```

The order is deliberate: authenticate, then cost control, then the tenancy decision,
then entitlement. `/me` is mounted ahead of the last two so a lapsed account can
still read its own expiry date (§6.5).

---

## 1. EXECUTIVE VERDICT

**PLAN IS BUILDABLE FOR THE PILOT.** v11 closes every defect the v10 review
found. The architecture is unchanged and correct: separate repository, separate
Railway service, separate Postgres, zero changes to `backend/`.

What v11 adds that v10 lacked:

| Addition | Why it mattered |
|---|---|
| **Settled enumerations** (§5.7) — 15 payment channels, 27 expense categories | The v10 lists were missing card, mobile money, USSD, cheque, power, statutory contributions — merchants would have had no correct value to send |
| **Expenses out of tax** (D38) — `isDeductible: false` on every external expense | v10 left it on a database default of `true`; expense rows feed `idx_expense_tax_calc` |
| **`referenceId` namespace reserved** (D45) | A client could pre-create a sale whose reference collides with a future invoice number, corrupting `mark-paid` |
| **Structural tenancy gate** (§11 Phase 3) | A `body.businessId` grep does not catch an unscoped `where` on a nested route — the actual attack |
| **Capacity model** (§14.1) | v10 load-tested 25–50 accounts and called it scale |
| **Security and legal gate** (§11 Phase 9) | No pen test, DPIA, DPA or breach runbook existed anywhere in the plan |

**The single red risk is unchanged: tenant scoping.** With `verifyBusinessAccess`
gone (`lib/ownership.ts:162-164`, CONFIRMED) and the database private, a scoping
mistake leaks one merchant's data to another. Phase 3 gates it, and v11 makes
that gate structural rather than a convention.

**What v11 does not fix, because it is not ours to fix:** the plan is a pilot
plan that can be operated to 100,000 accounts, but the transaction volume per
merchant is still unknown (§15 #6). Partitioning thresholds in §14.1 are
estimates until Wowo answers that.

---

## 2. DECISIONS LOCKED

| # | Decision | Status |
|---|---|---|
| D1 | Scope is **sales, invoices, expenses** only | Settled |
| D2 | **No tax computed.** No VAT, PAYE, FIRS, statements, remittance | Settled |
| D3 | **No tax fields in the payload.** External invoices are always 0% VAT | Settled |
| D4 | KYC is Wowo's. We store what they send | Settled |
| D5 | Wowo has no backend; the mobile app is the only consumer at launch | Settled |
| D6 | Wowo delivers invoices. We return documents; we never send them | Settled |
| D7 | **No lock bypass — locks are simply not checked** | Settled |
| D8 | External sales carry `source = 'api'` | Settled |
| D9 | One flat fee, invoiced out of band. **Fee is now backed by an entitlement expiry (§6.5)** | **Revised v10** |
| D10 | Tenancy is platform-owned businesses — one platform `User` owns all accounts | Settled |
| D11 | The end customer is a resource reference, not a principal | Settled |
| D12 | No webhooks. Wowo polls with `updatedSince` + cursor | Settled |
| D13 | External deletes are hard deletes + a tombstone row | Settled |
| D14 | No platform API key in v1 — **but the columns exist from day one (§6.6)** | **Revised v10** |
| D15 | Account scoped in the path; **any account that is not the token's account → 404** | **Corrected v10** |
| D16 | Three-layer kill switch: env → platform → account, **each enforced by its own middleware** (`API_DISABLED` / `PLATFORM_SUSPENDED` / `ACCOUNT_INACTIVE`) | Settled |
| D19 | Commercial Invoices only. FIRS non-fiscal disclaimer | Settled |
| D20 | NDPA via data minimisation & B2B DPA. Wowo is Controller | Settled |
| D21 | OpenAPI **generated from the Zod validators**, served at `/docs` | **Revised v10** |
| D22 | One credential: per-account device token from a one-time activation code | Settled |
| D23 | Provisioning is operator-side CLI, not an HTTP endpoint | Settled |
| D24 | No `Idempotency-Key` header. `referenceId` (sales) / `externalRef` (expenses, invoices) | **Corrected v10** |
| D25 | Separate repository (`devsilvar/external_wallxerpapi`), separate Railway service, separate Postgres | Settled |
| D26 | New service writes rows directly; it never calls the existing backend | Settled |
| D27 | New service owns its whole schema and runs its own `prisma migrate` | Settled |
| D28 | Every safety invariant the old services gave us is explicit code with a test | Settled |
| D29 | The SME app never sees a partner merchant's data. Accepted, not a bug | Settled |
| D30 | Schema stays merge-compatible so a merchant can graduate later (§5.5) | Settled |
| D31 | **The existing backend's `schema.prisma` does not change at all** — the `SalesSource.api` hedge is dropped | **Corrected v10** |
| **D32** | **Device tokens are long-lived and revocable. No expiry by default; optional `expiresAt`; `POST /auth/rotate` swaps a token without a new code** | **New v10** |
| **D33** | **Activation codes are minted just-in-time, one per merchant. Never bulk-exported. TTL 72 h, single use, attempt-limited per source IP** | **New v10** |
| **D34** | **Admin surface = endpoints in the new service, built in Phase 8 (last)** | **New v10** |
| **D35** | **Entitlement gate: platform-level `subscriptionExpiresAt` (per-account optional). Expired → `402 SUBSCRIPTION_EXPIRED`; `/me` stays reachable** | **New v10** |
| **D36** | **No credential `kind` discriminator. A future server-to-server key lives on `Platform` as nullable columns, unused in v1** | **New v10** |
| **D37** | **Money is transmitted as decimal strings (`"15000.00"`), never floats** | **New v10** |
| **D38** | **External expenses carry `isDeductible: false`. No expense on this surface feeds a tax computation** | **New v11** |
| **D39** | **`discount ≤ subtotal`. A discount above subtotal is `400 INVALID_DISCOUNT`; `total` can never be negative** | **New v11** |
| **D40** | **Sync is at-least-once. Clients upsert by `id`. A row updated mid-scan may be delivered twice** | **New v11** |
| **D41** | **Expense receipt/document is optional. `receiptUrl` is a nullable string supplied by Wowo; no upload endpoint in v1** | **New v11** |
| **D42** | **Merchants edit their own profile via `PATCH /accounts/:accountId`. `merchantId`, `taxId`, `subscriptionExpiresAt` and `isActive` are never merchant-editable** | **New v11** |
| **D43** | **Rate limiting is an in-memory token bucket divided by a declared `INSTANCE_COUNT`, decided in Phase 2 — not deferred** | **New v11** |
| **D44** | **`SalesSource` and `ExpenseCategory` in the new service are supersets of the SME enums. `backend/` stays untouched; graduation adds the missing members first (merge step 4)** | **New v11** |
| **D45** | **Client-supplied `referenceId` may not match `^WX-`. That namespace is reserved for invoice-linked sales** | **New v11** |
| **D46** | **The new service's `vat_rate` column defaults to `0`, not `7.5`** | **New v11** |
| **D47** | **`businesses` carries `contact_phone` and `contact_email` as our own columns** — `Business` has no phone or email in the SME schema, both live on `User`, which cannot hold one pair per account | **New v11** |

---

## 3. WHAT CHANGED FROM v9

| v9 | Decision | v10 | Reason |
|---|---|---|---|
| 12-table schema | **Fixed** | **15 tables** — added `users`, `business_members`, `external_admins` | `Business.userId` is a required FK (`schema.prisma:91`); provisioning inserts a `BusinessMember`; admin needs a credential |
| `external_ref` **and** `referenceId` both NOT NULL on sales | **Removed** | One column: `referenceId` | Two idempotency keys with no defined owner is a contradiction |
| `audit_logs.external_device_id NOT NULL` | **Changed** | Nullable + `actor` column | CLI and admin actions have no device |
| No public PDF route | **Added** | `GET /public/invoices/:shareToken/pdf` | `pdf-link` is useless without it |
| Provisioning in Phase 7 | **Moved** | Phase 1 | Phases 2–5 cannot be tested without a provisioned account |
| 180-day token, no refresh | **Changed** | Long-lived, revocable, rotatable (D32) | ~550 human re-activations/day at 100k merchants |
| Bulk CSV of 100k codes | **Removed** | Just-in-time code per merchant (D33) | A 100k-line secret file is an unacceptable breach target |
| `403` on account mismatch | **Changed** | Always `404` | `403` confirms the account exists |
| No payloads, errors or pagination spec | **Added** | §7 | It is the deliverable for a partner integration |
| `ExpenseCategory` absent | **Added** | Optional, defaults to `other` | Column is NOT NULL (`schema.prisma:241`) |
| Cursor on `updatedAt` only | **Fixed** | `(updatedAt, id)` keyset + composite index | Equal timestamps skip or duplicate rows |
| Delete sale unguarded | **Added** | `409 SALE_LINKED_TO_INVOICE` + `onDelete: Restrict` | Silent unlink of paid revenue |
| PUT semantics undefined | **Added** | Invoice PUT draft-only; sale PUT refused when invoice-linked | Prevents revenue divergence |
| No subscription concept | **Added** | §6.5 | Access must stop when the month is unpaid |
| `SalesSource.api` hedge | **Dropped** | `backend/` untouched (D31) | Honours "do not affect the SME app" |
| Admin surface undecided | **Decided** | Phase 8, endpoints in the new service | You need to see how Wowo uses the API |
| Sandbox / observability / retention absent | **Added** | Phases 0, 6, 7 | Cannot operate 100k customers without them |

### 3.1 What changed in v11

| v10 | v11 | Reason |
|---|---|---|
| 9 `SalesSource` members | **15** — adds `api`, `card`, `mobile_money`, `ussd`, `cheque`, `other` | Three already existed in `InvoicePaymentMethod`; `other` stops the long tail needing migrations |
| 21 `ExpenseCategory` members | **27** — adds `power`, `statutory_contributions`, `staff_welfare`, `training`, `security`, `licenses_permits` | `power` and statutory contributions had no correct home at all |
| `Expense.isDeductible` inherited from the default | **Always `false`** (D38) | The default is `true`, and expense rows feed `idx_expense_tax_calc` |
| No discount bound | **`discount ≤ subtotal`** → `400 INVALID_DISCOUNT` (D39) | Nothing rejected a negative total |
| "Each row exactly once" | **At-least-once**; clients upsert by `id` (D40) | An ascending scan re-delivers a row updated mid-scan |
| No expense document | **Optional `receiptUrl`** only (D41) | An upload pipeline is not needed in v1 |
| No merchant self-service | **`PATCH /accounts/:accountId`** (D42) | Only an admin could correct a business name |
| Rate-limit store deferred to Phase 6 | **In-memory ÷ `INSTANCE_COUNT`**, decided in Phase 2 (D43) | Deferring it meant shipping a limit that silently multiplies |
| Enum parity assumed | **Superset**; graduation migrates first (D44) | `SalesSource.api` does not exist in the SME schema |
| Client `referenceId` unconstrained | **`^WX-` reserved** (D45) | A collision corrupts `mark-paid` |
| `vat_rate` default `7.5` | **`@default(0)`** (D46) | One omitted write would have produced 7.5% VAT |
| No contact columns | **`contact_phone`, `contact_email`** (D47) | `Business` has neither; both live on `User` |
| Public PDF link | **`X-Robots-Tag: noindex`**, per-IP and per-token rate limit | A 30-day capability URL to a financial document |
| Rotate could strand a device | **10-minute grace window** on the old token | A lost response meant a human re-activation |
| Tenancy gate = a grep | **Single scoped query layer** + per-resource fixtures | A grep misses the real attack |
| Load test at pilot volume | **Capacity model**, test at 1,000 accounts (§14.1) | 50 accounts is not evidence for 100,000 |
| No security or legal gate | **Phase 9** | Pen test, DPIA, DPA and breach runbook were absent |
| ~100 h estimate | **~142 h engineering, ~178 h with contingency** | No buffer existed for the added gates |

---

## 4. ARCHITECTURE

```text
   Wowo mobile app
        │  Authorization: Bearer <device token>
        ▼
   NEW service  (own repo, own Railway service, own Postgres)
        │  own Prisma client, own migrations
        ▼
   ITS OWN POSTGRES DATABASE

   existing PayMyTax backend ──► its own database, untouched
```

**Nothing is shared at runtime.** No shared table, no shared migration history, no
shared connection pool, no deploy coupling. The SME app cannot be slowed down,
broken or migrated by this project.

**Consequence, accepted deliberately (D29):** the SME app will never show a Wowo
merchant's sales, invoices or customers. §5.5 keeps a future copy-in cheap.

**Railway layout:** use a **separate Railway project**, not a second service in
the SME project. A noisy-neighbour service on the same plan can starve the SME
app's CPU, which violates the core constraint. *(UNVERIFIED — Railway resource
isolation depends on plan; separate project is the safe default.)*

### 4.1 Where the code lives (D25)

The service is built in **its own repository, `devsilvar/external_wallxerpapi`**,
and deployed as its own Railway service against its own Postgres. Nothing above
changes: still no shared table, migration history, connection pool or deploy.

| Concern | Rule |
|---|---|
| Repository | The service repository is canonical. It is **never** tracked by the PayMyTax repo — `external-api/` is listed in that repo's `.gitignore`, so a local checkout placed inside the monorepo working tree cannot be committed by accident |
| CI | The service's workflow lives in the service repository and runs only on it. The PayMyTax workflow does not reference this code |
| Railway | The service's root directory is the repository root, because the repository contains nothing else |
| Local development | A local checkout may sit at `external-api/` inside the monorepo for convenience, which puts both apps one `cd` apart: §14's "never point both at the same database" is a live hazard, not a note. The concrete failure is `prisma migrate dev` run in the wrong directory against the SME database |

The non-regression acceptance check is unchanged and still absolute: no file under
`backend/` is modified, and the PayMyTax repository does not contain this service's
code at all.

---

## 5. DATA MODEL

### 5.1 The fifteen tables

| # | Table | Origin | Notes |
|---|---|---|---|
| 1 | `users` | our copy | Platform owner(s). Required by `Business.userId` |
| 2 | `businesses` | our copy | + `platform_id`, `external_customer_id`, `is_active`, `subscription_expires_at`, `contact_phone`, `contact_email` |
| 3 | `business_members` | our copy | Owner row per business. **Not copied at graduation** — owner access resolves through `Business.userId`, and this row points at our platform user, who does not exist in the SME database |
| 4 | `customers` | our copy | + `external_id` |
| 5 | `sales_transactions` | our copy | `reference_id` **NOT NULL**; no `external_ref` |
| 6 | `sale_line_items` | our copy | |
| 7 | `expenses` | our copy | + `external_ref`; `is_deductible` always `false` (D38); `receipt_url` nullable and optional (D41) |
| 8 | `invoices` | our copy | + `external_ref`, `share_token_expires_at` |
| 9 | `invoice_lines` | our copy | |
| 10 | `audit_logs` | our copy | + `platform_id`, `external_device_id` (nullable), `actor` |
| 11 | `platforms` | new | Wowo as a tenant; fee, suspension, subscription expiry, reserved API-key columns |
| 12 | `external_devices` | new | device tokens |
| 13 | `external_tombstones` | new | deletions feed |
| 14 | `external_sequences` | new | `WOWO` and `WX-` allocators |
| 15 | `external_admins` | new | operator credentials for `/admin/*` |

**Not copied:** no `monthly_tax_reports`, no `wallet_*`, no `customer_credits`, no
`tax_payments`, no subscriptions, no marketplace tables. If a feature is not in
§7.4, it does not get a table.

**The ten core models are copied, not retyped.** Take `User`, `Business`,
`BusinessMember`, `Customer`, `SalesTransaction`, `SaleLineItem`, `Expense`,
`Invoice`, `InvoiceLine` and `AuditLog` from `backend/prisma/schema.prisma`, then
make exactly three kinds of edit:

1. **Add** the extra columns listed in the table above.
2. **Delete** every relation whose target table we do not own, and the FK column
   that carries it: `Business`'s `taxReports`, `taxProfile`, `reminders`, `payments`,
   `statements`, `settlementPayouts`, `walletTransactions`, `credits`, `invitations`,
   `customerCards`, `subscriptionSubmissions`, `feedbacks`, `aiQueryLogs`,
   `voucherLedgerRequests`, `marketplaceProducts`, `marketplaceSlotPurchases`,
   `marketplaceBoosts`; `SalesTransaction.classificationId`/`classification` and the
   `walletTx`/`creditPayment`/`creditOrigin` relations; `Expense.linkedCreditId`/
   `linkedCredit`; `Customer.credits`/`card`/`voucherLedgerRequests`; `User`'s
   wallet, session, broadcast and message relations.
3. **Keep** every other column exactly as-is — same name, same type, same `@map`,
   same default — including nullable columns only the SME app uses (`paystack*`,
   `virtualAccount*`, `settlement*`, `payout*`, `voucher*`, `split*`). They are
   nullable or defaulted, so leaving them costs nothing and keeps the merge an
   `INSERT … SELECT`.

`integration/merge-rehearsal` (§12) is what proves this was done correctly.

### 5.2 Required constraints and indexes

| Table | Constraint / index |
|---|---|
| `businesses` | `merchant_id @unique`; `@@unique([platform_id, external_customer_id])` |
| `customers` | `external_id NOT NULL`; `@@unique([business_id, external_id])` |
| `sales_transactions` | `reference_id NOT NULL`; `@@unique([business_id, source, reference_id])`; `@@index([business_id, updated_at, id])` |
| `expenses` | `external_ref NOT NULL`; `@@unique([business_id, external_ref])`; `@@index([business_id, updated_at, id])` |
| `invoices` | `external_ref NOT NULL`; `@@unique([business_id, external_ref])`; `@@unique([business_id, invoice_number])`; `linked_sale_id @unique`; `share_token @unique`; `@@index([business_id, updated_at, id])`; `@@index([business_id, status])` |
| `external_tombstones` | `@@index([business_id, created_at, id])` |
| `external_devices` | `token_hash @unique`, `code_hash @unique`; `@@index([business_id, revoked_at])` |
| `external_sequences` | `key` is the primary key |

The `[business_id, updated_at, id]` index is not optional — the polling query
depends on it, and `updated_at` alone is not unique.

### 5.3 Partner plumbing (Prisma)

```prisma
model Platform {
  id                    String    @id @default(uuid())
  name                  String
  ownerUserId           String    @unique @map("owner_user_id")
  isActive              Boolean   @default(true) @map("is_active")
  suspendedAt           DateTime? @map("suspended_at")
  suspendedReason       String?   @map("suspended_reason")
  flatFeeNgn            Decimal?  @map("flat_fee_ngn") @db.Decimal(12, 2)
  subscriptionExpiresAt DateTime? @map("subscription_expires_at")
  // Reserved for a future server-to-server key. Unused in v1 (D14/D36).
  apiKeyHash            String?   @unique @map("api_key_hash") @db.VarChar(64)
  apiKeyPrefix          String?   @map("api_key_prefix") @db.VarChar(16)
  apiKeyLastUsedAt      DateTime? @map("api_key_last_used_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
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
  expiresAt      DateTime? @map("expires_at")        // NULL = never (D32)
  deviceName     String?   @map("device_name")
  devicePlatform String?   @map("device_platform")
  activatedAt    DateTime? @map("activated_at")
  lastSeenAt     DateTime? @map("last_seen_at")      // throttled, §6.4
  lastSeenIp     String?   @map("last_seen_ip")
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
  @@index([businessId, createdAt, id])
  @@map("external_tombstones")
}

/// One row per allocator. 'merchant' → WOWO0000001, 'invoice:{businessId}:{year}' → WX-2026-001
model ExternalSequence {
  key   String @id
  value Int    @default(0)
  @@map("external_sequences")
}

/// Operator credentials for /admin/*. Hashed at rest, revocable.
model ExternalAdmin {
  id         String    @id @default(uuid())
  name       String
  tokenHash  String    @unique @map("token_hash") @db.VarChar(64)
  role       String    @default("admin") // 'admin' | 'viewer'
  expiresAt  DateTime? @map("expires_at")             // NULL = no expiry (Phase 8)
  allowedIps String[]  @default([]) @map("allowed_ips") // empty = allowlist off
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  @@map("external_admins")
}
```

**Sequence allocation must be atomic.** `ExternalSequence` is incremented by a single
statement — `UPDATE external_sequences SET value = value + 1 WHERE key = $1 RETURNING
value` — inside the same transaction as the insert that consumes the number. A
read-then-write pair hands the same number to two concurrent callers; §9's "retry
once on `P2002`" would then hide a real race instead of preventing it. The retry
stays only as a backstop for the per-business uniqueness constraint.

### 5.4 Idempotency column — one per table, no duplicates

| Table | Column | Meaning |
|---|---|---|
| `sales_transactions` | `reference_id` | The client's idempotency key. For a sale created by `mark-paid`, it is the invoice number (matches the SME app's behaviour) |
| `expenses` | `external_ref` | The client's idempotency key |
| `invoices` | `external_ref` | The client's idempotency key |

`external_ref` is **not** added to sales. `reference_id` already carries
`unique_sales_reference` in the SME schema (`schema.prisma:224`, CONFIRMED), so
using it keeps merge parity and removes the v9 contradiction.

**Reserved namespace (D45).** `mark-paid` creates a sale whose `reference_id` is the
invoice number, `WX-YYYY-NNN` — exactly what the SME app does
(`invoice-crud.service.ts:651`, CONFIRMED: `referenceId: existing.invoiceNumber`).
That is safe there because references are provider-generated. Here they are
client-supplied, so a client could pre-create a sale with
`referenceId: "WX-2026-001"`, and the later `mark-paid` for that invoice would
collide on `(businessId, source, referenceId)`. A naive "P2002 → re-read → 200"
retry would then link that unrelated sale as the invoice's payment — wrong amount,
wrong row, invoice marked paid against someone else's money.

So any client-supplied `referenceId` matching `^WX-` is rejected with
`400 INVALID_REFERENCE`. The `WX-` prefix is reserved for invoice-linked sales.

### 5.5 Column-shape rules for a future merge

| Rule | Why |
|---|---|
| Every **shared** column matches the SME name and type | A merge is `INSERT … SELECT` |
| Our **extra** columns are ours and are **not copied** — copying one fails the merge `INSERT` because no such column exists in the SME table | None has an SME counterpart. The full list: `businesses.platform_id`, `external_customer_id`, `is_active`, `subscription_expires_at`, `contact_phone`, `contact_email`; `customers.external_id`; `expenses.external_ref`; `invoices.external_ref`, `share_token_expires_at`; `audit_logs.platform_id`, `external_device_id`, `actor` |
| Our tables are a **subset** of SME columns — never add a NOT NULL column the SME table lacks | The SME's `sales_transactions` has one nullable FK we do not carry (`classification_id`) and three relations whose FKs live on other tables (`wallet_tx`, `credit_payment`, `credit_origin`), so none of those is a column here |
| UUID primary keys only | Already true; no renumbering on merge |
| `WOWO…` merchant IDs, `WX-…` invoice numbers | `merchant_id` is `@unique` (`schema.prisma:134`, CONFIRMED) |
| **Never repurpose a shared-named column** | The one rule that costs money to break |
| Enums are a **superset**, never a remap | §5.7 adds 6 members to each enum. Shared members keep their exact SME spelling, so a merge only ever *extends* the SME enum — it never rewrites a value |

**IDs already cannot collide.** Every primary key in the SME schema is
`String @id @default(uuid())` (`schema.prisma:90, 189, 239, 375, 397, 428`,
CONFIRMED). A row copied out of our database can never clash with an existing one —
no renumbering, no mapping table. That is most of the merge work gone for free.

**One uniqueness risk IDs do not cover.** `Business.taxId` is globally `@unique` in
the SME schema (`schema.prisma`, CONFIRMED). If a graduating merchant's TIN already
belongs to a PayMyTax business, the merge `INSERT` fails. That is arguably correct —
same TIN, same business — but the graduation script must detect and report it rather
than crash halfway through a copy.

**One genuine upgrade we get for free.** `SalesTransaction.referenceId` is `String?`
in the SME schema (`schema.prisma:194`, CONFIRMED) only because existing rows predate
it. In our database every row has one, so it is `NOT NULL` with
`@@unique([businessId, source, referenceId])` (§5.4) — idempotency goes from "a
nullable column we hope is unique" to a database guarantee.

**Graduation script (reference only — not built in v1):**

1. Extend the SME `SalesSource` and `ExpenseCategory` enums with the §5.7 members —
   one `ALTER TYPE … ADD VALUE` migration, no table rewrite. **This must run first**,
   or any row carrying `source = 'api'` fails to insert.
2. Insert the `businesses` row, keeping the same `id`, pointed at a real PayMyTax
   user.
3. Insert `customers`, `sales_transactions`, `sale_line_items`, `expenses`,
   `invoices`, `invoice_lines` and `audit_logs` filtered by that `business_id`.
   `audit_logs.user_id` is inserted as `NULL` — our rows point at the platform owner,
   who does not exist in the SME database, and the column is nullable there
   (`schema.prisma`, CONFIRMED). `business_members` is **not** copied (§5.1).
4. Rewrite `merchant_id` from `WOWO…` to `PMTW…` if the SME app requires it.
5. Delete from our database, or leave it and mark the account migrated.

Steps 2–4 are a script. None of it is built in v1 — the requirement is only that the
schema *makes it possible* later.

### 5.6 Dates

`transaction_date`, `expense_date` and `issue_date` are `@db.Date`. Build every
one in UTC — `new Date(Date.UTC(y, m, d))`, never `new Date("2026-03-15")`, never
a local-time constructor. On a UTC+1 host the naive version records the previous
day. One helper, `src/lib/dates.ts`; every parse goes through it.

Reject year `< 2000` or `> current+10` with `400 INVALID_DATE`.

### 5.7 Enumerations

The new service defines its **own** copies of both enums. They are supersets of the
SME enums (D44), because `SalesSource.api` and several expense categories do not
exist in `backend/prisma/schema.prisma` and that file is not touched.

**Why not add the members to `backend/` instead?** v8 claimed the SME code would
break. Re-checked against source on 2026-11-10, it would not: `SalesSource` is not
referenced anywhere in `src/services/pdf/` or `src/services/documents/`, and no
`Record<SalesSource, …>` exists in `src/`.

| v8 claim | Reality |
|---|---|
| `src/services/pdf/sales-receipt.pdf.ts:19` — literal union, "will not compile" | A union on an **interface field**, not derived from `SalesSource`. Unaffected |
| `src/services/pdf/sales-report.pdf.ts:46` — "prints a raw fallback string" | `Record<string, string>` with a fallback. Unaffected |
| `src/services/documents/statement.service.ts:391` — same | `Record<string, string>`. Unaffected |

So the migration really would have been free. It is declined anyway (D31/D44):
"zero changes to `backend/`" is worth more than one enum value, because it keeps this
service's deploy fully decoupled from PayMyTax. The cost lands at graduation, where
the SME enum gains the missing members *before* the merge inserts.

**`SalesSource` — 15 members.** `api`, `card`, `mobile_money`, `ussd`, `cheque` and
`other` are new in v11. The first five of those already appear in the SME's
`InvoicePaymentMethod` (`schema.prisma:607-616`, CONFIRMED) but were missing from
`SalesSource` — a merchant taking a card payment had no correct value to send.
`other` is the deliberate catch-all so the long tail never needs another migration.

```prisma
enum SalesSource {
  bank_transfer
  paycode
  pos
  online_store
  manual
  cash
  invoice
  credit
  store_voucher
  // v11
  api              // created through this service
  card             // card-not-present / web card
  mobile_money     // OPay, PalmPay, Moniepoint, Kuda, Paga wallets
  ussd             // *737#, *919# and similar bank USSD channels
  cheque
  other            // catch-all — do not extend this enum again
}
```

**`ExpenseCategory` — 27 members.** Six new in v11. `power` and
`statutory_contributions` are the important ones: electricity/diesel/generator
running costs and PENCOM/NHF/NSITF/ITF employer contributions are large, recurring
Nigerian SME costs that had no correct home — `fuel` reads as vehicle fuel,
`utility` as water and rates, and neither `salary` nor `tax_permit` fits statutory
contributions.

```prisma
enum ExpenseCategory {
  bad_debt
  bank_charges
  communication
  depreciation
  fuel
  gift
  insurance
  interest
  inventory
  logistics
  marketing
  office_supplies
  other
  professional_fees
  rent
  repairs_maintenance
  salary
  subscription
  tax_permit
  travel
  utility
  // v11
  power                   // electricity, diesel, generator servicing
  statutory_contributions // PENCOM, NHF, NSITF, ITF
  staff_welfare           // feeding, HMO/medical, uniforms
  training                // staff and professional development
  security                // guards, CCTV, alarm
  licenses_permits        // business permits, LG levies, association dues
}
```

**Deliberately excluded:** `crypto` (regulatory exposure, marginal for SME sales),
`direct_debit` (rare for sales), `payment_link` (covered by `online_store` and
`manual`), `cleaning_waste` and `packaging` (optional; add only if Wowo asks).
WhatsApp and Instagram are *channels*, not payment sources — `manual` covers them.

**Known wart, deferred:** `tax_permit` conflates statutory tax with permits, and tax
itself (VAT, PAYE, WHT) is a liability, not an expense. Renaming it is free while the
tables are empty and a data migration afterwards — see §15 #7.

**Graduation:** these are supersets, so the SME enum must gain the same members
before any merge `INSERT … SELECT` can run. That is merge step 4, and because
`ALTER TYPE … ADD VALUE` is instant with no table rewrite, all of them go in one
migration at that time.

---

## 6. AUTH, DEVICES AND ENTITLEMENT

### 6.1 Credential

One credential type in v1: **a per-account device token**.

- 32 random bytes, base64url, shown once.
- Stored as `sha256(token)`; compared in constant time.
- Bound to exactly one `businessId`.
- **Long-lived** — `expiresAt` is `NULL` by default (D32). An operator may set an
  expiry for temporary access.
- Revocation checked on **every** request, never cached.

### 6.2 Activation code

- 10 characters, Crockford base32 (50 bits), excludes ambiguous characters.
- **TTL 72 hours** (configurable per batch), single use.
- Stored hashed (`code_hash`), cleared on successful activation.
- **Attempt limiting is per IP, not per code.** The device row is found *by*
  `code_hash`, so a code that matches nothing has no row to increment — a per-code
  lockout cannot fire on the attempt that actually matters. `code_attempts` therefore
  counts attempts against a row that *was* matched (an expired or already-consumed
  code), and the brute-force load is carried by the 50-bit code space plus
  `EXTERNAL_ACTIVATION_RATE_LIMIT` per source IP.
- Minted **just-in-time for one merchant** (D33), never in bulk.
- Delivered by **Wowo's own onboarding channel** to the merchant. We never send it.
- Issuance and consumption are both audited.

Why not a bulk CSV: a file containing 100,000 live credentials is a single
compromise away from a full breach of every merchant's account. Minting on demand
means at most a handful of live codes exist at any moment.

### 6.3 Flow

```text
Operator (CLI / admin endpoint)
   │  1. provision account  (no code)
   │  2. issue-code <accountId>  → one 10-char code, TTL 72 h
   ▼
Wowo onboarding team ──► merchant (SMS / in-app / email)
   ▼
Mobile app ──POST /auth/activate { code, deviceName, devicePlatform }──►
   │        ◄── { token, accountId, expiresAt }
   ▼
Mobile app ──Authorization: Bearer <token>──► everything else
```

**Lost-response recovery:** if the app dies after the server commits, the code is
consumed. Recovery is one operator command — `admin.ts issue-code --account <id>`
— which mints a fresh code and revokes the half-activated device. This is
documented as the standard recovery path.

### 6.4 Rotation and last-seen

- `POST /auth/rotate` (authenticated with the current token) issues a new token
  and revokes the old one **in the same transaction**. This gives indefinite use
  without any human involvement — the app can rotate on its own schedule.
- **Grace window (v11).** The old token stays valid for `EXTERNAL_ROTATE_GRACE_MINUTES`
  (default 10) after a successful rotate. Without it, a lost response strands the
  device: the app retries with a token that was just revoked, gets `401`, and needs
  an operator-issued code — the ~550/day re-activation treadmill D32 exists to
  prevent, merely relocated from expiry to a failed rotate. The grace window is
  bounded, single-use and audited; it does not weaken revocation, because an
  operator revoking a device sets `revoked_at` directly and bypasses the window.
- `last_seen_at` / `last_seen_ip` are written **at most once every 5 minutes per
  device**. Writing on every request is a hot-row update across 100k devices.

### 6.5 Entitlement — the subscription gate (D35)

Access is gated by a payment state. Two levels, both optional-null:

| Level | Field | Effect |
|---|---|---|
| Platform | `platforms.subscription_expires_at` | When past, **every** account on the platform gets `402 SUBSCRIPTION_EXPIRED` |
| Account | `businesses.subscription_expires_at` | When past, that account gets `402 SUBSCRIPTION_EXPIRED` |

Rules:

- `NULL` means no expiry (correct for the pilot).
- The check runs on **every** request after auth, before the handler.
- **`GET /me` is exempt** — the app must always be able to render a renewal
  screen and show the expiry date.
- Data is **never deleted** on expiry. Access stops; nothing else changes.
- Operators extend the date via the admin endpoint or CLI.
- The response includes `details: { expiresAt }` so the client can display it.

Middleware order:

```text
authenticateDevice    → 401
rateLimit             → 429
resolveAccount        → 404  (any account that is not the token's)
requirePlatformActive → 403 PLATFORM_SUSPENDED   (skipped for /me)
requireAccountActive  → 403 ACCOUNT_INACTIVE     (skipped for /me)
requireSubscription   → 402 SUBSCRIPTION_EXPIRED (skipped for /me)
handler
```

### 6.6 Why no credential `kind` discriminator (D36)

The question was whether a token row should carry a `kind` (`device` vs
`platform`) so a server-to-server key could share the table. It should not:

- A device token is bound to one merchant. A platform key is bound to the whole
  platform. Putting both in one table means every query must filter by `kind`,
  and one forgotten filter is a cross-tenant bug — the exact failure mode Phase 3
  exists to prevent.
- The cost of adding the key later is four nullable columns on `platforms`, which
  v10 already declares. No migration, no discriminator, no risk.

So: **device tokens stay in `external_devices`; a future platform key lives on
`platforms`.** When Wowo gets a backend, the key is set by an operator and a
second middleware accepts it on `/platform/*` routes only.

---

## 7. API CONTRACT

Base path `/api/external/v1`. All requests and responses are JSON.

### 7.1 Conventions

| Concern | Rule |
|---|---|
| Auth | `Authorization: Bearer <device token>` on everything except `/auth/activate`, `/public/*`, `/openapi.json`, `/docs`, `/health` |
| Request ID | Server generates one; echoed in `X-Request-Id` and in every error body |
| Money | **Decimal strings**, e.g. `"15000.00"` (D37). Accepts a JSON number and coerces; always returns a string |
| Dates | `YYYY-MM-DD` for date-only fields; ISO-8601 UTC for timestamps |
| IDs | UUID v4 strings |
| Unknown fields | Rejected — Zod `.strict()` → `400 UNKNOWN_FIELD` |
| Success | `{ "data": … }` |
| List | `{ "data": [...], "page": { "nextCursor": "…" \| null, "hasMore": true } }` |
| Error | `{ "error": { "code": "…", "message": "…", "details": {…}, "requestId": "…" } }` |
| Pagination | `?limit` default 50, max 200; `?cursor` is an opaque base64url of `{ updatedAt, id }` |
| Ordering | **Ascending `(updatedAt, id)` when `updatedSince` is supplied** (sync); **descending otherwise** (browse). Documented in OpenAPI |
| Sync guarantee | **At-least-once, not exactly-once** (D40). Keyset paging returns each row exactly once *for a given `updatedAt`*, but a row edited mid-scan moves ahead of the cursor and is delivered again. Clients must upsert by `id`. Stated in the integration guide, not just here |
| Rate limit | `EXTERNAL_DATA_RATE_LIMIT` requests per **minute per device token**; `429` with `Retry-After`. The bucket is in-memory and per instance, so the effective ceiling is the configured value divided by `INSTANCE_COUNT` (D43) |
| Idempotency | Sales: `referenceId`. Expenses/invoices: `externalRef`. Replay returns the original row with `200`. "Same reference, different payload" is decided by comparing a `sha256` of the canonicalised body (sorted keys, money normalised to 2 dp) stored alongside the row — not by comparing selected fields |

### 7.2 Error catalogue

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod failure; `details.fields` |
| 400 | `UNKNOWN_FIELD` | Strict-schema rejection (e.g. client sends `vatRate`) |
| 400 | `INVALID_DATE` | Out-of-range or unparseable date |
| 400 | `INVALID_AMOUNT` | Malformed or negative money |
| 400 | `INVALID_DISCOUNT` | `discount` exceeds `subtotal` (D39) |
| 400 | `INVALID_REFERENCE` | `referenceId` matches the reserved `^WX-` prefix (D45) |
| 400 | `AMOUNT_MISMATCH` | `amount` disagrees with the sum of line totals |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | Missing, unknown, expired or revoked |
| 401 | `CODE_INVALID` | Activation code unknown, expired, consumed, or locked out |
| 402 | `SUBSCRIPTION_EXPIRED` | Entitlement lapsed (§6.5) |
| 403 | `PLATFORM_SUSPENDED` | Kill switch at platform level |
| 403 | `ACCOUNT_INACTIVE` | Account suspended |
| 404 | `NOT_FOUND` | Resource missing **or** account mismatch (D15) |
| 409 | `DUPLICATE_REFERENCE` | Reference collision with a different payload |
| 409 | `INVOICE_NOT_SENT` | `mark-paid` on a draft |
| 409 | `INVOICE_PAID` | `cancel` on a paid invoice |
| 409 | `INVOICE_NOT_DELETABLE` | `delete` on a non-draft |
| 409 | `INVOICE_NOT_EDITABLE` | `PUT` on a non-draft |
| 409 | `SALE_LINKED_TO_INVOICE` | `DELETE` on a sale created by `mark-paid` |
| 410 | `INVOICE_CANCELLED` | PDF for a cancelled invoice |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds the 1 MB limit (§10) |
| 429 | `RATE_LIMITED` | Bucket exhausted |
| 500 | `INTERNAL` | Unhandled error. The message is generic; the detail is in the log under the request ID |
| 503 | `API_DISABLED` | `EXTERNAL_API_ENABLED=false` |

Every code above is emitted somewhere in §7–§9. If an implementation needs a code
that is not on this list, add it here first — the catalogue is the partner-facing
contract, and Wowo will code against it.

### 7.3 Endpoints

```text
POST   /auth/activate                        public, rate limited
POST   /auth/rotate                          device token
POST   /auth/revoke                          device token
GET    /me                                   device token, never blocked
GET    /openapi.json                         public
GET    /docs                                 public (HTML)

GET    /public/invoices/:shareToken/pdf      public, no credential (§8.4)

GET    /accounts/:accountId
PATCH  /accounts/:accountId                  # merchant self-service profile (D42)

GET    /accounts/:accountId/customers        ?updatedSince ?cursor ?limit
POST   /accounts/:accountId/customers
GET    /accounts/:accountId/customers/by-external-id/:externalId
GET    /accounts/:accountId/customers/:id
PATCH  /accounts/:accountId/customers/:id
DELETE /accounts/:accountId/customers/:id

GET    /accounts/:accountId/sales            ?updatedSince ?from ?to ?cursor ?limit
POST   /accounts/:accountId/sales
GET    /accounts/:accountId/sales/:id
PUT    /accounts/:accountId/sales/:id
DELETE /accounts/:accountId/sales/:id

GET    /accounts/:accountId/expenses         ?updatedSince ?from ?to ?cursor ?limit
POST   /accounts/:accountId/expenses
GET    /accounts/:accountId/expenses/:id
PUT    /accounts/:accountId/expenses/:id
DELETE /accounts/:accountId/expenses/:id

GET    /accounts/:accountId/invoices         ?updatedSince ?status ?from ?to ?cursor ?limit
POST   /accounts/:accountId/invoices
GET    /accounts/:accountId/invoices/:id
PUT    /accounts/:accountId/invoices/:id
DELETE /accounts/:accountId/invoices/:id
POST   /accounts/:accountId/invoices/:id/issue
POST   /accounts/:accountId/invoices/:id/mark-paid
POST   /accounts/:accountId/invoices/:id/cancel
GET    /accounts/:accountId/invoices/:id/pdf
GET    /accounts/:accountId/invoices/:id/pdf-link

GET    /accounts/:accountId/deletions        ?since ?cursor ?limit

# Admin (Phase 8) — bearer admin token, never a device token
GET    /admin/platforms
PATCH  /admin/platforms/:id                  # fee, subscription expiry, suspend/resume
GET    /admin/accounts                       ?platformId ?q ?cursor ?limit
GET    /admin/accounts/:id
POST   /admin/accounts/:id/activation-code
POST   /admin/accounts/:id/suspend
POST   /admin/accounts/:id/resume
PATCH  /admin/accounts/:id                   # subscription expiry
GET    /admin/accounts/:id/devices
POST   /admin/devices/:id/revoke
GET    /admin/audit-logs                     ?platformId ?action ?from ?to ?cursor
GET    /admin/usage                          ?platformId ?from ?to
```

**Deferred out of v1:** sale receipt PDFs, report PDFs, bulk import, webhooks.

### 7.4 Payloads

**Update account** — `PATCH …/accounts/:accountId` (D42)

```json
{ "businessName": "Ada Obi Stores", "ownerName": "Ada Obi",
  "businessType": "retail", "address": "12 Marina", "city": "Lagos",
  "state": "Lagos", "contactPhone": "+2348030000000",
  "contactEmail": "ada@example.com" }
```

Every field optional; unknown fields rejected. Available to the merchant and to an
admin — the merchant no longer has to ask an operator to fix a misspelled business
name.

**Never merchant-editable:** `merchantId`, `taxId`, `subscriptionExpiresAt`,
`isActive`, `platformId`, `externalCustomerId`. Sending any of them is
`400 UNKNOWN_FIELD`, not a silent ignore — otherwise a client could believe it had
extended its own subscription.

`contactPhone` / `contactEmail` are our own columns (D47): `Business` has no phone
or email in the SME schema, and `User` holds one pair per user, which cannot carry
one per account under D10.

**Create customer** — `POST …/customers`

```json
{ "externalId": "wowo-cust-9182", "name": "Ada Obi", "email": "ada@example.com",
  "phone": "+2348030000000", "address": "12 Marina", "city": "Lagos",
  "state": "Lagos", "notes": "VIP" }
```
Required: `externalId`, `name`. `externalId` is immutable after create.

**Create sale** — `POST …/sales`

```json
{ "referenceId": "wowo-txn-7781", "amount": "15000.00",
  "transactionDate": "2026-11-10", "description": "POS sale",
  "customerId": "uuid-or-null", "customerName": "Ada Obi",
  "items": [ { "name": "Bag", "quantity": "1", "unitPrice": "15000.00" } ] }
```
Required: `referenceId`, `amount`, `transactionDate`.
`referenceId` may not match `^WX-` → `400 INVALID_REFERENCE` (D45, §5.4).
Server sets `source = 'api'`, `status = 'confirmed'`, `isTaxable = false`.
`lineTotal` is computed as `quantity × unitPrice`; if `amount` disagrees with the
sum of lines, reject with `400 AMOUNT_MISMATCH` (do not silently pick one).
`items[].name` is capped at 200 characters — the SME column is `VarChar(200)`
(`schema.prisma`, CONFIRMED), so an over-long name would otherwise fail at the
database instead of as a clean `400`.

**Create expense** — `POST …/expenses`

```json
{ "externalRef": "wowo-exp-2210", "description": "Fuel", "amount": "8000.00",
  "expenseDate": "2026-11-09", "category": "fuel", "quantity": "1",
  "unitPrice": "8000.00", "receiptUrl": "https://…/receipt.jpg" }
```
Required: `externalRef`, `description`, `amount`, `expenseDate`.
`category` optional, defaults to `other`; the 27-member `ExpenseCategory` enum is
exposed in OpenAPI (§5.7).

**Receipts are optional and we do not host them (D41).** `receiptUrl` is a nullable
string pointing at a document Wowo already holds; there is no upload endpoint, no
storage bucket and no virus scanning in v1. A merchant who attaches nothing is fully
supported — this must never become a required field or a blocked create.

Server sets `isDeductible = false` on every expense (D38). These rows carry **no tax
consequence**: they are bookkeeping records only, and a graduated merchant's expenses
must not silently become deductions.

**Create invoice** — `POST …/invoices`

```json
{ "externalRef": "wowo-inv-551", "customerId": "uuid-or-null",
  "customerName": "Ada Obi", "customerEmail": "ada@example.com",
  "customerPhone": "+2348030000000", "customerAddress": "12 Marina",
  "issueDate": "2026-11-10", "dueDate": "2026-11-24",
  "discount": "500.00", "currency": "NGN", "notes": "Thank you",
  "paymentTerms": "Net 14",
  "lines": [ { "description": "Bag", "quantity": "2", "unitPrice": "5000.00" } ] }
```
Required: `externalRef`, `customerName`, `issueDate`, `dueDate`, `lines` (≥1).
`externalRef` is **Wowo's own unique id for this invoice record** — it is the
idempotency key (§5.4), not a customer reference. It is required because
`invoices.external_ref` is `NOT NULL` (§5.2) and because a create that cannot be
replayed safely would duplicate a document that later creates a sale.
`vatRate` is **rejected** if sent (`400 UNKNOWN_FIELD`) — D3.
Server computes `subtotal = Σ(qty × unitPrice)`, `total = subtotal − discount`,
`vatRate = 0`, `vatAmount = 0`. `currency` must be `NGN` in v1.

**`discount` may not exceed `subtotal` (D39).** If it does, reject with
`400 INVALID_DISCOUNT`. The SME app clamps instead —
`Math.max(0, money(subtotal - discount))` at `invoice-crud.service.ts:107` — which
means a large discount silently floors the total at zero. That is the right
behaviour for a UI form and the wrong behaviour for an API, where a negative or
silently-clamped total is a data-integrity bug the client never learns about. So
`total` here is always `≥ 0` **by rejection, not by clamping**.

**Mark paid** — `POST …/invoices/:id/mark-paid`

```json
{ "paymentDate": "2026-11-15", "paymentMethod": "cash" }
```
`paymentDate` defaults to today; must satisfy `issueDate ≤ paymentDate ≤ today`.
`paymentMethod` is one of the `InvoicePaymentMethod` members (`schema.prisma:607-616`).

### 7.5 Response shape (sale)

```json
{ "data": {
  "id": "uuid", "referenceId": "wowo-txn-7781", "amount": "15000.00",
  "source": "api", "status": "confirmed", "transactionDate": "2026-11-10",
  "description": "POS sale", "customerId": null, "customerName": "Ada Obi",
  "items": [ { "name": "Bag", "quantity": "1", "unitPrice": "15000.00", "lineTotal": "15000.00" } ],
  "createdAt": "2026-11-10T09:14:02.000Z", "updatedAt": "2026-11-10T09:14:02.000Z"
} }
```

Tax fields are **not** returned at all — not even as `false`/`0`. There is no tax
concept on this surface.

---

## 8. INVOICE LIFECYCLE AND PDF

### 8.1 State machine

```text
draft ──issue──► sent ──mark-paid──► paid
  │                │
  │                └──cancel──► cancelled
  └──delete──► (row removed + tombstone)
```

| Transition | Rules |
|---|---|
| `issue` | Only from `draft`. Sets `sentAt = now()`. Fires nothing — no email, no reminder. Already sent → `200` (idempotent) |
| `mark-paid` | Only from `sent`/`overdue`. Creates the linked sale **in the same transaction**. Sets `paidAt`, `paymentMethod`, `linkedSaleId`. Already paid → `200` |
| `cancel` | Refused from `paid` (`409 INVOICE_PAID`). Already cancelled → `200` |
| `delete` | Only from `draft` (`409 INVOICE_NOT_DELETABLE`). Hard delete + tombstone, one transaction |
| `PUT` | **Only from `draft`** (`409 INVOICE_NOT_EDITABLE`) — D3/H8 |
| Sale `DELETE` | **Refused when the sale is invoice-linked** (`409 SALE_LINKED_TO_INVOICE`) |

### 8.2 The linked sale

| Field | Value |
|---|---|
| `businessId` | invoice's business |
| `amount` | invoice `total` |
| `source` | `'api'` |
| `status` | `'confirmed'` (matches `SETTLED_SALE_STATUSES`, `settled-status.ts:9`, CONFIRMED) |
| `isTaxable` | **`false`** |
| `referenceId` | invoice number |
| `transactionDate` | payment date, UTC |
| `metadata` | `{ invoiceId, invoiceNumber, paymentMethod, subtotal, vatAmount, discount }` |

`Invoice.linkedSaleId @unique` and `@@unique([businessId, source, referenceId])`
are the database safety net. Do not add a second application guard that hides a
bug.

**Declare `onDelete: Restrict` on the `Invoice.linkedSale` relation.** The SME schema
leaves it at Prisma's default, which for an optional relation is `SetNull`
(`schema.prisma:462`, CONFIRMED — no `onDelete` clause). Copying it verbatim would
let a hard-deleted sale silently null the invoice's payment link, so the `409` would
be the only thing standing between a bug and an invoice that says "paid" with no
money behind it. Our schema states `onDelete: Restrict` explicitly, so the database
refuses the delete too.

### 8.3 Tax guard

```ts
// src/tax-guard.ts
// The external surface never computes tax. This is the only place that decides
// a tax rate, and it always decides zero. isDeductible covers expenses, which
// default to true in the SME schema and feed idx_expense_tax_calc.
export const EXTERNAL_TAX = {
  vatRate: 0,
  vatAmount: 0,
  isTaxable: false,
  isDeductible: false,
} as const;
```

Nothing reads these tables but us, so this is hygiene for a future merge — not a
safety net. The blocking gate is tenancy (Phase 3).

**Two defaults in the SME schema are hostile to this rule, and v11 neutralises both
at the database rather than relying on call sites:**

| Column | SME default | Our default | Why |
|---|---|---|---|
| `invoices.vat_rate` | `7.5` (`schema.prisma`, CONFIRMED) | `0` (D46) | An omitted write would have produced 7.5% VAT on a "no tax" surface |
| `expenses.is_deductible` | `true` (CONFIRMED) | `false` (D38) | An omitted write would have made the expense a tax deduction |

Both are covered by a test that inserts with the field **omitted** and asserts the
stored value, so the guarantee survives a future refactor of `tax-guard.ts`.

### 8.4 Commercial invoice PDF

One PDF. No duplication of `backend/src/services/pdf/**` (12 generators, brand
fonts, `@/config` dependencies — none importable).

| Rule | Reason |
|---|---|
| Title is **`COMMERCIAL INVOICE`** | Never `TAX INVOICE` / `VAT INVOICE` / `FIRS INVOICE` |
| **No VAT line** is rendered at all | Do not print "VAT: ₦0" — omit the row |
| `total = subtotal − discount` from the stored row | Never recomputed |
| Amounts come from the stored invoice | A setting change must not alter a re-rendered PDF |
| No QR, no signature, no "verified" language | Not tamper-evident documents |

Footer, verbatim:

> This is a commercial billing document generated via Wowo. This document does
> not constitute a statutory FIRS Tax Invoice, VAT receipt or tax return filing.
> Statutory tax compliance and fiscalisation (if required by applicable law)
> remain the sole responsibility of the billing entity.

HTTP:

| Concern | Rule |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="WX-2026-001.pdf"`; `?disposition=inline` supported |
| `Cache-Control` | `private, max-age=60` |
| `Referrer-Policy` | `no-referrer` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` on **both** the authenticated and the public route |
| Cancelled invoice | `410 INVOICE_CANCELLED` (matches `invoice-delivery.service.ts:144`, CONFIRMED) |
| Deleted invoice | `404` |
| Generation | Outside any transaction — CPU work |
| `pdf-link` | 32-byte `shareToken`, `share_token_expires_at` **default 30 days** (`EXTERNAL_SHARE_TOKEN_TTL_DAYS`), `GET /public/invoices/:shareToken/pdf` serves it with no credential |
| Public route rate limit | `EXTERNAL_PUBLIC_PDF_RATE_LIMIT` per **IP** and per **share token**, both buckets. A capability URL is a bearer credential in a query string; without a limit it is also an enumeration and bandwidth-abuse surface |
| Public route logging | The `shareToken` is **redacted** from access logs. It is a credential — logging it in full defeats the point of hashing device tokens |

**Capability-link rules.** The link is unauthenticated by design (Wowo's merchant
forwards it to their own customer), so it gets the standard hardening rather than a
weaker version of it: noindex, no-referrer, rate limited, redacted in logs, bounded
TTL, and revocable — `POST …/invoices/:id/pdf-link` again **replaces** the token and
invalidates the old one, so a leaked link has a one-command kill. Expired → `404`
(not `410`), because an expired token must be indistinguishable from a wrong one.

Stack: `pdfkit` with base-14 Helvetica. A4, 40 pt margins, one page for ≤ 12 line
items, then a continuation page.

---

## 9. EDGE CASES

| Case | Handling |
|---|---|
| Create replay after timeout | Same `referenceId`/`externalRef` → re-read → `200` with the original row |
| Same reference, different payload | `409 DUPLICATE_REFERENCE` — never silently overwrite |
| `mark-paid` replay | Already `paid` + `linkedSaleId` set → `200` |
| Two concurrent `mark-paid` | One wins on `linkedSaleId @unique`; the loser gets `P2002` → re-read → `200` |
| Two concurrent invoice creates | Both mint the same `WX-` number → `P2002` → retry once with a fresh number |
| Pay a draft | `409 INVOICE_NOT_SENT` — call `/issue` first |
| Issue twice | `200`, no state change |
| Cancel paid | `409 INVOICE_PAID` |
| Delete non-draft | `409 INVOICE_NOT_DELETABLE` |
| Delete invoice-linked sale | `409 SALE_LINKED_TO_INVOICE` |
| Edit sent/paid invoice | `409 INVOICE_NOT_EDITABLE` |
| Edit invoice-linked sale | `409 SALE_LINKED_TO_INVOICE` |
| Equal `updatedAt` values | Keyset `(updatedAt, id)` returns each row exactly once |
| Child rows replaced | Service touches the parent so `updatedAt` moves (§5.2) |
| Row edited mid-scan | Delivered twice; the client upserts by `id` (D40) |
| `referenceId` matches `^WX-` | `400 INVALID_REFERENCE` — prefix reserved (D45) |
| `discount` exceeds `subtotal` | `400 INVALID_DISCOUNT` (D39) |
| Expense created with no receipt | Succeeds; `receiptUrl` stays null (D41) |
| Merchant PATCHes a read-only field | `400 UNKNOWN_FIELD`, never a silent ignore (D42) |
| Rotate response lost | The old token still works for the grace window; the retry succeeds (§6.4) |
| Customer delete | `isActive = false` + tombstone; the `(businessId, externalId)` pair stays reserved |
| Re-create a deleted customer's `externalId` | `200` with the existing row, reactivated (idempotent) |
| Re-create a deleted sale's reference | Succeeds — the row is gone, the index is clear |
| Activation code expired / consumed | `401 CODE_INVALID`; operator re-issues |
| Activation response lost | Operator re-issues; the half-activated device is revoked |
| Two devices, one merchant | Allowed; each token is independent |
| Merchant changes phone | Operator issues a code on a new row, revokes the old |
| Subscription lapses mid-session | `402 SUBSCRIPTION_EXPIRED`; `/me` still `200` with the expiry date |
| Platform suspended | `403 PLATFORM_SUSPENDED`; `/me` still `200` |
| Token revoked | `401` on the next request |
| Client offline past tombstone retention | Retention is 180 days; document the resync path (full re-list) |
| Public PDF token expired, or never existed | `404` — the two are indistinguishable by design |
| Public PDF link regenerated | The previous token stops working immediately |
| Postgres connection pressure | Pool capped; the SME app is on a different server |
| PDF generation | Never inside a transaction |

---

## 10. FILE CHANGES

### CREATE — new repository (`devsilvar/external_wallxerpapi`)

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | The 15 models of §5 |
| `prisma/migrations/**` | Normal Prisma history |
| `src/server.ts`, `src/app.ts` | Bootstrap; `trust proxy`, helmet, 1 MB JSON, request ID, error envelope |
| `src/routes/{auth,accounts,customers,sales,expenses,invoices,deletions,public,admin}.routes.ts` | Thin routers |
| `src/middleware/{auth,rateLimit,logger,requestId,errorHandler}.ts` | `authenticateDevice`, `resolveAccount` (404), `requirePlatformActive`, `requireSubscription` |
| `src/services/{account,device,invoice,sale,expense,customer,sync,audit,sequence,entitlement}.service.ts` | Business logic |
| `src/services/idempotency.ts` | Replay translation |
| `src/tax-guard.ts` | The only place a tax rate is decided |
| `src/lib/{token,cursor,dates,money}.ts` | Hashing, keyset cursor, UTC dates, decimal-string parsing |
| `src/pdf/{commercial-invoice.pdf,pdf-common}.ts` | The one PDF |
| `src/validators/*.validator.ts` | Zod `.strict()` — the OpenAPI source |
| `src/openapi.ts` | Spec generated from the validators |
| `src/cli/provision.ts` | Bulk account creation (**no codes**) |
| `src/cli/admin.ts` | `issue-code`, suspend, resume, revoke, extend subscription |
| `docs/integration-guide.md` | Wowo's onboarding document |
| `tests/**` | §12 |

### MODIFY

**None in `backend/`.** D31. Verified: the direct-write design touches nothing.

### DELETE

None.

### CONFIGURATION

```text
DATABASE_URL                        # ours, pooled
EXTERNAL_API_ENABLED=true           # false → 503 on API routes, /health stays 200
TRUST_PROXY=1                       # Railway terminates TLS
INSTANCE_COUNT=1                    # D43 — the in-memory bucket is divided by this
EXTERNAL_DATA_RATE_LIMIT=120        # per minute, per device token, across all instances
EXTERNAL_ACTIVATION_RATE_LIMIT=10   # per minute, per source IP (§6.2)
EXTERNAL_PUBLIC_PDF_RATE_LIMIT=30   # per minute, per IP and per share token
EXTERNAL_ROTATE_GRACE_MINUTES=10    # §6.4
EXTERNAL_CODE_TTL_HOURS=72
EXTERNAL_SHARE_TOKEN_TTL_DAYS=30
EXTERNAL_TOMBSTONE_RETENTION_DAYS=180
EXTERNAL_AUDIT_RETENTION_DAYS=730
PLATFORM_FLAT_FEE_NGN=0
```

No new secrets beyond `DATABASE_URL`. Admin and device credentials are hashed in
the database, not held in env.

---

## 11. IMPLEMENTATION PHASES

### Phase 0 — Scaffold and environments (6 h)

Service scaffold in its own repository (§4.1), Node pinned to the SME app's range (`>=20 <23`), **separate Railway project**
with Postgres + staging, `prisma init`, `/health`, config validation, CI
(lint/typecheck/test), request-ID middleware, error envelope, `trust proxy`.

**Done when:** `/health` returns `200`, an unknown route returns the standard error
envelope with a request ID, and CI is green.

### Phase 1 — Schema and provisioning (12 h) ← *moved from Phase 7*

15 models, first migration, both v11 enums (§5.7), `sequence.service.ts` (`WOWO`,
`WX-`), `provision.ts`.

CSV input columns: `externalCustomerId, businessName, ownerName, phone, email,
address, city, state`. **No activation codes in the file.** `phone` and `email` land
on our own `contact_phone` / `contact_email` columns (D47) — `Business` has neither.

Per row, one transaction: skip on `(platformId, externalCustomerId)`; insert
`User` (platform owner, created once — `email` and `passwordHash` are **nullable** in
our copy, since a platform-owned account has no login and `users` is never merged),
`Business` (`merchantId` from sequence,
`isActive = true`), `BusinessMember` (`role = owner`), dormant `ExternalDevice`,
and an `audit_logs` row (`actor = 'cli'`, `action = 'account.provisioned'`).
`P2002` → re-read → skip.

**Done when:** 100 accounts provision twice with zero duplicates; each has a
dormant device and no code; `_prisma_migrations` has one row.

### Phase 2 — Device auth and entitlement (16 h)

`/auth/activate`, `/auth/rotate`, `/auth/revoke`, `/me`; `authenticateDevice`,
`resolveAccount`, `requirePlatformActive`, `requireAccountActive`,
`requireSubscription`; `lastSeenAt` throttling; rate limits with `trust proxy`;
audit inserts.

**Two things are decided here, not later (v11).** The rate-limit store ships in this
phase (D43) — an in-memory token bucket with the configured limit divided by
`INSTANCE_COUNT`, documented as approximate. Deferring it to Phase 6 would have meant
shipping a limit that silently multiplies by the instance count. And `/auth/rotate`
ships with its grace window (§6.4), because retrofitting it means a schema change to
`external_devices` after devices are live.

**Order matters:** `/me` must be mounted **before** `requirePlatformActive`,
`requireAccountActive` and `requireSubscription`.

**Done when:** a code issues exactly one token; a consumed code fails; activation
attempts are limited per IP; rotate swaps the token atomically; an expired
subscription returns `402` on data routes and `200` on `/me`; a suspended account
returns `403 ACCOUNT_INACTIVE` on data routes and `200` on `/me`.

### Phase 3 — Tenant isolation gate (12 h) — **GATE**

v10's gate was four negative tests plus a CI grep for `body.businessId`. That grep
does not catch the actual attack — a nested route whose Prisma `where` omits
`businessId`, so `/accounts/<mine>/sales/<someone-else's>` resolves. Four tests
cannot cover every resource against every verb either.

v11 makes the gate structural:

1. **One scoped query layer.** Every read and write goes through a repository whose
   first argument is `businessId`, injected into the `where`. Handlers never touch
   `prisma` directly, enforced by an ESLint `no-restricted-imports` rule so a new
   handler cannot bypass it by accident.
2. **`resolveAccount` owns the account.** `req.params.accountId` is compared to the
   token's `businessId` once, in middleware; handlers read `req.account.id` and never
   the raw param.
3. **Per-resource negative fixtures.** For every resource × every verb (customers,
   sales, expenses, invoices, deletions, PDF) a second account is seeded and its ids
   are used to assert `404`. That is the matrix, not four tests.
4. **CI assertion** that no handler imports `prisma` directly and none reads
   `body.businessId`.

**Do not start Phase 4 until this is green.** With `verifyBusinessAccess` gone, this
is the only thing between a bug and a cross-tenant breach.

### Phase 4 — Contract and CRUD (24 h)

Zod schemas → generated OpenAPI; customers (with `updatedSince`), sales, expenses
(category default `other`, `isDeductible: false`), `PATCH /accounts/:accountId`
(D42), idempotency including the `^WX-` reservation (D45), tombstones, keyset
`(updatedAt, id)`, and the full §7.2 error catalogue.

**Done when:** a page of 50 sales sharing one `updatedAt` returns every row
exactly once; a replayed create returns the original row; OpenAPI validates every
route.

### Phase 5 — Invoices and the PDF (26 h)

State machine, PUT draft-only, `mark-paid` with the linked sale and date
validation, the `discount ≤ subtotal` bound (D39), cancel, delete, **sale-delete
guard**, PDF, `pdf-link` with expiry, `GET /public/invoices/:shareToken/pdf` with
its hardening (§8.4), three PDF tests.

### Phase 6 — Sync, capacity and hardening (16 h)

`/deletions` with retention, `EXPLAIN` on the change query, tombstone retention job,
audit-log retention job, the capacity work of §14.1 (partitioning decision,
autovacuum settings, index budget), and a load test at **1,000 accounts** — not at
pilot volume. 25–50 accounts is evidence that the code runs, not that it scales.

### Phase 7 — Docs, sandbox and operations (10 h)

Integration guide (including the at-least-once upsert contract and the `^WX-`
reservation), sandbox tenant on staging, runbook, alerts, backup schedule **and a
restore rehearsal** for our database, operator quickstart. A backup nobody has
restored from is a hypothesis, not a control.

### Phase 8 — Admin surface (12 h) ← *last, as requested (D34)*

Admin credentials get an optional expiry and an optional IP allowlist, plus a
`last_used_at` warning surfaced in `GET /admin/usage`. A single non-expiring bearer
token that can suspend or read 100,000 merchants is the largest single credential in
the system and deserves the same treatment as a device token, not less.

Admin endpoints of §7.3: platform list/edit (fee, subscription expiry,
suspend/resume), account list/detail/suspend/resume, activation-code issuance,
device list/revoke, audit-log search, usage stats (requests, last seen, row counts
per account). Admin auth via `external_admins` token, seeded by CLI.

**Done when:** an operator can see, for any Wowo merchant, when they last called
the API, how many sales/invoices/expenses they have, their device list, and can
suspend, extend a subscription, or re-issue an activation code — all without
touching the database.

### Phase 9 — Security and legal gate (8 h engineering, plus elapsed time)

Runs in parallel from Phase 4. **Must complete before onboarding beyond the pilot.**

- External penetration test against staging, scoped to the tenancy boundary, the
  activation flow, the public PDF route and the admin surface.
- DPIA, and a signed DPA with Wowo as controller (D20) — we are a processor.
- Breach-notification runbook meeting NDPA's 72-hour obligation, naming the contact
  and the exact categories of data we hold.
- A data-subject path: export and erasure for a merchant, plus the documented answer
  to "delete my account" — which is *not* a hard delete of financial records.
- Remediation buffer for whatever the test finds.

Legal review and pen-test scheduling are **elapsed time, not dev hours**, and they
are the two items most likely to slip a launch date. Start them in Phase 4.

**Total ≈ 142 h engineering. With a 25% contingency — earned, given v11 added a
security gate, a capacity model and a structural tenancy layer — budget ≈ 178 h.
Pilot (Phases 0–5) ≈ 96 h, or ≈ 120 h with contingency.**

The v10 figure of 100 h had no buffer for any of these and would have been quoted
and then missed.

---

## 12. TESTS

| Suite | Covers |
|---|---|
| `unit/token` | generate / hash / verify, tamper, code-attempt accounting, rotate |
| `unit/dates` | UTC boundary at 23:59 on a UTC+1 host |
| `unit/cursor` | round-trip; equal-timestamp paging returns each row once |
| `unit/money` | decimal-string parsing, rounding, rejection of shorthand (`150k`) |
| `unit/sequence` | concurrent allocation, no duplicate numbers |
| `integration/tenancy` | per-resource × per-verb negative matrix, plus the no-direct-`prisma` and `body.businessId` assertions |
| `integration/auth` | activation single-use, expiry, per-IP attempt limit, lost-response recovery, rotate |
| `integration/entitlement` | platform expiry, account expiry, account suspension (`403 ACCOUNT_INACTIVE`), `/me` exemption, data retained |
| `integration/invoice-lifecycle` | issue → mark-paid → replay; PUT guards; delete guards |
| `integration/idempotency` | replay semantics, duplicate-with-different-payload → 409 |
| `integration/sales-delete` | linked sale refused; unlinked sale tombstoned |
| `integration/sync` | `updatedSince` + tombstones + retention |
| `integration/provisioning` | 100 accounts, re-run, concurrency |
| `integration/pdf` | no VAT line, disclaimer present, title not a tax invoice |
| `integration/public-pdf` | share token works with no credential; expired → 404; cancelled → 410; `X-Robots-Tag` and `Referrer-Policy` present; per-IP and per-token limits fire; regenerating the link kills the old token |
| `integration/admin` | admin authz, suspend/resume, subscription extension, expiry and allowlist |
| `unit/rate-limit` | the bucket divides by `INSTANCE_COUNT`; `429` carries `Retry-After` |
| `integration/tax-defaults` | insert an invoice and an expense **with the field omitted** → `vat_rate` is `0`, `is_deductible` is `false` (D38/D46) |
| `integration/reference-namespace` | `^WX-` reference rejected; a near-collision followed by `mark-paid` links the *right* sale (D45) |
| `integration/discount-bound` | `discount > subtotal` → `400`; `total` is never negative (D39) |
| `integration/rotate-grace` | old token works inside the grace window and fails outside it; an operator revoke bypasses the window |
| `integration/account-profile` | merchant `PATCH` edits allowed fields; each read-only field → `400 UNKNOWN_FIELD` |
| `integration/expense-receipt` | create succeeds both with and without `receiptUrl` |
| `integration/merge-rehearsal` | graduation script against a **committed SQL snapshot** of the SME schema, including the enum extension running first |

---

## 13. ACCEPTANCE CRITERIA

**Schema and provisioning**
- [ ] `migrate deploy` creates 15 tables; `_prisma_migrations` has one row
- [ ] 100 accounts provisioned twice → 100 rows, zero duplicates
- [ ] No activation code exists in any file produced by provisioning

**Auth and entitlement**
- [ ] A code issues exactly one token and cannot be reused
- [ ] Rotate issues a new token and revokes the old in one transaction
- [ ] The pre-rotate token still works inside the grace window and fails outside it
- [ ] Token on another account → `404`; revoked/expired → `401`
- [ ] Subscription expired → `402` on data routes, `200` on `/me`
- [ ] No token or activation code appears in any log

**Tenancy**
- [ ] No handler imports `prisma` directly (ESLint rule + CI assertion)
- [ ] No handler reads `body.businessId` or `req.params.accountId`
- [ ] The per-resource × per-verb negative matrix is green
- [ ] A cross-account id on every nested route returns `404`, never `403`

**Data**
- [ ] Replayed create returns the original row
- [ ] A page of equal-`updatedAt` rows returns each exactly once
- [ ] Editing line items moves the parent's `updatedAt`
- [ ] `DELETE` on an invoice-linked sale → `409`
- [ ] `PUT` on a non-draft invoice → `409`
- [ ] Customer edits appear in `?updatedSince`
- [ ] Every external expense has `isDeductible = false` and `receiptUrl` may be null
- [ ] `discount > subtotal` → `400 INVALID_DISCOUNT`; `total` is never negative
- [ ] A client `referenceId` matching `^WX-` → `400 INVALID_REFERENCE`
- [ ] A merchant can `PATCH` their own business name and address; every read-only field → `400`

**Invoices and PDF**
- [ ] `mark-paid` on a draft → `409`; twice → one sale; future date → `400`
- [ ] Every invoice has `vatRate = 0`, `vatAmount = 0`, `total = subtotal − discount`
- [ ] Every sale has `isTaxable = false`, `source = 'api'`
- [ ] PDF title is `COMMERCIAL INVOICE`, no VAT line, disclaimer verbatim
- [ ] `pdf-link` works with no credential; expired → `404`; cancelled → `410`
- [ ] Both PDF routes send `X-Robots-Tag` and `Referrer-Policy`; the public route is rate limited per IP and per token
- [ ] Regenerating a `pdf-link` invalidates the previous token immediately

**Operations**
- [ ] `EXTERNAL_API_ENABLED=false` → `503` on API routes, `/health` still `200`
- [ ] Platform suspended → `403` everywhere but `/me`
- [ ] Account suspended → `403 ACCOUNT_INACTIVE` everywhere but `/me`
- [ ] Our database has its own backup schedule, **and a restore has been rehearsed from it**
- [ ] Admin can view usage, suspend, extend a subscription, and re-issue a code
- [ ] Admin tokens support expiry and an IP allowlist
- [ ] Load test at 1,000 accounts meets the §14.1 latency and error targets
- [ ] Partitioning decision recorded, with the trigger volume written down
- [ ] Audit-log and tombstone retention jobs run on a schedule, not by hand
- [ ] Penetration test complete and findings remediated before onboarding past the pilot
- [ ] DPA signed, DPIA filed, breach runbook names a contact and a 72-hour path

**Non-regression**
- [ ] No file in `backend/` is modified
- [ ] The SME app's deploy is unchanged

---

## 14. OPERATIONS

| Concern | Rule |
|---|---|
| Provisioning | Bulk accounts via CLI, run as a Railway one-off job (`railway run …`) — the production DB is not reachable from a laptop *(recorded project constraint, UNVERIFIED today)* |
| Activation codes | Minted one at a time, delivered by Wowo, never exported in bulk |
| Code issuance audit | Every `issue-code` writes an `audit_logs` row with `actor = 'cli'` and the admin's identity |
| Backups | Our database only; separate schedule from the SME app. **A restore is rehearsed in Phase 7** — a backup nobody has restored from is a hypothesis, not a control |
| Retention | Tombstones 180 days; audit logs 2 years; both configurable |
| Monitoring | Request ID on every response; error rate, p95 latency, 4xx/5xx split, per-platform usage; alert on 5xx > 1% over 5 min |
| Kill switches | `EXTERNAL_API_ENABLED` → platform `isActive` → account `isActive` |
| Connection pool | Capped explicitly; the SME app has its own server, so the cap protects us, not them |
| Migrations | `prisma migrate deploy` on start, against **our** `_prisma_migrations` only. It never sees the SME app's 77 migrations and the SME app never sees ours — there is nothing to reconcile. The one standing discipline is local: **never point both repos at the same local database during development**, or the shared-database problem comes back by accident |

### 14.1 Capacity model — the 100,000-account question

v10 said "load test at pilot volume", which tested 25–50 accounts. That is not
evidence about 100,000. v11 states the assumptions and makes the thresholds
measurable instead.

**Assumptions — UNVERIFIED, see §15 #6.** At 100,000 active accounts:

| Item | Per account / month | Total / month |
|---|---|---|
| Sales | 30 | 3.0 M |
| Sale line items | 45 | 4.5 M |
| Expenses | 10 | 1.0 M |
| Invoices | 3 | 0.3 M |
| `audit_logs` (≥ 1 per write) | 45 | 4.5 M |
| **Rows written** | | **≈ 13.3 M / month ≈ 160 M / year** |

**What that means.** `sales_transactions` passes ~10 M rows in month 3–4; that is
comfortable on a well-provisioned Postgres and stops being comfortable somewhere
around 50–100 M. `audit_logs` grows fastest and is worth the least per row.
Autovacuum defaults are tuned for small tables and will not keep up with either at
this write rate.

**Triggers, written down now so they are not rediscovered under load:**

| Trigger | Action |
|---|---|
| Any table > 10 M rows | Monthly range partitioning on its date column |
| `audit_logs` | Partition by month from the start — append-only, never joined |
| Day one | Per-table autovacuum thresholds for `sales_transactions`, `audit_logs`, `external_devices` |
| Day one | Audit retention job at `EXTERNAL_AUDIT_RETENTION_DAYS` (730), not "2 years, later" |
| Phase 6 | Load test at **1,000 accounts** and extrapolate — never claim 100k from 50 |

**Targets for the Phase 6 test** (to confirm with Wowo): p95 < 300 ms for
single-record reads and writes, p95 < 800 ms for a 50-row list page, error rate
< 0.1%, and the `updatedSince` query staying on the `(business_id, updated_at, id)`
index under `EXPLAIN`.

**Not doing:** no read replicas, no cache layer, no Redis, no message queue. All are
plausible later and none is justified by a volume nobody has measured. The value of
this section is the explicit trigger, not building ahead of it.

---

## 15. REMAINING QUESTIONS

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| 1 | **Billing unit** — does Wowo pay one platform fee, or is each merchant billed separately? The schema supports both; the default check is platform-level | Phase 2 (entitlement) | Platform-level for the pilot; per-account expiry is available but unset |
| 2 | **Who at Wowo delivers activation codes**, and through which channel? | Phase 2 | Wowo's onboarding team, via their existing merchant channel (SMS/in-app) |
| 3 | **Admin UI or endpoints only?** Phase 8 delivers endpoints; a small read-only UI is extra | Phase 8 | Endpoints + a thin internal page later |
| 4 | **Pilot size** | Phase 4 | 25–50 accounts before 100,000 |
| 5 | **Fee amount** | Phase 8 | Structure built; number pending |
| 6 | **Transaction volume per account per month** — sales, expenses, invoices. §14.1 currently assumes 30 / 10 / 3 | Phase 6, and any 100k commitment | **The most important missing number.** Ask Wowo; until then the capacity thresholds are estimates |
| 7 | **Rename `tax_permit`?** It conflates statutory tax with permits, and tax is a liability, not an expense | Phase 1 | Rename to `tax_and_permits` **now** — free while the tables are empty, a data migration afterwards |
| 8 | **Admin token policy** — expiry, IP allowlist, or long-lived only? | Phase 8 | Both, with the allowlist defaulting to empty (off) |
| 9 | **Pen test: external firm or internal checklist?** | Phase 9 | External firm before onboarding past the pilot. An internal checklist is not a substitute for third-party financial data |
| 10 | **Is the Wowo DPA already signed**, or do we draft it? | Phase 9 | Draft ours — we are the processor, Wowo is the controller |
| 11 | **Graduation tooling in v1?** | post-v1 | Manual for the first merchant; script when someone asks |
| 12 | **Optional taxonomy extras** — `payment_link`, `cleaning_waste`, `packaging` | Phase 1 | Skip. §5.7 keeps them out until Wowo asks |

**Closed in v10:** token lifetime (D32), code delivery (D33), admin surface (D34),
credential model (D36).

**Closed in v11:** expense tax treatment (D38), discount bound (D39), sync guarantee
(D40), receipt handling (D41), merchant profile editing (D42), rate-limit store
(D43), enum parity (D44), reference namespace (D45), `vat_rate` default (D46),
contact columns (D47).

---

## 16. READINESS SCORE

**9/10 — ready to build the pilot.**

**Why not 10:**
- Tenant scoping is hand-written and is the single red risk. Phase 3 now makes the
  gate structural rather than a convention, but it is still code we own.
- The merge contract is a written rule with no automated enforcement.
- Three human decisions still gate work: billing unit (#1) before Phase 2 closes,
  transaction volume (#6) before any 100k commitment, and the pen-test and DPA
  arrangements (#9, #10) before onboarding past the pilot.

**What is solid:**
- Every existing-backend fact was re-read from `backend/` on 2026-11-10, and the
  v11 review re-verified all twelve `schema.prisma` citations plus the VAT-trap call
  sites (`invoice-crud.service.ts:153`, `:161`, `:400`) against source.
- The existing backend is untouched, so this project cannot regress PayMyTax.
- The contract in §7 is concrete enough for a coding agent to implement and for Wowo
  to integrate against, including the error catalogue and the sync guarantee.
- Both enumerations now have a correct value for how Nigerian merchants actually
  take money and actually spend it.
- No tax consequence can arise by omission: `vat_rate` and `is_deductible` default
  safely at the database, not just in application code.
- Provisioning no longer produces a 100,000-credential file.
- Access stops when the subscription lapses, without deleting anything.
- The estimate now carries a contingency and names what it is for.

**Definition of done for the pilot:** one green end-to-end test — *provision →
issue code → activate → create customer → create sale → create invoice → issue →
mark-paid → replay → render PDF → confirm one sale and one invoice in the database,
confirm every expense has `isDeductible = false` and every invoice `vatRate = 0`,
and confirm the SME app's database was never touched.*
