# DVA Transfer Allocation + Admin Unverified-Inflow Triage

**Review standard:** `rereviewplan.md`
**Review date:** 2026-10-02
**Scope of this revision:** re-review of `transferallocate.md` against the live codebase, **plus** a
new requirement — an admin clicking an incoming transfer in the treasury view must be able to reach
the unverified-inflow queue and allocate the transaction to the right business/classification.
**Status:** the previous plan's four work items survive re-review (with 4 citation corrections).
The new requirement is **larger than it looks** and is broken by a discovery below.

---

# 1. EXECUTIVE VERDICT

🟡 **PLAN REQUIRES SIGNIFICANT REVISION**

The previous plan is technically sound and every one of its central findings is **confirmed by
the codebase**. It is not a bad plan. It is an *incomplete* one, because it answered only the
first half of the problem.

The new requirement — an admin button from the treasury transfer modal into the unverified-inflow
queue — is **not implementable as described**, and the reason is a status-filter interaction that
neither the old plan nor the request accounts for:

> DVA sales are created `status: 'pending'` (`dva-webhook.service.ts:396`).
> Verification flips them to `status: 'confirmed'` (`sales-verification.service.ts:180`).
> The admin treasury inflow query filters `status: { in: ['confirmed', 'completed'] }`
> (`admin.service.ts:535`).
>
> **Therefore unverified DVA inflows are structurally invisible in the admin treasury view.**
> A button rendered from that list would *never* be able to appear — not "rarely".
> This stays true no matter how the button is written.

Additionally, there is **no admin unverified-inflow page to link to**. The one that exists
(`/sales?tab=unverified` → `UnverifiedTransactions.tsx`) sits under the SME `ProtectedRoute`,
requires an SME `activeBusiness`, and its write endpoints are ownership-scoped — an admin calling
them gets 403, because `reassignSaleBusiness` and `verifySale` both gate on
`verifyBusinessOwnership` / `verifyBusinessAccess` for the *calling user* (`sales-verification.service.ts:88`, `:261-264`).

So the feature needs a real admin surface, not a link. That is ~6 work items, not one button.

**What the treasury modal gets instead.** Two separate problems were conflated in the original
request, and they need different surfaces:

| Problem | Surface | Work item |
|---|---|---|
| "This inflow was never classified — what is it, and for which business?" | A new **admin triage queue**, `/admin/unverified-inflows` | `ADM-INFLOW-01` → `-04`, `-06` |
| "This inflow was classified, but it landed on the **wrong business** — move it." | The **treasury inflow modal itself** — show the assigned business, offer reassignment | `ADM-INFLOW-03`, `-05` |

Reassignment is deliberately **not** gated on `needsVerification`. A sale can be correctly
classified and still land on the wrong business, because DVA routing falls back to
`user.businesses[0]` (`wallet-auto-sweep.cron.ts:201-204`, `dva-webhook.service.ts:287-289`). If
reassignment were gated on unverified, that case would be unreachable exactly when it is most
likely. Both halves are settled product decisions — see **§10**.

---

# 2. WHAT WAS WRONG WITH THE OLD PLAN

## 2.1 🔴 WRONG — the premise of the new feature (found during this review)

**W-1 — No admin unverified-inflow page exists.**
`AdminSidebar.tsx:54-66` has exactly six nav items (Dashboard, Users, Businesses, Withdrawals,
Audit Logs, AI Settings). `App.tsx:166-189` has exactly eight `/admin/*` routes. None relates to
unverified inflows, DVA, or transfers. The request's premise — "it is also available as a sidebar
in the dashboard" — **is not supported by the code**. The unverified surface is the *SME* Sales tab.
Correcting a false premise rather than building on it.

**W-2 — Unverified inflows are filtered out of the treasury view entirely.** (above)
A button on a treasury row cannot reach an unverified sale, because unverified sales are not
treasury rows.

**W-3 — The admin cannot reuse the existing verification services.**
`reassignSaleBusiness(userId, sourceBusinessId, saleId, targetBusinessId)` calls
`verifyBusinessOwnership` on both businesses (`:261-264`); `verifySale(...)` calls
`verifyBusinessAccess(userId, businessId, 'sales.update')` (`:88`). An admin does not own those
businesses, so both throw 403. A naive admin endpoint that calls these services will 403 on every
request.

**W-4 — `admin.routes.ts` has no unverified or allocation endpoint at all.** Its only
transaction routes are read-only: `GET /treasury/analytics` (`:21`) and
`GET /treasury/transactions/:id` (`:22`). The only unverified route in the codebase is SME-scoped:
`sales.routes.ts:19` `GET /unverified`, mounted under `/businesses/:businessId/sales`.

**W-5 — `getTreasuryTransactionDetail` does not return the assigned business or its siblings.**
Its inflow branch (`admin.service.ts:694-741`) selects the sale and maps `id: sale.id` (`:712`),
but never surfaces `businessId`, the business's name, or the owner's other businesses. **The modal
cannot show which business a flow is assigned to, so an admin cannot judge whether it is wrong** —
which is precisely what §10.2 requires them to be able to judge.

## 2.2 🟠 OUTDATED — citation corrections (all four confirmed against the code)

| Old plan says | Actual |
|---|---|
| `schema.prisma:61` = `User.businesses` | **`:60`** (`:61` is `sessions Session[]`) |
| `ownership.ts:99-101` throws 403 | throw is at **`:98`** (if-block `:97-99`); 404 is business-not-found at `:94` |
| second DVA lookup at `dva-webhook.service.ts:292-301` | `findFirst` is at **`:293-295`**; `:292-301` is the enclosing block |
| "`narration`/`purpose` written only at `test.routes.ts:54,63`" | True **only for the DVA sender-narration payload**. `narration:` is written repo-wide for the unrelated `SettlementPayout.narration` (`schema.prisma:759`). Scope the claim. |

