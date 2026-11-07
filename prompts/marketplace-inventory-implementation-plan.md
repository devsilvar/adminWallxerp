# Marketplace Inventory — Consolidated Implementation Plan (v2, Junior-Friendly)

> **Single source of truth.** Reconciles `specs/inventory-and-marketplace.md` (original idea) + `prompts/marketplace-inventory-plan.md` (v3) against the current codebase, re-reviewed per `prompts/rereviewplan.md`, with best-practice research folded in and every phase broken into junior-developer-followable steps.
>
> **Scope:** backend (`backend/`) + SME frontend (`frontend/`) + admin frontend (`adminFrontend/`) + public API consumed by `marketplaceFrontend/` (Astro, currently a skeleton). **No implementation performed** — plan only.

---

## 1. Executive Verdict

🟢 **PLAN APPROVED AFTER REVIEW** — implementation-ready, with research-backed corrections folded in.

The idea is sound, v3 is the right lineage, and the codebase already has every primitive needed. The work is broken into 10 sequential phases a junior can follow top-to-bottom. The main risk remains scope creep — the Jiji classifieds plan (`JIJI_IMPLEMENTATION_PLAN.md`) describes a *different product* and must not be mixed in.

---

## 2. What Was Wrong With The Old Plan

1. **Two competing plans.** `JIJI_IMPLEMENTATION_PLAN.md` (standalone Jiji classifieds) vs the spec (3 products per business, syndicated). Only the latter matches the stated flow. Jiji plan dropped.
2. **Flat schema vs heterogeneous products.** v3 needs category-driven fields; spec's `MarketplaceProduct` had no `attributes` column. → Added `attributes Json?` + GIN index (research).
3. **Non-existent email templates.** `marketplace.product_approved` / `marketplace.product_rejected` referenced but absent. → Must create 2 templates.
4. **`marketplaceFrontend/` is a skeleton** (no `src/`). Public API is the real seam; marketplace UI is a separate, later project.
5. **3-item cap not atomically guarded.** Naive `count()` races on concurrent POSTs. → Advisory lock + count inside tx (research).
6. **Bait-and-switch handling vague.** → Explicit core-field set + status reset + public-feed filter.
7. **No per-category validation strategy.** → Zod `discriminatedUnion` on a `category`/`type` discriminator (research).
8. **Cache headers too loose/ambiguous.** → Standardized `public, max-age=0, s-maxage=300, stale-while-revalidate=600` + optional `CDN-Cache-Control` (research).

---

## 3. What Changed (incl. research-driven)

| Previous | Decision | Improved | Reason |
|---|---|---|---|
| `JIJI_IMPLEMENTATION_PLAN.md` | Removed | Dropped | Different product |
| Flat schema | Changed | `attributes Json?` + GIN index | Heterogeneous types; queryable attributes |
| Naive `count()` cap | Changed | `pg_advisory_xact_lock` + count in tx | Concurrent-POST TOCTOU race |
| `z.union` / refinements | Changed | `z.discriminatedUnion` | Better errors + faster validation |
| Loose cache headers | Changed | `public, max-age=0, s-maxage=300, stale-while-revalidate=600` | CDN caches, browser doesn't; SWR for perceived perf |
| Assumed email templates exist | Added | Create 2 templates | None exist in repo |
| Storefront-removal scope | Removed | N/A | Nothing to remove |
| `marketplaceFrontend/` in scope | Changed | Out of scope (consumes API) | Astro skeleton; separate project |
| Multer disk storage (assumed) | Changed | `memoryStorage()` + stream to Cloudinary | No orphan files; matches logo-upload precedent |
| Moderation status implicit | Clarified | Separate `moderationStatus`? No — single `status` enum with explicit transitions + mandatory reason on reject | Simpler; matches existing enum style |

---

## 4. Verified File Impact

