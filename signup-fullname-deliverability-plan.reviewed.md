# Sign-Up Full Name Capture + Alert Content — REVISED Implementation Plan

> **Supersedes:** `signup-fullname-deliverability-plan.md` (DRAFT, 2026-11-11)
> **Reviewed against:** `backend/` + `frontend/` working tree, HEAD on `feat/external-api-phase-0`
> **Review protocol:** `prompts/rereviewplan.md`
> **Status:** planning only — no code, schema, DNS or config is changed by this document.

> **OWNER CONSTRAINT (binding):** the email sending path is **already working** and must not
> be touched. No change to `lib/email/index.ts`, `config.email.from` / `EMAIL_FROM`, the
> Resend client, `RESEND_API_KEY`, or any provider setting. This revision therefore drops the
> sender-identity and header work entirely and confines the email half to **template content
> only**. The plan below is written around that constraint.

Every claim below is tagged **CONFIRMED** (read in source this pass, with `file:line`),
**INFERRED**, or **UNVERIFIED**. Line numbers are from the current tree.

---

# 1. EXECUTIVE VERDICT

## 🟡 PLAN REQUIRES SIGNIFICANT REVISION

The diagnosis of the *name* problem is right and most of the design survives. The email half
was aimed at the wrong target.

**The sending path works — and the plan tried to change it.** The old plan proposed a new
`SIGNUP_ALERT_FROM` sender, a `to: string | string[]` transport change, and custom headers,
all of which mean editing `lib/email/index.ts` — the one file every one of the 30 templates
goes through. You have confirmed delivery is working. **All of that is now removed.** The
email half is reduced to template content (subject + body), which cannot affect how anything
is sent.

Three other things did not hold up:

1. **A wrong recommendation built on a false premise.** "One message to six recipients"
   rests on the claim that all six are internal WallX addresses. They are not —
   `ogigairichmond@gmail.com`, `refsilva@yahoo.com` and `ro@devcenter.africa` are in
   `config.signupNotifications.recipients` (`backend/src/config/index.ts:223-228`). Merging
   them into one `To:` discloses personal addresses across third-party mailboxes and makes
   the message look *more* like bulk mail to exactly the two providers (Gmail, Yahoo) most
   likely to filter it. **Reversed: keep the working per-recipient loop exactly as it is.**
2. **A regression disguised as simplification.** Changing the dispatch return to
   `{ delivered: boolean; skipped: boolean; failed: boolean }` breaks both callers, which
   accumulate numeric counts (`signup-notifications.cron.ts:152-155`,
   `admin.service.ts:1877-1888`). **Reversed: keep the numeric shape.**
3. **A severity miscalculation.** F5 ("clearing a name blanks business owner names") is
   real in the code but **unreachable over HTTP today**, because `updateMeSchema.fullName`
   is `.trim().min(2)` (`auth.validator.ts:64-69`) — an empty string 400s before the service
   runs. It is latent dead-branch code, not a live HIGH bug.

The "alert lands in spam" premise is also **UNVERIFIED** — it was never something this
review could confirm, and you now report delivery is fine. Deliverability ops are demoted
from a required phase to optional observation.

Everything else — optional-API/required-UI `fullName`, the canonical-plus-projection model,
the one-way business→user limit — is correct and is carried forward with corrected citations.

---

# 2. WHAT WAS WRONG WITH THE OLD PLAN

## 🔴 WRONG

