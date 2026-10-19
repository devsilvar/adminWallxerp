# Payout Mode Fix — Manual vs Automatic, End to End

> **Audience:** an implementation agent with access to this repo but *not* to this
> investigation. Every claim below is cited to `path:line` and was read directly from the
> code during a **second, adversarial review pass**. If you find something contradicting
> this document, trust the code and say so in your report — do not silently work around it.
>
> **Revision 2** — re-reviewed against the source. Corrections from revision 1 are listed in
> §8. The most important: **the revision-1 recommendation for B1 would have broken a CBN
> licensing control.** B1 is now fixed as a code-clarity issue, not a behavioural gate.

---

## 0. TL;DR

The payout mode is **conceptually user-scoped but physically stored on `Business`**, and
half-migrated code has bolted a "cascade to all businesses" hack on top. That mismatch
produces the bugs below.

| # | Severity | One-line summary |
|---|---|---|
| B1 | P2 — was mis-ranked P0 | Dead `autoPayoutEnabled` select in the sweep cron implies a mode check that must **not** exist (regulatory) |
| B2 | **P0 — blocks feature** | `/^d{10}$/` regex typo makes settlement-bank connect impossible |
| B3 | P1 | Merchant toggle rewrites all businesses but returns/audits only the one it changed |
| B4 | P1 | Admin user toggle silently no-ops for a user with 0 businesses, returns success |
| B5 | P1 | Admin business toggle rejects users the merchant path accepts |
| B6 | P1 | Admin user toggle enables auto on businesses with no bank → dead-end state |
| B7 | P1 | User-level mode derived via `.some()` — lossy and unreconstructable |
| B8 | P2 | Withdrawal modal tells auto-mode users "admin approval required, 1–2 hours" |
| B9 | P2 | No "Connect Bank" button for non-owners → dead end (failing test) |
| B10 | P3 | Dead `connectBank` store action; mode not exposed in Settings |

**Target:** one flag, `User.autoPayoutEnabled`. `Business.autoPayoutEnabled` is deleted.
Rationale in §2.

**Separate decision, same session:** the anti-deposit auto-sweep is being **disabled, not
deleted** (`SWEEP-01..04`, §5.1). It is independent of the payout-mode work — do it first.

---

## 1. How the system works today (read this before changing anything)

An SME has a **central wallet** — `WalletBalance` hangs off `User`, not `Business`
(`backend/prisma/schema.prisma:58`). A withdrawal:

1. SME opens `PayoutWithdrawalModal`, enters amount + 4-digit PIN.
2. `POST /businesses/:businessId/settlement/withdraw` → `withdrawBalance()`
   (`merchant-payout.service.ts`).
3. The wallet falls back business→user for the destination bank
   (`merchant-payout.service.ts:44-47` — confirmed: `business.user` **is** in the actor
   select, so `business.user.<anything>` is available here).
4. **The mode branch:** `merchant-payout.service.ts:89`
   ```ts
   const isAutoPayout = Boolean(business.autoPayoutEnabled);
   const initialStatus = isAutoPayout ? 'processing' : 'pending';
   ```
5. `pending` → waits for an admin in `/admin/withdrawals`.
   `processing` → paid by Paystack immediately.

### Two separate money-movement paths — do not conflate them

| | Merchant withdrawal | Nightly auto-sweep |
|---|---|---|
| Trigger | SME action | Clock (02:00 Africa/Lagos) |
| Service | `merchant-payout.service.ts` | `wallet-auto-sweep.cron.ts` |
| Honours payout mode | **Yes** (`:89`) | **No, by design — see B1** |
| Admin approval | Manual mode requires it | Never |
| Purpose | SME cash-out | CBN licensing compliance |
| Status after `SWEEP-01..03` | Active | **Dormant by default** — see §5.1 |

> **Decision on record (2026-10-02):** the product owner decided WallX does not currently need
> the auto-sweep. It is being **disabled, not deleted** — see `SWEEP-01..03` in §5.1. The code
> stays so it can be switched back on if merchant balances are ever taken without a licence.
> Note the consequence: once disabled, merchant balances **accumulate** in the pooled
> Paystack balance instead of being cleared nightly. That is a deliberate product decision,
> not an oversight — do not "fix" it by re-enabling the sweep.

The sweep's own header (`wallet-auto-sweep.cron.ts:1-9`) is unambiguous:

```
// Regulatory Mandate:
//   Clears accumulated merchant balances above threshold (default ₦1,000)
//   to their verified commercial bank accounts (NUBAN).
//   Ensures WallX operates strictly as a payment transit clearing gateway
//   and not an unlicensed deposit-taking / stored-value institution under CBN guidelines.
```

### Why "central wallet per user" decides the design

The pool is per-user and the concurrency fence is per-user
(`pg_try_advisory_xact_lock(hashtextextended(userId::text, 0))`, `merchant-payout.service.ts:95-97`).
The duplicate guard spans **all of the user's businesses** (`:140-144`). One withdrawal
debits one pooled balance and picks one business as the bookkeeping counterparty. The money
is already user-level.

---

## 2. Architecture decision: user-level or business-level?

**Decision: USER-level. `Business.autoPayoutEnabled` is removed.**

The user's instinct is right, and the codebase already agrees — it just encodes it badly:

- `merchant-payout.service.ts:677` — *"Ensure account-level consistency across all businesses owned by this user"*
- `admin-payout.service.ts:764-766` — *"Syncs across all businesses owned by this user."*
- `admin-payout.service.ts:805` — *"Update all businesses for this user so all withdrawals follow the account-level mode."*

Someone designed user-scoped semantics and implemented them as a **fan-out write** on a
business-scoped column. That is what generates B3–B7.

