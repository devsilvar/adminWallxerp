# WallX Marketplace — Growth & Monetization Plan

> **Scope:** `marketplaceFrontend/` (buyer-facing), the public marketplace API in `backend/`,
> and the merchant surfaces in `frontend/` (Inventory, Subscription, Account).
>
> **Status:** plan only. Nothing here is implemented.
> **Verified against source on 2026-10-31** — every claim below cites a file/line that was read, not remembered.

---

## 1. The one-paragraph summary

Jiji does not make money by taking a cut of sales. It makes money by **selling visibility to sellers who are already getting buyer attention**. The order matters: traffic → seller attention → paid placement. Copying the *monetization forms* (VIP badges, banner ads) before you have the *traffic* produces empty ad slots and merchants who feel cheated. WallX has a structural advantage Jiji never had — **an existing book of verified SME accounts with wallets already funded** — so the correct sequence here is different:

1. **Fix the funnel first.** The public site is a static build: search, category filters, state filters and sorting **do not work in production**, and new listings don't exist as pages until the next redeploy. No merchant can sell through a catalogue that can't be searched.
2. **Measure second.** There is no view counter, no contact counter, no lead event. Without that data a merchant cannot tell whether their listings — free or paid — do anything, which makes the 4th-slot upsell a guess and the refund unanswerable.
3. **Then sell capacity first, and visibility alongside it as a second, separate purchase.** Two paid add-ons, deliberately compartmentalized: **slots** (3 free listings per business, the 4th and every listing after it paid per listing) and **boost** (a merchant pays to put one existing post on page one of the feed and its category for N days). Slots monetize how much a merchant can *list*; boost monetizes how prominently one listing *appears*. A merchant can buy either without the other — 3 free slots plus a boost on one of them is a valid combination, and so is 10 slots with no boost. Neither is bundled into the ERP subscription, and neither substitutes for the other. Slots need no traffic to be defensible, which is why slots lead.
4. **Only then take outside advertising money** — banners, category sponsorship, sponsored search — gated behind traffic thresholds in §9.

---

## 2. What Jiji actually does (research findings)

Observed directly from the live site on 2026-10-31:

**Homepage structure, in order**
1. Header: logo, animated ad slot, "Sell faster / Buy smarter" tagline, language toggle, login, **Sell** button.
2. 16-icon category grid, each tile its own landing page.
3. **Banner carousel — four slots.** Contents observed: a Jiji property-intelligence microsite (`scout.jiji.ng`), a Google Form job application, and two YouTube how-to videos. None of these are third-party brands; they are all **house ads** or lead-gen funnels. That is the honest state of classifieds advertising at scale: you fill your own inventory first.
4. **Trending ads feed** — a single long scroll, cards with photo, price, title, condition, location, and badges: `Verified ID`, tenure (`5+ years on Jiji`), and paid tiers `VIP`, `VIP Gold`, `Diamond`, `Premium`, `Enterprise`.
5. Footer with country switcher and policy links.

**Category page** (`/vehicles`)
- Left sidebar: categories, location, **price min/max plus price bands with live ad counts** (Under 25K → More than 53M), `Verified sellers` toggle with a count, `With discount` toggle with a count, Clear / **Save** buttons.
- Sort control above the grid.
- Paid placement is signalled **only by a tier icon** on the card. There is no "Promoted" text label — the platform deliberately blurs paid and organic.

**The monetization model, stated plainly**

| Jiji revenue line | Mechanic | What it requires to work |
|---|---|---|
| Paid listing tiers (VIP/Diamond/Enterprise) | Seller pays for top-of-category placement for N days | Enough buyer traffic that top placement has measurable value |
| Homepage banners | Direct-sold display inventory | Traffic, or filled with house ads |
| Lead-gen funnels | Job applications, how-to videos, vertical microsites | Traffic |
| Business/pro seller accounts | Recurring fee for higher limits + badge | Seller volume |

**What Jiji does *not* do:** it does not take commission on transactions, does not process payment, does not guarantee delivery. Its promise to buyers is "free to browse, contact the seller directly". Yours is the same promise — it's the differentiator against Jumia-style e-commerce, and it should not be sold away for a take rate.

**The uncomfortable lesson:** Jiji's model is an attention-arbitrage business. Its paid tiers work because a single category page gets more sessions in an hour than WallX Marketplace may get in a month. That does not mean paid placement is off the table here — it means the *delivery* has to be honest. Boost is a legitimate separate SKU (§2.4): a merchant pays to put one post on page one of the feed and its category for N days. The three things that make it honest rather than Jiji-like are a visible `Promoted` label, a cap on how many boosted posts page one can hold, and a delivered-impressions counter so an under-delivery claim can be answered with a number instead of an argument.

**WallX's model is different, and better for this stage.** It monetizes **capacity**, not attention: every merchant gets 3 free listings per business, and the 4th listing onward is paid per listing. That decouples revenue from traffic — a merchant buys a 4th slot because they have a 4th product to sell, not because you proved you sent them 40 views. Two consequences follow through the whole plan:

- **Boost is a real, separate SKU** — one listing appears on page one of the feed and its category for N days, sold per listing from Phase 2 (§2.4), with its own pricing table, endpoints, finance line and admin controls. It is not a bundle of the slot purchase and does not consume a slot.
- **The marketplace fee is a separate SKU from the ERP subscription.** They are different purchases with different rails: the ERP subscription is chosen at registration (`Register.tsx:75-84`, `starter | business | scale | free`) and paid by uploading proof of payment (`POST /subscription/proof`, manual admin review); the marketplace listing fee is paid per additional listing and must not be conflated with it in pricing, UI, or ledger.

---

## 3. Current state — audit against source

### 3.1 Conversion-critical defects (these block everything else)

