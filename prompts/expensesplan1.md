# EXPENSE CATEGORY EXPANSION — Implementation Plan v1.0

**Date:** 2026-10-04  
**Author:** Senior Software Developer (50+ years experience)  
**Target:** PayMyTax by WallX — Nigerian SME Tax Platform  
**Scope:** Expand ExpenseCategory enum with subscription, gift, and additional accounting-standard categories

---

## 🚀 IMPLEMENTATION STATUS (Updated 2026-10-05 01:20 WAT)

**Progress:** 10/10 tasks complete (100%)  
**Status:** ✅ COMPLETE & FULLY VERIFIED

### ✅ Completed Tasks (ARCH-01 to ARCH-10)

| Task | Status | File(s) Modified | Notes |
|---|:---:|---|---|
| **ARCH-01** ✅ | Done | `backend/prisma/schema.prisma` | Updated ExpenseCategory enum with 21 categories (alphabetically sorted) |
| **ARCH-02** ✅ | Done | Migration: `20261005120000_add_expense_categories` | Created and deployed migration with IF NOT EXISTS guards. Migration successfully applied to database. |
| **ARCH-03** ✅ | Done | `backend/src/validators/expense.validator.ts` | Updated EXPENSE_CATEGORIES array (21 items). Added .superRefine() validation to enforce tax_permit non-deductibility per CITA §27(a). |
| **ARCH-04** ✅ | Done | `frontend/src/components/AddExpenseModal.tsx` | Updated CATEGORIES array (20 items, excludes bad_debt). Fixed JSX tag syntax errors and deductibility assignment. |
| **ARCH-05** ✅ | Done | `frontend/src/components/AddExpenseModal.tsx` | Refactored tax deductibility UI into 3-tier system: (1) Always deductible - green badge, (2) Never deductible - red badge for tax_permit, (3) Conditional - amber badge with checkbox for gift/depreciation/interest/other. Added XCircle icon import. |
| **ARCH-06** ✅ | Done | `frontend/src/pages/Expenses.tsx` | Synced CATEGORIES array (21 items). Added CATEGORY_LABELS overrides for underscored names. Populated CATEGORY_COLORS map with 21 distinct Tailwind colors. |
| **ARCH-07** ✅ | Done | `backend/prisma/seed.ts` | Added 6 sample expenses covering new categories: subscription, insurance, professional_fees, bank_charges, tax_permit (isDeductible=false), gift. Updated seed logic to handle isDeductible field. |
| **ARCH-08** ✅ | Done | `AGENTS.md` | Updated ExpenseCategory enum list (21 categories). Added new "Expense Categories (Nigerian CITA Context)" subsection documenting 3-tier tax treatment. |
| **ARCH-09** ✅ | Done | `backend/src/services/expense/expense.service.ts`, `backend/src/config/swagger.ts`, `backend/src/services/pdf/expense-report.pdf.ts` | Service layer hardened with ALWAYS_DEDUCTIBLE_CATEGORIES and NEVER_DEDUCTIBLE_CATEGORIES (tax_permit always non-deductible). Updated Swagger OpenAPI schema and PDF report category labels. |
| **ARCH-10** ✅ | Done | `backend/tests/integration/expense-categories.test.ts` | Created and verified 11/11 passing tests covering validation rules, persistence, and aggregations. Frontend build and backend typecheck 100% clean. |

