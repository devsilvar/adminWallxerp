# Multi-Currency Display Switcher — Re-Reviewed & Phased Implementation Plan

**Version:** 4 (third re-review pass)
**Reviewed against:** repository state at 2026-11-02
**Supersedes:** `prompts/currency-switcher-plan.md` (2026-10-31), versions 2 and 3 of this file
**Base ledger currency:** NGN (unchanged, forever)
**Display currencies:** NGN, USD, GBP, EUR, CAD
**Estimated effort:** ~3 focused days

> **V4 headline correction.** Version 3 claimed that one `useCurrencyStore` subscription in
> `AppLayout` would re-render the routed page subtree, which is what made a 317-call-site
> formatter change possible with zero per-page edits. **That is false.** React bails out of
> re-rendering a child whose element object is unchanged, and React Router hands the layout a
> memoised outlet element. Measured twice (bare tree, then the real `createMemoryRouter` +
> `Outlet`): the page renders once and never again on a currency change. See §15.C for the
> reproduction. The mechanism is replaced with a per-component subscription in §6.C and
> Step F4.0; read that before anything else.

---

# 0. HOW TO USE THIS DOCUMENT

Read sections 1–7 once so you understand *why*. Then implement section 8 **in order, top to bottom**. Do not skip ahead. Do not reorder.

Every step has four parts:

- **Do** — the literal action
- **Code** — paste it (where the shape matters)
- **Check** — the command and the exact output that means you're done
- **Do not** — the mistake we already know will happen if nobody warns you

If a step's **Check** does not pass, stop. Do not continue to the next step and "come back to it". Every later step assumes the earlier ones are green.

**Ground rules for the implementer**

1. `frontend/` is a **git submodule**. Backend and frontend are **two separate commits** in two repos. See Step P0.4.
2. There is **no database work** in this plan. If you find yourself writing a Prisma migration, you have misread it.
3. Money is **always** Naira in the database. The switcher changes **presentation only** (§6.F).
4. When in doubt, do less. Section 12 lists everything you are forbidden to build.
5. **Reactivity is per component.** Every component that formats money calls
   `useDisplayCurrency()`. There is no top-level subscription that covers the app; v3 thought
   there was and was wrong (§15.C).

---

# 1. EXECUTIVE VERDICT

🟢 **APPROVED AFTER CORRECTION — the architecture was fixed, not re-decorated.**

The product decision is unchanged and correct: **display-only conversion**. The ledger stays
Naira; PDFs, emails, exports, Paystack, wallet and tax filings are untouched.

This pass found one defect serious enough to invalidate the previous version: **v3's reactivity
mechanism does not work.** It assumed a single `AppLayout` subscription would re-render the
routed page subtree. Measured twice — bare tree and real `createMemoryRouter` — the page
renders once and never updates. Had v3 been implemented as written, the switcher would have
changed its own pill and nothing else.

| What was weak | What this version does |
|---|---|
| v3's "one subscription re-renders everything" | **Disproved and replaced** with a per-component `useDisplayCurrency()` subscription + a source-scan test that fails if one is missing (§6.C, §15.C) |
| Provider used `axios`, a devDependency | `fetch` + `AbortController`, matching every other outbound call in `src/` |
| Veil keyed off `loading` | Separate `switching` flag, so the app is not veiled on cold load |
| 4 currencies (EUR silently dropped) | 5, as the brief lists |
| "2 decimals matches the dashboard" | False — it changes ~15 pages; now stated as the visible change it is |
| The UI spec and the micro-step format from v3 | Kept — they were the good half |

Nothing was added to the scope. Two things were **removed** from the *previous* revision of this same document during this pass:

- the optional Settings → Preferences duplication (already gone, now explicitly forbidden);
- the suggestion that an `FxRate` table is a likely next step (it isn't — the upgrade path only matters if you ever need historical rates, and you don't).

---

# 2. WHAT WAS WRONG WITH THE ORIGINAL PLAN

Kept for the audit trail. This is why the implementation looks the way it does.

## 🔴 WRONG

| # | Original claim | Reality (verified in source) |
|---|---|---|
| W1 | Copy `pg_try_advisory_lock` + `finally { pg_advisory_unlock }` from `reminders.cron.ts` | All six jobs (`reminders:81`, `wallet-reconciliation:74`, `settlement-release:51`, `payout-reconciliation:390`, `subscription-expiry:39`, `voucher-cron:62`) use `pg_try_advisory_xact_lock` inside a `$transaction` fence. Moot: this plan has no cron. |
| W2 | Only `947364` is duplicated | Two collisions: `947364` (`settlement-release`, `payout-reconciliation`) **and** `947363` (`voucher-cron`, `wallet-reconciliation`). Moot: no lock key is allocated. |
| W3 | Hard-coded `FALLBACK_NGN_RATES` served with `stale: true` | Fabricated rates are worse than no rates. **Deleted.** No live rate and no cache ⇒ foreign currencies are unavailable and the UI stays in Naira. |
| W4 | "`sanitizeUser()` → include `displayCurrency`" | `auth.service.ts:39` spreads `...rest`; a new column appears automatically. Listed work that does nothing. Moot: no column. |
| W5 | "Zustand + `persist` … following the `language.store.ts` pattern" | `language.store.ts` has no `persist` middleware. This plan uses `persist` explicitly and says so. |
| W6 | "Use the `STALE`/`isFresh` helpers with a 6h TTL" | `STALE.long` is **5 minutes** (`cache.ts:16-21`). This plan uses a local 6h constant. |
| W7 | `CAD` formatted with `en-CA` + `narrowSymbol` | Renders `$`, colliding with USD. **CAD must use `en-US` + `symbol` ⇒ `CA$`.** |
| W8 | Migrate ~84 files to `useMoney()` | Real surface: **44 files reference `formatNaira`, 317 call sites**. Call sites need no signature change, but **~35 components still need one subscription line each** (v3 got this wrong — see §6.C). Zero `React.memo` means a subscribed page refreshes its whole subtree. |
| W9 | `FxRate` table + migration + `User.displayCurrency` + auth changes + daily cron | None are needed for a display toggle. **All removed.** No migration in this plan. |
| W10 | No overlay | The requester asked for it by name. **Added** (§4.4), reusing the existing `RouteTransitionLoader` visual. |
| W11 | Monorepo assumption | `frontend/` is a **submodule** (`git ls-files -s frontend` → `160000`). Two commits. |
| W12 | Marketplace buyer prices in scope | Buyer UI lives in the **untracked** `marketplaceFrontend/`. Seller price fields are **inputs** and stay Naira. |

## 🟠 OUTDATED COUNTS IN THE ORIGINAL

| Original | Measured |
|---|---|
| 630 `₦` across 84 files | **287 `₦` across 66 files** |
| ~20 local helper definitions | **25** |
| "used by ~10 files" | **12** import from `@/lib/format` |
| "five siblings import from `WalletBalanceCard`" | **six** |

## 🟢 KEPT VERBATIM FROM THE ORIGINAL PLAN

- Display-only conversion; no ledger change.
- Conversion happens at **format time**, frontend only.
- Backend owns the rate source; the browser never calls an FX provider.
- The never-convert list (inputs, payment, subscription, PDFs, emails, exports, public pages, tax constants, admin).
- Dropdown interaction contract copied from `UserMenu.tsx` / `NotificationBell.tsx`.
- Invoices convert only when `invoice.currency === 'NGN'`.
- `markInvoicePaid`'s non-NGN booking bug is **out of scope**.

---

# 3. WHAT CHANGED IN THIS REVISION

| Previous | Decision | Now | Reason |
|---|---|---|---|
| Placement described as "top bar, left of the bell" | **Specified** | §4: full wireframe, classes, states, mobiles | The requester asked how it should look |
| Steps grouped in 4 phases | **Re-phased** | §8: 30 micro-steps with checks | Must be followable by a junior |
| Implicit prohibition on dollar entry | **Already explicit** | §6.F invariant + grep gate | Prevents the only data-integrity failure mode |
| `useMoney()` hook | **Still removed** | One subscription + pure formatter | Zero memoisation in the codebase makes it safe |
| Settings preferences block | **Still removed, now forbidden** | §12 | One control; two controls drift |
| Overlay "optional" | **Specified** | Shown only when a network fetch is in flight, 150 ms flicker guard | Requested; must not feel like a stall |
| EUR | **Excluded in v3, restored in v4** | 5 currencies | The brief lists NGN/USD/GBP/EUR/CAD |

---

# 4. THE UI — PLACEMENT, LOOK, BEHAVIOUR

## 4.1 Where it goes

