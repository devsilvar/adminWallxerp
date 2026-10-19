# Admin Frontend Extraction Plan — Move `frontend/src` Admin Surface into `adminFrontend/`

> Source prompt: `prompts/implementplancode.md` (Senior Architecture Audit Prompt v3.0 — execution-ready implementation plan)
> Repo: `tax by wallx` — `frontend/`, `adminFrontend/` (empty), `backend/`
> Date: 2026-10-13 · Author: Staff+ review · Mode: planning only (no code changes)

---

## 1. Executive Summary

**What this system is.** WallXERP/PayMyTax by WallX — Nigerian SME tax (NRS/FIRS) calculation, reporting and remittance. Monorepo with `backend/` (Express 5 + Prisma + Paystack) and `frontend/` (React 19 + Vite 8 + Zustand + Tailwind 4). Admin portal lives *inside* the user frontend today (`frontend/src/pages/admin/*`, `components/layout/AdminLayout.tsx`, `routes/AdminRoute.tsx`, `stores/admin.stats.store.ts`) sharing the same Vite build, same origin, same `localStorage` JWT, same bundle.

**Why extract.** The current colocation creates three concrete costs (all CONFIRMED/HIGH):
1. **Bundle tax on every user.** Admin imports Recharts-heavy `AdminDashboard/dashboard/*`, 13 admin pages and their modals are code-split via `React.lazy`, but shared vendor chunks, `manualChunks` rules and the ~13 admin route entries still widen the dependency graph, pollute `frontend/src/App.tsx` routing, and force every user deploy to carry admin code-review surface.
2. **Security / blast-radius coupling.** Admin auth reuses the same `auth.store` + `axios` + `AdminRoute` guard inside the user app. A single `frontend` mis-route or permissive CORS change (`config.cors.frontendUrl` today assumes one origin) exposes admin endpoints to the user bundle. Tenant-isolation boundary is correct at the API (`authenticate + authorize('admin')` in `backend/src/routes/admin.routes.ts:5`) but not at the UI boundary.
3. **Velocity tax for a solo-dev team.** Admin and user nav, layouts, audit-logs, settlements and unverified-inflows evolve on different cadences. Mixing them in `frontend/src/pages/admin/shared/*` vs `components/ui/*` creates ambiguous ownership and merge churn on `App.tsx`, `Sidebar.tsx` vs `AdminSidebar.tsx`.

**What the plan does.** Stand up `adminFrontend/` as a second, independently deployable Vite app that owns the entire admin UI surface, shares *only* the minimal contract (API base, JWT shape, shared UI tokens) via a small in-repo package or disciplined copy, and leaves `backend/` untouched except for a second CORS origin. Users keep `frontend/` unchanged in behaviour; admins get `adminFrontend/` on its own origin/port. No microservices, no new infra.

**Overall verdict (pre-work):** 🟡 Healthy but needs targeted work — the monolithic frontend is workable today but the admin/user boundary is the next load-bearing seam to cut. The extraction is bounded, reversible, and pays for itself in deploy independence and security clarity.

---

## 2. Current Architecture (as built, from code)

### 2.1 System structure

```
tax by wallx/
  backend/          Express 5, Prisma, routes/index.ts → /api/v1/admin/* (admin.routes.ts)
  frontend/         Vite 8 + React 19, single SPA at :5173, proxies /api → :3000
    src/App.tsx     ← 13 lazy admin routes + 13 user/marketing routes in one router
    src/pages/admin/*           13 pages + dashboard/ (4 tabs + treasury)
    src/components/admin/*      AdminTransferDetailModal, ChangePlanModal
    src/components/layout/      AppLayout + AdminLayout + AdminSidebar + Sidebar
    src/routes/AdminRoute.tsx   auth + role guard
    src/stores/admin.stats.store.ts   cached /admin/dashboard fetcher
    src/stores/auth.store.ts    single JWT store (login/logout/fetchMe)
    src/lib/axios.ts            baseURL /api/v1, Bearer injection, 401 refresh-and-retry
    src/types/index.ts          AdminDashboardStats, etc.
    src/components/ui/*         Button, Card, Modal, Skeleton, Input
  adminFrontend/    EMPTY — git-tracked directory, no package.json
```

### 2.2 Request flow (admin path, today)

```
Browser :5173 /admin/* 
  → React.lazy(AdminDashboard) 
  → useAdminStatsStore.fetchStats() 
  → axios.get('/admin/dashboard')  (baseURL /api/v1, Bearer from localStorage)
  → Vite proxy /api → http://localhost:3000
  → backend middleware: authenticate → authorize('admin') → admin.controller → admin.service → prisma
```

### 2.3 Data flow

- Auth: `POST /api/v1/auth/login` → `{ accessToken (15m), refreshToken (7d), user:{role} }` → `localStorage` (`accessToken`/`refreshToken`) → `axios` request interceptor attaches `Authorization: Bearer …` → 401 triggers `POST /auth/refresh` and single retry (CONFIRMED in `frontend/src/lib/axios.ts`, `src/stores/auth.store.ts`).
- Admin stats: `GET /admin/dashboard` is the platform heartbeat (pending withdrawals, unverified inflows, subscriptions, SLA) — fetched by `AdminSidebar`, `AdminWithdrawals`, and `AdminDashboard` and deduped via `inFlight` promise + 30s TTL in `admin.stats.store.ts:24-55`.
- Writes: `PATCH /admin/users/:id/status`, `POST /admin/settlement/withdrawals/:id/approve|reject|requery|manual-settle`, `POST/DELETE /admin/businesses/:id/payout-change-permit`, `PATCH /admin/settings/{fees,tax,ai}` — all `authenticate+authorize('admin')` guarded.

### 2.4 Dependency structure

- `frontend/src/pages/admin/*` → `@/lib/axios` → `@/stores/auth` → `localStorage`
- `pages/admin/dashboard/*` → `useTreasuryAnalytics` → `/admin/treasury/analytics`, `recharts`
- `AdminLayout` → `AdminSidebar` → `useAdminStatsStore` → `/admin/dashboard`
- `components/ui/*` ← both user and admin pages (shared)
- `AdminRoute` → `useAuthStore` (single store, no admin/user token separation)
- No file under `frontend/src/pages` (non-admin) imports from `pages/admin/*` — boundary is one-directional today (INFERRED from grep, needs verification in ARCH-ADMIN-01).

### 2.5 Integrations / trust boundaries

- External: Paystack (payments/DVA), Supabase/DO Spaces, Resend, Groq/Gemini, Sentry — none admin-specific except `admin.service` orchestration.
- Trust boundary: `backend/src/routes/admin.routes.ts:5` (`router.use(authenticate, authorize('admin'))`) is the enforcement point. UI boundary is `AdminRoute.tsx:7-12` (redirect to `/admin/login` if not authenticated, to `/dashboard` if not admin). Both are correct but UI boundary lives in the user bundle.
- CORS: `backend/src/config/index.ts` / `app.ts` — `config.cors.frontendUrl` is a single origin in production (CONFIRMED via `CLAUDE.md` middleware section; actual value not inspected here — flagged as migration item).

### 2.6 What was NOT reviewed (explicit gaps)

- Full `backend/src/config/index.ts` CORS parsing (single vs. list) — NOT SUFFICIENTLY VERIFIED; grep needed.
- All 13 admin pages' deep import lists (only `AdminDashboard.tsx` sampled) — sampling, not exhaustive.
- `frontend` CI/CD (`.github/workflows/*`, `render.yaml`, `netlify.toml`) — listed but not opened.
- `adminFrontend` history (whether it was ever populated on another branch) — `git log -- adminFrontend` not run.

---

## 3. Architecture Map

### 3.1 Components & boundaries

```
                    ┌─────────────────────────────────┐
                    │         backend (:3000)          │
                    │  /api/v1/admin/*  ← authorize   │
                    │  /api/v1/* (user) ← authenticate│
                    └──────────────┬──────────────────┘
                                   │  /api (proxy in dev)
                 ┌─────────────────┴─────────────────┐
                 │                                   │
        ┌────────┴────────┐               ┌──────────┴──────────┐
        │  frontend :5173 │               │ adminFrontend :5174 │  ← TARGET
        │  User SPA       │               │ Admin SPA           │
        │  /dashboard etc │               │ /admin/*            │
        │  AppLayout      │               │ AdminLayout         │
        │  auth.store     │               │ auth.store (admin)  │
        │  axios /api/v1  │               │ axios /api/v1       │
        └─────────────────┘               └─────────────────────┘
         Single origin today               Second origin (new)
         Single bundle/lazy               Own bundle, own deploy
```

