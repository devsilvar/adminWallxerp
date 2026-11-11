# External API Plan — letting a client use our invoices, sales & expenses

> Plain-language version. Read this if you are new to the codebase.

## 1. The problem in one sentence

A client wants to use **invoices, sales, and expenses** from inside their own app.
We must give them a way in **without** letting their traffic slow down or break
our own PayMyTax app, and **without** rewriting the business logic we already have.

## 2. The golden rule: do not copy the code

We already wrote all the logic for invoices, sales, and expenses (totals, month
locking, audit logs, ownership checks). Copying it into a second app means every
bug fix has to be done twice. Instead we build a **thin front door** (new auth +
new routes) that calls the **same** service functions. The services do not change.

Think of it like a building: the rooms (services) stay the same; we just add a
second entrance (external API) with its own security guard.

## 3. How a request flows

```
Client app
   │  sends X-API-Key: pmt_live_...
   ▼
External route  (/api/external/v1/...)
   │
   ├── authenticateApiKey   → "who is this key? which business?"
   ├── requireScope         → "is this key allowed to do this?"
   ├── rateLimitByKey       → "has this key used too much today?"
   ├── idempotency          → "did we already do this exact request?"
   ▼
Existing service (invoice.service / sales.service / expense.service)
   │
   ▼
Postgres (same database)
```

Because the service receives the same `userId` + `businessId` it always has,
nothing inside the service needs to change.

## 4. Auth: API keys, not passwords

Our app uses JWT tokens (short-lived, for browsers). A client app needs a
**long-lived key** it can store in its backend.

- Key looks like: `pmt_live_abcd1234...` (32 random bytes).
- We store only a **hash** of it (like a password). The client sees the plain
  key **once**, at creation.
- Each key is tied to **one business** and a list of **scopes**
  (`sales:read`, `sales:write`, `expenses:read`, …).
- Keys can be revoked, expired, or limited by IP.

The merchant creates keys from inside our own app (JWT-authenticated endpoint
`/api/v1/api-keys`). The client never touches our login screen.

## 5. Where the code lives (compartmentalized)

```
backend/src/external/
  routes/        sales.routes.ts, expenses.routes.ts, invoices.routes.ts, business.routes.ts
  controllers/   thin wrappers — call existing services
  middleware/    authenticateApiKey, requireScope, rateLimitByKey, idempotency
  validators/    reuse existing Zod schemas
```

Mounting is **one line** in `backend/src/routes/index.ts`:

```
router.use('/external/v1', externalRoutes);
```

Nothing else in the existing routes changes.

## 6. Hosting: should it be a separate Railway service?

The client has **a lot of users**, so isolation matters. Two honest options:

### Option A — one service, two route namespaces (start here)
- Same backend, same database, same deploy.
- External routes live at `/api/external/v1/...`; SME app at `/api/v1/...`.
- Give the external API its **own domain** (e.g. `api.yourdomain.com`) pointing at
  the *same* Railway service. Clients get a clean URL, zero extra infra.
- Protect the SME app with per-key rate limits so a noisy client can only burn
  their own quota.
- **Cost: nothing extra.** **Risk: a runaway client can still eat CPU/RAM of the
  same process.** Acceptable until traffic is real.

### Option B — second Railway service (do this when traffic is real)
- Deploy the same code as a second service, with an env var `SERVICE_MODE=external`
  so it only mounts the external router (leaner process, less memory).
- **Pros:** true compute isolation; can scale/restart independently; client
  traffic cannot touch SME-app latency.
- **Cons:** ~2× cost; both services share one DB → double connection pools
  (use Neon's pooled connection string / PgBouncer); migrations must run in only
  one service; env vars must be kept in sync.
- **When to switch:** client traffic degrades SME-app p99, or you need
  independent scaling, or a client demands network isolation.

**Recommendation for today:** Option A with strong rate limits + the env flag
`EXTERNAL_API_ENABLED` so you can kill the external surface instantly. Move to
Option B only when you have evidence the client's traffic is hurting the app.
Do not pay for isolation you do not need yet — but put the rate limits in now.

## 7. Things that keep the SME app safe

- **Per-key rate limits** (default e.g. 60 req/min, overridable per key).
- **Idempotency keys** on writes: client sends `Idempotency-Key` header; if the
  same request repeats, we return the cached answer instead of creating a second
  sale/invoice. (Critical: `markInvoicePaid` auto-creates a `SalesTransaction` —
  a retried call must not create two sales.)
- **Month-lock checks** already exist in services (`assertMonthNotLocked`) and
  external writes inherit them automatically.
- **Audit log** records which API key did what (`apiKeyId` added to `AuditLog`).
- **Scopes** = least privilege. New keys default to read-only.
- **Never log the key** in request logs (sanitize `X-API-Key` in the logger).

## 8. Phased rollout (solo-dev realistic)

1. **Phase A** — ApiKey model + migration + key management endpoints +
   `authenticateApiKey` + `requireScope`. Mount empty external router. Test with
   one read endpoint.
2. **Phase B** — Expose sales + expenses (read + write) + business read. Reuse
   controllers. Add idempotency to writes.
3. **Phase C** — Invoices (read, create, send, mark-paid, PDF download).
4. **Phase D** — Per-key rate limits, usage endpoint, OpenAPI spec, IP allowlist,
   key rotation.
5. **Later** — webhooks (`invoice.paid`, `sale.created`), OAuth2 if a client
   demands it, `/external/v2`.

## 9. Database changes needed (small)

- New table `ApiKey` (id, userId, businessId, name, keyPrefix, keyHash, scopes,
  rateLimitPerMinute, lastUsedAt, expiresAt, revokedAt, createdAt).
- New table `IdempotencyRecord` (apiKeyId, key, status, body, expiresAt).
- `AuditLog` gets a nullable `apiKeyId` column.
- That is all. No changes to Sales/Expense/Invoice tables.

## 10. What stays untouched

Services, internal controllers, validators, existing routes, middleware stack
order, Prisma models for sales/expense/invoice. The only edits to existing
files: one mount line in `routes/index.ts`, one nullable column on `AuditLog`,
and two config flags (`EXTERNAL_API_ENABLED`, `API_KEY_PEPPER`).

## 11. Open question to settle before starting

Should keys be minted by the **merchant** (recommended — merchant stays owner,
can revoke, ownership checks work with zero service changes) or under a special
"integration" user? Recommend merchant-owned keys; if you need to distinguish
"merchant did it vs integration did it" in audit logs, the `apiKeyId` column
already does that.
