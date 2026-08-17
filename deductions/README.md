# PayMyTax by WallX — Codebase Deductions

A senior-developer audit of the full stack (backend + frontend), written from a
full read of the code, the schema, the planning docs, and live verification
(builds, typechecks, unit tests, lint).

**Audit date:** August 2026 · **Repo state:** `main`, working tree dirty
(frontend is an uncommitted submodule; one dashboard bug fixed during this audit).

---

## TL;DR — the 60-second verdict

This is a **remarkably well-built solo-dev codebase** with a consistent
layered architecture, disciplined money-handling, and a genuinely good
frontend. The core tax/sales/expense/payment engine is solid and idiomatic.

But there are **three things lurking** that would embarrass you at launch:

1. **The AI Assistant is a dead feature.** The `/ai` page calls
   `POST /businesses/:id/ai/chat` — **no such backend route exists**. Every
   message 404s. The sidebar actively promotes it.
2. **Password reset is a dummy.** `forgotPassword` generates a valid token
   but only logs a "PASSWORD RESET EMAIL (dummy)" line — no email is ever
   sent, so users can never recover a forgotten password.
3. **CI doesn't test anything.** The GitHub workflow installs deps, migrates
   the DB, and validates the Prisma schema — **no Jest, no ESLint, no frontend
   build**. "The CI gate prevents regressions" is not what the CI does.

Plus a stack of medium/low findings (security nits, type drift, dead config,
doc drift) catalogued in `02-issues.md`.

---

## The most important thing to understand about this app

**The dashboard numbers were reading *tax reports*, not live transactions.**
Every KPI (Total Sales, Total Expenses, This Month) came from
`MonthlyTaxReport` rows — which only exist after you click **Calculate Tax**.
So adding a sale/expense/invoice payment never moved the dashboard until a
recalculation happened. **This was fixed during this audit** (see
`02-issues.md` → issue #1, and the `getDashboard` change in
`backend/src/services/tax.service.ts`).

---

## Files in this folder

| File | What it is |
|---|---|
| [`01-how-the-app-works.md`](01-how-the-app-works.md) | Full mental model: architecture, data model, every money/data flow, deployment |
| [`02-issues.md`](02-issues.md) | Bugs, lurking issues, bottlenecks — severity-ranked with file references |
| [`03-what-works-well.md`](03-what-works-well.md) | What is genuinely good and should not be "fixed" |
| [`04-roadmap-recommendations.md`](04-roadmap-recommendations.md) | Prioritized, actionable next steps |
| [`06-codebase-improvement-plan.md`](06-codebase-improvement-plan.md) | Backend-first improvement plan: verified lurking issues (B0–B4 phases), deferred ceilings, verified-good list |

---

## Quick stats

- **Backend:** Node 20 + Express 5 + TypeScript + Prisma 6 + PostgreSQL.
  17 service files, 16 route files, 14 controllers, 14 validators.
- **Frontend:** React 19 + Vite 8 + Tailwind 4 + Zustand 5 + React Router 7.
  20+ pages, 6 stores, i18n (en + Nigerian Pidgin).
- **Tests:** 5 unit tests (tax calc) — pass. E2E suite exists but 401s on the
  dashboard test in this environment (test-data seeding gap).
- **Payments:** Paystack (tax payment checkout + DVA virtual accounts),
  webhook HMAC-SHA512 + replay dedup.
- **Cron:** daily 00:30 Africa/Lagos reminder sweep with Postgres advisory lock.
