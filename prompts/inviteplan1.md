# Implementation Plan — Invitee Name Capture & Dashboard Greeting

**Date:** 2026-10-04
**Scope:** Two reported defects (invitee name not shown; dashboard greeting shows the email prefix)
**Method:** `implementplancode.md` v3.0 — evidence-first reconnaissance, risk register, execution-ready work items. Scoped to the two defects; the full 23-phase enterprise audit is deliberately not performed because the evidence does not justify it (see §9 Red-Team).
**Status:** Plan only. No code modified.

---

## 1. Executive Summary

Two reported symptoms share **one root cause: the data model has nowhere to store a person's name.**

| Model | Name column? | Evidence |
|---|---|---|
| `User` | **No** | `prisma/schema.prisma` — fields are `email`, `phone`, `bvn`, `nin`, `role`, … |
| `Invitation` | **No** | `prisma/schema.prisma` — fields are `businessId`, `email`, `role`, `permissions`, `tokenHash`, `status`, … |
| `Business` | Yes (`ownerName`) | `schema.prisma:81` — `ownerName String @map("owner_name")`, NOT NULL |
| `BusinessMember` | Smuggled through JSONB | `permissions.memberName` — see §3.2 |

Consequences, each confirmed in code:

1. **Invite list cannot show a name** — `listTeam` selects only `id, email, role, status, expiresAt, createdAt` (`team.service.ts:250-257`), and `Invitation` stores no name to select.
2. **Accept page cannot pre-fill a name** — `validateInviteToken` returns `email`, `role`, `businessName`, `business`, `expiresAt` (`team.service.ts:733-745`). No name exists to return.
3. **Greeting falls back to the email prefix** — `Dashboard.tsx:853` reads `user?.email?.split('@')[0]`. With no name on `User`, that string is the only thing available.

**A name IS already being captured and thrown away.** `acceptOnboardingInvite` writes the invitee's typed name into `BusinessMember.permissions` as a `memberName` JSONB key (`team.service.ts:837-841`), and the backend hand-preserves it across role edits (`team.service.ts:325-337`). **Zero frontend code reads `memberName`** (verified by grep across `frontend/src`). The name is collected, stored, preserved, and never displayed — which is precisely the reported symptom.

The fix is additive: two nullable columns, one backfill, and four wiring changes. No rewrite.

---

## 2. Evidence Base

**Read in full:** `prisma/schema.prisma` (`User`, `Invitation`, `Business`, `BusinessMember` models); `src/validators/team.validator.ts`; `src/validators/auth.validator.ts:1-35`; `src/controllers/invitation.controller.ts`; `src/services/team/team.service.ts:80-255, 318-360, 680-860`; `src/services/auth/auth.service.ts:30-60`; `src/services/team/team.service.ts:42-48` (`SAFE_USER_SELECT`); `frontend/src/pages/Dashboard.tsx` (lines 355-375, 853, 990-1010); `frontend/src/components/settings/TeamSettingsTab.tsx` (lines 160-310, 559-680); `frontend/src/pages/InvitationAccept.tsx` (lines 90-200); `frontend/src/types/index.ts` (lines 1-27, 90-110); `frontend/src/stores/team.store.ts:22-46, 95-98`.

**Deliberately NOT reviewed (not sufficient to verify):** `permission.service.ts` in full; email templates (`src/lib/email/templates/team-invitation.ts`); E2E test coverage for invitations; whether Netlify builds the frontend from the parent repo or the frontend repo (affects deploy sequencing only, not code correctness).

**Claims marked by confidence:**

- `CONFIRMED` — every citation above; each was read directly.
- `INFERRED` — that no other screen displays a member's name (grep found no `memberName` consumer, but a dynamic `permissions[key]` access could exist).
- `UNKNOWN` — production row counts in `invitations` / `business_members`, which affect backfill duration only, not correctness.

---

## 3. Root Cause Analysis

### 3.1 Primary — no name field in the model (CONFIRMED)

