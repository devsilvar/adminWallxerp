# CREDIT SALE VIA ADD SALE MODAL — OPTION B IMPLEMENTATION PLAN
### Architectural Audit & Execution-Ready Work Items (v3.0 Standard)

---

## 1. EXECUTIVE SUMMARY

**Problem**: When a Nigerian SME merchant sells multiple products to a customer who says *"put it on my tab"*, the merchant currently cannot record this from the Sales page. They must leave, navigate to `/debtors`, and manually re-enter all product details. Worse, the existing `CustomerCredit` model only has a flat `description: String` field — if 5 products were sold on credit, all item-level data (names, quantities, unit prices) is permanently lost.

**Solution (Option B)**: Add a `CreditLineItem` Prisma model mirroring the proven `SaleLineItem` pattern. Add `'credit'` as a payment type in `AddSaleModal`. When selected, the modal collects debtor-specific fields and routes the submission to `POST /businesses/:id/credits` instead of creating a premature taxable `SalesTransaction`.

**Why NOT modify `SalesSource` enum**: The FIRS cash-basis tax pipeline in this codebase queries `TAXABLE_SALES_WHERE` (`settled-status.ts:15-18`), which filters `{ status: { in: ['confirmed', 'completed'] }, isTaxable: true }`. All `SalesTransaction` rows with `status: 'confirmed'` are counted as taxable revenue. Inserting a credit sale there — even with `isTaxable: false` — would create a fragile exception path that fights the existing architecture. The established pattern is: **credits live in `customer_credits`, revenue appears in `sales_transactions` only when cash is collected** (`credit.service.ts:104-130`).

---

## 2. CURRENT ARCHITECTURE (CONFIRMED FROM CODE)

### Data Flow for Standard Sales
```
AddSaleModal.tsx (line 214) → POST /businesses/:id/sales
  → sales.controller.ts:29 → createSaleSchema.parse()
  → sales-crud.service.ts:42 createSale()
    → computeSaleTotal() (lines 15-37) — 2-decimal rounding per line
    → tx.salesTransaction.create({ items: { createMany: { data: lines } } })
    → status: 'confirmed', isTaxable: true
  → FIRS tax calculation picks this up via TAXABLE_SALES_WHERE
```

### Data Flow for Debtor Credits
```
Debtors.tsx → POST /businesses/:id/credits
  → credit.controller.ts:14 → createCreditSchema.parse()
  → credit.service.ts:18 createCredit()
    → tx.customerCredit.create({ description, totalAmount, balance: totalAmount })
    → NO SalesTransaction created — FIRS tax is NOT triggered
```

### Revenue Recognition on Debt Payment
```
DebtorDetail.tsx → POST /businesses/:id/credits/:creditId/payments
  → credit.service.ts:61 recordPayment()
    → SELECT ... FOR UPDATE (row lock, line 66-67)
    → resolveTransactionDateForLockedMonth() (line 85)
    → tx.salesTransaction.create({ status: 'confirmed', isTaxable: true }) (line 105)
    → tx.creditPayment.create({ linkedSaleId: sale.id }) (line 133)
    → tx.customerCredit.update({ balance, amountPaid, status }) (line 146)
  → FIRS tax recognized ONLY at this point
```

---

## 3. DO NOT CHANGE (CONFIRMED GOOD)

| What | Where | Why |
|---|---|---|
| `TAXABLE_SALES_WHERE` | `settled-status.ts:15-18` | Single source of truth for tax calc; must never include uncollected debt |
| `recordPayment()` atomic pattern | `credit.service.ts:61-178` | Row lock + `resolveTransactionDateForLockedMonth` + linked sale — battle-tested |
| `computeSaleTotal()` rounding | `sales-crud.service.ts:15-37` | 2-decimal currency precision; will be replicated for credits |
| `SaleItemsEditor` component | `SaleItemsEditor.tsx` | Reusable as-is — operates on generic `SaleLineItem` type |
| `Modal` footer contract | `Modal.tsx` | `form="add-sale-form"` pattern; footer lives outside `<form>` |
| `verifyBusinessOwnership()` guard | Called in every credit service function | Prevents cross-business data access |
| `logAudit()` inside transactions | `credit.service.ts:44-55` | Audit trail for compliance |

---

## 4. FILE & MODULE IMPACT MAP

