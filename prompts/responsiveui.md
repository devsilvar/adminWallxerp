# responsiveui.md — Mobile App UI Plan for WallXERP / WallxTax

**Plan name:** `responsiveui`
**Audience:** Senior Frontend Engineer + product/design stakeholders
**Scope:** Turn the currently _responsive desktop web app_ into a **native-feeling mobile app UI** for Android phones (and by extension other small screens), while keeping the existing desktop UI and all business logic intact.

> **The one-sentence goal:** The app already _fits_ on a phone — this plan makes it _feel designed for a phone_: thumb-first navigation, app-like gesture patterns, compact "native" information cards, smooth transitions, safe-area-aware layouts, and a bottom tab bar that replaces the desktop sidebar on small screens.

---

## 1. Why this change is needed

Right now the app is a **desktop-grade responsive website**. It collapses well — cards stack, tables become mobile lists, the sidebar becomes a drawer — but the _interaction model_ is still a web app:

| Current feel on Android                    | Target "senior app" feel                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Hamburger menu opens a 300px drawer        | Persistent bottom tab bar + contextual top header                                               |
| First action lives in the sidebar/drawer   | High-impact action is a floating "FAB" or a prominent primary button at the top or bottom       |
| Dense desktop layout stacked vertically    | Compact, scannable app screens with matched vertical rhythm                                     |
| One-size `py-4` paddings everywhere        | 16px gutters, 48dp touch targets, `16px` rounded cards                                          |
| Tables that "become" cards by CSS fallback | Real mobile list rows with leading icon, title, subtitle, trailing status/value                 |
| Generic browser look                       | App chrome: status-bar aware header, large rounded cards, subtle elevation, bottom-sheet modals |
| Long pages, scroll-down navigation         | Pull-to-refresh, tabbed sections, sticky action areas                                           |

The outcome is not a native app — it is a **PWA-style app shell** that _feels_ native on Android.

---

## 2. Current state — what we start from

### Stack

- Vite + React 19 + TypeScript 5.9 + Tailwind CSS v4
- Zustand for global state, React Router 7
- i18n (English + Nigerian Pidgin), react-hot-toast, lucide-react, Recharts
- Verified on Android Chrome (the primary target)

### Existing responsive behavior (good bones, wrong skeleton)

- `AppLayout` uses a **desktop sidebar** (`hidden lg:flex`) + a **hamburger drawer** on smaller screens.
- Top bar always shows: hamburger, logo, search, notifications, user menu.
- Pages use `sm:`/`md:`/`lg:` breakpoints.
- Desktop tables are `hidden md:block`; mobile versions are `md:hidden` **separately-rendered card lists**.
- Almost every list page (Sales, Expenses, Invoices, Payments, Unverified Transactions) has its own duplicated mobile-list markup.
- Modals are centered dialogs; they work but feel like web pop-ups, not app sheets.
- No bottom navigation. No pull-to-refresh. No bottom sheets. No safe-area handling.
- Loading states are mostly text ("Loading…") or simple skeleton rows.
- No fling/tap feedback, no reduced-motion accommodations on mobile, no `100dvh` usage.

### Key files affected

- `src/components/layout/AppLayout.tsx` — app shell/top bar
- `src/components/layout/Sidebar.tsx` — desktop/mobile drawer
- `src/components/layout/AdminLayout.tsx`, `AdminSidebar.tsx` — admin shell
- `src/pages/Dashboard.tsx` — financial home screen
- `src/pages/Sales.tsx`, `src/pages/Expenses.tsx`, `src/pages/Invoices.tsx`, `src/pages/Payments.tsx`, `src/pages/UnverifiedTransactions.tsx` — list pages
- `src/pages/Account.tsx`, `src/pages/Settings.tsx` — profile/settings
- `src/components/ui/Button.tsx`, `Card.tsx`, `Input.tsx` — base components
- `src/index.css` — design tokens, breakpoints, safe-area utilities, animations

---