`registerSchema` (`auth.validator.ts:3-16`) collects `email`, `password`, `phone`. `inviteSchema` (`team.validator.ts:38-42`) collects `email`, `role`, `permissions`. Neither accepts a name, because there is no column to accept one into. Self-registered owners have no name either — so the greeting problem affects **every** user, not just invited members.

### 3.2 Secondary — name stored in the wrong place (CONFIRMED, deliberate)

`acceptOnboardingInvite` merges the name into a permissions blob:

```ts
// team.service.ts:837-841
const permissionsData = {
  ...((liveInvite.permissions as Record<string, boolean>) || {}),
  ...(input.fullName ? { memberName: input.fullName } : {}),
};
```

This is a **known workaround, not an oversight** — `updateMember` carries explicit preservation logic to stop role edits from deleting the key (`team.service.ts:325-337`).

This was verified rather than assumed: an initial hypothesis that editing a member's role would silently drop `memberName` was **wrong**. `TeamSettingsTab.handleOpenEdit` does filter to `OVERRIDABLE_PERMS` keys only (`TeamSettingsTab.tsx:270-279`), but the backend re-attaches the key on write. No data loss occurs.

**Assessment:** correct behavior, wrong home. It requires hand-written special-casing in two places, survives only because both sides cooperate, and — decisively — **is invisible to every consumer**. This plan adds a proper column and leaves the workaround in place rather than ripping it out (see §5).

### 3.3 Why the greeting cannot use the business name (CONFIRMED — UX)

The business name was offered as an acceptable substitute. It should be rejected: `Dashboard.tsx:1004` already renders `activeBusiness.businessName` as the `<h1>` **immediately below** the greeting. Greeting with the business name produces a visible duplicate two lines apart:

```
Good afternoon, Acme Ltd      ← greeting (line 999)
Acme Ltd                      ← <h1> (line 1004)
```

The person's name is the correct choice, and it is also what was actually asked for.

---

## 4. Risk Register

| ID | Finding | Severity | Confidence | Evidence | Impact | Action |
|---|---|---|---|---|---|---|
| R-1 | No name column on `User` or `Invitation` | 🟠 HIGH | HIGH (CONFIRMED) | `schema.prisma` | Blocks all 4 requested behaviours | Add `full_name` to both |
| R-2 | Greeting derives name from email prefix | 🟡 MEDIUM | HIGH (CONFIRMED) | `Dashboard.tsx:853` | Visible wrong output on every dashboard load | Replace derivation |
| R-3 | Pending-invites list cannot render a name | 🟡 MEDIUM | HIGH (CONFIRMED) | `team.service.ts:250-257` | Admin cannot tell who was invited | Add `fullName` to select |
| R-4 | Making fields read-only **client-side only** would be a security hole | 🔴 CRITICAL | HIGH (CONFIRMED by construction) | `acceptOnboardingSchema:57-68` currently trusts body `fullName` | Invitee could rewrite the admin-attested name by editing the DOM | Server must source the name from the `Invitation` row |
| R-5 | `sanitizeUser` may drop a new column | 🟢 LOW | HIGH (CONFIRMED — not a risk) | `auth.service.ts:38-44` uses rest-spread `...rest` | None | **DO NOT CHANGE** — new column flows through automatically |
| R-6 | `SAFE_USER_SELECT` whitelist omits any new field | 🟡 MEDIUM | HIGH (CONFIRMED) | `team.service.ts:42-48` | Team roster would silently omit the name | Add `fullName: true` |

**R-4 is the finding that shapes the design.** The requirement "uneditable by the person" can be satisfied cosmetically by adding `readOnly` to the inputs. That would be theatre — the accept endpoint still accepts `fullName` from the request body, so anyone could bypass the attribute. The plan therefore enforces the constraint **server-side**, and renders the inputs read-only only as a reflection of that.

---

## 5. What Should NOT Change — DO NOT CHANGE