**Why per-business is incoherent here:** funds are pooled per user. If business A is auto and
business B is manual, the SME has no answer to "I just requested ₦50k from business B — will
it be instant?" The answer depends on a flag belonging to a *different* business that shares
the same money. Unanswerable, therefore wrong.

**What per-business still legitimately owns:** the destination bank. Each business has its own
`settlementAccountNumber` / `settlementBankCode` / `settlementAccountName`
(`schema.prisma:88-91`). That stays. One payout mode, many destinations.

---

## 3. The bugs, with evidence

### B1 — P2: the sweep cron carries a dead select that implies a mode check it must not make

`backend/src/jobs/wallet-auto-sweep.cron.ts:157`

```ts
businesses: {
  select: {
    ...
    autoPayoutEnabled: true,   // selected, never read anywhere in the file
  },
},
```

The cron then picks the target business with no reference to the flag (`:201-204`) and
creates the payout directly as `status: 'processing'` (`:312`), bypassing
`merchant-payout.service` and therefore the mode check at `:89`.

**Do NOT add a payout-mode gate here.** Revision 1 of this plan recommended exactly that, and
it was wrong. The sweep is a **CBN licensing control** (§1). Gating it on
`autoPayoutEnabled` means a manual-mode user's balance accumulates above the threshold
indefinitely — which is precisely the unlicensed stored-value exposure the cron exists to
prevent. "Manual mode" is a statement about *merchant-initiated withdrawals*; it is not a
licensing exemption.

For the record, the sweep is **not invisible to admins**: it writes real `SettlementPayout`
rows with `narration: 'Auto-sweep: regulatory clearing'`, and `adminListWithdrawalRequests`
applies no status filter by default (`admin-payout.service.ts:23-25`), so they appear in
`/admin/withdrawals`.

**Actual defect:** a dead `select` that reads as an unimplemented intent, plus user-facing
copy that over-promises. Fix in `PAY-01` and `PAY-08`.

### B2 — P0: settlement bank can never be connected

`frontend/src/components/account/SettlementBankCard.tsx:68`

```ts
if (!/^d{10}$/.test(settlementAccount)) {
```

`/^d{10}$/` is a missing backslash. It matches the literal string `dddddddddd` and nothing
else, so it **always** fails. `handleResolveSettlement` can never set `resolvedName`, so
`handleConnectSettlement` (`:93`, guarded by `if (!resolvedName) return;` at `:94`) can never
run. The whole SME settlement-bank flow is dead in the UI. Fix in `PAY-02`.

### B3 — P1: merchant toggle lies about what it changed

`backend/src/modules/wallet/services/merchant-payout.service.ts:667-681`

```ts
const updated = await prisma.business.update({
  where: { id: businessId },          // one business
  data: { autoPayoutEnabled: params.enabled },   // :669
  ...
});

// Ensure account-level consistency across all businesses owned by this user
await prisma.business.updateMany({
  where: { userId },                  // :678 — …then ALL of them
  data: { autoPayoutEnabled: params.enabled },   // :680
});
```

The SME toggles the switch on **business A**. Every other business the user owns is silently
rewritten. Then `:700` returns `{ autoPayoutEnabled: updated.autoPayoutEnabled }` — only
business A's value. The audit log (`:689-690`) likewise records only A's old value, so **the
collateral writes are invisible in the audit trail**.

### B4 — P1: admin user toggle no-ops on a business-less user

`backend/src/modules/wallet/services/admin-payout.service.ts:806-811`

```ts
if (user.businesses.length > 0) {
  await prisma.business.updateMany({ where: { userId: targetUserId }, data: { autoPayoutEnabled: enabled } });  // :809
}
...
return { userId: targetUserId, autoPayoutEnabled: enabled };   // :829
```

For a user with zero businesses, **nothing is written**, no error is raised, and the response
reports success. The admin UI displays "Automatic" for a setting that does not exist.

### B5 — P1: admin and merchant disagree about who has a bank

Three different rules for the same question:

| Path | Rule | Source |
|---|---|---|
| Merchant toggle | `business.settlement* \|\| business.user.settlement*` | `merchant-payout.service.ts:44-47` (and `:647-648`) |
| Admin **business** toggle | business fields **only** | `admin-payout.service.ts:726` |
| Admin **user** toggle | user fields **OR any business** | `admin-payout.service.ts:791-794` |

A user whose bank lives at user level is **accepted** by the merchant path and the admin user
path but **rejected** by the admin business path, with "Cannot enable auto-payout for a
business without a connected settlement bank account".

Note `bank-resolution.service.ts:159` copies business→user *only if user is unset*, so once
both exist they can diverge permanently.

### B6 — P1: admin user toggle can create an unusable auto state

`admin-payout.service.ts:791-794` checks that *somewhere* a bank exists, then `:809` enables
auto on **every** business. If business #1 owns the bank and #2 does not, and no user-level
bank exists, business #2 lands in auto mode with no reachable destination — the merchant then
hits `SETTLEMENT_ACCOUNT_REQUIRED` at withdrawal time (`merchant-payout.service.ts:49-56`).

### B7 — P1: the "user-level" value shown in admin is a lossy derivation

`backend/src/services/admin/admin.service.ts:112` (list) and `:163` (detail):

```ts
autoPayoutEnabled: u.businesses.some((b) => b.autoPayoutEnabled),
```

With 2 of 3 businesses auto: `some()` = `true` → the button reads "To Manual" → sends `false`
→ `updateMany` writes `false` to all three. Mixed state collapses one way and **cannot be
reconstructed**. `AdminUserDetail.tsx:64` repeats the same `.some()` derivation client-side.

