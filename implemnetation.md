# PayMyTax by WallX - Complete Project Documentation

**SME Tax Calculation, Reporting & Remittance Platform**

**Version:** 1.1 (Reviewed & Hardened)
**Last Updated:** March 22, 2026
**Target Launch:** Q2 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [API Design](#api-design)
6. [Frontend Architecture](#frontend-architecture)
7. [Security Implementation](#security-implementation)
8. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
9. [Deployment Guide](#deployment-guide)
10. [Migration to DigitalOcean](#migration-to-digitalocean)
11. [Monitoring & Maintenance](#monitoring-and-maintenance)
12. [Cost Analysis](#cost-analysis)
13. [Critical Architectural Decisions](#critical-architectural-decisions-added-in-review)

---

## Project Overview

### Purpose

PayMyTax enables **small businesses (SMEs/MSMEs)** to:
- Calculate monthly tax obligations automatically
- Generate tax statements
- Remit taxes directly to FIRS (Federal Inland Revenue Service)

### Tax Calculation Formula

```
Tax Payable = 7.5% of Gross Profit

Where:
Gross Profit = Total Monthly Sales − Total Monthly Expenses

If Gross Profit ≤ 0, then Tax Payable = 0
```

### Target Users

- Small business owners
- Retailers & market traders
- Online sellers
- SMEs using digital payment tools
- WallX payment ecosystem users

### Core Features

1. **Monthly Sales Capture** - Automatic and manual entry
2. **Expense Recording** - Simple expense tracking
3. **Tax Calculation** - Automated computation
4. **Tax Dashboard** - Visual summary of obligations
5. **Payment Integration** - Direct FIRS remittance via Paystack
6. **PDF Statements** - Downloadable tax reports
7. **Notifications** - Email/SMS reminders

---

## Technology Stack

### Frontend Stack

```javascript
Core Framework:
- React 19+ (with Hooks & Suspense)
- Vite lates (Build tool - faster than CRA)
- TypeScript 5.x (Type safety for fintech)

State Management:
- Zustand (Lightweight global state)
- TanStack Query v5 (Server state & caching)
- Jotai (Atomic state for complex UI)

Routing:
- React Router v6

UI & Styling:
- Tailwind CSS 4.x
- shadcn/ui (Accessible components)
- Radix UI (Headless primitives)
- Framer Motion (Animations)

Forms & Validation:
- React Hook Form (Performance optimized)
- Zod (TypeScript-first validation)

Data Visualization:
- Recharts (Charts & graphs)
- date-fns (Date manipulation)

PDF Generation:
- @react-pdf/renderer (Client-side PDFs)
- OR backend Puppeteer for complex reports

API Client:
- Axios with interceptors
- TanStack Query fetch wrapper

Testing:
- Vitest (Unit/integration tests)
- React Testing Library
- Playwright (E2E tests)
```

### Backend Stack

```javascript
Runtime & Framework:
- Node.js 20 LTS
- Express.js 4.x (Web framework)
- TypeScript 5.x

Database:
- PostgreSQL 16+ (via Neon)
- Prisma ORM (Type-safe queries)

Caching & Queue:
- Redis 7.x (Upstash for serverless)
- Bull MQ (Background jobs)

Authentication & Security:
- JWT (Access/refresh tokens)
- bcrypt (Password hashing)
- helmet (Security headers)
- express-rate-limit
- CORS with strict origins

File Storage:
- DigitalOcean Spaces (S3-compatible)
- AWS SDK S3 Client

Payment Integration:
- Paystack Node SDK

Email & SMS:
- Resend (Email - can migrate to SendGrid)
- Termii (SMS for Nigeria)

Monitoring & Logging:
- Winston (Structured logging)
- Sentry (Error tracking)
- Morgan (HTTP logging)

PDF Generation:
- PDFKit (Node.js PDF generation)
- OR Puppeteer (HTML to PDF)
```

### Infrastructure

```yaml
Frontend Hosting:  Vercel (React SPA)
Backend Hosting:   Render (Node.js)
Database:          Neon (Serverless PostgreSQL)
File Storage:      DigitalOcean Spaces
Cache:             Upstash Redis
CDN:               Cloudflare (optional)
Domain:            Namecheap/Cloudflare

Future Migration:  DigitalOcean (all services)
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  CLIENT LAYER                           │
│         React SPA (Vite + TypeScript)                   │
│         Hosted on: Vercel                               │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTPS
┌─────────────────────────────────────────────────────────┐
│              API GATEWAY / BACKEND                      │
│         Node.js + Express + TypeScript                  │
│         Hosted on: Render                               │
│                                                          │
│  Routes:                                                 │
│  - /api/v1/auth        (Authentication)                 │
│  - /api/v1/businesses  (Business management)            │
│  - /api/v1/sales       (Sales transactions)             │
│  - /api/v1/expenses    (Expense tracking)               │
│  - /api/v1/tax         (Tax calculations)               │
│  - /api/v1/payments    (Payment processing)             │
│  - /api/v1/reports     (PDF generation)                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              DATA & STORAGE LAYER                       │
│                                                          │
│  PostgreSQL (Neon)  │  Redis (Upstash)  │  DO Spaces   │
│  - Users            │  - Sessions       │  - Tax PDFs  │
│  - Businesses       │  - Rate limits    │  - Receipts  │
│  - Transactions     │  - Job queue      │              │
│  - Tax Reports      │                   │              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│            EXTERNAL INTEGRATIONS                        │
│  Paystack │ FIRS API │ Resend │ Termii                 │
└─────────────────────────────────────────────────────────┘
```

### Application Flow

```
User Journey:
1. User logs into dashboard
2. System fetches/displays monthly sales
3. User records expenses
4. System calculates gross profit & tax
5. User reviews tax summary
6. User initiates payment to FIRS
7. System generates PDF statement
8. User downloads/emails statement
```

---

## Database Design

### PostgreSQL Schema (Neon)

#### Enums

```sql
-- Payment methods
CREATE TYPE payment_method AS ENUM (
  'wallet', 
  'bank_transfer', 
  'card', 
  'paycode'
);

-- Payment statuses
CREATE TYPE payment_status AS ENUM (
  'pending', 
  'processing', 
  'completed', 
  'failed', 
  'refunded'
);

-- Sales sources
CREATE TYPE sales_source AS ENUM (
  'bank_transfer',
  'paycode',
  'pos',
  'online_store',
  'manual'
);

-- Sales transaction status (needed for reconciliation & chargeback handling)
CREATE TYPE transaction_status AS ENUM (
  'confirmed',
  'pending',
  'reversed',
  'disputed'
);

-- Expense categories
CREATE TYPE expense_category AS ENUM (
  'rent',
  'inventory',
  'salary',
  'utility',
  'fuel',
  'logistics',
  'marketing',
  'other'
);
```

#### Core Tables

```sql
-- 1. Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);

-- 2. Businesses Table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Business Details
  business_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(50) UNIQUE, -- TIN from FIRS
  business_type VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  
  -- Paystack Integration
  paystack_customer_code VARCHAR(100),
  virtual_account_number VARCHAR(20),
  virtual_account_bank VARCHAR(100),
  
  -- Settings
  default_profit_margin DECIMAL(5,2) DEFAULT 20.00,
  tax_reminder_day INTEGER DEFAULT 25, -- Day of month
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_businesses_user_id ON businesses(user_id);
CREATE INDEX idx_businesses_tax_id ON businesses(tax_id);

-- 3. Sales Transactions Table
CREATE TABLE sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  source sales_source NOT NULL,
  status transaction_status NOT NULL DEFAULT 'confirmed', -- Track confirmation state
  reference_id VARCHAR(100), -- External transaction reference
  description TEXT,
  customer_name VARCHAR(255),

  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Audit
  created_by UUID REFERENCES users(id),
  metadata JSONB -- Flexible storage
);

CREATE INDEX idx_sales_business_date ON sales_transactions(business_id, transaction_date DESC);
CREATE INDEX idx_sales_reference ON sales_transactions(reference_id);
-- Prevent duplicate auto-imported transactions from same source
CREATE UNIQUE INDEX idx_sales_dedup ON sales_transactions(business_id, source, reference_id)
  WHERE reference_id IS NOT NULL;

-- 4. Expenses Table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  
  expense_date DATE NOT NULL,
  receipt_url TEXT, -- Optional receipt upload
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_expenses_business_date ON expenses(business_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);

-- 5. Monthly Tax Reports Table
CREATE TABLE monthly_tax_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  tax_month DATE NOT NULL, -- First day of month (2026-03-01)
  
  -- Calculations
  total_sales DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(15,2) NOT NULL DEFAULT 0,
  gross_profit DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 7.5,
  tax_payable DECIMAL(15,2) NOT NULL DEFAULT 0,
  
  -- Metrics
  profit_margin DECIMAL(5,2),
  
  -- Status
  payment_status payment_status DEFAULT 'pending',
  is_finalized BOOLEAN DEFAULT FALSE, -- Once finalized, no edits to sales/expenses for this month
  is_locked BOOLEAN DEFAULT FALSE, -- Set to TRUE after payment. Immutable once locked.
  locked_at TIMESTAMPTZ, -- Timestamp of when the report was locked after payment

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, tax_month)
);

CREATE INDEX idx_tax_reports_business_month ON monthly_tax_reports(business_id, tax_month DESC);
CREATE INDEX idx_tax_reports_status ON monthly_tax_reports(payment_status);

-- 6. Tax Payments Table
CREATE TABLE tax_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  tax_report_id UUID REFERENCES monthly_tax_reports(id) ON DELETE CASCADE,
  
  amount_paid DECIMAL(15,2) NOT NULL CHECK (amount_paid > 0),
  payment_method payment_method NOT NULL,
  
  -- Payment Gateway
  transaction_reference VARCHAR(100) UNIQUE NOT NULL,
  gateway_response JSONB, -- Store full Paystack response
  
  payment_status payment_status DEFAULT 'pending',
  payment_date TIMESTAMPTZ,
  
  -- FIRS Integration
  firs_remittance_ref VARCHAR(100),
  firs_receipt_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_business ON tax_payments(business_id);
CREATE INDEX idx_payments_reference ON tax_payments(transaction_reference);
CREATE INDEX idx_payments_status ON tax_payments(payment_status);

-- 7. Tax Statements Table (PDF Storage)
CREATE TABLE tax_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  tax_report_id UUID REFERENCES monthly_tax_reports(id) ON DELETE CASCADE,
  
  pdf_url TEXT NOT NULL,
  pdf_size_bytes INTEGER,
  
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- For signed URLs
  
  UNIQUE(tax_report_id)
);

CREATE INDEX idx_statements_business ON tax_statements(business_id);

-- 8. Audit Logs Table (APPEND-ONLY — no updates or deletes allowed)
-- IMPORTANT: Application layer MUST NOT expose UPDATE/DELETE on this table.
-- Consider a DB-level rule to enforce immutability:
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  business_id UUID REFERENCES businesses(id),

  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,

  old_data JSONB,
  new_data JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent updates and deletes at DB level for compliance
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- Retention: Partition by month if volume grows. Keep minimum 7 years for tax compliance.
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_business ON audit_logs(business_id, created_at DESC);

-- 9. Reminders Table
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  reminder_type VARCHAR(50) NOT NULL,
  scheduled_date DATE NOT NULL,
  
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  
  message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_date, is_sent);
```

#### Database Functions

```sql
-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at 
  BEFORE UPDATE ON businesses 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at
  BEFORE UPDATE ON sales_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_reports_updated_at 
  BEFORE UPDATE ON monthly_tax_reports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at 
  BEFORE UPDATE ON tax_payments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PaymentMethod {
  wallet
  bank_transfer
  card
  paycode
}

enum PaymentStatus {
  pending
  processing
  completed
  failed
  refunded
}

enum SalesSource {
  bank_transfer
  paycode
  pos
  online_store
  manual
}

enum ExpenseCategory {
  rent
  inventory
  salary
  utility
  fuel
  logistics
  marketing
  other
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String    @map("password_hash")
  phone        String?   @unique
  isVerified   Boolean   @default(false) @map("is_verified")
  isActive     Boolean   @default(true) @map("is_active")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  businesses Business[]
  auditLogs  AuditLog[]

  @@index([email])
  @@map("users")
}

model Business {
  id                     String   @id @default(uuid())
  userId                 String   @map("user_id")
  businessName           String   @map("business_name")
  ownerName              String   @map("owner_name")
  taxId                  String?  @unique @map("tax_id")
  businessType           String?  @map("business_type")
  address                String?
  city                   String?
  state                  String?
  paystackCustomerCode   String?  @map("paystack_customer_code")
  virtualAccountNumber   String?  @map("virtual_account_number")
  virtualAccountBank     String?  @map("virtual_account_bank")
  defaultProfitMargin    Decimal  @default(20.00) @map("default_profit_margin") @db.Decimal(5, 2)
  taxReminderDay         Int      @default(25) @map("tax_reminder_day")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  user              User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  sales             SalesTransaction[]
  expenses          Expense[]
  taxReports        MonthlyTaxReport[]
  payments          TaxPayment[]
  statements        TaxStatement[]
  reminders         Reminder[]
  auditLogs         AuditLog[]

  @@index([userId])
  @@map("businesses")
}

enum TransactionStatus {
  confirmed
  pending
  reversed
  disputed
}

model SalesTransaction {
  id              String            @id @default(uuid())
  businessId      String            @map("business_id")
  amount          Decimal           @db.Decimal(15, 2)
  source          SalesSource
  status          TransactionStatus @default(confirmed)
  referenceId     String?           @map("reference_id")
  description     String?
  customerName    String?           @map("customer_name")
  transactionDate DateTime          @map("transaction_date") @db.Date
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  createdBy       String?           @map("created_by")
  metadata        Json?

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, transactionDate(sort: Desc)])
  @@index([referenceId])
  @@map("sales_transactions")
}

model Expense {
  id          String          @id @default(uuid())
  businessId  String          @map("business_id")
  category    ExpenseCategory
  description String
  amount      Decimal         @db.Decimal(15, 2)
  expenseDate DateTime        @map("expense_date") @db.Date
  receiptUrl  String?         @map("receipt_url")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")
  createdBy   String?         @map("created_by")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, expenseDate(sort: Desc)])
  @@index([category])
  @@map("expenses")
}

model MonthlyTaxReport {
  id             String        @id @default(uuid())
  businessId     String        @map("business_id")
  taxMonth       DateTime      @map("tax_month") @db.Date
  totalSales     Decimal       @default(0) @map("total_sales") @db.Decimal(15, 2)
  totalExpenses  Decimal       @default(0) @map("total_expenses") @db.Decimal(15, 2)
  grossProfit    Decimal       @default(0) @map("gross_profit") @db.Decimal(15, 2)
  taxRate        Decimal       @default(7.5) @map("tax_rate") @db.Decimal(5, 2)
  taxPayable     Decimal       @default(0) @map("tax_payable") @db.Decimal(15, 2)
  profitMargin   Decimal?      @map("profit_margin") @db.Decimal(5, 2)
  paymentStatus  PaymentStatus @default(pending) @map("payment_status")
  isFinalized    Boolean       @default(false) @map("is_finalized")
  isLocked       Boolean       @default(false) @map("is_locked")
  lockedAt       DateTime?     @map("locked_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  business  Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  payments  TaxPayment[]
  statement TaxStatement?

  @@unique([businessId, taxMonth])
  @@index([businessId, taxMonth(sort: Desc)])
  @@index([paymentStatus])
  @@map("monthly_tax_reports")
}

model TaxPayment {
  id                   String        @id @default(uuid())
  businessId           String        @map("business_id")
  taxReportId          String        @map("tax_report_id")
  amountPaid           Decimal       @map("amount_paid") @db.Decimal(15, 2)
  paymentMethod        PaymentMethod @map("payment_method")
  transactionReference String        @unique @map("transaction_reference")
  gatewayResponse      Json?         @map("gateway_response")
  paymentStatus        PaymentStatus @default(pending) @map("payment_status")
  paymentDate          DateTime?     @map("payment_date")
  firsRemittanceRef    String?       @map("firs_remittance_ref")
  firsReceiptUrl       String?       @map("firs_receipt_url")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")

  business  Business         @relation(fields: [businessId], references: [id], onDelete: Cascade)
  taxReport MonthlyTaxReport @relation(fields: [taxReportId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@index([transactionReference])
  @@index([paymentStatus])
  @@map("tax_payments")
}

model TaxStatement {
  id           String    @id @default(uuid())
  businessId   String    @map("business_id")
  taxReportId  String    @unique @map("tax_report_id")
  pdfUrl       String    @map("pdf_url")
  pdfSizeBytes Int?      @map("pdf_size_bytes")
  generatedAt  DateTime  @default(now()) @map("generated_at")
  expiresAt    DateTime? @map("expires_at")

  business  Business         @relation(fields: [businessId], references: [id], onDelete: Cascade)
  taxReport MonthlyTaxReport @relation(fields: [taxReportId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@map("tax_statements")
}

model AuditLog {
  id           String    @id @default(uuid())
  userId       String?   @map("user_id")
  businessId   String?   @map("business_id")
  action       String
  resourceType String?   @map("resource_type")
  resourceId   String?   @map("resource_id")
  oldData      Json?     @map("old_data")
  newData      Json?     @map("new_data")
  ipAddress    String?   @map("ip_address")
  userAgent    String?   @map("user_agent")
  createdAt    DateTime  @default(now()) @map("created_at")

  user     User?     @relation(fields: [userId], references: [id])
  business Business? @relation(fields: [businessId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([businessId, createdAt(sort: Desc)])
  @@map("audit_logs")
}

model Reminder {
  id            String    @id @default(uuid())
  businessId    String    @map("business_id")
  reminderType  String    @map("reminder_type")
  scheduledDate DateTime  @map("scheduled_date") @db.Date
  isSent        Boolean   @default(false) @map("is_sent")
  sentAt        DateTime? @map("sent_at")
  message       String?
  createdAt     DateTime  @default(now()) @map("created_at")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([scheduledDate, isSent])
  @@map("reminders")
}
```

---

## API Design

### Base URL Structure

```
Production:  https://api.paymytax.ng/v1
Development: http://localhost:3000/api/v1
```

### Authentication

All protected endpoints require JWT Bearer token:

```http
Authorization: Bearer <access_token>
```

### API Endpoints

#### Authentication & User Management

```typescript
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh-token
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/verify-email
GET    /api/v1/auth/me
PUT    /api/v1/auth/update-profile
PUT    /api/v1/auth/change-password
```

**Example: Register**
```json
POST /api/v1/auth/register
{
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone": "+2348012345678",
  "fullName": "John Doe"
}

Response:
{
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "phone": "+2348012345678",
    "isVerified": false
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Business Management

```typescript
GET    /api/v1/businesses
POST   /api/v1/businesses
GET    /api/v1/businesses/:id
PUT    /api/v1/businesses/:id
DELETE /api/v1/businesses/:id
POST   /api/v1/businesses/:id/setup-virtual-account
```

**Example: Create Business**
```json
POST /api/v1/businesses
{
  "businessName": "ABC Retail Store",
  "ownerName": "John Doe",
  "taxId": "12345678-0001",
  "businessType": "Retail",
  "address": "123 Market Street",
  "city": "Lagos",
  "state": "Lagos",
  "defaultProfitMargin": 25
}

Response:
{
  "id": "uuid",
  "businessName": "ABC Retail Store",
  "ownerName": "John Doe",
  "taxId": "12345678-0001",
  "createdAt": "2026-03-19T10:00:00Z"
}
```

#### Sales Transactions

```typescript
GET    /api/v1/businesses/:id/sales
POST   /api/v1/businesses/:id/sales
GET    /api/v1/businesses/:id/sales/:saleId
PUT    /api/v1/businesses/:id/sales/:saleId
DELETE /api/v1/businesses/:id/sales/:saleId
POST   /api/v1/businesses/:id/sales/bulk-import
GET    /api/v1/businesses/:id/sales/summary
```

**Query Parameters for GET /sales:**
```
?month=2026-03         // Filter by month
?source=pos            // Filter by source
?startDate=2026-03-01  // Date range
?endDate=2026-03-31
?page=1
&limit=20
```

**Example: Add Sale**
```json
POST /api/v1/businesses/:id/sales
{
  "amount": 150000,
  "source": "pos",
  "transactionDate": "2026-03-15",
  "description": "Electronics sale",
  "customerName": "Jane Smith"
}

Response:
{
  "id": "uuid",
  "amount": 150000,
  "source": "pos",
  "transactionDate": "2026-03-15",
  "createdAt": "2026-03-15T14:30:00Z"
}
```

#### Expenses

```typescript
GET    /api/v1/businesses/:id/expenses
POST   /api/v1/businesses/:id/expenses
GET    /api/v1/businesses/:id/expenses/:expenseId
PUT    /api/v1/businesses/:id/expenses/:expenseId
DELETE /api/v1/businesses/:id/expenses/:expenseId
GET    /api/v1/businesses/:id/expenses/summary
GET    /api/v1/businesses/:id/expenses/by-category
```

**Example: Add Expense**
```json
POST /api/v1/businesses/:id/expenses
{
  "category": "rent",
  "description": "Shop rent for March",
  "amount": 50000,
  "expenseDate": "2026-03-01"
}

Response:
{
  "id": "uuid",
  "category": "rent",
  "description": "Shop rent for March",
  "amount": 50000,
  "expenseDate": "2026-03-01",
  "createdAt": "2026-03-01T10:00:00Z"
}
```

#### Tax Calculations & Reports

```typescript
POST   /api/v1/businesses/:id/tax/calculate
GET    /api/v1/businesses/:id/tax/reports
GET    /api/v1/businesses/:id/tax/reports/:month
POST   /api/v1/businesses/:id/tax/reports/:reportId/finalize
GET    /api/v1/businesses/:id/tax/dashboard
```

**Example: Calculate Tax**
```json
POST /api/v1/businesses/:id/tax/calculate
{
  "month": "2026-03"
}

Response:
{
  "id": "uuid",
  "businessId": "uuid",
  "taxMonth": "2026-03-01",
  "totalSales": 1500000,
  "totalExpenses": 850000,
  "grossProfit": 650000,
  "taxRate": 7.5,
  "taxPayable": 48750,
  "profitMargin": 43.33,
  "paymentStatus": "pending"
}
```

#### Tax Payments

```typescript
POST   /api/v1/businesses/:id/tax/pay
GET    /api/v1/businesses/:id/tax/payments
GET    /api/v1/businesses/:id/tax/payments/:paymentId
GET    /api/v1/businesses/:id/tax/payments/:paymentId/verify
POST   /api/v1/webhooks/paystack
```

**Example: Initiate Payment**
```json
POST /api/v1/businesses/:id/tax/pay
{
  "taxReportId": "uuid",
  "paymentMethod": "wallet"
}

Response:
{
  "authorizationUrl": "https://checkout.paystack.com/xxxxx",
  "reference": "PMT-1711234567-abc123",
  "paymentId": "uuid"
}
```

#### Tax Statements (PDF)

```typescript
POST   /api/v1/businesses/:id/tax/statements/generate
GET    /api/v1/businesses/:id/tax/statements/:statementId/download
POST   /api/v1/businesses/:id/tax/statements/:statementId/email
```

**Example: Generate PDF**
```json
POST /api/v1/businesses/:id/tax/statements/generate
{
  "taxReportId": "uuid"
}

Response:
{
  "id": "uuid",
  "pdfUrl": "https://paymytax-documents.nyc3.cdn.digitaloceanspaces.com/...",
  "generatedAt": "2026-03-19T15:00:00Z"
}
```

#### Analytics

```typescript
GET    /api/v1/businesses/:id/analytics/monthly-trends
GET    /api/v1/businesses/:id/analytics/profit-margin
GET    /api/v1/businesses/:id/analytics/expense-breakdown
```

### Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be greater than 0"
      }
    ]
  }
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

---

## Frontend Architecture

### Project Structure

```
paymytax-web/
├── public/
│   ├── favicon.ico
│   └── logo.png
│
├── src/
│   ├── api/                    # API client & endpoints
│   │   ├── client.ts          # Axios instance
│   │   ├── auth.api.ts
│   │   ├── business.api.ts
│   │   ├── sales.api.ts
│   │   ├── expenses.api.ts
│   │   ├── tax.api.ts
│   │   └── payments.api.ts
│   │
│   ├── components/            # Reusable components
│   │   ├── ui/               # shadcn/ui base components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   └── dialog.tsx
│   │   │
│   │   ├── forms/            # Form components
│   │   │   ├── SalesForm.tsx
│   │   │   ├── ExpenseForm.tsx
│   │   │   └── PaymentForm.tsx
│   │   │
│   │   ├── charts/           # Chart components
│   │   │   ├── TaxTrendChart.tsx
│   │   │   ├── ExpenseChart.tsx
│   │   │   └── SalesChart.tsx
│   │   │
│   │   └── shared/           # Shared components
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       ├── Footer.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── features/             # Feature modules
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── pages/
│   │   ├── dashboard/
│   │   ├── sales/
│   │   ├── expenses/
│   │   ├── tax/
│   │   └── payments/
│   │
│   ├── hooks/                # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useBusiness.ts
│   │   ├── useMonthlyTax.ts
│   │   └── useDebounce.ts
│   │
│   ├── layouts/              # Page layouts
│   │   ├── AuthLayout.tsx
│   │   ├── DashboardLayout.tsx
│   │   └── PublicLayout.tsx
│   │
│   ├── lib/                  # Utilities
│   │   ├── utils.ts
│   │   ├── validators.ts
│   │   ├── formatters.ts
│   │   └── constants.ts
│   │
│   ├── pages/                # Route pages
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardPage.tsx
│   │   ├── sales/
│   │   │   ├── SalesListPage.tsx
│   │   │   └── AddSalePage.tsx
│   │   ├── expenses/
│   │   │   ├── ExpensesListPage.tsx
│   │   │   └── AddExpensePage.tsx
│   │   ├── tax/
│   │   │   ├── TaxDashboardPage.tsx
│   │   │   ├── TaxReportPage.tsx
│   │   │   └── PaymentHistoryPage.tsx
│   │   └── settings/
│   │       └── SettingsPage.tsx
│   │
│   ├── store/                # Global state (Zustand)
│   │   ├── authStore.ts
│   │   ├── businessStore.ts
│   │   └── uiStore.ts
│   │
│   ├── types/                # TypeScript types
│   │   ├── api.types.ts
│   │   ├── business.types.ts
│   │   ├── sales.types.ts
│   │   ├── expense.types.ts
│   │   └── tax.types.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

### Key Implementation Examples

#### API Client Setup

```typescript
// src/api/client.ts
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - attach token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh token
        const refreshToken = useAuthStore.getState().refreshToken;
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/auth/refresh-token`,
          { refreshToken }
        );

        const { accessToken } = response.data;
        useAuthStore.getState().setAccessToken(accessToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
```

#### Auth Store (Zustand)

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/api/client';

interface User {
  id: string;
  email: string;
  phone: string;
  isVerified: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        
        try {
          const response = await apiClient.post('/auth/login', {
            email,
            password,
          });

          const { user, accessToken, refreshToken } = response.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });

        try {
          const response = await apiClient.post('/auth/register', data);

          const { user, accessToken, refreshToken } = response.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setAccessToken: (token: string) => {
        set({ accessToken: token });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      // SECURITY NOTE: For a fintech app, consider storing tokens in httpOnly cookies
      // instead of localStorage to mitigate XSS attacks. This persist config is
      // acceptable for MVP but should be hardened before production launch.
      // Never persist refreshToken in localStorage in production — use httpOnly cookies.
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

#### Protected Route Component

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
```

#### Tax Dashboard Example

```typescript
// src/features/tax/pages/TaxDashboardPage.tsx
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { taxApi } from '@/api/tax.api';
import { formatCurrency } from '@/lib/formatters';
import { TaxTrendChart } from '@/components/charts/TaxTrendChart';
import { ExpenseChart } from '@/components/charts/ExpenseChart';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TaxDashboardPage = () => {
  const navigate = useNavigate();
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

  const { data: taxReport, isLoading, error } = useQuery({
    queryKey: ['tax-report', currentMonth],
    queryFn: () => taxApi.getMonthlyReport(currentMonth),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading tax report</p>
        </div>
      </div>
    );
  }

  const handlePayTax = () => {
    navigate(`/tax/pay/${taxReport.id}`);
  };

  const handleDownloadStatement = async () => {
    try {
      const statement = await taxApi.generateStatement(taxReport.id);
      window.open(statement.pdfUrl, '_blank');
    } catch (error) {
      console.error('Failed to generate statement:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tax Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadStatement}>
            Download Statement
          </Button>
          {taxReport.paymentStatus === 'pending' && (
            <Button onClick={handlePayTax}>
              Pay Tax to FIRS
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(taxReport.totalSales)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {currentMonth}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">
              {formatCurrency(taxReport.totalExpenses)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {currentMonth}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Gross Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {formatCurrency(taxReport.grossProfit)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {taxReport.profitMargin?.toFixed(2)}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Tax Payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {formatCurrency(taxReport.taxPayable)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {taxReport.taxRate}% of profit
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <TaxTrendChart data={taxReport.trends} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseChart data={taxReport.expenseBreakdown} />
          </CardContent>
        </Card>
      </div>

      {/* Payment Status */}
      {taxReport.paymentStatus === 'completed' && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-green-800 font-medium">
                Tax payment completed on {new Date(taxReport.paymentDate).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
```

---

## Security Implementation

### Backend Security Measures

```typescript
// src/middleware/security.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { Express } from 'express';
import { config } from '@/config';

export function setupSecurity(app: Express) {
  // Helmet - Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS - Strict origin control
  app.use(
    cors({
      origin: config.frontend.url,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Rate Limiting - General API
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', generalLimiter);

  // Rate Limiting - Auth endpoints (stricter)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true,
  });

  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);

  // Prevent parameter pollution
  app.use((req, res, next) => {
    for (const key in req.query) {
      if (Array.isArray(req.query[key])) {
        req.query[key] = (req.query[key] as string[])[0];
      }
    }
    next();
  });
}
```

### Password Security

```typescript
// src/services/auth/password.service.ts
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export class PasswordService {
  async hash(password: string): Promise<string> {
    // Validate password strength
    this.validatePasswordStrength(password);
    
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private validatePasswordStrength(password: string): void {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      errors.push('Password must contain both uppercase and lowercase letters');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Return ALL validation errors at once, not one at a time
    if (errors.length > 0) {
      const error = new Error(errors.join('; '));
      (error as any).code = 'WEAK_PASSWORD';
      (error as any).details = errors;
      throw error;
    }
  }
}
```

### JWT Token Management

```typescript
// src/services/auth/jwt.service.ts
import jwt from 'jsonwebtoken';
import { config } from '@/config';

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export class JwtService {
  // IMPORTANT: Use separate secrets for access and refresh tokens.
  // If they share one secret, a leaked refresh token could be used as an access token.

  generateAccessToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'access' } as TokenPayload,
      config.jwt.accessSecret,
      { expiresIn: config.jwt.expiresIn } // 15m
    );
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'refresh' } as TokenPayload,
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn } // 7d
    );
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;

      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  verifyRefreshToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;

      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }
}
```

### Input Validation with Zod

```typescript
// src/validators/sales.validator.ts
import { z } from 'zod';

export const createSaleSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  source: z.enum(['bank_transfer', 'paycode', 'pos', 'online_store', 'manual']),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  description: z.string().max(500).optional(),
  customerName: z.string().max(255).optional(),
});

export const updateSaleSchema = createSaleSchema.partial();

// Middleware usage
export const validateSaleCreation = (req: Request, res: Response, next: NextFunction) => {
  try {
    createSaleSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }
    next(error);
  }
};
```

### Audit Logging

```typescript
// src/services/audit/audit.service.ts
import { prisma } from '@/lib/prisma';

export class AuditService {
  async log(data: {
    userId?: string;
    businessId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    oldData?: any;
    newData?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        businessId: data.businessId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        oldData: data.oldData,
        newData: data.newData,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }
}

// Usage in controllers
export class ExpenseController {
  async createExpense(req: Request, res: Response) {
    const expense = await expenseService.create(req.body);
    
    // Log the action
    await auditService.log({
      userId: req.user.id,
      businessId: expense.businessId,
      action: 'create_expense',
      resourceType: 'expense',
      resourceId: expense.id,
      newData: expense,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.status(201).json(expense);
  }
}
```

---

## Phase-by-Phase Implementation

### PHASE 1: Foundation & MVP (Weeks 1-6)

#### Week 1: Project Setup & Infrastructure

**Day 1-2: Initialize Projects**

```bash
# Frontend Setup
npm create vite@latest paymytax-web -- --template react-ts
cd paymytax-web
npm install

# Install dependencies
npm install \
  react-router-dom \
  @tanstack/react-query \
  zustand \
  axios \
  zod \
  react-hook-form \
  @hookform/resolvers \
  date-fns \
  recharts \
  lucide-react

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Initialize shadcn/ui
npx shadcn-ui@latest init
```

```bash
# Backend Setup
mkdir paymytax-api
cd paymytax-api
npm init -y

# Install dependencies
npm install \
  express \
  typescript \
  @types/express \
  @types/node \
  prisma \
  @prisma/client \
  bcrypt \
  @types/bcrypt \
  jsonwebtoken \
  @types/jsonwebtoken \
  helmet \
  cors \
  @types/cors \
  express-rate-limit \
  winston \
  dotenv \
  zod \
  @aws-sdk/client-s3 \
  @aws-sdk/s3-request-presigner \
  pdfkit \
  @types/pdfkit

# Install dev dependencies
npm install -D \
  tsx \
  nodemon \
  @types/bcrypt \
  @types/jsonwebtoken
```

**Day 3: Configure TypeScript**

```json
// paymytax-api/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

```json
// paymytax-api/package.json scripts
{
  "scripts": {
    "dev": "nodemon --exec tsx src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  }
}
```

**Day 4-5: Database Setup (Neon)**

```bash
# 1. Sign up at neon.tech
# 2. Create new project: paymytax-prod
# 3. Copy connection string

# Initialize Prisma
npx prisma init

# Update .env with Neon connection string
# DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/paymytax?sslmode=require"
```

```bash
# Create and apply migrations
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate

# Open Prisma Studio to verify
npx prisma studio
```

**Day 6: DigitalOcean Spaces Setup**

```bash
# 1. Sign up at digitalocean.com
# 2. Create a Space:
#    - Name: paymytax-documents
#    - Region: NYC3 (or closest to your users)
#    - Enable CDN
#    - Set File Listing: Private

# 3. Generate Spaces Access Keys:
#    - API → Spaces access keys → Generate New Key
#    - Save Access Key ID and Secret Key

# 4. Configure CORS (optional, for direct browser uploads):
#    - Spaces → Settings → CORS Configurations
#    - Add allowed origins: https://paymytax.ng
```

**Day 7: Environment Setup**

```bash
# paymytax-api/.env
NODE_ENV=development
PORT=3000

# Database (Neon)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/paymytax?sslmode=require

# Redis (Upstash) - Get from upstash.com
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# Storage (DigitalOcean Spaces)
STORAGE_ENDPOINT=nyc3.digitaloceanspaces.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=paymytax-documents
STORAGE_ACCESS_KEY=DO00XXXXXXXXXXXXX
STORAGE_SECRET_KEY=your-secret-key
STORAGE_CDN_URL=https://paymytax-documents.nyc3.cdn.digitaloceanspaces.com

# JWT — CRITICAL: Use separate secrets for access vs refresh tokens
JWT_ACCESS_SECRET=your-access-secret-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Paystack
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx

# Email (Resend) - Get from resend.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@paymytax.ng

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

```bash
# paymytax-web/.env
VITE_API_URL=http://localhost:3000/api/v1
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxx
VITE_APP_NAME=PayMyTax
```

**Deliverables (Week 1):**
- ✅ Frontend & backend projects initialized
- ✅ Database connected (Neon)
- ✅ Storage configured (DO Spaces)
- ✅ Environment variables set
- ✅ Development servers running

---

#### Week 2: Authentication System

**Backend Implementation:**

```typescript
// src/services/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

const jwtService = new JwtService();
const passwordService = new PasswordService();

export class AuthService {
  async register(data: {
    email: string;
    password: string;
    phone: string;
  }) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await passwordService.hash(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        phone: data.phone,
      },
    });

    // Generate tokens
    const accessToken = jwtService.generateAccessToken(user.id);
    const refreshToken = jwtService.generateRefreshToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await passwordService.compare(password, user.passwordHash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = jwtService.generateAccessToken(user.id);
    const refreshToken = jwtService.generateRefreshToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshToken: string) {
    const payload = jwtService.verifyRefreshToken(refreshToken);
    
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid refresh token');
    }

    const newAccessToken = jwtService.generateAccessToken(user.id);
    
    return { accessToken: newAccessToken };
  }
}
```

```typescript
// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { AuthService } from '@/services/auth/auth.service';
import { z } from 'zod';

const authService = new AuthService();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const data = registerSchema.parse(req.body);
      const result = await authService.register(data);
      
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }
      
      res.status(400).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: error.message,
        },
      });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data.email, data.password);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }
      
      res.status(401).json({
        error: {
          code: 'LOGIN_FAILED',
          message: 'Invalid credentials',
        },
      });
    }
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      
      res.json(result);
    } catch (error) {
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }
  }

  async me(req: Request, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          phone: true,
          isVerified: true,
          createdAt: true,
        },
      });
      
      res.json(user);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch user data',
        },
      });
    }
  }
}
```

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@/services/auth/jwt.service';

const jwtService = new JwtService();

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'NO_TOKEN',
          message: 'No authentication token provided',
        },
      });
    }

    const token = authHeader.substring(7);
    const payload = jwtService.verifyAccessToken(token);

    req.user = { id: payload.userId };
    next();
  } catch (error) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  }
}
```

```typescript
// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { authenticate } from '@/middleware/auth.middleware';

const router = Router();
const authController = new AuthController();

router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/refresh-token', (req, res) => authController.refreshToken(req, res));
router.get('/me', authenticate, (req, res) => authController.me(req, res));

export default router;
```

**Frontend Implementation:**

```typescript
// src/pages/auth/LoginPage.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (error: any) {
      setError('root', {
        message: error.response?.data?.error?.message || 'Login failed',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            Login to PayMyTax
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                {...register('email')}
                placeholder="john@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                {...register('password')}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {errors.root && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-red-800 text-sm">{errors.root.message}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>

            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <a href="/register" className="text-blue-600 hover:underline">
                Register
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
```

**Deliverables (Week 2):**
- ✅ User registration & login working
- ✅ JWT authentication implemented
- ✅ Protected routes (frontend & backend)
- ✅ Auth state persistence
- ✅ Login/Register pages

---

#### Week 3: Business Management & Sales Module

**Backend:**

```typescript
// src/services/business/business.service.ts
import { prisma } from '@/lib/prisma';

export class BusinessService {
  async create(userId: string, data: {
    businessName: string;
    ownerName: string;
    taxId?: string;
    businessType?: string;
    address?: string;
    city?: string;
    state?: string;
  }) {
    return prisma.business.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  async getByUserId(userId: string) {
    return prisma.business.findMany({
      where: { userId },
    });
  }

  async getById(id: string, userId: string) {
    const business = await prisma.business.findFirst({
      where: { id, userId },
    });

    if (!business) {
      throw new Error('Business not found');
    }

    return business;
  }

  async update(id: string, userId: string, data: any) {
    const business = await this.getById(id, userId);
    
    return prisma.business.update({
      where: { id: business.id },
      data,
    });
  }

  async delete(id: string, userId: string) {
    const business = await this.getById(id, userId);
    
    return prisma.business.delete({
      where: { id: business.id },
    });
  }
}
```

```typescript
// src/services/sales/sales.service.ts
import { prisma } from '@/lib/prisma';
import { SalesSource } from '@prisma/client';

export class SalesService {
  // Helper: Check if the tax period for a given date is locked
  private async ensurePeriodNotLocked(businessId: string, date: Date) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const report = await prisma.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: { businessId, taxMonth: monthStart },
      },
    });

    if (report?.isLocked) {
      throw new Error(
        `Cannot modify data for ${monthStart.toISOString().slice(0, 7)} — tax period is locked after payment.`
      );
    }
  }

  async create(businessId: string, data: {
    amount: number;
    source: SalesSource;
    transactionDate: Date;
    description?: string;
    customerName?: string;
    referenceId?: string;
  }, userId: string) {
    // GUARD: Prevent adding sales to a locked tax period
    await this.ensurePeriodNotLocked(businessId, data.transactionDate);

    return prisma.salesTransaction.create({
      data: {
        businessId,
        ...data,
        createdBy: userId,
      },
    });
  }

  async getByBusinessId(
    businessId: string,
    filters: {
      month?: string;
      startDate?: Date;
      endDate?: Date;
      source?: SalesSource;
      page?: number;
      limit?: number;
    }
  ) {
    const { month, startDate, endDate, source, page = 1, limit = 20 } = filters;

    const where: any = { businessId };

    if (month) {
      const monthStart = new Date(month + '-01');
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      
      where.transactionDate = {
        gte: monthStart,
        lt: monthEnd,
      };
    } else if (startDate && endDate) {
      where.transactionDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (source) {
      where.source = source;
    }

    const [sales, total] = await Promise.all([
      prisma.salesTransaction.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.salesTransaction.count({ where }),
    ]);

    return {
      sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMonthlySummary(businessId: string, month: string) {
    const monthStart = new Date(month + '-01');
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const result = await prisma.salesTransaction.aggregate({
      where: {
        businessId,
        transactionDate: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
      _sum: { amount: true },
      _count: true,
    });

    return {
      totalSales: result._sum.amount || 0,
      transactionCount: result._count,
      month,
    };
  }

  async update(id: string, businessId: string, data: any) {
    return prisma.salesTransaction.update({
      where: { id, businessId },
      data,
    });
  }

  async delete(id: string, businessId: string) {
    return prisma.salesTransaction.delete({
      where: { id, businessId },
    });
  }
}
```

**Frontend:**

```typescript
// src/features/sales/pages/SalesListPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { salesApi } from '@/api/sales.api';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useNavigate } from 'react-router-dom';

export const SalesListPage = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data, isLoading } = useQuery({
    queryKey: ['sales', month],
    queryFn: () => salesApi.getList({ month }),
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales Transactions</h1>
        <Button onClick={() => navigate('/sales/add')}>
          Add Sale
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Source</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.sales.map((sale) => (
              <tr key={sale.id}>
                <td>{formatDate(sale.transactionDate)}</td>
                <td className="font-semibold">{formatCurrency(sale.amount)}</td>
                <td>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {sale.source}
                  </span>
                </td>
                <td>{sale.customerName || '-'}</td>
                <td>{sale.description || '-'}</td>
                <td>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
};
```

**Deliverables (Week 3):**
- ✅ Business CRUD operations
- ✅ Sales CRUD operations
- ✅ Sales list with pagination
- ✅ Monthly sales summary
- ✅ Add/Edit sales forms

---

#### Week 4: Expense Module & Tax Calculation

**Backend:**

```typescript
// src/services/tax/tax.service.ts
import { prisma } from '@/lib/prisma';

export class TaxService {
  async calculateMonthlyTax(businessId: string, month: string) {
    const monthStart = new Date(month + '-01');
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // GUARD: Check if period is already locked (paid). Prevent recalculation.
    const existingReport = await prisma.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: { businessId, taxMonth: monthStart },
      },
    });

    if (existingReport?.isLocked) {
      throw new Error(
        'This tax period is locked after payment. Sales and expenses cannot be modified.'
      );
    }

    // Get sales total — ONLY count confirmed transactions (not pending/reversed/disputed)
    const salesAgg = await prisma.salesTransaction.aggregate({
      where: {
        businessId,
        status: 'confirmed',
        transactionDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });

    // Get expenses total
    const expensesAgg = await prisma.expense.aggregate({
      where: {
        businessId,
        expenseDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });

    const totalSales = Number(salesAgg._sum.amount || 0);
    const totalExpenses = Number(expensesAgg._sum.amount || 0);
    const grossProfit = totalSales - totalExpenses;
    const taxPayable = grossProfit > 0 ? grossProfit * 0.075 : 0;

    // Calculate profit margin
    const profitMargin = totalSales > 0
      ? (grossProfit / totalSales) * 100
      : 0;

    // Expense intelligence alert: flag suspiciously low expenses
    const expenseRatio = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;
    const expenseWarning = expenseRatio < 5 && totalSales > 100000
      ? 'Your expenses appear unusually low relative to sales. This may affect your tax report accuracy.'
      : null;

    // Upsert tax report
    const taxReport = await prisma.monthlyTaxReport.upsert({
      where: {
        businessId_taxMonth: {
          businessId,
          taxMonth: monthStart,
        },
      },
      create: {
        businessId,
        taxMonth: monthStart,
        totalSales,
        totalExpenses,
        grossProfit,
        taxRate: 7.5,
        taxPayable,
        profitMargin,
      },
      update: {
        totalSales,
        totalExpenses,
        grossProfit,
        taxPayable,
        profitMargin,
        updatedAt: new Date(),
      },
    });

    return { ...taxReport, expenseWarning };
  }

  async getMonthlyReport(businessId: string, month: string) {
    const monthStart = new Date(month + '-01');

    let report = await prisma.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: {
          businessId,
          taxMonth: monthStart,
        },
      },
    });

    // If report doesn't exist, calculate it
    if (!report) {
      report = await this.calculateMonthlyTax(businessId, month);
    }

    return report;
  }

  async getAllReports(businessId: string) {
    return prisma.monthlyTaxReport.findMany({
      where: { businessId },
      orderBy: { taxMonth: 'desc' },
    });
  }

  async finalizeReport(reportId: string, businessId: string) {
    const report = await prisma.monthlyTaxReport.findFirst({
      where: { id: reportId, businessId },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    if (report.isFinalized) {
      throw new Error('Report is already finalized');
    }

    return prisma.monthlyTaxReport.update({
      where: { id: reportId },
      data: { isFinalized: true },
    });
  }
}
```

**Deliverables (Week 4):**
- ✅ Expense CRUD operations
- ✅ Expense categories
- ✅ Tax calculation engine
- ✅ Monthly tax reports
- ✅ Report finalization

---

#### Week 5: Tax Dashboard & Payment Integration

**Paystack Integration:**

```typescript
// src/services/payment/paystack.service.ts
import axios from 'axios';
import crypto from 'crypto';
import { config } from '@/config';

export class PaystackService {
  private baseURL = 'https://api.paystack.co';
  private secretKey = config.paystack.secretKey;

  async initializeTransaction(data: {
    email: string;
    amount: number; // in kobo
    reference: string;
    metadata: any;
    callback_url?: string;
  }) {
    const response = await axios.post(
      `${this.baseURL}/transaction/initialize`,
      data,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }

  async verifyTransaction(reference: string) {
    const response = await axios.get(
      `${this.baseURL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      }
    );

    return response.data.data;
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  async createVirtualAccount(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  }) {
    // Create customer
    const customerResponse = await axios.post(
      `${this.baseURL}/customer`,
      data,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      }
    );

    const customerId = customerResponse.data.data.id;

    // Create dedicated virtual account
    const accountResponse = await axios.post(
      `${this.baseURL}/dedicated_account`,
      {
        customer: customerId,
        preferred_bank: 'wema-bank',
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      }
    );

    return accountResponse.data.data;
  }
}
```

```typescript
// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import { PaystackService } from '@/services/payment/paystack.service';
import { prisma } from '@/lib/prisma';

const paystackService = new PaystackService();

export class PaymentController {
  async initiateTaxPayment(req: Request, res: Response) {
    try {
      const { taxReportId, paymentMethod } = req.body;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const userId = req.user.id;

      // CRITICAL: Require idempotency key to prevent double payments
      if (!idempotencyKey) {
        return res.status(400).json({
          error: {
            code: 'MISSING_IDEMPOTENCY_KEY',
            message: 'X-Idempotency-Key header is required for payment requests',
          },
        });
      }

      // Check for existing payment with same idempotency key (prevent duplicates)
      const existingPayment = await prisma.taxPayment.findFirst({
        where: { transactionReference: idempotencyKey },
      });

      if (existingPayment) {
        // Return the existing payment instead of creating a duplicate
        return res.json({
          paymentId: existingPayment.id,
          reference: existingPayment.transactionReference,
          message: 'Payment already initiated',
        });
      }

      // Get tax report with business
      const taxReport = await prisma.monthlyTaxReport.findUnique({
        where: { id: taxReportId },
        include: {
          business: {
            include: { user: true },
          },
        },
      });

      if (!taxReport) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Tax report not found' },
        });
      }

      // Prevent paying an already-paid or locked report
      if (taxReport.isLocked || taxReport.paymentStatus === 'completed') {
        return res.status(409).json({
          error: {
            code: 'ALREADY_PAID',
            message: 'Tax for this period has already been paid',
          },
        });
      }

      // Verify ownership
      if (taxReport.business.userId !== userId) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        });
      }

      // Generate reference using idempotency key for traceability
      const reference = `PMT-${Date.now()}-${taxReportId.slice(0, 8)}`;

      // Initialize Paystack transaction
      const transaction = await paystackService.initializeTransaction({
        email: taxReport.business.user.email,
        amount: Math.round(Number(taxReport.taxPayable) * 100), // Convert to kobo
        reference,
        metadata: {
          businessId: taxReport.businessId,
          taxReportId,
          taxMonth: taxReport.taxMonth.toISOString(),
          purpose: 'Tax Payment to FIRS',
        },
        callback_url: `${process.env.FRONTEND_URL}/tax/payment/verify`,
      });

      // Create payment record
      const payment = await prisma.taxPayment.create({
        data: {
          businessId: taxReport.businessId,
          taxReportId,
          amountPaid: taxReport.taxPayable,
          paymentMethod,
          transactionReference: reference,
          paymentStatus: 'pending',
        },
      });

      res.json({
        paymentId: payment.id,
        authorizationUrl: transaction.authorization_url,
        reference,
      });
    } catch (error) {
      console.error('Payment initiation error:', error);
      res.status(500).json({
        error: {
          code: 'PAYMENT_ERROR',
          message: 'Failed to initiate payment',
        },
      });
    }
  }

  async handleWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers['x-paystack-signature'] as string;

      // Verify webhook signature
      if (!paystackService.verifyWebhookSignature(req.body, signature)) {
        return res.status(401).json({
          error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' },
        });
      }

      const event = req.body;

      if (event.event === 'charge.success') {
        const { reference, metadata } = event.data;

        // Update payment status
        await prisma.taxPayment.update({
          where: { transactionReference: reference },
          data: {
            paymentStatus: 'completed',
            paymentDate: new Date(),
            gatewayResponse: event.data,
          },
        });

        // Update tax report status AND lock the period to prevent retroactive edits
        await prisma.monthlyTaxReport.update({
          where: { id: metadata.taxReportId },
          data: {
            paymentStatus: 'completed',
            isFinalized: true,
            isLocked: true,
            lockedAt: new Date(),
          },
        });

        // Log to audit trail
        await prisma.auditLog.create({
          data: {
            businessId: metadata.businessId,
            action: 'tax_payment_completed',
            resourceType: 'tax_payment',
            resourceId: reference,
            newData: { amount: event.data.amount, reference },
          },
        });

        // TODO: Send confirmation email
        // TODO: Remit to FIRS API
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.sendStatus(500);
    }
  }

  async verifyPayment(req: Request, res: Response) {
    try {
      const { reference } = req.params;

      const transaction = await paystackService.verifyTransaction(reference);

      const payment = await prisma.taxPayment.findUnique({
        where: { transactionReference: reference },
      });

      if (!payment) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Payment not found' },
        });
      }

      res.json({
        payment,
        transaction,
      });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'VERIFICATION_ERROR',
          message: 'Failed to verify payment',
        },
      });
    }
  }
}
```

**Deliverables (Week 5):**
- ✅ Tax dashboard UI
- ✅ Paystack payment integration
- ✅ Webhook handler
- ✅ Payment verification
- ✅ Payment history

---

#### Week 6: PDF Generation & MVP Testing

**PDF Generation:**

```typescript
// src/services/pdf/tax-statement.service.ts
import PDFDocument from 'pdfkit';
import { StorageService } from '@/services/storage/spaces.service';
import { prisma } from '@/lib/prisma';

export class TaxStatementService {
  async generate(taxReportId: string): Promise<string> {
    // Get tax report with business
    const taxReport = await prisma.monthlyTaxReport.findUnique({
      where: { id: taxReportId },
      include: {
        business: true,
        payments: {
          where: { paymentStatus: 'completed' },
          orderBy: { paymentDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!taxReport) {
      throw new Error('Tax report not found');
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Monthly SME Tax Statement', { align: 'center' });

    doc.moveDown();

    // Tax Month
    const monthYear = new Date(taxReport.taxMonth).toLocaleDateString('en-NG', {
      month: 'long',
      year: 'numeric',
    });

    doc
      .fontSize(16)
      .font('Helvetica')
      .text(`Tax Period: ${monthYear}`, { align: 'center' });

    doc.moveDown(2);

    // Business Information
    doc.fontSize(14).font('Helvetica-Bold').text('Business Information');
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Business Name: ${taxReport.business.businessName}`)
      .text(`Tax ID: ${taxReport.business.taxId || 'N/A'}`)
      .text(`Owner: ${taxReport.business.ownerName}`)
      .text(`Address: ${taxReport.business.address || 'N/A'}`);

    doc.moveDown(2);

    // Financial Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Financial Summary');
    doc.moveDown(0.5);

    const formatCurrency = (amount: number) => {
      return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    };

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Total Monthly Sales: ${formatCurrency(Number(taxReport.totalSales))}`)
      .text(`Total Monthly Expenses: ${formatCurrency(Number(taxReport.totalExpenses))}`)
      .text(`Gross Profit: ${formatCurrency(Number(taxReport.grossProfit))}`);

    doc.moveDown(2);

    // Tax Calculation
    doc.fontSize(14).font('Helvetica-Bold').text('Tax Computation');
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Applicable Tax Rate: ${taxReport.taxRate}%`)
      .text(`Tax Payable: ${formatCurrency(Number(taxReport.taxPayable))}`);

    doc.moveDown(2);

    // Payment Status
    doc.fontSize(14).font('Helvetica-Bold').text('Payment Status');
    doc.moveDown(0.5);

    const payment = taxReport.payments[0];

    if (payment) {
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(`Status: PAID`)
        .text(
          `Payment Date: ${new Date(payment.paymentDate).toLocaleDateString('en-NG')}`
        )
        .text(`Transaction Reference: ${payment.transactionReference}`);
    } else {
      doc.fontSize(11).font('Helvetica').text(`Status: UNPAID`);
    }

    doc.moveDown(3);

    // Footer
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        'This statement was generated automatically by PayMyTax by WallX in partnership with FIRS.',
        { align: 'center' }
      );

    doc
      .text(
        `Generated on: ${new Date().toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`,
        { align: 'center' }
      );

    doc.end();

    // Convert to buffer
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Upload to DigitalOcean Spaces
    const filename = `tax-statement-${taxReportId}-${Date.now()}.pdf`;
    const pdfUrl = await StorageService.uploadPDF(
      pdfBuffer,
      filename,
      taxReport.businessId
    );

    // Save to database
    await prisma.taxStatement.upsert({
      where: { taxReportId },
      create: {
        businessId: taxReport.businessId,
        taxReportId,
        pdfUrl,
        pdfSizeBytes: pdfBuffer.length,
      },
      update: {
        pdfUrl,
        pdfSizeBytes: pdfBuffer.length,
        generatedAt: new Date(),
      },
    });

    return pdfUrl;
  }
}
```

**Deliverables (Week 6):**
- ✅ PDF generation working
- ✅ PDF stored in DO Spaces
- ✅ Download tax statements
- ✅ MVP fully tested
- ✅ Bug fixes completed

---

### PHASE 2: AUTOMATION & INTEGRATIONS (Weeks 7-10)

#### Week 7: Paystack Virtual Accounts
- Implement automatic sales capture
- Set up transaction webhooks
- Auto-sync sales from virtual accounts

#### Week 8: Notifications & Reminders
- Email notifications (Resend)
- SMS notifications (Termii)
- Tax reminder scheduler (cron jobs)

#### Week 9: Analytics Dashboard
- Profit margin tracking
- Expense intelligence alerts
- Monthly trends charts

#### Week 10: Testing & Optimization
- Integration testing
- Load testing with Artillery
- Performance optimization
- Security audit

---

### PHASE 3: ADVANCED FEATURES (Weeks 11-14)

#### Week 11: Simple Invoicing
- Invoice creation & templates
- PDF generation
- Email invoices to customers

#### Week 12: FIRS Integration
- FIRS API integration (if available)
- Automated remittance
- Receipt management

#### Week 13: WallX Storefront Integration
- API integration with WallX
- Automatic sales synchronization

#### Week 14: Polish & Launch
- UI/UX improvements
- User documentation
- Production deployment
- Monitoring setup (Sentry)

---

## Deployment Guide

### Step 1: Neon Database Setup

```bash
# 1. Sign up at neon.tech
# 2. Create new project: paymytax-prod
# 3. Create database: paymytax
# 4. Copy connection string

# Connection string format:
# postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/paymytax?sslmode=require
```

### Step 2: DigitalOcean Spaces Setup

```bash
# 1. Create Space:
#    - Name: paymytax-documents
#    - Region: NYC3
#    - Enable CDN
#    - File Listing: Private

# 2. Generate Access Keys
# 3. Note down:
#    - Access Key ID
#    - Secret Access Key
#    - Endpoint: nyc3.digitaloceanspaces.com
#    - CDN URL: https://paymytax-documents.nyc3.cdn.digitaloceanspaces.com
```

### Step 3: Render Backend Deployment

```bash
# 1. Create account at render.com
# 2. Connect GitHub repository
# 3. Create new Web Service

# Configuration:
# - Name: paymytax-api
# - Environment: Node
# - Region: Oregon (US West)
# - Branch: main
# - Build Command: npm install && npx prisma generate && npm run build
# - Start Command: npm start
# - Instance Type: Starter ($7/month)

# Environment Variables (add in Render dashboard):
NODE_ENV=production
DATABASE_URL=[Neon connection string]
REDIS_URL=[Upstash connection string]
STORAGE_ENDPOINT=nyc3.digitaloceanspaces.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=paymytax-documents
STORAGE_ACCESS_KEY=[DO Access Key]
STORAGE_SECRET_KEY=[DO Secret Key]
STORAGE_CDN_URL=[DO CDN URL]
JWT_SECRET=[Generate random string]
PAYSTACK_SECRET_KEY=[Paystack secret]
PAYSTACK_PUBLIC_KEY=[Paystack public]
RESEND_API_KEY=[Resend API key]
EMAIL_FROM=noreply@paymytax.ng
FRONTEND_URL=https://paymytax.vercel.app

# 4. Deploy
# Render will auto-deploy on git push
```

### Step 4: Vercel Frontend Deployment

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Navigate to frontend directory
cd paymytax-web

# 3. Login to Vercel
vercel login

# 4. Deploy
vercel --prod

# 5. Set environment variables in Vercel dashboard:
VITE_API_URL=[Your Render backend URL]/api/v1
VITE_PAYSTACK_PUBLIC_KEY=[Paystack public key]
VITE_APP_NAME=PayMyTax

# 6. Add custom domain (optional)
# Vercel Dashboard → Settings → Domains → Add paymytax.ng
```

### Step 5: Upstash Redis Setup

```bash
# 1. Sign up at upstash.com
# 2. Create database:
#    - Name: paymytax-cache
#    - Type: Redis
#    - Region: us-east-1

# 3. Copy connection string:
# rediss://default:xxx@us1-xxx.upstash.io:6379

# 4. Add to Render environment variables
```

### Step 6: Final Configuration

```bash
# 1. Update CORS origins in backend
# Update src/middleware/security.ts:
# origin: 'https://paymytax.vercel.app'

# 2. Run database migrations
# From Render dashboard → Shell:
npx prisma migrate deploy

# 3. Test the deployment
curl https://your-render-url.onrender.com/health

# 4. Test frontend
# Visit https://paymytax.vercel.app
```

---

## Migration to DigitalOcean

### Migration Timeline: 1-2 Days

### Step 1: Database Migration (Neon → DO PostgreSQL)

```bash
# Create DO Managed Database
# Dashboard → Databases → Create Database
# - Engine: PostgreSQL 16
# - Plan: Basic ($15/mo) or Professional ($55/mo)
# - Datacenter: NYC3
# - Database name: paymytax

# Dump from Neon
pg_dump "$NEON_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=paymytax_backup.dump

# Restore to DigitalOcean
pg_restore \
  --dbname="$DO_DATABASE_URL" \
  --no-owner \
  --no-acl \
  paymytax_backup.dump

# Verify migration
psql "$DO_DATABASE_URL" -c "\dt"
psql "$DO_DATABASE_URL" -c "SELECT COUNT(*) FROM users;"

# Update DATABASE_URL in Render
# Render → Environment → DATABASE_URL → [DO connection string]
```

### Step 2: Backend Migration (Render → DO App Platform)

```bash
# Create App in DO App Platform
# Dashboard → Apps → Create App
# - Source: GitHub
# - Repository: paymytax-api
# - Branch: main
# - Autodeploy: Yes

# Build configuration:
# - Build Command: npm install && npx prisma generate && npm run build
# - Run Command: npm start
# - HTTP Port: 3000

# Environment Variables:
# Copy all from Render, update:
DATABASE_URL=[DO PostgreSQL connection string]
REDIS_URL=[DO Redis connection string]

# Instance Size:
# - Basic: $5/mo (512MB RAM)
# - Professional: $12/mo (1GB RAM)

# Deploy and test
```

### Step 3: Redis Migration (Upstash → DO Managed Redis)

```bash
# Create DO Managed Redis
# Dashboard → Databases → Create Database → Redis
# - Plan: Basic ($15/mo, 1GB RAM)
# - Datacenter: NYC3

# No data migration needed (cache is ephemeral)
# Update REDIS_URL in App Platform environment variables
```

### Step 4: Frontend Migration (Optional - Vercel → DO Spaces)

```bash
# Build frontend
cd paymytax-web
npm run build

# Upload to DO Spaces
# Install DO CLI
brew install doctl

# Authenticate
doctl auth init

# Create frontend Space
# Dashboard → Spaces → Create Space
# - Name: paymytax-frontend
# - Region: NYC3
# - Enable CDN
# - Enable Static Website Hosting
# - Index: index.html
# - Error: index.html

# Upload build
doctl spaces upload dist paymytax-frontend --recursive

# Or use AWS CLI (S3-compatible)
aws s3 sync dist/ s3://paymytax-frontend \
  --endpoint-url=https://nyc3.digitaloceanspaces.com \
  --acl public-read

# Custom domain
# Add CNAME: www.paymytax.ng → paymytax-frontend.nyc3.cdn.digitaloceanspaces.com
```

### Migration Checklist

```
✅ Storage: Already on DO Spaces
✅ Database: Neon → DO PostgreSQL (2-4 hours)
✅ Backend: Render → DO App Platform (1-2 hours)
✅ Cache: Upstash → DO Managed Redis (30 minutes)
⚠️  Frontend: Keep on Vercel (recommended) OR migrate to DO Spaces
```

---

## Monitoring and Maintenance

### Error Tracking (Sentry)

```bash
# Install Sentry
npm install @sentry/node @sentry/profiling-node

# Backend initialization
// src/lib/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Add to server.ts
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### Logging (Winston)

```typescript
// src/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

### Health Check Endpoint

```typescript
// src/routes/health.routes.ts
import { Router } from 'express';
import { prisma } from '@/lib/prisma';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
```

---

## Cost Analysis

### Starter Stack (0-1000 users)

```
Frontend (Vercel):           $0 (Hobby)
Backend (Render):            $7 (Starter)
Database (Neon):             $0-19 (Free → Scale)
DO Spaces (Storage):         $5 (250GB)
Upstash Redis:               $0-10 (Free tier)
Resend (Email):              $0-20 (Free tier)
Sentry (Monitoring):         $0 (Developer)
Domain (Namecheap):          $12/year
───────────────────────────────────────
Total Monthly:               $12-61
Total Yearly:                $144-732
```

### Growth Stack (1000-10000 users)

```
Frontend (Vercel):           $0 (Hobby)
Backend (Render):            $25 (Standard)
Database (Neon):             $69 (Scale)
DO Spaces:                   $5-20
DO Managed Redis:            $15
Resend:                      $20
Sentry:                      $26 (Team)
───────────────────────────────────────
Total Monthly:               $160-205
```

### DigitalOcean Production (10000+ users)

```
DO App Platform:             $25-50
DO PostgreSQL:               $130 (4GB)
DO Redis:                    $30 (2GB)
DO Spaces:                   $20
DO Load Balancer:            $12
Resend:                      $80 (Pro)
Sentry:                      $80 (Business)
───────────────────────────────────────
Total Monthly:               $377-402
```

---

## Support & Resources

### Documentation
- [Neon Docs](https://neon.tech/docs)
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [DigitalOcean Docs](https://docs.digitalocean.com)
- [Paystack Docs](https://paystack.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)

### Community
- [PayMyTax GitHub](https://github.com/paymytax)
- [Discord Community](#)
- [Support Email](mailto:support@paymytax.ng)

---

---

## Critical Architectural Decisions (Added in Review)

### 1. FIRS Payment Integration — Design Spec

> **IMPORTANT:** The original plan says "Payment goes directly to FIRS" but does not specify how.
> This is the highest-risk integration and must be resolved before Week 5.

**Option A: FIRS Direct API (if available)**
```
Flow:
1. User clicks "Pay Tax to FIRS"
2. Paystack charges the user
3. Paystack webhook confirms payment
4. Backend calls FIRS API with: TIN, tax amount, period, payment reference
5. FIRS returns a remittance receipt/reference
6. Backend stores firs_remittance_ref and firs_receipt_url
```

**Option B: Designated Collection Account (more likely for MVP)**
```
Flow:
1. WallX holds a designated FIRS collection account
2. Paystack charges the user and settles to the collection account
3. WallX batch-remits to FIRS weekly/monthly via bank transfer
4. Reconciliation report generated per business
5. FIRS receipt distributed to businesses after batch settlement
```

**Action Required:** Confirm with FIRS partnership team which integration path is available. This determines the entire payment flow architecture.

### 2. Sales Deduplication Strategy

Auto-imported sales (from POS, bank transfer, PayCode) must not duplicate manual entries.

```
Rules:
- Auto-imports use reference_id (external transaction ID) — enforced by unique index
- Manual entries have reference_id = NULL (not subject to dedup index)
- Dashboard shows "Auto" vs "Manual" badge on each sale
- If a manual entry matches an auto-import (same date + amount ± 1%), show a warning
- User can merge or dismiss the duplicate warning
```

### 3. Tax Period Locking

```
Period States:
  OPEN        → Sales/expenses can be added/edited/deleted
  FINALIZED   → User clicked "Finalize". No more edits. Can still un-finalize.
  LOCKED      → Payment completed. Permanently immutable. Cannot be unlocked.

Enforcement:
  - Sales service: check period lock before create/update/delete
  - Expense service: check period lock before create/update/delete
  - Tax calculation: refuse to recalculate a locked period
  - Audit log: record all state transitions
```

### 4. Refresh Token Rotation

```
On each refresh:
  1. Verify the refresh token
  2. Invalidate the old refresh token (store in Redis blacklist or DB)
  3. Issue a NEW refresh token + new access token
  4. If an already-used refresh token is presented → revoke ALL tokens for user (compromise detected)
```

### 5. PDF Statement — Verification & Tamper Protection

```
Additions to PDF:
  - QR code linking to: https://paymytax.ng/verify/{statement_id}
  - Verification URL prints business name, period, amount, and payment status
  - SHA-256 hash of statement data printed as footer watermark
  - "This document was electronically generated and does not require a signature"
```

### 6. Webhook Security Hardening

```
Paystack webhook handler improvements:
  1. Always verify signature FIRST (already done ✅)
  2. Process webhooks idempotently — check if payment already processed before updating
  3. Use a queue (BullMQ) for webhook processing to avoid timeouts
  4. Return 200 immediately, process asynchronously
  5. Log ALL webhook events to audit_logs regardless of outcome
  6. Set up webhook retry alerts — if Paystack retries > 3x, investigate
```

### 7. Rate Limiting Per Business (Not Just Per IP)

```
Add business-scoped rate limits:
  - Tax calculations: max 10/hour per business (prevent abuse)
  - PDF generation: max 20/day per business
  - Payment initiation: max 5/hour per business
  - Bulk import: max 3/day per business

Implement via Redis with key: rate:{businessId}:{action}
```

### 8. MVP Scope Clarification — Phase Boundaries

```
PHASE 1 (MVP - Weeks 1-6):
  ✅ Auth, Business CRUD, Sales CRUD, Expenses CRUD
  ✅ Tax calculation (7.5% formula)
  ✅ Tax dashboard
  ✅ Paystack payment (to collection account)
  ✅ PDF statement generation
  ❌ NOT: Virtual accounts, invoicing, storefront integration

PHASE 2 (Weeks 7-10):
  ✅ Paystack virtual accounts (auto-capture sales)
  ✅ Email/SMS notifications (Resend + Termii)
  ✅ Tax reminder cron jobs
  ✅ Analytics dashboard
  ❌ NOT: Invoicing, FIRS direct API, WallX storefront

PHASE 3 (Weeks 11-14):
  ✅ Simple invoicing
  ✅ FIRS direct API (if available)
  ✅ WallX storefront integration
  ✅ Polish & launch
```

---

**End of Documentation**

*This is a living document. Update as the project evolves.*