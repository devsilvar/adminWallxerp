# Marketing Site Split — UI Implementation Plan

**Goal:** Split the monolithic `Landing.tsx` (2,387 lines, 11 sections, one lazy chunk) into four
focused pages — **Home / About / Pricing / Contact** — that are faster to load, lighter to scroll,
and visibly *not* template/AI-generated. Format follows the `implementplancode.md` work-item spec.

---

## 0. Design Direction (the eye — this is what keeps it from looking AI-generated)

The current page has the classic AI tell: **gradient-text on every heading**
(`from-primary-600 via-purple-500 to-fuchsia-500 bg-clip-text`), **ambient glow blobs**
(`blur-3xl` color orbs), a **275-line interactive 3D SVG dashboard mockup**, and scroll-reveal on
*everything*. That combination reads as "generated," not "designed." The redesign pulls all of it back.

### Do
- **One accent, used sparingly.** `primary-600` is the brand — reserve it for CTAs, links, the logo,
  and *at most one* highlighted word per page. Everything else is near-black (`gray-900`) + gray scale.
- **Solid headings.** Dark text, tight tracking (`tracking-tight`), a real type scale via `clamp()`.
  No gradient fills on type.
- **Clean section backgrounds** — alternate `white` / `gray-50`. No orbs, no blurred color washes.
- **Editorial, asymmetric layout.** Left-aligned hero (not centered-everything), alternating
  image/text feature rows, and a **real pricing table** — tables read as "actual product," marketing
  fluff does not.
- **Real product screenshots**, not abstract shapes. One crisp dashboard screenshot in a minimal
  browser-chrome frame beats any SVG chart you draw by hand. This is the single biggest
  credibility + speed win.
- **Specific, Nigerian copy.** NRS, 7.5%, Paystack, DVA, Lagos, ₦. Specificity is the antidote to
  generic AI prose. Keep the voice already in `faqs`/`testimonials` — it's good — just don't let it
  balloon.
- **Motion that earns its place.** Fade-up once on section entry, then stop. Prefer CSS
  (`animation-timeline: view()` where supported) over JS observers; keep the JS observer only as fallback.

### Don't
- No gradient-text headings, no `blur-3xl` glow blobs, no per-element scroll animation.
- No 3D floating-dashboard SVG animation (replace with a static screenshot).
- No more than 3 star-ratings on any page; no "Trusted by 100+ businesses" repeated in 3 places.

---

## 1. Section → Page Map

Current `Landing.tsx` sections (in file order) mapped to their destination:

| # | Current section (Landing.tsx) | ~Lines | Destination | Notes |
|---|---|---|---|---|
| 1 | Navigation (fixed header) | 713–799 | **Shared shell** (`MarketingLayout`) | Becomes route-aware: Home/About/Pricing/Contact links + Sign in/Get Started |
| 2 | Hero + interactive 3D mockup | 421–664, 800–989 | **Home** | Drop the 3D mockup → one static screenshot in a browser frame |
| 3 | Making Tax Compliance Effortless (stats + visual) | 990–1295 | **Home** (thin stat strip) + **About** (full) | Home keeps 3–4 stats inline; the full block goes to About |
| 4 | Features (`#features`) | 1296–1714 | **Home** (top 4–6 only) + **About** (rest) | Home shows the headline features; long tail moves to About |
| 5 | Why Businesses Trust Us | 1715–1856 | **About** | Trust/compliance story belongs on About |
| 6 | How It Works (`#how-it-works`) | 1857–1972 | **Home** | Keep — it's the "effortless" proof. Trim to 3–4 steps |
| 7 | Showcase Gallery | 1973–2106 | **About** | Security & Trust etc. → About |
| 8 | Testimonials (`#testimonials`) | 2107–2198 | **Home** (2 cards) + **About** (full) | Home keeps a short social-proof strip |
| 9 | FAQ (`#faq`, 15 items) | 2199, 358–420 | **Contact** (all 15) + **Pricing** (pricing subset) | Accordion reused on both |
| 10 | Final CTA | 2202–2265 | **All four pages** (shared component) | Same CTA block, page-appropriate headline |
| 11 | Footer | 2266–2387 | **Shared shell** (`MarketingLayout`) | Footer nav gains About/Pricing/Contact links |

**Data blobs to extract:** `testimonials` (3), `faqs` (15), `trustIndicators` → `src/data/marketing.ts`.

**New content to author:** Pricing plans (from `subtext.md`), About mission/story, Contact form + channels.

---

## 2. Target File Structure

