# Quality & Testing Strategy

## 1. Test Tiers & Organization

Testing in PayMyTax is structured across three distinct tiers:

```
backend/tests/
├── unit/                 # Fast, isolated tests mocking external dependencies
│   ├── canonical-helpers.test.ts
│   ├── org-boundary.test.ts
│   ├── paystack-fees.test.ts
│   └── solvency-oracle.test.ts
├── integration/          # Real database tests with transactional rollbacks
│   ├── tax-finalization-gate.test.ts
│   ├── debtor-dva-reconciliation-and-edit.test.ts
│   └── auto-sweep-live.test.ts
└── e2e/                  # End-to-end API workflows with Supertest
    ├── team-permissions.e2e.test.ts
    └── team-multi-business.e2e.test.ts
```

Frontend unit and component tests reside in `frontend/src/pages/__tests__/` and are executed via Vitest.

---

## 2. Test Execution Commands

### Backend (`cd backend`)
- **Unit Tests**: `npm run test:unit`
- **Integration Tests**: `npm run test:integration` (runs with `--runInBand` and 30s timeout)
- **E2E Tests**: `npm run test:e2e` (runs with `--runInBand` and 60s timeout)
- **Email Dispatch Tests**: `npm run test:emails`
- **Security & QA Audit**: `npm run audit:qa-exposure`

### Frontend (`cd frontend`)
- **Vitest Suite**: `npm run test`
- **Watch Mode**: `npm run test:watch`

---

## 3. Critical Flows Requiring Mandatory Tests

1. **Tax Finalization & Month-Lock Gate**:
   - Verify that adding, updating, or deleting sales and expenses in a finalized month throws `423 PERIOD_LOCKED`.
   - Verify Nil Return behavior when gross profit is negative or zero.
2. **Accrual Debtors & Reconciliations**:
   - Verify that credit sales record revenue immediately upon issuance.
   - Verify that manual debt repayments NEVER create a duplicate `SalesTransaction`.
   - Verify that reconciling a DVA bank transfer flips `isTaxable = false`.
   - Verify that bad debt write-offs create deductible `bad_debt` expenses without mutating historical revenue.
3. **Team RBAC & Organization Boundary**:
   - Verify that an owner can invite users across multiple businesses they own.
   - Verify that cross-owner invitations are strictly rejected.
   - Verify 3-seat cap enforcement per business.
   - Verify that `sales_staff` only see their own sales plus DVA counter transfers.
4. **Solvency Oracle & Payout Security**:
   - Verify that 3 failed PIN attempts trigger a 15-minute lockout (`423 PIN_LOCKED`).
   - Verify that withdrawal requests exceeding wallet balance are blocked.
   - Verify that non-owners cannot initiate withdrawals or alter settlement banks.

---

## 4. Mocking Guidelines & Fixtures

- **Database**: Integration tests execute against a dedicated test database or use isolated transaction rollbacks.
- **Paystack & External APIs**: Never call live third-party endpoints in unit tests. Mock external calls using `jest.spyOn()` or Axios mock adapters.
- **Email Dispatch**: Resend dispatch must be mocked or allow fallback to Winston logger during automated test runs.
- **Time Freezing**: Use `jest.useFakeTimers()` or explicit UTC date parameters when asserting time-dependent policies (e.g. 15-minute PIN lockout, debtor reminder cooldowns).
