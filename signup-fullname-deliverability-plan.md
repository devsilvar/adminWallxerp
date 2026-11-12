# Sign-Up Full Name Capture + Alert Deliverability — Implementation Plan

> Written against `prompts/plancode.md` (Senior Architecture Audit v2.0), adapted to a
> single feature slice: the plan below follows its evidence rules (every claim cites a
> file/line or a live probe), its `CONFIRMED / INFERRED / UNKNOWN` discipline, its
> red-team pass (Phase 18), and its file-impact map (Phase 21). It is **planning only** —
> no code or schema is changed by this document.

**Status:** DRAFT — awaiting approval to build
**Date:** 2026-11-11
**Branch context:** `feat/external-api-phase-0` (parent), `master` (backend)
**Related shipped work:** `2cabe5f` / `c1a4603` — signup notification cron + admin Notify button

---

## 1. Executive Summary

Two problems, one root cause: the sign-up alert has no reliable identity to report.

1. **No name is captured at signup.** `registerSchema` (`backend/src/validators/auth.validator.ts:3-20`)
   has no `fullName`, `register()` never writes `User.fullName`
   (`backend/src/services/auth/auth.service.ts:169-257`), and the register form has no
   name field (`frontend/src/pages/Register.tsx:93-105`). The alert email therefore always
   prints **"Full name: Not provided"**.
2. **The alert lands in spam.** The production sender is
   `WallX ERP <noreply@wallxerp.com>` (Railway variable `EMAIL_FROM`, confirmed live), the
   message carries no `Reply-To`, and the sending domain's DMARC record is
   `v=DMARC1; p=none;` with **no `rua=` reporting address** (DNS probe, 2026-11-11). Content
   and sender identity both read as automated/impersonal.

The fix is deliberately small: capture the name once, make `User.fullName` the canonical
identity with `Business.ownerName` as its fallback and its downstream projection, and
re-shape the alert into a plain, personal, reply-able email from a monitored address.

**What this plan does NOT do:** no new tables, no new services, no queue, no rewrite of the
email abstraction, no write-back from business to user that could clobber multi-business
accounts.

---

## 2. Scope

**In scope**
- `fullName` on signup: frontend field, store, API contract, validator, service, DB write.
- Name synchronisation between `User.fullName` and `Business.ownerName` (both directions,
  with explicit rules — see §5).
- Name editing in Settings (currently impossible from the UI — see §3, F3).
- Alert email: content, sender identity, `Reply-To`, headers, recipient handling.
- Deliverability operations: DMARC reporting, sender-domain verification, placement testing.

**Out of scope (explicitly)**
- Backfilling names for users who have neither a `fullName` nor any business `ownerName`
  (nothing to derive from — they stay "Not provided").
- Renaming `Business.ownerName` to something else; it is used by receipts, statements and
  DVA (`dva-account.service.ts:71,284`).
- External API (`external-api/`) registration — separate service, separate repo.
- Termii SMS, other templates' deliverability.

---

