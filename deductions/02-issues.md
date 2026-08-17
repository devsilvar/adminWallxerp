# Issues, Lurking Problems & Bottlenecks

> Severity: 🔴 **High** — ships broken / must fix before launch ·
> 🟠 **Medium** — real problem, schedule it · 🟡 **Low** — hygiene/polish.
> Every item has the file evidence so you can jump straight to the code.

---

## 🔴 H1 — The AI Assistant is a dead feature (404s on every message)

The sidebar promotes **"AI Assistant"** (`Sidebar.tsx:51`, `{ to: '/ai' }`), and
`AIAssistant.tsx:80` posts to:

```
POST /businesses/:id/ai/chat
```

**No such route exists anywhere in the backend.** `routes/index.ts` mounts 18
route modules — there is no `ai.routes.ts`, no controller, no service. Every
message the user types returns a 404. This is a fully-shipped-looking UI for a
feature that was never built.

**Evidence:** `frontend/src/pages/AIAssistant.tsx:80`, `frontend/src/App.tsx:79`,
`frontend/src/components/layout/Sidebar.tsx:51`, `backend/src/routes/index.ts`.

**Fix options:** (a) build the backend `/ai/chat` route (a chat wrapper over a
model API), or (b) remove the page + sidebar entry until it exists. Option (b)
is the honest default.

---

## 🔴 H2 — Password reset is a dummy; users can never recover an account

`forgotPassword` generates a real reset token and stores it, but the "email" is
this (`auth.service.ts:287-294`):

```ts
// ===== DUMMY EMAIL — replace with Resend / your email service =====
logger.info('PASSWORD RESET EMAIL (dummy)', { to: user.email, ... });
```

The token and link are never sent anywhere. A user who forgets their password
is permanently locked out — and the UI still shows a success toast, so they
have no idea. This is the single worst user-experience bug in the product.

**Evidence:** `backend/src/services/auth.service.ts:284-296`.

**Fix:** the `sendEmail()` abstraction in `backend/src/lib/email/index.ts`
already exists with a Resend client + dev-logger fallback and is used by the
invoice email flow — wire it here. ~15 lines of work.

---

## 🔴 H3 — Test endpoints are unauthenticated and leak data (any non-prod deploy)

`test.routes.ts` is mounted **whenever `NODE_ENV !== 'production'`**
(`routes/index.ts:87-89`) and none of its routes pass through `authenticate`:

- `GET /api/v1/test/businesses-with-dva` — **no auth, no per-route guard**
  mismatch: it returns every business's DVA account number **and owner email**.
  (It does have an inner `NODE_ENV === 'production'` check, but the router
  mount already blocks prod — so on any staging/preview/Render-review deploy
  this is wide open to the public internet.)
- `POST /api/v1/test/simulate-transfer` — **no auth**: anyone can fabricate a
  "DVA transfer" webhook against **any** businessId, injecting a fake
  bank-transfer sale into a stranger's books (lands in the pending/unverified
  queue, so no money moves — but it's data pollution + a spam vector).
- `GET /api/v1/test/check-classifications` — no `NODE_ENV` guard at all, and
  the other two routes' guards are a defense-in-depth duplicate.

**Evidence:** `backend/src/routes/test.routes.ts` (all three routes),
`backend/src/routes/index.ts:87-89`.

**Fix:** require `authenticate` + an `admin`-role check on the router, and/or
gate on a positive allowlist (`ENABLE_TEST_ROUTES=true`) instead of
"not production".

---

## 🔴 H4 — Auth rate limiting is effectively disabled

Three different numbers are claimed in three places:

| Where | Claimed limit |
|---|---|
| `CLAUDE.md` | auth 5/15min |
| comment in `security.ts` | "50 requests per window" |
| **actual code** | **`max: 5000` per 15 min** |

With `max: 5000` **and** `skipSuccessfulRequests: true`, an attacker gets ~5,000
free password guesses per IP every 15 minutes. Against a solo-dev product with
no lockout/email-verification on login, that's a credential-stuffing hole. The
"increased for testing" comment suggests this was a temporary dev tweak that
never got reverted.