1. **`sanitizeUser` (`auth.service.ts:38-44`).** Rest-spread means `fullName` reaches `/auth/me`, login, and register responses with no code change. Editing it adds risk for zero benefit.
2. **The `permissions.memberName` workaround (`team.service.ts:837-841`, `325-337`).** Leaving it costs ~15 lines of legacy code; removing it in the same release as a schema migration multiplies blast radius on a production database already 36 commits behind upstream. Retire it in a later, separate change.
3. **`validateInviteToken` security semantics (`team.service.ts:702-731`).** Correctly rejects revoked / used / expired / already-registered tokens. Untouched.
4. **The `TEAM_MEMBER_CAP` and role-escalation guards (`team.service.ts:95-98`, `140-164`, `316-322`).** Unrelated to naming; leave intact.
5. **`TeamSettingsTab` seat/permission UI.** Only the invite form and pending list change.

---

## 6. Target Design

**Schema** (additive, all nullable — no backfill-blocking NOT NULL):

```
User.fullName       String?  @map("full_name")
Invitation.fullName String?  @map("full_name")
```

**Server-side trust boundary (R-4):** `acceptOnboardingInvite` derives the name from `invitation.fullName` and **ignores any client-supplied `fullName`**. `fullName` is removed from `acceptOnboardingSchema`. Because Zod strips unknown keys by default, an older frontend still sending the field is not rejected — it is simply ignored.

**Greeting fallback chain** (`Dashboard.tsx:853`), first match wins:

1. `user.fullName` → first whitespace-delimited token (handles "Aisha Bello Mohammed" → "Aisha")
2. `activeBusiness.ownerName` → first token (covers existing owners, no backfill needed)
3. `activeBusiness.businessName` → whole string
4. `''` → render the greeting with no trailing name (never render `Good afternoon, `)

This chain degrades gracefully: even if the backfill finds nothing, no user sees a broken greeting.

---

## 7. Migration Strategy

**Current state** → **Intermediate** → **Target**

One additive, idempotent migration. No data is destroyed; every statement is re-runnable.

```sql
-- 2026MMDDHHMMSS_add_user_and_invitation_names/migration.sql
ALTER TABLE "users"      ADD COLUMN IF NOT EXISTS "full_name" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "full_name" TEXT;

-- Backfill: promote the existing JSONB memberName into the real column
UPDATE "users" u
SET "full_name" = btrim(b.permissions ->> 'memberName')
FROM "business_members" b
WHERE b."user_id" = u.id
  AND u."full_name" IS NULL
  AND b.permissions ->> 'memberName' IS NOT NULL
  AND btrim(b.permissions ->> 'memberName') <> '';
```

**Why `IF NOT EXISTS`:** matches the established convention in this repo (`20260810164700_add_cash_invoice_sources`), and matters because the production database has previously been repaired by hand — see the `SalesSource.credit` incident in project memory. Idempotency is the difference between a safe re-run and a failed deploy.

**Why the backfill is separate from the column add:** it is a `UPDATE` touching `users`; on a large table it should be observable on its own. Given this product's scale it will complete instantly, but keeping it separate means a slow backfill can never be mistaken for a failed schema migration.

**Rollback:** `ALTER TABLE ... DROP COLUMN` reverts the columns; the JSONB `memberName` values are never touched, so no data is lost in either direction. **The migration is fully reversible.**

**Deployment note:** this plan's migration is additive-only. Apply it **before** the code deploy, so no code path ever queries a column that does not yet exist.

---

## 8. Implementation Plan

Ordered, dependency-respecting. Each item is independently revertible.

---

### `NAME-01` — Add `full_name` to `users` and `invitations`, with backfill