```
frontend/src/
  components/marketing/
    MarketingLayout.tsx      # Nav + <Outlet/> + FinalCTA slot + Footer
    Nav.tsx                  # extracted from Landing.tsx:713–799
    Footer.tsx               # extracted from Landing.tsx:2266–2387
    Section.tsx              # eyebrow + title + subtitle header primitive (kills repetition)
    FinalCta.tsx             # shared CTA band (item 10)
    anim.tsx                 # ScrollReveal, StaggerReveal, useScrollAnimation, shared observer
  data/
    marketing.ts             # testimonials, faqs, trustIndicators, plans, features, steps, channels
  pages/marketing/
    Home.tsx                 # Hero, stat strip, features(top), HowItWorks, 2 testimonials, FinalCta
    About.tsx                # Mission, stats+visual(full), WhyTrust, Showcase, full Testimonials
    Pricing.tsx              # Plan table, toggle, comparison matrix, pricing FAQ subset, CTA
    Contact.tsx              # Form, support channels, full FAQ, office/hours, response promise
```

Routes in `App.tsx` (all lazy, wrapped in `MarketingLayout`):

```tsx
<Route element={<MarketingLayout />}>
  <Route path='/' element={<Home />} />
  <Route path='/about' element={<About />} />
  <Route path='/pricing' element={<Pricing />} />
  <Route path='/contact' element={<Contact />} />
</Route>
```

---

## 3. Work Items (execution-ready, in order)

---

### MKT-01 · Extract `MarketingLayout` shell (Nav + Footer)

- **Depends on:** None
- **Files touched:** CREATE `components/marketing/MarketingLayout.tsx`, `components/marketing/Nav.tsx`,
  `components/marketing/Footer.tsx` · MODIFY `pages/Landing.tsx` (temporarily import new Nav/Footer)
- **What to do:** Move the fixed header (Landing.tsx:713–799) into `Nav.tsx` and the footer
  (2266–2387) into `Footer.tsx`. `MarketingLayout.tsx` renders `<Nav/>`, `<Outlet/>`, and `<Footer/>`
  with the same `fixed` header + `scroll-mt` behavior. Change the nav link list from anchor
  (`#features`) to real `<Link to>` routes: Home `/`, About `/about`, Pricing `/pricing`,
  Contact `/contact` — keep Sign in / Get Started. Footer nav gains the same four links.
  Move the `isAuthenticated`/`activeBusiness`/`fetchMe` logic from `Landing.tsx:697–709` into `Nav.tsx`.
- **Acceptance criteria:**
  - `/` renders the new Nav and Footer with working route links (anchors for Features/How-It-Works removed from top nav).
  - Header stays `fixed` with `bg-white/80 backdrop-blur-xl`; mobile drawer still opens/closes.
  - Logged-in users still see the Dashboard pill with avatar/business initial.
  - No visual regression vs. current Nav/Footer (side-by-side).
- **Verification:** `npm run build` passes; manual: desktop + mobile nav on `/`, click each nav link
  (routes may 404 until MKT-08 — acceptable; verify the `Link` markup renders).
- **Rollback:** Delete the three new files; revert `Landing.tsx` to inline Nav/Footer.
- **Effort:** M
- **Risk if skipped:** Every page would re-implement Nav/Footer; the split can't stay DRY.

---

### MKT-02 · Extract shared animation primitives + data

- **Depends on:** MKT-01
- **Files touched:** CREATE `components/marketing/anim.tsx`, `data/marketing.ts` · MODIFY `pages/Landing.tsx`
- **What to do:** Move `getSharedObserver`, `useScrollAnimation`, `ScrollReveal`, `StaggerReveal`
  (Landing.tsx:32–150) into `anim.tsx` unchanged. Move `testimonials`, `faqs`, `trustIndicators`
  (261–355) into `data/marketing.ts` as named exports. Landing.tsx imports from both.
- **Acceptance criteria:**
  - Scroll-reveal still works on `/` (sections fade up once on entry).
  - `faqs`/`testimonials` render identically from the new module.
  - No duplicate definitions of the observer/hook remain in `Landing.tsx`.
- **Verification:** `npm run build`; manual scroll of `/` confirms reveal animation + FAQ/testimonials render.
- **Rollback:** Move the code back into `Landing.tsx`; delete the two new files.
- **Effort:** S
- **Risk if skipped:** Four pages can't share motion/data; duplication reintroduces the heaviness.

---

### MKT-03 · Marketing design-token cleanup (kill the AI tells)

- **Depends on:** MKT-02
- **Files touched:** MODIFY `components/marketing/anim.tsx` (nothing) · MODIFY the **new** page files as
  they're built · ADD `components/marketing/Section.tsx`
