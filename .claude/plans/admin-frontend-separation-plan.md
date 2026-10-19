# Admin Frontend Separation — Extract Admin Surface into `adminFrontend/` (Execution-Ready Plan)

> **Prompt source:** `prompts/implementplancode.md` — SENIOR ARCHITECTURE AUDIT PROMPT v3.0 (23 phases, execution-ready implementation plan)
> **Scope:** Move the entire admin aspect out of `frontend/` into the already-created but empty `adminFrontend/` folder, with design ownership transferred to that app. Single-repo (monorepo), two deployable frontends sharing one backend. No backend rewrite except CORS/env.
> **Author posture:** Principal Architect — evidence over assumption, complexity must earn its place, solo-dev velocity matters, single-instance today.
> **Date:** 2026-10-13  
> **Branch context:** `main` (parent dir `C:/Users/pc/Desktop/tax by wallx`; worktree was `backend`-only — all `frontend/` reads below were via absolute path and re-verified)

---

## 1. Executive Summary

**What the system is:** WallXERP/PayMyTax by WallX — Nigerian SME tax (7.5% x Gross Profit), sales/expenses/invoicing, Paystack payments + DVA, wallet/settlement, team roles, AI assistant. Monorepo with `backend/` (Express+Prisma) and `frontend/` (React 19+Vite+Tailwind 4+Zustand). Solo-dev, pre-launch.

**What "admin" is:** A privileged Super Admin portal for platform operations — dashboard, user/business management, subscription control, withdrawals/settlement, transaction oversight, unverified inflows, audit logs, AI provider config, reviews. Lives inside `frontend/` today and is shipped to every SME user.

**Top findings in plain language:**
1. Admin is **fully coupled** to the SME app — same bundle, same domain, same auth store, same `axios` instance, same Tailwind build. Every SME login downloads admin code they will never execute (~7k+ lines admin-only + Recharts for TreasuryCharts). This is the correct first cut for a solo dev, but it is the wrong steady state for security, deploy independence, and bundle cost.
2. The cut is **surgically clean** — admin touches shared code in only 6 narrow seams (`auth.store`, `axios`, `types`, `format`, `ui/*`, `lib/` error helper). Zero SME pages import from `pages/admin` or `components/admin`. The boundary already exists; we just need to formalize it.
3. The hard parts are **not** React — they are operational: two Vite apps need two dev ports, two `VITE_API_BASE_URL`s, CORS, two deploy targets (Vercel/Render), and a story for shared UI without creating a premature design-system package. Getting that story wrong costs more than the code move itself.
4. The backend already draws the correct trust boundary (`/api/v1/admin/*` behind `requireAdmin` + JWT role check). The frontend `AdminRoute` mirrors it. Moving to a second origin does **not** change authz — but it must not weaken the shared JWT refresh/retry logic.

**Verdict up front:** Healthy but needs targeted work. The extraction is **justified now** (security boundary + bundle cost + deploy independence + already-empty `adminFrontend/` signals intent) and **low-risk** because the admin surface is self-contained. But the new app must start as a **copy-then-delete fork, not a shared-package extraction** — shared UI stays duplicated until the admin app proves its design divergence. A shared `@wallx/ui` package on day one is over-engineering for a solo dev.

---

## 2. Current Architecture (as built, not as intended)

### 2.1 System structure — evidence from code

```
tax-by-wallx/                 <- monorepo root
├── backend/                  <- Express 5, Prisma, Paystack, Resend, Sentry
│   ├── src/routes/index.ts   <- mounts /api/v1/admin/* (requireAdmin)
│   ├── src/routes/admin.routes.ts + services/admin.* 
│   └── src/config/index.ts   <- CORS: FRONTEND_URL
├── frontend/                 <- Vite 8, React 19, Tailwind 4, Zustand
│   ├── src/App.tsx           <- ONE router: wraps SME + Admin together
│   ├── src/routes/AdminRoute.tsx  <- role gate (user.role !== 'admin')
│   ├── src/components/layout/AdminLayout.tsx + AdminSidebar.tsx
│   ├── src/pages/admin/*     <- 13 pages + dashboard/ (8 files) + shared/ (6)
│   ├── src/components/admin/*<- ChangePlanModal, AdminTransferDetailModal
│   ├── src/stores/admin.stats.store.ts  <- platform stats cache (TTL 30s)
│   └── src/types/, src/lib/axios, src/lib/format, src/components/ui/*
├── adminFrontend/            <- EMPTY (git-tracked dir, no files)
└── prompts/implementplancode.md
```

