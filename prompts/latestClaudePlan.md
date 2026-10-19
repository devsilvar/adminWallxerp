# Reminder Generation & Notification Coverage

## Context

The bell UI is live (previous plan). But the pipeline that **creates** reminders is thin:

- `tax_deadline` — only created as a side effect of `GET /reminders/active` (i.e. when the user opens the bell) AND only when today ≥ `taxReminderDay`. If the user never opens the bell, nothing fires.
- `margin_warning` — already wired on every tax calculation (`tax.service.ts:136,142`). Fine.
- `unfiled_tax`, `unfinalized_report`, `unpaid_tax` — only fire when the user **clicks "Generate Reminders"** on `/reminders`. Nothing automatic.
- `generateRemindersForAllBusinesses()` exists at `reminder.service.ts:212` but is wired to zero callers.

Result: the bell is mostly empty for a normal user. The work is to (a) run a reliable scheduled sweep, (b) hook into payment/invoice/DVA lifecycle events so reminders fire *when things actually happen*, and (c) add three new reminder types the user asked for.

## Decisions already made

- **Scheduler:** node-cron inside the Node process. Single daily job at 00:30 local (Africa/Lagos). Lock via a Postgres advisory lock so multi-instance deploys (future) don't double-run; for now single-instance is fine. Idempotency guaranteed regardless by the existing `findFirst` dedup guards in the service.
- **New reminder types:** `invoice_overdue`, `payment_successful`, `dva_received`. (Not adding `payment_failed` this round.)
- **In-app only.** No email/SMS delivery (stays as Phase 5). The bell is the surface.

## Approach

Three workstreams, in this order:

1. **Expand the reminder type system** — add three types, wire their messages + UI colors + deep-link destinations.
2. **Event-driven creators** — emit reminders from the webhook/service code paths that already run when the real-world event happens (payment success, DVA auto-capture, invoice send). These are the high-signal notifications.
3. **Daily sweep (cron)** — catches everything the event hooks miss: invoices that *became* overdue overnight, tax_deadline coming due, unfiled months rolling over.

---

## 1. Schema + enum

**Prisma schema** (`backend/prisma/schema.prisma:390`): `reminderType` is a `String`, so no migration is strictly required to add new values. But the service's internal `ReminderType` union (`reminder.service.ts:32`) must include the new members or TS will refuse. Update the union in-place:

```ts
type ReminderType =
  | 'tax_deadline'
  | 'unfiled_tax'
  | 'unfinalized_report'
  | 'unpaid_tax'
  | 'margin_warning'
  | 'invoice_overdue'
  | 'payment_successful'
  | 'dva_received';
```

**Frontend** (`frontend/src/types/index.ts:303`): extend `ReminderType` to match. Same string union.

Also extend `TYPE_COLOR` in `frontend/src/components/layout/NotificationBell.tsx:22` and the `typeBadge` map in `frontend/src/pages/Reminders.tsx:26`:

- `invoice_overdue` → `bg-orange-100 text-orange-700` (same family as `unpaid_tax` since both are "money owed")
- `payment_successful` → `bg-green-100 text-green-700` (positive)
- `dva_received` → `bg-emerald-100 text-emerald-700` (positive, differentiated)

**Deep-links** — extend `ROUTE_FOR_REMINDER` in `NotificationBell.tsx:30`:

- `invoice_overdue` → `/invoices` (list page; we do NOT have enough context on the reminder row to deep-link to `/invoices/:id` without storing `referenceId` on the reminder — see §4 below)
- `payment_successful` → `/payments`
- `dva_received` → `/sales`

## 2. Optional metadata field on Reminder

A `tax_deadline` doesn't need a target; it refers to "the current month". But `invoice_overdue` needs to know *which invoice*, `payment_successful` needs the payment ID, `dva_received` needs the sales transaction ID. Without this the user clicks "Go to Invoices" and lands on the list — acceptable, but the detail drill-through in the plan §1 ("Go to Tax Reports") should become a per-type "Go to …" with a real target when we have one.

**Schema change** — add a nullable `referenceId String? @map("reference_id")` + `referenceType String? @map("reference_type")` to `Reminder`. Keep the migration tiny:

```prisma
model Reminder {
  ...
  referenceType String?   @map("reference_type")   // 'invoice' | 'payment' | 'sales_transaction' | null
  referenceId   String?   @map("reference_id")
  ...
  @@index([businessId, referenceType, referenceId])
}
```

Migration name: `20260422103000_add_reminder_reference`.