### B8 — P2: withdrawal modal hardcodes the manual-mode warning

`frontend/src/components/PayoutWithdrawalModal.tsx:516-522`

```tsx
{/* Admin Approval Notice */}
<div className="rounded-none bg-amber-50 border border-amber-300 p-2.5 ...">
  <Clock className="h-4 w-4 ..." />
  <span>Admin approval required (~1-2 business hours). ...</span>
```

It renders only on the `confirm` stage (it sits inside `{stage === 'confirm' && (` at `:470`),
which is correct placement — but the copy never branches on mode. An auto-mode SME is told to
expect a 1–2 hour wait for a payout that lands in seconds.

**Good news:** the data is already in scope. `preview` is destructured from
`useSettlementStore()` at `:49`, and `payout-preview.service.ts:273` already returns
`autoPayoutEnabled`. This fix is a conditional, not new plumbing.

### B9 — P2: no Connect Bank button for non-owners

`SettlementBankCard.tsx:292-308` — the `isLinked={false}` branch renders the button only
`{onSettlementLinkedSuccess && (...)}` (`:299`). `Account.tsx:242-245` passes `undefined` for a
non-owner, so they get a paragraph (`:294-298`) and **no button**, and are not told who can.

This is the failing test `SettlementBankCard.test.tsx:63`, which renders with **no**
`onSettlementLinkedSuccess` prop and asserts `getByRole('button', { name: /connect bank/i })`.

### B10 — P3: dead code and discoverability

- `frontend/src/stores/settlement.store.ts:279-294` — `connectBank` has **zero callers**
  (verified by grep across all of `frontend/src`; only the interface decl at `:119-122` and
  the impl itself). The card calls `/dva/settlement/connect` directly at
  `SettlementBankCard.tsx:99`. Safe to delete.
- Payout mode is only reachable from the Account page. `frontend/src/pages/Settings.tsx` has
  tabs `profile | business | team | security` and no payout surface.

### Out of scope (pre-existing, unrelated)

`frontend/src/pages/__tests__/Sales.test.tsx` — "discards an earlier slow summary response
when month is switched rapidly" fails. This is the Sales monthly-summary fetch, has no
connection to payouts, and predates this work. **Leave it.**

---

## 4. Target design

```prisma
model User {
  // ... existing fields ...
  autoPayoutEnabled  Boolean  @default(false) @map("auto_payout_enabled")   // NEW — single source of truth
}

model Business {
  // autoPayoutEnabled  — REMOVED
  settlementBankCode / settlementAccountNumber / settlementAccountName  // STAYS (destination)
}
```

Rules that follow:

1. `isAutoPayout = user.autoPayoutEnabled` — read once, at `merchant-payout.service.ts:89`,
   from `business.user` (already in the actor select, `:44-47`).
2. Every write path writes the **user** row. No fan-out, ever.
3. The bank gate uses business→user fallback (`merchant-payout.service.ts:44-47` is already
   correct) — that **one** rule everywhere kills B5.
4. Toggling payout mode must **never** depend on the business owning a bank, because the
   destination may legitimately live at user level. Kills B6.
5. The sweep cron is **exempt** from all of the above, permanently. See B1.

---

## 5. Execution checklist

Work items are ordered and dependency-linked. **Do not start an item until its dependencies
are verified complete.** Each is independently revertible.

> Test commands: `npm run test:unit` is the fast gate (no DB). `npm run test` and
> `npm run test:integration` run against a **real PostgreSQL database** and will fail if one
> is not reachable — that is environmental, not a regression. `npm run test:e2e` likewise.

---

### 5.1 — SWEEP: disable the anti-deposit auto-sweep (independent of payout mode)

**Decision: disable, do not delete.** Done first, independently — nothing here depends on the
`PAY-*` items and nothing in `PAY-*` depends on it.

The sweep has **three independent gates**, and the obvious "just flip the config" approach
fails on all three. Verified:

| Gate | Location | Current state | Can it disable the sweep? |
|---|---|---|---|
| 1. Env → cron registration | `config/index.ts:258-260` | `AUTO_SWEEP_ENABLED === 'true' \|\| NODE_ENV === 'production'` | **No.** In production the `\|\|` short-circuits — setting `AUTO_SWEEP_ENABLED=false` still evaluates `true`. The cron still registers. |
| 2. DB platform config | `platform-config.service.ts:49`, `:200` | `?? true` fallbacks | **Only if** the DB row is already `false`. A value written by a past admin toggle (`autoSweepEnabled: true`) survives any fallback change. |
| 3. `force` bypass | `wallet-auto-sweep.cron.ts:112` + `admin.controller.ts:440` | `if (!sweepConfig.enabled && !force)` and the admin route calls `runAutoSweep({ force: true })` | **No.** `force` short-circuits gate 2 entirely. The "Run sweep now" button moves money no matter what any config says. |

#### SWEEP-01 — Make the sweep opt-in instead of opt-out
- **Depends on:** none
- **Files:** `backend/src/config/index.ts:257-263`
- **Do:** Change `enabled:` to `process.env.AUTO_SWEEP_ENABLED === 'true'` — drop the
  `|| NODE_ENV === 'production'` branch. Update the comment above it (`:255-256`) to say the
  engine is **opt-in** and that production no longer auto-enables it. Keep `thresholdNaira`
  and `schedule` as-is.
- **Acceptance:** with `AUTO_SWEEP_ENABLED` unset, `registerAutoSweepCron()` logs
  *"Wallet auto-sweep cron skipped"* and no schedule is registered, in development **and**
  production. With it set to `true`, registration happens as before.
- **Verification:** start the server with no env var and confirm the skip log. Then set the
  var and confirm registration.