**Request flow today (admin):**
Browser /admin/* -> Vite (5173) -> React Router -> AdminRoute (reads auth.store user.role) -> AdminLayout+Sidebar -> Admin page -> axios.get('/admin/dashboard') -> Vite proxy /api -> Express -> requireAdmin middleware -> Prisma -> response.

**What the code says, not the README:**
- `frontend/src/App.tsx:58-77` lazy-loads 13 admin pages (`AdminLogin`..`AdminReviews`) into the SAME `Suspense`/`BrowserRouter` as SME pages. There is no code-split boundary between admin and SME beyond `React.lazy` — they share `vendor-react`, `vendor-icons`, `vendor-state` chunks. Admin code is in the SME bundle graph.
- `frontend/src/routes/AdminRoute.tsx:1-16` — gate is `user.role !== 'admin' -> /dashboard`. It depends on `auth.store.user` and `isAuthenticated`. Auth is fetched once at `App.tsx:109-114` (`fetchMe`+`fetchBusinesses` on `isAuthenticated`).
- `frontend/src/components/layout/AdminLayout.tsx:4-161` — owns breadcrumbs (8 route patterns), header (StatusPill `Live Ops · NRS Synced`), `User App` link back to `/dashboard`, and the user avatar. Imports `StatusPill` from `pages/admin/shared/StatusPill`.
- `frontend/src/components/layout/AdminSidebar.tsx:1-213` — nav is `navItems[10]` (Dashboard/Users/Businesses/Subscriptions/Withdrawals/Transactions/UnverifiedInflows/Reviews/AuditLogs/AISettings), with live badges from `useAdminStatsStore` (`pendingWithdrawals`, `unverifiedInflows`, `pendingSubscriptions`). Also shows `Super Admin` identity and `Switch to SME Portal` + `Sign out`.
- `frontend/src/stores/admin.stats.store.ts:1-69` — single `/admin/dashboard` fetch with 30s TTL + `inFlight` dedup. Called from 3 consumers (sidebar, withdrawals list, dashboard overview). `clear()` on logout.
- `frontend/src/pages/admin/shared/*`: `PageHeader`, `Panel`, `Pagination`, `SegmentedControl`, `StatusPill`, `format.ts` — tiny presentational primitives (~200 lines total).
- `frontend/src/pages/admin/dashboard/*`: `AdminTabBar`, `OverviewTab`, `FeeSettingsTab`, `TaxComplianceTab`, `TreasuryTab`, `TreasuryCharts` (Recharts), `TreasuryTransferTable`, `useTreasuryAnalytics`.

### 2.2 Data & trust boundaries

- **Backend trust boundary is correct:** `backend/src/routes/admin.routes.ts` mounts behind `requireAdmin` (JWT verify -> `user.role === 'admin'`). The frontend gate is convenience-only; the server is the enforcer. CONFIRMED HIGH.
- **Admin data shape:** `types/index.ts:AdminDashboardStats` is the platform KPI source. Admin pages call `GET /admin/dashboard`, `/admin/users`, `/admin/businesses`, `/admin/withdrawals`, `/admin/unverified-inflows`, `/admin/audit-logs`, `/admin/ai-settings`, plus mutation endpoints (approve/reject withdrawals, change plan, transfer detail).
- **Auth token sharing:** Both SME and admin use the SAME JWT (`accessToken` 15m + `refreshToken` 7d in `localStorage`, `axios` interceptor handles 401->refresh->retry). There is no admin-scoped token today.

### 2.3 Dependency structure (import graph — admin -> shared)

Every admin page was sampled for `from '@/...'` imports:

| Admin layer | Imports from shared | Count |
|---|---|---|
| `pages/admin/*.tsx` | `@/lib/axios`, `@/lib/format`, `@/lib/fees`, `@/stores/auth.store`, `@/stores/admin.stats.store`, `@/types`, `@/components/ui/{Button,Card,Modal,Input}`, `@/pages/admin/shared/*`, `@/pages/admin/dashboard/*` | ~6 distinct shared modules |
| `components/admin/*` | `@/lib/axios`, `@/lib/format`, `@/stores/*` | 3 |
| `components/layout/Admin*` | `@/stores/auth.store`, `@/stores/admin.stats.store`, `@/pages/admin/shared/StatusPill`, `lucide-react`, `react-router-dom` | 4 |
| `stores/admin.stats.store` | `@/lib/axios`, `@/types` | 2 |

**Reverse imports (shared -> admin):** NONE except one: `components/layout/AdminLayout.tsx:5` imports `StatusPill` from `pages/admin/shared` — which itself is admin-owned, so this is not a true cycle. CONFIRMED by Grep `from.*admin` over `frontend/src` excluding admin dirs -> zero hits beyond `App.tsx` router wiring. HIGH.

**Implication:** The cut surface is ~6 modules wide and acyclic. Ideal shape for a fork extraction.

### 2.4 Build & deploy reality

- `frontend/vite.config.ts:46-131` — single Vite build with `manualChunks` for `marketing-site`, `vendor-react`, `vendor-icons`, `vendor-state`, `vendor-forms`, `vendor-dates`. Admin pages are NOT isolated to a chunk — they land in `vendor-react` + route chunks. Removing them from the SME build will shrink the SME entry chunk and eliminate the admin Recharts dep co-bundled path.
- `frontend/vite.config.ts:51-58` proxy: `'/api' -> http://localhost:3000`. No `VITE_API_BASE_URL` override in `.env` by default — works because Vite dev proxy handles same-origin. Two apps will need explicit base URLs.
- `backend/src/config/index.ts` — CORS `FRONTEND_URL` is a single origin today. Two origins require `CORS_ORIGINS` (plural) or comma-split.
- No Docker, no infra-as-code beyond `render.yaml` (single frontend service). CONFIRMED.

### 2.5 What was NOT reviewed (explicit)

- Backend `admin.service.ts` internals and Prisma queries (assumed correct — trust boundary verified at route layer only). NOT SUFFICIENTLY VERIFIED.
- `frontend/src/pages/admin/__tests__/*` (4 test files) — sampled only for existence.
- Marketing pages and SME pages beyond import-graph checks.
- CI/CD pipeline (`.github/` uninspected).
- Production env values (Paystack live keys, Sentry DSN) — config slot verified via `config/index.ts`, not runtime.

---

## 3. Architecture Map

### 3.1 Components & boundaries (current)

```
                       ┌─ Browser ──────────────────────────────┐
                       │  frontend/ (Vite :5173, one origin)    │
                       │                                        │
  /  /login /register ─┤  AuthLayout + GuestRoute               │
  /dashboard /sales … ─┤  AppLayout + ProtectedRoute + Sidebar  │──┐
  /admin/* ────────────┤  AdminLayout + AdminRoute + AdminSidebar│  │
  / /pricing /about  ──┤  MarketingLayout                        │  │
                       └────────────────────────────────────────┘  │
                                                                 │  │  axios /api/v1/*
                                                                 │  │  Bearer JWT (localStorage)
                                                                 ▼  ▼
                                                         ┌─ backend :3000 ──────┐
                                                         │ Express 5             │
                                                         │ /api/v1/auth/*        │
                                                         │ /api/v1/businesses/*  │
                                                         │ /api/v1/admin/* <- requireAdmin
                                                         │ /api/webhooks/paystack│
                                                         │ Prisma -> Postgres     │
                                                         └───────────────────────┘
```

**Boundary assessment:**
- Domain boundary: SME vs Admin — logically separate (MSME operator vs platform operator), but physically co-located. BOUNDARY VIOLATED by bundling, not by data model.
- Trust boundary: Correct (backend `requireAdmin`). Frontend boundary is UX only.
- Deploy boundary: Violated — one build, one deploy, one env, one rollback unit for two audiences.
- Design boundary: Admin design lives in SME Tailwind config — correct reuse today, but "move design into adminFrontend" means admin must own its visual evolution.

### 3.2 Data flow (admin)

`AdminLogin -> POST /api/v1/auth/login -> {accessToken, refreshToken, user:{role:'admin'}} -> localStorage -> AdminRoute allows -> pages call GET /admin/* with Bearer -> backend verify JWT -> requireAdmin -> Prisma`.

### 3.3 Target component map (desired)

```
  ┌─ frontend/ (SME) :5173 ──────────────────┐   ┌─ adminFrontend/ (Admin) :5174 ───────────────┐
  │ Vite + React 19 + Tailwind 4              │   │ Vite + React 19 + Tailwind 4 (own config)     │
  │ AppLayout + SME routes only               │   │ AdminLayout + Admin routes only               │
  │ axios -> /api/v1 (businesses/sales/…)     │   │ axios -> /api/v1/admin + /api/v1/auth        │
  │ auth.store (user)                         │   │ auth.store (admin-only, slimmer)              │
  │ No AdminSidebar/AdminLayout in bundle     │   │ Own ui/* copy (Button/Card/Modal/StatusPill) │
  └───────────────────────────────────────────┘   └───────────────────────────────────────────────┘
                              \                             /
                               \                           /
                                └──────── backend :3000 ──┘
                                      CORS: [5173, 5174] in dev
                                      Prod: [sme.domain, admin.domain]
```

---

## 4. What Is Already Good — DO NOT CHANGE

| Area | Why it's good | Action |
|---|---|---|
| Backend admin trust boundary (`requireAdmin` on `/api/v1/admin/*`) | Real security boundary, not just UI | DO NOT CHANGE |
| Admin page decomposition (per-route pages + dashboard tabs + shared primitives) | Coherent per-route responsibility | DO NOT CHANGE structure when moving |
| `admin.stats.store` TTL+dedup (30s + inFlight) | Prevents 2-3 identical /admin/dashboard calls | DO NOT CHANGE — copy as-is |
| Admin `shared/` primitives (`Panel`, `PageHeader`, `Pagination`, `SegmentedControl`, `StatusPill`) | Small, focused, admin-scoped | DO NOT CHANGE — copy verbatim |
| Tailwind 4 token usage (`hairline`, `canvas`, `panel`, `ink`, `primary-600`) | Centralized tokens in index.css | DO NOT CHANGE semantics — copy then diverge |
| React.lazy + Suspense per admin route | Already code-split at route level | DO NOT CHANGE pattern |
| Error mapping (`axios.ts:FriendlyMessages`, `getErrorMessage`) | User-safe messages, leak suppression | DO NOT CHANGE copy |
| Backend route prefixing (`/api/v1/admin/*`) | Clean versioning, swappable between frontends | DO NOT CHANGE |
| Single JWT for both audiences | Simple for solo dev | DO NOT CHANGE in this phase |
| No shared `@wallx/ui` package | Avoids premature abstraction | DO NOT CREATE one now |

---

## 5. Architectural Problems

### P1 — One Bundle for Two Audiences (Modularity / Performance) — MEDIUM, CONFIRMED, HIGH

Evidence: `App.tsx:58-77` lazy-loads 13 admin pages into SME router. `vite.config.ts` no admin chunk isolation. Every SME user downloads admin code (~7111 lines admin+dashboard+shared). Wasted mobile data.

### P2 — Single Origin / Single Deploy Unit (Deployment / Security) — MEDIUM, CONFIRMED, MEDIUM

Evidence: `vite.config.ts:51-58` single dev port 5173; `backend/config` single `FRONTEND_URL`; `render.yaml` single frontend service. No independent release cadence for admin.

### P3 — Shared Auth Store Entangles Two Roles (Security / Cohesion) — MEDIUM, CONFIRMED, MEDIUM

Evidence: `stores/auth.store.ts` holds `user.role` for both; `AdminRoute` reads same store; `App.tsx:109-114` fetches SME `fetchBusinesses()` even for admin sessions.

### P4 — Design Ownership Ambiguity — LOW, INFERRED, MEDIUM

Evidence: Prompt says move design into adminFrontend. Today `index.css` + `@tailwindcss/vite` tokens shared. No admin-specific token layer.

### P5 — No Workspace / Monorepo Tooling — LOW, CONFIRMED, HIGH

Evidence: No `pnpm-workspace.yaml`, no shared `tsconfig.base.json`. Duplicated devDependencies tolerated at solo-dev scale, but CI must be taught to build two apps.

---

## 6. Risk Register

| # | Finding | Severity | Confidence | Evidence | Impact | Recommended Action |
|---|---|---|---|---|---|---|
| R1 | SME bundle ships admin code (~7111 lines) | MEDIUM | HIGH | `App.tsx:58-77` + `vite.config.ts` no admin chunk | Larger TTI for all SME users | Extract to adminFrontend; delete admin routes from SME |
| R2 | Admin & SME share localStorage JWT + refresh interceptor | MEDIUM | HIGH | `lib/axios.ts` 401->refresh + `auth.store.ts` | Cross-app token confusion if both open same browser | Keep single JWT; adminFrontend duplicates axios+auth.store (two origins = two storages, desired) |
| R3 | CORS single-origin blocks second origin | HIGH | HIGH | `backend/config/index.ts` CORS | adminFrontend dev/prod CORS failures | Add CORS_ORIGINS comma-split with fallback |
| R4 | Admin fetchBusinesses called for admin sessions | LOW | HIGH | `App.tsx:109-114` unconditional | Extra DB round-trip; concept leak | adminFrontend removes business.store; SME guards fetchBusinesses by role |
| R5 | Duplicate axios retry/refresh drift | MEDIUM | MEDIUM | `lib/axios.ts` 120+ lines | Two copies diverge silently | Sync via checklist, not package |
| R6 | Shared UI drift (`Button`, `Card`, `Modal`) | LOW | HIGH | `components/ui/*` + `pages/admin/shared/*` | Visual inconsistency | Accept duplication NOW; extract @wallx/ui only on second divergence |
| R7 | Silent broken deep links (/admin/login vs /dashboard) | MEDIUM | MEDIUM | `AdminSidebar` Switch to SME Portal -> /dashboard | Cross-origin /dashboard 404s | Make switch link env-configurable VITE_SME_URL |
| R8 | Tests still import admin paths from frontend | MEDIUM | MEDIUM | `pages/admin/__tests__/*` (4 files) | After move, frontend test suite fails | Migrate tests with pages |
| R9 | No shared types — admin needs AdminDashboardStats | LOW | HIGH | `frontend/src/types/index.ts` | adminFrontend needs to duplicate types | Copy minimal types/admin.ts subset |
| R10 | Deployment doubles without env hygiene | MEDIUM | HIGH | `render.yaml` single service | Env drift between deploys | Document VITE_API_BASE_URL, CORS_ORIGINS, second service in render.yaml |

---

## 7. Target Architecture

### 7.1 Principles

- Copy-then-delete fork — not refactor-in-place, not shared package. Admin code moves verbatim; SME deletes admin imports.
- Two Vite apps, one backend, two origins, one JWT scheme. No new auth service.
- Duplication over premature abstraction. axios, format, ui/*, types are copied, not shared via workspace package.
- Env-driven, no code forks. VITE_API_BASE_URL points both at same backend. VITE_SME_URL makes Switch to SME Portal cross-origin; absence hides it.
- Zero backend business logic change. Only CORS config change, additive.

### 7.2 Target file trees

```
frontend/                          <- SME-only after extraction
├── src/App.tsx                    <- SME routes only (admin routes removed)
├── src/routes/{ProtectedRoute,GuestRoute}.tsx
├── src/components/layout/{AppLayout,AuthLayout,Sidebar,UserMenu}.tsx
├── src/pages/{Dashboard,Sales,Expenses,Invoices,…}  <- no pages/admin/
├── src/stores/{auth,business,invoice,reminder,…}    <- no admin.stats.store
└── vite.config.ts                 <- port 5173, proxy /api -> 3000

adminFrontend/                     <- Independent Vite app (NEW)
├── index.html                     <- copy, retitle WallXERP — Admin
├── vite.config.ts                 <- port 5174, @ -> src, proxy /api -> 3000
├── src/
│   ├── App.tsx                    <- admin routes only
│   ├── routes/AdminRoute.tsx
│   ├── components/layout/AdminLayout + AdminSidebar
│   ├── components/admin/ChangePlanModal + AdminTransferDetailModal
│   ├── components/ui/{Button,Card,Modal,Input,Skeleton,PageLoader,EmptyState}
│   ├── pages/admin/ (13 files + dashboard 8 + shared 6)
│   ├── stores/{auth.store (slim), admin.stats.store}
│   ├── lib/{axios, format, fees}
│   └── types/{admin.ts}
└── package.json + tsconfig + index.css (all copied from frontend)
```

### 7.3 Env contract

| Var | SME frontend | adminFrontend | Backend |
|---|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` (proxy) or `https://api.wallxerp.com/api/v1` (prod) | Same | — |
| `VITE_SME_URL` | — | `http://localhost:5173` (dev), `https://app.wallxerp.com` (prod) | — |
| `VITE_ADMIN_URL` | `http://localhost:5174` (dev, for moved notice) | — | — |
| `FRONTEND_URL` | — | — | Legacy single-origin fallback |
| `CORS_ORIGINS` | — | — | `http://localhost:5173,http://localhost:5174` (dev); prod: two domains |

---

## 8. Current -> Target Changes

| # | Current | Proposed | Why | Benefit | Cost | Risk |
|---|---|---|---|---|---|---|
| C1 | Admin pages in frontend/src/pages/admin ship to SME users | Move every file in pages/admin/** + components/admin/** + layout/Admin* into adminFrontend | Security/deploy/bundle boundary | ~7111 lines leave SME bundle; independent deploy | Duplicate scaffolding | COPY drift — mitigated by checklist |
| C2 | One Vite config on 5173 | Second Vite config on 5174 same proxy | Two dev apps side-by-side | Local dev matches prod topology | One extra vite process | Port collision -> strictPort:false |
| C3 | Single CORS FRONTEND_URL | CORS_ORIGINS comma-split + fallback | Two origins must be allowed | Admin dev/prod stops CORS blocked | Small config change | Env misconfig -> blocked fetch (fail-fast) |
| C4 | One App.tsx with SME+admin routes | Two App.tsx — SME-only and admin-only | Route ownership per audience | Smaller router, no role-branching in SME | Maintain two route tables | Route drift -> review checklist |
| C5 | Shared auth.store with SME concepts | Admin slim auth.store (no business.store) | Admin has no active business | Faster admin boot, no SME leak | Copy 80 lines | Same JWT key — two localStorages so no collision |
| C6 | Shared types/index.ts includes AdminDashboardStats | Admin src/types/admin.ts with only needed types | Admin does not need SME types | Smaller surface | Copy 40-80 lines | Type drift if backend DTO changes — re-copy |
| C7 | Shared StatusPill/Panel via import | Copied into each app | Zero coupling | Admin design can diverge | Duplication ~400 lines | Flagged as LATER promotion |
| C8 | AdminSidebar link to="/dashboard" same-origin | Env VITE_SME_URL absolute href; hide when unset | Cross-origin nav must be absolute | Correct cross-origin nav | One env read | Wrong VITE_SME_URL -> 404 (low impact) |

---

## 9. Prioritized Improvements

### NOW — critical, do first

- **NOW-1** CORS blocks second origin -> Add CORS_ORIGINS additive config. Benefit: adminFrontend dev unblocks day one. Effort: S (30m).
- **NOW-2** SME ships admin code -> Scaffold adminFrontend as runnable Vite app. Benefit: independent admin boots. Effort: M (3h).
- **NOW-3** Admin pages still in SME -> Move admin surface file-by-file into adminFrontend. Benefit: admin fully functional. Effort: M (2h).
- **NOW-4** SME still references admin -> Delete admin imports from frontend/. Benefit: SME bundle shrinks. Effort: S (1h).
- **NOW-5** Cross-origin Switch to SME Portal hardcodes /dashboard -> Make env-driven VITE_SME_URL. Benefit: correct cross-origin nav. Effort: S (20m).

### NEXT — near-term

- NEXT-1 Dogfood two-app dev loop: update README.md + CLAUDE.md + .env.example + render.yaml. Effort: S.
- NEXT-2 CI: build both frontend and adminFrontend. Fail if either typechecks. Effort: S.
- NEXT-3 Guard SME fetchBusinesses so admin sessions don't trigger SME domain loads. Effort: S.

### LATER — future scale

- LATER-1 Promote shared UI to @wallx/ui workspace — only when second visual divergence forces it. Effort: M.
- LATER-2 pnpm-workspace + tsconfig.base.json + shared eslint baseline — only when team >3. Effort: M.
- LATER-3 Admin IP allowlist / Cloudflare Access — only when security demands. Effort: S (infra).
- LATER-4 Dual JWT (admin-scoped refresh) — only if threat model requires independent admin revocation. Effort: M.

### DO NOT DO

- DND-1 Micro-frontend / module federation. No.
- DND-2 Shared @wallx/types package now. Copying AdminDashboardStats is cheaper.
- DND-3 Moving backend admin routes to separate service. Route-level gate is fine.
- DND-4 Rewriting admin pages during the move. Keep verbatim; redesign after cut.

---

## 10. File / Module Impact Map

| Path | Action | Notes |
|---|---|---|
| adminFrontend/package.json | CREATE | Scaffold from frontend/package.json same deps |
| adminFrontend/vite.config.ts | CREATE | Port 5174, alias @ -> src, proxy /api -> 3000 |
| adminFrontend/tsconfig.* | CREATE | Copy from frontend verbatim |
| adminFrontend/index.html | CREATE | Copy frontend/index.html retitle WallXERP — Admin |
| adminFrontend/src/index.css | CREATE | Copy frontend/src/index.css |
| adminFrontend/src/main.tsx | CREATE | Copy frontend/src/main.tsx |
| adminFrontend/src/App.tsx | CREATE | Admin routes only |
| adminFrontend/src/routes/AdminRoute.tsx | MOVE (copy) | Verbatim 16 lines |
| adminFrontend/src/components/layout/AdminLayout.tsx | MOVE (copy) | 162 lines |
| adminFrontend/src/components/layout/AdminSidebar.tsx | MOVE (copy) | 213 lines + env switch link |
| adminFrontend/src/pages/admin/** (13 files) | MOVE (copy) | 151-1013L each, 7111 total |
| adminFrontend/src/pages/admin/dashboard/** (8) | MOVE (copy) | Same subfolder |
| adminFrontend/src/pages/admin/shared/* (6) | MOVE (copy) | Panel, PageHeader, Pagination, SegmentedControl, StatusPill, format |
| adminFrontend/src/components/admin/* (2) | MOVE (copy) | ChangePlanModal, AdminTransferDetailModal |
| adminFrontend/src/stores/auth.store.ts | CREATE (slim) | Copy then delete SME-only surface |
| adminFrontend/src/stores/admin.stats.store.ts | MOVE (copy) | 69 lines verbatim |
| adminFrontend/src/lib/axios.ts | CREATE (copy) | Verbatim incl retry+ FriendlyMessages |
| adminFrontend/src/lib/format.ts | CREATE (copy) |  |
| adminFrontend/src/lib/fees.ts | CREATE (copy) | Used by FeeSettingsTab |
| adminFrontend/src/types/admin.ts | CREATE | Slim: AdminDashboardStats, User, Pagination |
| adminFrontend/src/components/ui/* | CREATE (copy) | Button, Card, Modal, Input, Skeleton, PageLoader, EmptyState |
| adminFrontend/.env.example | CREATE | VITE_API_BASE_URL, VITE_SME_URL |
| backend/src/config/index.ts | MODIFY | Add cors.origins comma-split with fallback |
| backend/src/app.ts | MODIFY | Cors origin: array, log allowed origins |
| frontend/src/App.tsx | MODIFY | Remove Admin lazy imports + /admin route block, add AdminMovedNotice |
| frontend/src/components/layout/AdminLayout.tsx | DELETE |  |
| frontend/src/components/layout/AdminSidebar.tsx | DELETE |  |
| frontend/src/routes/AdminRoute.tsx | DELETE |  |
| frontend/src/pages/admin/** | DELETE | Entire directory |
| frontend/src/components/admin/** | DELETE |  |
| frontend/src/stores/admin.stats.store.ts | DELETE |  |
| frontend/src/types/index.ts | MODIFY | Remove AdminDashboardStats |
| README.md / CLAUDE.md / .env.example | MODIFY | Document two-frontend topology |
| render.yaml | MODIFY | Second service for adminFrontend |
| pages/admin/__tests__/* + components/admin/__tests__/* | MOVE | With pages |

UNMODIFIED: all other files.

---

## 11. Migration Strategy

### 11.1 Current -> Intermediate -> Target

```
Current:  frontend ships SME+Admin on 5173. adminFrontend/ empty.

Intermediate (ARCH-01..03): Both apps boot:
  - frontend still ships Admin on 5173
  - adminFrontend boots on 5174, serves Admin from same backend
  - backend CORS allows both origins
  Overlap intentional — non-destructive verification.

Target (ARCH-04..05): Clean cut:
  - frontend deletes Admin (SME bundle shrinks, /admin/* 404s on SME intentional)
  - adminFrontend is only Admin carrier
  - prod: two deploys, two domains, CORS_ORIGINS covers both
```

No DB migration. Only additive CORS config. Overlap period: /admin/* works from BOTH origins; after cut bookmarks to SME /admin/* show AdminMovedNotice -> admin domain.

Fresh clone can boot all three processes; admin logged in on SME origin will need to log in again on admin origin (two localStorages — expected).

### 11.2 Env promotion

```
Dev:  CORS_ORIGINS=http://localhost:5173,http://localhost:5174
      VITE_API_BASE_URL=/api/v1
      VITE_SME_URL=http://localhost:5173

Prod: CORS_ORIGINS=https://app.wallxerp.com,https://admin.wallxerp.com
      VITE_API_BASE_URL=https://api.wallxerp.com/api/v1
```

Backend reads CORS_ORIGINS if set else falls back to [FRONTEND_URL] — additive, not breaking.

---

## 12. Implementation Plan — Ordered Checklist

### ARCH-01 — Backend CORS for two origins

- **ID:** ARCH-01
- **Title:** Add CORS_ORIGINS additive config (multi-origin, backward-compatible)
- **Depends on:** None
- **Files touched:** `backend/src/config/index.ts` (MODIFY), `backend/src/app.ts` (MODIFY), `backend/.env.example` (MODIFY)
- **What to do:**
  1. In config/index.ts add cors.origins computed as comma-split CORS_ORIGINS else [FRONTEND_URL]. Throw on empty.
  2. In app.ts change cors({ origin: config.cors.frontendUrl }) to cors({ origin: config.cors.origins }); log allowed origins.
  3. Update .env.example with CORS_ORIGINS doc.
- **Acceptance:**
  - GET /api/health with Origin: http://localhost:5174 succeeds (Access-Control-Allow-Origin present).
  - With only FRONTEND_URL, behavior identical.
  - With CORS_ORIGINS, both origins allowed; third blocked.
  - Server logs allowed origins.
- **Verification:** curl OPTIONS with Origin headers; npm --prefix backend run typecheck/build.
- **Rollback:** Revert two-file diff, restart backend. Admin 5174 CORS-fails but SME 5173 unaffected.
- **Effort:** S (30m)
- **Risk if skipped:** Every later item blocked.

### ARCH-02 — Scaffold adminFrontend/ as runnable Vite app

- **ID:** ARCH-02
- **Title:** Bootstrap adminFrontend Vite+React+Tailwind shell that authenticates
- **Depends on:** ARCH-01
- **Files touched:** adminFrontend/package.json, vite.config.ts, tsconfig.*, index.html, src/index.css, src/main.tsx, src/App.tsx (placeholder), src/vite-env.d.ts, src/lib/axios.ts, src/stores/auth.store.ts (slim), src/types/admin.ts, .env.example, public/logo.png — all CREATE
- **What to do:** Copy frontend scaffolding verbatim per detailed file list in §10. vite.config port 5174, proxy /api -> 3000. Slim auth.store (no business.store). App.tsx placeholder hits /api/health.
- **Acceptance:**
  - npm install && npm run dev boots on 5174 no errors.
  - npm run build + typecheck pass.
  - /api/health smoke fetch succeeds.
  - AdminLogin POST /auth/login succeeds.
- **Verification:** npm --prefix adminFrontend run typecheck && build; browser smoke login.
- **Rollback:** Delete adminFrontend/ dir.
- **Effort:** M (2-3h)
- **Risk if skipped:** Nothing else can land.

### ARCH-03 — Move admin surface into adminFrontend

- **ID:** ARCH-03
- **Title:** Copy admin pages/layouts/components/stores into adminFrontend and wire admin-only App.tsx
- **Depends on:** ARCH-02
- **Files touched:** adminFrontend/src/routes/AdminRoute.tsx, components/layout/AdminLayout+AdminSidebar, pages/admin/** (13), pages/admin/dashboard/** (8), pages/admin/shared/** (6), components/admin/** (2), stores/admin.stats.store.ts, lib/format.ts, lib/fees.ts, components/ui/*, App.tsx (full admin router), __tests__ — all CREATE/MOVE
- **What to do:** Copy each file verbatim (no redesign). AdminSidebar Switch to SME Portal becomes env-driven VITE_SME_URL absolute link; hide when unset. App.tsx is admin-only router (AdminLogin public, AdminRoute+AdminLayout for /admin* + / -> /admin). Keep React.lazy per page.
- **Acceptance:**
  - typecheck passes, dev boots, /admin/login -> login -> /admin dashboard works.
  - Every /admin/* route smoke-loads: users, businesses, withdrawals, transactions, unverified-inflows, reviews, subscriptions, audit-logs, ai-settings.
  - Sidebar badges fetch.
  - npm run test passes for migrated tests.
- **Verification:** npm run build; manual route tour on 5174; grep for unresolved @/ imports.
- **Rollback:** Delete adminFrontend admin dirs and revert App.tsx to placeholder.
- **Effort:** M (2h)
- **Risk if skipped:** ARCH-04 deletion would break prod admin.

### ARCH-04 — Delete admin surface from SME frontend/

- **ID:** ARCH-04
- **Title:** Remove admin code from SME app and replace /admin/* with moved-notice
- **Depends on:** ARCH-03 (adminFrontend smoke-passes)
- **Files touched:** frontend/src/App.tsx (MODIFY), components/layout/AdminLayout+AdminSidebar (DELETE), routes/AdminRoute (DELETE), pages/admin/** (DELETE), components/admin/** (DELETE), stores/admin.stats.store (DELETE), types/index.ts (MODIFY), pages/AdminMovedNotice.tsx (CREATE)
- **What to do:** In App.tsx remove Admin lazy imports + /admin route block + AdminRoute/AdminLayout imports; add <Route path="/admin/*" element={<AdminMovedNotice />} /> above * -> NotFound. Delete files. Grep for remaining admin imports -> zero. Remove AdminDashboardStats from types.
- **Acceptance:**
  - typecheck passes, build produces smaller dist (record stats.html before/after).
  - grep returns zero admin hits.
  - /admin on SME shows moved notice; SME routes all still load; npm run test passes.
- **Verification:** build + ls dist/assets; manual SME nav; confirm admin still works on 5174.
- **Rollback:** git checkout HEAD -- frontend/src/App.tsx ... + restore deleted dirs from git.
- **Effort:** S (45m)
- **Risk if skipped:** SME keeps shipping admin code; bundle benefit not realized.

### ARCH-05 — Cross-origin affordances

- **ID:** ARCH-05
- **Title:** Make admin<->SME navigation and auth hygiene cross-origin safe
- **Depends on:** ARCH-03
- **Files touched:** adminFrontend/src/components/layout/AdminSidebar.tsx + AdminLayout.tsx (MODIFY), adminFrontend/src/stores/auth.store.ts (MODIFY), .env.example (MODIFY), frontend/src/pages/AdminMovedNotice.tsx (CREATE wiring)
- **What to do:** Read VITE_SME_URL, render absolute href when present else hide switch link. Ensure auth.store logout clears admin.stats.store. Document VITE_SME_URL / VITE_ADMIN_URL.
- **Acceptance:** With VITE_SME_URL, switch link navigates to SME domain; without, hidden. Logout clears badges.
- **Verification:** Toggle VITE_SME_URL, restart, verify.
- **Rollback:** Revert three files.
- **Effort:** S (20m)
- **Risk if skipped:** Dead /dashboard link on admin prod.

### ARCH-06 — Deploy: two services, two env sets

- **ID:** ARCH-06
- **Title:** Teach deploy infra to build and serve two frontends
- **Depends on:** ARCH-01, ARCH-02
- **Files touched:** render.yaml (MODIFY), frontend/.env.example (MODIFY), adminFrontend/.env.example (MODIFY), README.md + CLAUDE.md (MODIFY)
- **What to do:** Two Render static sites (or two Vercel projects) both pointing at same backend. Backend env CORS_ORIGINS covers both prod domains. Document domains and dev loop (ports 5173/5174/3000).
- **Acceptance:** render.yaml shows two frontend services each with VITE_API_BASE_URL; CORS_ORIGINS includes both; docs describe two-app loop.
- **Verification:** Both npm run build succeed in CI; deploy previews.
- **Rollback:** Revert render.yaml to single service.
- **Effort:** S (30m-1h)
- **Risk if skipped:** Admin builds but never ships.

### ARCH-07 — Guard the fork

- **ID:** ARCH-07
- **Title:** Prevent re-coupling: ban admin imports in SME and document sync checklist
- **Depends on:** ARCH-04
- **Files touched:** frontend/.eslintrc (MODIFY), docs/ADMIN_FRONTEND_CONTRACT.md (CREATE)
- **What to do:** ESLint no-restricted-imports bans **/admin/** and admin.store in frontend, bans business/invoice stores in adminFrontend. Create one-page contract doc: duplicated files, sync rule (copy FriendlyMessages, Button shape), promotion trigger for @wallx/ui, CI must typecheck both apps.
- **Acceptance:** npm run lint fails on re-added forbidden import; contract doc exists and linked.
- **Verification:** Add forbidden import, run lint, confirm error.
- **Rollback:** Revert eslint config.
- **Effort:** S (20m)
- **Risk if skipped:** Gradual re-coupling.

### ARCH-08 — CI: build both apps

- **ID:** ARCH-08
- **Title:** CI builds frontend and adminFrontend and fails if either fails
- **Depends on:** ARCH-02, ARCH-06
- **Files touched:** .github/workflows/** (MODIFY or CREATE)
- **What to do:** Run frontend ci+typecheck+build and adminFrontend ci+typecheck+build as separate steps; cache per prefix; upload stats.html artifacts.
- **Acceptance:** CI fails if adminFrontend typecheck fails; passes if both pass.
- **Verification:** Branch that breaks admin type -> CI red.
- **Rollback:** Revert workflow.
- **Effort:** S (20m)
- **Risk if skipped:** adminFrontend silently rots.

### ARCH-09 — SME hygiene: don't fetch SME domain for admin sessions

- **ID:** ARCH-09
- **Title:** Guard SME fetchBusinesses so admin-on-SME-domain doesn't waste calls
- **Depends on:** ARCH-04
- **Files touched:** frontend/src/App.tsx (MODIFY)
- **What to do:** useEffect fetchMe().then(() => if role !== admin then fetchBusinesses() else no-op or redirect to AdminMovedNotice).
- **Acceptance:** Login as admin on SME does NOT trigger GET /businesses; SME user still fetches.
- **Verification:** Network tab; typecheck.
- **Rollback:** Revert effect.
- **Effort:** S (15m)
- **Risk if skipped:** Wasted call; concept leak; low.

### ARCH-10 — Migrate admin tests

- **ID:** ARCH-10
- **Title:** Move admin __tests__ into adminFrontend and fix import paths
- **Depends on:** ARCH-03
- **Files touched:** adminFrontend/src/**/ __tests__/**, vitest config, src/test/setup.ts
- **What to do:** Copy vitest setup; ensure npm run test picks up src/**/__tests__; fix @/ alias; delete admin tests from frontend.
- **Acceptance:** npm --prefix adminFrontend test passes; frontend test still passes.
- **Verification:** Both test runs.
- **Rollback:** Copy tests back.
- **Effort:** S (30m)
- **Risk if skipped:** Admin coverage disappears from CI.

