# Payout Account Change Lock — Implementation Plan (payout.md)

**Feature:** Once a user connects a payout (settlement) bank account, they can no longer change it themselves. Only a **main admin** can grant a one-time permission to change it. After the user uses that permission (one successful change), the account locks again until a new admin permission is granted.

---

## 1. Rules (the state machine)

```
[never connected]  ──connect──▶  [CONNECTED + LOCKED]  (default for everyone)
[CONNECTED + LOCKED] ──admin grants──▶ [CHANGE PERMITTED] (one-shot)
[CHANGE PERMITTED] ──user changes account──▶ [CONNECTED + LOCKED]  (permission consumed)
[CHANGE PERMITTED] ──admin revokes──▶ [CONNECTED + LOCKED]
```

- **First connect:** always allowed, no permission needed (nothing to protect yet).
- **Every subsequent change:** requires an un-consumed admin permission.
- **Permission is one-shot:** consumed atomically on a _successful_ change. Failed Paystack calls do NOT consume it.
- **Existing users:** anyone with a settlement account already connected is locked immediately at migration time (that is the intent: "once it is set").
- Auto-split toggle (`PATCH /settlement/auto-split`): out of scope for this lock, but flagged — it also redirects money flow. Recommended follow-up: require the same admin permission (or at minimum the transaction PIN) to change split percentage.

## 2. Current state (what exists today)

- Two duplicate connect implementations — both must get the guard:
  - `settlement.service.ts → connectSettlementBank` (route `POST /businesses/:id/settlement/connect`, used by `PayoutWithdrawalModal`)
  - `dva.service.ts → connectSettlementBank` (route `POST /businesses/:id/dva/settlement/connect`, used by `Account.tsx`)
- `toggleAutoSplit` in `settlement.service.ts` (route `PATCH .../settlement/auto-split`)
- Admin system exists: `UserRole` (user/admin), admin routes/services with role middleware, audit logging (`logAudit`), reminder system (`createReminderOnce`)
- Paystack subaccount handling: connect currently **creates a new subaccount every call** — orphaning the old one on every change. This plan fixes that too.

## 3. Data model (Business model + migration)

Add four columns (migration `20260829120000_add_payout_change_lock`):

```prisma
payoutChangePermitted   Boolean    @default(false) @map("payout_change_permitted")
payoutChangePermittedAt DateTime?  @map("payout_change_permitted_at")
payoutChangePermittedBy String?    @map("payout_change_permitted_by")   // admin userId
payoutChangeUsedAt      DateTime?  @map("payout_change_used_at")        // when the one-shot was consumed
```

- No status enum needed — the state is fully derived: `connected && permitted=false → locked`; `permitted=true → one-shot open`.
- `payoutChangeUsedAt` is history/audit convenience (the full trail also lives in audit logs).

## 4. Backend enforcement

**Shared guard** (put in `lib/ownership.ts` or a new `lib/payout-lock.ts`):

```ts
export function assertPayoutChangeAllowed(business: Business) {
  if (!business.settlementAccountNumber) return; // first connect — free
  if (business.payoutChangePermitted) return; // one-shot open
  throw new AppError(
    403,
    'Your payout account is locked for security. Contact support to request a change.',
    'PAYOUT_CHANGE_LOCKED',
  );
}
```

- Apply in **both** `connectSettlementBank` implementations (settlement.service + dva.service), _before_ any Paystack call.
- **Consume atomically on success:** the DB update that saves the new settlement account must run as `prisma.business.updateMany({ where: { id, payoutChangePermitted: true }, data: { ...newAccount, payoutChangePermitted: false, payoutChangeUsedAt: new Date() } })` inside the existing flow, and check `count === 1` — this makes the one-shot race-proof (two concurrent connects cannot both consume one permission). First-time connects (no prior account) skip the consume.

## 5. Paystack subaccount — update in place, don't orphan

When `business.paystackSubaccountCode` already exists, call the existing `provider.updateSubaccount(code, { bankCode, accountNumber, percentageCharge })` instead of `createSubaccount`. Benefits: no orphaned subaccounts on Paystack, and the DVA split (which references the subaccount code) keeps working with zero re-attachment. Only create + `splitDedicatedAccount` when there is no subaccount yet.

## 6. PIN step-up on the permitted change

