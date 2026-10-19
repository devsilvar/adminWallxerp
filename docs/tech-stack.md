# Technology Stack & Approved Dependencies

## 1. Core Platform Technologies

### Backend Stack
| Layer | Technology | Exact Version | Notes |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `>=20.0.0 <23.0.0` | Active LTS |
| **Language** | TypeScript | `^5.7.3` | Strict mode enabled |
| **Framework** | Express | `^5.2.1` | Native async error propagation |
| **ORM** | Prisma | `^6.0.1` | PostgreSQL dialect |
| **Database** | PostgreSQL | `16+` | Neon Serverless / Supabase / Local |
| **Validation** | Zod | `^4.3.6` | Runtime schemas & type inference |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`) + `bcrypt` | `^9.0.3` / `^6.0.0` | 15m access / 7d refresh token |
| **Job Scheduling** | node-cron | `^4.2.1` | Nightly sweeps & debtor reminders |
| **PDF Generation** | PDFKit | `^0.18.0` | Server-side invoice & tax statements |
| **File Parsing** | ExcelJS + Multer | `^4.4.0` / `^2.1.1` | Sales CSV/XLSX bulk imports |
| **Logging** | Winston + Morgan | `^3.19.0` / `^1.10.1`| Dev colorized, prod JSON rotation |
| **Error Monitoring**| Sentry Node | `^10.57.0` | Production runtime tracking |

### Frontend Stack
| Layer | Technology | Exact Version | Notes |
| :--- | :--- | :--- | :--- |
| **Framework** | React | `^19.2.4` | Modern hooks, transitions |
| **Build Tool** | Vite | `^8.0.1` | ESM HMR, Terser minification |
| **Styling** | Tailwind CSS | `^4.2.2` | `@tailwindcss/vite` |
| **State Management**| Zustand | `^5.0.12` | Lightweight, decoupled stores |
| **Routing** | React Router DOM | `^7.13.2` | Lazy route loading, nested layouts |
| **Icons** | Lucide React | `^1.7.0` | Consistent SVG icon kit |
| **Charts** | Recharts | `^3.8.1` | Revenue wave & tax analytics |
| **HTTP Client** | Axios + axios-retry | `^1.14.0` / `^4.5.0`| Interceptors with auto-token refresh |
| **Toasts** | react-hot-toast | `^2.6.0` | Global user notifications |

### Testing & Tooling
| Tool | Technology | Version | Scope |
| :--- | :--- | :--- | :--- |
| **Backend Test Runner** | Jest + `ts-jest` | `^30.3.0` | Unit, integration & E2E tests |
| **HTTP Assertions** | Supertest | `^7.2.2` | Integration route tests |
| **Frontend Test Runner**| Vitest + React Testing Library | `^5.0.0` / `^16.3.3` | Client component testing |
| **Code Formatter** | Prettier | `^3.4.2` | Workspace style enforcement |
| **Linter** | ESLint | `^9.19.0` | Static analysis |

---

## 2. Approved Third-Party Integrations

1. **Paystack API**: Dedicated Virtual Accounts (DVA), Customer BVN validation, Settlement Transfers, Tax card remittance.
2. **Resend API (`resend ^6.12.1`)**: Transactional email dispatch with PDF attachments. Winston dev logger serves as fallback when API key is omitted.
3. **AWS SDK S3 (`@aws-sdk/client-s3 ^3.1014.0`)**: Document storage for receipts and statements.
4. **Groq SDK (`groq-sdk ^1.6.0`)**: AI assistant integration for financial intelligence.

---

## 3. Technologies Strictly FORBIDDEN from the Codebase

To prevent architectural drift and dependency bloat, agents and developers are **STRICTLY PROHIBITED** from introducing:

1. **Alternative ORMs or Query Builders** (e.g. TypeORM, Sequelize, Knex, Drizzle, Mongoose). All persistence must use Prisma.
2. **Heavy State Management Libraries** (e.g. Redux, MobX, Recoil, RxJS). All client state must use Zustand.
3. **Alternative Styling Solutions** (e.g. Styled-Components, Emotion, Sass, CSS Modules). All styling must use Tailwind CSS v4.
4. **UI Component Frameworks** (e.g. Material UI, Ant Design, Chakra UI, Bootstrap). UI is custom-crafted using Tailwind and Lucide icons.
5. **Alternative Validation Libraries** (e.g. Yup, Joi, class-validator). All validations must use Zod.
6. **Alternative Date Libraries** (e.g. Moment.js). Date manipulations use native JavaScript UTC dates and existing shared helpers.
7. **Client-Side Heavy PDF Generators** (e.g. jsPDF, html2pdf). All official tax reports and invoices are generated server-side via PDFKit for cryptographic fidelity.