**The top navigation bar** — the persistent header rendered by `AppLayout.tsx`, the same bar that holds the page title, search, `MessageBell`, `NotificationBell` and `UserMenu`. It is visible on `/dashboard` and every other authenticated page.

Position: **between the search affordance and `MessageBell`.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☰   Dashboard                                                [search] [₦ NGN ▾] [🔔] [✉] [👤] │
└──────────────────────────────────────────────────────────────────────────────┘
                                                                   ^^^^^^^^
                                                              CurrencySwitcher
```

Why here and nowhere else:

- It is a **global view setting**, so it belongs with the other global controls, not inside a page.
- It must not go in the sidebar: the sidebar is navigation-only (that move was made deliberately in an earlier refactor), and on mobile the sidebar is a drawer — a currency switch buried in a drawer is not discoverable.
- It must not go on the dashboard page itself: it would have to be re-implemented on every other page, and the two copies would drift.

## 4.2 Closed state (the trigger)

A compact pill: **symbol + code + chevron**. On screens below `sm`, the code hides and only the symbol + chevron remain.

```
Desktop:   ┌───────────┐        Mobile:  ┌────────┐
           │ ₦  NGN ▾  │                 │ ₦  ▾   │
           └───────────┘                 └────────┘
```

- Height `h-9` (36 px) to align with `UserMenu`'s `h-9 w-9` trigger and the top-bar buttons.
- `rounded-full`, `border border-gray-200`, white background, subtle hover.
- Text `text-xs sm:text-sm font-semibold text-gray-700`.
- The currency symbol is rendered as `text-base leading-none` so `₦`, `$`, `£`, `CA$` are optically aligned.

## 4.3 Open state (the panel)

Right-aligned, `w-72`, same card treatment as `UserMenu`: `rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60`.

```
        ┌────────────────────────────────────┐
        │ DISPLAY CURRENCY                   │
        ├────────────────────────────────────┤
        │ (₦)  Nigerian Naira          NGN ✓ │
        │                                    │
        │ ($)  US Dollar               USD   │
        │      1 USD ≈ ₦1,348.83             │
        │                                    │
        │ (£)  British Pound           GBP   │
        │      1 GBP ≈ ₦1,805.75             │
        │                                    │
        │ (€)  Euro                    EUR   │
        │      1 EUR ≈ ₦1,564.10             │
        │                                    │
        │ (CA$) Canadian Dollar        CAD   │
        │      1 CAD ≈ ₦965.52               │
        ├────────────────────────────────────┤
        │ Rates updated 2 Nov 2026           │
        │ Display only — transactions and   │
        │ tax filings stay in Naira (₦)      │
        └────────────────────────────────────┘
```

Row anatomy (each row is a `role="menuitemradio"` button):

- **Left:** a 28 px round chip, `bg-gray-50 ring-1 ring-inset ring-gray-100`, holding the symbol in `text-xs font-bold text-gray-600`.
- **Middle:** name (`text-sm font-semibold text-gray-900`) over the rate (`text-[11px] text-gray-400 mt-0.5`).
- **Right:** the check icon (`Check`, `h-4 w-4 text-primary-600`) on the active row only.
- **Active row:** `bg-primary-50/70`.
- **Hover:** `hover:bg-gray-50`.
- **Naira row:** no rate line (it is the unit of account).
- **Disabled row** (no rate available): `opacity-50 cursor-not-allowed`, and the rate line reads `Rate unavailable`.

Footer strip: `bg-gray-50/80 border-t border-gray-100`, two lines, `text-[11px] leading-relaxed text-gray-500`:

1. `Rates updated 2 Nov 2026` (or `Rates not loaded yet`)
2. `Display only — transactions and tax filings stay in Naira (₦)`

Stale state: when `stale === true`, insert an amber note above the footer — `rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700` reading `Rates may be outdated.`

Unavailable state (no rates at all): foreign rows disabled and the footer's first line becomes `Rates unavailable — showing Naira.`

## 4.4 The overlay

Only shown when selecting a foreign currency requires a network round-trip (cold cache, stale cache, or forced refresh). If the rate is already in the store — the normal case after the first load — the switch is **instant and no overlay appears**. Showing a fake 2-second overlay would be theatre and would make the app feel slower.

When it does appear, reuse the existing visual language from `RouteTransitionLoader.tsx`:

- full-bleed over `<main>`: `absolute inset-0 z-40 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs`
- a `rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl` card
- the same dual-ring spinner
- copy: `Changing currency…`

Flicker guard: wait 150 ms before painting it (same trick as `RouteTransitionLoader:9-15`).

## 4.5 Interaction contract (copy `UserMenu.tsx` exactly)

- `aria-haspopup="menu"`, `aria-expanded={open}`, `aria-label="Change display currency"`.
- `pointerdown` listener on `document`; close when the click is outside both the panel and the trigger.
- `Escape` closes and returns focus to the trigger.
- Clicking a row closes the panel and applies the currency.
- `role="menu"` on the panel, `role="menuitemradio"` + `aria-checked` on rows.

## 4.6 What "converted" looks like elsewhere

Nothing changes visually except the number and its symbol:

| Before | After (USD selected) |
|---|---|
| `₦1,348,830.00` | `$1,000.00` |
| `₦700.0K` (compact) | `$518.9` |
| `Amount (₦)` in an input | `Amount (₦)` — **unchanged** |
| `Entered in Naira (₦) · ≈ $0.07` hint | appears under amount inputs only when a foreign currency is active |

---

# 5. SYSTEM MAP — FACTS THIS PLAN DEPENDS ON

Everything below was read from the repository today, not inherited from the old plan.

| Fact | Evidence |
|---|---|
| 43 files call `formatNaira()`; 317 call sites | measured |
| 25 local `formatNaira` definitions outside `lib/format.ts` | measured, line numbers in Step F4.1 |
| 47 inline `₦${…}` strings across 29 files | measured |
| **Zero** `React.memo`; **zero** money `useMemo` | measured |
| **A layout re-render does NOT re-render the routed page** | measured with `createMemoryRouter` + `Outlet` — `RENDERS 1 1` (§15.C) |
| 44 files reference `formatNaira`; 13 import `@/lib/format` | measured |
| `AppLayout` renders `{children \|\| <Outlet />}` inside `<Suspense>` in `<main className='relative flex-1 overflow-y-auto'>` | `AppLayout.tsx:177-181` |
| Top-bar order today: search · `MessageBell` · `NotificationBell` · `UserMenu` | `AppLayout.tsx:167-169` |
| A dark overlay already exists to copy | `RouteTransitionLoader.tsx` |
| All exports are server-rendered PDF blobs | `ReportExportModal.tsx:90`, `StatementExportModal.tsx:99`, … |
| Backend route convention | `wallet.routes.ts:1-4` — `Router` + `authenticate` from `@/middleware/auth` + `asyncHandler` from `@/middleware/errorHandler` |
| Backend import conventions | `import { config } from '@/config'`; `import logger from '@/lib/logger'` |
| Live provider works | `GET https://open.er-api.com/v6/latest/GBP` → `result: "success"`, rates contain `NGN`, `USD`, `CAD` |
| Real cross-rate | GBP base `NGN 1805.75447`, `USD 1.338857` ⇒ **₦1,348.8 per USD** on 2026-11-02 |
| `frontend/` is a submodule | `git ls-files -s frontend` → `160000` |
| `marketplaceFrontend/` is untracked | `git status` → `?? marketplaceFrontend/` |

---

# 6. ARCHITECTURE

## A. One meaning for a rate

`rates[CODE]` **always** means "how many Naira is one unit of CODE worth".

- `rates.USD ≈ 1348.8`, `rates.GBP ≈ 1805.75`, `rates.CAD ≈ 965.5`, `NGN = 1`.
- Display: `displayed = ngn / rates[CODE]`.
- Derivation from a USD-based provider payload: `rates.NGN / rates[CODE]`.
- Never store or transmit the inverted direction (`0.000741`).

## B. One formatting choke point

Every money string in the app flows through `formatNaira()` in `lib/format.ts`. We make **that
one function** currency-aware by having it read a module-level snapshot in `lib/currency.ts`.
317 call sites keep the same signature — but the *component* around each call needs the
`useDisplayCurrency()` subscription (§6.C), because a function cannot subscribe.

## C. Reactivity — a subscription in every money-rendering component (NOT in `AppLayout`)

Formatting is a plain function, so it cannot subscribe to anything. Something has to re-render
the component that calls it. Version 3 put that subscription in `AppLayout` and assumed the
page subtree would follow. **It does not.** React skips re-rendering a child whose element
object is identical (`oldProps === newProps` ⇒ bailout), and React Router's `<Outlet />`
returns a memoised element. Verified: `RENDERS 1 1` — one render, no update, in both a bare
tree and a real router (§15.C).

