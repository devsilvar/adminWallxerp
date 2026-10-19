# DOWNGRADE PLAN — DUMB-INTERN PHASED IMPLEMENTATION GUIDE
### Senior Engineer (100+ yrs) → Intern Hand-Hold

> **Source:** `prompts/downgrade.md` (2026-10-12) — with Read/Write Split Fix. Every phase below is ordered by dependency — **do not skip order**. Each phase has: **Goal → Files → Copy-Paste Code → Verify → Pitfall**.

---

### PRE-FLIGHT (Do this once, 2 mins)

**1. Understand the rule:** Downgrade **never deletes/hides**. `GET` always `200` and shows amber `“X over limit — existing data visible, new blocked”`. Only next `POST/PATCH` that would exceed new tier’s `maxBusinesses(2/5/-1)`, `maxTeamMembers(3/10/-1)` or `bnplCredits=false` is blocked `403`/`400`.

**2. Open these 5 live files in your editor — you’ll touch them all:**

| File | Why |
|------|-----|
| `backend/src/config/subscription-plans.ts:96` | Truth: Starter is `30` AI, not `15` |
| `backend/src/validators/admin.validator.ts:121` | Where `confirmDowngrade` flag lives |
| `backend/src/services/admin/admin.service.ts:1424` | Where `overrideUserSubscription` lives |
| `backend/src/routes/credit.routes.ts:9` | The bug: `router.use(requireFeature)` blocks `GET` |
| `frontend/src/components/admin/ChangePlanModal.tsx:17` | Stale `15 AI` copy |

**3. Run once to prove clean before you touch:**

```bash
cd backend && ./node_modules/.bin/tsc --noEmit   # should be silent ✅
cd ../frontend && ./node_modules/.bin/tsc --noEmit # silent ✅
```

---

### PHASE D0 — FIX STALE UI COPY (2 files, 2 lines, 5 mins)

**Goal:** Stop showing `15 AI Queries` when backend allows `30`.

**Files:**
* `frontend/src/components/admin/ChangePlanModal.tsx:17`
* `frontend/src/pages/Subscription.tsx:82`

**What to do:**

1. Open `ChangePlanModal.tsx`, find:
   ```ts
   { id: 'starter', name: 'Starter', price: '₦5,000/mo', desc: '2 Businesses, 3 Team Members, 15 AI Queries' },
   ```
   Change `15` → `30`.

2. Open `Subscription.tsx`, find `PLANS.starter` features array:
   ```ts
   '15 AI CFO queries / month' → '30 AI CFO queries / month'
   ```

**Verify:**
```bash
cd frontend && ./node_modules/.bin/tsc --noEmit # still silent
# Open ChangePlanModal in browser → Starter card now says 30 AI
```
**Pitfall:** Do NOT touch `subscription-plans.ts:96` — it’s already `30`. Do NOT touch tests — `subscription-plans-config.test.ts:32` already expects `30`.

---

### PHASE D1 — ADD `confirmDowngrade` FLAG (1 file, 1 line, 5 mins)

**Goal:** Let admin explicitly confirm over-limit downgrade.

**File:** `backend/src/validators/admin.validator.ts:121`

**Copy-paste — before:**
```ts
export const adminOverrideSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'business', 'scale_up', 'scale']),
  durationDays: z.coerce.number().int().positive().nullable().optional(),
  customExpiresAt: z.coerce.date().optional(),
  resetTrial: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500),
});
```

**After (add one line):**
```ts
export const adminOverrideSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'business', 'scale_up', 'scale']),
  durationDays: z.coerce.number().int().positive().nullable().optional(),
  customExpiresAt: z.coerce.date().optional(),
  resetTrial: z.boolean().optional(),
  confirmDowngrade: z.boolean().optional().default(false),
  reason: z.string().trim().min(3).max(500),
});
```

**Verify:**
```bash
cd backend && ./node_modules/.bin/tsc --noEmit # silent
```

