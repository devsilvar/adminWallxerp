# Storefront Removal + Marketplace Inventory — Corrected Implementation Plan

> **v3 — 2026-10-07.** v2 was re-reviewed per `rereviewplan.md` (verdict: revise → corrected).
> v3 folds in the follow-up product requirements: **heterogeneous product types** (clothes,
> books, chairs/tables each carry different fields — v2's flat schema did NOT account for
> this), an extensive **Inventory section UI with a how-it-works explainer**, an explicit
> **push-to-marketplace** action, and "anybody (any team member) can add any kind of product".
> File renamed from `storefront-removal-plan.md` per request (storefront is the thing being
> removed — the plan is about the marketplace). Changelog: §13.
>
> Also incorporates the pre-v2 pricing-copy change (payout speed + withdrawal fee removed from
> all pricing benefits — `frontend/src/data/marketing.ts`, `subtext.md`; no backend code
> affected, verified: never plan-differentiated in code).

---

## 1. Objective

Remove the scrapped Storefront feature from the codebase and pricing, and ship a
**3-product-max Marketplace Inventory feature** where any team member adds any kind of
product (category-driven fields) from an **Inventory** section of the dashboard. Listed
products land in a DB table that a separate marketplace application reads through a
read-only public API. No checkout, no orders, no payments in this repo.

## 2. Requirements (source: user messages + `subtext.md`)

1. Storefront gone from code and pricing.
2. Each business may list max 3 products (drafts + listed combined).
3. Products display on an external marketplace app → read-only public API seam
   (`GET /api/v1/public/marketplace/products`) that the marketplace API requests from the DB.
4. Integrate with existing architecture; work items in `implementplancode.md` Phase-20 format.
5. Payout-speed & withdrawal-fee removed from pricing benefits — ✅ applied
   (`marketing.ts`: 4 feature bullets + 2 matrix rows; `subtext.md`: 2 table rows, ladder
   items 5–6, rollout step 7, enforcement-chokepoint line, rationale mention).
6. Plan re-reviewed per `rereviewplan.md` — ✅ v2.
7. **NEW (v3): heterogeneous product types.** Different products carry different fields
   (clothes → size/color/material; books → author/binding/pages; chairs/tables →
   material/dimensions). A single flat schema is wrong. Category-driven, validated
   attributes are required — and the marketplace must be able to render each type
   differently, so the API must expose the category + its attributes.
8. **NEW (v3): Inventory section of the dashboard** where *anybody* (any team member) adds
   *any kind* of product (catch-all category guarantees this) — with an **extensive UI that
   shows them how it works** (onboarding explainer, status feedback, guided form).
9. **NEW (v3): explicit push.** Adding a product ≠ listing it. Merchant adds to inventory
   (draft), then pushes to the marketplace (publish). Unlist is one click, instant.

## 3. Current System (verified against source)

- **Webhooks:** `processWebhook` → DVA check → **ORD branch (to delete)** →
  `taxPayment.findFirst` → complete + lock. Flat shims `src/services/payment.service.ts` and
  `src/services/dva.service.ts` re-export the per-domain dirs (integration tests import the
  shims; qahunter imports the dir directly — both keep working).
- **Auth:** `verifyBusinessAccess(userId, businessId, perm?, tx?)` at
  `src/lib/ownership.ts:129`, called **inside services** (`invoice-crud.service.ts:149,238,313…`;
  `invoice.controller.ts` has zero ownership calls). **v3 decision: products use the
  no-permission (membership) form for BOTH reads and mutations** — see §4.
  `settings.update` ∈ `FINANCIAL_OWNER_ONLY` (`permission.service.ts:45`) — NOT used here.
- **Uploads:** multer memoryStorage + `MAX_LOGO_BYTES`/`isAllowedLogoFile` fileFilter →
  `AppError(400, '…', 'LOGO_BAD_TYPE')` (`business.routes.ts:13-27`, multer `^2.1.1`);
  `uploadLogoToCloudinary(businessId, buffer, mime, oldPublicId?) → {url, publicId}` with
  base64 data-URI fallback (`publicId: 'local_data_uri'`); `deleteLogoFromCloudinary(publicId)`
  is best-effort and skips the sentinel.
- **Public surface:** `public.routes.ts` mounted at `routes/index.ts:50`
  (`v1.use('/public', …)`); currently contains **exactly one route** —
  `GET /invoices/:token/pdf` (`public.routes.ts:15`). Global rate limiter
  (`middleware/security.ts:88`, prod-only) already covers it; `downloadPublicPdf` precedent
  for explicit cache headers.
- **Cap-lock precedent:** per-entity
  `pg_try_advisory_xact_lock(hashtextextended(<id>::text, 0))` inside a tx
  (`wallet-auto-sweep.cron.ts:298`); job-level advisory locks in all 4 crons.
- **Errors:** `AppError(status, message, code, details)` → `{error:{code,message,details}}`.
  `TEAM_MEMBER_CAP_REACHED` = **400** (`team.service.ts:734`); `402` has no precedent yet
  (decision in §4).
- **Frontend:** axios interceptor special-cases 401 (refresh) + 502/503/504 (retry) only →
  402 reaches `catch` untouched. `PermissionKey` type (`types/index.ts:33`) mirrors all 30
  keys. No upgrade modal exists anywhere.