## 3. Current State — Evidence

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| F1 | Register API accepts no name; Zod strips unknown keys, so a `fullName` sent today is silently discarded | `auth.validator.ts:3-20`; `auth.service.ts:199-211` | CONFIRMED |
| F2 | Register form has no name input | `Register.tsx:93-105`, form body at `:236-330` | CONFIRMED |
| F3 | `updateMe` supports `fullName` and syncs it to `Business.ownerName`, but **no frontend calls it with a name** — only the DVA wizard calls `PATCH /auth/me` with `phone` | `auth.service.ts:472-514`; `DvaOnboardingWizard.tsx:117` | CONFIRMED |
| F4 | Business creation requires `ownerName` and never defaults it from the account | `business.validator.ts:3-12`; `business.service.ts:102-110`; `CreateBusinessModal.tsx:52,67` | CONFIRMED |
| F5 | `updateMe` writes `ownerName: ''` when the user clears their name — empties **every** owned business's owner name, which DVA/receipts consume | `auth.service.ts:509-513`; `receipt.service.ts:67`; `dva-account.service.ts:71` | CONFIRMED |
| F6 | The alert always shows "Not provided" | `signup-notifications.cron.ts:152-159`; `new-signup-notification.ts` | CONFIRMED |
| F7 | Production sender is `noreply@wallxerp.com`; no `Reply-To` is set anywhere in the alert path | Railway `EMAIL_FROM`; `email-dispatch.service.ts` (signup dispatch) | CONFIRMED |
| F8 | `sendEmail` cannot send to multiple recipients in one call and cannot set custom headers | `lib/email/index.ts:20-27,43-70` | CONFIRMED |
| F9 | `wallxerp.com` DMARC is `v=DMARC1; p=none;` — no `rua`, no enforcement | DNS TXT `_dmarc.wallxerp.com` | CONFIRMED |
| F10 | Root SPF is `include:spf.efwd.registrar-servers.com ~all` (Namecheap forwarding), not Resend; `send.wallxerp.com` CNAME carries the ESP's own SPF | DNS TXT `wallxerp.com`; CNAME `send.wallxerp.com` | CONFIRMED |
| F11 | Resend DKIM key exists (`resend._domainkey.wallxerp.com`) | DNS TXT | CONFIRMED |
| F12 | Dashboard greeting already reads `user.fullName` | `Dashboard.tsx:392` | CONFIRMED |
| F13 | e2e tests register without a name (so the API field must stay optional) | `tests/e2e/api.e2e.test.ts:145`; `permission-overrides.e2e.test.ts:57` | CONFIRMED |
| F14 | One e2e test already sends `fullName` and is silently ignored | `tests/e2e/customer-crm.e2e.test.ts:62-63,81-82` | CONFIRMED |

**What is already good — DO NOT CHANGE**
- `updateMe`'s User → Business projection is the right direction; keep it (guard F5).
- The alert cron's atomic claim + marker design (`signupNotifions.cron.ts:140-179`) — unchanged.
- The dev-logger fallback in `lib/email/index.ts` — unchanged.
- `Business.ownerName` remains the document-facing name (receipts/statements/DVA).
- The notification template's no-images/no-links structure — keep it.

---

## 4. Risk Register

| Finding | Severity | Confidence | Impact | Action |
|---|---|---|---|---|
| Alert shows no name (F1, F2, F6) | 🟠 HIGH | HIGH | The whole feature (team gets no identity) is half-useless | §6 Phase 1-2 |
| Alert lands in spam (F7, F9) | 🟠 HIGH | MEDIUM-HIGH | Team misses signups; the feature exists but is invisible | §6 Phase 4-5 |
| No UI to fix a wrong name (F3) | 🟡 MEDIUM | HIGH | Typos at signup are permanent | §6 Phase 3 |
| Clearing a name blanks business owner names (F5) | 🟠 HIGH | HIGH | Receipts/statements print `Owner: `; DVA name split degrades | §6 Phase 2 |
| Business create re-asks for a name the user just gave (F4) | 🟡 MEDIUM | HIGH | Friction + divergence between the two fields | §6 Phase 2 |
| Multi-business users with different owner names | 🟡 MEDIUM | HIGH | A naive two-way sync would overwrite the wrong one | §5 rules |

---

## 5. Target Design

### 5.1 Name model — canonical + projection + fallback

```
User.fullName        ← CANONICAL identity (account holder)
Business.ownerName   ← PROJECTION of User.fullName, editable per business
```

**Write rules (all four are required — this is the "two-way" part, made safe):**

| Trigger | Write | Rule |
|---|---|---|
| Signup | `User.fullName` | New field; trimmed, 2-100 chars |
| `PATCH /auth/me { fullName }` | `User.fullName` → all owned `Business.ownerName` | Existing behaviour, **minus the empty-string write** (F5) |
| `POST /businesses` | `Business.ownerName` | Becomes optional; service defaults to `User.fullName`; if both absent → `400 OWNER_NAME_REQUIRED` |
| Legacy / missing `User.fullName` | `User.fullName` ← `Business.ownerName` | **One-time migration only** (§9), never a runtime write |

