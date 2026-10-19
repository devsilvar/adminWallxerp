# Subscription Downgrade — Rereviewed Plan (2026-10-12) — with Read/Write Split Fix

> **Source:** `prompts/downgrade.md` §5 re-reviewed via `rereviewplan.md` (12-phase) on 2026-10-12 against live `main`. Every claim re-checked against live files. **New in this revision:** fixes the reported `GET /businesses/:id/credits? 403 FEATURE_BLOCKED` after downgrade (dashboard blocked) — reads must stay `200`, only next writes blocked. Also corrects Starter AI stale copy in both frontend files.

---

## 1) Rereview Verdict (2026-10-12)

| # | Category | Finding |
|---|---|---|
| D1 | 🔴 **WRONG** (now fixed in config, stale in UI) | Plan said "fix Starter AI copy 15→30" as frontend. **Live `subscription-plans.ts:96` is now `30`** (was 15 at time of first rereview). Tests at `subscription-plans-config.test.ts:32` now correctly expect `30`. The stale copy is **not** in `Subscription.tsx:84` alone — it's in **both** `frontend/src/components/admin/ChangePlanModal.tsx:17` (`desc: '2 Businesses, 3 Team Members, 15 AI Queries'`) and `frontend/src/pages/Subscription.tsx:82` / `Subscription.tsx:84` (`15 AI CFO queries`). Both must be `30`. No config change needed. |
| D2 | 🟠 **INCOMPLETE** | `previewDowngrade(userId, targetTier)` via `checkTeamLimit` per-business cannot evaluate **aggregated** team over-limit. `checkTeamLimit` resolves cap from *current* owner tier (`subscription-guard.service.ts:277`), not target. Preview must aggregate `businessMember (isActive, role!=owner) + invitation (pending, expiresAt>now)` across **all** `ownedIds` in one in-memory check vs `target.maxTeamMembers`. |
| D3 | 🟠 **INCOMPLETE** | Enforcement gap correctly notes `bulkImport`/`dvaVirtualAccount` never gated (`requireFeature` grep clean). Decision stays: **leave ungated v1**. No code added. |
| D4 | 🟠 **INCOMPLETE** | Banner assumed `remainingSlots===0` exists. It does not for businesses. `team.service.ts:156` logs `{maxTeamMembers}` but `business.service.ts:96` only errors on `POST /businesses` via `checkBusinessLimit`. Preview/banner must compute `businessCount vs maxBusinesses` explicitly. Self-view via `GET /admin/.../downgrade-preview` is **admin-only** — normal user would 403. Self banner must use client-side `getPlanLimits(currentTier)` vs counts. |
| D5 | 🟡 **RISKY** | `overrideUserSubscription` guard was described outside `prisma.$transaction`. TOCTOU: invite created between preview and confirm → over-limit confirm still succeeds without in-TX re-check. |
| D6 | 🟠 **MISSING** | Preview must be read-only (no `logAudit`), override stays audited (`admin.subscription_manual_override` at `admin.service.ts:1503`). New `409 DOWNGRADE_OVER_LIMIT` must carry `details.overLimit` so `ChangePlanModal` can render field-level warnings. |
| D8 | 🔴 **WRONG** — New finding from reported error | Live `credit.routes.ts:9` gating `GET` with `requireFeature` violates §3 `“Downgrade never deletes/hides rows. Keep data readable; block only new creation”`. Fix is a router split (reads open, writes gated) + `isRead` early-return in `requireFeature` as defense-in-depth. Without it, every downgrade’s reads 403 and the banner/downgrade preview never renders. |

---

## 2) Verified Current Behavior (live-code truth, re-checked 2026-10-12)

