# Marketplace Live-Edit Re-Review + Admin Status Control — Reviewed Implementation Plan

## 1. EXECUTIVE VERDICT

🟡 **GO WITH CONDITIONS** — the approach (demote-on-edit + admin send-back) is correct and minimal, but the first draft contained one false claim (merchant feedback visibility), one unfair side effect (paid boosts paused on trivial edits), and two missing guards (empty-PATCH crash, early-return ordering in submit). All are corrected below. No schema change, no migration, no new status value.

**Original idea (user's words, normalized):** a merchant cannot usefully edit a live (`approved`) marketplace product. Requirement: (a) any merchant edit to a live product flips it back to `pending_approval` on submit so an admin re-reviews it; (b) an admin can move a product from `approved` back to `pending_approval` (and generally control status both directions).

## 2. WHAT WAS WRONG WITH THE FIRST DRAFT

| # | Draft claim | Verdict after code inspection | Correction in this plan |
|---|---|---|---|
| 1 | "Merchant sees the send-back reason in the existing Moderator Feedback box" | **WRONG.** `frontend/src/pages/Inventory.tsx:421` renders the feedback box only when `status === 'rejected'`. A sent-back product is `pending_approval`, so the reason would be invisible. | Phase 4 adds a one-line condition change: show the box for `pending_approval` too when `rejectionReason` is present. |
| 2 | Demotion pauses active boosts — draft treated it as free | **RISKY (unfair).** Demotion nulls `boostEndsAt` + pauses active boosts (service L321–329). Extending demotion to *every* edit means a phone-number typo fix kills a paid boost (Phase 13 SKU). Current core-only rule has the same effect for core edits, so this is an extension of existing behavior, not new — but it must be conscious. | Phase 1 keeps the pause (consistency, anti-gaming: you cannot pay-boost an unreviewed listing), documents it in the merchant toast, and tickets boost-resume-on-re-approve as a follow-up. No auto-resume in v1. |
| 3 | "`submitForApproval` from `pending_approval` returns unchanged" | **INCOMPLETE.** The current function runs the images gate (L380) and quality-score gate (L389) *after* the status check. An early return must come *before* both gates, or a demoted product that now scores <50 would 400 on retry. | Phase 1 specifies early-return placement before all gates. |
| 4 | "Empty PATCH does not demote" | **WRONG (crash).** `updateData` would be `{}` and `tx.marketplaceProduct.update({ data: {} })` throws on empty data — this is true today, not introduced by us. | Phase 1 adds an explicit `NO_CHANGES` 400 guard for empty effective updates instead of pretending it is safe. |
| 5 | "Remove `CORE_PRODUCT_FIELDS` and update the test" | **UNNECESSARY churn.** Grep proves the only reference is its own definition (service L69); no test imports it. | Keep the export with a deprecation comment. Zero risk, cleanup later. |
| 6 | Approve-sets-expiry assumption | **UNVERIFIED → confirmed gap (out of scope).** `approveProduct` (L938–947) sets `approvedAt` but never sets `expiresAt`; only `renewProduct` (L739) does. Newly approved listings have `expiresAt = NULL` and never expire (cron requires non-null). Pre-existing bug, independent of this change. | Explicitly out of scope; ticketed in Phase 7. Demote/send-back/re-approve must leave `expiresAt` untouched (no reset, no null). |
| 7 | Admin pending-count handling | **INCOMPLETE.** Draft said "don't touch pendingCount" without verifying the refetch effect deps. | Phase 5: verify `fetchQueue` effect deps cover `activeTab`; if not, add. One-line check during implementation. |

## 3. VERIFIED CURRENT SYSTEM (codebase facts)

- **Statuses:** `draft → pending_approval → approved`, plus `rejected`, `archived`. Enum `ProductListingStatus` (schema). No new value needed.
- **`updateProduct`** (service L179–351): PATCH allowed in any status except `archived` (L196). Core-field demotion only for 7 fields (L69–77, L304–313). Non-core edit on `approved` stays live — this is the merchant's "cannot edit" dead end combined with the submit gate below.
- **`submitForApproval`** (L356–422): accepts `draft`/`rejected` only (L372); requires ≥1 image (L380) and quality ≥50 (L389). `approved` has no path back.
- **Admin:** `approve`/`reject` accept `pending_approval` only (L930, L1011); `takedown` maps anything → `archived` (L1062). No `approved → pending_approval` exists. Routes: `GET /`, `POST /:id/approve|reject|takedown`, slot routes registered first (no route conflict adding `/:id/send-back`).
- **Public feed** filters `status: 'approved'` (L1165) — demotion auto-unlists. No feed change.
- **Slot cap** counts `draft + pending_approval + approved` (L112, L772) — demotion stays inside the cap. No allowance logic touched.
- **SME UI** (`frontend` repo, `Inventory.tsx`): Edit button unconditional (L475); `handleSaveProduct` (L82) PATCHes then calls `submitForApproval`, which 400s for still-`approved` products — the exact user-facing failure. `handleSubmitForReview` + Submit button correctly gated to `draft`/`rejected` (L484).
- **Admin UI** (`adminFrontend` repo, `AdminMarketplace.tsx`): Approve/Reject on pending (L765), Take Down on approved (L786), Re-Approve on rejected (L797 — which 400s server-side; pre-existing, out of scope).
- **Notifications:** `dispatchProductEmailNotification` supports `approved`/`rejected` types only (L2040 `if/else` — anything else falls into the rejected-template branch). Do NOT reuse it for send-back without a new type. V1: no email.
- **Tests:** phase14 boost test (L387) uses `expect.objectContaining` — survives the rule change. Phase8 lifecycle tests assert archive/sold/renew paths — untouched.

## 4. TARGET STATE MACHINE

```
draft ──submit──▶ pending_approval ◀── ANY merchant edit ── approved
  ▲                    │  ▲                              │  ▲
  │              approve│  │reject                    edit │  │ admin send-back (reason required)
  │                    ▼  │                         (auto)▼  │
  └──────── (unchanged) rejected ◀──────────────────────────┘
admin takedown ──▶ archived (unchanged) · merchant archive/mark-sold (unchanged)
```

Invariants: no new status · no migration · demote preserves `expiresAt` · demote pauses paid boosts (documented, ticketed) · slot-cap neutral · public feed auto-unlists.

## 5. PHASED IMPLEMENTATION

### Phase 1 — Backend service: `updateProduct` re-review rule
**File:** `backend/src/services/marketplace/marketplace.service.ts` (modify L228–329 only)
1. After `updateData` is built, add empty guard: if `Object.keys(updateData).length === 0` → throw `400 NO_CHANGES ('No changes submitted')`.
2. Replace `coreFieldChanged` computation (L228–271) and `isDemoted` (L304) with: `const isDemoted = existing.status === 'approved' && Object.keys(updateData).length > 0;`
3. Keep the demotion body identical (status → `pending_approval`, `approvedAt/approvedBy = null`, `rejectionReason = null`, same logger line) and keep the boost-pause block (L315–329) untouched.
4. Keep `CORE_PRODUCT_FIELDS` export with `/** @deprecated — review-everything policy; kept to avoid breaking external imports. */`
5. Deliberately do NOT regenerate `slug` on rename (stable public URLs; create-time uniqueness only).

### Phase 2 — Backend service: `submitForApproval` widening + `sendProductBack`
**File:** same service file.
1. `submitForApproval`: if `existing.status === 'pending_approval'` → return product as-is **before** the image/quality gates (no write, no audit). If `approved` → run existing gates, then transition to `pending_approval` with audit action `product.submitted`. `archived` still 400s. `rejected`/`draft` unchanged.
2. New `sendProductBack(adminId, productId, reason)`: 404 if missing; 400 `INVALID_STATUS_TRANSITION` unless `approved`; reason 3–500 chars (same bounds as reject/takedown, validated in service too). Transaction: status → `pending_approval`, `approvedAt/approvedBy = null`, `rejectionReason = reason.trim()` (visible to merchant after Phase 4 fix), `boostEndsAt = null` + pause active boosts (same pattern as L321–329). Audit action `product.sent_back` with old/new status + reason. No email dispatch in v1.

### Phase 3 — Backend validator, controller, route
1. `backend/src/validators/marketplace.validator.ts`: add `sendBackSchema` (reason 3–500, mirror `takedownSchema`) + `SendBackProductInput` type. Nothing else.
2. `backend/src/controllers/marketplace-admin.controller.ts`: add `sendBackProduct` (auth check, `extractParam`, schema parse, service call, `{ success: true, data, message: 'Product sent back for review' }`); add to export object.
3. `backend/src/routes/marketplace-admin.routes.ts`: add `router.post('/:id/send-back', marketplaceAdminController.sendBackProduct)` beside approve/reject/takedown (inherits `authenticate, authorize('admin')`; no route conflict — slots routes have 3 segments).

### Phase 4 — SME frontend (`frontend` repo)
**File:** `frontend/src/pages/Inventory.tsx` only. No store/Modal changes (Edit already unconditional; PATCH response already patches the list).
1. `handleSaveProduct`: after `updateProduct` resolves, if `updated.status === 'pending_approval'` → skip the `submitForApproval` call; toast `"${name}" updated and sent back for review. They'll be notified once approved.` Keep the quality-score <50 guard before any submit attempt. Create path untouched.
2. Feedback visibility fix (required by §2 row 1): widen L421 condition so the Moderator Feedback box renders when `rejectionReason` is present and status is `rejected` **or** `pending_approval`.

### Phase 5 — Admin frontend (`adminFrontend` repo)
**File:** `adminFrontend/src/pages/admin/AdminMarketplace.tsx` only. Mirror the takedown flow exactly.
1. State: `sendBackProduct`, `sendBackReason`, `isSubmittingSendBack` (same shape as takedown trio).
2. "Send Back" button on `approved` cards next to Take Down (amber outline, `Undo2` icon), opening a reason modal (textarea, 3–500 validation toasts identical to takedown).
3. Confirm → `POST /admin/marketplace/:id/send-back`, optimistic remove from live list + rollback on failure, toast `"${name}" sent back for review`. Do not touch `pendingCount`; verify the existing `fetchQueue` effect refetches on `activeTab` change (add dep if missing — check during implementation).

### Phase 6 — Tests + typecheck
1. New `backend/tests/unit/phase15-marketplace-re-review.test.ts` (mocked prisma, phase14 style): non-core edit on `approved` demotes + clears stamps + pauses boosts; core edit still demotes; empty PATCH → `NO_CHANGES` 400; submit from `approved` → pending; submit from `pending_approval` → unchanged, zero writes; submit from `archived` → 400; `sendProductBack` happy path (reason stored, audit `product.sent_back`) + 404/400/validation failures.
2. Run full `tests/unit` (phase14 + phase8 must stay green), `tsc --noEmit` in backend (plus `--strictNullChecks` scoped to touched files), `tsc --noEmit` in `frontend/` and `adminFrontend/`.

### Phase 7 — Ship (4 repos, root untouched; backend first)
1. Backend commit + push `devsilvar/paymy-tax` (master) → Railway auto-deploys (`prisma migrate deploy` is a no-op — no schema change — safe).
2. Verify prod `/api/health` + one live round-trip (edit live product → pending → send-back → re-approve).
3. SME `frontend/` commit + push; `adminFrontend/` commit + push (`devsilvar/adminWallxerp`). Do NOT touch parent gitlink pointers.
4. Ticket (do not implement here): (a) approve-sets-no-`expiresAt` bug; (b) Re-Approve-on-rejected 400; (c) boost-resume-or-refund on re-approve after demotion; (d) send-back email template.

## 6. EDGE CASES
- Concurrent edit + admin approve: both in `$transaction`; last writer wins; audit trail records both. Acceptable.
- Edit that drops quality <50 or removes images: demotion still applies; product sits in pending; admin approve has no gates (pre-existing). Acceptable, flagged.
- No-op save (unchanged values, non-empty payload): demotes anyway — this is the user's explicit policy ("the moment he clicks submit").
- Send-back on already-pending/rejected/archived → 400. Send-back reason visible only after Phase 4 fix — Phase 4 is a hard dependency of Phase 5's usefulness.
- `expiresAt` untouched through the whole cycle (no reset on re-approve — matches current approve behavior).

## 7. ACCEPTANCE CRITERIA
1. Merchant edits any field of a live product → `pending_approval`, product disappears from public feed, toast says "sent back for review".
2. Admin Live Listings card has Send Back → modal → reason required → product lands in Pending Review with reason visible to the merchant in Inventory.
3. Admin can no longer strand a product: every `approved` product has a path back to `pending`.
4. Full unit suite green; typechecks clean in all three touched repos; Railway deploy SUCCESS with no migration output.

## 8. REMAINING QUESTIONS
None that block implementation. One product decision for you (not the implementer): when a demoted product is re-approved, should its 90-day expiry clock restart? This plan says no (preserves original window). If you want a reset, it is a 3-line change to `approveProduct` — say so before implementation.