### 3.2 Current coupling that must be cut

| Coupling | File | Severity |
|---|---|---|
| Single `App.tsx` router holds both user and admin routes (13+13 lazy entries, mixed guards) | `frontend/src/App.tsx:58-248` | HIGH |
| Single `auth.store` with one `localStorage` keypair serves both roles | `frontend/src/stores/auth.store.ts` | HIGH |
| Single CORS origin (`FRONTEND_URL`) | `backend/src/config/index.ts` (UNVERIFIED exact shape) | MEDIUM |
| Shared `components/ui/*` imported by both — fine to keep shared, but boundary must be explicit | `frontend/src/components/ui/*` | LOW (keep) |
| `AdminLayout` imports `StatusPill` from `pages/admin/shared/` — page-layer leak into layout | `frontend/src/components/layout/AdminLayout.tsx` | LOW |

---

## 4. What Is Already Good — DO NOT CHANGE

| Area | Why it's good | Action |
|---|---|---|
| **Backend admin authorization** — `authenticate + authorize('admin')` on the entire `admin.routes.ts` router | Single enforcement point, no per-handler drift | DO NOT CHANGE — leave exactly as is |
| **Axios baseURL + refresh-and-retry** (`/api/v1`, Bearer injection, single 401 retry, redirect to `/login` on failure) | Battle-tested, correct for both apps | DO NOT CHANGE — replicate verbatim into adminFrontend, don't refactor |
| **`admin.stats.store` caching** — 30s TTL + `inFlight` dedup for `/admin/dashboard` | Prevents 2–3x fan-out per admin page load | DO NOT CHANGE logic — move file as-is |
| **`components/ui/*` primitives** — Button, Card, Modal, Skeleton | Stable, used by both sides | DO NOT CHANGE — share via copied package, don't fork |
| **Per-page `React.lazy` + `Suspense` + `PageLoader`** | Keeps Treasury/Recharts off the login path | DO NOT CHANGE pattern — preserve in adminFrontend |
| **Admin API contract** — `AdminDashboardStats`, pagination, `AppError` envelope | Frontend types already match backend `data` shape | DO NOT CHANGE shape — share `types/index.ts` slice |
| **`AdminSidebar` badge logic** (pendingWithdrawals/unverifiedInflows/pendingSubscriptions) | Small, legible, derived from one stats fetch | DO NOT CHANGE |
| **Vite `manualChunks` strategy** — marketing chunk split, Recharts deliberately not hoisted | Correctly keeps charting on-demand | DO NOT CHANGE approach — replicate in adminFrontend vite config |

---

## 5. Architectural Problems (focused on the admin/user seam)

### P1 — Single SPA owns two trust domains (CONFIRMED, HIGH)

`frontend/src/App.tsx` mounts `AdminRoute + AdminLayout` alongside `ProtectedRoute + AppLayout` in one `BrowserRouter`. A routing mis-wire (e.g., forgetting `AdminRoute` on a new `/admin/*` page) would render an admin page without the role check. The bundle also ships admin strings to every user. Evidence: `App.tsx:210-248` admin block inside the same `<Routes>`.

### P2 — Single origin assumption in CORS & deploy (INFERRED, MEDIUM-HIGH)

`config.cors.frontendUrl` and `render.yaml`/`netlify.toml` describe one frontend. Adding a second origin (`adminFrontend`) requires config that accepts two origins, otherwise admin API calls will be CORS-blocked in production. Current single-origin will break the split if not updated. Evidence: `CLAUDE.md` "CORS (localhost:5173 + 3000 in dev, config.cors.frontendUrl in prod)" — no mention of multi-origin; needs verification against `src/config/index.ts`.

### P3 — Single `auth.store` + single `localStorage` token pair (CONFIRMED, MEDIUM)

`auth.store.ts` stores `accessToken`/`refreshToken`/`user` without namespacing by audience. An admin logging into `frontend` and then into `adminFrontend` on the same origin would clobber tokens. Once split across origins this self-heals (per-origin `localStorage`), but the logout-redirect targets (`/admin/login` vs `/login`) and refresh-fail funnel (`navigate('/login')` in `lib/axios.ts`) must be origin-aware or admins will be bounced to the user login.

### P4 — Ambiguous shared code ownership (CONFIRMED, MEDIUM)

`frontend/src/components/ui/*`, `lib/format.ts`, `lib/fees.ts`, `types/index.ts`, and Tailwind tokens are truly shared. `pages/admin/shared/*` (PageHeader, Panel, StatusPill) looks shared but is admin-only today. Without an explicit share boundary, a future copy-paste will duplicate and drift Tailwind config, `index.css` tokens, and formatters.

### P5 — `adminFrontend/` is empty but git-tracked — no scaffold, no way to verify build (CONFIRMED, LOW)

Directory exists with no `package.json`, `vite.config.ts`, or `src/`. `git status` shows `adminFrontend` as untracked? Actually `ls` returned empty. Until scaffolded, no `npm run build` or typecheck can confirm the extraction compiles.

### P6 — 13 admin routes registered in user app increase attack surface for enumeration (LOW)

Admin paths (`/admin/withdrawals`, `/admin/unverified-inflows`, etc.) are visible in the user bundle's route table even when the user is not admin (they just redirect). Not a vulnerability by itself (API still gates) but leaks admin surface to unauthenticated JS.

---

## 6. Risk Register

| # | Finding | Severity | Confidence | Evidence | Impact | Recommended Action |
|---|---|---|---|---|---|---|
| R1 | Single SPA bundles admin UI to every user; admin routes enumerable in user JS | 🟡 MEDIUM | HIGH | `frontend/src/App.tsx:58-77` imports 13 admin pages; `vite build` manualChunks includes them | Larger bundle, wasted review surface, minor info leak | Extract to `adminFrontend/` (ARCH-ADMIN-03..06) |
| R2 | CORS single-origin will block `adminFrontend` in prod | 🟠 HIGH | MEDIUM | `CLAUDE.md` CORS; `backend/src/config/index.ts` not yet verified to accept list | Admin app fails at runtime in prod with CORS error | ARCH-ADMIN-02 makes `FRONTEND_URL` a CSV allowlist |
| R3 | Auth redirect on 401 / logout bounces admins to user login | 🟡 MEDIUM | HIGH | `frontend/src/lib/axios.ts` refresh-fail → `/login`; `AdminRoute.tsx:5-6` → `/admin/login` | Admin gets stuck in redirect loop across origins | ARCH-ADMIN-07 origin-aware redirects |
| R4 | Shared UI drift — tailwind/tokens/format copied and diverged | 🟡 MEDIUM | MEDIUM | `frontend/src/components/ui/*`, `lib/format.ts`, `index.css` copied without contract | Visual drift, bug fixes land in one app only | ARCH-ADMIN-04 extracts `@wallx/ui` local package or documented copy-set |
| R5 | `admin.stats.store` TTL/inFlight optimization lost in move | 🟢 LOW | HIGH | `frontend/src/stores/admin.stats.store.ts:13-55` | Regression to 2-3x `/admin/dashboard` fan-out | Move file verbatim (ARCH-ADMIN-05) + add test (ARCH-ADMIN-09) |
| R6 | No CI deploy for `adminFrontend` — manual deploy, deploy drift | 🟡 MEDIUM | MEDIUM | `render.yaml`/`netlify.toml` assume single frontend | Admin never deployed or deployed stale | ARCH-ADMIN-11 adds second service/CI job |
| R7 | Silent broken imports after move (alias `@/`, asset paths) | 🟡 MEDIUM | HIGH | `frontend/vite.config.ts:46-49` alias, `tsconfig.json` paths | Build fails or runtime 404s for assets | Verify with `tsc -b && vite build` per work item |
| R8 | Tests still import from old paths (`pages/admin/__tests__`) | 🟢 LOW | MEDIUM | `frontend/src/pages/admin/__tests__/*` | CI green but coverage mis-attributed | ARCH-ADMIN-09 moves tests with pages |

