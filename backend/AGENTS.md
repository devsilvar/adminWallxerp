# Backend Operating Guidelines (AGENTS.md)

This manual applies to all work inside the `backend/` directory.

## 1. Directory Structure & Layer Boundaries

```
backend/
├── src/
│   ├── controllers/      # HTTP request/response orchestration (thin, calls services)
│   ├── services/         # Core business logic, transactions, audits, domain events
│   ├── routes/           # Express route definitions + middleware mounting
│   ├── validators/       # Zod schemas for request validation (body, query, params)
│   ├── shared/           # Canonical helpers (helpers.ts, math, assertions, date utilities)
│   ├── lib/              # Infrastructure (prisma, email, paystack, s3, crypto, ownership)
│   ├── jobs/             # Scheduled cron tasks (auto-sweep, reconciliation, reminders)
│   ├── middlewares/      # Auth, RBAC, error handlers, rate-limiters, upload
│   └── app.ts / server.ts# App bootstrapping and server entry point
├── prisma/               # schema.prisma, migrations, seeds
├── tests/                # unit/, integration/, e2e/
└── backups/              # Physical disaster recovery snapshots
```

**Boundary Rules:**
1. Routes must never call Prisma directly. All queries reside inside `services/`.
2. Controllers must validate requests via Zod (`src/validators/`) and handle errors via `asyncHandler`.
3. Financial mutations must accept optional `tx?: TxClient` and default to `const db = tx ?? prisma`.
4. Audit logs are mandatory for all state mutations via `logAudit()`.

## 2. Invariants & Financial Safety

- **Decimals**: Convert Prisma `Decimal` instances using `toNumber()` from `src/shared/helpers.ts`. Never use raw Javascript `parseFloat` without precision handling.
- **Month Lock**: Every route modifying historical sales, expenses, credits, or invoices must assert `assertMonthNotLocked(businessId, transactionDate)`. Finalized or closed tax periods reject mutations with `423 PERIOD_LOCKED` or `423 PERIOD_FINALIZED`.
- **Wallet & Solvency**: Payouts and transfers check live solvency via the uncached `getWithdrawalActor()` and `assertSolvency()` oracle before touching ledger entries.
- **Accrual Basis**: Uncollected credits book revenue on issue. Repayments reduce balance without duplicate sales transactions.

## 3. Mandatory Backend Commands

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Full build: `npm run build`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- End-to-end tests: `npm run test:e2e`
- Prisma generate: `npm run prisma:generate`
- Prisma migrate: `npm run prisma:migrate`

Always run `npm run typecheck` and relevant tests before completing tasks.