| # | Old plan said | Reality (verified) |
|---|---|---|
| W1 | Transport change = `to: string \| string[]` + `headers?`, plus a new `SIGNUP_ALERT_FROM` sender | Sending works. `from` is hardcoded (`lib/email/index.ts:60`) and `SendEmailInput` has no `from`/`headers` (`:20-27`) — so the new sender was unimplementable **and** would have required editing the shared transport every template uses. **Dropped by owner instruction.** |
| W2 | Send one message to `recipients[]`; "all six are internal WallX addresses already on the same distribution list" | `config/index.ts:223-228`: 2 of 6 are consumer Gmail/Yahoo, 3 are not `@wallx.co`. The justification is false and the change leaks addresses. |
| W3 | Dispatch returns `{ delivered: boolean; skipped: boolean; failed: boolean }` | Callers do `result.delivered += delivery.delivered` and `delivery.failed > 0` (`signup-notifications.cron.ts:152-155`) and return counts in an admin API response + audit row (`admin.service.ts:1877-1888`). Booleans would produce `NaN` and break the admin payload. |
| W4 | §10 impact map: `to: string \| string[]` needed for the single-message send | Falls away with W2. Removing it means **zero** changes to the transport the 30 other templates share. |
| W5 | F5 is 🟠 HIGH / CONFIRMED | `updateMeSchema` blocks empty names (`auth.validator.ts:64-69`), and no frontend sends `fullName` at all (`DvaOnboardingWizard.tsx:117` is phone-only). The `ownerName: ''` write (`auth.service.ts:511`) is unreachable today — **latent, LOW**. |
| W6 | F12 evidence is `Dashboard.tsx:392` | `:392` is inside `resolveGreetingName()`, which **already implements** the user→business fallback (`Dashboard.tsx:392-406`), gated on `user.id === activeBusiness.userId`. The plan proposed a second resolver without acknowledging the first. |
| W7 | "The alert lands in spam" stated as a premise | **UNVERIFIED.** You report the email sends correctly. No placement evidence exists in this review; treat this as a hypothesis to test, not a defect to fix. |

## 🔴 MISSING

| # | Gap |
|---|---|
| M1 | `createBusiness`'s user lookup does **not** select `fullName` (`business.service.ts:74-88`). C3's default is impossible until `fullName: true` is added to that `select`. |
| M2 | `backend/src/config/swagger.ts:218,235` documents `ownerName` as **required** on `POST /businesses`. Must be updated when C3 lands, or the published contract lies. |
| M3 | `register()` sets `customerName: created.email.split('@')[0]` on the plan-submission record (`auth.service.ts:219`). Once a name exists, that should use it. |
| M4 | `Business.ownerName` is **non-null** in Prisma (`schema.prisma:97`). "Stop writing `''`" therefore means *skip the `updateMany` entirely*, not write `null`. The plan's wording invites a type error. |
| M5 | §7 item 5 promises a backfill for "NULL/empty" names; the §9 SQL only checks `IS NULL`. |
| M6 | `new-signup-notification.ts` interpolates `userEmail`, `fullName`, `phone` and `acquisitionSource` **unescaped** into HTML (`:28-33`, `:69`). `escapeHtml` already exists (`src/lib/email/escape.ts`) and 8 templates use it. The template rewrite must adopt it — and the risk grows once `fullName` becomes user-supplied at signup. |

## 🟠 OUTDATED / IMPRECISE

| # | Gap |
|---|---|
| O1 | `dva-account.service.ts` is at `backend/src/services/dva/dva-account.service.ts` — the cited path does not exist. Lines 71 and 284 are correct once the path is fixed. |
| O2 | `receipt.service.ts:67` is `backend/src/services/documents/receipt.service.ts:67` (also `:141`, `:315`). `statement.service.ts:290,546` consumes it too and was not cited. |
| O3 | F6 cites `signup-notifications.cron.ts:152-159` for "always shows Not provided". Those lines are result accounting; the cron passes `fullName` **correctly** at `:143-150`. The actual evidence is `new-signup-notification.ts:29` (HTML) and `:103` (text). |
| O4 | "the other 18 templates keep `EMAIL_FROM`" — there are **30** template files. |
| O5 | F7 marks the production `EMAIL_FROM` as CONFIRMED. It is **INFERRED**: the config default matches (`config/index.ts:212`), but the Railway variable cannot be read from this machine. |
| O6 | F8 implies Reply-To support must be added to the transport. It already exists (`lib/email/index.ts:25`, forwarded at `:65`) — but it is also **not needed**, since the sending path is being left alone. |

## 🟡 UNNECESSARY

| # | Item |
|---|---|
| U1 | `to: string \| string[]` — not needed once W2 is reversed. |
| U2 | The boolean result-shape rewrite — pure churn that breaks two callers. |
| U3 | Rewriting `frontend/src/pages/marketing/Register.tsx` — it is **unrouted** (nothing imports it; `App.tsx:27` imports `@/pages/Register.tsx`). Leave it alone; just don't change the store signature in a way that breaks its type-check. |

