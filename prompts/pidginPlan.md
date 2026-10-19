# English ↔ Pidgin Toggle — Implementation Plan

**Status:** Planned, not started. Pinned 2026-06-03.
**Owner:** TBD. Phases 1, 2, 4, 5 can be done by Claude; Phase 3 (the copy
itself) is a human task.

---

## TL;DR

No API needed. Naija Pidgin is a register, not a translation — every
machine-translation service (Google, DeepL, Azure, even GPT-4/Claude raw)
returns broken English. The only path is hand-curated translations shipped
as a static JSON dictionary, gated by a toggle in `UserMenu`, persisted in
`localStorage`. Frontend layer is small (~3 hr). Real cost is writing the
Pidgin copy (~12-18 hr, best done by you or a Nigerian copywriter).

There is one ML option worth tracking — Lanfrica/Masakhane Naija Pidgin
research models (AfriBERTa) — but they're research artefacts, not
productionised APIs, and their fluency on SME-finance jargon would be poor.
**Verdict: skip for v1; revisit when a hosted endpoint exists.**

---

## Scope boundary

| Translate | Don't translate |
|---|---|
| Nav, buttons, page titles, form labels, placeholders | Business name, owner name, address, tax ID |
| Empty-states, toasts, modals, tooltips | Sales/expense/invoice descriptions, customer names, invoice numbers |
| Reminder + warning copy generated server-side | Money values (always `₦1,234,567`), dates (always ISO or `en-NG`) |
| Status pills, error messages | Audit-log action codes (`invoice.created` etc — internal) |

**Rule:** anything the user typed = English (their own words); anything WE
typed = toggle-able.

---

## Three-layer model

```
Layer 1 — Frontend i18n (THE toggle)
  react-i18next, en + pcm catalogues, localStorage-persisted
  Toggle button in UserMenu dropdown

Layer 2 — Server message catalogue (Option B)
  tax.service warnings + reminder messages return KEYS not prose,
  frontend resolves to the active language

Layer 3 — Error code mapping
  AppError.code → frontend i18n key (PAYMENT_FAILED →
  t('errors.PAYMENT_FAILED')); falls back to err.message
```

Layer 1 = ~85% of visible text. Layer 2 = ~12%. Layer 3 = last 3%.

---

## Library choice

**Recommended:** `react-i18next` + `i18next` + `i18next-browser-languagedetector`.
Industry standard, ~30 kB gz total, JSON catalogues, namespaces,
pluralisation, interpolation, lazy-load per page.

Rejected:
- Roll-our-own context — tempting at this scale, painful as we grow
- `react-intl` (FormatJS) — heavier, ICU MessageFormat is overkill for 2
  languages

---

## Phases

### Phase 1 — Plumbing (½ day) — Claude

Goal: toggle works, Settings page proves the round-trip.

1. `npm install i18next react-i18next i18next-browser-languagedetector`
2. `frontend/src/i18n/index.ts` with `init({ fallbackLng: 'en',
   detection: { order: ['localStorage','navigator'],
   lookupLocalStorage: 'lang' } })`
3. Namespace-per-domain JSON catalogues: `en/common.json`, `en/nav.json`,
   `en/dashboard.json`, `en/settings.json`, ... Same shape for `pcm/`.
4. `main.tsx` imports `./i18n` before `<App/>`
5. `language.store.ts` (Zustand) wraps `i18n.changeLanguage()` +
   persists to localStorage. Matches existing store pattern.
6. Toggle UI in `UserMenu.tsx` above "Log out" — radio group, two options.
7. Convert `Settings.tsx` end-to-end as convention-setter.

Exit: toggle in UserMenu flips Settings; localStorage `lang=pcm` survives
refresh; new user defaults to browser language → en fallback.

### Phase 2 — Extraction (1-2 days) — Claude, page by page

Goal: every UI string in `frontend/src/` lives in `en/*.json`. No
translation yet — mechanical key extraction.

**Convention:**
- Keys: `{namespace}.{path}.{descriptor}`
  (`dashboard.kpi.total_sales`, `invoice.detail.actions.send`)
- Buttons: imperative
- Toasts: `toasts.{verb}.{noun}` (`toasts.success.sale_recorded`)
- Pluralisation via i18next `_one`/`_other` only where it matters

**Order (smallest → largest):**
1. Layout — Sidebar, AppLayout, UserMenu, NotificationBell (~80 strings)
2. Auth pages — Login, Register, AuthLayout (~40)
3. Account/Settings (~90)
4. Sales + SalesImportModal (~100)
5. Expenses (~70)
6. Invoices + InvoiceForm + InvoiceDetail (~180)
7. Tax — TaxReports, TaxAnalytics, Reminders, Payments (~150)
8. Dashboard (~80)
9. Landing, NotFound, modals (~60)
10. Admin pages — keep English-only for v1

Pattern per file:
```tsx
// before
<button>Send invoice</button>
// after
const { t } = useTranslation('invoice');
<button>{t('detail.actions.send')}</button>
```