- **Depends on:** None
- **Files touched:** `backend/prisma/migrations/2026MMDDHHMMSS_add_user_and_invitation_names/migration.sql` (CREATE); `backend/prisma/schema.prisma` — `User` model and `Invitation` model (MODIFY)
- **What to do:**
  1. Add `fullName String? @map("full_name")` to `model User` (near `email`/`phone`).
  2. Add `fullName String? @map("full_name")` to `model Invitation` (near `email`).
  3. Create the migration folder with the SQL from §7.
  4. Run `npx prisma generate`.
- **Acceptance criteria:**
  - `users.full_name` and `invitations.full_name` exist and are nullable.
  - `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma` reports **no drift** — i.e. the migrations and the schema agree exactly.
  - Every `User` having a non-empty `business_members.permissions->>'memberName'` has a non-null `full_name` equal to that value, trimmed.
  - `business_members.permissions` is **byte-identical** before and after (the workaround is untouched).
- **Verification:**
  ```bash
  cd backend
  npx prisma generate
  npx prisma migrate diff --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma --exit-code
  # expect: no output, exit 0
  ```
  ```sql
  -- in the Railway Postgres query console, after deploy
  SELECT count(*) FILTER (WHERE u."full_name" IS NULL) AS null_names,
         count(*) FILTER (WHERE u."full_name" IS NOT NULL) AS named
  FROM users u JOIN business_members b ON b."user_id" = u.id;
  ```
- **Rollback:** `DROP COLUMN` both; JSONB source data was never modified. Fully reversible.
- **Effort:** S (~20 min)
- **Risk if skipped:** every subsequent item fails to compile or 500s at runtime. Hard blocker.

---

### `NAME-02` — Accept a name when inviting (backend)

- **Depends on:** `NAME-01`
- **Files touched:** `backend/src/validators/team.validator.ts` (MODIFY — `inviteSchema`, lines 38-42); `backend/src/services/team/team.service.ts` (MODIFY — `inviteMember`, lines 100-182, plus audit payload at 191-195 and the return shape at 210-218)
- **What to do:**
  1. Add to `inviteSchema`: `fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional()`. Keep it `.optional()` so the change is additive to the API contract and older clients keep working.
  2. Normalize alongside email: `const normalizedName = input.fullName?.trim() || null;`
  3. Pass `fullName: normalizedName` into `prisma.invitation.create` (line 172-182).
  4. Add `fullName` to the `logAudit` `newData` block (lines 191-195).
  5. Add `fullName` to the returned `invitation` object (lines 210-218) so the frontend can confirm what was sent.
- **Acceptance criteria:**
  - `POST /businesses/:id/team/invite` with `fullName: "Aisha Bello"` persists it to `invitations.full_name`, trimmed.
  - Omitting `fullName` still returns 201 (backward compatible).
  - A 1-character name returns 400 with message `Name must be at least 2 characters`.
  - The audit row `team.invited` records the name.
- **Verification:** `cd backend && npm run typecheck`; then `curl` the invite endpoint with a valid token, and confirm via the Postgres console.
- **Rollback:** revert `team.validator.ts` + `team.service.ts`. The column simply goes unused. No data impact.
- **Effort:** S (~30 min)
- **Risk if skipped:** the accept page has no name to pre-fill; the invite list has nothing to show. The user-visible defect persists.

---

### `NAME-03` — Expose the invited name to the accept page (backend)

- **Depends on:** `NAME-02`
- **Files touched:** `backend/src/services/team/team.service.ts` (MODIFY — `validateInviteToken` return, lines 733-745)
- **What to do:** add `fullName: invitation.fullName` to the valid-token return object (line 733). Add it to **every** early-return branch too (`not_found`, `revoked`, `already_used`, `expired`) as `fullName: null` — so the response shape is stable and the frontend needs no optional-chaining on a missing key.
- **Acceptance criteria:**
  - A valid token returns `fullName` matching `invitations.full_name`.
  - All five invalid-reason branches return the same shape with `fullName: null`.
  - Token-security semantics are byte-for-byte unchanged (still rejects revoked / used / expired / already-registered).