**Backend:**
- Extend `createMarginWarning` and internal create calls to accept optional `{ referenceType, referenceId }`.
- Add a new helper `createReminderOnce(params)` (see §3) that owns the dedup logic — the existing type-based `findFirst` dedup is insufficient for invoice_overdue (you want one reminder *per invoice*, not one per month).

**Frontend:**
- Extend the `Reminder` interface to include the two optional fields.
- When present, `ROUTE_FOR_REMINDER` becomes a function, not a map:

```ts
function routeFor(r: Reminder): string {
  switch (r.reminderType) {
    case 'invoice_overdue':
      return r.referenceId ? `/invoices/${r.referenceId}` : '/invoices';
    case 'payment_successful':
      return '/payments';
    case 'dva_received':
      return '/sales';
    default:
      return '/tax';
  }
}
```

Update the modal's button label to track the destination (`Go to invoice`, `Go to payments`, `Go to sales`, `Go to Tax Reports`) via a small label-map keyed by reminderType.

## 3. Centralized creator helper — `createReminderOnce`

Add to `reminder.service.ts` below `createMarginWarning`. Replaces the ad-hoc `findFirst → create` dance scattered across `generateReminders`, `checkDeadlineReminder`, `generateRemindersForAllBusinesses`.

```ts
interface CreateReminderOnceParams {
  businessId: string;
  reminderType: ReminderType;
  scheduledDate: Date;
  message: string;
  referenceType?: string;
  referenceId?: string;
}

export async function createReminderOnce(p: CreateReminderOnceParams) {
  // Dedup key depends on whether there's a reference:
  //   - With ref: dedup by (businessId, reminderType, referenceType, referenceId)
  //   - Without:  dedup by (businessId, reminderType, scheduledDate)  (existing behaviour)
  const where = p.referenceId
    ? { businessId: p.businessId, reminderType: p.reminderType, referenceType: p.referenceType, referenceId: p.referenceId }
    : { businessId: p.businessId, reminderType: p.reminderType, scheduledDate: p.scheduledDate };

  const existing = await prisma.reminder.findFirst({ where });
  if (existing) return { created: false, reminder: existing };

  const reminder = await prisma.reminder.create({
    data: {
      businessId: p.businessId,
      reminderType: p.reminderType,
      scheduledDate: p.scheduledDate,
      message: p.message,
      referenceType: p.referenceType ?? null,
      referenceId: p.referenceId ?? null,
    },
  });
  return { created: true, reminder };
}
```

Refactor `generateReminders`, `checkDeadlineReminder`, `generateRemindersForAllBusinesses`, and `createMarginWarning` to delegate to this helper. Shrinks the service by ~40 lines and makes dedup correct-by-construction.

## 4. Event-driven reminder creators

### 4a. `payment_successful` — Paystack webhook + manual verify

Two call sites already transition `paymentStatus → 'completed'` + `isLocked: true`:

- `backend/src/services/payment.service.ts:166` — webhook `charge.success`
- `backend/src/services/payment.service.ts:219` — manual verify

Both run inside a `prisma.$transaction`. **Do NOT** fire the reminder inside the tx (same rule as bcrypt/email — side effects must not hold DB locks). Instead, after the tx resolves, call:

```ts
await createReminderOnce({
  businessId: payment.businessId,
  reminderType: 'payment_successful',
  scheduledDate: new Date(),  // fired "now"
  message: `Your tax payment of ${formatNaira(amount)} for ${monthLabel} was confirmed. Download your statement from Payments.`,
  referenceType: 'payment',
  referenceId: payment.id,
});
```

Deduped by `(businessId, type, payment.id)` so replayed webhooks don't spam. Fire-and-forget with a `.catch(err => logger.warn(...))` — a reminder failure must never block the payment confirmation response.

### 4b. `dva_received` — DVA transfer webhook

`dva.service.ts` creates a `SalesTransaction` when Paystack posts a DVA transfer. After the create:

```ts
await createReminderOnce({
  businessId,
  reminderType: 'dva_received',
  scheduledDate: new Date(),
  message: `We auto-captured a sale of ${formatNaira(amount)} from your virtual account.`,
  referenceType: 'sales_transaction',
  referenceId: sale.id,
});
```

Same fire-and-forget contract.

### 4c. `invoice_overdue` — two triggers

**Trigger 1 — send path:** when `sendInvoice` / `sendInvoiceByEmail` / `sendInvoiceByWhatsApp` succeeds (`invoice.service.ts`), if the invoice's `dueDate` is already in the past (unusual but possible if the user backdates), fire immediately.

