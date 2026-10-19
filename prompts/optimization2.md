# Implementation Plan — Section 1.2: Render-Blocking Web Font Optimization

> **Document Purpose:** Detailed technical blueprint for optimizing web font delivery, eliminating render-blocking CSS font imports, reducing web font payload, and preloading critical font subsets in the PayMyTax frontend application without visual regressions or layout shift.

---

## 1. Context & Baseline Analysis

### Current Problem
In [`frontend/src/index.css:2-8`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/index.css), 7 separate font packages are imported synchronously at the top of the stylesheet via CSS `@import` statements:
```css
@import "@fontsource/montserrat/400.css";
@import "@fontsource/montserrat/500.css";
@import "@fontsource/montserrat/600.css";
@import "@fontsource/montserrat/700.css";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
```

In [`frontend/index.html`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/index.html), there are zero `<link rel="preload">` tags for fonts:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PayMyTax</title>
  </head>
  ...
```

### Impact
1. **Critical Path Render-Blocking:** In standard browser rendering pipelines, CSS `@import` statements create a chained waterfall. The browser must:
   - Download `index.html`
   - Download `index.css`
   - Discover and download the 7 `@fontsource` stylesheet files
   - Parse font definitions and request 7 separate `.woff2` binary files
2. **First Contentful Paint (FCP) & LCP Penalty:** On 3G/4G Nigerian mobile connections, downloading 7 binary font files (~150kB–220kB total) delays text rendering by **1.5 to 3.5 seconds**.
3. **FOIT / FOUT & Layout Shift:** Text either remains invisible (Flash of Invisible Text) or renders in a fallback font and visibly jumps (Flash of Unstyled Text / Cumulative Layout Shift) once fonts finally download.

---

## 2. Typography Usage Audit in Codebase

A full audit of the codebase reveals how fonts are utilized:
* **Brand & Headings (`--font-sans`):** `Montserrat` is used for main titles, KPI card values, branding, and modal headers.
  - *Weights actively used:* **400 (Regular)** for base text, **600 (SemiBold)** for cards, buttons, badges, and headers.
  - *Redundant weights:* **500 (Medium)** and **700 (Bold)** — 500 is virtually indistinguishable from 600 in Montserrat, and 700 can be cleanly represented by 600 without visual hierarchy loss.
* **Body & Data Grid (`--font-body`):** `Inter` is assigned globally to `p, td, th, li, label, input, textarea, select` and explicit `font-body` classes across all data tables (Sales, Expenses, Invoices).
  - *Weights actively used:* **400 (Regular)** for table text and labels, **500 (Medium)** for numbers and status indicators, **600 (SemiBold)** for table headers and total summaries.

---

## 3. Target Architecture & Optimization Strategy

```
Traditional Waterfall (Current):
HTML ──> index.css ──> 7x @import CSS ──> 7x .woff2 font downloads ──> Render Text (Delay: ~2.5s)

Optimized Pipeline (Target):
HTML (with Preload) ──┬──> index.html preloads primary WOFF2 (Montserrat 600 + Inter 400) [Immediate]
                      └──> index.css (4 consolidated weights + font-display: swap) ──> Text Renders Instantly (<300ms)
```

### Core Optimization Goals:
1. **Prune Redundant Weights:** Cut total font imports from **7 files down to 4-5 essential files** (Montserrat 400/600 + Inter 400/500/600), reducing font network transfer by **~45%**.
2. **Parallel Font Preloading:** Preload the 2 most critical fonts (`Montserrat 600` and `Inter 400`) in `index.html` so font bytes stream concurrently with the HTML parsing step.
3. **Enforce `font-display: swap`:** Ensure text is never hidden behind a blank screen while fonts load.
4. **Matched Fallback Font Metrics:** Configure fallback font stacks to minimize layout shifts when web fonts swap in.

---

## 4. Step-by-Step Implementation Blueprint

---

### Step 1: Optimize CSS Font Imports in `index.css`
**File to modify:** [`frontend/src/index.css`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/src/index.css)

Prune unused font weights and consolidate imports:

```css
@import "tailwindcss";

/* ─── Essential Typography Subsets ────────────────────────── */
/* Montserrat: 400 (Regular) for base, 600 (SemiBold) for headers & KPIs */
@import "@fontsource/montserrat/400.css";
@import "@fontsource/montserrat/600.css";