Tooling: `eslint-plugin-i18next` added as warning-only **after** Phase 2
completes (prevents regressions; warn-only because legit non-translated
strings exist — currency symbols, brand names).

Exit: `grep -rE ">[A-Z][a-z]+" src/pages src/components/layout | wc -l`
returns ≈0.

### Phase 3 — Pidgin copy (1-2 days) — HUMAN

Goal: complete, fluent `pcm/*.json`.

**Who writes it:**
- First choice: you (Nigerian context, knows screen intent)
- Second choice: hire copywriter from naija-ng Twitter / Tunga.io /
  Andela alumni network — ~₦80-150k, 2-3 day turnaround
- DO NOT use raw machine translation. Useful only for offline seeding +
  human review.

**Reference register:**

| English (current) | Pidgin (proposed) |
|---|---|
| Record a sale | Add new sale / Enter sale |
| You don't have any expenses yet | You never enter any expense |
| Tax report finalized successfully | Your tax report don ready |
| This month is locked — tax has been paid | You don pay tax for this month — e don lock |
| Sign in to your account | Login to your account |
| Forgot password? | You forget password? |
| Welcome back! | Welcome back! (loanword) |

**Hard cases:**
- Money: `₦` stays. "Profit / Loss / Expense / VAT" — keep English (Pidgin
  uses them as loanwords)
- Tax jargon: FIRS, Tax ID, Gross Profit, Tax Payable — keep English
- Dates: month names in English (no native Pidgin month names)
- Formality: Pidgin defaults to 2nd-person familiar — no Mr/Ms
- Brands: PayMyTax, WallX, Paystack — never translated

**Decision rule for the copywriter:** write it like you'd say it to a
friend running a shop in Onitsha who asks "How this app take work?"

### Phase 4 — Backend keys (½ day) — Claude

Goal: server-generated strings (margin warnings, reminder messages, errors)
also toggle.

Today: `tax.service.ts:142` returns
```ts
warnings.push({ type: 'no_expenses', message: '<long English prose>' });
```

Change to:
```ts
warnings.push({
  type: 'no_expenses',
  messageKey: 'warnings.no_expenses',
  messageParams: { totalSales, monthLabel },
  message: msg,  // kept as fallback for emails + legacy clients
});
```

Frontend renders via `t(w.messageKey, w.messageParams)`.

Same treatment for:
- `reminder.service.ts:REPORT_REMINDER_MESSAGES` — add `messageKey` +
  `messageParams` to `Reminder` row schema
- `AppError.code` — frontend gets `errors/*.json` keyed by code, falls
  back to `err.message` when key missing

**Migration:** Existing `Reminder.message` rows in DB stay English. Only
new rows get keys. Reminders are short-lived (dismissed/sent in days), so
no backfill needed.

### Phase 5 — Polish (½ day) — Claude

1. One-time toast on first switch: "Pidgin mode dey live now. You fit
   switch back any time for here."
2. Sentry breadcrumb when `t()` falls back to the key (catches missing
   Pidgin strings).
3. `<html lang={i18n.language}>` synced via `useEffect` (a11y + SEO).
   `pcm` is the BCP-47 / ISO 639-3 code for Nigerian Pidgin.
4. Keyboard shortcut `Cmd/Ctrl+Shift+L` flips language.

---

## Sizing

| Phase | Effort | Who | Reversible? |
|---|---|---|---|
| 1 — Plumbing | 4 hr | Claude | Yes — single PR |
| 2 — Extraction | 12-16 hr | Claude, page by page | Yes per-page |
| 3 — Pidgin copy | 12-18 hr | You / copywriter | Yes — `pcm/*.json` only |
| 4 — Backend keys | 4 hr | Claude | Yes — additive |
| 5 — Polish | 4 hr | Claude | Yes |
| **Total** | **~40 hr** | | |

Phases 1-2 can ship without 3. English users see no change; Pidgin
selectors see English fallback (fine while copy is being written).

---

## What to AVOID

- **Google Translate / DeepL / Azure** — broken English, will damage trust
- **OpenAI / Claude as runtime translator** — slow, expensive,
  non-deterministic. OK for offline seeding + human review; never live
- **Server-side `Accept-Language` detection** — Nigerian browsers default
  to `en-NG` regardless of preference. Always explicit user choice.
- **URL-based locale routing** (`/pcm/dashboard`) — overkill for 2
  languages, breaks deep links, complicates auth router
- **Heavy pluralisation** — Pidgin pluralises by context, not suffix. Use
  i18next plural-suffix only where it genuinely matters.

---

## Open questions for the next session

1. Who writes the Pidgin copy — you or a hired copywriter?
2. Do admin pages get Pidgin too, or English-only forever?
3. One-time onboarding language prompt on first login, or just live in
   UserMenu with English default?
4. Fallback behaviour when Pidgin key is missing — show English silently,
   or show key in dev + log a Sentry breadcrumb in prod (recommended)?