- **Verification:** `npm run typecheck`; validate a live invite token via `GET /api/v1/invitations/validate?token=…` and confirm the field is present.
- **Rollback:** revert the function. Column persists unused.
- **Effort:** S (~15 min)
- **Risk if skipped:** `NAME-07` has nothing to pre-fill.

---

### `NAME-04` — Stop trusting the invitee-supplied name (backend, security)

- **Depends on:** `NAME-03`
- **Files touched:** `backend/src/validators/team.validator.ts` (MODIFY — `acceptOnboardingSchema`, lines 57-68); `backend/src/services/team/team.service.ts` (MODIFY — `acceptOnboardingInvite`, `user.create` at 825-835 and `memberName` block at 837-841, and the `liveInvite` select at 786-789)
- **What to do:** — **this is R-4, the load-bearing item**
  1. **Remove `fullName` from `acceptOnboardingSchema`.** Zod strips unknown keys by default, so a client still sending it is not rejected — it is ignored. That is the desired behaviour: the invitee's typed name is never authoritative.
  2. In `acceptOnboardingInvite`, change the user insert to `fullName: liveInvite.fullName` (line 825-835), sourcing from the invitation row, not the request.
  3. Keep the existing `permissions.memberName` write exactly as-is (lines 837-841), but base it on `liveInvite.fullName` rather than `input.fullName`, so both copies agree.
  4. Add `fullName: true` to the `liveInvite` `select` (line 786-789).
- **Acceptance criteria:**
  - `POST …/accept-onboarding` with a **forged** `{"token":"…","password":"…","fullName":"Mallory Evil"}` creates the user with the name from the **invitation**, not `Mallory Evil`.
  - The same request without `fullName` behaves identically.
  - `business_members.permissions->>'memberName'` equals `users.full_name` for the accepted user.
  - The existing password-strength and confirm-password rules still reject bad input.
- **Verification:** `npm run typecheck`; acceptance test asserting the forged-body case; `npm run test:integration` if a team suite exists (`NOT SUFFICIENTLY VERIFIED` — test coverage for invitations was not audited).
- **Rollback:** revert both files. No persisted data is invalidated — `full_name` on `users` simply stops being written.
- **Effort:** S (~30 min)
- **Risk if skipped:** the invitee can rewrite the admin-attested name by editing the DOM or replaying the request. The "uneditable" requirement would be cosmetic only.

---

### `NAME-05` — Show email + name in the pending invites list (backend + frontend)

- **Depends on:** `NAME-02`
- **Files touched:** `backend/src/services/team/team.service.ts` (MODIFY — `listTeam` `select`, lines 250-257); `frontend/src/types/index.ts` (MODIFY — pending-invitation type); `frontend/src/components/settings/TeamSettingsTab.tsx` (MODIFY — pending list, lines 559-610)
- **What to do:**
  1. Add `fullName: true` to the `pendingInvitations` `select` in `listTeam` (lines 250-257).
  2. Add `fullName?: string | null` to the frontend pending-invitation interface.
  3. In the pending list (currently renders only `{inv.email}`, `TeamSettingsTab.tsx:559-610`), render the name as the primary line and the email as secondary. When `fullName` is null (invites created before this change), fall back to email as primary — never render an empty line.
- **Acceptance criteria:**
  - A pending invite created after `NAME-02` shows **both** the full name and the email.
  - A pre-existing pending invite with `full_name IS NULL` renders its email and shows no blank name row.
  - Seat counters (`Pending Invites`, `Seats Used`) are unchanged.
- **Verification:** `npm run typecheck` (backend) and `npm run build` (frontend); manually invite a user, reload Team settings, confirm both fields render.
- **Rollback:** revert three files. Column persists unused.
- **Effort:** S (~30 min)
- **Risk if skipped:** the admin still cannot see who they invited — half of the reported defect.

---

### `NAME-06` — Add the name field to the invite form (frontend)