- **Rollback:** single-file revert.
- **Effort:** S. **Risk if skipped:** the nightly cron keeps running in production regardless
  of any other change below.

#### SWEEP-02 — Close the `force` bypass so the admin trigger obeys the setting
- **Depends on:** SWEEP-01
- **Files:** `backend/src/jobs/wallet-auto-sweep.cron.ts:112-113`,
  `backend/src/controllers/admin.controller.ts:437-448`
- **Do:** Decide which of these the product actually wants, and implement that one:
  - **(a) Recommended — the trigger obeys the setting.** In `triggerAutoSweep`, read
    `PlatformConfigService.isAutoSweepEnabled()` and return a 409/`SWEEP_DISABLED` response
    when disabled, instead of calling `runAutoSweep({ force: true })`. Change
    `runAutoSweep`'s signature so `force` no longer means "ignore the disabled setting" —
    reserve `force` for its other caller (the config-disabled early return at `:112`) or drop
    it if nothing else uses it.
  - **(b) The trigger always runs.** Then say so loudly in the UI copy and in
    `SWEEP-01`'s comment — an admin can still move merchant money on demand, and that must be
    a conscious choice, not a `force` flag left over from development.
- **Acceptance:** with the engine disabled, the admin "Run sweep now" button **cannot** move
  money (option a), or is clearly labelled as able to (option b).
- **Rollback:** two-file revert.
- **Effort:** S. **Risk if skipped:** **this is the important one.** Config says off, an admin
  clicks once, real money moves. That is the exact failure mode "disabled" must exclude.

#### SWEEP-03 — Neutralise the stored DB value and the UI affordance
- **Depends on:** SWEEP-01, SWEEP-02
- **Files:** `backend/src/services/platform-config.service.ts:49` and `:200`;
  `frontend/src/pages/admin/dashboard/FeeSettingsTab.tsx:120-200`
- **Do:**
  - Flip both `?? true` / `: true` fallbacks to `false` so a missing row means off.
  - Because an existing row may already hold `true`, add a one-off corrective statement:
    `UPDATE "platform_fee_config" SET "auto_sweep_enabled" = false WHERE id = 'default';`
    Confirm the table/column names against the Prisma model before running.
  - In `FeeSettingsTab.tsx`, either hide the "Anti-Deposit Regulatory Auto-Sweep Engine"
    panel behind an explicit "compliance controls" disclosure, or keep it visible but render
    the current state from `isAutoSweepEnabled()` so it never claims "on" when the engine is
    off. The panel currently reads `feeConfig?.autoSweepEnabled !== false` (`:120`), which
    treats a missing value as **on**.
- **Acceptance:** with no admin action taken, `isAutoSweepEnabled()` returns `false`; the admin
  panel does not display the sweep as enabled; `SWEEP-01`/`SWEEP-02` behaviour holds.
- **Rollback:** revert both files; the `UPDATE` is re-appliable.
- **Effort:** S. **Risk if skipped:** an admin sees "Auto-sweep engine ON" in the dashboard
  while nothing actually runs at night — the worst kind of false state.

#### SWEEP-04 — Tests
- **Depends on:** SWEEP-03
- **Files:** `backend/tests/unit/auto-sweep.test.ts`, `backend/tests/integration/auto-sweep-live.test.ts`
- **Do:** `auto-sweep.test.ts` calls `runAutoSweep` directly and mocks
  `PlatformConfigService`, so it stays valid — but add a case asserting that
  `executeSweep` returns the all-zero `AutoSweepResult` when `enabled: false` **and**
  `force: false`. `auto-sweep-live.test.ts` hits a real DB and a real provider — decide
  whether it should still be run manually given the engine is off, and note it.
- **Acceptance:** `npm run test:unit` green with the new case.
- **Effort:** S.

**Consequence to state in the PR description:** once disabled, merchant balances accumulate in
the pooled wallet rather than being cleared nightly. Anyone reading a future balance report
should know that is intentional. Per §1 the sweep existed to keep the platform from holding
customer balances as an unlicensed deposit-taker — so re-enabling it (SWEEP-01 + clearing the
DB flag + SWEEP-02 option a) is the first step if that exposure ever becomes live.

---

### PAY-01 — Document the sweep's exemption from payout mode
- **Depends on:** none
- **Priority:** low if `SWEEP-01..03` lands first (the engine is then dormant). Still do it —
  it removes a misleading dead `select`, and the comment is what stops someone re-adding a
  mode gate if the sweep is ever re-enabled.
- **Files:** `backend/src/jobs/wallet-auto-sweep.cron.ts`
- **Do:** Remove `autoPayoutEnabled: true,` from the select at `:157`. Add a comment above the
  `primaryBiz` resolution (`:201`) stating that the sweep is a CBN licensing control
  (quoting the `:1-9` mandate) and is deliberately **not** gated on payout mode, with a
  pointer to this document.
- **Acceptance:** `grep -n autoPayoutEnabled src/jobs/wallet-auto-sweep.cron.ts` returns zero
  hits; `npm run build` clean; `npm run test:unit -- tests/unit/auto-sweep.test.ts` still
  green (its two fixtures set the flag at `:57` and `:534` — harmless, but delete those two
  fixture lines so they stop implying the flag matters).
- **Verification:** re-read `:150-210`; confirm the mode gate is absent and the rationale is
  documented.
- **Rollback:** single-file revert.
- **Effort:** S. **Risk if skipped:** the next developer adds the mode gate and breaks a
  licensing control.