```
DATABASE / SCHEMA:
  [MODIFY]  backend/prisma/schema.prisma                          — Add CreditLineItem model + relation on CustomerCredit
  [NEW]     backend/prisma/migrations/20260921120000_.../migration.sql — Migration for credit_line_items table

BACKEND VALIDATION:
  [MODIFY]  backend/src/validators/credit.validator.ts             — Add creditLineItemSchema + items array + conditional totalAmount

BACKEND SERVICE:
  [MODIFY]  backend/src/services/credit.service.ts                 — Items in createCredit, include items in getCreditById & listCredits

FRONTEND TYPES:
  [MODIFY]  frontend/src/types/index.ts                            — Add CreditLineItem type; update CustomerCredit & CreateCreditPayload

FRONTEND LABELS:
  [MODIFY]  frontend/src/lib/paymentTypes.ts                       — Add 'credit' label

FRONTEND MODAL:
  [MODIFY]  frontend/src/components/AddSaleModal.tsx               — Add 'credit' source, debtor fields, dual routing

FRONTEND DETAIL PAGE:
  [MODIFY]  frontend/src/pages/DebtorDetail.tsx                    — Borderless gradient icons + line items table
```

---

## 5. EXECUTION-READY WORK ITEMS

---

### CREDIT-01: Add `CreditLineItem` Model to Prisma Schema

- **Depends on**: None
- **Files touched**:
  - `backend/prisma/schema.prisma` (lines 570-602, the `CustomerCredit` model block)
- **What to do**:
  1. After the `CustomerCredit` model (after line 602), add:
     ```prisma
     /// Individual line items for a customer credit (mirrors SaleLineItem for sales)
     model CreditLineItem {
       id        String         @id @default(uuid())
       creditId  String         @map("credit_id")
       name      String         @db.VarChar(200)
       quantity  Decimal        @default(1) @db.Decimal(12, 2)
       unitPrice Decimal        @map("unit_price") @db.Decimal(15, 2)
       lineTotal Decimal        @map("line_total") @db.Decimal(15, 2)
       sortOrder Int            @default(0) @map("sort_order")
       createdAt DateTime       @default(now()) @map("created_at")
       credit    CustomerCredit @relation(fields: [creditId], references: [id], onDelete: Cascade)

       @@index([creditId, sortOrder])
       @@map("credit_line_items")
     }
     ```
  2. Add `items CreditLineItem[]` relation to `CustomerCredit` model, between `payments` and the closing `}` (after line 595):
     ```prisma
     items      CreditLineItem[]
     ```
  3. Run `npx prisma generate` then `npx prisma migrate dev --name add_credit_line_items`.
- **Acceptance criteria**:
  - `npx prisma generate` succeeds with `CreditLineItem` available in client types.
  - Migration SQL creates `credit_line_items` table with `credit_id` FK and `(credit_id, sort_order)` index.
  - `cd backend && npm run build` exits 0.
- **Verification**: `cd backend && npm run build`
- **Rollback**: Remove model + relation from schema.prisma, run `npx prisma migrate dev --name revert_credit_line_items` or drop table manually.
- **Effort**: S (15 min)
- **Risk if skipped**: Blocks all downstream work items.

---

### CREDIT-02: Backend Validator — Accept Items on Credit Creation

- **Depends on**: CREDIT-01
- **Files touched**:
  - `backend/src/validators/credit.validator.ts` (75 lines total)
- **What to do**:
  1. Add `creditLineItemSchema` (matching `saleLineItemSchema` from `sales.validator.ts:4-8`):
     ```ts
     export const creditLineItemSchema = z.object({
       name: z.string().trim().min(1, 'Item name is required').max(200),
       quantity: z.number().positive('Quantity must be greater than 0').max(100_000),
       unitPrice: z.number().nonnegative('Unit price must be non-negative').max(1e13),
     });
     ```
  2. Modify `createCreditSchema` (lines 6-28):
     - Change `totalAmount` from required to optional: `z.number().positive().min(100).optional()`
     - Change `description` from required to optional: `z.string().min(3).max(500).trim().optional().or(z.literal(''))`
     - Add `items: z.array(creditLineItemSchema).max(50).optional()`
     - Add `.superRefine()` after the two existing `.refine()` blocks:
       ```ts
       .superRefine((data, ctx) => {
         const hasItems = data.items !== undefined && data.items.length > 0;
         if (!hasItems && data.totalAmount === undefined) {
           ctx.addIssue({
             code: z.ZodIssueCode.custom,
             message: 'Either items or totalAmount must be provided',
             path: ['totalAmount'],
           });
         }
         if (!hasItems && (!data.description || data.description.trim().length < 3)) {
           ctx.addIssue({
             code: z.ZodIssueCode.custom,
             message: 'Description is required when items are not provided',
             path: ['description'],
           });
         }
       });
       ```
  3. Export `CreditLineItemInput = z.infer<typeof creditLineItemSchema>`.