---

## 7. Target Architecture

```
tax by wallx/
  backend/                     (unchanged except CORS allowlist)
    src/config/index.ts        FRONTEND_URL="https://app.wallx.ng,https://admin.wallx.ng"
    src/routes/index.ts        mounts /api/v1/admin as before
  frontend/                    USER APP only  (:5173 → app.wallx.ng)
    src/App.tsx                user/marketing routes only; no admin imports
    src/pages/                 user pages only
    src/components/layout/     AppLayout + Sidebar (AdminLayout removed)
    src/routes/                ProtectedRoute + GuestRoute (AdminRoute removed)
    src/stores/                auth, business, invoice… (admin.stats.store removed)
  adminFrontend/               ADMIN APP only (:5174 → admin.wallx.ng)
    package.json               own deps, own vite, own tailwind
    vite.config.ts             alias @ → src, proxy /api → :3000, own manualChunks
    index.html + src/main.tsx + src/index.css  (copied/adapted from frontend)
    src/App.tsx                AdminRoute + AdminLayout + 13 admin routes only
    src/pages/admin/*          moved verbatim
    src/components/admin/*     moved verbatim
    src/components/layout/     AdminLayout + AdminSidebar (copied)
    src/components/ui/*        shared via @wallx/ui (local package) or disciplined copy
    src/stores/                auth.store (admin-scoped) + admin.stats.store
    src/lib/axios.ts           copy of frontend/lib/axios (admin-aware redirects)
    src/lib/format.ts          shared formatter subset
    src/types/                 AdminDashboardStats + shared types slice
  packages/ui/  (OPTIONAL)     @wallx/ui — Button, Card, Modal, Skeleton, Tailwind preset
```

**Invariants preserved:**
- Backend contract unchanged — both apps hit the same `/api/v1/*` over the same `authenticate/authorize` middleware.
- JWT shape unchanged — `accessToken`/`refreshToken`/`user.role` flow identical; per-origin `localStorage` naturally scopes tokens.
- `admin.stats.store` caching unchanged — 30s TTL + inFlight dedup moved as-is.

**What changes operationally:**
- Dev: `npm run dev` in `frontend/` (:5173) and `npm run dev` in `adminFrontend/` (:5174) — both proxy `/api` to `backend` (:3000). One `backend` serves both.
- Prod: two deployables — `frontend` → `app.wallx.ng` (or `wallx.ng`), `adminFrontend` → `admin.wallx.ng`. Backend `FRONTEND_URL` becomes a comma-separated allowlist.

---

## 8. Current → Target Changes (per major change)

### C1 — Extract admin routing from user `App.tsx`

- **Current:** `frontend/src/App.tsx:58-77` lazy-imports 13 admin pages; `App()` mounts `<Route element={<AdminRoute>}><Route element={<AdminLayout>}>` alongside user routes in one `BrowserRouter`.
- **Proposed:** `frontend/src/App.tsx` imports zero admin pages/routes. `adminFrontend/src/App.tsx` is a new file owning `AdminRoute + AdminLayout + 13 admin Routes` and nothing else (marketing/user routes absent).
- **Why:** Single-router is the root coupling — cutting it is the seam that makes every other move safe to do independently.
- **Benefit:** User bundle no longer ships admin code; route-guard reasoning becomes local.
- **Cost:** Two `App.tsx` to maintain; small duplication (~60 lines of router boilerplate).
- **Risk:** Stale route if a new admin page is added to only one place. Mitigated by checklist item ARCH-ADMIN-06 verification.

### C2 — CORS allowlist

- **Current:** `FRONTEND_URL` single origin (INFERRED; verify in `backend/src/config/index.ts`).
- **Proposed:** `FRONTEND_URL` accepts CSV (`https://app...,https://admin...`) or a new `ADMIN_FRONTEND_URL`; `cors` middleware allows either origin (credentials enabled, `origin: (origin, cb) => allowlist.includes(origin)`).
- **Why:** Second origin blocked in prod otherwise.
- **Benefit:** Admin app works in prod with same backend.
- **Cost:** One config change + env update.
- **Risk:** Mis-parsing CSV (spaces, trailing slash) → silent CORS denial. Acceptance criteria nails exact `Origin` header values.

### C3 — Auth store per-app

- **Current:** One `auth.store.ts` with one `localStorage` keypair; logout redirect hard-codes `/login`.
- **Proposed:** Copy `auth.store.ts` + `lib/axios.ts` into `adminFrontend`. Axios `on 401` refresh-fail redirects to `/admin/login`; logout navigates to `/admin/login`. User app keeps `/login`. No shared `localStorage` across origins (per-origin storage naturally isolates).
- **Why:** Origin-aware redirects and deduped token scope.
- **Benefit:** No redirect-loop when an admin session expires.
- **Cost:** Duplicated auth boilerplate (~200 lines) — acceptable for solo-dev; extract to package later if it hurts.
- **Risk:** Fix to refresh logic must land in both copies. Documented as linked files in work items.

### C4 — Shared UI contract

- **Current:** Admin pages import `@/components/ui/*` from the user app's tree.
- **Proposed (v1):** Copy `components/ui/*` + `lib/format.ts` + `lib/fees.ts` + `types` slice + `index.css` Tailwind tokens into `adminFrontend`. Add a one-line comment header `// Shared with frontend — keep in sync (see docs/shared-ui.md)` and a checklist step to update both on change. **LATER** option: extract `packages/ui` with `@wallx/ui` and a Tailwind preset if drift becomes painful.
- **Why:** Minimal indirection for solo-dev; keeps extraction reversible.
- **Benefit:** No cross-app import path hacks; each app builds standalone.
- **Cost:** Copy drift risk.
- **Risk:** Tailwind token change lands in one app only → visual drift. Mitigated by explicit file list in ARCH-ADMIN-04 acceptance criteria.

### C5 — Build / deploy split

- **Current:** One Vite build, one deploy target.
- **Proposed:** `adminFrontend/package.json` with `dev` (:5174) / `build` / `preview`; `adminFrontend/vite.config.ts` with alias `@`, proxy `/api`, and `manualChunks` adapted (marketing chunk absent, admin chunks own). CI adds a second build job; `render.yaml`/`netlify.toml` add an admin service pointing at `adminFrontend/`.
- **Why:** Independent deploys.
- **Benefit:** Admin can ship without user regression risk, and vice versa.
- **Cost:** Second CI job minutes; second env var set.
- **Risk:** Build drift if `vite.config.ts` copies diverge. Acceptance criteria pins alias/proxy/chunk behaviour.

---

## 9. Prioritized Improvements

### NOW (must ship with the extraction — otherwise the split is broken)

| Priority | Problem | Solution | Benefit | Effort | Risk |
|---|---|---|---|---|---|
| NOW | Admin+user share one router/bundle | ARCH-ADMIN-01..06: scaffold `adminFrontend` and move admin surface | Isolated bundles, clear trust boundary | M | Low — reversible via git |
| NOW | Single CORS origin blocks second app | ARCH-ADMIN-02: allowlist `FRONTEND_URL` | Admin works in prod | S | Low |
| NOW | Auth redirects target wrong app | ARCH-ADMIN-07: origin-aware axios/store redirects | No redirect loop on expiry | S | Low |

### NEXT (ship immediately after, before considering the job "done")

| Priority | Problem | Solution | Benefit | Effort | Risk |
|---|---|---|---|---|---|
| NEXT | Shared UI drift | ARCH-ADMIN-04: disciplined copy set + docs/shared-ui.md | No silent visual divergence | S | Low |
| NEXT | No admin e2e smoke coverage on the new app | ARCH-ADMIN-09: move `pages/admin/__tests__/*` + add admin shell smoke | Confidence the moved app boots | S | Low |
| NEXT | CI still builds one frontend | ARCH-ADMIN-11: second build/deploy job | Admin actually deploys | S | Low |

### LATER (only if scale/pain justifies)