- **What to do:** Create `Section.tsx` — a header primitive (`eyebrow` + `title` + `subtitle`) that
  renders a **solid** `gray-900` heading (no `bg-clip-text` gradient), an optional single accent word,
  and consistent spacing. Define the rules in one place so all four pages inherit them:
  - headings: `text-gray-900 tracking-tight`, accent word = `text-primary-600` (solid, not gradient)
  - section bg: `bg-white` or `bg-gray-50` only — no `blur-3xl` orbs
  - remove `bg-gradient-to-br from-primary-400/15 ... blur-3xl` glow divs wherever they appear
- **Acceptance criteria:**
  - `Section.tsx` is the only place marketing section headers are defined.
  - No `bg-clip-text text-transparent` gradient headings and no `blur-3xl` glow orbs in any built page.
  - Type scale is `clamp()`-based; headings `tracking-tight`.
- **Verification:** Visual pass on every built page; `grep -r "bg-clip-text\|blur-3xl" src/pages/marketing src/components/marketing` returns nothing.
- **Rollback:** Revert `Section.tsx`; per-page styling is inline and independently revertible.
- **Effort:** S
- **Risk if skipped:** Pages keep the template look regardless of how they're split.

---

### MKT-04 · Build the lightweight Home page

- **Depends on:** MKT-01, MKT-02, MKT-03
- **Files touched:** CREATE `pages/marketing/Home.tsx` · MODIFY `data/marketing.ts` (add `plans`, `features`, `steps`)
- **What to do:** Assemble Home from the shared shell + primitives, ~6 sections only:
  1. **Hero** — left-aligned headline + subline + CTAs (Get Started / See pricing) + **one static
     dashboard screenshot** in a minimal browser-chrome frame. Delete the 3D mockup component
     (421–664). Use an existing `/images-optimized/dashboard-hero-*.webp` (already referenced at 2116).
  2. **Stat strip** — 3–4 numbers inline (from the "Compliance Effortless" stats, 1029–1295).
  3. **Features** — top 4–6 only, alternating image/text rows (from 1296–1714).
  4. **How It Works** — 3–4 steps (from 1857–1972).
  5. **Social proof** — 2 testimonial cards + trust indicators (from 2107–2198 / 351–355).
  6. **FinalCta** (shared component).
  Everything not listed goes to About (MKT-05).
- **Acceptance criteria:**
  - Home has ≤ 6 section blocks and no 3D/interactive SVG mockup.
  - Hero uses a real screenshot; page has no `bg-clip-text` gradients or glow orbs.
  - CTAs: "Get Started" → `/register`, "See pricing" → `/pricing`.
  - Scroll-reveal works; header/footer from shell render correctly.
- **Verification:** `npm run build`; Lighthouse/mobile pass on `/` (target: fewer JS bytes than the
  current Landing chunk — see §4); manual scroll + CTA clicks.
- **Rollback:** Delete `Home.tsx`; route stays on old `Landing.tsx` (kept until MKT-08).
- **Effort:** L
- **Risk if skipped:** Homepage stays the 2,387-line bottleneck.

---

### MKT-05 · Build the About page

- **Depends on:** MKT-01, MKT-02, MKT-03
- **Files touched:** CREATE `pages/marketing/About.tsx` · MODIFY `data/marketing.ts`
- **What to do:** Move the full "Making Tax Compliance Effortless" block (990–1295), "Why Businesses
  Trust Us" (1715–1856), and "Showcase Gallery" (1973–2106) here, restyled per MKT-03 (solid headings,
  no glow). Add a short mission/origin paragraph (Nigerian SME focus, NRS compliance, non-custodial —
  reuse the regulatory strings from `config.regulatory`). Include the **full** testimonials list.
  End with shared `FinalCta`.
- **Acceptance criteria:**
  - About is the only home of the trust/showcase/full-testimonials content.
  - Mission copy is specific (NRS, 7.5%, Paystack, non-custodial) — not generic filler.
  - No gradient headings/glow orbs; scroll-reveal works.
- **Verification:** `npm run build`; manual read-through for voice consistency vs. Home.
- **Rollback:** Delete `About.tsx`.
- **Effort:** M
- **Risk if skipped:** Trust/compliance content has nowhere to live; About is an empty shell.

---

### MKT-06 · Build the Pricing page (new)

