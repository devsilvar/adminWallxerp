# Multi-Currency Display Switcher — Research & Implementation Plan

**Status:** Draft for review
**Scope:** SME app top bar currency selector (5 currencies), currency reflected across the whole application
**Date:** 2026-10-31
**Base ledger currency:** NGN (unchanged)

---

## 1. Executive Summary

Recommendation: implement a **display-only currency switcher**.

- Every monetary value continues to be **stored, calculated, transmitted, and filed in NGN**. The 7.5% tax engine, FIRS filings, Paystack charges, wallet balances, payouts, settlements, invoices linked to sales, PDFs, and emails are untouched.
- The selected currency is a **presentation preference** that converts NGN at format time using a cached FX rate served by the backend.
- The switcher lives in the **top bar, immediately left of the notification bell**, and mirrors the interaction patterns already used by `UserMenu` and `NotificationBell` (outside-click, Escape, focus return, ARIA menu semantics).
- Conversion happens in exactly **one place** — a `useMoney()` hook backed by a Zustand store — so there is no possibility of a converted value leaking into a write payload.

Why not true multi-currency: a real multi-currency ledger (FX snapshots per transaction, multi-currency payouts, converted tax filings, presentment currency on Paystack) is a 4–8 week compliance project, not a UI toggle. It would also collide with FIRS reporting, which is denominated in NGN. Display-only gives the user 95% of the perceived value at ~5% of the risk.

---

## 2. What the Codebase Looks Like Today (evidence)

| Finding | Evidence |
|---|---|
| Naira is hard-coded in ~20 separate local helper definitions | `Dashboard.tsx:120`, `Sales.tsx:72`, `Expenses.tsx:73`, `TaxReports.tsx:48`, `TaxAnalytics.tsx:38`, `TaxAnalytics` chart, `InvoiceDetail.tsx:38`, `InvoiceForm.tsx:41`, `Invoices.tsx:34`, `Payments.tsx:33`, `Debtors.tsx:36`, `DebtorDetail.tsx:33`, `Customers.tsx:36`, `CustomerDetail.tsx:56`, `SalesImportModal.tsx:84`, `Transactions.tsx:22`, `UnverifiedTransactions.tsx:28`, `TransactionDetailPanel.tsx:77`, `LinkDvaInvoiceModal.tsx:18`, `WriteOffModal.tsx:18`, `RecordCreditPaymentModal.tsx:18`, `EditCreditModal.tsx:31`, `LinkDvaCreditModal.tsx:19`, `CommandPalette.tsx:71`, `SalesExpenseChart.tsx:37` |
| One canonical helper exists but is only used by ~10 files | `frontend/src/lib/format.ts:5` (`formatNaira`) |
| Two of the files in the 84-file sweep are unrouted dead code | `Reminders.tsx` and `Payments.tsx` — `/reminders` and `/payments` redirect elsewhere (`prompts/CLAUDE.md`). Do not spend migration effort on them. |
| The account widgets have their own exported copy, imported by five siblings | `components/account/WalletBalanceCard.tsx:23` re-exported and imported by `WithdrawalsTable`, `SettlementBankCard`, `SettlementAdvanceCard`, `AccountMetricStrip`, `PayoutDetailPanel`, `DvaTransactionsTable` |
| `₦` / `NGN` appears **630 times across 84 frontend files** | grep count |
| Some surfaces already use `Intl.NumberFormat` correctly | `Transactions.tsx:22`, `WalletBalanceCard.tsx:23` |
| Backend tax currency is configurable but NGN by default | `backend/src/config/index.ts:237` — `config.tax.currency` |
| Invoices already carry a `currency` column (default `NGN`) | `schema.prisma:443`; type at `frontend/src/types/index.ts:326` |
| Marketplace products also carry `currency` (default `NGN`) | `schema.prisma:1246` |
| Wallet / bank / DVA are NGN | `schema.prisma:856`, `wallet.service.ts:113,879`, `paystack.provider.ts:597` |
| **Latent bug:** `markInvoicePaid` books `invoice.total` as an NGN sale without converting | `invoice-crud.service.ts:609-615` — a non-NGN invoice would silently book the wrong NGN revenue. Pre-existing; out of scope here, but a reason *not* to increase currency variance. |
| User preference model has no display-currency field | `schema.prisma:12-72` |
| `PATCH /api/v1/auth/me` exists and accepts a narrow payload | `auth.routes.ts:19`, `auth.service.ts:415`, `updateMeSchema` at `auth.validator.ts:56` |
| Cron jobs register in `server.ts` and use Postgres advisory locks with per-job keys | `server.ts:14-20,50-55`, `reminders.cron.ts:41` |
| A polished dropdown pattern already exists to copy | `UserMenu.tsx:27-50`, `NotificationBell.tsx` |