- **Depends on:** `NAME-02`
- **Files touched:** `frontend/src/components/settings/TeamSettingsTab.tsx` (MODIFY — state at 189-190, `handleOpenInvite` at 223-229, `handleSendInvite` payload at 245-249, form markup at 655-670)
- **What to do:**
  1. Add `const [inviteName, setInviteName] = useState('');` beside `inviteEmail` (line 189).
  2. Reset it in `handleOpenInvite` (line 223).
  3. Guard the submit early-return: `if (!activeBusiness?.id || !inviteEmail.trim() || !inviteName.trim()) return;`
  4. Add `fullName: inviteName.trim()` to the payload (lines 245-249).
  5. Render a "Full Name" input **above** the existing Email Address input (before line 655), matching the existing Tailwind classes.
- **Acceptance criteria:**
  - The form cannot be submitted with an empty name.
  - The name is trimmed and lower-casing is **not** applied to it (only the email is lower-cased, line 248).
  - The success toast still reads `Invitation sent to ${inviteEmail}`.
  - Layout is unbroken at mobile widths.
- **Verification:** `cd frontend && npm run build`; manually send an invite and confirm the stored value.
- **Rollback:** revert one file.
- **Effort:** S (~30 min)
- **Risk if skipped:** admins still cannot enter a name, so `NAME-05` renders nothing new.

---

### `NAME-07` — Pre-fill and lock email + name on the accept page (frontend)

- **Depends on:** `NAME-03`
- **Files touched:** `frontend/src/types/index.ts` (MODIFY — `ValidateInviteResponse`, lines 90-99); `frontend/src/pages/InvitationAccept.tsx` (MODIFY — state at 101, `setInviteDetails(res)` at ~135, submit payload at 184, form at ~374)
- **What to do:**
  1. Add `fullName?: string | null;` to `ValidateInviteResponse` (`types/index.ts:90-99`).
  2. On successful token validation (the `setInviteDetails(res)` call in `InvitationAccept.tsx`), initialise the name state from `res.fullName ?? ''`.
  3. Add a **read-only Email** display showing `inviteDetails.email` (it is returned by the API but is currently never rendered).
  4. Change the Full Name input to `readOnly` with muted styling (`bg-gray-50 text-gray-600`).
  5. **Remove `fullName` from the `acceptOnboarding` payload** (`InvitationAccept.tsx:184`). The value is server-derived after `NAME-04`; sending it is dead weight and misleading.
  6. Add a short helper line beneath: *"Your name was set by the person who invited you. If it's wrong, ask them to send a new invite."*
- **Acceptance criteria:**
  - Email and full name are both visible and read-only before the user types anything.
  - Neither field can be changed by clicking, selecting, or typing.
  - The submitted request body contains no `fullName`.
  - If `fullName` is null (legacy invite), the name field renders as read-only placeholder text — **not** an editable blank.
  - Password rules, confirm-password match, and the failure branches (`expired`, `already_used`, …) still render correctly.
- **Verification:** `npm run build`; open a real invite link, confirm both fields locked; inspect the network payload to confirm `fullName` is absent.
- **Rollback:** revert two files. Server still works — it sources the name from the invitation.
- **Effort:** M (~45 min)
- **Risk if skipped:** the invitee sees a blank name field and no email, and the reported accept-page defect persists.

---

### `NAME-08` — Fix the dashboard greeting

- **Depends on:** `NAME-01`
- **Files touched:** `frontend/src/types/index.ts` (MODIFY — `User` interface, lines 1-27); `frontend/src/pages/Dashboard.tsx` (MODIFY — line 853 derivation, line 999 render)
- **What to do:**
  1. Add `fullName?: string | null;` to the frontend `User` interface (`types/index.ts:1-27`).
  2. Replace line 853 (`const userName = user?.email?.split('@')[0] || '';`) with the §6 fallback chain. Extract it to a small pure helper `resolveGreetingName(user, activeBusiness)` beside `getGreetingLabel` (line 363) so it is testable and the derivation is no longer inline in the component body.
  3. At line 999, render the name only when non-empty — never emit a trailing `", "` when it resolves to `''`.
  4. **Delete the `email.split('@')` derivation entirely.** Do not keep it as a last-resort fallback; a greeting built from an email local-part is precisely the defect being fixed.