- **Depends on:** MKT-01, MKT-02, MKT-03
- **Files touched:** CREATE `pages/marketing/Pricing.tsx` · MODIFY `data/marketing.ts` (add `plans`, `planMatrix`)
- **What to do:** Port the plan table from `subtext.md` into `data/marketing.ts` as typed records
  (Free / Starter ₦5,000 / Business ₦15,000 / Scale ₦35,000, monthly + annual prices, feature ceilings).
  Render: a clean **comparison table** (real `<table>`, not cards), a monthly/annual toggle, the
  "14-day Business trial" callout, a pricing-specific FAQ subset (extract from the 15 `faqs`), and a
  shared `FinalCta` ("Start free trial" → `/register`). Keep `pricing` as the single source so the
  subscription backend can later serve the same data.
- **Acceptance criteria:**
  - Four tiers render in a readable comparison table on desktop and a stacked layout on mobile.
  - Toggle switches monthly/annual prices client-side (no reload).
  - Prices/caps match `subtext.md` exactly.
  - No gradient headings/glow orbs.
- **Verification:** `npm run build`; manual toggle + mobile-width check; values diffed against `subtext.md`.
- **Rollback:** Delete `Pricing.tsx` + the `plans` data entry.
- **Effort:** M
- **Risk if skipped:** The subscription feature (per `subtext.md`) has no landing surface.

---

### MKT-07 · Build the Contact page

- **Depends on:** MKT-01, MKT-02, MKT-03
- **Files touched:** CREATE `pages/marketing/Contact.tsx` · MODIFY `data/marketing.ts` (add `channels`)
- **What to do:** Render: a **contact form** (name, email, business, topic select, message) with inline
  validation; **support channels** (email, WhatsApp `wa.me` deep link, in-app — reuse the copy at
  `faqs` "What kind of support do I get?"); the **full FAQ accordion** (reuse the `FAQSection` from
  358–420, moved to `components/marketing/`); office/location + response-time promise.
  Form submit → `POST /api/v1/contact` **if it exists**; otherwise fall back to a `mailto:`/WhatsApp
  deep link with a success state (frontend must not block on the endpoint — see MKT-07b).
- **Acceptance criteria:**
  - Form validates required fields + email shape client-side before submit.
  - Full 15-item FAQ accordion works (open/close one at a time).
  - WhatsApp deep link opens correctly; channels show email + WhatsApp + in-app.
  - No gradient headings/glow orbs.
- **Verification:** `npm run build`; manual: submit invalid → inline errors; valid → success/redirect;
  accordion toggles; WhatsApp link opens.
- **Rollback:** Delete `Contact.tsx`; FAQ component independently revertible.
- **Effort:** M
- **Risk if skipped:** No support surface; the "support via email/WhatsApp" promise in the FAQ has nowhere to go.

---

### MKT-07b · (Backend, optional) Contact endpoint

- **Depends on:** None (frontend falls back without it)
- **Files touched:** CREATE `routes/` + `controllers/` contact handler · MODIFY `services/email-dispatch.service.ts`
  (add a `contact` template) · ADD a Zod validator
- **What to do:** `POST /api/v1/contact` → validate → dispatch an email via the existing Resend
  pipeline (falls back to Winston logging when `RESEND_API_KEY` is unset). Rate-limit it. On success
  return the standard `{ success, data, message }` envelope. Frontend switches from the mailto/
  WhatsApp fallback to this endpoint when it's live.
- **Acceptance criteria:** Endpoint returns 200 with the standard envelope; email logged/dispatched;
  rate-limited; Zod rejects malformed input with field details.
- **Verification:** `npm run typecheck`; `npm test`; curl a valid + invalid payload.
- **Rollback:** Unmount the route; frontend keeps the mailto fallback.
- **Effort:** S
- **Risk if skipped:** Contact form relies on mailto/WhatsApp only (acceptable for v1).

---

### MKT-08 · Wire routes, retire the old Landing chunk

- **Depends on:** MKT-04, MKT-05, MKT-06, MKT-07
- **Files touched:** MODIFY `App.tsx` · DELETE `pages/Landing.tsx`
- **What to do:** In `App.tsx`, replace `<Route path='/' element={<Landing/>} />` with the
  `MarketingLayout` route group + four lazy children (per §2). Remove the `Landing` lazy import.
  After all content has been ported and verified, delete `pages/Landing.tsx`.
- **Acceptance criteria:**
  - `/`, `/about`, `/pricing`, `/contact` all render inside the shared shell, each `React.lazy`.
  - `/` no longer serves the old monolith; the four marketing routes are the only public pages.
  - No dangling imports of `Landing.tsx`.
- **Verification:** `npm run build` + `npm test`; manual walk of all four routes + a logged-in and
  logged-out nav; check `/login`, `/register`, `/invite`, `*` (NotFound) still resolve.