None of these change a conclusion. They are recorded so the next reader does not re-chase them.

## 2.3 🟢 CORRECT — confirmed, keep as-is

Every load-bearing finding in the previous plan was re-verified and **holds**:

- **D-2 (CRITICAL) — wallet ledger desync.** CONFIRMED. `reassignSaleBusiness`'s transaction
  (`:299-327`) updates only `tx.salesTransaction`. Its sibling `verifySale` **does** move the
  wallet (`:192-197`). `WalletTransaction.linkedSaleId` is `@unique` (`schema.prisma:813`). Live
  money-data corruption reachable today.
- **D-1 (CRITICAL) — webhook fallback.** CONFIRMED at `:292-295`; the plan was right that
  replacing it would silently drop transfers.
- **D-3 — narration routing is test-only.** CONFIRMED. The simulator is the only producer; the
  webhook only reads (`dva-webhook.service.ts:316-318`).
- **D-6 — business-scoped idempotency.** CONFIRMED at `:303-305`, with the P2002 catch at `:511-515`.
- **H-1 … H-9 hallucination findings.** All CONFIRMED (reassign route at `sales.routes.ts:82`;
  controller `sales.controller.ts:205-227`; UI `TransactionDetailPanel.tsx:561-613`; no
  reassignment test anywhere in `backend/tests/`; `app.ts:94` single aggregate mount;
  `sanitizeUser` at `auth.service.ts:37-43` does spread `primaryBusinessId`).
- **`unique_sales_reference` is on `(businessId, source, referenceId)`** — CONFIRMED `:193`.

## 2.4 🔵 NEW — one claim the old plan got right *by luck*, now verified safe

DVA-ALLOC-03 proposes looking up `existingSale` by `referenceId` alone. I expected this to be a
full-table scan, since the composite unique index leads with `businessId`. **It is not** —
`schema.prisma:195` declares a standalone `@@index([referenceId])`. The proposed query is
index-backed. No migration needed for that item.

---

# 3. WHAT CHANGED

| Previous Plan | Decision | Improved Plan | Reason |
|---|---|---|---|
| DVA-ALLOC-01 wallet sync | 🟢 KEEP | unchanged, **moved earlier** | It is now the shared mutation core that the admin path reuses (ADM-INFLOW-03). Doing it first means it is written once. |
| DVA-ALLOC-02 primary-business selector | 🟢 KEEP | unchanged | Verified accurate. |
| DVA-ALLOC-03 business-agnostic idempotency | 🟢 KEEP | unchanged, **resequenced to LAST** | 🟡 NEXT priority; `@@index([referenceId])` makes it cheap, so it can wait behind the admin queue. |
| DVA-ALLOC-04 FK | 🟢 KEEP | unchanged | 🟢 LATER. |
| *(nothing)* | 🔴 **MISSING** | **ADM-INFLOW-01…06** | The entire admin triage surface. The request's core deliverable. |
| — | 🔴 **WRONG PREMISE CORRECTED** | The "Verify from the treasury modal" button is replaced by **reassignment in the treasury modal** + a separate admin triage queue | The button as originally requested is impossible, not merely rare. Unverified sales are `pending` and excluded from the treasury list, so the modal never opens on one. Pending stays excluded from the P&L permanently — §10.1. |
| — | 🟠 **INCOMPLETE** | DVA-ALLOC-01 extended: also repair **existing** mis-synced rows behind a diagnostic query | The old plan deferred this to "Part E". It is a required step once the admin queue makes these visible. |
| — | 🟠 **MISSING** | New index `@@index([needsVerification, transactionDate(sort: Desc)])` | The existing `@@index([businessId, needsVerification])` (`:196`) leads with `businessId` and cannot serve a platform-wide `needsVerification: true` filter. |

---

# 4. VERIFIED FILE IMPACT

## CREATE

| File | Why |
|---|---|
| `backend/src/services/admin/admin-unverified-inflows.service.ts` | List + allocate for admins, no ownership gate (admin role is the gate). |
| `backend/tests/integration/admin-unverified-inflows.test.ts` | ADM-INFLOW-03/05 coverage. |
| `backend/tests/integration/sale-reassignment-wallet-sync.test.ts` | DVA-ALLOC-01 (was proposed; confirmed absent). |
| `backend/tests/integration/primary-business.test.ts` | DVA-ALLOC-02 (was proposed; confirmed absent). |
| `backend/prisma/migrations/<ts>_add_unverified_queue_index/migration.sql` | The ADM-INFLOW-01 index. |
| `frontend/src/pages/admin/AdminUnverifiedInflows.tsx` | The admin queue page. |

## MODIFY

