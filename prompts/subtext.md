# WallXERP Subscription Plan — Final Specification

> The monetization layer for WallXERP (PayMyTax). Grounded in the existing codebase:
> `PlatformFeeConfig`, `TEAM_MEMBER_CAP`, `modules/wallet`, the Paystack
> payment provider, reminder cron + email dispatch, and the admin `FeeSettingsTab` pattern.

---

## 1. Core Design Principle

**Never block the thing they need for compliance. Always block the thing that makes them
look bigger than they are.**

- Discomfort attaches to moments of **success and growth** (invoice cap hit, branding on a
  customer-facing invoice) — never to moments of **need**.
- A free user who cannot record a sale or download a tax report **leaves**. A free user
  whose invoices look amateurish **pays**.

### Never gated (trust foundation — free at every tier, even after churn/downgrade)

- Viewing all data, all tax reports, all history
- Recording sales & expenses manually (unlimited — the ledger of truth)
- Downloading tax statements + receipts (compliance access, legal safety)
- Paying tax, DVA setup, receiving money
- Data export

---

## 2. Plans

| Feature | Free | Starter ₦5,000/mo (₦50,000/yr) | Business ₦15,000/mo (₦150,000/yr) | Scale ₦35,000/mo (₦350,000/yr) |
|---|---|---|---|---|
| **Team seats** | 3 | 5 | 10 | Unlimited |
| **Businesses** | 1 | 2 | 5 | Unlimited |
| **Invoices / month** | 5 (WallX-branded footer + "Powered by WallX") | Unlimited, own branding | Unlimited, own branding | Unlimited + bulk send |
| **Sales entry** | Unlimited manual · no Excel/CSV import | Unlimited + Excel/CSV import | Unlimited + import | Unlimited + import |
| **AI assistant** | 5 trial queries/mo | 30 queries/mo | 200 queries/mo | Unlimited + custom prompts |
| **Reminders** | Tax deadline only | Tax + invoice overdue | All 19 types | All + priority scheduling |
| **PDF documents** | Tax statement + sales receipt | All 11 generators | All generators | All + white-label |
| **Customer credits (BNPL)** | — | — | ✅ | ✅ + collections notes |
| **Marketplace product listings (3 featured items)** | — | — | ✅ | ✅ + priority placement |
| **DVA setup + receive money** | ✅ | ✅ | ✅ | ✅ |
| **Tax reports + statements** | ✅ (always readable, even after downgrade) | ✅ | ✅ | ✅ |
| **Data export** | ✅ | ✅ | ✅ | ✅ |
| **Trial** | — | 14-day free trial of Business tier on signup → graceful downgrade to free caps | — | — |
| **Billing cycle** | — | Monthly or annual (default shown) | Monthly or annual (default shown) | Annual recommended |

### The free → paid discomfort ladder

1. **Invoicing** — brand watermark + 5/month cap (cap hits while a customer is waiting to pay = live-money moment; the watermark shows in front of *their* clients — nothing converts like looking small)
2. **Import** — no Excel/CSV; typing 50 sales one-by-one in month 3 is when they break out the card
3. **AI** — 5 trial queries/mo; they taste it, they miss it
4. **Reminders** — invoice/credit overdue reminders cost them money when missing

---

## 3. Structural Moves That Force the Decision

### 3.1 14-day free trial of the Business tier

On signup, full Business features for 14 days. At expiry: **graceful downgrade, not an
instant paywall** — everything stays *readable* but they hit the caps naturally. Loss
aversion ("my invoices went back to having a logo on them") converts harder than a feature
they never had.

Machinery already exists:
- Day-12 email: "your trial ends in 2 days" (`createReminderOnce` + Resend dispatch)
- Day-14 downgrade notice (email + bell reminder, `dva`-style)
- Graceful clamp: block *new* invites over the cap, never remove existing members; keep
  invoices readable, block new ones past the cap. **Never delete user data on expiry** —
  this is a tax-compliance tool.

### 3.2 Paywalls live at the attempted action, not as banners

The moment of the blocked `POST` is the moment of the upgrade modal, rendered over *their*
blocked invoice with a one-tap Paystack button:

```json
// Backend chokepoint response
{ "error": { "code": "PLAN_LIMIT_REACHED", "message": "…",
  "details": { "requiredPlan": "starter", "currentUsage": 5, "limit": 5 } } }
```

Same pattern at: invite #4, second business creation, Excel import upload, AI prompt.
Banners get ignored; a blocked action gets clicked.

---

## 4. Deliberately Soft / Do Not Gate

- **Do not** hard-cap sales entries or block DVA usage. A free user collecting ₦500k through
  the DVA is the best future customer and already earns the platform settlement fees.
  Let free users *make money on the platform*, then charge for the tools that manage it.
- **Do not** gate the homepage around pricing. Lead with the tax engine; reveal plans at
  the friction points where the pain is fresh.

---

## 5. Mechanics

### Billing via Paystack (existing `src/lib/payment/`)

- One-time card/transfer charge → authorization → recurring **Plan + Subscription** against
  that authorization.
- Nigerian reality: cards have weak limits; monthly auto-debits fail often → **annual is
  the default price shown**, monthly is the toggle. One charge instead of twelve chances
  to fail.
- Bank-transfer/invoice fallback for renewals (Paystack transfer + webhook infra already
  exists); failed-renewal dunning reuses existing email templates.
- New webhook events: `subscription.create` / `subscription.charge.success` /
  `subscription.not_renew` → `BusinessSubscription.currentPeriodEnd`.

### Data model (follows `PlatformFeeConfig` precedent)

- `PlatformPlanConfig` — plan codes, prices, feature ceilings (admin-editable, like `FeeSettingsTab`)
- `BusinessSubscription` — businessId, plan, status, currentPeriodEnd, paystackSubscriptionCode
- Read path: 60s-cached `getSubscription(businessId)` (like `ownership.ts`)

### Enforcement

- One `assertPlanFeature(businessId, feature)` guard — **not** scattered `if`s
- `TEAM_MEMBER_CAP` (`permission.service.ts:15`) becomes plan-derived — one-file change
- Chokepoints: `team.service.ts` invite/accept (`TEAM_MEMBER_CAP_REACHED` sites),
  `invoice.service.ts` create, `sales-import` commit, `ai.service.ts`, marketplace product /
  credits entry
- Downgrade sweeper cron reuses the node-cron + Postgres advisory-lock pattern

---

## 6. Rollout Order

1. `BusinessSubscription` model + `PlatformPlanConfig` + admin tab (copy `FeeSettingsTab` shape)
2. `TEAM_MEMBER_CAP` made plan-derived — smallest change, immediate value
3. Invoice/mo + AI metering at the chokepoints (`invoice.service.ts`, `ai.service.ts`)
4. Paystack plan subscription + webhook events + `currentPeriodEnd` sweeper
5. 14-day trial flow + downgrade notice emails (reuse reminder + Resend machinery)
6. `/billing` page for the owner + paywall modals at friction points

---

## 7. Pricing Rationale

| Plan | Target | Why it converts |
|---|---|---|
| Free | Funnel | Generous on compliance, uncomfortable on growth; every free user is a DVA revenue source |
| Starter ₦5k | Solo owner drowning in manual entry | Import + AI + branding answer exactly one pain: time |
| Business ₦15k | Default landing | Team, import, AI, credits, marketplace listings — the "real business" tier |
| Scale ₦35k | Multi-business operator | Unlimited businesses, white-label, priority — priced on breadth, not usage |