| Resource | Scale limit | Starter limit | Downgrade today (verified) | Source |
|---|---|---|---|---|
| Businesses | -1 (unlimited) `subscription-plans.ts:141` | 2 `subscription-plans.ts:94` | Existing rows stay readable; `POST /businesses` → `checkBusinessLimit` → `403 BUSINESS_LIMIT_REACHED` (`business.service.ts:96`) | `subscription-guard.service.ts:167` counts `business where userId` |
| Team per business | -1 `subscription-plans.ts:142` | 3 `subscription-plans.ts:95` | Members stay active; `POST /invitations` + accept → `checkTeamLimit` → `400 TEAM_MEMBER_CAP_REACHED` | `subscription-guard.service.ts:199` + `team.service.ts:156` |
| BNPL credits | `true` all paid tiers | `false` on starter `subscription-plans.ts:103` | **Bug:** `credit.routes.ts:9` `router.use(requireFeature('bnplCredits'))` blocks **reads** `GET /`, `GET /summary`, `GET /:id` → `403 FEATURE_BLOCKED` on Starter (reported error). `POST` correctly 403. | `middleware/subscription.ts:210` (no `isReadMethod` check) |
| AI queries | 30 all tiers (`free:30`, `starter:30`, `business:30`, `scale:30`) | 30 | `checkAiQueryLimit` caps per calendar month; downgrade lowers cap immediately | `subscription-guard.service.ts:259` + `ai.service.ts:129` |
| `bulkImport`/`dvaVirtualAccount` | `true` all tiers | `true` | **Never gated** — no `requireFeature` call exists (grep clean). Downgrade has genuinely zero effect. | Intentional v1 |
| Global gate | — | — | `requireActiveSubscription` (`middleware/subscription.ts:27`) checks expiry + 2-day grace only; does not inspect tier change. Never blocks on downgrade alone. | `subscription-guard.service.ts:42` → `getSubscriptionStatus` |

**Tier write path:** `admin.service.ts:1424` `overrideUserSubscription` canonicalizes via `canonicalTier` (`subscription-plans.ts:173` — `scale_up → scale` alias), computes `expiresAt` from `customExpiresAt || durationDays || default 30d`, inside `prisma.$transaction` updates `user.subscriptionTier/subscriptionExpiresAt/trialEndsAt` + `logAudit`. **Never calls** `checkBusinessLimit`/`checkTeamLimit` — so an over-limit downgrade silently succeeds today.

---

## 3) Intended Behavior (product — preserved, now with read guarantee)

Downgrade **never deletes/hides** rows. Keep data **readable** (`GET` stays `200`) and **editable** where not over cap; block only **new creation** at the next write (`POST`/`PATCH`/`DELETE`) with an explicit over-limit error; surface over-limit via amber banner (`border-amber-200 bg-amber-50`) and disabled CTA with tooltip so admin and affected user can see it. Applies to businesses, team slots, BNPL feature flag, and AI monthly cap. Reads must render even when `SUBSCRIPTION_ENFORCEMENT_ENABLED=true`.

---

## 4) Verified File Impact (corrected)