**Trigger 2 — nightly cron (§5):** for every invoice with `status='sent'` and `dueDate < today` and no existing `invoice_overdue` reminder for that invoice, fire.

Trigger 1 is a safety net; trigger 2 is the mainline. Both use the same helper so duplicates are prevented by the `referenceId` dedup.

Message: `Invoice ${invoiceNumber} to ${customerName} for ${formatNaira(total)} is overdue (was due ${formatDate(dueDate)}).`

## 5. Daily cron — `reminders.cron.ts`

**Install:**

```
cd backend && npm install node-cron @types/node-cron
```

**New file:** `backend/src/jobs/reminders.cron.ts`.

**Registration:** call `registerReminderCron()` from `app.ts` (or `server.ts` — whichever boots after config validation) **only in production OR when `ENABLE_CRON=true`**. Rationale: running the cron during every `tsx watch` restart in dev would spam the logs and re-trigger on every file save. Dev still has the on-demand button on `/reminders` for manual testing.

```ts
import cron from 'node-cron';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { generateRemindersForAllBusinesses, createReminderOnce } from '@/services/reminder.service';
import { config } from '@/config';

export function registerReminderCron() {
  if (config.env !== 'production' && process.env.ENABLE_CRON !== 'true') {
    logger.info('Reminder cron skipped (non-prod, set ENABLE_CRON=true to enable)');
    return;
  }

  // Daily 00:30 local time.
  cron.schedule('30 0 * * *', runDailySweep, { timezone: 'Africa/Lagos' });
  logger.info('Reminder cron registered: 30 0 * * * Africa/Lagos');
}

async function runDailySweep() {
  // Postgres advisory lock — future-proofs against multi-instance.
  const LOCK_KEY = 947362;  // arbitrary int, one per job
  const [{ locked }] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked
  `;
  if (!locked) {
    logger.info('Reminder cron sweep: lock held, skipping');
    return;
  }

  try {
    logger.info('Reminder cron sweep: start');
    const tax = await generateRemindersForAllBusinesses();
    const invoiceCount = await sweepOverdueInvoices();
    logger.info('Reminder cron sweep: done', { tax, invoiceCount });
  } catch (err) {
    logger.error('Reminder cron sweep failed', { err });
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
}