- **Sidebar (re-verified v3):** nav items
  `{to, label, icon, permission?}` filtered by local `checkPermission` —
  `Sidebar.tsx:50-53`: `if (!perm) return true;` → **an item with no `permission` field is
  visible to every member** (filter applied at `:99`). Labels via
  `useTranslation('nav')` (`:34`), pattern `t('Debtors', {defaultValue:'Debtors'})` (`:68`).
- **i18n:** react-i18next; new keys need no registry (defaultValue pattern).
- **Persisted-UI precedent:** page-local `localStorage` flags already used
  (`AIAssistant.tsx`, `InvitationAccept.tsx`) — the explainer-dismiss flag fits this pattern.
- **No shared backend/frontend package** exists → the category field definitions cannot be
  imported across the boundary; the backend must **serve** them (§4.1).
- **Storefootprint (v2-verified, re-confirmed):** `modules/store/` = contracts only (3 files,
  244 lines, single importer = `store-contract.test.ts`); ORD branches at
  `payment-webhook.service.ts:102-131 / :200 / :240-244`; DVA guard
  `dva-webhook.service.ts:253-258`; event type `event-bus.ts:21-31`; log-only listener
  `register-listeners.ts:70-82`; tests: `store-contract` (11), `phase4-store-webhook` (5),
  `event-bus.test.ts:41-60`, `phase3-adversarial-qa.test.ts:140-158 + :192-198`;
  ADR `docs/adr/0002…md:15,36`; PDF labels `statement.service.ts:388`,
  `receipt.service.ts:200`.
- **`online_store` enum = live logic, not residue:** the `charge.refunded` invoice-reversal
  path queries `linkedSale.source='online_store'` (`payment-webhook.service.ts` ~:296), and
  11+ files consume the value (validators, PDFs, import template + aliases, swagger enum).

## 4. Implementation Approach

- **Product ≠ sale.** `MarketplaceProduct` is a display listing. The marketplace app owns
  cart/checkout; this repo records no orders/payments/inventory decrements. Merchants record
  revenue through existing sales flows (subtext §1: never block sales entry).