| # | Defect | Evidence | Consequence |
|---|---|---|---|
| C1 | **Marketplace is a static build.** No adapter, `output: 'static'`. | `marketplaceFrontend/astro.config.mjs:18` | Every runtime query string is ignored. |
| C2 | **Search does not work in production.** `/products` reads `new URL(Astro.request.url)` at build time. Header search, hero search, and every filter link point at query strings. | `marketplaceFrontend/src/pages/products.astro:8`; `Header.tsx:21`; `index.astro:90` | A buyer searching "leather bag" gets the unfiltered catalogue. This is the single largest conversion loss. |
| C3 | **State and sort filters don't filter, and the counts lie.** `category`, `type` and `search` *are* passed to the API (`products.astro:17`) and applied server-side by `listPublicFeed` — they fail only because the static build never reads the query string. `state` and `sort` are genuinely client-side, applied to the current page of 16 after pagination. | `products.astro:22-36` (state filter + sort applied to `rawProducts`) | `?state=Lagos` usually shows an empty grid; "Price: Low to High" sorts 16 of 200 items while the paginator still says "3 / 12". |
| C4 | **Counts are wrong when filtered.** `pagination.total` is unfiltered. | `products.astro:74` | Header says "240 listings" above an empty grid. |
| C5 | **New listings have no page until redeploy.** `getStaticPaths` enumerates products at build. | `p/[slug].astro:10-54` | A merchant publishes and gets a 404. Merchant satisfaction and trust collapse at the exact moment they were promised a win. |
| C6 | **Only 50 product pages can ever exist.** Frontend asks for 100; backend clamps to 50. | `p/[slug].astro:11` (`limit: 100`); `backend/.../marketplace.service.ts:778` (`Math.min(..., 50)`) | Even a rebuild silently truncates the catalogue. |
| C7 | **No sort, state, or price filtering server-side.** Feed accepts `page/limit/category/type/search` only, always `createdAt desc`. | `marketplace.service.ts:769-807`; `marketplace.validator.ts:314-334` | Fixing C3 in the UI alone is impossible — the API can't answer the query. |
| C8 | **Contact details are in the list payload.** `contactPhone` / `contactWhatsapp` ship with every feed card. | `marketplace.service.ts:841-843` | Scrapers harvest your merchants' numbers; and since the number arrives without a page view, a "contact" can never be attributed to a listing. |
| C9 | **No view or contact tracking at all.** `MarketplaceProduct` has no counters; no event table. | `backend/prisma/schema.prisma:1236-1282` | No merchant analytics, no sell-through data, and no evidence to justify a paid slot. |
| C10 | **Six hardcoded `http://localhost:5173` links.** "Sell on WallX", "Open Merchant Inventory", "Create Free Account". Only `Footer.tsx` reads an env var. | `Header.tsx:96,154`; `index.astro:263,388,397`; `Footer.tsx:3` | The merchant acquisition funnel 404s in production — the only path from buyer traffic to seller supply is broken. |

> C1–C7 are the reason this plan starts with architecture, not with "add a carousel".

### 3.2 Supply and merchandising gaps

| Gap | Evidence | Effect |
|---|---|---|
| Hard cap of **3 products per business** | `marketplace.service.ts:101-112` | Thinnest possible catalogue. Also the cleanest upsell lever in the product (§5.2). |
| **No boost field anywhere** in schema or service | grep for `boost\|promotionLevel\|spotlight\|promote` across `backend/src`, `frontend/src` and `marketplaceFrontend/src` → 0 marketplace hits (the only `Spotlight` match is a CSS comment at `frontend/src/pages/marketing/Pricing.tsx:62`) | Nothing can be pushed to page one today. The "Featured Listings" section on the homepage is just the 12 newest listings. Boost is a planned, separately-priced SKU (§2.4) — the field, the ranking logic and the purchase flow all still need building. |
| **No seller storefront page** | Only related products within one merchant, max 4, on the detail page | A buyer who likes one product cannot see the merchant's other two without hunting. |
| **No listing expiry** | No `expiresAt` on `MarketplaceProduct` | Sold-out, abandoned and 2-year-old listings stay live forever. Freshness signals (`timeAgo`) then actively damage trust. |
| **No "mark as sold"** | absent from service exports | No sell-through data, no reason to re-list, no reason to upgrade. |
| **No listing quality gate** | Moderation approves/rejects on human judgement only (`approveProduct`, `marketplace.service.ts:557`) | Thin listings (one photo, 20-character description) get approved, then never sell, and the merchant blames the platform. |
| **Empty categories are dead ends** | Category tiles link to `?category=` unconditionally | 8 category tiles exist today against a catalogue of a handful of items. Most clicks land on "No matching products found". |
| **No SEO surface** | No sitemap, no canonical, no JSON-LD, no per-location pages, no OG image | Marketplace traffic cannot compound. Every visit must be bought or borrowed. |

### 3.3 What is already good (don't rebuild it)

- Visual language is consistent and genuinely Jiji-derived: category grid, card density, freshness label, location above title, condition/stock pills, discount badge. Keep it.
- WhatsApp deep link with a pre-filled message including product name and price (`p/[slug].astro:92-96`) — correct pattern, matches how Nigerian buyers actually transact.
- Mobile sticky contact bar (`MobileStickyContact.tsx`) — right call for a mobile-first market.
- Moderation state machine with rejection reasons and email dispatch — the trust moat. Paid placement must never bypass it.
- Public API already sets a sane CDN cache header (`s-maxage=300, stale-while-revalidate=600`).
- Merchant portal, wallet, credits and subscription tiers already exist in the ERP — the distribution advantage.

---

## 4. The revenue surface map

Every place money can be made, ranked by **time-to-first-naira** at current scale. Honest readiness is stated for each.

| # | Surface | Buyer | Model | Prerequisites | Ready when |
|---|---|---|---|---|---|
| **R1** | **Paid listing slots** — 3 free per business, the 4th and beyond paid **per listing** | Merchant (must hold a WallX merchant account) | Per-listing fee, paid from wallet or proof-of-payment | Slot entitlement model, cap enforcement that reads it, purchase flow | **Phase 2 — the core SKU** |
| **R2** | **Merchant account gate** — you cannot list without a WallX merchant account | Merchant | Free to open; it is the funnel | Marketplace CTA → registration → business creation | Phase 0 |
| **R3** | **ERP subscription** — `starter / business / scale` in the user dashboard | Merchant | Recurring, existing manual-proof flow | None new | Already live; add attribution |
| R4 | **Slot bundles** — 5-pack / 10-pack at a discount to per-listing pricing | Merchant | One-off | R1 shipped and priced | After R1 proves demand |
| R5 | **House ads** — fill every ad slot with own products (subscriptions, wallet top-up, tax filing) | WallX (internal) | Free, but converts | Ad slot components | Phase 3 |
| R6 | **Direct-sold banners** — homepage hero, category leaderboard, in-feed | Local brands, banks, telcos, POS vendors | Monthly flat | Real traffic (see §9 gate) | Traffic-gated |
| R7 | **Category sponsorship** — "Electronics presented by X" | Same as R6 | Monthly flat | Traffic + category pages that rank | Traffic-gated |
| R8 | **Sponsored search results** — pinned listing for a keyword | Merchant | Monthly | Working search + catalogue density | Phase 4+ |
| R9 | **Boost** — one existing listing appears on **page one** of the feed and its category for N days | Merchant | Per listing, per duration (7 / 14 / 30 days) | Page-1 interleave + cap (§2.4), `Promoted` label, delivered-impression counter | **Phase 2 — second SKU, independent of R1** |
| R10 | **Professional-services directory** — accountants, tax consultants, CAC agents | Service providers | Monthly listing fee | None new | Phase 4 |
| R11 | **Lead-based plans** — pay per verified WhatsApp/call lead | Merchant | Usage | Attribution (C9) + anti-fraud | Phase 5+, only if R1 underperforms |
| R12 | **Marketplace commission** | — | — | — | **Rejected.** See §10. |
| R13 | **Third-party ad network** (AdSense et al.) | — | CPM | — | **Rejected near-term.** See §10. |

