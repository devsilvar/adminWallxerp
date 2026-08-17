# Roadmap & Recommendations (Prioritized)

> Ordered by impact-to-effort. P0 = ship-blocking. P1 = before/at launch.
> P2 = first month after. P3 = when you scale.

---

## P0 — Must fix before anyone real uses this

### 1. Wire password reset to a real email (~15 lines)

The `sendEmail()` abstraction already exists and is proven by the invoice flow.
Replace the dummy logger in `auth.service.ts:287-294` with a real send using
the reset link already being built. Add a `PASSWORD_RESET` subject/template to
`src/lib/email`. Also send a **welcome email** on registration while you're in
there — it's the same code path and it's also unwired.

### 2. Decide the AI Assistant's fate

Either build `POST /businesses/:id/ai/chat` (a thin wrapper over an LLM API
with the business's numbers as context — the product framing is actually nice:
"ask my numbers") **or remove the `/ai` page + sidebar entry**. A promoted
feature that 404s reads as abandonment. If building, start read-only: answer
questions from the data, never mutate.

---

## P1 — Before/at launch

### 3. Lock down the test routes (`test.routes.ts`)

Add `authenticate` + admin-role check to the `/test` router (or behind
`ENABLE_TEST_ROUTES=true`). At minimum, `businesses-with-dva` must stop being
public in any deployable environment. Keep the NODE_ENV guards as
defense-in-depth, not the only line.

### 4. Restore auth rate limiting

`security.ts` `authRateLimiter`: `max: 5000` → ~20/15min, drop
`skipSuccessfulRequests`. Keep the payment limiter at 5/hour. Update the
CLAUDE.md claim (it says 5/15min — after the fix they'll match).

### 5. Make CI actually gate

Add to `.github/workflows/ci.yml`:
- backend: `npx tsc --noEmit` + `npm test` (Jest unit) + `npm run lint`
- frontend: `npx tsc -p tsconfig.app.json --noEmit` + `npm run build`
- keep the existing migration/validate steps

This is the cheapest insurance this repo can buy — the 60 frontend lint errors
and the broken backend lint config (ESLint 9 + legacy `.eslintrc.json`) are
exactly what a gate is for.

### 6. Fix lint on both sides

- Backend: convert to flat config (`eslint.config.mjs`) or pin ESLint 8.
- Frontend: fix the ~60 pre-existing errors (mostly `no-explicit-any`,
  unused vars) so future PRs show a clean diff.

---

## P2 — First month after launch

### 7. Fix the e2e dashboard test + seed the full journey

The 401 on the dashboard test points at a test-seed gap
(`tests/helpers/test-db.ts`). Get the suite green, then add the missing
end-to-end journey: register → business → sales → expenses → calculate →
finalize → pay (simulated) → statement PDF. This is the test that would have
caught the dashboard bug you hit today.

### 8. Close the `payment_refunded` reminder drift

Add it to the frontend `ReminderType` union + `NotificationBell` color/route
map (→ `/payments`, red-tinted). ~5 lines.

### 9. Gate Swagger in prod

Skip mounting `/api-docs` when `config.app.isProduction`. One line in `app.ts`.

### 10. Repo hygiene

- Move/delete the root stray scripts (`verify-phase0.js`, `sampleTest.js`,
  `seed-classifications-now.js`, `diagnostic-dashboard-test.js`, the `.bat`
  files, `sample.css`).
- Delete `tests/e2e/api.e2e.test.js` (compiled artifact).
- Decide the `frontend/` submodule question: either commit the submodule bump
  properly in CI/deploy or convert it to a regular directory (recommended for
  a solo dev — one repo, one commit, no SHA chasing).

### 11. Refresh CLAUDE.md

Sentry **is** wired now (H4-era note is stale); rate-limit numbers; CI
capabilities; Phase-5 "not shipped" list (Termii, email templates, deploy).
The doc is mostly accurate — it's the "not shipped" section that drifted.

---

## P3 — When you scale / when you're ready

### 12. Redis for the two in-process caches
Sales-import tokens and the frontend dashboard cache are the documented
single-instance ceiling. Move import tokens to Redis before the second
instance; consider a shared cache or broadcast channel for the dashboard.

### 13. Cross-tab auth sync
Zustand is per-tab: logging out in one tab leaves the other logged in, and two
tabs can clobber the active business. `broadcastChannel` or a `storage` event
listener is a half-day of work.

### 14. Termii SMS (already staged)
Config + `.env.example` exist; no client. When you want tax-reminder/payment
SMS, it's a new `src/lib/sms` + the same event-driven creators that fire
reminders today.

### 15. Complete i18n coverage
The pcm locale files cover ~60% of strings. Finish the pass or de-scope the
promise before launch marketing.

### 16. Production deploy checklist (Render + Vercel)
- Fill real secrets: `DATABASE_URL`, Paystack live keys, `PAYSTACK_WEBHOOK_SECRET`,
  `RESEND_API_KEY`, `FRONTEND_URL`, `SENTRY_DSN`, `ENABLE_CRON`.
- Point Paystack dashboard webhook → `https://api.yourdomain.com/api/webhooks/paystack`.
- Add a Sentry DSN and confirm one test error surfaces.
- Uptime ping against `/api/health` (Render free tier cold-starts 2–5s).

---

## Suggested order of attack (one session each)

| Session | Work |
|---|---|
| 1 | P0-1 password reset + welcome email · P0-2 kill or build AI |
| 2 | P1-3 test routes locked · P1-4 rate limits · P1-5 CI gate |
| 3 | P1-6 lint cleanup both sides · P2-7 e2e green + journey |
| 4 | P2-8..11 small closes + doc refresh |
| 5 | Deploy (P3-16) — the product is more than ready to be seen |