- **Rollback:** Revert `App.tsx` to `<Route path='/' element={<Landing/>} />` and restore `Landing.tsx`
  from git (it's the safety net until this item lands).
- **Effort:** S
- **Risk if skipped:** Two competing homepages ship; nav links dangle.

---

### MKT-09 · Performance + image pass

- **Depends on:** MKT-08
- **Files touched:** MODIFY `pages/marketing/*` · ADD optimized WebP screenshots under `public/images-optimized/`
- **What to do:** Confirm every marketing route is lazy + code-split (verify the built chunk sizes).
  Replace any hand-drawn SVG charts with real screenshots exported at 640/768/1024w (mirror the
  existing `dashboard-hero` pattern at 2113–2125, `loading='lazy'`, explicit `sizes`). Ensure the hero
  image is `fetchPriority='high'` + preloaded; everything below the fold is `loading='lazy'`. Trim any
  remaining per-element animation to one-shot section reveals.
- **Acceptance criteria:**
  - Each marketing route's JS chunk is meaningfully smaller than the old Landing chunk (record before/after).
  - No CLS from images (explicit dimensions); hero image is high-priority, the rest lazy.
  - No animation runs continuously while a section is idle.
- **Verification:** `npm run build` → inspect `dist/assets` chunk sizes; Lighthouse mobile on all four
  routes; manual: scroll performance on a mid-range phone.
- **Rollback:** Per-image / per-page reverts; screenshots are additive.
- **Effort:** M
- **Risk if skipped:** The split ships but pages still feel heavy — the original complaint persists.

---

### MKT-10 · Cross-links + SEO polish

- **Depends on:** MKT-08
- **Files touched:** MODIFY `pages/marketing/*`, `components/marketing/Nav.tsx`, `Footer.tsx`
- **What to do:** Add per-page `<title>` + meta description (a small `useDocumentTitle` hook). Add
  contextual cross-links: Home → Pricing ("See pricing"), Home → Contact, Pricing → Contact
  ("Questions?"), About → Contact. Footer lists all four pages. Add a `/pricing` and `/contact` entry
  to the mobile drawer (currently anchor-only). Ensure `scroll-mt` offsets match the fixed header.
- **Acceptance criteria:**
  - Each page sets a distinct title/description on mount.
  - All four pages are reachable from every page (nav + footer) on desktop and mobile.
  - In-page anchor offsets clear the fixed header (no hidden headings under the nav).
- **Verification:** Manual nav sweep on desktop + mobile drawer; check `document.title` per route.
- **Rollback:** Independent per-link / per-hook reverts.
- **Effort:** S
- **Risk if skipped:** Pages are isolated islands; users can't move between them — the split hurts UX.

---

## 4. Speed Targets

| Metric | Current (Landing.tsx) | Target |
|---|---|---|
| Public home JS | one ~2,387-line chunk, 11 sections, 275-line interactive SVG | ≤ 6 sections, no interactive mockup — **smaller chunk per route** |
| Motion | JS observer + reveal on every element + ambient blurs | one-shot section reveals; CSS-first where supported |
| Public pages | 1 route | 4 routes, each lazy + independently cached |
| Images | SVG-drawn charts + one WebP hero | real optimized WebP (640/768/1024w), hero high-priority, rest lazy |

---

## 5. Sequencing summary (top to bottom)

1. MKT-01 → shell
2. MKT-02 → shared anim + data
3. MKT-03 → design-token cleanup (`Section.tsx`)
4. MKT-04 → Home
5. MKT-05 → About
6. MKT-06 → Pricing
7. MKT-07 → Contact (+ MKT-07b backend, optional, parallel)
8. MKT-08 → wire routes, delete old `Landing.tsx`
9. MKT-09 → performance + images
10. MKT-10 → cross-links + SEO

`pages/Landing.tsx` is the rollback safety net until **MKT-08** — keep it until then.

---

## 6. Open Questions (flag before starting, don't guess)

1. **Product screenshot source** — is there a real, current dashboard screenshot to use for the Home
   hero, or should I capture/curate one? (Blocks the "real > abstract" hero direction.)
2. **Contact form backend** — ship v1 on the mailto/WhatsApp fallback (MKT-07) and add `POST /api/v1/contact`
   (MKT-07b) right after, or block the form on the endpoint?
3. **Pricing data source** — hardcode the four tiers from `subtext.md` for now (recommended), or wire
   the page to a platform-config endpoint now? (Recommendation: hardcode; the subscription backend
   isn't built yet.)
4. **Testimonials/FAQ truth** — the current copy names specific people/companies ("Adebayo Ogunlesi,
   Greenfield Ventures"). Are these real, or placeholders to replace before public launch?