## 🟢 CORRECT — KEEP AS-IS

- F1, F2, F3, F4, F13, F14 — all verified, citations accurate.
- `fullName` already exists on `User` (`schema.prisma:17`) and is already returned by
  `sanitizeUser`'s spread (`auth.service.ts:39-45`).
- API-optional / UI-required `fullName`.
- The canonical → projection → read-fallback model, including the deliberate one-way limit.
- The cron's atomic claim + pending-marker + claim-release-on-total-failure design
  (`signup-notifications.cron.ts:131-171`).
- Template: zero images, zero external links, always send a `text` part.
- Leaving the sending path alone. It works; every deliverability item in the old plan that
  would have touched the transport or the sender is withdrawn.

---

# 3. WHAT CHANGED

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| Transport gains `to: string\|string[]` | **Removed** | Per-recipient loop retained | W2/W4: single-message-to-list leaks personal addresses and contradicts the stated goal |
| One message to 6 recipients | **Reversed** | 6 messages, one per recipient — exactly today's behaviour | W2 |
| Dispatch returns booleans | **Reverted** | Keep `{ delivered: number; failed: number; skipped: boolean }` | W3: both callers accumulate counts |
| New `SIGNUP_ALERT_FROM` sender | **Dropped** | Sender stays `config.email.from` / `EMAIL_FROM` | Owner constraint: sending works, do not touch it |
| Transport gains `headers?` | **Dropped** | No custom headers | Same — requires editing the shared transport |
| Transport "cannot set Reply-To" | **Corrected** | Reply-To is already supported (`index.ts:25,65`); passing it is optional and additive | O6 |
| Email phase is a deliverability fix | **Demoted** | Email phase = template content only; deliverability ops optional | W7: spam placement is UNVERIFIED and you report delivery is fine |
| F5 = HIGH, in NOW | **Demoted** | LOW / latent; guard stays as one `if`, moved to NEXT | W5 |
| New `resolveUserDisplayName` | **Kept, sharpened** | Mirror `resolveGreetingName` precedence; fetch businesses in the cron's existing query (no N+1) | W6 |
| Backfill `WHERE full_name IS NULL` | **Kept, extended** | `WHERE u.full_name IS NULL OR btrim(u.full_name) = ''` | M5 |
| `ownerName` optional on create | **Kept, completed** | Also: `fullName` in the user `select`, swagger update, explicit 400 when both absent | M1, M2 |
| `updateMe` guard | **Kept, restated** | Skip the `updateMany` entirely when the name is empty — never write `null`/`''` to a non-null column | M4 |
| 18 other templates | **Corrected** | 30 template files | O4 |
| `register()` writes name only | **Extended** | Also feed `customerName` from the name | M3 |
| File map | **Corrected** | `services/dva/dva-account.service.ts`, `services/documents/receipt.service.ts`, `+ config/swagger.ts`, `+ services/documents/statement.service.ts` | O1, O2, M2 |
| Alert template rewrite | **Kept, plus** | Subject falls back to email when no name; all interpolated values escaped | new, M6 |
| — | **Added** | `pages/marketing/Register.tsx` explicitly DO-NOT-TOUCH | U3 |
| — | **Added** | Edge-case matrix + acceptance criteria with concrete assertions | Phase 8/12 of the protocol |

---

# 4. VERIFIED FILE IMPACT

## CREATE

| File | Role → why → what |
|---|---|
| `backend/prisma/migrations/<ts>_backfill_user_full_name/migration.sql` | Data backfill. Writes `users.full_name` only where it is NULL/blank **and** an owned business has a non-blank `owner_name`. No schema change, no lock risk (no DDL). |

## MODIFY — backend