- **Acceptance criteria**:
  - Payload with `items: [{name: "Phone", quantity: 1, unitPrice: 50000}]` and no `totalAmount` validates successfully.
  - Payload with `totalAmount: 50000` and `description: "Service fee"` and no `items` validates successfully.
  - Payload with neither `items` nor `totalAmount` is rejected with clear error.
- **Verification**: `cd backend && npm run build`
- **Rollback**: Revert `credit.validator.ts` to previous version.
- **Effort**: S (15 min)

---

### CREDIT-03: Backend Service — Persist and Return Line Items

- **Depends on**: CREDIT-02
- **Files touched**:
  - `backend/src/services/credit.service.ts` (lines 1-59 for createCredit, lines 268-287 for getCreditById, lines 238-251 for listCredits)
- **What to do**:
  1. Import `CreditLineItemInput` from the validator at the top (line 8-14).
  2. Add `computeCreditTotal` helper (replicate exact pattern from `sales-crud.service.ts:15-37`):
     ```ts
     function computeCreditTotal(items: CreditLineItemInput[]): {
       total: number;
       lines: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number; sortOrder: number }>;
     } {
       let total = 0;
       const lines = items.map((item, index) => {
         const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
         total = Math.round((total + lineTotal) * 100) / 100;
         return { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal, sortOrder: index };
       });
       return { total, lines };
     }
     ```
  3. Modify `createCredit` function (lines 18-58):
     - After `verifyBusinessOwnership` (line 19), compute items if provided:
       ```ts
       const hasItems = data.items !== undefined && data.items.length > 0;
       const { total: computedTotal, lines } = hasItems
         ? computeCreditTotal(data.items!)
         : { total: 0, lines: [] };
       const effectiveTotalAmount = hasItems ? computedTotal : data.totalAmount!;

       let description = data.description;
       if (!description && hasItems) {
         description = data.items!.map(i => `${i.name} (x${i.quantity})`).join(', ').slice(0, 500);
       }
       ```
     - Update the `tx.customerCredit.create` call (line 22-42):
       - Use `effectiveTotalAmount` for both `totalAmount` and `balance`.
       - Use the derived `description`.
       - Add items via `createMany`:
         ```ts
         ...(hasItems ? { items: { createMany: { data: lines } } } : {}),
         ```
     - Add `include: { items: { orderBy: { sortOrder: 'asc' } } }` to the create call.
  4. Modify `getCreditById` (lines 271-280):
     - Add `items: { orderBy: { sortOrder: 'asc' } }` to the existing `include` block.
  5. Modify `listCredits` (lines 240-250):
     - Add `items: true` to the existing `include` block (or `items: { orderBy: { sortOrder: 'asc' } }` if display order matters in list).
- **Acceptance criteria**:
  - Creating a credit with 3 items stores all 3 in `credit_line_items` table with correct `lineTotal` values.
  - `totalAmount` is server-computed from items (`sum of lineTotal`), not trusted from client.
  - `getCreditById` response includes `items[]` array.
  - Creating a credit with flat `totalAmount` + `description` (no items) still works exactly as before.
- **Verification**: `cd backend && npm run build`
- **Rollback**: Revert service changes. Existing credits (without items) remain valid.
- **Effort**: M (25 min)

---

### CREDIT-04: Frontend Types and Payment Label

- **Depends on**: CREDIT-03
- **Files touched**:
  - `frontend/src/types/index.ts` (lines 737-782)
  - `frontend/src/lib/paymentTypes.ts` (lines 9-17)
- **What to do**:
  1. In `types/index.ts`, add `CreditLineItem` interface (after line 759, before `CreditSummary`):
     ```ts
     export interface CreditLineItem {
       id?: string;
       creditId?: string;
       name: string;
       quantity: number;
       unitPrice: number;
       lineTotal?: number;
       sortOrder?: number;
     }
     ```
  2. Add `items?: CreditLineItem[]` to `CustomerCredit` interface (after `payments?` on line 759):
     ```ts
     items?: CreditLineItem[];
     ```
  3. Update `CreateCreditPayload` (lines 769-782):
     - Change `description` to optional: `description?: string;`
     - Change `totalAmount` to optional: `totalAmount?: number;`
     - Add `items?: Array<{ name: string; quantity: number; unitPrice: number }>;`
  4. In `paymentTypes.ts`, add to `PAYMENT_TYPE_LABELS` (line 16, before `manual`):
     ```ts
     credit: 'Credit / Debt (Buy Now, Pay Later)',
     ```