### Implication

There is no single choke point today. **Phase 0 must create one**; otherwise every later phase is 84 file edits with no guarantee of consistency.

---

## 3. Key Decisions

### D1 — Display-only vs. ledger multi-currency

**Decision: display-only.** All storage and computation remain NGN. No `currency` column is added to sales, expenses, tax reports, payments, or wallet rows.

**Why:** FIRS reporting, Paystack settlement, wallet balances, payouts, and the 7.5% tax formula are all NGN-denominated. Converting the ledger would require:
- a per-transaction FX snapshot (rate + timestamp) for auditability,
- multi-currency presentment on Paystack,
- tax reports that reconcile back to NGN for filing,
- refund/reversal handling across rate changes.

None of that is needed for a "show me my numbers in dollars" toggle.

**Product copy requirement:** the switcher must state clearly, once, that amounts are recorded in NGN and this is a display view. Suggested copy in the dropdown footer:

> Display only — all transactions and tax filings are recorded in Naira (₦).

### D2 — Where conversion happens

**Decision: frontend, at format time.** The API keeps returning NGN numbers. The frontend fetches rates and converts in the formatter.

**Why:**
- One choke point (`useMoney()`), so a converted value cannot be written back.
- No need to thread a `currency` query param through ~20 backend endpoints.
- Cached data in Zustand stores remains canonical NGN, which avoids cache-poisoning when the user switches currencies.
- PDFs, emails, and exports keep reading raw NGN and stay correct by construction.

**Rejected:** server-side conversion per endpoint — doubles the response shapes, risks double conversion, and makes stored/derived values ambiguous.

### D3 — Preference scope

**Decision: per-user, persisted server-side**, with a localStorage cache for instant boot.

**Why:** the active business switch is a context selector, not a display preference. Tying currency to business would silently change the whole UI when the user switches businesses, and all data is NGN anyway. Per-user is what the request describes ("top bar dropdown, reflects everywhere").

### D4 — Rate source

**Decision: backend-owned, provider-abstracted, cached.** The browser never calls an FX provider.

**Why:** API-key exposure, CORS, provider rate limits, inconsistent formats, and no ability to serve stale values on provider outage.

**Provider candidates** (verify availability/terms before committing; no live web access during this research pass):

| Provider | Fit | Notes |
|---|---|---|
| `open.er-api.com` | Good for v1 | Free, no key, daily updates, NGN supported |
| `exchangerate-api.com` | Good | Free tier requires key; broader metadata |
| `CurrencyBeacon` / `Fixer` / `OpenExchangeRates` | Paid | Use only if free tiers disappear |
| `Frankfurter` (ECB) | **Reject** | ECB reference set does not include NGN |
| CBN published rates | **Reject for v1** | No reliable public JSON API; scraping is brittle and ToS-risky |
| Paystack / Flutterwave | **Reject** | No public FX-rate API |

Use the same abstraction style as `backend/src/lib/payment/` — an `FxProvider` interface plus a factory selected by config, so the provider can be swapped without touching call sites.

---

## 4. Architecture

### 4.1 Backend

#### Schema (one migration)

```prisma
model FxRate {
  id        String   @id @default(uuid())
  base      String   // ledger currency, always "NGN" for now
  quote     String   // "USD" | "GBP" | "EUR" | "CAD" | ...
  rate      Decimal  @db.Decimal(18, 8) // NGN per 1 unit of `quote`
  source    String
  fetchedAt DateTime @map("fetched_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([base, quote])
  @@index([fetchedAt])
}
```

**Precision trap:** NGN→USD is ≈ 0.00065. Never store that direction in a `Decimal(15,2)` column. Store **NGN per 1 USD** (≈ 1,5xx) and divide at display time: `converted = ngn / rate`. `Decimal(18,8)` is sufficient.

**No Prisma enum for the currency set.** Use a `String` column + Zod allow-list. This sidesteps the enum-drift class already documented in project memory (`prisma_migration_drift_enum.md`).