### PAY-02 — Fix the settlement-bank regex
- **Depends on:** none
- **Files:** `frontend/src/components/account/SettlementBankCard.tsx`
- **Do:** `:68` — `if (!/^d{10}$/.test(settlementAccount))` → `/^\d{10}$/`.
- **Acceptance:** an SME can enter a 10-digit account number, resolve it, and connect.
- **Verification:** `cd frontend && npm run build`; manual walk-through in the browser.
- **Rollback:** single-line revert.
- **Effort:** S. **Risk if skipped:** the entire SME settlement-bank flow stays dead — and
  auto-payout cannot be enabled without a bank, so this blocks the whole payout feature.

### PAY-03 — Schema: add the user flag
- **Depends on:** none
- **Files:** `backend/prisma/schema.prisma`
- **Do:** Add to `model User` (near the other settlement fields, ~`:46`):
  `autoPayoutEnabled Boolean @default(false) @map("auto_payout_enabled")`.
  Delete from `model Business` (`:99`).
- **Acceptance:** `npx prisma generate` clean.
- **Rollback:** revert the schema edit. **Effort:** S.

### PAY-04 — Migration, add → backfill → drop
- **Depends on:** PAY-03
- **Files:** new `backend/prisma/migrations/<ts>_user_scoped_auto_payout/migration.sql`
- **Do:** `npx prisma migrate dev --name user_scoped_auto_payout`, then **verify the generated
  SQL has this order** (it will not naturally — reorder by hand if needed):
  ```sql
  -- 1. add
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_payout_enabled" BOOLEAN NOT NULL DEFAULT false;
  -- 2. backfill: auto iff ANY business was (the B3 cascade made divergence meaningless)
  UPDATE "users" u SET auto_payout_enabled = true
  WHERE EXISTS (SELECT 1 FROM "businesses" b WHERE b.user_id = u.id AND b.auto_payout_enabled = true);
  -- 3. drop
  ALTER TABLE "businesses" DROP COLUMN IF EXISTS "auto_payout_enabled";
  ```
- **Backfill behaviour change to state in the PR description:** mixed-state users resolve to
  `true` (the permissive side). This is the only behaviour change for existing rows — call it
  out to the user **before** applying.
- **Acceptance:** `npx prisma migrate status` clean; `npx prisma generate` clean;
  `SELECT auto_payout_enabled, count(*) FROM users GROUP BY 1` sane.
- **Rollback:** the migration is not trivially reversible (data is dropped). Take a backup
  first — `npm run db:backup` exists.
- **Effort:** S. **Risk if skipped:** B3–B7 persist.

### PAY-05 — Backend: read the flag from the user at the decision point
- **Depends on:** PAY-04
- **Files:** `backend/src/modules/wallet/services/merchant-payout.service.ts`
- **Do:** `:89` — `Boolean(business.autoPayoutEnabled)` → `Boolean(business.user.autoPayoutEnabled)`.
  **Verify** `getWithdrawalActor` selects the user flag; add it to the select if missing.
  (Confirmed the `user` relation is already loaded — `:44-47` reads `business.user.settlement*`.)
- **Acceptance:** `npm run build` clean; `npm run test:unit` green.
- **Rollback:** single-file revert (but leaves the column missing — re-run PAY-03).

### PAY-06 — Backend: merchant toggle writes the user row (fixes B3)
- **Depends on:** PAY-04
- **Files:** `backend/src/modules/wallet/services/merchant-payout.service.ts:667-701`
- **Do:** Replace the `business.update` + `business.updateMany` pair with a single
  `prisma.user.update({ where: { id: userId }, data: { autoPayoutEnabled: params.enabled },
  select: { autoPayoutEnabled: true } })`. Update `logAudit` (`:689-690`) to
  `resourceType: 'user'`, `resourceId: userId`, and a real `oldData.autoPayoutEnabled` read
  from the prior value. Update the doc comment at `:636-639` ("businesses" → user scope).
- **Acceptance:** toggling from the SME side changes exactly one row; audit shows
  `resourceType: 'user'`.
- **Verification:** `npm run test:unit -- tests/unit/user-auto-payout.test.ts`; the tests at
  `:25-155` assert the old shapes — **rewrite the mocks/expectations, do not delete the file.**
- **Rollback:** single-file revert.

### PAY-07 — Backend: remove the business-scoped admin toggle (fixes B5)
- **Depends on:** PAY-04
- **Files:**
  - `backend/src/modules/wallet/services/admin-payout.service.ts:703-758` — delete
    `adminToggleAutoPayout`
  - `backend/src/routes/admin.routes.ts:45` — delete `PATCH /admin/businesses/:businessId/auto-payout`
  - its controller method in `backend/src/controllers/admin.controller.ts:244`
  - its validator
- **Do:** Business-scoped payout mode no longer exists. Keep the user-level route
  (`admin.routes.ts:16`) as the only admin toggle.
- **Acceptance:** `npm run build` clean; no dangling references (§ verification grep in PAY-12).
- **Verification:** `grep -rn "adminToggleAutoPayout\|businesses/:businessId/auto-payout" backend/src`
  returns zero hits.
- **Rollback:** restore all four files together — they are one logical change.

### PAY-08 — Backend: admin user toggle writes the user row (fixes B4, B6, B7)
- **Depends on:** PAY-06
- **Files:** `backend/src/modules/wallet/services/admin-payout.service.ts:768-829`
- **Do:** Replace the `businesses.length > 0` guard + `business.updateMany` (`:806-811`)
  with a single `prisma.user.update`. Keep the existing permissive bank gate at `:791-794`
  (user **or** any business) — it can no longer create the B6 trap now that the write is not
  per-business. Populate `oldData` from the real prior value read in the `findUnique` at
  `:772` instead of `{}` (`:818`) — this is what makes B7 auditable.