async function sweepOverdueInvoices() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find sent invoices whose dueDate < today. status='overdue' isn't set by the
  // backend until a job flips it — we treat (status='sent' AND dueDate<today)
  // as the source of truth here.
  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'sent',
      dueDate: { lt: today },
    },
    select: {
      id: true,
      businessId: true,
      invoiceNumber: true,
      customerName: true,
      total: true,
      dueDate: true,
    },
  });

  let created = 0;
  for (const inv of invoices) {
    const res = await createReminderOnce({
      businessId: inv.businessId,
      reminderType: 'invoice_overdue',
      scheduledDate: today,
      message: `Invoice ${inv.invoiceNumber} to ${inv.customerName} for ${formatNaira(Number(inv.total))} is overdue (was due ${inv.dueDate.toISOString().slice(0, 10)}).`,
      referenceType: 'invoice',
      referenceId: inv.id,
    });
    if (res.created) created++;
  }

  return created;
}
```

**Where `formatNaira` lives:** there's a backend-side formatter in `backend/src/lib/` (check — if not, inline a 3-line helper in the cron file). Do not import frontend helpers.

## 6. Also: flip `Invoice.status` to `overdue` in the same sweep

Right now `status='overdue'` is only rendered client-side as an `effectiveStatus`. The backend leaves it as `sent`. That's fine for the UI but it means `listInvoices({ status: 'overdue' })` returns nothing server-side. Inside `sweepOverdueInvoices`, after creating the reminder, also `prisma.invoice.update({ where: { id }, data: { status: 'overdue' } })` — keeps the DB consistent with what the UI already shows. Low-risk: only touches `sent` rows with past `dueDate`.

**[Decision call-out]** This crosses a small functional boundary beyond pure "notifications." If you want it kept strictly out of scope, flag — the cron still works without the status flip, just leaves the discrepancy. I'd argue this is the right place because the cron is already walking every overdue invoice; doing both in one loop is cheaper than running a second sweep later.

## 7. Remove the opportunistic `checkDeadlineReminder` call inside `getActiveReminders`

Once the cron runs daily, `getActiveReminders` at `reminder.service.ts:440` no longer needs to create reminders as a side effect of reads. Read endpoints should not mutate. Remove that line. Net effect: the bell's `/active` endpoint becomes pure-read, cron owns all creation.

Exception: if the user opens the bell on day 1 before the cron has ever run (dev, fresh deploy), they'll see nothing. Acceptable — this is a one-time bootstrap issue, and the `/reminders` "Generate Reminders" button still provides a manual path.

## 8. Frontend — minor deep-link updates

Files:
- `frontend/src/types/index.ts` — extend `ReminderType`; add optional `referenceType?: string; referenceId?: string;` to `Reminder`.
- `frontend/src/components/layout/NotificationBell.tsx` — extend `TYPE_COLOR`, replace `ROUTE_FOR_REMINDER` map with `routeFor(reminder)` function (see §2). Change modal's primary button label based on type. Nothing else.
- `frontend/src/pages/Reminders.tsx` — extend `typeBadge` map to cover the three new types (and `margin_warning` while we're here — currently falls through to gray).

## 9. Config

`backend/src/config/index.ts` — add optional `ENABLE_CRON: z.string().optional()` to the schema and surface it on `config.cron = { enabled: process.env.ENABLE_CRON === 'true' }`. Default `false` in dev, `true` in prod (by the branch in `registerReminderCron`).

## 10. Testing

**Unit/integration — backend** (`backend/tests/e2e/api.e2e.test.ts`):
- Existing `GET /reminders/active` test stays.
- Add: payment `verify` path creates a `payment_successful` reminder (mock Paystack, expect reminder count to go from 0 to 1).
- Add: second call to the same verify (idempotent replay) does NOT create a second reminder.
- Add: invoice send with backdated `dueDate` creates an `invoice_overdue` reminder immediately.

**Manual dev flow:**
1. `cd backend && ENABLE_CRON=true npm run dev`
2. Backdate a seed invoice's `dueDate` via Prisma Studio to yesterday, set its `status='sent'`.
3. Trigger the cron manually — easiest: export `runDailySweep` and add a temporary `/api/v1/admin/dev/run-cron` route gated to `config.env !== 'production'`. Hit it.
4. Confirm: invoice row flipped to `status='overdue'`, a new `invoice_overdue` reminder exists with `referenceId = invoice.id`.
5. Open the bell → the reminder appears; clicking it opens the modal; "Go to invoice" routes to `/invoices/<id>`.
6. Force-replay the Paystack verify on a test payment, confirm `payment_successful` reminder fires once only.

## Files touched summary

**Backend — new:**
- `backend/src/jobs/reminders.cron.ts`
- `backend/prisma/migrations/20260422103000_add_reminder_reference/migration.sql`

**Backend — modified:**
- `backend/prisma/schema.prisma` (add `referenceType`, `referenceId`, index)
- `backend/src/services/reminder.service.ts` (expand union, add `createReminderOnce`, refactor existing creators to use it, remove side-effect call from `getActiveReminders`)
- `backend/src/services/payment.service.ts` (fire `payment_successful` after webhook + verify transactions)
- `backend/src/services/dva.service.ts` (fire `dva_received` after sales transaction create)
- `backend/src/services/invoice.service.ts` (fire `invoice_overdue` on send if dueDate < today)
- `backend/src/config/index.ts` (add `ENABLE_CRON`)
- `backend/src/app.ts` or `backend/src/server.ts` (call `registerReminderCron()`)
- `backend/package.json` (add `node-cron`, `@types/node-cron`)
- `backend/tests/e2e/api.e2e.test.ts` (three new tests)

**Frontend — modified:**
- `frontend/src/types/index.ts` (extend `ReminderType`, add `referenceType/referenceId`)
- `frontend/src/components/layout/NotificationBell.tsx` (extend color map; `routeFor()` function; dynamic modal button label)
- `frontend/src/pages/Reminders.tsx` (extend type-badge map)

No changes to the store; no changes to `AppLayout`; no changes to auth.

## Out of scope / deferred

- **Email / SMS / WhatsApp delivery** — stays Phase 5. `isSent` still means "shown in bell."
- **payment_failed reminder** — user deferred.
- **Per-invoice snooze / recurring overdue reminder (every 3 days)** — currently one reminder per invoice; when the user dismisses it, they don't get another. A future pass can add a `snoozedUntil` date.
- **Browser / OS push** — still not scope.
- **Reminder preferences UI** (let the user mute certain types) — nice-to-have, not required for launch.
- **Multi-instance cron safety beyond the advisory lock** — the lock handles it, but a real job runner (BullMQ on the configured-but-unused Redis) is the proper long-term answer.