| File | Why | What |
|---|---|---|
| `src/validators/auth.validator.ts` | F1 | Add `fullName: z.string().trim().min(2).max(100).optional()` to `registerSchema` (`:2-19`). |
| `src/services/auth/auth.service.ts` | F1, F6, M3, M4 | `register()`: write `fullName` into `tx.user.create` (`:199-211`) and use it for `customerName` (`:219`). `updateMe()`: wrap the `updateMany` (`:508-513`) so it is skipped when the new name is empty. Add `resolveUserDisplayName()`. |
| `src/validators/business.validator.ts` | F4 | `ownerName` → `.optional()` on `createBusinessSchema` (`:6`). Keep `updateBusinessSchema` unchanged. |
| `src/services/business/business.service.ts` | M1, C3 | Add `fullName: true` to the user `select` (`:74-88`). Resolve `ownerName` **before** the `...input` spread (`:102-110`) and throw `400 OWNER_NAME_REQUIRED` when both are absent. |
| `src/lib/email/templates/new-signup-notification.ts` | C7, M6 | Rewrite subject + body (see §5.4); wrap every interpolated value in `escapeHtml` from `src/lib/email/escape.ts`. Keep `NewSignupNotificationData` shape so both callers compile untouched. **The only email file that changes.** |
| `src/services/admin/admin.service.ts` | C2 | `notifyUserSignup` (`:1828-1862`): replace `fullName: user.fullName` with the resolver result. Return shape unchanged. |
| `src/jobs/signup-notifications.cron.ts` | C2 | `:105-121`: include the businesses needed by the resolver in the same query (or call the resolver with a single batched fetch). `:143-150`: pass the resolved name. Result accounting unchanged. |
| `src/config/swagger.ts` | M2 | `POST /businesses` request schema (`:218-221`): drop `ownerName` from `required`. |

## MODIFY — frontend

| File | Why | What |
|---|---|---|
| `src/pages/Register.tsx` | F2 | Add a required **Full name** `Input` as the first field (state at `:96-105`, form at `:256+`), trimmed, 2-100, blocked in `handleSubmit` before the API call. Pass it to the store. |
| `src/stores/auth.store.ts` | C1 | `register` signature (`:40-47`, impl `:84-97`): append `fullName?: string` as the **last** parameter and include it in the POST body only when non-empty. Appending (not inserting) keeps both existing call sites type-safe. |
| `src/pages/Settings.tsx` | F3, C5 | `ProfilePanel` (defined inline at `:619`, rendered at `:489-497`): add a "Full name" input that `PATCH /auth/me` on save, then `fetchMe()`. This is the only profile-edit surface — there is no separate settings component. |
| `src/components/CreateBusinessModal.tsx` | C3 | Prefill `form.ownerName` from `user.fullName` when the modal opens (`:50-56`); keep the field editable and the client-side guard at `:67` (it now passes trivially). |

## DO NOT TOUCH

| File | Why |
|---|---|
| `src/lib/email/index.ts` | **The sending path. It works.** `from` stays hardcoded to `config.email.from` (`:60`); no `from`/`headers` fields are added; `to` stays `string`. |
| `src/config/index.ts` (email block) | `config.email.from` / `EMAIL_FROM` / `RESEND_API_KEY` unchanged. No new email env vars are introduced by this plan. |
| `src/config/signupNotifications` (`config/index.ts:219-235`) | Recipient list and `delayMinutes` unchanged. Changing the list is an ops decision, not part of this work. |
| `src/services/email-dispatch.service.ts` | **No change.** Keep the `for (const to of recipients)` loop (`:2041-2058`), the `sendEmail({ to, subject, html, text })` call and the `{ delivered, failed, skipped }` return exactly as they are. Listed so the implementer knows it was considered and deliberately excluded. |
| `src/pages/marketing/Register.tsx` | Unrouted dead page. Changing the store signature's *arity* would break its type-check; appending an optional param does not. Leave it. |
| `src/components/account/DvaOnboardingWizard.tsx` | Phone-only `PATCH /auth/me` (`:117`) is correct as-is. |
| `src/components/settings/TeamSettingsTab.tsx` | Its `fullName` writes target *team members* (`:306-318`), a different path with different semantics. |
| All 29 other templates in `lib/email/templates/` | Untouched. Only the signup alert's subject/body text changes; no sender, config or transport change reaches them. |
| `Business.ownerName` consumers | `services/documents/receipt.service.ts:67,141,315`, `services/documents/statement.service.ts:290,546`, `services/dva/dva-account.service.ts:71,284,434,459`, `admin.service.ts:231,476,1320,1369`, `TeamSettingsTab.tsx:278,313,560`. All read the projection; none should read `User.fullName`. |