- **Acceptance:** enabling auto for a user with **zero** businesses persists; audit shows a
  real prior value.
- **Verification:** `npm run test:unit -- tests/unit/user-auto-payout.test.ts` — the
  assertions at `:225` and `:252` assert the old return shape and must be rewritten.
- **Rollback:** single-file revert.

### PAY-09 — Backend: remove every remaining read of the dropped column
- **Depends on:** PAY-04, PAY-07
- **Files (all of them — this is the item most likely to be under-done):**
  - `backend/src/modules/wallet/services/admin-payout.service.ts:55` —
    `autoPayoutEnabled: true,` inside `business.select`. **Easy to miss: it is a bare object
    key, so the grep in PAY-12 will NOT catch it.** Prisma fails on an unknown field.
  - `backend/src/modules/wallet/services/admin-payout.service.ts:80` — change
    `p.business.autoPayoutEnabled` to the user-level value. This requires `:55`'s select to
    become `user: { select: { id, email, autoPayoutEnabled } }`.
  - `backend/src/services/admin/admin.service.ts:112` and `:163` —
    `u.businesses.some((b) => b.autoPayoutEnabled)` → `u.autoPayoutEnabled`. Remove the now-
    unneeded `autoPayoutEnabled: true` from the nested selects at `:89`, `:151`, `:304`.
  - `backend/src/services/settlement/payout-preview.service.ts:273` —
    `Boolean(business.autoPayoutEnabled)` → `Boolean(business.user.autoPayoutEnabled)`.
    (`business.user` is confirmed present here — `:258` reads `business.user.transactionPin`.)
  - `backend/src/modules/wallet/routes/settlement.routes.ts:15` — the merchant route
    **keeps its path** (so the frontend call site and PIN/step-up gate survive); update its
    JSDoc to say it writes the user row.
- **Acceptance:** `npm run build` clean **and** `npm run test:unit` green **and**
  `npm run test:integration` green against a real DB.
- **Rollback:** PAY-03–PAY-04 revert.

### PAY-10 — Backend: update the tests that write the dropped column
- **Depends on:** PAY-09
- **Files (verified — these hit a real database and will break otherwise):**
  - `backend/tests/integration/auto-sweep-live.test.ts:68` — creates a real Business with
    `autoPayoutEnabled: true` in the create payload.
  - `backend/tests/integration/phase3-adversarial-qa.test.ts:433` and `:506` —
    `testDb.business.update({ data: { autoPayoutEnabled: true } })` → change to
    `testDb.user.update({ where: { id: user.id }, data: { autoPayoutEnabled: true } })`.
  - `backend/tests/unit/user-auto-payout.test.ts` — assertions at `:225` and `:252`
    (covered by PAY-06/PAY-08).
  - `backend/tests/unit/auto-sweep.test.ts:57` and `:534` — fixture-only, mocked with
    `as any`, will not break; delete the two lines for clarity.
- **Acceptance:** `npm run test:integration` green against a real DB, with no new failures
  beyond the known-unrelated `Sales` frontend test.
- **Risk if skipped:** the migration lands and the integration suite goes red, which reads as
  a broken deploy.

### PAY-11 — Frontend: types and the merchant account surface
- **Depends on:** PAY-09
- **Files:**
  - `frontend/src/types/index.ts:463` — **delete** `AdminBusiness.autoPayoutEnabled?`.
  - `frontend/src/types/index.ts:447` — **keep** `AdminUser.autoPayoutEnabled?` (now real
    rather than derived). *(Revision 1 wrongly said to remove this one — see §8.)*
  - `frontend/src/types/index.ts:133` — **delete** `Business.autoPayoutEnabled?`. This is the
    type behind `AdminUserDetail.businesses[]` (`AdminUserDetail` declares
    `businesses: Business[]` at `:451`) and behind `Account.tsx`'s business object.
    *(Revision 1 never cited this — see §8.)*
  - `frontend/src/stores/settlement.store.ts:68` — `PayoutPreviewData.autoPayoutEnabled?`
    stays; semantics become user-level.
  - `frontend/src/stores/settlement.store.ts:115-118` + `:254-277` — `toggleAutoPayout(businessId, …)`
    PATCHes `/businesses/${businessId}/settlement/auto-payout` (`:260`). **The route path is
    unchanged** (PAY-09), so the call site still works; add a comment that `businessId` is now
    only a routing path segment and the write is user-scoped. Renaming the parameter is
    optional churn — do it only if it clarifies.
  - `frontend/src/pages/Account.tsx:233` — already prefers
    `settlementPreview?.autoPayoutEnabled ?? biz.autoPayoutEnabled`; after PAY-11's type
    change the `?? biz.` fallback becomes invalid. **Change it to
    `settlementPreview?.autoPayoutEnabled`** (the pattern already used at `:337`).
  - `frontend/src/pages/Account.tsx:334-347` — `:337` is the enabled flag; **`:341` is the real
    `toggleAutoPayout(biz.id, …)` call** (`:238` only opens the PIN modal — revision 1
    mislabelled this).
  - `frontend/src/components/account/AccountModals.tsx:40,60,116-123` — **not mentioned in
    revision 1.** It renders the "Switch to Manual Payouts / Enable Instant Auto-Payouts"
    PIN modal and is gated on `businessId` (`:116`). No structural change needed; just update
    any copy that says "this business".
- **Acceptance:** `cd frontend && npm run build` clean.
- **Rollback:** single-frontend revert.