**Explicit non-rule:** editing a business's owner name does **not** write back to
`User.fullName`. A user can own several businesses with different trading names; writing back
would corrupt the account identity. This is the deliberate limit on "two-way".

**Read rule (resolver):**

```
displayName = User.fullName
           ?? primaryBusiness.ownerName
           ?? earliestOwnedBusiness.ownerName
           ?? 'Not provided'
```

Used by the signup notification path (cron + admin Notify). Implemented once as
`resolveUserDisplayName(userId)` in the auth service, so both callers share it.

### 5.2 API contract changes

```
POST /api/v1/auth/register
  body: { email, password, phone?, fullName?, requestedPlan?, acquisitionSource?, acceptedTerms? }
  fullName: string, 2-100 chars, trimmed — OPTIONAL at the API (F13: existing tests/clients),
            REQUIRED in the web form.
  response: unchanged (user object already includes fullName via sanitizeUser spread)

PATCH /api/v1/auth/me
  body: { fullName?, phone? }  — unchanged contract, now actually reachable from Settings

POST /api/v1/businesses
  body: { ..., ownerName? }    — now optional; defaults to User.fullName
```

### 5.3 Email changes

**Identity**
- New `config.email.replyTo` (`EMAIL_REPLY_TO`, default `support@wallxerp.com`).
- New `config.email.signupAlertFrom` (`SIGNUP_ALERT_FROM`, default
  `WallX Product <product@wallxerp.com>`), used **only** by the signup alert; the other 18
  templates keep `EMAIL_FROM`.

**Transport (`lib/email/index.ts`)**
- `SendEmailInput.to: string | string[]` (backward compatible with every existing caller).
- `SendEmailInput.headers?: Record<string, string>` → passed through to Resend.

**Dispatch (`email-dispatch.service.ts`)**
- One message, `to: recipients[]` — 6 separate identical messages from the same sender in the
  same second is exactly the "duplicate blast" shape spam heuristics score. One message to an
  internal list is both better for placement and 1 API call instead of 6.
- `replyTo: config.email.replyTo`.
- `headers: { 'X-Entity-Ref-ID': 'signup-' + userId }` — stops Gmail collapsing unrelated
  alerts into one thread.
- Return shape simplifies to `{ delivered: boolean; skipped: boolean; failed: boolean }`.

**Content (`templates/new-signup-notification.ts` rewrite)**
- Subject: `New WallX ERP account — ${name}` (no ALL CAPS, no "alert", no exclamation).
- Remove the dark "INTERNAL SIGN-UP ALERT" banner and the
  "Automated message from the sign-up notification job" footer — both read as bot mail.
- Plain, short body: greeting → three facts (name, email, phone) → one line of context
  ("They signed up about five minutes ago; no business has been created yet" — only if true).
- Human sign-off ("— WallX Product"), a "You're receiving this because you're on the WallX
  internal sign-up list" line, and a physical-address footer (CAN-SPAM hygiene).
- Keep HTML simple, keep the `text` part, keep zero external links and zero images.

**Operations (not code — §11 checklist)**
- DMARC: add `rua=mailto:dmarc@wallxerp.com` (stay at `p=none` for 2 weeks, then
  `p=quarantine`).
- Confirm Resend shows `wallxerp.com` as **Verified** (DKIM exists — F11 — but confirm the
  domain status, not just the record).
- Placement test through mail-tester before calling it done.

---

## 6. Current → Proposed (per change)