The rule that actually works:

> **Every component that calls `formatNaira()` / `formatMoney()` in its render must call
> `useDisplayCurrency()` first.**

```ts
// frontend/src/hooks/useDisplayCurrency.ts
export function useDisplayCurrency(): DisplayCurrency {
  return useCurrencyStore((s) => s.code); // subscription = re-render on switch
}
```

- Calling it for the value or for the side effect both work; a bare `useDisplayCurrency();`
  is a legal hook call and is what most swept files will use.
- Because there is **zero** `React.memo` in the codebase (verified), a page-level
  subscription refreshes that page's whole child tree; child components then receive fresh
  element objects and re-render normally.
- `AppLayout` does **not** subscribe. It only fetches rates and renders the control.
- A file that formats money and forgets the hook will silently keep showing Naira. That is
  the one failure mode of this design, so it is guarded by a source-scan test
  (`src/lib/__tests__/currency-coverage.test.ts`, Step F4.0) rather than by hope.

We still deliberately do **not** use `key={currency}`. Remounting would re-run every page's
fetch and throw away unsaved form state — switching currency mid-form must not wipe the form.

## D. Rates come from the backend

`GET /api/v1/fx/rates` (authenticated) returns cached rates, refreshing on demand when the cache is older than 6 hours. The browser never calls an FX provider: no key exposure, no CORS, no per-user rate limits.

## E. Failure is visible, never invented

Provider down + no cache ⇒ `rates: {}`. Foreign rows disabled. App stays in Naira. Toast explains why. **There is no fallback constant.**

## F. Writes are Naira-only — the single invariant

**There is no "enter an amount in dollars" path.**

> Display is USD. The user types `100` into Add Sale.
> `100` is Naira. It is stored as `100.00` in `sales_transactions.amount`.
> Every surface renders it through the lens: `₦100.00` in NGN mode, `$0.07` in USD mode.
> Switch back: `₦100.00`. The row never changed.

Rules:

1. **No write-side conversion.** `convertFromNgn` / `formatMoney` never appear in an `onSubmit`, a payload builder, or a store action that calls the API.
2. **No currency column** on sales, expenses, payments, wallet or settlement rows.
3. **Inputs keep their `₦` label** regardless of display currency. Never relabel a field to `$`.
4. **Hint, don't convert:** when a foreign currency is active, show `Entered in Naira (₦) · ≈ $0.07` beneath the field. Display-only, never submitted.
5. **Money-moving buttons stay Naira-primary** (payment, withdrawal, subscription).
6. **`Invoice.currency` is the only exception.** It is a document currency. Revenue booked from an invoice must still be Naira — note that `markInvoicePaid` currently books `invoice.total` unconverted (`invoice-crud.service.ts`). Out of scope; do not "fix" it by converting at display time.

Dollar *entry*, if ever wanted, is a separate project: convert at the form boundary, store Naira plus the rate used. **Not in this plan.**

---

# 7. VERIFIED FILE IMPACT

## CREATE — backend

| File | Purpose |
|---|---|
| `backend/src/lib/fx/types.ts` | `FxProvider` contract |
| `backend/src/lib/fx/er-api.provider.ts` | `open.er-api.com` adapter |
| `backend/src/lib/fx/index.ts` | `getFxProvider()` factory |
| `backend/src/services/fx.service.ts` | Cache + single-flight + failure handling |
| `backend/src/controllers/fx.controller.ts` | HTTP handler |
| `backend/src/routes/fx.routes.ts` | `GET /rates` |
| `backend/tests/unit/fx-rates.service.test.ts` | Unit tests |

## CREATE — frontend (submodule)

| File | Purpose |
|---|---|
| `frontend/src/lib/currency.ts` | Metadata, conversion, formatting, module snapshot |
| `frontend/src/stores/currency.store.ts` | Zustand store (persisted) |
| `frontend/src/hooks/useDisplayCurrency.ts` | Per-component subscription — the reactivity mechanism (§6.C) |
| `frontend/src/lib/__tests__/currency-coverage.test.ts` | Fails if a money-rendering component forgets the subscription |
| `frontend/src/components/layout/CurrencySwitcher.tsx` | The dropdown |
| `frontend/src/components/layout/CurrencySwitchVeil.tsx` | The overlay |
| `frontend/src/lib/__tests__/currency.test.ts` | Unit tests |
| `frontend/src/stores/__tests__/currency.store.test.ts` | Store tests |
| `frontend/src/components/layout/__tests__/CurrencySwitcher.test.tsx` | Component tests |

## MODIFY — backend

| File | Change |
|---|---|
| `backend/src/config/index.ts` | Add the `fx` block |
| `backend/src/routes/index.ts` | Mount `v1.use('/fx', fxRoutes)` |
| `backend/.env.example` | Document the four FX vars |
| `backend/tests/e2e/api.e2e.test.ts` | Auth + shape smoke test |

## MODIFY — frontend (submodule)

| File | Change |
|---|---|
| `frontend/src/lib/format.ts` | `formatNaira` delegates to `formatMoney`; add `formatNgn` |
| `frontend/src/components/layout/AppLayout.tsx` | `<CurrencySwitcher />`, `<CurrencySwitchVeil />`, `fetchRates()` on mount — **no subscription** |
| `frontend/src/stores/auth.store.ts` | `currency.clear()` on logout |
| 24 files listed in Step F4.1 | Delete local `formatNaira`, import the shared one, call `useDisplayCurrency()` |
| ~12 other money-rendering files | Call `useDisplayCurrency()` in each component that formats money (Step F4.0) |
| 5 files listed in Step F4.2 | Convert inline `₦${…}` display strings |
| 4 invoice files | Use `formatInvoiceMoney` |

## DELETE

Nothing.

## DO NOT TOUCH

`lib/tax-quiz-engine.ts`, `data/Subscription.tsx`, `pages/Subscription.tsx`, `lib/fees.ts`, `pages/Payments.tsx`, `pages/Reminders.tsx`, `pages/public/*`, `pages/marketing/*`, `data/marketing.ts`, `ReportExportModal.tsx`, `StatementExportModal.tsx`, `backend/src/services/pdf/*`, `adminFrontend/**`, `marketplaceFrontend/**`, `backend/prisma/schema.prisma`.

---

# 8. PHASED IMPLEMENTATION

## Phase 0 — Orientation (15 minutes, no code)

### Step P0.1 — Read these files before writing anything

Open and skim, in this order:

1. `backend/src/routes/wallet.routes.ts` — the route convention you will copy.
2. `backend/src/lib/payment/types.ts` + `index.ts` — the provider/factory convention you will copy.
3. `frontend/src/components/layout/UserMenu.tsx` — the dropdown behaviour you will copy.
4. `frontend/src/components/layout/AppLayout.tsx` lines 140–190 — where you will mount the control.
5. `frontend/src/lib/format.ts` — the function you are about to change.

**Check:** you can explain, out loud, why the switcher goes in `AppLayout` and not on the Dashboard page.

### Step P0.2 — Confirm the working trees

```bash
cd backend && git status --short && git branch --show-current
cd ../frontend && git status --short && git branch --show-current
```

**Do not** start work on top of uncommitted changes that aren't yours. Ask before stashing anything.

### Step P0.3 — Confirm the baseline is green before you touch it

```bash
cd backend  && npm run typecheck && npm run lint
cd ../frontend && npm run lint && npm test
```

**Check:** all pass. If they don't, stop — you cannot tell your bugs from pre-existing ones.

### Step P0.4 — Understand the commit shape

`frontend/` is a submodule. Your delivery is **two commits**:

1. commit inside `frontend/`
2. commit in the parent repo, which records the new submodule pointer

Writing all frontend code and never committing the pointer means the parent repo silently builds the old frontend. This is Step H6.

---

## Phase 1 — Backend rates endpoint (≈ 3 hours)

Goal: `GET /api/v1/fx/rates` returns Naira-per-unit rates. No UI change yet.

### Step B1 — Add the config block

**File:** `backend/src/config/index.ts`, inside the exported config object, immediately after the `tax: { … }` block (`:237`).

```ts
  fx: {
    provider: process.env.FX_PROVIDER || 'er-api',
    displayCurrencies: (process.env.FX_DISPLAY_CURRENCIES || 'USD,GBP,EUR,CAD')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxAgeMs: parseInt(process.env.FX_MAX_AGE_MS || '21600000', 10), // 6h
    timeoutMs: parseInt(process.env.FX_TIMEOUT_MS || '5000', 10),
  },
```

**Check:** `cd backend && npx tsc --noEmit` passes.