## DATABASE

- **No schema change.** `User.fullName String?` (`schema.prisma:17`) and
  `Business.ownerName String` (`:97`) already exist.
- **One data migration** (backfill). Idempotent, `WHERE`-scoped to NULL/blank names.
- `Business.ownerName` stays `NOT NULL` — this is why the "empty name" path must skip the
  write rather than null it.

## CONFIGURATION

**No new email configuration. No Railway variables change. No `.env.example` change.**

The old plan's `EMAIL_REPLY_TO` and `SIGNUP_ALERT_FROM` are withdrawn — introducing them
means editing the transport and the sender, which is exactly what is working and must be
left alone.

Optional, ops-only, **does not touch the app or its sending path**: a DMARC `rua=` address on
`_dmarc.wallxerp.com` so aggregate reports start arriving. This changes nothing about how
mail is sent or delivered today; it only creates a feedback channel. Do it only if you want
the measurement.

## TESTS

| File | Change |
|---|---|
| `backend/tests/e2e/api.e2e.test.ts` | Register **with** `fullName` → `GET /auth/me` returns it; register **without** (`:143-146`) still 201; `fullName: " "` → 400. |
| `backend/tests/e2e/customer-crm.e2e.test.ts` | Already sends `fullName` (`:62-63`, `:81-82`) and is silently stripped today — after the change assert it round-trips. |
| `backend/tests/e2e/permission-overrides.e2e.test.ts` | No change needed; it proves the optional-field compat (`:57-59`). |
| New unit test | `resolveUserDisplayName` 4-step precedence + multi-business tie-break. |
| New unit test | Business create with no `ownerName` inherits `fullName`; with neither → `400 OWNER_NAME_REQUIRED`. |
| New unit test | `updateMe({ fullName })` propagates to all owned businesses; the empty-name branch performs **zero** `updateMany` calls. |

---

# 5. IMPROVED IMPLEMENTATION PLAN

## 5.1 Objective

Capture the account holder's name at sign-up, make `User.fullName` the canonical identity
with `Business.ownerName` as its projection and fallback, and re-shape the internal sign-up
alert so it names the person and reads like a person wrote it. The sending path is not
touched.

## 5.2 Name model

```
User.fullName        ← CANONICAL (account holder)
Business.ownerName   ← PROJECTION of User.fullName, editable per business, NOT NULL
```

**Read rule** — mirror the precedence already implemented client-side in
`resolveGreetingName` (`Dashboard.tsx:392-406`) so the two never disagree:

```
displayName = User.fullName (trimmed, non-empty)
           ?? primaryBusiness.ownerName
           ?? earliest-owned Business.ownerName (by createdAt)
           ?? null            → caller prints "Not provided"
```

Implemented once as `resolveUserDisplayName(userId)` in `auth.service.ts`, returning
`string | null`. Ownership is implied by `Business.userId`; do not gate on `role`.

**Write rules**

| Trigger | Writes | Rule |
|---|---|---|
| Signup | `User.fullName` | New optional API field; trimmed 2-100; UI-required |
| `PATCH /auth/me { fullName }` | `User.fullName` → every owned `Business.ownerName` | Existing projection, **minus** the empty write |
| `POST /businesses` | `Business.ownerName` | Optional; defaults to `User.fullName`; `400 OWNER_NAME_REQUIRED` if neither |
| Legacy gap | `User.fullName` ← `Business.ownerName` | One-time migration only |

**Explicit non-rule:** editing a business's owner name never writes back to `User.fullName`.
Multi-business accounts make that ambiguous and destructive.

## 5.3 API contract

