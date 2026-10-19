# Coding Standards & Engineering Guidelines

## 1. Naming Conventions

- **Files & Directories**:
  - Backend controllers: `<domain>.controller.ts` (e.g. `sales.controller.ts`)
  - Backend services: `<domain>.service.ts` (e.g. `credit.service.ts`)
  - Backend validators: `<domain>.validator.ts` (e.g. `team.validator.ts`)
  - Frontend React components: PascalCase (e.g. `TransactionDetailPanel.tsx`, `HeroDashboardPreview.tsx`)
  - Frontend utilities & hooks: camelCase (e.g. `formatCurrency.ts`, `useDocumentTitle.ts`)
  - Frontend Zustand stores: `<domain>.store.ts` (e.g. `auth.store.ts`, `team.store.ts`)
- **Variables & Functions**:
  - Use `camelCase` for variables, properties, and functions.
  - Use `UPPER_SNAKE_CASE` for global module constants and enum keys (e.g. `SETTLED_SALE_STATUSES`).
  - Use `PascalCase` for types, interfaces, classes, and React components.

---

## 2. Error Handling & Async Flows

### 2.1. Backend Error Handling
- Never use bare unhandled promises. Wrap every Express route handler in `asyncHandler`:
  ```typescript
  export const getSalesSummary = asyncHandler(async (req: Request, res: Response) => {
    const data = await salesService.getSummary(req.params.businessId);
    res.json({ success: true, data });
  });
  ```
- Throw standardized `AppError` instances:
  ```typescript
  throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  ```
- Catch and map database errors inside global error middleware:
  - Prisma `P2002` → `409 DUPLICATE_ENTRY`
  - Prisma `P2025` → `404 NOT_FOUND`
  - Prisma `P2003` → `400 FOREIGN_KEY_CONSTRAINT`

### 2.2. Frontend Error Handling
- Wrap API calls in `try / catch` blocks and notify users via `toast.error(err.response?.data?.error?.message || 'Action failed')`.
- Ensure buttons display an accessible loading spinner and are disabled during asynchronous operations.

---

## 3. Data Validation & Type Safety

- **Runtime Validation**: Use Zod for all external request boundaries (headers, params, query, body).
- **Type Inference**: Derive TypeScript DTO interfaces directly from Zod schemas:
  ```typescript
  export const createCreditSchema = z.object({
    customerName: z.string().min(2),
    totalAmount: z.number().positive(),
    dueDate: z.string().datetime(),
  });
  export type CreateCreditDTO = z.infer<typeof createCreditSchema>;
  ```
- **Strict Typing**: Never use `any`. Use `unknown` with type narrowing when the type cannot be statically known.

---

## 4. Canonical Helpers & Mathematical Precision

- Convert all monetary and numeric values from Prisma or external payloads using `toNumber()`:
  ```typescript
  import { toNumber } from '@/shared/helpers';
  const taxPayable = toNumber(report.grossProfit) * 0.075;
  ```
- Always enforce month-locks before persisting transactional mutations:
  ```typescript
  import { assertMonthNotLocked } from '@/shared/helpers';
  await assertMonthNotLocked(businessId, transactionDate, tx);
  ```

---

## 5. Logging Standards

- Use Winston logger (`src/lib/logger.ts`) across backend services.
- Never use raw `console.log()` in production service code.
- Sanitize logged payloads: Never log passwords, tokens, full credit card numbers, BVN, or NIN.

---

## 6. Frontend Component Architecture

- Separate presentation components from stateful data stores.
- Custom animations should use lightweight Tailwind transitions or shared intersection observer helpers (`src/components/marketing/anim.tsx`).
- Modals must be keyboard accessible (support ESC key and focus traps).