| # | Change | Why | Benefit | Cost | Risk |
|---|---|---|---|---|---|
| C1 | `fullName` at signup (FE + BE) | F1/F2/F6 | Alerts name the person; dashboard greeting improves | S | Low — optional API field keeps old clients working |
| C2 | `resolveUserDisplayName()` + fallback to business owner | F6, F14 | Legacy users still get a name in alerts | S | Low — read-only |
| C3 | Business create defaults `ownerName` from `fullName` | F4 | Removes duplicate typing; keeps the two fields in sync at birth | S | Low — explicit 400 when neither exists |
| C4 | Stop writing `ownerName: ''` in `updateMe` | F5 | Prevents blanking owner names across all businesses | XS | Low |
| C5 | Name editor in Settings → `PATCH /auth/me` | F3 | Users can fix a typo; the projection then propagates | S | Low |
| C6 | Single message to the recipient list + Reply-To + header | F7/F8 | Better placement, reply-able, one provider call | S | Low |
| C7 | Template rewrite | F7 | Removes bot-mail signals | S | Low |
| C8 | DMARC `rua` + Resend verification + placement test | F9/F10/F11 | Makes spam placement measurable and fixable | Ops | Medium — DNS changes; stay `p=none` first |

---

## 7. Red-Team Pass (attacking this plan)

1. **"Is `fullName` at signup really the root cause of spam?"** No — it is one signal among
   several. The plan does not pretend otherwise; C6-C8 carry the deliverability work. C1 is
   about *usefulness*, not placement.
2. **"Should `fullName` be required server-side?"** Tempting, but F13 shows tests and any
   existing client register without it. Required-in-UI + optional-in-API gets the data
   without a breaking change. Revisit after launch.
3. **"Why not sync business → user too?"** Because multi-business accounts make it
   ambiguous (F: risk register). The migration covers legacy gaps once; runtime write-back
   would be a footgun. This is the correct place to *not* be symmetric.
4. **"One email to six people exposes addresses."** True, and accepted: all six are internal
   WallX addresses already on the same distribution list. If that changes, switch to `Bcc`
   (worse for placement) or back to per-recipient (worse for placement). Decision recorded.
5. **"Is the migration safe on production?"** It only writes `users.full_name` where it is
   NULL/empty and a business owner name exists. It cannot overwrite a real name. Rollback is
   a no-op (leave the backfilled values — they are correct data).
6. **"Does changing `to` to an array break the other 20 dispatch callers?"** No — union type,
   string callers unchanged.
7. **"Is the cron affected?"** Its claim/retry semantics are untouched; only the name it
   passes and the delivery result shape change.
8. **"What if Resend rejects the new `from` local part?"** Resend verifies the *domain*, not
   the mailbox, so `product@wallxerp.com` sends fine once the domain is verified. If it fails,
   the fallback is `config.email.from`.
9. **Could this be smaller?** Yes — C1+C2 alone would satisfy "alerts with names". C6-C8 are
   justified separately by the spam report, so they are sequenced as their own phase and can
   ship independently.

---

## 8. Priorities

**NOW**
- C1 signup name (FE+BE), C2 resolver, C4 empty-name guard, C6/C7 alert identity + content.

**NEXT**
- C3 business-create default, C5 Settings name editor, C8 DMARC reporting + placement test.

**LATER**
- Required `fullName` server-side (after client rollout), name normalisation (title-case),
  per-recipient preferences / opt-out for internal alerts.

**DO NOT DO**
- New `Profile` table or name-sync service — two columns already exist.
- Runtime business→user write-back — ambiguous and destructive.
- A queue for six emails.
- `List-Unsubscribe` on a transactional internal alert — it is not a marketing list.

---

## 9. Migration Strategy

**Current → Intermediate → Target**

1. *Intermediate (deploy 1, backward compatible):* schema unchanged; API accepts optional
   `fullName`; frontend starts sending it. Old users unaffected.
2. *Backfill (same deploy, single migration):*