**The strategic read:** R1 and R9 are two distinct businesses that happen to share a customer. R1 (slots) is the one that can produce revenue before you have traffic — it requires no proof that an impression was worth anything, and it scales linearly with merchant inventory rather than with audience. R9 (boost) is the one that requires placement to actually render, so it ships in the same phase but is sold, priced, metered and refunded independently of R1. Keeping them compartmentalized is what lets you reprice, discount or withdraw either one without touching the other.

R2 is the funnel that feeds both: a buyer who wants to sell must open a merchant account, and that account is the same object that later buys an ERP subscription (R3) — which is why attribution matters more than any ad slot.

R4–R8 and R10 are real but later. R9 is *not* demoted — it is a Phase 2 SKU alongside R1 — but it carries a delivery guard that R1 does not: page one holds at most 3 boosted posts, and a category whose entire catalogue already fits on page one must say so at purchase. R1 can never under-deliver (the merchant either gets the capacity or does not); R9 can, so its honesty has to be engineered rather than assumed.

---

## 5. Phase plan

### Phase 0 — Architecture & measurement (blocking, ~3–4 dev-days)

Nothing else in this document is worth building on a static build with no instrumentation.

**0.1 Move the marketplace to SSR / hybrid rendering**

- Add `@astrojs/vercel` and set `output: 'hybrid'` — this is the correct Astro 4 mode: pages stay prerendered by default and only the routes you mark `export const prerender = false` render on demand. Do **not** use `output: 'server'`; it forces the homepage and every static asset through a function for no benefit.
- `astro.config.mjs`: add `adapter: vercel({ imageService: true })`. Keep `@astrojs/react` and Tailwind.
- Convert `src/pages/products.astro` and `src/pages/p/[slug].astro` from prerendered to on-demand by adding `export const prerender = false;` to each:
  - Delete `getStaticPaths` from `[slug].astro`; read `Astro.params.slug` and call `getProductBySlug` at request time. Return a 404 page when null.
  - `products.astro` keeps reading `Astro.request.url` — it now works, because the URL is the real request.
- Set per-route cache headers instead of relying on the API's header surviving the proxy hop:
  - `/products`: `public, s-maxage=60, stale-while-revalidate=300`
  - `/p/[slug]`: `public, s-maxage=300, stale-while-revalidate=600`
- Keep the homepage static (it is brand + category tiles + newest 12; a 5-minute staleness is acceptable) **unless** it carries a banner slot that changes often — in which case render it server-side too.

*Why not client-side fetch?* The catalogue must be crawlable and shareable. SSR keeps HTML for SEO and first paint, and `stale-while-revalidate` hides the backend latency.

**0.2 Add tracking to the schema**

```prisma
// backend/prisma/schema.prisma — MarketplaceProduct additions
viewCount        Int       @default(0) @map("view_count")
contactCount     Int       @default(0) @map("contact_count")
lastContactedAt  DateTime? @map("last_contacted_at")
expiresAt        DateTime? @map("expires_at")          // null = no expiry yet (backfill safe)

// new: append-only funnel events, the raw material for merchant analytics
model MarketplaceListingEvent {
  id            String   @id @default(uuid())
  productId     String   @map("product_id")
  businessId    String   @map("business_id")
  eventType     MarketplaceEventType
  sessionHash   String?  @map("session_hash")   // hashed, not a user id — no PII
  source        String?  // home | products | search | detail | storefront
  occurredAt    DateTime @default(now()) @map("occurred_at")

  product  MarketplaceProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([productId, eventType, occurredAt])
  @@index([businessId, occurredAt])
  @@map("marketplace_listing_events")
}

enum MarketplaceEventType {
  view
  whatsapp_click
  call_click
  share_click
  storefront_view
}
```

- Also add `soldAt DateTime? @map("sold_at")` — §1.6 depends on it and nothing in the schema has it today.
- Backfill `expiresAt = approvedAt + 90 days` for existing approved rows, then enforce.
- Do **not** put raw IP or user agent in the event table. `sessionHash` = daily-salted hash of IP+UA, used only to dedupe views within a day. NDPR applies here even though the repo's security docs don't address it yet — treat that as a gap to close, not a justification.

**0.3 Endpoint changes that everything downstream depends on**

- `POST /api/v1/marketplace/products/:id/events` — public, rate-limited (reuse `publicMarketplaceRateLimiter`), body `{ type }`, increments counters for `view`/`whatsapp_click`/`call_click`/`share_click` and writes the event row. Server decides which types increment counters; never trust a client-supplied counter.
- `GET /api/v1/businesses/:businessId/marketplace/analytics` — authenticated; per-product views, contacts, 7/30-day series, ranking position in its category. This is the merchant dashboard payload.
- Remove `contactPhone` / `contactWhatsapp` from the **list** feed payload (`marketplace.service.ts:841-843`) and keep them on detail only. Detail is already the attribution point.

**0.4 Fix the merchant acquisition links**

- Introduce `PUBLIC_APP_URL` / `PUBLIC_MARKETPLACE_URL` env vars (`.env.example` already exists in `marketplaceFrontend/`).
- Replace all six hardcoded `localhost:5173` references. `Footer.tsx:3` already has the pattern; copy it to `Header.tsx` and `index.astro`.
- Append `?src=marketplace&listing={slug}` to every merchant CTA, and persist `acquisitionSource` on the `User` row at registration (`backend/src/services/auth/*`, `frontend/src/pages/Register.tsx`). Without this the marketplace's most valuable output — an ERP subscription — is unattributable.

