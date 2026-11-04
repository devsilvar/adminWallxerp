# Marketplace Growth — Phased Execution

**For:** one junior engineer, working solo
**Source of truth:** `MARKETPLACE_GROWTH_MONETIZATION_PLAN.md`. It explains *why*. This file says *what order*, *exactly which files*, and *how to prove it worked*.
**Rule:** one phase = one PR. Finish, verify, merge, then start the next.
**Verified against source on 2026-11-03.** Every file path and line number below was read, not remembered. If the line has moved, trust the file, not this document.

---

## Read this before Phase 1

### 0.1 Repo layout — where commits go

| Path | Repo | Commit goes to |
|---|---|---|
| `backend/` | main repo | main repo |
| `marketplaceFrontend/` | main repo | main repo |
| `adminFrontend/` | main repo | main repo |
| `frontend/` | **separate git repository** | its own repo, then bump the pointer in the main repo |

`git ls-files -s frontend` returns mode `160000` — the main repo stores `frontend/` as a gitlink. The embedded
repo has its own `.git` directory and its own remotes:

```
origin  git@github.com:WALLX-AFRICA/PayMyTaxBy-WALLX---FRONTEND.git
public  git@github.com:devsilvar/WallxTax.git
```

**Two things are wrong with how it is wired, and you must work around both — do not "fix" them in a feature PR:**

1. **There is no `.gitmodules`.** `git submodule status` exits 128. A fresh clone of the main repo gets an empty
   `frontend/` directory with no URL to fetch, and `git submodule update --init` cannot help. If you need the
   code on a new machine, clone `PayMyTaxBy-WALLX---FRONTEND` separately into `frontend/`.
2. **The pointer drifts.** Resolve it, don't assume it is current:
   ```bash
   git ls-files -s frontend                 # what the main repo records
   git -C frontend rev-parse HEAD           # what is actually checked out
   ```

**Procedure for any phase that touches `frontend/` (Phases 2 and 12):**
```bash
cd frontend
git status                    # confirm you are only touching your files
git add <your files>          # never `git add -A` — other work is in this tree
git commit -m "..."
git push origin main
cd ..
git add frontend              # records the new pointer, nothing else
git commit -m "chore: bump frontend pointer to <sha>"
```
Two commits in two repos, and they roll back separately. Never copy files between repos by hand, and never commit
inside `frontend/` from the main repo's tooling.

### 0.2 What is true in the code today (verified)