| File | Current role | Change |
|---|---|---|
| `backend/src/validators/admin.validator.ts` | `adminOverrideSubscriptionSchema` at 121 `tier: z.enum([...])` | Extend with `confirmDowngrade: z.boolean().optional().default(false)` |
| `backend/src/services/admin/admin.service.ts` | `overrideUserSubscription` at 1424 | Add `previewDowngrade(userId,targetTier)` (read-only, no `logAudit`, no TX) + guard inside `overrideUserSubscription` re-checking limits **inside** `prisma.$transaction` with `tx` client; return `409 DOWNGRADE_OVER_LIMIT` with `details.overLimit` unless `confirmDowngrade:true` |
| `backend/src/controllers/admin.controller.ts` | `overrideUserSubscription` at 593 | Add `previewDowngrade` handler `GET /admin/users/:id/downgrade-preview?tier=...`; pass `confirmDowngrade` through on PATCH |
| `backend/src/routes/admin.routes.ts` | `PATCH /users/:id/subscription` at 17 | Add `GET /users/:id/downgrade-preview` (admin only) |
| `backend/src/routes/credit.routes.ts` | `router.use(requireFeature('bnplCredits'))` at 9 gates all verbs | **Split:** reads `GET /`, `GET /summary`, `GET /:id`, `POST /:id/whatsapp-reminder` without feature gate; writes `POST /`, `PATCH /:id`, `POST /:id/payments`, `write-off`, `link-dva` with `requireFeature('bnplCredits')` |
| `backend/src/middleware/subscription.ts` | `requireFeature` at 155 blocks all methods | Add `isRead = ['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase()); if (isRead) return next();` as defense-in-depth — reads never `FEATURE_BLOCKED` even if a future `router.use` is added |
| `backend/src/services/subscription/subscription-guard.service.ts` | `checkBusinessLimit`/`checkTeamLimit`/`getPlanLimits` | **No change** — imported by preview; preview aggregates across all `ownedIds` itself |
| `frontend/src/components/admin/ChangePlanModal.tsx` | Plan change modal at 17 | Fix desc `15`→`30` AI queries; call preview on tier change; render amber warning block from `details.overLimit`; gate submit behind “I understand — proceed over-limit” checkbox that sends `confirmDowngrade:true` |
| `frontend/src/pages/Subscription.tsx` | `PLANS.starter` desc at 82 + `isFeature` display | Same `15`→`30` fix |
| `frontend/src/pages/Settings.tsx` | User settings/subs view | Render `isOverLimit` banner when client-side `getPlanLimits(currentTier)` vs `business.count` + team aggregate shows overage; banner renders **regardless** of `enforcementEnabled` (preview = would-block) |
| `frontend/src/pages/Debtors.tsx` + `frontend/src/pages/Dashboard.tsx` credit widget | Show existing credits after downgrade | On `GET /credits` **never** 403 after fix; on `POST` 403 with `FEATURE_BLOCKED` show upgrade modal, not toast. On read, show amber `“Customer Credit (BNPL) is Business+ — your 3 existing credits are still visible; new credits blocked. Upgrade to create.”` |
| `frontend/src/pages/AdminUserDetail.tsx` | Admin user detail | Show over-limit badge when `businessCount > maxBusinesses` or any business `teamCount > maxTeamMembers` |
| `backend/tests/unit/admin-subscription-override.test.ts` | Override tests | Add: preview overLimit; PATCH without `confirmDowngrade` → 409; with flag → 200 |
| `backend/tests/integration/subscription-enforcement.test.ts` | Enforcement integration | Add downgrade path: Scale→Starter blocks 3rd business, blocks 4th member, `GET /credits` stays 200, `POST /credits` 403 |
| `backend/src/config/subscription-plans.ts` | Plan catalog at 96 | **No change** — keep `30` (already correct). No test change needed (`subscription-plans-config.test.ts:32` already expects 30) |

---

## 5) Phased Fix (dumb-developer-proof, with read/write split)

### Phase D0 — Align Starter AI copy (blocks stale UI)

- `ChangePlanModal.tsx:17` `desc: '2 Businesses, 3 Team Members, 15 AI Queries'` → `30 AI Queries`
- `Subscription.tsx:82` `PLANS.starter` features `15 AI CFO queries / month` → `30 AI CFO queries / month`

### Phase D1 — Validator: `confirmDowngrade` flag

**File:** `backend/src/validators/admin.validator.ts:121`

```ts
export const adminOverrideSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'business', 'scale_up', 'scale']),
  durationDays: z.coerce.number().int().positive().nullable().optional(),
  customExpiresAt: z.coerce.date().optional(),
  resetTrial: z.boolean().optional(),
  confirmDowngrade: z.boolean().optional().default(false),
  reason: z.string().trim().min(3, 'Audit reason is required and must be at least 3 characters').max(500),
});
```

### Phase D2 — Service: `previewDowngrade` + guarded `overrideUserSubscription`

**File:** `backend/src/services/admin/admin.service.ts`