- **Acceptance criteria:**
  - A user with `fullName: "Aisha Bello Mohammed"` sees `Good afternoon, Aisha`.
  - A user with no `fullName` but a business `ownerName` sees the owner's first name.
  - A user with neither sees the business name — and, per §3.3, this duplicates the `<h1>` on line 1004; accept this only as a last resort.
  - A user with none of the three sees `Good afternoon` with **no** trailing comma or space.
  - The `email.split('@')` string does not appear anywhere in `Dashboard.tsx`.
- **Verification:** `npm run build`; log in as a user with a backfilled name and confirm the first token renders; grep to confirm the old derivation is gone: `grep -n "split('@')" src/pages/Dashboard.tsx` → no match.
- **Rollback:** revert two files.
- **Effort:** S (~30 min)
- **Risk if skipped:** the reported greeting defect persists on every dashboard load.

---

### `NAME-09` — Add `fullName` to `SAFE_USER_SELECT`

- **Depends on:** `NAME-01`
- **Files touched:** `backend/src/services/team/team.service.ts` (MODIFY — lines 42-48)
- **What to do:** add `fullName: true` to the `SAFE_USER_SELECT` constant so the team roster returns member names.
- **Acceptance criteria:** `listTeam` members include `user.fullName`.
- **Verification:** `npm run typecheck`; inspect a `GET …/team` response.
- **Rollback:** revert one line.
- **Effort:** XS (~5 min)
- **Risk if skipped:** team roster shows emails with no names. Low severity, but it is R-6 and costs one line.

---

### `NAME-10` — Regression tests

- **Depends on:** `NAME-04`, `NAME-07`, `NAME-08`
- **Files touched:** `backend/tests/unit/` (CREATE) — naming follows existing convention, e.g. `invite-name.service.test.ts`; `backend/tests/integration/` (CREATE) for the forged-body acceptance case. `frontend/` has no confirmed unit-test harness for components — **NOT SUFFICIENTLY VERIFIED** whether `npm test` covers `Dashboard.tsx`; if not, `NAME-08` is verified manually only.
- **What to do:**
  1. Unit: `resolveGreetingName` returns the first token of `fullName`; falls back to `ownerName`; falls back to `businessName`; returns `''` when all are absent.
  2. Integration: accept an invite with a forged `fullName` in the body → assert the persisted `users.full_name` equals `invitations.full_name`, not the forged value.
  3. Integration: invite without `fullName` → 201 (backward compatibility).
- **Acceptance criteria:** all three pass; the forged-name test fails if `NAME-04` is reverted.
- **Verification:** `cd backend && npm run test:unit && npm run test:integration`
- **Rollback:** delete the test files.
- **Effort:** M (~1 hr)
- **Risk if skipped:** R-4 silently regresses. This is the only automated guard on the security-relevant behaviour in the whole plan — treat it as required, not optional.

---

## 9. Red-Team — Attacking This Plan