| Fact | Evidence |
|---|---|
| Marketplace is a static Astro build, no adapter | `marketplaceFrontend/astro.config.mjs` — `output: 'static'`, no `adapter` |
| Only three pages exist | `src/pages/`: `index.astro`, `products.astro`, `p/[slug].astro` |
| Astro is 4.16.19 and **does** support `output: 'hybrid'` | `marketplaceFrontend/node_modules/astro/package.json`; schema union `static \| server \| hybrid` |
| Detail pages are enumerated at build; a `sample-product` fallback exists | `p/[slug].astro:10` (`getStaticPaths`), sample block `:14-40` |
| `products.astro` reads the query string at build time | `products.astro:8`, fetch at `:17` |
| State filter and sort are applied client-side to one page | `products.astro:22-29`, `:32-36` |
| The count above the grid is the unfiltered total | `products.astro:74` |
| UI sort values are `newest \| price-asc \| price-desc` (hyphen, not underscore) | `products.astro:274-276` |
| Feed accepts only `page/limit/category/type/productType/search` | `marketplace.service.ts:769-787` |
| Validator accepts `limit` up to 100; service clamps to 50 | `marketplace.validator.ts:316`; `marketplace.service.ts:779` |
| `contactPhone` / `contactWhatsapp` ship in the **list** payload | `marketplace.service.ts:841-842` |
| Cap of 3 is enforced inside a transaction under an advisory lock | `marketplace.service.ts:97` (lock), `:108` (`activeCount >= 3`) |
| Cap counts **everything except archived — including rejected** | `marketplace.service.ts:100-105` (`status: { not: 'archived' }`) |
| `getProducts()` swallows network errors and returns an empty list | `src/lib/api.ts:105-121` |
| 5 hardcoded `http://localhost:5173` links (+ Footer's env fallback) | `Header.tsx:96,154`; `index.astro:263,388,397`; `Footer.tsx:3` |
| Public feed is mounted **twice** | `routes/public.routes.ts:42-54` and `routes/index.ts:65-74` |
| Wallet is per **user**, not per business | `schema.prisma:851-858` — `WalletBalance.userId @unique` |
| No generic wallet spend exists; `settlePayoutDebit` is the closest pattern | `services/wallet/wallet.service.ts:464-517` |
| `WalletTransaction.source` is a plain `String`; `idempotencyKey` is `@unique` | `schema.prisma:867-890` |
| `ProductListingStatus` already has `archived` | `schema.prisma:642-648` |
| No `MarketplaceListingEvent`, no counters, no boost, no slot, no `soldAt` | grep across repo → 0 hits |
| Admin moderation lives at `/admin/marketplace` | `routes/marketplace-admin.routes.ts`; `adminFrontend/src/pages/admin/AdminMarketplace.tsx` |
| Advisory lock keys 947362–947365 are taken (947364 is used **twice**, an existing bug — leave it) | `src/jobs/*.cron.ts` |
| `frontend/` has no `typecheck` script; `marketplaceFrontend/` has no test script | `package.json` files |

### 0.3 The eleven ways this breaks production

In order of likelihood. Every guard below exists for one of these.

1. **Serving an empty catalogue with a 200.** `getProducts()` catches every fetch error and returns `{data: [], success: false}` (`api.ts:105-121`). Once the site is server-rendered, a wrong `PUBLIC_API_URL` produces "No matching products found" instead of an error, and you will debug the wrong layer. Fix this in Phase 1, before trusting any page.
2. **Forgetting the adapter.** Setting `prerender = false` without `@astrojs/vercel`/`@astrojs/node` fails the build. Setting `output: 'server'` instead of `'hybrid'` pushes the homepage and every asset through a function for nothing.
3. **Leaving `getStaticPaths` behind.** If you add SSR but don't delete `getStaticPaths` (`[slug].astro:10-54`), Astro still prerenders the old pages and new listings still 404. The `sample-product` fallback (`:14-40`) must go too, or every deploy ships a fake listing.
4. **Removing contact fields from the feed while a card still reads them.** The detail page reads `getPublicProduct` (safe) and the card deliberately has no contact UI (`ProductCard.tsx:47`). Verify before deleting, because a stripped field renders `undefined` silently.
5. **Racing the slot cap.** `createProduct` counts inside `pg_advisory_xact_lock(hashtextextended(businessId, 0))` (`marketplace.service.ts:97`). A slot purchase that reads/updates `marketplaceSlotAllowance` **outside that lock** can let two creates through. Purchase must take the same business-scoped lock.
6. **Changing what counts against the cap without noticing.** Today `rejected` consumes a slot (`status: { not: 'archived' }`). Making rejected free capacity is a **behaviour change that gives merchants a slot back** — correct per the plan, but it must be deliberate and audited.
7. **Debiting the wrong wallet.** `WalletBalance` is keyed on `userId` and is shared by all of that user's businesses. Slot capacity is per business; cash is per user. Debit `business.userId` and stamp `businessId` on the transaction.
8. **Reading a cached page for paid impressions.** The public feed sends `s-maxage=300` (`public-marketplace.controller.ts:11-12`). Server-side impression or view counting on a cached GET **under-counts silently**. Counters must be written by a client beacon.
9. **Enum drift.** This work adds several enums. The local database was not built from migrations, so `prisma migrate dev` cannot see drift and the failure appears only in production. Always `migrate dev --create-only`, read the SQL, then apply.
10. **Injecting boosts into a paginated list without adjusting offsets.** Naive insertion makes page 2 repeat listings the buyer already saw. The offset math in Phase 14 is not optional.
11. **Putting a wallet debit inside a request that can be retried.** Money paths need a unique `reference` and `idempotencyKey` on every write. `WalletTransaction` has both as unique columns — use them.

### 0.4 Non-negotiables

- **Never trust a client-supplied price, count, or type.** Server decides price and which event type increments which counter.
- **Never use floating point for money.** `Prisma.Decimal` end to end; `toNumber()` only for display.
- **Never let boost bypass moderation.** Boost only amplifies an already-`approved` listing.
- **Never infer one entitlement from another.** `marketplaceSlotAllowance` is "how many"; `MarketplaceBoost` is "where one ranks".
- **Never put `contactPhone`/`contactWhatsapp` back in the list payload.**
- **Never delete or skip a failing test.** If a test encodes old behaviour, change it in the same PR as the behaviour.
- **Don't "fix it properly while I'm in here."** Note it, finish the phase.
- Test commands: backend = `npm run test:unit` (Jest), merchant frontend = `npm test` (Vitest), admin = `npm test` (Vitest), marketplace frontend = `npm run typecheck && npm run build` (**no test suite exists** — do not invent one in a feature PR).

### 0.5 Decisions you cannot make

Stop and ask; do not guess. Each blocks a phase.

- **D1 — Where does the SSR marketplace run?** Vercel (`@astrojs/vercel`) or Railway with `@astrojs/node`? Blocks Phase 1.
- **D2 — Slot price and shape.** The ₦ number per slot, and whether 1 / 5 / 10 bundles exist at launch. Blocks Phase 10's price table (the code can ship with a config value; the value is yours to set).
- **D3 — Seed period.** Grant +3 free slots for 90 days, or charge from day one? Blocks Phase 9's default allowance.
- **D4 — Storefront identifier.** `Business` has **no `slug`** — only `merchantId` (`schema.prisma:88+`, field at `:129`). Either use `/s/{merchantId}` (zero schema change) or add a unique `slug`. Blocks Phase 7.
- **D5 — Boost pricing + release shape.** ₦ per 7/14/30 days, and whether boost ships in the same release as slots behind a flag. Blocks Phase 13.
- **D6 — Listing expiry.** 90 days (recommended) or never? Blocks Phase 8's backfill.

---

## The phases

| # | Plan ref | Work item | Outcome | Blocked by | Size |
|---|---|---|---|---|---|
| 0 | — | Baseline | Green build, WIP committed, host chosen | **D1** | 0.5 day |
| 1 | 0.1 | SSR / hybrid | Query strings work; new listings get pages | D1 | 1–2 days |
| 2 | 0.4 | Links + attribution | No `localhost`; signups attributable | — | 0.5 day |
| 3 | 0.2 | Tracking schema | Counters, events, `expiresAt`, `soldAt` | — | 1 day |
| 4 | 0.3 | Events endpoint | Views and contacts recorded; payload trimmed | 3 | 1 day |
| 5 | 1.1 | Server-side filter/sort/facets | Correct filtering, sorting, totals, live counts | 1 | 2 days |
| 6 | 1.2 | Empty states | A zero-result page always offers a way out | 5 | 0.5 day |
| 7 | 1.3–1.4 | Contact on card + storefront | WhatsApp from the card; seller storefront page | 2, 4, **D4** | 1.5 days |
| 8 | 1.6 | Lifecycle | Expiry job, mark-as-sold, listing score | 3, 7, **D6** | 1.5 days |
| 9 | 2.1–2.2 | Slot entitlement | Allowance column + purchase model + cap reads it | **D3** | 1 day |
| 10 | 2.3 | Slot purchase — wallet | Atomic debit + allowance raise | 9, **D2** | 1.5 days |
| 11 | 2.3, 2.7 | Slot purchase — proof + admin | Queue, approve/reject, refunds | 10 | 1 day |
| 12 | 2.6 | Merchant slot UI | Locked 4th slot, per-listing stats | 4, 10 | 1 day |
| 13 | 2.4 | Boost purchase | Separate SKU on its own rails | 4, 10, **D5** | 1.5 days |
| 14 | 2.4 | Boost ranking | Page-one interleave, cap, label, impressions | 13 | 2 days |
| 15 | 0.3, §7 | Merchant analytics | Per-product funnel for the merchant | 4, 14 | 1 day |
| 16 | Phase 3 | Ads + SEO | House-first ad slots, sitemap, JSON-LD, OG | 1, 5 | 4–5 days |
| 17 | Phase 4 | Retention | Saved searches, digest, recently viewed | 5, 15 | 3–4 days |

**Phases 0–7 are the whole user-visible conversion fix.** Phase 8 onwards creates or measures money. Phase 16 is gated on the traffic thresholds in §9 of the plan — if the gate is not met, ship only the house-ad fallback and the sitemap.

---

## Phase 0 — Baseline

**Do:**
1. `git status`. The marketplace backend is currently **untracked** (`backend/src/services/marketplace/`, the three marketplace controllers, two route files, `marketplace.validator.ts`, `migrations/20261029160000_add_marketplace_products/`). Commit it as a single commit before touching anything, or every later migration sits on an uncommitted schema.
2. Answer **D1**. Write the answer at the top of the PR description for Phase 1.
3. Record a green baseline:
   ```bash
   cd backend && npm run typecheck && npm run test:unit
   cd ../marketplaceFrontend && npm run typecheck && npm run build
   ```
4. Confirm `marketplaceFrontend/.env` has a real `PUBLIC_API_URL`.
5. Record the `frontend/` baseline separately — it is its own repo (§0.1):
   ```bash
   git -C frontend status -sb        # note which files are already modified
   git -C frontend rev-parse HEAD    # compare with `git ls-files -s frontend`
   git -C frontend log --oneline -3
   ```
   You are not committing anything there in Phase 0. You are recording what was already dirty so that, when
   Phases 2 and 12 touch it, you can tell your changes from someone else's. Never `git add -A` in that tree.

**Check:** both commands exit 0. Note the test counts in the PR body.

**Rollback:** revert the commit.

**If it is already red:** report it. Do not fix it here.

---

## Phase 1 — SSR / hybrid

> **Blocked on D1.** This phase is the reason nothing else works. Ship it alone.

**Files:** `marketplaceFrontend/package.json`, `astro.config.mjs`, `src/pages/products.astro`, `src/pages/p/[slug].astro`, `src/pages/404.astro` (new), `src/lib/api.ts`

**Do:**
1. Install the adapter for D1:
   - Vercel: `npm i @astrojs/vercel`
   - Railway: `npm i @astrojs/node`
2. `astro.config.mjs`: `output: 'hybrid'`, add the adapter. **Do not** pass `imageService: true` — product images are absolute Cloudinary URLs, Astro never serves them.
3. `products.astro`: add `export const prerender = false;` to the frontmatter. Leave lines 8–36 as they are for now — they already read the real URL; the filter semantics are Phase 5.
4. `p/[slug].astro`:
   - Delete `getStaticPaths` **and** the `sample-product` fallback block (`:10-54`).
   - Read `Astro.params.slug`, call `getProductBySlug(slug)` at request time.
   - `null` ⇒ set `Astro.response.status = 404` and render the not-found block. Do **not** `Astro.redirect('/404')` — render it, or crawlers get a 302 and the URL stays indexable.
   - Add `export const prerender = false;`
5. Create `src/pages/404.astro` if it does not exist (it does not).
6. Cache headers per route, in the frontmatter:
   ```ts
   Astro.response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');   // /products
   Astro.response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600'); // /p/[slug]
   ```
7. `api.ts`: stop swallowing errors. `getProducts` and `getProductBySlug` must log and **rethrow**; each page catches and renders a "temporarily unavailable" state with `Astro.response.status = 503`. Keep the existing fallback shape only for the build-time story, not for SSR.

**Edge cases:**
- `Astro.request.url` is only real on non-prerendered routes — that is now `products.astro`, so it works.
- The detail page must not fetch related products separately; `getPublicProduct` already returns `relatedProducts` (`marketplace.service.ts:864+`).
- A listing approved 30 seconds ago must render — that is the whole point. Test it by approving via the admin portal, then hitting the URL with no rebuild.
- `PUBLIC_API_URL` is baked at **build** time. A Vercel function reading it at runtime without a rebuild will use the old value.
- If the backend is unreachable, the page must be 503, not an empty 200. This is the test for step 7.

**Check:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/products?category=fashion"
curl -s "http://localhost:4321/p/<a-real-slug>" | grep -q "<their listing title>"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/p/does-not-exist"   # expect 404
```

**Rollback:** revert config + pages. The static build still works.

**Watch after deploy:** the 503 rate. A spike means the API URL or a firewall rule is wrong.

---

## Phase 2 — Links and attribution

**Files:** `marketplaceFrontend/src/components/Header.tsx:96,154`, `src/pages/index.astro:263,388,397`, `marketplaceFrontend/.env.example`, `backend/prisma/schema.prisma`, `backend/src/validators/auth.validator.ts:3`, `backend/src/services/auth/auth.service.ts:169`, `frontend/src/pages/Register.tsx` (**submodule**)

**Do:**
1. In each component, read `import.meta.env.PUBLIC_APP_URL`. Replace the five hardcoded URLs. `Footer.tsx:3` already has the pattern — copy it.
2. Append `?src=marketplace&listing={slug}` to every merchant CTA (all five point at `/inventory` or `/register`; where there is no slug, use `src=marketplace` only).
3. Add `acquisitionSource String? @map("acquisition_source")` to `User`.
4. Extend `registerSchema` with `acquisitionSource: z.enum(['marketplace']).optional()`. **Whitelist it** — do not accept free text, or you will collect junk.
5. Persist it in `register()`.
6. `Register.tsx` (submodule): read `src` from the query string and send it.

**Edge cases:**
- Env missing ⇒ dev fallback is fine, production must fail loudly. Add a build-time assert in `astro.config.mjs` that throws when `PUBLIC_APP_URL` is absent and `command === 'build'`. A silent fallback to `localhost` in production is defect C10 all over again.
- `Register.tsx` lives in the separate `frontend/` repo: its own commit, its own push, then bump the pointer in
  the main repo (§0.1). The backend half of this phase is a normal main-repo commit.
- `listing` is attribution metadata only; do not try to create anything from it.

**Check:**
```bash
grep -rn "localhost:5173" marketplaceFrontend/src   # must print nothing
```
Register through `?src=marketplace` and confirm `User.acquisition_source = 'marketplace'`; register without it and confirm `NULL`.

**Rollback:** per repo.

---

## Phase 3 — Tracking schema (one migration)

**Files:** `backend/prisma/schema.prisma`, one new migration, `backend/src/scripts/backfill-marketplace-expiry.ts` (new)

**Do:**
1. Add to `MarketplaceProduct`:
   ```prisma
   viewCount       Int       @default(0) @map("view_count")
   contactCount    Int       @default(0) @map("contact_count")
   lastContactedAt DateTime? @map("last_contacted_at")
   expiresAt       DateTime? @map("expires_at")
   soldAt          DateTime? @map("sold_at")
   ```
   All nullable or defaulted — safe on existing rows.
2. Add the event model and enum (as in plan §0.2), plus one extra value the plan omits:
   ```prisma
   enum MarketplaceEventType { view whatsapp_click call_click share_click storefront_view boost_impression }
   ```
   `boost_impression` is required by Phase 14; adding it later means a second enum migration.
3. Add a **unique** constraint that makes view dedupe real, not aspirational:
   ```prisma
   sessionHash String? @map("session_hash")
   @@unique([productId, eventType, sessionHash])
   ```
   `sessionHash` embeds the day (Phase 4), so same-session-same-day repeats collide and different days do not.
   **Click events must store `sessionHash = NULL`** — Postgres treats NULLs as distinct, so clicks are never
   deduped. Only `view` and `boost_impression` carry a hash, because only those are being de-duplicated.
4. Generate the migration **create-only**, read it, then apply:
   ```bash
   cd backend
   npx prisma migrate dev --create-only --name add_marketplace_tracking
   # read prisma/migrations/<ts>_add_marketplace_tracking/migration.sql
   npx prisma migrate dev
   npx prisma generate
   ```
   The SQL must contain only `ALTER TABLE ... ADD COLUMN`, `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`. If it contains a `DROP`, stop and ask.
5. Backfill script for D6 (default 90 days):
   ```ts
   // backend/src/scripts/backfill-marketplace-expiry.ts — dry run by default, --apply to write
   // expiresAt = approvedAt + 90 days for status = 'approved' AND expiresAt IS NULL
   ```

**Edge cases:**
- `expiresAt` stays `NULL` for drafts and rejected rows — the Phase 8 job must skip nulls, not treat them as "expired".
- Enum creation on an existing table is the migration-drift trap in this repo. Verify with `SELECT enum_range(NULL::MarketplaceEventType);` after applying.
- Do not add `NOT NULL` to anything without a default.

**Check:** `npm run typecheck`; `prisma migrate status` says up to date; backfill dry run prints a count you recognise.

**Rollback:** `prisma migrate resolve` is not a rollback. Roll forward with a new migration; do not hand-edit prod.

---

## Phase 4 — Event endpoint, counters, trimmed payload

**Files:** `backend/src/validators/marketplace.validator.ts`, `backend/src/controllers/public-marketplace.controller.ts`, `backend/src/routes/index.ts:65-74`, `backend/src/routes/public.routes.ts:42-54`, `backend/src/services/marketplace/marketplace.service.ts:769-862`

**Do:**
1. `POST /api/v1/marketplace/products/:productId/events` — body `{ type }` only. Server maps `type` → counter. Never accept a count.
2. Reuse `publicMarketplaceRateLimiter` (`middleware/security.ts:305`, 100/min per IP in prod). The body is one enum, so cap the body size explicitly when you mount the route — `express.json({ limit: '1kb' })` — rather than inheriting the app-wide 10MB parser.
3. Mount on **both** paths (`routes/index.ts` and `routes/public.routes.ts`). The feed is mounted twice; adding the endpoint once gives 404s on the other path.
4. `sessionHash = HMAC-SHA256(secret, `${ip}|${userAgent}|${YYYY-MM-DD}`)`, hex, truncated to 32 chars. Secret is a server env var — never a public one. No raw IP or UA in the table (NDPR). **Store it only for `view` and `boost_impression`; store `NULL` for `whatsapp_click`, `call_click`, `share_click` and `storefront_view`** so click counts are never deduped by the unique constraint.
5. Write path per type:
   - `view`: insert event (unique constraint dedupes same session/day) **and** increment `viewCount` only if the insert succeeded. Use `createMany({ skipDuplicates: true })` and check `count`; a `P2002` catch is acceptable but must not error the request.
   - `whatsapp_click` / `call_click` / `share_click`: insert + `contactCount++` + `lastContactedAt = now` for the two contact types; `share_click` increments no counter.
   - `storefront_view`: event only.
6. Response is `204` always — a broken analytics write must never break the buyer's page. Log failures with `logger.warn`.
7. Delete `contactPhone` and `contactWhatsapp` from the feed mapper (`marketplace.service.ts:841-842`). Keep them in `getPublicProduct`.

**Edge cases:**
- A bot without a UA still gets a hash; that is fine, it self-dedupes.
- `productId` that does not exist or is not `approved` ⇒ `404`. Do not create events for drafts.
- Counting must be **idempotent per session/day** for views and **allowed to repeat** for contact clicks (a buyer may legitimately tap twice; the counter is a signal, not billing).
- Do not increment inside the same transaction as the event insert if the insert can be skipped — the counter and the row must agree.

**Check:** two `view` beacons from the same session and day ⇒ 1 row, `viewCount = 1`. Repeat with a different day ⇒ 2 rows. `whatsapp_click` twice ⇒ `contactCount = 2`.

**Rollback:** remove the route and restore the two mapper lines. Counters are additive and harmless.

---

## Phase 5 — Server-side filtering, sorting, facets

> **The largest phase.** Split it into two PRs if needed: 5a = filter/sort/total, 5b = facets.

**Files:** `backend/src/validators/marketplace.validator.ts:314-334`, `backend/src/services/marketplace/marketplace.service.ts:769-862`, `marketplaceFrontend/src/lib/api.ts:88-94`, `marketplaceFrontend/src/pages/products.astro`

**Do:**
1. Validator additions — use the **hyphen** form the UI already sends:
   ```ts
   sort: z.enum(['newest', 'price_asc', 'price_desc', 'relevance']).default('newest'),
   state: asStringOptional,
   minPrice: asNumber({ min: 0 }).optional(),
   maxPrice: asNumber({ min: 0 }).optional(),
   verifiedOnly: asBooleanOptional,
   hasDiscount: asBooleanOptional,
   inStockOnly: asBooleanOptional,
   ```
   `asNumber` and `asStringOptional` come from `./query.utils` (already imported at `marketplace.validator.ts:2`).
   `asBooleanOptional` is **not** exported — it is a local const in `admin.validator.ts:9`. Move it into
   `query.utils` (and update the admin import) rather than duplicating the preprocess in two files.
   Accept both spellings (`price-asc` and `price_asc`) in a `z.preprocess` normaliser so old links do not break; emit only one.
2. Service `where` clauses:
   - `state`: `business.state` OR `business.city`, case-insensitive contains. **Add an alias map**: the UI sends `Abuja`, the data often says `FCT – Abuja`; the UI sends `Lagos`, the data says `Lagos State`. Match on the normalised prefix both ways.
   - `verifiedOnly`: `business.user.isVerified = true`.
   - `inStockOnly`: `OR: [{ trackInventory: false }, { stockQuantity: null }, { stockQuantity: { gt: 0 } }]`.
   - `minPrice` / `maxPrice`: on `price` (Decimal — pass numbers, Prisma converts).
3. `hasDiscount` — Prisma cannot compare two columns. Pick one, in this order:
   - **A (recommended):** add a generated column in a small migration and query it like any boolean:
     ```sql
     ALTER TABLE marketplace_products
       ADD COLUMN discount_active boolean
       GENERATED ALWAYS AS (compare_at_price IS NOT NULL AND compare_at_price > price) STORED;
     ```
     Then `where.discountActive = true`. Prisma reads it as a normal read-only field.
   - **B:** raw SQL with `Prisma.sql` for the id list + total, then hydrate. Only if A is rejected — it is more code and more places to leak an injection.
4. `sort`: `newest` ⇒ `createdAt desc`; `price_asc|price_desc` ⇒ `price asc|desc` (tie-break `createdAt desc` so pagination is stable); `relevance` ⇒ `ORDER BY (name ILIKE $term) DESC, (name ILIKE $term || '%') DESC, created_at DESC`, with the term parameterised.
5. Keep the `limit` clamp at 50 (`marketplace.service.ts:779`). Do not raise it to match the validator's 100 — that clamp exists for a reason and there is no index for deep pages.
6. Facets — computed over the **category + type + search** base only, deliberately ignoring state/price/verified/discount so a filtered-to-zero page can still suggest alternatives:
   - categories: `prisma.marketplaceProduct.groupBy({ by: ['category'], where, _count: true })`.
   - states: Prisma cannot group by a relation field. Use parameterless raw SQL:
     ```sql
     SELECT b.state AS name, COUNT(*)::int AS count
     FROM marketplace_products p JOIN businesses b ON b.id = p.business_id
     WHERE p.status = 'approved'
     GROUP BY b.state ORDER BY count DESC LIMIT 10;
     ```
     If you filter by category, add it as a **parameter** (`Prisma.sql`), never string interpolation.
   - priceBands: one raw query with a `CASE` over the six bands from the plan, capped at 6.
   - `verifiedCount` / `discountCount`: two `count` calls inside the same `Promise.all`.
7. Return `facets` next to `pagination`. Update the frontend `GetProductsParams` (`api.ts:88-94`) and the page's fetch call (`products.astro:17`) to send every filter and drop the client-side filter/sort block (`:22-36`).
8. Replace the header count with `pagination.total` (already correct once the API filters).

**Edge cases:**
- Page 2 must not repeat page 1. Every ordering needs a deterministic tie-break.
- `minPrice > maxPrice` ⇒ `400`, not an empty page.
- `state=Lagos` with city-only data (`business.state = NULL`) must still match on `city`.
- Facet counts must equal what clicking them returns. Test one: `facets.states[0].count` === `?state=<that state>` pagination total.
- Empty catalogue ⇒ facets return empty arrays, not `null`.

**Check:**
```bash
curl -s "localhost:3000/api/v1/marketplace/products?category=fashion&state=Lagos&sort=price-asc&limit=16" | jq '.pagination, .facets, [.data[].price]'
```
Prices ascending, `total` matching the filter, and page 2 continuing without overlap.

**Rollback:** revert the validator + service hunk; the frontend keeps working against the old API because it still sends unknown params harmlessly.

---

## Phase 6 — Empty states that keep the buyer moving

**Files:** `marketplaceFrontend/src/pages/products.astro` (the empty block at `:323-336`)

**Do:** when the filtered result is zero, render:
1. The filter that emptied it — "No **{category}** in **{state}**".
2. Up to two working alternatives from `facets` — "12 furniture listings elsewhere", "4 listings in Kano", each a link.
3. Keep a Reset link, but do not make it the only action.

**Edge cases:**
- Facets missing (older API, or a failed fetch) ⇒ fall back to the current copy. Never render "undefined listings".
- The alternative must be a link that actually returns results — build it from the facet key, not from the search string.

**Check:** filter to a combination you know is empty; the page shows two links and both return non-zero results.

**Rollback:** revert the block.

---

## Phase 7 — Contact on the card + seller storefront

> **Blocked on D4** (storefront identifier). The card half is not blocked — split if D4 is unresolved.

**Files:** `marketplaceFrontend/src/components/ProductCard.tsx`, `src/pages/s/[id].astro` (new), `src/lib/api.ts`, `backend/src/services/marketplace/marketplace.service.ts`, `backend/src/controllers/public-marketplace.controller.ts`, `backend/src/routes/index.ts`

**Do:**
1. Card: add a WhatsApp button visible only below `sm` (the mobile-first pattern in the plan §1.3). Before opening `wa.me`, fire `navigator.sendBeacon('/api/.../events', JSON)`. **Never await it** — a blocked beacon must not stop the deep link.
2. Build the deep link exactly as the detail page does (`p/[slug].astro:90-97`) and append the listing URL to the message so the merchant knows which listing was contacted.
3. Storefront: `GET /api/v1/marketplace/sellers/:identifier`, returning merchant profile + approved listings only. Route `/s/[id]` with `prerender = false`, `404` when unknown.
4. Link to the storefront from the seller card on the detail page and from the merchant name on the card.

**Edge cases:**
- Listing with no `contactWhatsapp` and no `contactPhone` ⇒ hide the button. `cleanPhone` is empty — do not build `wa.me/?text=`.
- Out-of-stock listings ⇒ hide the contact affordance on the card (the detail page keeps it; a buyer may still ask).
- Storefront must not leak `contactPhone` in its list payload — it is a list.
- Storefront count and the public feed count for the same merchant must agree.

**Check:** a 375px viewport shows the WhatsApp affordance on cards; tapping it opens WhatsApp with the product name, price, and URL; the event row exists.

**Rollback:** delete the route and the button.

---

## Phase 8 — Listing lifecycle

**Blocked on D6.** Three PRs, this order.

**8a — Expiry job**
- New `backend/src/jobs/marketplace-expiry.cron.ts`, modelled on `settlement-release.cron.ts` (transaction-scoped advisory lock, `try/finally` release).
- **LOCK_KEY `947366`** — 947362–947365 are taken; 947364 is already double-booked by two existing jobs (do not touch it, note it in the PR).
- Schedule daily, `{ timezone: 'Africa/Lagos' }`, registered in `server.ts` inside the existing `try/catch` (`server.ts:50-56`).
- Body: `status='approved' AND expiresAt <= now` ⇒ set `archived` + audit `marketplace.listing_expired`. Email **after** the transaction: "Your listing expired — renew in one click." Renewal = `expiresAt = now + 90d`, status back to `approved`; free for now.
- Per-row `try/catch` with `logger.warn` so one bad row never aborts the sweep.
- Idempotent: the query filters `approved`, so a crash mid-sweep just re-finds the row tomorrow.

**8b — Mark as sold**
- `POST /businesses/:businessId/marketplace/:id/mark-sold` ⇒ `status: 'archived'`, `soldAt: now`, audit `marketplace.sale_confirmed`.
- Ownership via `verifyBusinessAccess` (`backend/src/lib/ownership.ts:129`), same as `createProduct`.
- Refuse if already archived or rejected. Refuse drafts.

**8c — Listing strength (computed, not stored)**
- `images.length >= 2` + `description.length >= 120` + `attributes` non-empty + `price` within 0.5×–2× the category median.
- Median: one query per category, cached for the request. Do not compute it per listing.
- Block submission below 50 — but **forward-only**: existing products below 50 must still be editable.

**Edge cases:**
- `expiresAt` null ⇒ skip (never expire an unbackfilled row).
- A listing archived by the merchant must not be re-archived by the job.
- Renewal on an archived-by-user listing must not silently resurrect it — only expired-by-job rows renew.
- The category median with fewer than 3 listings is meaningless ⇒ skip the price component and renormalise the score.

**Check:** dry-run the sweep (`bypassLock` flag if you copy the settlement pattern) against real data; count matches `SELECT COUNT(*) ... WHERE expiresAt <= now AND status='approved'`.

---

## Phase 9 — Slot entitlement (schema + cap)

**Blocked on D3** (default allowance).

**Files:** `backend/prisma/schema.prisma`, one migration, `backend/src/services/marketplace/marketplace.service.ts:89-115`

**Do:**
1. `Business.marketplaceSlotAllowance Int @default(3)` (or `6` during the D3 seed window).
2. `MarketplaceSlotPurchase` model exactly as in plan §2.2, plus one correction — the enum needs a rejection state:
   ```prisma
   enum SlotPurchaseStatus { pending_proof active rejected refunded }
   ```
   The plan lists only `active | refunded | pending_proof`; an admin rejecting a proof needs a state that is not "refunded" (no money ever moved).
3. Cap enforcement (`marketplace.service.ts:97-113`): read the business row **inside the existing transaction**, under the existing advisory lock, and compare against `marketplaceSlotAllowance`.
4. Change the count filter from `status: { not: 'archived' }` to `status: { in: ['draft', 'pending_approval', 'approved'] }` — this is the plan's stated rule, and it **frees a slot** for any business holding rejected products. Audit it in the PR description and announce it; do not let support discover it.
5. `assertAllowanceNotBelowLiveProducts(businessId, newAllowance)` helper for Phase 11's refunds.

**Edge cases:**
- The business may not exist / not be owned ⇒ `verifyBusinessAccess` already throws first; do not re-check.
- A business at exactly the allowance gets `400 PRODUCT_LIMIT_REACHED` — keep that error code, the frontend already maps it.
- Concurrency: two creates at the cap. The advisory lock already serialises them per business.
- A slot purchase **must take the same lock** (Phase 10) or the lock protects nothing.

**Check:** a business with 2 approved + 1 rejected can now create a 4th only after buying a slot; before the change it could not. Both directions tested.

**Rollback:** revert the service hunk; the column is additive and harmless.

---

## Phase 10 — Slot purchase (wallet path)

**Blocked on D2** (price table).

**Files:** new `backend/src/services/marketplace/marketplace-slots.service.ts`, `backend/src/controllers/marketplace.controller.ts`, `backend/src/routes/marketplace.routes.ts`, `backend/src/config/index.ts`

**Do:**
1. Config block (add near `settlement`, `config/index.ts:283-287`):
   ```ts
   marketplace: {
     slotAllowanceDefault: parseInt(process.env.MARKETPLACE_SLOT_ALLOWANCE_DEFAULT ?? '3', 10),
     slotUnitPrice: Number(process.env.MARKETPLACE_SLOT_UNIT_PRICE ?? '0'),
     boostPrices: { week: 0, fortnight: 0, month: 0 },   // populated in Phase 13
   },
   ```
2. `POST /businesses/:businessId/marketplace/slots { slots: 1 }`.
3. Price server-side from config. Never accept a client price.
4. Debit the **owner's** wallet (`business.userId`) in one `prisma.$transaction` with an explicit options object — `TX_OPTIONS` at `wallet.service.ts:90` is module-local and **not exported**; `credit.service.ts:26` declares its own. Declare yours in the new service (`{ maxWait: 15000, timeout: 30000 }`) rather than reaching into another module's internals:
   - `SELECT id FROM wallet_balances WHERE user_id = $1 FOR UPDATE` — the row lock is load-bearing (`wallet.service.ts:409`).
   - `available = balance - lockedBalance`; if `available < amount` ⇒ `402 INSUFFICIENT_WALLET_BALANCE` (402, not 400 — the frontend differentiates).
   - `balance: { decrement }`, `version: { increment: 1 }`.
   - `walletTransaction.create` with `type: 'debit'`, `source: 'marketplace_slot'`, `netAmount: amount.negated()`, `balanceAfter`, unique `reference`, unique `idempotencyKey`.
5. In the **same** transaction: `pg_advisory_xact_lock(hashtextextended(businessId, 0))`, then `marketplaceSlotAllowance: { increment: slots }`, `MarketplaceSlotPurchase.create`, and `logAudit(..., tx)` (`lib/audit.ts:25`).
6. Receipt email **after** the transaction — same rule as bcrypt/email everywhere else in this repo.

**Edge cases:**
- No wallet row ⇒ `WalletService.getOrCreateWallet(userId, tx)` first.
- Do **not** call `syncUncreditedDvaSales` — that is a payout-path self-heal and will surprise you here.
- A retried request with the same idempotency key must return the original result, not charge twice. Add a unique index and catch `P2002` ⇒ return the existing purchase.
- A user with three businesses buys for one — the debit is from the shared wallet, the allowance is on one business. That is intended; stamp `businessId` on the transaction.
- Wallet balance going negative is impossible only if the check and the decrement are in the same transaction. Never read-then-write across an `await` boundary.

**Check:** insufficient balance leaves both the wallet and the allowance untouched; a successful purchase raises the allowance by exactly `slots` and writes one ledger row.

**Rollback:** remove the route. Ledger rows stay — reverse with a compensating credit, never a delete.

---

## Phase 11 — Slot purchase (proof path) + admin

**Files:** `backend/src/routes/marketplace.routes.ts` (multer), new admin service/controller methods, `backend/src/routes/marketplace-admin.routes.ts`, `adminFrontend/src/pages/admin/AdminMarketplace.tsx`

**Do:**
1. `POST /businesses/:businessId/marketplace/slots/proof` — mirror the subscription proof upload (`routes/subscription.routes.ts:36-42`: `authenticate` + rate limiter + `upload.single('file')` + type validation). Store the file with the existing Cloudinary lib.
2. Purchase row: `status: pending_proof`. **Never auto-approve.**
3. Admin: list pending proofs, approve (⇒ `active` + raise allowance **in one transaction**), reject (⇒ `rejected`, reason required).
4. Admin refund: `active` ⇒ `refunded` + wallet credit + `allowance -= slots`, blocked when `allowance - slots < liveProducts`.
5. Add a Slots tab to `AdminMarketplace.tsx` — it is currently a moderation queue with tabs `pending_approval | approved | rejected | archived` (`:35-37`); add the new tab alongside, do not replace them.

**Edge cases:**
- Approving twice must not raise the allowance twice — guard on `status = 'pending_proof'` inside the transaction.
- A proof uploaded for the wrong business ⇒ `403`, not a silent purchase.
- Refund must never take the allowance below the number of live products; if it would, return `409` and tell the admin to have the merchant archive first.
- File type/size validation is mandatory (the subscription route already has the exact check to copy).

**Check:** reject leaves no allowance change; approve raises it once; refund blocks at the floor.

---

## Phase 12 — Merchant slot UI

**Files:** `frontend/src/pages/Inventory.tsx` (**submodule**), `frontend/src/stores/marketplace.store.ts`, `frontend/src/types/index.ts`, `frontend/src/components/marketplace/`

**Do:**
1. The slot strip is currently hardcoded `[1, 2, 3].map(...)` (`Inventory.tsx:156`) with `emptySlotsCount` (`:198`). Replace the literal with `marketplaceSlotAllowance` from the business payload.
2. Render the 4th and beyond as a **locked slot card** with the price and "Unlock slot". This is the entire upsell — no campaign needed.
3. Show `viewCount` / `contactCount` per listing (from Phase 4) next to each slot.
4. Gate the purchase prompt on `contactCount >= 1` across the business (plan §2.5). During the D3 seed window, show capacity but not the price.
5. Put the "why isn't this selling?" panel (listing score) **above** the slot upsell. Selling capacity to a merchant whose listings are broken produces churn.

**Edge cases:**
- Business with 0 listings ⇒ show allowance, no performance numbers, no "0 views" theatre.
- The archive message already says "free up an inventory slot" (`:103`) — keep it consistent with the new allowance number.
- `frontend/` is a separate repo: commit and **push** there first, then bump the pointer in the main repo
  (§0.1). A pointer bump without the push leaves everyone else on a dangling commit.
- Analytics may be missing (Phase 4 not deployed) ⇒ render `—`, never `0`.

**Check:** 3 of 3 free, 4th locked with a price, purchase flow opens; after buying, the 4th slot unlocks without a page reload.

---

## Phase 13 — Boost purchase (separate SKU)

**Blocked on D5.**

**Files:** `backend/prisma/schema.prisma`, one migration, new `marketplace-boosts.service.ts`, routes, config prices

**Do:**
1. `MarketplaceBoost` model as in plan §2.4, with two corrections:
   - `enum BoostStatus { waitlisted active expired refunded paused }` — the plan promises a waitlist but its enum has no state for it.
   - Add `@@unique([productId, status])` is **wrong** (it would allow only one historical active row); instead enforce "one active boost per product" in the service, inside the transaction.
2. Denormalise `boostEndsAt DateTime?` onto `MarketplaceProduct` for cheap ranking.
3. `POST /businesses/:businessId/marketplace/:productId/boost { plan }`:
   - ownership → `status === 'approved'` → `stockQuantity > 0` → price from config → wallet debit (same primitive as Phase 10, `source: 'marketplace_boost'`) → create boost → set `boostEndsAt`.
   - Idempotency key `boost:{productId}:{plan}:{requestId}`.
4. Extending an active boost charges the difference and pushes `endsAt` out; never creates a second row.
5. Capacity check: if 3 active boosts already exist for this product's category (Phase 14's cap), create the row as `waitlisted` with a stated `startsAt` — and say so in the response so the UI can disclose it.

**Edge cases:**
- Boosting an archived/rejected/out-of-stock listing ⇒ `400`, never a silent accept.
- A boost on a listing that is later archived ⇒ auto-pause and stop counting days (Phase 14).
- Boost must never raise the slot allowance and must never consume a slot.
- Refunded boost must not decrement the allowance; refunded slot must not cancel a boost.

**Check:** a merchant with one approved listing buys a boost without buying a slot; neither purchase changes the other's state.

---

## Phase 14 — Boost ranking (hardest phase)

> Do not start until Phase 13 is merged. This is where a bug is most visible to buyers.

**Files:** `marketplace.service.ts:769-862` (feed), `backend/src/controllers/public-marketplace.controller.ts`, `marketplaceFrontend/src/components/ProductCard.tsx`

**Do:**
1. Determine `boostIds` for this request: active, not expired, listing approved and in stock, **and satisfying every active filter** (category, state, price, verified, stock). Order `endsAt asc`. Cap at 3 per category.
2. Ranking rules — all mandatory:
   - Boost applies **only** to `sort=newest` and **only** to `page=1`. `price_asc`/`price_desc` never reorder.
   - Never position 1. The first slot stays the newest organic listing.
   - Exclude `boostIds` from the organic query (`id: { notIn: boostIds }`), then interleave: `[organic0, boost0, organic1, boost1, ...]`.
   - **Offset math (this is the bug everyone ships):** page 1 takes `limit - boostIds.length` organic rows with `skip = 0`; page `n > 1` takes `limit` organic rows with `skip = (n - 1) * limit - boostIds.length`. Without this, page 2 repeats listings.
   - `pagination.total` stays the full filtered count (boosted rows are already counted once via organic exclusion).
3. Visible `Promoted` label on every boosted card. Pass a `promoted` boolean through the feed payload — do not infer it client-side from position.
4. Impressions: `ProductCard` fires `sendBeacon` with `type: 'boost_impression'` when rendered on page 1 with `promoted: true`. Server validates: boost active for that product, request says page 1, listing passes the filters — then `impressions++`.
   - **Do not count server-side on the feed request.** The feed is cached at the edge (`s-maxage=300`); a cached render sends no request, so server counting under-reports.
5. Auto-pause: when a boosted listing is archived, sold out, or edited (edits revert to `pending_approval` per the existing spec rule), set `status: 'paused'` and notify the merchant with the reason.
6. Purchase-time disclosure: if the category has fewer than 12 approved listings, say so. The withdrawal of that disclosure is what produces refunds.

**Edge cases:**
- A Lagos buyer filtered to Lagos must never see a Kano boost. This is the single most refund-worthy bug in the feature. Filter first, then cap.
- A boosted listing that would naturally rank on page 1 is excluded from organic — so it appears once, not twice.
- Two boosts expiring mid-pagination ⇒ the offset shifts. Acceptable; the page is cached for 60s.
- Boost ends mid-request ⇒ the next request drops it. Never sort by `boostEndsAt` as a proxy for active.
- `total` must not include paused/inactive boosts twice.
- Homepage "Featured Listings" rail stays organic — do not touch it.

**Check:** seed 5 boosts in one category; page 1 shows at most 3, none in position 1, all labelled; page 2 has no duplicates; filtering to a different state shows none.

---

## Phase 15 — Merchant analytics

**Files:** new `GET /api/v1/businesses/:businessId/marketplace/analytics`, `frontend/src/pages/Inventory.tsx` (submodule)

**Do:** per-product `viewCount`, `contactCount`, 7/30-day series from `MarketplaceListingEvent`, and rank position within its category. All derived from the event table — do not add a second analytics source.

**Edge cases:** a business with zero events returns zeros, not `null`; `isLocked` is irrelevant here (that is tax). Series gap-fill with zero rows so charts do not skip days.

---

## Phase 16 — Ads + SEO (gated)

Ship **only** the house-ad fallback and the sitemap unless §9's traffic gate is met.

- `MarketplaceBanner` model with `slot`, `imageUrl`, `targetUrl`, `businessId?`, `startsAt/endsAt`, `weight`, `status`, impression/click counters.
- **Never render an empty slot** — fall back to a house creative.
- `Sponsored` on every paid banner; `Promoted` already covers boosts.
- Sitemap generated on approval/expiry, not per request. `/ng/[state]/[category]` only where `>= 3` approved listings; `noindex` the rest.
- JSON-LD `Product` + `Offer` on detail pages; `Organization` site-wide; `BreadcrumbList` on category pages. **No `AggregateRating`** — no real ratings exist.
- OG image route `/og/p/[slug].png`.
- Canonical URLs collapse filtered pages to the unfiltered category.

---

## Phase 17 — Retention

Saved searches + daily alert job (reuse the Phase 8 cron pattern and its own lock key), recently-viewed rail from `localStorage` (no backend), merchant weekly digest (which is also the slot upsell), sponsored search only once search-volume data exists, professional-services directory last.

---

## Every PR

- [ ] `cd backend && npm run typecheck` clean
- [ ] `cd backend && npm run test:unit` — nothing deleted, nothing skipped
- [ ] `cd frontend && npm test` clean (if touched — **separate repo: commit + push there, then bump the pointer here**)
- [ ] `cd adminFrontend && npm test` clean (if touched)
- [ ] `cd marketplaceFrontend && npm run typecheck && npm run build` clean (there is no test suite)
- [ ] Migration present? It was generated `--create-only` and the SQL was read
- [ ] No client-supplied price, count, or type reaches a write
- [ ] No `contactPhone`/`contactWhatsapp` in a list payload
- [ ] Money uses `Prisma.Decimal`; no `parseFloat` arithmetic
- [ ] `git status` shows only this phase's files
- [ ] PR title names the phase (`Marketplace Phase 5 — server-side filters`)

## Stop and ask

- A test fails and you do not understand why.
- The phase is marked **blocked** (D1–D6 unresolved).
- A migration wants to `DROP` or add `NOT NULL` to a populated column.
- You need a file that is not listed here.
- You are tempted to refactor something adjacent. Note it, move on.
- You are about to count impressions or views server-side on a cached route.