```sql
-- Fill only where the account has no name and a business name exists.
-- Prefer the primary business, else the earliest created.
WITH candidate AS (
  SELECT DISTINCT ON (b.user_id)
         b.user_id,
         btrim(b.owner_name) AS owner_name
  FROM businesses b
  JOIN users u ON u.id = b.user_id
  WHERE u.full_name IS NULL
    AND b.owner_name IS NOT NULL
    AND btrim(b.owner_name) <> ''
  ORDER BY b.user_id,
           (b.id = u.primary_business_id) DESC NULLS LAST,
           b.created_at ASC
)
UPDATE users u
SET full_name = c.owner_name
FROM candidate c
WHERE u.id = c.user_id
  AND u.full_name IS NULL;
```

3. *Target:* `User.fullName` is populated for all new signups and for every legacy user who
   had a business name. Business creation no longer asks twice.

**Ordering:** schema/API first, frontend second, DNS ops independently. No column added or
dropped, so no lock risk; the `UPDATE` touches only rows with a NULL name.

**Rollback:** revert code; leave backfilled names (they are correct data). DNS changes are
independently reversible.

---

## 10. File & Module Impact Map

**Backend**
- MODIFY `src/validators/auth.validator.ts` — `registerSchema.fullName` (optional, 2-100, trim)
- MODIFY `src/services/auth/auth.service.ts` — write `fullName` in `register()`; guard the
  empty-string `ownerName` write in `updateMe`; add `resolveUserDisplayName()`
- MODIFY `src/validators/business.validator.ts` — `ownerName` optional on create
- MODIFY `src/services/business/business.service.ts` — default `ownerName` from `user.fullName`,
  else `400 OWNER_NAME_REQUIRED`
- MODIFY `src/lib/email/index.ts` — `to: string | string[]`, `headers?`
- MODIFY `src/config/index.ts` — `email.replyTo`, `email.signupAlertFrom`
- MODIFY `src/services/email-dispatch.service.ts` — single-message send, reply-to, header,
  new result shape
- MODIFY `src/lib/email/templates/new-signup-notification.ts` — rewrite (subject + body)
- MODIFY `src/services/admin/admin.service.ts` — `notifyUserSignup` uses the resolver
- MODIFY `src/jobs/signup-notifications.cron.ts` — pass the resolved name; adapt result shape
- CREATE `prisma/migrations/<ts>_backfill_user_full_name/migration.sql`
- CONFIGURATION `.env.example` — `EMAIL_REPLY_TO`, `SIGNUP_ALERT_FROM`
- TESTS `tests/e2e/api.e2e.test.ts` (register with/without name), unit test for the resolver

**Frontend (`frontend/`)**
- MODIFY `src/pages/Register.tsx` — name field (first field), required, 2-100, trimmed
- MODIFY `src/stores/auth.store.ts` — `register(email, fullName, phone, ...)` signature
- MODIFY `src/pages/Settings.tsx` — "Full name" input → `PATCH /auth/me`
- MODIFY `src/components/CreateBusinessModal.tsx` — prefill `ownerName` from `user.fullName`
- TYPES `src/types/index.ts` — `User.fullName` already present; verify `Register` payload type

**Infrastructure**
- Railway service `paymaytax-api` variables: `SIGNUP_ALERT_FROM`, `EMAIL_REPLY_TO`
- DNS (wallxerp.com): DMARC `rua=` addition; confirm Resend domain verified

**Explicitly untouched:** `business.ownerName` consumers (receipts, statements, DVA, admin),
`signupNotifiedAt` marker, cron schedule, admin dashboard button.

---

## 11. Deliverability Checklist (run after deploy)

1. Resend dashboard → `wallxerp.com` shows **Verified**; DKIM/SPF records green.
2. `dig TXT _dmarc.wallxerp.com` shows `v=DMARC1; p=none; rua=mailto:dmarc@wallxerp.com`.
3. Send the alert to a test signup; inspect Gmail "Show original":
   `spf=pass`, `dkim=pass (d=wallxerp.com)`, `dmarc=pass`.