- **Is the schema change over-engineering?** No. Two nullable columns are the minimum that makes the requested behaviour expressible. There is no way to render an invitee's name in three separate screens without persisting it.
- **Could `permissions.memberName` just be used instead?** No. It is only written at accept time — never at invite time, so the pending list still cannot show a name (§3.2). And it is invisible to every consumer. It cannot satisfy the requirement.
- **Is the backfill necessary?** For correctness of the greeting for existing members, yes. It is one `UPDATE` and is separately reversible.
- **Does `NAME-04` break the accept flow?** No. Zod strips unknown keys by default, so an older frontend sending `fullName` is ignored, not rejected. `NAME-07` stops sending it in the same release.
- **What if the admin mistypes a name?** Genuine product concern: the invitee cannot correct it, by explicit requirement. Mitigated by the helper text in `NAME-07` step 6 and the existing `resendInvitation` path. A future "admin can edit a pending invite's name" item is deliberately **out of scope**.
- **Why not add name capture to registration too?** It would fix the greeting for self-registered owners. Deliberately deferred: it touches the signup form and `registerSchema`, widening blast radius beyond the reported defects. Flagged in §11 as the highest-value follow-up.
- **Sequencing risk:** `NAME-01` must land before any code referencing `fullName`, or the Prisma client will emit a query for a non-existent column. `NAME-02`–`NAME-09` all depend on it for exactly this reason.
- **Verdict:** the plan survives its own attack. It is the smallest change that fully satisfies both reported defects, and it fixes the underlying trust-boundary hole rather than only the symptom.

---

## 10. Scoring

| Dimension | Score | Justification |
|---|---|---|
| Data architecture | 5 → 7 | Identity data was smuggled through a permissions JSONB with hand-written preservation logic. Two proper columns fix it. |
| API architecture | 6 | Accept endpoint trusted a client-supplied name for an admin-attested field (R-4). Now derived server-side. |
| Testability | 4 | The name-derivation and name-trust behaviour were entirely untested. `NAME-10` closes this for the new code. |
| Reliability | 6 | Additive migration, idempotent SQL, no destructive statement, fully reversible. |
| Security | 5 → 8 | Client-controlled admin-attested identity removed (R-4). |
| Maintainability | 6 | Removal of the `memberName` special-case is deferred, not skipped. |
| Overall | **6 → 7.5** | |

---

## 11. Remaining Unknowns

1. **Invitation test coverage** — not audited. If `NAME-10` cannot follow existing fixture patterns, budget more than 1 hr.
2. **Production row counts** for `users` / `business_members` — affects backfill duration only.
3. **Registration name capture** — out of scope, but without it self-registered owners depend on the `ownerName` fallback. Highest-value follow-up.
4. **Frontend component test harness** — unknown whether `Dashboard.tsx` is under test; affects how `NAME-08` is verified.
5. **`memberName` retirement** — the workaround remains until a separate, later change removes it along with `team.service.ts:325-337`.

---

## 12. Final Verdict

- **Biggest strength:** the invitation flow's security model is genuinely well-built — role-escalation guards, team caps, and token lifecycle are all correct and should be preserved untouched.
- **Biggest problem:** the data model has no concept of a person's name, so the product captures names and then cannot display them.
- **Biggest risk if left unchanged:** the accept endpoint trusts a client-supplied name for an admin-attested field (R-4). The moment anyone adds "edit my name" to that form, it becomes an identity-spoofing vector.
- **Highest-value first move:** `NAME-01`, then `NAME-04`.
- **Overall verdict:** 🟡 **Healthy but needs targeted work.** Both defects are symptoms of one well-understood modelling gap. The fix is 10 work items, mostly S, with one M and one security-relevant item. No rewrite, no new abstraction, no infrastructure.

---

## 13. Top Recommendations (ranked)

1. `NAME-04` — Stop trusting the client-supplied name *(security; the only true CRITICAL)*
2. `NAME-01` — Add the two columns + backfill *(unblocks everything)*
3. `NAME-08` — Fix the greeting *(the most visible symptom)*
4. `NAME-07` — Pre-fill and lock the accept form *(half the reported defect)*
5. `NAME-05` — Show name in the invite list *(the other half)*
6. `NAME-06` — Name field on the invite form *(enables `NAME-05`)*
7. `NAME-10` — Regression tests *(guards `NAME-04` against silent regression)*
8. `NAME-03` — Expose the name via token validation *(enables `NAME-07`)*
9. `NAME-02` — Accept a name when inviting *(enables `NAME-05`/`NAME-07`)*
10. `NAME-09` — `SAFE_USER_SELECT` *(one line; roster completeness)*