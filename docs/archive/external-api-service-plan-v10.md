# External API — Wowo Platform Service — Implementation Plan v10

> **⭐ THIS IS THE SOURCE OF TRUTH. Work from this file.**
>
> `docs/external-api-plan.md` is the plain-language orientation companion — read it
> first if you are new, but implement from here.
> `docs/archive/external-api-service-plan-v9.md` is superseded and retained for
> history. Do not work from it.
>
> **v10 locks four decisions that were open in v9** (token lifetime, activation
> code delivery, admin surface, credential model) and adds a **subscription
> entitlement gate**. It also fixes every blocking defect found in the v9
> re-review — the schema was two tables short, the idempotency column was
> self-contradictory, and the provisioning tool was scheduled after the phases
> that need it.
>
> Facts about `backend/` below were re-read from the repository on **2026-11-10**.
> Line numbers are from that date.
>
> Legend: **CONFIRMED** = read from the repository · **LIKELY** = inferred ·
> **UNVERIFIED** = needs a runtime check, vendor docs, or client input.

---

## 1. EXECUTIVE VERDICT

🟢 **PLAN IS BUILDABLE** — v10 closes the four open decisions and every blocking
defect from the v9 re-review. The architecture is unchanged and correct: separate
repository, separate Railway service, separate Postgres, zero changes to
`backend/`.

The three things v10 adds that v9 lacked:

| Addition | Why it was blocking |
|---|---|
| **A real API contract** (§7) — payloads, error envelope, pagination ordering | A partner cannot integrate against an endpoint list alone |
| **Just-in-time activation codes** (§6.3) | v9 generated 100,000 codes into one CSV — an unmanageable secret bundle |
| **Subscription entitlement** (§6.5) | Access must stop when the month is not paid, and v9 had no such concept |

**The single red risk is unchanged: tenant scoping.** With `verifyBusinessAccess`
gone (`lib/ownership.ts:162-164`, CONFIRMED) and the database private, a scoping
mistake leaks one merchant's data to another. Phase 3 gates it.

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
| D16 | Three-layer kill switch: env → platform → account | Settled |
| D19 | Commercial Invoices only. FIRS non-fiscal disclaimer | Settled |
| D20 | NDPA via data minimisation & B2B DPA. Wowo is Controller | Settled |
| D21 | OpenAPI **generated from the Zod validators**, served at `/docs` | **Revised v10** |
| D22 | One credential: per-account device token from a one-time activation code | Settled |
| D23 | Provisioning is operator-side CLI, not an HTTP endpoint | Settled |
| D24 | No `Idempotency-Key` header. `referenceId` (sales) / `externalRef` (expenses, invoices) | **Corrected v10** |
| D25 | Separate repository, separate Railway service, separate Postgres | Settled |
| D26 | New service writes rows directly; it never calls the existing backend | Settled |
| D27 | New service owns its whole schema and runs its own `prisma migrate` | Settled |
| D28 | Every safety invariant the old services gave us is explicit code with a test | Settled |
| D29 | The SME app never sees a partner merchant's data. Accepted, not a bug | Settled |
| D30 | Schema stays merge-compatible so a merchant can graduate later (§5.5) | Settled |
| D31 | **The existing backend's `schema.prisma` does not change at all** — the `SalesSource.api` hedge is dropped | **Corrected v10** |
| **D32** | **Device tokens are long-lived and revocable. No expiry by default; optional `expiresAt`; `POST /auth/rotate` swaps a token without a new code** | **New v10** |
| **D33** | **Activation codes are minted just-in-time, one per merchant. Never bulk-exported. TTL 72 h, single use, 10-attempt lockout** | **New v10** |
| **D34** | **Admin surface = endpoints in the new service, built in Phase 8 (last)** | **New v10** |
| **D35** | **Entitlement gate: platform-level `subscriptionExpiresAt` (per-account optional). Expired → `402 SUBSCRIPTION_EXPIRED`; `/me` stays reachable** | **New v10** |
| **D36** | **No credential `kind` discriminator. A future server-to-server key lives on `Platform` as nullable columns, unused in v1** | **New v10** |
| **D37** | **Money is transmitted as decimal strings (`"15000.00"`), never floats** | **New v10** |

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

