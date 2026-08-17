# What Works Well — Don't "Fix" These

> A solo-dev codebase that got the fundamentals right. This section is the
> counterweight to `02-issues.md` — every item below is a pattern worth
> preserving, and a few are genuinely best-in-class for a project this size.

---

## 1. The layered architecture is disciplined and consistent

Every domain follows the exact same shape: `routes/ → controllers/ →
services/ → Prisma`, with Zod validators and transactional audit logging.
17 services, 16 route files — and you can predict where any feature lives
without searching. This consistency is the single biggest reason the codebase
is still navigable at this size. **Keep it. Resist the urge to "restructure."**

## 2. Money handling is taken seriously

- All money is `Decimal(15,2)`; rates `Decimal(5,2)`; conversions go through
  a `toNumber()` helper — no floating-point tax anywhere.
- Invoice totals are computed **server-side** (subtotal → −discount → ×VAT →
  total), mirrored client-side for instant feedback, with the server as the
  source of truth.
- **CPU/network work is kept out of transactions:** bcrypt hashing and email
  sends happen before/after `$transaction`, never inside — so DB locks aren't
  held during slow work. This rule is stated in CLAUDE.md *and* followed in
  the code.
- DB-level unique constraints act as concurrency safety nets:
  `UNIQUE(businessId, source, referenceId)` on sales (double-booking),
  `linkedSaleId` UNIQUE on invoices (double mark-paid), per-business invoice
  numbering.

## 3. The webhook pipeline is the most hardened part of the system

Paystack webhooks: raw-body HMAC-SHA512 verification, **replay-attack dedup**
(duplicate signature within 5 min rejected), every event persisted to
`PaystackWebhookEvent` for forensics *before* verification, statuses walked
received → verified → processed. Refund handling is thorough too:
`charge.refunded` routes to the right resource (tax payment → refunded +
reminder; DVA sale → reversed; invoice → refunded + unlinked).

## 4. Ownership and locking are enforced everywhere

- Every service verifies `business.userId === userId` before operating.
- `assertMonthNotLocked()` prevents edits to finalized/paid months — and the
  invoice mark-paid flow calls it so revenue can't land in a locked month.
- Payment completion flips `paymentStatus='completed' + isLocked=true` in one
  atomic transaction — the report literally cannot be edited after payment.

## 5. Audit trail: `logAudit()` on every meaningful mutation

Transactional inside `$transaction`, fire-and-forget otherwise, with old/new
data, userId, businessId, IP, user agent, and PII minimization (phones → last
4). Admin audit-logs page exists to view them. Most startups skip this; it's
already done here.

## 6. The reminder system is event-driven with idempotent dedup

`createReminderOnce()` keys on `(businessId, type, referenceType, referenceId)`
so replays never duplicate. The nightly cron sweep is genuinely well-designed:
Postgres advisory lock (multi-instance safe), reminder-create **before**
status-flip so a mid-sweep crash self-heals on the next run (dedup = no-op,
flip retried), per-invoice try/catch so one bad row can't abort the sweep, and
the lock released in `finally`.

## 7. Sales import is over-engineered in the right ways

Per-request template generation from the source enum (no static file to
drift), fuzzy header aliasing, RFC4180 + Excel-serial date parsing, ₦/comma
stripping with explicit rejection of `150k`-style shorthand, 5-row status
classification, 100-row cap, 15-min token cache, and `skipDuplicates` +
unique constraint as the final concurrent-upload safety net. This is a
production-grade import pipeline.

## 8. The frontend refresh architecture (post-fix) is exactly right

- Zustand **split-state stores** (invoice list vs detail; bell reminders vs
  the Reminders page) — no shared-state spaghetti.
- **Dashboard invalidation pub/sub** (`dashboard.store.ts`): pages fire
  `invalidateDashboard('sale_created')` after mutations; Dashboard debounces a
  refetch. Decoupled — pages don't know how the dashboard works.
- **Optimistic updates with revert** (invoice mark-paid, bell mark-read/
  dismiss) — the UI never waits for the network, and failures restore state.
- `patchInList` keeps detail-page status transitions visible when you navigate
  back without a refetch.
- Axios interceptor does refresh-on-401 + single retry + logout redirect;
  `axios-retry` replays GETs on 502/503/504 with backoff — pragmatic hardening
  for Render cold-starts and Nigerian 4G.

## 9. The DVA flow has a safety layer most would skip

DVA transfers don't silently become revenue — they land as **pending** sales
requiring verification/classification on `/sales/unverified`, with a
`dva_validation_failed` reminder when Paystack rejects the account. Auto-capture
without double-entry, but with a human checkpoint.

## 10. Error contract is uniform

Every failure is `{ error: { code, message, details?, stack? } }`; Zod errors
map to field-level details; Prisma P2002/P2025/P2003 map to 409/404/400;
Multer errors get friendly upload messages; all handlers wrapped in
`asyncHandler`. A client can build one error renderer and be done.

## 11. Product decisions that were made the *cheap, correct* way

- **WhatsApp delivery via `wa.me` deep link** instead of the Meta Cloud API —
  zero infra, works with the SME's own account, no business verification.
- **Resend with a Winston dev-logger fallback** — the full email flow works
  without a Resend account, and `meta.delivered` tells the UI which path ran.
- **`test-bank` for DVA in test mode** — real Paystack sandbox behavior.
- **Manual FIRS transport** — FIRS has no API; they built a remittance
  batch/reconciliation layer instead of pretending otherwise.
- **Invoice PDF status pill + downloadable in any status** — a draft preview
  and a cancelled record are both useful.

## 12. Config is centralized and validated

One `src/config/index.ts` validates required env vars at import (fail fast),
parses PORT defensively for Render, centralizes tax rate, cron toggle, CORS
allowlist, and Paystack environment quirks. `.env.example` is comprehensive and
commented.

---

## Bottom line

The **money core** (tax calc, payments, webhooks, DVA, invoicing, audit,
locking) is solid enough to build a business on. The weaknesses are at the
**edges**: unfinished features wearing finished clothes (AI, password reset),
missing gates (CI, lint), and one leaky test surface. Fix the edges; preserve
the core.