### CREATE
| File | Role |
|---|---|
| `backend/prisma/migrations/<ts>_add_marketplace_products/migration.sql` | DB migration |
| `backend/src/validators/marketplace.validator.ts` | Zod schemas (discriminated union) |
| `backend/src/services/marketplace/marketplace.service.ts` | Domain service |
| `backend/src/controllers/marketplace.controller.ts` | SME controller |
| `backend/src/controllers/marketplace-admin.controller.ts` | Admin controller |
| `backend/src/controllers/public-marketplace.controller.ts` | Public controller |
| `backend/src/routes/marketplace.routes.ts` | SME routes |
| `backend/src/routes/marketplace-admin.routes.ts` | Admin routes |
| `backend/src/lib/email/templates/marketplace-product-approved.ts` | Email template |
| `backend/src/lib/email/templates/marketplace-product-rejected.ts` | Email template |
| `frontend/src/pages/Inventory.tsx` | SME page |
| `frontend/src/components/marketplace/ProductModal.tsx` | SME component |
| `frontend/src/stores/marketplace.store.ts` | Zustand store |
| `adminFrontend/src/pages/admin/AdminMarketplace.tsx` | Admin page |
| `backend/tests/e2e/marketplace.e2e.test.ts` | E2E tests |

### MODIFY
| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add enums + `MarketplaceProduct` model + `Business` relation |
| `backend/src/routes/index.ts` | Mount marketplace + admin marketplace routes |
| `backend/src/routes/public.routes.ts` | Add 2 public endpoints |
| `backend/src/routes/admin.routes.ts` | Mount marketplace-admin routes |
| `frontend/src/App.tsx` | Add `/inventory` lazy route |
| `frontend/src/components/layout/Sidebar.tsx` | Add nav item (no permission gate) |
| `adminFrontend/src/App.tsx` | Add `/admin/marketplace` route |
| `adminFrontend/src/components/layout/AdminSidebar.tsx` | Add nav link |

### DELETE
None.

### DATABASE
New enums `ProductType`, `ProductListingStatus`; new model `MarketplaceProduct` (table `marketplace_products`); indexes `(businessId)`, `(status, createdAt desc)`, `(category)`, `(slug)`; GIN index on `attributes`; FK `businessId → Business.id` (Cascade), `approvedBy → User.id` (SetNull); relation on `Business`.

### CONFIGURATION
None (Cloudinary + Resend already configured; public route uses existing global rate limiter).

### TESTS
New E2E file (see Phase 10).

---

## 5. Improved Implementation Plan

### 1. OBJECTIVE
Ship a 3-product-max Marketplace Inventory feature: SMEs manage up to 3 products in an Inventory section of their dashboard; products go through an admin moderation gate; approved products are exposed via a cached public read API consumed by the separate marketplace domain. No checkout, orders, or payments in this repo.

### 2. REQUIREMENTS (confirmed)
1. Max 3 products per business across all statuses.
2. Heterogeneous product types via category-driven `attributes` JSON.
3. State machine: `draft → pending_approval → approved | rejected`; approved → `pending_approval` on core-field edit; merchant can archive.
4. Admin-only approve/reject/takedown, mandatory reason on reject, email dispatched.
5. Public read API: paginated, filterable by category/type/search, cached.
6. Ownership: any business member can read/mutate (no permission gate).
7. Physical vs service polymorphism.

### 3. CURRENT SYSTEM (verified)
- Backend: Express 5 + Prisma + PostgreSQL, layered Routes→Controllers→Services→Prisma. Ownership via `verifyBusinessAccess` (cached, membership-based). Zod validators. `AppError`. Email via Resend templates. Cloudinary via multer. Public routes at `/api/v1/public`. Global rate limiter (prod) covers public routes.
- SME frontend: React 19 + Vite, Zustand, React Router v7 lazy routes, Sidebar with permission-filtered nav, shared UI primitives.
- Admin frontend: standalone SPA.
- Marketplace frontend: Astro skeleton (port 5175).

### 4. IMPLEMENTATION APPROACH
Follow existing layered patterns. No new abstractions. Backend service owns logic + transactional cap guard; controllers thin; validators Zod. Frontend mirrors invoice store/page. Public endpoint in `public.routes.ts` with cache headers. Admin moderation follows existing admin pattern.