### PAY-12 — Frontend: delete the per-business admin toggles
- **Depends on:** PAY-07, PAY-11
- **Files:**
  - `frontend/src/pages/admin/AdminBusinesses.tsx` — delete the **Payout Mode** column
    (header `:79`, cell `:94-108`) and `togglingBizId`/`handleToggleAutoPayout` (`:18`,
    `:20-37`, PATCH at `:23`). Change `TableSkeleton columns={7}` → `6` (`:61`).
  - `frontend/src/pages/admin/AdminUserDetail.tsx` — delete the per-business
    `handleToggleAutoPayout` (`:30`, `:51-72`, PATCH at `:55`) and the payout badge/toggle in
    the businesses list (`:231-247`). Keep the user-level block (`:167-187`). **Delete the
    `PanelHeader` hint at `:214`** ("Payout mode can be overridden per business") — it
    documents behaviour that no longer exists. Also remove the client-side fanout at `:42`
    (optimistically setting `autoPayoutEnabled` on every business) and the `.some()`
    derivation at `:64`.
  - `frontend/src/pages/admin/AdminWithdrawals.tsx` — `PayoutModeToggle` is at **`:352-377`**
    (not `:206-232`, which is the approve-error block) and `handleToggleAutoPayout` at
    **`:306-328`** (PATCH at `:309`). Both toggle by `businessId`, whose route PAY-07 just
    removed. Replace with a **display-only** `StatusPill` sourced from the list response
    (now user-level per PAY-09). Remove `:49`'s reliance on a per-withdrawal business flag.
    Update usages at `:514` and `:914`.
- **Acceptance:** `npm run build` clean; `npx vitest run src/pages/admin/__tests__/` green —
  note `AdminWithdrawalsAndPayoutMode.test.tsx:156` asserts the **per-business** PATCH URL
  and must be rewritten to assert the display-only pill.
- **Rollback:** three-file revert.

### PAY-13 — Frontend: branch the withdrawal notice on mode (fixes B8)
- **Depends on:** PAY-09
- **Files:** `frontend/src/components/PayoutWithdrawalModal.tsx:516-522`
- **Do:** `const autoMode = Boolean(preview?.autoPayoutEnabled);` (`preview` is destructured at
  `:49`). Render a success-tinted "Instant payout" notice when `autoMode`, the existing amber
  notice otherwise. Keep it inside the existing `stage === 'confirm'` guard (`:470`) — that
  placement is already correct.
- **Acceptance:** auto-mode SME sees the instant message; manual-mode SME sees the approval
  message. `npm run build` clean.
- **Rollback:** single-file revert.

### PAY-14 — Frontend: always offer a Connect Bank affordance (fixes B9)
- **Depends on:** none
- **Files:** `frontend/src/components/account/SettlementBankCard.tsx:292-308`
- **Do:** Render the button unconditionally; vary only the label. The non-owner variant must
  be **non-mutating** (it must not open the connect form — a non-owner cannot authorise it)
  while its accessible name must still match `/connect bank/i` so
  `SettlementBankCard.test.tsx:63` passes. Keep the testids `auto-payout-mode-badge`
  (`:240`) and `auto-payout-toggle` (`:259`) — `WithdrawalAndAutoPayout.test.tsx:160,163,181`
  asserts them.
- **Acceptance:** `npx vitest run src/components/account/__tests__/SettlementBankCard.test.tsx`
  **passes** (it currently fails). That is the proof B9 is fixed.
- **Rollback:** single-file revert.

### PAY-15 — Frontend: dead code + copy
- **Depends on:** PAY-11
- **Files:** `frontend/src/stores/settlement.store.ts:119-122` and `:279-294` — delete
  `connectBank`. **Re-grep for callers first** (verified zero as of this review; the file may
  have changed). Optionally add a payout surface to `Settings.tsx`.
- **Acceptance:** `npm run build` clean; grep finds no `connectBank`.

### PAY-16 — Correct the user-facing payout-mode copy
- **Depends on:** PAY-13
- **Files:** `frontend/src/components/account/SettlementBankCard.tsx:242-269` (mode toggle
  area), `frontend/src/components/account/AccountModals.tsx:116-123` (PIN modal)
- **Do:** Manual mode must **not** be described as "nothing leaves without approval" — that is
  false, because the regulatory sweep (§1, B1) moves funds nightly regardless. Suggested copy:
  manual = "Withdrawal requests are reviewed by our team (~1–2 business hours). Balances above
  ₦1,000 are cleared to your bank nightly." Keep this accurate, not alarming.
- **Acceptance:** no UI text claims sweep-level funds wait for approval.

---

## 6. Verification

1. `cd backend && npm run build && npm run test:unit` — clean.
2. `cd backend && npm run test:integration` — green **against a real DB**. Confirm no new
   failures vs. the pre-migration baseline.
3. `cd frontend && npm run build` — clean.
4. `npx vitest run src/components/account/__tests__/SettlementBankCard.test.tsx` — the
   currently-failing test now **passes**.
5. `npx vitest run src/pages/admin/__tests__/ src/components/account/__tests__/` — green.
   Full suite green except the pre-existing unrelated `Sales.test.tsx`.
6. **Final grep sweep — this is the item most likely to be under-done:**
   ```bash
   grep -rn "autoPayoutEnabled" backend/src frontend/src
   ```
   Every remaining backend hit must be a `User`-scoped read/write. Every remaining frontend hit
   must be user- or preview-scoped. **Pay special attention to bare object keys inside Prisma
   `select:` blocks** — `admin-payout.service.ts:55` is the one that was missed in revision 1
   and it will not match a `business.autoPayoutEnabled` pattern.