- **Acceptance criteria**:
  - TypeScript compiles with `CustomerCredit.items` and `CreateCreditPayload.items` available.
  - `paymentTypeLabel('credit')` returns `'Credit / Debt (Buy Now, Pay Later)'`.
- **Verification**: `cd frontend && npm run build`
- **Rollback**: Revert both files.
- **Effort**: S (10 min)

---

### CREDIT-05: AddSaleModal — Credit Payment Type with Debtor Fields

- **Depends on**: CREDIT-04
- **Files touched**:
  - `frontend/src/components/AddSaleModal.tsx` (376 lines)
- **What to do**:
  1. **Import** `useCreditStore` (add after line 16):
     ```ts
     import { useCreditStore } from '@/stores/credit.store.ts';
     ```
     Import `HandCoins` icon from lucide-react (line 12).
  2. **Add `'credit'` to `SOURCES`** (line 23-30). Only show in create mode, not edit:
     ```ts
     const SOURCES = [
       'bank_transfer', 'paycode', 'pos', 'online_store', 'cash', 'invoice',
     ] as const;
     const CREDIT_SOURCE = 'credit' as const;
     ```
     In `sourceOptions` computation (line 95-98), append `CREDIT_SOURCE` only when `!isEdit`:
     ```ts
     const sourceOptions: string[] =
       isEdit && editSale && !(SOURCES as readonly string[]).includes(editSale.source)
         ? [...SOURCES, editSale.source]
         : [...SOURCES, ...(isEdit ? [] : [CREDIT_SOURCE])];
     ```
  3. **Add debtor state** (after line 86):
     ```ts
     const [customerPhone, setCustomerPhone] = useState('');
     const [dueDate, setDueDate] = useState('');
     const [guarantorName, setGuarantorName] = useState('');
     ```
     Derive: `const isCredit = source === 'credit';`
  4. **Reset credit fields on modal open** (inside the `else` block at lines 128-138, after `setClassification('')`):
     ```ts
     setCustomerPhone('');
     const d = new Date(); d.setDate(d.getDate() + 14);
     setDueDate(d.toISOString().slice(0, 10));
     setGuarantorName('');
     ```
  5. **Split `handleSubmit`** (lines 164-224):
     Before the existing `try` block (line 201), insert an `if (isCredit)` branch:
     ```ts
     if (isCredit) {
       // Validate customer name required for credit
       if (!customerName.trim()) {
         toast.error('Customer name is required for credit sales');
         setSaving(false);
         return;
       }
       if (!dueDate) {
         toast.error('Due date is required for credit sales');
         setSaving(false);
         return;
       }

       const creditPayload: any = {
         customerName: customerName.trim(),
         customerPhone: customerPhone.trim() || undefined,
         issueDate: transactionDate,
         dueDate,
         guarantorName: guarantorName.trim() || undefined,
       };

       if (mode === 'items') {
         const validItems = items.filter((i) => i.name.trim().length > 0);
         if (validItems.length === 0) {
           toast.error('Please enter at least one item with a name');
           setSaving(false);
           return;
         }
         creditPayload.items = validItems.map((i) => ({
           name: i.name.trim(),
           quantity: Number(i.quantity || 1),
           unitPrice: Number(i.unitPrice || 0),
         }));
         creditPayload.description = description || undefined;
       } else {
         const numAmount = Number(amount);
         if (isNaN(numAmount) || numAmount <= 0) {
           toast.error('Amount must be greater than 0');
           setSaving(false);
           return;
         }
         creditPayload.totalAmount = numAmount;
         creditPayload.description = description || 'Credit sale';
       }

       try {
         await useCreditStore.getState().createCredit(businessId, creditPayload);
         toast.success('Credit sale recorded in Debtors Book');
         invalidateDashboard('credit_created');
         onSaved('created');
         onClose();
       } catch (err: unknown) {
         toast.error(getApiErrorMessage(err, 'Failed to create credit'));
       } finally {
         setSaving(false);
       }
       return;  // <— Exit early, don't fall through to sales API
     }
     ```
  6. **Render credit-specific fields in JSX** (after the Payment Type `<select>` at line 325, before the Description `<Input>` at line 327):
     ```tsx
     {isCredit && (
       <div className='sm:col-span-2 space-y-3'>
         {/* FIRS Cash-Basis Protection Banner */}
         <div className='flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-none'>
           <HandCoins className='h-4 w-4 text-slate-500 shrink-0 mt-0.5' />
           <p className='text-[11px] text-slate-600 leading-relaxed'>
             <span className='font-bold text-slate-800'>FIRS Cash-Basis Guarantee:</span>{' '}
             This will be recorded as a customer debt in your Debtors Book.
             No VAT or tax liability is triggered until the debtor makes a payment.
           </p>
         </div>
         {/* Debtor Phone */}
         <Input
           label='Debtor Phone (for WhatsApp reminders)'
           placeholder='e.g. 08012345678'
           value={customerPhone}
           onChange={(e) => setCustomerPhone(e.target.value)}
           className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
         />
         {/* Due Date */}
         <Input
           label='Payment Due Date'
           type='date'
           value={dueDate}
           onChange={(e) => setDueDate(e.target.value)}
           className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
           required
         />
         {/* Guarantor */}
         <Input
           label='Guarantor Name (Optional)'
           placeholder='e.g. Alhaji Ibrahim'
           value={guarantorName}
           onChange={(e) => setGuarantorName(e.target.value)}
           className='rounded-none border-gray-300 focus:border-gray-900 focus:ring-0 text-xs'
         />
       </div>
     )}
     ```
  7. **Hide Classification dropdown when `isCredit`** (wrap lines 353-371 with `{!isCredit && (...)}`).
  8. **Make Customer Name required when `isCredit`** (line 338-343): Add `required={isCredit}` prop.
  9. **Update modal subtitle** (line 233): `subtitle={isCredit ? 'Record goods/services given on credit' : 'Money received from selling'}`