**Do not** put the rates in the database. There is no `FxRate` model in this plan.

### Step B2 — Create the provider contract

**File:** `backend/src/lib/fx/types.ts`

```ts
export interface FxProvider {
  readonly name: string;
  /** Returns NGN per 1 unit of each quote currency, e.g. { USD: 1348.8 }. */
  fetchNgnRates(quotes: string[]): Promise<Record<string, number>>;
}
```

### Step B3 — Create the provider

**File:** `backend/src/lib/fx/er-api.provider.ts`

```ts
import { config } from '@/config';
import type { FxProvider } from './types';

const BASE_URL = 'https://open.er-api.com/v6/latest/USD';

export const erApiProvider: FxProvider = {
  name: 'open.er-api.com',

  async fetchNgnRates(quotes: string[]): Promise<Record<string, number>> {
    // `fetch`, not axios: axios is a devDependency in this package, and every other
    // outbound HTTP call in src/ (paystack.provider.ts, kudisms.client.ts) uses fetch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.fx.timeoutMs);
    let data: any;
    try {
      const response = await fetch(BASE_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`FX provider responded ${response.status}`);
      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    if (data?.result !== 'success' || typeof data?.rates?.NGN !== 'number') {
      throw new Error(`FX provider returned an unusable payload (result=${data?.result})`);
    }

    const ngnPerUnit: Record<string, number> = {};
    for (const raw of quotes) {
      const code = raw.toUpperCase();
      if (code === 'NGN') continue;

      const perUsd = data.rates[code]; // units of `code` per 1 USD
      if (typeof perUsd !== 'number' || !Number.isFinite(perUsd) || perUsd <= 0) continue;

      const rate = data.rates.NGN / perUsd; // NGN per 1 unit of `code`
      if (Number.isFinite(rate) && rate > 0) ngnPerUnit[code] = rate;
    }

    return ngnPerUnit;
  },
};
```

**Check:** none yet — this is exercised in B5.

**Do not** return the inverted direction. `rates.USD` must be ≈ `1348`, never `0.00074`.

### Step B4 — Create the factory

**File:** `backend/src/lib/fx/index.ts`

```ts
import { config } from '@/config';
import { erApiProvider } from './er-api.provider';
import type { FxProvider } from './types';

export function getFxProvider(): FxProvider {
  switch (config.fx.provider) {
    case 'er-api':
      return erApiProvider;
    default:
      throw new Error(`Unknown FX provider: ${config.fx.provider}`);
  }
}

export type { FxProvider };
```

**Check:** `npx tsc --noEmit` passes.

**Do not** throw at module import time — only when called, so a bad env var can't crash boot.

### Step B5 — Create the service

**File:** `backend/src/services/fx.service.ts`

```ts
import { config } from '@/config';
import logger from '@/lib/logger';
import { getFxProvider } from '@/lib/fx';

interface CachedRates {
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

export interface FxRatesResponse {
  base: 'NGN';
  rates: Record<string, number>;
  fetchedAt: string | null;
  stale: boolean;
  source: string;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let cache: CachedRates | null = null;
let inflight: Promise<CachedRates> | null = null;

function shape(c: CachedRates, stale: boolean): FxRatesResponse {
  return {
    base: 'NGN',
    rates: c.rates,
    fetchedAt: new Date(c.fetchedAt).toISOString(),
    stale: stale || Date.now() - c.fetchedAt > STALE_AFTER_MS,
    source: c.source,
  };
}

async function refresh(): Promise<CachedRates> {
  const provider = getFxProvider();
  const rates = await provider.fetchNgnRates(config.fx.displayCurrencies);
  if (Object.keys(rates).length === 0) {
    throw new Error('FX provider returned no usable rates');
  }
  const next: CachedRates = { rates, fetchedAt: Date.now(), source: provider.name };
  cache = next;
  logger.info('FX rates refreshed', { source: provider.name, count: Object.keys(rates).length });
  return next;
}

export async function getRates(): Promise<FxRatesResponse> {
  if (cache && Date.now() - cache.fetchedAt < config.fx.maxAgeMs) {
    return shape(cache, false);
  }

  try {
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    return shape(await inflight, false);
  } catch (err) {
    logger.warn('FX rates refresh failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (cache) return shape(cache, true);
    return { base: 'NGN', rates: {}, fetchedAt: null, stale: true, source: 'unavailable' };
  }
}
```

**Check:** add a temporary unit test (Step B7) or run:

```bash
cd backend && npx tsx -e "
import('./src/services/fx.service').then(async (m) => {
  const r = await m.getRates();
  console.log(r.source, r.rates);
})"
```

Expected: `open.er-api.com { USD: 1348.x, GBP: 18xx, CAD: 96x }`.

**Do not** let `getRates()` ever throw. A display feature must not 500.

### Step B6 — Controller, route, mount

**File:** `backend/src/controllers/fx.controller.ts`

```ts
import type { Request, Response } from 'express';
import { getRates } from '@/services/fx.service';

export async function getRatesHandler(_req: Request, res: Response) {
  const data = await getRates();
  res.json({ success: true, data });
}
```

**File:** `backend/src/routes/fx.routes.ts`

```ts
import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import * as fxController from '@/controllers/fx.controller';

const router = Router();

router.get('/rates', authenticate, asyncHandler(fxController.getRatesHandler));

export default router;
```

**File:** `backend/src/routes/index.ts` — add the import beside the other route imports and mount beside the other `v1.use(...)` lines:

```ts
import fxRoutes from './fx.routes';
// …
v1.use('/fx', fxRoutes);
```

**Check:**

```bash
curl -s http://localhost:3000/api/v1/fx/rates
# → 401 { error: { code: 'UNAUTHORIZED', … } }

curl -s -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/fx/rates
# → { success: true, data: { base: 'NGN', rates: { USD: … }, fetchedAt: '…', stale: false, source: 'open.er-api.com' } }
```

**Do not** add `rejectAdminOnUserRoutes`. This is a read-only, user-agnostic table.

### Step B7 — Tests and env docs

**File:** `backend/.env.example` — append:

```
# --- FX display rates (optional; defaults are fine) ---
# FX_PROVIDER=er-api
# FX_DISPLAY_CURRENCIES=USD,GBP,EUR,CAD
# FX_MAX_AGE_MS=21600000
# FX_TIMEOUT_MS=5000
```

**File:** `backend/tests/unit/fx-rates.service.test.ts` — cover:

1. cross-rate math: `{ NGN: 1805.75, USD: 1.33886, CAD: 1.87022 }` ⇒ USD ≈ `1348.79`, CAD ≈ `965.52`
2. `result !== 'success'` ⇒ `rates: {}`, `stale: true`, does not throw
3. a quote that is `0` / negative / non-numeric is dropped, others survive
4. two concurrent `getRates()` calls on a cold cache ⇒ provider invoked **once**
5. second call inside the TTL does not invoke the provider
6. cache older than 24h ⇒ `stale: true`

**Mock the provider.** Use `jest.mock('@/lib/fx', …)`. Never call the live API from a test.

**File:** `backend/tests/e2e/api.e2e.test.ts` — add one smoke test: unauthenticated ⇒ 401; authenticated with the provider stubbed ⇒ 200 and the documented shape.

**Check:** `npm run test:unit` and `npm run test:e2e` pass.

**Phase 1 exit criteria:** endpoint live, cached, never 500s, covered by tests.

---

## Phase 2 — Frontend plumbing (≈ 1 day, still nothing visible)

### Step F1 — Create `lib/currency.ts`

**File:** `frontend/src/lib/currency.ts`

