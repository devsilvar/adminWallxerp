# Feature Specification: Electronic Invoicing Lifecycle

## 1. Objective & User Stories
Provide SME businesses with full-lifecycle customer invoicing, FIRS-compliant VAT calculations, multi-channel electronic dispatch, and atomic revenue booking upon settlement.

**User Stories:**
- As a business owner, I want to create branded invoices with auto-sequenced numbering (`INV-{YYYY}-{NNN}`) so that billing is orderly and professional.
- As a merchant, I want to email PDF invoices directly to my client or share a pre-formatted WhatsApp link with one click.
- As a bookkeeper, I want marking an invoice as paid to automatically book a confirmed sales transaction into our ledger and tax calculation.

---

## 2. Invoicing Lifecycle & State Machine

```
               ┌─────────────┐
               │    Draft    │
               └──────┬──────┘
                      │ send / send-email / send-whatsapp
                      ▼
               ┌─────────────┐
        ┌──────┤    Sent     ├──────┐
        │      └──────┬──────┘      │
        │             │             │
        ▼             ▼             ▼
  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Cancelled │ │  Overdue  │ │   Paid    │ ──> Auto-creates SalesTransaction
  └───────────┘ └───────────┘ └───────────┘
```

1. **Create Invoice** (`status: draft`):
   - Computes sequential invoice ID: `INV-{YYYY}-{NNN}`.
   - Calculates totals server-side:
     - `subtotal = Σ(quantity × unitPrice)`
     - `taxableAmount = subtotal − discountAmount`
     - `vatAmount = taxableAmount × vatRate%`
     - `total = taxableAmount + vatAmount`
   - Snapshots customer details on the invoice row.
2. **Delivery Methods**:
   - **Offline Confirm** (`POST /:id/send`): Moves status to `sent`.
   - **Email Dispatch** (`POST /:id/send-email`): Renders PDF via PDFKit, attaches file, dispatches via Resend, and sends owner confirmation copy.
   - **WhatsApp Link** (`POST /:id/send-whatsapp`): Normalizes phone to E.164 (`234803...`) and returns a pre-formatted `wa.me` deep link.
3. **Settlement** (`POST /:id/mark-paid`):
   - Flips status to `paid` and records `paidAt`.
   - Atomically inserts a `SalesTransaction` (`source: manual`, `status: confirmed`, `amount: invoice.total`, `referenceId: invoiceNumber`, `linkedSaleId`).
   - Asserts that payment date does not fall into a locked tax month.
4. **PDF Rendering** (`GET /:id/pdf`):
   - Streams an A4 PDF document generated server-side with business branding, customer details, zebra-striped line table, totals breakdown, and FIRS compliance notices.

---

## 3. Business Rules & Constraints
- Only `draft` invoices can be edited or deleted.
- Once marked `paid`, an invoice cannot be cancelled (revenue is legally recognized).
- The payment date cannot be earlier than the invoice issue date.
- Unique constraint `(businessId, invoiceNumber)` prevents concurrent numbering collisions.

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] Totals match mathematical invariants (`subtotal - discount + vat = total`).
- [ ] Marking an invoice as paid creates a matching `SalesTransaction` with `linkedSaleId`.
- [ ] Second mark-paid attempt fails due to unique foreign key constraint.
- [ ] Attempting to mark paid into a locked tax month throws `423 PERIOD_LOCKED`.