```
POST /api/v1/auth/register
  { email, password, phone?, fullName?, requestedPlan?, acquisitionSource?, acceptedTerms? }
  fullName: trimmed 2-100, OPTIONAL at the API, REQUIRED in the web form
  response: unchanged (fullName already flows via sanitizeUser's spread)

PATCH /api/v1/auth/me
  { phone?, fullName? }   unchanged contract; now actually reachable from Settings

POST /api/v1/businesses
  { ..., ownerName? }     now optional; defaults to User.fullName
```

## 5.4 Email changes — content only

**The sending path is frozen.** `lib/email/index.ts`, `config.email.from`, the Resend client,
`RESEND_API_KEY`, and the `config.signupNotifications` block are not modified. The transport
keeps `to: string`, keeps the hardcoded `from`, gains no `headers`, and every other template
is untouched. Exactly **one** email file changes.

**Dispatch** (`email-dispatch.service.ts`) — unchanged in structure:

```
for (const to of recipients):          // keep — 6 separate messages, as today
    sendEmail({ to, subject, html, text })   // keep — same call, same return
```

Keep the per-recipient loop. It is what is already working, it keeps the six addresses
private from one another, and it means the change cannot affect delivery. Do **not** collapse
it into one message: the list is not all-internal (`config/index.ts:223-228` contains
`ogigairichmond@gmail.com`, `refsilva@yahoo.com`, `ro@devcenter.africa`), so a shared `To:`
would publish personal addresses to the other five and make the message look more like bulk
mail to exactly the two providers holding those mailboxes.

*Optional, and only if you want replies:* the transport already accepts and forwards
`replyTo` (`index.ts:25`, `:65`). Adding `replyTo: 'support@wallxerp.com'` as a literal on the
existing `sendEmail` call in the dispatch is a one-line, additive change with no effect on any
other sender. It is **not required** for this feature — skip it if you want the email path
byte-identical to today.

**Template** (`new-signup-notification.ts`) — the whole email change:

- Subject: `New WallX ERP account — ${name}` where `name = fullName ?? userEmail`; never the
  literal string "Not provided" in a subject.
- Remove the dark `INTERNAL SIGN-UP ALERT` header (`:56-58`) and the
  "Automated message from the sign-up notification job" footer (`:85-87`, `:109`).
- Body: greeting → name / email / phone → signed-up time → acquisition source → User ID.
  Keep every field currently in `rows` (`:27-34`); they are operationally useful.
- Sign-off "— WallX Product", one line explaining why they received it, one physical-address
  line.
- Keep: zero images, zero external links, `text` part present, plain inline styles.
- Do not touch `generateNewSignupNotificationText`'s field set — only its framing lines.
- **Escape every interpolated value** with `escapeHtml` (`src/lib/email/escape.ts`), including
  the name, email, phone and acquisition source. This is a fix the rewrite should carry
  (M6), not new scope: the values are already interpolated raw today.

This is content. It cannot change sender identity, authentication, routing or provider
behaviour.

## 5.5 Implementation steps

> **Step 1 — `backend/src/validators/auth.validator.ts`**
> `registerSchema.fullName` (optional, trim, 2-100). **Why:** contract first, so the service
> has a typed field. **Dependencies:** none.

> **Step 2 — `backend/src/services/auth/auth.service.ts`**
> Write `fullName` in `register()`; use it for `customerName`; skip the `updateMany` when the
> name is empty; add `resolveUserDisplayName()`. **Dependencies:** Step 1.

> **Step 3 — `backend/src/validators/business.validator.ts` + `services/business/business.service.ts` + `config/swagger.ts`**
> `ownerName` optional; add `fullName: true` to the user `select`; resolve before the spread;
> `400 OWNER_NAME_REQUIRED`. **Dependencies:** Step 2 (resolver available).

> **Step 4 — `templates/new-signup-notification.ts`** *(content only)*
> Subject + body rewrite (§5.4). Do **not** touch `services/email-dispatch.service.ts`,
> `lib/email/index.ts` or any config. **Why:** the alert should name the person; the sending
> path is working and stays untouched. **Dependencies:** Step 2 (name is now stored).

> **Step 5 — `services/admin/admin.service.ts` + `jobs/signup-notifications.cron.ts`**
> Both callers use the resolver. Batch the business lookup into the cron's existing
> `findMany`. **Dependencies:** Step 2.