```ts
import { getPlanLimits } from '@/config/subscription-plans';

export async function previewDowngrade(userId: string, targetTierRaw: string) {
  const targetTier = canonicalTier(targetTierRaw);
  const plan = getPlanLimits(targetTier);
  const maxBusinesses = plan.maxBusinesses;
  const maxTeamMembers = plan.maxTeamMembers;

  const businessCount = await prisma.business.count({ where: { userId } });
  const ownedBusinesses = await prisma.business.findMany({ where: { userId }, select: { id: true } });
  const businessIds = ownedBusinesses.map(b => b.id);

  let teamCurrent = 0;
  let overLimitBusinessIds: string[] = [];
  if (businessIds.length) {
    const [memberCount, inviteCount] = await Promise.all([
      prisma.businessMember.count({ where: { businessId: { in: businessIds }, isActive: true, role: { not: 'owner' } } }),
      prisma.invitation.count({ where: { businessId: { in: businessIds }, status: 'pending', expiresAt: { gt: new Date() } } }),
    ]);
    teamCurrent = memberCount + inviteCount;
    if (maxTeamMembers !== -1) {
      for (const bid of businessIds) {
        const c = await prisma.businessMember.count({ where: { businessId: bid, isActive: true, role: { not: 'owner' } } });
        const p = await prisma.invitation.count({ where: { businessId: bid, status: 'pending', expiresAt: { gt: new Date() } } });
        if (c + p > maxTeamMembers) overLimitBusinessIds.push(bid);
      }
    }
  }

  const businessOverLimit = maxBusinesses !== -1 && businessCount > maxBusinesses;
  const teamOverLimit = maxTeamMembers !== -1 && teamCurrent > maxTeamMembers;

  return {
    targetTier,
    targetPlan: plan.name,
    limits: { maxBusinesses, maxTeamMembers, maxMonthlyAiQueries: plan.maxMonthlyAiQueries },
    current: { businessCount, teamCurrent, businessIds },
    overLimit: {
      businesses: businessOverLimit ? { current: businessCount, max: maxBusinesses, excess: businessCount - maxBusinesses } : null,
      teams: teamOverLimit ? { businessIds: overLimitBusinessIds, current: teamCurrent, max: maxTeamMembers } : null,
    },
    isOverLimit: businessOverLimit || teamOverLimit,
  };
}
```

Guard inside `overrideUserSubscription` — before TX:

```ts
const existingTier = canonicalTier(user.subscriptionTier ?? 'free');
const isDowngrade = maxBusinessesFor(existingTier) > maxBusinessesFor(normalizedTier)
  || maxTeamMembersFor(existingTier) > maxTeamMembersFor(normalizedTier)
  || isFeatureDowngrade(existingTier, normalizedTier);
if (isDowngrade && !input.confirmDowngrade) {
  const preview = await previewDowngrade(userId, normalizedTier);
  if (preview.isOverLimit) {
    throw new AppError(409, 'Downgrade would leave account over plan limits. Confirm to proceed.', 'DOWNGRADE_OVER_LIMIT', {
      overLimit: preview.overLimit,
      targetTier: preview.targetTier,
      limits: preview.limits,
    });
  }
}
```

Inside `$transaction` — **mandatory** re-check with `tx`:

```ts
const updatedUser = await prisma.$transaction(async (tx) => {
  if (isDowngrade) {
    const businessCount = await tx.business.count({ where: { userId } });
    const maxBusinesses = getPlanLimits(normalizedTier).maxBusinesses;
    if (maxBusinesses !== -1 && businessCount > maxBusinesses && !input.confirmDowngrade) {
      throw new AppError(409, 'Downgrade over-limit (re-checked inside transaction)', 'DOWNGRADE_OVER_LIMIT', { overLimit: { businesses: { current: businessCount, max: maxBusinesses } } });
    }
  }
  const updated = await tx.user.update({ where: { id: userId }, data: { subscriptionTier: normalizedTier, subscriptionExpiresAt: expiresAt, trialEndsAt: newTrialEndsAt }, select: {...}});
  await logAudit({...}, tx);
  return updated;
});
```

### Phase D2b — Fix read/write split for `bnplCredits` (fixes reported `GET 403`)

**Files:** `backend/src/routes/credit.routes.ts:9`, `backend/src/middleware/subscription.ts:155`

```ts
// credit.routes.ts
router.use(authenticate);
router.use(requireActiveSubscription);
// Reads — no feature gate
router.get('/', creditController.list);
router.get('/summary', creditController.getSummary);
router.get('/:creditId', creditController.getById);
router.post('/:creditId/whatsapp-reminder', creditController.getWhatsAppLink);
router.post('/:creditId/send-whatsapp', creditController.getWhatsAppLink);
// Writes — feature gated
router.post('/', requireFeature('bnplCredits'), creditController.create);
router.patch('/:creditId', requireFeature('bnplCredits'), creditController.update);
router.post('/:creditId/payments', requireFeature('bnplCredits'), creditController.recordPayment);
router.post('/:creditId/write-off', requireFeature('bnplCredits'), creditController.writeOff);
router.post('/:creditId/link-dva/:saleId', requireFeature('bnplCredits'), creditController.linkDva);
router.post('/:creditId/reconcile-dva/:saleId', requireFeature('bnplCredits'), creditController.linkDva);

// subscription.ts — defense-in-depth
export function requireFeature(feature: keyof PlanFeatures) {
  return async (req, res, next) => {
    const isRead = ['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase());
    if (isRead) return next(); // reads never FEATURE_BLOCKED
    // ... existing tier resolve + allowed check
  };
}
```