```ts
/**
 * Display currency — PRESENTATION ONLY.
 *
 * The ledger is Naira. Nothing here may be used to build a request payload.
 * Never convert: amount inputs, payment initiation, subscription checkout,
 * PDFs, emails, exports, public pages, tax constants, admin portal.
 */

export const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const CURRENCY_META: Record<
  DisplayCurrency,
  { name: string; symbol: string; locale: string; currencyDisplay: 'narrowSymbol' | 'symbol' }
> = {
  NGN: { name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG', currencyDisplay: 'narrowSymbol' },
  USD: { name: 'US Dollar', symbol: '$', locale: 'en-US', currencyDisplay: 'narrowSymbol' },
  GBP: { name: 'British Pound', symbol: '£', locale: 'en-GB', currencyDisplay: 'narrowSymbol' },
  EUR: { name: 'Euro', symbol: '€', locale: 'en-IE', currencyDisplay: 'narrowSymbol' },
  // en-US + symbol is deliberate: en-CA renders CAD as "$" and collides with USD.
  CAD: { name: 'Canadian Dollar', symbol: 'CA$', locale: 'en-US', currencyDisplay: 'symbol' },
};

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

let snapshot: { code: DisplayCurrency; rates: Record<string, number> } = { code: 'NGN', rates: {} };

export function setDisplaySnapshot(next: { code: DisplayCurrency; rates: Record<string, number> }) {
  snapshot = next;
}

export function getDisplayCurrency(): DisplayCurrency {
  return snapshot.code;
}

export function getDisplayRates(): Record<string, number> {
  return snapshot.rates;
}

/** NGN per 1 unit of `code`. `null` when the rate is missing or unusable. */
export function ngnRateFor(code: DisplayCurrency): number | null {
  if (code === 'NGN') return 1;
  const rate = snapshot.rates[code];
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function toNumber(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isFinite(n) ? n : 0;
}

export function convertFromNgn(amount: number, code: DisplayCurrency = snapshot.code): number {
  const rate = ngnRateFor(code);
  if (rate === null || rate === 1) return amount;
  return amount / rate;
}

export function formatMoney(
  amount: number | string | null | undefined,
  code: DisplayCurrency = snapshot.code,
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const num = toNumber(amount);
  const rate = ngnRateFor(code);

  // No rate ⇒ render Naira. Never print a foreign symbol over an unconverted number.
  const effective: DisplayCurrency = rate === null ? 'NGN' : code;
  const value = rate === null || rate === 1 ? num : num / rate;
  const meta = CURRENCY_META[effective];

  if (opts.compact && effective === 'NGN') {
    // Preserve the exact NGN compact output the app ships today.
    if (Math.abs(value) >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: effective,
    currencyDisplay: meta.currencyDisplay,
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
}

/** Invoice documents may carry a foreign currency; those are formatted, never converted. */
export function formatInvoiceMoney(
  invoice: { currency?: string | null },
  amount: number | string | null | undefined
): string {
  const code = (invoice.currency || 'NGN').toUpperCase();
  if (code === 'NGN') return formatMoney(amount);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(amount));
  } catch {
    return formatMoney(amount);
  }
}
```

**Check:** `npx tsc --noEmit` (or `npm run build`) passes.

**Do not** add a `useMoney` hook “for later”. Nothing uses it and it will rot.

### Step F2 — Create the store

**File:** `frontend/src/stores/currency.store.ts`

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { setDisplaySnapshot, type DisplayCurrency } from '@/lib/currency';

const FRESH_MS = 6 * 60 * 60 * 1000; // 6h

interface CurrencyState {
  code: DisplayCurrency;
  rates: Record<string, number>;
  fetchedAt: number | null;
  source: string;
  stale: boolean;
  loading: boolean;   // background prefetch in flight (mount, TTL expiry) — no veil
  switching: boolean; // user-initiated switch waiting on the network — veil
  error: string | null;
  fetchRates: (force?: boolean) => Promise<boolean>;
  setCurrency: (code: DisplayCurrency) => Promise<void>;
  clear: () => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      code: 'NGN',
      rates: {},
      fetchedAt: null,
      source: 'none',
      stale: false,
      loading: false,
      switching: false,
      error: null,

      fetchRates: async (force = false) => {
        const { rates, fetchedAt, loading } = get();
        const hasRates = Object.keys(rates).length > 0;
        const fresh = hasRates && fetchedAt !== null && Date.now() - fetchedAt < FRESH_MS;
        if (!force && fresh) return true;
        if (loading) return hasRates;

        set({ loading: true, error: null });
        try {
          const { data } = await api.get('/fx/rates');
          const payload = data?.data ?? {};
          const nextRates: Record<string, number> = payload.rates ?? {};
          set({
            rates: nextRates,
            fetchedAt: payload.fetchedAt ? new Date(payload.fetchedAt).getTime() : Date.now(),
            source: payload.source ?? 'unknown',
            stale: Boolean(payload.stale),
            loading: false,
          });
          return Object.keys(nextRates).length > 0;
        } catch {
          set({ loading: false, stale: true, error: 'RATES_UNAVAILABLE' });
          return Object.keys(get().rates).length > 0;
        }
      },

      setCurrency: async (code) => {
        if (get().code === code) return;
        // Warm path: the rate is already in the store ⇒ instant switch, no veil.
        if (code === 'NGN' || (get().rates[code] ?? 0) > 0) {
          set({ code });
          return;
        }
        set({ switching: true });
        try {
          const ok = await get().fetchRates(true);
          if (ok && (get().rates[code] ?? 0) > 0) {
            set({ code });
          } else {
            toast.error('Live rates unavailable. Showing Naira.');
          }
        } finally {
          set({ switching: false });
        }
      },

      clear: () =>
        set({
          code: 'NGN',
          rates: {},
          fetchedAt: null,
          source: 'none',
          stale: false,
          loading: false,
          switching: false,
          error: null,
        }),
    }),
    {
      name: 'wallx_display_currency',
      partialize: (s) => ({ code: s.code, rates: s.rates, fetchedAt: s.fetchedAt }),
    }
  )
);

// formatMoney reads this snapshot outside React. Keep it in sync with the store,
// including rehydration from localStorage.
setDisplaySnapshot({
  code: useCurrencyStore.getState().code,
  rates: useCurrencyStore.getState().rates,
});
useCurrencyStore.subscribe((s) => setDisplaySnapshot({ code: s.code, rates: s.rates }));
```

**Check:** `npm run build` passes.

**Do not** cache converted values anywhere. Only `code` + `rates` are stored.

### Step F3 — Make the shared formatter currency-aware

**File:** `frontend/src/lib/format.ts`

Keep the file's other exports untouched. Replace the body of `formatNaira` and add `formatNgn`:

```ts
import { formatMoney, getDisplayCurrency } from './currency';