### ARCH-11 — Docs + .env promotion

- **ID:** ARCH-11
- **Title:** Promote two-app env contract to README/CLAUDE
- **Depends on:** ARCH-01, ARCH-02, ARCH-06
- **Files touched:** README.md, CLAUDE.md, backend/.env.example, frontend/.env.example, adminFrontend/.env.example
- **What to do:** Document CORS_ORIGINS, VITE_API_BASE_URL, VITE_SME_URL/_ADMIN_URL, dev loop ports, render.yaml services.
- **Acceptance:** Fresh clone can follow README to boot all three and log into both apps.
- **Verification:** Grep docs for adminFrontend, 5174, CORS_ORIGINS.
- **Rollback:** Revert docs.
- **Effort:** S (15m)
- **Risk if skipped:** Onboarding confusion.

---

## 13. Architecture Scoring

| Dimension | Current | Target | Notes |
|---|---|---|---|
| Maintainability | 5 | 7 | Boundary clarity +2, minus duplication cost |
| Modularity | 4 | 8 | Two deployable modules, acyclic |
| Scalability | 5 | 6 | Unblocks team growth, single-instance today |
| Reliability | 6 | 7 | Smaller SME bundle, smaller blast radius |
| Security | 6 | 7 | Correct trust boundary; second origin enables hardening |
| Testability | 5 | 6 | Admin tests move; CI covers both |
| Data Arch | 7 | 7 | No schema change |
| API Arch | 7 | 7 | Correct prefixing, transport-only change |
| Observability | 5 | 6 | Two log streams possible |
| Deployment | 3 | 7 | Single->two services is sharpest fix |
| Overall | 5.3 | 6.8 | Surgical — biggest deltas Modularity+Deployment |