---

## 5. DATA MODEL

### 5.1 The fifteen tables

| # | Table | Origin | Notes |
|---|---|---|---|
| 1 | `users` | our copy | Platform owner(s). Required by `Business.userId` |
| 2 | `businesses` | our copy | + `platform_id`, `external_customer_id`, `is_active`, `subscription_expires_at` |
| 3 | `business_members` | our copy | Owner row per business, for merge parity |
| 4 | `customers` | our copy | + `external_id` |
| 5 | `sales_transactions` | our copy | `reference_id` **NOT NULL**; no `external_ref` |
| 6 | `sale_line_items` | our copy | |
| 7 | `expenses` | our copy | + `external_ref` |
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
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  @@map("external_admins")
}
```

### 5.4 Idempotency column — one per table, no duplicates

| Table | Column | Meaning |
|---|---|---|
| `sales_transactions` | `reference_id` | The client's idempotency key. For a sale created by `mark-paid`, it is the invoice number (matches the SME app's behaviour) |
| `expenses` | `external_ref` | The client's idempotency key |
| `invoices` | `external_ref` | The client's idempotency key |

`external_ref` is **not** added to sales. `reference_id` already carries
`unique_sales_reference` in the SME schema (`schema.prisma:224`, CONFIRMED), so
using it keeps merge parity and removes the v9 contradiction.

### 5.5 Column-shape rules for a future merge

| Rule | Why |
|---|---|
| Every **shared** column matches the SME name and type | A merge is `INSERT … SELECT` |
| Our **extra** columns (`platform_id`, `external_customer_id`, `is_active`, `external_id`, `external_ref`, `subscription_expires_at`) are ours and are not copied | They have no SME counterpart |
| Our tables are a **subset** of SME columns — never add a NOT NULL column the SME table lacks | The SME's `sales_transactions` has nullable FKs we do not carry (`classification_id`, `wallet_tx`, `credit_payment`, `credit_origin`) |
| UUID primary keys only | Already true; no renumbering on merge |
| `WOWO…` merchant IDs, `WX-…` invoice numbers | `merchant_id` is `@unique` (`schema.prisma:134`, CONFIRMED) |
| **Never repurpose a shared-named column** | The one rule that costs money to break |

**Graduation script (reference only — not built in v1):** insert `businesses` with
the same `id` pointing at a real PayMyTax user; insert the seven child tables
filtered by `business_id`; rewrite `merchant_id` to `PMTW…`; add `SalesSource.api`
to the SME enum at that time (one migration, not now).

### 5.6 Dates

`transaction_date`, `expense_date` and `issue_date` are `@db.Date`. Build every
one in UTC — `new Date(Date.UTC(y, m, d))`, never `new Date("2026-03-15")`, never
a local-time constructor. On a UTC+1 host the naive version records the previous
day. One helper, `src/lib/dates.ts`; every parse goes through it.

Reject year `< 2000` or `> current+10` with `400 INVALID_DATE`.

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
- **TTL 72 hours** (configurable per batch), single use, 10-attempt lockout.
- Stored hashed (`code_hash`), cleared on successful activation.
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
authenticateDevice  → 401
rateLimit           → 429
resolveAccount      → 404  (any account that is not the token's)
requirePlatformActive → 403 PLATFORM_SUSPENDED
requireSubscription → 402 SUBSCRIPTION_EXPIRED   (skipped for /me)
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
| Rate limit | `EXTERNAL_DATA_RATE_LIMIT` requests per **minute per device token**; `429` with `Retry-After` |
| Idempotency | Sales: `referenceId`. Expenses/invoices: `externalRef`. Replay returns the original row with `200` |

### 7.2 Error catalogue

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod failure; `details.fields` |
| 400 | `UNKNOWN_FIELD` | Strict-schema rejection (e.g. client sends `vatRate`) |
| 400 | `INVALID_DATE` | Out-of-range or unparseable date |
| 400 | `INVALID_AMOUNT` | Malformed or negative money |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | Missing, unknown, expired or revoked |
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
| 429 | `RATE_LIMITED` | Bucket exhausted |
| 503 | `API_DISABLED` | `EXTERNAL_API_ENABLED=false` |

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
Server sets `source = 'api'`, `status = 'confirmed'`, `isTaxable = false`.
`lineTotal` is computed as `quantity × unitPrice`; if `amount` disagrees with the
sum of lines, reject with `400 AMOUNT_MISMATCH` (do not silently pick one).

**Create expense** — `POST …/expenses`

```json
{ "externalRef": "wowo-exp-2210", "description": "Fuel", "amount": "8000.00",
  "expenseDate": "2026-11-09", "category": "fuel", "quantity": "1",
  "unitPrice": "8000.00" }
