# API Contracts & Integration Specifications

## 1. Protocol & Response Standards

- **Base URL**: `/api/v1`
- **Transport**: HTTPS / JSON
- **Authentication**: Bearer Token in `Authorization` header (`Bearer <JWT_ACCESS_TOKEN>`)
- **Version Lifecycle**: `/api/v1` is the active production interface.

### Standard Response Envelope
All API endpoints return a uniform JSON envelope:

```json
// Standard Success (200 OK, 201 Created)
{
  "success": true,
  "message": "Resource created successfully",
  "data": { ... }
}

// Standard Paginated Success
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}

// Standard Error (4xx, 5xx)
{
  "error": {
    "code": "PERIOD_LOCKED",
    "message": "Cannot modify transactions in a closed or finalized tax period.",
    "details": { ... }
  }
}
```

---

## 2. Authentication & Session Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Create new business owner account |
| `POST` | `/auth/login` | Public | Authenticate user, returns access & refresh tokens |
| `POST` | `/auth/refresh` | Public | Rotates expired access token using valid refresh token |
| `GET` | `/auth/me` | Authenticated | Retrieves current profile, KYC state, and businesses |
| `POST` | `/auth/change-password`| Authenticated | Updates account password |
| `POST` | `/auth/forgot-password`| Public | Requests password reset email |
| `POST` | `/auth/reset-password` | Public | Resets password via secure token |

---

## 3. Business & Team Endpoints

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses` | Authenticated | List all businesses owned or accessible by user |
| `POST` | `/businesses` | Owner Only | Register a new business |
| `GET` | `/businesses/:id` | Team Member | Retrieve business metadata and tax profile |
| `PATCH` | `/businesses/:id` | Manager / Owner | Update business details and default profit margin |
| `DELETE` | `/businesses/:id` | Owner Only | Hard delete business and cascade child records |
| `GET` | `/businesses/:id/team` | Team Member | Roster listing active members and pending invites |
| `POST` | `/businesses/:id/team/invite` | Manager / Owner | Invite staff member (enforces 3-seat cap & org boundary) |
| `PATCH` | `/businesses/:id/team/:memberId`| Manager / Owner | Update member role or permission overrides |
| `DELETE` | `/businesses/:id/team/:memberId`| Manager / Owner | Remove member from business team |

---

## 4. Sales & Bulk Ingestion Endpoints

| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses/:id/sales` | `sales.read` | Filtered, paginated sales transactions |
| `POST` | `/businesses/:id/sales` | `sales.create` | Record new sale (manual, POS, counter) |
| `GET` | `/businesses/:id/sales/:saleId`| `sales.read` | Transaction details + line items |
| `PATCH`| `/businesses/:id/sales/:saleId`| `sales.update` | Update sale (requires unlocked month) |
| `DELETE`| `/businesses/:id/sales/:saleId`| `sales.delete` | Delete sale (requires unlocked month) |
| `GET` | `/businesses/:id/sales/summary`| `sales.read` | Aggregate month-to-date sales figures |
| `GET` | `/businesses/:id/sales/import/template` | `sales.create` | Download dynamic `.xlsx` bulk import template |
| `POST`| `/businesses/:id/sales/import/preview`  | `sales.create` | Upload Excel/CSV buffer for parse & preview validation |
| `POST`| `/businesses/:id/sales/import/commit`   | `sales.create` | Commit validated batch to database |

---

## 5. Invoicing Endpoints

| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses/:id/invoices` | `invoices.read` | List invoices with status filter |
| `POST` | `/businesses/:id/invoices` | `invoices.create` | Create draft invoice with auto-generated ID |
| `GET` | `/businesses/:id/invoices/:invId` | `invoices.read` | Retrieve full invoice details |
| `PATCH`| `/businesses/:id/invoices/:invId` | `invoices.update` | Update draft invoice |
| `POST` | `/businesses/:id/invoices/:invId/send` | `invoices.send` | Mark invoice as sent (offline delivery) |
| `POST` | `/businesses/:id/invoices/:invId/send-email` | `invoices.send` | Generate PDF and email to customer |
| `POST` | `/businesses/:id/invoices/:invId/send-whatsapp`| `invoices.send`| Returns pre-filled WhatsApp deep link |
| `POST` | `/businesses/:id/invoices/:invId/mark-paid` | `invoices.update` | Mark invoice paid & atomically create linked sale |
| `POST` | `/businesses/:id/invoices/:invId/cancel` | `invoices.update` | Cancel unpaid invoice |
| `GET` | `/businesses/:id/invoices/:invId/pdf` | `invoices.read` | Download official A4 PDF invoice |

---

## 6. Credit Sales & Debtors Endpoints

| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses/:id/credits` | `credits.read` | List debtor accounts, balances, and due dates |
| `POST` | `/businesses/:id/credits` | `credits.create` | Issue credit sale (books revenue under accrual) |
| `GET` | `/businesses/:id/credits/:creditId` | `credits.read` | View credit ledger and installment history |
| `POST` | `/businesses/:id/credits/:creditId/payments` | `credits.record_payment` | Record debt repayment (reduces balance; NO new sale) |
| `POST` | `/businesses/:id/credits/:creditId/write-off` | `credits.write_off` | Write off debt (creates CITA §25 bad debt expense) |
| `POST` | `/businesses/:id/credits/:creditId/reconcile-dva`| `credits.reconcile`| Reconcile inbound DVA transfer to credit |

---

## 7. Tax Engine & Reporting Endpoints

| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses/:id/tax/calculate` | `tax.calculate` | Live preview of tax liability for year/month |
| `GET` | `/businesses/:id/tax/reports` | `tax.read` | List all monthly tax reports |
| `POST` | `/businesses/:id/tax/reports/finalize`| `tax.finalize`| Finalize month report & lock period |
| `POST` | `/businesses/:id/tax/reports/nil` | `tax.finalize` | Submit formal statutory Nil Return |
| `POST` | `/businesses/:id/tax/pay` | Owner Only | Initialize Paystack tax remittance transaction |
| `GET` | `/businesses/:id/statements/pdf` | `tax.read` | Download official monthly/annual PDF statement |

---

## 8. Central Wallet & Payout Endpoints

| Method | Endpoint | Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/wallet` | Owner Only | Retrieve central wallet balance and recent activity |
| `POST` | `/wallet/set-pin` | Owner Only | Set initial 4-digit transaction PIN |
| `POST` | `/wallet/change-pin` | Owner Only | Update transaction PIN with current PIN check |
| `POST` | `/wallet/settlement-account` | Owner Only | Connect and verify commercial settlement bank |
| `POST` | `/wallet/withdraw` | Owner Only | Request outbound payout (requires PIN + Solvency) |
| `POST` | `/wallet/toggle-auto-payout` | Owner Only | Toggle automatic nightly transfer sweeps |

---

## 9. Error Codes & Contract Mappings

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Request failed Zod schema validation (field details in payload) |
| `401` | `UNAUTHORIZED` | Token missing, expired, or invalid signature |
| `403` | `FORBIDDEN` | Caller lacks role permission or violates organization boundary |
| `404` | `NOT_FOUND` | Requested entity does not exist |
| `409` | `DUPLICATE_ENTRY` | Unique constraint conflict (e.g. invoice number, reference) |
| `423` | `PERIOD_LOCKED` | Action rejected because the target calendar month is finalized |
| `429` | `RATE_LIMIT_EXCEEDED` | Exceeded endpoint rate limit threshold |
| `500` | `INTERNAL_SERVER_ERROR`| Unhandled server exception |