## 3. Target information architecture (mobile)

### 3.1 Phone global navigation — bottom tab bar

Replace the hamburger-drawer navigation as the **primary** phone navigation with a fixed bottom tab bar.

**Tabs (5 max, senior-app standard):**

| Tab              | Route                                                          | Icon (lucide)        |
| ---------------- | -------------------------------------------------------------- | -------------------- |
| Home             | `/dashboard`                                                   | `LayoutDashboard`    |
| Transactions     | `/sales`                                                       | `Receipt`            |
| Add (center FAB) | opens quick action sheet: Add Sale / Add Expense / New Invoice | `Plus`               |
| Tax              | `/tax`                                                         | `Calculator`         |
| More / Account   | `/account`                                                     | `Landmark` or `Menu` |

- `More` screen holds: Expenses, Invoices, Payments, Reminders, AI Assistant, Settings, Admin link (if user is admin).
- The bottom bar is `fixed bottom-0`, `z-40`, white/90 with `backdrop-blur`, `border-t`.
- Each item: icon + label, `min-h-[56px]`, active tab gets a small pill/indicator and primary color.
- Tab bar sits **above the Android safe-area inset**.

### 3.2 Top app header (phone)

On phones the header is **minimal** and does not waste vertical space:

- Left: back button (on non-root pages) or logo.
- Center: contextual page title (or business name on Dashboard).
- Right: search / notifications / profile as small icon buttons.
- Header uses `sticky top-0`, white/90, blur, `border-b`, and respects `padding-top: env(safe-area-inset-top)`.

### 3.3 No more "everything in a drawer" on phones

- The drawer remains as a **fallback for desktop/tablet**, not as the default phone navigation.
- Phone users get: **bottom tabs + contextual top bar + action buttons at the point of use**.

---

## 4. Mobile design system

### 4.1 Breakpoint strategy

Keep desktop breakpoints; add a **phone-first** default:

```
phone (base)      < 640px
sm                640px+
md                768px+
lg                1024px+   (desktop sidebar/table layout returns)
```

- **Rule:** write the _phone layout first_ in each component, then layer `sm:`/`md:`/`lg:` on top. The current code already does this in many places, but some components default to a desktop layout and only hide pieces (`hidden lg:flex`, `hidden md:block`). Those should be inverted or made explicit so the phone path is the baseline.

### 4.2 Layout shell

- Base gutter: `px-4` (16px) in the page container.
- Vertical rhythm: `space-y-4` / `space-y-6`, not dense `py-1` lists.
- Content max width keeps `max-w-6xl` on desktop but on phones it is effectively full width with 16px gutters.
- Use `min-h-dvh` / `h-dvh` where full-height is needed (replaces `h-screen`) so Android browser chrome and keyboard behave properly.
- Add `scroll-padding-bottom` so content is not hidden behind the bottom tab bar.

### 4.3 Cards → app "rows"/"tiles"

Introduce **card variants** instead of one generic white blob:

- **Tile (metrics):** rounded-2xl, 16px padding, leading icon bubble, 2-line content, no border unless needed. Used on Dashboard KPI cards.
- **Row / list item:** a horizontal row inside a white rounded container — lead icon, title, subtitle, trailing value/chevron. Used for Recent Sales, Expenses list, Invoices list.
- **Panel / section:** white rounded-2xl with section header + `divide-y` rows. Used for Monthly Summary, Tax & Compliance, Transactions.
- **Action card:** primary action card (e.g., Add Sale) with gradient accent and a `+` affordance.

### 4.4 Typography

- **Sans:** Montserrat for brand/headings, Inter for body/numbers (already configured).
- On phones, **base UI text should never be smaller than `14px`**; most interactive text `15–16px`. Avoid `text-[10px]`/`text-[11px]` in main content — reserve tiny labels for meta only.
- Numbers use `tabular-nums` (already common) — keep.
- Headline hierarchy on phone:
  - Screen title: `text-xl font-semibold`
  - Section title: `text-base font-semibold`
  - Body: `text-sm`
  - Meta/caption: `text-xs text-gray-500`