**Evidence:** `backend/src/middleware/security.ts:104-115`.

**Fix:** restore something like `max: 20` per 15 min, drop
`skipSuccessfulRequests`, and keep the comment honest. Update `CLAUDE.md`.

---

## 🟠 M1 — CI claims to prevent regressions but runs no tests

`.github/workflows/ci.yml` installs backend deps, runs `prisma generate` +
migrations, and validates the schema. **No Jest, no ESLint, no frontend typecheck,
no frontend build.** The README/CLAUDE.md boasts "the CI gate prevents
regressions" — it does not. (In fact, it would have let the current
60 frontend lint errors and the backend lint misconfiguration sail through.)

**Evidence:** `.github/workflows/ci.yml`.

---

## 🟠 M2 — Backend `npm run lint` is misconfigured (ESLint 9 + legacy config)

Backend has ESLint **9** (`package.json:86`) with a legacy
`.eslintrc.json` (eslintrc format). ESLint 9 dropped eslintrc support by
default — `npm run lint` fails or no-ops. So the backend has **zero** working
lint.

**Evidence:** `backend/package.json:30,84-86`, `backend/.eslintrc.json`.

---

## 🟠 M3 — Frontend has 60 pre-existing lint errors

`npm run lint` in the frontend reports ~60 errors (mostly `no-explicit-any` and
unused vars across admin pages and stores). The files touched in this audit are
clean, but the repo-wide signal is red and hides future regressions.

---

## 🟠 M4 — The dashboard E2E test 401s (test-seed gap)

`tests/e2e/api.e2e.test.ts` — the tax/dashboard test returns 401 in this
environment. The suite seeds its own data, but the dashboard endpoint's data
shape changed during this audit and the harness can't reach a consistent state.
The e2e suite also does not exercise the full register → sales → expenses →
calculate → pay → PDF journey end to end.

**Evidence:** `backend/tests/e2e/api.e2e.test.ts`, `backend/tests/helpers/test-db.ts`.

---

## 🟠 M5 — `frontend/` is a git submodule of the root repo

Git reports `Subproject commit ... -dirty`. Backend and configs live in the
parent repo, the entire frontend is a nested repo. Easy to: forget to commit
the frontend bump (the parent records only the submodule SHA), ship a stale
frontend, or orphan commits. Not a runtime bug — a deployment/ops hazard.

**Evidence:** root `git status` → `modified: frontend (modified content, untracked content)`.

---

## 🟠 M6 — Reminder type drift: `payment_refunded` is backend-only

The backend creates a `payment_refunded` reminder (`payment.service.ts:340`),
but the frontend `ReminderType` union (`frontend/src/types/index.ts`) does not
include it. `NotificationBell` has no color/route mapping for it, so it renders
as the generic gray item and deep-links to `/dashboard` instead of `/payments`.
Silent, cosmetic, but real.

**Evidence:** `backend/src/services/reminder.service.ts:45`,
`backend/src/services/payment.service.ts:338-343`,
`frontend/src/types/index.ts:406`.

---

## 🟡 L1 — Swagger UI is exposed in production

`/api-docs` and `/api-docs.json` are mounted unconditionally (`app.ts:82-89`).
It documents the whole API surface publicly in prod. No data leaks, but it's
free attack-surface information. Gate it behind `NODE_ENV !== 'production'` or
`config.app.isProduction`.

---

## 🟡 L2 — Repo hygiene: stray root scripts + compiled test artifact

- Root of the repo holds one-off scripts that look like they should be in
  `backend/scripts/` or deleted: `verify-phase0.js`, `sampleTest.js`,
  `sample.css`, `seed-classifications-now.js`, `automated-test.js`,
  `diagnostic-dashboard-test.js`, `setup-classifications.bat`,
  `test-dva-flow.bat`, `seed-now.bat`, `test-dva-webhook.js`, plus
  `verify-classifications-fix.js`.