### 5. BEST PRACTICES INCORPORATED (research)
- **Prisma JSON attributes:** use `Json?` column + GIN index; query via `attributes: { path: [...], equals: ... }`. Use `enum` for fixed sets, reserve `Json` for variable attributes. [source](https://www.prisma.io/docs/orm/prisma-schema/data-model/unsupported-database-features)
- **Atomic cap:** `pg_advisory_xact_lock(hashtextextended(businessId, 0))` inside `prisma.$transaction`, then count; conditional insert. Transaction-scoped lock auto-releases. [source](https://www.postgresql.org/docs/current/functions-admin.html)
- **Zod:** `z.discriminatedUnion` on a discriminator field for category-specific validation; better errors + faster than `z.union`. [source](https://zod.dev)
- **Cache headers:** `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600` for public reads; `CDN-Cache-Control` to target CDN separately. [source](https://web.dev/stale-while-revalidate)
- **Multer:** `memoryStorage()` with `limits: { fileSize: 5*1024*1024, files: 3 }` + `fileFilter` MIME allowlist; validate content with `file-type`; stream buffer to Cloudinary via `upload_stream`. [source](https://github.com/expressjs/multer)
- **Moderation:** explicit state transitions, mandatory reason (≤500 chars) on reject/takedown, append-only audit log, oldest-first queue, optimistic UI with rollback. [source](https://martinfowler.com/bliki/StatePattern.html)

---

## 6. IMPLEMENTATION STEPS (junior-friendly, dependency-aware)

Each phase is independently verifiable. Do not start a phase until the previous one's verification passes.

### Phase 1 — Database schema & migration (½ day)
**Goal:** Add the `MarketplaceProduct` table + enums so the rest of the code compiles against real types.

- **Step 1.1** Open `backend/prisma/schema.prisma`. Add enums `ProductType` and `ProductListingStatus` (copy values from spec §3).
- **Step 1.2** Add `model MarketplaceProduct` with all fields from spec §3, including `attributes Json? @map("attributes")` and `@@index([attributes], type: Gin)` (Postgres GIN). Add `@@index([businessId])`, `@@index([status, createdAt(sort: Desc)])`, `@@index([category])`, `@@index([slug])`.
- **Step 1.3** Add `marketplaceProducts MarketplaceProduct[]` to the `Business` model relations block.
- **Step 1.4** Run `npm run prisma:migrate` (creates migration). Name it `add_marketplace_products`.
- **Step 1.5** Run `npm run prisma:generate`. Verify `npx tsc --noEmit` still passes.
- **Verify:** `npx prisma studio` shows the new table; `MarketplaceProduct` type exists in `@prisma/client`.
- **Best practice:** GIN index on `attributes` keeps attribute queries fast without normalizing to a separate table (research).

### Phase 2 — Zod validators (½ day)
**Goal:** Strict input validation with category-specific fields.

- **Step 2.1** Create `backend/src/validators/marketplace.validator.ts`.
- **Step 2.2** Define base schema: `name`, `category` (enum of 8 categories), `productType` (physical|service), `description`, `price`, `compareAtPrice?`, `currency` (default NGN), `contactPhone?`, `contactWhatsapp?`, `purchaseUrl?`, `images` (array of URLs, max 3).
- **Step 2.3** Add conditional: if `productType === 'physical'`, require `trackInventory` + `stockQuantity >= 0`; if `service`, `trackInventory=false`, `stockQuantity=null`.
- **Step 2.4** Define category→attribute schemas (clothes: size/color/material; books: author/binding/pages; chairs/tables: material/dimensions; etc.) and combine via `z.discriminatedUnion('category', [...])` over the base schema extended with `attributes`.
- **Step 2.5** Export `createProductSchema`, `updateProductSchema`, `submitProductSchema`, `listProductsQuerySchema`, `approveSchema`, `rejectSchema` (reason required, ≤500 chars).
- **Verify:** unit tests for each category pass/fail; `discriminatedUnion` produces specific errors.
- **Best practice:** discriminated union over `z.union` for better errors and O(1) dispatch (research).

### Phase 3 — Backend service (1–1.5 days)
**Goal:** All business logic, transactional, with cap guard and bait-and-switch reset.

- **Step 3.1** Create directory `backend/src/services/marketplace/` and `marketplace.service.ts`.
- **Step 3.2** Implement `createProduct(userId, businessId, data, images)`:
  - `verifyBusinessAccess(userId, businessId)` (membership, no permission).
  - Inside `prisma.$transaction`: `SELECT pg_advisory_xact_lock(hashtextextended(businessId::text, 0))`; count products where `businessId`; if ≥3 throw `AppError(400, 'Maximum of 3 products permitted per business', 'PRODUCT_LIMIT_REACHED')`; create row with `status: 'draft'`, slug `{slugify(name)}-{shortId}`.
  - Return created product.
- **Step 3.3** Implement `updateProduct(userId, businessId, productId, patch)`:
  - Verify ownership/access.
  - Load existing; if status is `approved` and any core field (`name, price, compareAtPrice, images, category, productType, description`) changed → set `status='pending_approval'`, clear `approvedAt`/`approvedBy`, `rejectionReason=null`.
  - Update inside tx.
- **Step 3.4** Implement `submitForApproval(userId, businessId, productId)` → status `pending_approval` (only from `draft` or `rejected`).
- **Step 3.5** Implement `archiveProduct(userId, businessId, productId)` → status `archived`.
- **Step 3.6** Implement `listForBusiness(userId, businessId)` → all products for that business (any status).
- **Step 3.7** Implement `getProduct(userId, businessId, productId)`.
- **Step 3.8** Implement admin: `listModerationQueue(status?)` (oldest-first), `approveProduct(adminId, productId)`, `rejectProduct(adminId, productId, reason)`, `takedownProduct(adminId, productId, reason)`. Approve sets `status='approved'`, `approvedAt`, `approvedBy`. Reject sets `status='rejected'`, `rejectionReason`. Takedown sets `status='archived'`.
- **Step 3.9** Implement `listPublicFeed({ page, limit, category?, type?, search? })`:
  - Filter `status='approved'`.
  - Search across `name`, `description`, `business.businessName`.
  - Paginate (default 24, max 50).
  - Include seller summary (`businessName, city, state, isVerified`).
  - Return `{ data, pagination }`.
- **Step 3.10** Implement `getPublicProduct(slug)` → single approved product + related products from same merchant.
- **Step 3.11** Email dispatch (post-transaction, fire-and-forget): on approve/reject, call `emailDispatchService.send(...)` with new templates. Never inside tx.
- **Verify:** service unit tests with mocked prisma; integration tests hit real DB.
- **Best practice:** transaction-scoped advisory lock; email outside tx (matches bcrypt rule in CLAUDE.md).

### Phase 4 — Controllers (½ day)
**Goal:** Thin controllers using `asyncHandler`.

- **Step 4.1** Create `marketplace.controller.ts` — SME endpoints: create, update, submit, archive, list, get. Extract `userId` from req, `businessId` from params, validate body with Zod, call service, return `{ success, data }`.
- **Step 4.2** Create `marketplace-admin.controller.ts` — queue list, approve, reject, takedown. Admin role enforced by `adminRoutes` middleware.
- **Step 4.3** Create `public-marketplace.controller.ts` — feed + detail. No auth. Set cache headers: `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600`.
- **Verify:** controllers contain no business logic; all logic in service.

### Phase 5 — Routes & wiring (½ day)
**Goal:** Mount everything.

- **Step 5.1** Create `marketplace.routes.ts`: `Router()` with `verifyBusinessAccess` middleware per route (or inside service — follow existing pattern: service calls `verifyBusinessAccess`). Routes: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `POST /:id/submit`, `POST /:id/archive`.
- **Step 5.2** Create `marketplace-admin.routes.ts`: `GET /`, `POST /:id/approve`, `POST /:id/reject`, `POST /:id/takedown`.
- **Step 5.3** In `routes/index.ts`: import + `v1.use('/businesses/:businessId/marketplace', marketplaceRoutes)` and `v1.use('/admin/marketplace', marketplaceAdminRoutes)`.
- **Step 5.4** In `routes/admin.routes.ts`: mount marketplace-admin routes (or rely on index — follow existing admin pattern).
- **Step 5.5** In `routes/public.routes.ts`: add `GET /marketplace/products` and `GET /marketplace/products/:slug` → public controller. Add rate limiter (reuse `verificationRateLimiter` or a new `publicApiRateLimiter` 100/min/IP).
- **Verify:** `curl` public endpoint returns 200 with cache headers; SME endpoints require auth; admin endpoints require admin role.

### Phase 6 — Email templates (½ day)
**Goal:** Approval/rejection emails.

- **Step 6.1** Create `marketplace-product-approved.ts` and `marketplace-product-rejected.ts` in `src/lib/email/templates/` following existing template structure (export a function returning `{ subject, html }`).
- **Step 6.2** Register them in the email dispatch service (check how existing templates are invoked — grep `email-dispatch.service.ts`).
- **Step 6.3** Wire dispatch in service post-transaction (Phase 3.11).
- **Verify:** with `RESEND_API_KEY` unset, emails log via Winston and API returns `meta.delivered=false`.

### Phase 7 — SME frontend: store + page + modal (1.5–2 days)
**Goal:** 3-slot Inventory UI.

- **Step 7.1** Create `frontend/src/stores/marketplace.store.ts` mirroring `invoice.store.ts`: `products[]`, `loading`, `error`, `activeProduct`, detail state; actions `fetchProducts`, `create`, `update`, `submit`, `archive`, `clearActive`; `patchInList` for status transitions.
- **Step 7.2** Create `frontend/src/pages/Inventory.tsx`:
  - 3 slot cards: empty slot shows "+ Add Product (N of 3 available)"; draft/pending shows status pill; approved shows "Live on Marketplace" badge + "View on Marketplace" link + stock count.
  - "How it works" explainer section (onboarding).
  - Empty state when 0 products.
- **Step 7.3** Create `frontend/src/components/marketplace/ProductModal.tsx`:
  - Multi-step form: classification → pricing/inventory → media → contact.
  - Category dropdown drives `attributes` fields (render category-specific inputs).
  - Physical/service toggle controls stock fields.
  - Image upload: client-side compress, max 3, 5MB each, preview thumbnails.
  - Save as Draft OR Save & Submit.
  - Client-side totals/validation mirroring backend (instant feedback).
- **Step 7.4** Add `/inventory` lazy route in `App.tsx` behind `Suspense` + `PageLoader`.
- **Step 7.5** Add Sidebar nav item: `{ to: '/inventory', label: 'Inventory & Marketplace', icon: Package }` with no `permission` (visible to all members, per `Sidebar.tsx:50-53`).
- **Verify:** `npm run build` passes; manual smoke test create→submit→see pending pill.

### Phase 8 — Admin frontend moderation (1–1.5 days)
**Goal:** Moderation console.

- **Step 8.1** Create `adminFrontend/src/pages/admin/AdminMarketplace.tsx`:
  - Tabs: Pending (count) / Live / Rejected.
  - Queue: oldest-first, status pill, merchant profile card, image carousel, pricing sanity flag (zero/extreme).
  - Actions: Approve (one-click), Reject (dialog with reason ≤500 chars, required), Takedown.
  - Optimistic update with rollback on error + refetch on settled.
- **Step 8.2** Add `/admin/marketplace` route + AdminSidebar link.
- **Verify:** approve/reject flows work end-to-end; email dispatch logged.

### Phase 9 — Cloudinary upload wiring (½ day, can fold into Phase 7)
**Goal:** Image upload pipeline.

- **Step 9.1** Backend: add multer middleware to marketplace create/update routes using `memoryStorage()`, `limits: { fileSize: 5*1024*1024, files: 3 }`, `fileFilter` MIME allowlist (`image/jpeg`, `image/png`, `image/webp`).
- **Step 9.2** Validate actual content with `file-type` package (not just mimetype header).
- **Step 9.3** Stream each buffer to Cloudinary via `upload_stream`; store returned `secure_url` + `public_id` (for deletion on replace/archive).
- **Step 9.4** Frontend: compress images client-side before upload (use `browser-image-compression` or canvas); show progress.
- **Verify:** upload 3 images, replace one, archive product (images cleaned up best-effort).
- **Best practice:** memoryStorage avoids orphan files; content validation prevents spoofing (research).

### Phase 10 — E2E tests (1 day)
**Goal:** Prove it works.

- **Step 10.1** Create `backend/tests/e2e/marketplace.e2e.test.ts`.
- **Step 10.2** Tests:
  1. Create 3 products → 4th returns 400 `PRODUCT_LIMIT_REACHED`.
  2. Concurrent POST race → only 3 created, 4th rejected.
  3. Draft → submit → pending; admin approve → approved.
  4. Admin reject with reason → rejected; resubmit → pending.
  5. Approved core-field edit → resets to pending; disappears from public feed.
  6. Non-core edit (stock) on approved → stays approved.
  7. Archive → archived; frees slot.
  8. Public feed: filters (category, type, search), pagination, cache headers present, only approved returned.
  9. Admin takedown → archived.
  10. Ownership: non-member gets 403; admin JWT on SME route gets 403 `ADMIN_CANNOT_USE_USER_APP`.
- **Step 10.3** Run `npm run test:e2e`; all green.
- **Verify:** CI-equivalent local run passes.

---

## 7. EDGE CASES
- Concurrent 3rd POST → advisory lock serializes; second gets `PRODUCT_LIMIT_REACHED`.
- Approved core-field edit → resets to pending; removed from public feed until re-approved. Non-core edits (stock, contact phone) do NOT trigger reset.
- Rejected resubmission → updates same row, no duplicate.
- Archive → frees a slot.
- Zero-stock physical → public feed includes it; marketplace UI disables buy (out of scope here, documented).
- Service product → `trackInventory=false`, `stockQuantity=null`.
- Slug collision → uuid suffix; DB unique constraint is backstop.
- Missing Cloudinary config in dev → base64 data URI fallback (per logo upload precedent).
- Image upload failure mid-request → transaction rollback; no partial product.

---

## 8. TESTING STRATEGY
- E2E (Jest, live DB): 10 scenarios above.
- Unit: validator schemas (category→attribute), slug generation, bait-and-switch field detection.
- Frontend (Vitest, optional polish): slot rendering, modal validation, store patching.

---

## 9. ACCEPTANCE CRITERIA
- SME can create/edit/delete up to 3 products; 4th returns 400 `PRODUCT_LIMIT_REACHED`.
- Submitting flips to `pending_approval` and locks casual edits.
- Admin can approve/reject (with reason ≤500 chars) and takedown; emails dispatched (logged in dev).
- Approved products appear in `GET /api/v1/public/marketplace/products` with correct filters/pagination/cache headers; rejected/draft/archived do not.
- Editing a core field on an approved product resets it to `pending_approval` and removes it from the public feed.
- All mutations transactional with audit rows; ownership enforced; no admin JWT on SME routes.
- `npm run build` (backend + frontend + adminFrontend) passes; E2E suite green.

---

## 10. REMAINING QUESTIONS
1. Should `attributes` be free-form `Json` (recommended) or a normalized `ProductAttribute` table? Recommendation: `Json` column (simpler; normalized only if filtering by attribute — not in scope).
2. Marketplace domain: subdomain of wallx or fully separate? Affects CORS allow-list in public route. (Infra decision.)
3. Is the 3-product cap a hard global limit or plan-tiered (free=3, paid=more)? Spec says freemium upsell later; v1 hard-caps at 3. Confirm before shipping paid tiers.

---

## 11. FINAL READINESS SCORE

**9.5/10 — Implementation-ready.** All phases are junior-followable, best practices are cited, file impact is verified against the real codebase. Remaining 0.5 is the 3 open product/infra questions (non-blocking for Phases 1–9).

---

## 12. SOURCES (research)

- Prisma JSON attributes & GIN indexing: [Prisma docs — unsupported DB features / JSON](https://www.prisma.io/docs/orm/prisma-schema/data-model/unsupported-database-features)
- PostgreSQL advisory locks: [PostgreSQL docs — Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
- Zod discriminated unions: [Zod docs](https://zod.dev)
- Cache headers (stale-while-revalidate): [web.dev — Stale-While-Revalidate](https://web.dev/stale-while-revalidate)
- Multer memoryStorage + validation: [multer GitHub](https://github.com/expressjs/multer)
- State machine / moderation patterns: [Martin Fowler — State Pattern](https://martinfowler.com/bliki/StatePattern.html)
- Existing codebase patterns: `backend/prisma/schema.prisma`, `backend/src/lib/ownership.ts`, `backend/src/routes/index.ts`, `backend/src/routes/public.routes.ts`, `frontend/src/components/layout/Sidebar.tsx`, `prompts/CLAUDE.md`