```
Required: `externalRef`, `description`, `amount`, `expenseDate`.
`category` optional, defaults to `other`; the 21-member `ExpenseCategory` enum is
exposed in OpenAPI (`schema.prisma:571-593`, CONFIRMED).

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
Required: `customerName`, `issueDate`, `dueDate`, `lines` (≥1).
`vatRate` is **rejected** if sent (`400 UNKNOWN_FIELD`) — D3.
Server computes `subtotal = Σ(qty × unitPrice)`, `total = subtotal − discount`,
`vatRate = 0`, `vatAmount = 0`. `currency` must be `NGN` in v1.

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

### 8.3 Tax guard

```ts
// src/tax-guard.ts
// The external surface never computes tax. This is the only place that decides
// a tax rate, and it always decides zero.
export const EXTERNAL_TAX = { vatRate: 0, isTaxable: false } as const;
```

Nothing reads these tables but us, so this is hygiene for a future merge — not a
safety net. The blocking gate is tenancy (Phase 3).

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
| Cancelled invoice | `410 INVOICE_CANCELLED` (matches `invoice-delivery.service.ts:144`, CONFIRMED) |
| Deleted invoice | `404` |
| Generation | Outside any transaction — CPU work |
| `pdf-link` | 32-byte `shareToken`, `share_token_expires_at` **default 30 days**, `GET /public/invoices/:shareToken/pdf` serves it with no credential |

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
| Postgres connection pressure | Pool capped; the SME app is on a different server |
| PDF generation | Never inside a transaction |

---

## 10. FILE CHANGES

### CREATE — new repository

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
EXTERNAL_DATA_RATE_LIMIT=120        # per minute, per device token
EXTERNAL_ACTIVATION_RATE_LIMIT=10   # per minute, per code
EXTERNAL_CODE_TTL_HOURS=72
EXTERNAL_SHARE_TOKEN_TTL_DAYS=30
EXTERNAL_TOMBSTONE_RETENTION_DAYS=180
PLATFORM_FLAT_FEE_NGN=0
```

No new secrets beyond `DATABASE_URL`. Admin and device credentials are hashed in
the database, not held in env.

---

## 11. IMPLEMENTATION PHASES

### Phase 0 — Scaffold and environments (4 h)

Repo, Node pinned to the SME app's range (`>=20 <23`), **separate Railway project**
with Postgres + staging, `prisma init`, `/health`, config validation, CI
(lint/typecheck/test), request-ID middleware, error envelope, `trust proxy`.

**Done when:** `/health` returns `200`, an unknown route returns the standard error
envelope with a request ID, and CI is green.

### Phase 1 — Schema and provisioning (10 h) ← *moved from Phase 7*

15 models, first migration, `sequence.service.ts` (`WOWO`, `WX-`), `provision.ts`.

CSV input columns: `externalCustomerId, businessName, ownerName, phone, email,
address, city, state`. **No activation codes in the file.**

Per row, one transaction: skip on `(platformId, externalCustomerId)`; insert
`User` (platform owner, created once), `Business` (`merchantId` from sequence,
`isActive = true`), `BusinessMember` (`role = owner`), dormant `ExternalDevice`,
and an `audit_logs` row (`actor = 'cli'`, `action = 'account.provisioned'`).
`P2002` → re-read → skip.

**Done when:** 100 accounts provision twice with zero duplicates; each has a
dormant device and no code; `_prisma_migrations` has one row.

### Phase 2 — Device auth and entitlement (12 h)