---

## 14. Top 10 Recommendations

1. Do ARCH-01 first (CORS_ORIGINS). Additive, low-risk, unblocks all.
2. Scaffold adminFrontend as verbatim copy (ARCH-02) — don't refactor while moving.
3. Move pages verbatim (ARCH-03) and smoke every /admin/* on 5174 before deleting from SME.
4. Delete from SME (ARCH-04) — measure bundle delta (stats.html before/after).
5. Make Switch to SME Portal env-driven VITE_SME_URL (ARCH-05).
6. Ship two services (ARCH-06) — two Render/Vercel projects, same backend.
7. Add import ban + contract doc (ARCH-07) — cheapest guard against re-coupling.
8. Wire CI for both apps (ARCH-08).
9. Guard SME fetch for admin sessions (ARCH-09).
10. Don't create @wallx/ui now — duplication is correct price at solo-dev scale.

---

## 15. Remaining Unknowns

| Unknown | Impact | How to resolve |
|---|---|---|
| Deploy platform for second frontend | Determines render.yaml shape | Owner decision — default two Render static sites |
| Prod domain names | Determines CORS_ORIGINS prod values | Owner/DNS; preview URLs until allocated |
| Whether admin design divergence is already desired | Determines if index.css should diverge immediately | Assume copy-verbatim; divergence follow-up PR |
| Sentry project split | Observability cost | Keep single DSN until volume justifies second |
| CI workflow file path | ARCH-08 accuracy | Verify .github/workflows/ci.yml exists |
| Backend admin service internals | Not a migration blocker | Flagged for future audit |

---

## 16. Final Verdict

- **Biggest strength:** Admin's domain decomposition is already clean; backend trust boundary correct; seam is narrow and acyclic — ideal for extraction.
- **Biggest problem:** One bundle + one origin + one deploy for two audiences. Every SME pays admin bundle cost; every deploy couples two release cadences.
- **Biggest risk if left unchanged:** SME bundle bloat grows as admin adds ops features; single deploy means a bad admin hotfix takes down SME and vice versa. Already 7111 lines and growing.
- **Highest-value first move:** ARCH-01 (CORS_ORIGINS) then ARCH-02 (adminFrontend scaffold that boots and logs in). No SME breakage until ARCH-04.
- **Overall verdict:** Healthy but needs targeted work. Copy-then-delete fork, keep duplication, defer shared packages, ship two frontends. Complexity earned its place — no more, no less.

---

## Appendix — Cross-Reference (Phases -> Sections)

| Phase | Section(s) |
|---|---|
| 1 Understand product | 1-2 |
| 2 Recon | 2.1-2.5 |
| 3 Reconstruct arch | 2, 3.1-3.2 |
| 4 Boundary audit | 5, 3.1, 6 R5/R8 |
| 5 Responsibility | 5 P3-P4 |
| 6 Data arch | 7.2, 13 Data |
| 7 API | 2.2, 13 API |
| 8 Security | 2.2, 5 P3, 6 R2 |
| 9 Reliability | 6 R2/R7, 11 rollback |
| 10 Performance | 5 P1, 6 R1 |
| 11 Test arch | 10 ARCH-10, 13 Testability |
| 12 Observability | 15 Sentry, 13 Observability |
| 13 Config & deploy | 5 P5, 6 R3/R10, 11.2 env, 10 ARCH-06/08 |
| 14 Tech debt | 5 |
| 15 Risk register | 6 |
| 16 What should NOT change | 4 |
| 17 Target arch | 7, 8 |
| 18 Red-team | 9 DND, 4, 7.1 principles |
| 19 Prioritize | 9 |
| 20 Impl plan | 12 |
| 21 Impact | 10 |
| 22 Migration | 11 |
| 23 Scoring | 13 |

### Red-Team Self-Critique

- Over-engineering? No — keeping admin in SME saves scaffolding but perpetuates coupling; extracting to shared package on day one IS over-engineering and is deferred.
- New failure points? Two deploys doubles failure surface but each blast radius smaller. CORS misconfig risk mitigated by additive fallback + boot log.
- Simpler alternative: Vite manualChunks admin isolation was considered and rejected — shrinks entry but doesn't solve deploy/origin/design divergence.
- Team size? Solo dev owns two small Vite apps more easily than one large role-branched app.
- Day-to-day DX? Two npm run dev processes, each boots faster (smaller graph).