4. mail-tester.com run with the same template → target ≥ 9/10; fix anything flagged.
5. Gmail/Yahoo: click "Not spam" + "Add to contacts" once per recipient mailbox; monitor the
   next 3 real signups for inbox placement.
6. After 2 weeks of clean DMARC reports, raise policy to `p=quarantine`.
7. Confirm the alert renders correctly with no images (plain-text client test).

---

## 12. Verification & Test Plan

- **API:** register with `fullName` → `GET /auth/me` returns it; register without → still 201
  (compat); register with `fullName: " "` → 400 or ignored (decide: trim-then-min-2 → 400).
- **Business:** create without `ownerName` → inherits `fullName`; create with neither → 400
  `OWNER_NAME_REQUIRED`.
- **Profile:** `PATCH /auth/me { fullName }` → user + all owned businesses updated; clearing
  the name leaves `ownerName` untouched.
- **Resolver:** unit-test the 4-step fallback order.
- **Alert:** signup → wait for the sweep → email shows the name; admin Notify button shows the
  same; test-domain accounts still suppressed.
- **Migration:** run against a copy; assert only NULL-name users changed; count matches
  expectation.
- **Manual:** full signup → verify email → create business (owner name prefilled) → Settings
  rename → alert shows the new name.

---

## 13. Architecture Scores (touched areas only)

| Area | Now | After | Why |
|---|---|---|---|
| Identity data model | 6 | 8 | Canonical name + explicit projection rules; no new tables |
| Frontend/backend contract sync | 5 | 8 | Name captured at the only point where the user is certain to type it |
| Transactional email reliability | 7 | 8 | Better identity/headers; provider path unchanged |
| Email deliverability (ops) | 4 | 8 | DMARC reporting + verified sender + placement testing |
| Test coverage of this slice | 4 | 7 | Added resolver + contract tests |

---

## 14. Top Recommendations (ranked)

1. Capture `fullName` at signup (UI-required, API-optional) — biggest usefulness win.
2. Resolver with business fallback — makes legacy users and the admin button name-correct.
3. Fix the `ownerName: ''` write before it prints a blank owner on receipts.
4. One message + Reply-To + `X-Entity-Ref-ID` + human template — the placement lever.
5. DMARC `rua` + Resend verification + mail-tester — makes placement measurable.
6. Business-create default — kills the duplicate-name friction at the exact moment it occurs.

---

## 15. Unknowns

- **UNKNOWN** — Resend domain verification *status* (DKIM record exists; account status not
  observable from this machine).
- **UNKNOWN** — whether the six recipients have previously marked the alert as spam (per-mailbox
  reputation; explains stubborn placement even after fixes).
- **UNKNOWN** — whether any non-web client registers users (external API is a separate service
  per its own plan; assumed none).
- **INFERRED** — Gmail/Yahoo placement is driven mostly by domain reputation + content, not by
  the 5-minute delay.

---

## 16. Final Verdict

- **Biggest strength:** the alert pipeline already has the right shape (outbox marker, atomic
  claim, test-account suppression, admin re-send) — this plan adds data and polish, not
  machinery.
- **Biggest problem:** the product collects an owner name at business creation but not at
  account creation, so the one moment the team is notified has no identity to report.
- **Biggest risk if unchanged:** the alert keeps arriving nameless and filtered, which makes
  the whole feature effectively invisible.
- **Highest-value first move:** C1 + C2 (signup name + resolver) — small, isolated, immediately
  visible in the next alert.
- **Overall:** 🟡 **Healthy but needs targeted work** — the mechanism is sound; the data and
  sender identity are the gaps.

---

## 17. Approval Gate

This document changes nothing. On approval, implementation proceeds in this order:
**Phase 1** schema/validator/service + migration → **Phase 2** cron/admin resolver →
**Phase 3** frontend (register, settings, business modal) → **Phase 4** email transport +
template → **Phase 5** Railway variables + DNS/DMARC + placement test.