/** NGN-locked. Use only where the figure must never convert (pricing copy, quiz). */
export function formatNgn(amount: number | string | null | undefined, compact = false): string {
  if (amount === undefined || amount === null || amount === '') return '₦0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₦0.00';

  if (compact) {
    if (Math.abs(num) >= 1_000_000) return `₦${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `₦${(num / 1_000).toFixed(1)}K`;
  }

  return `₦${num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Display-aware. Renders in the user's selected currency. */
export function formatNaira(amount: number | string | null | undefined, compact = false): string {
  return formatMoney(amount, getDisplayCurrency(), { compact });
}
```

Copy the old `formatNaira` body verbatim into `formatNgn`.

**Check:** with `localStorage.wallx_display_currency = {"state":{"code":"NGN","rates":{}}}` the app looks identical to before.

**Do not** rename `formatNaira`. 317 call sites use that name.

### Step F4 — Consolidate the local formatters

#### F4.0 — The reactivity hook (do this first, it is the load-bearing step)

**Create** `frontend/src/hooks/useDisplayCurrency.ts`:

```ts
import { useCurrencyStore } from '@/stores/currency.store';
import type { DisplayCurrency } from '@/lib/currency';

/**
 * Subscribes the calling component to the display currency.
 *
 * Formatting itself is a plain function and cannot subscribe, so every component
 * that renders money must call this, even when it ignores the return value.
 * Without it the component keeps its last HTML after a currency switch.
 */
export function useDisplayCurrency(): DisplayCurrency {
  return useCurrencyStore((s) => s.code);
}
```

Then, in **every component that calls `formatNaira()` / `formatMoney()` during render**, add
`useDisplayCurrency();` as the first hook call. This is the whole reason the sweep touches
files the previous revision thought it could skip.

**Create** `frontend/src/lib/__tests__/currency-coverage.test.ts` — the guard against a
forgotten subscription:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Files that legitimately format money without subscribing:
//   lib/format.ts, lib/currency.ts       — the formatters themselves
//   NGN-locked surfaces                  — never convert, never re-render
const ALLOWED = [
  'src/lib/format.ts',
  'src/lib/currency.ts',
  'src/lib/tax-quiz-engine.ts',
  'src/lib/fees.ts',
  'src/lib/tax-constants.ts',
  'src/data/Subscription.tsx',
  'src/data/marketing.ts',
  'src/pages/Subscription.tsx',
  'src/pages/Payments.tsx',        // unrouted dead code
  'src/pages/Reminders.tsx',       // unrouted dead code
];

describe('currency reactivity coverage', () => {
  it('every money-rendering component subscribes to the display currency', () => {
    const out = execFileSync('grep', ['-rlE', 'formatNaira|formatMoney', 'src'], { encoding: 'utf8' });
    const files = out.split('\n').filter(Boolean)
      .filter((f) => !f.includes('__tests__'))
      .filter((f) => !ALLOWED.includes(f));

    const missing = files.filter((f) => !readFileSync(f, 'utf8').includes('useDisplayCurrency'));
    expect(missing).toEqual([]);
  });
});
```

**Check:** `npm test` passes, and when you temporarily delete the hook call from
`Dashboard.tsx` the test fails and names the file.

#### F4.1 — Delete these 24 local definitions and import the shared one

(`Payments.tsx` also defines one; it is unrouted dead code and is deliberately skipped, which
is why the measured count is 25 but the list is 24.)

For each file: delete the local function, add `import { formatNaira } from '@/lib/format';` (or extend an existing import), let the compiler find any mismatch.

```
components/account/WalletBalanceCard.tsx       :23   ← also stop exporting it
components/CommandPalette.tsx                  :71
components/dashboard/SalesExpenseChart.tsx     :37
components/debtors/EditCreditModal.tsx         :31
components/debtors/LinkDvaCreditModal.tsx      :19
components/debtors/RecordCreditPaymentModal.tsx:18
components/debtors/WriteOffModal.tsx           :18
components/invoices/LinkDvaInvoiceModal.tsx    :18
components/TransactionDetailPanel.tsx          :77
pages/CustomerDetail.tsx                       :56
pages/Customers.tsx                            :36
pages/Dashboard.tsx                            :120
pages/DebtorDetail.tsx                         :33
pages/Debtors.tsx                              :36
pages/Expenses.tsx                             :73
pages/InvoiceDetail.tsx                        :38
pages/InvoiceForm.tsx                          :41
pages/Invoices.tsx                             :34
pages/Sales.tsx                                :72
pages/SalesImportModal.tsx                     :84
pages/TaxAnalytics.tsx                         :38
pages/TaxReports.tsx                           :48
pages/Transactions.tsx                         :22
pages/UnverifiedTransactions.tsx               :28
```

Then fix the six files that import `formatNaira` **from** `WalletBalanceCard.tsx`:

```
components/account/DvaTransactionsTable.tsx    :10
components/account/AccountMetricStrip.tsx      :3
components/account/WithdrawalsTable.tsx        :15
components/account/PayoutDetailPanel.tsx       :19
components/account/SettlementBankCard.tsx      :16
components/account/SettlementAdvanceCard.tsx   :13
```

**Check:** `npm run build` passes; no file still defines `function formatNaira`.

```bash
grep -rn "function formatNaira\|const formatNaira" src | grep -v "lib/format.ts"
# expected: no output
```

**Note (accepted visual change, stated accurately this time):** the shared formatter uses
`minimumFractionDigits: 2`. Most local helpers being replaced use
`minimumFractionDigits: 0, maximumFractionDigits: 2` — including `Dashboard.tsx:120`,
`Sales.tsx:72`, `Customers.tsx:36`, `Debtors.tsx:36` and `TaxAnalytics.tsx:38`. Version 3
claimed this "matches the dashboard"; it does not. After the sweep, `₦700,000` renders as
`₦700,000.00` on those pages, and compact buckets go from `₦1.2K`/`toFixed(0)` to
`₦1.2K`/`toFixed(1)`. That unification is worth it (one accounting convention, and the
converted value needs the decimals anyway), but it is a visible change — check the Sales and
Analytics tables at 375 px. If a column is too wide, pass `{ decimals: 0 }` to `formatMoney`
for **display only**; never fork the formatter.

#### F4.2 — Convert remaining inline `₦${…}` display strings

```
components/customers/VoucherActionModals.tsx   → formatMoney(amount)
components/DVADiagnostics.tsx                  → formatMoney(amount)
pages/Account.tsx                              → formatMoney(amount)
pages/InvoiceForm.tsx                          → totals convert; line-item inputs stay ₦
components/AddSaleModal.tsx                    → inspect each hit; input helpers stay ₦
```

**Keep `₦` literally** in: `lib/format.ts` (inside `formatNgn`), `lib/tax-quiz-engine.ts`, `lib/fees.ts`, `data/Subscription.tsx`, `pages/Subscription.tsx`, `pages/Payments.tsx`, and every input placeholder/prefix such as `Amount (₦)` and `₦ •••••` in `WalletBalanceCard.tsx:100,115`.

**Check:**

```bash
grep -rn '₦\$\|₦ ' src --include=*.tsx | grep -v "Subscription\|tax-quiz\|fees.ts\|Payments.tsx\|format.ts"
# expected: only input labels/placeholders remain
```

#### F4.3 — The NGN-primary importers (missed by v3, and it matters)

These files already import `formatNaira` from `@/lib/format`. Once `formatNaira` becomes
display-aware they will **silently convert a money-moving or legal surface**. Each must switch
to `formatNgn` instead — verified importers:

```
components/PaymentConfirmationModal.tsx   → money-moving: charged amount stays Naira
components/PayoutWithdrawalModal.tsx      → money-moving: withdrawal stays Naira
components/FinalizeConfirmationModal.tsx  → legal filing figure stays Naira
pages/PaymentCallback.tsx                 → payment receipt stays Naira
pages/public/VerifyVoucher.tsx            → public record, no session, stays Naira
```

Everything else that imports `@/lib/format` (`Settlement.tsx`, the `customers/*` voucher
components, `CrmDailyTotals.tsx`, `VoucherThresholdCard.tsx`, `pages/Customers.tsx`) is
display and converts normally.

**Check:** with USD selected, the payment confirmation, withdrawal, tax-finalisation and
voucher-verification figures are still `₦`, while the settlement and customer pages convert.

#### F4.4 — Invoice money helper

In `Invoices.tsx`, `InvoiceDetail.tsx`, `InvoiceForm.tsx`, `components/invoices/LinkDvaInvoiceModal.tsx`, replace amount rendering with `formatInvoiceMoney(invoice, amount)`. Inputs stay as-is.

**Check:** an invoice with `currency: 'NGN'` converts; one with `currency: 'USD'` renders `$` and does not move when the display currency changes.

### Step F5 — Clear the preference on logout

**File:** `frontend/src/stores/auth.store.ts`

In the Zustand-clearing block (near `useReminderStore.getState().clear()`), add:

```ts
useCurrencyStore.getState().clear();
```

Also update the trailing comment that lists intentionally-persisted stores so it no longer implies all preferences persist.

**Check:** log in, switch to USD, log out, log back in ⇒ Naira.

**Phase 2 exit criteria:** no visible change in the app; everything builds; setting `code: "USD"` by hand in `localStorage` makes the dashboard render `$`.

---

## Phase 3 — The switcher UI (≈ 4 hours)

### Step F6 — Create the overlay

**File:** `frontend/src/components/layout/CurrencySwitchVeil.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useCurrencyStore } from '@/stores/currency.store';

/**
 * Shown only while the *switch itself* is waiting on the network.
 * It must NOT key off `loading` — that flag is also set by the mount-time
 * prefetch, which would veil the whole app on every cold page load.
 */
export default function CurrencySwitchVeil() {
  const switching = useCurrencyStore((s) => s.switching);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!switching) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [switching]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs animate-veil-in"
    >
      <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
        <div className="relative mb-3.5 h-12 w-12">
          <div
            className="absolute inset-0 animate-spin rounded-full border-2 border-primary-500/20 border-t-primary-500"
            style={{ animationDuration: '0.8s' }}
          />
          <div
            className="absolute inset-1.5 animate-spin rounded-full border-2 border-emerald-400/20 border-b-emerald-400"
            style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black tracking-tighter text-white">W</span>
          </div>
        </div>
        <span className="text-xs font-bold tracking-wide text-white">Changing currency…</span>
      </div>
    </div>
  );
}
```

**Check:** temporarily force `loading: true` in the store ⇒ a dark veil appears over the page content only.

### Step F7 — Create the switcher

**File:** `frontend/src/components/layout/CurrencySwitcher.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  CURRENCY_META,
  DISPLAY_CURRENCIES,
  type DisplayCurrency,
} from '@/lib/currency';
import { formatNgn, formatDate } from '@/lib/format';
import { useCurrencyStore } from '@/stores/currency.store';

export default function CurrencySwitcher() {
  const code = useCurrencyStore((s) => s.code);
  const rates = useCurrencyStore((s) => s.rates);
  const stale = useCurrencyStore((s) => s.stale);
  const fetchedAt = useCurrencyStore((s) => s.fetchedAt);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = CURRENCY_META[code];
  const hasAnyRate = DISPLAY_CURRENCIES.some((c) => c !== 'NGN' && (rates[c] ?? 0) > 0);

  const choose = (next: DisplayCurrency) => {
    setOpen(false);
    void setCurrency(next);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change display currency"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:px-3 sm:text-sm"
      >
        <span className="text-base leading-none">{active.symbol}</span>
        <span className="hidden sm:inline">{code}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Display currency"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60"
        >
          <div className="px-4 pb-2 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Display currency
            </p>
          </div>

          <ul className="pb-1">
            {DISPLAY_CURRENCIES.map((c) => {
              const meta = CURRENCY_META[c];
              const isActive = c === code;
              const rate = rates[c] ?? 0;
              const disabled = c !== 'NGN' && rate <= 0;

              return (
                <li key={c}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={disabled}
                    onClick={() => choose(c)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-primary-50/70' : 'hover:bg-gray-50'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-600 ring-1 ring-inset ring-gray-100">
                      {meta.symbol}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{meta.name}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        {c === 'NGN'
                          ? 'Base currency'
                          : rate > 0
                            ? `1 ${c} ≈ ${formatNgn(rate)}`
                            : 'Rate unavailable'}
                      </span>
                    </span>

                    <span className="shrink-0 text-[11px] font-semibold text-gray-400">{c}</span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" strokeWidth={3} />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2.5">
            {stale && (
              <p className="mb-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
                Rates may be outdated.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-gray-500">
              {!hasAnyRate
                ? 'Rates unavailable — showing Naira.'
                : fetchedAt
                  ? `Rates updated ${formatDate(new Date(fetchedAt))}`
                  : 'Rates not loaded yet'}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
              Display only — transactions and tax filings stay in Naira (₦).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Check:** the dropdown opens, closes on outside click and Escape, focus returns to the trigger, and the check mark follows the selection.

### Step F8 — Wire into `AppLayout`

**File:** `frontend/src/components/layout/AppLayout.tsx`

1. Imports:

```tsx
import CurrencySwitcher from './CurrencySwitcher.tsx';
import CurrencySwitchVeil from './CurrencySwitchVeil.tsx';
import { useCurrencyStore } from '@/stores/currency.store';
```

2. **No subscription in this component.** `AppLayout` does not re-render the routed page
   (React bails out on the memoised outlet element — §6.C, §15.C). Do not add
   `useCurrencyStore((s) => s.code)` here and assume it cascades; it does not, and a
   `data-display-currency` attribute will not help either. The subscription belongs in each
   money-rendering component (Step F4.0).

3. Once on mount (next to the other mount effects):

```tsx
useEffect(() => {
  void useCurrencyStore.getState().fetchRates();
}, []);
```

4. Top bar — insert **between** the search affordance and `<MessageBell />`:

```tsx
<CurrencySwitcher />
<MessageBell />
<NotificationBell />
<UserMenu />
```

5. Inside `<main>`, render the veil as a sibling of the `<Suspense>` block:

```tsx
<main ref={mainContentRef} className="relative flex-1 overflow-y-auto">
  <CurrencySwitchVeil />
  <Suspense fallback={<RouteTransitionLoader />}>
    …
  </Suspense>
</main>
```

**Check:** the pill appears in the header on every page; clicking it opens the panel; selecting
USD converts the dashboard instantly **— this only passes because Step F4.0 added
`useDisplayCurrency()` to `Dashboard.tsx`. If the dashboard does not change, that line is
missing; do not "fix" it by adding a subscription here.**

**Do not** wrap anything in `key={code}`. Do not remount the router.

**Phase 3 exit criteria:** switching currencies updates the whole app instantly with no reload and no lost form state; the veil appears only when a rate fetch is in flight.

---

## Phase 4 — Finish the sweep (≈ 1 day)

### Step F9 — Page-by-page verification

Open each route with USD selected and confirm every money figure changed, every input stayed `₦`:

`/dashboard` · `/sales` · `/expenses` · `/tax?tab=reports` · `/tax?tab=analytics` · `/invoices` · `/invoices/:id` · `/invoices/:id/edit` · `/debtors` · `/debtors/:id` · `/customers` · `/customers/:id` · `/transactions` · `/account` · `/settings`

For each page, write down any figure that stayed `₦`. Fix it in place (Step F4 pattern) and re-check. That list is the only remaining work in this phase.

### Step F10 — Confirm the NGN-locked surfaces did **not** change

With USD selected:

- Subscription pricing still shows Naira.
- Tax-quiz amounts still show Naira.
- The payment confirmation figure is Naira.
- Amount inputs still show `₦`.

---

## Phase 5 — Verification (≈ 3 hours)

### Step H1 — Gates

```bash
cd backend   && npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
cd ../frontend && npm run lint && npm test && npm run build
```

**Check:** all green.

### Step H2 — The write-path grep (the most important check)

```bash
cd frontend
grep -rn "convertFromNgn\|formatMoney" src --include=*.tsx --include=*.ts \
  | grep -v "lib/currency.ts" | grep -v "__tests__"
```

Every hit must be inside a render path. **Zero hits** inside `onSubmit`, a payload object, an `api.post`/`api.put`/`api.patch` call, or a store action that writes.

### Step H3 — The write-path proof (manual, do this literally)

1. Select **USD**.
2. Add a sale of `100`.
3. Add an expense of `100`.
4. In the database: `sales_transactions.amount = 100.00`, `expenses.amount = 100.00`.
5. Switch back to **NGN**: the sale reads `₦100.00`.

If step 4 shows `134880.00` or `0.07`, you have converted on write. Revert and fix.

### Step H4 — Documents and payments

- Download a tax statement PDF with USD selected ⇒ Naira figures.
- Download an invoice PDF with USD selected ⇒ Naira figures.
- Initiate a tax payment with USD selected ⇒ request payload amount is Naira, in kobo.
- Subscription checkout ⇒ Naira charge.

### Step H5 — Responsive

At 375 px: the trigger is symbol-only, the top bar does not overflow, the panel fits on screen. At 1440 px: the pill shows `₦ NGN`.

### Step H6 — Commit, twice

```bash
cd frontend
git add <only your files>
git commit -m "feat(currency): display-currency switcher (NGN/USD/GBP/CAD)"

cd ..
git add frontend backend
git commit -m "chore: bump frontend submodule; add FX rates endpoint"
```

**Check:** `git status` in the parent repo is clean and `git diff --submodule` shows the new pointer.

---

# 9. EDGE CASES

| Case | Expected behaviour |
|---|---|
| Provider unreachable, cold cache | `rates: {}`; foreign rows disabled; stays Naira; toast on attempted switch |
| Provider unreachable, warm cache | Cached rates served, `stale: true`, amber note in the panel |
| Cached rate older than 24h | Same, `stale: true` |
| Rate is `0`, negative, `NaN`, a string | Treated as missing ⇒ Naira formatting, no `Infinity` |
| User clicks two foreign currencies quickly | One fetch (`inflight` shared); last selection wins |
| User in USD mode types `100` into Add Sale | Stored as `100.00` Naira, renders `≈ $0.07` |
| User in USD mode types `134880` expecting `$1,348.80` | Stored as `₦134,880`; the `₦` label + hint is the defence |
| Logout | Preference cleared ⇒ next user starts in Naira |
| Reload | Preference restored from `localStorage` before first paint |
| Invoice in a foreign currency | `formatInvoiceMoney` renders it in its own currency, never converted |
| Backend restart | First request refreshes the cache (~300 ms) |
| Two API instances | Each caches independently; rates may differ by minutes — fine for display |
| A component formats money but never calls `useDisplayCurrency()` | It keeps showing Naira after a switch. `currency-coverage.test.ts` fails first — fix the component, not the test |
| A future component wrapped in `React.memo` | It will not re-render from its parent; it needs its own `useDisplayCurrency()` call |
| User switches currency while a modal/form is open | The page re-renders, the form is **not** remounted, typed input survives (§6.C — no `key={}`) |

---

# 10. TESTING STRATEGY

**Backend unit** (`tests/unit/fx-rates.service.test.ts`): cross-rate math, unusable payload, partial quotes, single-flight, TTL cache, 24h staleness. Provider mocked.

**Backend e2e** (`tests/e2e/api.e2e.test.ts`): 401 unauthenticated; 200 + shape authenticated with the provider stubbed.

**Frontend unit** (`src/lib/__tests__/currency.test.ts`):
- `convertFromNgn(134880, 'USD')` with `rates.USD = 1348.8` ⇒ `100`
- NGN identity
- missing / `0` / `NaN` / negative rate ⇒ input returned unchanged
- `formatMoney(1348.83, 'USD')` ⇒ `$1,348.83`
- `formatMoney(1348.83, 'CAD')` ⇒ `CA$1,348.83` (**not `$`**)
- `formatMoney(1348.83, 'GBP')` ⇒ `£1,348.83`
- `formatMoney(1348.83, 'NGN')` ⇒ `₦1,348.83`
- `formatNaira(null)` ⇒ `₦0.00`; `formatNaira('1234.5')` parses; `formatNaira(1_250_000, true)` ⇒ `₦1.3M`

**Frontend store** (`src/stores/__tests__/currency.store.test.ts`): failed fetch keeps prior rates; `clear()` resets to NGN; rehydration restores `code` + `rates`.

**Frontend component** (`CurrencySwitcher.test.tsx`): opens; outside-click and Escape close it; focus returns to the trigger; `aria-checked` tracks selection; foreign rows disabled without rates.

**Frontend reactivity** (the regression that v3 would have shipped): render a component that
calls `useDisplayCurrency()` + `formatNaira()`, change the store, assert the rendered text
changed. Then render the same component **without** the hook and assert it does *not* change —
that documents why the hook is mandatory.

**Frontend coverage** (`currency-coverage.test.ts`): every file matching `formatNaira|formatMoney`
outside the allow-list contains `useDisplayCurrency`.

**Regression:** existing tests assert `₦` with the default currency and must pass untouched.

---

# 11. ACCEPTANCE CRITERIA

1. The pill appears in the top nav bar, left of the message bell, on every authenticated page, at 375 px and 1440 px, without overflow.
2. Switching to USD/GBP/EUR/CAD updates **every** monetary figure on the pages listed in Step F9, with no reload and with no form state lost.
2a. `currency-coverage.test.ts` passes: no money-rendering component is missing `useDisplayCurrency()`.
3. `displayed × rate === NGN value`, spot-checked against `GET /fx/rates`.
4. The endpoint requires auth, returns NGN-per-unit rates, returns `rates: {}` + `stale: true` when the provider is down with a cold cache, and never 500s.
5. No amount input, placeholder or label changed its `₦`; typing still produces Naira payloads.
5a. **Write proof:** with USD selected, a sale of `100` and an expense of `100` are stored as `100.00`. (Step H3)
5b. `convertFromNgn` / `formatMoney` appear in no submit handler, payload builder, or writing store action. (Step H2)
6. Payment initiation sends Naira (kobo) with a foreign currency displayed.
7. Subscription checkout shows and charges the Naira price.
8. Tax statement and invoice PDFs are identical whether USD or NGN is displayed.
9. Exports are unchanged (all server-rendered).
10. Reload preserves the currency; logout resets it to Naira.
11. Provider down + cold cache: app loads, stays in Naira, shows the unavailability message, no `NaN`, no `$` over an unconverted number.
12. All existing tests pass unmodified.
13. No migration, no schema change, no cron, no new required env var.
14. Two commits: `frontend` submodule + parent pointer bump.

---

# 12. DO NOT BUILD (over-engineering boundary)

If you find yourself doing any of these, stop:

- ❌ A Prisma model, migration, seed, or column for FX rates or display currency
- ❌ A cron job, scheduler, or advisory lock
- ❌ A `useMoney()` hook used in one place “for consistency”
- ❌ Converting amounts on write, or storing the rate per sale/expense
- ❌ Relabelling an input to `$`
- ❌ A Settings → Preferences duplicate of the switcher
- ❌ A second currency control inside the Dashboard page
- ❌ Locale/date-format changes beyond currency formatting
- ❌ Converting marketing pages, public pages, admin portal, marketplace
- ❌ Fixing `markInvoicePaid`'s non-NGN booking (separate ticket)
- ❌ Fixing the `947363` / `947364` advisory-lock collisions (separate ticket; no new key is allocated here)
- ❌ Refactoring `formatMoney`'s compact output or unifying every page's decimal style
- ❌ Redis, caching layers, or persistence for rates beyond one module-level object
- ❌ `key={currency}` on the page wrapper, `<Outlet key=…>`, or any remount trick that loses
  form state (use `useDisplayCurrency()`, §6.C)
- ❌ A single subscription in `AppLayout` — it does not reach the page; it is the v3 bug

---

# 13. REMAINING QUESTIONS

1. **Per-device or per-user preference?** v4 keeps `localStorage` only: no migration, no
   auth-surface change, and the difference is invisible to a user with one device. The brief
   asked for per-user server-side; if cross-device sync matters, that is the one piece of v3
   that would come back — a `users.display_currency` column plus a `PATCH /auth/me` field,
   one migration. Everything else in the plan is unchanged either way.

Everything else is settled by the codebase or the brief: display-only, top-bar placement,
overlay only when the network is involved, five currencies (EUR restored in v4).

---

# 14. READINESS SCORE

**9 / 10 — Implementation-ready.**

Every file and line reference was read from the repository today. The three architectural bets are measured, not assumed: zero `React.memo`, zero money `useMemo`, all exports server-rendered. The FX provider was exercised live (₦1,348.8/USD on 2026-11-02). The remaining half-point is one unverifiable judgement: whether the 2-decimal unification in Step F4.1 looks right on the Sales and Analytics tables — that needs human eyes at 375 px, and it is a `{ decimals: 0 }` fix if it doesn't.

---

# 15. APPENDIX — NON-NEGOTIABLE CORRECTIONS

1. No `FxRate`, no `User.displayCurrency`, no migration, no cron.
2. No fallback rate constants. Empty rates + disabled rows.
3. CAD formats with `en-US` + `symbol` ⇒ `CA$`.
4. `formatNaira` keeps its string/null tolerance — 317 call sites depend on it.
5. **There is no `AppLayout` subscription.** The subscription lives in every money-rendering component (`useDisplayCurrency()`), guarded by `currency-coverage.test.ts`. Never replace it with `key={}`, and never "simplify" it back into the layout.
6. `frontend/` is a submodule: two commits.

---

## C. The bailout reproduction (this is why v4 exists)

Run in `frontend/` with `npx vitest run <file>`:

```tsx
let pageRenders = 0;
function Page() { pageRenders += 1; return <span data-testid="money">{readCode()}</span>; }
function Layout() { useTmpStore((s) => s.code); return <main><Outlet /></main>; }

const router = createMemoryRouter(
  [{ path: '/', element: <Layout />, children: [{ index: true, element: <Page /> }] }],
  { initialEntries: ['/'] }
);
render(<RouterProvider router={router} />);
act(() => { moduleCode = 'USD'; useTmpStore.setState({ code: 'USD' }); });
```

Observed: `ROUTER RENDERS 1 1 NGN` — one render, DOM still `NGN`. Same result without the
router (`<div>{stableElement}</div>` ⇒ `RENDERS 1 1 NGN`). Cause: `useOutlet()` returns a
memoised element, so `oldProps === newProps` and React's `bailoutOnAlreadyFinishedWork`
skips the page. A pure-function formatter plus one top-level subscription **cannot** convert
the app. Version 3's headline claim was untested; this one is not.

---

# 16. CHANGELOG v3 → v4

| # | v3 | Decision | v4 | Reason |
|---|---|---|---|---|
| 1 | "`AppLayout` subscription re-renders the page subtree; 317 call sites need no change" | 🔴 **WRONG → replaced** | Per-component `useDisplayCurrency()` + source-scan coverage test (§6.C, Step F4.0) | Proven false by two experiments; the DOM never updated |
| 2 | Sweep = 24 formatter files | 🟠 **INCOMPLETE** | Sweep = every component that *renders* money (≈35 files), each with one hook call | Consequence of #1 |
| 3 | Provider uses `axios` | 🔴 **WRONG** | `fetch` + `AbortController` | `axios` is only a **devDependency** in `backend/package.json`; all other outbound calls in `src/` use `fetch` |
| 4 | "2 decimals matches the dashboard" | 🔴 **FALSE** | Stated accurately: it *changes* ~15 pages from min-0 to min-2 | `Dashboard.tsx:120` uses `minimumFractionDigits: 0` |
| 5 | Veil keyed off `loading` | 🟠 **RISKY** | New `switching` flag, set only by `setCurrency` | `loading` is also set by the mount-time prefetch ⇒ veil over the whole app on cold load |
| 6 | 4 display currencies (EUR dropped) | 🟡 **REGRESSION vs the brief** | 5 currencies, EUR restored | The original brief lists NGN/USD/GBP/EUR/CAD; EUR costs one line in three places |
| 7 | 25 local formatters | 🟢 **CORRECTED COUNT** | 24 migrated + `Payments.tsx` skipped as dead code | Measured: 25 exist, one is unrouted |
| 8 | Display-only, no migration, no cron, no fallback rates, CAD via `en-US`/`symbol` | 🟢 **KEPT** | unchanged | Correct and verified |
| 9 | F4.2 said "inspect each `₦` hit" | 🔴 **MISSING** | Step F4.3 names the 5 NGN-primary files that import `formatNaira` and must move to `formatNgn` | Payment/withdrawal/finalisation/voucher figures would otherwise silently convert — the exact failure the plan forbids |