| File | Why |
|---|---|
| `backend/src/services/sales/sales-verification.service.ts` | Extract the user-agnostic mutation core; add the DVA-ALLOC-01 wallet sync inside it so SME **and** admin paths share one implementation. |
| `backend/src/services/admin/admin.service.ts` | `getDashboardStats` (`:56-60`) add an unverified count; `getTreasuryAnalytics` — **untouched** (`:531-541`, and no row-mapping change at `:600-616`, see §10.1); `getTreasuryTransactionDetail` (`:694-741`) surface `assignedBusiness` / `siblingBusinesses` on the inflow branch. |
| `backend/src/controllers/admin.controller.ts` | New handlers. |
| `backend/src/routes/admin.routes.ts` | New routes (already `authenticate, authorize('admin')`-gated at `:8`). |
| `backend/src/validators/admin.validator.ts` | Confirmed exists. |
| `backend/src/validators/auth.validator.ts`, `services/auth/auth.service.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts`, `config/swagger.ts` | DVA-ALLOC-02. |
| `backend/prisma/schema.prisma` | `:195` index (ADM-INFLOW-01); `:57` relation (DVA-ALLOC-04). |
| `frontend/src/App.tsx` | `/admin/unverified-inflows` route. |
| `frontend/src/components/layout/AdminSidebar.tsx` | Nav item + count badge (mirrors the `pendingWithdrawals` pattern at `:29`, `:58-63`). |
| `frontend/src/components/admin/AdminTransferDetailModal.tsx` | Assigned-business display + reassign control, in the "Merchant & Routing Info" card (`:278-334`). Imports no router today (`:1-16`) and has only close/copy actions — **keep it that way.** ADM-INFLOW-05 step 4's optional footer link is the only thing that would add `useNavigate`; skip it and the import stays out. |
| `frontend/src/stores/admin.stats.store.ts` | Expose the new count. |
| `frontend/src/types/index.ts` | `TransferDetailBreakdown` (`:769-799`), admin stats, new queue row type. |
| `frontend/src/pages/Settings.tsx` | DVA-ALLOC-02 selector (tabs at `:61`, business store at `:76-78`). |

## DO NOT TOUCH

- `backend/src/app.ts:94` — single `app.use('/api', routes)`; new routes go in `routes/admin.routes.ts`.
- The `$transaction` fence at `dva-webhook.service.ts:389-469` — sale + wallet credit + audit are already atomic.
- The second business-level lookup at `dva-webhook.service.ts:292-295` — a live safety net.
- `TransactionDetailPanel.tsx` — SME-only; do not extend it for admin. It is not imported by any
  admin file. Its four call sites are all SME routes: `Sales.tsx:1179`, `Transactions.tsx:316`,
  `Payments.tsx:338`, `AccountModals.tsx:76`.

---

# 5. IMPROVED IMPLEMENTATION PLAN

Execution order:

```
DVA-ALLOC-01 ──┐
               ├─→ ADM-INFLOW-01 ─→ ADM-INFLOW-02 ─┐
DVA-ALLOC-02 ──┘                                   ├─→ ADM-INFLOW-04 ─→ ADM-INFLOW-06
                     ADM-INFLOW-03 ────────────────┘        │
                     (needs DVA-ALLOC-01)                   └─→ ADM-INFLOW-05 (needs 01 + 03)

DVA-ALLOC-03 (NEXT)  — independent, lands after the admin block
DVA-ALLOC-04 (LATER) — depends on DVA-ALLOC-02 only
```

Two hard edges: **DVA-ALLOC-01 must precede ADM-INFLOW-03** so the wallet-sync is written once
inside the shared core rather than twice. **ADM-INFLOW-05 needs both ADM-INFLOW-01 (the data) and
ADM-INFLOW-03 (the endpoint)** — it is last because it is the only piece that touches an existing
admin UI file.

---

### DVA-ALLOC-01 — Move the linked wallet transaction on sale reassignment
**Priority:** 🔴 NOW · **Depends on:** none · **Effort:** S (~30 min)

Inside the existing `prisma.$transaction` in `reassignSaleBusiness`
(`sales-verification.service.ts:299-327`), immediately after `tx.salesTransaction.update`, add:

```ts
await tx.walletTransaction.updateMany({
  where: { linkedSaleId: saleId },
  data: { businessId: targetBusinessId },
});
```

Mirrors `verifySale:192-197` exactly. `linkedSaleId` is `@unique` (`schema.prisma:813`) so this
touches at most one row. **No new route, controller, or service.**

**Note on completeness:** `wallet/ledger.service.ts:147` builds its sales query live
(`const salesWhere: any = { businessId }`) — the ledger is **derived, not persisted**. Moving the
wallet row therefore fully reconciles the ledger; there is no separate ledger backfill.

**Acceptance:** sale and its single `WalletTransaction` agree on `businessId` after commit, or
neither moved. `updateMany` on an empty set is a no-op. `sale.reassigned` audit unchanged.
**Verify:** `tests/integration/sale-reassignment-wallet-sync.test.ts`; `npm run test:integration`.

---

### DVA-ALLOC-02 — Let the user choose their primary DVA business
**Priority:** 🟠 NOW · **Depends on:** none · **Effort:** M (~2h)

Unchanged from the previous plan — it was verified accurate. Reuse the auth domain, not a new
`user` module:

1. `auth.validator.ts` — `updatePrimaryBusinessSchema = z.object({ primaryBusinessId: z.string().uuid().nullable() })`
   (required + nullable, not `.optional()`).
2. `auth.service.ts` — `updatePrimaryBusiness(userId, primaryBusinessId)`: call
   **`verifyBusinessOwnership(userId, primaryBusinessId)`** from `@/lib/ownership` when non-null
   (403 at `ownership.ts:98`), capture the old value, `prisma.user.update`, `logAudit` with
   `action: 'user.primary_business_updated'`, `resourceType: 'user'`.
3. `auth.controller.ts` — parse with the schema, let `AppError` propagate. Do **not** copy the
   hand-rolled 400 at `sales.controller.ts:208-213` (it returns a non-standard envelope).
4. `auth.routes.ts` — `router.patch('/me/primary-business', authController.updatePrimaryBusiness)`
   beside the existing `/me` routes (already behind `authenticate`). No new route file, no
   `app.ts` / `routes/index.ts` change.