- **Acceptance criteria**:
  - Selecting 'Credit / Debt (Buy Now, Pay Later)' in Payment Type reveals debtor fields + FIRS banner.
  - Submitting with items creates a `CustomerCredit` with line items (visible in `/debtors`).
  - Submitting with flat amount creates a `CustomerCredit` with `totalAmount` (no items).
  - `'credit'` option does NOT appear when editing an existing sale.
  - No `SalesTransaction` is created on submission — verified by checking Sales page totals are unchanged.
  - Classification dropdown is hidden when credit is selected.
- **Verification**: `cd frontend && npm run build` + manual test both modes.
- **Rollback**: Revert `AddSaleModal.tsx`.
- **Effort**: M (40 min)

---

### CREDIT-06: DebtorDetail — Borderless Gradient Icons + Line Items Table

- **Depends on**: CREDIT-04
- **Files touched**:
  - `frontend/src/pages/DebtorDetail.tsx` (753 lines)
- **What to do**:

  **Part A — Icon Overhaul (8 locations)**:

  Replace each icon container. Exact line-by-line targets:

  | Line | Current | New |
  |---|---|---|
  | **375** | `h-8 w-8 rounded-xl border ... shadow-2xs` (Wallet, conditional color) | `h-10 w-10 rounded-2xl bg-gradient-to-br from-{color}-100 to-{color}-50` (no `border`, no `shadow-2xs`), icon `h-5 w-5 text-{color}-600` |
  | **405** | `h-8 w-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60 ... shadow-2xs` | `h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50` (no border), `FileText h-5 w-5 text-blue-600` |
  | **420** | `h-8 w-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 ... shadow-2xs` | `h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50` (no border), `TrendingUp h-5 w-5 text-emerald-600` |
  | **444** | `h-8 w-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/60 ... shadow-2xs` | `h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50` (no border), `Clock h-5 w-5 text-indigo-600` |
  | **468** | `h-7 w-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100` | `h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50` (no border), `Receipt h-4.5 w-4.5 text-indigo-600` → use `h-[18px] w-[18px]` since Tailwind doesn't have `4.5` |
  | **551** | `h-7 w-7 rounded-lg bg-primary-50 text-primary-700 border border-primary-100` | `h-9 w-9 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50` (no border), `FileText h-[18px] w-[18px] text-primary-600` |
  | **605** | `h-7 w-7 rounded-lg bg-primary-50 text-primary-700 border border-primary-100` | `h-9 w-9 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50` (no border), `Building2 h-[18px] w-[18px] text-primary-600` |
  | **664** | `h-7 w-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100` | `h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50` (no border), `Shield h-[18px] w-[18px] text-indigo-600` |

  **Note**: Line 508 has a payment-row checkmark icon (`h-8 w-8 ... bg-emerald-50 ... border border-emerald-100`). This is inside the repayment ledger rows, not a section header. Leave it as-is for now (different visual context).

  **Part B — Line Items Table**:

  In the "Product & Agreement Specification" card (lines 548-597), replace the flat description block (lines 559-567) with conditional rendering:

  ```tsx
  {c.items && c.items.length > 0 ? (
    <div>
      <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">
        Items Sold on Credit
      </span>
      <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2">Product / Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit Price</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {c.items.map((item, idx) => (
              <tr key={item.id || idx} className="hover:bg-gray-50/50">
                <td className="px-3 py-2.5 font-medium text-gray-900">{item.name}</td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{item.quantity}</td>
                <td className="px-3 py-2.5 text-right text-gray-600 font-mono tabular-nums">{formatNaira(item.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900 font-mono tabular-nums">{formatNaira(item.lineTotal || item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2.5 font-bold text-gray-700" colSpan={3}>
                {c.items.length} item{c.items.length !== 1 ? 's' : ''} — Grand Total
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-900 font-mono tabular-nums">
                {formatNaira(c.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {c.description && (
        <p className="text-xs text-gray-500 mt-2 italic">{c.description}</p>
      )}
    </div>
  ) : (
    <div>
      <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">
        Goods / Services Sold on Credit
      </span>
      <p className="text-sm text-gray-900 font-medium mt-1.5 leading-relaxed bg-gray-50/80 p-3.5 border border-gray-100 rounded-xl">
        {c.description}
      </p>
    </div>
  )}
  ```

