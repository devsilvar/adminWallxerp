# Observability, Logging & Monitoring

## 1. Logging Architecture (Winston & Morgan)

PayMyTax employs a structured logging pipeline:
- **Development**: Colorized, human-readable console output.
- **Production**: Machine-readable JSON logs with daily file rotation (`logs/app-%DATE%.log`) and unhandled exception capture (`logs/exceptions.log`).
- **HTTP Request Logging**: Morgan logs incoming HTTP methods, URLs, status codes, response times, and IP addresses, piped directly to Winston.

### Standard Log Entry Shape
```json
{
  "timestamp": "2026-10-07T05:30:15.120Z",
  "level": "info",
  "message": "Credit sale issued successfully",
  "context": {
    "businessId": "b1a2-...",
    "userId": "u9f4-...",
    "creditId": "c3e8-...",
    "totalAmount": 150000.00
  }
}
```

---

## 2. Sensitive Information & Masking Rules

**STRICT PROHIBITION**: The following data classes MUST NEVER be logged under any circumstance:
1. **Passwords & PINs**: Plaintext or hashed user passwords and 4-digit transaction PINs.
2. **Identity Credentials**: Raw 11-digit Bank Verification Numbers (BVN) and National Identification Numbers (NIN). Only blind hashes (`bvnHash`) or masked identifiers (`***4321`) may be referenced.
3. **Secrets & Tokens**: Full JWT access/refresh tokens, Paystack API secret keys, and webhook signing secrets.
4. **Card / Account Details**: Full credit card PANs, CVVs, and raw authorization codes.

---

## 3. Error Monitoring & Alerting (Sentry)

- **Backend Integration**: Initialized via `@sentry/node` at process startup (`server.ts`). Captures unhandled promise rejections, uncaught exceptions, and HTTP 5xx responses.
- **Frontend Integration**: Captures React error boundaries and failed network requests.
- **Alerting Thresholds**:
  - Immediate Slack/Email alert on Paystack webhook verification failures (potential attack).
  - Immediate alert on Solvency Oracle rejections during nightly auto-sweeps.
  - Alert on repeated PIN lockout thresholds (potential brute-force attempt).

---

## 4. Audit Logging (`AuditLog`)

In addition to operational logs, all state-altering actions create immutable database audit rows via `logAudit()`:
- Fields: `userId`, `businessId`, `action`, `oldData`, `newData`, `ipAddress`, `userAgent`, `createdAt`.
- Monitored Actions: `auth.login`, `tax.finalized`, `credit.created`, `credit.written_off`, `wallet.withdrawal_requested`, `team.member_removed`, `team.permissions_updated`.
- Admin Querying: Platform administrators can review audit logs via `/api/v1/admin/audit-logs`.