| Priority | Problem | Solution | Benefit | Effort | Risk |
|---|---|---|---|---|---|
| LATER | UI copy drift becomes painful (≥3 fixes landing in one app only) | Extract `packages/ui` (`@wallx/ui`) + Tailwind preset | Single source of truth | M | Adds workspace complexity |
| LATER | Two `auth.store` copies diverge | Extract `@wallx/auth` or `@wallx/api-client` local package | Single auth fix | M | Over-abstracts early |
| LATER | Backend multi-tenant admin analytics needs pagination hardening | Offset→cursor pagination for `/admin/*` lists | Scale beyond current admin volumes | M | Not needed at beta volumes |

### DO NOT DO (insufficient value for cost)

| Proposal | Why not |
|---|---|
| Micro-frontend / module federation between user and admin | Adds runtime coupling, version skew, and build complexity; two independent SPAs are simpler and sufficient. |
| Shared monorepo workspace (pnpm workspaces / Turborepo) | Solo dev, two apps — a local `packages/ui` later is enough; workspace tooling is overhead now. |
| Backend split (admin service vs user service) | Backend `authorize('admin')` is already the correct boundary; splitting doubles deploy/DB concerns for no evidenced need. |
| Rewrite admin in a different framework | No evidence the stack is mismatched; cost dwarfs benefit. |
| Queue / job runner for admin tasks | Current cron + advisory locks are sufficient; no evidenced need for BullMQ yet. |

---

## 10. File & Module Impact Map

Legend: CREATE / MODIFY / MOVE / DELETE / CONFIG / INFRA