5. Swagger entry in `config/swagger.ts`.
6. `Settings.tsx` Profile tab — read `useAuthStore(s => s.user?.primaryBusinessId)` (**already
   delivered by `/auth/me`**, `auth.service.ts:37-43` + `:365`) and
   `useBusinessStore(s => s.businesses)`. Gate the `<select>` on `businesses.length > 1`, include
   an explicit "No preference" → `null` option, and **actually wire the save** — the previous
   plan's UI had a handler no button called. Update the auth store on success so the select does
   not snap back.

**Acceptance:** 2+ businesses → selector visible; 1 → hidden. Persists across refresh and is in
the next `/auth/me`. Another user's business id → **403 FORBIDDEN**. `null` → webhook keeps its
existing `|| user.businesses[0]` fallback (`dva-webhook.service.ts:287-289`), untouched.
**Follow-up to file, not to bundle:** `dva-account.service.ts:310` overwrites `primaryBusinessId`
on DVA setup. After this ships, a user who picks a primary and later runs DVA setup on another
business silently loses their choice. Track as DVA-ALLOC-04b.

---

### ADM-INFLOW-01 — Add the queue index and surface the assigned business
**Priority:** 🔴 NOW · **Depends on:** none · **Effort:** S

*Why:* nothing downstream can render correctly without this. Today the treasury modal has no idea
which business an inflow is assigned to, and the admin queue has no index to serve from.

1. **`schema.prisma`** — add alongside the existing indexes at `:195-196`:
   ```prisma
   @@index([needsVerification, transactionDate(sort: Desc)], map: "idx_sales_unverified_queue")
   ```
   The existing `@@index([businessId, needsVerification])` leads with `businessId` and cannot serve
   a platform-wide `needsVerification: true` filter — without this the admin queue is a seq scan.
2. **Migration** `add_unverified_queue_index`.
3. **`admin.service.ts` `getTreasuryAnalytics` (`:531-541`) — NO CHANGE AT ALL. No query change, no
   row-mapping change, no new field.** `status: { in: ['confirmed', 'completed'] }` stays exactly
   as it is.

   > **Deliberately reverted — two things.** An earlier draft added an opt-in `includeUnverified`
   > filter; it is deleted. An intermediate draft added `needsVerification` to the mapped row
   > (`:600-616`) "so the table can surface verification state"; that is also deleted, because it
   > would render `false` on **every** row and mean nothing. `verifySale` is the only thing that sets
   > `status: 'confirmed'` on a DVA sale, and it clears the flag in the same update
   > (`sales-verification.service.ts:175-180`), so no row in the treasury list can be
   > `confirmed` + `needsVerification: true`. The reassignment UI is not gated on the flag either
   > (§10.2). Carrying a field that is constant is dead weight.
   >
   > Pending inflows are excluded from the treasury P&L unconditionally (§10.1). The admin queue
   > (`ADM-INFLOW-04`) is the surface where unclassified money is worked, not the P&L.

4. **`admin.service.ts` `getTreasuryTransactionDetail` (`:694-741`)** — for the **inflow** branch
   add the assigned business and the reassignment targets:
   `assignedBusiness: { id, businessName, merchantId }` (from `sale.businessId`, `:712`), plus
   `siblingBusinesses: Array<{ id, businessName, merchantId }>` — every *other* business owned by
   the same user, so the modal can offer a reallocation target without a second request. For the
   outflow branch return `siblingBusinesses: []` and no `assignedBusiness`; payouts are not
   reallocatable.
5. **`getDashboardStats` (`:56-60`)** — add `unverifiedInflows: { count }` beside `withdrawalSla`,
   counted as `prisma.salesTransaction.count({ where: { needsVerification: true } })`. Reuse the
   existing non-blocking pattern at `:56-60`.

**Acceptance:** treasury analytics output is **byte-identical** to today — same rows, same KPIs,
same margin. No `pending` sale can reach the P&L through any code path. `/admin/dashboard`
reports the unverified count. The inflow detail response carries the sibling-business list.
**Rollback:** drop the index; revert the service edits.

---

### ADM-INFLOW-02 — Admin unverified-inflow list endpoint
**Priority:** 🔴 NOW · **Depends on:** ADM-INFLOW-01 · **Effort:** S

- `GET /admin/sales/unverified?page&limit&search` in `admin.routes.ts` (auto-gated by the
  `router.use(authenticate, authorize('admin'))` at `:8`).
- `admin-unverified-inflows.service.ts` → `listUnverifiedInflows({ page, limit, search })`:
  `where: { needsVerification: true }`, `orderBy: { transactionDate: 'desc' }`,
  `include: { business: { select: { id, businessName, merchantId, user: { select: { email } } } } }`.
  Search over `referenceId`, `customerHint`, `customerName`, and the business fields.
- Return the standard envelope: `{ success: true, data: [...], pagination: { page, limit, total,
  totalPages, hasNext, hasPrev } }` — match `getUnverifiedSales` (`sales-verification.service.ts:32-39`),
  not an ad-hoc shape.
- Validate `page`/`limit` in `admin.validator.ts`.
- **Do not return** `metadata` wholesale. It carries `paystackTransactionId` and split-settlement
  internals that the admin UI does not need; select explicit columns.

**Acceptance:** an admin gets every platform-wide unverified sale, paginated, searchable, with
business + owner. A non-admin token gets 401/403 from the existing route guard.
**Security:** the response is platform-wide by design; keep it to the selected columns so it
cannot be used to enumerate fields the UI doesn't show.

---