- **Acceptance criteria**:
  - All 8 icon containers are larger, borderless, with gradient backgrounds.
  - Debtor detail page with items shows a structured product table.
  - Debtor detail page without items (legacy records) shows the existing description text.
  - No visual regression on other elements (status badges, action buttons, payment rows).
- **Verification**: `cd frontend && npm run build` + manual visual inspection.
- **Rollback**: Revert `DebtorDetail.tsx`.
- **Effort**: M (35 min)

---

## 6. EXECUTION SEQUENCE

```
CREDIT-01 (Schema + Migration)
    │
    ▼
CREDIT-02 (Validator)
    │
    ▼
CREDIT-03 (Service)
    │
    ├──────────────────────┐
    ▼                      ▼
CREDIT-04 (Types+Labels)  (can start after CREDIT-03)
    │
    ├──────────────┐
    ▼              ▼
CREDIT-05       CREDIT-06
(AddSaleModal)  (DebtorDetail)
```

CREDIT-05 and CREDIT-06 are independent of each other — they can be done in parallel.

---

## 7. MIGRATION STRATEGY

- **Additive**: `CreditLineItem` is a new table. Zero impact on existing `customer_credits` rows.
- **Backward Compatible**: `items` is optional everywhere. Existing credits render their `description` as before.
- **Rollback**: `DROP TABLE IF EXISTS credit_line_items;` — no other table is modified.
- **No Data Migration Needed**: Existing credits don't need items populated.

---

## 8. VERIFICATION PLAN

### Build Verification
```bash
cd backend && npm run build         # Must exit 0
cd frontend && npm run build        # Must exit 0
```

### Manual Tests
1. **Multi-item credit sale**: Sales → Add Sale → select "Credit / Debt" → add 3 products via items editor → fill Customer Name, Due Date → submit. Verify credit appears in `/debtors` with all 3 items visible on the detail page.
2. **Flat credit sale**: Sales → Add Sale → select "Credit / Debt" → switch to Service mode → enter ₦50,000 amount → submit. Verify credit appears with description but no items table.
3. **Tax isolation**: After creating a credit, verify monthly tax report totals are unchanged (no new `SalesTransaction` was created).
4. **Legacy compatibility**: Open an existing debtor detail page (created before this migration). Verify it renders the description text without errors.
5. **Icon visual check**: On any debtor detail page, verify all 8 section icons are larger, borderless, with gradient backgrounds.
6. **Edit mode guard**: Click "Edit" on an existing sale in the Sales page. Verify "Credit / Debt" does NOT appear in the Payment Type dropdown.