> **Step 6 — migration**
> Backfill SQL (§5.6). **Dependencies:** Step 1 (column semantics settled). Safe to run
> independently of the code deploy — it only fills NULLs.

> **Step 7 — frontend**
> `Register.tsx` name field → `auth.store.ts` (append `fullName?` last) → `Settings.tsx`
> `ProfilePanel` editor → `CreateBusinessModal.tsx` prefill. **Dependencies:** Steps 1-3.

> **Step 8 — ops (optional)**
> DMARC `rua=` only, if you want aggregate reports. No Railway variables, no sender change,
> no Resend changes. **Dependencies:** none — can be skipped entirely.

## 5.6 Migration

```sql
-- Fill only where the account has no usable name and an owned business has one.
-- Prefer the primary business, else the earliest created.
WITH candidate AS (
  SELECT DISTINCT ON (b.user_id)
         b.user_id,
         btrim(b.owner_name) AS owner_name
  FROM businesses b
  JOIN users u ON u.id = b.user_id
  WHERE (u.full_name IS NULL OR btrim(u.full_name) = '')
    AND b.owner_name IS NOT NULL
    AND btrim(b.owner_name) <> ''
  ORDER BY b.user_id,
           (b.id = u.primary_business_id) DESC,
           b.created_at ASC
)
UPDATE users u
SET full_name = c.owner_name
FROM candidate c
WHERE u.id = c.user_id
  AND (u.full_name IS NULL OR btrim(u.full_name) = '');
```

Notes: `b.id = u.primary_business_id` is never NULL (it yields `false` when
`primary_business_id` is NULL), so no `NULLS LAST` is needed. The `UPDATE` re-checks the
predicate, so it is idempotent and cannot overwrite a name written between the `WITH` and the
`UPDATE`. Rollback: leave the backfilled values — they are correct data.

---

# 6. EDGE CASES

| Scenario | Expected behaviour |
|---|---|
| `fullName: " "` at register | 400 — trim then `min(2)` |
| Register without `fullName` | 201; `full_name` stays NULL; alert falls back to business name, then "Not provided" |
| User with 0 businesses | Resolver returns null → "Not provided"; subject uses email |
| User with 3 businesses, different owner names | Primary first, else earliest `createdAt` — deterministic |
| User clears the name in Settings | 400 (validator `min(2)`); the projection is never blanked. The empty branch is defensive only |
| Business create with neither name | `400 OWNER_NAME_REQUIRED` |
| Business create with `ownerName` omitted | Inherits `User.fullName` |
| Old client posts `ownerName` | Still accepted — field is optional, not removed |
| Old client posts unknown keys | Stripped by Zod, as today (no `.strict()` on `registerSchema`) |
| Provider down for all 6 recipients | Claim released, retried next minute — unchanged (`cron:155-171`) |
| Partial failure (3 of 6 send) | No claim release; 3 delivered. Unchanged behaviour — accepted |
| Test-account signup | Claimed and stamped, no send — unchanged (`cron:139`) |
| Admin re-sends after cron already ran | Allowed; marker re-stamped — unchanged (`admin.service.ts:1866-1869`) |
| Invited team member (role ≠ `user`) | Excluded from the cron query — unchanged |
| Concurrent `updateMe` + business create | Last write wins on `ownerName`; both write the same value in practice |
| Migration run twice | Second run matches zero rows |
| Email provider down | Identical to today — the dispatch, loop and claim-release are unchanged |

**Security notes.** No new endpoints, no new authorisation surface. `resolveUserDisplayName`
must be scoped to the target `userId` — do not let the admin endpoint resolve names for
users outside its existing admin guard. The per-recipient loop keeps internal/consumer
addresses private from one another (this is the security-relevant consequence of rejecting
the single-`To:` design).

**HTML injection (M6).** The template interpolates `fullName`, `userEmail`, `phone` and
`acquisitionSource` raw into HTML today (`new-signup-notification.ts:28-33`). Once `fullName`
is user-supplied at signup, a name like `<a href=...>` renders as markup in the team's inbox.
Import `escapeHtml` from `src/lib/email/escape.ts` and wrap every interpolated value — the
same pattern 8 existing templates already follow.