### ADM-INFLOW-03 — Extract the shared mutation core, then add admin allocation
**Priority:** 🔴 NOW · **Depends on:** DVA-ALLOC-01, ADM-INFLOW-02 · **Effort:** M (~3h)

**This is the item that makes the feature possible.** `reassignSaleBusiness` and `verifySale` are
ownership-gated for the *calling user* (`:261-264`, `:88`), so an admin gets 403 on both.

**Step 1 — refactor (no behaviour change).** In `sales-verification.service.ts`, split each
function into an authorization half and a mutation half:

```
reassignSaleBusiness(userId, sourceBusinessId, saleId, targetBusinessId)
  ├─ 1. source !== target check                         (unchanged, :255-257)
  ├─ 2. verifyBusinessOwnership x2                     (unchanged, :261-264)
  └─ 3. applyReassignment({ saleId, sourceBusinessId, targetBusinessId, actor })
       ├─ fetch sale + 404 if wrong business           (unchanged, :266-272)
       ├─ assertMonthNotLocked x2                      (unchanged, :275-276)
       ├─ duplicate-reference check on target          (unchanged, :278-296)
       └─ $transaction: update sale + updateMany wallet (DVA-ALLOC-01) + logAudit
```

`actor` is `{ kind: 'user', userId } | { kind: 'admin', adminUserId }` — **a discriminated union,
never a boolean flag**, so an SME caller cannot request admin privileges by passing `true`.
`verifySale` gets the same treatment (`:77-97`).

**Step 2 — new admin service.** `admin-unverified-inflows.service.ts`:
- `adminReassignSale(adminUserId, saleId, targetBusinessId)` → calls `applyReassignment` with
  `{ kind: 'admin', adminUserId }`. The admin role is the authorization; there is no ownership
  check by design.
- `adminVerifySale(adminUserId, saleId, classificationName, meta?)` → calls the extracted
  verification core.

**Guards the admin path must NOT skip:** target business must exist (`AppError(404,
'BUSINESS_NOT_FOUND')`); `assertMonthNotLocked` on **both** source and target; the duplicate
`referenceId` check on the target (409 `DUPLICATE_SALES_REFERENCE`). These are business rules, not
ownership rules — they apply to admins too.

**Audit attribution:** pass `adminUserId` as the audit `userId` so the trail shows the **admin**
acted, matching the existing admin pattern (`admin-payout.service.ts` uses `userId: adminUserId`).
Set `verifiedBy` to the admin's user id — the column already exists (`schema.prisma:178`).
Set `resourceType: 'sale'`, `resourceId: saleId`.

**Step 3 — routes.**
```
PATCH /admin/sales/:saleId/reassign              { targetBusinessId }
POST  /admin/sales/unverified/:saleId/verify     { classificationName, ... }
```
The **reassign** route is deliberately *not* scoped to `unverified`: ADM-INFLOW-05 calls it from
the treasury modal on confirmed sales. Only `verify` is unverified-scoped, because only an
unverified sale can be verified.
Validate in `admin.validator.ts`. **Do not** copy the non-standard 400 envelope from
`sales.controller.ts:208-213`.

**Acceptance:** the SME path behaves **identically** to today (existing guards, existing audit
shape). An admin can classify any unverified inflow, and can reallocate any sale to one of **the
owning user's other businesses** — never an arbitrary tenant — honouring month locks and
duplicate-reference rules. Admin action is attributed to the admin in the audit log. A
non-admin cannot reach any of it.
**Verify:** `tests/integration/admin-unverified-inflows.test.ts` — cover happy path, wrong target
(404), locked month (409/400), duplicate reference (409), and that the SME 403 path still 403s.

---

### ADM-INFLOW-04 — The admin queue page
**Priority:** 🔴 NOW · **Depends on:** ADM-INFLOW-02, ADM-INFLOW-03 · **Effort:** M (~3h)

- `frontend/src/pages/admin/AdminUnverifiedInflows.tsx`, route `/admin/unverified-inflows` in
  `App.tsx` inside the existing `AdminRoute` / `AdminLayout` pair (`:166-189`).
- `AdminSidebar.tsx` nav item "Unverified Inflows" with a count badge, mirroring the existing
  withdrawals badge (`:29` reads `stats?.withdrawalSla?.pendingCount`; `:58-63` renders it). Read
  the new count from `useAdminStatsStore` — the store is the established single source
  (`admin.stats.store.ts`), do not add a parallel request.
- **What the admin must see first:** the business this inflow is *currently* assigned to. Give it
  a dedicated, visually distinct cell (e.g. business name + `merchantId` on a tinted block), not a
  plain column that blends in with the metadata. The whole point of the queue is noticing "this
  isn't for this business" — the assignment has to be the thing your eye lands on.
- Table: date · reference · **assigned business** · owner · amount · customer hint · verification
  state · actions.
- Row action **"Reallocate"** → a select of the owner's other businesses + confirm. The list
  response must therefore include the owner's **other** business ids, not just the current one —
  otherwise the admin cannot choose a target without a second request. Include
  `siblingBusinessIds: string[]` per row, or return the businesses list once at the top of the
  payload and map by owner id client-side.
- Row action **"Mark verified"** → classification select. Admins may classify as well as
  reallocate. A reassignment alone does **not** clear `needsVerification` — `reassignSaleBusiness`
  never touches that flag, so verification is a separate, deliberate act.
- Debounced search (300 ms) and a `hasLoadedOnce` flag, matching the convention used across the
  admin pages — do **not** fetch on every keystroke.
- Empty state must distinguish "no unverified inflows" from "no results for this search".
- Reuse the dense styling already established in `AdminWithdrawals.tsx` (hairline header, `text-xs`
  rows, `tabular-nums` on money) so the admin section stays internally consistent.