### Phase D3 — Controllers & Routes (admin preview)

```ts
// admin.controller.ts
export const previewDowngrade = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const tier = (req.query.tier as string) || '';
  if (!tier) throw new AppError(400, 'tier query param is required', 'MISSING_TIER');
  const preview = await adminService.previewDowngrade(id, tier);
  res.status(200).json({ success: true, data: preview });
});
// admin.routes.ts
router.get('/users/:id/downgrade-preview', adminController.previewDowngrade);
router.patch('/users/:id/subscription', adminController.overrideUserSubscription);
```

Auth: both under admin guard already.

### Phase D4 — Frontend: `ChangePlanModal.tsx` preview + confirmation

- On tier select change, `GET /admin/users/:id/downgrade-preview?tier=<selectedTier>` (debounce 300ms).
- When `preview.isOverLimit` → amber block: `“This downgrade leaves the account over limits: Businesses 5/2 (3 over), Team on 2 business(es) over cap 3. Existing data stays visible; new businesses/invites will be blocked until under limit. Check the box to confirm.”`
- Gate submit: `disabled={!confirmChecked && preview.isOverLimit}`; when checked, `PATCH` with `confirmDowngrade:true`.

### Phase D5 — Frontend: Over-limit banners + CTA disable (corrected for self-view)

- **Self (Settings/Dashboard):** Use client-side `getPlanLimits(currentTier)` vs `GET /businesses` count + team aggregate (or new `GET /users/me/subscription-status` — cheaper than admin preview). Do **not** call `GET /admin/.../downgrade-preview` (403 for non-admin). Banner `border-amber-200 bg-amber-50` renders regardless of `SUBSCRIPTION_ENFORCEMENT_ENABLED` (preview = would-block).
- **Admin detail:** badge when preview for `currentTier` shows over-limit.
- **Debtors/Dashboard credit widget:** after D2b, `GET` never 403; banner on read: `“Customer Credit (BNPL) is Business+ — your 3 existing credits are still visible; new credits blocked. Upgrade to create.”` CTA `New Credit` → `disabled={isBnplDowngraded}` with tooltip.

### Phase D6 — Tests & verification

- **Unit `admin-subscription-override.test.ts`:** preview over-limit; PATCH without `confirmDowngrade` → `409`; with flag → `200` and `subscriptionTier==='starter'`; upgrade/same-tier never 409.
- **Integration `subscription-enforcement.test.ts`:** Scale→Starter with `confirmDowngrade:true` → `GET /credits?` stays `200` (not 403); `POST /credits` → `403 FEATURE_BLOCKED`; `POST /businesses` at cap → `403 BUSINESS_LIMIT_REACHED`; invite 4th `400 TEAM_MEMBER_CAP_REACHED`.

---

## 6) What intentionally does NOT change

- No data deletion/migration/hiding. `GET` stays fully readable after D2b.
- No new tables/columns.
- No `bulkImport`/`dvaVirtualAccount` gates in v1.
- No background job to enforce downgrade retroactively — lazy at next write.
- `requireActiveSubscription` and `requireFeature` (after D2b read carve-out) remain the correct layers.

---

## Changelog (2026-10-10 → 2026-10-12)

| Area | 2026-10-10 | 2026-10-12 | Reason |
|---|---|---|---|
| Starter AI | Proposed `Subscription.tsx:84` 15→30, config 15 | **Both** `ChangePlanModal:17` + `Subscription:82` `15→30`; config already `30` — no test change | Live config is `30`, stale copy in two places |
| `credit.routes.ts` | Not mentioned | **Split reads/writes** + `requireFeature` `isRead` guard | Reported `GET 403` broke “never hides” |
| Preview team count | Per-business `checkTeamLimit` loop | Single aggregated count + per-business detail for warning | Correct over-limit detection |
| Banner source (self) | `GET /admin/.../preview?tier=currentTier` | Client-side `getPlanLimits` vs counts (admin preview only for admin view) | Normal user cannot call admin route |
| Guard TOCTOU | Optional re-check inside TX | **Mandatory** re-count with `tx` inside TX | Closes race where invite created between preview and confirm |