`/auth/activate`, `/auth/rotate`, `/auth/revoke`, `/me`; `authenticateDevice`,
`resolveAccount`, `requirePlatformActive`, `requireSubscription`; `lastSeenAt`
throttling; rate limits with `trust proxy`; audit inserts.

**Order matters:** `/me` must be mounted **before** `requirePlatformActive` and
`requireSubscription`.

**Done when:** a code issues exactly one token; a consumed code fails; lockout at
10; rotate swaps the token atomically; an expired subscription returns `402` on
data routes and `200` on `/me`.

### Phase 3 — Tenant isolation gate (6 h) — **GATE**

Four negative tests plus a CI grep assertion that no handler reads
`body.businessId` or an unscoped path segment.

**Do not start Phase 4 until this is green.** With `verifyBusinessAccess` gone,
this is the only thing between a bug and a cross-tenant breach.

### Phase 4 — Contract and CRUD (20 h)

Zod schemas → generated OpenAPI; customers (with `updatedSince`), sales, expenses
(category default `other`), idempotency, tombstones, keyset `(updatedAt, id)`.

**Done when:** a page of 50 sales sharing one `updatedAt` returns every row
exactly once; a replayed create returns the original row; OpenAPI validates every
route.

### Phase 5 — Invoices and the PDF (24 h)

State machine, PUT draft-only, `mark-paid` with the linked sale and date
validation, cancel, delete, **sale-delete guard**, PDF, `pdf-link` with expiry,
`GET /public/invoices/:shareToken/pdf`, three PDF tests.

### Phase 6 — Sync and hardening (8 h)

`/deletions` with retention, `EXPLAIN` on the change query, rate-limit units and
store, load test at pilot volume, tombstone retention job.

### Phase 7 — Docs, sandbox and operations (6 h)

Integration guide, sandbox tenant on staging, runbook, alerts, backup schedule
for our database, operator quickstart.

### Phase 8 — Admin surface (10 h) ← *last, as requested (D34)*

Admin endpoints of §7.3: platform list/edit (fee, subscription expiry,
suspend/resume), account list/detail/suspend/resume, activation-code issuance,
device list/revoke, audit-log search, usage stats (requests, last seen, row counts
per account). Admin auth via `external_admins` token, seeded by CLI.

**Done when:** an operator can see, for any Wowo merchant, when they last called
the API, how many sales/invoices/expenses they have, their device list, and can
suspend, extend a subscription, or re-issue an activation code — all without
touching the database.

**Total ≈ 100 h. Pilot (Phases 0–5) ≈ 76 h.** Estimates are rough and unverified.

---

## 12. TESTS

| Suite | Covers |
|---|---|
| `unit/token` | generate / hash / verify, tamper, code lockout, rotate |
| `unit/dates` | UTC boundary at 23:59 on a UTC+1 host |
| `unit/cursor` | round-trip; equal-timestamp paging returns each row once |
| `unit/money` | decimal-string parsing, rounding, rejection of shorthand (`150k`) |
| `unit/sequence` | concurrent allocation, no duplicate numbers |
| `integration/tenancy` | four negatives + `body.businessId` grep |
| `integration/auth` | activation single-use, expiry, lockout, lost-response recovery, rotate |
| `integration/entitlement` | platform expiry, account expiry, `/me` exemption, data retained |
| `integration/invoice-lifecycle` | issue → mark-paid → replay; PUT guards; delete guards |
| `integration/idempotency` | replay semantics, duplicate-with-different-payload → 409 |
| `integration/sales-delete` | linked sale refused; unlinked sale tombstoned |
| `integration/sync` | `updatedSince` + tombstones + retention |
| `integration/provisioning` | 100 accounts, re-run, concurrency |
| `integration/pdf` | no VAT line, disclaimer present, title not a tax invoice |
| `integration/public-pdf` | share token works with no credential; expired → 404; cancelled → 410 |
| `integration/admin` | admin authz, suspend/resume, subscription extension |
| `integration/merge-rehearsal` | graduation script against a **committed SQL snapshot** of the SME schema |

---

## 13. ACCEPTANCE CRITERIA