**Acceptance:** the page loads, paginates, searches without a request per keystroke, and both
actions work. Badge count matches `getDashboardStats`.
**Verify:** build clean; manual walk-through; frontend tests for the badge and the two actions.

---

### ADM-INFLOW-05 — Show the assigned business in the treasury modal and allow reallocation
**Priority:** 🔴 NOW · **Depends on:** ADM-INFLOW-01, ADM-INFLOW-03 · **Effort:** M (~2h)

**This replaces the button as originally requested.** The earlier draft put a "Verify &
Reallocate" button on unverified inflows inside the treasury modal. **That was impossible**: with
pending inflows excluded from the P&L (§10.1), the modal only ever opens on `confirmed`/`completed`
sales, which are by definition already verified — `verifySale` clears `needsVerification` in the
same update that sets `status: 'confirmed'` (`sales-verification.service.ts:175-180`). There is no
unverified row it can be showing, so the button would be dead code.

The workflow that *is* real — and is what the product owner described — is: an admin inspects a
confirmed inflow, sees clearly which business it was booked to, and reassigns it if that is wrong.
So the assignment becomes prominent and reassignment is available on **every** inflow, regardless
of verification state.

1. **Make the assignment unmistakable.** In the "Merchant & Routing Info" card (`:278-334`) the
   business name/owner/email are plain rows that read like metadata. Give the assignment its own
   labelled block — a "Assigned to" heading with business name, `merchantId`, and owner email,
   visually distinct from the surrounding grid. This is the thing the admin is supposed to
   *check*, so it must not look like one more row. Data comes from `assignedBusiness`, added in
   ADM-INFLOW-01 step 4 — no extra request, and **no router import is needed**: this modal has
   still never imported `react-router-dom` (`:1-16`) and must not start now that nothing navigates.
2. **Reallocate control**, rendered when `data.type === 'inflow'` and
   `data.siblingBusinesses.length > 0`: a select of the sibling businesses plus a confirm button.
   `siblingBusinesses` comes from ADM-INFLOW-01 step 4 — no extra request.
   - Call `PATCH /admin/sales/:saleId/reassign`. **Name it this, not
     `/admin/sales/unverified/:saleId/reassign`** — it serves confirmed sales too, and a route
     scoped to "unverified" would be actively misleading on this call path.
   - Targets are only the **owner's other businesses** (`siblingBusinesses`), never an arbitrary
     tenant — the ownership check in `applyReassignment` applies to admins too (ADM-INFLOW-03).
   - On success: re-fetch the detail (`setData`) so the modal shows the new business, and toast.
   - On failure: surface the backend message. `assertMonthNotLocked` and the duplicate-reference
     rule both fire here — render `err.response?.data?.error?.message`, not a generic failure.
3. **Reassignment changes numbers the admin is currently looking at.** The P&L is derived live
   from `SalesTransaction`, so a reassignment immediately re-attributes historical margin. Add a
   one-line note under the control: *"Reallocating changes which business this inflow counts
   toward, including in periods already reported."* The action is audited (ADM-INFLOW-03), but the
   admin should know before clicking.
4. **Optional:** a quiet secondary link to `/admin/unverified-inflows` in the footer, for admins
   who want the full pending queue. This is the **only** navigation in the modal, and it is why
   `useNavigate` would be imported — skip it and the import stays out. It is **not** a per-sale
   verify action — unverified sales are not treasury rows and cannot be reached from here.
5. **Outflows get none of this.** `siblingBusinesses` is empty for payouts and no reallocate
   control renders.

**Acceptance:** an inflow shows a clearly-labelled owning business; with 2+ businesses a reallocate
control appears and successfully moves the sale (and its wallet row, via the shared core); with 1
business the control is absent; month-locked and duplicate-reference failures surface the real
backend message; the modal re-renders with the new business after success; an outflow shows no
reallocate control.
**Do not** re-add a `needsVerification`-gated button — on this list it would be dead code.

---

### ADM-INFLOW-06 — Repair rows already desynced by DVA-ALLOC-01
**Priority:** 🟠 NEXT · **Depends on:** DVA-ALLOC-01 · **Effort:** S

Only run if the diagnostic returns rows:
```sql
SELECT st.id, st.business_id, wt.business_id
FROM sales_transactions st
JOIN wallet_transactions wt ON wt.linked_sale_id = st.id
WHERE st.business_id <> wt.business_id;
```
**Inspect the result first.** Repair with a bounded `UPDATE … FROM` inside a transaction, and
`logAudit` each corrected row (`resourceType: 'sale'`, `oldData`/`newData` = the two business ids)
so a historic repair is distinguishable from a user action. Do not run blind.

**Acceptance:** the query returns zero rows afterwards, or the run is documented with the count
and an audit trail.

---

### DVA-ALLOC-03 — Business-agnostic webhook idempotency
**Priority:** 🟡 NEXT · **Depends on:** none · **Effort:** S · *(resequenced after the admin work)*

`dva-webhook.service.ts:303-305` — probe by `referenceId` alone first; if found under a different
business, that booking is authoritative: return `true` and create nothing. Keep the business-scoped
check as a secondary path and keep the P2002 catch (`:511-515`) as the backstop.

**Note:** `schema.prisma:195` declares `@@index([referenceId])`, so the broader lookup is
index-backed. No migration required — worth stating because the composite
`unique_sales_reference` index leads with `businessId` and looks like it would not be.

**Acceptance:** the same `reference` delivered twice with `primaryBusinessId` changed in between
yields exactly one `SalesTransaction`. Normal retry path unchanged.
**Verify:** `tests/integration/dva-webhook-idempotency.test.ts`.