- **4.1 Category-driven products (v3 core).**
  - **Single source of truth:** `backend/src/config/product-categories.ts` exports
    `PRODUCT_CATEGORIES: ProductCategoryDef[]`. The same array (a) generates the Zod
    attribute schema per category, (b) drives the public categories endpoint, (c) therefore
    drives the merchant form → **server validation and the form can never diverge.**
  - **`category TEXT`, not an enum.** Known bug class: Prisma enum drift = prod-only 500s
    (local DB isn't migration-built). Adding a category later = config-only, zero migration.
  - **`attributes JSONB`** validated with a **generated, `.strict()` Zod object** — unknown
    keys rejected, required fields enforced, field-level errors auto-mapped by the existing
    Zod error handling. `.strict()` also bounds payload size (only configured keys can exist).
  - **Catch-all `other`** (no extra fields) guarantees requirement 8: any product kind can be
    added even when no typed category fits.
  - **Marketplace renders by type:** public API returns `category` + `attributes` so the
    marketplace app shows size/color chips for fashion, author/binding for books, dimensions
    for furniture, etc.
- **Draft → push (requirement 9).** `isActive` defaults **false** (draft). "Push to
  marketplace" = `updateProduct(..., {isActive:true})`; unlist = `false`. Public endpoint
  filters `isActive:true` → instant effect. Cap counts drafts + listed together.
- **Auth: membership-level for everything (requirement 8, "anybody").** Reads *and*
  mutations call `verifyBusinessAccess(userId, businessId)` with **no permission key** —
  sales-staff-level participation, zero changes to the 30×5 permission matrix, and no
  seeing-but-can't-add dead ends (nav is un-gated anyway, §3). Listing a display-only
  product is low blast radius (delist/delete is one click, all actions audited).
  *(v2 used `settings.update` owner-only — overridden by the explicit "anybody" requirement.)*
- **Cap + plan-gate:** `createProduct` enforces `count < 3` under a per-business advisory
  lock, throwing `AppError(402, …, 'PLAN_LIMIT_REACHED', {requiredPlan:'business',
  currentUsage, limit:3})`. A `// PLAN-GATE:` call site marks where `assertPlanFeature`
  wires in when `BusinessSubscription` ships (subtext rollout step 4). Interim: everyone gets
  the 3-cap. **402 is deliberate** (codebase cap precedent is 400) — detection must key on
  `error.code === 'PLAN_LIMIT_REACHED'`, never on the status.
- **Images:** two-step (upload → persist `imageUrl`+`imagePublicId`) so DB transactions stay
  network-free (CLAUDE.md rule). Copy the 15-line multer config from `business.routes.ts`
  rather than abstracting it.
- **Public read (2 endpoints):**
  - `GET /api/v1/public/marketplace/products?businessId=<uuid>` — `z.string().uuid()` guard,
    explicit `select` whitelist (**8 fields**), `isActive:true` only, no auth (uuid + global
    limiter = same threat model as the public invoice PDF), no PII possible by construction.
  - `GET /api/v1/public/marketplace/categories` — static category config (labels, field
    defs, icon names), no auth, no DB hit. Serves the merchant form *and* the marketplace app.
- **PDF labels** `'Online Storefront'` / `'Online Store Payment'` relabelled to
  `'Online Sale'` / `'Online Sale Payment'`; **enum value and import aliases untouched**.

---

## 5. File Changes

### CREATE

| File | Why |
|---|---|
| `backend/prisma/migrations/<ts>_add_marketplace_products/migration.sql` | Additive table (hand-written — repo precedent) |
| `backend/src/config/product-categories.ts` | Category + field definitions; derives Zod schemas |
| `backend/src/services/product/product.service.ts` | CRUD + cap + membership auth + attribute validation |
| `backend/src/validators/product.validator.ts` | Zod (base fields + generated attributes) |
| `backend/src/controllers/product.controller.ts` | `asyncHandler` delegation only (+ public handlers) |
| `backend/src/routes/product.routes.ts` | `mergeParams` + `authenticate` router |
| `frontend/src/pages/Inventory.tsx` | Inventory section: explainer + 3-slot grid |
| `frontend/src/components/inventory/ProductForm.tsx` | Category picker + dynamic per-category fields |
| `frontend/src/stores/inventory.store.ts` | Zustand list + categories (fetched once) |
| `docs/marketplace-integration.md` | External seam contract incl. per-category rendering (B7) |

### MODIFY

| File | Change |
|---|---|
| `backend/src/services/payment/payment-webhook.service.ts` | Strip ORD branches `:102-131`, `:200` → `if (!reference) return;`, `:240-244`. Keep `logAudit` (8 other call sites) + `eventBus` (`:418`, `:547`) imports — verified still used |
| `backend/src/services/dva/dva-webhook.service.ts` | Strip guard `:253-258` |
| `backend/src/core/events/event-bus.ts` | Delete event type `:21-31` |
| `backend/src/core/events/register-listeners.ts` | Delete log-only listener #5 `:70-82` |
| `backend/src/services/documents/statement.service.ts` | `:388` label → `'Online Sale'` |
| `backend/src/services/documents/receipt.service.ts` | `:200` label → `'Online Sale Payment'` |
| `backend/src/routes/index.ts` | Mount products route after `:68` |
| `backend/src/routes/public.routes.ts` | Add `GET /marketplace/products` + `GET /marketplace/categories` (file currently has only the invoice PDF route, `:15`) |
| `backend/prisma/schema.prisma` | `MarketplaceProduct` model (incl. `category`, `attributes`, `isActive` default false) + `Business` back-relation |
| `docs/adr/0002-user-central-wallet-vs-business-tax.md` | Superseded-note on `:15`, `:36` — never rewrite the historical paragraphs |
| `backend/src/config/swagger.ts` | MAY MODIFY — `paths:` at `:475` (central swagger; controllers have zero annotations) |
| `CLAUDE.md` | Route map + Prisma Models list |
| `frontend/src/App.tsx` | Lazy route `/inventory` (ProtectedRoute block, `:139-174`) |
| `frontend/src/components/layout/Sidebar.tsx` | Operate-group item after Debtors: `{to:'/inventory', label:t('Inventory',{defaultValue:'Inventory'}), icon:Package}` — **no `permission` field** (verified: `checkPermission(undefined)→true`, `:50-53`) |
| `frontend/src/types/index.ts` | `MarketplaceProduct`, `ProductCategory`, `ProductFieldDef`, `ProductAttributes` types |

### DELETE

- `backend/src/modules/store/` (all 3 files; only importer = the test below)
- `backend/tests/unit/store-contract.test.ts` (11 tests)
- `backend/tests/integration/phase4-store-webhook.test.ts` (4 storefront tests) — **after**
  moving its `:231` test (see TESTS)

### DO NOT TOUCH

- `online_store` enum value + its 11 consumer files (incl. the refund invoice-reversal path)
- `.kilo/worktrees/**` (external worktree)
- Historical planning MDs: `codebaserefactor.md`, `implemnetation.md`, `phase-by-phase-plan.md`,
  `PHASED_EXECUTION_PLAN.md`, `codebaserescture.md`
- `backend/README.md` (API section already stale "Coming Soon" — maintained by neglect)
- `PlatformFeeConfig` / all fee & auto-sweep code (never plan-differentiated)
- `permission.service.ts` (30×5 matrix untouched — no new permission keys)

### DATABASE

One additive migration, **no enums** (enum drift = known prod-500 bug class):

```sql
CREATE TABLE "marketplace_products" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(15,2) NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "image_url" TEXT,
  "image_public_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_products_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "marketplace_products_business_id_idx" ON "marketplace_products"("business_id");
```

(Snake-case `@@map` + `@db.Decimal(15,2)` per repo money convention; match column naming to
what `prisma migrate diff` generates for the model below — the model is the source of truth.
No extra index for the public query: it filters by `businessId` first, and each business has
≤3 rows.)

```prisma
model MarketplaceProduct {
  id            String   @id @default(uuid())
  businessId    String
  name          String
  description   String?
  price         Decimal   @db.Decimal(15, 2)
  category      String    @default("other")
  attributes    Json      @default("{}")
  imageUrl      String?
  imagePublicId String?
  isActive      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  business      Business  @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@map("marketplace_products")
}
```

### CONFIGURATION

**Product category config** — `backend/src/config/product-categories.ts` (code, not env):

```ts
export type ProductFieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean';

export interface ProductFieldDef {
  key: string;          // snake_case, stored as-is inside attributes
  label: string;
  type: ProductFieldType;
  required: boolean;
  options?: string[];   // select only
  unit?: string;        // display suffix, e.g. 'cm', 'kg', 'months'
  maxLength?: number;   // text/textarea (default 120 / 2000)
  min?: number; max?: number; // number only
  placeholder?: string;
}

export interface ProductCategoryDef {
  id: string;      // matches `category` column (TEXT — adding one = config-only, no migration)
  label: string;
  icon: string;    // lucide icon name, frontend maps with Package fallback (marketplace may ignore)
  blurb: string;   // one-liner on the picker card
  fields: ProductFieldDef[];
}
```

Seed set (v3 — extensible; ship these 6):

| id | label | fields (key: type, required) |
|---|---|---|
| `fashion` | Clothing & Fashion | `size`: select[XS,S,M,L,XL,XXL] req · `color`: text req · `material`: select[cotton,polyester,denim,leather,wool,silk,other] · `fit`: select[men,women,unisex,kids] |
| `books` | Books & Stationery | `author`: text req · `publisher`: text · `language`: select[English,Yoruba,Hausa,Igbo,French] · `binding`: select[paperback,hardcover,spiral,saddle-stitch] · `pages`: number min 1 |
| `furniture` | Furniture (chairs, tables…) | `material`: select[wood,metal,plastic,glass,fabric,rattan] req · `width_cm`/`depth_cm`/`height_cm`: number min 0 · `color`: text · `assembly_required`: boolean |
| `electronics` | Electronics | `brand`: text req · `model`: text · `warranty_months`: number min 0 · `color`: text |
| `food` | Food & Groceries | `brand`: text · `weight_kg`: number min 0 · `shelf_life_days`: number min 1 · `storage`: select[ambient,chilled,frozen] |
| `other` | Something else | *(no extra fields — the catch-all that guarantees "any product")* |

Core fields (all categories): `name` 3–120, `description` ≤1000 optional, `price` positive
2-dp, `isActive` boolean (update only), image via separate upload endpoint.

No env vars, no feature flags. `multer@^2.1.1` already a dependency (`package.json:67`).

### TESTS

- **Delete:** `tests/unit/store-contract.test.ts`; 4 storefront tests in
  `phase4-store-webhook.test.ts` (`:59`, `:132`, `:153`, `:178`).
- **Move:** `phase4-store-webhook.test.ts:231-281` — the signed `charge.success` →
  `taxPayment.paymentStatus='completed'` + report `isLocked=true` test — into
  `payments-verification.test.ts` with a clean title (drop the ORD mention). This is the
  **only** such test in the repo (`payments-verification` covers DVA capture/idempotency;
  `qahunter` covers signatures; `tax-finalization-gate` has no webhook coverage) and it
  protects exactly the path RM touches. Then delete the phase4 file.
- **Modify:**
  - `tests/unit/event-bus.test.ts:41-60` — multi-listener test: swap
    `order.payment_confirmed` → `invoice.paid` **and replace the payload with a valid
    `AppDomainEvents['invoice.paid']` shape** (typed bus — name-only swap won't compile).
  - `tests/integration/phase3-adversarial-qa.test.ts` — remove `:140` registration,
    `:148-158` emit, **and update the order-sensitive `expect(fired).toEqual([...])` at
    `:192-198` to the remaining 4 events**.
- **Create:**
  - Unit: cap enforcement (4th → 402 with exact `details`), concurrency (20 parallel creates →
    exactly 3 rows, drafts included), audit rows written.
  - Unit (v3): per-category attribute validation — `fashion` without `size` → 400;
    `books` with unknown key → 400 (`.strict()`); `other` with `{}` → valid; number/select
    type coercion and bounds; category change on update replaces (never merges) attributes
    and revalidates.
  - Integration: CRUD authz (**membership: any member may create/update/delete** — assert a
    plain `sales_staff` member succeeds), 402 shape, multer rejects `.gif` + >5MB
    (`PRODUCT_BAD_TYPE`), public products whitelist (**exactly 8 keys**, no auth), public
    categories endpoint shape + `Cache-Control`, draft excluded from public list until pushed,
    unknown `category` → 400 `UNKNOWN_PRODUCT_CATEGORY`, moved tax-payment webhook test green
    post-removal.

---

## 6. Implementation Steps (dependency-aware)

### Phase A — Removal (parallel-safe with B until A8)

> **A1 — Delete `modules/store/` + `store-contract.test.ts`** (same commit so typecheck stays
> green).
> Where: `backend/src/modules/store/*`, `tests/unit/store-contract.test.ts`.
> Why: contracts-only module; its single importer is the test being deleted.
> Dependencies: none.

> **A2 — Strip ORD branches** from `payment-webhook.service.ts`.
> `:102-131` delete the whole `charge.success` ORD block (payload build, `logAudit
> 'store.order_payment_received'`, `eventBus.emit`, `return`); `:200` `charge.failed` →
> `if (!reference) return;`; `:240-244` delete `charge.refunded` ORD guard (safe — the
> `if (payment)` wrapper and null-guarded DVA/invoice fallthrough sit directly below it).
> Do NOT touch the `logAudit`/`eventBus` imports (8 + 2 remaining call sites verified).
> Why: storefront routing in the live tax-payment webhook.
> Dependencies: A1 (same commit acceptable).

> **A3 — Strip ORD guard** from `dva-webhook.service.ts:253-258`.
> Behavior note: ORD dedicated_nuban transfers become normally auto-captured (previously
> skipped against a fulfillment handler that never existed). See A8 before shipping.
> Dependencies: A2.

> **A4 — Remove event type + listener + fix the two borrowing tests.**
> `event-bus.ts:21-31`; `register-listeners.ts:70-82`;
> `event-bus.test.ts:41-60` (swap to `invoice.paid` + valid payload);
> `phase3-adversarial-qa.test.ts` (`:140`, `:148-158`, **`:192-198` expectation array**).
> Typecheck will point at every remaining reference — fix in that order.
> Dependencies: A2, A3.

> **A5 — Rescue the regression test.** Move `phase4-store-webhook.test.ts:231-281` into
> `payments-verification.test.ts` (clean title), delete the phase4 file.
> Dependencies: A2 (must land with or before it).

> **A6 — Relabel PDFs:** `statement.service.ts:388` → `'Online Sale'`;
> `receipt.service.ts:200` → `'Online Sale Payment'`. Enum value + import aliases untouched.
> Dependencies: none.

> **A7 — ADR note** on `docs/adr/0002…md`: Storefront extension scrapped 2026-10; marketplace
> products book no orders through this platform. Append, don't rewrite history.
> Dependencies: none.

> **A8 — Pre-deploy data check (ops, before A3 ships):** on prod (Railway console — prod DB
> unreachable from this machine), run
> `SELECT count(*) FROM sales_transactions WHERE reference_id LIKE 'ORD-%';` and the same
> against `tax_payments.transaction_reference`. Expected 0 → confirms A3 is a no-op in
> practice. Dependencies: A3 staged but not deployed.

> **A9 — Phase A gate:**
> `grep -rn "ORD-\|modules/store\|order.payment_confirmed\|store.order" backend/src backend/tests`
> → empty · `npm run typecheck` · full suite green (`TEST_DATABASE_URL` set — see §8).
> Dependencies: A1–A7.

### Phase B — Marketplace Inventory

> **B1 — Prisma migration + model.** Model per §5 DATABASE; `npx prisma validate` +
> `npm run prisma:generate`; apply locally. Additive only, no enums.
> Dependencies: none.

> **B2 — `config/product-categories.ts` + `product.service.ts`.**
> (a) Write the category config per §5 CONFIGURATION and export
> `buildAttributesSchema(categoryId)` → Zod `.strict()` object derived from `fields`
> (unknown category → `null` sentinel; select → `z.enum(options)`; number →
> `z.coerce.number()` with min/max; text → `z.string().trim().max(maxLength ?? 120)`;
> required → `.min(1)`, optional → `.optional()`).
> (b) `export const MARKETPLACE_PRODUCT_CAP = 3;` here (NOT in `permission.service.ts`).
> `createProduct`: open tx → `SELECT pg_try_advisory_xact_lock(hashtextextended(${businessId}::text,0))`
> via `$queryRaw` → `verifyBusinessAccess(userId, businessId, undefined, tx)` (**membership —
> requirement 8**) → `count({businessId})` → `>= CAP` throws
> `new AppError(402, …, 'PLAN_LIMIT_REACHED', {requiredPlan:'business', currentUsage, limit:3})`
> → validate `category` (unknown → `AppError(400, …, 'UNKNOWN_PRODUCT_CATEGORY')`) + attributes
> (generated schema; failure → normal Zod error mapping) → `create` (no `isActive` → DB
> default `false` = draft) + `logAudit('product.created', …)`.
> (Advisory lock first = the race fix; a bare count-then-insert under READ COMMITTED passes
> twice at count=2.)
> `listProducts`: membership check (no permission key), `orderBy createdAt asc`.
> `updateProduct`: scoped `where: {id, businessId}` + membership; **if `category` changes,
> `attributes` is replaced wholesale and revalidated against the new category** (never
> merged); `isActive:true` = push (audit `product.pushed`), `false` = unlist
> (`product.unlisted`); other changes → `product.updated`.
> `deleteProduct`: membership, scoped, audit; hard delete, then **after commit** best-effort
> `deleteLogoFromCloudinary(imagePublicId)` (skips `local_data_uri`).
> Dependencies: B1.

> **B3 — `product.validator.ts`.** Base Zod: `name` trim 3–120; `description` ≤1000 optional
> (plain text); `price` `z.coerce.number().positive().max(999999999.99)` + 2-dp precision
> check; `category` non-empty string (existence checked in service against config);
> `attributes` `z.record(z.unknown())` shape-gate (semantic validation via B2's generated
> schema); `isActive` boolean (update only); `imageUrl` url ≤500 optional; `businessId`
> `z.string().uuid()` (repo pattern: `admin.validator.ts:78`). Export via `z.infer`.
> Dependencies: B1, B2(a).

> **B4 — Controller + routes + mount.**
> `product.routes.ts`: `Router({mergeParams:true})` + `router.use(authenticate)` (copy
> `team.routes.ts`), endpoints:
> `GET /` · `POST /` (Zod create) · `PUT /:productId` (Zod update — includes `isActive` push
> toggle) · `DELETE /:productId` · `POST /:productId/image` (multer `.single('image')`,
> fileFilter copied from `business.routes.ts:17-27`, error code `PRODUCT_BAD_TYPE`) ·
> `DELETE /:productId/image`.
> Controller: parse/validate → call service → respond (`asyncHandler`) — **no auth logic in
> the controller** (repo convention).
> Image-create flow: upload (network) → receive `{url, publicId}` → service create with both
> fields (tx stays network-free). `POST /:productId/image` on existing product: upload first,
> then a short tx persisting `{imageUrl, imagePublicId}` (old asset deleted by
> `uploadLogoToCloudinary`'s `oldPublicId` param).
> Mount in `routes/index.ts` after `:68`:
> `v1.use('/businesses/:businessId/products', productRoutes);`
> Dependencies: B2, B3.

> **B5 — Public endpoints (2).** In `public.routes.ts` (no `authenticate`):
> (1) `GET /marketplace/products?businessId=…` — uuid guard → business exists? (else 404) →
> `findMany` with `select: {id, name, description, price, imageUrl, category, attributes,
> createdAt}` (**8 fields**), `isActive: true`, `orderBy createdAt asc`;
> `Cache-Control: public, max-age=60`.
> (2) `GET /marketplace/categories` — serialize `PRODUCT_CATEGORIES` (id, label, icon, blurb,
> fields), no DB query; `Cache-Control: public, max-age=3600`.
> `// PLAN-GATE:` comment at the subscription-liveness hook point (products endpoint).
> Dependencies: B1, B2 (parallel with B4).

> **B6 — Frontend: Inventory section (extensive UI).**
> Type in `types/index.ts` → `stores/inventory.store.ts` (products list; `categories`
> fetched **once** from the public endpoint with module-level guard; actions
> fetch/create/update/push/unlist/remove/uploadImage — invoice-store list-cache style) →
> **`pages/Inventory.tsx`**:
> - **How-it-works explainer (requirement 8):** dismissible 3-step strip at the top —
>   ① *Add up to 3 products from your inventory* ② *Push them to the WallX Marketplace —
>   they go live instantly* ③ *Buyers discover your shop; orders come to you directly
>   (payments never pass through this platform)* — numbered cards, each with icon + one
>   sentence. Dismiss → `localStorage 'wallx:inventory:howto' = 'dismissed'`
>   (precedent: `AIAssistant.tsx` persisted-UI flags). **Empty state always renders the
>   explainer regardless of the flag**, with the primary CTA "Add your first product".
> - Header strip `bg-gray-50/70` + "0/3 slots used" pill (`rounded-full ring-1 ring-inset`).
> - Grid of exactly 3 slots: filled = card (image, name, `formatNaira` price, description,
>   **category badge + up to 3 attribute chips** e.g. `Size M · Blue · Cotton`, **status pill
>   `Listed`/`Draft`**, edit/delete, and a **Push/Unlist toggle button** with caption
>   "Live on the marketplace" / "Only in your dashboard"); empty = dashed add-tile with a
>   `+` and "Add product" (the visible cap).
> - **`ProductForm.tsx` (shared `Modal`):** step 1 category picker — responsive cards
>   (icon + label + blurb from the categories config, `other` card reads "Something else —
>   just name, price and a photo"); step 2 — core fields + **dynamically rendered attribute
>   fields** for the chosen category (labels/options/units straight from config; changing
>   category resets attributes); image upload; client mirrors server validation for instant
>   feedback (server remains source of truth). On create success → toast
>   "Saved to inventory — push it to the marketplace when ready."
> - 402 catch → inline upgrade modal on the **shared `Modal`** (build content inline, no new
>   component file) showing `currentUsage/limit` + CTA `/pricing?plan=business` (subtext §3.2:
>   paywall at the attempted action).
> - Image: FormData POST mirroring `Settings.tsx:281` logo upload.
> Route: lazy `/inventory` in `App.tsx` ProtectedRoute block. Sidebar: Operate group after
> Debtors, `Package` icon, **no `permission` field**.
> Dependencies: B4, B5 (mock-OK from B1).

> **B7 — Docs.** `CLAUDE.md` route map + Models list; `docs/marketplace-integration.md`:
> both endpoints, example JSON (a fashion row with attributes + the categories payload),
> **per-category rendering contract** (marketplace reads `category` → picks card layout →
> renders `attributes`), whitelist guarantee (8 keys), `isActive` = push/unlist (instant),
> no-auth + rate-limit note, explicit non-goals: no webhooks out, no order ingestion, no
> payments, adding a category = config-only. Optional `config/swagger.ts:475` paths.
> Dependencies: B4, B5.

> **B8 — Phase B gate.** Backend `npm run typecheck && npm test` (with `TEST_DATABASE_URL`);
> frontend `npm run lint && npm test && npm run build`; manual golden path (pick category →
> fill dynamic form → save draft → push → appears on public endpoint → unlist → gone;
> add/edit/delete/upload), cap-402 → modal, explainer dismiss persists, unauthenticated
> public curl (both endpoints).
> Dependencies: B1–B7.

> **B9 — Final sweep.**
> `grep -rn -i "storefront" frontend/src backend/src subtext.md docs` → empty (except ADR
> superseded-note) ·
> `grep -rn -i "payout speed\|withdrawal fee\|same-day" frontend/src/data/marketing.ts subtext.md`
> → empty · `online_store` ref-count unchanged (16 baseline).
> Dependencies: A9, B8.

---

## 7. Edge Cases

| Case | Handling |
|---|---|
| 20 parallel creates | Per-business advisory lock serializes → exactly 3 rows (unit-tested); drafts count |
| Cap attempt | 402 + `PLAN_LIMIT_REACHED` + `details{requiredPlan,currentUsage,limit}` → upgrade modal |
| Unknown `category` | 400 `UNKNOWN_PRODUCT_CATEGORY` (service checks against config) |
| Missing/mistyped attributes | Generated `.strict()` Zod → 400 with field-level details (existing Zod mapping); unknown keys rejected; oversized text blocked by `maxLength` |
| Category changed on update | Attributes **replaced wholesale** and revalidated against the new category — stale keys can never survive |
| Product type not in config | `other` catch-all (core fields only) — requirement 8 |
| Draft vs pushed | `isActive:false` excluded from public list; toggle is instant (60s cache note: `max-age=60` means up to 60s CDN/browser staleness — acceptable, documented) |
| Cloudinary unconfigured/failing | Base64 data-URI fallback (`publicId:'local_data_uri'`) — same as logo precedent |
| Image delete | Best-effort after commit; never fails the product delete; sentinel skipped |
| Non-member mutation | `verifyBusinessAccess` → 403 (existing ownership error mapping) |
| Member (any role incl. sales_staff) CRUD | **Allowed** — membership-level by design (requirement 8); all actions audited |
| Public: bad uuid / unknown business / inactive product / unknown businessId type | 400 / 404 / excluded / 400 |
| Categories endpoint | Static config, no DB, no auth; PII impossible |
| Deleted business | FK `ON DELETE CASCADE` |
| Price precision | `Decimal(15,2)` + Zod 2-dp validation; server computes, client displays |
| Attributes JSONB size | Bounded by `.strict()` + per-field `maxLength` — only configured keys can exist |
| In-flight ORD-* refs at deploy | A8 pre-deploy prod check (expected 0) |
| Concurrent webhooks | Existing `PaystackWebhookEvent` idempotency table untouched |
| Icon name unknown to marketplace/frontend | Fallback to `Package` icon |

## 8. Testing Strategy

- **Unit:** cap enforcement (drafts included); 20-way concurrency → 3 rows; per-category
  attribute validation matrix (fashion/books/other + unknown key + category-change
  replacement); validator rejects; audit rows.
- **Integration (needs `TEST_DATABASE_URL` — `tests/helpers/loadEnv.ts` redirects the whole
  process to it, with a hard guard against pointing it at prod):** CRUD authz incl.
  sales_staff-may-create; exact 402 body; multer `.gif`/6MB rejects; public products whitelist
  (assert exactly **8** keys per row, no Authorization header); categories endpoint shape +
  cache header; draft invisible until `isActive:true`; unknown category → 400; moved
  charge.success→tax-completed test passes post-A2.
- **Regression:** event-bus multi-listener + phase3 fan-out tests still assert their original
  purposes (multi-listener dispatch / ordered fan-out) after the event removal.
- **Frontend:** existing suite + `build`; manual: explainer → dismiss → reload (stays gone,
  but returns in empty state); category picker → dynamic fields → save → push → status pill
  flips → public list reflects (≤60s cache); add 4th → modal → `/pricing`.

## 9. Acceptance Criteria

1. `grep -rn "ORD-\|modules/store\|order.payment_confirmed\|store.order" backend/src backend/tests` → empty.
2. `grep -rn -i "storefront" frontend/src backend/src subtext.md docs` → empty except ADR's superseded-note.
3. No payout-speed / withdrawal-fee / same-day benefits in `marketing.ts` or `subtext.md`.
4. `online_store` ref-count unchanged (16) — enum + refund path intact.
5. Backend `typecheck` + full suite green (with `TEST_DATABASE_URL`); frontend `lint` + `test` + `build` green.
6. The signed charge.success→tax-completed test exists in `payments-verification.test.ts` and passes.
7. 4th product → HTTP 402 `{code:'PLAN_LIMIT_REACHED', details:{requiredPlan:'business', currentUsage:3, limit:3}}`; 20 parallel creates → exactly 3 rows (drafts included).
8. `GET /api/v1/public/marketplace/products?businessId=…` unauthenticated → only **pushed** products, exactly `{id,name,description,price,imageUrl,category,attributes,createdAt}` per row; non-uuid → 400; unknown → 404.
9. **Category system:** `fashion` create without `size` → 400; `books` with unknown attribute key → 400; `other` with `{}` → 201; unknown category → 400 `UNKNOWN_PRODUCT_CATEGORY`; category swap on update replaces attributes.
10. **Inventory UI:** `/inventory` renders the 3-step how-it-works explainer (always in empty state; dismiss persists); category picker → dynamic fields per config; push/unlist flips public visibility; cap opens the upgrade modal at the blocked action.
11. **Anybody:** a `sales_staff` member can create/edit/push a product; `ALL_PERMISSIONS` still 30 keys (no permission added); sidebar item has no `permission` field and renders for every member.
12. `GET /api/v1/public/marketplace/categories` → full category config, `Cache-Control: public, max-age=3600`.
13. `CLAUDE.md` route map + Models updated; `docs/marketplace-integration.md` exists with the per-category rendering contract.

## 10. Remaining Questions

None blocking — all open questions resolved from codebase/spec (plain-text description;
membership-level auth per "anybody"; uuid + global rate limiter matches the public-invoice
precedent — no API-key infra exists; `other` catch-all removes the "unsupported product
kind" failure mode).

Two open product decisions, deliberately deferred (neither blocks implementation):

1. **Cap after `BusinessSubscription` ships** — interim everyone gets 3; `// PLAN-GATE:`
   marks the seam (subtext rollout step 4).
2. **Categories endpoint authority for the external marketplace app** — it may cache the
   config itself (1h) or re-fetch; contract documented in B7.

One ops prerequisite, not a design question: **A8 must be run against prod before A3 ships**
(prod DB unreachable from this machine).

## 11. Readiness

**9/10** — implementation-ready. v2's file:line claims were re-verified during its
`rereviewplan.md` pass; v3's new claims (sidebar `checkPermission` behavior, public routes
current content, i18n pattern, persisted-UI precedent) were verified directly against source
today. The missing point is the usual uncertainty of hand-written migrations against a prod
DB that runs migrations on every Railway start (A8 covers the data-side risk).

---

## 12. Appendix — changelog v1 → v2

| v1 plan | Decision | v2 plan | Reason |
|---|---|---|---|
| Auth in controller | Moved | Auth inside `product.service.ts` | Repo convention (`invoice-crud.service.ts`) |
| Model without `imagePublicId` | Fixed | Column added + wired to upload/delete | Required by `uploadLogoToCloudinary`/`deleteLogoFromCloudinary`; `logoPublicId` precedent |
| Delete phase4 test file wholesale | Split | Move `:231` tax test → `payments-verification.test.ts`, delete 4 store tests + file | Only signed charge.success→tax-completed test in repo; protects the RM-touched path |
| "Swagger annotations per route" | Corrected | Optional edit to `config/swagger.ts:475` | Controllers have zero swagger comments |
| "Transactional count" for cap | Hardened | Per-business `pg_try_advisory_xact_lock(hashtextextended(…))` first | READ COMMITTED count races; precedent `wallet-auto-sweep.cron.ts:298` |
| phase3 edit | Extended | Also fix `toEqual` expectation array `:192-198` | Order-sensitive assertion |
| event-bus swap | Extended | Swap event name **and** payload | `TypedEventBus` emits are type-checked |
| PDF labels kept | Changed | `'Online Storefront'`→`'Online Sale'`, `'Online Store Payment'`→`'Online Sale Payment'` | Customer-visible wording; enum untouched |
| List gated on `settings.read` | Changed | Membership-level list; nav un-gated | Subtext §1 (viewing never gated) + `FINANCIAL_OWNER_ONLY` |
| — | Added | `CLAUDE.md` route map + Models update | Maintained doc |
| — | Added | A8 pre-deploy prod `ORD-*` check | Guard-removal behavior change; prod unreachable locally |
| — | Added | `TEST_DATABASE_URL` on all integration verification | `loadEnv.ts` requirement |
| MKT numbering hole | Fixed | A1–A9 / B1–B9 | Readability |
| 3 open questions | Resolved | Plain text description; nav visible + server 402; uuid+limiter | Answerable from spec + precedent |
| — | Added | 402-vs-400 decision documented | `TEAM_MEMBER_CAP_REACHED` is 400; 402 kept deliberately, detect by `code` |

## 13. Appendix — changelog v2 → v3

| v2 plan | Decision | v3 plan | Reason |
|---|---|---|---|
| Flat product schema (name/detail/price/image) | **Replaced** | `category TEXT` + `attributes JSONB` + generated per-category `.strict()` Zod | User requirement 7 — clothes/books/furniture carry different fields; v2 did NOT account for this |
| — | Added | `config/product-categories.ts` as single source of truth (validation + public endpoint + form) | No shared backend/frontend package; divergence-proofing |
| — | Added | 6 seed categories incl. `other` catch-all | "Anybody can add any kind of product" |
| — | Added | Public `GET /marketplace/categories` endpoint | Frontend form + marketplace app both need field defs |
| — | Added | `isActive` default **false** + explicit Push/Unlist action | User requirement 9: intentional "push to marketplace" |
| Public whitelist 6 fields | Grew | 8 fields (+ `category`, `attributes`) | Marketplace renders per-type cards |
| Frontend `/products` "3-slot grid page" | Expanded | `/inventory` route + `Inventory.tsx` + `ProductForm.tsx` + explainer strip + status pills + push toggle | User requirement 8: inventory section with extensive how-it-works UI |
| Mutations = `settings.update` (owner-only) | **Changed** | Membership-level (no permission key) for reads *and* writes | User requirement 8: "anybody can add"; nav is un-gated so owner-only would dead-end members |
| — | Added | Verified `checkPermission(undefined)→true` (`Sidebar.tsx:50-53`), `public.routes.ts` single-route baseline (`:15`), persisted-UI precedent | New v3 claims checked against source |
| File name `storefront-removal-plan.md` | Renamed | `marketplace-inventory-plan.md` | Storefront is what's removed; plan is about the marketplace (user request) |