**Pitfall:** Keep `reason` required — `confirmDowngrade` is *not* a replacement for audit reason.

---

### PHASE D2 — CREATE `previewDowngrade` + GUARD `overrideUserSubscription` (1 file, ~90 lines, 30 mins — MOST IMPORTANT)

**Goal:** Show admin “you’re about to go over-limit” *before* write, and block over-limit writes unless checkbox checked.

**File:** `backend/src/services/admin/admin.service.ts`

**Step 2A — Add `previewDowngrade` at top after imports (read-only, no TX, no audit):**

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

**Step 2B — Guard `overrideUserSubscription` (after `expiresAt` computed, before `prisma.$transaction`):**

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

**Step 2C — Inside `$transaction`, mandatory re-check with `tx`:**

```ts
const updatedUser = await prisma.$transaction(async (tx) => {
  if (isDowngrade) {
    const businessCount = await tx.business.count({ where: { userId } });
    const maxBusinesses = getPlanLimits(normalizedTier).maxBusinesses;
    if (maxBusinesses !== -1 && businessCount > maxBusinesses && !input.confirmDowngrade) {
      throw new AppError(409, 'Downgrade over-limit (re-checked inside transaction)', 'DOWNGRADE_OVER_LIMIT', { overLimit: { businesses: { current: businessCount, max: maxBusinesses } } });
    }
  }
  const updated = await tx.user.update({ where: { id: userId }, data: { subscriptionTier: normalizedTier, subscriptionExpiresAt: expiresAt, trialEndsAt: newTrialEndsAt }, select: { id: true, email: true, role: true, subscriptionTier: true, subscriptionExpiresAt: true, trialEndsAt: true }});
  await logAudit({ userId: adminUserId, action: 'admin.subscription_manual_override', resourceType: 'user', resourceId: userId, oldData: { subscriptionTier: user.subscriptionTier, subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null, trialEndsAt: user.trialEndsAt?.toISOString() ?? null }, newData: { subscriptionTier: normalizedTier, subscriptionExpiresAt: expiresAt?.toISOString() ?? null, trialEndsAt: newTrialEndsAt?.toISOString() ?? null, confirmDowngrade: !!input.confirmDowngrade } }, tx);
  return updated;
});
```

**Helpers at bottom:**
```ts
function maxBusinessesFor(t: string) { const p = getPlanLimits(t); return p.maxBusinesses === -1 ? Number.MAX_SAFE_INTEGER : p.maxBusinesses; }
function maxTeamMembersFor(t: string) { const p = getPlanLimits(t); return p.maxTeamMembers === -1 ? Number.MAX_SAFE_INTEGER : p.maxTeamMembers; }
function isFeatureDowngrade(from: string, to: string) { return isFeatureAllowed(from,'bnplCredits') && !isFeatureAllowed(to,'bnplCredits'); }
```

**Verify:** `cd backend && ./node_modules/.bin/tsc --noEmit` silent.

**Pitfall:** Do NOT use `checkTeamLimit` per-business — it reads *current* tier, not target. Use direct counts as above.

---

### PHASE D2b — FIX `GET 403` BUG (2 files, 10 lines, 10 mins — FIXES YOUR REPORTED ERROR)

**Goal:** `GET /credits` must stay `200` after downgrade; only `POST` blocks.

**File 1: `backend/src/routes/credit.routes.ts:9`**

**Before:**
```ts
router.use(requireActiveSubscription, requireFeature('bnplCredits'));
router.post('/', creditController.create);
router.get('/', creditController.list);
```

**After (split):**
```ts
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
```

**File 2: `backend/src/middleware/subscription.ts:155`**

**Add at top of `requireFeature`:**
```ts
export function requireFeature(feature: keyof PlanFeatures) {
  return async (req, res, next) => {
    const isRead = ['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase());
    if (isRead) return next(); // reads never FEATURE_BLOCKED
    // ... existing tier resolve
```