7. Manual end-to-end, two businesses on one user:
   - Toggle auto-payout from the **SME** side → exactly one `users` row changes.
   - Auto mode → withdrawal `status: processing`, no approval notice shown.
   - Manual mode → `status: pending`, appears in `/admin/withdrawals`, notice shown.
   - Admin enables auto for a user whose bank is **only** at user level → must succeed (B5).
   - Admin enables auto for a user with **zero** businesses → must persist (B4).
   - Manual-mode user with a funded wallet → **is still swept** at 02:00 WAT (this is correct;
     verify it appears in `/admin/withdrawals` with the "regulatory clearing" narration).
8. Audit log for a payout-mode change shows `resourceType: 'user'` with a real
   `oldData.autoPayoutEnabled`.

---

## 7. Deliberately NOT doing

State these in the final report so nobody re-raises them:

- **Not** gating the sweep cron on payout mode. It is a CBN licensing control (§1, B1) —
  and it is being disabled outright anyway (`SWEEP-01..04`), which is a separate decision from
  how it behaves while enabled.
- **Not** deleting the sweep. Disabled only. The code stays so it can be re-enabled if
  WallX ever holds merchant balances without a licence.
- **Not** adding a per-business override on top of the user flag. It was the source of B3–B7
  and is incoherent with a pooled wallet (§2).
- **Not** migrating destination bank fields from `Business` to `User`. Both exist today and the
  business→user fallback (`merchant-payout.service.ts:44-47`) already works. Separate work.
- **Not** touching `backend/src/jobs/payout-reconciliation.cron.ts` — stale-`processing`
  handling is correct and independent of payout mode.
- **Not** adding a confirmation dialog when a merchant toggles payout mode.
- **Not** fixing `Sales.test.tsx`.
- **Not** changing the withdrawal fee schedule or the sweep threshold.

## 8. What revision 1 got wrong

Recorded so the errors are not re-introduced:

| Revision 1 said | Reality |
|---|---|
| B1 is P0 "money"; gate the sweep on payout mode | **Wrong and dangerous.** The sweep is a CBN licensing control (`wallet-auto-sweep.cron.ts:1-9`); gating it re-creates the unlicensed-deposit exposure. B1 downgraded to P2 and reframed in `PAY-01`. |
| B1: "No admin sees it" | Overstated. Sweep payouts are real `SettlementPayout` rows and `adminListWithdrawalRequests` has no default status filter (`admin-payout.service.ts:23-25`), so they appear in the admin queue. |
| Grep `business\.autoPayoutEnabled\|b\.autoPayoutEnabled` catches leftovers | It misses `admin-payout.service.ts:55` — a bare key in a Prisma `select`. Now called out explicitly in `PAY-09`. |
| Only `tests/unit/user-auto-payout.test.ts` needs updating | Missed `tests/integration/auto-sweep-live.test.ts:68` and `tests/integration/phase3-adversarial-qa.test.ts:433,506`, which write the column against a **real DB**. Now `PAY-10`. |
| Delete `types/index.ts:447` | That is `AdminUser.autoPayoutEnabled`, which the plan wanted to **keep**. The type to delete is `AdminBusiness` (`:463`) and `Business` (`:133`). Now `PAY-11`. |
| `types/index.ts:463` is `AdminUserDetail.businesses[]` | It is `AdminBusiness`. The nested type is `Business` at `:133`, uncited in revision 1. |
| `AdminWithdrawals.tsx:206-232` is `PayoutModeToggle` | That is the approve-error block. `PayoutModeToggle` is `:352-377`; `handleToggleAutoPayout` is `:306-328`. |
| `Account.tsx:238` calls `toggleAutoPayout` | `:238` opens the PIN modal. The real call is `:341`. |
| `AccountModals.tsx` unmentioned | It renders the payout PIN modal and is gated on `businessId` (`:116`). Now in `PAY-11`. |
| `PayoutWithdrawalModal.tsx:47` reads preview; props `:26-31` | `:49` and `:25-30`. The notice is also inside `{stage === 'confirm' && (` at `:470`. |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Someone re-adds a sweep mode gate | `PAY-01` deletes the misleading select and documents the exemption in-code. This plan is referenced from that comment. |
| **Disabling only the env var leaves the cron running in prod** | `config/index.ts:258` ORs with `NODE_ENV === 'production'`, so `AUTO_SWEEP_ENABLED=false` is ignored. `SWEEP-01` removes that branch. **Do not stop at setting the env var.** |
| **Disabling the config leaves the admin "Run sweep now" button live** | `runAutoSweep({ force: true })` bypasses the disabled check (`wallet-auto-sweep.cron.ts:112`). `SWEEP-02` closes it. This is the highest-consequence item in the sweep series. |
| Admin UI shows "Auto-sweep engine ON" while it is dormant | `FeeSettingsTab.tsx:120` reads `!== false`, treating a missing value as on. `SWEEP-03` fixes the read and the DB fallback. |
| Merchant balances accumulate with no nightly clearing | Accepted product decision — stated in §1 and in the `SWEEP-01..03` PR description. Re-enabling path is documented in §5.1. |
| Migration drops the column before backfill | `PAY-04` mandates add → backfill → drop. Verify the generated SQL before applying. |
| Mixed-state users flip to auto after backfill | `PAY-04` requires this be surfaced to the user pre-migration. |
| Removing the admin business toggle leaves a dangling route | `PAY-07` removes route + controller + validator together; `PAY-12` removes all three frontend callers. |
| Old frontend + new backend (skewed deploy) | Backend lands first; the SME route path is unchanged so the old client keeps working — it just changes the user instead of a business. The admin **business** route 404s until the frontend lands: acceptable for a pre-launch solo-dev deploy. Note it. |
| Integration suite goes red after the migration | `PAY-10` enumerates all three real-DB test files up front. |
| User-facing copy still over-promises manual mode | `PAY-16`. |