---

### DVA-ALLOC-04 — Real FK for `User.primaryBusinessId`
**Priority:** 🟢 LATER · **Depends on:** DVA-ALLOC-02 · **Effort:** M (+ migration)

Unchanged. `primaryBusinessId` is a bare `String?` (`schema.prisma:57`) with no relation. Add
`primaryBusiness Business? @relation("PrimaryBusiness", fields: [primaryBusinessId], references: [id], onDelete: SetNull)`
plus the back-relation on `Business`. `User.businesses` is at **`:60`**, so the back-relation name
must be explicit and distinct. Backfill/clean dangling values before adding the FK.

**Acceptance:** deleting a primary business nulls the owner's `primaryBusinessId`; the webhook
fallback (`dva-webhook.service.ts:287-289`) behaves as today.

---

# 6. ACCEPTANCE CRITERIA

**Data integrity (DVA-ALLOC-01)**
- [ ] After any reassignment — SME or admin — `SalesTransaction.businessId` and its linked
      `WalletTransaction.businessId` are equal, or neither changed.
- [ ] `tests/integration/sale-reassignment-wallet-sync.test.ts` green.
- [ ] ADM-INFLOW-06 diagnostic returns zero rows (or the repair is documented + audited).

**Admin triage (ADM-INFLOW-01…06)**
- [ ] `GET /admin/sales/unverified` returns every platform-wide unverified sale, paginated.
- [ ] An admin can **classify** an unverified inflow; `verifiedBy`/`verifiedAt` are set to the
      admin, `needsVerification` clears, `status` flips `pending → confirmed`.
- [ ] An admin can **reallocate** a sale to one of the owning user's *other* businesses; month
      locks and the duplicate-reference rule both still apply; an out-of-scope target is rejected.
- [ ] The audit trail attributes both admin actions to the **admin**, not the business owner.
- [ ] **No `pending` sale can reach the treasury P&L through any code path.** Treasury analytics
      output — rows, KPIs, margin — is **byte-identical** to today. `getTreasuryAnalytics`
      (`:531-541`) has no diff.
- [ ] A treasury inflow modal shows a clearly-labelled owning business, and — with 2+ businesses
      — a reallocate control that moves the sale and its wallet row. After the move the modal
      re-renders with the new business, and the platform P&L reflects it on next fetch (derived
      ledger, `wallet/ledger.service.ts:147` — no backfill).
- [ ] Month-locked and duplicate-reference failures during reallocation surface the real backend
      message, not a generic error.
- [ ] An outflow shows no reallocate control.
- [ ] A non-admin token cannot reach any new admin route.
- [ ] Search does not fire a request per keystroke (300 ms debounce + `hasLoadedOnce`).

**Primary business (DVA-ALLOC-02)**
- [ ] `PATCH /auth/me/primary-business` persists; 403 on another user's business; `null` allowed.
- [ ] The Settings selector actually saves (explicitly regression-tested — this is the D-5 bug).
- [ ] `dva-account.service.ts:310` overwrite is filed as DVA-ALLOC-04b, not silently bundled.

**Regression**
- [ ] `cd backend && npm run build && npm run test:unit` green.
- [ ] `cd backend && npm run test:integration` green (needs `TEST_DATABASE_URL`; a missing DB is
      environmental, not a regression).
- [ ] `cd frontend && npm run build` green; admin vitest suite green.
- [ ] SME verify / reclassify / reassign flows manually re-tested — the ADM-INFLOW-03 refactor
      touches them.

---

# 7. EDGE CASES CONSIDERED

| Scenario | Handling |
|---|---|
| Sale already reassigned by hand in the DB | ADM-INFLOW-06 diagnostic + audited repair. |
| Target business does not exist | 404 `BUSINESS_NOT_FOUND` — the admin path keeps this guard. |
| Target month is finalized/locked | `assertMonthNotLocked` on **both** businesses, admin included. |
| Target already has that `referenceId` | 409 `DUPLICATE_SALES_REFERENCE` (unchanged from SME path). |
| Concurrent admin + SME both act on one sale | Same `$transaction`; second write sees the updated `businessId` and 404s on the source check. |
| Webhook retry lands on the new primary business | DVA-ALLOC-03's business-agnostic lookup prevents the double booking. |
| Sale has no linked `WalletTransaction` | `updateMany` on an empty set is a no-op. |
| Admin session opens the SME unverified page | Out of scope by design — that page is SME-scoped and needs an `activeBusiness`. The admin gets its own surface. |
| Unverified sale is `status: 'pending'` and not taxable yet | Tax calculations exclude non-confirmed sales; do not change that. |
| Admin picks the business the sale is already on | `sourceBusinessId === targetBusinessId` throws 400 `INVALID_TARGET_BUSINESS` (`sales-verification.service.ts:255-257`). The UI hides it — the select only offers siblings — but the API must still refuse it, and surface the real message rather than a generic failure. |
| Owner has exactly one business | `siblingBusinesses` is empty, so the reassign control does not render at all (ADM-INFLOW-05). Not a disabled button — absent. |

---

# 8. REMAINING QUESTIONS

> Questions 1 and 2 from the previous revision of this document have been **answered by the product
> owner and are now settled decisions** — recorded in §10. They are removed here. One question
> remains.

1. **`dva-account.service.ts:310` overwriting `primaryBusinessId`** — leave as a filed follow-up
   (DVA-ALLOC-04b), or change the semantics? Changing it alters existing DVA setup behaviour, so
   it is deliberately not bundled.

None of these block starting DVA-ALLOC-01 or the ADM-INFLOW block.