A permitted change is a money-path operation: require the transaction PIN in the connect body (`pin`, validated via `pinService.verifyPin`) **only when changing an existing account** (first connect stays friction-free). Same pattern as `/settlement/withdraw`. This closes NEW-2 for the change path without needing the (still unused) `stepUpToken`.

## 7. Admin API

- `POST /api/v1/admin/businesses/:businessId/payout-change-permit` — grants the one-shot. Records `payoutChangePermittedBy = req.user.userId`, `payoutChangePermittedAt = now`. Audit: `admin.payout_change_permitted`. Idempotent (re-grant while already permitted just refreshes timestamp).
- `DELETE /api/v1/admin/businesses/:businessId/payout-change-permit` — revoke an unused permission. Audit: `admin.payout_change_permit_revoked`.
- `GET` response enrichment: include `payoutChange: { locked, permitted, permittedAt, usedAt }` in the admin business detail payload.
- Guarded by the existing admin role middleware. "Main admin" = the current single admin role; if a SUPER_ADMIN distinction is ever needed, add a role check here (open question below).

## 8. User-facing notifications (existing reminder system, fire-and-forget post-transaction)

- **On admin grant:** `createReminderOnce({ reminderType: 'payout_change_permitted', referenceType: 'business', referenceId: businessId, updateMessageOnDup: true })` — "Support approved a one-time payout account change. You can update it now from Account → Payout settings."
- **On successful change:** audit trail is authoritative; optionally a `payout_change_used` reminder confirming the new account (last-4 only in messages, per the repo's PII rule).
- No email/SMS yet (Phase 5 remainder) — the in-app bell is the delivery channel for now.

## 9. Frontend changes

**`Account.tsx` / `PayoutWithdrawalModal.tsx` (settlement form):**

- The settlement preview (`GET /settlement/preview`) response gains `payoutChange: { locked, permitted }` (computed server-side from the new fields).
- If `locked && !permitted`: replace the change form with a locked-state card — "Payout account is locked. Contact support to request a change." (show connected account, last-4 only).
- If `permitted`: amber banner "One-time change approved by support — this closes after you save a new account", require the PIN field, then the normal resolve → connect flow.
- First-time (nothing connected): unchanged flow.

**Admin panel (`AdminUserDetail.tsx` or `AdminBusinesses.tsx`):**

- Detail view shows payout status (connected bank, last-4, locked/permitted state, who granted, when used).
- "Permit one-time payout change" button → confirm dialog (records the acting admin) → success toast; "Revoke" button when a permission is pending. Consistent with the read-only admin panel today.

## 10. Tests

- **Unit:** `assertPayoutChangeAllowed` truth table (no account / locked / permitted / first-connect).
- **E2E (extend `api.e2e.test.ts`):**
  1. First connect → 200 (unchanged).
  2. Second connect without permission → **403 `PAYOUT_CHANGE_LOCKED`**.
  3. Non-admin calls the admin permit endpoint → 403.
  4. Admin grants → second connect (with PIN) → 200, permission consumed.
  5. Third connect → 403 again.
  6. Admin revoke → previously-permitted connect → 403.
- Verify audit rows exist for grant / revoke / change.

## 11. Rollout & defaults

- Migration is additive (4 nullable/default columns) — safe, no backfill; existing connected businesses become locked automatically by the default, which is the requested behavior.
- Deploy backend first (old frontend just shows a 403 toast on change attempts until the frontend ships).
- Support runbook: "user asks to change payout account" → admin verifies identity offline → clicks permit → tells the user.

## 12. Open questions (defaults chosen; say the word to change)

1. **Admin scope:** any `admin` role can grant — or do you want a separate SUPER_ADMIN ("main admin") as the only grantor? Default: current single admin role.
2. **Permission expiry:** should an unused permission expire (e.g., 7 days)? Default: no expiry — stays until used or revoked.
3. **Auto-split lock:** include split-percentage changes under the same admin permission? Default: out of scope, recommended follow-up (it currently only needs a bearer token — noticepay.md NEW-2; at minimum add PIN).
4. **Consolidation:** both duplicate connect implementations get the guard, but consolidating into `settlement.service` only is strongly recommended in the same PR (noticepay.md NEW-3) to avoid drift.

## 13. Effort estimate

- Backend (migration + guard + atomic consume + admin endpoints + tests): ~half a day
- Frontend (locked state + banner + admin buttons): ~half a day
- Total: ~1 day of focused work.