**Exit criteria for Phase 0**
- `/products?category=fashion&state=Lagos&sort=price-asc` returns correctly filtered, correctly sorted, correctly paginated HTML.
- A listing approved 30 seconds ago has a working detail page without a redeploy.
- Viewing a product and tapping WhatsApp writes two rows to `marketplace_listing_events`.
- No `localhost` string anywhere in `src/`.
- A merchant who arrives from a listing and registers has `acquisitionSource = 'marketplace'` on their `User` row.

---

### Phase 1 — Make the site convert (~4–5 dev-days)

Now that queries are real, build the buying tools smartly. The rule for a thin catalogue: **never show a dead end**.

**1.1 Server-side filtering & sorting (`listPublicFeed`)**

Add to `listProductsQuerySchema` and the service:

| Param | Type | Behaviour |
|---|---|---|
| `sort` | `newest \| price_asc \| price_desc \| relevance` | Server-side `orderBy`. Default `newest`. `relevance` = exact title match first, then newest. |
| `state` | string | Filter on `business.state` (case-insensitive contains). |
| `minPrice` / `maxPrice` | number | `price` range. |
| `verifiedOnly` | boolean | `business.user.isVerified = true`. |
| `hasDiscount` | boolean | `compareAtPrice > price`. |
| `inStockOnly` | boolean | `!trackInventory || stockQuantity > 0`. |

Return a `facets` object alongside `pagination` so the sidebar can render **live counts**, which is the single most useful thing Jiji's category page does:

```json
"facets": {
  "categories": [{ "slug": "fashion", "count": 18 }, ...],
  "states":     [{ "name": "Lagos", "count": 41 }, ...],
  "priceBands": [{ "id": "under_25k", "label": "Under ₦25,000", "count": 12 }, ...],
  "verifiedCount": 63,
  "discountCount": 9
}
```

Implementation notes: compute facets with one `groupBy` per dimension inside `Promise.all`, capped at the top 10 states and 6 price bands (`<25k, 25–50k, 50–100k, 100–250k, 250k–1m, >1m`). Do not run a facet query per render for the detail page — facets are a list-page concern only.

**1.2 Graceful empty states that keep the buyer moving**

When a filtered query returns 0:

1. Show the filter that emptied it ("No **furniture** in **Kano**").
2. Offer the nearest non-empty alternatives, computed from facets: *"12 furniture listings elsewhere"*, *"4 listings in Kano"*.
3. Never render a bare "No results".

This is the highest-leverage change for a small catalogue — it converts a bounce into a browse.

**1.3 Contact without a page visit (mobile)**

- Add a WhatsApp button to `ProductCard` on `<640px` only, alongside "View Details". Jiji surfaces the phone affordance on the card; your current card forces a detail page first.
- The tap calls `POST /events {type:'whatsapp_click'}` via `navigator.sendBeacon` and then opens `wa.me`. Fire-and-forget — never block the deep link on analytics.
- Keep the pre-filled message as-is, but append the listing URL so the merchant knows which listing was contacted.

**1.4 Seller storefront**

- New route `/s/[slug]` (business slug or merchantId): merchant name, verification badge, location, member-since, all approved listings, and a contact CTA.
- Link to it from the seller card on the detail page and from the product card's merchant name.
- This exists mainly because of the 3-product cap: three lonely listings look like an abandoned shop; three listings on a branded storefront page look like a shop.
- Requires a public `GET /marketplace/sellers/:slug` returning merchant profile + approved listings.

**1.5 Related products across the marketplace**

Current related products are same-merchant only, capped at 4. With a 3-product cap that section is nearly empty.

- Change to: same merchant first (max 2), then same category by price proximity (max 2), then same state (max 2). Label the section "Similar listings" rather than "More from this merchant".
- Keep a separate "More from {merchant}" module when the merchant has ≥2 listings, linking to the storefront.

**1.6 Listing lifecycle**