---

# 9. FINAL READINESS SCORE

**9 / 10 — implementation-ready for the whole plan.**

The previous plan's four items are verified and sound. The deductions on the previous revision (8/10)
were for the new admin-triage surface, which carried two unresolved product questions. Both are now
answered (§10), and one of them — pending inflows in the P&L — *simplified* the work rather than
adding to it: the `includeUnverified` filter drafted into `ADM-INFLOW-01` is deleted, so the treasury
query is untouched and the admin queue is the single surface where unclassified money is worked.

The one residual risk is `ADM-INFLOW-03`, the refactor that touches `sales-verification.service.ts` —
a shared, money-touching service on the SME path. It is contained: `reassignSaleBusiness` and
`verifySale` have exactly one caller each (`sales.controller.ts:215`, `:158`), and
`TransactionDetailPanel.tsx` has **zero admin usages** (its four call sites are `Sales.tsx:1179`,
`Transactions.tsx:316`, `Payments.tsx:338`, `AccountModals.tsx:76` — all SME routes). But it must
land with its SME regression tests, not as a drive-by.

Deductions from a 10 are for the untestable part of `ADM-INFLOW-06`: the list has no integration
test harness yet, so "reallocation is reflected in the P&L immediately" can only be verified by hand
against a live backend until that test exists.

---

# 10. SETTLED DECISIONS

Recorded here so they are not re-litigated mid-implementation, and so no later work item silently
reopens them. These are **product decisions**, not code preferences. Both were answered by the
product owner on 2026-10-02.

## 10.1 Pending inflows are NEVER added to the treasury P&L

**Decision.** `pending` inflows are excluded from treasury analytics and reported platform margin
unconditionally. There is no opt-in flag, no `includeUnverified` query parameter, and no admin
toggle.

**What this rules out.**
- The `includeUnverified` filter drafted in revision 1 of `ADM-INFLOW-01` is deleted — see the
  "Deliberately reverted" note in that work item.
- `admin.service.ts:531-541` keeps `status: { in: ['confirmed', 'completed'] }` **unchanged**.
- No scheduled job, cron, or accrual may promote a `pending` inflow into reported margin. The only
  way a pending inflow becomes a P&L line is a human verifying it, which flips it to `confirmed`
  (`sales-verification.service.ts:180`).

**Why it matters beyond accounting.** `status: 'pending'` + `needsVerification: true` is set
atomically with the wallet credit at DVA capture (`wallet-auto-sweep.cron.ts:396`, `:421`). Until a
human verifies, the platform holds money it has not attributed to a confirmed, classified sale.
Reporting that as margin would let the P&L move on admin action alone — an unaudited number.

**Consequence accepted.** Money awaiting verification is invisible on the treasury screen. That is
the point: it is visible on the admin triage queue (`ADM-INFLOW-04`) instead, which is where it can
actually be worked. That queue's nav badge **mirrors** the existing withdrawals badge
(`AdminSidebar.tsx:29` reads `stats?.withdrawalSla?.pendingCount`, rendered at `:58-63`) — it is the
same pattern with a new count from `getDashboardStats`, not a new mechanism.

**Verified, not assumed:** `verifySale` is the only writer that flips a DVA sale to `confirmed`, and
it clears `needsVerification` in the same update (`sales-verification.service.ts:175-180`). So no
sale in the treasury list can be `confirmed` + `needsVerification: true`, and no `pending` sale can
be a P&L line by any route other than human verification.

## 10.2 Admins may both classify and reallocate

**Decision.** An admin handling an unclassified inflow can do **both** things:
1. **Classify it** — supply the category/customer/source data that turns `pending` into `confirmed`.
   This is the `POST /admin/sales/unverified/:saleId/verify` endpoint (`ADM-INFLOW-03`).
2. **Reallocate it** — move a *confirmed, already-P&L-visible* sale from the business it landed on
   to a different business the same user owns. This is the `PATCH /admin/sales/:saleId/reassign`
   endpoint (`ADM-INFLOW-03`) and the UI in `ADM-INFLOW-05`.

The request was "which business **or class**" — both are implemented.

**Reallocation is not gated on `needsVerification`.** It is a separate concern from classification:
a sale can be perfectly correctly classified and still land on the wrong business (DVA flows route
on `primaryBusinessId`, then fall back to `user.businesses[0]` —
`wallet-auto-sweep.cron.ts:201-204`, `dva-webhook.service.ts:287-289`). Gating reassignment behind
`needsVerification` would make the wrong-business case unreachable exactly when it is most likely.

**Required UI affordance.** The treasury inflow modal must show **which business the flow is
currently assigned to**, prominently, before offering reassignment. An admin who cannot see the
current assignment cannot judge whether it is wrong. This is `ADM-INFLOW-05`.

**Ledger consistency is automatic.** `wallet/ledger.service.ts:147` derives the wallet position
from live sales (`const salesWhere: any = { businessId };`), so moving a sale moves the wallet line
and the derived P&L with it — no backfill, no reconciliation job.

**Explicitly unchanged:** the reassignment targets are only the same user's **other** businesses.
`reassignSaleBusiness` calls `verifyBusinessOwnership` twice (`sales-verification.service.ts:261-264`)
and returns 403 (`lib/ownership.ts:98`) otherwise. An admin cannot move money into an arbitrary
tenant.

---

*Every citation in this document was read directly from the repository on 2026-10-02. Where a
claim could not be verified it is marked rather than asserted. The four citation corrections to the
previous plan are listed in §2.2 so they are not re-chased. §10 records the two product decisions
that are settled and must not be reopened during implementation.*