| File | Action | Work Item |
|---|---|---|
| `adminFrontend/package.json` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/vite.config.ts` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/tsconfig.json` + `tsconfig.node.json` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/index.html` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/src/main.tsx` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/src/index.css` | CREATE (copy+adapt from `frontend/src/index.css`) | ARCH-ADMIN-01 |
| `adminFrontend/src/vite-env.d.ts` | CREATE | ARCH-ADMIN-01 |
| `adminFrontend/src/App.tsx` | CREATE | ARCH-ADMIN-06 |
| `adminFrontend/src/components/layout/AdminLayout.tsx` | MOVE (copy then delete original) | ARCH-ADMIN-05 |
| `adminFrontend/src/components/layout/AdminSidebar.tsx` | MOVE | ARCH-ADMIN-05 |
| `adminFrontend/src/components/admin/AdminTransferDetailModal.tsx` | MOVE | ARCH-ADMIN-05 |
| `adminFrontend/src/components/admin/ChangePlanModal.tsx` | MOVE | ARCH-ADMIN-05 |
| `adminFrontend/src/pages/admin/**` (13 pages + `dashboard/*` + `shared/*`) | MOVE | ARCH-ADMIN-03 |
| `adminFrontend/src/pages/admin/__tests__/**` | MOVE | ARCH-ADMIN-09 |
| `adminFrontend/src/routes/AdminRoute.tsx` | CREATE (copy from `frontend`) | ARCH-ADMIN-05 |
| `adminFrontend/src/stores/admin.stats.store.ts` | MOVE | ARCH-ADMIN-05 |
| `adminFrontend/src/stores/auth.store.ts` | CREATE (copy + admin redirects) | ARCH-ADMIN-07 |
| `adminFrontend/src/lib/axios.ts` | CREATE (copy + admin redirects) | ARCH-ADMIN-07 |
| `adminFrontend/src/lib/format.ts` | CREATE (copy slice) | ARCH-ADMIN-04 |
| `adminFrontend/src/lib/fees.ts` | CREATE (copy slice) | ARCH-ADMIN-04 |
| `adminFrontend/src/types/index.ts` | CREATE (admin-relevant slice) | ARCH-ADMIN-04 |
| `adminFrontend/src/components/ui/*` | CREATE (copy) | ARCH-ADMIN-04 |
| `adminFrontend/public/*` (if any) | CREATE | ARCH-ADMIN-01 |
| `frontend/src/App.tsx` | MODIFY (remove admin imports + admin routes) | ARCH-ADMIN-08 |
| `frontend/src/components/layout/AdminLayout.tsx` | DELETE (after move) | ARCH-ADMIN-10 |
| `frontend/src/components/layout/AdminSidebar.tsx` | DELETE | ARCH-ADMIN-10 |
| `frontend/src/components/admin/**` | DELETE | ARCH-ADMIN-10 |
| `frontend/src/pages/admin/**` | DELETE | ARCH-ADMIN-10 |
| `frontend/src/routes/AdminRoute.tsx` | DELETE | ARCH-ADMIN-10 |
| `frontend/src/stores/admin.stats.store.ts` | DELETE | ARCH-ADMIN-10 |
| `frontend/src/components/layout/Sidebar.tsx` | MODIFY (remove admin link if present — verify) | ARCH-ADMIN-08 |
| `backend/src/config/index.ts` | MODIFY (CORS allowlist) | ARCH-ADMIN-02 |
| `backend/src/app.ts` | MODIFY (only if CORS wiring lives there) | ARCH-ADMIN-02 |
| `backend/.env.example` | MODIFY (document second origin) | ARCH-ADMIN-02 |
| `render.yaml` / `netlify.toml` / `.github/workflows/*` | MODIFY/CREATE | ARCH-ADMIN-11 |
| `docs/shared-ui.md` (new) | CREATE | ARCH-ADMIN-04 |
| `CLAUDE.md` | MODIFY (document two-frontend dev + deploy) | ARCH-ADMIN-12 |

No `DATABASE` changes. No `infra` beyond second deploy target.

---

## 11. Migration Strategy

### 11.1 Phases

```
Current state:  frontend owns user+admin, adminFrontend empty
      ↓
Intermediate state (per work item, main stays green):
  - adminFrontend scaffolds and builds empty (ARCH-ADMIN-01) — no traffic, no risk
  - backend CORS allowlist lands but single-origin still works (ARCH-ADMIN-02)
  - admin pages copied to adminFrontend, still present in frontend (ARCH-ADMIN-03..07) — dual-owned, either builds
  - verification: both `npm run build` pass; admin manual smoke on :5174; user smoke on :5173
      ↓
Target state:
  - admin imports/routes deleted from frontend (ARCH-ADMIN-10) — user bundle no longer ships admin code
  - adminFrontend is the sole admin owner; frontend is user-only
  - CI deploys two apps to two origins; docs updated (ARCH-ADMIN-11..12)
```

### 11.2 Ordering & safety

- Every MOVE is implemented as **COPY → verify new app builds → then DELETE old** in a later work item. No item deletes before the copy is green.
- `backend` CORS change is backward-compatible (CSV allowlist; single value still works).
- DB, auth contract, and API routes are untouched — no migration, no data backfill.
- Rollback per item is `git revert` of that item's commits (see per-item Rollback). Full rollback is `git revert` in reverse topological order or `git reset --hard origin/main` before merge.

### 11.3 Production rollout

1. Merge the extraction behind no flag — the user app's behaviour is unchanged (only deletions), so no feature flag is needed.
2. Deploy `backend` CORS change first or with the frontend — either order is safe because the old single-origin value is a valid one-element allowlist.
3. Deploy `adminFrontend` to `admin.wallx.ng` (or `adminFrontend` Render service) with `VITE_API_URL` pointing at the same backend. Verify admin login + dashboard + withdrawals + audit-logs.
4. Deploy `frontend` (now admin-free) to `app.wallx.ng` — verify user login, dashboard, sales, invoices, tax.
5. If admin deploy fails, user app is unaffected (separate origin/service). Revert only the admin service.

---

## 12. Implementation Plan — Ordered, Numbered Checklist

> Each item is PR-sized, independently revertible. Work top-to-bottom. `Depends on` is a hard gate — don't start before it lands.

### ARCH-ADMIN-01 — Scaffold `adminFrontend/` as a standalone Vite app

- **Depends on:** None
- **Files touched:** `adminFrontend/package.json` (CREATE), `adminFrontend/vite.config.ts` (CREATE), `adminFrontend/tsconfig.json` (CREATE), `adminFrontend/tsconfig.node.json` (CREATE), `adminFrontend/index.html` (CREATE), `adminFrontend/src/main.tsx` (CREATE), `adminFrontend/src/index.css` (CREATE), `adminFrontend/src/vite-env.d.ts` (CREATE), `adminFrontend/public/*` (CREATE if needed), `adminFrontend/.gitignore` (CREATE)
- **What to do:** Create a Vite 8 + React 19 + TS 5.9 + Tailwind 4 app that builds empty. Mirror `frontend/package.json` deps (react, react-dom, react-router-dom, zustand, axios, axios-retry, lucide-react, recharts, react-hot-toast, @fontsource/*); mirror `frontend/vite.config.ts` alias `@ → src`, proxy `/api → http://localhost:3000`, port `5174`, `tailwindcss()` plugin, `manualChunks` (without marketing chunk), `optimizeDeps`; mirror `frontend/tsconfig.json` paths/strict settings and `frontend/index.html` shell. `src/main.tsx` mounts `<BrowserRouter><App/></BrowserRouter>` with `ErrorBoundary` + `Toaster` skeletons. `src/index.css` is a copy of `frontend/src/index.css` (Tailwind base + theme tokens `primary/success/warning/danger`, fonts Montserrat/Inter, `bg-canvas/text-ink/hairline/panel` tokens used by AdminLayout). No admin routes yet — `App.tsx` renders a placeholder "Admin — scaffold OK".
- **Acceptance criteria:** `cd adminFrontend && npm install && npm run build` exits 0 (no TS errors, no missing alias). `npm run dev` serves on :5174. `tsc -b --noEmit` passes. No import from `frontend/` (standalone).
- **Verification:** `cd adminFrontend && npm run build` + `npm run lint` (if configured). Manual: open http://localhost:5174, see placeholder. Check `dist/` contains `assets/*` chunks and no `marketing-site` chunk.
- **Rollback:** `git rm -rf adminFrontend` or `git revert` the scaffold commit. User app unaffected.
- **Effort:** M (3–5h)
- **Risk if skipped/delayed:** Every later move has no target to land in; plan blocked.

### ARCH-ADMIN-02 — Make backend CORS accept two frontend origins

- **Depends on:** None (parallel with ARCH-ADMIN-01)
- **Files touched:** `backend/src/config/index.ts` (MODIFY), `backend/src/app.ts` (MODIFY if CORS wiring there, else UNVERIFIED), `backend/.env.example` (MODIFY)
- **What to do:** Change `FRONTEND_URL` handling from single string to CSV allowlist. In `config/index.ts`, parse `process.env.FRONTEND_URL` as `split(',').map(s=>s.trim()).filter(Boolean)` into `config.cors.allowedOrigins: string[]`; keep `config.cors.frontendUrl` as alias to the first element for backward compat if referenced elsewhere. In `app.ts` CORS middleware, replace `origin: config.cors.frontendUrl` with `origin: (origin, cb) => { if (!origin) return cb(null,true); cb(null, config.cors.allowedOrigins.includes(origin)); }` with `credentials:true`. Document in `.env.example`: `FRONTEND_URL=https://app.wallx.ng,https://admin.wallx.ng` (dev: `http://localhost:5173,http://localhost:5174`). Keep existing single-value `.env` working (one-element array).
- **Acceptance criteria:** With `FRONTEND_URL=http://localhost:5173,http://localhost:5174`, a `curl -H "Origin: http://localhost:5174" -H "Access-Control-Request-Method: GET" -X OPTIONS http://localhost:3000/api/v1/admin/dashboard` returns `Access-Control-Allow-Origin: http://localhost:5174` and `Access-Control-Allow-Credentials: true`. With the old single value, same `curl` for :5173 still passes. No change to `authorize('admin')` logic.
- **Verification:** `cd backend && npm run build` passes. Manual CORS curl as above for both origins + a disallowed origin returns no ACAO. Existing e2e tests pass (if they set `FRONTEND_URL`, they should still pass).
- **Rollback:** Revert config to single-origin string; set `FRONTEND_URL` back to one value.
- **Effort:** S (1–2h)
- **Risk if skipped/delayed:** `adminFrontend` API calls CORS-blocked in prod; admin app unusable.

### ARCH-ADMIN-03 — Move admin pages into `adminFrontend`

- **Depends on:** ARCH-ADMIN-01
- **Files touched:** `adminFrontend/src/pages/admin/**` (CREATE via copy), `adminFrontend/src/pages/admin/dashboard/**` (CREATE), `adminFrontend/src/pages/admin/shared/**` (CREATE)
- **What to do:** Copy verbatim (no edits) the following from `frontend/src/pages/admin/` to `adminFrontend/src/pages/admin/`: `AdminLogin.tsx`, `AdminDashboard.tsx`, `AdminUsers.tsx`, `AdminUserDetail.tsx`, `AdminBusinesses.tsx`, `AdminAuditLogs.tsx`, `AdminWithdrawals.tsx`, `AdminTransactions.tsx`, `AdminUnverifiedInflows.tsx`, `AdminAISettings.tsx`, `AdminSubscriptions.tsx`, `AdminReviews.tsx`, plus `dashboard/AdminTabBar.tsx`, `FeeSettingsTab.tsx`, `OverviewTab.tsx`, `TaxComplianceTab.tsx`, `TreasuryCharts.tsx`, `TreasuryTab.tsx`, `TreasuryTransferTable.tsx`, `useTreasuryAnalytics.ts`, and `shared/PageHeader.tsx`, `Pagination.tsx`, `Panel.tsx`, `SegmentedControl.tsx`, `StatusPill.tsx`, `format.ts`. Preserve `__tests__` folders in place for now (moved in ARCH-ADMIN-09). Do not edit imports yet — they still say `@/…`; alias wiring from ARCH-ADMIN-01 makes them resolve.
- **Acceptance criteria:** Every listed file exists in `adminFrontend/src/pages/admin/` with identical content (diff only `git status` shows added files, no modifications). No file deleted from `frontend/` yet.
- **Verification:** `cd adminFrontend && npx tsc -b --noEmit` (will error on missing deps — expected until ARCH-ADMIN-04..07 land; track errors as TODO, not gate). `ls adminFrontend/src/pages/admin | wc -l` matches `ls frontend/src/pages/admin | wc -l` minus `__tests__`.
- **Rollback:** `git rm -rf adminFrontend/src/pages/admin` (added files only). No user impact.
- **Effort:** S (1h)
- **Risk if skipped/delayed:** No admin pages to route to; App stays empty.

### ARCH-ADMIN-04 — Establish shared UI / lib contract

- **Depends on:** ARCH-ADMIN-01
- **Files touched:** `adminFrontend/src/components/ui/*` (CREATE copy), `adminFrontend/src/lib/format.ts` (CREATE copy), `adminFrontend/src/lib/fees.ts` (CREATE copy), `adminFrontend/src/types/index.ts` (CREATE slice), `adminFrontend/src/lib/pageTitles.ts` (CREATE if AdminLayout needs it), `docs/shared-ui.md` (CREATE)
- **What to do:** Copy from `frontend/src/` to `adminFrontend/src/`: `components/ui/Button.tsx`, `Card.tsx`, `Input.tsx`, `Modal.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `PageLoader.tsx`, `OptimizedImage.tsx` (+ `OptimizedLogo.tsx`, `ResponsiveImage.tsx` if imported transitively), `lib/format.ts` (full file), `lib/fees.ts`, `types/index.ts` (full file — contains `AdminDashboardStats`, `User`, `Business`, etc.; admin needs the whole slice), `lib/pageTitles.ts` if referenced. Add header comment to each copied file: `// Shared with frontend — keep in sync (see docs/shared-ui.md)`. Create `docs/shared-ui.md` listing the copy set and the rule: "any edit to a shared file must be mirrored to the sibling app in the same PR; extract to `packages/ui` when this costs real time."
- **Acceptance criteria:** All listed files exist in `adminFrontend` and are byte-identical to `frontend` except the header comment. `docs/shared-ui.md` lists every synced file. `cd adminFrontend && npx tsc -b --noEmit` error count strictly decreases vs after ARCH-ADMIN-03.
- **Verification:** `diff` each copied file against `frontend` counterpart (ignoring header). Manual: `AdminDashboard` skeleton renders without missing component errors.
- **Rollback:** Delete copied `components/ui`, `lib/*`, `types` from `adminFrontend` only.
- **Effort:** S (1–2h)
- **Risk if skipped/delayed:** Admin pages fail to compile (missing Button/Card/Skeleton); admin app broken.

### ARCH-ADMIN-05 — Move admin layout / sidebar / route guard / stats store

- **Depends on:** ARCH-ADMIN-01, ARCH-ADMIN-04
- **Files touched:** `adminFrontend/src/components/layout/AdminLayout.tsx` (CREATE copy), `adminFrontend/src/components/layout/AdminSidebar.tsx` (CREATE copy), `adminFrontend/src/routes/AdminRoute.tsx` (CREATE copy), `adminFrontend/src/stores/admin.stats.store.ts` (CREATE copy), `adminFrontend/src/components/admin/AdminTransferDetailModal.tsx` (CREATE copy), `adminFrontend/src/components/admin/ChangePlanModal.tsx` (CREATE copy)
- **What to do:** Copy each file verbatim from `frontend/src/` to `adminFrontend/src/` at the same relative path. No logic edits yet — keep `AdminRoute`'s `useAuthStore` import and `AdminSidebar`'s `useAdminStatsStore` import as-is; they'll resolve once the stores land (ARCH-ADMIN-07 for auth, this item for stats). Preserve `AdminLayout`'s breadcrumb logic, `treasury` tab handling, and `StatusPill` import from `pages/admin/shared/StatusPill`.
- **Acceptance criteria:** All six files exist in `adminFrontend` with identical content to `frontend`. No deletions from `frontend` yet.
- **Verification:** `grep -r "from '@/stores/admin" adminFrontend/src --quiet` succeeds; `npx tsc -b --noEmit` error count decreases (only auth/axios gaps remain).
- **Rollback:** Delete the six files from `adminFrontend`.
- **Effort:** S (1h)
- **Risk if skipped/delayed:** Admin shell (layout/sidebar/guard) missing; no authenticated admin navigation.

### ARCH-ADMIN-06 — Wire `adminFrontend/src/App.tsx` with admin-only routing

- **Depends on:** ARCH-ADMIN-03, ARCH-ADMIN-05, ARCH-ADMIN-07
- **Files touched:** `adminFrontend/src/App.tsx` (CREATE), `adminFrontend/src/routes/ProtectedRoute.tsx` (CREATE if needed for non-admin redirect), `adminFrontend/src/lib/routeChunks.ts` (CREATE if referenced)
- **What to do:** Create `adminFrontend/src/App.tsx` that mirrors `frontend/src/App.tsx` admin block only: `BrowserRouter` → `ErrorBoundary` → `Suspense(PageLoader)` → `Routes`: `Route path="/admin/login" element={<AdminLogin/>}` (standalone, no `AdminRoute` wrapper), `Route element={<AdminRoute/>}><Route element={<AdminLayout/>}>` wrapping `Route path="/admin"`, `/admin/users`, `/admin/users/:userId`, `/admin/businesses`, `/admin/withdrawals`, `/admin/settlement/withdrawals` (→ same component), `/admin/transactions`, `/admin/unverified-inflows`, `/admin/audit-logs`, `/admin/ai-settings`, `/admin/subscriptions`, `/admin/reviews`, plus `* → NotFound` (or redirect to `/admin`). Lazy-load every page via `React.lazy` exactly as `frontend/src/App.tsx:58-77` does. No user/marketing routes. Keep `ScrollToTop` and `Toaster` as in `frontend`.
- **Acceptance criteria:** `adminFrontend/src/App.tsx` contains exactly 14 route entries (1 login + 12 admin + catch-all) and zero user routes (`/dashboard`, `/sales`, `/pricing`). `AdminRoute` guard is the only auth gate. `npm run build` in `adminFrontend` succeeds.
- **Verification:** `cd adminFrontend && npm run build` exits 0. Manual: `npm run dev` → visit `/admin/login` renders AdminLogin; login as `admin@paymytax.com` → redirect to `/admin` shows dashboard; direct nav to `/admin/users` shows users list; non-admin user hitting `/admin` redirects to `/admin/login` (or `/dashboard` per guard — match current behaviour).
- **Rollback:** Revert `adminFrontend/src/App.tsx` to placeholder.
- **Effort:** M (2–3h)
- **Risk if skipped/delayed:** Admin app has no navigable routes; scaffold stays empty.

### ARCH-ADMIN-07 — Admin-scoped auth store + axios (origin-aware redirects)

- **Depends on:** ARCH-ADMIN-01
- **Files touched:** `adminFrontend/src/stores/auth.store.ts` (CREATE copy+edit), `adminFrontend/src/lib/axios.ts` (CREATE copy+edit), `adminFrontend/src/lib/cache.ts` (CREATE if axios imports it)
- **What to do:** Copy `frontend/src/stores/auth.store.ts` and `frontend/src/lib/axios.ts` (and `lib/cache.ts` if needed) into `adminFrontend`. Edit two redirect sites: in `lib/axios.ts`, the 401 refresh-fail handler that currently does `window.location.href='/login'` or `navigate('/login')` must redirect to `/admin/login`; in `auth.store.ts`, `logout()`'s `clear()` call should also `useAdminStatsStore.getState().clear()` and navigate to `/admin/login` (mirror `frontend`'s `logout` which clears `activeBusinessId` etc., but admin has no business store). Keep token keys `accessToken`/`refreshToken` (per-origin `localStorage` isolates them). Keep `fetchMe()` and `getErrorMessage` behaviour identical. If `frontend` axios imports `@/lib/cache`, copy that file too.
- **Acceptance criteria:** `adminFrontend/src/lib/axios.ts` contains exactly one redirect string `/admin/login` and zero `/login` (except as substring of `/admin/login`). `adminFrontend/src/stores/auth.store.ts` `logout` clears `admin.stats.store` and redirects to `/admin/login`. `npx tsc -b --noEmit` passes in `adminFrontend`.
- **Verification:** Unit: mock 401 → assert redirect to `/admin/login`. Manual: login as admin, delete `accessToken` from localStorage, reload — axios refresh fails → lands on `/admin/login`, not `/login`. `cd adminFrontend && npm run build` still passes.
- **Rollback:** Revert both files to verbatim copies of `frontend` (overwrites edits).
- **Effort:** S (1–2h)
- **Risk if skipped/delayed:** Expired sessions bounce admins to the user login (which doesn't exist in `adminFrontend`), leaving a blank page / redirect loop.

### ARCH-ADMIN-08 — Strip admin surface from user `frontend/src/App.tsx` and Sidebar

- **Depends on:** ARCH-ADMIN-06 (admin app must be green before deleting from user app)
- **Files touched:** `frontend/src/App.tsx` (MODIFY), `frontend/src/components/layout/Sidebar.tsx` (MODIFY — only if it contains an admin link), `frontend/src/components/layout/AdminLayout.tsx` usage removals, `frontend/vite.config.ts` (MODIFY if manualChunks referenced admin)
- **What to do:** In `frontend/src/App.tsx`, delete: the 13 `const Admin* = lazy(...)` imports (lines ~58-77), the `import AdminLayout`, `import AdminRoute` lines, and the entire `<Route path='/admin/login'>` + `<Route element={<AdminRoute>}><Route element={<AdminLayout>}>…</Route></Route>` block (lines ~207-248). Keep `SubscriptionGuard`, `MarketingLayout`, and all user/protected routes. In `Sidebar.tsx`, remove any `…admin…` nav item if present (verify via grep — `grep -i admin frontend/src/components/layout/Sidebar.tsx`). In `vite.config.ts`, no change needed unless a `manualChunks` rule explicitly names `pages/admin` — keep current chunking.
- **Acceptance criteria:** `grep -r "Admin" frontend/src/App.tsx` returns zero hits. `grep -r "pages/admin" frontend/src` returns zero hits (excluding `__tests__` that are deleted in ARCH-ADMIN-10). `cd frontend && npm run build` exits 0 and `dist/` no longer contains `AdminDashboard`/`AdminUsers` chunks (verify via `dist/stats.html` or `ls dist/assets`).
- **Verification:** `cd frontend && npm run build && npm run lint`. Manual: user app `npm run dev` → login as `john@example.com` → navigate dashboard/sales/expenses/tax — all work; visit `/admin` → `NotFound` (no longer an admin route). No console errors about missing admin chunk.
- **Rollback:** `git revert` this commit — admin routes reappear in user app (dual-owned intermediate state is safe).
- **Effort:** S (1h)
- **Risk if skipped/delayed:** User bundle continues to ship admin code; split benefit not realized.

### ARCH-ADMIN-09 — Move admin tests and add admin shell smoke

- **Depends on:** ARCH-ADMIN-03, ARCH-ADMIN-08
- **Files touched:** `adminFrontend/src/pages/admin/__tests__/**` (MOVE), `adminFrontend/src/components/admin/__tests__/**` (MOVE), `adminFrontend/src/stores/__tests__/**` (MOVE if admin-related), `adminFrontend/src/pages/__tests__/core-navigation-hubs.test.tsx` (CREATE smoke), `adminFrontend/vitest` config (CREATE if needed)
- **What to do:** Move (copy then delete original in ARCH-ADMIN-10) `frontend/src/pages/admin/__tests__/AdminTransactions.test.tsx`, `AdminUserDetail.test.tsx`, `AdminUsersPayoutMode.test.tsx`, `AdminUsersPlanIntegration.test.tsx`, `AdminWithdrawalsAndPayoutMode.test.tsx` and `frontend/src/components/admin/__tests__/ChangePlanModal.test.tsx` to `adminFrontend` at same relative paths. Copy `frontend/vitest` setup (`vitest` dep already in `adminFrontend/package.json` from ARCH-ADMIN-01) and `src/test/setup.ts`. Add a minimal smoke test `admin-shell.test.tsx` that renders `App` and asserts `/admin/login` and `/admin` routes mount without crash. Update import paths if any test imports from `@/components/ui` — now resolves via adminFrontend alias.
- **Acceptance criteria:** `cd adminFrontend && npm test` passes (all moved tests green). `cd frontend && npm test` still passes (moved admin tests no longer run there). No test imports from `frontend/` paths.
- **Verification:** `npm test` in both apps. CI will run both `npm test` commands (see ARCH-ADMIN-11).
- **Rollback:** Move test files back to `frontend`.
- **Effort:** S (1–2h)
- **Risk if skipped/delayed:** Admin app ships without test coverage; regressions undetected.

### ARCH-ADMIN-10 — Delete admin leftovers from `frontend/`

- **Depends on:** ARCH-ADMIN-08, ARCH-ADMIN-09
- **Files touched:** `frontend/src/pages/admin/**` (DELETE), `frontend/src/components/admin/**` (DELETE), `frontend/src/components/layout/AdminLayout.tsx` (DELETE), `frontend/src/components/layout/AdminSidebar.tsx` (DELETE), `frontend/src/routes/AdminRoute.tsx` (DELETE), `frontend/src/stores/admin.stats.store.ts` (DELETE), `frontend/src/pages/admin/__tests__/**` (DELETE)
- **What to do:** Delete the listed files/directories from `frontend` now that `adminFrontend` owns them and `frontend/src/App.tsx` no longer references them. Verify no remaining import points to a deleted path via `grep -r "AdminLayout\|AdminSidebar\|AdminRoute\|admin.stats" frontend/src`. Keep `frontend/src/types/index.ts` (it still serves user domain) — do not delete.
- **Acceptance criteria:** `ls frontend/src/pages/admin 2>&1` → "No such file…". `ls frontend/src/components/admin 2>&1` → same. `grep -R "from.*admin" frontend/src --include="*.ts" --include="*.tsx"` returns zero hits. `cd frontend && npx tsc -b --noEmit` and `npm run build` both pass.
- **Verification:** `cd frontend && npm run build && npm test`; `grep` sweep above; manual smoke of user app still passes.
- **Rollback:** `git revert` or `git checkout HEAD~1 -- frontend/src/pages/admin frontend/src/components/admin …` to restore deleted files.
- **Effort:** S (0.5h)
- **Risk if skipped/delayed:** Dead code remains in user app; bundle benefit not realized; future edits land in the wrong place.

### ARCH-ADMIN-11 — Second build/deploy target (CI + hosting)

- **Depends on:** ARCH-ADMIN-06 (admin app must build before CI can deploy it)
- **Files touched:** `.github/workflows/*` (MODIFY/CREATE), `render.yaml` (MODIFY), `netlify.toml` (MODIFY or ADD), `adminFrontend/.env.example` (CREATE)
- **What to do:** 
  - GitHub Actions: duplicate the existing `frontend` build job for `adminFrontend` — `working-directory: adminFrontend`, `npm ci && npm run build`, `npm test` — and add a second deploy step (Render/Netlify/Vercel) pointing at `adminFrontend/dist`. Keep the two jobs independent so a user-app failure doesn't block admin deploy and vice versa.
  - `render.yaml`: add a second `type: web` service `name: wallx-admin` with `rootDir: adminFrontend`, `buildCommand: npm ci && npm run build`, `staticPublishPath: dist`, `envVars: VITE_API_URL, VITE_ENABLE_TRANSFER_SIMULATOR` (same values as user app). Or if using Netlify, add a second site linked to `adminFrontend/`.
  - Create `adminFrontend/.env.example` with `VITE_API_URL=http://localhost:3000` (dev) and `VITE_API_URL=https://api.wallx.ng` (prod) — same var name as `frontend/.env.example`.
- **Acceptance criteria:** Pushing `main` triggers two builds (user + admin) in CI; both `dist/` artifacts are published. `adminFrontend` is reachable at `admin.wallx.ng` (or Render preview URL) and can login. `frontend` remains at `app.wallx.ng` unaffected.
- **Verification:** Open CI run → two build jobs green. `curl https://admin.wallx.ng` returns 200 with admin JS bundle. Manual login smoke as above on the deployed URL (not just localhost).
- **Rollback:** Disable the admin deploy job/service; user app deploy unaffected.
- **Effort:** M (2–4h, depends on hosting)
- **Risk if skipped/delayed:** Admin app builds locally but never reaches prod; team reverts to deploying `frontend` for admins.

### ARCH-ADMIN-12 — Docs + CLAUDE.md + README

- **Depends on:** ARCH-ADMIN-11
- **Files touched:** `CLAUDE.md` (MODIFY), `README.md` (MODIFY), `docs/shared-ui.md` (already created in ARCH-ADMIN-04 — update), `adminFrontend/README.md` (CREATE)
- **What to do:** Update `CLAUDE.md` → Commands section: add `adminFrontend` block (`cd adminFrontend && npm run dev` :5174, `npm run build`, `npm run preview`); Running Both section: "start backend :3000, frontend :5173, adminFrontend :5174; backend CORS allowlist `FRONTEND_URL=http://localhost:5173,http://localhost:5174`". Update `README.md` similarly. Update `docs/shared-ui.md` with final file list and verification steps. Create `adminFrontend/README.md` with one-paragraph purpose and dev/build instructions.
- **Acceptance criteria:** `CLAUDE.md` mentions `adminFrontend` in Commands, Running Both, and Architecture (admin app boundary). `README.md` documents two frontends. `docs/shared-ui.md` is the source of truth for synced files.
- **Verification:** `grep -r adminFrontend CLAUDE.md README.md docs/shared-ui.md` returns hits. No stale references to "admin lives in frontend".
- **Rollback:** Revert docs.
- **Effort:** S (0.5h)
- **Risk if skipped/delayed:** New contributors run only `frontend` and miss admin; onboarding confusion.

---

## 13. Architecture Scores

### Before (current, single SPA)

| Dimension | Score | Justification |
|---|---|---|
| Maintainability | 5/10 | Admin+user mixed in one router/layout; solo-dev can still navigate, but every admin change touches user-owned `App.tsx` |
| Modularity | 4/10 | Trust domains (user vs admin) not modularized; one bundle, one deploy, shared stores |
| Scalability | 6/10 | Backend correct (stateless, Prisma, Paystack abstraction); frontend scalability is bundle-size, not infra |
| Reliability | 7/10 | Backend `authorize('admin')` is solid; UI reliability hurt by single-origin CORS assumption for future split |
| Security | 5/10 | API authz correct; UI boundary weak (admin routes in user bundle, single `localStorage` namespace) |
| Testability | 6/10 | Admin `__tests__` exist but coupled to user app's `vitest` setup; `admin.stats.store` TTL/inFlight is testable |
| Data Architecture | 8/10 | Prisma schema sound; admin queries reuse same models; no data-layer split needed |
| API Architecture | 8/10 | `/api/v1/admin/*` cleanly separated, paginated, error-envelope consistent |
| Observability | 6/10 | Winston + Sentry + AuditLog; admin actions audit-logged, but no per-app frontend error boundary distinction |
| Deployment Arch | 5/10 | Single frontend deploy; no admin deploy independence; `render.yaml` single service |
| **Overall** | **5.8/10** | Workable beta-stage monolith; the next seam to cut is the frontend trust boundary |

### After (target, two SPAs — once NOW+NEXT land)

| Dimension | Score | Justification |
|---|---|---|
| Maintainability | 8/10 | Two focused apps, explicit shared contract, per-app `App.tsx` |
| Modularity | 8/10 | Admin and user are independent deployables with a narrow API contract |
| Scalability | 7/10 | Frontend bundles smaller per audience; backend unchanged (still correct) |
| Reliability | 8/10 | Per-origin CORS allowlist, origin-aware 401 redirects, independent deploy rollback |
| Security | 7/10 | Admin UI not shipped to users; API authz unchanged (still the real gate) |
| Testability | 8/10 | Per-app `vitest` suites; admin shell smoke covers the moved routes |
| Data Architecture | 8/10 | Unchanged (no split) |
| API Architecture | 8/10 | Unchanged (contract preserved) |
| Observability | 7/10 | Per-app Sentry DSN possible; audit log unchanged |
| Deployment Arch | 8/10 | Two deployables, independent deploys, shared backend |
| **Overall** | **7.6/10** | Target is appropriate for Q2 2026 solo-dev beta → early scale; no over-engineering |

---

## 14. Top 10 Recommendations (ranked by value)

1. **Scaffold `adminFrontend/` first (ARCH-ADMIN-01)** — unblocks every other move; zero risk until it builds.
2. **Fix CORS allowlist before any prod deploy (ARCH-ADMIN-02)** — otherwise the split is dead on arrival in prod.
3. **Move pages verbatim, don't refactor them (ARCH-ADMIN-03..05)** — value is the split, not a redesign; refactor after.
4. **Keep shared UI as disciplined copy, not a premature package (ARCH-ADMIN-04)** — package extraction is LATER; copy is reversible and fast.
5. **Origin-aware auth redirects (ARCH-ADMIN-07)** — one-line fix that prevents the most confusing post-split bug (redirect loop).
6. **Delete from `frontend` only after `adminFrontend` builds green (ARCH-ADMIN-08..10 ordering)** — copy-then-delete, never delete-then-copy.
7. **Second CI/deploy job (ARCH-ADMIN-11)** — without it, adminFrontend is a local-only demo.
8. **Preserve `admin.stats.store` TTL/inFlight exactly (ARCH-ADMIN-05)** — small optimization that prevents 2–3x fan-out regression.
9. **Add admin shell smoke test (ARCH-ADMIN-09)** — cheapest confidence that the moved router mounts.
10. **Document the seam (`docs/shared-ui.md` + `CLAUDE.md`) (ARCH-ADMIN-04/12)** — prevents drift from day one; costs 30 minutes, saves hours.

---

## 15. Remaining Unknowns (do not guess — flag and gate)

| Unknown | Why it matters | How to resolve (gate) |
|---|---|---|
| Exact `backend/src/config/index.ts` CORS parsing — single string vs list, and where `FRONTEND_URL` is validated | ARCH-ADMIN-02 implementation depends on it | READ `backend/src/config/index.ts` + `backend/src/app.ts` before editing; mark VERIFIED in that PR |
| Whether `frontend/src/components/layout/Sidebar.tsx` contains an admin link today | ARCH-ADMIN-08 scope | `grep -i admin` in that file before editing |
| Whether `adminFrontend` was ever populated on another branch (history) | Could cause merge conflict if another branch already scaffolded it | `git log --all -- adminFrontend/` before ARCH-ADMIN-01 |
| Hosting choice for adminFrontend (Render second service vs Netlify second site vs Vercel) | ARCH-ADMIN-11 deploy wiring | Ask before ARCH-ADMIN-11: "Where should `admin.wallx.ng` point?" — default to same provider as `frontend` |
| Whether `VITE_API_URL` vs `VITE_API_BASE` is the env var name already in use | Env var naming for adminFrontend | Check `frontend/.env.example` + `frontend/src/lib/axios.ts` baseURL construction |
| `FRONTEND_URL` in prod secrets manager — how many places store it | ARCH-ADMIN-02 env update | Check Render/Netlify env vars + `.env` vault |

Blocked items: none — all NOW items can start with either CORS variant; the only hard gate is reading `config/index.ts` inside the ARCH-ADMIN-02 PR itself (not before).

---

## 16. Final Verdict

- **Current biggest strength:** Backend admin boundary is correct (`authenticate + authorize('admin')` on one router, all admin service writes audited, no per-handler drift) and the admin frontend already exists as a coherent set of pages/layout/stores that can be moved verbatim without redesign.
- **Biggest problem:** Frontend trust domains are colocated — one `App.tsx`, one bundle, one origin. Every user deploy ships admin code, and every admin change risks the user app.
- **Biggest risk if left unchanged:** The team scales admin features (withdrawals, settlements, unverified inflows, subscriptions, reviews) and the single-SPA `App.tsx` becomes the merge bottleneck; a permissive CORS or routing mistake widens the admin surface to users. Bundle size and deploy coupling also grow linearly with admin features.
- **Highest-value first move:** ARCH-ADMIN-01 (scaffold `adminFrontend/`) — it's the only item that unblocks the rest and has zero regression risk until deletions land. Pair it with ARCH-ADMIN-02 (CORS allowlist) so the new app works in prod on day one.
- **Overall verdict:** 🟡 Healthy but needs targeted work — the architecture is sound for beta, but the admin/user frontend seam is the next load-bearing cut. The extraction is bounded (no backend/DB changes), reversible (copy-then-delete), and sized for a solo dev (12 work items, ~3 days total). Do it before admin surface grows further; don't turn it into a monorepo/packaging premature optimization.

---

## Appendix A — Verification Checklist (run after every work item)

```
cd adminFrontend && npm run build   # or cd frontend && npm run build, per item
cd adminFrontend && npm test        # after ARCH-ADMIN-09
cd backend && npm run build
curl -H "Origin: http://localhost:..." http://localhost:3000/api/health
Manual: admin login → /admin → users → withdrawals → audit-logs
Manual: user login → /dashboard → sales → invoices → tax
grep -R "from '@/pages/admin" frontend/src  # should be 0 after ARCH-ADMIN-10
```

## Appendix B — Effort Roll-up

| Tier | Items | Total |
|---|---|---|
| NOW | ARCH-ADMIN-01 (M), 02 (S), 03 (S), 04 (S), 05 (S), 06 (M), 07 (S), 08 (S) | ~2 days |
| NEXT | ARCH-ADMIN-09 (S), 10 (S), 11 (M), 12 (S) | ~1 day |
| **Total bounded work** | **12 items** | **~3 days solo-dev (20–26h)** |

LATER items (`packages/ui` extraction, `@wallx/auth` package, cursor pagination) are explicitly not part of this plan's scope — they are gated on "drift actually hurts" signal.

## Appendix C — What This Plan Is NOT

- Not a rewrite (admin pages move verbatim).
- Not a backend split (API stays one service).
- Not a monorepo/workspaces adoption (two standalone Vite apps, one shared-backend).
- Not a design overhaul (Tailwind tokens, shadcn-style UI, marketing pages untouched).
- Not a queue/microservice addition.

Goal: **make the architecture as simple as possible, but no simpler — appropriate to a solo-dev Q2 2026 beta.**