### 4.5 Touch targets & accessibility

- **Minimum 44×44px** tap target for every icon button, tab, and row action (Android recommends 48dp; 44 CSS px is a safe floor).
- Inline icon buttons `h-10 w-10` → good. Small `h-8 w-8` → bump to `h-10 w-10` or add `p-2` + `aria-label`.
- `focus-visible` ring visible on interactive elements.
- Keep `aria-label` on all icon-only buttons and `aria-current="page"` on active tab.
- Support `prefers-reduced-motion` when adding transitions.

### 4.6 Elevation & depth

Instead of many borders, use:

- `bg-white`, `rounded-2xl`, `shadow-sm` (app-like minimal)
- Primary/hero surfaces: `bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950` (existing brand gradient) with subtle glow — keep, just constrain padding on phone.
- `shadow-md` only for FABs, bottom sheets, and the tab bar (not for every card).

### 4.7 Motion

Keep the existing animations, but standardize them as **native-feel**:

- Screen enter: `fade-in` + slight `translate-y` (already `slide-up`).
- Sheet/modal enter: `scale-in` or `slide-up`.
- Tab press: subtle `scale-[0.98]` on `:active` (already present in some places).
- **Android rule:** keep motion under ~250ms and always use the currently available `animate-*` tokens.

---

## 5. Page-by-page treatment matrix

| Page                                                    | Phone-first treatment                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                                           | Top info card (business identity + health chips) → 2-column tile grid for KPIs → "This month" summary panel → Recent Sales/Expenses rows → "View all" to list pages. Keep numbers prominent.                                                                                 |
| **Sales / Expenses / Invoices / Payments / Unverified** | Shared **list rows** (not tables). Each row: leading icon, title, subtitle (date · method), trailing status + amount, chevron. Search + filter chips at top. Sticky bottom "Add" button on Sales/Expenses; bottom sheet filters on phone instead of inline `<select>` grids. |
| **Invoice Form / Expense Form**                         | Single-column mobile form, large inputs (`h-12`), floating/sticky save button. Avoid tiny 2-col phone grids.                                                                                                                                                                 |
| **Invoice Detail**                                      | **Status hero card** + line-item rows + totals + sticky primary actions (Download / Send / Mark Paid).                                                                                                                                                                       |
| **Tax Reports**                                         | KPI tiles → **horizontal month selector** (swipeable chips) → report card with slim action buttons ("Calculate", "Finalize", "Pay").                                                                                                                                         |
| **Account**                                             | Bank-account hero card (gradient) + subtle action tiles. Move the ledger tab into a phone segmented control that is visible without hand-editing the URL.                                                                                                                    |
| **Settings**                                            | Mobile-native list rows, each a full-width `button`/`Link` with chevron; page-level nav list instead of a 240px left rail on phone.                                                                                                                                          |
| **Reminders**                                           | List rows with priority indicator and "Mark sent" action.                                                                                                                                                                                                                    |
| **AI Assistant**                                        | App-like chat: header with model label, bubbles left/right, sticky composer above the bottom tab bar, auto-scroll to latest.                                                                                                                                                 |
| **Login / Register / Forgot / Reset**                   | Full-screen brand header at top, button to access useful info, form centered with `max-w-[420px]`, 48dp inputs, single-column. Hide the desktop left panel (already does).                                                                                                   |
| **Admin**                                               | Same bottom-tab concept (or a compact top segmented nav) for AdminLayout; keep desktop rails.                                                                                                                                                                                |

---

## 6. Interaction & behavior upgrades (the "it feels like an app" part)

### 6.1 Pull-to-refresh

- Add a lightweight swipe-down-to-refresh on Dashboard and list pages that calls the existing refresh functions (`fetchDashboard`, `fetchSummary`, etc.).
- Implementation: a small `usePullToRefresh` hook with a pull indicator; keep it optional/per-page.
- Do not block React Router navigation while a pull is in progress.