- **Expiry:** `expiresAt` defaults to approval + 90 days. A daily job (reuse the existing cron pattern in `backend/src/jobs/` — `reminders.cron.ts` and `settlement-release.cron.ts` are the two closest models) moves expired approved listings to `archived` and enqueues an email: *"Your listing expired — renew in one click."* Renewal is a free action initially; it becomes a paid action only if R2 proves merchants value it.
- **Mark as sold:** new merchant action, `POST /businesses/:businessId/marketplace/:id/mark-sold`, sets `status: 'archived'` with `soldAt` (added in §0.2), and writes a `marketplace.sale_confirmed` audit row. This is how you report sell-through — the number that tells a merchant their paid 4th slot was worth it.
- **Listing quality score** (computed, not stored): `images ≥ 2` + `description ≥ 120 chars` + `attributes` non-empty + `price within 0.5×–2× category median`. Show it in `Inventory.tsx` as a 0–100 "Listing strength" meter with the specific missing items listed. Block submission below 50 (moderation already exists — this just front-loads the rejection so it never becomes a merchant's problem).

**Exit criteria for Phase 1**
- Sidebar filters show counts, and every combination returns the right items and the right total.
- Sorting is correct across the whole result set, not one page.
- A zero-result page always offers a working alternative.
- Merchant WhatsApp taps are recorded server-side.

---

### Phase 2 — Sell capacity and visibility, as two separate add-ons (~6–7 dev-days)

Two paid products, deliberately compartmentalized:

| SKU | What the merchant buys | Trigger | Price shape |
|---|---|---|---|
| **Slot expansion** | One more listing beyond the 3 free | They have a 4th product to list | Per listing |
| **Boost** | Page-one placement for one existing listing | They want that post seen first | Per listing, per duration (7 / 14 / 30 days) |

A merchant can buy either without the other: 3 free slots plus a boost on one of them is a valid combination, and so is 10 slots with no boost. Separate endpoints, separate pricing tables, separate finance lines, separate admin controls. Neither bundles into the ERP subscription.

**2.1 Slot entitlement model**

- `Business.marketplaceSlotAllowance` (default `3`). The listing cap at `marketplace.service.ts:108` reads this instead of the hardcoded `3`.
- A slot purchase raises the allowance by one. The slot is **business capacity**, not bound to a specific product — so archiving or deleting a product frees that slot for a different product. This is fairer than charging per product and avoids "I paid for a listing, it sold, now I must pay again to list the replacement".
- `draft`, `pending_approval` and `approved` all count against the allowance (matches the current count at `marketplace.service.ts:101-112`). `archived` and `rejected` do not.
- Listing requires a **WallX merchant account**: a business owned by the user. Ownership is already enforced in the service; the gap is the public CTA, which must route a buyer to registration and then business creation — not straight to `/inventory`.

**2.2 Slot schema**

```prisma
model Business {
  // ...
  marketplaceSlotAllowance Int @default(3) @map("marketplace_slot_allowance")
}

enum SlotPurchaseStatus { active, refunded, pending_proof }

model MarketplaceSlotPurchase {
  id          String             @id @default(uuid())
  businessId  String             @map("business_id")
  slots       Int                @default(1)
  unitPrice   Decimal            @db.Decimal(15, 2)
  amount      Decimal            @db.Decimal(15, 2)
  status      SlotPurchaseStatus @default(active)
  paidVia     String             @map("paid_via")   // wallet | proof
  walletTxRef String?            @unique @map("wallet_tx_ref")
  proofUrl    String?            @map("proof_url")
  purchasedBy String             @map("purchased_by")
  createdAt   DateTime           @default(now()) @map("created_at")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  @@index([businessId, status])
  @@map("marketplace_slot_purchases")
}
```

Why a purchase row instead of just incrementing a counter: refunds, support ("how many did this merchant buy?"), finance reporting, and the ability to reprice later without rewriting history.

**2.3 Slot purchase flow**

`POST /businesses/:businessId/marketplace/slots { slots: 1 }`

1. Validate ownership and that the business is active.
2. Price server-side from a tier table (`1 slot = ₦X`, `5 = ₦Y`, `10 = ₦Z`). Never accept a client price.
3. **Wallet path (primary):** debit `WalletBalance.balance` inside a `$transaction` and write a `WalletTransaction` with `source: 'marketplace_slot'` and a unique reference. Insufficient funds → `402 INSUFFICIENT_WALLET_BALANCE` with a top-up link.
4. **Proof path (fallback):** upload a receipt (`POST /marketplace/slots/proof`, mirroring the existing `POST /subscription/proof` flow in `subscription.routes.ts`); status `pending_proof`; admin approval raises the allowance. Never auto-approve.
5. Raise `marketplaceSlotAllowance` by `slots` **in the same transaction as the wallet debit**; `logAudit('marketplace.slots_purchased')`.
6. Receipt email post-transaction (same rule as bcrypt/email — never inside the tx).

**2.4 Boost — put this post on page one (separate SKU)**

The product in one sentence: **a merchant pays to have one of their listings appear on the first page of results** — the main `/products` feed and the listing's own category page — for a fixed number of days. That is the whole offer. No placement tiers, no "homepage rail", no storefront pin. One boost, one effect, one price per duration.

| Plan | Duration | What the buyer gets | Price (validate) |
|---|---|---|---|
| **1 week** | 7 days | Listing appears on page 1 of the feed and its category | ₦X |
| **2 weeks** | 14 days | Same | ₦Y |
| **1 month** | 30 days | Same | ₦Z |

Duration is the only variable — a longer boost is the same product for longer, not a better product. Keeping one effect makes the promise testable ("did my post show on page one?") and makes the refund answerable.

```prisma
enum BoostPlan { week, fortnight, month }
enum BoostStatus { active, expired, refunded, paused }

model MarketplaceBoost {
  id            String      @id @default(uuid())
  productId     String      @map("product_id")
  businessId    String      @map("business_id")
  plan          BoostPlan
  amount        Decimal     @db.Decimal(15, 2)
  startsAt      DateTime    @map("starts_at")
  endsAt        DateTime    @map("ends_at")
  status        BoostStatus @default(active)
  impressions   Int         @default(0)   // delivered page-1 placements, the refund evidence
  walletTxRef   String?     @unique @map("wallet_tx_ref")
  createdAt     DateTime    @default(now()) @map("created_at")

  product MarketplaceProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([productId, status, endsAt])
  @@index([businessId, createdAt])
  @@map("marketplace_boosts")
}
```

Denormalise `boostEndsAt` onto `MarketplaceProduct` for cheap ranking; a lazy check or the daily cron clears it once expired.

`POST /businesses/:businessId/marketplace/:productId/boost { plan }`

1. Validate ownership, `status === 'approved'`, `stockQuantity > 0`.
2. Price server-side from the plan table — never accept a client price.
3. Debit the wallet and create the `MarketplaceBoost` in one `$transaction`; `WalletTransaction.source = 'marketplace_boost'`; idempotency key `boost:{productId}:{plan}:{requestId}`. Insufficient funds → `402` with a top-up link.
4. Guard: only one `active` boost per product. Extending charges the difference and pushes `endsAt` out.
5. Receipt email post-transaction.

**Ranking: page one, interleaved, labelled.** Do not simply sort boosted listings to the top — that turns page one into wall-to-wall ads and the second a merchant sees eight paid posts above them, the whole page reads as fake. Instead:

```
organic = eligible listings, ORDER BY createdAt DESC
boosted = active boosts, ORDER BY endsAt ASC (soonest-ending first)
pageOne = positions 1..12 of the current result set
merge   = interleave boosted into pageOne, max 3 per page, never position 1
```

- **Cap boosted listings at 3 per page.** That is the promise the buyer is paying for (a page-one slot exists for them) and the ceiling that protects the page from becoming an ad wall. Once 3 boosts are live in a category, further boosts in that category go to a waitlist rather than over-filling page one.
- **Never position 1.** The top slot stays the newest organic listing. A page whose first result is always paid is the fastest way to teach buyers to distrust every result.
- **Boosted listings must still satisfy every filter** (category, state, price, stock). A Lagos buyer filtering to Lagos must never see a Kano boost — that is the single most refund-worthy bug this feature can have.
- **Visible `Promoted` label** on every boosted card. Unlabelled paid ranking contradicts "verified, no middlemen".
- **`price_asc` / `price_desc` sorts do not reorder for boosts.** A paid slot that ignores the chosen sort makes the sort feel broken; boost applies to the default `newest` ordering only.
- **Never boost an `archived`, `rejected` or out-of-stock listing.** Auto-pause the boost (`status: 'paused'`), stop counting days, and notify the merchant with the reason.
- **If a category has fewer than 12 approved listings, page one *is* the whole category** — boost still delivers (the post is on page one), but say so at purchase: "This category has 9 listings, so page one shows all of them. Boost will not change your position much." Honest, and it stops the refund.
- **Increment `impressions`** each time a boosted listing is rendered on page one. This is the number a merchant will ask for, and the only defence against "I paid and nothing happened".

**Boost on the homepage "Featured Listings" rail** is a separate, later question (R5/R8 territory) — not part of this SKU. Keep the rail organic-newest for now.

**2.5 Honest risks, and the mitigations** *(slot SKU; boost carries its own guards in §2.4 and §8)*

Charging for slot #4 before a merchant has had a single contact on slots #1–3 reads as **a paywall on hope**, and at launch it suppresses the exact supply density the marketplace needs. Mitigations, in order:

1. **Gate the upsell on evidence.** Do not show the purchase prompt until the business has ≥1 recorded contact (§0.2). Then show the number: *"Your 3 listings got 14 contacts this month. A 4th slot is ₦X."*
2. **Seed supply.** During launch, grant +3 slots free for 90 days (`marketplaceSlotAllowance = 6` as an onboarding grant) so the catalogue reaches a searchable size. Start charging when merchants have a reason to want more.
3. **Price it as an impulse, not a budget line.** The listing fee must read as much cheaper than the ERP subscription, or merchants will ask why they are paying twice. Validate the number against `starter` before publishing it.

**2.6 Merchant UI (`frontend/src/pages/Inventory.tsx`)**

- Show the allowance plainly: `3 of 3 free slots used`, with the 4th rendered as a **locked slot card** carrying the price and an "Unlock slot" button.
- The locked slot is the whole upsell: honest (you see exactly what you get), contextual (it appears when the merchant actually wants to add a product), and it needs no campaign.
- Per-listing performance (`142 views · 9 WhatsApp taps`) sits next to each slot — that is what justifies paying for the next one.
- The "why isn't this selling?" panel (listing score, §1.6) sits **above** the slot upsell. Selling capacity to a merchant whose existing listings are broken produces churn, not revenue.
- Boost lives on the **listing row**, not the slot grid: a `Boost` action per approved listing opens the plan picker (7 / 14 / 30 days, price, end date). It is never offered as a way to get a 4th listing, and the slot upsell never mentions it — the two prompts must not appear in the same visual unit.
- Show an active boost as a countdown on the row (`Promoted · 6 days left`) with a renew action, and record delivered page-1 impressions next to it so renewal is an evidence-based decision rather than a reflex.

**2.7 Admin controls**

- `/admin/marketplace` gains a Slots tab: allowance per business, purchase history, pending proofs (approve/reject with reason), refunds (wallet credit + `status: refunded` + allowance decrement), and manual grants for support/onboarding.
- A separate **Boosts** tab: active / expired / paused boosts, delivered page-1 impressions per boost, the per-page cap and the per-category waitlist, extend-in-kind for under-delivery, and the ability to pause a boost on a listing that is being edited or disputed. Slot and boost refunds are separate actions with separate reasons — never one "refund marketplace purchase" button.
- Finance: slot revenue and boost revenue reported as **two lines** by month, both reconciled against the wallet ledger. Do not create a second revenue ledger, and do not net them into one "marketplace revenue" figure.

**Exit criteria for Phase 2**
- A business at 3/3 cannot create a 4th product; the 4th slot is visibly purchasable with a price.
- Wallet payment raises the allowance in the same transaction as the debit; a failed debit changes nothing.
- The proof-of-payment path reaches an admin queue and cannot self-approve.
- Archiving a product frees its slot.
- The purchase prompt appears only for merchants with recorded contacts (until the seed period ends).

**Exit criteria for the boost SKU (2b, separately shippable)**
- A merchant with one approved listing can buy a boost without buying a slot, and vice versa; neither purchase changes the other's state.
- A boosted listing appears on **page one** of the feed and of its own category, carries a `Promoted` label, still satisfies every active filter, and leaves placement the moment its boost ends or the listing is archived, sold out or paused.
- Page one never shows more than 3 boosted listings and never puts a boosted listing in position 1.
- Every boost records delivered page-1 impressions, so an under-delivery claim can be answered with a number.

---

### Phase 3 — Monetize attention (ads + SEO) (~4–5 dev-days)

Gated on traffic. If the gate in §9 is not met, ship **only** the house-ad fallback.

**3.1 Ad slot inventory**

| Slot ID | Location | Size | Inventory owner |
|---|---|---|---|
| `home_hero_carousel` | Homepage, below category grid | 4 slides | Direct-sold, house fallback |
| `home_mid_banner` | Homepage, above listings | 1 wide | House only initially |
| `products_leaderboard` | `/products` top | 1 wide | Direct-sold |
| `products_infeed` | Every 12th result position | 1 native | House or merchant |
| `sidebar_promo` | Filters sidebar, below Listing Type | 1 box | House |
| `mobile_sticky` | Mobile bottom of `/products` | 1 strip | House |

`MarketplaceBanner` model: `slot`, `imageUrl`, `targetUrl`, `businessId?`, `startsAt/endsAt`, `weight`, `status`, plus impression/click counters. Rendering rule: **never an empty slot.** If no paid creative is active, render the house creative (subscribe-to-Business-plan, wallet top-up, file-your-tax). An empty grey box is worse than no box, and it also teaches the team which slots are actually worth selling.

**3.2 Label ads honestly**

Every paid banner carries `Sponsored` in 10px text in the corner, and every boosted listing (R9, §2.4) carries `Promoted`. This is both a consumer-protection norm (FTC-style disclosure) and a trust strategy: your entire proposition is "verified, no middlemen" — undisclosed paid ranking contradicts it.

**3.3 SEO — the only way traffic compounds**

- **Dynamic sitemap** (`/sitemap-index.xml`): all approved listings + storefronts + category pages. Regenerate on approval/expiry, not per request.
- **Landing pages** `/ng/[state]/[category]` (e.g. `/ng/lagos/electronics`): server-rendered, indexable, with a unique H1 and the real listing count. This is Jiji's actual growth engine — 36 states × 8 categories = 288 pages of long-tail intent. **Only render pages with ≥3 approved listings**, `noindex` the rest, or you ship 280 thin pages and hurt the whole domain.
- **Structured data:** `Product` + `Offer` (price, currency, availability) on detail pages, `Organization` site-wide, `BreadcrumbList` on category pages. Do not add `AggregateRating` unless real ratings exist.
- **OG images** per listing: a static route rendering `/og/p/[slug].png` (name, price, merchant, first photo). WhatsApp shares are the dominant distribution channel in this market — a link with no preview is a link not clicked.
- **Canonical URLs** on every filtered page, collapsing to the unfiltered category page to avoid duplicate-content dilution.
- **Meta title pattern:** `{Product} — ₦{price} in {City}, {State} | WallX Market`.

**3.4 Performance budget**

Mobile buyers on 3G: LCP < 2.0s, CLS < 0.05, JS payload < 120kB on `/products`. The current page ships several `client:load` Lucide icons individually; switch decorative icons to `client:visible` or plain inline SVG, and keep React only where interactivity is real (`ProductCard` hover is CSS). At thin scale, speed is a bigger conversion lever than any carousel.

**Exit criteria for Phase 3**
- No advertising slot can render empty.
- Every listing has a crawlable page, a sitemap entry, and a working OG preview.
- `/ng/lagos/electronics` ranks or at least indexes with real, non-duplicate content.

---

### Phase 4 — Retention loops (~3–4 dev-days, after the above is live)

These are what make the marketplace a habit rather than a directory.

1. **Saved searches + alerts.** The filter sidebar gets Save / Clear like Jiji's. A saved search is `{ query params, email, businessId?, lastNotifiedAt }`. A daily job emails "3 new listings matching *Leather bags in Lagos*". This is the cheapest re-engagement channel you have and it costs nothing to send.
2. **Recently viewed** — cookie/localStorage, rendered as a rail on the homepage. Zero backend.
3. **Merchant weekly digest** — "Your 3 listings got 214 views and 11 contacts this week. You have 3 of 3 slots used — the 4th is ₦X." The digest is the slot upsell: it arrives when the merchant has evidence the marketplace works, not when they sign up.
4. **Sponsored search** (R7): a merchant can bid a fixed monthly fee to pin a listing to a keyword. Only after search volume data exists.
5. **Professional-services directory** (R10): accountants, CAC agents, tax consultants — a curated, paid directory section. Adjacent to the PayMyTax brand and sellable to the same audience.

---

## 6. Merchant-side economics — why this makes merchants happy

Merchant satisfaction in a classifieds marketplace is not "my product sold". It is **"I can see that being here is doing something."** Three mechanics deliver that:

1. **Per-listing analytics** (views, contacts, ranking position, conversion rate vs category median).
2. **A diagnosis, not a nag** — the listing-strength meter tells a merchant exactly what to fix. "Add 2 photos" is actionable; "upgrade to Pro" is not.
3. **Honest, itemized pricing** — the merchant pays only when they have more to sell than 3 slots, and the locked 4th slot is visible with its price before they pay. A merchant who buys a 4th slot and sees the same contacts per listing as slots 1–3 is satisfied, because they bought capacity, not a miracle. Boost is sold as a separate, clearly-labelled purchase with a stated duration and a stated placement — so the capacity promise and the visibility promise never contaminate each other, and a disappointing boost cannot make the slot fee feel dishonest.

The paid slot must ship with the **measurement product**, in the same release: without view and contact counts the merchant cannot tell whether the 4th slot earned its fee, and the next purchase becomes a guess.

---

## 7. Measurement

**North-star proxy:** confirmed contacts per approved listing per week (you cannot observe GMV — payment is offline).

**North-star business metric, and it is not ad revenue:** marketplace-attributed **merchant account signups**. A buyer who comes to sell must open a WallX merchant account, and that account is worth far more than one slot fee — it is the same object that later buys the ERP subscription (`starter / business / scale`) and every future slot. Today nothing tracks that path: `Register.tsx` has no attribution parameter, so the marketplace's most valuable output is invisible. Add `?src=marketplace&listing={slug}` to every merchant CTA and persist it on the `User` row at signup. This is a Phase 0 item, not a later optimisation.

| Layer | Metric | Target after Phase 3 |
|---|---|---|
| Traffic | Weekly sessions, organic share | Organic ≥ 30% |
| Discovery | Search → detail CTR; filter usage rate | ≥ 25% of sessions use a filter |
| Listing | Detail → contact rate | ≥ 8% |
| Supply | % approved listings with ≥2 images; median listing strength | ≥ 80% / ≥ 70 |
| Merchant | % merchants opening analytics weekly | ≥ 40% |
| Monetization — slots | Paid-slot conversion (% of businesses at the 3-slot cap that buy a 4th), slot revenue, ERP subscription conversion | ≥ 15% of capped businesses buy within 90 days |
| Monetization — boost | Boost attach rate (% of merchants with ≥1 approved listing who buy a boost), boosts per merchant, boost revenue, and **delivered page-1 impressions per boost** (the refund defence) | Attach ≥ 8%; ≥ 60% of boosted listings report a lift in views vs. their own pre-boost baseline |
| Ads | Slot fill rate, CTR | 100% fill (house counts), CTR ≥ 0.8% |

Instrument the funnel once, in `MarketplaceListingEvent`, and derive everything from it. Do not add a separate analytics SDK.

---

## 8. Guardrails (things that will bite later if ignored)

| Risk | Mitigation |
|---|---|
| Paid slot bypasses moderation | A slot raises the *count*, never the status — every product still goes through `pending_approval` → admin approval |
| Boost bypasses moderation | Same rule, separately enforced: `POST /boost` rejects anything not already `approved` and in stock, so boost can only ever amplify a listing that passed the human gate |
| Slot purchase silently unlocks boost (or vice versa) | Two independent entitlement checks. `marketplaceSlotAllowance` governs *how many* listings exist; `MarketplaceBoost` governs *where one of them ranks*. Neither reads the other, and no code path should infer one from the other |
| Boost oversold in a category | Page-one cap of 3 boosted listings; a 4th purchase in a full category joins a waitlist and starts when a slot frees, with the start date stated at purchase. Never take money for a position that will not render |
| Boost sold where page one is the whole category | Allowed, but disclose at purchase ("this category has 9 listings — page one already shows all of them"). Boosting still helps ordering; hiding the fact is what produces refunds |
| Boost under-delivers (traffic dips mid-boost) | Record delivered page-1 impressions per boost; offer extension-in-kind, not cash, and only against the recorded impression count. This is the entire refund argument, so log it from day one |
| Boost stacks with the merchant's own slot refund | Independent — a refunded slot does not cancel an active boost, and a refunded boost does not decrement the allowance |
| Bait-and-switch after paying | Editing `price`/`images`/`name` on an approved listing reverts it to `pending_approval` (the existing spec rule); the slot stays consumed, so the merchant cannot use the edit to park a product off-market |
| Race on slot purchase | Wallet debit + allowance increment in one `$transaction`; unique `walletTxRef`; idempotency key on the request |
| Refund leaves allowance inflated | Refund decrements the allowance; if that would drop it below the number of live products, block the refund until the merchant archives the excess |
| Merchant buys a slot, then deletes the product | Slot returns to the pool by design — document it, and do not refund. This is the reason slots are capacity, not per-product |
| Wallet goes negative | Debit guarded by `balance >= amount` in the same transaction; never a read-then-write across awaits |
| View-count inflation | Dedupe by `sessionHash` per product per day; ignore bot UAs; never expose a raw counter without saying "views" not "buyers" |
| Scraping | Contacts only on detail (fixed in Phase 0); rate-limit the feed; consider signed image URLs later |
| NDPR | No PII in events; salted hashes; retention 180 days then aggregate |
| Tax on slot revenue | Route through the existing wallet ledger so it appears in the same reconciliation the finance team already does |

---

## 9. Traffic gate — when outside advertising becomes a real business

Do not sell banner inventory to third parties before these hold. Below them, the honest answer is "we cannot deliver the impressions you're paying for", and a single refunded advertiser is worth more damage than the revenue.

- **≥ 150 approved listings** across ≥ 6 categories
- **≥ 3,000 weekly sessions** sustained 4 consecutive weeks
- **≥ 1.5 min** median session, **≥ 35%** returning visitors
- Search working, filters working, product pages fresh

Until then: house ads only. The revenue lines that do not need this gate are **paid listing slots** and the ERP subscription — neither needs traffic to be defensible. **Boost is the one merchant SKU that does depend on traffic**: it can ship in Phase 2 because its delivery guard is per-category rather than site-wide (page one caps at 3 boosted posts, and a category that fits entirely on page one is disclosed at purchase), but if weekly sessions stay negligible, boost is a product with almost no inventory to sell and should be flagged rather than discounted.

---

## 10. Explicitly rejected (and why)

- **Marketplace commission / escrow.** Not because it "double-taxes" — the 7.5% is a profit tax, a different instrument entirely. The real reasons: it contradicts the site's own headline ("No middleman markup", "0% platform commission", `index.astro:32,355`); it requires holding buyer funds, which means escrow, refunds, chargebacks and a dispute process you have not built; and it converts every transaction failure into a support ticket against WallX rather than a conversation between buyer and seller.
- **Third-party ad network (AdSense).** At your traffic it pays pennies, and it sells your buyers' attention to a stranger before you've sold them your own merchants' products. It also makes the "verified directory" look like a content farm.
- **Auction-based ad platform / bidding UI.** Build the flat-price product first. Bidding is an optimisation for when you have more demand than inventory; you have the opposite.
- **Unlimited listing slots for everyone.** The 3-slot cap is the product. Remove it and the only thing left to sell is attention you don't have yet.
- **Bundling the marketplace fee into the ERP subscription price.** They are deliberately separate purchases on separate rails. Merging them would make the subscription look expensive and hide the marketplace's own revenue, and a merchant who only wants to list would be forced to buy tax software.
- **Copying Jiji's unlabelled paid placement.** Do not. Boost ships (R9, §2.4) and every boosted listing carries a visible `Promoted` label. The rejection is of the *concealment*, not of the product.
- **Bundling boost into the slot price.** No "buy a slot, get a boost" package. Compartmentalization is the point: it keeps two promises separable, two refund policies separable, and lets either be repriced or withdrawn without renegotiating the other.

---

## 11. Sequencing summary

```
Phase 0  SSR + cache + event tracking + link fixes        → nothing sells until this is done
Phase 1  Real search/filter/sort/facets, storefront,
         contact-on-card, listing lifecycle/quality       → conversion
Phase 2  Two independent SKUs:
         2a paid listing slots (allowance, wallet + proof),
            locked-slot upsell, merchant analytics, admin
         2b boost (page-1 placement, 3-per-page cap,
            Promoted label, per-duration pricing,
            delivered-impression logging)                → revenue; slots need no traffic,
                                                           boost needs page one to exist
Phase 3  Ad slots (house-first), SEO landing pages,
         sitemap/OG/JSON-LD, perf budget                  → compounding traffic
Phase 4  Saved searches, digests, sponsored search,
         services directory                               → retention + new inventory
```

Each phase is independently shippable and measurable. Ship Phase 0 and Phase 1 before quoting a slot price to a single merchant — the first merchant who pays for a 4th slot and cannot see whether it did anything is the one who writes the review.

---

## 12. Open decisions for the user

1. **Slot price and shape**: one-off per listing (recommended — matches "a fee per new product") vs. monthly per active listing. Also: the actual ₦ number, and whether 1 / 5 / 10-slot bundles exist at launch.
2. **Seed period**: grant +3 free slots for 90 days (recommended, so the catalogue becomes searchable) vs. charge from day one.
3. **Listing expiry**: 90 days (recommended, Jiji-like) vs. never. Expiry creates freshness and a renewal habit; it also creates support load.
4. **Storefront URL shape**: `/s/{businessSlug}` (recommended, SEO-friendly) vs. `/s/{merchantId}`.
5. **Banner sales motion**: direct-sold only, or reserve homepage hero for house ads permanently (recommended until the gate in §9).
6. **Boost pricing**: the three durations in §2.4 (7 / 14 / 30 days) are the shape; the ₦ numbers are still placeholders. Decide the price per duration, and whether a boost goes live in the same release as slots or one release later. Recommended: same phase, separate release flag, so either can be withdrawn without a rollback.
7. **Boost cap per page**: 3 boosted listings on page one (recommended — enough to sell, few enough that the page still reads as a marketplace) vs. a different ceiling. This is the number that decides both how much boost inventory exists per category and how much the page degrades once it sells out.