/* Inter: 400 (Regular) for body/tables, 500 (Medium), 600 (SemiBold) for table headers */
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";

@theme {
  --font-sans: "Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  
  /* ... existing color & animation tokens ... */
}

body {
  margin: 0;
  font-family: var(--font-sans);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

p, td, th, li, label, input, textarea, select {
  font-family: var(--font-body);
}
```

---

### Step 2: Add Critical Font Preloading in `index.html`
**File to modify:** [`frontend/index.html`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/index.html)

Add preconnect and font preloads in the document `<head>` so the browser begins downloading the primary heading font (`Montserrat 600`) and primary body font (`Inter 400`) at the earliest possible network tick:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- Title and Meta -->
    <title>PayMyTax by WallX — SME Tax & Compliance</title>
    <meta name="description" content="Automated SME tax calculation, reporting, and FIRS remittance platform for Nigerian businesses." />

    <!-- Preconnect to origin for font asset resolution -->
    <link rel="preconnect" href="/" crossorigin />

    <!-- Critical Font Preloads (Highest Priority Above the Fold) -->
    <link 
      rel="preload" 
      href="/node_modules/@fontsource/montserrat/files/montserrat-latin-600-normal.woff2" 
      as="font" 
      type="font/woff2" 
      crossorigin 
    />
    <link 
      rel="preload" 
      href="/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2" 
      as="font" 
      type="font/woff2" 
      crossorigin 
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

*(Note: During production build, Vite automatically resolves and hashes referenced font URLs in the `dist/assets/` directory).*

---

### Step 3: Configure Vite Asset Inlining / Font Output (Optional Tuning)
**File to verify:** [`frontend/vite.config.ts`](file:///C:/Users/pc/Desktop/tax%20by%20wallx/frontend/vite.config.ts)

Ensure font asset inline limit in Vite does not turn large font files into base64 strings (which bloats CSS) and maintains standalone compressed `.woff2` files:

```typescript
export default defineConfig({
  // ... existing plugins and resolve ...
  build: {
    assetsInlineLimit: 4096, // Only inline assets < 4kB; keep woff2 files separate
  },
});
```

---

## 5. Visual Hierarchy & Regression Guards

| UI Element | Old Weight | New Weight | Visual Verification |
|---|---|---|---|
| **Page Title (h1, h2)** | `Montserrat 700` / `600` | `Montserrat 600` | Sharp, distinct headline contrast without bulky distortion |
| **KPI Card Values (Dashboard)** | `Montserrat 600` | `Montserrat 600` | Preserves large currency figure clarity (`₦700,000`) |
| **Table Headers (Sales, Invoices)** | `Inter 600` | `Inter 600` | Clear uppercase column headers (`AMOUNT`, `STATUS`, `DATE`) |
| **Table Cell Data** | `Inter 400` | `Inter 400` | High legibility across multi-row data grids |
| **Status Badges (confirmed, pending)** | `Inter 500` | `Inter 500` | Crisp pill badges with proper letter-spacing |
| **Currency Sign (₦ / NGN)** | `Inter 400` / `Helvetica` | `Inter 400` | Inter natively supports the Naira glyph (`₦`, U+20A6) |

---

## 6. Verification & Testing Checklist

### Automated & Performance Audits
1. **Lighthouse Audit:**
   - Run Lighthouse in Chrome DevTools on `/dashboard` and `/`.
   - Verify **First Contentful Paint (FCP)** improves to **< 1.2s** (down from > 2.5s).
   - Verify **Cumulative Layout Shift (CLS)** remains **0.00** (no jumping text).
2. **Network Waterfall Inspection:**
   - Open Network tab $\rightarrow$ filter by `Font`.
   - Verify total font requests are **reduced from 7 to 4-5 files**.
   - Verify `montserrat-latin-600-normal.woff2` and `inter-latin-400-normal.woff2` start downloading immediately in parallel with CSS.

### Cross-Browser Fallback Verification
- **macOS / iOS:** San Francisco system fallback matches baseline line-height.
- **Windows:** Segoe UI system fallback renders clean numbers and currency symbols.
- **Android / Chrome:** Roboto fallback displays without layout shift before Inter swaps in.