**Verify:** Downgrade Scale(5 biz) → Starter, then `GET /businesses/:id/credits?page=1` → `200` with 3 rows, `POST /credits` → `403 FEATURE_BLOCKED`.

---

### PHASE D3 — WIRE PREVIEW ENDPOINT (2 files, 10 lines, 10 mins)

**Files:** `backend/src/controllers/admin.controller.ts`, `backend/src/routes/admin.routes.ts`

**Controller add:**
```ts
export const previewDowngrade = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const tier = (req.query.tier as string) || '';
  if (!tier) throw new AppError(400, 'tier query param is required', 'MISSING_TIER');
  const preview = await adminService.previewDowngrade(id, tier);
  res.status(200).json({ success: true, data: preview });
});
```

**Routes add:**
```ts
router.get('/users/:id/downgrade-preview', adminController.previewDowngrade);
router.patch('/users/:id/subscription', adminController.overrideUserSubscription);
```
Both already under admin guard — no new middleware.

---

### PHASE D4 — CHANGEPLANMODAL PREVIEW + CHECKBOX (1 file, 15 lines, 15 mins)

**File:** `frontend/src/components/admin/ChangePlanModal.tsx`

1. On `selectedTier` change, debounce 300ms: `GET /admin/users/:id/downgrade-preview?tier=selectedTier`.
2. If `preview.isOverLimit`: render amber block:
   ```
   “This downgrade leaves the account over limits:
   Businesses 5/2 (3 over), Team on 2 business(es) over cap 3.
   Existing data stays visible; new businesses/invites will be blocked until under limit.
   Check the box to confirm.”
   ```
3. Gate submit: `disabled={!confirmChecked && preview.isOverLimit}`. When checked, `PATCH` with `confirmDowngrade:true`.

---

### PHASE D5 — BANNERS + CTA DISABLE (2 files, 15 lines, 15 mins)

**Self (Settings/Dashboard):** Do NOT call admin preview (403 for normal user). Use:
```ts
const plan = getPlanLimits(currentTier);
const businessCount = (await api.get('/businesses')).data.data.length;
const isOverLimit = businessCount > plan.maxBusinesses;
```
Render `border-amber-200 bg-amber-50` banner regardless of `SUBSCRIPTION_ENFORCEMENT_ENABLED` (preview = would-block). Disable `New Business`/`Invite` with tooltip `“At plan cap — upgrade or remove a business”`.

**Debtors widget:** After D2b, `GET` never 403; banner: `“Customer Credit (BNPL) is Business+ — your 3 existing credits are still visible; new credits blocked. Upgrade to create.”` CTA `New Credit` disabled.

---

### PHASE D6 — TESTS (2 files, 15 mins)

* **Unit `admin-subscription-override.test.ts`:** preview over-limit; `PATCH` without `confirmDowngrade` → `409`; with `true` → `200` and `subscriptionTier==='starter'`; upgrade/same-tier never 409.
* **Integration `subscription-enforcement.test.ts`:** Scale→Starter with `confirmDowngrade:true` → `GET /credits?` stays `200` (proves D2b), `POST /credits` → `403 FEATURE_BLOCKED`; `POST /businesses` at cap → `403 BUSINESS_LIMIT_REACHED`; invite 4th `400 TEAM_MEMBER_CAP_REACHED`.
* **Manual:** ChangePlanModal Scale→Starter shows amber, submit blocked until checkbox, succeeds, `Settings` banner appears, `GET /credits?page=1` still `200`.

---

**Total time:** ~90 mins. **Risk:** zero data deletion, reads always `200`, writes lazily blocked — exactly the “never hides” guarantee. After D6, `tsc --noEmit` frontend+backend must still be silent.

---
*Generated from `prompts/downgrade.md` (2026-10-12) — with Read/Write Split Fix. Source of truth for dumb-intern implementation.*