- `backend/tests/e2e/api.e2e.test.js` is a **compiled artifact**
  (contains `//# sourceMappingURL`) sitting next to the `.ts` source — it can
  confuse test runners and reviewers.

---

## 🟡 L3 — CLAUDE.md has drifted from the code

- Says Sentry is **not installed** — it is (`@sentry/node` in deps,
  initialized in `app.ts:26-33` with DSN guard + error handler).
- Says auth rate limit is 5/15min — actual code is 5000/15min (see H4).
- Says "the CI gate prevents regressions" — see M1.
- Says Phase 5 "Sentry — config slot exists, no SDK" — obsolete.
- Claims about DVA/refund/reminder flows are accurate — the drift is mostly
  on the "not shipped" list.

---

## 🟡 L4 — JWT access + refresh tokens in localStorage

Standard practice for SPA-with-API apps and acceptable here (the alternative —
httpOnly cookies — is a bigger refactor). But it means any XSS = full account
takeover. Mitigations already present: strict CSP header on the API (though the
frontend is served by Vercel, not Express, so the CSP doesn't cover it) and
15-min access tokens. Worth a documented decision, not an emergency.

---

## 🟡 L5 — In-process caches are the multi-instance ceiling

- Sales-import preview tokens: in-memory `Map` with 15-min TTL
  (`backend/src/lib/sales-import/cache.ts`) — preview on API-1, commit on
  API-2 = `IMPORT_TOKEN_EXPIRED`.
- Frontend dashboard cache: module-level, per-tab, 30s stale-while-revalidate,
  no cross-tab sync (`frontend/src/lib/cache.ts`).
Both are fine for a single instance (the current reality) and are **documented
in the repo** — but they are the first thing to break at scale.

---

## 🟡 L6 — i18n is framework-complete, coverage-partial

`en` + `pcm` (Nigerian Pidgin) locale JSONs exist for dashboard/account/
settings/nav/common, but most page strings are hardcoded English. If Pidgin
support is a launch promise, it's currently ~60% there.

---

## 🟡 L7 — Dev-environment quirk: `npm run build` fails on Windows

The backend build hit a Prisma query-engine DLL file lock on Windows
(`query_engine-windows.dll.node`); a plain `npx tsc --noEmit` works fine.
Prisma 6 on Windows occasionally holds the DLL during generate. Workaround is
documented in this audit's validation notes; not a code bug.

---

## ✅ Fixed during this audit (was the original complaint)

### The dashboard read tax *reports*, not live transactions — **now fixed**

`GET /businesses/:id/tax/dashboard` (→ `taxService.getDashboard`) used to sum
`MonthlyTaxReport` rows for Total Sales / Total Expenses / This Month. Report
rows only exist after **Calculate Tax**, so adding a sale, expense, or invoice
payment never moved the dashboard until someone recalculated/finalized — the
exact symptom reported. The fix:

- **Lifetime KPIs** now aggregate **live** `SalesTransaction`
  (confirmed + isTaxable) and `Expense` (deductible) rows.
- **This Month** card merges live month-to-date sales/expenses/gross profit
  with the stored report's rate + status when one exists; locked months keep
  the stored report untouched (so finalize/pay remain the freeze point, as
  designed).
- Two invalidation gaps closed: bulk sales import and "Calculate Tax" now
  fire `invalidateDashboard()` like every other mutation.

**Files:** `backend/src/services/tax.service.ts` (`getDashboard`),
`frontend/src/stores/dashboard.store.ts`, `frontend/src/pages/TaxReports.tsx`,
`frontend/src/pages/SalesImportModal.tsx`.

---

## Bottleneck summary (ranked)

1. **Password recovery is fake** (H2) — every locked-out user is a churned user.
2. **AI Assistant 404s** (H1) — a promoted feature that cannot work.
3. **Test routes open in non-prod** (H3) — leak + abuse vector on any staging deploy.
4. **Auth brute-force protection off** (H4).
5. **No real CI or lint gate** (M1-M3) — regressions are currently invisible.
6. **Single-instance caches** (L5) — fine today, documented ceiling.