### 6.2 Bottom sheets for modals/actions

- Replace centered modal dialogs (Create Business, Invoice confirmation, expense form, filters) with **bottom sheets on phone**:
  - Fixed to bottom, full-width, rounded top corners (`rounded-t-2xl`), `max-h-[90dvh]`, draggable handle.
  - Backdrop `bg-black/40 backdrop-blur-sm`.
  - On desktop the same component renders as a centered dialog (keeps one code path, just responsive classes).
- Affected components: `CreateBusinessModal`, `PaymentConfirmationModal`, `PayoutWithdrawalModal`, `StatementExportModal`, `TransactionDetailPanel`, all form modals.

### 6.3 Quick-action FAB (center tab / floating button)

- On **Dashboard, Sales, Expenses, Invoices** pages add a floating "+" button (`fixed bottom-right`, above tab bar).
- It opens a **quick action sheet**: Add Sale, Add Expense, New Invoice, Calculate Tax.
- The center tab in the bottom nav can also open this sheet (acts as the app's primary CTA).

### 6.4 Filters become chips

- On phone, replace inline multi-column filter `<select>` grids with:
  - Horizontal scrollable **filter chips** (e.g., _All, Pending, Paid, Month_) at the top of the list.
  - "More filters" opens a bottom sheet with date pickers.
- Keeps the same state/logic; only the presentation changes.

### 6.5 Back behavior & browser chrome

- On Android, back should go to the previous screen (React Router does this). Do not add custom back handling that conflicts with browser back.
- For bottom sheets: tapping the browser back closes the sheet rather than navigating away — this is a small enhancement and should be done carefully with `useEffect` on the sheet open state.

### 6.6 Spinner / loading states

- Replace literal "Loading…" text with **skeleton screens** on all mobile list pages (a `MobileListSkeleton` component).
- Dashboard already has `Dashboard.skeleton.tsx` — wire it into the phone path if not already.
- Keep `react-hot-toast` for transient feedback but route toasts to a **bottom-center position** on phone (`position="bottom-center"`).

### 6.7 Empty states

- Make empty states app-like: one large icon in a soft circle, 2-line message, and a single primary action button.
- Reuse a `EmptyState` component instead of the current per-page copy.

### 6.8 Safe areas and viewport

- Add to `index.css`:
  - `.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`
  - `.pt-safe { padding-top: env(safe-area-inset-top); }`
  - `.px-safe { padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }`
- Ensure the bottom tab bar and bottom sheets are above the Android gesture nav area.
- Add `height: 100dvh` utilities for modern Chrome.

### 6.9 Header / page titles

- On phone, hide the desktop breadcrumb-ish title if it duplicates the page heading; instead keep a compact centered title in the top bar.
- Keep the hamburger **only when the bottom tab bar is not present** (i.e., for utility/back-navigation pages).

---

## 7. Visual language details

### 7.1 Color

- Keep the existing purple/indigo brand palette (already expressive and app-like).
- Use color for _status and hierarchy_, not decoration:
  - Success `#16a34a`, Warning `#d97706`, Danger `#dc2626` (already tokenized).
- Phone backgrounds: `bg-gray-50` for the app shell; white surfaces on top (`bg-white`). This creates the classic mobile "surface on canvas" contrast.

### 7.2 Radii

- Standardize: cards `rounded-xl` (12px) or `rounded-2xl` (16px), buttons `rounded-xl`, chips `rounded-full`.
- Avoid mixing `rounded-md`, `rounded-lg`, and `rounded-xl` within the same screen.

### 7.3 Borders vs shadows

- One border color family: `border-gray-200`, `divide-gray-100`.
- On phone, prefer `shadow-sm` + white surface (mobile aesthetics) over heavy borders.

### 7.4 Icons

- Icons at active state should be filled/solid (e.g., `fill="currentColor"` on lucide active tabs) to give Android "state" feedback.
- Keep all interactive icons at `20–24px`.

---

## 8. Reusable components to build (phase 1)

Create small, reusable mobile building blocks so the plan is implemented by **composition**, not copy-paste:

| Component            | Purpose                                                        | Used by                                                     |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| `MobileTabBar`       | Fixed bottom nav (5 tabs + optional center FAB)                | `AppLayout`, `AdminLayout`                                  |
| `MobileHeader`       | Sticky top bar (back / title / actions)                        | `AppLayout`, `AdminLayout`, pages                           |
| `QuickActionSheet`   | Bottom sheet of primary actions                                | Dashboard, Sales, Expenses, Invoices, tab bar center button |
| `MobileListRow`      | Lead icon + title + subtitle + trailing value/chevron          | Sales, Expenses, Invoices, Payments, Reminders, Account     |
| `MobileFilterChips`  | Horizontal chip group + "more" sheet                           | List pages                                                  |
| `BottomSheet`        | Responsive dialog (sheet on phone, centered dialog on desktop) | All modals                                                  |
| `EmptyState`         | Icon, title, subtitle, action                                  | All list pages                                              |
| `MobileListSkeleton` | App-like loading rows                                          | All list pages                                              |
| `FAB`                | Floating action button                                         | Dashboard, Sales, Expenses, Invoices                        |
| `MetricTile`         | Compact KPI tile                                               | Dashboard, Tax Analytics                                    |
| `usePullToRefresh`   | Hook for swipe-down refresh                                    | Dashboard, list pages                                       |

All should be **named exports**, typed props, no `any`, accessible, and consistent with existing `ui/` components.

---

## 9. Implementation phases

### Phase 0 — Audit & guard rails (0.5–1 day)

- Confirm all pages render at 360–430px width on Android Chrome.
- Fix `viewport` meta if needed (already set; verify `viewport-fit=cover` for safe-area on notched devices).
- Add design-token exports for radii/spacing/motion if not present.
- **Do not change business logic, API calls, stores, or money-path code.**

### Phase 1 — App shell (1–2 days)

1. Build `BottomSheet`, `MobileHeader`, `MobileTabBar`, `QuickActionSheet`, `FAB` primitives.
2. Rewire `AppLayout`:
   - Phone: sticky minimal header + bottom tab bar + `<main>` with bottom padding for the bar.
   - Desktop (lg+): keep existing sidebar + top bar.
3. Add `dvh` + safe-area utilities to `index.css` and adjust `main`/`body`.

### Phase 2 — Dashboard (1–2 days)

4. Convert KPI grid to `MetricTile` with phone-first 2-col layout.
5. Refactor the top welcome card to be more compact on phone (smaller avatar padding, chips wrap, actions become a row of small buttons, move "Add Sale"/"Tax Reports" into a floating action area).
6. Convert Recent Sales/Expenses to `MobileListRow`.
7. Wire pull-to-refresh on Dashboard.

### Phase 3 — List pages (3–4 days)

8. Introduce `MobileListRow`, `MobileFilterChips`, `EmptyState`, `MobileListSkeleton`.
9. Replace duplicated mobile card lists in Sales, Expenses, Invoices, Payments, Unverified Transactions, Reminders, Tax Reports.
10. Convert inline filters to chips + sheet on phone.
11. Make forms (Expense, Invoice) single-column app forms with sticky save.

### Phase 4 — Modals & transactions (2–3 days)

12. Convert existing centered modals to `BottomSheet` (Create Business, confirmation, payout, statement export, sales import).
13. Add quick-action sheet and center FAB nav.
14. Verify all money-path modals (finalize, pay, withdraw) still behave identically on desktop.

### Phase 5 — Polish (2–3 days)

15. Audit touch targets; bump all `h-8`/`h-9` icon buttons to `h-10`.
16. Standardize radii/typography, fix `text-[10px]` in main content.
17. Add toast `bottom-center` on phone, skeleton loading everywhere.
18. Add `prefers-reduced-motion` handling and Android-safe-area affordances.
19. Run a 360px, 390px, 430px visual QA pass on every route.

### Phase 6 — Build a "native checklist" (ongoing)

20. Capture screen-by-screen screenshots and maintain a `mobile-ui-checklist.md` (optional follow-up doc) as the code evolves.

---

## 10. What NOT to do (guardrails)

- **No big-bang rewrite.** The app is stable; stages are incremental and each phase must leave a working build.
- **Don't touch money-path logic.** Payments, tax finalize, payout withdrawal, PIN step-up, and payment confirmations keep their current behavior; only their visual container changes.
- **Don't remove the desktop sidebar/tables.** Desktop must look the same; the plan **adds** a phone shell and phone-first components without regressing the existing desktop UX.
- **Don't add a new state library, router, or UI framework** just for mobile polish. Extend the existing Zustand/React/Tailwind stack.
- **Don't rewrite every duplicate list at once.** Build the shared components first, then migrate pages one at a time; each migration is a PR-sized change.
- **Don't invent new navigation without preserving existing routes.** All routes and deep links (`/sales/:id`, `/invoices/new`, `/tax`, `/admin/*`) remain valid.

---

## 11. Acceptance criteria

1. On a 360–430px Android Chrome viewport, the app shows a **bottom tab bar** (Home, Transactions, Add, Tax, More) and a minimal top header.
2. The bottom tab bar sits above the safe area and does not cover page content (`scroll-padding-bottom`).
3. Every icon button is ≥44×44px and has `aria-label`.
4. Dashboard, Sales, Expenses, Invoices, Payments, and Account show **app-like rows/tiles**, not desktop tables or tiny text.
5. Filter controls on phone are **chips + bottom sheet**, not multi-column `<select>` grids.
6. Modals open as **bottom sheets** on phone and still open as centered dialogs on desktop (>1024px).
7. Pull-to-refresh works on Dashboard and list pages without blocking routing.
8. All existing routes still work; desktop UX appears unchanged (visual parity on `lg+`).
9. Toasts appear at `bottom-center` on phone.
10. No regressions in tax/payment/invoice/payout behavior; all money-path flows tested on desktop and phone.
11. `npm run build` is green and no new `any`, unused imports, or lint errors are introduced.

---

## 12. Suggested rollout order & PR sizing

| PR  | Scope                                                                                                                                                                                             | Rough size      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Add mobile primitives (`BottomSheet`, `MobileHeader`, `MobileTabBar`, `QuickActionSheet`, `FAB`, `EmptyState`, `MobileListSkeleton`, `MobileListRow`, `MobileFilterChips`) + CSS tokens/safe-area | 6–8 files       |
| 2   | Wire `AppLayout` phone shell + `AdminLayout`                                                                                                                                                      | 2–3 files       |
| 3   | Dashboard mobile refactor                                                                                                                                                                         | 1–2 files       |
| 4   | Sales + Expenses shared mobile list & filters                                                                                                                                                     | 2–3 files       |
| 5   | Invoices + Payments + Reminders mobile refactor                                                                                                                                                   | 3–4 files       |
| 6   | Forms/modals → bottom sheets                                                                                                                                                                      | 6–8 files       |
| 7   | Touch-target / accessibility / polish pass                                                                                                                                                        | repo-wide sweep |

---

## 13. Final recommendation

The current app is **already a good responsive website**, which is exactly why this is achievable with high confidence. Do **not** rebuild it as a separate native app. Instead:

1. Add the **mobile app shell** (top header + bottom tab bar + safe areas).
2. Build **reusable mobile primitives**.
3. Migrate the **top-priority screens** (Dashboard → list pages → modals → forms).
4. Polish **touch targets, actions, and transitions**.
5. Verify **desktop is unchanged** and **money-path flows are regression-tested**.

The result will look like a **senior-designed mobile finance app** while remaining the same responsive React web app — no exotic frameworks, no big rewrite, no risk to existing functionality.