#### Provider (`backend/src/lib/fx/provider.ts`)

```ts
export interface FxProvider {
  readonly name: string;
  /** Returns NGN per 1 unit of each quote currency. */
  fetchNgnRates(quotes: string[]): Promise<Record<string, number>>;
}
```

Notes on numeric handling:
- If the provider is queried with `base=NGN`, its returned values are multipliers (< 1 for USD). Invert them (`1 / value`) before storing so the DB always holds human-scale NGN-per-unit values.
- If queried with `base=USD`, compute cross-rates: `NGN_per_EUR = rates.NGN / rates.EUR`. Prefer this — fewer tiny floats.
- Reject non-finite, zero, or negative rates; keep the previous good value.

#### Service (`backend/src/services/fx/fx.service.ts`)

- `getRates()` — read latest rows; if newest is older than `RATE_MAX_AGE_MS` (24h), attempt an on-demand refresh; return `{ base, rates, fetchedAt, stale, source }`.
- `refreshRates()` — fetch from provider, upsert each quote in one `$transaction`, `logAudit('fx.rates_refreshed', { source, count })` (fire-and-forget, matching the project's audit pattern).
- Hard-coded `FALLBACK_NGN_RATES` constant used only when the DB is empty **and** the provider fails. Mark `stale: true` and surface the date. Never throw to the HTTP layer — a display feature must not break the app.
- Serve stale-but-usable on provider failure: if rows exist at all, return them with `stale: true` rather than failing.

#### Endpoint

```
GET /api/v1/fx/rates        (authenticated)
→ 200 {
    success: true,
    data: {
      base: "NGN",
      rates: { "USD": 1560.42, "GBP": 1990.10, "EUR": 1702.33, "CAD": 1130.55 },
      fetchedAt: "2026-10-31T06:15:00.000Z",
      stale: false,
      source: "open.er-api.com"
    }
  }
```

- Mounted in `backend/src/routes/index.ts` under `/fx`.
- `authenticate` middleware; inherits the global rate limiter. No admin surface — admins keep NGN.
- Controller → service layering matches the rest of the codebase.

#### Cron (`backend/src/jobs/fx-rates.cron.ts`)

- Schedule: `'15 6 * * *'`, `{ timezone: 'Africa/Lagos' }` — once daily, shortly after CBN/ECB refresh windows.
- Registration in `server.ts` alongside the existing six jobs, wrapped in the same try/catch so a registration failure never crashes the API.
- Postgres advisory lock, same pattern as `reminders.cron.ts`:
  - **Use `LOCK_KEY = 947366`.**
  - ⚠️ Note: `947364` is currently used by **both** `settlement-release.cron.ts:17` and `payout-reconciliation.cron.ts:21`. That is a pre-existing collision and means one job silently skips whenever the other holds the lock. Worth a separate fix ticket; do not reuse `947364`.
- Log `fx.rates_refresh.start` / `.done` / `.failed` with counts.

#### Config (`backend/src/config/index.ts`)

```ts
fx: {
  provider: process.env.FX_PROVIDER || 'er-api',
  baseCurrency: 'NGN',
  displayCurrencies: (process.env.FX_DISPLAY_CURRENCIES || 'USD,GBP,EUR,CAD').split(','),
  maxAgeMs: parseInt(process.env.FX_MAX_AGE_MS || '86400000', 10), // 24h
  apiKey: process.env.FX_API_KEY, // optional, provider-dependent
},
```

Document `FX_PROVIDER`, `FX_DISPLAY_CURRENCIES`, `FX_API_KEY`, `FX_MAX_AGE_MS` in `.env.example`.

#### User preference

- `schema.prisma` → `User.displayCurrency String @default("NGN")`.
- `updateMeSchema` (`auth.validator.ts:56`) → add `displayCurrency: z.enum(['NGN','USD','GBP','EUR','CAD']).optional()`, and relax the `.refine()` so a preferences-only patch is accepted.
- `updateMe()` (`auth.service.ts:415`) → accept the field, no-op if unchanged, audit `user.display_currency_updated`.
- `sanitizeUser()` → include `displayCurrency` so `/auth/me` returns it.
- Migration: `20261101120000_add_user_display_currency` — single nullable-safe `ALTER TABLE users ADD COLUMN display_currency TEXT NOT NULL DEFAULT 'NGN'`.

### 4.2 Frontend

#### Currency metadata (`frontend/src/lib/currency.ts`)

```ts
export const CURRENCY_META = {
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG', decimals: 2 },
  USD: { code: 'USD', name: 'US Dollar',      symbol: '$', locale: 'en-US', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound',  symbol: '£', locale: 'en-GB', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro',           symbol: '€', locale: 'en-IE', decimals: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar',symbol: 'CA$', locale: 'en-CA', decimals: 2 },
} as const;

export const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function convertFromNgn(amount: number, code: DisplayCurrency, rate: number): number {
  if (code === 'NGN') return amount;
  if (!Number.isFinite(rate) || rate <= 0) return amount; // never divide by garbage
  return amount / rate;
}

export function formatMoney(
  amount: number,
  code: DisplayCurrency,
  opts: { compact?: boolean } = {}
): string {
  const meta = CURRENCY_META[code];
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(amount);
}
```

- Locale follows the **currency**, not the app language (English/Pidgin). This keeps symbol placement correct.
- `Intl` handles zero-decimal currencies automatically if any are added later.
- Compact mode uses `notation: 'compact'` rather than the hand-rolled `K`/`M` suffix in `lib/format.ts:13-19`, so it stays correct per locale.

#### Store (`frontend/src/stores/currency.store.ts`)

Zustand + `persist` (localStorage key `displayCurrency`), following the `language.store.ts` pattern but with a network fetch:

```ts
interface CurrencyState {
  code: DisplayCurrency;
  rates: Partial<Record<DisplayCurrency, number>>; // NGN per unit
  fetchedAt: number | null;
  stale: boolean;
  loading: boolean;
  setCurrency: (code: DisplayCurrency) => void;   // local + fire-and-forget PATCH /auth/me
  fetchRates: (force?: boolean) => Promise<void>;
  hydrateFromUser: (code: DisplayCurrency | undefined) => void;
  clear: () => void;
}
```

Rules:
- `setCurrency` updates local state immediately (optimistic), then `PATCH /auth/me { displayCurrency }`. On failure, keep the local value and toast softly — it's a display preference, not a financial write.
- `fetchRates` uses the existing `STALE`/`isFresh` helpers from `lib/cache.ts` with a long TTL (6h client-side) plus the server's `fetchedAt`/`stale` flags.
- `hydrateFromUser` runs after `fetchMe` — **server wins** over the localStorage cache, so a change on another device propagates.
- `clear()` is called from `auth.store.logout()` next to `useReminderStore.getState().clear()`, and resets `code` to `'NGN'` so the next user does not inherit the previous user's display preference.
- Never cache converted values — only NGN and rates.

#### Hook (`frontend/src/hooks/useMoney.ts`)

```ts
export function useMoney() {
  const code = useCurrencyStore((s) => s.code);
  const rate = useCurrencyStore((s) => (s.code === 'NGN' ? 1 : s.rates[s.code]));
  return useMemo(() => {
    const convert = (ngn: number) => convertFromNgn(ngn, code, rate ?? 0);
    return {
      code,
      rate,
      isConverted: code !== 'NGN',
      convert,
      format: (ngn: number, opts?: { compact?: boolean }) =>
        formatMoney(convert(ngn), code, opts),
    };
  }, [code, rate]);
}
```

- Subscribing to `code` and `rate` makes every consuming component re-render on switch. This is the key mechanism that makes "reflects across the whole application" work without a reload.
- If `rate` is missing for a non-NGN selection, fall back to NGN formatting rather than showing nonsense. The switcher shows a "rates unavailable" state in that case.

#### Switcher (`frontend/src/components/layout/CurrencySwitcher.tsx`)

Placement in `AppLayout.tsx:144-168`, between the search button and `<MessageBell />`:

```tsx
<MessageBell />
<CurrencySwitcher />
<NotificationBell />
<UserMenu />
```

Better: put it before `MessageBell` so the two bells stay adjacent. Final order: `search · CurrencySwitcher · MessageBell · NotificationBell · UserMenu`.

Spec:
- Trigger: `₦ NGN` (symbol + code) with a chevron; icon-only below `sm` to protect the 375px top bar. `aria-haspopup="menu"`, `aria-expanded`, `aria-label="Change display currency"`.
- Panel: 5 rows, each `$ USD — US Dollar` with a check on the active row. Below: a small rate line `1 USD ≈ ₦1,560.42` for each, or only on hover to reduce noise.
- Footer: `Rates updated 31 Oct, 06:15 · Display only — recorded in NGN`.
- If `stale`: amber footer line `Rates may be outdated`.
- If `rates` empty: foreign rows disabled with `Rates unavailable — showing NGN`.
- Interaction: `pointerdown` outside listener + Escape, focus returns to the trigger — copy `UserMenu.tsx:27-50` verbatim.
- Role `menu` / `menuitemradio` with `aria-checked`.

#### Boot sequence

1. `AppLayout` mounts → `fetchRates()` (no-op if cache fresh).
2. `auth.store.fetchMe()` resolves → `hydrateFromUser(user.displayCurrency)`.
3. Store selection is restored from localStorage, so there is no NGN→USD flash before `/me` returns.

#### Settings

Add a **Preferences** block to the Profile tab in `frontend/src/pages/Settings.tsx` (tabs defined near line 126): label, `CurrencySwitcher`-style select, and the explanatory note. It writes to the same store, so top bar and settings stay in sync automatically.

---

## 5. Conversion Safety Matrix

This is the most important section. **"Reflect across the whole application" does not mean "convert 630 strings".**

| Surface | Convert? | Rule |
|---|---|---|
| Dashboard cards, charts, recent activity | ✅ Yes | `useMoney().format(...)` |
| Sales / Expenses / Transactions / Inventory lists | ✅ Yes | display only |
| Tax reports list, analytics KPIs, chart axes/tooltips | ✅ Yes | underlying data stays NGN |
| Debtors / Customers / credit balances | ✅ Yes | display only |
| Wallet balance, ledger, DVA transactions | ✅ Yes | display only |
| Settlement history | ✅ Yes | display only |
| Invoices list/detail/form | ⚠️ Conditional | Convert **only** when `invoice.currency === 'NGN'`; otherwise format in the invoice's own currency and never convert |
| Marketplace product prices | ⚠️ Conditional | Convert only when `product.currency === 'NGN'` |
| Payment amount & Paystack initiation | ❌ No | Always show NGN as primary; converted value may appear as secondary text. The payload is always NGN. |
| Subscription pricing / checkout | ❌ No | Show NGN charge prominently; converted value as secondary only. This is where a user is most likely to think they are being charged in USD. |
| Amount input fields (Add Sale, Add Expense, line items, withdrawal) | ❌ No | Input stays NGN; label `₦`. Optional live preview underneath: `≈ $65.00` |
| Payout / withdrawal confirmation | ❌ No | NGN primary; converted secondary |
| PDFs (tax statement, invoice, receipts) | ❌ No | Keep stored/NGN currency. Documents are legal records. |
| Emails (invoice, statements) | ❌ No | Same as PDFs |
| CSV/XLSX exports (`StatementExportModal`, `ReportExportModal`) | ❌ No | Exports are for filing/accounting — NGN only |
| Marketing pages (`pages/marketing/*`, `data/marketing.ts`) | ❌ No (v1) | Public surfaces, no authenticated rate context. Separate decision later. |
| `pages/public/VerifyVoucher.tsx` | ❌ No | Public verification record should match the merchant's stored currency |
| `lib/tax-constants.ts`, `lib/tax-quiz-engine.ts`, `lib/fees.ts` | ❌ No | Calculation/constant data, not display |
| Admin portal (`adminFrontend/`) | ❌ No | Admin treasury stays NGN |

Add a short comment block at the top of `lib/currency.ts` encoding these rules so future contributors do not convert an input field.

---

## 6. Work Plan

### Phase 0 — Foundation (no visible change)

1. `backend/prisma/schema.prisma` — add `FxRate` model and `User.displayCurrency`.
2. Migration `20261101120000_add_user_display_currency` (includes both changes, or split into two migrations if you prefer).
3. `backend/src/lib/fx/provider.ts` + `provider.factory.ts`.
4. `backend/src/services/fx/fx.service.ts` (rates read, refresh, fallback).
5. `backend/src/controllers/fx.controller.ts`, `backend/src/routes/fx.routes.ts`, mount in `routes/index.ts`.
6. `backend/src/jobs/fx-rates.cron.ts` + register in `server.ts` with `LOCK_KEY = 947366`.
7. Extend `auth.validator.ts`, `auth.service.ts` (`updateMe`, `sanitizeUser`), `auth.controller.ts` for `displayCurrency`.
8. `frontend/src/lib/currency.ts` (metadata + pure formatters + safety-rule comment).
9. `frontend/src/stores/currency.store.ts`.
10. `frontend/src/hooks/useMoney.ts`.
11. `auth.store.ts` — `hydrateFromUser` after `fetchMe`; `clear()` on logout.
12. Unit tests for `convertFromNgn`, `formatMoney`, and the store's fallback behavior.

**Exit criteria:** `GET /fx/rates` returns cached rates; `PATCH /auth/me` persists a currency; no UI change yet; all existing tests pass (default NGN).

### Phase 1 — Switcher UI + the pages users see first

13. `components/layout/CurrencySwitcher.tsx`.
14. Wire into `AppLayout.tsx` top bar.
15. Migrate `Dashboard.tsx`, `components/dashboard/SalesExpenseChart.tsx`.
16. Migrate `TaxReports.tsx`, `TaxAnalytics.tsx`, `TaxAssessmentModal.tsx`, `FinalizeConfirmationModal.tsx`, `TaxProfileCard.tsx`.
17. Replace `dashboard.taxConfig.currency` rendering at `Dashboard.tsx:2130` with the active display currency.
18. Add Preferences block in `Settings.tsx`.

**Exit criteria:** switching the top-bar selector instantly re-renders dashboard and tax pages in the new currency, and the dashboard's tax figures still match the backend NGN values divided by the displayed rate.

### Phase 2 — Operate surfaces

19. `Sales.tsx`, `Expenses.tsx`, `Transactions.tsx`, `UnverifiedTransactions.tsx`, `Inventory.tsx`, `SalesImportModal.tsx`.
20. `AddSaleModal.tsx`, `AddExpenseModal.tsx`, `SaleItemsEditor.tsx`, `TransactionDetailPanel.tsx` — display converted, **inputs remain NGN**, add live converted preview under amount inputs.
21. `CommandPalette.tsx` quick-action amounts.

### Phase 3 — Money surfaces

22. `Settlement.tsx`, `Account.tsx`, and all `components/account/*` — consolidate `WalletBalanceCard.tsx`'s exported `formatNaira` and import from the hook instead.
23. Payment surfaces: `/tax?tab=payments` (inside `TaxReports.tsx`) and `PaymentCallback.tsx` — dual display, NGN primary. **Skip `Payments.tsx`** — it is unrouted dead code (see `prompts/CLAUDE.md`); `/payments` redirects to `/tax?tab=payments`.
24. `Debtors.tsx`, `DebtorDetail.tsx`, `Customers.tsx`, `CustomerDetail.tsx`, `components/debtors/*`, `components/customers/*`.
25. `Subscription.tsx`, `data/Subscription.tsx` — NGN primary, converted secondary only.
26. **Skip `Reminders.tsx`** — unrouted dead code; the notification bell owns reminders.

### Phase 4 — Invoices (conditional currency)

27. `Invoices.tsx`, `InvoiceDetail.tsx`, `InvoiceForm.tsx`, `components/invoices/LinkDvaInvoiceModal.tsx`.
28. Add `formatInvoiceAmount(invoice, amount)` helper that converts only when `invoice.currency === 'NGN'`.
29. Do **not** convert the amount input in `InvoiceForm.tsx` line items.

### Phase 5 — Hardening

30. Run the repo's actual gates: backend `npm run lint`, `npm test` (or `npm run test:unit` + `npm run test:e2e`); frontend `npm run lint`, `npm test`.
31. Manual sweep at 375px and 1440px: confirm the top bar does not overflow with the new control.
32. Verify Paystack payment initiation still sends NGN by inspecting the request payload with USD display selected.
33. Verify PDFs and exports are still NGN.
34. Optional: add a one-time toast on first switch — "Showing amounts in USD. Transactions and tax filings stay in Naira."

**Rough effort:** Phase 0 ≈ 1 day; Phase 1 ≈ 1 day; Phases 2–4 ≈ 2–3 days depending on how thorough the sweep is. Total 4–5 focused days.

---

## 7. UX Copy (draft)

- Switcher label: **Display currency**
- Footer: **Display only — all transactions and tax filings are recorded in Naira (₦).**
- Stale rates: **Rates may be outdated. Last updated 30 Oct.**
- Rates unavailable: **Live rates unavailable. Showing Naira.**
- Input hint when converted: **Amounts are entered in Naira (₦).**
- Payment screen: **You will be charged ₦155,000.00** (with `≈ $99.36` underneath, muted).

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Users assume they can *enter* USD | Inputs stay NGN and are labelled; optional live preview; explicit copy in the dropdown and Settings |
| Users think they will be *charged* in USD | Payment and subscription surfaces keep NGN as primary; converted value is secondary |
| Stale or wrong rates produce misleading numbers | Server caches, serves `stale` flag, and never 500s; UI shows staleness; fallback constant is dated |
| Double conversion (converting an already-converted value) | Conversion only inside `useMoney()`; stores/API remain NGN; no `currency` field added to money rows |
| Rate precision loss for NGN→USD | Store NGN-per-unit at `Decimal(18,8)`; divide, never store the tiny direction |
| Existing invoice currency already varies | Conditional conversion based on `invoice.currency`; do not touch `markInvoicePaid` in this project |
| 84-file sweep is incomplete or inconsistent | Phase 0 creates the single choke point; Phase 5 grep gate: `grep -rn "₦\|en-NG" frontend/src --include=*.tsx` should only match NGN-primary, input, PDF, and export surfaces |
| Top bar overflow on mobile | Icon-only trigger below `sm`; verify at 375px in Phase 1 |
| Cron key collision | Use `947366`; separately note the existing `947364` collision between settlement-release and payout-reconciliation |
| Display preference leaks across users on a shared device | `currency.store.clear()` from `auth.store.logout()` |

---

## 9. Testing

**Unit**
- `convertFromNgn` — NGN identity, valid rate, zero/negative/NaN rate falls back to identity.
- `formatMoney` — symbol placement per locale, two decimals, compact notation.
- `currency.store` — `fetchRates` failure keeps previous rates; `hydrateFromUser` overrides local cache; `clear()` resets to NGN.

**Component**
- `CurrencySwitcher` — opens, closes on outside click and Escape, focus returns to trigger, `aria-checked` follows selection, disabled foreign options when rates are empty.
- A dashboard card re-renders with the converted value when the store changes.

**Regression**
- All existing tests assert `₦`/NGN and should pass untouched because the default is NGN.
- `tests/e2e/api.e2e.test.ts` — add a smoke test for `GET /fx/rates` (shape, auth required) and `PATCH /auth/me` with `displayCurrency`.

**Manual**
- Switch to each of the 5 currencies on every top-level page; confirm no page still shows `₦` where it should convert.
- Confirm form inputs, PDFs, emails, and exports are unchanged.
- Confirm payment initiation payload is NGN.

---

## 10. Open Questions

1. **Confirm display-only.** If the intent is that users *enter* amounts in USD and have them stored/converted, stop — that is a different, much larger project and needs a separate plan.
2. **Final five currencies.** Proposed: NGN, USD, GBP, EUR, CAD (diaspora/remittance relevance). If "most popular" is meant globally, swap CAD for JPY or CNY — it is a one-line change in `DISPLAY_CURRENCIES` plus the backend allow-list.
3. **Should public marketing pages convert?** Recommended no for v1.
4. **Should the tax-payable figure show the NGN amount as secondary on the dashboard and tax pages?** Recommended yes — it is the number the user actually pays.
5. **Per-user vs. per-business display preference.** Recommended per-user. Revisit if merchants report for multiple currencies.
6. **Rate refresh cadence.** Daily is sufficient for display. If users ask for intraday accuracy, drop to every 6h.

---

## 11. Explicitly Out of Scope

- True multi-currency ledger / FX snapshots per transaction
- Multi-currency Paystack presentment or settlement
- Converting tax reports for filing
- Currency-aware PDFs and emails
- FX gain/loss accounting
- Admin portal currency switching
- Locale/date-format changes beyond currency formatting
- Fixing the pre-existing `markInvoicePaid` non-NGN booking bug (recommend a separate ticket)
- Fixing the `947364` advisory-lock collision (recommend a separate ticket)

---

## 12. Research Caveat

Live web research was unavailable during this pass (search returned no results), so provider pricing, current API availability, and 2026-specific terms must be verified before selecting `open.er-api.com` or any alternative. All codebase claims above were verified against the repository. The FX provider is isolated behind an interface precisely so this choice can change without rework.
