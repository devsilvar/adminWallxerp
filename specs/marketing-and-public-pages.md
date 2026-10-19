# Feature Specification: Marketing Site & Public Presentation

## 1. Objective & User Stories
Provide a high-performance, modular marketing site that educates Nigerian business owners on statutory tax compliance and bookkeeping, converts prospective SMEs into registered accounts, and preserves approved signature UI designs.

**User Stories:**
- As a prospective business owner, I want to learn what PayMyTax does and how it automates FIRS compliance in under 2 minutes.
- As an entrepreneur, I want to explore pricing tiers (Free, Starter, Business, Scale) and compare features before registering.
- As a business operator, I want easy access to support channels (WhatsApp, email, FAQ) to resolve questions before signing up.

---

## 2. Page Hierarchy & Route Architecture

All public routes are lazily loaded and wrapped inside `MarketingLayout`:

```
┌────────────────────────────────────────────────────────┐
│                   MarketingLayout                      │
│  - Sticky Nav (desktop links, mobile drawer, auth CTA) │
│  - Instant ScrollToTop on route transition             │
│  - Dark Footer with company links & Lagos legal note   │
└───────────────────────────┬────────────────────────────┘
                            │
       ┌────────────────────┼───────────────────┬───────────────────┐
       ▼                    ▼                   ▼                   ▼
  Home (`/`)        About (`/about`)    Pricing (`/pricing`) Contact (`/contact`)
```

### 2.1. Home (`/`)
- **Restored Hero Section (Design Freeze)**:
  - Trust badge with Nigerian business owner avatars (`Trusted by 2,500+ businesses`).
  - Gradient title: `"The Toolkit for African Business Owners"` with animated gradient text and dual purple SVG underline.
  - Subheadline copy: *"Track You Sales, Expenses,Business Profit and Loss, Tax Management, Debtor Management, A.I Powered Virtual CFO and other Business Management tools"*.
  - Pill CTAs with sheen (*Start Free Today* / *View Tax Reports*).
  - Trust indicator badges (*7.5% Tax Rate Calculator*, *Auto-Generate Reports*, *Audit-Ready Records*, *Instant PDF Downloads*).
  - Interactive 3D `HeroDashboardPreview` with mouse-tracking tilt, specular reflection flare, FIRS Engine Active pill, auto-calc badge, and live revenue wave chart.
- **Stat Strip**: Highlights key SME metrics (7.5% NRS rate, 100% compliance, <2min setup, ₦0 free tier).
- **Core Features**: 6 visual cards detailing automated tax, DVA auto-capture, smart invoicing, debtor management, central wallet, and team roles.
- **How It Works**: 3 visual steps (Record sales, Log expenses, Automate tax).
- **Restored Masonry Showcase Gallery (Design Freeze)**:
  - Header: `"Trusted by growing businesses"`.
  - 6 masonry cards with WebP responsive pictures, gradient overlays, hover chevrons, and corner accents.
- **Final CTA Band**: High-converting full-width banner.

### 2.2. About (`/about`)
- Editorial story on Nigerian SME tax friction and WallX mission.
- Core principles (Radical Transparency, Statutory Compliance, Merchant-First).
- Security & trust infrastructure breakdown.
- Verified customer testimonials.

### 2.3. Pricing (`/pricing`)
- 4 Tiers: Free (₦0), Starter (₦5,000/mo), Business (₦15,000/mo), Scale (₦35,000/mo).
- Monthly vs Annual billing toggle (20% discount on annual).
- Feature comparison matrix across 25+ attributes.
- Pricing FAQs.

### 2.4. Contact (`/contact`)
- Support channels: Email, WhatsApp, and in-app ticket system with SLA response times.
- Interactive contact inquiry form with Zod/regex validation.
- 15-item categorized FAQ accordion with instant client-side expansion.

---

## 3. Performance & Asset Optimization Invariants
- All photos must provide WebP picture sources (`-sm.webp`, `-md.webp`, `-lg.webp`) with fallback JPEGs.
- Images above the fold use `loading="eager"`; below the fold images use `loading="lazy"`.
- Intersection observer animations (`ScrollReveal`, `StaggerReveal`) use a shared observer pool (`getSharedObserver`) to minimize DOM overhead.

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] Production build passes with exit code 0 and bundles split cleanly under 300kB per vendor chunk.
- [ ] Hero heading typography, SVG underlines, and 3D tilt work seamlessly across mobile and desktop.
- [ ] Masonry gallery renders all 6 cards with responsive WebP pictures without layout shift.
- [ ] Contact form validates inputs and displays success toast.
