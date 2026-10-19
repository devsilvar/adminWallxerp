# PayMyTax by WallX (WallXERP)

> Comprehensive SME Financial Operating System, Automated FIRS Tax Compliance, and Treasury Platform for African Businesses.

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.7+-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16+-navy.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

---

## 1. Project Overview

**PayMyTax by WallX** empowers Nigerian micro, small, and medium enterprises (MSMEs) to track sales, manage operational expenses, issue professional invoices, automate counter-transfer banking, reconcile credit debtors under accrual accounting, and compute audit-ready tax liabilities in full compliance with the Federal Inland Revenue Service (FIRS) / Nigeria Revenue Service (NRS) framework.

### Key Capabilities
- **Automated Tax Engine**: Monthly tax calculation (`Tax Payable = 7.5% × Gross Profit`, where `Gross Profit = Taxable Sales − Deductible Expenses`), Nil Return filing, period closing locks, and FIRS compliance reports with downloadable PDF tax statements.
- **Dedicated Virtual Accounts (DVA)**: Instant counter-transfer payments via Paystack with automated webhook capture, customer validation, and live solvency protection.
- **Debtors & Accrual Accounting**: Issue credit sales, track outstanding receivables, record repayments without duplicate revenue booking, and automated statutory bad debt write-offs (CITA §25).
- **Multi-Channel Invoicing**: Auto-sequenced invoices (`INV-{YYYY}-{NNN}`), multi-line item calculation, PDF generation, instant email dispatch with PDF attachments, and pre-formatted WhatsApp deep links.
- **Treasury & Auto-Sweep**: Multi-business wallet pooling, 2-tier PIN security with lockout protection, daily auto-sweep to verified settlement accounts, and automated fee reconciliation.
- **Team RBAC**: 5 distinct operational roles (`owner`, `manager`, `sales_staff`, `accountant`, `viewer`) with granular permission overrides, single-owner organizational boundary enforcement, and 3-seat team limit.

---

## 2. Repository Layout

This project is structured as a monorepo:

```
├── backend/              # Node.js + Express 5 + TypeScript + Prisma ORM (:3000)
│   ├── prisma/           # PostgreSQL schema, migrations, and seeds
│   ├── src/              # Routes, controllers, services, lib, jobs, validators
│   └── tests/            # Unit, integration, and end-to-end tests
├── frontend/             # React 19 + TypeScript + Vite + Tailwind CSS v4 (:5173)
│   ├── src/              # SME dashboard, sales, taxes, invoices, banking, stores
│   └── public/           # Static media, icons, and optimized WebP assets
├── adminFrontend/        # Standalone Admin Portal SPA (Vite + React 19, :5174)
│   ├── src/              # Platform operations, user manager, audit logs, treasury
│   └── public/           # Admin icons and assets
├── docs/                 # Authoritative system documentation, ADRs, guides
│   ├── decisions/        # Architecture Decision Records (ADRs)
│   └── ...               # Architecture, Security, API contracts, UX guidelines
└── specs/                # Feature-level technical specifications
```

---

## 3. Quickstart & Local Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v16+ (Local instance or cloud database such as Neon/Supabase)

### Step 1: Clone & Configure Backend

```bash
cd backend
npm install

# Copy sample environment configuration
cp .env.example .env
```

Ensure your `.env` contains valid connection credentials:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/paymytax?schema=public"
JWT_ACCESS_SECRET="your-access-secret-32-chars-minimum"
JWT_REFRESH_SECRET="your-refresh-secret-32-chars-minimum"
PAYSTACK_SECRET_KEY="sk_test_..."
PAYSTACK_PUBLIC_KEY="pk_test_..."
FRONTEND_URL="http://localhost:5173"
```

Initialize database schema and seed data:
```bash
npm run db:setup
```

### Step 2: Configure & Run Frontends

**SME Application (`frontend/`):**
```bash
cd ../frontend
npm install
npm run dev # Runs on http://localhost:5173
```

**Admin Portal (`adminFrontend/`):**
```bash
cd ../adminFrontend
npm install
npm run dev # Runs on http://localhost:5174
```

### Step 3: Run Services Locally

In three separate terminals:
- **Terminal 1 (Backend API):** `cd backend && npm run dev` (`http://localhost:3000`)
- **Terminal 2 (SME Portal):** `cd frontend && npm run dev` (`http://localhost:5173`)
- **Terminal 3 (Admin Portal):** `cd adminFrontend && npm run dev` (`http://localhost:5174`)

Both Vite frontends automatically proxy `/api` requests to port `3000`.

---

## 4. Test Accounts (Development Seed)

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@paymytax.com` | `Admin@123456` | Platform administration (:5174) |
| **Business Owner 1** | `john@example.com` | `Password123!` | Seed business with sales, expenses & tax report (:5173) |
| **Business Owner 2** | `jane@example.com` | `Password123!` | Secondary business account (:5173) |

---

## 5. Development Commands

### Backend Commands (`backend/`)
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts API with hot reloading via `tsx watch` |
| `npm run build` | Compiles TypeScript to `dist/` with path aliases |
| `npm run typecheck` | Validates TypeScript types across the backend |
| `npm run lint` | Runs ESLint |
| `npm run format` | Auto-formats code with Prettier |
| `npm run test` | Runs complete Jest test suite |
| `npm run test:unit` | Runs fast isolated unit tests |
| `npm run test:integration` | Runs database integration tests |
| `npm run test:e2e` | Runs end-to-end API workflows |
| `npm run prisma:studio` | Opens Prisma Web GUI on `http://localhost:5555` |
| `npm run db:backup` | Takes a timestamped physical snapshot in `backups/` |
| `npm run db:restore` | Restores snapshot from backup file |

### SME Frontend Commands (`frontend/`)
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite dev server with fast HMR on port 5173 |
| `npm run build` | Runs typecheck (`tsc -b`) and Vite production bundle |
| `npm run preview` | Serves production build locally |
| `npm run lint` | Runs ESLint across React components |
| `npm run test` | Runs frontend unit tests via Vitest |

### Admin Frontend Commands (`adminFrontend/`)
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Admin Vite dev server with fast HMR on port 5174 |
| `npm run build` | Runs typecheck (`tsc -b`) and Vite production bundle |
| `npm run preview` | Serves admin production build locally on port 5174 |
| `npm run lint` | Runs ESLint across admin React components |
| `npm run test` | Runs admin frontend unit/component tests via Vitest |

---

## 6. Architecture & Documentation Links

For comprehensive engineering standards and domain specifications, see:
- **[Operating Manual (AGENTS.md)](./AGENTS.md)**: AI agent instructions, rules, and Definition of Done.
- **[System Architecture](docs/architecture.md)**: Layering, invariants, and data boundaries.
- **[Product Requirements](docs/product-requirements.md)**: Product goals, workflows, and user personas.
- **[Technology Stack](docs/tech-stack.md)**: Approved libraries, versions, and restrictions.
- **[Database Schema](docs/database-schema.md)**: Tables, relations, constraints, and indexes.
- **[API Contracts](docs/api-contracts.md)**: REST endpoints, payloads, and error codes.
- **[Security Architecture](docs/security.md)**: RBAC, single-owner isolation, and PIN controls.
- **[Testing Strategy](docs/testing-strategy.md)**: Quality gates and automated testing tiers.
- **[Architecture Decisions (ADRs)](docs/decisions/)**: Immutable records of architectural choices.