**Schema and provisioning**
- [ ] `migrate deploy` creates 15 tables; `_prisma_migrations` has one row
- [ ] 100 accounts provisioned twice → 100 rows, zero duplicates
- [ ] No activation code exists in any file produced by provisioning

**Auth and entitlement**
- [ ] A code issues exactly one token and cannot be reused
- [ ] Rotate issues a new token and revokes the old in one transaction
- [ ] Token on another account → `404`; revoked/expired → `401`
- [ ] Subscription expired → `402` on data routes, `200` on `/me`
- [ ] No token or activation code appears in any log

**Tenancy**
- [ ] No handler reads `body.businessId` (CI grep)
- [ ] Four negative tests green

**Data**
- [ ] Replayed create returns the original row
- [ ] A page of equal-`updatedAt` rows returns each exactly once
- [ ] Editing line items moves the parent's `updatedAt`
- [ ] `DELETE` on an invoice-linked sale → `409`
- [ ] `PUT` on a non-draft invoice → `409`
- [ ] Customer edits appear in `?updatedSince`

**Invoices and PDF**
- [ ] `mark-paid` on a draft → `409`; twice → one sale; future date → `400`
- [ ] Every invoice has `vatRate = 0`, `vatAmount = 0`, `total = subtotal − discount`
- [ ] Every sale has `isTaxable = false`, `source = 'api'`
- [ ] PDF title is `COMMERCIAL INVOICE`, no VAT line, disclaimer verbatim
- [ ] `pdf-link` works with no credential; expired → `404`; cancelled → `410`

**Operations**
- [ ] `EXTERNAL_API_ENABLED=false` → `503` on API routes, `/health` still `200`
- [ ] Platform suspended → `403` everywhere but `/me`
- [ ] Our database has its own backup schedule
- [ ] Admin can view usage, suspend, extend a subscription, and re-issue a code

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
| Backups | Our database only; separate schedule from the SME app |
| Retention | Tombstones 180 days; audit logs 2 years; both configurable |
| Monitoring | Request ID on every response; error rate, p95 latency, 4xx/5xx split, per-platform usage; alert on 5xx > 1% over 5 min |
| Kill switches | `EXTERNAL_API_ENABLED` → platform `isActive` → account `isActive` |
| Connection pool | Capped explicitly; the SME app has its own server, so the cap protects us, not them |

---

## 15. REMAINING QUESTIONS

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| 1 | **Billing unit** — does Wowo pay one platform fee, or is each merchant billed separately? The schema supports both; the default check is platform-level | Phase 2 (entitlement) | Platform-level for the pilot; per-account expiry is available but unset |
| 2 | **Who at Wowo delivers activation codes**, and through which channel? | Phase 2 | Wowo's onboarding team, via their existing merchant channel (SMS/in-app) |
| 3 | **Admin UI or endpoints only?** Phase 8 delivers endpoints; a small read-only UI is extra | Phase 8 | Endpoints + a thin internal page later |
| 4 | **Pilot size** | Phase 4 | 25–50 accounts before 100,000 |
| 5 | **Fee amount** | Phase 8 | Structure built; number pending |

**Closed in v10:** token lifetime (D32), code delivery (D33), admin surface (D34),
credential model (D36).

---

## 16. READINESS SCORE

**9/10 — ready to build.**

**Why not 10:**
- Tenant scoping is hand-written and is the single red risk. Phase 3 gates it.
- The merge contract is a written rule with no automated enforcement.
- The billing unit (#1) still needs a human decision before Phase 2 closes.

**What is solid:**
- Every existing-backend fact in §5 was re-read from `backend/` on 2026-11-10.
- The existing backend is untouched, so this project cannot regress PayMyTax.
- The contract in §7 is concrete enough for a coding agent to implement and for
  Wowo to integrate against.
- Provisioning no longer produces a 100,000-credential file.
- Access stops when the subscription lapses, without deleting anything.

**Definition of done for the pilot:** one green end-to-end test — *provision →
issue code → activate → create customer → create sale → create invoice → issue →
mark-paid → replay → render PDF → confirm one sale and one invoice in the
database, and confirm the SME app's database was never touched.*