---

# 7. TESTING STRATEGY

1. **Unit — resolver:** name present; null name + primary business; null name + no primary +
   two businesses (earliest wins); no name, no business → null.
2. **Unit — business create:** omitted `ownerName` inherits; both absent → `400
   OWNER_NAME_REQUIRED`; explicit `ownerName` still wins over the inherited one.
3. **Unit — `updateMe`:** name change updates user + all owned businesses; empty name performs
   no business write (assert the mock is not called).
4. **e2e — register:** with name (round-trips via `/auth/me`), without name (201), whitespace
   name (400).
5. **Template snapshot:** subject contains the name; no `<img`, no `http` in the HTML body;
   `text` part non-empty; a `fullName` of `<script>x</script>` appears escaped, not raw.
6. **Dispatch — regression guard:** assert it still makes one `sendEmail` call per recipient
   with the same `to`/`subject`/`html`/`text` arguments and still returns
   `{ delivered: number; failed: number; skipped: boolean }`. This test exists to prove the
   sending path was *not* altered.
7. **Cron:** run the sweep with `delayMinutes: 0` against a seeded user → result counts
   unchanged in shape; a forced all-fail run releases the claim.
8. **Migration:** run against a copy; assert only NULL/blank-name users changed and the count
   matches expectation.

---

# 8. ACCEPTANCE CRITERIA

- [ ] A new signup through `/register` requires and stores a full name; `GET /auth/me`
      returns it.
- [ ] A signup **without** a name still returns 201 (backward compatible).
- [ ] `fullName: " "` returns 400.
- [ ] The alert email subject contains the person's name; the body shows it; "Not provided"
      appears only when no name and no business name exist.
- [ ] The alert still arrives **once per recipient** exactly as it does today, with no
      recipient seeing another's address.
- [ ] **The sending path is unchanged:** `git diff` shows no change to
      `src/lib/email/index.ts`, the `email` block of `src/config/index.ts`, the
      `signupNotifications` config, or `src/services/email-dispatch.service.ts`.
- [ ] `POST /businesses` without `ownerName` succeeds and stores the user's full name; with
      neither name it returns `400 OWNER_NAME_REQUIRED`; Swagger reflects the optional field.
- [ ] `PATCH /auth/me { fullName }` updates the user **and** every owned business's
      `ownerName`; clearing is rejected and blanks nothing.
- [ ] The Settings profile tab can edit the name, and the dashboard greeting reflects it.
- [ ] The backfill ran; no user who already had a name was modified.
- [ ] `npm run typecheck`/build passes in both `backend/` and `frontend/` — including the
      untouched `pages/marketing/Register.tsx`.
- [ ] *(optional)* `dig TXT _dmarc.wallxerp.com` shows a `rua=mailto:` address, if that ops
      step was taken.

---

# 9. REMAINING QUESTIONS

Only one survives code inspection, and it is optional:

1. **Do you want the DMARC `rua=` reporting address at all?** Sending works, so this is
   measurement only. If yes, a monitored mailbox must exist first — if `dmarc@wallxerp.com`
   does not, reports are silently discarded, which is worse than no `rua` because it looks
   configured. If no, skip the whole ops step; nothing in the code depends on it.

Not asked, because the code answers it: whether the sending path should change. It should
not — it is working, and this plan now touches exactly one email file (the template body).

---

# 10. FINAL READINESS SCORE

## **9 / 10** — implementation-ready

Every file, line and behaviour above was verified in the current tree. The email half is now
content-only and cannot regress delivery. The name-capture half is small, dependency-ordered,
and backward compatible (API-optional keeps `permission-overrides.e2e.test.ts:57-59` and
`api.e2e.test.ts:143-146` green; UI-required gets the data).

The remaining point is the optional DMARC step, which is measurement rather than
implementation and can be dropped without affecting the feature.

**You can hand §5 to a coding agent as-is.** The one thing to hold it to: the diff must not
touch `lib/email/index.ts`, the email config block, or the dispatch.