### 📋 Modified Files Summary
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261005120000_add_expense_categories/migration.sql`
- `backend/src/validators/expense.validator.ts`
- `backend/src/services/expense/expense.service.ts`
- `backend/src/config/swagger.ts`
- `backend/src/services/pdf/expense-report.pdf.ts`
- `frontend/src/components/AddExpenseModal.tsx`
- `frontend/src/pages/Expenses.tsx`
- `backend/prisma/seed.ts`
- `AGENTS.md`
- `backend/tests/integration/expense-categories.test.ts`

### 🛡️ Testing & Verification Status
- ✅ Prisma schema formatted & valid
- ✅ Database migration deployed successfully
- ✅ Backend type check: `npx tsc --noEmit` passed with 0 errors
- ✅ Frontend build: `npm run build` (`tsc -b && vite build`) passed with 0 errors
- ✅ Integration tests: `tests/integration/expense-categories.test.ts` (11/11 passed)
- ✅ Regression tests: `tests/integration/invite-name.test.ts` (10/10 passed)

---

## EXECUTIVE SUMMARY

**Current State:**  
The ExpenseCategory enum in `backend/prisma/schema.prisma` currently supports 9 categories: `rent`, `inventory`, `salary`, `utility`, `fuel`, `logistics`, `marketing`, `bad_debt`, `other`. The frontend (`AddExpenseModal.tsx`) only exposes 8 (excludes `bad_debt` which is system-generated for credit write-offs per CITA §25).

**Problem:**  
Missing essential expense categories that Nigerian SMEs commonly incur: subscription services (software, licenses), gifts/donations, insurance premiums, professional fees, repairs/maintenance, bank charges, taxes/permits, depreciation, and interest expenses. These are all legitimate business expenses with specific tax treatment under Nigerian CITA/PITA/VAT Act.

**Solution:**  
Add 11 new expense categories to match standard Nigerian business accounting practices. Each new category has clear tax-deductibility rules and educational hints to guide SME owners.

**Impact:**  
- ✅ Better expense classification → more accurate tax calculations
- ✅ Reduces misuse of "other" category → cleaner audit trails
- ✅ FIRS compliance — proper expense categorization per CITA schedules
- ✅ Educational — teaches SME owners what's deductible vs. non-deductible
- ⚠️ Migration required — existing DB data unaffected (enum is additive)
- ⚠️ Frontend dropdown gets longer — mitigated by alphabetical sorting + optional search

**Confidence:** HIGH — all proposed categories are standard in Nigerian accounting (CITA, IFRS for SMEs)

---

## PHASE 1: UNDERSTAND THE PRODUCT (CONFIRMED)

### What PayMyTax Does (from AGENTS.md)
- Tax calculation for Nigerian SMEs: `Tax = 7.5% × (Sales − Expenses)`
- Expense tracking with category-based breakdown
- Monthly tax reports submitted to FIRS
- Audit trail for compliance

### Current Expense Flow (CONFIRMED)
1. User opens `AddExpenseModal` → selects category → enters amount, date, description
2. Backend validates via `expense.validator.ts` (Zod schema checks against hardcoded enum)
3. Prisma writes to `expenses` table with `category` enum column
4. Tax calculation in `tax.service.ts` aggregates deductible expenses (`isDeductible=true`)
5. Monthly summary and daily summary show category breakdown with color-coded pills

### Tax Deductibility Logic (CONFIRMED from `AddExpenseModal.tsx:4-14`)
- **Core categories** (rent, inventory, salary, utility, fuel, logistics, marketing): Always deductible, read-only badge
- **bad_debt**: System-generated, always deductible (CITA §25)
- **other**: User chooses via checkbox + must provide `categoryDetail` text

### Known Constraints (CONFIRMED)
1. Expenses in finalized months are locked (`assertMonthNotLocked` gate)
2. System-generated expenses (`linkedCreditId != null`) are immutable — no edit/delete
3. No expense deletion — business rule per `Expenses.tsx:162` comments
4. Category colors hardcoded in `CATEGORY_COLORS` map (`Expenses.tsx:91-101`)
5. Category labels support custom formatting via `CATEGORY_LABELS` override (`Expenses.tsx:29-31`)

---

## PHASE 2: CODEBASE RECONNAISSANCE (VERIFIED)

### Files Requiring Changes (CONFIRMED EXIST)
1. **Backend Schema:**
   - `backend/prisma/schema.prisma` (line 1045-1055) — `ExpenseCategory` enum
   - Prisma migration file (new) — must be generated after schema change

2. **Backend Validator:**
   - `backend/src/validators/expense.validator.ts` (line 4-6) — `EXPENSE_CATEGORIES` const array

3. **Frontend Modal:**
   - `frontend/src/components/AddExpenseModal.tsx` (lines 23-30, 62-77, 208-214) — `CATEGORIES` const + `CATEGORY_TAX_HINTS` map

4. **Frontend Page:**
   - `frontend/src/pages/Expenses.tsx` (lines 28-36, 91-101, 195) — `CATEGORIES` const + `CATEGORY_COLORS` map + `CATEGORY_LABELS` map

### Dependencies (CONFIRMED)
- Prisma Client regeneration triggers after migration
- No API route changes needed (category is just a string enum value in JSON)
- No test file changes unless we add category-specific test cases (optional)

### Current Category Count: 9 (backend schema) / 8 (frontend exposed)
### Proposed Category Count: 20 (9 existing + 11 new)

---

## PHASE 3: PROPOSED NEW CATEGORIES

### 🟢 Tier 1: Always Tax-Deductible (CITA §24-27)

| Category | Nigerian Tax Law | Typical Use Cases | Frontend Hint |
|---|---|---|---|
| **subscription** | Deductible under CITA §24(a) — necessary business expense | Software (Office 365, Zoom, QuickBooks), SaaS tools, membership fees, industry associations | Software subscriptions, SaaS licenses, professional memberships — fully deductible when used for business purposes. |
| **insurance** | Deductible under CITA §24(c) — insurance premiums on business assets | Business insurance, goods-in-transit insurance, fire/theft insurance, liability insurance | Business insurance, goods-in-transit cover, fire/theft protection — premiums are fully deductible as operating expenses. |
| **professional_fees** | Deductible under CITA §24(a) — necessary professional services | Accounting, legal, consulting, audit fees, tax advisory | Legal, accounting, consulting, audit fees — professional services for business operations are fully deductible. |
| **repairs_maintenance** | Deductible under CITA §24(b) — repairs/maintenance (not capital improvements) | Equipment repairs, building maintenance, vehicle servicing (not upgrades) | Equipment repairs, building maintenance, vehicle servicing — deductible when they maintain existing assets (not upgrades). |
| **bank_charges** | Deductible under CITA §24(a) — necessary business expense | Transaction fees, account maintenance, transfer charges, card processing fees, loan interest | Bank charges, transaction fees, account maintenance, card processing — fully deductible as cost of doing business. |
| **communication** | Deductible under CITA §24(a) — necessary operating cost | Business phone lines, internet (already in utility but SMEs often split), courier, postal | Business phone, internet bills, courier services, postal fees — communication costs are fully deductible. |
| **office_supplies** | Deductible under CITA §24(a) — necessary supplies | Stationery, printer paper, toner, cleaning supplies, small tools | Stationery, printer supplies, toner, cleaning materials, small tools — fully deductible as operating expenses. |
| **travel** | Deductible under CITA §24(d) — business travel | Airfare, hotel, taxi, per diem (within reasonable limits) | Business travel: airfare, hotel, transport, per diem — fully deductible when for business purposes (not personal trips). |

### 🟡 Tier 2: Conditionally Deductible (Requires User Choice)

| Category | Nigerian Tax Law | Typical Use Cases | Frontend Treatment |
|---|---|---|---|
| **gift** | **Partially deductible** under CITA §25(e) — gifts >₦500K/year OR to non-employees generally disallowed; small promotional gifts OK | Corporate gifts to customers/partners, promotional items, branded giveaways | **User checkbox** — "Small promotional gifts to customers (≤₦500K/year) are deductible. Personal gifts, lavish gifts, or gifts to directors/owners are NOT deductible." |
| **depreciation** | **Special rules** under CITA §28-29 — capital allowances, not expensed directly; annual % of asset value | Annual depreciation of machinery, vehicles, buildings | **User checkbox** — "Capital allowances per CITA Schedule 2. Only claim depreciation if you're using capital allowance method (not already claimed as full expense at purchase)." |
| **interest** | **Deductible** under CITA §24(f) but subject to thin-capitalization rules (debt-to-equity ratio limits) | Loan interest, overdraft interest, invoice financing charges | **User checkbox** — "Interest on business loans is deductible. Personal loan interest or loans unrelated to business are NOT deductible." |

### ❌ Tier 3: Never Deductible (But Must Be Tracked)

| Category | Nigerian Tax Law | Typical Use Cases | Frontend Treatment |
|---|---|---|---|
| **tax_permit** | **Non-deductible** under CITA §27(a) — taxes paid are not deductible expenses (except where specifically allowed like VAT input) | Business registration fees, CAC fees, FIRS penalties, local government levies | **Read-only badge: Non-Deductible** — "Government taxes, fines, penalties, and regulatory fees are NOT tax-deductible per CITA §27." |

### 🔧 System Category (Keep Existing)
- **bad_debt**: Already exists, system-generated only, always deductible (CITA §25)

---

## PHASE 4: CATEGORY TAX-DEDUCTIBILITY MATRIX

| Category | Default Deductible? | User Can Change? | Justification |
|---|:---:|:---:|---|
| rent | ✅ Yes | ❌ No | CITA §24(b) — business premises |
| inventory | ✅ Yes | ❌ No | CITA §23 — COGS |
| salary | ✅ Yes | ❌ No | CITA §24(a) — employee compensation |
| utility | ✅ Yes | ❌ No | CITA §24(a) — necessary operating cost |
| fuel | ✅ Yes | ❌ No | CITA §24(d) — business transport |
| logistics | ✅ Yes | ❌ No | CITA §24(d) — delivery/freight |
| marketing | ✅ Yes | ❌ No | CITA §24(a) — business development |
| bad_debt | ✅ Yes | ❌ No | CITA §25 — trade debt write-offs (system-only) |
| **subscription** | ✅ Yes | ❌ No | CITA §24(a) — necessary SaaS/software |
| **insurance** | ✅ Yes | ❌ No | CITA §24(c) — business asset insurance |
| **professional_fees** | ✅ Yes | ❌ No | CITA §24(a) — accounting/legal services |
| **repairs_maintenance** | ✅ Yes | ❌ No | CITA §24(b) — asset maintenance (not capital) |
| **bank_charges** | ✅ Yes | ❌ No | CITA §24(a) — transactional costs |
| **communication** | ✅ Yes | ❌ No | CITA §24(a) — phone/internet/courier |
| **office_supplies** | ✅ Yes | ❌ No | CITA §24(a) — stationery/supplies |
| **travel** | ✅ Yes | ❌ No | CITA §24(d) — business travel |
| **gift** | ⚠️ Conditional | ✅ Yes | CITA §25(e) — depends on amount/recipient |
| **depreciation** | ⚠️ Conditional | ✅ Yes | CITA §28-29 — capital allowances only |
| **interest** | ⚠️ Conditional | ✅ Yes | CITA §24(f) — subject to thin-cap rules |
| **tax_permit** | ❌ No | ❌ No | CITA §27(a) — taxes not deductible |
| other | ⚠️ Conditional | ✅ Yes | Catch-all for unclassified |

---

## PHASE 5: UI/UX CONSIDERATIONS

### Problem: Dropdown Overflow
20 categories in a native `<select>` dropdown is usable but not ideal on mobile.

### Solutions (Ranked by Implementation Effort)
1. **Alphabetical Sort** — easiest, immediate improvement (current order is arbitrary)
2. **Group by Tier** — `<optgroup>` tags: Operating Expenses / Special Categories / System
3. **Searchable Combobox** — replace `<select>` with a library like `downshift` or `@headlessui/react` Combobox (Medium effort)
4. **Categorize in UI** — accordion-style category picker (High effort, overkill for v1)

**Recommended:** Start with (1) alphabetical sort + (2) optgroups. Defer (3) until user feedback demands it.

### Category Color Assignment
Current: hardcoded map in `Expenses.tsx:91-101`. New categories need colors.

**Color Palette Strategy:**
- Use Tailwind color scale (consistent with existing)
- Avoid duplicates where possible
- Group similar categories by hue (e.g., financial = blue family, operational = green family)

| Category | Color | Rationale |
|---|---|---|
| bank_charges | `bg-blue-600` | Financial/money-related |
| communication | `bg-sky-500` | Tech/connectivity |
| depreciation | `bg-slate-500` | System/calculated |
| gift | `bg-fuchsia-500` | Special/discretionary |
| insurance | `bg-indigo-500` | Protection/compliance |
| interest | `bg-blue-700` | Financial/debt |
| office_supplies | `bg-teal-500` | Operational |
| professional_fees | `bg-violet-500` | External services |
| repairs_maintenance | `bg-yellow-600` | Asset care |
| subscription | `bg-cyan-600` | Tech/SaaS |
| tax_permit | `bg-red-600` | Government/non-deductible |
| travel | `bg-lime-600` | Movement/ops |

---

## PHASE 6: IMPLEMENTATION CHECKLIST (Execution-Ready)

### ✅ NOW Tier — Core Schema & Validation Changes

#### **ARCH-01: Update Prisma ExpenseCategory Enum**
- **Depends on:** None
- **Files touched:**
  - `backend/prisma/schema.prisma` (line 1045-1055)
- **What to do:**
  1. Open `backend/prisma/schema.prisma`
  2. Locate the `ExpenseCategory` enum (around line 1045)
  3. Add the following values in alphabetical order (preserving existing ones):
     ```prisma
     enum ExpenseCategory {
       bad_debt
       bank_charges
       communication
       depreciation
       fuel
       gift
       insurance
       interest
       inventory
       logistics
       marketing
       office_supplies
       other
       professional_fees
       rent
       repairs_maintenance
       salary
       subscription
       tax_permit
       travel
       utility
     }
     ```
  4. Save the file.
- **Acceptance criteria:**
  - Enum has 20 values total (9 existing + 11 new)
  - Values are in alphabetical order (for maintainability)
  - No duplicate values
  - File syntax is valid Prisma schema
- **Verification:**
  ```bash
  cd backend
  npx prisma format
  # Should succeed without errors
  npx prisma validate
  # Should output: "The schema is valid."
  ```
- **Rollback:**
  ```bash
  git checkout backend/prisma/schema.prisma
  ```
- **Effort estimate:** S (5 minutes)
- **Risk if skipped:** Backend validator and database will reject new categories

---

#### **ARCH-02: Generate Prisma Migration**
- **Depends on:** ARCH-01
- **Files touched:**
  - `backend/prisma/migrations/YYYYMMDDHHMMSS_add_expense_categories/migration.sql` (new file, auto-generated)
- **What to do:**
  1. Ensure Postgres DB is running and `DATABASE_URL` is set
  2. Run:
     ```bash
     cd backend
     npm run prisma:migrate -- --name add_expense_categories
     ```
  3. Verify the generated migration file:
     - Should contain `ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'subscription';` (repeated for each new value)
     - Should NOT contain DROP or DELETE statements
  4. Commit the migration file to git
- **Acceptance criteria:**
  - Migration file exists in `backend/prisma/migrations/`
  - Migration adds 11 new enum values
  - Migration does NOT alter existing enum values or data
  - Migration is idempotent (uses `IF NOT EXISTS`)
- **Verification:**
  ```bash
  cd backend
  npm run prisma:migrate:deploy
  # Should succeed
  psql $DATABASE_URL -c "SELECT unnest(enum_range(NULL::\"ExpenseCategory\"));"
  # Should list all 20 categories
  ```
- **Rollback:**
  - If migration hasn't been deployed to production:
    ```bash
    rm -rf backend/prisma/migrations/*add_expense_categories*
    git checkout backend/prisma/schema.prisma
    ```
  - If already deployed: Create a reverse migration (risky — enum values can't be dropped if referenced in data)
- **Effort estimate:** S (10 minutes including verification)
- **Risk if skipped:** Database schema out of sync with code; runtime errors on new category writes

---

#### **ARCH-03: Update Backend Validator**
- **Depends on:** ARCH-01
- **Files touched:**
  - `backend/src/validators/expense.validator.ts` (lines 4-6)
- **What to do:**
  1. Open `backend/src/validators/expense.validator.ts`
  2. Replace the `EXPENSE_CATEGORIES` const array (lines 4-6) with:
     ```typescript
     const EXPENSE_CATEGORIES = [
       'bad_debt',
       'bank_charges',
       'communication',
       'depreciation',
       'fuel',
       'gift',
       'insurance',
       'interest',
       'inventory',
       'logistics',
       'marketing',
       'office_supplies',
       'other',
       'professional_fees',
       'rent',
       'repairs_maintenance',
       'salary',
       'subscription',
       'tax_permit',
       'travel',
       'utility',
     ] as const;
     ```
  3. Verify TypeScript type inference still works:
     - Hover over `z.enum(EXPENSE_CATEGORIES)` in your IDE
     - Should show union type with all 20 values
- **Acceptance criteria:**
  - Array contains 20 values, alphabetically sorted
  - Matches the Prisma enum exactly (case-sensitive)
  - TypeScript compiler shows no errors in `expense.validator.ts`
- **Verification:**
  ```bash
  cd backend
  npm run build
  # Should succeed without TypeScript errors
  ```
- **Rollback:**
  ```bash
  git checkout backend/src/validators/expense.validator.ts
  ```
- **Effort estimate:** S (5 minutes)
- **Risk if skipped:** API will reject new category values with 400 validation errors

---

#### **ARCH-04: Update Frontend Modal Categories Array**
- **Depends on:** ARCH-03 (backend must accept new values before frontend sends them)
- **Files touched:**
  - `frontend/src/components/AddExpenseModal.tsx` (lines 23-30)
- **What to do:**
  1. Open `frontend/src/components/AddExpenseModal.tsx`
  2. Replace the `CATEGORIES` const (lines 23-30) with:
     ```typescript
     const CATEGORIES = [
       'bank_charges',
       'communication',
       'depreciation',
       'fuel',
       'gift',
       'insurance',
       'interest',
       'inventory',
       'logistics',
       'marketing',
       'office_supplies',
       'other',
       'professional_fees',
       'rent',
       'repairs_maintenance',
       'salary',
       'subscription',
       'tax_permit',
       'travel',
       'utility',
     ] as const;
     ```
     **Note:** Excludes `bad_debt` (system-only, not user-creatable)
  3. Save the file
- **Acceptance criteria:**
  - Array contains 19 values (20 minus `bad_debt`)
  - Alphabetically sorted
  - TypeScript shows no type errors
- **Verification:**
  ```bash
  cd frontend
  npm run build
  # Should succeed
  ```
  - Manual: Open modal in browser, verify dropdown shows 19 categories in alphabetical order
- **Rollback:**
  ```bash
  git checkout frontend/src/components/AddExpenseModal.tsx
  ```
- **Effort estimate:** S (5 minutes)
- **Risk if skipped:** Users cannot select new categories in the UI

---

#### **ARCH-05: Add Category Tax Hints (Frontend Modal)**
- **Depends on:** ARCH-04
- **Files touched:**
  - `frontend/src/components/AddExpenseModal.tsx` (lines 62-77)
- **What to do:**
  1. Open `frontend/src/components/AddExpenseModal.tsx`
  2. Locate the `CATEGORY_TAX_HINTS` object (starts around line 62)
  3. Add these entries (preserve existing ones):
     ```typescript
     const CATEGORY_TAX_HINTS: Record<string, string> = {
       // Existing hints (rent, inventory, salary, utility, fuel, logistics, marketing) — keep as-is
       rent: 'Shop rent, warehouse lease, office space — business premises costs are fully tax-deductible.',
       inventory: 'Raw materials, goods for resale, stock purchases — cost of goods sold reduces your taxable profit.',
       salary: 'Staff wages, employee compensation, casual workers — payroll expenses are fully tax-deductible.',
       utility: 'Electricity (NEPA/EKEDC), water, business internet, phone bills — operating utilities are fully deductible.',
       fuel: 'Generator diesel, delivery vehicle petrol, business transport fuel — fully deductible as operating costs.',
       logistics: 'Shipping, freight, dispatch riders, haulage, courier — delivery and transport costs are fully deductible.',
       marketing: 'Advertising, social media promotion, signage, flyers, branding — business development costs are deductible.',
       
       // NEW HINTS
       subscription: 'Software subscriptions, SaaS licenses, professional memberships — fully deductible when used for business purposes.',
       insurance: 'Business insurance, goods-in-transit cover, fire/theft protection — premiums are fully deductible as operating expenses.',
       professional_fees: 'Legal, accounting, consulting, audit fees — professional services for business operations are fully deductible.',
       repairs_maintenance: 'Equipment repairs, building maintenance, vehicle servicing — deductible when they maintain existing assets (not upgrades).',
       bank_charges: 'Bank charges, transaction fees, account maintenance, card processing — fully deductible as cost of doing business.',
       communication: 'Business phone, internet bills, courier services, postal fees — communication costs are fully deductible.',
       office_supplies: 'Stationery, printer supplies, toner, cleaning materials, small tools — fully deductible as operating expenses.',
       travel: 'Business travel: airfare, hotel, transport, per diem — fully deductible when for business purposes (not personal trips).',
     };
     ```
  4. The 4 special categories (`gift`, `depreciation`, `interest`, `tax_permit`) will NOT appear in this map — they get custom UI treatment in ARCH-06
- **Acceptance criteria:**
  - Hints exist for all 15 "always deductible" categories
  - Each hint is under 200 characters (fits in the green badge box)
  - Hints reference Nigerian tax context (NEPA, FIRS-friendly language)
- **Verification:**
  - Manual: Open modal, cycle through categories, verify hint appears in the green "Tax Deductible" badge
  - Categories: subscription, insurance, professional_fees, etc. show their specific hint
- **Rollback:**
  ```bash
  git checkout frontend/src/components/AddExpenseModal.tsx
  ```
- **Effort estimate:** S (10 minutes)
- **Risk if skipped:** Users won't know the new categories are deductible (confusion, support burden)

---

#### **ARCH-06: Add Conditional Deductibility UI (gift, depreciation, interest, tax_permit)**
- **Depends on:** ARCH-05
- **Files touched:**
  - `frontend/src/components/AddExpenseModal.tsx` (lines 208-260, insert new logic)
- **What to do:**
  1. Locate the "Tax Deductibility Section" (around line 208)
  2. Current logic splits `isCoreCategory` (auto-deductible badge) vs. `other` (checkbox)
  3. Refactor to 3 branches:
     ```typescript
     const alwaysDeductible = ['rent', 'inventory', 'salary', 'utility', 'fuel', 'logistics', 'marketing', 'subscription', 'insurance', 'professional_fees', 'repairs_maintenance', 'bank_charges', 'communication', 'office_supplies', 'travel'];
     const conditionalDeductible = ['gift', 'depreciation', 'interest', 'other'];
     const neverDeductible = ['tax_permit'];
     
     const isAlwaysDeductible = alwaysDeductible.includes(category);
     const isConditional = conditionalDeductible.includes(category);
     const isNeverDeductible = neverDeductible.includes(category);
     ```
  4. Replace the existing `{isCoreCategory ? ... : ...}` block (lines 208-243) with:
     ```tsx
     {isAlwaysDeductible ? (
       // Green badge (existing code, no changes)
       <div className='rounded-none border border-emerald-200 bg-emerald-50/60 p-3 sm:col-span-2'>
         <div className='flex items-center gap-2'>
           <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
           <span className='text-xs font-semibold text-emerald-800'>
             Tax Deductible — NRS Allowable
           </span>
         </div>
         <p className='mt-1 text-[11px] text-emerald-700 leading-relaxed'>
           {CATEGORY_TAX_HINTS[category]}
         </p>
       </div>
     ) : isNeverDeductible ? (
       // Red badge (new) — non-deductible, read-only, no checkbox
       <div className='rounded-none border border-red-200 bg-red-50/60 p-3 sm:col-span-2'>
         <div className='flex items-center gap-2'>
           <XCircle className='h-4 w-4 text-red-600 shrink-0' />
           <span className='text-xs font-semibold text-red-800'>
             Non-Deductible — CITA §27(a)
           </span>
         </div>
         <p className='mt-1 text-[11px] text-red-700 leading-relaxed'>
           {category === 'tax_permit' &&
             'Government taxes, fines, penalties, and regulatory fees are NOT tax-deductible per CITA §27.'}
         </p>
       </div>
     ) : isConditional ? (
       // Amber badge (new + existing 'other') — checkbox + category-specific guidance
       <div className='rounded-none border border-amber-200 bg-amber-50 p-3 sm:col-span-2 space-y-2'>
         <div className='flex items-start gap-3'>
           <input
             id='isDeductible'
             type='checkbox'
             checked={isDeductible}
             onChange={(e) => setIsDeductible(e.target.checked)}
             className='mt-0.5 h-4 w-4 rounded-none border-gray-300 text-primary-600 focus:ring-primary-500'
           />
           <div className='flex-1'>
             <label
               htmlFor='isDeductible'
               className='block cursor-pointer text-xs font-semibold text-gray-900'
             >
               Tax deductible
             </label>
             <p className='mt-0.5 text-[11px] text-gray-700 leading-relaxed'>
               {category === 'gift' && (
                 isDeductible
                   ? 'Small promotional gifts to customers (≤₦500K/year total) are deductible under CITA. Personal gifts, lavish gifts, or gifts to directors/owners are NOT deductible.'
                   : 'Mark non-deductible if: gift exceeds ₦500K total per year, or is a personal/lavish gift, or to a director/owner/related party.'
               )}
               {category === 'depreciation' && (
                 isDeductible
                   ? 'Capital allowances per CITA §28-29 Schedule 2. Only claim depreciation if you are using the capital allowance method for this asset (not if you already expensed the full purchase cost).'
                   : 'Mark non-deductible if you already claimed the full asset cost as an expense in a prior period, or if the asset is personal/non-business.'
               )}
               {category === 'interest' && (
                 isDeductible
                   ? 'Interest on business loans is deductible under CITA §24(f), subject to thin-capitalization rules (debt-to-equity ratio limits). Business loans only — not personal loans.'
                   : 'Mark non-deductible if: the loan was for personal use, or your business exceeds thin-capitalization limits (debt > 3× equity for non-financial businesses).'
               )}
               {category === 'other' && (
                 isDeductible
                   ? 'This expense will reduce your taxable profit. Appropriate for legitimate business costs like bank charges, software subscriptions, repairs, professional fees.'
                   : 'This expense will NOT reduce your taxable profit. Appropriate for government fines & penalties, personal/domestic expenses, owner drawings, or non-approved donations.'
               )}
             </p>
           </div>
         </div>
       </div>
     ) : null}
     ```
  5. Import `XCircle` icon at the top:
     ```typescript
     import { PieChart, CheckCircle2, XCircle } from 'lucide-react';
     ```
- **Acceptance criteria:**
  - `tax_permit` shows red non-deductible badge, no checkbox, `isDeductible` forced to `false` on submit
  - `gift`, `depreciation`, `interest`, `other` show amber badge with checkbox + category-specific guidance text that changes based on checkbox state
  - All 15 "always deductible" categories show green badge (existing behavior preserved)
  - Switching between categories updates the UI correctly
- **Verification:**
  - Manual test matrix:
    1. Select `tax_permit` → red badge, no checkbox visible, try to submit → `isDeductible` should be `false` in network payload
    2. Select `gift` → amber badge, checkbox defaulted ON, guidance text mentions ₦500K limit
    3. Uncheck the `gift` checkbox → guidance text updates to explain when to mark non-deductible
    4. Select `subscription` → green badge, no checkbox (always deductible)
    5. Create an expense with each new category → verify it saves correctly and appears in the expenses list
- **Rollback:**
  ```bash
  git checkout frontend/src/components/AddExpenseModal.tsx
  ```
- **Effort estimate:** M (30-45 minutes including testing)
- **Risk if skipped:** Users can't properly classify conditional expenses; incorrect tax calculations

---

#### **ARCH-07: Enforce tax_permit Non-Deductibility in Backend Validator**
- **Depends on:** ARCH-03
- **Files touched:**
  - `backend/src/validators/expense.validator.ts` (insert after line 17)
- **What to do:**
  1. Open `backend/src/validators/expense.validator.ts`
  2. Locate the `createExpenseSchema` (starts line 8)
  3. After the schema definition (before `export`), add a `.superRefine()` validator:
     ```typescript
     export const createExpenseSchema = z.object({
       category: z.enum(EXPENSE_CATEGORIES),
       description: z.string().min(1, 'Description is required').max(500).trim(),
       amount: z.number().positive('Amount must be greater than 0'),
       quantity: z.number().positive('Quantity must be greater than 0').max(100_000).optional(),
       expenseDate: z.coerce.date(),
       receiptUrl: z.string().url('Must be a valid URL').max(1000).trim().optional(),
       isDeductible: z.boolean().optional().default(true),
     }).superRefine((data, ctx) => {
       // Enforce non-deductibility for government taxes/permits (CITA §27)
       if (data.category === 'tax_permit' && data.isDeductible === true) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['isDeductible'],
           message: 'Government taxes and permits are not tax-deductible per CITA §27(a). Set isDeductible to false.',
         });
       }
       
       // Require categoryDetail for 'other' category (existing rule — move here for consistency)
       if (data.category === 'other' && !data.categoryDetail?.trim()) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['categoryDetail'],
           message: 'categoryDetail is required when category is "other"',
         });
       }
     });
     ```
  4. Apply the same `.superRefine()` to `updateExpenseSchema` (since it's a partial update, only validate if the field is present):
     ```typescript
     export const updateExpenseSchema = z.object({
       category: z.enum(EXPENSE_CATEGORIES).optional(),
       // ... other fields ...
       isDeductible: z.boolean().optional(),
     }).superRefine((data, ctx) => {
       if (data.category === 'tax_permit' && data.isDeductible === true) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['isDeductible'],
           message: 'Government taxes and permits are not tax-deductible per CITA §27(a).',
         });
       }
     });
     ```
- **Acceptance criteria:**
  - API rejects `POST /expenses` with `category=tax_permit` and `isDeductible=true` → 400 validation error
  - API accepts `category=tax_permit` with `isDeductible=false` → 201 success
  - Other categories unaffected
- **Verification:**
  ```bash
  cd backend
  npm run test:e2e -- --testNamePattern="expense creation"
  # Should pass (assuming test exists; if not, manual cURL test below)
  
  # Manual cURL test:
  curl -X POST http://localhost:3000/api/v1/businesses/{bizId}/expenses \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json" \
    -d '{
      "category": "tax_permit",
      "description": "CAC registration fee",
      "amount": 50000,
      "expenseDate": "2026-10-01",
      "isDeductible": true
    }'
  # Expected: 400 error with message about CITA §27
  
  # Now with isDeductible=false:
  curl -X POST http://localhost:3000/api/v1/businesses/{bizId}/expenses \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json" \
    -d '{
      "category": "tax_permit",
      "description": "CAC registration fee",
      "amount": 50000,
      "expenseDate": "2026-10-01",
      "isDeductible": false
    }'
  # Expected: 201 success
  ```
- **Rollback:**
  ```bash
  git checkout backend/src/validators/expense.validator.ts
  ```
- **Effort estimate:** S (15 minutes including test)
- **Risk if skipped:** Users could mark `tax_permit` as deductible, causing incorrect tax calculations

---

#### **ARCH-08: Update Frontend Expenses Page Category Lists**
- **Depends on:** ARCH-04
- **Files touched:**
  - `frontend/src/pages/Expenses.tsx` (lines 28-36)
- **What to do:**
  1. Open `frontend/src/pages/Expenses.tsx`
  2. Replace the `CATEGORIES` const (line 28-36) with the full 19-item list (same as modal, excluding `bad_debt`):
     ```typescript
     const CATEGORIES = [
       'bank_charges',
       'communication',
       'depreciation',
       'fuel',
       'gift',
       'insurance',
       'interest',
       'inventory',
       'logistics',
       'marketing',
       'office_supplies',
       'other',
       'professional_fees',
       'rent',
       'repairs_maintenance',
       'salary',
       'subscription',
       'tax_permit',
       'travel',
       'utility',
     ] as const;
     ```
  3. Update `CATEGORY_LABELS` (line 40) to handle underscored category names:
     ```typescript
     const CATEGORY_LABELS: Record<string, string> = {
       bad_debt: 'Bad Debt',
       bank_charges: 'Bank Charges',
       office_supplies: 'Office Supplies',
       professional_fees: 'Professional Fees',
       repairs_maintenance: 'Repairs & Maintenance',
       tax_permit: 'Tax/Permit',
     };
     ```
  4. The `formatCategoryLabel()` helper will handle the rest (capitalizes first letter + replaces underscores with spaces for any category not in the override map)
- **Acceptance criteria:**
  - Filter dropdown shows 19 categories + "All Categories" option
  - Category labels display correctly (e.g., "Bank Charges" not "Bank_charges")
  - Existing expenses with new categories render correctly in the table
- **Verification:**
  - Manual: Open Expenses page → click Filters → open Category dropdown → verify all 19 categories listed alphabetically
  - Create an expense with category `bank_charges` → verify it appears in the table with label "Bank Charges"
- **Rollback:**
  ```bash
  git checkout frontend/src/pages/Expenses.tsx
  ```
- **Effort estimate:** S (10 minutes)
- **Risk if skipped:** Users can't filter by new categories; labels display ugly

---

#### **ARCH-09: Add Category Colors (Frontend Expenses Page)**
- **Depends on:** ARCH-08
- **Files touched:**
  - `frontend/src/pages/Expenses.tsx` (lines 91-101)
- **What to do:**
  1. Open `frontend/src/pages/Expenses.tsx`
  2. Replace the `CATEGORY_COLORS` map (line 91-101) with the full 20-category map:
     ```typescript
     const CATEGORY_COLORS: Record<string, string> = {
       bad_debt: 'bg-rose-500',
       bank_charges: 'bg-blue-600',
       communication: 'bg-sky-500',
       depreciation: 'bg-slate-500',
       fuel: 'bg-orange-500',
       gift: 'bg-fuchsia-500',
       insurance: 'bg-indigo-500',
       interest: 'bg-blue-700',
       inventory: 'bg-emerald-500',
       logistics: 'bg-cyan-500',
       marketing: 'bg-pink-500',
       office_supplies: 'bg-teal-500',
       other: 'bg-gray-400',
       professional_fees: 'bg-violet-500',
       rent: 'bg-blue-500',
       repairs_maintenance: 'bg-yellow-600',
       salary: 'bg-purple-500',
       subscription: 'bg-cyan-600',
       tax_permit: 'bg-red-600',
       travel: 'bg-lime-600',
       utility: 'bg-amber-500',
     };
     ```
- **Acceptance criteria:**
  - All 20 categories have a color assigned
  - Colors are distinct (no exact duplicates)
  - Tailwind classes are valid (no typos like `bg-bleu-500`)
- **Verification:**
  - Manual: Open Expenses page → Monthly tab → create expenses in each category → verify the stacked bar chart shows distinct colors
  - Verify the legend dots match the bar colors
  - Verify the daily summary category boxes show the correct color
- **Rollback:**
  ```bash
  git checkout frontend/src/pages/Expenses.tsx
  ```
- **Effort estimate:** S (10 minutes)
- **Risk if skipped:** New categories show as gray or missing in charts (visual confusion)

---

### ✅ NEXT Tier — Polish & Documentation

#### **ARCH-10: Add Migration Seed Data (Test New Categories)**
- **Depends on:** ARCH-02 (migration deployed)
- **Files touched:**
  - `backend/prisma/seed.ts` (insert around existing expense seeding block)
- **What to do:**
  1. Open `backend/prisma/seed.ts`
  2. Locate the existing expense creation block (search for `expenseDate`)
  3. Add sample expenses with new categories:
     ```typescript
     // Existing expenses (keep as-is)
     // ...
     
     // NEW CATEGORIES — test data
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'subscription',
         description: 'Microsoft Office 365 Business Standard',
         amount: new Prisma.Decimal(15000),
         expenseDate: new Date('2026-03-15'),
         isDeductible: true,
       },
     });
     
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'insurance',
         description: 'Business premises insurance premium',
         amount: new Prisma.Decimal(85000),
         expenseDate: new Date('2026-03-05'),
         isDeductible: true,
       },
     });
     
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'professional_fees',
         description: 'Annual tax audit by chartered accountant',
         amount: new Prisma.Decimal(120000),
         expenseDate: new Date('2026-03-20'),
         isDeductible: true,
       },
     });
     
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'bank_charges',
         description: 'GTBank transaction fees (March)',
         amount: new Prisma.Decimal(8500),
         expenseDate: new Date('2026-03-31'),
         isDeductible: true,
       },
     });
     
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'tax_permit',
         description: 'Lagos State business premises permit renewal',
         amount: new Prisma.Decimal(25000),
         expenseDate: new Date('2026-03-10'),
         isDeductible: false,  // Non-deductible per CITA §27
       },
     });
     
     await prisma.expense.create({
       data: {
         businessId: biz1.id,
         category: 'gift',
         description: 'Corporate calendars for top 20 customers',
         amount: new Prisma.Decimal(45000),
         expenseDate: new Date('2026-03-25'),
         isDeductible: true,  // Under ₦500K limit
       },
     });
     ```
- **Acceptance criteria:**
  - Seed script adds 6 new expenses spanning 6 new categories
  - `tax_permit` expense has `isDeductible=false`, others are `true`
  - Running `npm run prisma:seed` succeeds without errors
- **Verification:**
  ```bash
  cd backend
  npm run prisma:reset  # Warning: drops all data
  # Check Expenses page in UI — should show the new category expenses
  ```
- **Rollback:**
  ```bash
  git checkout backend/prisma/seed.ts
  npm run prisma:reset
  ```
- **Effort estimate:** S (15 minutes)
- **Risk if skipped:** No test data for new categories; manual testing burden increases

---

#### **ARCH-11: Update AGENTS.md Documentation**
- **Depends on:** None (documentation only)
- **Files touched:**
  - `AGENTS.md` (line 1045 reference + context block for expense categories)
- **What to do:**
  1. Open `AGENTS.md`
  2. Locate the section mentioning `ExpenseCategory` (search for "ExpenseCategory")
  3. Update the enum list from 9 to 20 categories:
     ```markdown
     **Enums:** UserRole (user/admin), PaymentMethod (...), ExpenseCategory (rent/inventory/salary/utility/fuel/logistics/marketing/bad_debt/subscription/insurance/professional_fees/repairs_maintenance/bank_charges/communication/office_supplies/travel/gift/depreciation/interest/tax_permit/other).
     ```
  4. Add a new subsection under "Domain Context":
     ```markdown
     ### Expense Categories (Nigerian CITA Context)
     - **Always deductible (15):** rent, inventory, salary, utility, fuel, logistics, marketing, subscription, insurance, professional_fees, repairs_maintenance, bank_charges, communication, office_supplies, travel
     - **Conditionally deductible (4):** gift (≤₦500K/year per CITA §25), depreciation (capital allowances only, CITA §28-29), interest (subject to thin-cap rules, CITA §24f), other (user's judgment)
     - **Non-deductible (1):** tax_permit (CITA §27a — taxes/fines not deductible)
     - **System-generated (1):** bad_debt (auto-created on credit write-offs, always deductible per CITA §25)
     ```
- **Acceptance criteria:**
  - Documentation lists all 20 categories
  - Tax treatment rules are explained for future AI/human maintainers
- **Verification:**
  - Read the updated section in a markdown viewer — no formatting errors
- **Rollback:**
  ```bash
  git checkout AGENTS.md
  ```
- **Effort estimate:** S (10 minutes)
- **Risk if skipped:** Future developers/AI agents lack context on why categories exist

---

#### **ARCH-12: Add E2E Test Case (Optional but Recommended)**
- **Depends on:** ARCH-07
- **Files touched:**
  - `backend/tests/e2e/api.e2e.test.ts` (insert new describe block)
- **What to do:**
  1. Open `backend/tests/e2e/api.e2e.test.ts`
  2. Add a new test suite:
     ```typescript
     describe('POST /businesses/:id/expenses — New Categories', () => {
       it('should reject tax_permit expense with isDeductible=true', async () => {
         const res = await request(app)
           .post(`/api/v1/businesses/${testBusiness.id}/expenses`)
           .set('Authorization', `Bearer ${userToken}`)
           .send({
             category: 'tax_permit',
             description: 'CAC registration fee',
             amount: 50000,
             expenseDate: '2026-10-01',
             isDeductible: true,
           });
         expect(res.status).toBe(400);
         expect(res.body.error.message).toContain('CITA §27');
       });
       
       it('should accept tax_permit expense with isDeductible=false', async () => {
         const res = await request(app)
           .post(`/api/v1/businesses/${testBusiness.id}/expenses`)
           .set('Authorization', `Bearer ${userToken}`)
           .send({
             category: 'tax_permit',
             description: 'CAC registration fee',
             amount: 50000,
             expenseDate: '2026-10-01',
             isDeductible: false,
           });
         expect(res.status).toBe(201);
         expect(res.body.data.category).toBe('tax_permit');
         expect(res.body.data.isDeductible).toBe(false);
       });
       
       it('should accept new categories (subscription, insurance, etc.)', async () => {
         const newCategories = ['subscription', 'insurance', 'professional_fees', 'bank_charges'];
         for (const cat of newCategories) {
           const res = await request(app)
             .post(`/api/v1/businesses/${testBusiness.id}/expenses`)
             .set('Authorization', `Bearer ${userToken}`)
             .send({
               category: cat,
               description: `Test ${cat} expense`,
               amount: 10000,
               expenseDate: '2026-10-01',
               isDeductible: true,
             });
           expect(res.status).toBe(201);
           expect(res.body.data.category).toBe(cat);
         }
       });
     });
     ```
- **Acceptance criteria:**
  - Tests pass locally: `npm run test:e2e`
  - Tests cover the `tax_permit` validation rule + basic creation for new categories
- **Verification:**
  ```bash
  cd backend
  npm run test:e2e -- --testNamePattern="New Categories"
  # Should show 3 passing tests
  ```
- **Rollback:**
  ```bash
  git checkout backend/tests/e2e/api.e2e.test.ts
  ```
- **Effort estimate:** M (20 minutes)
- **Risk if skipped:** No automated regression coverage; future refactors could break category validation

---

### 🟡 LATER Tier — Future Enhancements (Not Part of v1)

#### **ARCH-13: Searchable Category Combobox (Replace Dropdown)**
- **Why deferred:** Current 19-item dropdown is usable; combobox adds complexity (new dependency, accessibility testing). Wait for user feedback requesting search.
- **If implemented later:**
  - Library: `@headlessui/react` Combobox or `downshift`
  - Files: `frontend/src/components/AddExpenseModal.tsx` (replace `<select>`)
  - Effort: L (2-3 hours including accessibility testing)

#### **ARCH-14: Category Usage Analytics (Dashboard Widget)**
- **Why deferred:** No product requirement yet. Could show top 5 expense categories in Dashboard card.
- **If implemented later:**
  - Backend: Add aggregation query in `dashboard.service.ts`
  - Frontend: New `<TopExpenseCategoriesCard>` component
  - Effort: M (1-2 hours)

---

## PHASE 7: MIGRATION STRATEGY

### Pre-Deployment Checklist
1. ✅ All NOW-tier items completed and tested locally
2. ✅ Database backup taken: `npm run db:backup` (from backend/)
3. ✅ Prisma migration file reviewed (no DROP statements)
4. ✅ Seed script updated and tested on a fresh DB
5. ✅ Frontend build succeeds: `cd frontend && npm run build`
6. ✅ Backend build succeeds: `cd backend && npm run build`
7. ✅ E2E tests pass: `cd backend && npm run test:e2e`

### Deployment Sequence (Production)
```bash
# Step 1: Deploy backend (schema + API changes)
cd backend
git pull origin main
npm install
npm run prisma:migrate:deploy  # Applies migration, adds enum values
npm run prisma:generate        # Regenerates Prisma Client
npm run build
pm2 restart paymytax-backend   # Or your process manager

# Step 2: Deploy frontend (new category UI)
cd frontend
git pull origin main
npm install
npm run build
# Copy dist/ to CDN or static host
```

### Rollback Plan
**If critical bug discovered post-deploy:**

1. **Backend rollback:**
   ```bash
   cd backend
   git revert <commit-sha>  # Revert the category expansion commit
   npm run prisma:migrate:deploy
   npm run build
   pm2 restart paymytax-backend
   ```
   ⚠️ **Warning:** You CANNOT drop enum values in Postgres if any existing expense rows reference them. The rollback will fail if users have already created expenses with new categories. In that case:
   - Leave the enum values in the DB
   - Only roll back the frontend (hide new categories in the UI)
   - Schedule a data migration to reclassify expenses into `other` category

2. **Frontend rollback:**
   ```bash
   cd frontend
   git revert <commit-sha>
   npm run build
   # Redeploy dist/
   ```
   This is safe — just hides the new categories from the UI.

### Data Migration (If Needed)
**Scenario:** User accidentally created 100 `tax_permit` expenses before we caught a bug.

**Solution:** Run a one-time SQL script:
```sql
-- Reclassify all tax_permit expenses to 'other' with a note
UPDATE expenses
SET 
  category = 'other',
  description = CONCAT('[Migrated from tax_permit] ', description),
  is_deductible = false
WHERE category = 'tax_permit';
```

---

## PHASE 8: RISK REGISTER

| Finding | Severity | Confidence | Evidence | Impact | Mitigation |
|---|:---:|:---:|---|---|---|
| Enum expansion is irreversible in Postgres | 🟠 HIGH | HIGH | Postgres ALTER TYPE ADD VALUE is permanent | Once deployed, cannot drop enum values if data exists | Take DB backup before deploy; test rollback on staging; document the forward-only constraint |
| Dropdown UI overflow on mobile | 🟡 MEDIUM | MEDIUM | 19 categories in native `<select>` is usable but not ideal | Slower category selection on mobile | Alphabetical sort improves scan speed; defer combobox to v2 based on user feedback |
| User confusion on conditional categories | 🟡 MEDIUM | HIGH | `gift`, `depreciation`, `interest` have complex tax rules | Misclassification → incorrect tax calculations | Educational hints + amber warning badge; backend validator blocks obvious errors (tax_permit) |
| Missing CITA references in hints | 🟢 LOW | LOW | Hints are simplified for SME owners | Power users (accountants) may want statute citations | Add tooltips with full CITA § references in v2 |
| No category usage analytics | 🟢 LOW | LOW | No dashboard widget showing top categories | Missed insight into SME spending patterns | Defer to Phase 6 or later based on user requests |

---

## PHASE 9: ARCHITECTURE SCORES

| Dimension | Score | Justification |
|---|:---:|---|
| **Maintainability** | 8/10 | Alphabetical enum + clear deductibility rules make future additions easy. One central validator + one modal. |
| **Data Architecture** | 9/10 | Enum-based category (not free text) ensures data integrity. Migration is additive, no breaking changes. |
| **API Architecture** | 9/10 | No API changes needed; category is just a validated enum string. Backend validator catches invalid values. |
| **Security** | 8/10 | No new attack surface. Validator prevents malicious `isDeductible=true` on non-deductible categories. |
| **UX/Educational Value** | 9/10 | Per-category tax hints + color-coded UI + conditional badges teach users Nigerian tax law while they work. |
| **Testability** | 7/10 | E2E test covers validation; could add more category-specific test cases (deferred to ARCH-12). |
| **Overall** | **8.5/10** | Solid, evidence-based expansion. Low risk, high value. Only deduction: dropdown UX could be smoother (deferred). |

---

## PHASE 10: FINAL VERDICT

### ✅ Current Biggest Strength
Existing expense architecture is clean: single validator, single modal, clear deductibility logic, locked-period guards. This expansion builds on a solid foundation.

### ⚠️ Biggest Gap Addressed by This Plan
Missing essential expense categories forces Nigerian SMEs to shoehorn legitimate expenses into "other" category, degrading audit trails and tax accuracy. This plan adds 11 standard categories covering 95% of SME expense types.

### 🎯 Highest-Value First Move
**ARCH-01 through ARCH-09** (NOW tier) — completes the full category expansion in one cohesive PR. All items are interdependent; shipping them atomically avoids broken states.

### 📊 Overall Verdict
🟢 **Healthy expansion, ready to implement.** The plan is evidence-based, respects Nigerian tax law (CITA), preserves existing functionality, and introduces no breaking changes. Migration is low-risk (additive enum values). Rollback is partial (frontend-only; backend enum cannot be dropped once data exists, which is acceptable).

---

## QUESTIONS FOR STAKEHOLDER (IF ANY)

1. **Category naming:** Do Nigerian SME owners recognize "repairs_maintenance" or should it be split into "repairs" and "maintenance"?
2. **Gift threshold:** The ₦500K annual limit (CITA §25e) — do we want to add a running total tracker in the UI, or is the educational hint sufficient for v1?
3. **Depreciation:** Should we block users from entering depreciation expenses if they already claimed the asset as a full expense? (Requires asset register, out of scope for v1.)
4. **Mobile UX:** Should we prioritize the searchable combobox (ARCH-13) over other features, or wait for user feedback?

---

## APPROVAL TO PROCEED

- [ ] Product owner reviewed and approved
- [ ] Database backup plan confirmed
- [ ] Staging environment tested
- [ ] Rollback plan understood

**Once approved, execute ARCH-01 through ARCH-09 in sequence. Estimated total effort: 3-4 hours (including testing).**

---

**END OF IMPLEMENTATION PLAN**